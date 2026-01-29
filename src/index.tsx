import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);

// Get the value from the url
const urlParams = new URLSearchParams(window.location.search);
const isPrebuilt = urlParams.get("prebuilt") ?? false;

root.render(
  <StrictMode>
    {isPrebuilt ? (
      <Prebuilt />
    ) : (
      <DailyProvider
        subscribeToTracksAutomatically={false}
        dailyConfig={{
          useDevicePreferenceCookies: true,
          micAudioMode: {
            bitrate: 64_000, // 64kbps, default is 32kbps you can also try 96_000 or 128_000 but 128_000 is probably overkill
          },
        }}
      >
        <App />
      </DailyProvider>
    )}
  </StrictMode>
);
