// The paper portfolio's probe of Yahoo Finance for stocks, funds, currencies, options and total-return indices (P-0:
// C/portfolio-plan.md §3.1 item 1; its futures part is yahoo_futures.ts). Yahoo is unofficial; the owner said yes on
// 20 Nov 2026 to four of its series (OD-P5: bid and ask, named futures months, US option chains, total-return
// indices), each "used only after its probe shows it is there and current". Read-only, no key, nothing written; the
// session cookie and crumb are never printed. Every symbol here is a candidate the PMs named from memory, unless a log
// in C/probes/ shows it.
//
// It prints, for P-2 and P-3 (the first usable version) first:
//   1. NVDA, 7203.T, SPY and 1306.T: ten years of daily bars with their dividend and split events (is the series
//      split-adjusted? the trackers' distributions for X-2); five days of one-minute bars per session: bars with
//      volume, the first and last bars' share of the day (do they carry the auctions? X-5), the minute volumes
//      against the daily bar's, gaps, the declared delay; bid, ask and sizes, and the quoted spread beside Abdi and
//      Ranaldo's estimate from the last 21 daily bars (X-19: A gives a fallback by size if the estimate is above twice
//      the quoted spread);
//   2. bid, ask and sizes for ES=F, the front ES contract, USDJPY=X and EURUSD=X (B; OD-P5 (a));
//   3. the proxy candidates of §2.20 (EWJ, HEWJ, DBJP, ACWI, 2559.T, EEM, EPP, an MSCI Europe fund, 1321.T, BNDW, the
//      London Global Aggregate fund's USD-hedged class, a plain MSCI USA tracker if a search finds one): ten years of
//      daily bars and distributions, and the year's total return from them (E); B's two measurements: BNDW against
//      the London fund (tracking error on daily, weekly and monthly total returns) and BNDW's close against its NAV;
//   4. B's bond funds (18): whether each answers, and the distributions of four;
//   5. option chains for SPY, ^SPX, QQQ and NVDA (OD-P5 (c));
//   6. ^SP500TR and any total-return symbol a search finds for TOPIX, the Nikkei 225 or MSCI ACWI (OD-P5 (d));
//   7. how far back Yahoo's monthly bars reach for the factor list (BP-4: from 1 Jan 2013).
// Bid and ask are worth most in session: run it once while New York is open (14:30–21:00 UTC) and once while Tokyo is
// (00:00–06:30 UTC, lunch 02:30–03:30); each line says the market's state at the time.
//
// Requests: at most 44, all to Yahoo, 1.2 s apart: the session (2), six searches (6), one quote of every symbol (1),
// the four stocks' daily and minute bars (8), two trackers' distributions (2), up to 11 proxies (11), four bond funds'
// distributions (4), four option chains (4), total-return series (up to 4), the factor list's reach (2). A 429 is
// asked again once after 5 s, three times at most in all (so at most 47); after three 429s in a row nothing more is
// asked.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = pf_yahoo, runtime = node
import { head, look, masked, pause, requestsMade, yahooSession } from "./lib.ts";

