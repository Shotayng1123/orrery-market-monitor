// Dev-only mock feed: `VITE_DEV_MOCK=1 npm run dev` serves synthetic data so the panels can be laid out and
// checked before the backend exists. Deterministic random walks with realistic volatility scaling, labelled
// MOCK in the UI. Never active in production builds (gated on import.meta.env.DEV in useApi).
import type { TableRow, Health, Curve, Series } from "./types";

const MASTER: Array<Pick<TableRow, "symbol" | "name" | "cls" | "group" | "market" | "currency" | "decimals" | "order"> & { base: number; vol: number; proxyFor?: string }> = [
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
  { symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", currency: "JPY", decimals: 3, order: 21, base: 158.4, vol: 0.005 },
  { symbol: "EURUSD=X", name: "EUR/USD", cls: "Currency", group: "fx", market: "FX", currency: "USD", decimals: 4, order: 22, base: 1.1143, vol: 0.004 },
  { symbol: "DX-Y.NYB", name: "US Dollar Index (DXY)", cls: "Currency", group: "fx", market: "NYSE", currency: "USD", decimals: 3, order: 29, base: 102.28, vol: 0.004 },
  { symbol: "UST2Y", name: "UST 2Y yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "USD", decimals: 3, order: 30, base: 4.51, vol: 0.012 },
  { symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "USD", decimals: 3, order: 32, base: 4.859, vol: 0.01 },
  { symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", group: "rates", market: "TSE", currency: "JPY", decimals: 3, order: 34, base: 2.817, vol: 0.012 },
  { symbol: "CL=F", name: "WTI crude", cls: "Commodities", group: "cmdty", market: "CME", currency: "USD", decimals: 2, order: 36, base: 90.83, vol: 0.02 },
  { symbol: "GC=F", name: "Gold", cls: "Commodities", group: "cmdty", market: "CME", currency: "USD", decimals: 2, order: 38, base: 4074.9, vol: 0.011 },
];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
}
/** Approximately normal(0,1) from twelve uniforms. */
const gauss = (r: () => number) => { let x = 0; for (let i = 0; i < 12; i++) x += r(); return x - 6; };
const seedOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const DAY = 86400;
const master = (symbol: string) => MASTER.find((x) => x.symbol === symbol) ?? MASTER[0];

/** A geometric random walk ending at `endValue`, built backwards so the latest print equals the live price. */
function walkBack(times: number[], endValue: number, stepVol: number, seed: number): Array<{ t: number; v: number }> {
  const r = rng(seed);
  const out = new Array<{ t: number; v: number }>(times.length);
  let v = endValue;
  for (let i = times.length - 1; i >= 0; i--) { out[i] = { t: times[i], v }; v = v / Math.exp(gauss(r) * stepVol); }
  return out;
}

/** Daily closes: weekdays, `n` points ending yesterday, daily vol as declared. */
function dailySeries(symbol: string, n: number): Array<{ t: number; v: number }> {
  const m = master(symbol);
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const days: number[] = [];
  for (let d = today - DAY; days.length < n; d -= DAY) { const wd = new Date(d * 1000).getUTCDay(); if (wd !== 0 && wd !== 6) days.unshift(d); }
  return walkBack(days, m.base, m.vol, seedOf(symbol));
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
function hourlySeries(symbol: string, days: number): Array<{ t: number; v: number }> {
  const m = master(symbol);
  const end = Math.floor(Date.now() / 3600) * 3600;
  const times: number[] = [];
  for (let t = end - days * DAY; t <= end; t += 3600) { const d = new Date(t * 1000); const wd = d.getUTCDay(), h = d.getUTCHours(); if (wd === 0 || wd === 6 || h < 1 || h > 8) continue; times.push(t); }
  return walkBack(times, m.base, m.vol / Math.sqrt(7), seedOf(symbol) + 2);
}

export function mockTable(): { rows: TableRow[]; asOf: string } {
  const rows: TableRow[] = MASTER.map((m) => {
    const s = dailySeries(m.symbol, 800);
    const last = m.base;
    const at = (daysBack: number) => s[Math.max(0, s.length - 1 - daysBack)];
    const a = { d1: at(1), w1: at(5), m1: at(21), m3: at(63), m12: at(252), m36: at(756) };
    const closes: TableRow["closes"] = {}, closeDates: TableRow["closeDates"] = {}, pct: TableRow["pct"] = {};
    for (const [k, p] of Object.entries(a) as Array<[keyof typeof a, { t: number; v: number }]>) { closes[k] = p.v; closeDates[k] = new Date(p.t * 1000).toISOString().slice(0, 10); pct[k] = (last / p.v - 1) * 100; }
    return { ...m, proxyFor: m.proxyFor, last, lastAt: new Date().toISOString(), live: m.market === "FX" || m.market === "CME", closes, closeDates, pct };
  });
  return { rows, asOf: new Date().toISOString() };
}

export function mockSeries(symbol: string, range: string): Series {
  if (range === "1D") return { symbol, res: "1m", points: intradaySeries(symbol), asOf: new Date().toISOString() };
  if (range === "1W" || range === "1M") return { symbol, res: "1h", points: hourlySeries(symbol, range === "1W" ? 31 : 62), asOf: new Date().toISOString() };
  const days: Record<string, number> = { "3M": 93, "12M": 366, "36M": 1096 };
  const n = Math.round(((days[range] ?? 366) * 2 + 1120) * 0.69);
  const pts = dailySeries(symbol, n);
  return { symbol, res: "1d", points: pts, asOf: new Date(pts[pts.length - 1].t * 1000).toISOString().slice(0, 10) };
}

export function mockCurve(country: string, ago: string | null): { country: string; current: Curve | null; ghost: Curve | null } {
  const us: Array<[string, number, number]> = [["1 Mo", 1 / 12, 4.02], ["3 Mo", 0.25, 4.19], ["6 Mo", 0.5, 4.23], ["1 Yr", 1, 4.33], ["2 Yr", 2, 4.51], ["3 Yr", 3, 4.59], ["5 Yr", 5, 4.64], ["7 Yr", 7, 4.74], ["10 Yr", 10, 4.86], ["20 Yr", 20, 5.29], ["30 Yr", 30, 5.26]];
  const jp: Array<[string, number, number]> = [["1Y", 1, 1.671], ["2Y", 2, 1.88], ["3Y", 3, 1.982], ["5Y", 5, 2.243], ["7Y", 7, 2.429], ["10Y", 10, 2.817], ["15Y", 15, 3.362], ["20Y", 20, 3.669], ["30Y", 30, 3.94], ["40Y", 40, 3.96]];
  const src = country === "JP" ? jp : us;
  const mk = (shift: number, d: string): Curve => ({ country: country as "US" | "JP", date: d, source: country === "JP" ? "MOF (mock)" : "treasury.gov (mock)", points: src.map(([tenor, years, y]) => ({ tenor, years, yield: y + shift * (1 - years / 40) })) });
  return { country, current: mk(0, new Date().toISOString().slice(0, 10)), ghost: ago ? mk(ago === "36M" ? -0.9 : ago === "12M" ? -0.35 : 0.12, "earlier") : null };
}

function mockNote() {
  const mv = (symbol: string, name: string, pct: number, last: number, sector?: string) => ({ symbol, name, last, prev: last / (1 + pct / 100), pct, sector });
  const sec = (sector: string, pct: number, n: number) => ({ sector, pct, n, weighted: true });
  return {
    id: 1, d: new Date().toISOString().slice(0, 10), title: "Chip rout meets Toyota surge; Nikkei futures point lower (MOCK)", generatedAt: new Date().toISOString(), model: "mock",
    sections: [
      { heading: "Overnight: US", md: "S&P 500 **-1.84%**, NASDAQ -2.40%, SOX -4.11%; VIX 25.6. Breadth 92 up / 408 down of 500. Broad sell-off, centred on Tech [1]." },
      { heading: "Big movers and why", md: "- **MU -9.8%**: guided below consensus on HBM pricing [2].\n- **LLY +6.1%**: reason not found." },
      { heading: "Japan outlook and daily strategy", md: "Nikkei 225 closed -1.1% yesterday; the CME future implies a -2.3% open (E). Index sits 1.2σ below its 1M mean and 2.1% under the 200-day average. Expect the semis-led weakness to carry into Tokyo but fade by the afternoon (E). Hedge: buy Nikkei VI exposure into the open (E)." },
      { heading: "Other macro", md: "UST 10Y 4.86% (+2bp), USD/JPY 158.4, WTI 90.8. Calendar: 21:30 SGT US payrolls." },
    ],
    sources: [{ n: 1, title: "Stocks slide as chip names tumble (mock)", url: "https://example.com/1" }, { n: 2, title: "Micron guidance (mock)", url: "https://example.com/2" }],
    pack: {
      us: { indices: [mv("^GSPC", "S&P 500", -1.84, 7376.86), mv("^IXIC", "NASDAQ Composite", -2.4, 24579.42), mv("^SOX", "SOX", -4.11, 9390.25), mv("^VIX", "VIX", 12.3, 25.64)], sectorsEtf: [mv("XLU", "Utilities", 0.6, 80), mv("XLP", "Consumer Staples", 0.2, 82), mv("XLF", "Financials", -0.9, 57), mv("XLK", "Technology", -3.4, 164)], sectorsConstituents: [], top: [mv("LLY", "Eli Lilly", 6.1, 1417.99), mv("KO", "Coca-Cola", 1.2, 95.8)], bottom: [mv("MU", "Micron", -9.8, 795.23), mv("AMD", "AMD", -6.2, 488.78)], big: [], breadth: { n: 500, up: 92, down: 408, over2: 14, under2: 171, over5: 3, under5: 22 }, source: "Wikipedia list (mock); Yahoo closes" },
      jp: { indices: [mv("^N225", "Nikkei 225", -1.1, 57434.77), mv("1306.T", "TOPIX (1306.T proxy)", -0.7, 388.6)], sectors: [sec("Technology", -2.9, 40), sec("Financials", 0.4, 22), sec("Consumer Goods", -0.6, 35)], top: [mv("7203.T", "Toyota Motor", 16.7, 3533), mv("8306.T", "MUFG", 2.0, 2040)], bottom: [mv("6857.T", "Advantest", -8.1, 11000), mv("8035.T", "Tokyo Electron", -6.4, 32000)], big: [], breadth: { n: 225, up: 60, down: 160, over2: 9, under2: 70, over5: 2, under5: 11 }, impliedOpenPct: -2.3, impliedNote: "CME Nikkei future vs cash close (E)", source: "Nikkei CSV (mock); Yahoo closes" },
      table: [{ symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", last: 4.859, d1Pct: null, d1Chg: 0.02, unit: "bp" }, { symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", last: 158.425, d1Pct: -0.2, d1Chg: null, unit: "pct" }, { symbol: "CL=F", name: "WTI crude", cls: "Commodities", last: 90.83, d1Pct: 0.9, d1Chg: null, unit: "pct" }],
    },
  };
}

export const mockHealth = (): Health => ({ ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true, note: "mock" }, daily: { lastAt: new Date().toISOString(), ok: true, note: "mock" }, sources: [{ name: "mock", lastOk: new Date().toISOString(), lastError: null }], holidays: {}, holidaysVerified: false });

export function mockAction(action: string, params: Record<string, string | number | boolean | undefined> | undefined): unknown {
  switch (action) {
    case "table": return mockTable();
    case "series": return mockSeries(String(params?.symbol ?? "^N225"), String(params?.range ?? "12M"));
    case "curve": return mockCurve(String(params?.country ?? "US"), params?.ago ? String(params.ago) : null);
    case "health": return mockHealth();
    case "note": return { note: mockNote() };
    case "calendar": return { rows: [] };
    case "news": return { rows: [] };
    case "reports": return { rows: [] };
    case "alerts": {
      const now = Date.now();
      const mk = (id: number, minAgo: number, symbol: string, name: string, kind: "stock" | "index", pct: number, price: number, market: string) => ({ id, at: new Date(now - minAgo * 60e3).toISOString(), d: new Date(now - minAgo * 60e3).toISOString().slice(0, 10), symbol, name, kind, pct, price, market, msg: `${name} ${pct >= 0 ? "up" : "down"} ${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.round(Math.abs(pct) * 10) / 10}%${kind === "stock" ? " intraday" : ""}` });
      return { rows: [mk(5, 3, "285A.T", "KIOXIA HOLDINGS CORP.", "stock", -11.2, 2840, "TSE"), mk(4, 41, "^SOX", "PHLX Semiconductor (SOX)", "index", -4.11, 9390.25, "NYSE"), mk(3, 95, "MU", "Micron Technology", "stock", -9.8, 795.23, "NYSE"), mk(2, 310, "7203.T", "TOYOTA MOTOR CORP.", "stock", 16.7, 3533, "TSE"), mk(1, 1500, "^N225", "Nikkei 225", "index", -3.4, 57434.77, "TSE")] };
    }
    case "policy": return { rows: [
      { bank: "FED", name: "Federal Reserve", rateLabel: "Fed funds target range, upper bound", rate: 4.0, asOf: "2026-11-06", lastChange: "2026-10-29", nextMeeting: null, sourceUrl: "https://www.federalreserve.gov/monetarypolicy/openmarket.htm", sourceNote: "FRED DFEDTARU (mock)" },
      { bank: "BOJ", name: "Bank of Japan", rateLabel: "Uncollateralised overnight call rate", rate: null, asOf: null, lastChange: null, nextMeeting: null, sourceUrl: "https://www.boj.or.jp/en/mopo/mpmdeci/index.htm", sourceNote: null },
      { bank: "ECB", name: "European Central Bank", rateLabel: "Deposit facility rate", rate: null, asOf: null, lastChange: null, nextMeeting: null, sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html", sourceNote: null },
    ] };
    default: return { rows: [] };
  }
}
