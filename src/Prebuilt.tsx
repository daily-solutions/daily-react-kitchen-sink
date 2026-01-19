import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useParticipantCounts,
  useParticipantIds,
  useScreenShare,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectAppMessage,
  DailyEventObjectCustomButtonClick,
} from "@daily-co/daily-js";

const App = () => {
  const callObject = useDaily();
  const { isSharingScreen, startScreenShare, stopScreenShare } =
    useScreenShare();

  // @ts-expect-error debugging
  window.callObject = callObject;

  const participantCount = useParticipantCounts();

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  useParticipantIds({
    onParticipantJoined: logEvent,
    onParticipantLeft: logEvent,
    onParticipantUpdated: logEvent,
  });

  type PrebuiltAppMessage = DailyEventObjectAppMessage<{
    date: string;
    event: "chat-msg"; // There's other events too
    message: string;
    name: string;
    room: string;
  }>;

  const sendAppMessage = useAppMessage({
    onAppMessage: useCallback((message: PrebuiltAppMessage) => {
      console.log(message);
      switch (message.data.event) {
        case "chat-msg":
          console.log("Chat message:", message.data.message);
          break;
        default:
          console.log("Unknown event:", message.data.event);
      }
    }, []),
  });

  const handleMusicModeScreenShare = useCallback(() => {
    if (isSharingScreen) {
      stopScreenShare();
    } else {
      startScreenShare({
        displayMediaOptions: {
          video: true,
          audio: {
            channelCount: 2,
            sampleRate: 48000,
            sampleSize: 16,
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
          },
        },
      });
    }
  }, [isSharingScreen, startScreenShare, stopScreenShare]);

  // Listen for custom button clicks
  useDailyEvent(
    "custom-button-click",
    useCallback(
      (event: DailyEventObjectCustomButtonClick) => {
        if (event.button_id === "musicModeScreenShare") {
          handleMusicModeScreenShare();
        }
      },
      [handleMusicModeScreenShare],
    ),
  );

  return (
    <>
      <button
        onClick={() =>
          sendAppMessage({
            event: "chat-msg",
            date: Date.now().toString(),
            message: "Hello from button!",
            name: "button",
            room: "main-room",
          })
        }
      >
        Send message
      </button>
      <span>{participantCount.present} participants</span>
    </>
  );
};

export const Prebuilt = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: wrapperRef,
    options: {
      dailyConfig: {
        useDevicePreferenceCookies: true,
      },
      url: "https://hush.daily.co/demo",
      iframeStyle: {
        width: "100%",
        height: "80vh",
      },
      userData: {
        avatar: "https://www.svgrepo.com/show/532036/cloud-rain-alt.svg",
      },
      customTrayButtons: {
        musicModeScreenShare: {
          iconPath: "https://www.svgrepo.com/show/528834/album.svg",
          label: "Music Share",
          tooltip: "Share screen with high-quality audio for music",
        },
      },
    },
    shouldCreateInstance: useCallback(() => Boolean(wrapperRef.current), []),
  });

  useEffect(() => {
    if (!callFrame) return;
    callFrame?.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame]);
  return (
    <DailyProvider callObject={callFrame}>
      <div ref={wrapperRef} />
      <App />
    </DailyProvider>
  );
};
