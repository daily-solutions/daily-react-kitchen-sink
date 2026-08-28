import "./styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useInputSettings,
  useParticipantCounts,
  useParticipantIds,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectAppMessage,
  DailyEventObjectCustomButtonClick,
} from "@daily-co/daily-js";

const App = () => {
  const callObject = useDaily();
  const [browserNoiseSuppressionEnabled, setBrowserNoiseSuppressionEnabled] =
    useState(false);

  // @ts-expect-error debugging
  window.callObject = callObject;

  const participantCount = useParticipantCounts();

  const { updateInputSettings } = useInputSettings();

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  // Listen for custom button clicks
  useDailyEvent(
    "custom-button-click",
    useCallback(
      (evt: DailyEventObjectCustomButtonClick) => {
        if (evt?.button_id === "noise-suppression") {
          const newNoiseSuppressionState = !browserNoiseSuppressionEnabled;
          setBrowserNoiseSuppressionEnabled(newNoiseSuppressionState);
          console.log(
            `Toggling browser noise suppression to ${newNoiseSuppressionState}`
          );

          updateInputSettings({
            audio: {
              settings: {
                autoGainControl: false,
                echoCancellation: true,
                noiseSuppression: { exact: newNoiseSuppressionState },
              },
            },
          })
            ?.then((r) => {
              console.log("Updated input settings: ", r);
            })
            .catch((err) => {
              console.error("Error updating input settings", err);
            });

          // Toggle the icon

          const newIconUrl = newNoiseSuppressionState
            ? "https://www.svgrepo.com/show/389998/guitar-instrument-electric-flying-v.svg"
            : "https://www.svgrepo.com/show/535559/person-walking.svg";

          callObject?.updateCustomTrayButtons({
            "noise-suppression": {
              iconPath: newIconUrl,
              iconPathDarkMode: newIconUrl,
              label: "Noise Suppression",
              tooltip: "Toggle browser noise suppression",
            },
          });
        }
      },
      [browserNoiseSuppressionEnabled, updateInputSettings, callObject]
    )
  );

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
        micAudioMode: "music",
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
        "noise-suppression": {
          iconPath:
            "https://www.svgrepo.com/show/389998/guitar-instrument-electric-flying-v.svg",
          iconPathDarkMode:
            "https://www.svgrepo.com/show/389998/guitar-instrument-electric-flying-v.svg",
          label: "Noise Suppression",
          tooltip: "Toggle browser noise suppression",
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
