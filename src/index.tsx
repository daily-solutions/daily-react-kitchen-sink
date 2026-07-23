import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";
import { VcsLivestreamDemo } from "./VcsLivestreamDemo";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);

// Routing:
//   default  -> VcsLivestreamDemo (the T-2904 happy-path livestream demo)
//   ?app     -> the kitchen-sink App
//   ?prebuilt -> the Prebuilt embed
const urlParams = new URLSearchParams(window.location.search);
const isPrebuilt = urlParams.has("prebuilt");
const isApp = urlParams.has("app");

root.render(
  <StrictMode>
    {isPrebuilt ? (
      <Prebuilt />
    ) : isApp ? (
      <DailyProvider
        subscribeToTracksAutomatically={false}
        dailyConfig={{ useDevicePreferenceCookies: true }}
      >
        <App />
      </DailyProvider>
    ) : (
      <VcsLivestreamDemo />
    )}
  </StrictMode>
);
