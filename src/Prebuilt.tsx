import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import { DailyProvider, useCallFrame } from "@daily-co/daily-react";

export const Prebuilt = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const callFrame = useCallFrame({
    // @ts-expect-error will be fixed in the next release
    parentElRef: wrapperRef,
    options: {
      url: "https://hush.daily.co/music-mode",
      dailyConfig: {
        // Sends a 256kbps stereo mic track instead of the speech-optimized
        // browser defaults. SFU mode only.
        micAudioMode: "music",
      },
      iframeStyle: {
        width: "100%",
        height: "80vh",
      },
    },
    shouldCreateInstance: useCallback(() => Boolean(wrapperRef.current), []),
  });

  useEffect(() => {
    if (!callFrame) return;

    // @ts-expect-error debugging
    window.callObject = callFrame;

    callFrame.join().catch((err) => {
      console.error("Error joining call", err);
    });
  }, [callFrame]);

  return (
    <DailyProvider callObject={callFrame}>
      <div ref={wrapperRef} />
    </DailyProvider>
  );
};
