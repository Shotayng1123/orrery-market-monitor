// Dev-only mock feed: `VITE_DEV_MOCK=1 npm run dev` serves synthetic data so the panels can be laid out and
// checked before the backend exists. Deterministic random walks with realistic volatility scaling, labelled
// MOCK in the UI. Never active in production builds (gated on import.meta.env.DEV in useApi).
// The calendar, headlines, research, earnings dates, alerts, the watchlist and the policy rates are the stand-in
// rows of ./standin.json, the same rows the browser checks answer with (web/e2e/standin.cjs), in the shape each
// server route sends them. Switches, all in the dev server only:
//   ?mock=empty in the address        every tab with no rows (the server's answers when its tables are empty)
//   om_mock_watch in the storage      the stand-in watchlist of this browser (the star, the add box and removal work)
//   om_mock_bare = "a,b"              those actions answered as one the mock does not know ({ rows: [] })
//   om_mock_stale = "1", om_mock_live = "1"   a stopped price feed; EQUITIES while its market is open (below)
//   om_mock_flow = JSON {quoteAt?, mfAt?, mfD?}   EQUITIES' flow stamps as given (a weekend's dated turnover time, a
//                                     net flow from another pull); without it, the page's clock
//   om_mock_now = an ISO time         the page's clock starts there (lib/mockclock.ts) and the market rows follow the
//                                     session table at that moment: a closed market, a midday break, a holiday
//   om_mock_now = "now"               the machine's clock, with the market rows following the session table all the
//                                     same: what the live Monitor would show at this hour (without the key the rows
//                                     keep fixed states, which at most hours contradict the lines beside them)
import { mockStock } from "./mockStock";
import { mockInstrument, rowFromBars } from "./mockInstr";
import standin from "./standin.json";
import { isYield } from "./fmt";
import { dayEnd, FX_BELL, FX_TZ, marketOf, marketStatus, stockMarket, zonedMs, type Market, type MarketId } from "./sessions";
import { partsIn } from "./time";
import type { TableRow, Health, Curve, Series, Alert, EconEvent, NewsItem, Note, Report, PeriodKey, LastSession } from "./types";
import type { Feed, WatchRow } from "../views/Watchlist";
import type { EarningsRow } from "../components/Earnings";
import type { PolicyRow } from "../views/RatesFx";
import type { PolicyStep } from "../components/PolicyChart";
import type { Hit } from "./candidates";
import type { StockFeed } from "./stock";

