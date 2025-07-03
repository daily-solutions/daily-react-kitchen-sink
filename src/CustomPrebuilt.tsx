import "./styles.css";
import { useCallback, useEffect, useRef } from "react";
import { DailyProvider, useCallFrame } from "@daily-co/daily-react";

export const Prebuilt = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const url = urlParams.get("url") ?? "https://hush.daily.co/demo";
  const token = urlParams.get("token") ?? "";
  const userName = urlParams.get("userName") ?? "Guest";
  const callRef =
    useRef<HTMLDivElement>() as React.MutableRefObject<HTMLDivElement>;

  const callFrame = useCallFrame({
    parentElRef: callRef,
    options: {
      iframeStyle: {
        width: "100vw",
        height: "100vh",
        border: "0",
      },
      url,
      token,
      userName,
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
    <div className="flex min-h-screen flex-col">
      <header>Example</header>
      <main className="flex max-w-screen-lg flex-grow flex-col">
        <div className="flex h-full flex-1 flex-col">
          {/* Video iframe */}
          <DailyProvider callObject={callFrame}>
            <div
              className="relative w-full flex-1"
              ref={callRef}
              data-testid="telehealth-call-container"
            />
          </DailyProvider>
        </div>
      </main>
    </div>
  );
};
