/** @format */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";

import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// expose PIXI to window so that this plugin is able to
// reference window.PIXI.Ticker to automatically update Live2D models
// @ts-expect-error PIXI is not normally on the window object
window.PIXI = PIXI;

async function initializeLive2D() {
	console.log("Initialised Live2D");
	const root = document.getElementById("root");
	if (!root) {
		throw new Error("No root element found");
	}

	let view = document.getElementById("canvas") as HTMLCanvasElement;
	if (!view) {
		view = document.createElement("canvas");
		view.id = "canvas";
		root.appendChild(view);
	}

	const app = new PIXI.Application({
		view,
		autoStart: true,
		resizeTo: window,
		backgroundColor: 0x333333,
	});

	try {
		const model = await Live2DModel.from(
			"src/assets/Shizuku/shizuku.model.json"
		);
		console.log("Model loaded");
		app.stage.addChild(model);

		// Calculate appropriate scales and positions
		const scaleFactor = Math.min(
			innerWidth / 3 / model.width,
			innerHeight / 2 / model.height
		);

		model.scale.set(scaleFactor, scaleFactor);

		model.x = innerWidth * 0.25 - (model.width * scaleFactor) / 2;
		model.y = innerHeight * 0.5 - (model.height * scaleFactor) / 2;

		// Enable dragging for the model
		draggable(model);
		console.log("Model draggable");

		// Handle interaction
		model.on("hit", (hitAreas: any) => {
			if (hitAreas.includes("body")) {
				model.motion("tap_body");
			}
			if (hitAreas.includes("head")) {
				model.expression();
			}
		});
	} catch (error) {
		console.error("Error loading model:", error);
	}
}
console.log("Before initialize live 2d");
initializeLive2D();

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

function draggable(model: any) {
	model.buttonMode = true;
	model.on("pointerdown", (e: any) => {
		model.dragging = true;
		model._pointerX = e.data.global.x - model.x;
		model._pointerY = e.data.global.y - model.y;
	});
	model.on("pointermove", (e: any) => {
		if (model.dragging) {
			model.position.x = e.data.global.x - model._pointerX;
			model.position.y = e.data.global.y - model._pointerY;
		}
	});
	model.on("pointerupoutside", () => (model.dragging = false));
	model.on("pointerup", () => (model.dragging = false));
}
