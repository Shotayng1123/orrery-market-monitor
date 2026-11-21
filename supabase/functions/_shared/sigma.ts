// Moves in σ (I-6, 20 Nov 2026; B-06 (a), B-03 (1) with B's corrections and the designer's I-6 note). A day's change is
// set against the instrument's own standard deviation of daily changes over the 63 sessions before it: a yield's
// changes in points of its level (bp on the page), a price's in per cent. The latest change is never in its own
// yardstick: a print after the last booked close is measured against the 63 changes up to that close, and a day that is
// itself the last booked close (a closed market, an official yield once its day is booked) against the 63 before it.
// A future's roll day counts its change within the new contract, never the change of contract (B-27, futures.ts).
// The database works the same figures out for the market table (fn_table_stats, sim/sql checks that the two agree);
// this file is the rule, pure, for the table's row (table.ts), the alerts (alerts.ts) and sim/logic.test.ts.
import { fxDay, isFxPair } from "./fx.ts";
import { localDate, marketById } from "./sessions.ts";
import { isFuture, tradeDate, type RollLite } from "./futures.ts";

export type Units = "yield" | "price";
/** The window: 63 sessions. A window in which a roll's change of contract is not known leaves that day out; fewer than
 *  SIGMA_MIN changes measured and there is no σ. */
export const SIGMA_N = 63, SIGMA_MIN = 60;
/** σ alerts (B-03 (1)): raised from 2σ, the lowest line a device can choose (2, 2.5 or 3: B's per-device line); the
 *  lists everyone reads (the header's ALERTS, WATCHLIST) show them from 2.5σ, B's line for everyone. */
export const SIGMA_RAISE = 2, SIGMA_LIST = 2.5;
export const SIGMA_LINES: readonly number[] = [2, 2.5, 3];
/** Which classes raise a σ alert (B-03 (1)): every currency, yield, commodity, volatility index, future and coin. Not the
 *  equity indices: they have the ±3% index alert. */
export const SIGMA_CLASSES: ReadonlySet<string> = new Set(["Currency", "Fixed income", "Commodities", "Volatility", "Futures", "Crypto"]);

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The day-to-day changes of a series, newest first, as the database works them out: a yield's change of level in
 *  points, a price's in per cent of the close before; on a roll day the change within the new contract, from its own
 *  close before (none where that close is not known). `closes` oldest first. */
export function dailyChanges(closes: Array<{ d: string; close: number }>, units: Units, rolls: RollLite[] = []): Array<{ d: string; chg: number | null }> {
  const roll = new Map(rolls.map((r) => [r.d, r.prevClose]));
  const out: Array<{ d: string; chg: number | null }> = [];
  for (let i = closes.length - 1; i >= 1; i--) {
    const c = closes[i].close, d = closes[i].d;
    const base = roll.has(d) ? roll.get(d) ?? null : closes[i - 1].close;
    out.push({ d, chg: !fin(base) || !fin(c) ? null : units === "yield" ? c - base : base === 0 ? null : (c / base - 1) * 100 });
  }
  return out;
}

/** σ of the changes of the 63 sessions ending at the newest close (`sd`, from the close of `from` to that of `to`), and
 *  of the 63 ending one session earlier (`sdx`): the sample standard deviation, as PostgreSQL's stddev_samp; `n` the
 *  changes measured. */
export interface SigmaStats { sd: number | null; n: number; from: string | null; to: string | null; sdx: number | null; nx: number; fromx: string | null; tox: string | null }
const sdOf = (xs: number[]): number | null => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
export function sigmaStats(closes: Array<{ d: string; close: number }>, units: Units, rolls: RollLite[] = []): SigmaStats {
  const ch = dailyChanges(closes, units, rolls);   // newest first: ch[k] is the change into the close k+1 sessions back
  const desc = [...closes].reverse();
  const take = (from: number) => ch.slice(from, from + SIGMA_N).map((x) => x.chg).filter(fin);
  const a = take(0), b = take(1);
  return { sd: sdOf(a), n: a.length, from: desc[SIGMA_N]?.d ?? null, to: desc[0]?.d ?? null, sdx: sdOf(b), nx: b.length, fromx: desc[SIGMA_N + 1]?.d ?? null, tox: desc[1]?.d ?? null };
}
/** A σ to measure with: none from fewer than SIGMA_MIN changes, nor a zero one. */
export const usableSd = (sd: number | null | undefined, n: number | null | undefined): number | null => (fin(sd) && sd > 0 && (n ?? 0) >= SIGMA_MIN ? sd : null);
/** The day's move in σ: its change (own units) over the σ of the changes before it. */
export const zDay = (chg: number | null | undefined, sd: number | null | undefined): number | null => (fin(chg) && fin(sd) && sd > 0 ? chg / sd : null);
/** σ vs 1M avg (the market table's): the last print against the mean and sample deviation of the last 21 booked closes
 *  (fn_table_stats), those closes set on a future's new contract's level by `f` where it rolled after the newest of
 *  them (its own close before the roll over the series': table.ts, B-27); none where `f` is not known (null), as the
 *  database gives none across a booked roll whose change of contract is not known. */
