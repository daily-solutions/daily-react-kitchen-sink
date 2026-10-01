import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import {
  DailyProvider,
  useAppMessage,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useMeetingState,
  useParticipantCounts,
  useParticipantIds,
  useRecording,
} from "@daily-co/daily-react";
import {
  DailyCustomTrayButtons,
  DailyEventObject,
  DailyEventObjectAppMessage,
  DailyEventObjectCustomButtonClick,
} from "@daily-co/daily-js";

// Custom Record button for the Prebuilt tray.
// Prebuilt's built-in Record button always uses the default maxDuration (3 hours).
// Hide it with the meeting token property `enable_recording_ui: false`, then add
// this button so we can call startRecording() with our own maxDuration.
const RECORD_BUTTON_ID = "customRecord";
const RECORDING_MAX_DURATION_SECONDS = 6 * 60 * 60; // 21600 (6 hours)

const recordTrayButton = (isRecording: boolean): DailyCustomTrayButtons => ({
  [RECORD_BUTTON_ID]: {
    iconPath: "https://unpkg.com/lucide-static@0.544.0/icons/circle-dot.svg",
    label: isRecording ? "Stop recording" : "Record (6h)",
    tooltip: isRecording
      ? "Stop the cloud recording"
      : "Start a 6 hour cloud recording",
    visualState: isRecording ? "active" : "default",
  },
});

const App = () => {
  const callObject = useDaily();

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

  const { isRecording, startRecording, stopRecording } = useRecording({
    onRecordingStarted: logEvent,
    onRecordingStopped: logEvent,
    onRecordingError: logEvent,
  });

  useDailyEvent(
    "custom-button-click",
    useCallback(
      (ev: DailyEventObjectCustomButtonClick) => {
        logEvent(ev);
        if (ev.button_id !== RECORD_BUTTON_ID) return;
        if (isRecording) {
          stopRecording();
        } else {
          startRecording({ maxDuration: RECORDING_MAX_DURATION_SECONDS });
        }
      },
      [isRecording, logEvent, startRecording, stopRecording]
    )
  );

  // Keep the tray button's label and visualState in sync with recording state.
  // Only update once joined; before that the Prebuilt iframe is not ready.
  const meetingState = useMeetingState();
  useEffect(() => {
    if (!callObject || meetingState !== "joined-meeting") return;
    callObject.updateCustomTrayButtons(recordTrayButton(isRecording));
  }, [callObject, isRecording, meetingState]);

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
  // Join with ?token=... so a server-made meeting token (with
  // enable_recording: "cloud" and enable_recording_ui: false) is used.
  const token =
    new URLSearchParams(window.location.search).get("token") ?? undefined;
  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: wrapperRef,
    options: {
      dailyConfig: {
        useDevicePreferenceCookies: true,
      },
      url: "https://hush.daily.co/demo",
      // daily-js rejects `token: undefined`, so only pass it when present
      ...(token ? { token } : {}),
      customTrayButtons: recordTrayButton(false),
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
