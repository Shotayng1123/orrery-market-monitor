// What the probes of Yahoo Finance share (P-0b, 21 Nov 2026): one way of asking (a measured pace, a 429 asked again
// once after 5 s, three times at most in a run, nothing more after three in a row), the chart's bars and events, the
// v7 quote, spark's closes, and the small sums the probes print. Yahoo Finance is unofficial. Read-only; the session
// cookie and crumb are never printed (lib.ts masks a crumb wherever an address is printed).
import { look, masked, pause } from "./lib.ts";

export type J = Record<string, unknown>;
export const GAP = 1200;
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
export const iso = (t: number | null): string => (t == null ? "–" : new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC");
const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (key: string, make: () => Intl.DateTimeFormat) => fmts.get(key) ?? fmts.set(key, make()).get(key)!;
/** The date (YYYY-MM-DD) and the time (HH:MM) of a moment in a time zone. */
export const dayIn = (tz: string, t: number): string => fmt(`d ${tz}`, () => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).format(new Date(t * 1000));
export const hmIn = (tz: string, t: number): string => fmt(`t ${tz}`, () => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).format(new Date(t * 1000));
export const pct = (x: number | null, dp = 2): string => (x == null || !Number.isFinite(x) ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(dp)}%`);
export const sd = (xs: number[]): number | null => { if (xs.length < 2) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
export const median = (xs: number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
/** A figure for a log line: `dp` decimals, or a dash. */
export const f = (x: number | null | undefined, dp = 2): string => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(dp));

let left429 = 3, inRow = 0, stopped = false;
/** Whether Yahoo refused three times in a row: the probe then asks nothing more. */
export const yahooStopped = (): boolean => stopped;
/** One request to Yahoo through look(): its JSON, or null with the reason printed (of a refusal that carries JSON,
 *  Yahoo's own description: "no data", "not available for startTime…"). A 429 is asked again once, after 5 s, while
 *  the run has asked again fewer than three times; the third 429 in a row ends the asking. */
export async function yget(url: string, headers: Record<string, string> = {}): Promise<J | null> {
  if (stopped) { console.log(`  not asked (Yahoo refused three times in a row): ${masked(url)}`); return null; }
  for (let again = false; ; again = true) {
    const r = await look(url, { headers: { accept: "application/json", ...headers }, show: 0, timeoutMs: 40000 });
    await pause(GAP);
    if (r.status === 429) {
      if (++inRow >= 3) { stopped = true; console.log("  Yahoo answered 429 three times in a row: nothing more is asked"); return null; }
      if (!again && left429-- > 0) { await pause(5000); continue; }
      return null;
    }
    inRow = 0;
    let j: unknown = null;
    try { j = JSON.parse(r.text); } catch { /* below */ }
    if (!j || typeof j !== "object") { if (r.text) console.log(`  answer: ${masked(JSON.stringify(r.text.slice(0, 220)))}`); return null; }
    if (!r.ok) { const e = ((j as J).chart as { error?: { description?: string } } | undefined)?.error?.description ?? ((j as J).finance as { error?: { description?: string } } | undefined)?.error?.description; console.log(`  answer: ${masked(JSON.stringify(e ?? r.text.slice(0, 220)))}`); return null; }
    return j as J;
  }
}

export interface Bars { meta: J; tz: string; ts: number[]; o: Array<number | null>; h: Array<number | null>; l: Array<number | null>; c: Array<number | null>; v: Array<number | null>; div: Array<{ t: number; amount: number }>; split: Array<{ t: number; num: number; den: number }> }
/** The chart endpoint's answer as bars with their events. */
export function barsOf(j: J | null): Bars | null {
  const res = ((j?.chart as { result?: Array<{ meta?: J; timestamp?: number[]; indicators?: { quote?: Array<Record<string, Array<number | null>>> }; events?: { dividends?: Record<string, { amount?: number; date?: number }>; splits?: Record<string, { numerator?: number; denominator?: number; date?: number }> } }> } | undefined)?.result ?? [])[0];
  if (!res?.meta) return null;
  const ts = res.timestamp ?? [], q = res.indicators?.quote?.[0] ?? {}, n = ts.length;
  const arr = (a?: Array<number | null>) => (a && a.length === n ? a : new Array<number | null>(n).fill(null));
  const div = Object.values(res.events?.dividends ?? {}).map((d) => ({ t: Number(d.date), amount: Number(d.amount) })).filter((d) => Number.isFinite(d.t) && Number.isFinite(d.amount)).sort((a, b) => a.t - b.t);
  const split = Object.values(res.events?.splits ?? {}).map((d) => ({ t: Number(d.date), num: Number(d.numerator), den: Number(d.denominator) })).filter((d) => Number.isFinite(d.t)).sort((a, b) => a.t - b.t);
  return { meta: res.meta, tz: String(res.meta.exchangeTimezoneName ?? "UTC"), ts, o: arr(q.open), h: arr(q.high), l: arr(q.low), c: arr(q.close), v: arr(q.volume), div, split };
}
export interface Day { d: string; t: number; o: number | null; h: number | null; l: number | null; c: number; v: number | null; div: number }
/** Daily bars by the exchange's date (the last bar of a date kept), each with its date's distribution (ex-date). */
export function daily(b: Bars): Day[] {
  const dv = new Map<string, number>();
  for (const x of b.div) dv.set(dayIn(b.tz, x.t), (dv.get(dayIn(b.tz, x.t)) ?? 0) + x.amount);
  const out: Day[] = [];
  b.ts.forEach((t, i) => { const c = b.c[i]; if (c == null) return; const d = dayIn(b.tz, t); const row = { d, t, o: b.o[i], h: b.h[i], l: b.l[i], c, v: b.v[i], div: dv.get(d) ?? 0 }; if (out.length && out[out.length - 1].d === d) out[out.length - 1] = row; else out.push(row); });
  return out;
}
export interface Minute { t: number; hm: string; o: number | null; h: number | null; l: number | null; c: number; v: number }
/** One-minute bars that carry a price, grouped by the exchange's date. */
export function minutesByDay(b: Bars): Map<string, Minute[]> {
  const days = new Map<string, Minute[]>();
  b.ts.forEach((t, i) => { const c = b.c[i]; if (c == null) return; const d = dayIn(b.tz, t); (days.get(d) ?? days.set(d, []).get(d)!).push({ t, hm: hmIn(b.tz, t), o: b.o[i], h: b.h[i], l: b.l[i], c, v: b.v[i] ?? 0 }); });
  return days;
}
/** Daily total returns from raw closes and distributions on their ex-dates (X-2). */
export const totalReturns = (rows: Day[]): Array<{ d: string; r: number }> => rows.slice(1).map((x, i) => ({ d: x.d, r: (x.c + x.div) / rows[i].c - 1 }));

export async function chart(symbol: string, query: string): Promise<Bars | null> {
  return barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`));
}
/** The v7 quote of `symbols` (one request per hundred), by symbol. */
export async function quotes(symbols: string[], s: { cookie: string; crumb: string }): Promise<Map<string, J>> {
  const out = new Map<string, J>();
  for (let i = 0; i < symbols.length; i += 100) {
    const j = await yget(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.slice(i, i + 100).join(","))}&crumb=${encodeURIComponent(s.crumb)}`, { cookie: s.cookie });
    for (const q of ((j?.quoteResponse as { result?: J[] } | undefined)?.result ?? [])) if (typeof q.symbol === "string") out.set(q.symbol, q);
  }
  return out;
}
/** spark's answer as symbol → [timestamp, close] (both shapes Yahoo uses: the flat one the server reads, and v7's). */
export function sparkOf(j: J | null): Map<string, Array<[number, number]>> {
  const out = new Map<string, Array<[number, number]>>();
  const add = (sym: string, ts?: unknown, cs?: unknown) => {
    if (!Array.isArray(ts) || !Array.isArray(cs)) return;
    const rows: Array<[number, number]> = [];
    ts.forEach((t, i) => { const c = num(cs[i]); if (typeof t === "number" && c != null) rows.push([t, c]); });
    out.set(sym, rows);
  };
  if (!j) return out;
  const res = (j.spark as { result?: Array<{ symbol?: string; response?: Array<{ timestamp?: unknown; indicators?: { quote?: Array<{ close?: unknown }> } }> }> } | undefined)?.result;
  if (Array.isArray(res)) { for (const x of res) if (x.symbol) add(x.symbol, x.response?.[0]?.timestamp, x.response?.[0]?.indicators?.quote?.[0]?.close); return out; }
  for (const [sym, v] of Object.entries(j)) { const o = v as { timestamp?: unknown; close?: unknown } | null; if (o && typeof o === "object") add(sym, o.timestamp, o.close); }
  return out;
}
/** A quote's spread in basis points of its mid, where it carries a bid above zero and an ask above the bid. */
export const spreadBp = (q: J | undefined): number | null => { const b = num(q?.bid), a = num(q?.ask); return b != null && a != null && b > 0 && a > b ? ((a - b) / ((a + b) / 2)) * 1e4 : null; };
/** A's fallback spread by size (A's verdict on round 3a, §1; (A): A's desk experience, not sourced): the tier, in
 *  basis points, of a name's average daily value traded in US dollars. */
export const tierBp = (adtvUsd: number): number => (adtvUsd >= 200e6 ? 2 : adtvUsd >= 50e6 ? 4 : adtvUsd >= 10e6 ? 8 : adtvUsd >= 2e6 ? 20 : adtvUsd >= 0.5e6 ? 50 : 100);
/** Abdi and Ranaldo's (2017) two-day corrected estimate of the spread, in basis points, over the last `n` complete
 *  sessions of `rows` (E): the mean of sqrt(max(4 (c_t − η_t)(c_t − η_t+1), 0)), in logs, η the mid of high and low. */
export function abdiRanaldo(rows: Day[], n = 21): { bp: number | null; sessions: number; to: string | null } {
  const full = rows.filter((r) => r.h != null && r.l != null && r.h > 0 && r.l > 0);
  const ss: number[] = [];
  for (let i = Math.max(0, full.length - n - 1); i < full.length - 1; i++) {
    const c = Math.log(full[i].c), e0 = (Math.log(full[i].h as number) + Math.log(full[i].l as number)) / 2, e1 = (Math.log(full[i + 1].h as number) + Math.log(full[i + 1].l as number)) / 2;
    ss.push(Math.sqrt(Math.max(4 * (c - e0) * (c - e1), 0)));
  }
  return { bp: ss.length ? (ss.reduce((a, x) => a + x, 0) / ss.length) * 1e4 : null, sessions: ss.length, to: full[full.length - 1]?.d ?? null };
}
