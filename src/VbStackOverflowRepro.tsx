import { useCallback, useEffect, useRef, useState } from "react";
import Daily from "@daily-co/daily-js";
import { useDaily, useDailyEvent } from "@daily-co/daily-react";

/**
 * Repro for T-5417: "RangeError: Maximum call stack size exceeded" thrown
 * from daily-js's participant-updated handler when a video processor
 * (background blur / background image) is on and the processed local video
 * track gets replaced by a new track object.
 *
 * Open with: /?repro=t5417&room=https://your-domain.daily.co/room
 * Add &legacy=1 to use the older MediaPipe processor (useLegacyVideoProcessor).
 * Add &auto=<trigger> to run one trigger with no clicks:
 *   switch  -> customer's steps: startCamera, blur, join, then background-image
 *   none    -> after join: processor none, wait, then blur again
 *   nonefast -> after join: processor none then blur again, no wait
 *   camera  -> after join: switch to a different camera (needs 2 cameras)
 *   constraints -> after join: change camera constraints (same device)
 *   samecam -> after join: setInputDevicesAsync with the camera already in use
 *   ended   -> after join: stop the raw camera track daily-js handed out at
 *              startCamera, to act like a camera disconnect; daily-js then
 *              re-acquires the same camera and restarts the processor
 *   video   -> after join: setLocalVideo(false), wait, setLocalVideo(true)
 *   videofast -> after join: setLocalVideo(false) then (true), no wait
 *   direct  -> no user action: feed daily-js's own
 *              compareEqualForParticipantUpdateEvent two participant objects
 *              whose video tracks are canvas tracks from two different
 *              canvases with the same _processorSettings and _deviceId
 *   all     -> run every trigger in order, stop at the first error
 *   a,b,c   -> run only those triggers, in that order
 */

type Trigger =
  | "switch"
  | "none"
  | "nonefast"
  | "camera"
  | "constraints"
  | "samecam"
  | "ended"
  | "video"
  | "videofast"
  | "direct";
const TRIGGERS: Trigger[] = [
  "switch",
  "none",
  "nonefast",
  "camera",
  "constraints",
  "samecam",
  "ended",
  "video",
  "videofast",
  "direct",
];

const params = new URLSearchParams(window.location.search);
const roomUrl = params.get("room") ?? "https://hush.daily.co/demo";
const auto = params.get("auto");

const BLUR = {
  video: { processor: { type: "background-blur", config: { strength: 1 } } },
} as const;
const IMAGE = {
  video: {
    processor: {
      type: "background-image",
      config: {
        source: "https://assets.timelycare.com/images/provider-video-bg-lg.jpg",
      },
    },
  },
} as const;
const NONE = { video: { processor: { type: "none" } } } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Walks two objects the same way dequal does (for...in, inherited keys too,
// no cycle check) and reports the first key path where they differ, or
// "cycle" if the walk goes deeper than dequal can before it overflows.
function firstDiff(a: unknown, b: unknown, path = "", depth = 0): string {
  if (a === b) return "";
  if (depth > 200) return `cycle at ${path}`;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    a.constructor !== b.constructor
  ) {
    return `${path || "<root>"} (${String(a)} vs ${String(b)})`;
  }
  for (const k in a) {
    const r = firstDiff(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      `${path}.${k}`,
      depth + 1
    );
    if (r) return r;
  }
  return "";
}

interface ReproState {
  caught?: string | null;
  updates?: number;
  joined?: boolean;
  done?: boolean;
}
declare global {
  interface Window {
    __t5417?: ReproState;
  }
}

