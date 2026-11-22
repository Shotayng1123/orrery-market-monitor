// What of the rerun of yahoo_futures need not wait for 1 December, and one part that must not (P-0b:
// C/portfolio-plan.md §3.1b item 7 with the PMs' additions of 21 Nov 2026; B's verdict on round 3a, B-27's second
// point). Yahoo Finance is unofficial; CME Group is the primary source, and its site refuses GitHub's machines (C-35).
// Read-only, no key, nothing written; the session cookie and crumb are never printed.
//   1. B-27's second point, before 25 November. On 20 Nov SI=F's 129 daily closes equalled none of SIU26, SIZ26, SIH27
//      and SIK27 while its quote named SIZ26; PL=F's equalled none before 20 Nov; HG=F's equalled HGX26 on 6 of 16
//      sessions (C/probes/yahoo_futures.log l.196–240). The run read only the months of each metal's main cycle. The
//      spot months were not read, and Yahoo drops a contract when it expires (C-8): November's (SIX26, PLX26, GCX26,
//      HGX26) expire on 25 Nov 2026 by the expiries that log prints for HGX26 and ALIX26. So this run reads, for SI,
//      PL, GC and HG, every calendar month from this one to five months on, and prints which contract each of the =F
//      series' closes equals over six months, then the last fifteen sessions one by one with the nearest contract and
//      its distance where none is equal. A series that is not on the contract its quote names is flagged (the Monitor's
//      roll rule reads the quote's contract: supabase/functions/_shared/futures.ts).
//   2. C-36 (B). On 20 Nov at 12:38 UTC the daily bar of 19 Nov repeated 18 Nov's volume on all six fronts read (l.411–
//      456). Read again: is 19 Nov's volume its own now, and does 20 Nov's bar, read after its trade date ended,
//      repeat 19 Nov's? With every pair of consecutive sessions of exactly equal volume in a month of bars.
//   3. V-12 (A): TPY, CME's yen TOPIX future: its quote and named months, their closes over six months, and the front's
//      daily volume over three: A's line is 20 sessions of its own closes and 100 contracts a day on average.
//   4. SR3's named months: closes over six months (one close in five sessions on 19 Nov: rate_futures_yahoo.log).
// yahoo_futures itself is run after 1 December, for the rolls of BZ=F and ZQ=F; it reads all of this again then.
// Requests: at most 12, all to Yahoo, 1.2 s apart: the session (2), one quote (1), spark (2), six fronts' daily bars
// (6), TPY's front (1). A 429 is asked again once after 5 s, three times at most (so at most 15).
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = yahoo_futures_now, runtime = node
import { head, pause, requestsMade, yahooSession } from "./lib.ts";
import { GAP, chart, daily, dayIn, f, iso, num, pct, quotes, sparkOf, str, yget, type J } from "./yahoo_lib.ts";

const MAX = 12, NYZ = "America/New_York";
const MON = "FGHJKMNQUVXZ", MNAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const t0 = Date.now(), now = new Date(t0);
const label = (sym: string) => { const m = sym.match(/^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{2})\.([A-Z]+)$/); return m ? `${MNAME[MON.indexOf(m[2])]} 20${m[3]}` : sym; };
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
/** `count` contracts of `root` from the first month of `cycle` on or after this month + `from`. */
function months(root: string, ex: string, cycle: string, from: number, count: number): string[] {
  const out: string[] = [], y0 = now.getUTCFullYear(), m0 = now.getUTCMonth() + from;
  for (let k = 0; out.length < count && k < 40; k++) { const m = m0 + k, mm = ((m % 12) + 12) % 12, yy = y0 + Math.floor(m / 12); if (cycle.includes(MON[mm])) out.push(`${root}${MON[mm]}${String(yy % 100).padStart(2, "0")}.${ex}`); }
  return out;
}
const METALS: Array<{ root: string; ex: string; name: string }> = [{ root: "SI", ex: "CMX", name: "Silver" }, { root: "PL", ex: "NYM", name: "Platinum" }, { root: "GC", ex: "CMX", name: "Gold" }, { root: "HG", ex: "CMX", name: "Copper" }];
// the six fronts of 20 Nov's run, with the volumes it printed for the trade dates of 18 and 19 Nov (the same figure twice)
const C36: Array<[string, number]> = [["ESZ26.CME", 2057168], ["NKDZ26.CME", 9091], ["NIYZ26.CME", 27016], ["ZNZ26.CBT", 2126348], ["CLF27.NYM", 268900], ["GCZ26.CMX", 244253]];
const TPY = months("TPY", "CME", "HMUZ", 0, 3), SR3 = months("SR3", "CME", "HMUZ", -3, 5);

