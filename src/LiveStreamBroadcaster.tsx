import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyProvider,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useLiveStreaming,
} from "@daily-co/daily-react";
import type { DailyEventObjectCustomButtonClick } from "@daily-co/daily-js";

const ICON_URL = "https://api.iconify.design/mdi/broadcast.svg?color=%23000000";

const LiveStreamControls = ({ hlsEndpoint }: { hlsEndpoint: string }) => {
  const callObject = useDaily();
  const { startLiveStreaming, stopLiveStreaming, isLiveStreaming, errorMsg } =
    useLiveStreaming();

  useDailyEvent(
    "custom-button-click",
    useCallback(
      (event: DailyEventObjectCustomButtonClick) => {
        if (event.button_id !== "livestream") return;
        if (isLiveStreaming) {
          stopLiveStreaming();
        } else {
          startLiveStreaming({ endpoints: [{ endpoint: hlsEndpoint }] });
        }
      },
      [isLiveStreaming, hlsEndpoint, startLiveStreaming, stopLiveStreaming],
    ),
  );

  useEffect(() => {
    if (!callObject || callObject.meetingState() !== "joined-meeting") return;
    callObject.updateCustomTrayButtons({
      livestream: {
        iconPath: ICON_URL,
        label: isLiveStreaming ? "Stop" : "Go Live",
        tooltip: isLiveStreaming ? "Stop live stream" : "Start live stream",
        visualState: isLiveStreaming ? "active" : undefined,
      },
    });
  }, [callObject, isLiveStreaming]);

  return (
    <div style={{ textAlign: "center", padding: "8px" }}>
      {isLiveStreaming && (
        <p style={{ color: "red", fontWeight: "bold" }}>LIVE</p>
      )}
      {errorMsg && <p style={{ color: "red" }}>Error: {errorMsg}</p>}
    </div>
  );
};

export const LiveStreamBroadcaster = () => {
  const [roomUrl, setRoomUrl] = useState("");
  const [hlsEndpoint, setHlsEndpoint] = useState("");
  const [joined, setJoined] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: wrapperRef,
    options: {
      url: roomUrl || undefined,
      iframeStyle: { width: "100%", height: "80vh" },
      dailyConfig: { useDevicePreferenceCookies: true },
      customTrayButtons: {
        livestream: {
          iconPath: ICON_URL,
          label: "Go Live",
          tooltip: "Start live stream",
        },
      },
    },
    shouldCreateInstance: useCallback(
      () => joined && Boolean(wrapperRef.current),
      [joined],
    ),
  });

  useEffect(() => {
    if (!callFrame) return;
    callFrame.join().catch((err: unknown) => {
      console.error("Error joining call", err);
    });
  }, [callFrame]);

  if (!joined) {
    return (
      <div className="broadcaster-setup">
        <h2>Live Stream Broadcaster</h2>
        <input
          type="text"
          placeholder="Daily room URL (https://your-domain.daily.co/room)"
          value={roomUrl}
          onChange={(e) => setRoomUrl(e.target.value)}
        />
        <input
          type="text"
          placeholder="HLS endpoint name (e.g. hls_s3)"
          value={hlsEndpoint}
          onChange={(e) => setHlsEndpoint(e.target.value)}
        />
        <button
          onClick={() => setJoined(true)}
          disabled={!roomUrl || !hlsEndpoint}
        >
          Join & Broadcast
        </button>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callFrame}>
      <div ref={wrapperRef} />
      <LiveStreamControls hlsEndpoint={hlsEndpoint} />
    </DailyProvider>
  );
};
