import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { LiveStreamBroadcaster } from "./LiveStreamBroadcaster";
import { LiveStreamViewer } from "./LiveStreamViewer";
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
const isLivestream = urlParams.get("livestream") ?? false;
const isViewer = urlParams.get("viewer") ?? false;

root.render(
  <StrictMode>
    {isViewer ? (
      <LiveStreamViewer />
    ) : isLivestream ? (
      <LiveStreamBroadcaster />
    ) : isPrebuilt ? (
      <Prebuilt />
    ) : (
      <DailyProvider
        subscribeToTracksAutomatically={false}
        dailyConfig={{ useDevicePreferenceCookies: true }}
      >
        <App />
      </DailyProvider>
    )}
  </StrictMode>
);