export function VbStackOverflowRepro() {
  const callObject = useDaily();
  // @ts-expect-error add callObject to window for debugging
  window.callObject = callObject;

  const [lines, setLines] = useState<string[]>([]);
  const [updates, setUpdates] = useState(0);
  const [caught, setCaught] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const running = useRef(false);
  const lastCanvas = useRef<unknown>(null);
  const lastTrack = useRef<MediaStreamTrack | null>(null);
  const rawCamTrack = useRef<MediaStreamTrack | null>(null);

  const log = useCallback((msg: string) => {
    console.log(`[T5417] ${msg}`);
    setLines((l) => [...l, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }, []);

  // Count participant-updated events for the local participant. When the
  // compare in daily-js throws, this event is lost, so the count stops moving.
  useDailyEvent(
    "participant-updated",
    useCallback(
      (ev) => {
        if (!ev.participant.local) return;
        setUpdates((n) => n + 1);
        const t = ev.participant.tracks.video.persistentTrack;
        const canvas =
          t && "canvas" in t ? (t as { canvas: unknown }).canvas : null;
        log(
          `participant-updated local video track=${t?.id ?? "none"} canvas=${canvas ? (canvas === lastCanvas.current ? "same" : "NEW") : "no"} state=${ev.participant.tracks.video.state}`
        );
        if (canvas) lastCanvas.current = canvas;
        if (t && lastTrack.current && t !== lastTrack.current) {
          log(`  dequal-style first diff old vs new track: ${firstDiff(lastTrack.current, t)}`);
        }
        lastTrack.current = t ?? null;
      },
      [log]
    )
  );

  useDailyEvent(
    "nonfatal-error",
    useCallback(
      (ev) => log(`nonfatal-error ${ev.type}: ${ev.errorMsg}`),
      [log]
    )
  );

  useDailyEvent(
    "joined-meeting",
    useCallback(() => {
      setJoined(true);
      log("joined-meeting");
    }, [log])
  );

  // daily-js runs the compare inside a window "message" listener, outside any
  // try/catch, so the RangeError surfaces as a window error event.
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      const err = ev.error as Error | undefined;
      const text = `${ev.message}\n${err?.stack ?? "(no stack)"}`;
      if (/Maximum call stack/i.test(ev.message)) {
        setCaught(text);
        log(`REPRO: RangeError caught: ${ev.message}`);
        console.error("[T5417] REPRO stack:\n", err?.stack);
      } else {
        log(`window error (other): ${ev.message}`);
      }
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason as Error | undefined;
      log(`unhandledrejection: ${reason?.message ?? String(ev.reason)}`);
      if (/Maximum call stack/i.test(reason?.message ?? "")) {
        setCaught(reason?.stack ?? String(ev.reason));
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [log]);

  const localTrackId = useCallback(
    () => callObject?.participants().local?.tracks.video.persistentTrack?.id,
    [callObject]
  );

  // Customer's exact order: startCamera, blur, join.
  const setup = useCallback(async () => {
    if (!callObject) return;
    log(
      `daily-js ${Daily.version()}, room ${roomUrl}, legacy processor: ${String(params.get("legacy") === "1")}`
    );
    await callObject.startCamera();
    rawCamTrack.current =
      callObject.participants().local?.tracks.video.persistentTrack ?? null;
    log(`startCamera done, track=${localTrackId()}`);
    // Call daily-js directly here (not the useInputSettings hook) because the
    // hook ignores calls made before join, and the customer calls it pre-join.
    await callObject.updateInputSettings(BLUR);
    log(`blur on before join, track=${localTrackId()}`);
    await callObject.join({
      url: roomUrl,
      userName: "t5417-repro",
      startVideoOff: false,
      startAudioOff: false,
    });
    log(`join done, track=${localTrackId()}`);
    await sleep(2000);
  }, [callObject, log, localTrackId]);

  const runTrigger = useCallback(
    async (trigger: Trigger) => {
      if (!callObject) return;
      log(`--- trigger: ${trigger} (track before=${localTrackId()})`);
      switch (trigger) {
        case "switch":
          await callObject.updateInputSettings(IMAGE);
          break;
        case "none":
          await callObject.updateInputSettings(NONE);
          await sleep(1500);
          log(`processor none, track=${localTrackId()}`);
          await callObject.updateInputSettings(BLUR);
          break;
        case "nonefast":
          void callObject.updateInputSettings(NONE);
          await callObject.updateInputSettings(BLUR);
          break;
        case "camera": {
          // The processed track is a canvas track, so getSettings() has no
          // deviceId. Ask daily-js which camera is in use instead.
          const { camera } = await callObject.getInputDevices();
          const currentDeviceId = (camera as MediaDeviceInfo).deviceId;
          const { devices } = await callObject.enumerateDevices();
          const cams = devices.filter((d) => d.kind === "videoinput");
          log(`camera: ${cams.length} cameras, current=${currentDeviceId}`);
          const other = cams.find((d) => d.deviceId !== currentDeviceId);
          if (!other) {
            log("camera: only one camera found, skipping");
            return;
          }
          await callObject.setInputDevicesAsync({
            videoDeviceId: other.deviceId,
          });
          break;
        }
        case "constraints":
          await callObject.updateInputSettings({
            video: { settings: { width: 320, height: 240 } },
          });
          break;
        case "samecam": {
          const { camera } = await callObject.getInputDevices();
          await callObject.setInputDevicesAsync({
            videoDeviceId: (camera as MediaDeviceInfo).deviceId,
          });
          break;
        }
        case "ended":
          log(
            `ended: stopping raw cam track ${rawCamTrack.current?.id} (readyState=${rawCamTrack.current?.readyState})`
          );
          rawCamTrack.current?.stop();
          // stop() does not fire "ended" on the track itself, so fire it by
          // hand to act like the camera went away.
          rawCamTrack.current?.dispatchEvent(new Event("ended"));
          break;
        case "direct": {
          const local = callObject.participants().local;
          const t = local.tracks.video.persistentTrack as
            | (MediaStreamTrack & { canvas?: HTMLCanvasElement })
            | undefined;
          if (!t?.canvas) {
            log("direct: local track is not a canvas track, skipping");
            return;
          }
          // Second canvas with the same size, second capture track with the
          // same daily-js metadata. Only the canvas object differs.
          const c2 = document.createElement("canvas");
          c2.width = t.canvas.width;
          c2.height = t.canvas.height;
          const t2 = c2.captureStream(1).getVideoTracks()[0] as MediaStreamTrack &
            Record<string, unknown>;
          for (const k of Object.keys(t)) {
            t2[k] = (t as unknown as Record<string, unknown>)[k];
          }
          const p2 = {
            ...local,
            tracks: {
              ...local.tracks,
              video: { ...local.tracks.video, persistentTrack: t2, track: t2 },
            },
          };
          const compare = (
            callObject as unknown as {
              compareEqualForParticipantUpdateEvent: (
                a: unknown,
                b: unknown
              ) => boolean;
            }
          ).compareEqualForParticipantUpdateEvent.bind(callObject);
          log(
            `direct: dequal-style walk of old vs new track: ${firstDiff(t, t2).slice(0, 400)}`
          );
          try {
            log(`direct: compare says equal=${String(compare(p2, local))}`);
          } catch (err) {
            const e = err as Error;
            log(`REPRO (direct): ${e.name}: ${e.message}`);
            console.error("[T5417] REPRO direct stack:\n", e.stack);
            setCaught(`${e.name}: ${e.message}\n${e.stack ?? ""}`);
          }
          break;
        }
        case "videofast":
          callObject.setLocalVideo(false);
          callObject.setLocalVideo(true);
          break;
        case "video":
          callObject.setLocalVideo(false);
          await sleep(1500);
          log(`video off, track=${localTrackId()}`);
          callObject.setLocalVideo(true);
          break;
      }
      await sleep(3000);
      log(`trigger ${trigger} done (track after=${localTrackId()})`);
    },
    [callObject, log, localTrackId]
  );

  // Auto mode, used by the headless run in the PR.
  useEffect(() => {
    if (!callObject || !auto || running.current) return;
    running.current = true;
    const wanted = auto.split(",");
    const list: Trigger[] =
      auto === "all" ? TRIGGERS : TRIGGERS.filter((t) => wanted.includes(t));
    (async () => {
      await setup();
      for (const t of list) {
        await runTrigger(t);
        if (window.__t5417?.caught) break;
      }
      log("auto run finished");
      window.__t5417 = { ...(window.__t5417 ?? {}), done: true };
    })().catch((err) => {
      log(`auto run error: ${(err as Error).message}`);
    });
  }, [callObject, log, runTrigger, setup]);

  useEffect(() => {
    window.__t5417 = { ...(window.__t5417 ?? {}), caught, updates, joined };
  }, [caught, updates, joined]);

  return (
    <div style={{ fontFamily: "monospace", padding: 16 }}>
      <h2>T-5417 repro: participant-updated stack overflow</h2>
      <p>
        daily-js {Daily.version()} | room {roomUrl} | joined:{" "}
        {String(joined)} | local participant-updated events: {updates}
      </p>
      <p
        style={{
          fontWeight: "bold",
          color: caught ? "red" : "green",
          whiteSpace: "pre-wrap",
        }}
      >
        {caught ? `REPRO: RangeError caught\n${caught}` : "no error yet"}
      </p>
      <button disabled={joined} onClick={() => void setup()}>
        1. startCamera + blur + join
      </button>{" "}
      {TRIGGERS.map((t) => (
        <button key={t} disabled={!joined} onClick={() => void runTrigger(t)}>
          trigger: {t}
        </button>
      ))}
      <pre style={{ fontSize: 12 }}>{lines.join("\n")}</pre>
    </div>
  );
}
