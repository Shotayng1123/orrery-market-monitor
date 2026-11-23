// COPY of supabase/functions/_shared/pf/size.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// An order's size (P-2.1, the plan's §2.1): what an order typed on the ticket comes to in shares, before anything is
// placed. Pure: the price, the rate, the position and the moment are handed in. Nothing here guesses: a figure the
// inputs do not give is null, and the page writes it "–".
//
// Rounding is always down, to whole trading units (100 shares for Tokyo, 単元; 1 for US names), and the part not placed
// is shown. An order may not cross zero. Two prices are kept apart (M-7, X-8): this file sizes on P_size, the latest
// print when the ticket is filled in, with its time, its age and its source; the arrival price of a placed order is
// P-2.2's and P-2.5's.
import type { Base, Kind } from "./types.ts";
import { FEED_DELAY_MIN, VENUE_NAME, venueNow, type Holidays, type Venue } from "./calendar.ts";

export type Side = "buy" | "sell" | "short" | "cover";
export const SIDES: Side[] = ["buy", "sell", "short", "cover"];
export const SIDE_WORD: Record<Side, string> = { buy: "Buy", sell: "Sell", short: "Short", cover: "Cover" };
/** +1 for an order that adds shares (a buy, a cover), −1 for one that takes them away (a sale, a short). */
const SIGN: Record<Side, 1 | -1> = { buy: 1, cover: 1, sell: -1, short: -1 };
const NOUN: Record<Side, string> = { buy: "a buy", sell: "a sale", short: "a short", cover: "a cover" };
/** How an order is sized: an amount in the base currency or in the name's own (C-12), % or bp of capital (AR) or NAV
 *  (RR), to a weight or an active weight (RR), shares; Close and Reduce by x% act on a position. */
export type SizeBy = "base" | "local" | "pct" | "bps" | "weight" | "active" | "shares" | "close" | "reduce";
export const SIZE_BYS: SizeBy[] = ["base", "local", "pct", "bps", "weight", "active", "shares", "close", "reduce"];

/** The trading unit: 100 shares in Tokyo (単元), 1 share in New York. */
export const LOT: Record<Venue, number> = { TSE: 100, NYSE: 1 };
export const VENUE_CCY: Record<Venue, Base> = { TSE: "JPY", NYSE: "USD" };

/** The quote the ticket sizes on, as the server reads it (Yahoo Finance's, through the Monitor). */
export interface TicketQuote { symbol: string; name: string | null; price: number | null; at: string | null; currency: string | null; exchange: string | null; quoteType: string | null; source: string }

/** A symbol's venue in this version: a ".T" name is Tokyo's; a ticker with no suffix (letters, digits, a class after
 *  "-") is New York's; anything else is listed elsewhere. */
export function venueOfSymbol(symbol: string): Venue | null {
  const s = symbol.trim().toUpperCase();
  if (/^[0-9][0-9A-Z]{3}\.T$/.test(s)) return "TSE";
  return /^[A-Z][A-Z0-9]{0,5}(-[A-Z])?$/.test(s) ? "NYSE" : null;
}
const ONLY = "Only stocks and ETFs listed in New York or Tokyo can be sized for now";
/** Whether the ticket can size this instrument, from the quote the server read: its venue, lot and currency, or the
 *  reason it cannot, in words. */
export function tradable(symbol: string, q: TicketQuote | null): { ok: true; venue: Venue; lot: number; ccy: Base } | { ok: false; text: string } {
  if (!q) return { ok: false, text: `Yahoo Finance has no quote for ${symbol}: check the symbol (a Tokyo name ends in .T, for example 7203.T).` };
  const t = (q.quoteType ?? "").toUpperCase();
  if (t === "FUTURE") return { ok: false, text: `${symbol} is a future. ${ONLY}: futures come with a later step.` };
  if (t === "INDEX") return { ok: false, text: `${symbol} is an index, which does not trade: an ETF on it does (1306.T for TOPIX, SPY for the S&P 500).` };
  if (t === "CURRENCY" || t === "CRYPTOCURRENCY") return { ok: false, text: `${symbol} is a currency. ${ONLY}: currencies come with a later step.` };
  if (t !== "EQUITY" && t !== "ETF") return { ok: false, text: `${ONLY}: ${symbol} is ${t ? `a ${t.toLowerCase()}` : "of no type Yahoo Finance names"}.` };
  const venue = venueOfSymbol(symbol);
  if (!venue) return { ok: false, text: `${ONLY}: ${symbol} is listed elsewhere.` };
  if (q.currency !== VENUE_CCY[venue]) return { ok: false, text: `${symbol}'s quote is in ${q.currency ?? "no currency"}, not ${VENUE_CCY[venue]}: it cannot be sized here.` };
  return { ok: true, venue, lot: LOT[venue], ccy: VENUE_CCY[venue] };
}

/** The sides a position allows (the designer's PF-5): none held, Buy and Short; a long, Buy and Sell; a short, Short and
 *  Cover. */
export function sidesFor(position: number): Side[] {
  return position > 0 ? ["buy", "sell"] : position < 0 ? ["short", "cover"] : ["buy", "short"];
}

