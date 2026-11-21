// Dev-only: an instrument's page for the mock feed (`VITE_DEV_MOCK=1`), in the shape the server's `stock` action sends
// for a currency, a yield, a commodity, a future or an index (supabase/functions/_shared/instrstats.ts, instrfeed.ts).
// Nothing here is a real figure: the levels are the mock's own random walks (lib/mock.ts), the events and headlines
// the stand-in rows (lib/standin.json). The figures follow the server's rules closely enough to judge the layout:
// a yield's changes in points (bp on the page), a price's in per cent; volatility over 21, 63 and 252 sessions with
// its percentile among three years of readings; the largest rise and fall of twelve months.
import type { Alert, EconEvent, NewsItem, PeriodKey, TableRow } from "./types";
import type { FuturesInfo, InstrumentInfo, InstrumentPage, Swing, Units, VolStat } from "./instrument";
import { monthOf } from "./futures";
import type { StockFeed } from "./stock";

/** The words an instrument's headlines are matched by: the server's lists (instrfeed.ts newsWords) for the mock's
 *  instruments, checked against them in sim/logic.test.ts. */
export const MOCK_WORDS: Record<string, string[]> = {
  "USDJPY=X": ["yen", "JPY", "BoJ", "Bank of Japan"],
  "EURUSD=X": ["euro", "EUR", "ECB", "European Central Bank"],
  "DX-Y.NYB": ["dollar", "greenback", "USD", "Fed", "Federal Reserve", "FOMC"],
  "^TNX": ["Treasury", "Treasuries", "Fed", "Federal Reserve", "FOMC"],
  UST2Y: ["Treasury", "Treasuries", "Fed", "Federal Reserve", "FOMC"],
  JGB10Y: ["JGB", "JGBs", "Japanese government bond", "Japanese government bonds", "BoJ", "Bank of Japan"],
  DE10Y: ["Bund", "Bunds", "German bond", "German bonds", "ECB", "European Central Bank"],
  "GC=F": ["gold", "bullion"],
  "CL=F": ["oil", "crude", "Brent", "WTI", "OPEC"],
  "^STOXX50E": ["Euro Stoxx", "Stoxx 50", "European stocks", "European shares"],
  "^SOX": ["semiconductor", "semiconductors", "chipmaker", "chipmakers"],
  "^VIX": ["VIX", "fear gauge"],
  "NKD=F": ["Nikkei"],
};
/** The currencies of an instrument's calendar (instrfeed.ts eventCurrencies): a pair's two, the dollar index's dollar,
 *  an index future's index's currency and then the one it is quoted in (the Nikkei 225 future: JPY and USD),
 *  otherwise the currency it is quoted in. */
const MOCK_FUTURE_HOME: Record<string, string> = { "NKD=F": "JPY", "ES=F": "USD", "NQ=F": "USD", "YM=F": "USD", "RTY=F": "USD" };
export function mockCcys(symbol: string, name: string, currency: string): string[] {
  if (symbol === "DX-Y.NYB") return ["USD"];
  const n = /^([A-Z]{3})\/([A-Z]{3})$/.exec(name), home = MOCK_FUTURE_HOME[symbol];
  if (n) return [n[1], n[2]];
  if (home) return [...new Set([home, ...(currency ? [currency] : [])])];
  return currency ? [currency === "CNH" ? "CNY" : currency] : [];
}

const DAY = 86400, iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const KEYS: PeriodKey[] = ["d1", "w1", "m1", "m3", "m12", "m36"], LABEL: Record<PeriodKey, string> = { d1: "1D", w1: "1W", m1: "1M", m3: "3M", m12: "12M", m36: "36M" };
const chg = (a: number | null | undefined, b: number | null | undefined, u: Units) => (a == null || b == null ? null : u === "yield" ? a - b : b !== 0 ? (a / b - 1) * 100 : null);
const monthsBack = (t: number, m: number) => { const d = new Date(t * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, Math.min(d.getUTCDate(), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m + 1, 0)).getUTCDate())) / 1000; };
const onOrBefore = (bars: Array<{ t: number; c: number }>, t: number) => { let a: { t: number; c: number } | null = null; for (const b of bars) { if (b.t <= t) a = b; else break; } return a; };

/** A future's series with its changes of contract taken out, by the server's rule (supabase/functions/_shared/futures.ts
 *  rollSegments): the closes before a roll times the new contract's own close over the series' own; cut where that close
 *  is not known. sim/logic.test.ts checks the two give the same figures. */
