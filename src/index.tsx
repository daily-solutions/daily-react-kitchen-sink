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
        dailyConfig={{ useDevicePreferenceCookies: true }}
        sendSettings={{
          video: {
            allowAdaptiveLayers: false,
            maxQuality: "low",
            encodings: {
              // motion-optimized settings
              // We changed maxFramerate to 25 (from the default of 30)
              // low: {
              //   maxBitrate: 2000000,
              //   scaleResolutionDownBy: 1,
              //   maxFramerate: 25,
              // },
              // motion-and-detail-balanced settings (default for screen share)
              // low: {
              //   maxBitrate: 1200000,
              //   scaleResolutionDownBy: 1,
              //   maxFramerate: 15,
              // },
              // detail-optimized settings
              // If you want to optimize for SLIDES, use these settings instead
              low: {
                maxBitrate: 700000,
                scaleResolutionDownBy: 1,
                maxFramerate: 5,
              },
            },
          },
        }}
      >
        <App />
      </DailyProvider>
    )}
  </StrictMode>
);
