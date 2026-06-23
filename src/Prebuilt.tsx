import "./styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useInputSettings,
  useMeetingState,
  useParticipantCounts,
  useParticipantIds,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectAppMessage,
  DailyEventObjectInputSettingsUpdated,
} from "@daily-co/daily-js";

const App = () => {
  const callObject = useDaily();

  // @ts-expect-error debugging
  window.callObject = callObject;

  const meetingState = useMeetingState();
  const [banubaDownloaded, setBanubaDownloaded] = useState(false);

  const { updateInputSettings, inputSettings } = useInputSettings({
    onError: useCallback(() => {
      console.error("Error updating input settings");
    }, []),

    onInputSettingsUpdated: useCallback(
      (event: DailyEventObjectInputSettingsUpdated) => {
        console.log(
          "Input settings updated:",
          event.inputSettings?.video?.processor
        );
      },
      []
    ),
  });

  if (
    inputSettings?.video?.processor?.type === "face-detection" &&
    banubaDownloaded
  ) {
    updateInputSettings({
      video: {
        processor: {
          type: "none",
        },
      },
    })?.catch((err) => {
      console.error("Error updating input settings", err);
    });
  }

  if (meetingState === "joining-meeting" && !banubaDownloaded) {
    updateInputSettings({
      video: {
        processor: {
          type: "face-detection",
        },
      },
    })
      ?.then((res) => {
        console.log("Updated input settings", res);
        setBanubaDownloaded(true);
      })
      ?.catch((err) => {
        console.error("Error updating input settings", err);
      });
  }

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
      <p>{participantCount.present} participants</p>
      <p>Meeting state: {meetingState}</p>
      <p>Input settings: {JSON.stringify(inputSettings)}</p>
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
