import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";
import { VbStackOverflowRepro } from "./VbStackOverflowRepro";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);

// Get the value from the url
const urlParams = new URLSearchParams(window.location.search);
const isPrebuilt = urlParams.get("prebuilt") ?? false;
// T-5417 repro mode: /?repro=t5417&room=<url>&auto=<trigger>
const isT5417Repro = urlParams.get("repro") === "t5417";
// &legacy=1 runs the older MediaPipe video processor instead of Banuba
const useLegacyVideoProcessor = urlParams.get("legacy") === "1";

root.render(
  <StrictMode>
    {isPrebuilt ? (
      <Prebuilt />
    ) : isT5417Repro ? (
      <DailyProvider dailyConfig={{ useLegacyVideoProcessor }}>
        <VbStackOverflowRepro />
      </DailyProvider>
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
