import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { BrandedPrebuilt } from "./BrandedPrebuilt";
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

// Branded URL demo: any path like /my-room joins that Daily room in Prebuilt
const roomName = decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, ""));

root.render(
  <StrictMode>
    {roomName ? (
      <BrandedPrebuilt roomName={roomName} />
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