type MockRoll = { d: string; prevClose: number | null };
export function mockSegments(bars: Array<{ t: number; c: number }>, rolls: MockRoll[]): Array<Array<{ t: number; c: number }>> {
  if (!rolls.length) return [bars];
  const rs = [...rolls].sort((a, b) => b.d.localeCompare(a.d)), out: Array<Array<{ t: number; c: number }>> = [];
  let seg: Array<{ t: number; c: number }> = [], f = 1, k = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i], d = iso(b.t);
    while (k < rs.length && rs[k].d > d) { const r = rs[k++]; if (r.prevClose != null && r.prevClose > 0 && b.c > 0) f *= r.prevClose / b.c; else { if (seg.length) out.unshift(seg.reverse()); seg = []; f = 1; } }
    seg.push(f === 1 ? b : { t: b.t, c: b.c * f });
  }
  if (seg.length) out.unshift(seg.reverse());
  return out;
}
function vol(bars: Array<{ t: number; c: number }>, n: number, u: Units, rolls: MockRoll[] = []): VolStat {
  const xs: Array<{ t: number; x: number }> = [];
  for (const sg of mockSegments(bars, rolls)) for (let i = 1; i < sg.length; i++) xs.push({ t: sg[i].t, x: u === "yield" ? sg[i].c - sg[i - 1].c : Math.log(sg[i].c / sg[i - 1].c) });
  if (xs.length < n) return { day: null, ann: null, pctl: null, since: null };
  const sd = (w: number[]) => { const m = w.reduce((a, x) => a + x, 0) / w.length; return Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / (w.length - 1)); };
  const reads: Array<{ t: number; sd: number }> = [];
  for (let i = n - 1; i < xs.length; i++) reads.push({ t: xs[i].t, sd: sd(xs.slice(i - n + 1, i + 1).map((z) => z.x)) });
  const now = reads[reads.length - 1], start = monthsBack(now.t, 36), win = reads.filter((r) => r.t > start), covered = reads[0].t <= start + 10 * DAY, k = u === "yield" ? 1 : 100;
  return { day: now.sd * k, ann: now.sd * Math.sqrt(252) * k, pctl: covered ? (win.filter((r) => r.sd <= now.sd * (1 + 1e-9)).length / win.length) * 100 : null, since: covered ? iso(win[0].t) : null };
}
function swings(bars: Array<{ t: number; c: number }>, u: Units, rolls: MockRoll[] = []): { rise: Swing | null; fall: Swing | null } {
  const end = bars[bars.length - 1], start = monthsBack(end.t, 12);
  let rise: Swing | null = null, fall: Swing | null = null;
  for (const sg of mockSegments(bars, rolls)) {
    let lo: { t: number; c: number } | null = null, hi: { t: number; c: number } | null = null;
    for (const b of sg) {
      if (b.t < start) continue;
      if (!lo || b.c < lo.c) lo = b; if (!hi || b.c > hi.c) hi = b;
      const up = chg(b.c, lo.c, u), dn = chg(b.c, hi.c, u);
      if (up != null && up > 0 && (!rise || up > rise.chg)) rise = { chg: up, from: iso(lo.t), to: iso(b.t) };
      if (dn != null && dn < 0 && (!fall || dn < fall.chg)) fall = { chg: dn, from: iso(hi.t), to: iso(b.t) };
    }
  }
  return { rise, fall };
}

/** A row in the market table's shape for a series the stand-in table does not carry: its anchors and statistics by the
 *  table's rules. `bars` end with the last close; `last` is the print. */
