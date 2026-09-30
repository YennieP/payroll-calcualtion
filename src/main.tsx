import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/App";
import "./styles/global.css";

registerSW({ immediate: false });

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
