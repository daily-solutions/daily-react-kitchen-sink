import Daily from "@daily-co/daily-js";
import { DailyProvider } from "@daily-co/daily-react-hooks";
import DailyIframe, { DailyCallOptions } from "@daily-co/daily-js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

// Account & room settings
const dailyConfig: DailyCallOptions["dailyConfig"] = {
  experimentalChromeVideoMuteLightOff: true,
  useDevicePreferenceCookies: true,
  // micAudioMode: "speech",
  micAudioMode: "music",
};

const callObject = Daily.createCallObject({
  subscribeToTracksAutomatically: true,
  dailyConfig: {
    // micAudioMode: "speech",
    micAudioMode: "music",
  },
});

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <StrictMode>
    <DailyProvider callObject={callObject}>
      <App />
    </DailyProvider>
  </StrictMode>
);