const GAP = 1200, MAX = 44;
type J = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const iso = (t: number | null) => (t == null ? "–" : new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC");
const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (key: string, make: () => Intl.DateTimeFormat) => fmts.get(key) ?? fmts.set(key, make()).get(key)!;
const dayIn = (tz: string, t: number) => fmt(`d ${tz}`, () => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })).format(new Date(t * 1000));
const hmIn = (tz: string, t: number) => fmt(`t ${tz}`, () => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })).format(new Date(t * 1000));
const pct = (x: number | null, dp = 2) => (x == null || !Number.isFinite(x) ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(dp)}%`);
const sd = (xs: number[]) => { if (xs.length < 2) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

let left429 = 3, inRow = 0, stopped = false;
async function yget(url: string, headers: Record<string, string> = {}): Promise<J | null> {
  if (stopped) { console.log(`  not asked (Yahoo refused three times in a row): ${masked(url)}`); return null; }
  for (;;) {
    const r = await look(url, { headers: { accept: "application/json", ...headers }, show: 0, timeoutMs: 40000 });
    await pause(GAP);
    if (r.status === 429) {
      if (++inRow >= 3) { stopped = true; console.log("  Yahoo answered 429 three times in a row: nothing more is asked"); return null; }
      if (left429-- > 0) { await pause(5000); continue; }
      return null;
    }
    inRow = 0;
    let j: unknown = null;
    try { j = JSON.parse(r.text); } catch { /* below */ }
    if (!r.ok || !j || typeof j !== "object") { if (r.text) console.log(`  answer: ${masked(JSON.stringify(r.text.slice(0, 220)))}`); return null; }
    return j as J;
  }
}

interface Bars { meta: J; tz: string; ts: number[]; o: Array<number | null>; h: Array<number | null>; l: Array<number | null>; c: Array<number | null>; v: Array<number | null>; div: Array<{ t: number; amount: number }>; split: Array<{ t: number; num: number; den: number }> }
function barsOf(j: J | null): Bars | null {
  const res = ((j?.chart as { result?: Array<{ meta?: J; timestamp?: number[]; indicators?: { quote?: Array<Record<string, Array<number | null>>> }; events?: { dividends?: Record<string, { amount?: number; date?: number }>; splits?: Record<string, { numerator?: number; denominator?: number; date?: number }> } }> } | undefined)?.result ?? [])[0];
  if (!res?.meta) return null;
  const ts = res.timestamp ?? [], q = res.indicators?.quote?.[0] ?? {}, n = ts.length;
  const arr = (a?: Array<number | null>) => (a && a.length === n ? a : new Array<number | null>(n).fill(null));
  const div = Object.values(res.events?.dividends ?? {}).map((d) => ({ t: Number(d.date), amount: Number(d.amount) })).filter((d) => Number.isFinite(d.t) && Number.isFinite(d.amount)).sort((a, b) => a.t - b.t);
  const split = Object.values(res.events?.splits ?? {}).map((d) => ({ t: Number(d.date), num: Number(d.numerator), den: Number(d.denominator) })).filter((d) => Number.isFinite(d.t)).sort((a, b) => a.t - b.t);
  return { meta: res.meta, tz: String(res.meta.exchangeTimezoneName ?? "UTC"), ts, o: arr(q.open), h: arr(q.high), l: arr(q.low), c: arr(q.close), v: arr(q.volume), div, split };
}
/** Daily closes by the exchange's date, with each date's distribution (paid on its ex-date). */
function daily(b: Bars): Array<{ d: string; t: number; o: number | null; h: number | null; l: number | null; c: number; v: number | null; div: number }> {
  const dv = new Map<string, number>();
  for (const x of b.div) dv.set(dayIn(b.tz, x.t), (dv.get(dayIn(b.tz, x.t)) ?? 0) + x.amount);
  const out: Array<{ d: string; t: number; o: number | null; h: number | null; l: number | null; c: number; v: number | null; div: number }> = [];
  b.ts.forEach((t, i) => { const c = b.c[i]; if (c == null) return; const d = dayIn(b.tz, t); const row = { d, t, o: b.o[i], h: b.h[i], l: b.l[i], c, v: b.v[i], div: dv.get(d) ?? 0 }; if (out.length && out[out.length - 1].d === d) out[out.length - 1] = row; else out.push(row); });
  return out;
}
/** Total return over the last n days, from raw closes and distributions on their ex-dates (X-2), and the daily series. */
function totalReturns(rows: ReturnType<typeof daily>): Array<{ d: string; r: number }> {
  const out: Array<{ d: string; r: number }> = [];
  for (let i = 1; i < rows.length; i++) out.push({ d: rows[i].d, r: (rows[i].c + rows[i].div) / rows[i - 1].c - 1 });
  return out;
}

const t0 = Date.now(), now = new Date();
console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`);
head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await yahooSession();
await pause(GAP);

