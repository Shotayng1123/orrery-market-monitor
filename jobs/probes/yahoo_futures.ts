// B-27 (must: B's verdict on round 2b; C/backlog.md) and the futures part of the paper portfolio's probes (P-0:
// C/portfolio-plan.md §3.1 item 1; OD-P5 (b), the owner's yes of 20 Nov 2026 to Yahoo's named contract months, "used
// only after its probe shows it is there and current"). Yahoo Finance is unofficial; the exchanges (CME Group, ICE)
// are the primary source. Read-only, no key, nothing written; the session cookie and crumb are never printed.
// It ran on 20 Nov 2026 (C/probes/yahoo_futures.log). P-0b (§3.1b item 7, with the PMs' additions of 21 Nov) runs it
// AGAIN AFTER 1 DECEMBER 2026, when BZF27 and ZQX26 have expired: for the rolls of BZ=F and ZQ=F as the names then
// give them, and with the five additions marked "P-0b" below. What need not wait is read by yahoo_futures_now.
//
// B-27, for I-6. The Monitor's 15 front-month series (ES=F NQ=F YM=F RTY=F NKD=F ZN=F CL=F BZ=F NG=F GC=F SI=F HG=F
// PL=F TIO=F ALI=F: supabase/migrations/…0002_seed.sql, …0018_market_universe.sql) move to the next contract on
// Yahoo's own timetable, and the step is booked as a day's move (prices_daily is written from spark 3mo/1d:
// supabase/functions/_shared/history.ts). On 19 Nov ZQ=F stepped 28.5 bp while its name read "…,Ja"
// (C/probes/rate_futures_yahoo.log). For each series this prints:
//   1. what Yahoo says it is on now: the v7 quote's names, underlyingSymbol and expiry; the chart's names for four;
//   2. its daily closes over six months as spark gives them, date by date against the named contracts' closes: which
//      contract each close is, hence each roll date in the window and its step (the series' change that day, the new
//      contract's own change, and the gap between the two contracts the day before: the part that is no move);
//      P-0b: for silver, platinum and gold the spot months are read too (every calendar month from last month to
//      three on), since SI=F's closes equalled none of its main-cycle months on 20 Nov (B-27's second point); a
//      roll whose series still differs from the new contract on the session after the change is FLAGGED, never
//      adjusted, and so is a series that is not on the contract its quote names;
//   3. whether an expired contract's closes are still served (C-8): if they are, past roll days can be found from
//      Yahoo; if not, from the exchanges' last-trade calendars, kept by hand with a source each;
//   4. the 1D the quote gives now: its price against its own previous close, against the series' last close and
//      against the contract's own previous close (they differ on a roll day; MARKETS' 1D needs to know which);
//   5. ZQ=F's closes of 16 to 19 Nov against those printed on 19 Nov (96.12, 96.12, 96.12, 95.835): whether Yahoo
//      keeps a series' past closes after a roll or rewrites them to the new contract's.
//
// P-5 (named months): for ES NQ YM RTY NKD NIY ZT ZF ZN TN ZB UB CL BZ GC SI HG NG, the front and the next two months:
// whether each answers; its closes on the series' last 60 dates and their gaps; volume, average volumes, open interest,
// bid, ask, sizes and the declared delay. P-0b: the same for ZQ's, SR3's (one close in five sessions on 19 Nov) and
// TPY's months (CME's yen TOPIX future: A wants it only if a month has 20 sessions of its own closes and 100
// contracts a day, V-12). For six fronts (ES, NKD, NIY, ZN, CL, GC): the daily bars' volume and timestamps (the time
// a daily close stands for; CME's trade date ends 17:00 New York) and whether one-minute bars carry volume (BP-2);
// P-0b: every pair of consecutive sessions whose daily volume is exactly the same, and the volumes of 18 and 19 Nov
// beside those the run of 20 Nov printed (the same figure twice on all six: is a repeated volume corrected? C-36).
// The seven searches of 20 Nov (other exchanges' futures) are not asked again: that log answers them.
//
// Requests: at most 31, all to Yahoo, 1.2 s apart: the session (2), quotes (3), spark (7 of 20 symbols, and 2 more
// only if a batch is refused), four =F charts (4), six contracts' daily and minute bars (12), TPY's front (1). A 429
// is asked again once after 5 s, three times at most in all (so at most 34); after three 429s in a row nothing more
// is asked.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = yahoo_futures, runtime = node
import { head, look, masked, pause, requestsMade, yahooSession } from "./lib.ts";

