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
//   - Being tall enough is not all (B's B-33, 21 Nov 2026). A phone's WATCHLIST is first drawn without its names: its
//     sections alone are tall enough for the position to be reached at once, the hold ended there, and the names then
//     arrived above what was on screen, which the browser keeps in place by moving the page: the row that was tapped
//     stood 589 px above the screen. So the position is held for as long as the page says a list is still on its way
//     (an element marked `data-nav-wait`, which a view draws until its rows have come) and until the page has kept its
//     height for a moment after that; a move of the page that the reader did not make is put right meanwhile. A view
//     marks itself likewise while an answer of its own that draws above its list is on its way: WATCHLIST's line of
//     the markets that are shut is at its full length once the market table has come (it grew by 42 px above the row),
//     and a phone's MARKETS draws its morning note above the list (44 px). NEWS and EQUITIES do not mark theirs yet.
//   - A list's own state that sets its height (MARKETS' and RATES & FX's open row on a phone) is kept with its entry
//     (useEntryState), so Back finds the row open where it was.
// Nothing is stored: the keys' positions live in this page's memory. After a reload the browser's own restoring is
// all there is, as before.
// Which pages open at their top is the rule in lib/pagetop.ts, a file that imports nothing: the logic checks read it
// on GitHub, where React is not installed and this file, which imports it for useEntryState, cannot be loaded.
import { useCallback, useState } from "react";
import { opensAtTop, type NavRoute } from "./pagetop";

const KEY = "omNav", HOLD_MS = 5000, QUIET_MS = 300;
/** A view draws an element with this attribute until the answers that set the height above its list have come
 *  (WATCHLIST's names and the market table; a phone's MARKETS' morning note). */
export const NAV_WAIT = "data-nav-wait";
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

/** Keeps the page at `y` while it grows to reach it and while a list above is still on its way; stops once the page
 *  has stood there at an unchanged height for a moment with no list awaited, at the reader's first input, or after a
 *  few seconds. */
function hold(y: number): void {
  let done = false, quiet: ReturnType<typeof setTimeout> | undefined;
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
  const end = () => {
    if (done) return;
    done = true; ro?.disconnect(); clearTimeout(timer); clearTimeout(quiet);
    for (const e of INPUT) window.removeEventListener(e, end, true);
    window.removeEventListener("scroll", place, true);
    if (stopHold === end) stopHold = null;
  };
  const settled = () => {
    if (done) return;
    if (Math.abs(window.scrollY - y) > 1 || document.querySelector(`[${NAV_WAIT}]`)) { place(); return; }   // moved meanwhile, or a list still awaited
    end();
  };
  // called when the page is first drawn, whenever it changes height, and whenever it moves without the reader's doing
  // (the reader's own first touch, wheel or key has ended the hold before it moves anything)
  const place = () => {
    if (done) return;
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    clearTimeout(quiet);
    quiet = setTimeout(settled, QUIET_MS);
  };
  const timer = setTimeout(end, HOLD_MS);
  for (const e of INPUT) window.addEventListener(e, end, { capture: true, passive: true });
  window.addEventListener("scroll", place, { capture: true, passive: true });
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
