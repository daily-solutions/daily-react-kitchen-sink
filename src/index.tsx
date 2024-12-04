import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./Prebuilt";
import { NewWindow } from "./newWindow";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);

// Get the value from the url
const urlParams = new URLSearchParams(window.location.search);
const isPrebuilt = urlParams.get("prebuilt") ?? false;

root.render(
  <StrictMode>{isPrebuilt ? <Prebuilt /> : <NewWindow />}</StrictMode>
);
