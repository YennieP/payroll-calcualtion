import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { FontAuditPage } from "./fonts/FontAuditPage";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

const app = new URLSearchParams(globalThis.location.search).has("font-audit") ? (
  <FontAuditPage />
) : (
  <App />
);

createRoot(root).render(<StrictMode>{app}</StrictMode>);
