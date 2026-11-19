import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import App from "./App";
import { Opening, openingNow } from "./components/Opening";
import { startOffline } from "./lib/offline";

startOffline();
// decided before anything is drawn: while the opening plays, the Monitor's answers are held (lib/hold.ts)
const play = openingNow();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Opening play={play} />
  </StrictMode>,
);