console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC (${dayIn(NYZ, t0 / 1000)} in New York)`);
head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await yahooSession();
await pause(GAP);

const named = new Map<string, string[]>(METALS.map((m) => [m.root, months(m.root, m.ex, MON, 0, 6)]));
const FS = [...METALS.map((m) => `${m.root}=F`), "TPY=F", "SR3=F"];
let qs = new Map<string, J>();
if (s) {
  head("The v7 quote: the four metals' =F series and their months from this one to five on, TPY and SR3 with theirs, and the six fronts of 20 Nov");
  qs = await quotes([...new Set([...FS, ...[...named.values()].flat(), ...TPY, ...SR3, ...C36.map(([c]) => c)])], s);
  // the contract a quote names joins its root's list
  for (const m of METALS) { const u = str(qs.get(`${m.root}=F`)?.underlyingSymbol); if (u && !named.get(m.root)!.includes(u)) named.get(m.root)!.push(u); }
  console.log(`  ${qs.size} symbols answered`);
} else console.log("  no session: no quote is asked; the closes below are still read");
const tpyU = str(qs.get("TPY=F")?.underlyingSymbol), sr3U = str(qs.get("SR3=F")?.underlyingSymbol);
if (tpyU && !TPY.includes(tpyU)) TPY.push(tpyU);
if (sr3U && !SR3.includes(sr3U)) SR3.push(sr3U);

head("spark, six months of daily closes (the server's own reader), 20 symbols a request");
const closes = new Map<string, Map<string, number>>();
{
  const all = [...new Set([...FS, ...[...named.values()].flat(), ...TPY, ...SR3])];
  for (let i = 0; i < all.length; i += 20) {
    const b = all.slice(i, i + 20), got = sparkOf(await yget(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(b.join(","))}&range=6mo&interval=1d`));
    for (const [k, rows] of got) { const m = new Map<string, number>(); for (const [t, c] of rows) m.set(dayIn(NYZ, t), c); closes.set(k, m); }
    console.log(`  ${got.size} of ${b.length} with closes${b.filter((x) => !got.has(x)).length ? `; none for ${b.filter((x) => !got.has(x)).join(" ")}` : ""}`);
  }
}
const quoteLine = (c: string): string => {
  const q = qs.get(c), m = closes.get(c), ds = m ? [...m.keys()].sort() : [];
  return `${c} (${label(c)}): ${q ? `"${q.shortName ?? q.longName ?? "–"}", expires ${str(q.expireIsoDate)?.slice(0, 10) ?? "–"}, last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}, volume ${q.regularMarketVolume ?? "–"}, average 10d ${q.averageDailyVolume10Day ?? "–"}, 3m ${q.averageDailyVolume3Month ?? "–"}, open interest ${q.openInterest ?? "–"}, bid ${q.bid ?? "–"}, ask ${q.ask ?? "–"}` : s ? "no quote" : "not quoted"} · ${ds.length ? `${ds.length} closes ${ds[0]} to ${ds[ds.length - 1]}` : "no closes"}`;
};

// the sessions of the last sixty dates on which gold's series has a close: the yardstick for a thin contract's closes
const sessions60 = [...(closes.get("GC=F") ?? closes.get("SI=F") ?? new Map<string, number>()).keys()].sort().slice(-60);

