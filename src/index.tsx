/** @format */

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
				// sendSettings={{
				// 	video: {
				// 		allowAdaptiveLayers: false,
				// 		encodings: {
				// 			low: {
				// 				maxBitrate: 50 * 1000,
				// 				scaleResolutionDownBy: 4,
				// 				maxFramerate: 10,
				// 			},
				// 		},
				// 	},
				// }}
				dailyConfig={{
					useDevicePreferenceCookies: true,
					// sendSettings: {
					// 	video: {
					// 		allowAdaptiveLayers: false,
					// 		encodings: {
					// 			low: {
					// 				maxBitrate: 50 * 1000,
					// 				scaleResolutionDownBy: 4,
					// 				maxFramerate: 10
					// 			}
					// 		}
					// 	}
					// },
				}}
			>
				<App />
			</DailyProvider>
		)}
	</StrictMode>
);
