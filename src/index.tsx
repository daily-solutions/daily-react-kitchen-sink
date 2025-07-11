import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Prebuilt } from "./CustomPrebuilt";
import { DailyProvider } from "@daily-co/daily-react";
import App from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("No root element found");
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <Prebuilt />
  </StrictMode>
);
