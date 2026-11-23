// The Home Screen app's frame (PNAV-1, 23 Nov 2026), and the one place where the phone layout reads and moves the
// page's scroll.
//
// The owner's iPhone, in the app added to its Home Screen: once the page had been scrolled, the tab bar (#pnav, fixed to
// the bottom) stood far above the screen's foot and the sticky heads had left the screen (after 549 px of scroll the
// bar's foot was 336 px up). Both fit iOS's layout viewport, the box fixed and sticky elements are placed against,
// lagging the document's scroll. Nothing in the page's code moves them, and Chromium places them right in every case
// (check/pnav/code.md); so the frame takes the document's scroll away and the layout viewport never has to follow it:
//   - html and body fill the window and do not scroll;
//   - the page (the header, the tab, the footer) scrolls inside #pscroll;
//   - the bar is no longer fixed: it is the last item of the column whose first item is #pscroll, at the frame's foot.
// Heights are 100% from html down, not vh: the initial containing block follows a rotation, and on iOS the on-screen
// keyboard does not resize it (while typing, the keyboard covers the bar, as it covers a native app's tab bar); vh
// units have had bugs of their own in Home Screen apps. Outside the frame #pscroll is `display: contents`, no box at
// all, so the page is laid out exactly as before: Safari's tab, the computer and the classic phone layout are not
// changed.
//
// When it is on: the phone layout (lib/phone.ts), in the Home Screen app (display-mode standalone, or Safari's own
// navigator.standalone), on the Monitor's page (not the sign-in screens), and, for this first release, for an account in
// the server's preview list (lib/paper.ts: the API's `me`, `paperPreview`). That word comes after the page is first
// drawn: the frame then takes over the reader's place in the page before the next paint, and gives it back to the
// window when it goes. The local copy and the checks' development servers stand in for such an account with
// `om_paper = "preview"`, as for the paper book's preview (web/e2e/phone-frame.cjs).
// To turn it on for everyone in the Home Screen app, once the owner has tried it: FRAME_FOR_EVERYONE = true.
import { useEffect, useState } from "react";
import { usePreviewAccount } from "./paper";

export const FRAME_FOR_EVERYONE = false;

const CLASS = "pframe", ID = "pscroll", STANDALONE = "(display-mode: standalone)";

/** Whether the frame is on now (the class on <html>, set by setFrame before the page is painted). */
export const frameOn = (): boolean => document.documentElement.classList.contains(CLASS);
/** The element the page scrolls in while the frame is on; null while the window scrolls. */
export const scroller = (): HTMLElement | null => (frameOn() ? document.getElementById(ID) : null);
/** How far the page is scrolled: the frame's scroll, or the window's. */
export const pageScroll = (): number => { const s = scroller(); return s ? s.scrollTop : window.scrollY; };
/** Scrolls the page to `y` at once: the frame, or the window. */
export function scrollToY(y: number): void { const s = scroller(); if (s) s.scrollTop = y; else window.scrollTo(0, y); }
/** The top and the foot of the part of the window the page is seen in (in the frame the bar below it is not). */
export const viewTop = (): number => scroller()?.getBoundingClientRect().top ?? 0;
export const viewBottom = (): number => scroller()?.getBoundingClientRect().bottom ?? window.innerHeight;
/** Where an element stands in the page's scroll: the `y` that scrollToY takes to bring its top to the view's top. */
export const pageY = (el: Element): number => el.getBoundingClientRect().top - viewTop() + pageScroll();

/** Opened from the Home Screen: display-mode standalone, or Safari's own flag. */
export const homeScreenApp = (): boolean => {
  try { return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia(STANDALONE).matches; } catch { return false; }
};

/** Whether the page should be drawn in the frame. `page`: the phone layout with the Monitor's page drawn. */
export function useFrame(page: boolean): boolean {
  const preview = usePreviewAccount();
  const [home, setHome] = useState(homeScreenApp);
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia(STANDALONE); } catch { return; }
    const f = () => setHome(homeScreenApp());
    mq.addEventListener?.("change", f);
    return () => mq?.removeEventListener?.("change", f);
  }, []);
  return page && home && (FRAME_FOR_EVERYONE || preview);
}

/** Turns the frame on or off (App's layout effect, before the page is painted). The reader's place in the page goes
 *  with it: from the window's scroll into the frame's, or back. */
export function setFrame(on: boolean): void {
  const root = document.documentElement, el = document.getElementById(ID);
  if (on === root.classList.contains(CLASS)) return;
  const y = on ? window.scrollY : el?.scrollTop ?? 0;
  root.classList.toggle(CLASS, on);
  if (on) { if (el) el.scrollTop = y; } else window.scrollTo(0, y);
}

/** The page does not scroll while a sheet is open (components/Sheet.tsx sets html and body itself, as before): in the
 *  frame that is #pscroll, which is given `overflow: hidden` while any sheet is open. Counted, so that sheets closed in
 *  any order leave it scrolling. Outside the frame the element is no box and the style does nothing. */
let locks = 0, kept = "";
export function lockScroll(): () => void {
  const el = document.getElementById(ID);
  if (!el) return () => undefined;
  if (locks++ === 0) { kept = el.style.overflow; el.style.overflow = "hidden"; }
  let done = false;
  return () => { if (done) return; done = true; if (--locks === 0) el.style.overflow = kept; };
}