/** An amount from one currency into another at USD/JPY (yen per dollar); null with no rate. */
export function convert(amount: number, from: Base, to: Base, usdjpy: number | null): number | null {
  if (from === to) return amount;
  if (usdjpy == null || !(usdjpy > 0)) return null;
  return from === "USD" ? amount * usdjpy : amount / usdjpy;
}
/** Money to its currency's smallest unit (yen, cents), so that a remainder reads as a sum of money. */
export const toUnit = (ccy: Base, n: number): number => (ccy === "JPY" ? Math.round(n) : Math.round(n * 100) / 100);
const down = (x: number): number => Math.floor(x + 1e-9);   // always down; a figure a hair below a whole one is that whole one
const group = (n: number): string => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** "1,000 shares". */
export const sharesWords = (n: number): string => `${group(n)} share${Math.abs(n) === 1 ? "" : "s"}`;

export interface SizeIn {
  side: Side; by: SizeBy;
  /** the figure typed: an amount, a % or bp, a weight in %, an active weight in bp, shares, or the x of "Reduce by x%";
   *  none for Close */
  value: number | null;
  /** the shares held now, signed (a long +, a short −) */
  position: number;
  lot: number;
  /** P_size, in the name's currency; null when there is none to size on (none read, or too old) */
  price: number | null;
  mult?: number;
  /** the name's currency and the book's base currency, and USD/JPY (yen per dollar) when they differ */
  ccy: Base; base: Base; usdjpy: number | null;
  /** an AR book sizes on its capital K, an RR book on its NAV: `capital` is that figure, in whole units of the base */
  kind: Kind; capital: number;
  /** RR: the name's weight now and its benchmark weight, in % of NAV */
  weight?: number | null; bench?: number | null;
}
export type SizeOut =
  | { ok: true; qty: number; after: number; askedBase: number | null; askedLocal: number | null; placedLocal: number | null; leftLocal: number | null; leftShares: number | null }
  | { ok: false; text: string; reverse?: { close: number; open: number } };

const NO_PRICE = "No price to size an amount on: size by shares, or wait for a fresh print.";
/** What an order comes to (§2.1): `q = floor(A_l ÷ (P_size × m × lot)) × lot`, always down; the remainder `A_l − q ×
 *  P_size × m` shown; by shares (a whole number: a fraction is refused), the part below a lot shown as not placed; to
 *  a weight or an active weight (RR), the difference from the weight held, a sale where the target is below it, nothing
 *  where they are equal, and never below 0%; Close the whole position; Reduce by x% `floor(x × |q| ÷ lot) × lot`; never
 *  across zero ("close and reverse" is two orders, each checked). */
