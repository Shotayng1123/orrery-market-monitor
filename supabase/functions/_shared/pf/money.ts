// Money of the paper portfolio (P-1): amounts as typed, as stored and as written.
// Stored in whole minor units (USD cents, JPY yen), as integers; a starting NAV is a whole number of the currency.
// One rounding rule lives here; P-2's ledger adds to this file.
import type { Base } from "./types.ts";

/** Minor units in one unit of the currency. */
export const MINOR: Record<Base, number> = { USD: 100, JPY: 1 };
export const toMinor = (base: Base, units: number): number => Math.round(units * MINOR[base]);
export const fromMinor = (base: Base, minor: number): number => minor / MINOR[base];

/** "100,000,000": a whole amount in full, with separators. */
export function fmtFull(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${s}` : s;
}
/** "USD 10m", "JPY 1bn", "USD 63.1m": an amount in short, for a range or an equivalent. At most one decimal. */
export function fmtShort(base: Base, n: number): string {
  const a = Math.abs(n), cut = (x: number) => String(Math.round(x * 10) / 10);
  const body = a >= 1e9 ? `${cut(a / 1e9)}bn` : a >= 1e6 ? `${cut(a / 1e6)}m` : a >= 1e3 ? `${cut(a / 1e3)}k` : String(Math.round(a));
  return `${base} ${n < 0 ? "-" : ""}${body}`;
}
/** "100.00m": a summary's money, two decimals, the currency named once elsewhere. */
export function fmtMoney2(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  return a >= 1e9 ? `${sign}${(a / 1e9).toFixed(2)}bn` : a >= 1e6 ? `${sign}${(a / 1e6).toFixed(2)}m` : `${sign}${fmtFull(a)}`;
}

export const AMOUNT_EXAMPLE = "enter an amount, for example 100m";
/** An amount as typed: "100m", "1.5bn", "100,000,000" and "100000000" are all read, as whole units of the currency.
 *  Null for anything else (the form then says `AMOUNT_EXAMPLE`); nothing is corrected silently. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k|m|bn)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "") + (m[2] ?? "")) * (m[3] === "bn" ? 1e9 : m[3] === "m" ? 1e6 : m[3] === "k" ? 1e3 : 1);
  const whole = Math.round(n);
  return Number.isFinite(n) && Math.abs(n - whole) < 1e-6 && whole > 0 ? whole : null;
}

/** The starting NAV's range per base currency (both PMs; R-13), in whole units, and its refusal. */
export const NAV_RANGE: Record<Base, { lo: number; hi: number; def: number; refuse: string; range: string }> = {
  USD: { lo: 10e6, hi: 1e9, def: 100e6, refuse: "between USD 10m and USD 1bn", range: "USD 10m–1bn" },
  JPY: { lo: 1e9, hi: 100e9, def: 10e9, refuse: "between JPY 1bn and JPY 100bn", range: "JPY 1bn–100bn" },
};
