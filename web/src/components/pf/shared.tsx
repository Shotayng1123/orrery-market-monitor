// Small pieces every screen of the paper portfolio shares (P-1): going to an address, the BY tag with its card, the
// PAPER mark, the line that says a thing was done, and one field as the form, the change form and the targets' re-set
// draw it.
import { useEffect, useId, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { zoomNow } from "../../lib/prefs";
import { Sheet, sheetsSettled } from "../Sheet";
import { ONLY_YOU, ONLY_YOU_TIP, PAPER_TIP, PAPER_WORD } from "../../lib/labels";
import type { Field } from "../../lib/pf/types.ts";
import "../../styles/pf.css";

/** Opens an address of the tab: "", "all", "new/ar-macro", "<id>", "<id>/settings/limits". */
// A page opened by what a sheet has just confirmed (a phone's statement, then the new book) waits until the sheet's
// own step back in the browser's history is done: set a moment earlier, the address would be the one stepped out of.
export const go = (sub = ""): void => { void sheetsSettled().then(() => { location.hash = sub ? `portfolio/${sub}` : "portfolio"; }); };
export const href = (sub = ""): string => (sub ? `#portfolio/${sub}` : "#portfolio");
const LAST = "om_pf_last";
/** The book last opened on this device: what the tab opens on. Its id only, never its name. */
export const lastBook = (): string | null => { try { return localStorage.getItem(LAST); } catch { return null; } };
export const setLastBook = (id: string | null): void => { try { if (id) localStorage.setItem(LAST, id); else localStorage.removeItem(LAST); } catch { /* not kept */ } };

// ---- a book just created (the designer's B.2 lead 6): its Overview lights the BOOK card's "created" line for six
// seconds and says it in a status the eye does not see; nothing is drawn over the page ----
let made: { id: string; name: string; at: number } | null = null;
export const markCreated = (id: string, name: string): void => { made = { id, name, at: Date.now() }; };
/** Whether a book was created in this page less than six seconds ago, and its name. */
export const justCreated = (id: string): { name: string; left: number } | null => (made && made.id === id && Date.now() - made.at < 6000 ? { name: made.name, left: 6000 - (Date.now() - made.at) } : null);

// ---- the line at the foot that says a thing was done ("Paper portfolio deleted · …"), for six seconds ----
let flashText: string | null = null, flashTimer: ReturnType<typeof setTimeout> | undefined;
const flashSubs = new Set<() => void>();
export function flash(text: string): void {
  flashText = text; flashSubs.forEach((f) => f());
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashText = null; flashSubs.forEach((f) => f()); }, 6000);
}
export function Flash() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); flashSubs.add(f); return () => { flashSubs.delete(f); }; }, []);
  return flashText ? <div className="pf-flash" role="status">{flashText}</div> : null;
}

/** Where a card that stays in view while its page scrolls may stand: under the header when the header stays at the
 *  top of the window (the scrolling layout), at the top of the scrolling page otherwise (the one-screen layout, where
 *  the header is not part of what scrolls). Written to `--pf-top` on the element, in the page's own px (the text size
 *  works by zoom: the screen's px ÷ the zoom), and kept right when the header changes height. */
export function useHeaderTop(el: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const box = el.current, bar = document.getElementById("topbar");
    if (!box || !bar) return;
    const set = () => { const stuck = getComputedStyle(bar).position === "sticky"; box.style.setProperty("--pf-top", `${stuck ? Math.ceil(bar.getBoundingClientRect().height / zoomNow()) + 8 : 0}px`); };
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(bar);
    window.addEventListener("resize", set);
    return () => { ro?.disconnect(); window.removeEventListener("resize", set); };
  }, [el]);
}

