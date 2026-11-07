// Display preferences: text size (S/M/L/XL), COMPACT terminal layout, FULL screen. Persisted per browser.
export const SIZES = [{ k: "S", z: 0.85 }, { k: "M", z: 1 }, { k: "L", z: 1.15 }, { k: "XL", z: 1.35 }] as const;
export type SizeKey = (typeof SIZES)[number]["k"];

export interface Prefs { size: SizeKey; compact: boolean }
const KEY = "om_prefs";

export function loadPrefs(): Prefs {
  try { const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>; return { size: p.size ?? "M", compact: p.compact ?? false }; } catch { return { size: "M", compact: false }; }
}
export function savePrefs(p: Prefs): void { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }

/** Applies the prefs to <body>: zoom via the CSS `zoom` property plus --z, and the density classes. */
export function applyPrefs(p: Prefs, full: boolean): void {
  const z = SIZES.find((s) => s.k === p.size)?.z ?? 1;
  const b = document.body;
  b.style.setProperty("--z", String(z));
  (b.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
  const desktop = window.matchMedia("(min-width: 721px)").matches;
  b.classList.toggle("cmp", p.compact);
  b.classList.toggle("term", p.compact && desktop);
  b.classList.toggle("full", full && p.compact && desktop);
}
