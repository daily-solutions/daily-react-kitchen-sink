import { useCallback, useEffect, useRef, useState } from "react";
import Daily, {
  DailyEventObject,
  DailyStreamingOptions,
} from "@daily-co/daily-js";
import {
  DailyProvider,
  useDaily,
  useDailyEvent,
  useRecording,
} from "@daily-co/daily-react";
import { getRecording, getRecordingAccessLink } from "./dailyRecordings";

// ---------------------------------------------------------------------------
// T-2904: VCS overlay-asset name-collision repro
// ---------------------------------------------------------------------------
// The `daily:baseline` VCS layout ships bundled default images. One of them is
// `overlay.png`. If a customer's own session_assets image uses that exact
// filename, the compositor's bundled default silently wins over the customer's
// real image at startup (a timing / copy-order bug). No error surfaces.
//
// This demo runs two independent record/stop cycles that differ ONLY in the
// session_assets key / image.assetName:
//   Case A (bug):     key "images/overlay.png",           assetName "overlay.png"
//   Case B (control): key "images/ct-journey-overlay.png", assetName "ct-journey-overlay.png"
// Both point session_assets at the SAME real public image URL. Case A is
// expected to render Daily's small built-in graphic instead of the real image;
// Case B is expected to render the real 1920x1080 image full-screen.
//
// session_assets can only be set when STARTING a recording, and the VCS asset
// table is fixed at first start of a compositor instance. So each case must be
// its own full cycle: join -> start -> ~10s -> stop -> leave (tear down the
// compositor) -> (re)join for the next case. No mid-session swaps.
// ---------------------------------------------------------------------------

// Real public image the cloud compositor fetches over the network. Must be a
// public URL, NOT localhost (Daily's compositor runs server-side).
const CUSTOMER_IMAGE_URL =
  "https://ctshare.blob.core.windows.net/ct-journey/overlay.png";

// Local copy of the SAME image, used only as an on-screen reference to compare
// against the extracted recording frames. Not used as the session_assets source.
const LOCAL_REFERENCE_IMAGE = "/vcs-repro/ct-journey-overlay.png";

// One of the bundled default filenames shipped by daily:baseline.
const COLLIDING_NAME = "overlay.png";
const SAFE_NAME = "ct-journey-overlay.png";

const RECORD_MS = 10_000; // ~10s of recording per case
const RECORDING_STARTED_TIMEOUT_MS = 30_000;
const RECORDING_STOPPED_TIMEOUT_MS = 60_000;
const INITIAL_POLL_WAIT_MS = 30_000; // wait before first status poll
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 4 * 60_000; // 4 minutes, then "still processing"
const FRAME_SEEK_SECONDS = 3;

type CaseKey = "A" | "B";

interface CaseDef {
  key: CaseKey;
  assetName: string;
  // The session_assets map key. For Case A this is the colliding name.
  sessionAssetKey: string;
}

type CaseStatus =
  | "idle"
  | "recording"
  | "stopping"
  | "polling"
  | "extracting"
  | "done"
  | "still-processing"
  | "error";

interface CaseResult {
  status: CaseStatus;
  recordingId?: string;
  videoWidth?: number;
  videoHeight?: number;
  downloadLink?: string;
  avgColor?: [number, number, number];
  tainted?: boolean;
  message?: string;
}

const INITIAL_RESULT: CaseResult = { status: "idle" };

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Build the startRecording options for a case. Both cases use the identical
// image URL; only the session_assets key and image.assetName vary.
function buildRecordingOptions(
  def: CaseDef,
  sessionAssetKey: string
): DailyStreamingOptions<"recording", "start"> {
  return {
    layout: {
      preset: "custom",
      composition_id: "daily:baseline",
      // The compositor fetches this URL and registers it under the key below.
      session_assets: {
        [sessionAssetKey]: CUSTOMER_IMAGE_URL,
      },
      composition_params: {
        showImageOverlay: true,
        "image.assetName": def.assetName,
        "image.fullScreen": true,
      },
    },
  };
}