// ---- searches: symbols nobody could name for certain ----
head("Searches: total-return indices (TOPIX, the Nikkei 225), an MSCI ACWI index symbol, an MSCI Europe fund, the London Global Aggregate fund's USD-hedged class, a plain MSCI USA tracker");
type Hit = { symbol: string; name: string; type: string; exch: string };
const searched = new Map<string, Hit[]>();
for (const term of ["TOPIX Total Return", "Nikkei 225 Total Return", "MSCI ACWI index", "iShares Core MSCI Europe ETF", "iShares Core Global Aggregate Bond UCITS ETF USD Hedged", "MSCI USA ETF"]) {
  const j = await yget(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=10&newsCount=0&listsCount=0`);
  const hits = (((j?.quotes as J[] | undefined) ?? []).map((x) => ({ symbol: String(x.symbol ?? ""), name: String(x.longname ?? x.shortname ?? ""), type: String(x.quoteType ?? ""), exch: String(x.exchDisp ?? x.exchange ?? "") })).filter((x) => x.symbol));
  searched.set(term, hits);
  console.log(`  "${term}": ${hits.length ? hits.map((x) => `${x.symbol} (${x.name}; ${x.type}; ${x.exch})`).join(" · ") : "nothing"}`);
}
const pick = (term: string, ok: (h: Hit) => boolean): string | null => (searched.get(term) ?? []).find(ok)?.symbol ?? null;
const US = /NYSE|Nasdaq|NASDAQ|Arca|BATS|Cboe|PCX|NGM|NMS|NYQ|BTS|ASE/i;
const trTopix = pick("TOPIX Total Return", (h) => /INDEX/i.test(h.type) && /total return|TR\b|配当込/i.test(h.name));
const trNikkei = pick("Nikkei 225 Total Return", (h) => /INDEX/i.test(h.type) && /total return|TR\b|配当込/i.test(h.name));
const acwiIdx = pick("MSCI ACWI index", (h) => /INDEX/i.test(h.type) && /ACWI|All Country/i.test(h.name));
const europeHit = pick("iShares Core MSCI Europe ETF", (h) => /ETF/i.test(h.type) && /MSCI Europe(?! ex)/i.test(h.name) && US.test(h.exch)), europe = europeHit ?? "IEUR";
const londonHit = pick("iShares Core Global Aggregate Bond UCITS ETF USD Hedged", (h) => /Global Aggregate/i.test(h.name) && /USD H/i.test(h.name) && (/\.L$/.test(h.symbol) || /London|LSE/i.test(h.exch))), london = londonHit ?? "AGGU.L";
const msciUsa = pick("MSCI USA ETF", (h) => /ETF/i.test(h.type) && /MSCI USA\b/i.test(h.name) && !/ESG|Min|Momentum|Quality|Value|Equal|Factor|Small|Mid|Dividend|Size|Climate|SRI|Leaders|Screened|Islamic|Growth|Select|Hedged|IMI|Paris/i.test(h.name));
console.log(`  chosen: TOPIX TR ${trTopix ?? "none found"}; Nikkei 225 TR ${trNikkei ?? "none found"}; MSCI ACWI index ${acwiIdx ?? "none found"}; MSCI Europe fund ${europe}${europeHit ? "" : " (a candidate: the search found none)"}; London fund ${london}${londonHit ? "" : " (a candidate: the search found none)"}; plain MSCI USA tracker ${msciUsa ?? "none found"}`);

// ---- one quote for every symbol: names, state, bid, ask, sizes, volumes, NAV ----
const STOCKS = ["NVDA", "7203.T", "SPY", "1306.T"];
const esFront = (() => { // the quarterly contract whose expiry (third Friday of its month) is still ahead
  for (let k = 0; k < 15; k++) {
    const y = now.getUTCFullYear() + Math.floor((now.getUTCMonth() + k) / 12), m = (now.getUTCMonth() + k) % 12;
    if (m % 3 !== 2) continue;
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), third = 1 + ((5 - first + 7) % 7) + 14;
    if (Date.UTC(y, m, third, 21) >= now.getTime()) return `ES${"HMUZ"[(m - 2) / 3]}${String(y % 100).padStart(2, "0")}.CME`;
  }
  return "ESZ26.CME";
})();
const FUTFX = ["ES=F", esFront, "USDJPY=X", "EURUSD=X"];
const TRACKERS = ["QQQ", "1321.T", "1475.T"];
const PROXIES = ["EWJ", "HEWJ", "DBJP", "ACWI", "2559.T", "EEM", "EPP", europe, "BNDW", london, ...(msciUsa ? [msciUsa] : [])];
const BONDS = ["SHY", "IEI", "IEF", "TLH", "TLT", "AGG", "BND", "LQD", "MBB", "BNDX", "IAGG", "BWX", "IGOV", "HYG", "EMB", "EMLC", "TIP", "FLOT"];
const TR = ["^SP500TR", ...[trTopix, trNikkei, acwiIdx].filter((x): x is string => !!x)];
const ALLQ = [...new Set([...STOCKS, ...FUTFX, ...TRACKERS, ...PROXIES, ...BONDS, ...TR])];
const quotes = new Map<string, J>();
head(`The v7 quote of ${ALLQ.length} symbols: state, last, bid × size, ask × size, quoted spread, volume, average volumes, delay, NAV`);
if (s) {
  const j = await yget(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ALLQ.join(","))}&crumb=${encodeURIComponent(s.crumb)}`, { cookie: s.cookie });
  for (const q of ((j?.quoteResponse as { result?: J[] } | undefined)?.result ?? [])) if (typeof q.symbol === "string") quotes.set(q.symbol, q);
  console.log(`  ${quotes.size} of ${ALLQ.length} answered${ALLQ.filter((x) => !quotes.has(x)).length ? `; not: ${ALLQ.filter((x) => !quotes.has(x)).join(" ")}` : ""}`);
  const one = quotes.get("SPY") ?? [...quotes.values()][0];
  if (one) console.log(`  the fields an ETF's quote carries (${one.symbol}): ${Object.keys(one).sort().join(", ")}`);
} else console.log("  no session: no quote asked");
const spreadBp = (q: J | undefined): number | null => { const b = num(q?.bid), a = num(q?.ask); return b != null && a != null && b > 0 && a > 0 && a >= b ? ((a - b) / ((a + b) / 2)) * 1e4 : null; };
for (const sym of ALLQ) {
  const q = quotes.get(sym);
  if (!q) continue;
  const extra = ["navPrice", "netExpenseRatio", "netAssets", "trailingAnnualDividendYield", "dividendYield", "ytdReturn"].filter((k) => q[k] != null).map((k) => `${k} ${q[k]}`).join(", ");
  const sb = spreadBp(q);
  console.log(`  ${sym}: "${q.longName ?? q.shortName ?? "–"}" · ${q.quoteType ?? "–"} · ${q.fullExchangeName ?? q.exchange ?? "–"} · ${q.currency ?? "–"} · state ${q.marketState ?? "–"} · last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))} · delayed ${q.exchangeDataDelayedBy ?? "–"} min · bid ${q.bid ?? "–"} × ${q.bidSize ?? "–"}, ask ${q.ask ?? "–"} × ${q.askSize ?? "–"}${sb != null ? ` (spread ${sb.toFixed(2)} bp)` : ""} · volume ${q.regularMarketVolume ?? "–"}, average 10d ${q.averageDailyVolume10Day ?? "–"}, 3m ${q.averageDailyVolume3Month ?? "–"}${extra ? ` · ${extra}` : ""}`);
}

