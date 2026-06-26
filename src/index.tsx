import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { RemoveParticipantDemo } from "./RemoveParticipantDemo";
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
const demo = urlParams.get("demo");

root.render(
  <StrictMode>
    {demo === "remove-participant" ? (
      <RemoveParticipantDemo />
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
