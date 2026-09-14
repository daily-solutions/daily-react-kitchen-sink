import { useCallback, useRef, useState } from "react";
import Daily, { DailyCall } from "@daily-co/daily-js";

const ROOM_URL =
  import.meta.env.VITE_DAILY_ROOM_URL ?? "https://hush.daily.co/demo";

// Worker tick instead of requestAnimationFrame: rAF and main-thread setInterval
// are throttled or paused when the tab is backgrounded, which freezes the track
// and would make the recording result meaningless.
// https://docs.daily.co/docs/daily-js/features/custom-tracks#canvas-based-custom-video-track
const makeTickWorker = (fps: number) =>
  new Worker(
    URL.createObjectURL(
      new Blob([`setInterval(() => postMessage("tick"), ${1000 / fps})`], {
        type: "application/javascript",
      }),
    ),
  );

/**
 * Draws a frame counter, a wall-clock timestamp and a cycling hue block.
 * All three matter for verification: the counter proves the track is live and
 * not a stuck first frame, the timestamp lines up with the recording, and the
 * hue block makes a frozen frame obvious by eye before we even run OCR.
 */
export const startDrawing = (canvas: HTMLCanvasElement, label: string, fps: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let frame = 0;
  const worker = makeTickWorker(fps);
  worker.onmessage = () => {
    ctx.fillStyle = "#12121c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = `hsl(${Math.floor(Date.now() / 25) % 360}, 80%, 55%)`;
    ctx.fillRect(0, 0, canvas.width, 40);

    ctx.fillStyle = "#f2f2f2";
    ctx.font = "120px monospace";
    ctx.fillText(`Frame: ${frame++}`, 60, canvas.height / 2);

    ctx.font = "44px monospace";
    ctx.fillText(new Date().toISOString(), 60, canvas.height / 2 + 90);

    ctx.font = "38px monospace";
    ctx.fillText(label, 60, canvas.height - 60);
  };

  return () => worker.terminate();
};

export const WhiteboardPublisher = ({
  prebuiltCallObject,
}: {
  prebuiltCallObject: DailyCall | null;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const negCanvasRef = useRef<HTMLCanvasElement>(null);
  const publisherRef = useRef<DailyCall | null>(null);
  const stopDrawRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("idle");
  const [negStatus, setNegStatus] = useState("not run");

  const publish = useCallback(async () => {
    if (publisherRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const token = import.meta.env.VITE_DAILY_WHITEBOARD_TOKEN;
      if (!token) {
        setStatus("no VITE_DAILY_WHITEBOARD_TOKEN, run scripts/recording.sh token");
        return;
      }

      stopDrawRef.current = startDrawing(canvas, "whiteboard publisher", 30);

      // allowMultipleCallInstances is REQUIRED. Without it daily-js throws in
      // the constructor as soon as it sees a second instance on the page.
      // https://docs.daily.co/docs/daily-js/guides/multi-instance
      setStatus("joining...");
      const publisher = Daily.createCallObject({
        allowMultipleCallInstances: true,
      });
      publisherRef.current = publisher;
      // Exposed so the T-4009 experiment can toggle individual tracks from the
      // console and isolate which one the recording compositor picks up.
      (window as unknown as Record<string, unknown>).whiteboardPublisher =
        publisher;

      publisher.on("joined-meeting", (e) =>
        console.log("[whiteboard] joined", e?.participants.local.session_id),
      );
      publisher.on("track-started", (e) =>
        console.log("[whiteboard] track-started", e?.type, e?.participant?.local),
      );

      await publisher.join({
        url: ROOM_URL,
        token,
        startVideoOff: true,
        startAudioOff: true,
      });

      const [track] = canvas.captureStream(30).getVideoTracks();
      const name = await publisher.startCustomTrack({
        track,
        trackName: "whiteboard",
      });

      const local = publisher.participants().local;
      console.log("[whiteboard] startCustomTrack resolved:", name);
      console.log("[whiteboard] session_id:", local.session_id);
      console.log("[whiteboard] track state:", local.tracks[name]?.state);
      setStatus(`publishing as "${name}" (session ${local.session_id})`);
    } catch (err) {
      console.error("[whiteboard] failed", err);
      setStatus(`FAILED: ${String(err)}`);
    }
  }, []);

  // Variant B: publish the SAME canvas from the SAME second instance, but as a
  // screen share instead of a custom track. In call object mode the mediaStream
  // option resolves (same window), so no picker opens. If this lands in the
  // recording and the custom track does not, the compositor drops custom tracks
  // specifically rather than dropping the second instance.
  const publishAsScreenShare = useCallback(() => {
    const publisher = publisherRef.current;
    const canvas = canvasRef.current;
    if (!publisher || !canvas) {
      setStatus("publish the whiteboard first");
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      publisher.startScreenShare({ mediaStream: stream });
      setStatus("also publishing the same canvas as a SCREEN SHARE");
    } catch (err) {
      console.error("[whiteboard] screenShare failed", err);
      setStatus(`screenShare FAILED: ${String(err)}`);
    }
  }, []);

  const stop = useCallback(async () => {
    stopDrawRef.current?.();
    stopDrawRef.current = null;
    await publisherRef.current?.leave();
    await publisherRef.current?.destroy();
    publisherRef.current = null;
    setStatus("stopped");
  }, []);

  // NEGATIVE CONTROL. Calls startCustomTrack on the PREBUILT (iframe-mode)
  // instance. Expected: no track-started for "neg-prebuilt" and no red frame in
  // the recording, because a MediaStream cannot cross the iframe boundary.
  // If a red NEG PREBUILT frame DOES land in the .mp4, our diagnosis is wrong.
  const runNegativeControl = useCallback(async () => {
    const canvas = negCanvasRef.current;
    if (!canvas || !prebuiltCallObject) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#cc0000";
    ctx.font = "72px monospace";
    ctx.fillText("NEG PREBUILT", 30, canvas.height / 2);

    prebuiltCallObject.on("track-started", (e) => {
      if (e?.type === "neg-prebuilt")
        console.warn("[neg] track-started fired for neg-prebuilt", e);
    });

    const [track] = canvas.captureStream(15).getVideoTracks();
    try {
      const name = await prebuiltCallObject.startCustomTrack({
        track,
        trackName: "neg-prebuilt",
      });
      const local = prebuiltCallObject.participants().local;
      const state = local?.tracks?.[name]?.state ?? "absent";
      console.log("[neg] resolved:", name, "track state:", state);
      setNegStatus(`resolved "${name}", local track state: ${state}`);
    } catch (err) {
      console.log("[neg] rejected:", err);
      setNegStatus(`rejected: ${String(err)}`);
    }
  }, [prebuiltCallObject]);

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => void publish()}>Publish whiteboard</button>
      <button onClick={publishAsScreenShare}>
        Variant B: same canvas as screenShare
      </button>
      <button onClick={() => void stop()}>Stop whiteboard</button>
      <button onClick={() => void runNegativeControl()}>
        NEGATIVE CONTROL: startCustomTrack on Prebuilt
      </button>
      <div>whiteboard: {status}</div>
      <div>negative control: {negStatus}</div>
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{ width: 320, border: "1px solid #888" }}
      />
      <canvas ref={negCanvasRef} width={640} height={360} style={{ width: 160 }} />
    </div>
  );
};
