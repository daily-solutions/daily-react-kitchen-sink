import "./styles.css";
import { useCallback, useEffect, useRef, forwardRef } from "react";
import {
  DailyProvider,
  useCallFrame,
  useLocalSessionId,
  useParticipantCounts,
  useParticipantProperty,
} from "@daily-co/daily-react";

const CallContainer = forwardRef<HTMLDivElement>((_, ref) => {
  const participantCount = useParticipantCounts().present;
  const localSessionId = useLocalSessionId();
  const userName = useParticipantProperty(localSessionId, "user_name");
  return (
    <>
      <div ref={ref} />
      <span>Participant count: {participantCount}</span>
      <span>User joined as {userName}</span>
    </>
  );
});

export const Prebuilt = () => {
  const telehealthResponse = {
    meetingLink: "https://hush.daily.co/demo",
  };
  const callRef = useRef<HTMLDivElement>(null);
  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: callRef,
    options: {
      url: telehealthResponse.meetingLink,
      // token: "You'll want to set this to a valid token or else anyone can join the call.",
      showFullscreenButton: true,
      inputSettings: {
        audio: {
          processor: {
            type: "noise-cancellation",
          },
        },
      },
      iframeStyle: {
        width: "100%",
        height: "100%",
        position: "absolute",
      },
      theme: {
        colors: {
          accent: "#0b663d",
          accentText: "#FFF",
          background: "#121A24",
          backgroundAccent: "#1F2D3D",
          baseText: "#FFFFFF",
          border: "#2B3F56",
          mainAreaBg: "#121A24",
          mainAreaBgAccent: "#2B3F56",
          mainAreaText: "#FFFFFF",
          supportiveText: "#C8D1DC",
        },
      },
    },
    shouldCreateInstance: useCallback(() => Boolean(callRef.current), []),
  });

  useEffect(() => {
    if (!callFrame) return;
    callFrame?.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame]);
  return (
    <DailyProvider callObject={callFrame}>
      <CallContainer ref={callRef} />
    </DailyProvider>
  );
};