// ---- 1. the metals' series against every month near the front ----
head("1. B-27's second point: each metal's =F series, date by date against every calendar month from this one to five on");
const today = dayIn(NYZ, t0 / 1000);
for (const m of METALS) {
  const fsym = `${m.root}=F`, q = qs.get(fsym), fc = closes.get(fsym), list = named.get(m.root) ?? [], quoted = str(q?.underlyingSymbol);
  console.log(`\n-- ${fsym} · ${m.name}: its quote names ${quoted ?? "–"}${q ? ` ("${q.shortName ?? "–"}", expires ${str(q.expireIsoDate)?.slice(0, 10) ?? "–"}); last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}, previous close ${q.regularMarketPreviousClose ?? "–"}` : ""}`);
  for (const c of list) console.log(`  ${quoteLine(c)}`);
  if (!fc?.size) { console.log("  no closes for the series"); continue; }
  const dates = [...fc.keys()].sort(), cs = list.map((c): [string, Map<string, number>] => [c, closes.get(c) ?? new Map<string, number>()]);
  const who = (d: string) => cs.filter(([, mm]) => { const x = mm.get(d); return x != null && same(x, fc.get(d) as number); }).map(([c]) => c);
  const segs: Array<{ who: string; from: string; to: string; n: number }> = [];
  for (const d of dates) { const h = who(d), w = h.length === 0 ? "none of these" : h.join(" = "); const last = segs[segs.length - 1]; if (last && last.who === w) { last.to = d; last.n++; } else segs.push({ who: w, from: d, to: d, n: 1 }); }
  console.log(`  ${fsym}'s ${dates.length} closes (${dates[0]} to ${dates[dates.length - 1]}, New York dates) equal, by date:`);
  for (const g of segs.slice(-24)) console.log(`    ${g.who}: ${g.from} to ${g.to} (${g.n})`);
  if (segs.length > 24) console.log(`    (${segs.length - 24} earlier stretches not printed)`);
  console.log("  the last fifteen sessions, one by one (where none is equal: the nearest contract and how far it stands from the series):");
  const done = dates.filter((d) => d < today).slice(-15);
  let onQuoted = 0, onOther = 0;
  for (const d of done) {
    const v = fc.get(d) as number, h = who(d);
    if (quoted && h.includes(quoted)) onQuoted++; else if (h.length) onOther++;
    const near = cs.map(([c, mm]) => ({ c, x: mm.get(d) })).filter((x): x is { c: string; x: number } => x.x != null).sort((a, b) => Math.abs(a.x - v) - Math.abs(b.x - v))[0];
    console.log(`    ${d}: ${v}: ${h.length ? `equals ${h.join(" = ")}` : near ? `equals none; nearest ${near.c} at ${near.x} (${pct(near.x / v - 1, 3)} from the series)` : "no contract has a close that day"}`);
  }
  const lastD = done[done.length - 1], lastWho = lastD ? who(lastD) : [];
  console.log(`  over those ${done.length} sessions the series equals the contract its quote names (${quoted ?? "–"}) on ${onQuoted}, another contract on ${onOther}, none on ${done.length - onQuoted - onOther}${quoted && lastD && !lastWho.includes(quoted) ? `. FLAG (B-27): on ${lastD}, the last complete session, the series is ${lastWho.length ? `on ${lastWho.join(" = ")}` : "on none of the contracts read"}, not on the contract its quote names: a roll taken from the quote's contract would be a step the series did not make` : ""}`);
}

// ---- 2. C-36: a repeated daily volume ----
head("2. C-36: the six fronts of 20 Nov, a month of daily bars: was 19 Nov's volume, which repeated 18 Nov's then, corrected?");
for (const [c, then] of C36) {
  const b = await chart(c, "range=1mo&interval=1d");
  if (!b) { console.log(`  ${c}: no chart (expired and dropped, or not answered)`); continue; }
  // a daily bar is stamped 00:00 New York of its trade date
  const rows = daily(b), v = (d: string) => rows.find((r) => r.d === d)?.v ?? null;
  const twins: string[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].v != null && rows[i].v === rows[i - 1].v && (rows[i].v as number) > 0) twins.push(`${rows[i - 1].d} and ${rows[i].d} (${rows[i].v})`);
  const v18 = v("2026-11-18"), v19 = v("2026-11-19"), v20 = v("2026-11-20");
  console.log(`  ${c}: ${rows.length} daily bars to ${rows[rows.length - 1]?.d ?? "–"}; the last six: ${rows.slice(-6).map((r) => `${r.d} ${r.v ?? "–"}`).join(", ")}`);
  console.log(`    on 20 Nov, 12:38 UTC: 18 Nov ${then}, 19 Nov ${then}. Now: 18 Nov ${v18 ?? "–"}, 19 Nov ${v19 ?? "–"}, 20 Nov ${v20 ?? "–"}: ${v19 == null ? "19 Nov's bar is not in the answer" : v19 !== then ? `19 Nov's volume is its own now (CORRECTED after the read of 20 Nov)${v18 != null && v18 !== then ? "; 18 Nov's changed too" : ""}` : v18 === v19 ? "19 Nov's still repeats 18 Nov's (NOT corrected)" : "19 Nov's is the figure read then, and 18 Nov's is another now"}${v20 != null && v19 != null ? `; 20 Nov's ${v20 === v19 ? "REPEATS 19 Nov's" : "is its own"}` : ""}`);
  console.log(`    consecutive sessions with exactly the same volume in these bars: ${twins.length ? twins.join("; ") : "none"}`);
}

