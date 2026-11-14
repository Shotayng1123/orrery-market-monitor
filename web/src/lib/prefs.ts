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

export function termFits(): boolean { return window.innerWidth >= TERM_MIN_W && window.innerHeight >= TERM_MIN_H; }

/** The scale for the current window. COMPACT fits both dimensions; the scrolling layout follows the width only. */
export function autoZoom(term: boolean): number {
  const w = window.innerWidth, h = window.innerHeight;
  if (term) return clamp(Math.min(w / REF_W, h / REF_H), 0.9, 3)   // never under 9.5px type: smaller windows scroll inside panels;
  if (w <= 720) return 1;                         // phones keep the base type size
  return clamp(w / 1500, 0.9, 1.8);
}

/** Applies the prefs to <body>: zoom via the CSS `zoom` property plus --z, and the density classes.
 *  Returns whether the one-screen layout is on, so the caller can re-render when it changes. */
export function applyPrefs(p: Prefs, full: boolean): boolean {
  const term = p.compact && termFits();
  const fixed = SIZES.find((s) => s.k === p.size)?.z ?? 0;
  const z = Math.round((fixed || autoZoom(term)) * 1000) / 1000;
  const b = document.body;
  b.style.setProperty("--z", String(z));
  (b.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
  b.classList.toggle("cmp", p.compact);
  b.classList.toggle("term", term);
  b.classList.toggle("full", full && term);
  return term;
}

/** Current zoom factor (pointer coordinates are in visual pixels, layout in zoomed CSS pixels). */
export const zoomNow = (): number => Number(document.body.style.getPropertyValue("--z")) || 1;
export const termMode = (): boolean => document.body.classList.contains("term");
