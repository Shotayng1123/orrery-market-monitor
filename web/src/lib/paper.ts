// The page's switch for the paper portfolio (P-1, 21 Nov 2026), and its preview (slice 9, 23 Nov 2026).
//
// P-1 to P-4a go live together: a paper book whose limits and ladder are not yet enforced would start a record under
// rules that change midway. Until P-4a is accepted the switch stays off, and the page is in one of three states:
//   "off"      every account, and anyone signed out: the page as published before, six tabs, no PORTFOLIO tab, no item
//              in the phone's bar, no key 7, "#portfolio" opens MARKETS as any unknown address does, and the file of the
//              paper book's screens is never asked for
//   "preview"  the owner's of 23 Nov 2026 ("Yeah just turn on for me for now and you can keep refining them"): the
//              server says this signed-in account is in its preview list (the API's `me`, `paperPreview`; the list is
//              the server's secret PF_PREVIEW_EMAILS). The seventh tab, its screens, and on every one of them a line
//              that says it is a preview (components/pf/Preview.tsx)
//   "on"       the switch turned (PAPER_ON_LIVE_SITE below): every account, with no such line
// Every build carries the screens as a file of their own (views/Portfolio.tsx), asked for only when the tab is opened
// in the state "preview" or "on". A server of before slice 9 sends no `paperPreview`: the page is then "off".
//
// To turn the paper book on: set PAPER_ON_LIVE_SITE to true here, and PAPER_ON_SERVER to true in
// supabase/functions/_shared/pf/switch.ts, in the same pull request (README.md, "The paper portfolio's two
// switches"). web/e2e/local-copy.cjs checks the built site in each state.
//
// The local copy and the checks' stand-in servers (development servers) are "on", but for `om_paper` in the browser's
// storage: "0" draws the page as published for an account outside the list ("off"), "preview" as published for one in
// it ("preview"), so that a check can set them side by side.
import { useSyncExternalStore } from "react";

export const PAPER_ON_LIVE_SITE = false;

export type PaperState = "off" | "preview" | "on";

// what the server said of the account signed in here; reset when the sign-in changes (App.tsx)
let serverPreview = false;
const subs = new Set<() => void>();
/** The API's `me` answer's `paperPreview`, as the page received it: true only when the server says so in so many words. */
export function setServerPreview(answer: unknown): void {
  const v = answer === true;
  if (v === serverPreview) return;
  serverPreview = v;
  subs.forEach((f) => f());
}

function devState(): PaperState {
  let v: string | null = null;
  try { v = localStorage.getItem("om_paper"); } catch { /* storage blocked: as the local copy draws it */ }
  return v === "0" ? "off" : v === "preview" ? "preview" : "on";
}
/** The state the page is in now. */
export function paperState(): PaperState {
  if (import.meta.env.DEV) return devState();
  return PAPER_ON_LIVE_SITE ? "on" : serverPreview ? "preview" : "off";
}
/** Whether the paper book is drawn: the seventh tab, its bar item, key 7, its address and its part of Help. */
export const paperShown = (): boolean => paperState() !== "off";
const subscribe = (f: () => void): (() => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** The state, for a component that draws by it: it is drawn again when the server's word arrives or changes. */
export const usePaper = (): PaperState => useSyncExternalStore(subscribe, paperState, paperState);
/** Whether this account is in the server's preview list, whatever the switch says: the Home Screen app's frame is
 *  tried by these accounts first (lib/scroller.ts). The local copy stands in for one with `om_paper = "preview"`. */
export const previewAccount = (): boolean => serverPreview || (import.meta.env.DEV && devState() === "preview");
export const usePreviewAccount = (): boolean => useSyncExternalStore(subscribe, previewAccount, previewAccount);