export const z1mOf = (last: number | null | undefined, mean21: number | null | undefined, sd21: number | null | undefined, f: number | null = 1): number | null =>
  fin(last) && fin(mean21) && fin(sd21) && sd21 > 0 && fin(f) && f > 0 ? (last - mean21 * f) / (sd21 * f) : null;

// ---- the newest completed session (B's B-32, 21 Nov 2026) ----
// At 07:00 SGT a currency's new day is an hour old (the FX day ended at 17:00 New York and is booked at 22:35 UTC), so
// the day's change in σ says little, and the session that has just ended was in no cell: MOVERS IN σ gets a second
// reading, LAST SESSION. It is each instrument's newest completed day: the change between its last two booked closes
// (c0 − c1) over the σ of the 63 daily changes before it, which is the window that ends at c1 (fn_table_stats' sd63x:
// the newest change is never in its own yardstick). On a future's roll day the change is counted within the new
// contract, from that contract's own close before (futures.ts rollDay); where that close is not known the change is the
// series' own, across the change of contract, and has no σ, as the day's own figure has none (table.ts).
/** A booked close: its session's date and its level. */
export interface Booked { d: string; close: number }
/** The newest completed session of a table row. `chg` is in the row's units (per cent for a price, points for a yield),
 *  `base` the close it is measured from (the close before, or on a roll day the new contract's own close before);
 *  `sd`, `n`, `wFrom` and `wTo` the σ it is set against, the changes counted in it and its window's first and last close. */
export interface LastSession {
  d: string; from: string; close: number; base: number | null; chg: number | null; z: number | null;
  sd: number | null; n: number | null; wFrom: string | null; wTo: string | null;
  roll: { from: string | null; to: string; step: number | null } | null;
}
/** The newest completed session from the last two booked closes (`c0` the newest, `c1` the one before) and the σ of the
 *  63 changes that end at `c1` (`w`: fn_table_stats' sd63x, n63x, from63x, to63x). A σ whose window does not end at
 *  `c1` is not this session's and gives no figure. `roll`: a change of contract after `c1` and not after `c0`. */
export function lastSession(c0: Booked | null | undefined, c1: Booked | null | undefined, units: Units,
  w: { sd?: number | null; n?: number | null; from?: string | null; to?: string | null } | null | undefined,
  roll: { from: string | null; to: string; prevClose: number | null } | null = null): LastSession | null {
  if (!c0 || !c1 || !fin(c0.close) || !fin(c1.close) || !(c1.d < c0.d)) return null;
  const known = !!roll && fin(roll.prevClose) && roll.prevClose > 0, base = roll && known ? roll.prevClose! : c1.close;
  const chg = units === "yield" ? c0.close - base : base === 0 ? null : (c0.close / base - 1) * 100;
  const sd = w && w.to === c1.d ? usableSd(w.sd, w.n) : null;
  return { d: c0.d, from: c1.d, close: c0.close, base, chg, z: roll && !known ? null : zDay(chg, sd),
    sd, n: w && w.to === c1.d ? w.n ?? null : null, wFrom: sd == null ? null : w?.from ?? null, wTo: sd == null ? null : w?.to ?? null,
    roll: roll ? { from: roll.from, to: roll.to, step: known && c1.close > 0 ? (roll.prevClose! / c1.close - 1) * 100 : null } : null };
}
/** The same from a series of booked closes, oldest first (the logic checks; the database gives table.ts the two closes
 *  and the σ): the last two closes, the σ of the 63 changes before the newest, a roll on the newest close's day. */