export function rowFromBars(def: Pick<TableRow, "symbol" | "name" | "cls" | "group" | "market" | "currency" | "decimals">, bars: Array<{ t: number; c: number }>, last: number, lastAt: string): TableRow {
  const u: Units = def.group === "rates" && !def.symbol.endsWith("=F") ? "yield" : "price", end = bars[bars.length - 1].t + DAY;
  const at: Record<PeriodKey, number> = { d1: end - DAY, w1: end - 7 * DAY, m1: monthsBack(end, 1), m3: monthsBack(end, 3), m12: monthsBack(end, 12), m36: monthsBack(end, 36) };
  const closes: TableRow["closes"] = {}, closeDates: TableRow["closeDates"] = {}, pct: TableRow["pct"] = {};
  for (const k of KEYS) { const b = onOrBefore(bars, at[k]); closes[k] = b?.c ?? null; closeDates[k] = b ? iso(b.t) : null; pct[k] = chg(last, b?.c, "price"); }
  const c21 = bars.slice(-21).map((b) => b.c), m21 = c21.reduce((a, x) => a + x, 0) / c21.length, sd21 = Math.sqrt(c21.reduce((a, x) => a + (x - m21) ** 2, 0) / (c21.length - 1));
  const c252 = bars.slice(-252).map((b) => b.c), hi = Math.max(...c252), lo = Math.min(...c252), m200 = bars.slice(-200).reduce((a, b) => a + b.c, 0) / Math.min(200, bars.length);
  return { ...def, order: 0, last, lastAt, live: false, closes, closeDates, pct, z1m: sd21 > 0 ? (last - m21) / sd21 : null, pos52: hi > lo ? ((last - lo) / (hi - lo)) * 100 : null, vs200: chg(last, m200, u) };
}

const CLS_WORD: Record<string, string> = { Currency: "FX", "Fixed income": "Rates", Equities: "Equities", Futures: "Futures", Commodities: "Commodities", Volatility: "Volatility", Crypto: "Crypto" };

/** The instrument's page as the server sends it: a stock's fields, empty where a stock's figure has no meaning, and
 *  `instrument` with its figures, its calendar and its headlines. */