const GAP = 1200, MAX = 31;
const MON = "FGHJKMNQUVXZ", ALL = MON;
const MNAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// cycle: the months listed; from, count: the contracts read start at the first cycle month on or after the current
// month + from, `count` of them (so the one that expired last, the front and the next ones). ex: Yahoo's suffix, as a
// fallback when the =F quote does not name the exchange. monitor: a series the Monitor carries (B-27); p5: a root of P-5.
// also (P-0b): a second run of months read for the root, the spot months of a metal whose main cycle skips them.
interface Spec { root: string; ex: string; cycle: string; from: number; count: number; monitor: boolean; p5: boolean; name: string; also?: { cycle: string; from: number; count: number } }
const SPECS: Spec[] = [
  { root: "ES", ex: "CME", cycle: "HMUZ", from: -3, count: 4, monitor: true, p5: true, name: "S&P 500 E-mini" },
  { root: "NQ", ex: "CME", cycle: "HMUZ", from: -3, count: 4, monitor: true, p5: true, name: "Nasdaq 100 E-mini" },
  { root: "YM", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: true, p5: true, name: "Dow E-mini" },
  { root: "RTY", ex: "CME", cycle: "HMUZ", from: -3, count: 4, monitor: true, p5: true, name: "Russell 2000 E-mini" },
  { root: "NKD", ex: "CME", cycle: "HMUZ", from: -3, count: 4, monitor: true, p5: true, name: "Nikkei 225 future (CME, USD)" },
  { root: "NIY", ex: "CME", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: true, name: "Nikkei 225 future (CME, JPY)" },
  { root: "ZT", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: true, name: "2Y T-Note future" },
  { root: "ZF", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: true, name: "5Y T-Note future" },
  { root: "ZN", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: true, p5: true, name: "10Y T-Note future" },
  { root: "TN", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: true, name: "Ultra 10Y T-Note future" },
  { root: "ZB", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: true, name: "T-Bond future" },
  { root: "UB", ex: "CBT", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: true, name: "Ultra T-Bond future" },
  { root: "CL", ex: "NYM", cycle: ALL, from: 0, count: 5, monitor: true, p5: true, name: "WTI crude" },
  { root: "BZ", ex: "NYM", cycle: ALL, from: 1, count: 4, monitor: true, p5: true, name: "Brent crude" },
  { root: "NG", ex: "NYM", cycle: ALL, from: 0, count: 4, monitor: true, p5: true, name: "Natural gas" },
  { root: "GC", ex: "CMX", cycle: "GJMQVZ", from: -2, count: 4, monitor: true, p5: true, name: "Gold", also: { cycle: ALL, from: -1, count: 5 } },
  { root: "SI", ex: "CMX", cycle: "HKNUZ", from: -3, count: 4, monitor: true, p5: true, name: "Silver", also: { cycle: ALL, from: -1, count: 5 } },
  { root: "HG", ex: "CMX", cycle: ALL, from: -2, count: 6, monitor: true, p5: true, name: "Copper" },
  { root: "PL", ex: "NYM", cycle: "FJNV", from: -2, count: 4, monitor: true, p5: false, name: "Platinum", also: { cycle: ALL, from: -1, count: 5 } },
  { root: "TIO", ex: "NYM", cycle: ALL, from: -1, count: 4, monitor: true, p5: false, name: "Iron ore 62% (TSI)" },
  { root: "ALI", ex: "CMX", cycle: ALL, from: -1, count: 4, monitor: true, p5: false, name: "Aluminium" },
  { root: "ZQ", ex: "CBT", cycle: ALL, from: -1, count: 4, monitor: false, p5: false, name: "30-day fed funds (the 19 Nov roll)" },
  { root: "SR3", ex: "CME", cycle: "HMUZ", from: -3, count: 5, monitor: false, p5: false, name: "Three-month SOFR (P-0b: its named months)" },
  { root: "TPY", ex: "CME", cycle: "HMUZ", from: -3, count: 4, monitor: false, p5: false, name: "TOPIX future (CME, JPY) (P-0b: V-12)" },
];
/** The roots read date by date against their months though the Monitor does not carry them, and listed with P-5's. */
const EXTRA = ["ZQ", "SR3", "TPY"];
// What the run of 20 Nov 2026, 12:38 UTC, printed as the daily volume of the trade dates of 18 Nov and of 19 Nov, the
// same figure twice, for the six fronts it read (yahoo_futures.log l.411–456): C-36.
const VOL_20NOV: Record<string, number> = { "ESZ26.CME": 2057168, "NKDZ26.CME": 9091, "NIYZ26.CME": 27016, "ZNZ26.CBT": 2126348, "CLF27.NYM": 268900, "GCZ26.CMX": 244253 };
// What the probe of 19 Nov 2026, 17:44 UTC, printed for ZQ=F (rate_futures_yahoo.log, dates as there: UTC).
const ZQ_19NOV: Array<[string, number]> = [["2026-11-16", 96.12000274658203], ["2026-11-17", 96.12000274658203], ["2026-11-18", 96.12000274658203], ["2026-11-19", 95.83499908447266]];

