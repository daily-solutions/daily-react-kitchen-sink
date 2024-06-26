import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import {
  DailyProvider,
  useCallFrame,
  useDaily,
  useParticipantCounts,
} from "@daily-co/daily-react";

const App = () => {
  const callObject = useDaily();

  // @ts-expect-error debugging
  window.callObject = callObject;

  const participantCount = useParticipantCounts();

  return (
    <>
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