/** PAPER and "only you", beside every portfolio's name. On a phone a tap opens the same words in a sheet. */
export function PaperMark({ phone = false, only = true }: { phone?: boolean; only?: boolean }) {
  const [open, setOpen] = useState(false);
  if (phone) return (
    <>
      <button type="button" className="pf-tap" id="pf-paper" onClick={() => setOpen(true)} aria-label={`${PAPER_WORD}: what it means`}><span className="pf-paper">{PAPER_WORD}</span></button>
      {open && <Sheet title={PAPER_WORD} onClose={() => setOpen(false)}><p className="pf-sheet-p">{PAPER_TIP}</p><p className="pf-sheet-p">{ONLY_YOU}: {ONLY_YOU_TIP.charAt(0).toLowerCase()}{ONLY_YOU_TIP.slice(1)}.</p></Sheet>}
    </>
  );
  return <><span className="pf-paper" title={PAPER_TIP}>{PAPER_WORD}</span>{only && <> · <span title={ONLY_YOU_TIP}>{ONLY_YOU}</span></>}</>;
}

/** Whose a value is: a small tag ("PM A", "Owner", "C · R-32", "you"); its card holds the basis. On a computer the
 *  card is the tag's tooltip and a click pins it under the tag; on a phone a tap opens it in a sheet. */
export function ByTag({ tag, card, phone = false }: { tag: string; card: string; phone?: boolean }) {
  const [open, setOpen] = useState(false);
  if (phone) return (
    <>
      <button type="button" className="pf-tap by" onClick={() => setOpen(true)} aria-label={`By ${tag}: the basis`}><span className="pf-by">{tag}</span></button>
      {open && <Sheet title="Whose it is" onClose={() => setOpen(false)}><p className="pf-sheet-p">{card}</p></Sheet>}
    </>
  );
  return (
    <span className="pf-bywrap">
      <button type="button" className="pf-by" title={card} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{tag}</button>
      {open && <span className="pf-bycard" role="note">{card}</span>}
    </span>
  );
}

/** The amber A of an assumption (never a PM's letter). */
export const Assumed = () => <sup className="pf-a" title="An assumption: a value this portfolio sets because no free source gives it">A</sup>;

/** One typed setting: what stands before the input, the input, its unit, and under it its refusal. */
export function NumInput({ field, value, onChange, onBlur, refusal, phone = false, id, wide = false, autoFocus = false }: { field: Field; value: string; onChange: (v: string) => void; onBlur?: () => void; refusal?: string | null; phone?: boolean; id?: string; wide?: boolean; autoFocus?: boolean }) {
  const own = useId(), key = id ?? `pf-${field.key}-${own}`, n = field.num;
  return (
    <span className={`pf-num${refusal ? " bad" : ""}${phone ? " ph" : ""}`}>
      <span className="pf-in">
        {n?.pre && <span className="pre">{n.pre}</span>}
        <input id={key} data-key={field.key} className={wide ? "wide" : undefined} type="text" inputMode={n ? (n.signed ? "text" : "decimal") : "text"} autoComplete="off" spellCheck={false} value={value} aria-label={field.label} aria-invalid={refusal ? true : undefined} aria-describedby={refusal ? `${key}-no` : undefined}
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} autoFocus={autoFocus} />
        {n?.unit && <span className="unit">{n.unit}</span>}
      </span>
      {n?.note && <span className="pf-unitnote">{n.note}</span>}
      {refusal && <span className="pf-no" id={`${key}-no`} role="alert">{refusal}</span>}
    </span>
  );
}

/** A choice as chips (the base currency, a yes or no). */
export function Chips({ field, value, onChange, phone = false }: { field: Field; value: string; onChange: (v: string) => void; phone?: boolean }) {
  return (
    <span className={`pf-chips${phone ? " ph" : ""}`} role="radiogroup" aria-label={field.label}>
      {(field.choices?.options ?? []).filter((o) => !o.off).map((o) => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} data-value={o.value} className={`pf-chip${o.value === value ? " on" : ""}`} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </span>
  );
}

/** A muted line that wraps and is never cut. */
export const Muted = ({ children, id, cls = "" }: { children: ReactNode; id?: string; cls?: string }) => <p className={`pf-mut ${cls}`.trim()} id={id}>{children}</p>;