// ---- 1. the four stocks ----
const series = new Map<string, ReturnType<typeof daily>>();
const oneYearTR = new Map<string, number>();
head("1. NVDA, 7203.T, SPY and 1306.T: ten years of daily bars with events; five days of one-minute bars; the spread against the estimate");
for (const sym of STOCKS) {
  console.log(`\n-- ${sym}`);
  const b = barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d&events=div%7Csplit`));
  const q = quotes.get(sym);
  let rows: ReturnType<typeof daily> = [];
  if (b) {
    rows = daily(b); series.set(sym, rows);
    console.log(`  daily: ${rows.length} bars, ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"} (${b.tz}); newest close ${rows[rows.length - 1]?.c ?? "–"}; ${b.div.length} dividends over the range${b.div.length ? `, the last four: ${b.div.slice(-4).map((x) => `${dayIn(b.tz, x.t)} ${x.amount}`).join(", ")}` : ""}; ${b.split.length} splits${b.split.length ? `: ${b.split.map((x) => `${dayIn(b.tz, x.t)} ${x.num}:${x.den}`).join(", ")}` : ""}`);
    for (const x of b.split) {   // is the series adjusted for the split? (X-6)
      const d = dayIn(b.tz, x.t), k = rows.findIndex((r) => r.d >= d);
      if (k > 0) { const ratio = rows[k].c / rows[k - 1].c; console.log(`    split ${d} ${x.num}:${x.den}: close ${rows[k - 1].c} (${rows[k - 1].d}) then ${rows[k].c} (${rows[k].d}), ratio ${ratio.toFixed(3)}: ${Math.abs(ratio - 1) < 0.25 ? "the series is split-adjusted" : `NOT adjusted (a split of ${x.num}:${x.den} would show ${(x.den / x.num).toFixed(3)})`}`); }
    }
    const tr = totalReturns(rows).slice(-252);
    if (tr.length) { const r = tr.reduce((a, x) => a * (1 + x.r), 1) - 1; oneYearTR.set(sym, r); console.log(`  total return over the last ${tr.length} sessions, from raw closes and distributions (worked out here, E): ${pct(r)}`); }
    // Abdi and Ranaldo (2017), two-day corrected: s_t = sqrt(max(4 (c_t − η_t)(c_t − η_{t+1}), 0)), logs, η the mid-range
    const inSession = /^(REGULAR|PRE)$/i.test(String(q?.marketState ?? ""));
    const full = rows.filter((r) => r.h != null && r.l != null && (r.h as number) > 0 && (r.l as number) > 0).slice(0, inSession ? -1 : undefined);
    const ss: number[] = [];
    for (let i = Math.max(0, full.length - 22); i < full.length - 1; i++) {
      const c = Math.log(full[i].c), e0 = (Math.log(full[i].h as number) + Math.log(full[i].l as number)) / 2, e1 = (Math.log(full[i + 1].h as number) + Math.log(full[i + 1].l as number)) / 2;
      ss.push(Math.sqrt(Math.max(4 * (c - e0) * (c - e1), 0)));
    }
    const est = ss.length ? (ss.reduce((a, x) => a + x, 0) / ss.length) * 1e4 : null, quoted = spreadBp(q);
    console.log(`  X-19: Abdi–Ranaldo over the ${ss.length} sessions to ${full[full.length - 1]?.d ?? "–"} (E): ${est != null ? `${est.toFixed(2)} bp` : "–"}; quoted now (${q?.marketState ?? "state unknown"}): ${quoted != null ? `${quoted.toFixed(2)} bp` : "no bid and ask"}${est != null && quoted ? `; the estimate is ${(est / quoted).toFixed(1)} times the quoted spread${est > 2 * quoted ? ": ABOVE TWICE IT (A gives a fallback by size before P-2)" : ""}` : ""}`);
  } else console.log("  daily: no chart");
  const m = barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1m`));
  if (m) {
    const reg = (m.meta.currentTradingPeriod as { regular?: { start?: number; end?: number } } | undefined)?.regular;
    console.log(`  one-minute: ${m.ts.length} bars (${m.tz}); regular session today ${reg?.start ? hmIn(m.tz, reg.start) : "–"} to ${reg?.end ? hmIn(m.tz, reg.end) : "–"}; the newest bar ${iso(m.ts[m.ts.length - 1] ?? null)}, ${m.ts.length ? Math.round((now.getTime() / 1000 - (m.ts[m.ts.length - 1] as number)) / 60) : "–"} min before this run; declared delay ${q?.exchangeDataDelayedBy ?? "–"} min`);
    const days = new Map<string, Array<{ t: number; v: number; c: number }>>();
    m.ts.forEach((t, i) => { const c = m.c[i]; if (c == null) return; const d = dayIn(m.tz, t); (days.get(d) ?? days.set(d, []).get(d)!).push({ t, v: m.v[i] ?? 0, c }); });
    const dayVol = new Map(rows.map((r) => [r.d, r.v]));
    for (const [d, bars] of [...days].sort()) {
      const tot = bars.reduce((a, x) => a + x.v, 0), first = bars[0], last = bars[bars.length - 1];
      let gap = 0, gapAt = "";
      for (let i = 1; i < bars.length; i++) { const g = (bars[i].t - bars[i - 1].t) / 60 - 1; if (g > gap) { gap = g; gapAt = hmIn(m.tz, bars[i - 1].t); } }
      const dv = dayVol.get(d);
      console.log(`    ${d}: ${bars.length} bars, ${bars.filter((x) => x.v > 0).length} with volume; first ${hmIn(m.tz, first.t)} volume ${first.v} (${tot ? (first.v / tot * 100).toFixed(1) : "–"}% of the minutes'), last ${hmIn(m.tz, last.t)} volume ${last.v} (${tot ? (last.v / tot * 100).toFixed(1) : "–"}%); minutes sum to ${tot}${dv ? `, the daily bar ${dv} (${(tot / dv * 100).toFixed(1)}%)` : ""}; longest gap ${gap} min${gap ? ` after ${gapAt}` : ""}`);
    }
  } else console.log("  one-minute: no chart");
}

