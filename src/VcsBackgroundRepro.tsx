import { useCallback, useRef, useState } from "react";
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
//
// The demo only runs the record/stop cycles and reports each case's recording
// id and status. It does NOT fetch, poll, download, or verify the recordings.
// Check the recordings yourself afterward (Daily dashboard, REST API, or
// ffmpeg) using the reported recording ids.
// ---------------------------------------------------------------------------

// Real public image the cloud compositor fetches over the network. Must be a
// public URL, NOT localhost (Daily's compositor runs server-side).
const CUSTOMER_IMAGE_URL =
  "https://ctshare.blob.core.windows.net/ct-journey/overlay.png";

// One of the bundled default filenames shipped by daily:baseline.
const COLLIDING_NAME = "overlay.png";
const SAFE_NAME = "ct-journey-overlay.png";

const RECORD_MS = 10_000; // ~10s of recording per case
const RECORDING_STARTED_TIMEOUT_MS = 30_000;
const RECORDING_STOPPED_TIMEOUT_MS = 60_000;

type CaseKey = "A" | "B";

interface CaseDef {
  key: CaseKey;
  assetName: string;
  // The session_assets map key. For Case A this is the colliding name.
  sessionAssetKey: string;
}

type CaseStatus = "idle" | "recording" | "stopping" | "done" | "error";

interface CaseResult {
  status: CaseStatus;
  recordingId?: string;
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
        mode: "grid",
        showImageOverlay: true,
        "image.assetName": def.assetName,
        "image.zPosition": "background",
        "image.fullScreen": true,
        "image.fullScreenScaleMode": "fit",
        "image.opacity": 1,
      },
    },
  };
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

  // Run one full independent cycle for a single case: join -> start -> ~10s ->
  // stop -> leave. Marks the case "done" with its recording id. No verification.
  const runSingleCase = useCallback(
    async (
      def: CaseDef,
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
            "No recordingId came back on recording-started. Check the recordings dashboard manually.",
        }));
        return;
      }

      setCase((prev) => ({
        ...prev,
        status: "done",
        message: "Record/stop cycle finished. Check this recording id manually.",
      }));
      setStatus(`[Case ${def.key}] Done. Recording id: ${recordingId}`);
    },
    [
      callObject,
      roomUrl,
      token,
      useBareKeyForCaseA,
      waitForRecordingStarted,
      waitForRecordingStopped,
    ]
  );

  const runCase = useCallback(
    async (key: CaseKey): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        if (key === "A") {
          await runSingleCase(CASE_A, setCaseA);
        } else {
          await runSingleCase(CASE_B, setCaseB);
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
      await runSingleCase(CASE_A, setCaseA);
      await runSingleCase(CASE_B, setCaseB);
      setStatus(
        "Full repro complete. Check both recording ids manually (dashboard / REST API / ffmpeg)."
      );
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
        renders); Case B uses a safe name (expected: the real image renders). The
        demo only reports each case&apos;s recording id and status: check the
        recordings yourself afterward (dashboard, REST API, or ffmpeg).
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
        />
        <CaseCard
          heading="Case B — safe name (control)"
          def={CASE_B}
          result={caseB}
        />
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
}: {
  heading: string;
  def: CaseDef;
  result: CaseResult;
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
      </ul>
      {result.message && (
        <p style={{ fontSize: 12, color: "#333" }}>{result.message}</p>
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