// Compute a coarse average RGB from a canvas. Returns null if the canvas is
// tainted (CORS) so getImageData throws a SecurityError.
function averageColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): [number, number, number] | null {
  if (width === 0 || height === 0) return null;
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    // Sample ~10k pixels to keep it fast on large frames.
    const stride = 4 * Math.max(1, Math.floor((width * height) / 10_000));
    for (let i = 0; i + 2 < data.length; i += stride) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
    if (count === 0) return null;
    return [
      Math.round(r / count),
      Math.round(g / count),
      Math.round(b / count),
    ];
  } catch {
    // Tainted canvas (signed URL did not send CORS headers). Expected fallback.
    return null;
  }
}

function colorDistance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return Math.round(
    Math.sqrt(
      (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    )
  );
}

interface ExtractResult {
  width: number;
  height: number;
  avgColor: [number, number, number] | null;
}

// Load a video URL, seek a few seconds in, and draw the current frame onto the
// provided (visible) canvas. Drawing always works; reading pixels may fail on a
// tainted canvas, which averageColor() handles.
function extractFrameToCanvas(
  url: string,
  canvas: HTMLCanvasElement
): Promise<ExtractResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;

    const cleanup = (): void => {
      video.removeAttribute("src");
      video.load();
    };

    const fail = (msg: string): void => {
      cleanup();
      reject(new Error(msg));
    };

    video.addEventListener("error", () => {
      fail("Failed to load recording video for frame extraction.");
    });

    video.addEventListener(
      "loadeddata",
      () => {
        const duration = video.duration;
        const seekTo =
          Number.isFinite(duration) && duration > 0
            ? Math.min(FRAME_SEEK_SECONDS, duration / 2)
            : FRAME_SEEK_SECONDS;

        video.addEventListener(
          "seeked",
          () => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              fail("Could not get 2d canvas context.");
              return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            const avgColor = averageColor(ctx, width, height);
            resolve({ width, height, avgColor });
            cleanup();
          },
          { once: true }
        );

        video.currentTime = seekTo;
      },
      { once: true }
    );

    video.src = url;
  });
}