// ---- 2. the trackers' distributions (X-2) ----
head("2. QQQ and 1321.T: ten years of distributions (X-2; SPY's and 1306.T's are above)");
for (const sym of ["QQQ", "1321.T"]) {
  const b = barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1mo&events=div%7Csplit`));
  console.log(`  ${sym}: ${b ? `${b.div.length} distributions${b.div.length ? `, first ${dayIn(b.tz, b.div[0].t)}, the last four ${b.div.slice(-4).map((x) => `${dayIn(b.tz, x.t)} ${x.amount}`).join(", ")}` : ""}; ${b.split.length} splits` : "no chart"}`);
}

// ---- 3. the proxies, and B's two measurements ----
head("3. The proxy candidates (§2.20): ten years of daily bars and distributions; the year's total return (E)");
for (const sym of PROXIES) {
  const b = barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d&events=div%7Csplit`));
  if (!b) { console.log(`  ${sym}: no chart`); continue; }
  const rows = daily(b); series.set(sym, rows);
  const lastYear = b.div.filter((x) => x.t > now.getTime() / 1000 - 365 * 86400);
  const tr = totalReturns(rows).slice(-252), r = tr.length ? tr.reduce((a, x) => a * (1 + x.r), 1) - 1 : null;
  if (r != null) oneYearTR.set(sym, r);
  console.log(`  ${sym}: "${b.meta.longName ?? b.meta.shortName ?? "–"}" · ${b.meta.fullExchangeName ?? b.meta.exchangeName ?? "–"} · ${b.meta.currency ?? "–"} · ${rows.length} daily bars ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"} · newest close ${rows[rows.length - 1]?.c ?? "–"} · ${b.div.length} distributions (${lastYear.length} in the last 365 days, summing ${lastYear.reduce((a, x) => a + x.amount, 0).toFixed(4)})${b.div.length ? `, the last ${dayIn(b.tz, b.div[b.div.length - 1].t)} ${b.div[b.div.length - 1].amount}` : ""} · total return over ${tr.length} sessions ${pct(r)} (E)`);
}
head("3b. B's two measurements: BNDW against the London fund (daily, weekly, monthly total returns), and BNDW's close against its NAV");
{
  const a = series.get("BNDW"), b = series.get(london);
  if (a && b) {
    const ra = new Map(totalReturns(a).map((x) => [x.d, x.r])), rb = new Map(totalReturns(b).map((x) => [x.d, x.r]));
    const common = [...ra.keys()].filter((d) => rb.has(d)).sort().slice(-252);
    const diff = common.map((d) => (ra.get(d) as number) - (rb.get(d) as number));
    const sa = common.map((d) => ra.get(d) as number), sb2 = common.map((d) => rb.get(d) as number);
    const ma = sa.reduce((x, y) => x + y, 0) / (sa.length || 1), mb = sb2.reduce((x, y) => x + y, 0) / (sb2.length || 1);
    const cov = sa.reduce((acc, x, i) => acc + (x - ma) * (sb2[i] - mb), 0) / Math.max(1, sa.length - 1);
    const corr = sd(sa) && sd(sb2) ? cov / ((sd(sa) as number) * (sd(sb2) as number)) : null;
    // weekly and monthly: total-return indices sampled at each week's and month's last common date
    const idx = (rows: ReturnType<typeof daily>) => { const m = new Map<string, number>(); let v = 1; for (let i = 1; i < rows.length; i++) { v *= (rows[i].c + rows[i].div) / rows[i - 1].c; m.set(rows[i].d, v); } return m; };
    const ia = idx(a), ib = idx(b), both = [...ia.keys()].filter((d) => ib.has(d)).sort();
    const sample = (key: (d: string) => string) => { const last = new Map<string, string>(); for (const d of both) last.set(key(d), d); return [...last.values()].sort(); };
    const week = (d: string) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + (5 - t.getUTCDay() + 7) % 7); return t.toISOString().slice(0, 10); };
    const te = (dates: string[], n: number, k: number) => { const ds = dates.slice(-(n + 1)), x: number[] = []; for (let i = 1; i < ds.length; i++) x.push((ia.get(ds[i])! / ia.get(ds[i - 1])! - 1) - (ib.get(ds[i])! / ib.get(ds[i - 1])! - 1)); const v = sd(x); return v == null ? "–" : `${(v * Math.sqrt(k) * 100).toFixed(2)}% a year over ${x.length}`; };
    console.log(`  daily: ${common.length} common dates to ${common[common.length - 1] ?? "–"}; tracking error ${sd(diff) != null ? `${((sd(diff) as number) * Math.sqrt(252) * 100).toFixed(2)}% a year` : "–"}; correlation ${corr != null ? corr.toFixed(3) : "–"} (as B recalls them, the London fund closes at 16:30 London and BNDW at 16:00 New York: asynchronous)`);
    console.log(`  weekly (Friday weeks): tracking error ${te(sample(week), 52, 52)} weeks; monthly: ${te(sample((d) => d.slice(0, 7)), 36, 12)} months`);
    console.log(`  over the last ${common.length} common dates: BNDW ${pct(sa.reduce((x, y) => x * (1 + y), 1) - 1)}, ${london} ${pct(sb2.reduce((x, y) => x * (1 + y), 1) - 1)} (E; in each fund's own currency: ${quotes.get("BNDW")?.currency ?? "–"} and ${quotes.get(london)?.currency ?? "–"})`);
  } else console.log(`  not worked out: ${a ? "" : "BNDW "}${b ? "" : london} without a series`);
  const q = quotes.get("BNDW"), px = num(q?.regularMarketPrice), nav = num(q?.navPrice);
  console.log(`  BNDW's last ${px ?? "–"} against its NAV in the quote ${nav ?? "–"}${px && nav ? `: ${((px / nav - 1) * 1e4).toFixed(1)} bp` : ""} (one date only; a NAV history is looked for on the issuer's page by pf_bench)`);
}