type J = Record<string, unknown>;
type Q = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const iso = (t: number | null) => (t == null ? "–" : new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC");
const NYD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const NYT = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
const ny = (t: number) => NYD.format(new Date(t * 1000));
const nyTime = (t: number) => NYT.format(new Date(t * 1000));
const wd = (d: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T12:00:00Z").getUTCDay()];
const pct = (x: number | null, dp = 2) => (x == null || !Number.isFinite(x) ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(dp)}%`);
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
const parseSym = (s: string) => { const m = s.match(/^([A-Z][A-Z0-9]*?)([FGHJKMNQUVXZ])(\d{2})\.([A-Z]+)$/); return m ? { root: m[1], code: m[2], yy: Number(m[3]), ex: m[4] } : null; };
const order = (s: string) => { const p = parseSym(s); return p ? p.yy * 12 + MON.indexOf(p.code) : 1e9; };
const label = (s: string) => { const p = parseSym(s); return p ? `${MNAME[MON.indexOf(p.code)]} 20${String(p.yy).padStart(2, "0")}` : s; };

let left429 = 3, inRow = 0, stopped = false;
/** One Yahoo request through look(): JSON, or null with the reason printed. */
async function yget(url: string, headers: Record<string, string> = {}): Promise<J | null> {
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
    if (!r.ok || !j || typeof j !== "object") { if (r.text) console.log(`  answer: ${masked(JSON.stringify(r.text.slice(0, 220)))}`); return r.ok && j && typeof j === "object" ? (j as J) : null; }
    return j as J;
  }
}

/** Contracts of a spec from the run date: the first cycle month on or after (this month + from), `count` of them;
 *  and the months of its `also` run (a metal's spot months), each contract once. */
function contracts(s: Spec, ex: string, now: Date): string[] {
  const out: string[] = [];
  for (const run of [s, ...(s.also ? [s.also] : [])]) {
    const y0 = now.getUTCFullYear(), m0 = now.getUTCMonth() + run.from;
    let n = 0;
    for (let k = 0; n < run.count && k < 40; k++) {
      const m = m0 + k, mm = ((m % 12) + 12) % 12, yy = y0 + Math.floor(m / 12);
      if (!run.cycle.includes(MON[mm])) continue;
      n++;
      const c = `${s.root}${MON[mm]}${String(yy % 100).padStart(2, "0")}.${ex}`;
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}

/** spark's answer as symbol → [timestamp, close] (both shapes Yahoo uses: the flat one the server reads, and v7's). */
function sparkOf(j: J | null): Map<string, Array<[number, number]>> {
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
/** Closes by New York date, the last bar of a date kept (as history.ts books them). */
const byDate = (rows: Array<[number, number]>): Map<string, number> => { const m = new Map<string, number>(); for (const [t, c] of rows) m.set(ny(t), c); return m; };

interface Chart { meta: J; ts: number[]; close: Array<number | null>; volume: Array<number | null> }
function chartOf(j: J | null): Chart | null {
  const res = ((j?.chart as { result?: Array<{ meta?: J; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> } }> } | undefined)?.result ?? [])[0];
  if (!res?.meta) return null;
  const q = res.indicators?.quote?.[0] ?? {}, ts = res.timestamp ?? [];
  return { meta: res.meta, ts, close: q.close ?? ts.map(() => null), volume: q.volume ?? ts.map(() => null) };
}

const t0 = Date.now(), now = new Date();
console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC (${ny(now.getTime() / 1000)} in New York, a ${wd(ny(now.getTime() / 1000))})`);

head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await yahooSession();
await pause(GAP);

// ---- 1. the =F quotes: names, the contract each is on, its expiry ----
const quotes = new Map<string, Q>();
const quoteBatch = async (syms: string[], what: string) => {
  if (!s) { console.log(`  no session: the quotes of ${what} are not asked`); return; }
  for (let i = 0; i < syms.length; i += 100) {
    const j = await yget(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms.slice(i, i + 100).join(","))}&crumb=${encodeURIComponent(s.crumb)}`, { cookie: s.cookie });
    const rows = ((j?.quoteResponse as { result?: Q[] } | undefined)?.result ?? []);
    for (const q of rows) if (typeof q.symbol === "string") quotes.set(q.symbol, q);
    console.log(`  ${rows.length} of ${syms.slice(i, i + 100).length} symbols answered`);
  }
};
head(`1. The v7 quote of every =F series (${SPECS.length}): its names, the contract it is on (underlyingSymbol), its expiry`);
const FSYMS = SPECS.map((x) => `${x.root}=F`);
await quoteBatch(FSYMS, "the =F series");
const firstF = FSYMS.map((f) => quotes.get(f)).find(Boolean);
if (firstF) console.log(`  the fields a futures quote carries (${firstF.symbol}): ${Object.keys(firstF).sort().join(", ")}`);
const exOf = new Map<string, string>(), named = new Map<string, string[]>();
for (const sp of SPECS) {
  const f = quotes.get(`${sp.root}=F`), u = str(f?.underlyingSymbol), pu = u ? parseSym(u) : null;
  const ex = pu?.ex ?? (["CME", "CBT", "NYM", "CMX"].includes(String(f?.exchange)) ? String(f?.exchange) : sp.ex);
  exOf.set(sp.root, ex);
  const list = contracts(sp, ex, now);
  if (u && pu && pu.root === sp.root && !list.includes(u)) list.push(u);
  named.set(sp.root, list.sort((a, b) => order(a) - order(b)));
}

head("2. The v7 quote of the named contracts read (the one that expired last, the front and the next ones)");
const NSYMS = [...named.values()].flat();
console.log(`  ${NSYMS.length} contracts: ${NSYMS.join(" ")}`);
await quoteBatch(NSYMS, "the named contracts");

// ---- spark: six months of daily closes for every symbol, 20 to a request ----
head("3. spark, six months of daily closes (the server's own reader for prices_daily), 20 symbols a request");
const closes = new Map<string, Map<string, number>>(), sparkRows = new Map<string, Array<[number, number]>>();
const all = [...FSYMS, ...NSYMS];
const batches: string[][] = [];
for (let i = 0; i < all.length; i += 20) batches.push(all.slice(i, i + 20));
let spare = 2;
for (const b of batches) {
  let j = await yget(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(b.join(","))}&range=6mo&interval=1d`);
  if (!j && spare > 0 && !stopped) {   // a whole batch refused: once more with only the symbols the quote knows
    const known = b.filter((x) => quotes.has(x));
    if (known.length && known.length < b.length) { spare--; console.log(`  asked again without ${b.filter((x) => !quotes.has(x)).join(" ")}, which the quote did not return`); j = await yget(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(known.join(","))}&range=6mo&interval=1d`); }
  }
  const got = sparkOf(j);
  for (const [k, v] of got) { sparkRows.set(k, v); closes.set(k, byDate(v)); }
  console.log(`  ${got.size} of ${b.length} with closes${b.filter((x) => !got.has(x)).length ? `; none for ${b.filter((x) => !got.has(x)).join(" ")}` : ""}`);
}

// ---- four =F series by the chart endpoint too: its names, trading period, timestamps; the same closes as spark? ----
head("4. The chart endpoint for four series (ZQ=F, CL=F, ES=F, GC=F), six months daily: names, session, timestamps; spark's closes again?");
const charts = new Map<string, Chart>();
for (const f of ["ZQ=F", "CL=F", "ES=F", "GC=F"]) {
  const c = chartOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(f)}?range=6mo&interval=1d`));
  if (!c) { console.log(`  ${f}: no chart`); continue; }
  charts.set(f, c);
  const m = c.meta, reg = (m.currentTradingPeriod as { regular?: { start?: number; end?: number } } | undefined)?.regular;
  const sp = closes.get(f) ?? new Map<string, number>();
  let eq = 0, ne = 0, only = 0;
  c.ts.forEach((t, i) => { const v = c.close[i]; if (v == null) return; const w = sp.get(ny(t)); if (w == null) only++; else if (same(v, w)) eq++; else ne++; });
  console.log(`  ${f}: shortName "${m.shortName ?? "–"}", longName "${m.longName ?? "–"}"; ${m.fullExchangeName ?? m.exchangeName ?? "–"}, ${m.instrumentType ?? "–"}, time zone ${m.exchangeTimezoneName ?? "–"}; regular session now ${reg?.start ? `${iso(reg.start)} (${nyTime(reg.start)} NY)` : "–"} to ${reg?.end ? `${iso(reg.end)} (${nyTime(reg.end)} NY)` : "–"}; chartPreviousClose ${m.chartPreviousClose ?? "–"}, previousClose ${m.previousClose ?? "–"}; last ${m.regularMarketPrice ?? "–"} at ${iso(num(m.regularMarketTime))}`);
  console.log(`    ${c.ts.length} daily bars; the last two stamped ${c.ts.slice(-2).map((t) => `${iso(t)} (${nyTime(t)} NY, ${ny(t)})`).join(" and ")}; against spark's closes: ${eq} equal, ${ne} different, ${only} not in spark`);
}

