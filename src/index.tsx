import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";
import { PresencePage } from "./PresencePage";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);

// Get the value from the url
const urlParams = new URLSearchParams(window.location.search);
const isPrebuilt = urlParams.get("prebuilt") ?? false;
const isKitchenSink = urlParams.get("kitchensink") ?? false;

// The presence + webhooks page is the default. The full kitchen-sink App is at
// ?kitchensink=true, and Daily Prebuilt at ?prebuilt=true.
root.render(
  <StrictMode>
    {isPrebuilt ? (
      <Prebuilt />
    ) : isKitchenSink ? (
      <DailyProvider
        subscribeToTracksAutomatically={false}
        dailyConfig={{ useDevicePreferenceCookies: true }}
      >
        <App />
      </DailyProvider>
    ) : (
      <PresencePage />
    )}
  </StrictMode>
);