// ---- 4. B's bond funds ----
head("4. B's bond funds: each answers? (the quote above); four funds' distributions over ten years");
console.log(`  answered the quote: ${BONDS.filter((x) => quotes.has(x)).join(" ") || "none"}; not: ${BONDS.filter((x) => !quotes.has(x)).join(" ") || "none"}`);
for (const sym of ["TLT", "AGG", "BNDX", "EMLC"]) {
  const b = barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1mo&events=div%7Csplit`));
  console.log(`  ${sym}: ${b ? `${b.div.length} distributions${b.div.length ? `, first ${dayIn(b.tz, b.div[0].t)}, the last three ${b.div.slice(-3).map((x) => `${dayIn(b.tz, x.t)} ${x.amount}`).join(", ")}` : ""}` : "no chart"}`);
}

// ---- 5. option chains ----
head("5. Option chains (OD-P5 (c)): SPY, ^SPX, QQQ, NVDA, the nearest expiry");
for (const sym of ["SPY", "^SPX", "QQQ", "NVDA"]) {
  if (!s) { console.log(`  ${sym}: no session, not asked`); continue; }
  const j = await yget(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?crumb=${encodeURIComponent(s.crumb)}`, { cookie: s.cookie });
  const res = ((j?.optionChain as { result?: J[] } | undefined)?.result ?? [])[0];
  if (!res) { console.log(`  ${sym}: no chain`); continue; }
  const exps = (res.expirationDates as number[] | undefined) ?? [], strikes = (res.strikes as number[] | undefined) ?? [];
  const uq = (res.quote ?? {}) as J, spot = num(uq.regularMarketPrice);
  const o = ((res.options as J[] | undefined) ?? [])[0] ?? {};
  const calls = (o.calls as J[] | undefined) ?? [], puts = (o.puts as J[] | undefined) ?? [];
  const count = (xs: J[], k: string) => xs.filter((x) => (num(x[k]) ?? 0) > 0).length;
  console.log(`  ${sym}: underlying ${res.underlyingSymbol ?? "–"} last ${spot ?? "–"} at ${iso(num(uq.regularMarketTime))} (${uq.marketState ?? "–"}); ${exps.length} expiries (${exps.slice(0, 3).map((t) => iso(t).slice(0, 10)).join(", ")} … ${exps.length ? iso(exps[exps.length - 1]).slice(0, 10) : "–"}), ${strikes.length} strikes; nearest ${iso(num(o.expirationDate)).slice(0, 10)}: ${calls.length} calls, ${puts.length} puts`);
  for (const [side, xs] of [["calls", calls], ["puts", puts]] as Array<[string, J[]]>) {
    console.log(`    ${side}: bid > 0 ${count(xs, "bid")}, ask > 0 ${count(xs, "ask")}, implied vol > 0 ${count(xs, "impliedVolatility")}, volume > 0 ${count(xs, "volume")}, open interest > 0 ${count(xs, "openInterest")}`);
    const near = spot == null ? xs.slice(0, 3) : [...xs].sort((a, b) => Math.abs((num(a.strike) ?? 0) - spot) - Math.abs((num(b.strike) ?? 0) - spot)).slice(0, 3);
    for (const x of near) console.log(`      ${x.contractSymbol ?? "–"}: strike ${x.strike ?? "–"}, bid ${x.bid ?? "–"}, ask ${x.ask ?? "–"}, last ${x.lastPrice ?? "–"} at ${iso(num(x.lastTradeDate))}, implied vol ${x.impliedVolatility ?? "–"}, volume ${x.volume ?? "–"}, open interest ${x.openInterest ?? "–"}`);
  }
}