export function lastSessionOf(closes: Booked[], units: Units, rolls: Array<RollLite & { from?: string | null; to?: string }> = []): LastSession | null {
  const n = closes.length;
  if (n < 2) return null;
  const s = sigmaStats(closes, units, rolls), c0 = closes[n - 1], c1 = closes[n - 2], r = rolls.find((x) => x.d > c1.d && x.d <= c0.d);
  return lastSession(c0, c1, units, { sd: s.sdx, n: s.nx, from: s.fromx, to: s.tox }, r ? { from: r.from ?? null, to: r.to ?? "", prevClose: r.prevClose } : null);
}

// ---- which closes the market table hands lastSession (table.ts; the checks of round 3b, 21 Nov 2026: CK-5, LS-5) ----
// These few lines decide the last session of every row, and no check ran them: table.ts cannot be loaded outside the
// server (it reads the database), so the logic checks tested lastSession with closes they picked themselves. They are
// here, pure, and table.ts calls them.
/** What fn_table_anchors gives for an instrument, as far as the last session needs it: its newest booked close, and
 *  the close the 1D is measured from. Where the quote is the newer view the SQL hands back the newest close itself as
 *  that one (`d1_d === last_d`), and the close before it is read apart (`prevCloses`). */
export interface AnchorLite { last_d?: string | null; last_close?: number | null; d1_d?: string | null; d1?: number | null }
/** A recorded change of contract (fut_rolls). */
export interface RollRecLite { d: string; from_contract: string | null; to_contract: string; prev_close: number | null }
/** fn_table_stats' σ of the 63 daily changes that end one session before the newest close. */
export interface StatX { sd63x?: number | null; n63x?: number | null; from63x?: string | null; to63x?: string | null }
/** For each symbol, its newest booked close before `lastOf`'s date: the close before the last one, from rows in any
 *  order (a paged read gives them page by page). A symbol with no row before its last close is not in the answer. */
export function prevCloses(rows: ReadonlyArray<{ symbol: string; d: string; close: number }>, lastOf: ReadonlyMap<string, string>): Map<string, Booked> {
  const out = new Map<string, Booked>();
  for (const r of rows) {
    const last = lastOf.get(r.symbol);
    if (last == null || !(r.d < last)) continue;
    const had = out.get(r.symbol);
    if (!had || r.d > had.d) out.set(r.symbol, { d: r.d, close: r.close });
  }
  return out;
}
/** A table row's last session: the instrument's last two booked closes (the anchors' newest and the one before: the
 *  anchors' own `d1` where the row is itself its last close, `prev` where the quote is the newer view), a change of
 *  contract between the two (a future's, counted within the new contract), over the σ of the 63 changes before it. */
export function tableLastSession(a: AnchorLite | null | undefined, prev: Booked | null | undefined, rolls: ReadonlyArray<RollRecLite>, st: StatX | null | undefined, units: Units, future: boolean): LastSession | null {
  const c0 = a?.last_d && a.last_close != null ? { d: a.last_d, close: a.last_close } : null;
  const c1 = !a?.last_d ? null : a.d1_d === a.last_d ? prev ?? null : a.d1_d && a.d1 != null ? { d: a.d1_d, close: a.d1 } : null;
  const lr = future && c0 && c1 ? rolls.filter((r) => r.d <= c0.d && r.d > c1.d).sort((x, y) => y.d.localeCompare(x.d))[0] : undefined;
  return lastSession(c0, c1, units, { sd: st?.sd63x, n: st?.n63x, from: st?.from63x, to: st?.to63x }, lr ? { from: lr.from_contract, to: lr.to_contract, prevClose: lr.prev_close } : null);
}