/** A stand-in future's record of contracts (B-27): the contract it names, its expiry, the first day recorded, its rolls. */
export interface MockFutures { contract: string; expires: string; since: string; rolls: Array<{ d: string; from: string | null; to: string; prevClose: number | null }> }
export function mockInstrument(row: TableRow, bars: Array<{ t: number; c: number }>, o: { official: string | null; monitor: boolean; futures?: MockFutures | null; calendar: EconEvent[]; news: NewsItem[]; alerts: Alert[]; now: number }): InstrumentPage {
  const u: Units = row.group === "rates" && !row.symbol.endsWith("=F") ? "yield" : "price";
  const last = row.last, c252 = bars.slice(-252);
  let hiB = c252[0], loB = c252[0];
  for (const b of c252) { if (b.c > hiB.c) hiB = b; if (b.c < loB.c) loB = b; }
  const withLast = last != null && !o.official ? [...bars, { t: bars[bars.length - 1].t + DAY, c: last }] : bars;
  const rolls = (o.futures?.rolls ?? []).map((r) => ({ d: r.d, prevClose: r.prevClose }));
  const { rise, fall } = swings(withLast, u, rolls);
  // the stand-in record as the server sends it (supabase/functions/_shared/instrstats.ts futuresInfo)
  const views = (o.futures?.rolls ?? []).map((r) => { const before = [...bars].reverse().find((b) => iso(b.t) < r.d)?.c ?? null; return { d: r.d, from: r.from, to: r.to, fromMonth: r.from ? monthOf(r.from) : null, toMonth: monthOf(r.to), step: r.prevClose != null && before ? (r.prevClose / before - 1) * 100 : null, source: "stand-in (the local copy)" }; });
  const futures: FuturesInfo | undefined = o.futures ? { contract: o.futures.contract, month: monthOf(o.futures.contract), expires: o.futures.expires, seen: iso(bars[bars.length - 1].t), seenAt: new Date(o.now).toISOString(), knownFrom: [o.futures.since, ...views.map((v) => v.d)].sort()[0], rolls: views, lastRoll: views.length ? views[views.length - 1] : null, source: "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol)" } : undefined;
  const day = u === "yield" ? chg(last, row.closes.d1, u) : row.pct.d1 ?? null;
  const ccys = mockCcys(row.symbol, row.name, row.currency), from = o.now - 5 * 86400e3, to = o.now + 8 * 86400e3;
  const events = o.calendar.filter((e) => ccys.includes(e.currency ?? e.country) && Date.parse(e.at) >= from && Date.parse(e.at) <= to).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const words = MOCK_WORDS[row.symbol] ?? [];
  const re = words.length ? new RegExp(`(?:^|[^A-Za-z0-9_])(?:${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z0-9_])`, "i") : null;
  const since = o.now - 30 * 86400e3;
  const feed: StockFeed = {
    days: 30,
    news: re ? o.news.filter((n) => re.test(n.title) && Date.parse(n.publishedAt) >= since).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 60).map((n) => ({ id: n.id, publishedAt: n.publishedAt, source: n.source, title: n.title, url: n.url, category: n.category ?? null })) : [],
    // a σ move keeps its σ and its window and source, as the server's alertRow (pagefeed.ts)
    alerts: o.alerts.filter((a) => a.symbol === row.symbol && Date.parse(a.at) >= since).slice(0, 40).map((a) => ({ id: a.id, at: a.at, kind: a.kind, pct: a.pct, market: a.market, msg: a.msg, url: a.url ?? null, ...(a.kind === "sigma" ? { sigma: a.sigma ?? null, note: a.note ?? null } : {}) })),
  };
  const closeDay = row.lastAt && /T00:00:00(\.000)?Z$/.test(row.lastAt) ? row.lastAt.slice(0, 10) : null;
  const asOfKind = o.official ? "published" : closeDay ? "close" : "print";
  const instrument: InstrumentInfo = {
    units: u, kind: CLS_WORD[row.cls] ?? row.cls, monitor: o.monitor, official: !!o.official, source: o.official ?? "Yahoo Finance", row,
    asOf: asOfKind === "print" ? row.lastAt : closeDay ?? row.lastAt?.slice(0, 10) ?? null, asOfKind,
    last, prev: { level: row.closes.d1 ?? null, date: row.closeDates.d1 ?? null }, day,
    session: o.official || last == null ? null : { open: last * (u === "yield" ? 1 : 0.998), low: last - (u === "yield" ? 0.031 : last * 0.004), high: last + (u === "yield" ? 0.024 : last * 0.003), at: row.lastAt },
    range52: { lo: loB.c, loDate: iso(loB.t), hi: hiB.c, hiDate: iso(hiB.t), pos: row.pos52 ?? null, fromHi: chg(last, hiB.c, u), fromLo: chg(last, loB.c, u) },
    z1m: row.z1m ?? null, vs200: row.vs200 ?? null,
    vol: { m1: vol(bars, 21, u, rolls), m3: vol(bars, 63, u, rolls), m12: vol(bars, 252, u, rolls) },
    rise, fall,
    perf: KEYS.map((k) => ({ h: LABEL[k], from: row.closeDates[k] ?? null, base: row.closes[k] ?? null, chg: u === "yield" ? chg(last, row.closes[k], u) : row.pct[k] ?? null })),
    history: { from: iso(bars[0].t), to: iso(bars[bars.length - 1].t), n: bars.length, source: o.official ?? (o.monitor ? "the Monitor's stored daily closes" : "Yahoo Finance daily closes") },
    events: { ccys, from: new Date(from).toISOString(), to: new Date(to).toISOString(), rows: events },
    matched: words,
    ...(futures ? { futures, rollsOut: rolls.length } : {}),
  };
  const none = { outstanding: null, diluted: null, dilutedNote: null, treasury: null, float: null, asOf: null, source: null };
  return {
    symbol: row.symbol, name: row.name, exchange: null, currency: row.currency, quoteType: u === "yield" ? null : row.cls === "Currency" ? "CURRENCY" : row.cls === "Futures" || row.cls === "Commodities" ? "FUTURE" : "INDEX",
    sector: null, industry: null, indices: [], price: last, prevClose: row.closes.d1 ?? null, pct: chg(last, row.closes.d1, "price"), asOf: row.lastAt,
    open: instrument.session?.open ?? null, high: instrument.session?.high ?? null, low: instrument.session?.low ?? null, volume: null, mcap: null,
    benchmarks: [], perf: [], range: { hi: hiB.c, hiDate: iso(hiB.t), lo: loB.c, loDate: iso(loB.t), fromHi: chg(last, hiB.c, "price"), fromLo: chg(last, loB.c, "price"), pos: row.pos52 ?? null },
    vol: { m1: null, m3: null, m12: null }, beta: [], drawdown: { pct: null, from: null, to: null },
    turnover: { d20: { shares: null, value: null }, d60: { shares: null, value: null } }, shares: none, short: null,
    moves: { eligible: false, rule: "classic", rows: [] }, earningsAt: null, earningsEst: null,
    val: { pe: null, peGuide: null, pb: null, yield: null, yieldGuide: null, basis: null }, fin: null, finNote: "Statements are available for equities only.",
    feed, instrument,
  };
}