// ---- 6. total-return indices ----
head("6. Total-return indices (OD-P5 (d)): ^SP500TR, and the symbols the searches found");
for (const sym of TR) {
  const b = barsOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${sym === "^SP500TR" ? "1y" : "1mo"}&interval=1d`));
  if (!b) { console.log(`  ${sym}: no chart`); continue; }
  const rows = daily(b), r = rows.length > 1 ? rows[rows.length - 1].c / rows[0].c - 1 : null;
  console.log(`  ${sym}: "${b.meta.longName ?? b.meta.shortName ?? "–"}" · ${b.meta.fullExchangeName ?? b.meta.exchangeName ?? "–"} · ${rows.length} daily closes ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"}, newest ${rows[rows.length - 1]?.c ?? "–"}; change over the range ${pct(r)}`);
  if (sym === "^SP500TR" && r != null && oneYearTR.has("SPY")) {
    const n = rows.length - 1, spy = series.get("SPY");
    const tr = spy ? totalReturns(spy).filter((x) => x.d > rows[0].d && x.d <= rows[rows.length - 1].d) : [];
    const spyR = tr.reduce((a, x) => a * (1 + x.r), 1) - 1;
    console.log(`    against SPY's total return over the same dates (${tr.length} of ${n} sessions; E): ${pct(spyR)}; the gap ${((r - spyR) * 100).toFixed(2)} pp (a fund's fee, its cash and the timing of its distributions would show in it)`);
  }
}

