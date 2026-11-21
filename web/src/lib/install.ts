import { useEffect, useState } from "react";

/** Adding the Monitor to a phone's home screen (Shota, 18 Nov 2026). The site is the app: from the home screen it
 *  opens full screen (manifest.webmanifest, display "standalone") with the same data. Nothing can add it for the
 *  reader on an iPhone; the browser's Share menu does, so the hint gives the steps. Chrome, Edge and Samsung
 *  Internet may offer a one-tap install (the non-standard `beforeinstallprompt` event); when they do, the hint
 *  carries an Install button, and otherwise it names the browser's menu.
 *  Since 21 Nov 2026 (the designer's note on the phone's first MARKETS screen) the hint is one line on MARKETS, "Add
 *  Orrery to your Home Screen", and its words and steps open in a sheet from the bottom of the screen: from that line,
 *  or from the menu's ADD TO HOME SCREEN on any tab. The card it was stood 199 px between the data and the list. */
interface InstallOffer extends Event { prompt: () => Promise<unknown>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
const HIDE_KEY = "om_a2hs_hide", EVENT = "om:install";
let offer: InstallOffer | null = null;   // the browser's own install prompt, held until the reader asks for it
let added = false;                       // installed during this visit
let asked = false;                       // the sheet with the steps is open (from the line on MARKETS, or from the menu)
let hiddenNow: boolean | null = null;    // the choice for this visit when the browser will not store it
const emit = () => window.dispatchEvent(new Event(EVENT));
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); offer = e as InstallOffer; emit(); });
window.addEventListener("appinstalled", () => { offer = null; added = true; emit(); });

/** Already running from the home screen (or just installed): no hint. */
export const isInstalled = (): boolean => {
  try { return added || (navigator as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches; } catch { return added; }
};
const isIos = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent);
const hidden = (): boolean => { if (hiddenNow != null) return hiddenNow; try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };

/** The reader hid the line on MARKETS: it stays away on this browser; the steps stay in the menu. */
export function hideInstallHint(): void {
  try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* kept for this visit only */ }
  hiddenNow = true; asked = false; emit();
}
/** From the line on MARKETS, or from the menu: open the sheet with the steps. */
export function askInstallHint(): void { asked = true; emit(); }
/** The sheet was closed. */
export function closeInstallSheet(): void { if (asked) { asked = false; emit(); } }
/** Opens the browser's install prompt, when it offered one. Accepted: the hint goes. */
export async function runInstall(): Promise<void> {
  const o = offer;
  if (!o) return;
  offer = null;   // a prompt can be used once
  try { await o.prompt(); if ((await o.userChoice).outcome === "accepted") added = true; } catch { /* the browser withdrew the prompt */ }
  emit();
}

export interface InstallState { installed: boolean; ios: boolean; canPrompt: boolean; hidden: boolean; asked: boolean }
const read = (): InstallState => ({ installed: isInstalled(), ios: isIos(), canPrompt: offer != null, hidden: hidden(), asked });
export function useInstall(): InstallState {
  const [s, setS] = useState(read);
  useEffect(() => { const f = () => setS(read()); f(); window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); }, []);
  return s;
}
