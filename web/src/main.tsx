import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import App from "./App";
import { Opening } from "./components/Opening";
import { startOffline } from "./lib/offline";

startOffline();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Opening />
  </StrictMode>,
);
