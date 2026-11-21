// An instrument's own page (I-4, 20 Nov 2026; B-04 and the designer's I-4 note): a currency, a yield, a commodity, a
// future or an index gets its own figures instead of a stock's (B's defects 1, 2 and 6). Pure: stock.ts fetches the
// parts (the market table's row, the daily closes, a quote) and this file works the figures out and puts the answer
// together; sim/logic.test.ts checks it.
//
// Units. A yield is measured in points of its level, which the page writes in basis points (×100), as MARKETS does;
// a price in per cent. So a yield's day, its distance from its 52-week high, its realised volatility and its largest
// rise are all changes of its level, never a per cent of it.
//
// Where the figures come from. A Monitor instrument (a row of the market table) takes MARKETS' own figures: the last
// print, the change over each window, σ vs 1M avg, the 52W range and vs 200D, from the table's row, so its page and
// MARKETS agree to the digit. What the table does not keep (realised volatility and its percentile, the 52-week high
// and low with their dates, the largest rise and fall) is worked out from the stored daily closes the table is built
// from. A yield read from an official curve has no quote at all: no session, no day's range. Anything else (an index,
// a pair or a future found by search) is worked out from its quote and Yahoo's daily closes, with the table's rules.
import { barOnOrBefore, maxDrawdown, monthsBack, perfRows, range52w, realisedVol, type Bar } from "./stockstats.ts";
import { contractName, rollSegments, rollViews, tradeDate, type RollLite, type RollView } from "./futures.ts";

export type Units = "yield" | "price";
export type PeriodKey = "d1" | "w1" | "m1" | "m3" | "m12" | "m36";
export const PERIOD_KEYS: PeriodKey[] = ["d1", "w1", "m1", "m3", "m12", "m36"];
const LABEL: Record<PeriodKey, string> = { d1: "1D", w1: "1W", m1: "1M", m3: "3M", m12: "12M", m36: "36M" };
const DAY = 86400;
const iso = (t: number): string => new Date(t * 1000).toISOString().slice(0, 10);
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The change between two levels in the instrument's own units: points for a yield, per cent for a price (a price
 *  measured from zero has none). */
export function change(now: number | null | undefined, then: number | null | undefined, units: Units): number | null {
  if (!ok(now) || !ok(then)) return null;
  return units === "yield" ? now - then : then !== 0 ? (now / then - 1) * 100 : null;
}

/** Day-to-day changes in own units: a yield's change of level (points), a price's log return. A future's changes of
 *  contract are taken out (B-27; futures.ts rollSegments): a roll day's change is the change within the new contract,
 *  and none is measured across a roll whose change of contract is not known. */
function steps(bars: Bar[], units: Units, rolls: RollLite[] = []): Array<{ t: number; x: number }> {
  const out: Array<{ t: number; x: number }> = [];
  for (const seg of rolls.length ? rollSegments(bars, rolls) : [bars]) for (let i = 1; i < seg.length; i++) {
    const a = seg[i - 1].c, b = seg[i].c;
    if (units === "yield") { if (ok(a) && ok(b)) out.push({ t: seg[i].t, x: b - a }); }
    else if (a > 0 && b > 0) out.push({ t: seg[i].t, x: Math.log(b / a) });
  }
  return out;
}

/** Realised volatility over `n` sessions, in own units, with where today's reading stands among those of the last
 *  three years.
 *    day    a yield: the standard deviation of its daily changes, in points (the page writes bp a day);
 *           a price: that of its daily log returns, in per cent
 *    ann    the same times √252: a yield's in points a year (bp on the page), a price's the usual annualised per cent
 *    pctl   the share of the daily readings of the last 36 months at or below today's, 0 to 100; null when the
 *           readings do not reach back three years (a short history is never given a percentile)
 *    since  the date of the first reading counted */