// ---- B-27: each series against its contracts ----
head("5. B-27: each front-month series the Monitor carries, date by date against its named contracts");
interface Roll { date: string; from: string; to: string; fChg: number | null; inNew: number | null; gap: number | null }
const summary: string[] = [];
const contractLine = (c: string): string => {
  const q = quotes.get(c), rows = sparkRows.get(c) ?? [];
  const qs = q ? `quote "${q.shortName ?? q.longName ?? "–"}", expires ${str(q.expireIsoDate)?.slice(0, 10) ?? (num(q.expireDate) ? iso(num(q.expireDate)).slice(0, 10) : "–")}, last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}, volume ${q.regularMarketVolume ?? "–"}, open interest ${q.openInterest ?? "–"}` : "no quote";
  const ss = rows.length ? `spark ${rows.length} closes ${ny(rows[0][0])} to ${ny(rows[rows.length - 1][0])}` : "spark: no closes";
  return `${c} (${label(c)}): ${qs} · ${ss}`;
};
for (const sp of SPECS.filter((x) => x.monitor || EXTRA.includes(x.root))) {
  const f = `${sp.root}=F`, q = quotes.get(f), fc = closes.get(f), list = named.get(sp.root) ?? [];
  console.log(`\n-- ${f} · ${sp.name}${sp.monitor ? "" : " (not a Monitor instrument)"}`);
  if (q) console.log(`  quote: shortName "${q.shortName ?? "–"}", longName "${q.longName ?? "–"}", underlyingSymbol ${q.underlyingSymbol ?? "–"}, expires ${str(q.expireIsoDate) ?? (num(q.expireDate) ? iso(num(q.expireDate)) : "–")}; ${q.fullExchangeName ?? q.exchange ?? "–"}, delayed by ${q.exchangeDataDelayedBy ?? "–"} min (${q.quoteSourceName ?? "–"}), state ${q.marketState ?? "–"}; last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}, previous close ${q.regularMarketPreviousClose ?? "–"}, volume ${q.regularMarketVolume ?? "–"}, open interest ${q.openInterest ?? "–"}`);
  else console.log("  quote: none");
  for (const c of list) console.log(`  ${contractLine(c)}`);
  if (!fc || !fc.size) { console.log("  no closes for the series: nothing to set against"); summary.push(`${f} | no closes`); continue; }
  const dates = [...fc.keys()].sort();
  const cs = list.map((c): [string, Map<string, number>] => [c, closes.get(c) ?? new Map<string, number>()]);
  const segs: Array<{ who: string; from: string; to: string; n: number }> = [];
  for (const d of dates) {
    const v = fc.get(d) as number;
    const hit = cs.filter(([, m]) => { const x = m.get(d); return x != null && same(x, v); }).map(([c]) => c);
    const who = hit.length === 0 ? "none of these contracts" : hit.length === 1 ? hit[0] : `${hit.join(" = ")} (equal closes)`;
    const last = segs[segs.length - 1];
    if (last && last.who === who) { last.to = d; last.n++; } else segs.push({ who, from: d, to: d, n: 1 });
  }
  console.log(`  ${f}'s ${dates.length} closes (${dates[0]} to ${dates[dates.length - 1]}, New York dates) are, by date:`);
  for (const g of segs) console.log(`    ${g.who}: ${g.from} to ${g.to} (${g.n})`);
  const rolls: Roll[] = [];
  const single = (w: string) => list.includes(w);
  for (let i = 1; i < segs.length; i++) {
    if (!single(segs[i].who)) continue;
    let k = i - 1; while (k >= 0 && !single(segs[k].who) && i - k <= 2) k--;
    if (k < 0 || !single(segs[k].who) || segs[k].who === segs[i].who) continue;
    const a = segs[k].who, b = segs[i].who, d = segs[i].from, dPrev = dates[dates.indexOf(d) - 1];
    const A = closes.get(a)!, B = closes.get(b)!;
    const fChg = dPrev ? (fc.get(d)! / fc.get(dPrev)! - 1) : null;
    const inNew = dPrev && B.get(dPrev) != null ? B.get(d)! / B.get(dPrev)! - 1 : null;
    const gap = dPrev && B.get(dPrev) != null && A.get(dPrev) != null ? B.get(dPrev)! / A.get(dPrev)! - 1 : null;
    rolls.push({ date: d, from: a, to: b, fChg, inNew, gap });
    const bp = sp.root === "ZQ" && dPrev && B.get(dPrev) != null && A.get(dPrev) != null ? ` (${((A.get(dPrev)! - B.get(dPrev)!) * 100).toFixed(1)} bp in the rate it implies)` : "";
    console.log(`  ROLL on ${d} (${wd(d)}): ${a} → ${b}${i - k > 1 ? ` (after ${segs.slice(k + 1, i).reduce((n, g) => n + g.n, 0)} date(s) matching neither)` : ""}. ${f} that day ${pct(fChg)}; within ${b} ${pct(inNew)}; the change of contract (${b} ÷ ${a} on ${dPrev ?? "–"} − 1) ${pct(gap)}${bp}; ${a}'s own closes ${A.size ? `end ${[...A.keys()].sort().slice(-1)[0]}` : "–"}`);
    // P-0b (B-27's second point): on the session after the change the series should be the new contract's close
    const dNext = dates[dates.indexOf(d) + 1], today = ny(now.getTime() / 1000);
    if (dNext && dNext < today) { const sv = fc.get(dNext)!, bv = B.get(dNext); if (bv == null || !same(sv, bv)) console.log(`  FLAG (B-27): on ${dNext}, the session after that change, ${f}'s close ${sv} ${bv == null ? `has no close of ${b} beside it` : `differs from ${b}'s ${bv} (${pct(sv / bv - 1, 3)})`}: flagged, not adjusted`); }
  }
  // P-0b: is the series on the contract its quote names? The last ten complete sessions.
  {
    const quoted = str(q?.underlyingSymbol), today = ny(now.getTime() / 1000), done = dates.filter((d) => d < today).slice(-10), Q = quoted ? closes.get(quoted) : undefined;
    if (quoted && Q && done.length) {
      const on = done.filter((d) => { const x = Q.get(d); return x != null && same(x, fc.get(d)!); });
      const lastD = done[done.length - 1], lastOn = cs.filter(([, m]) => { const x = m.get(lastD); return x != null && same(x, fc.get(lastD)!); }).map(([c]) => c);
      console.log(`  over its last ${done.length} complete sessions ${f} equals the contract its quote names (${quoted}) on ${on.length}${on.length < done.length ? `; on ${lastD} it ${lastOn.length ? `equals ${lastOn.join(" = ")}` : `equals none of the contracts read (${quoted}'s close ${Q.get(lastD) ?? "–"}, the series' ${fc.get(lastD)})`}` : ""}${!lastOn.includes(quoted) ? `. FLAG (B-27): the series is not on the contract its quote names: a roll taken from the quote's contract would be a step the series did not make` : ""}`);
    }
  }
  if (!rolls.length) console.log("  no change of contract found in the window between two of the contracts read");
  // the 1D the quote gives now, against the series' last close and the contract's own previous close
  if (q) {
    const px = num(q.regularMarketPrice), pq = num(q.regularMarketPreviousClose), td = num(q.regularMarketTime) != null ? ny(num(q.regularMarketTime) as number) : null;
    const before = dates.filter((d) => td == null || d < td), ps = before.length ? fc.get(before[before.length - 1])! : null;
    const u = str(q.underlyingSymbol), uq = u ? quotes.get(u) : undefined, pu = num(uq?.regularMarketPreviousClose);
    console.log(`  1D now: last ${px ?? "–"}; by the quote's previous close ${pq ?? "–"}: ${pct(px != null && pq ? px / pq - 1 : null)}; by the series' last close before ${td ?? "–"} (${before.length ? before[before.length - 1] : "–"}: ${ps ?? "–"}): ${pct(px != null && ps ? px / ps - 1 : null)}; ${u ?? "the contract"}'s own previous close ${pu ?? "–"}${pq != null && ps != null ? `; the quote's previous close ${same(pq, ps) ? "equals" : "DIFFERS FROM"} the series' last close` : ""}`);
  }
  if (sp.root === "ZQ") {
    console.log("  the closes printed on 19 Nov 17:44 UTC against today's, by date (19 Nov's dates were UTC dates of the bars):");
    for (const [d, v] of ZQ_19NOV) {
      const nowV = fc.get(d) ?? null, utc = (sparkRows.get(f) ?? []).find(([t]) => new Date(t * 1000).toISOString().slice(0, 10) === d)?.[1] ?? null;
      const w = list.filter((c) => { const x = closes.get(c)?.get(d); return x != null && nowV != null && same(x, nowV); });
      console.log(`    ${d}: then ${v}; today ${nowV ?? "–"} (by UTC date ${utc ?? "–"}): ${nowV == null ? "not in today's answer" : same(nowV, v) ? "unchanged" : "REWRITTEN"}${w.length ? `; today equal to ${w.join(", ")}` : ""}`);
    }
  }
  // C-8: a contract that has stopped (its quote's expiry is past, or its closes end before the series' last date)
  const lastDate = dates[dates.length - 1], today = ny(now.getTime() / 1000);
  const ended = list.map((c) => {
    const e = str(quotes.get(c)?.expireIsoDate)?.slice(0, 10) ?? null, ks = [...(closes.get(c)?.keys() ?? [])].sort(), lc = ks[ks.length - 1] ?? null;
    if (e && e < today) return `${c} expired ${e}: ${lc ? `closes kept, to ${lc}` : "NO closes"}`;
    if (!quotes.has(c) && !lc) return `${c}: no quote and no closes (expired and dropped, or no such symbol)`;
    if (!e && lc && lc < lastDate) return `${c}: closes end ${lc}${quotes.has(c) ? "" : ", no quote"}`;
    return "";
  }).filter(Boolean);
  console.log(`  stopped contracts (C-8): ${ended.length ? ended.join("; ") : "none among those read"}`);
  const last = rolls[rolls.length - 1];
  summary.push(`${f} | now on ${str(q?.underlyingSymbol) ?? "–"} | the quote's name "${q?.shortName ?? "–"}" | last roll in the window: ${last ? `${last.date}, ${last.from} → ${last.to}, the change of contract ${pct(last.gap)}` : "none found"} | ${ended.length ? ended.join("; ") : "no stopped contract read"}`);
}

head("6. Summary for I-6 (B-27): one line per series");
for (const l of summary) console.log(`  ${l}`);

// ---- P-5: named months ----
head("7. P-5 (OD-P5 (b)): the front and the next two months of each root, and of ZQ, SR3 and TPY (P-0b); their closes on the series' last 60 dates");
const fronts = new Map<string, string>();
// the sessions a liquid series traded on: a thin series (SR3=F had one close in five sessions) is no yardstick
const liquid = [...(closes.get("ES=F")?.keys() ?? [])].sort().slice(-60);
for (const sp of SPECS.filter((x) => x.p5 || EXTRA.includes(x.root))) {
  const list = named.get(sp.root) ?? [], f = quotes.get(`${sp.root}=F`), u = str(f?.underlyingSymbol);
  const today = ny(now.getTime() / 1000);
  const live = list.filter((c) => { const e = str(quotes.get(c)?.expireIsoDate); return e ? e.slice(0, 10) >= today : (closes.get(c)?.size ?? 0) > 0; });
  const front = u && list.includes(u) ? u : live[0] ?? list[0];
  fronts.set(sp.root, front);
  const three = list.slice(Math.max(0, list.indexOf(front)), list.indexOf(front) + 3);
  const own = [...(closes.get(`${sp.root}=F`)?.keys() ?? [])].sort().slice(-60);
  const fd = EXTRA.includes(sp.root) && liquid.length ? liquid : own;
  console.log(`\n  ${sp.root} · ${sp.name} (front ${front}${u ? ", from the =F quote" : ", the first unexpired"})${fd === liquid && fd !== own ? `; counted against ES=F's last ${liquid.length} sessions (${sp.root}=F itself has a close on ${liquid.filter((d) => closes.get(`${sp.root}=F`)?.has(d)).length} of them)` : ""}:`);
  for (const c of three) {
    const q = quotes.get(c), m = closes.get(c) ?? new Map<string, number>();
    const inWin = fd.filter((d) => m.has(d)).length, first = [...m.keys()].sort()[0];
    const gaps = fd.filter((d) => !m.has(d) && first != null && d >= first).length;
    const bid = num(q?.bid), ask = num(q?.ask), mid = bid != null && ask != null && bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
    console.log(`    ${c}: ${q ? `"${q.shortName ?? "–"}", expires ${str(q.expireIsoDate)?.slice(0, 10) ?? "–"}, last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}, delayed ${q.exchangeDataDelayedBy ?? "–"} min; volume ${q.regularMarketVolume ?? "–"}, average 10d ${q.averageDailyVolume10Day ?? "–"}, 3m ${q.averageDailyVolume3Month ?? "–"}; open interest ${q.openInterest ?? "–"}; bid ${bid ?? "–"} × ${q.bidSize ?? "–"}, ask ${ask ?? "–"} × ${q.askSize ?? "–"}${mid ? ` (spread ${(((ask as number) - (bid as number)) / mid * 1e4).toFixed(2)} bp)` : ""}` : "no quote"} · closes on ${inWin} of the series' last ${fd.length} dates, ${gaps} gap(s) since its first close`);
  }
}

head("8. Six fronts by the chart endpoint: daily bars (volume, timestamps) over three months and one-minute bars over five days (BP-2); a repeated daily volume (C-36); TPY's front (V-12)");
/** P-0b, C-36: the pairs of consecutive trade dates whose daily volume is exactly the same, and 18 and 19 Nov's beside the figure of 20 Nov's run. */
const repeats = (c: string, dayVol: Map<string, number>): void => {
  const ds = [...dayVol.keys()].sort(), twins: string[] = [];
  for (let i = 1; i < ds.length; i++) if (dayVol.get(ds[i]) === dayVol.get(ds[i - 1]) && (dayVol.get(ds[i]) as number) > 0) twins.push(`${ds[i - 1]} and ${ds[i]} (${dayVol.get(ds[i])})`);
  console.log(`    consecutive trade dates with exactly the same daily volume among the last ${ds.length}: ${twins.length ? twins.join("; ") : "none"}`);
  const then = VOL_20NOV[c], v18 = dayVol.get("2026-11-18"), v19 = dayVol.get("2026-11-19");
  if (then != null) console.log(`    on 20 Nov, 12:38 UTC, this contract's 18 Nov and 19 Nov both read ${then}. Now: 18 Nov ${v18 ?? "–"}, 19 Nov ${v19 ?? "–"}: ${v19 == null ? "19 Nov's bar is not among those read" : v19 !== then ? "19 Nov's volume is its own now (CORRECTED after that read)" : v18 === v19 ? "19 Nov's still repeats 18 Nov's (NOT corrected)" : "19 Nov's is the figure read then, and 18 Nov's is another now"}`);
};
for (const root of ["ES", "NKD", "NIY", "ZN", "CL", "GC"]) {
  // the contract 20 Nov's run read for this root, while Yahoo still serves it (its volumes of 18 and 19 Nov are the test of C-36); else the front
  const then = Object.keys(VOL_20NOV).find((k) => parseSym(k)?.root === root), c = then && closes.get(then)?.size ? then : fronts.get(root);
  if (!c) continue;
  const d = chartOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(c)}?range=3mo&interval=1d`));
  const dayVol = new Map<string, number>();
  if (d) {
    const last60 = d.ts.map((t, i) => ({ t, v: d.volume[i], c: d.close[i] })).slice(-60);
    const withVol = last60.filter((x) => (x.v ?? 0) > 0).length, nulls = last60.filter((x) => x.v == null).length;
    // a daily bar stamped at or after 17:00 New York (a session's start, say) belongs to the next trade date
    for (const x of last60) if (x.v != null) dayVol.set(Number(nyTime(x.t).slice(0, 2)) >= 17 ? ny(x.t + 7 * 3600) : ny(x.t), x.v);
    const reg = (d.meta.currentTradingPeriod as { regular?: { start?: number; end?: number } } | undefined)?.regular;
    console.log(`  ${c} daily: ${d.ts.length} bars; of the last ${last60.length}: ${withVol} with volume, ${nulls} with none given; time zone ${d.meta.exchangeTimezoneName ?? "–"}; the last three stamped ${last60.slice(-3).map((x) => `${iso(x.t)} (${nyTime(x.t)} NY) close ${x.c ?? "–"} volume ${x.v ?? "–"}`).join("; ")}; regular session ${reg?.start ? nyTime(reg.start) : "–"} to ${reg?.end ? nyTime(reg.end) : "–"} NY`);
    repeats(c, dayVol);
  } else console.log(`  ${c} daily: no chart`);
  const m = chartOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(c)}?range=5d&interval=1m`));
  if (m) {
    const days = new Map<string, { n: number; nv: number; vol: number; first: number; last: number }>();
    m.ts.forEach((t, i) => {
      if (m.close[i] == null) return;
      const k = ny(t + 7 * 3600);   // CME's trade date: the session that ends at 17:00 New York
      const g = days.get(k) ?? { n: 0, nv: 0, vol: 0, first: t, last: t };
      g.n++; const v = m.volume[i] ?? 0; if (v > 0) { g.nv++; g.vol += v; } g.last = t;
      days.set(k, g);
    });
    console.log(`  ${c} one-minute: ${m.ts.length} bars over ${days.size} trade dates (grouped by CME's trade date, ending 17:00 New York):`);
    for (const [k, g] of [...days].sort()) console.log(`    ${k}: ${g.n} bars with a price, ${g.nv} with volume, from ${iso(g.first)} to ${iso(g.last)}; minute volumes sum to ${g.vol}${dayVol.has(k) ? `, the daily bar's volume ${dayVol.get(k)} (${dayVol.get(k) ? (g.vol / (dayVol.get(k) as number) * 100).toFixed(1) : "–"}%)` : ""}`);
  } else console.log(`  ${c} one-minute: no chart`);
}

// P-0b, V-12 (A): TPY enters P-5's table only if a named month has 20 sessions of its own closes and at least 100
// contracts a day on average; otherwise it is listed "not tradable here: too little volume".
{
  const c = fronts.get("TPY");
  if (c) {
    const d = chartOf(await yget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(c)}?range=3mo&interval=1d`));
    if (!d) console.log(`  ${c} daily: no chart`);
    else {
      const today = ny(now.getTime() / 1000), rows = d.ts.map((t, i) => ({ d: ny(t), v: d.volume[i], c: d.close[i] })).filter((x) => x.c != null && x.d < today), l20 = rows.slice(-20);
      const a20 = l20.length ? l20.reduce((a, x) => a + (x.v ?? 0), 0) / l20.length : null;
      console.log(`  ${c} daily: ${rows.length} complete bars with a close, ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"}; average volume over its last ${l20.length} sessions ${a20 == null ? "–" : a20.toFixed(1)} contracts a day (${l20.filter((x) => !x.v).length} with none); the last six: ${rows.slice(-6).map((x) => `${x.d} close ${x.c} volume ${x.v ?? "–"}`).join("; ")}`);
      console.log(`    A's line (V-12): 20 sessions of its own closes: ${l20.length >= 20 ? "yes" : `NO (${l20.length})`}; 100 contracts a day on average over them: ${a20 != null && a20 >= 100 ? "yes" : `NO (${a20 == null ? "–" : a20.toFixed(1)})`}: ${l20.length >= 20 && a20 != null && a20 >= 100 ? "it trades by A's line" : "not tradable here by A's line: too little volume"}`);
    }
  } else console.log("  TPY: no front found");
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX} planned, and at most 3 asked again after a 429); ${Math.round((Date.now() - t0) / 1000)} s`);