// ---- σ alerts ----
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "19 Nov 2026", as the page writes a date (web/src/lib/time.ts fmtDate). */
export const dayWords = (ymd: string | null | undefined): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? ""); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : "–"; };
const nf = (d: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
/** A move as the alert words it: "+1.9%" (two decimals under 1%), "−12.4bp" for a yield (its change in points, ×100). */
export function moveWords(chg: number, units: Units): string {
  const x = units === "yield" ? chg * 100 : chg, s = nf(units === "yield" ? 1 : Math.abs(x) < 1 ? 2 : 1).format(Math.abs(x));
  return `${/[1-9]/.test(s) ? (x > 0 ? "+" : "-") : ""}${s}${units === "yield" ? "bp" : "%"}`;
}
/** "USD/JPY +1.9% · 2.7σ · 158.420" (the designer's I-6 note): the move, its size in σ, the level with the instrument's
 *  own decimals ("%" after a yield). */
export function sigmaMsg(name: string, units: Units, chg: number, z: number, last: number, decimals: number): string {
  return `${name} ${moveWords(chg, units)} · ${nf(1).format(Math.abs(z))}σ · ${nf(decimals).format(last)}${units === "yield" ? "%" : ""}`;
}
/** Its window and source, under the message (the list, the notification): "σ of 63 daily changes to 19 Nov 2026 ·
 *  Yahoo Finance". */
export const sigmaNote = (n: number, to: string | null, source: string): string => `σ of ${n} daily changes to ${dayWords(to)} · ${source}`;
/** The lists everyone reads show a σ alert from 2.5σ (PostgREST's `or`, and the same rule for a list read whole). */
export const LISTED_ALERTS = `kind.neq.sigma,sigma.gte.${SIGMA_LIST},sigma.lte.-${SIGMA_LIST}`;
export const listed = (a: { kind: string; sigma?: number | null }): boolean => a.kind !== "sigma" || Math.abs(a.sigma ?? 0) >= SIGMA_LIST - 1e-9;

/** The table row's fields a σ alert reads (table.ts TableRow). */
export interface SigmaRowLike {
  symbol: string; name: string; cls: string; group: string; market: string; decimals: number; source?: string | null;
  last: number | null; lastAt: string | null; z1d?: number | null; pct: { d1?: number | null }; chg?: { d1?: number | null };
  zTo?: string | null; zN?: number | null;
}
const isYieldRow = (r: { group: string; symbol: string }): boolean => r.group === "rates" && !r.symbol.endsWith("=F");
/** The session a row's day belongs to: a booked close's own date; a currency pair's FX day (17:00 New York); a future's
 *  CME trade date (from 18:00 New York the evening before: the evening's prints are the next session's, futures.ts);
 *  otherwise the date in its market's time zone. */
export function sessionDay(r: Pick<SigmaRowLike, "symbol" | "market" | "lastAt">): string | null {
  if (!r.lastAt) return null;
  if (/T00:00:00(\.000)?Z$/.test(r.lastAt)) return r.lastAt.slice(0, 10);
  const t = Date.parse(r.lastAt) / 1000;
  if (isFuture(r.symbol)) return tradeDate(t);
  return isFxPair(r.symbol) ? fxDay(t) : localDate(marketById(r.market)?.tz ?? "UTC", t);
}
export interface SigmaCand { d: string; symbol: string; name: string; kind: "sigma"; sigma: number; pct: number | null; price: number; market: string; msg: string; note: string }
/** The σ alert a table row raises now, if any: a class that raises them, |1D in σ| of 2 or more, and, for a future, a
 *  reading of its contract this minute (`read`: else a roll could not be told from a move, and nothing is said). */
export function sigmaCandidate(r: SigmaRowLike, read: ReadonlySet<string>, sourceName: (r: SigmaRowLike) => string): SigmaCand | null {
  const z = r.z1d;
  if (!SIGMA_CLASSES.has(r.cls) || !fin(z) || Math.abs(z) < SIGMA_RAISE || !fin(r.last)) return null;
  if (r.symbol.endsWith("=F") && !read.has(r.symbol)) return null;
  const units: Units = isYieldRow(r) ? "yield" : "price", chg = units === "yield" ? r.chg?.d1 : r.pct.d1, d = sessionDay(r);
  if (!fin(chg) || !d) return null;
  return { d, symbol: r.symbol, name: r.name.replace(/ via 1306\.T$/, ""), kind: "sigma", sigma: z, pct: units === "price" ? chg : null, price: r.last, market: r.market,
    msg: sigmaMsg(r.name.replace(/ via 1306\.T$/, ""), units, chg, z, r.last, r.decimals), note: sigmaNote(r.zN ?? SIGMA_N, r.zTo ?? null, sourceName(r)) };
}
/** Which candidates to write: a new one, or one whose σ has grown since it was stored (one alert per instrument and
 *  session, updated while the move grows, as the other alerts). */
export function sigmaWrites(cands: SigmaCand[], stored: Map<string, { sigma: number | null }>): SigmaCand[] {
  return cands.filter((c) => { const s = stored.get(`${c.symbol}|${c.d}`); return !s || Math.abs(c.sigma) > Math.abs(s.sigma ?? 0) + 0.05; });
}