const MASTER: Array<Pick<TableRow, "symbol" | "name" | "cls" | "group" | "market" | "currency" | "decimals" | "order"> & { base: number; vol: number; proxyFor?: string; marketTab?: boolean; chart?: boolean }> = [
  { symbol: "^N225", name: "Nikkei 225", cls: "Equities", group: "equity", market: "TSE", currency: "JPY", decimals: 2, order: 1, base: 57000, vol: 0.013 },
  { symbol: "1306.T", name: "TOPIX via 1306.T", cls: "Equities", group: "equity", market: "TSE", currency: "JPY", decimals: 1, order: 2, base: 388, vol: 0.011, proxyFor: "TOPIX" },
  { symbol: "^GSPC", name: "S&P 500", cls: "Equities", group: "equity", market: "NYSE", currency: "USD", decimals: 2, order: 3, base: 7376, vol: 0.01 },
  { symbol: "^IXIC", name: "NASDAQ Composite", cls: "Equities", group: "equity", market: "NYSE", currency: "USD", decimals: 2, order: 4, base: 24579, vol: 0.013 },
  { symbol: "^SOX", name: "PHLX Semiconductor (SOX)", cls: "Equities", group: "equity", market: "NYSE", currency: "USD", decimals: 2, order: 5, base: 9390, vol: 0.02 },
  { symbol: "^KS11", name: "KOSPI", cls: "Equities", group: "equity", market: "KRX", currency: "KRW", decimals: 2, order: 8, base: 5059, vol: 0.015 },
  { symbol: "^HSI", name: "Hang Seng", cls: "Equities", group: "equity", market: "HKEX", currency: "HKD", decimals: 2, order: 9, base: 24481, vol: 0.013 },
  { symbol: "000001.SS", name: "Shanghai Composite", cls: "Equities", group: "equity", market: "SSE", currency: "CNY", decimals: 2, order: 10, base: 3649, vol: 0.009 },
  { symbol: "^VIX", name: "VIX", cls: "Volatility", group: "equity", market: "NYSE", currency: "USD", decimals: 2, order: 17, base: 25.6, vol: 0.06 },
  { symbol: "NKD=F", name: "Nikkei 225 future (CME)", cls: "Futures", group: "equity", market: "CME", currency: "USD", decimals: 0, order: 18, base: 58265, vol: 0.013 },
  // The S&P 500's future: in the table as on the live Monitor, where it is a driver on the S&P 500's EQUITIES page and
  // its own page follows CME's hours. Kept off the stand-in MARKETS (no row there, no tile), which the checks count.
  { symbol: "ES=F", name: "S&P 500 E-mini", cls: "Futures", group: "equity", market: "CME", currency: "USD", decimals: 2, order: 19, base: 7391.5, vol: 0.01, marketTab: false, chart: false },
  { symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", currency: "JPY", decimals: 3, order: 21, base: 158.4, vol: 0.005 },
  { symbol: "EURUSD=X", name: "EUR/USD", cls: "Currency", group: "fx", market: "FX", currency: "USD", decimals: 4, order: 22, base: 1.1143, vol: 0.004 },
  { symbol: "DX-Y.NYB", name: "US Dollar Index (DXY)", cls: "Currency", group: "fx", market: "NYSE", currency: "USD", decimals: 3, order: 29, base: 102.28, vol: 0.004 },
  { symbol: "UST2Y", name: "UST 2Y yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "USD", decimals: 3, order: 30, base: 4.51, vol: 0.012 },
  { symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "USD", decimals: 3, order: 32, base: 4.859, vol: 0.01 },
  { symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", group: "rates", market: "TSE", currency: "JPY", decimals: 3, order: 34, base: 2.817, vol: 0.012 },
  { symbol: "CL=F", name: "WTI crude", cls: "Commodities", group: "cmdty", market: "CME", currency: "USD", decimals: 2, order: 36, base: 90.83, vol: 0.02 },
  { symbol: "GC=F", name: "Gold", cls: "Commodities", group: "cmdty", market: "CME", currency: "USD", decimals: 2, order: 38, base: 4074.9, vol: 0.011 },
];

/** Instruments the mock knows that its MARKETS table does not show (the live table carries them): an index without an
 *  EQUITIES page, and the yields read from official curves, published once a day. Their pages and charts use them. */
const EXTRA: typeof MASTER = [
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", cls: "Equities", group: "equity", market: "XETRA", currency: "EUR", decimals: 2, order: 14, base: 5612, vol: 0.011 },
  { symbol: "UST3M", name: "UST 3M bill yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "USD", decimals: 3, order: 75, base: 4.19, vol: 0.004 },
  { symbol: "JGB2Y", name: "JGB 2Y yield", cls: "Fixed income", group: "rates", market: "TSE", currency: "JPY", decimals: 3, order: 76, base: 1.88, vol: 0.01 },
  { symbol: "JGB30Y", name: "JGB 30Y yield", cls: "Fixed income", group: "rates", market: "TSE", currency: "JPY", decimals: 3, order: 77, base: 3.94, vol: 0.009 },
  { symbol: "DE2Y", name: "Bund 2Y yield", cls: "Fixed income", group: "rates", market: "XETRA", currency: "EUR", decimals: 3, order: 78, base: 2.29, vol: 0.012 },
  { symbol: "DE10Y", name: "Bund 10Y yield", cls: "Fixed income", group: "rates", market: "XETRA", currency: "EUR", decimals: 3, order: 79, base: 2.66, vol: 0.011 },
  { symbol: "GB10Y", name: "Gilt 10Y yield", cls: "Fixed income", group: "rates", market: "LSE", currency: "GBP", decimals: 3, order: 80, base: 4.45, vol: 0.01 },
  { symbol: "EA10Y", name: "Euro area AAA 10Y yield", cls: "Fixed income", group: "rates", market: "XETRA", currency: "EUR", decimals: 3, order: 81, base: 2.78, vol: 0.011 },
  { symbol: "CA10Y", name: "Canada 10Y yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "CAD", decimals: 3, order: 82, base: 3.67, vol: 0.01 },
];
/** The publisher of each yield the server reads from an official curve (instrstats.ts publisher). */
const PUBLISHED: Record<string, string> = { UST2Y: "US Treasury", UST3M: "US Treasury", JGB10Y: "Japan MOF", JGB2Y: "Japan MOF", JGB30Y: "Japan MOF", DE2Y: "Bundesbank", DE10Y: "Bundesbank", GB10Y: "Bank of England", EA10Y: "ECB", CA10Y: "Bank of Canada" };
/** The instruments table's provider of each, as the market table sends it in `source` (the seeds: UST2Y "treasury",
 *  JGB10Y "mof", the rest of the official yields "curve"; every other instrument "yahoo"). */
const providerOf = (symbol: string): string => (symbol === "UST2Y" ? "treasury" : symbol === "JGB10Y" ? "mof" : PUBLISHED[symbol] ? "curve" : "yahoo");

// ---- the holiday calendar, and the rows at a set clock (the owner's request of 20 Nov 2026: when a closed market opens) ----
/** The holidays the local copy passes over: the rows of the server's `sessions_cal` as its two migrations write them
 *  (20261107000002_seed.sql and 20261107000010_holidays_verified.sql: Tokyo's and New York's for 2026 and 2027, checked
 *  against JPX's and NYSE's own pages on 7 Nov 2026), so the local copy shows what the live Monitor shows. They are the
 *  Monitor's own calendar, not stand-ins; sim/logic.test.ts checks them against the two files, row for row. */
const HOLIDAYS: Partial<Record<MarketId, string[]>> = {
  TSE: ["2026-01-01", "2026-01-02", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23", "2026-12-31",
    "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-22", "2027-04-29", "2027-05-03", "2027-05-04", "2027-05-05", "2027-07-19", "2027-08-11", "2027-09-20", "2027-09-23", "2027-10-11", "2027-11-03", "2027-11-23", "2027-12-31"],
  NYSE: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"],
};
/** The calendar as the server's `health` sends it: the days from two days back on. */
export function mockHolidays(now: number = Date.now()): Partial<Record<MarketId, string[]>> {
  const from = new Date(now - 2 * 86400e3).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(HOLIDAYS).map(([k, v]) => [k, v.filter((d) => d >= from)]));
}
/** `om_mock_now` as the browser's storage has it: an ISO time, "now", or nothing. */
const clockPref = (): string => { try { return localStorage.getItem("om_mock_now") ?? ""; } catch { return ""; } };
/** Whether the local copy's market rows follow the session table at the page's clock: `om_mock_now` holds a moment
 *  (the page's clock starts there, lib/mockclock.ts) or "now" (the machine's clock). Without it they keep their fixed
 *  states (FX and the futures live, the rest not), so that the browser checks see the same rows at any hour; a
 *  person, or a role that judges the Monitor, sets it (the reviewer's O-6: on a Saturday the fixed rows show a pair
 *  LIVE beside WATCHLIST's "Closed now: FX opens …"). */
export const clockSet = (): boolean => { const v = clockPref(); return v === "now" || Number.isFinite(Date.parse(v)); };
/** Whether that clock is the machine's own (`om_mock_now` = "now"). */
export const clockIsNow = (): boolean => clockPref() === "now";
const QUARTER = 15 * 60e3;
const lastOpen = new Map<string, number>();
/** A stand-in print by the session table at `now`: live with a print as old as the feed's delay while the market has
 *  been in its regular hours that long; otherwise not live, its last print at the end of the last session before
 *  (every session starts and ends on a quarter hour). */
export function printAt(market: string | null | undefined, now: number): { live: boolean; lastAt: string } | null {
  const m = marketOf(market);
  if (!m) return null;
  const open = (t: number) => marketStatus(m, new Date(t)).state === "OPEN";
  const t = now - m.delayMin * 60e3;
  if (open(now) && open(t)) return { live: true, lastAt: new Date(t).toISOString() };
  const from = Math.floor((open(now) ? t : now) / QUARTER) * QUARTER, key = `${m.id}|${from}`;
  let end = lastOpen.get(key);
  if (end == null) { end = from; for (let k = 1; k <= 14 * 96; k++) if (open(from - k * QUARTER)) { end = from - (k - 1) * QUARTER; break; } lastOpen.set(key, end); }
  return { live: false, lastAt: new Date(end).toISOString() };
}

// ---- the booked closes at a set clock (B-32, 21 Nov 2026) ----
// With the clock set, each stand-in row's daily closes carry the dates the live Monitor's would at that moment. The
// newest booked close is the last session of the row's market that has ended (an exchange's at its last bell; a currency
// pair's and a CME future's at 17:00 New York, booked 35 minutes later, as the history job books them at 22:35 UTC in
// New York's winter); the one before it is the session before, weekends and the calendar's holidays passed over. A print
// after that close is the day's own, measured from it (USD/JPY on Tue 24 Nov at 07:10 SGT: from the close of 23 Nov,
// with the session of 20 to 23 Nov as its last session); a print that is that close is the session itself (the Nikkei
// 225 that morning: Friday 20 Nov, Monday being a holiday in Tokyo). Two things differ from the live Monitor. The local
// copy still shows every Yahoo row as a print with its time, where the live Monitor shows a booked close by its date
// once the day is booked: New York's rows at 07:10 SGT carry no day here and "23 Nov" there. And a future is live
// here from 18:00 New York, the start of Globex's evening; the server's table dates a future's quote by New York's
// calendar day (`supabase/functions/_shared/table.ts`), so there its row stays at the booked close until midnight in
// New York (read in the code on 21 Nov 2026, not changed with B-32).
const BOOK_LAG_MIN = 35;
/** When the session dated `ymd` in a market's calendar has ended and is booked (ms). */
export function sessionEndMs(m: Market, ymd: string): number {
  return m.id === "FX" || m.id === "CME" ? zonedMs(FX_TZ, ymd, FX_BELL) + BOOK_LAG_MIN * 60e3 : zonedMs(m.tz, ymd, dayEnd(m, ymd));
}
const bookedCache = new Map<string, string[]>();
/** The sessions of a market that have ended by `now`, newest first: `n` dates in the market's own calendar (New York's
 *  for currencies and CME futures, Monday to Friday). Null for a market the session table does not keep, and for one
 *  that never closes. */
export function bookedDays(market: string | null | undefined, now: number, n: number): string[] | null {
  const m = marketOf(market);
  if (!m || m.id === "CRYPTO") return null;
  const round = m.id === "FX" || m.id === "CME", hol = new Set(HOLIDAYS[m.id] ?? []);
  const trades = (ymd: string): boolean => { const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return (round ? wd >= 1 && wd <= 5 : m.days.includes(wd)) && !hol.has(ymd); };
  const back = (ymd: string): string => new Date(Date.parse(`${ymd}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
  let d = partsIn(round ? FX_TZ : m.tz, new Date(now)).ymd;
  for (let k = 0; k < 21 && !(trades(d) && sessionEndMs(m, d) <= now); k++) d = back(d);
  const key = `${m.id}|${d}`;
  let list = bookedCache.get(key);
  if (!list || list.length < n) { list = []; for (let x = d; list.length < n; x = back(x)) if (trades(x)) list.push(x); bookedCache.set(key, list); }
  return list;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
}
/** Approximately normal(0,1) from twelve uniforms. */
const gauss = (r: () => number) => { let x = 0; for (let i = 0; i < 12; i++) x += r(); return x - 6; };
const seedOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const DAY = 86400;
const master = (symbol: string) => MASTER.find((x) => x.symbol === symbol) ?? EXTRA.find((x) => x.symbol === symbol) ?? MASTER[0];

/** A letter code that tells apart the stand-in companies sharing a base name ("Toyota Motor B", "Sony Group AB"):
 *  real names carry no counter, and a number in a name would read as a figure to the layout guard. */
const nameTag = (k: number): string => (k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(64 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26)));
/** A geometric random walk ending at `endValue`, built backwards so the latest print equals the live price. */
function walkBack(times: number[], endValue: number, stepVol: number, seed: number): Array<{ t: number; v: number }> {
  const r = rng(seed);
  const out = new Array<{ t: number; v: number }>(times.length);
  let v = endValue;
  for (let i = times.length - 1; i >= 0; i--) { out[i] = { t: times[i], v }; v = v / Math.exp(gauss(r) * stepVol); }
  return out;
}

/** I-6 and B-27 in the local copy. USD/JPY's day is a 2.7σ move (the stand-in σ alert names it). Gold's day is a change
 *  of contract (B-27's stand-in roll day): its closes before the newest point are the old contract's, 3% under the new
 *  one's, so the series steps by 3% that is not a move; the roll is recorded with the new contract's own close before. */
// (literals only, never one constant read from another at the top level: the production build then drops all of it)
const GOLD_TO = "GCG27.CMX", GOLD_EXPIRES_IN = 96;
export const MOCK_ROLL = { symbol: "GC=F", from: "GCZ26.CMX", to: GOLD_TO, step: 0.03, expiresIn: GOLD_EXPIRES_IN } as const;
const MOCK_SIGMA_DAY: Record<string, number> = { "USDJPY=X": 2.7 };
/** B-32 in the local copy: the session before USD/JPY's 2.7σ day was a -2.2σ one (the designer's sketch of the cell,
 *  "last session -2.2σ"; the stand-in σ alert of a day ago, which stays under the list's 2.5σ line, names it). */
const MOCK_LAST_SIGMA: Record<string, number> = { "USDJPY=X": -2.2 };
/** The contract each stand-in future names, as the server's record (fut_contracts) does, its expiry in days from now (so
 *  the stand-in contract never runs past it, whatever the date) and the day its record starts. */
export const MOCK_CONTRACTS: Record<string, { contract: string; expiresIn: number; since: number }> = {
  "GC=F": { contract: GOLD_TO, expiresIn: GOLD_EXPIRES_IN, since: 60 }, "CL=F": { contract: "CLF27.NYM", expiresIn: 31, since: 25 }, "NKD=F": { contract: "NKDZ26.CME", expiresIn: 21, since: 40 },
  "ES=F": { contract: "ESZ26.CME", expiresIn: 28, since: 40 },
};
const inDays = (n: number): string => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
/** σ of the 63 daily changes into points `to - 62` … `to` (in per cent for a price, points for a yield), as the server. */
function sd63(v: number[], to: number, rate: boolean): number {
  const xs: number[] = [];
  for (let k = to - 62; k <= to; k++) xs.push(rate ? v[k] - v[k - 1] : (v[k] / v[k - 1] - 1) * 100);
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
/** Daily closes: weekdays, `n` points ending yesterday, daily vol as declared; the newest point is the mock's print. */
function dailySeries(symbol: string, n: number): Array<{ t: number; v: number }> {
  const m = master(symbol);
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const days: number[] = [];
  for (let d = today - DAY; days.length < n; d -= DAY) { const wd = new Date(d * 1000).getUTCDay(); if (wd !== 0 && wd !== 6) days.unshift(d); }
  const out = walkBack(days, m.base, m.vol, seedOf(symbol)), L = out.length - 1;
  // the newest two changes set to their stand-in sizes in σ: each is measured against the 63 changes before it, and the
  // newer one's window holds the older one, so the two closes are set in turn until they rest
  const z = MOCK_SIGMA_DAY[symbol], zl = MOCK_LAST_SIGMA[symbol];
  if (z && L > 66) for (let i = 0; i < 8; i++) {
    out[L - 1] = { ...out[L - 1], v: m.base / (1 + (z * sd63(out.map((p) => p.v), L - 1, false)) / 100) };
    if (zl) out[L - 2] = { ...out[L - 2], v: out[L - 1].v / (1 + (zl * sd63(out.map((p) => p.v), L - 2, false)) / 100) };
  }
  if (symbol === MOCK_ROLL.symbol) for (let k = 0; k < L; k++) out[k] = { ...out[k], v: out[k].v / (1 + MOCK_ROLL.step) };
  return out;
}
/** The stand-in roll: on the newest point's day, measured from the new contract's own close before it. */
function mockRoll(s: Array<{ t: number; v: number }>): { d: string; from: string; to: string; prevClose: number; step: number } {
  const L = s.length - 1;
  return { d: new Date(s[L].t * 1000).toISOString().slice(0, 10), from: MOCK_ROLL.from, to: MOCK_ROLL.to, prevClose: s[L - 1].v * (1 + MOCK_ROLL.step), step: MOCK_ROLL.step * 100 };
}
/** One-minute bars for the last five weekdays, 09:00–15:30 SGT; minute vol = daily vol / sqrt(390). */
function intradaySeries(symbol: string): Array<{ t: number; v: number }> {
  const m = master(symbol);
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const times: number[] = [];
  for (let d = 6; d >= 0; d--) { const day = today - d * DAY; const wd = new Date(day * 1000).getUTCDay(); if (wd === 0 || wd === 6) continue; for (let k = 0; k < 390; k++) times.push(day + 3600 + k * 60); }
  return walkBack(times, m.base, m.vol / Math.sqrt(390), seedOf(symbol) + 1);
}
/** Hourly bars on weekdays for `days` calendar days; hourly vol = daily vol / sqrt(7). */
function hourlySeries(symbol: string, days: number, perHour = 1): Array<{ t: number; v: number }> {
  const m = master(symbol);
  const end = Math.floor(Date.now() / 3600) * 3600;
  const times: number[] = [];
  for (let t = end - days * DAY; t <= end; t += 3600 / perHour) { const d = new Date(t * 1000); const wd = d.getUTCDay(), h = d.getUTCHours(); if (wd === 0 || wd === 6 || h < 1 || h > 8) continue; times.push(t); }
  return walkBack(times, m.base, m.vol / Math.sqrt(7 * perHour), seedOf(symbol) + 2);
}

export function mockTable(): { rows: TableRow[]; asOf: string } {
  const atClock = clockSet(), now = Date.now();
  const rows: TableRow[] = MASTER.map((m) => {
    const s = dailySeries(m.symbol, 800), L = s.length - 1;
    const last = m.base;
    const source = providerOf(m.symbol);
    // with the clock set (om_mock_now), a print by the session table at that moment; without, the fixed states
    const pr = source === "yahoo" && atClock ? printAt(m.market, now) : null;
    // B-32: the dates of the booked closes. With the clock set they are the market's own sessions (above), and the print
    // is the day's own (`own`) when it came after the newest of them; otherwise it is that close, a closed market's last
    // session. Without the clock every Yahoo row is a print of now and the closes keep the walk's own weekdays.
    const mk = marketOf(m.market), days = pr && mk ? bookedDays(m.market, now, s.length) : null;
    const own = source === "yahoo" && (!pr || !days || !mk || Date.parse(pr.lastAt) > sessionEndMs(mk, days[0]));
    const iso = (i: number): string => new Date(s[Math.max(0, i)].t * 1000).toISOString().slice(0, 10);
    const dateAt = (i: number): string => (days ? days[(own ? L - 1 : L) - Math.max(0, i)] ?? iso(i) : iso(i));
    const back = { d1: 1, w1: 5, m1: 21, m3: 63, m12: 252, m36: 756 } as const;
    const closes: TableRow["closes"] = {}, closeDates: TableRow["closeDates"] = {}, pct: TableRow["pct"] = {};
    // B-27: gold's stand-in roll day: its 1D is the change within the new contract, from that contract's own close before
    const roll = m.symbol === MOCK_ROLL.symbol ? mockRoll(s) : null;
    for (const [k, n] of Object.entries(back) as Array<[keyof typeof back, number]>) { const i = Math.max(0, L - n), base = k === "d1" && roll ? roll.prevClose : s[i].v; closes[k] = base; closeDates[k] = dateAt(i); pct[k] = (last / base - 1) * 100; }
    // σ 1M, 52-week position and distance to the 200-day average from the same synthetic closes, so those columns are not
    // blank in the preview (σ vs 1M avg on a future set on the new contract's level, as the server's)
    const tail = (n: number) => s.slice(-n).map((p, i, xs) => (roll && i < xs.length - 1 ? p.v * (1 + MOCK_ROLL.step) : p.v)), mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const m21 = tail(21), mu = mean(m21), sd = Math.sqrt(mean(m21.map((v) => (v - mu) ** 2))), y = s.slice(-252).map((p) => p.v), lo = Math.min(...y, last), hi = Math.max(...y, last), m200 = mean(s.slice(-200).map((p) => p.v));
    const rate = m.group === "rates" && !m.symbol.endsWith("=F");
    // I-6: the day in σ, by the server's rule (supabase/functions/_shared/sigma.ts): the day's change over the σ of the 63
    // daily changes before it (the newest point is the print, the one before it the last close)
    const v = s.map((p) => p.v), sdz = sd63(v, L - 1, rate), day = rate ? last - (closes.d1 ?? last) : pct.d1 ?? 0;
    const z1d = sdz > 0 ? day / sdz : null, zFrom = dateAt(L - 64), zTo = dateAt(L - 1);
    // B-32: the newest completed session, by the server's rule (sigma.ts lastSession): the change between the last two
    // booked closes over the σ of the 63 changes before it. Behind a print of the day's own, those are the two closes
    // before the print; where the row is itself the last booked close, the session is the row's own day
    const sdl = sd63(v, L - 2, rate), chgl = rate ? v[L - 1] - v[L - 2] : (v[L - 1] / v[L - 2] - 1) * 100;
    const ls: LastSession = own
      ? { d: dateAt(L - 1), from: dateAt(L - 2), close: v[L - 1], base: v[L - 2], chg: chgl, z: sdl > 0 ? chgl / sdl : null, sd: sdl, n: 63, wFrom: dateAt(L - 65), wTo: dateAt(L - 2), roll: null }
      : { d: dateAt(L), from: dateAt(L - 1), close: last, base: closes.d1 ?? null, chg: day, z: z1d, sd: sdz, n: 63, wFrom: zFrom, wTo: zTo, roll: roll ? { from: roll.from, to: roll.to, step: roll.step } : null };
    const fut = MOCK_CONTRACTS[m.symbol];
    // as the server's table (table.ts): a print's own time; an official yield, which has no quote, stamped with the
    // date it was published for at midnight UTC ("<date>T00:00:00Z": a date, no time of day; the reviewer's R2B-01)
    const lastAt = pr ? pr.lastAt : source === "yahoo" ? new Date().toISOString() : `${iso(L)}T00:00:00Z`;
    return { ...m, proxyFor: m.proxyFor, last, lastAt, source, live: pr ? pr.live : source === "yahoo" && (m.market === "FX" || m.market === "CME"), closes, closeDates, pct,
      z1m: sd > 0 ? (last - mu) / sd : null, pos52: hi > lo ? ((last - lo) / (hi - lo)) * 100 : null, vs200: rate ? last - m200 : (last / m200 - 1) * 100,
      z1d, sd1d: sdz, zFrom, zTo, zN: 63, ls,
      contract: fut?.contract ?? null, roll: roll ? { d: roll.d, from: roll.from, to: roll.to, step: roll.step } : null };
  });
  return { rows, asOf: new Date().toISOString() };
}

/** A stock's bars carry a volume (an index's and a currency's do not), as the server's feed does. */
const isStock = (symbol: string) => !/^\^|=|-USD$/.test(symbol);
function withVolume<T extends { t: number; v: number }>(symbol: string, pts: T[], perBar: number): Array<T & { q?: number }> {
  if (!isStock(symbol)) return pts;
  const r = rng(seedOf(symbol) + 99);
  return pts.map((p, i) => ({ ...p, q: Math.round(perBar * (0.45 + r() * 0.9) * (i % 37 === 0 ? 3.2 : 1)) }));
}
export function mockSeries(symbol: string, range: string): Series {
  if (range === "1D") return { symbol, res: "1m", points: withVolume(symbol, intradaySeries(symbol), 6e4), asOf: new Date().toISOString() };
  if (range === "1W") return { symbol, res: "15m", points: withVolume(symbol, hourlySeries(symbol, 14, 4), 9e5), asOf: new Date().toISOString() };
  if (range === "1M") return { symbol, res: "1h", points: withVolume(symbol, hourlySeries(symbol, 62), 3.5e6), asOf: new Date().toISOString() };
  // as the server: one more window to pan into and the σ window's history before it; 5Y and 10Y without the extra
  // window, and never more than the ten years Yahoo keeps of a stock (supabase/functions/_shared/assets.ts)
  const days: Record<string, number> = { "3M": 93, "12M": 366, "36M": 1096, "5Y": 1827, "10Y": 3653 }, d = days[range] ?? 366;
  const n = Math.min(Math.round(((d >= 1827 ? d : d * 2) + 1120) * 0.69), 2615);
  const pts = withVolume(symbol, dailySeries(symbol, n), 2e7);
  return { symbol, res: "1d", points: pts, asOf: new Date(pts[pts.length - 1].t * 1000).toISOString().slice(0, 10) };
}

export function mockCurve(country: string, ago: string | null): { country: string; current: Curve | null; ghost: Curve | null } {
  const us: Array<[string, number, number]> = [["1 Mo", 1 / 12, 4.02], ["3 Mo", 0.25, 4.19], ["6 Mo", 0.5, 4.23], ["1 Yr", 1, 4.33], ["2 Yr", 2, 4.51], ["3 Yr", 3, 4.59], ["5 Yr", 5, 4.64], ["7 Yr", 7, 4.74], ["10 Yr", 10, 4.86], ["20 Yr", 20, 5.29], ["30 Yr", 30, 5.26]];
  const jp: Array<[string, number, number]> = [["1Y", 1, 1.671], ["2Y", 2, 1.88], ["3Y", 3, 1.982], ["5Y", 5, 2.243], ["7Y", 7, 2.429], ["10Y", 10, 2.817], ["15Y", 15, 3.362], ["20Y", 20, 3.669], ["30Y", 30, 3.94], ["40Y", 40, 3.96]];
  const de: Array<[string, number, number]> = Array.from({ length: 30 }, (_, i) => [`${i + 1}Y`, i + 1, 2.3 + Math.log(i + 1) * 0.42]);
  const gb: Array<[string, number, number]> = [["6M", 0.5, 4.05], ["1Y", 1, 4.0], ["2Y", 2, 3.95], ["3Y", 3, 3.98], ["5Y", 5, 4.1], ["7Y", 7, 4.25], ["10Y", 10, 4.45], ["15Y", 15, 4.9], ["20Y", 20, 5.15], ["25Y", 25, 5.2], ["30Y", 30, 5.2], ["40Y", 40, 5.0]];
  const ca: Array<[string, number, number]> = [["2Y", 2, 3.17], ["3Y", 3, 3.26], ["5Y", 5, 3.39], ["7Y", 7, 3.48], ["10Y", 10, 3.67], ["30Y", 30, 4.02]];
  const src = country === "JP" ? jp : country === "DE" ? de : country === "EA" || country === "EB" ? de.filter(([, y]) => [1, 2, 3, 5, 7, 10, 15, 20, 30].includes(y)).map(([t, y, v]) => [t, y, v + (country === "EB" ? 0.35 : 0)] as [string, number, number]) : country === "GB" ? gb : country === "CA" ? ca : us;
  const mk = (shift: number, d: string): Curve => ({ country, date: d, source: country === "JP" ? "MOF (mock)" : "treasury.gov (mock)", points: src.map(([tenor, years, y]) => ({ tenor, years, yield: y + shift * (1 - years / 40) })) });
  // the earlier curve is dated as the server dates it: the curve of that many months before today
  const back = (months: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - months); return d.toISOString().slice(0, 10); };
  return { country, current: mk(0, new Date().toISOString().slice(0, 10)), ghost: ago ? mk(ago === "36M" ? -0.9 : ago === "12M" ? -0.35 : 0.12, back(({ "1M": 1, "3M": 3, "12M": 12, "36M": 36 } as Record<string, number>)[ago] ?? 1)) : null };
}

// ---- the stand-in rows (./standin.json, shared with web/e2e/standin.cjs) ----
const HOUR = 3600e3;
/** The rows with their times made real: "{h:N}" becomes the time N hours from `now` (ISO), "{h:N|day}" that time's
 *  date in Singapore, "{d:N@HH:MM}" HH:MM UTC on the day N days from today in UTC (a results date as Yahoo stamps
 *  one, at a market's close). The same rule as web/e2e/standin.cjs, so the local copy and the checks show the same rows. */
function live<T>(x: T, now: number): T {
  const at = (n: string, day?: string) => { const t = now + Number(n) * HOUR; return day ? new Date(t + 8 * HOUR).toISOString().slice(0, 10) : new Date(t).toISOString(); };
  const onDay = (n: string, hm: string) => new Date(Math.floor(now / 864e5) * 864e5 + Number(n) * 864e5 + (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))) * 60e3).toISOString();
  const walk = (v: unknown): unknown => (typeof v === "string" ? v.replace(/\{h:(-?\d+(?:\.\d+)?)(\|day)?\}/g, (_m, n: string, d?: string) => at(n, d)).replace(/\{d:(-?\d+)@(\d\d:\d\d)\}/g, (_m, n: string, hm: string) => onDay(n, hm))
    : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, w]) => [k, walk(w)])) : v);
  return walk(x) as T;
}
// read once per page, counted from its first question (the checks count from when they start), so the rows do not
// drift while the page is open
let si: typeof standin | null = null;
const SI = () => (si ??= live(standin, Date.now()));
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : d; };

/** A note for its date, as the server's `note` sends it (the list row, the stand-in body); a date not in the list
 *  still gets one, as in the checks. */
function noteOf(d: string | null): Note {
  const S = SI(), row = (d ? S.notes.find((n) => n.d === d) : S.notes[0]) ?? null, day = d ?? S.notes[0].d;
  return { ...S.noteBody, id: row?.id ?? 1, d: day, title: row?.title ?? S.notes[0].title, generatedAt: row?.generatedAt ?? `${day}T23:05:00Z`, kind: "daily" } as unknown as Note;
}
const reportOf = (id: number): Report => { const S = SI(); return { ...(S.reports.find((r) => r.id === id) ?? S.reports[0]), ...S.reportBody } as unknown as Report; };

/** `?mock=empty`: every tab as the server answers when its tables are empty. */
const emptyMode = (): boolean => { try { return new URLSearchParams(location.search).get("mock") === "empty"; } catch { return false; } };
const bare = (action: string): boolean => { try { return (localStorage.getItem("om_mock_bare") ?? "").split(",").map((s) => s.trim()).includes(action); } catch { return false; } };

// ---- the watchlist: kept in this browser (om_mock_watch); empty and kept in memory only with ?mock=empty ----
const WATCH_KEY = "om_mock_watch";
type WatchEntry = { symbol: string; name: string | null };
let watchMem: WatchEntry[] | null = null;
function watchGet(): WatchEntry[] {
  if (emptyMode()) return (watchMem ??= []);
  try {
    const v: unknown = JSON.parse(localStorage.getItem(WATCH_KEY) ?? "null");
    if (Array.isArray(v)) return v.filter((w): w is WatchEntry => !!w && typeof (w as WatchEntry).symbol === "string").map((w) => ({ symbol: w.symbol, name: typeof w.name === "string" ? w.name : null }));
  } catch { /* nothing kept, or storage blocked: the list in memory, else the stand-in list */ }
  return watchMem ?? SI().watch.start.map((symbol) => ({ symbol, name: null }));
}
function watchPut(list: WatchEntry[]): void {
  watchMem = list;
  if (emptyMode()) return;
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch { /* kept in memory for this page */ }
}
/** The watched symbols, as the server's `watch_syms` sends them. */
export const mockWatchSyms = (): { symbols: string[] } => ({ symbols: watchGet().map((w) => w.symbol) });
/** Adds or removes a symbol as the server's `watch_set` does: any well-formed symbol, at most 200 names; a refusal
 *  is thrown with the server's words. */
export function mockWatchSet(symbol: string, on: boolean, name?: string): { symbols: string[] } {
  const s = symbol.trim().slice(0, 24);
  if (!/^[A-Za-z0-9^.=&-]{1,24}$/.test(s)) throw new Error("bad symbol");
  let list = watchGet();
  if (!on) list = list.filter((w) => w.symbol !== s);
  else if (!list.some((w) => w.symbol === s)) {
    if (list.length >= 200) throw new Error("A watchlist holds up to 200 names");
    list = [...list, { symbol: s, name: name ? name.slice(0, 120) : null }];
  }
  watchPut(list);
  return { symbols: list.map((w) => w.symbol) };
}
// the mock table's two yields that the server reads from official curves, and their publishers
const OFFICIAL: Record<string, string> = { UST2Y: "US Treasury", JGB10Y: "Japan MOF" };
/** A market instrument's watchlist row from the mock table, mapped as the server maps its own table
 *  (supabase/functions/_shared/watchrow.ts): a yield's changes in level, never in per cent of it; the as-of and the
 *  source. So the local copy's watchlist shows the same figures as its MARKETS. */
function tableWatchRow(t: TableRow): WatchRow {
  const y = isYield(t), pub = OFFICIAL[t.symbol];
  const lvl = (k: PeriodKey) => { const c = t.closes[k]; return c != null && t.last != null ? t.last - c : null; };
  const pc = (k: PeriodKey) => (y ? null : t.pct[k] ?? null);
  return { symbol: t.symbol, name: t.name, kind: t.cls, sector: null, ccy: t.currency, last: t.last,
    asOf: pub ? (t.lastAt ?? "").slice(0, 10) || null : t.lastAt, asOfKind: pub ? "published" : "print", source: pub ?? "Yahoo Finance",
    pct1d: pc("d1"), pct1w: pc("w1"), pct1m: pc("m1"), pct3m: pc("m3"), pct12m: pc("m12"),
    chg1d: lvl("d1"), chg1w: lvl("w1"), chg1m: lvl("m1"), chg3m: lvl("m3"), chg12m: lvl("m12"),
    vs50: null, vs200: y ? null : t.vs200 ?? null, vs200chg: y ? t.vs200 ?? null : null, pos52: t.pos52 ?? null, mcap: null, earningsAt: null, earningsEst: null, isYield: y,
    decimals: t.decimals };   // the instrument's own, as the server sends since 20 Nov 2026 (I-5)
}
/** The server's rule for a quote that is a yield (supabase/functions/_shared/watchrow.ts isYieldQuote; a search hit
 *  carries no quote type, so the name alone stands for an index's). */
const yieldQuote = (symbol: string, name: string | null): boolean => ["^IRX", "^FVX", "^TNX", "^TYX"].includes(symbol) || /\btreasury (?:yield|bill)/i.test(name ?? "");
/** W-1 at a set clock (om_mock_now): a stock at a booked close, as the server reads an index member's row
 *  (supabase/functions/_shared/watchrow.ts watchRowFromStat): at the session table's print while that print is of a
 *  later session than the newest close its market has booked (bookedDays, above), by its time; otherwise at that close,
 *  by its date. Its figures stay the stand-in's. Without the clock the row keeps its fixed close, so that the browser
 *  checks see the same rows at any hour. */
function memberAt(r: WatchRow, now: number): WatchRow {
  const mk = marketOf(stockMarket(r.symbol)), pr = mk ? printAt(mk.id, now) : null, days = mk ? bookedDays(mk.id, now, 1) : null;
  if (!mk || !pr || !days?.length) return r;
  return Date.parse(pr.lastAt) > sessionEndMs(mk, days[0]) ? { ...r, asOf: pr.lastAt, asOfKind: "print" } : { ...r, asOf: days[0], asOfKind: "close" };
}
/** watch_list: a market instrument from the mock table, as the server reads its table; a stand-in row where there
 *  is one; a name the page offered (it came with a name) gets made-up figures; a symbol typed in that the mock does
 *  not know comes back as the server's row without a quote (dashes). */
function watchList(): { rows: WatchRow[] } {
  const S = SI(), list = watchGet();
  const known = new Map(S.watch.rows.map((r) => [r.symbol, r as unknown as WatchRow]));
  const table = list.some((w) => MASTER.some((m) => m.symbol === w.symbol)) ? new Map(mockTable().rows.map((t) => [t.symbol, t])) : new Map<string, TableRow>();
  const day = new Date(Date.now() - 12 * HOUR + 8 * HOUR).toISOString().slice(0, 10);
  const atClock = clockSet(), now = Date.now(), member = (r: WatchRow): WatchRow => (atClock && r.kind === "Stock" && r.asOfKind === "close" ? memberAt(r, now) : r);
  return { rows: list.map((w): WatchRow => {
    const t = table.get(w.symbol); if (t) return tableWatchRow(t);
    const k = known.get(w.symbol); if (k) return member(k);
    const none = { sector: null, vs50: null, vs200: null, pos52: null, mcap: null, earningsAt: null, earningsEst: null, isYield: false, chg1d: null, chg1w: null, chg1m: null, chg3m: null, chg12m: null, vs200chg: null };
    if (!w.name) return { ...none, symbol: w.symbol, name: w.symbol, kind: "–", ccy: null, last: null, asOf: null, asOfKind: null, source: null, pct1d: null, pct1w: null, pct1m: null, pct3m: null, pct12m: null };
    const r = rng(seedOf(w.symbol)), jp = /\.T$/.test(w.symbol), p = Math.round((r() - 0.5) * 600) / 100;
    // a Treasury yield index outside the table (^IRX), as the server's watchRowFromQuote reads it: its 1D in points
    if (yieldQuote(w.symbol, w.name)) return { ...none, symbol: w.symbol, name: w.name, kind: "Fixed income", ccy: "USD", last: Math.round((3.6 + r() * 0.5) * 1000) / 1000, asOf: new Date(Date.now() - 20 * 60e3).toISOString(), asOfKind: "print", source: "Yahoo Finance", pct1d: null, pct1w: null, pct1m: null, pct3m: null, pct12m: null, chg1d: Math.round((r() - 0.5) * 80) / 1000, isYield: true };
    return member({ ...none, symbol: w.symbol, name: w.name, kind: "Stock", ccy: jp ? "JPY" : "USD", last: Math.round((jp ? 800 + r() * 6000 : 20 + r() * 400) * 100) / 100, asOf: day, asOfKind: "close", source: "Yahoo Finance", pct1d: p, pct1w: p * 1.7, pct1m: p * -2.3, pct3m: p * 4.1, pct12m: p * 9.6, vs50: p * 1.2, vs200: p * 3, pos52: 50 + p * 10 });
  }) };
}
/** The lists everyone reads show a σ move from 2.5σ, as the server's routes ask for them (LISTED_ALERTS in
 *  supabase/functions/_shared/sigma.ts: "kind.neq.sigma,sigma.gte.2.5,sigma.lte.-2.5"); every other kind as it is. */
const listedAlert = (a: { kind: string; sigma?: number | null }): boolean => a.kind !== "sigma" || Math.abs(a.sigma ?? 0) >= 2.5 - 1e-9;
/** watch_feed: the alerts on the listed symbols, the headlines that name one, the pieces that mention one. The alerts
 *  as the server's route reads its one table (supabase/functions/api/index.ts watchFeed): WATCHLIST's stand-in rows and
 *  the σ moves of the header's list (I-6), from 2.5σ (the reviewer's F3), newest first, at most 40. */
function watchFeed(): Feed {
  const S = SI(), f = S.watch.feed, syms = new Set(watchGet().map((w) => w.symbol));
  if (!syms.size) return { alerts: [], news: [], research: [] };
  type A = { id: number; at: string; symbol: string; kind: string; sigma?: number | null };
  const sigma = (S.alerts as unknown as A[]).filter((a) => a.kind === "sigma").map((a) => ({ ...a, id: a.id + 2000 }));
  const alerts = [...(f.alerts as unknown as A[]), ...sigma].filter((a) => syms.has(a.symbol) && listedAlert(a)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 40);
  return { alerts, news: f.news.filter((n) => n.tickers.some((t) => syms.has(t.s))),
    research: f.research.map((r) => ({ ...r, symbols: r.symbols.filter((s) => syms.has(s)) })).filter((r) => r.symbols.length > 0) } as unknown as Feed;
}

/** A stock's NEWS as the server's `stock` sends it (supabase/functions/_shared/stock.ts, feedFor): the stand-in
 *  headlines that name it (those of NEWS and of WATCHLIST) and the stand-in alerts on it (WATCHLIST's, and the moves
 *  of the header's list), newest first, at most 60 and 40, over 90 days. With ?mock=empty, none. */
function stockFeed(symbol: string): StockFeed {
  if (emptyMode()) return { days: 90, news: [], alerts: [] };
  const S = SI(), since = Date.now() - 90 * 86400e3, t = (x: string) => Date.parse(x);
  type N = { id: number; publishedAt: string; source: string; title: string; url: string; category: string | null; tickers: Array<{ s: string }> };
  type A = { id: number; at: string; symbol: string; kind: string; pct: number | null; market: string; msg: string; url: string | null };
  const news = [...(S.news as unknown as N[]).map((n) => ({ ...n })), ...(S.watch.feed.news as unknown as N[]).map((n) => ({ ...n, id: n.id + 1000 }))]
    .filter((n) => n.tickers.some((x) => x.s === symbol) && t(n.publishedAt) >= since).sort((a, b) => t(b.publishedAt) - t(a.publishedAt)).slice(0, 60)
    .map((n) => ({ id: n.id, publishedAt: n.publishedAt, source: n.source, title: n.title, url: n.url, category: n.category ?? null }));
  const alerts = [...(S.watch.feed.alerts as unknown as A[]).map((a) => ({ ...a, id: a.id + 1000 })), ...(S.alerts as unknown as A[]).filter((a) => a.kind === "stock" || a.kind === "index")]
    .filter((a) => a.symbol === symbol && t(a.at) >= since).sort((a, b) => t(b.at) - t(a.at)).slice(0, 40)
    .map((a) => ({ id: a.id, at: a.at, kind: a.kind, pct: a.pct, market: a.market, msg: a.msg, url: a.url ?? null }));
  return { days: 90, news, alerts };
}

/** An instrument's page (I-4): a Monitor instrument of the stand-in table or of EXTRA, or any symbol Yahoo writes for
 *  an index, a pair, a future or a coin ("^…", "…=X", "…=F", "…-USD"), which the server reads from its quote. */
const isInstrumentSymbol = (sym: string): boolean => MASTER.some((m) => m.symbol === sym) || EXTRA.some((m) => m.symbol === sym) || /^\^|=X$|=F$|-USD$/.test(sym);
function instrumentAnswer(sym: string): unknown {
  const S = SI(), known = MASTER.find((m) => m.symbol === sym) ?? EXTRA.find((m) => m.symbol === sym);
  const def = known ?? { symbol: sym, name: sym, cls: /=X$/.test(sym) ? "Currency" : /=F$/.test(sym) ? "Futures" : /-USD$/.test(sym) ? "Crypto" : "Equities", group: /=X$|-USD$/.test(sym) ? "fx" : /=F$/.test(sym) ? "cmdty" : "equity", market: /=X$/.test(sym) ? "FX" : "NYSE", currency: "USD", decimals: 2, order: 0, base: 57000, vol: 0.013 } as (typeof MASTER)[number];
  const pts = dailySeries(sym, 1300), bars = pts.map((p) => ({ t: p.t, c: p.v })), pub = PUBLISHED[sym] ?? null;
  const tableRow = MASTER.some((m) => m.symbol === sym) ? mockTable().rows.find((r) => r.symbol === sym) ?? null : null;
  // with the clock set (om_mock_now), a Monitor instrument outside the stand-in table prints by the session table too
  const pr = !pub && known && clockSet() ? printAt(def.market, Date.now()) : null;
  const lastAt = pub ? `${new Date(pts[pts.length - 1].t * 1000).toISOString().slice(0, 10)}T00:00:00Z` : pr ? pr.lastAt : new Date().toISOString();
  // the table's own row (as the server sends it, so the page, its chart and MARKETS agree), or one made the table's way;
  // an official yield's figure is its last published close
  const row = tableRow ?? { ...rowFromBars(def, bars.slice(0, -1), def.base, lastAt), live: pr?.live ?? false };   // the walk's last point is the print
  const fut = known ? MOCK_CONTRACTS[sym] : undefined, roll = sym === MOCK_ROLL.symbol ? mockRoll(pts) : null;
  const futures = fut ? { contract: fut.contract, expires: inDays(fut.expiresIn), since: new Date(pts[Math.max(0, pts.length - 1 - fut.since)].t * 1000).toISOString().slice(0, 10), rolls: roll ? [{ d: roll.d, from: roll.from, to: roll.to, prevClose: roll.prevClose }] : [] } : null;
  return mockInstrument({ ...row, lastAt: pub ? lastAt : row.lastAt, live: pub ? false : row.live, source: providerOf(sym) }, bars, { official: pub, monitor: !!known, futures, calendar: S.calendar as unknown as EconEvent[], news: S.news as unknown as NewsItem[], alerts: [...(S.watch.feed.alerts as unknown as Alert[]).map((a) => ({ ...a, id: a.id + 1000 })), ...(S.alerts as unknown as Alert[])], now: Date.now() });
}

/** `?mock=empty`: what the server sends for each action when its tables hold nothing. */
function emptyAnswer(action: string, params: Record<string, string | number | boolean | undefined> | undefined): unknown {
  const idx = String(params?.idx ?? "SP500");
  switch (action) {
    case "health": return mockHealth();
    case "table": return { rows: [], asOf: new Date().toISOString() };
    case "series": {   // the server's own bars are for its instruments; any other symbol's come from Yahoo, tables or not
      const symbol = String(params?.symbol ?? "");
      return MASTER.some((m) => m.symbol === symbol) ? { symbol, res: "1d", points: [], asOf: null } : mockSeries(symbol, String(params?.range ?? "12M"));
    }
    case "curve": return { country: String(params?.country ?? "US"), current: null, ghost: null };
    case "note": return { note: null };
    case "report": return { report: null };
    case "index_stats": return { idx, asOf: null, live: null, rows: [], breadth: null, sectors: [], movers: { top: [], bottom: [] }, shorts: null };
    case "breadth_history": return { idx, rows: [] };
    case "jp_shorts": return { idx: String(params?.idx ?? "NK225"), market: [], sectorsAsOf: null, sectors: [], positions: { asOf: null, names: 0, covered: 0, top: [], avgRatio: null, history: [], namesHistory: [] }, margin: [] };
    case "policy_history": return { rows: [], sources: {} };
    case "earnings": return { rows: [], source: SI().earningsSource, estimateAsGiven: true };
    case "watch_syms": return mockWatchSyms();
    case "watch_list": return watchList();
    case "watch_feed": return watchFeed();
    default: return { rows: [] };
  }
}

// `om_mock_stale` = "1" in the browser's storage: the answer of a server whose price feed stopped 99 minutes ago
const mockFeed = (): Health["feed"] => { let stale = false; try { stale = localStorage.getItem("om_mock_stale") === "1"; } catch { /* no storage */ } return stale ? { expected: true, ok: false, newest: new Date(Date.now() - 99 * 60e3).toISOString(), symbol: "USDJPY=X", lateMin: 99 } : { expected: true, ok: true, newest: new Date(Date.now() - 60e3).toISOString(), symbol: "USDJPY=X", lateMin: 1 }; };
export const mockHealth = (): Health => ({ ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true, note: "mock" }, daily: { lastAt: new Date().toISOString(), ok: true, note: "mock" }, feed: mockFeed(), sources: [{ name: "mock", lastOk: new Date().toISOString(), lastError: null }], holidays: mockHolidays(), holidaysVerified: true });

export function mockAction(action: string, params: Record<string, string | number | boolean | undefined> | undefined): unknown {
  if (bare(action)) return { rows: [] };
  if (emptyMode() && action !== "stock" && action !== "asset") return emptyAnswer(action, params);   // a stock's page is not a tab: as usual
  const S = SI();
  switch (action) {
    case "table": return mockTable();
    case "series": return mockSeries(String(params?.symbol ?? "^N225"), String(params?.range ?? "12M"));
    case "curve": return mockCurve(String(params?.country ?? "US"), params?.ago ? String(params.ago) : null);
    case "health": return mockHealth();
    // the lists as the server's routes send them (supabase/functions/api/index.ts): newest first, `n` at most
    case "calendar": return { rows: S.calendar as unknown as EconEvent[] };
    case "news": { const cat = params?.category ? String(params.category) : null; return { rows: (S.news as unknown as NewsItem[]).filter((x) => !cat || x.category === cat).slice(0, num(params?.n, 120, 1, 300)) }; }
    case "notes": return { rows: S.notes.slice(0, num(params?.n, 30, 1, 1000)) };
    case "note": return { note: noteOf(params?.d ? String(params.d) : null) };
    case "reports": return { rows: S.reports.slice(0, num(params?.n, 100, 1, 1000)) };
    case "report": return { report: reportOf(Number(params?.id)) };
    case "earnings": return { rows: S.earnings as unknown as EarningsRow[], source: S.earningsSource, estimateAsGiven: true };   // as the server since 20 Nov 2026
    case "alerts": return { rows: (S.alerts as unknown as Alert[]).filter(listedAlert).slice(0, num(params?.n, 20, 1, 50)) };   // σ moves from 2.5σ, as the server's route
    case "watch_syms": return mockWatchSyms();
    case "watch_list": return watchList();
    case "watch_feed": return watchFeed();
    case "curves": return { rows: ["US", "JP", "DE", "EA", "EB", "GB", "CA"].map((c) => ({ country: c, label: c, latest: new Date().toISOString().slice(0, 10), tenors: 10 })) };
    case "index_stats": {
      const idx = String(params?.idx ?? "SP500"); const r = rng(seedOf(idx));
      const sectors = idx === "NK225" ? ["Technology", "Financials", "Consumer Goods", "Materials", "Capital Goods/Others", "Transportation and Utilities", "Information and Communications"] : ["Information Technology", "Financials", "Health Care", "Industrials", "Consumer Discretionary", "Communication Services", "Consumer Staples", "Energy", "Utilities", "Real Estate", "Materials"];
      const n = idx === "NK225" ? 225 : idx === "NDX" ? 100 : 503;
      const rows = Array.from({ length: n }, (_, i) => { const close = 20 + r() * 400; const p1 = (r() - 0.5) * 9; const mcap = (idx === "NK225" ? 2e11 : 1.5e10) * Math.exp(r() * 5); const adv3m = (mcap / close) * (0.002 + r() * 0.008); const volume = adv3m * (0.4 + r() * 1.4); return { symbol: idx === "NK225" ? `${1300 + i * 37}.T` : `T${i}`, name: ["Toyota Motor", "Sony Group", "Keyence", "Mitsubishi UFJ", "Tokyo Electron", "Hitachi", "Nintendo", "Recruit", "Fast Retailing", "SoftBank Group"][i % 10] + (i >= 10 ? ` ${nameTag(Math.floor(i / 10))}` : ""), sector: sectors[i % sectors.length], industry: ["Auto Manufacturers", "Consumer Electronics", "Scientific Instruments", "Banks", "Semiconductor Equipment"][i % 5], weight: idx === "NK225" ? r() * 3 : null, d: new Date().toISOString().slice(0, 10), close, prev: close / (1 + p1 / 100), pct1d: p1, pct1w: (r() - 0.5) * 14, pct1m: (r() - 0.5) * 24, pct3m: (r() - 0.5) * 40, pct12m: (r() - 0.3) * 80, dma50: close * (0.9 + r() * 0.2), dma200: close * (0.85 + r() * 0.3), hi52: close * (1 + r() * 0.3), lo52: close * (0.6 + r() * 0.35), mcap, volume, adv3m, turnover: volume * close, adv_turnover: adv3m * close, pct6m: (r() - 0.5) * 50, pct36m: (r() - 0.3) * 120, mf_up: volume * close * (0.3 + r() * 0.4), mf_down: 0, mf_net: 0, mf_d: new Date().toISOString().slice(0, 10), shortRatio: idx === "NK225" ? 0.002 + r() * 0.05 : 0.3 + r() * 0.4 }; }).map((x) => ({ ...x, mf_down: x.turnover - x.mf_up, mf_net: 2 * x.mf_up - x.turnover }));
      const sorted = [...rows].sort((a, b) => b.pct1d - a.pct1d);
      const by = new Map<string, typeof rows>(); for (const x of rows) by.set(x.sector, [...(by.get(x.sector) ?? []), x]);
      const avg = (xs: typeof rows, k: "pct1d" | "pct1w" | "pct1m" | "pct3m" | "pct12m") => xs.reduce((a, x) => a + x[k], 0) / xs.length;
      const sum = (xs: typeof rows, k: "mcap" | "turnover" | "adv_turnover" | "mf_net" | "mf_up" | "mf_down") => xs.reduce((a, x) => a + x[k], 0);
      const totT = sum(rows, "turnover"), totM = sum(rows, "mcap");
      // `om_mock_live` = "1" in the browser's storage: the list as the server sends it while its market is open
      const liveNow = (() => { try { return localStorage.getItem("om_mock_live") === "1"; } catch { return false; } })();
      const flowAt = ((): { quoteAt?: string; mfAt?: string; mfD?: string } => { try { const v: unknown = JSON.parse(localStorage.getItem("om_mock_flow") ?? "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; } })();
      return { idx, asOf: new Date(Date.now() - (liveNow ? 86400e3 : 0)).toISOString().slice(0, 10), live: liveNow ? { asOf: new Date(Date.now() - 7 * 60e3).toISOString(), n } : null, quoteAt: flowAt.quoteAt ?? new Date().toISOString(), mfAt: flowAt.mfAt ?? flowAt.quoteAt ?? new Date().toISOString(), mfD: flowAt.mfD ?? new Date().toISOString().slice(0, 10), rows, breadth: { n, adv: rows.filter((x) => x.pct1d > 0).length, dec: rows.filter((x) => x.pct1d < 0).length, above50: rows.filter((x) => x.close > x.dma50).length, above200: rows.filter((x) => x.close > x.dma200).length, newHi: 7, newLo: 12, over2: rows.filter((x) => x.pct1d >= 2).length, under2: rows.filter((x) => x.pct1d <= -2).length },
        sectors: [...by.entries()].map(([sector, xs]) => ({ sector, n: xs.length, weight: idx === "NK225" ? xs.reduce((a, x) => a + (x.weight ?? 0), 0) : null, pct1d: avg(xs, "pct1d"), pct1w: avg(xs, "pct1w"), pct1m: avg(xs, "pct1m"), pct3m: avg(xs, "pct3m"), pct12m: avg(xs, "pct12m"), above200: xs.filter((x) => x.close > x.dma200).length, mcapShare: (sum(xs, "mcap") / totM) * 100, turnover: sum(xs, "turnover"), turnoverShare: (sum(xs, "turnover") / totT) * 100, flow: sum(xs, "turnover") / sum(xs, "adv_turnover"), mfNet: sum(xs, "mf_net"), mfUp: sum(xs, "mf_up"), mfDown: sum(xs, "mf_down") })).sort((a, b) => b.pct1d - a.pct1d),
        movers: { top: sorted.slice(0, 15), bottom: sorted.slice(-15).reverse() }, shorts: idx === "NK225" ? null : { d: new Date().toISOString().slice(0, 10), avgRatio: 0.47, history: Array.from({ length: 240 }, (_, i) => ({ d: new Date(Date.now() - (240 - i) * 86400e3).toISOString().slice(0, 10), v: 0.42 + r() * 0.1 })), top: [...rows].sort((a, b) => (b.shortRatio ?? 0) - (a.shortRatio ?? 0)).slice(0, 15).map((x) => ({ symbol: x.symbol, name: x.name, ratio: x.shortRatio ?? 0 })) } };
    }
    case "search": {   // a part of a symbol or of a name, whatever its case; nothing for nothing typed (as the server)
      const term = String(params?.q ?? "").trim().toLowerCase();
      return { rows: term ? (S.watch.search as Hit[]).filter((x) => x.symbol.toLowerCase().includes(term) || x.name.toLowerCase().includes(term)) : [] };
    }
    case "stock": {
      const sym = String(params?.symbol ?? "7203.T");
      if (isInstrumentSymbol(sym)) return instrumentAnswer(sym);   // a currency, a yield, a commodity, a future or an index (I-4)
      const pts = dailySeries(sym, 300), st = mockStock(sym, pts[pts.length - 1].v, pts);   // the price the mock chart ends at, and its days for the marks
      // with the clock set (om_mock_now), its quote's time by its exchange's hours: its last close while that is shut
      const pr = clockSet() ? printAt(stockMarket(sym), Date.now()) : null;
      return { ...st, ...(pr ? { asOf: pr.lastAt } : {}), feed: stockFeed(sym) };
    }
    case "asset": {
      const symbol = String(params?.symbol ?? "7203.T"); const r = rng(seedOf(symbol)); const jp = /\.T$/.test(symbol);
      const price = jp ? 1000 + r() * 5000 : 50 + r() * 400; const pct = (r() - 0.5) * 6;
      const rel = Array.from({ length: 250 }, (_, i) => ({ t: Math.floor(Date.now() / 1000) - (250 - i) * 86400, v: 100 + Math.sin(i / 30) * 8 + (r() - 0.5) * 2 }));
      const fy = (k: number) => `${2022 + k}-03-31`;
      const annual = [0, 1, 2, 3, 4].map((k) => ({ period: fy(k), label: `FY ${fy(k).slice(0, 7)}`, revenue: (jp ? 3e13 : 3e11) * (1 + k * 0.08), op: (jp ? 3e12 : 6e10) * (1 + k * 0.1), ni: (jp ? 2.5e12 : 5e10) * (1 + k * 0.1), eps: (jp ? 180 : 4) * (1 + k * 0.1), assets: (jp ? 9e13 : 4e11), equity: (jp ? 3e13 : 7e10), cfo: (jp ? 4e12 : 1e11), cfi: -(jp ? 2e12 : 2e10), cff: -(jp ? 1e12 : 9e10), fcf: (jp ? 2e12 : 8e10) }));
      const quarterly = [1, 2, 3].map((q) => ({ period: `2027-03-31 Q${q}`, label: `2027-03 Q${q} (YTD)`, revenue: (jp ? 1.3e13 : 1e11) * q, op: (jp ? 1e12 : 2e10) * q, ni: (jp ? 9e11 : 1.5e10) * q, eps: (jp ? 70 : 1.4) * q }));
      return { symbol, name: jp ? "Mock Motor Corp" : "Mock Inc.", exchange: jp ? "Tokyo" : "NasdaqGS", currency: jp ? "JPY" : "USD", quoteType: "EQUITY", sector: jp ? "Consumer Discretionary" : "Information Technology", industry: jp ? "Auto Manufacturers" : "Consumer Electronics", price, prevClose: price / (1 + pct / 100), pct, mcap: price * (jp ? 1.4e10 : 1.5e10), volume: 2.4e7, adv3m: 2e7, adv10d: 2.2e7, asOf: new Date().toISOString(), home: jp ? { symbol: "^N225", name: "Nikkei 225" } : { symbol: "^GSPC", name: "S&P 500" }, rel,
        statements: { source: jp ? "edinetdb" : "yahoo", currency: jp ? "JPY" : "USD", unit: "1", annual, quarterly, forecast: jp ? { fiscalYearEnd: "2027-03-31", disclosed: "2026-11-05", revenue: 5.35e13, op: 3.9e12, ni: 3.57e12, eps: 299.95, dps: 100 } : null, note: "mock", asOf: new Date().toISOString().slice(0, 10) },
        short: jp ? { kind: "jpx", d: new Date().toISOString().slice(0, 10), ratio: 0.0123, holders: [{ holder: "Mock Capital LLP", ratio: 0.0071, d: new Date().toISOString().slice(0, 10) }, { holder: "Mock Asset Management", ratio: 0.0052, d: new Date().toISOString().slice(0, 10) }] } : { kind: "finra", d: new Date().toISOString().slice(0, 10), ratio: 0.47 }, series: null };
    }
    case "jp_shorts": {
      const r = rng(7); const day = (i: number) => new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10);
      const market = Array.from({ length: 245 }, (_, i) => ({ d: day(245 - i), ratio: 38 + r() * 8, restricted: 28 + r() * 5, total: 1.3e7 }));
      const sectors = ["電気機器", "輸送用機器", "銀行業", "情報・通信業", "医薬品", "機械", "化学", "小売業", "不動産業", "鉄鋼"].map((s) => ({ sector: s, ratio: 30 + r() * 20, total: 1e5 + r() * 5e6 })).sort((a, b) => b.ratio - a.ratio);
      const top = Array.from({ length: 15 }, (_, i) => ({ symbol: `${6000 + i * 37}.T`, name: `Company ${i}`, sector: sectors[i % sectors.length].sector, holders: 1 + Math.floor(r() * 5), ratio: 0.03 - i * 0.0015, d: day(1) }));
      return { idx: String(params?.idx ?? "NK225"), market, sectorsAsOf: day(1), sectors, positions: { asOf: day(1), names: 96, covered: 225, avgRatio: 0.011, top, history: Array.from({ length: 45 }, (_, i) => ({ d: day(45 - i), v: 0.009 + r() * 0.004 })), namesHistory: [] }, margin: [{ d: day(3), sellShares: 820000, sellValue: 1950000, buyShares: 3900000, buyValue: 5300000 }, { d: day(10), sellShares: 790000, sellValue: 1880000, buyShares: 3700000, buyValue: 5100000 }] };
    }
    case "breadth_history": {
      const idx = String(params?.idx ?? "SP500"); const r = rng(seedOf(idx + "bh")); const n = idx === "NK225" ? 225 : idx === "NDX" ? 100 : 503;
      const rows: Array<{ d: string; n: number; adv: number; dec: number; above50: number; above200: number; new_hi: number; new_lo: number }> = [];
      let a200 = 0.55, a50 = 0.5;
      for (let i = 1100; i >= 0; i--) { const d = new Date(Date.now() - i * 86400e3); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; a200 = Math.min(0.95, Math.max(0.1, a200 + (r() - 0.5) * 0.04)); a50 = Math.min(0.95, Math.max(0.05, a50 + (r() - 0.5) * 0.1)); const adv = Math.round(n * (0.2 + r() * 0.6)); rows.push({ d: d.toISOString().slice(0, 10), n, adv, dec: n - adv - Math.round(r() * 8), above50: Math.round(n * a50), above200: Math.round(n * a200), new_hi: Math.round(r() * 25), new_lo: Math.round(r() * 20) }); }
      return { idx, rows };
    }
    // every bank the server keeps (its policy_rates rows), the Fed first as the views have it
    case "policy_history": return { rows: S.policy.history as PolicyStep[], sources: S.policy.sources };
    case "policy": return { rows: S.policy.rows as PolicyRow[] };
    default: return { rows: [] };
  }
}