export interface VolStat { day: number | null; ann: number | null; pctl: number | null; since: string | null }
export function volStat(bars: Bar[], n: number, units: Units, rolls: RollLite[] = []): VolStat {
  const xs = steps(bars, units, rolls), none: VolStat = { day: null, ann: null, pctl: null, since: null };
  if (n < 2 || xs.length < n) return none;
  // every reading: the sample standard deviation of the n steps ending that day (running sums)
  const reads: Array<{ t: number; sd: number }> = [];
  let s1 = 0, s2 = 0;
  for (let i = 0; i < xs.length; i++) {
    s1 += xs[i].x; s2 += xs[i].x * xs[i].x;
    if (i >= n) { s1 -= xs[i - n].x; s2 -= xs[i - n].x * xs[i - n].x; }
    if (i >= n - 1) reads.push({ t: xs[i].t, sd: Math.sqrt(Math.max(0, (s2 - (s1 * s1) / n) / (n - 1))) });
  }
  // the latest reading, worked out afresh so it carries no rounding from the running sums
  const lastN = xs.slice(-n).map((x) => x.x), m = lastN.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(lastN.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
  const k = units === "yield" ? 1 : 100;
  const end = reads[reads.length - 1].t, start = monthsBack(end, 36);
  const win = reads.filter((r) => r.t > start);
  const covered = reads[0].t <= start + 10 * DAY;   // the readings reach back the full three years
  const pctl = covered && win.length ? (win.filter((r) => r.sd <= sd * (1 + 1e-9)).length / win.length) * 100 : null;
  return { day: sd * k, ann: sd * Math.sqrt(252) * k, pctl, since: covered ? iso(win[0].t) : null };
}

/** The largest rise (a low to a later high) and the largest fall (a high to a later low) of the last `months`
 *  months, in own units, with the dates of both ends. Measured on closes, the last print included. */
export interface Swing { chg: number; from: string; to: string }
export function swings(bars: Bar[], units: Units, months = 12, rolls: RollLite[] = []): { rise: Swing | null; fall: Swing | null } {
  const end = bars.length ? bars[bars.length - 1] : null;
  if (!end) return { rise: null, fall: null };
  const start = monthsBack(end.t, months);
  let rise: Swing | null = null, fall: Swing | null = null;
  // a future's series on its newest contract's level, cut where a change of contract is not known (futures.ts): no
  // rise or fall is measured across a roll's step
  for (const seg of rolls.length ? rollSegments(bars, rolls) : [bars]) {
    let lo: Bar | null = null, hi: Bar | null = null;
    for (const b of seg) {
      if (b.t < start || !ok(b.c)) continue;
      if (!lo || b.c < lo.c) lo = b;
      if (!hi || b.c > hi.c) hi = b;
      const up = change(b.c, lo.c, units), dn = change(b.c, hi.c, units);
      if (up != null && up > 0 && (!rise || up > rise.chg)) rise = { chg: up, from: iso(lo.t), to: iso(b.t) };
      if (dn != null && dn < 0 && (!fall || dn < fall.chg)) fall = { chg: dn, from: iso(hi.t), to: iso(b.t) };
    }
  }
  return { rise, fall };
}

/** σ vs 1M avg's 21 closes, by the database's rule (fn_table_stats, and table.ts for a roll since the newest booked
 *  close): the last 21 booked closes; a future's set on its newest contract's level (futures.ts rollSegments: the closes
 *  before a roll times the new contract's own close over the series'), and none at all where a change of contract among
 *  them, or since the last of them, is not known (B-27: σ vs 1M avg is never measured across a change of contract). */
function closes21(bars: Bar[], rolls: RollLite[]): number[] {
  if (!rolls.length || !bars.length) return bars.slice(-21).map((b) => b.c);
  const lastD = iso(bars[bars.length - 1].t);
  if (rolls.some((r) => r.d > lastD && !(r.prevClose != null && r.prevClose > 0))) return [];
  const segs = rollSegments(bars, rolls);
  return (segs[segs.length - 1] ?? []).slice(-21).map((b) => b.c);
}

/** The statistics the market table keeps (fn_table_stats), worked out the same way for a series it does not keep:
 *  the last 21 closes' mean and sample deviation (σ vs 1M avg), the highest and lowest of the last 252 closes (the 52W
 *  range, with the dates here), and the mean of the last 200 (vs 200D: points for a yield, per cent for a price). The
 *  last print is set against them; the closes are the booked ones. A future's σ vs 1M avg leaves its changes of
 *  contract out as the table's does (B-27): `rolls` are those up to the last print's session (closes21). */
export interface SeriesStats { z1m: number | null; pos52: number | null; hi: number | null; hiDate: string | null; lo: number | null; loDate: string | null; vs200: number | null }
export function seriesStats(bars: Bar[], last: number | null, units: Units, rolls: RollLite[] = []): SeriesStats {
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const c21 = closes21(bars, rolls), c200 = bars.slice(-200).map((b) => b.c), b252 = bars.slice(-252);
  let z1m: number | null = null;
  if (ok(last) && c21.length === 21) { const m = mean(c21), sd = Math.sqrt(c21.reduce((a, x) => a + (x - m) ** 2, 0) / 20); z1m = sd > 0 ? (last - m) / sd : null; }
  let hi: Bar | null = null, lo: Bar | null = null;
  for (const b of b252) { if (!hi || b.c > hi.c) hi = b; if (!lo || b.c < lo.c) lo = b; }
  const pos52 = ok(last) && hi && lo && hi.c > lo.c ? ((last - lo.c) / (hi.c - lo.c)) * 100 : null;
  const m200 = c200.length === 200 ? mean(c200) : null;
  return { z1m, pos52, hi: hi?.c ?? null, hiDate: hi ? iso(hi.t) : null, lo: lo?.c ?? null, loDate: lo ? iso(lo.t) : null, vs200: m200 == null ? null : change(last, m200, units) };
}

/** The closes each window is measured from, by the market table's rule (fn_table_anchors), for a series it does not
 *  keep: the reference day is the later of the last close and the last print; 1D is the last close before it, 1W the
 *  last on or before seven days earlier, 1M to 36M the last on or before the same day that many months earlier. */
export function anchorsOf(bars: Bar[], refT: number): Record<PeriodKey, Bar | null> {
  const ref = Math.floor(refT / DAY) * DAY;
  return { d1: barOnOrBefore(bars, ref - DAY), w1: barOnOrBefore(bars, ref - 7 * DAY), m1: barOnOrBefore(bars, monthsBack(ref, 1)), m3: barOnOrBefore(bars, monthsBack(ref, 3)), m12: barOnOrBefore(bars, monthsBack(ref, 12)), m36: barOnOrBefore(bars, monthsBack(ref, 36)) };
}

/** The market table's row (table.ts TableRow) as far as the page needs it; the chart tile is drawn from it. */
export interface RowLike {
  symbol: string; name: string; cls: string; group: string; market: string; currency: string; decimals: number; proxyFor?: string; order: number;
  last: number | null; lastAt: string | null; live: boolean; source?: string;
  closes: Partial<Record<PeriodKey, number | null>>; closeDates: Partial<Record<PeriodKey, string | null>>;
  pct: Partial<Record<PeriodKey, number | null>>; chg?: Partial<Record<PeriodKey, number | null>>;
  z1m?: number | null; pos52?: number | null; vs200?: number | null;
  marketTab?: boolean; chart?: boolean;
}
/** The instruments table's row (instruments). */
export interface InstrumentDef { symbol: string; name: string; cls: string; grp: string; market: string; currency: string; decimals: number; provider: string; provider_symbol?: string | null; proxy_for?: string | null }
/** What Yahoo's quote gives (yahoo.ts QuoteRow), as far as the page needs it. */
export interface QuoteLike { name: string | null; quoteType: string | null; currency: string | null; exchange: string | null; price: number | null; prevClose: number | null; time: number | null; open: number | null; high: number | null; low: number | null; volume?: number | null }

/** Yahoo's kinds of quote that get an instrument's page; a share, a fund or an ETF keeps a stock's (an ETF's volume
 *  and short interest are on that page today). */
export const INSTRUMENT_QUOTES: ReadonlySet<string> = new Set(["INDEX", "CURRENCY", "FUTURE", "CRYPTOCURRENCY"]);
/** A yield read from an official publisher's stored curve: no quote, no session, published once a day. */
export const isOfficial = (provider: string | null | undefined): boolean => provider === "treasury" || provider === "mof" || provider === "curve";

// who publishes a yield read from a stored curve (as the watchlist names them, watchrow.ts sourceName)
const CURVE_SOURCES: Array<[RegExp, string]> = [[/^UST/, "US Treasury"], [/^JGB/, "Japan MOF"], [/^DE\d/, "Bundesbank"], [/^GB\d/, "Bank of England"], [/^EA\d/, "ECB"], [/^CA\d/, "Bank of Canada"]];
export function publisher(provider: string | null | undefined, symbol: string): string {
  if (provider === "treasury") return "US Treasury";
  if (provider === "mof") return "Japan MOF";
  if (provider === "curve") return CURVE_SOURCES.find(([re]) => re.test(symbol))?.[1] ?? "official yield curve";
  return "Yahoo Finance";
}

/** The glossary's word for an instrument's class (the designer's §3.1): a currency is FX, a yield Rates. */
const KIND: Record<string, string> = { Currency: "FX", "Fixed income": "Rates", Equities: "Equities", Futures: "Futures", Commodities: "Commodities", Volatility: "Volatility", Crypto: "Crypto" };
const QUOTE_CLASS: Record<string, { cls: string; group: string }> = { INDEX: { cls: "Equities", group: "equity" }, CURRENCY: { cls: "Currency", group: "fx" }, CRYPTOCURRENCY: { cls: "Crypto", group: "fx" }, FUTURE: { cls: "Futures", group: "cmdty" } };

/** The decimals of a level that has no instruments row: a yield 3, a pair 4 under 10 and 3 from 10, a coin none from
 *  1,000, anything else 2 (an index or a future, as the instruments table writes them). */
export function quoteDecimals(units: Units, cls: string, v: number | null): number {
  if (units === "yield") return 3;
  if (cls === "Currency") return v != null && Math.abs(v) < 10 ? 4 : 3;
  if (cls === "Crypto") return v != null && Math.abs(v) >= 1000 ? 0 : 2;
  return 2;
}

export interface InstrumentInput {
  symbol: string;
  def: InstrumentDef | null;   // the instruments table's row: a Monitor instrument
  row: RowLike | null;         // its market-table row, when the table carries it
  quote: QuoteLike | null;     // Yahoo's quote; none for an official yield, nor when Yahoo did not answer
  bars: Bar[];                 // daily closes, oldest first: the stored ones for a Monitor instrument, Yahoo's otherwise
  yieldQuote: boolean;         // a quote outside the table that is a yield (watchrow.ts isYieldQuote: ^IRX)
  now: number;                 // ms
  rolls?: RollLite[];          // a future's changes of contract, which its volatility and largest moves leave out (B-27)
}
export interface InstrumentFigures {
  units: Units; kind: string; monitor: boolean; official: boolean; source: string;
  row: RowLike;
  asOf: string | null; asOfKind: "print" | "close" | "published" | null;
  last: number | null; prev: { level: number | null; date: string | null }; day: number | null;
  session: { open: number | null; low: number | null; high: number | null; at: string | null } | null;
  range52: { lo: number | null; loDate: string | null; hi: number | null; hiDate: string | null; pos: number | null; fromHi: number | null; fromLo: number | null };
  z1m: number | null; vs200: number | null;
  vol: { m1: VolStat; m3: VolStat; m12: VolStat };
  rise: Swing | null; fall: Swing | null;
  perf: Array<{ h: string; from: string | null; base: number | null; chg: number | null }>;
  history: { from: string | null; to: string | null; n: number; source: string };
  rollsOut?: number;           // a future: the changes of contract left out of its volatility and largest moves
}

/** A future's contract and its changes of contract, as its page shows them (B-27; pagefeed.ts reads them): the named
 *  contract its last price is from, its month and expiry, when it was read, from when the Monitor's record runs, and every
 *  roll recorded with its change of contract (null where not measured). */
export interface FuturesInfo { contract: string | null; month: string | null; expires: string | null; seen: string | null; seenAt: string | null; knownFrom: string | null; rolls: RollView[]; lastRoll: RollView | null; source: string }
export function futuresInfo(latest: { d: string; contract: string; expires: string | null; seen_at?: string | null } | null, rolls: Array<{ d: string; from_contract: string | null; to_contract: string; prev_close: number | null; source: string }>, first: string | null, bars: Bar[]): FuturesInfo {
  const views = rollViews(rolls, bars), from = [first, ...rolls.map((r) => r.d)].filter((d): d is string => !!d).sort()[0] ?? null;
  return { contract: latest?.contract ?? null, month: latest ? contractName(latest.contract)?.label ?? null : null, expires: latest?.expires ?? null, seen: latest?.d ?? null, seenAt: latest?.seen_at ?? null,
    knownFrom: from, rolls: views, lastRoll: views.length ? views[views.length - 1] : null, source: "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol)" };
}

/** The figures of an instrument's page. */
export function instrumentFigures(i: InstrumentInput): InstrumentFigures {
  const { symbol, def, quote: q, bars } = i;
  const official = !!def && isOfficial(def.provider);
  const units: Units = def ? (def.grp === "rates" && !symbol.endsWith("=F") ? "yield" : "price") : i.yieldQuote ? "yield" : "price";
  const qc = q?.quoteType ? QUOTE_CLASS[q.quoteType] : undefined;
  const cls = def?.cls ?? (units === "yield" ? "Fixed income" : qc?.cls ?? "Equities");
  const group = def?.grp ?? (units === "yield" ? "rates" : qc?.group ?? "equity");
  // the booked closes: a plain quote's daily bars end with today's, still moving while its market is open, which the
  // statistics set the last print against (as the table sets its print against the booked closes); the stored closes
  // of a Monitor instrument are booked ones already
  const qDay = q?.time != null ? Math.floor(q.time / DAY) * DAY : null;
  const booked = !def && qDay != null && bars.length > 1 && bars[bars.length - 1].t >= qDay ? bars.slice(0, -1) : bars;
  const lastBar = booked.length ? booked[booked.length - 1] : null;
  // the row the chart and MARKETS share: the table's own, or one made the same way from the quote and the closes
  let row: RowLike;
  if (i.row) row = { ...i.row };
  else {
    const last = official || q?.price == null ? lastBar?.c ?? null : q.price;
    const lastAt = official || q?.time == null ? (lastBar ? `${iso(lastBar.t)}T00:00:00Z` : null) : new Date(q.time * 1000).toISOString();
    // the reference day is the later of the last booked close and the print (fn_table_anchors): an official yield's
    // day is then its last published figure against the one before, a quote's its print against the last close (the
    // quote's own previous close where it gives one)
    const an = anchorsOf(booked, Math.max(lastBar?.t ?? 0, official ? 0 : qDay ?? 0) || Math.floor(i.now / 1000));
    const closes: RowLike["closes"] = {}, closeDates: RowLike["closeDates"] = {}, pct: RowLike["pct"] = {}, chg: NonNullable<RowLike["chg"]> = {};
    for (const k of PERIOD_KEYS) {
      const a = an[k], base = k === "d1" && !official && q?.prevClose != null ? q.prevClose : a?.c ?? null;
      closes[k] = base; closeDates[k] = a ? iso(a.t) : null;
      pct[k] = base != null && last != null && base !== 0 ? (last / base - 1) * 100 : null;
      chg[k] = base != null && last != null ? last - base : null;
    }
    // a future's σ vs 1M avg against the closes on the contract its print is on (B-27): the rolls up to the print's
    // session (CME's trade date), or up to the last booked close where there is no print
    const printDay = !i.rolls?.length ? null : !official && q?.price != null && q.time != null ? tradeDate(q.time) : lastBar ? iso(lastBar.t) : null;
    const st = seriesStats(booked, last, units, (i.rolls ?? []).filter((r) => printDay == null || r.d <= printDay));
    row = { symbol, name: def?.name ?? q?.name ?? symbol, cls, group, market: def?.market ?? (cls === "Currency" || cls === "Crypto" ? "FX" : "NYSE"), currency: def?.currency ?? q?.currency ?? "", decimals: def?.decimals ?? quoteDecimals(units, cls, last), ...(def?.proxy_for ? { proxyFor: def.proxy_for } : {}), order: 0,
      last, lastAt, live: false, source: def?.provider ?? "yahoo", closes, closeDates, pct, chg, z1m: st.z1m, pos52: st.pos52, vs200: st.vs200 };
  }
  const last = row.last;
  const lev = (k: PeriodKey) => row.closes[k] ?? null;
  const chgOf = (k: PeriodKey): number | null => (units === "yield" ? (row.chg?.[k] ?? change(last, lev(k), units)) : (row.pct[k] ?? change(last, lev(k), units)));
  // the 52-week range: the highest and lowest of the last 252 closes, as the table's (its position is the table's own)
  const st = seriesStats(booked, last, units);
  const pos = row.pos52 ?? st.pos52;
  // the largest rise and fall run to the last print when it is newer than the last close
  const lastT = row.lastAt ? Date.parse(row.lastAt) / 1000 : NaN;
  const withLast = ok(last) && Number.isFinite(lastT) && (!lastBar || Math.floor(lastT / DAY) * DAY > lastBar.t) ? [...booked, { t: Math.floor(lastT / DAY) * DAY, c: last }] : booked;
  const rolls = i.rolls ?? [];
  const { rise, fall } = swings(withLast, units, 12, rolls);
  const closeDay = row.lastAt && /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(row.lastAt) ? row.lastAt.slice(0, 10) : null;
  const asOfKind = row.lastAt == null ? null : official ? "published" : closeDay ? "close" : "print";
  return {
    units, kind: KIND[cls] ?? cls, monitor: !!def, official, source: def ? publisher(def.provider, symbol) : "Yahoo Finance",
    row,
    asOf: row.lastAt == null ? null : asOfKind === "print" ? row.lastAt : closeDay ?? row.lastAt.slice(0, 10), asOfKind,
    last, prev: { level: lev("d1"), date: row.closeDates.d1 ?? null }, day: chgOf("d1"),
    // the session's open and range come with a quote; an official yield has neither (B: "the day's range is a dash")
    session: official || !q ? null : { open: q.open ?? null, low: q.low ?? null, high: q.high ?? null, at: q.time ? new Date(q.time * 1000).toISOString() : null },
    // the position as MARKETS has it (a print beyond the range reads past 0 or 100; the page's bar stops at the ends)
    range52: { lo: st.lo, loDate: st.loDate, hi: st.hi, hiDate: st.hiDate, pos, fromHi: change(last, st.hi, units), fromLo: change(last, st.lo, units) },
    // σ vs 1M avg is MARKETS' own (the table's row, or the row made the same way above): where the table gives none
    // (a future's 21 closes hold a change of contract that is not known) the page shows none, never a figure worked out
    // across it from the raw closes (the reviewer's F1, 20 Nov 2026)
    z1m: row.z1m ?? null, vs200: row.vs200 ?? st.vs200,
    vol: { m1: volStat(booked, 21, units, rolls), m3: volStat(booked, 63, units, rolls), m12: volStat(booked, 252, units, rolls) },
    rise, fall,
    perf: PERIOD_KEYS.map((k) => ({ h: LABEL[k], from: row.closeDates[k] ?? null, base: lev(k), chg: chgOf(k) })),
    history: { from: bars.length ? iso(bars[0].t) : null, to: lastBar ? iso(lastBar.t) : null, n: bars.length, source: def ? (official ? publisher(def.provider, symbol) : "the Monitor's stored daily closes") : "Yahoo Finance daily closes" },
    ...(rolls.length ? { rollsOut: rolls.filter((r) => bars.length && r.d > iso(bars[0].t)).length } : {}),
  };
}

/** The fields a stock's page reads, filled for an instrument, so the page of before 20 Nov 2026 (which shows every
 *  name as a stock) still draws it: the same figures it showed (its changes, range, volatility and largest fall worked
 *  out as for a stock), and empty where a stock's figure has no meaning (no shares, no statements, no big moves). */
export function legacyStockFields(f: InstrumentFigures, q: QuoteLike | null, bars: Bar[]) {
  const last = f.last, prev = f.prev.level;
  return {
    exchange: q?.exchange ?? null, currency: f.row.currency || null, quoteType: q?.quoteType ?? null,
    sector: null, industry: null, indices: [] as string[],
    price: last, prevClose: prev, pct: change(last, prev, "price"), asOf: f.asOfKind === "print" ? f.asOf : f.asOf ? `${f.asOf.slice(0, 10)}T00:00:00Z` : null,
    open: f.session?.open ?? null, high: f.session?.high ?? null, low: f.session?.low ?? null, volume: q?.volume ?? null, mcap: null,
    benchmarks: [] as Array<{ symbol: string; name: string; note: string | null }>,
    perf: perfRows(bars, [], last, prev), range: range52w(bars, last),
    vol: { m1: realisedVol(bars, 21), m3: realisedVol(bars, 63), m12: realisedVol(bars, 252) },
    beta: [] as Array<{ beta: number | null; corr: number | null; days: number }>, drawdown: maxDrawdown(bars, 12),
    turnover: { d20: { shares: null, value: null }, d60: { shares: null, value: null } },
    shares: { outstanding: null, diluted: null, dilutedNote: null, treasury: null, float: null, asOf: null, source: null },
    short: null, moves: { eligible: false, rule: "classic" as const, rows: [] as never[] },
    earningsAt: null, earningsEst: null,
    val: { pe: null, peGuide: null, pb: null, yield: null, yieldGuide: null, basis: null },
    fin: null, finNote: "Statements are available for equities only.",
  };
}
