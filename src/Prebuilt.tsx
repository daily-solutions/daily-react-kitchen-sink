import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import {
  DailyProvider,
  useCallFrame,
  useDaily,
  useParticipantCounts,
  useParticipantIds,
} from "@daily-co/daily-react";
import { DailyEventObject } from "@daily-co/daily-js";

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

  return <span>{participantCount.present} participants</span>;
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
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyIjoiZGVtbyIsIm8iOnRydWUsImVsYyI6dHJ1ZSwicCI6eyJjYSI6InQifSwiZCI6IjY4M2I4OWY0LWIxZmQtNGY5NC1iODQ1LWVmMjY2NmUzZTIxMyIsImlhdCI6MTc3NDU5NzUyOH0.RA5QVKYjjz1Tk970I7L_3YHUMcN89TfIipvAgEUHPOU",
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
