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
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectAppMessage,
} from "@daily-co/daily-js";

const App = () => {
  const callObject = useDaily();

  // @ts-expect-error debugging
  window.callObject = callObject;

  const participantCount = useParticipantCounts();
  const remoteParticipantIds = useParticipantIds({ filter: "remote" });

  const logEvent = useCallback((evt: DailyEventObject) => {
    if ("action" in evt) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`logEvent: ${evt.action}`, evt);
    } else {
      console.log("logEvent:", evt);
    }
  }, []);

  // Handle custom button clicks using useDailyEvent
  useDailyEvent(
    "custom-button-click",
    useCallback(
      (event: DailyEventObject<"custom-button-click">) => {
        if (event.button_id === "muteAll" && callObject) {
          // Build update object for all remote participants
          const updates: Record<string, { setAudio: boolean }> = {};
          for (const sessionId of remoteParticipantIds) {
            updates[sessionId] = {
              setAudio: false,
              updatePermissions: {
                // Only allow video, revoke audio
                canSend: new Set(["video"]),
                // or canSend: ['video'] also works
              },
            };
          }

          if (Object.keys(updates).length > 0) {
            callObject.updateParticipants(updates);
            console.log("Muted all remote participants:", updates);
          }
        }
      },
      [callObject, remoteParticipantIds]
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
      token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyIjoiZGVtbyIsInUiOiJvd25lciIsInVkIjoib3duZXIiLCJvIjp0cnVlLCJkIjoiNjgzYjg5ZjQtYjFmZC00Zjk0LWI4NDUtZWYyNjY2ZTNlMjEzIiwiaWF0IjoxNzY1NDU1MTE1fQ.QiDV2Ijsqt8BMRiOWVuWb6SmC78-ImofTwo3HmuTPNA",
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
        muteAll: {
          iconPath: "https://www.svgrepo.com/show/532036/cloud-rain-alt.svg",
          iconPathDarkMode:
            "https://www.svgrepo.com/show/532036/cloud-rain-alt.svg",
          label: "Mute All",
          tooltip: "Mute all other participants",
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
