import { useCallback, useEffect, useState } from "react";
import { DailyLiveStreamingLayoutConfig } from "@daily-co/daily-js";
import {
  DailyVideo,
  DailyProvider,
  useDaily,
  useLiveStreaming,
  useLocalSessionId,
  useMeetingState,
} from "@daily-co/daily-react";

// ---------------------------------------------------------------------------
// T-2904 happy-path demo
// ---------------------------------------------------------------------------
// One button: "Start live streaming". It joins a fixed Daily room with the
// camera on, then starts a daily:baseline VCS livestream that paints the
// customer's background image behind the call. This shows the whole flow works.
//
// Background: ticket T-2904 reported that a background overlay named
// "overlay.png" would not render on a livestream. "overlay.png" is also the
// name of one of daily:baseline's own bundled default images, so the theory was
// a name collision. That turned out to be a red herring: the customer's real
// 1920x1080 image renders fine under that exact name. This demo is the proof.
//
// The composited output is not visible in this browser tab (it goes to the
// livestream). It is written to the hush custom-hush S3 bucket via the room's
// "hls_s3" streaming endpoint, so you can download it and confirm the overlay.
// ---------------------------------------------------------------------------

// Fixed public room, pre-created with the "hls_s3" streaming endpoint wired to
// the hush custom-hush S3 bucket. A room URL is not sensitive.
const ROOM_URL = "https://hush.daily.co/t-2904-demo";

// Owner meeting token. Kept in gitignored .env.local, NOT committed: starting a
// livestream needs streaming-admin rights, and a committed owner token would be
// a secret leak on a public repo.
const TOKEN = import.meta.env.VITE_VCS_DEMO_TOKEN as string | undefined;

// The customer's real background image (H.C. Wainwright BioConnect, 1920x1080).
const CUSTOMER_IMAGE_URL =
  "https://ctshare.blob.core.windows.net/ct-journey/overlay.png";

// The proven daily:baseline overlay layout (ticket T-2904, "Case A"). The asset
// name "overlay.png" is deliberately the colliding name: it renders fine.
const OVERLAY_LAYOUT: DailyLiveStreamingLayoutConfig<"start"> = {
  preset: "custom",
  composition_id: "daily:baseline",
  composition_params: {
    mode: "grid",
    showImageOverlay: true,
    "videoSettings.omitPausedVideo": true,
    "videoSettings.roundedCorners": true,
    "videoSettings.cornerRadius_gu": 1.2,
    "videoSettings.showParticipantLabels": true,
    // Margins inset the participant tile so the background image is visible
    // around it. Without these, a single tile fills the frame and hides the
    // overlay. These match the customer's original config.
    "videoSettings.margin.left_gu": 2,
    "videoSettings.margin.right_gu": 2,
    "videoSettings.margin.top_gu": 6,
    "videoSettings.margin.bottom_gu": 5,
    "image.zPosition": "background",
    "image.fullScreen": true,
    "image.fullScreenScaleMode": "fit",
    "image.opacity": 1,
    "image.assetName": "overlay.png",
  },
  session_assets: {
    "images/overlay.png": CUSTOMER_IMAGE_URL,
  },
};

function Demo(): React.JSX.Element {
  const callObject = useDaily();
  const localSessionId = useLocalSessionId();
  const meetingState = useMeetingState();
  const [instanceId, setInstanceId] = useState<string | null>(null);

  const { startLiveStreaming, stopLiveStreaming, isLiveStreaming, errorMsg } =
    useLiveStreaming({
      onLiveStreamingStarted: (ev) => console.log("live-streaming-started", ev),
      onLiveStreamingStopped: (ev) => console.log("live-streaming-stopped", ev),
      onLiveStreamingError: (ev) => console.error("live-streaming-error", ev),
    });

  // Join the fixed room with camera on. VCS composition settings only apply
  // when a participant's video is being composited, so the camera must be on.
  useEffect(() => {
    if (!callObject || !TOKEN) return;
    callObject
      .join({ url: ROOM_URL, token: TOKEN })
      .then(() => callObject.setLocalVideo(true))
      .catch((err) => console.error("Error joining room:", err));
    return () => {
      callObject.leave().catch(() => undefined);
    };
  }, [callObject]);

  const handleStart = useCallback(() => {
    const id = crypto.randomUUID();
    setInstanceId(id);
    startLiveStreaming({
      width: 1920,
      height: 1080,
      fps: 30,
      instanceId: id,
      endpoints: [{ endpoint: "hls_s3" }],
      layout: OVERLAY_LAYOUT,
    });
  }, [startLiveStreaming]);

  const handleStop = useCallback(() => {
    stopLiveStreaming(instanceId ? { instanceId } : undefined);
  }, [stopLiveStreaming, instanceId]);

  if (!TOKEN) {
    return (
      <div style={wrapStyle}>
        <h1>T-2904 livestream demo</h1>
        <p style={{ color: "#b00" }}>
          Missing <code>VITE_VCS_DEMO_TOKEN</code>. Add an owner meeting token
          for <code>{ROOM_URL}</code> to <code>.env.local</code> and restart the
          dev server.
        </p>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <h1>T-2904 livestream demo</h1>
      <p style={{ maxWidth: 640, lineHeight: 1.5 }}>
        Starts a Daily livestream using the <code>daily:baseline</code> VCS
        composition with the customer&apos;s background image (asset name{" "}
        <code>overlay.png</code>, the name from the ticket). The composited
        output is written to the hush S3 bucket, so the background is verifiable
        there. This is the proof the overlay renders on the livestream path.
      </p>

      <div style={{ margin: "16px 0" }}>
        <button
          onClick={handleStart}
          disabled={isLiveStreaming || meetingState !== "joined-meeting"}
          style={primaryBtn}
        >
          Start live streaming
        </button>
        <button
          onClick={handleStop}
          disabled={!isLiveStreaming}
          style={secondaryBtn}
        >
          Stop
        </button>
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 14, marginBottom: 16 }}>
        <div>Call: {meetingState}</div>
        <div>
          Live streaming:{" "}
          {isLiveStreaming ? (
            <strong style={{ color: "#0a7d28" }}>
              started{instanceId ? ` (${instanceId})` : ""}
            </strong>
          ) : (
            "not started"
          )}
        </div>
        {errorMsg && <div style={{ color: "#b00" }}>error: {errorMsg}</div>}
      </div>

      {/* Local self-view so you can see your camera is on and being composited. */}
      {localSessionId && (
        <DailyVideo
          type="video"
          automirror
          sessionId={localSessionId}
          style={{ width: 480, maxWidth: "100%", borderRadius: 8 }}
        />
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  fontFamily: "sans-serif",
  padding: 24,
  maxWidth: 800,
  margin: "0 auto",
};

const primaryBtn: React.CSSProperties = {
  fontSize: 16,
  padding: "10px 18px",
  marginRight: 8,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  fontSize: 16,
  padding: "10px 18px",
  cursor: "pointer",
};

export function VcsLivestreamDemo(): React.JSX.Element {
  return (
    <DailyProvider subscribeToTracksAutomatically={false}>
      <Demo />
    </DailyProvider>
  );
}
