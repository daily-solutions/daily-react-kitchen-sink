import { useCallback, useEffect, useRef, useState } from "react";
import Daily, { DailyCall, DailyEventObject } from "@daily-co/daily-js";

// T-2175 zemplar repro page.
//
// Joins a room whose token has auto_start_transcription + enable_live_captions_ui
// with the mic ON, then (on button click) starts a screen share that includes an
// audio track. Every new audio track opens a fresh Deepgram websocket server-side,
// which is the suspected trigger for the "zemplar" first-word hallucination.
//
// Every transcription event is logged to the console as a single line prefixed
// with "T2175LOG " (JSON), collected in window.__t2175Log, and downloadable as
// JSON via the button. Open with:
//   /?zemplar=1&roomUrl=<encoded room url>&t=<meeting token>

type LogEntry = Record<string, unknown> & { at: string; action: string };

declare global {
  interface Window {
    __t2175Log: LogEntry[];
  }
}

window.__t2175Log = window.__t2175Log ?? [];

// Guard against React StrictMode double-mount (would double-register listeners).
let initialized = false;

function log(action: string, data: Record<string, unknown> = {}) {
  const entry: LogEntry = { at: new Date().toISOString(), action, ...data };
  window.__t2175Log.push(entry);
  console.log(`T2175LOG ${JSON.stringify(entry)}`);
}

export default function ZemplarRepro() {
  const callRef = useRef<DailyCall | null>(null);
  const [status, setStatus] = useState("initializing");
  const [captions, setCaptions] = useState<string[]>([]);

  useEffect(() => {
    document.title = "T2175 Zemplar Repro";
    const params = new URLSearchParams(window.location.search);
    const roomUrl = params.get("roomUrl");
    const token = params.get("t") ?? undefined;
    if (!roomUrl) {
      setStatus("missing ?roomUrl= param (run: node scripts/t2175-setup.mjs)");
      return;
    }

    // Survive React StrictMode double-mount.
    const call = Daily.getCallInstance() ?? Daily.createCallObject();
    callRef.current = call;
    if (initialized) return;
    initialized = true;

    const events = [
      "joined-meeting",
      "left-meeting",
      "error",
      "nonfatal-error",
      "track-started",
      "track-stopped",
      "local-screen-share-started",
      "local-screen-share-stopped",
      "local-screen-share-canceled",
      "transcription-started",
      "transcription-stopped",
      "transcription-error",
    ] as const;

    events.forEach((ev) =>
      call.on(ev, (e: DailyEventObject) => {
        // Track events: only log the bits we need (participant + track kind).
        if (ev === "track-started" || ev === "track-stopped") {
          const te = e as DailyEventObject<"track-started">;
          log(ev, {
            participantId: te.participant?.session_id,
            trackKind: te.track?.kind,
            trackType: te.type,
          });
        } else {
          log(ev, { raw: e });
        }
      })
    );

    call.on("transcription-message", (e) => {
      log("transcription-message", {
        participantId: e.participantId,
        trackType: e.trackType,
        instanceId: e.instanceId,
        text: e.text,
        timestamp: e.timestamp,
        rawResponse: e.rawResponse,
      });
      setCaptions((prev) => [
        ...prev.slice(-30),
        `[${e.trackType ?? "?"}] ${e.participantId?.slice(0, 8)}: ${e.text}`,
      ]);
    });

    setStatus("joining");
    call
      .join({ url: roomUrl, token, startAudioOff: false, startVideoOff: true })
      .then(() => {
        setStatus("joined (mic on, waiting for transcription-started)");
        log("join-resolved", { roomUrl });
      })
      .catch((err) => {
        setStatus(`join failed: ${String(err)}`);
        log("join-failed", { error: String(err) });
      });

    return () => {
      // Intentionally do not destroy on unmount: StrictMode remounts.
    };
  }, []);

  const startShare = useCallback(() => {
    // audio: true so a NEW audio track (screen-audio) is created mid-call.
    // selfBrowserSurface include so the headless runner can auto-pick this tab.
    log("start-screen-share-clicked", {});
    callRef.current?.startScreenShare({
      displayMediaOptions: {
        audio: true,
        video: true,
        selfBrowserSurface: "include",
      },
    });
  }, []);

  const downloadLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(window.__t2175Log, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "t2175-transcription-log.json";
    a.click();
  }, []);

  return (
    <div style={{ fontFamily: "monospace", padding: 16 }}>
      <h1>T-2175 zemplar repro</h1>
      <div id="status">Status: {status}</div>
      <p>
        1. Wait for transcription-started in the console. 2. Click share (pick a
        tab and check &quot;Also share tab audio&quot;). 3. Watch the first
        caption on trackType screen-audio.
      </p>
      <button id="start-share" onClick={startShare}>
        Start screen share (with audio)
      </button>{" "}
      <button id="download-log" onClick={downloadLog}>
        Download JSON log
      </button>
      <h2>Captions</h2>
      <div id="captions">
        {captions.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
