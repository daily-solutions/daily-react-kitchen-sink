import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import {
  DailyProvider,
  useCallFrame,
  useDaily,
  useDailyEvent,
  useParticipantCounts,
  useParticipantIds,
  useTranscription,
} from "@daily-co/daily-react";
import {
  DailyEventObject,
  DailyEventObjectCustomButtonClick,
} from "@daily-co/daily-js";

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

  const { startTranscription, stopTranscription, isTranscribing, transcriptions } =
    useTranscription({
      onTranscriptionStarted: logEvent,
      onTranscriptionStopped: logEvent,
      onTranscriptionError: logEvent,
      onTranscriptionMessage: logEvent,
    });

  useDailyEvent(
    "custom-button-click",
    useCallback(
      (evt: DailyEventObjectCustomButtonClick) => {
        if (evt.button_id === "transcription") {
          if (isTranscribing) {
            stopTranscription();
          } else {
            startTranscription({
              language: "multi",
              model: "nova-2-general",
              profanity_filter: true,
              punctuate: true,
              includeRawResponse: true,
              extra: {
                interim_results: true,
              },
            });
          }
        }
      },
      [isTranscribing, startTranscription, stopTranscription]
    )
  );

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [transcriptions]);

  return (
    <>
      <div
        ref={panelRef}
        style={{
          maxHeight: 300,
          overflowY: "auto",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          margin: 16,
          padding: 16,
          background: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#333" }}>
          Multi-Language Transcription {isTranscribing ? "(Active)" : "(Inactive)"}
        </h3>
        {transcriptions.length === 0 && (
          <p style={{ color: "#888", fontStyle: "italic", fontSize: 14 }}>
            {isTranscribing
              ? "Listening for speech..."
              : "Click the Transcribe button in the call tray to start."}
          </p>
        )}
        {transcriptions.map((t, index) => (
          <div
            key={`${t.session_id}-${t.timestamp}-${index}`}
            style={{
              marginBottom: 8,
              paddingBottom: 4,
              borderBottom: "1px solid #f0f0f0",
              fontSize: 14,
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontWeight: 600, color: "#1a73e8" }}>
              {t.user_name ?? t.user_id}:
            </span>{" "}
            <span style={{ color: "#333" }}>{t.text}</span>
          </div>
        ))}
      </div>
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
      token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvIjp0cnVlLCJyIjoiZGVtbyIsImQiOiI2ODNiODlmNC1iMWZkLTRmOTQtYjg0NS1lZjI2NjZlM2UyMTMiLCJpYXQiOjE3NzE4MTgwMjV9.NgoqiZV3vumDX1RFFjqW1UiaXqqdPoky3_MzLIC-GoU",
      iframeStyle: {
        width: "100%",
        height: "80vh",
      },
      userData: {
        avatar: "https://www.svgrepo.com/show/532036/cloud-rain-alt.svg",
      },
      customTrayButtons: {
        transcription: {
          iconPath:
            "https://cdn.jsdelivr.net/npm/heroicons@2.1.1/24/outline/chat-bubble-bottom-center-text.svg",
          iconPathDarkMode:
            "https://cdn.jsdelivr.net/npm/heroicons@2.1.1/24/outline/chat-bubble-bottom-center-text.svg",
          label: "Transcribe",
          tooltip: "Toggle multi-language transcription",
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