// ---- 3. TPY ----
head("3. V-12: TPY, CME's yen TOPIX future (A wants it only if it trades: 20 sessions of its own closes and 100 contracts a day)");
{
  const q = qs.get("TPY=F");
  console.log(`  TPY=F: ${q ? `"${q.shortName ?? "–"}", names ${q.underlyingSymbol ?? "–"}, ${q.fullExchangeName ?? q.exchange ?? "–"}, ${q.currency ?? "–"}, delayed ${q.exchangeDataDelayedBy ?? "–"} min; last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}; volume ${q.regularMarketVolume ?? "–"}, average 10d ${q.averageDailyVolume10Day ?? "–"}, 3m ${q.averageDailyVolume3Month ?? "–"}; open interest ${q.openInterest ?? "–"}; bid ${q.bid ?? "–"}, ask ${q.ask ?? "–"}` : s ? "no quote" : "not quoted"}`);
  const own = [...(closes.get("TPY=F")?.keys() ?? [])].sort();
  console.log(`  TPY=F's series: ${own.length ? `${own.length} closes ${own[0]} to ${own[own.length - 1]}, on ${sessions60.filter((d) => closes.get("TPY=F")!.has(d)).length} of gold's last ${sessions60.length} sessions` : "no closes"}`);
  for (const c of TPY) { const m = closes.get(c) ?? new Map<string, number>(); console.log(`  ${quoteLine(c)} · closes on ${sessions60.filter((d) => m.has(d)).length} of gold's last ${sessions60.length} sessions`); }
  const front = tpyU ?? TPY[0], b = await chart(front, "range=3mo&interval=1d");
  if (!b) console.log(`  ${front}: no daily chart`);
  else {
    const rows = daily(b).filter((r) => r.d < today), l20 = rows.slice(-20), l60 = rows.slice(-60);
    const avg = (xs: typeof rows) => { const vs = xs.map((r) => r.v ?? 0); return vs.length ? vs.reduce((a, x) => a + x, 0) / vs.length : null; };
    const a20 = avg(l20), a60 = avg(l60);
    console.log(`  ${front}: ${rows.length} complete daily bars ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"}; average volume over its last ${l20.length} sessions ${f(a20, 1)} contracts a day (${l20.filter((r) => !r.v).length} with none), over its last ${l60.length} ${f(a60, 1)} (${l60.filter((r) => !r.v).length} with none); the last six: ${rows.slice(-6).map((r) => `${r.d} close ${r.c} volume ${r.v ?? "–"}`).join("; ")}`);
    console.log(`  A's line (V-12): 20 sessions of its own closes: ${l20.length >= 20 ? "yes" : `NO (${l20.length})`}; 100 contracts a day on average over them: ${a20 != null && a20 >= 100 ? "yes" : `NO (${f(a20, 1)})`}: ${l20.length >= 20 && a20 != null && a20 >= 100 ? "it trades by A's line" : "not tradable here by A's line: too little volume"}`);
  }
}

// ---- 4. SR3 ----
head("4. SR3's named months: closes over six months (one close in five sessions on 19 Nov)");
{
  const q = qs.get("SR3=F"), fd = [...(closes.get("SR3=F")?.keys() ?? [])].sort();
  console.log(`  SR3=F: ${q ? `"${q.shortName ?? "–"}", names ${q.underlyingSymbol ?? "–"}; last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))}; volume ${q.regularMarketVolume ?? "–"}, open interest ${q.openInterest ?? "–"}` : s ? "no quote" : "not quoted"}; its series: ${fd.length ? `${fd.length} closes ${fd[0]} to ${fd[fd.length - 1]}` : "no closes"}`);
  for (const c of SR3) { const m = closes.get(c) ?? new Map<string, number>(); console.log(`  ${quoteLine(c)} · closes on ${sessions60.filter((d) => m.has(d)).length} of gold's last ${sessions60.length} sessions`); }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX} planned, and at most 3 asked again after a 429); ${Math.round((Date.now() - t0) / 1000)} s`);