function VcsRepro(): React.JSX.Element {
  const callObject = useDaily();
  // @ts-expect-error expose for console debugging, matching the base app
  window.callObject = callObject;

  const [roomUrl, setRoomUrl] = useState("");
  const [token, setToken] = useState("");
  // Fallback toggle: use the bare colliding key ("overlay.png") with no
  // "images/" prefix for Case A, matching how hush/vcsOverrideAsset overrode a
  // reserved asset. The "images/" prefix is the priority; this is the fallback.
  const [useBareKeyForCaseA, setUseBareKeyForCaseA] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Idle. Enter a room URL to begin.");
  const [caseA, setCaseA] = useState<CaseResult>(INITIAL_RESULT);
  const [caseB, setCaseB] = useState<CaseResult>(INITIAL_RESULT);

  const caseACanvasRef = useRef<HTMLCanvasElement>(null);
  const caseBCanvasRef = useRef<HTMLCanvasElement>(null);
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null);
  // Average color of the real reference image, for coarse comparison.
  const referenceAvgRef = useRef<[number, number, number] | null>(null);

  // Resolvers for awaiting recording lifecycle events.
  const startedResolveRef = useRef<((recordingId: string) => void) | null>(
    null
  );
  const stoppedResolveRef = useRef<(() => void) | null>(null);

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  useRecording({
    onRecordingStarted: (ev) => {
      logEvent(ev);
      const resolve = startedResolveRef.current;
      if (resolve) {
        startedResolveRef.current = null;
        resolve(ev.recordingId ?? "");
      }
    },
    onRecordingStopped: (ev) => {
      logEvent(ev);
      const resolve = stoppedResolveRef.current;
      if (resolve) {
        stoppedResolveRef.current = null;
        resolve();
      }
    },
    onRecordingError: logEvent,
    onRecordingData: logEvent,
  });

  // Route the key lifecycle events through the console logEvent pattern.
  useDailyEvent("joining-meeting", logEvent);
  useDailyEvent("joined-meeting", logEvent);
  useDailyEvent("left-meeting", logEvent);
  useDailyEvent("track-started", logEvent);
  useDailyEvent("error", logEvent);

  // Draw the local reference image to its canvas on mount and cache its
  // average color for the coarse comparison.
  useEffect(() => {
    const canvas = referenceCanvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      referenceAvgRef.current = averageColor(
        ctx,
        canvas.width,
        canvas.height
      );
    };
    img.onerror = () => {
      console.error("Failed to load local reference image", LOCAL_REFERENCE_IMAGE);
    };
    img.src = LOCAL_REFERENCE_IMAGE;
  }, []);

  const waitForRecordingStarted = useCallback(
    (timeoutMs: number): Promise<string> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          startedResolveRef.current = null;
          reject(new Error("Timed out waiting for recording-started."));
        }, timeoutMs);
        startedResolveRef.current = (recordingId: string) => {
          clearTimeout(timer);
          resolve(recordingId);
        };
      }),
    []
  );

  const waitForRecordingStopped = useCallback(
    (timeoutMs: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          stoppedResolveRef.current = null;
          reject(new Error("Timed out waiting for recording-stopped."));
        }, timeoutMs);
        stoppedResolveRef.current = () => {
          clearTimeout(timer);
          resolve();
        };
      }),
    []
  );

  // Poll the recording status, then extract a frame and compare it against the
  // local reference image.
  const verifyRecording = useCallback(
    async (
      recordingId: string,
      canvasRef: React.RefObject<HTMLCanvasElement | null>,
      setCase: React.Dispatch<React.SetStateAction<CaseResult>>
    ): Promise<void> => {
      setCase((prev) => ({ ...prev, status: "polling", recordingId }));
      await sleep(INITIAL_POLL_WAIT_MS);

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let finished = false;
      while (Date.now() < deadline) {
        const rec = await getRecording(recordingId);
        if (rec.status === "finished") {
          finished = true;
          break;
        }
        await sleep(POLL_INTERVAL_MS);
      }

      if (!finished) {
        setCase((prev) => ({
          ...prev,
          status: "still-processing",
          message:
            "Recording still processing after the timeout. Try refetching in a bit.",
        }));
        return;
      }

      setCase((prev) => ({ ...prev, status: "extracting" }));
      const link = await getRecordingAccessLink(recordingId);

      const canvas = canvasRef.current;
      if (!canvas) {
        setCase((prev) => ({
          ...prev,
          status: "error",
          downloadLink: link.download_link,
          message: "Canvas not mounted for frame extraction.",
        }));
        return;
      }

      const frame = await extractFrameToCanvas(link.download_link, canvas);
      const refAvg = referenceAvgRef.current;
      let message: string;
      if (frame.avgColor && refAvg) {
        const dist = colorDistance(frame.avgColor, refAvg);
        message = `Coarse avg-color distance from reference image: ${dist} (lower = closer to the real image).`;
      } else {
        message =
          "Pixel read blocked (tainted canvas / no CORS headers). Compare visually against the reference.";
      }

      setCase((prev) => ({
        ...prev,
        status: "done",
        downloadLink: link.download_link,
        videoWidth: frame.width,
        videoHeight: frame.height,
        avgColor: frame.avgColor ?? undefined,
        tainted: frame.avgColor === null,
        message,
      }));
    },
    []
  );

  // Run one full independent cycle for a single case.
  const runSingleCase = useCallback(
    async (
      def: CaseDef,
      canvasRef: React.RefObject<HTMLCanvasElement | null>,
      setCase: React.Dispatch<React.SetStateAction<CaseResult>>
    ): Promise<void> => {
      if (!callObject) throw new Error("Call object not ready.");
      if (!roomUrl) throw new Error("Enter a room URL first.");

      const sessionAssetKey =
        def.key === "A" && useBareKeyForCaseA
          ? COLLIDING_NAME // bare key fallback: "overlay.png"
          : def.sessionAssetKey; // priority: "images/overlay.png" / "images/ct-journey-overlay.png"

      setCase({ status: "recording" });

      setStatus(`[Case ${def.key}] Joining room...`);
      await callObject.join({ url: roomUrl, token: token || undefined });

      setStatus(
        `[Case ${def.key}] Starting recording (session_assets key "${sessionAssetKey}", image.assetName "${def.assetName}")...`
      );
      const startedPromise = waitForRecordingStarted(
        RECORDING_STARTED_TIMEOUT_MS
      );
      callObject.startRecording(buildRecordingOptions(def, sessionAssetKey));
      const recordingId = await startedPromise;
      setCase((prev) => ({ ...prev, recordingId }));

      setStatus(
        `[Case ${def.key}] Recording ${recordingId || "(no id)"}, capturing for ~${
          RECORD_MS / 1000
        }s...`
      );
      await sleep(RECORD_MS);

      setStatus(`[Case ${def.key}] Stopping recording...`);
      setCase((prev) => ({ ...prev, status: "stopping" }));
      const stoppedPromise = waitForRecordingStopped(
        RECORDING_STOPPED_TIMEOUT_MS
      );
      callObject.stopRecording();
      await stoppedPromise;

      // Leave to tear down the compositor instance. Do NOT destroy: we reuse
      // the same call object to (re)join for the next case.
      setStatus(`[Case ${def.key}] Leaving room to tear down the compositor...`);
      await callObject.leave();

      if (!recordingId) {
        setCase((prev) => ({
          ...prev,
          status: "error",
          message:
            "No recordingId came back on recording-started; cannot fetch the recording.",
        }));
        return;
      }

      setStatus(`[Case ${def.key}] Verifying recording ${recordingId}...`);
      await verifyRecording(recordingId, canvasRef, setCase);
      setStatus(`[Case ${def.key}] Done.`);
    },
    [
      callObject,
      roomUrl,
      token,
      useBareKeyForCaseA,
      waitForRecordingStarted,
      waitForRecordingStopped,
      verifyRecording,
    ]
  );

  const runCase = useCallback(
    async (key: CaseKey): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        if (key === "A") {
          await runSingleCase(CASE_A, caseACanvasRef, setCaseA);
        } else {
          await runSingleCase(CASE_B, caseBCanvasRef, setCaseB);
        }
      } catch (err) {
        console.error("Case run failed", err);
        setStatus(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
        const setter = key === "A" ? setCaseA : setCaseB;
        setter((prev) => ({
          ...prev,
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy, runSingleCase]
  );

  const runFullRepro = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      setCaseA(INITIAL_RESULT);
      setCaseB(INITIAL_RESULT);
      // Case A first (buggy colliding name), then B (safe control name).
      await runSingleCase(CASE_A, caseACanvasRef, setCaseA);
      await runSingleCase(CASE_B, caseBCanvasRef, setCaseB);
      setStatus("Full repro complete. Compare Case A vs Case B below.");
    } catch (err) {
      console.error("Full repro failed", err);
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, runSingleCase]);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h2>VCS overlay-asset name collision (T-2904)</h2>
      <p style={{ maxWidth: 720 }}>
        Runs two independent record/stop cycles against the <code>daily:baseline</code>{" "}
        VCS layout. Both point <code>session_assets</code> at the same public image
        URL and differ only in the asset name. Case A uses the bundled default name{" "}
        <code>overlay.png</code> (expected bug: Daily&apos;s small built-in graphic
        renders); Case B uses a safe name (expected: the real image renders).
      </p>

      <div style={{ marginBottom: 12 }}>
        <label>
          Room URL:{" "}
          <input
            type="text"
            value={roomUrl}
            placeholder="https://your-domain.daily.co/room"
            onChange={(e) => setRoomUrl(e.target.value)}
            style={{ width: 360 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>
          Meeting token (optional):{" "}
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ width: 360 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>
          <input
            type="checkbox"
            checked={useBareKeyForCaseA}
            onChange={(e) => setUseBareKeyForCaseA(e.target.checked)}
          />{" "}
          Case A fallback: use bare key <code>overlay.png</code> (no{" "}
          <code>images/</code> prefix)
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          disabled={busy || !roomUrl}
          onClick={() => void runFullRepro()}
        >
          Run full repro (A then B)
        </button>
        <button disabled={busy || !roomUrl} onClick={() => void runCase("A")}>
          Run Case A only
        </button>
        <button disabled={busy || !roomUrl} onClick={() => void runCase("B")}>
          Run Case B only
        </button>
      </div>

      <div
        style={{
          background: "#f4f4f4",
          padding: 8,
          borderRadius: 4,
          marginBottom: 16,
          fontFamily: "monospace",
          fontSize: 13,
        }}
      >
        Status: {status}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <CaseCard
          heading="Case A — colliding name (bug)"
          def={CASE_A}
          result={caseA}
          canvasRef={caseACanvasRef}
        />
        <CaseCard
          heading="Case B — safe name (control)"
          def={CASE_B}
          result={caseB}
          canvasRef={caseBCanvasRef}
        />
        <div style={{ flex: "1 1 300px", minWidth: 280 }}>
          <h3>Reference image (local)</h3>
          <p style={{ fontSize: 13, color: "#555" }}>
            Real 1920x1080 customer image ({LOCAL_REFERENCE_IMAGE}). Case B should
            match this; Case A should not.
          </p>
          <canvas
            ref={referenceCanvasRef}
            style={{
              width: "100%",
              border: "1px solid #ccc",
              background: "#000",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const CASE_A: CaseDef = {
  key: "A",
  assetName: COLLIDING_NAME,
  sessionAssetKey: `images/${COLLIDING_NAME}`,
};

const CASE_B: CaseDef = {
  key: "B",
  assetName: SAFE_NAME,
  sessionAssetKey: `images/${SAFE_NAME}`,
};

function CaseCard({
  heading,
  def,
  result,
  canvasRef,
}: {
  heading: string;
  def: CaseDef;
  result: CaseResult;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}): React.JSX.Element {
  return (
    <div style={{ flex: "1 1 300px", minWidth: 280 }}>
      <h3>{heading}</h3>
      <ul style={{ fontSize: 13, color: "#555", paddingLeft: 18 }}>
        <li>
          image.assetName: <code>{def.assetName}</code>
        </li>
        <li>status: {result.status}</li>
        <li>recording id: {result.recordingId ?? "n/a"}</li>
        <li>
          frame size:{" "}
          {result.videoWidth && result.videoHeight
            ? `${result.videoWidth}x${result.videoHeight}`
            : "n/a"}
        </li>
        <li>
          avg color:{" "}
          {result.avgColor ? result.avgColor.join(", ") : "n/a"}
          {result.tainted ? " (pixel read blocked)" : ""}
        </li>
      </ul>
      {result.message && (
        <p style={{ fontSize: 12, color: "#333" }}>{result.message}</p>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          border: "1px solid #ccc",
          background: "#000",
        }}
      />
      {result.downloadLink && (
        <p style={{ fontSize: 12 }}>
          <a href={result.downloadLink} download>
            Download raw recording
          </a>
        </p>
      )}
    </div>
  );
}

export function VcsBackgroundRepro(): React.JSX.Element {
  console.info("VCS repro — Daily version: %s", Daily.version());
  return (
    <DailyProvider
      subscribeToTracksAutomatically={false}
      dailyConfig={{ useDevicePreferenceCookies: true }}
    >
      <VcsRepro />
    </DailyProvider>
  );
}