export function sizeOrder(i: SizeIn): SizeOut {
  if (!SIZE_BYS.includes(i.by) || !SIDES.includes(i.side)) return { ok: false, text: "No such way to size an order." };
  const m = i.mult ?? 1, held = i.position, s = SIGN[i.side];
  const allowed = sidesFor(held);
  if (i.by === "close" || i.by === "reduce") {
    if (held === 0) return { ok: false, text: "No position to close or reduce." };
    const want: Side = held > 0 ? "sell" : "cover";
    if (i.side !== want) return { ok: false, text: `A ${held > 0 ? "long" : "short"} of ${sharesWords(held)} is held: it is closed or reduced with ${SIDE_WORD[want]}.` };
  } else if (!allowed.includes(i.side)) {
    const text = held === 0 ? (i.side === "sell" ? "No position to sell: selling what is not held is a Short." : "No short to cover.")
      : held > 0 ? `A long of ${sharesWords(held)} is held: Sell it, or close and reverse.` : `A short of ${sharesWords(held)} is held: buy it back with Cover.`;
    return { ok: false, text };
  }
  // a weight may be 0% and an active weight below zero (an underweight) or zero (the benchmark's weight); every other
  // figure is above zero
  const toWeight = i.by === "weight" || i.by === "active";
  if (i.by !== "close" && !(typeof i.value === "number" && Number.isFinite(i.value) && (toWeight || i.value > 0))) return { ok: false, text: toWeight ? "Enter a figure." : "Enter a figure above zero." };
  const v = i.value ?? 0;
  // a share is not split: a count that is not whole is refused, not rounded (nor its remainder)
  if (i.by === "shares" && !Number.isInteger(v)) return { ok: false, text: `Shares are whole numbers: ${v} is not one.` };
  let qty: number, askedBase: number | null = null, askedLocal: number | null = null, leftShares: number | null = null;
  if (i.by === "close") qty = Math.abs(held);
  else if (i.by === "reduce") {
    if (v > 100) return { ok: false, text: "Reduce by at most 100%." };
    qty = down((v * Math.abs(held)) / (100 * i.lot)) * i.lot;
  } else if (i.by === "shares") {
    qty = down(v / i.lot) * i.lot;
    leftShares = v - qty;
  } else {
    if (toWeight && i.kind !== "RR") return { ok: false, text: "A book of absolute return sizes by amount, % or bp of capital, or shares: it has no weights to size to." };
    if (toWeight) {
      const w = i.weight ?? Number.NaN, wb = i.bench ?? Number.NaN;
      if (!Number.isFinite(w) || (i.by === "active" && !Number.isFinite(wb))) return { ok: false, text: "No weight to size from: the name's weight or its benchmark weight is not known." };
      // §2.1: A_b = (w* − w) × NAV, w* = w_bench + a* for an active weight. A relative-return book is long-only, so its
      // lowest weight is 0%; a weight a hair from the one held (a figure's last bit) is that weight
      const asked = i.by === "weight" ? v : wb + v / 100;
      if (asked < -1e-9) return { ok: false, text: `A weight below 0%${i.by === "active" ? ` (the benchmark's ${wb.toFixed(2)}% less ${-v} bp)` : ""} would be a short: a relative-return book holds none, so 0% is its lowest weight.` };
      const target = Math.max(0, asked), d = target - w;
      if (Math.abs(d) < 1e-9) return { ok: false, text: `The name is held at ${w.toFixed(2)}%, the weight asked: nothing to do.` };
      if (d * s < 0) return { ok: false, text: `To ${target.toFixed(2)}% from ${w.toFixed(2)}% is ${d < 0 ? "a sale" : "a purchase"}, not ${NOUN[i.side]}.` };
      askedBase = (Math.abs(d) / 100) * i.capital;
    } else if (i.by === "pct") askedBase = (v / 100) * i.capital;
    else if (i.by === "bps") askedBase = (v / 10000) * i.capital;
    else if (i.by === "base") askedBase = v;
    if (i.by === "local") askedLocal = v;
    else {
      askedLocal = convert(askedBase!, i.base, i.ccy, i.usdjpy);
      if (askedLocal == null) return { ok: false, text: `No USD/JPY rate to turn ${i.base} into ${i.ccy}: size in ${i.ccy}, or by shares.` };
    }
    if (i.price == null || !(i.price > 0)) return { ok: false, text: NO_PRICE };
    qty = down(askedLocal / (i.price * m * i.lot)) * i.lot;
  }
  const after = held + s * qty;
  if ((held > 0 && after < 0) || (held < 0 && after > 0)) {
    const open = Math.abs(after), close = Math.abs(held);
    return { ok: false, text: `An order may not cross zero: ${i.side === "sell" ? "selling" : "covering"} ${sharesWords(qty)} would turn a ${held > 0 ? "long" : "short"} of ${group(close)} into a ${held > 0 ? "short" : "long"} of ${group(open)}. Close and reverse is two orders, each checked (${held > 0 ? "Sell" : "Cover"} ${group(close)}, then ${held > 0 ? "Short" : "Buy"} ${group(open)}): it comes with a later step.`, reverse: { close, open } };
  }
  const placedLocal = i.price != null && i.price > 0 ? toUnit(i.ccy, qty * i.price * m) : null;
  const leftLocal = askedLocal != null && placedLocal != null ? toUnit(i.ccy, askedLocal - qty * i.price! * m) : null;
  return { ok: true, qty, after, askedBase: askedBase == null ? null : toUnit(i.base, askedBase), askedLocal: askedLocal == null ? null : toUnit(i.ccy, askedLocal), placedLocal, leftLocal, leftShares };
}

/** How long ago a print was, in words: "20 min", "1 h", "1 h 35 min", "3 days". */
export function ageWords(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return `${Math.floor(m / 1440)} days`;
}
/** A print in session may be at most this many minutes older than the feed's delay. */
export const STALE_AFTER_MIN = 30;
/** How old the sizing price is, and whether it is too old to size on (P-2.1's rule): in a session, a print more than
 *  the feed's delay and 30 minutes old (Tokyo 50, New York 30) is too old, except in the session's first such minutes,
 *  when one from the session before still stands; outside a session (a break, after the close, a weekend, a holiday),
 *  a print from before the venue's last session is too old. The holidays and early closes are the Monitor's. */
export function printAge(venue: Venue, at: string, now: Date, hol: Holidays): { ageMin: number; tooOld: boolean; why: string | null } {
  const t = Date.parse(at), ageMin = Math.round((now.getTime() - t) / 60e3);
  if (Number.isNaN(t)) return { ageMin: Number.NaN, tooOld: true, why: "The print has no time: it cannot size an order." };
  const v = venueNow(venue, now, hol), span = (FEED_DELAY_MIN[venue] + STALE_AFTER_MIN) * 60e3;
  if (v.state === "open" && v.segStart != null) {
    const early = now.getTime() - v.segStart <= span;
    const ok = early ? v.before != null && t >= v.before : now.getTime() - t <= span;
    return { ageMin, tooOld: !ok, why: ok ? null : `Too old to size on: ${VENUE_NAME[venue]} is open and its last print is ${ageWords(ageMin)} old; in a session a print may be at most ${span / 60e3} minutes old.` };
  }
  const ok = v.lastOpen != null && t >= v.lastOpen;
  return { ageMin, tooOld: !ok, why: ok ? null : `Too old to size on: the last print is from before ${VENUE_NAME[venue]}'s last session.` };
}
