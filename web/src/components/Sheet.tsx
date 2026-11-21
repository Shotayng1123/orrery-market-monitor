import { useEffect, useId, useRef, type ReactNode } from "react";

// The bottom sheet of the phone layout (the designer's note of 21 Nov 2026 on the phone's first MARKETS screen, and
// D/p1-design.md §9: built for the install line's steps, used again by the paper portfolio's statement and pickers).
// A panel fixed to the bottom edge, as wide as the screen and at most 80% of its height, over a dimmed page that does
// not scroll while it is open. Its head holds the title and ✕ (44 × 44 px); its body scrolls inside. It closes on ✕,
// on a tap on the dimmed page (unless `modal`), on Esc and on Back: it adds no address of its own, so Back closes it
// and stays on the page. Focus moves into it, stays inside it, and returns to what opened it.

// Back closes a sheet: opening one adds an entry of the same address to the browser's history, and leaving that entry
// closes the sheet. The entry is kept in one place for every sheet on the page, and taken away a moment after the
// last one has gone: a sheet that is drawn, removed and drawn again at once (React's development mode does this to
// every component) keeps the one entry instead of adding a second and stepping back out of it.
const MARK = "omSheet";
let openSheets = 0, entry = false;
const marked = (): boolean => { try { const s = history.state as Record<string, unknown> | null; return !!s && typeof s === "object" && s[MARK] === true; } catch { return false; } };
function sheetShown(): void {
  openSheets++;
  if (entry) return;
  try { const s = history.state as Record<string, unknown> | null; history.pushState({ ...(s && typeof s === "object" ? s : {}), [MARK]: true }, ""); entry = true; } catch { /* no history: Back leaves the page, as before */ }
}
// Stepping out of the sheet's entry is not done at once: the browser goes back a moment after it is asked. An address
// set in that moment (a page opened by what the sheet has just confirmed: the paper portfolio a statement's CONTINUE
// creates) would be the entry that is stepped out of, and the reader would land back on the page under the sheet.
// `sheetsSettled()` is the moment after: whoever opens a page right after a sheet closes waits for it.
let settling: Promise<void> | null = null;
function sheetGone(): void {
  openSheets = Math.max(0, openSheets - 1);
  let done: () => void = () => undefined;
  const mine = new Promise<void>((res) => { done = res; });
  settling = mine;
  const settled = () => { if (settling === mine) settling = null; done(); };
  setTimeout(() => {
    if (openSheets === 0 && entry) {
      entry = false;
      if (marked()) {
        // the browser says when it has stepped out (popstate); if it never does, the wait ends by itself
        const popped = () => { window.removeEventListener("popstate", popped); clearTimeout(giveUp); settled(); };
        const giveUp = setTimeout(popped, 500);
        window.addEventListener("popstate", popped);
        try { history.back(); return; } catch { popped(); return; }
      }
    }
    settled();
  }, 0);
}
/** Resolves once no sheet's history entry is being stepped out of: at once when none is. */
export const sheetsSettled = (): Promise<void> => settling ?? Promise.resolve();

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** `title`: the sheet's head. `onClose`: asked for by ✕, Esc, Back and a tap outside. `modal`: a tap outside does not
 *  close it (a statement that must be answered). `id`: the panel's, for the checks. */
export function Sheet({ title, onClose, children, id, modal = false }: { title: ReactNode; onClose: () => void; children: ReactNode; id?: string; modal?: boolean }) {
  const panel = useRef<HTMLDivElement>(null), label = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    // the page behind does not scroll while the sheet is open
    const root = document.documentElement, was = { root: root.style.overflow, body: document.body.style.overflow };
    root.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    sheetShown();
    el?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); return; }
      if (e.key !== "Tab" || !el) return;
      // focus stays inside the sheet: Tab from its last control goes to its first, Shift+Tab from its first to its last
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); el.focus({ preventScroll: true }); return; }
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || at === el || !el.contains(at))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !el.contains(at))) { e.preventDefault(); first.focus(); }
    };
    const pop = () => { if (!marked()) { entry = false; close.current(); } };   // Back: the sheet's entry was left
    document.addEventListener("keydown", key, true);
    window.addEventListener("popstate", pop);
    return () => {
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("popstate", pop);
      root.style.overflow = was.root; document.body.style.overflow = was.body;
      sheetGone();
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="sheet-bg" onClick={(e) => { if (!modal && e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" id={id} ref={panel} role="dialog" aria-modal="true" aria-labelledby={label} tabIndex={-1}>
        <div className="sheet-head"><span className="t" id={label}>{title}</span><button type="button" className="x" aria-label="Close" onClick={onClose}>&times;</button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
