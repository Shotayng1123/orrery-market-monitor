// Display preferences: text size (AUTO or S/M/L/XL), COMPACT terminal layout, FULL screen. Persisted per browser.
// AUTO (the default) scales the whole interface to the window, so the same layout fills a laptop, a desktop
// monitor or a wall screen without overlapping text or unused space. S/M/L/XL fix the scale by hand.
export const SIZES = [{ k: "AUTO", z: 0 }, { k: "S", z: 0.85 }, { k: "M", z: 1 }, { k: "L", z: 1.15 }, { k: "XL", z: 1.35 }] as const;
export type SizeKey = (typeof SIZES)[number]["k"];

export interface Prefs { size: SizeKey; compact: boolean }
const KEY = "om_prefs";
const VERSION = 2;   // 2: AUTO size introduced; stored sizes from version 1 are reset to AUTO once

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs> & { v?: number };
    const size = p.v === VERSION && SIZES.some((s) => s.k === p.size) ? p.size! : "AUTO";
    return { size, compact: p.compact ?? false };
  } catch { return { size: "AUTO", compact: false }; }
}
export function savePrefs(p: Prefs): void { try { localStorage.setItem(KEY, JSON.stringify({ ...p, v: VERSION })); } catch { /* ignore */ } }

// The COMPACT one-screen layout is drawn for a 1440 x 800 window and scaled from there. Below TERM_MIN the
// window is too small for one screen per tab, and COMPACT falls back to the dense scrolling layout.
const REF_W = 1440, REF_H = 800, TERM_MIN_W = 1100, TERM_MIN_H = 540;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;
/** The one-screen header is one row by rule (the designer's notes of 22 Nov 2026, Part A): its items have their widths
 *  by rule and only the alert line takes what is left, with a margin of 102 px over the line's longest promise in
 *  both letter placements. That holds where the page's own layout (the window's width over the zoom) is at least
 *  1,300 CSS px wide: a window of 1,170 px at AUTO, 1,105 at S, 1,300 at M, 1,495 at L, 1,755 at XL. Below it COMPACT
 *  keeps the scrolling layout. Under 1,420 the Monitor's name shows its mark only (body.tight; the mark's tooltip
 *  says the name). */
export const TERM_MIN_LAYOUT_W = 1300, NAME_FROM_W = 1420;

export function termFits(): boolean { return window.innerWidth >= TERM_MIN_W && window.innerHeight >= TERM_MIN_H; }

// The alert line's fit, last step (components/Alerts.tsx; the designer's A.2.5): in a drawing so much wider than the
// Monitor's own that even "NEW ALERT 07:07" (or "no excessive moves"), or the row's fixed items alone, cannot stand whole,
// the one-screen layout is refused for this window size and text size, and COMPACT gives the scrolling layout. Kept
// for the page's life; another size tries again. App's resize handler applies the prefs again at once.
const refused = new Set<string>();
let termKey = "";
export function refuseTerm(): void { if (termKey && !refused.has(termKey)) { refused.add(termKey); window.dispatchEvent(new Event("resize")); } }

/** The scale for the current window. COMPACT fits both dimensions; the scrolling layout follows the width only. */
export function autoZoom(term: boolean): number {
  const w = window.innerWidth, h = window.innerHeight;
  if (term) return clamp(Math.min(w / REF_W, h / REF_H), 0.9, 3)   // never under 9.5px type: smaller windows scroll inside panels;
  if (w <= 720) return 0.88;                      // phones: a little smaller than the base size (Shota, 15 Nov), so more fits on the screen
  return clamp(w / 1500, 0.9, 1.8);
}

/** Applies the prefs to <body>: zoom via the CSS `zoom` property plus --z, and the density classes.
 *  Returns whether the one-screen layout is on, so the caller can re-render when it changes.
 *  `phoneApp` is the phone preview (lib/phone.ts): the page is drawn at its true size, since that layout is made
 *  for a phone and has nothing to shrink, and <body> carries the class `pv2`. */
export function applyPrefs(p: Prefs, full: boolean, phoneApp = false): boolean {
  const fixed = SIZES.find((s) => s.k === p.size)?.z ?? 0;
  // the one-screen layout's own zoom first: it is offered only where its layout is at least TERM_MIN_LAYOUT_W wide
  const zt = round3(fixed || autoZoom(true));
  termKey = `${window.innerWidth}x${window.innerHeight}|${p.size}`;
  const term = !phoneApp && p.compact && termFits() && window.innerWidth / zt >= TERM_MIN_LAYOUT_W && !refused.has(termKey);
  const z = phoneApp ? 1 : round3(fixed || autoZoom(term));
  const b = document.body;
  b.style.setProperty("--z", String(z));
  (b.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
  b.classList.toggle("cmp", p.compact);
  b.classList.toggle("term", term);
  b.classList.toggle("tight", term && window.innerWidth / z < NAME_FROM_W);
  b.classList.toggle("full", full && term);
  b.classList.toggle("pv2", phoneApp);
  return term;
}

/** Why COMPACT, on, draws the scrolling layout in a window of at least 1,100 x 540 (its chip's tooltip, A.6.6):
 *  "narrow", its layout would be under TERM_MIN_LAYOUT_W; "refused", the alert line's fit refused it for this window
 *  and text size; "" when the one-screen layout is drawn, or COMPACT is off, or the window is smaller, or a phone. */
export function termWhy(p: Prefs, phoneApp = false): "" | "narrow" | "refused" {
  if (phoneApp || !p.compact || !termFits() || document.body.classList.contains("term")) return "";
  const fixed = SIZES.find((s) => s.k === p.size)?.z ?? 0;
  if (window.innerWidth / round3(fixed || autoZoom(true)) < TERM_MIN_LAYOUT_W) return "narrow";
  return refused.has(`${window.innerWidth}x${window.innerHeight}|${p.size}`) ? "refused" : "";
}

/** Current zoom factor (pointer coordinates are in visual pixels, layout in zoomed CSS pixels). */
export const zoomNow = (): number => Number(document.body.style.getPropertyValue("--z")) || 1;
export const termMode = (): boolean => document.body.classList.contains("term");
