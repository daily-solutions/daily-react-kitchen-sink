/** @format */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";
import { rtcStats } from "./rtcStats";
const config = {
	test_id: crypto.randomUUID(),
	client_id: crypto.randomUUID(),
	//async: true,
};
rtcStats(config);

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
			>
				<App />
			</DailyProvider>
		)}
	</StrictMode>
);
