// Where a page opens, and where Back returns (B's B-28, 20 Nov 2026).
//
// The Monitor's pages are addresses after the "#". A name in a list (MARKETS, RATES & FX, WATCHLIST, EQUITIES, a
// headline's company, the alerts, search) sets the address, and the browser keeps the list's scroll position for the
// page it opens: on a phone USD/JPY's page opened 1,288 px down, its name off the screen, and gold's 1,763 px down
// (B's verdict on round 2b). Each history entry the Monitor makes is stamped with a key in history.state, which the
// browser keeps per entry and hands back on Back and Forward. A change of address that lands on an entry without a
// key is a new page; one with a key is a return to a page seen before.
//   - A new page of a name (#asset/…), or of an index on EQUITIES opened from another tab, starts at its top.
//   - Back to the page it was opened from returns to where that page stood when it was left. The browser restores
//     the position as well, but only as far as the page is tall at that moment, and a list drawn from an answer that
//     has not come yet is short (the live site; the local copy answers at once). So the position is held until the
//     page is tall enough, for a few seconds at most, and given up at the reader's first touch, wheel or key.
//   - A list's own state that sets its height (MARKETS' and RATES & FX's open row on a phone) is kept with its entry
//     (useEntryState), so Back finds the row open where it was.
// Nothing is stored: the keys' positions live in this page's memory. After a reload the browser's own restoring is
// all there is, as before.
import { useCallback, useState } from "react";

export interface NavRoute { view: string; sub: string }

/** Whether a new page opens at its top: a name's page (another name than the one on screen), or an index's page on
 *  EQUITIES opened from another tab. The tabs themselves keep what they do (on a phone the bottom bar goes to the top
 *  itself), and a piece of RESEARCH places itself. */
export function opensAtTop(from: NavRoute | null, to: NavRoute): boolean {
  if (to.view === "asset") return !!to.sub && !(from?.view === "asset" && from.sub === to.sub);
  if (to.view === "equities") return !!to.sub && !!from && from.view !== "equities";
  return false;
}

const KEY = "omNav", HOLD_MS = 5000;
const INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
let current: string | null = null;           // the key of the entry on screen
let shown: NavRoute | null = null;            // its address, read
let shownHash = "";                           // and as written
let pending: { top: true } | { y: number } | null = null;
const leftAt = new Map<string, number>();     // where an entry stood when a page was opened from it
const entryUi = new Map<string, Record<string, unknown>>();
let stopHold: (() => void) | null = null;

function keyOf(): string | null {
  try { const s = history.state as Record<string, unknown> | null; return s && typeof s === "object" && typeof s[KEY] === "string" ? (s[KEY] as string) : null; } catch { return null; }
}
function stamp(): string {
  const k = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  try { const s = history.state as Record<string, unknown> | null; history.replaceState({ ...(s && typeof s === "object" ? s : {}), [KEY]: k }, ""); } catch { /* the entry stays unmarked: Back is then the browser's alone */ }
  return k;
}

/** Once, before the first page is drawn: the entry the Monitor opens on gets its key (a reload keeps the one it had). */
export function navStart(route: NavRoute): void { if (!current) current = keyOf() ?? stamp(); shown = route; shownHash = location.hash; }

/** On every change of address, before the new page is drawn. */
export function navChanged(route: NavRoute): void {
  stopHold?.();
  const k = keyOf();
  if (k == null) {   // a new entry: a link, a name in a list, search, a tab
    const top = opensAtTop(shown, route);
    if (current) { if (top) leftAt.set(current, window.scrollY); else leftAt.delete(current); }
    current = stamp();
    pending = top ? { top: true } : null;
  } else {           // Back or Forward to a page seen before
    current = k;
    const y = leftAt.get(k);
    leftAt.delete(k);
    pending = y != null ? { y } : null;
  }
  shown = route; shownHash = location.hash;
}

/** On popstate. Without a change of address (no hashchange follows) and without a key, it is a new entry of the page
 *  on screen: the same address entered again. It gets its key, and the list's kept state goes with it. */
export function navPopped(): void {
  if (keyOf() != null || location.hash !== shownHash) return;   // Back or Forward, or a new address (its hashchange follows)
  const was = current;
  current = stamp();
  if (was) { leftAt.delete(was); const ui = entryUi.get(was); if (ui) entryUi.set(current, { ...ui }); }
}

/** Once the new page is drawn (App's layout effect, before it is painted): to its top, or back where it stood. */
export function navDrawn(): void {
  const p = pending;
  pending = null;
  if (!p) return;
  if ("top" in p) window.scrollTo(0, 0);
  else hold(p.y);
}

/** Keeps the page at `y` while it grows to reach it; stops once there, at the reader's first input, or after a few
 *  seconds. */
function hold(y: number): void {
  let done = false;
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
  const end = () => {
    if (done) return;
    done = true; ro?.disconnect(); clearTimeout(timer);
    for (const e of INPUT) window.removeEventListener(e, end, true);
    if (stopHold === end) stopHold = null;
  };
  const place = () => {
    if (done) return;
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) <= 1) end();
  };
  const timer = setTimeout(end, HOLD_MS);
  for (const e of INPUT) window.addEventListener(e, end, { capture: true, passive: true });
  ro?.observe(document.body);
  stopHold = end;
  place();
}

/** A list's state kept with its history entry: Back finds it as it was left (MARKETS' open row and its period); a
 *  fresh visit starts from `initial`. In this page's memory only. */
export function useEntryState<T>(name: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { const m = current ? entryUi.get(current) : undefined; return m && name in m ? (m[name] as T) : initial; });
  // written to the entry on screen when it changes (the reader's own choice, so always on the page in view)
  const set = useCallback((x: T) => { setV(x); if (current) entryUi.set(current, { ...(entryUi.get(current) ?? {}), [name]: x }); }, [name]);
  return [v, set];
}