// ---- 7. the factor list's reach ----
head("7. How far back Yahoo's monthly bars reach (BP-4, from 1 Jan 2013): the factor list");
const FACTORS = ["^GSPC", "^N225", "^STOXX50E", "^NDX", "^DJI", "^RUT", "^TNX", "^VIX", "DX-Y.NYB", "USDJPY=X", "EURUSD=X", "GBPUSD=X", "AUDUSD=X", "USDCAD=X", "USDCHF=X", "CL=F", "BZ=F", "GC=F", "HG=F", "SI=F", "NG=F", "1306.T"];
for (let i = 0; i < FACTORS.length; i += 20) {
  const b = FACTORS.slice(i, i + 20);
  const j = await yget(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(b.join(","))}&range=max&interval=1mo`);
  // two shapes: the flat one the server reads ({SYM: {timestamp, close}}), and v7's ({spark: {result: [{symbol, response}]}})
  const v7 = ((j?.spark as { result?: Array<{ symbol?: string; response?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> }> } | undefined)?.result ?? []);
  for (const sym of b) {
    const r7 = v7.find((x) => x.symbol === sym)?.response?.[0];
    const o = (r7 ? { timestamp: r7.timestamp, close: r7.indicators?.quote?.[0]?.close } : (j?.[sym] ?? null)) as { timestamp?: number[]; close?: Array<number | null> } | null;
    const ts = (o?.timestamp ?? []).filter((t, k) => o?.close?.[k] != null);
    const since = ts.filter((t) => t >= Date.UTC(2013, 0, 1) / 1000).length;
    console.log(`  ${sym}: ${ts.length ? `monthly bars from ${iso(ts[0]).slice(0, 10)}, ${ts.length} in all, ${since} since 1 Jan 2013: ${ts[0] <= Date.UTC(2013, 0, 1) / 1000 ? "reaches 2013" : "DOES NOT reach 1 Jan 2013"}` : "no bars"}`);
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX} planned, and at most 3 asked again after a 429); ${Math.round((Date.now() - t0) / 1000)} s`);
