// The paper portfolio's probe of Yahoo Finance over COMPLETE sessions (P-0b: C/portfolio-plan.md §3.1b item 2 with the
// PMs' additions of 21 Nov 2026: the parts that need no open market, so that they can be read on any day). Yahoo
// Finance is unofficial. Read-only, no key, nothing written; the session cookie and crumb are never printed.
// The run of 20 Nov 2026 read five sessions of one-minute bars for NVDA, SPY, 7203.T and 1306.T (C/probes/pf_yahoo.log
// l.85–131): the minute volumes do not add up to the daily bar, Tokyo's first bar is stamped 09:05 on four days of five
// and holds 9.5 to 19.5% of the day's minute volume, and no closing auction shows. This one reads as far back as the
// minute history reaches, and prints what A asked for (A's verdict on round 3a, §3 and §4):
//   1. Tokyo, for 7203.T, 6758.T, 8306.T, 9984.T (four weeks) and 1306.T (two weeks), one line per complete session:
//      the first bar with volume (stamp, open, high, low, close, volume), its volume against the median of the next ten,
//      whether its open is the daily bar's open; any bar stamped 09:00 to 09:04; the bars at 11:29, 11:30, 12:30 (the
//      afternoon's first, read the same way), 15:24 and 15:30; the minute volumes' sum, the daily bar's volume, and
//      "daily bar − minute sum" (V-3, V-4: is the first bar the opening auction's print? what share of the day is
//      outside the minute bars: the closing auction's share?);
//   2. New York, for NVDA and SPY (two weeks), one line per complete session: the 09:30 and 15:59 bars, a 16:00 bar,
//      the first bar's open beside the daily open, the minute volumes' sum against the daily bar;
//   3. for every name: k, the daily bars' volume over the minute volumes' sum across the last five complete sessions
//      (C-33; V-3), each session's own ratio, and their spread over all the sessions read;
//   4. Yahoo's results-date fields as it sends them (earningsTimestamp, earningsTimestampStart, earningsTimestampEnd,
//      isEarningsDateEstimate and any other field named "earnings…") for 7203.T, 6758.T, NVDA and AAPL, each moment
//      in UTC, JST and New York's time (A-37: no log holds them; the in-session run prints them too).
// A session is complete when its date is before today's in the exchange's time zone, or its market's state is closed.
// One-minute bars are asked seven days at a time (Yahoo serves about a month of them, a week or so a request, as I
// know it: a refusal is printed and nothing older is asked).
//
// It first prints, for the record, what Yahoo's robots.txt says on its two data hosts, and what Yahoo's terms say,
// by the link on Yahoo Finance's own home page: no probe had read either. Neither is a gate here: Yahoo Finance is a
// feed the Monitor already reads, labelled unofficial, and the plan's gate never stops such a feed
// (C/portfolio-plan.md §0.5 P4): the finding is for the owner, and the feed runs on until the owner decides. This is
// the first of the Yahoo probes to run; the others do not read the two again.
// Requests: at most 38, all to Yahoo, 1.2 s apart: three robots.txt (3), the home page (1), the terms (1 or 2), the
// session (2), one quote (1), seven names' daily bars (7), and one-minute bars in seven-day windows: four Tokyo names
// × 4, 1306.T × 2, NVDA and SPY × 2 (22). A data request that answers 429 is asked again once after 5 s, three times
// at most in a run, and a robots.txt that answers 429 is asked once more (so 44 at the very most); after three 429s
// in a row nothing more is asked.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = pf_yahoo_hist, runtime = node
import { head, page, pause, readTerms, requestsMade, robots, titleOf, yahooSession } from "./lib.ts";
import { GAP, chart, daily, dayIn, f, hmIn, iso, median, minutesByDay, num, quotes, sd, yahooStopped, type Day, type J, type Minute } from "./yahoo_lib.ts";

const MAX = 38;
const NY = "America/New_York", TK = "Asia/Tokyo";
const NAMES: Array<{ sym: string; windows: number }> = [
  { sym: "7203.T", windows: 4 }, { sym: "6758.T", windows: 4 }, { sym: "8306.T", windows: 4 }, { sym: "9984.T", windows: 4 },
  { sym: "1306.T", windows: 2 }, { sym: "NVDA", windows: 2 }, { sym: "SPY", windows: 2 },
];
const RESULTS = ["7203.T", "6758.T", "NVDA", "AAPL"];
const t0 = Date.now(), nowS = Math.floor(t0 / 1000);
const clock = (tz: string, t: number) => `${dayIn(tz, t)} ${hmIn(tz, t)}`;
const g = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? "–" : String(Number(x.toPrecision(8))));
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC = ${clock(NY, nowS)} in New York = ${clock(TK, nowS)} in Tokyo`);

head("Yahoo Finance's robots.txt on its two data hosts, for the record (no probe had read it)");
console.log("  not a gate here: Yahoo Finance is a feed the Monitor already reads, labelled unofficial, and the plan's gate never stops such a feed (C/portfolio-plan.md §0.5 P4): what its robots.txt and its terms say is printed for the owner, and the feed runs on until the owner decides");
for (const host of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) { await robots(host, ["/v8/finance/chart/NVDA", "/v7/finance/quote", "/v7/finance/options/SPY", "/v8/finance/spark", "/v1/finance/search"]); await pause(GAP); }
console.log("  whatever these two answers say (\"held\" and \"no rule read\" are the helper's words for a site it gates), the paths are asked below: see the note above");

head("Yahoo's terms, for the record (no probe had read them): by the link on Yahoo Finance's own home page");
{
  const HOME = "https://finance.yahoo.com/", rb = await robots("https://finance.yahoo.com", ["/"]);
  await pause(GAP);
  // the home page is no feed of the Monitor's: its robots.txt gates it as any new page's does
  if (!rb.allows(HOME)) console.log("  the home page is not asked (its robots.txt holds it, or was not read): Yahoo's terms stay unread, and no log holds them");
  else {
    const p = await page(HOME, { timeoutMs: 45000 });
    await pause(GAP);
    if (!p.ok) console.log("  the home page did not answer: Yahoo's terms stay unread, and no log holds them");
    else {
      console.log(`  the home page's title: ${titleOf(p.html) || "–"}`);
      const t = await readTerms(p, { gapMs: GAP, forRecord: true });
      console.log(`  ${t.read ? `Yahoo's terms were read${t.barred ? ": a line of them bars automated reading or any re-use. FOR THE OWNER" : "; no line matched the helper's patterns for a bar (a person still reads the lines above)"}` : "Yahoo's terms were NOT read (no terms link on the page, or its page did not answer): no log holds them"}. Not a gate here, as said above: the paths are asked below`);
    }
  }
}

head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await yahooSession();
await pause(GAP);

const SYMS = [...new Set([...NAMES.map((n) => n.sym), ...RESULTS])];
let qs = new Map<string, J>();
if (s) {
  head(`The v7 quote of ${SYMS.join(", ")}: state, declared delay, average volumes`);
  qs = await quotes(SYMS, s);
  for (const sym of SYMS) { const q = qs.get(sym); console.log(`  ${sym}: ${q ? `"${q.longName ?? q.shortName ?? "–"}" · ${q.fullExchangeName ?? q.exchange ?? "–"} · state ${q.marketState ?? "–"} · declared delay ${q.exchangeDataDelayedBy ?? "–"} min · last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))} · average volume 10d ${q.averageDailyVolume10Day ?? "–"}, 3m ${q.averageDailyVolume3Month ?? "–"}` : "no quote"}`); }
} else console.log("  no session: the quote is not asked (the charts below need none)");

/** The bars of a session with their sums; `at(hm)` is the bar stamped at that minute, if any. */
interface Session { d: string; bars: Minute[]; sum: number; day: Day | undefined }
const at = (x: Session, hm: string): Minute | undefined => x.bars.find((b) => b.hm === hm);
const vol = (b: Minute | undefined) => (b ? String(b.v) : "no bar");
/** The volume of the bar at index `i` against the median volume of the ten bars after it. */
const against = (bars: Minute[], i: number): number | null => { const m = median(bars.slice(i + 1, i + 11).map((b) => b.v)); return i >= 0 && m ? bars[i].v / m : null; };

let reach = 99;   // the oldest window Yahoo still served, in weeks back: once a window is refused, none older is asked
for (const { sym, windows } of NAMES) {
  head(`${sym}: daily bars over three months; one-minute bars, ${windows} windows of seven days`);
  if (yahooStopped()) { console.log("  not asked"); continue; }
  const db = await chart(sym, "range=3mo&interval=1d");
  if (!db) { console.log("  no daily chart: nothing to set the minutes against"); continue; }
  const tz = db.tz, today = dayIn(tz, nowS), st = qs.get(sym)?.marketState, closed = st != null && /CLOSED|POST|PREPRE/i.test(String(st));
  const days = daily(db), dayOf = new Map(days.map((r) => [r.d, r]));
  const all = new Map<string, Minute[]>();
  for (let w = 0; w < Math.min(windows, reach); w++) {
    const p2 = nowS - w * 7 * 86400, p1 = p2 - 7 * 86400;
    const mb = await chart(sym, `period1=${p1}&period2=${p2}&interval=1m`);
    if (!mb) { console.log(`  one-minute bars ${iso(p1).slice(0, 10)} to ${iso(p2).slice(0, 10)}: none served; nothing older is asked`); if (w >= 1) reach = Math.min(reach, w); break; }
    const by = minutesByDay(mb);
    console.log(`  one-minute bars ${iso(p1).slice(0, 10)} to ${iso(p2).slice(0, 10)}: ${mb.ts.length} bars over ${by.size} dates`);
    for (const [d, bars] of by) all.set(d, [...(all.get(d) ?? []), ...bars].sort((a, b) => a.t - b.t).filter((b, i, xs) => i === 0 || xs[i - 1].t !== b.t));
  }
  const sessions: Session[] = [...all].sort().filter(([d]) => d < today || closed).map(([d, bars]) => ({ d, bars, sum: bars.reduce((a, b) => a + b.v, 0), day: dayOf.get(d) }));
  if (!sessions.length) { console.log("  no complete session in the minute bars"); continue; }
  console.log(`  ${sessions.length} complete sessions, ${sessions[0].d} to ${sessions[sessions.length - 1].d} (${tz})${[...all.keys()].some((d) => !(d < today || closed)) ? "; today's, still open, left out" : ""}`);
  const outside: number[] = [], ratio: number[] = [], notMet: string[] = [];
  let openIsDaily = 0, fiveTimes = 0, at0905 = 0, early = 0, pmFive = 0;
  for (const x of sessions) {
    // the first bar that carries volume: a bar of no volume may stand before it (16 Nov's 09:00 bar in the log of 20 Nov)
    const i0 = Math.max(0, x.bars.findIndex((b) => b.v > 0)), first = x.bars[i0], dv = x.day?.v ?? null, share = dv ? (dv - x.sum) / dv : null;
    if (share != null) outside.push(share);
    if (dv && x.sum) ratio.push(dv / x.sum);
    const a0 = against(x.bars, i0), same = x.day?.o != null && first.o != null && Math.abs(first.o - x.day.o) <= 1e-6 * Math.max(1, Math.abs(x.day.o));
    if (same) openIsDaily++; if (a0 != null && a0 >= 5) fiveTimes++;
    if (!(same && a0 != null && a0 >= 5)) notMet.push(x.d);
    if (tz === TK) {
      if (first.hm === "09:05") at0905++;
      const before = x.bars.filter((b) => b.hm < "09:05"); if (before.length) early++;
      const iPm = x.bars.findIndex((b) => b.hm >= "12:30"), aPm = against(x.bars, iPm); if (aPm != null && aPm >= 5) pmFive++;
      console.log(`    ${x.d}: ${x.bars.length} bars; the first with volume ${first.hm} open ${g(first.o)} high ${g(first.h)} low ${g(first.l)} close ${g(first.c)} volume ${first.v} (${x.sum ? (first.v / x.sum * 100).toFixed(1) : "–"}% of the minutes'; ${a0 != null ? `${a0.toFixed(1)} times the median of the next ten bars` : "–"}); the daily bar's open ${g(x.day?.o)}: ${x.day?.o == null || first.o == null ? "–" : same ? "the first bar's open" : "NOT the first bar's open"}; bars 09:00–09:04: ${before.length ? before.map((b) => `${b.hm} volume ${b.v} open ${g(b.o)}`).join(", ") : "none"}; 11:29 ${vol(at(x, "11:29"))}, 11:30 ${vol(at(x, "11:30"))}, 12:30 ${vol(at(x, "12:30"))}${iPm >= 0 && x.bars[iPm].hm !== "12:30" ? ` (the afternoon's first bar is ${x.bars[iPm].hm}, volume ${x.bars[iPm].v})` : ""}${aPm != null ? ` (${aPm.toFixed(1)} times the next ten)` : ""}, 15:24 ${vol(at(x, "15:24"))}, 15:30 ${vol(at(x, "15:30"))}; last bar with volume ${[...x.bars].reverse().find((b) => b.v > 0)?.hm ?? "–"}; minutes sum ${x.sum}, daily bar ${dv ?? "–"}, daily − minutes ${dv != null ? dv - x.sum : "–"} (${share != null ? (share * 100).toFixed(1) : "–"}% of the daily bar)`);
    } else {
      console.log(`    ${x.d}: ${x.bars.length} bars; the first with volume ${first.hm} open ${g(first.o)} volume ${first.v} (${a0 != null ? `${a0.toFixed(1)} times the median of the next ten bars` : "–"}); the daily bar's open ${g(x.day?.o)}: ${x.day?.o == null || first.o == null ? "–" : same ? "the first bar's open" : "NOT the first bar's open"}; 15:59 ${vol(at(x, "15:59"))}, 16:00 ${vol(at(x, "16:00"))}; minutes sum ${x.sum}, daily bar ${dv ?? "–"} (the minutes are ${dv ? (x.sum / dv * 100).toFixed(1) : "–"}% of it)`);
    }
  }
  const n = sessions.length, last5 = sessions.filter((x) => x.day?.v && x.sum).slice(-5);
  const k = last5.length ? last5.reduce((a, x) => a + (x.day?.v as number), 0) / last5.reduce((a, x) => a + x.sum, 0) : null;
  console.log(`  k (C-33, E): the daily bars' volume over the minute volumes' sum across the last ${last5.length} complete sessions (${last5[0]?.d ?? "–"} to ${last5[last5.length - 1]?.d ?? "–"}): ${f(k, 3)}; each session's own ratio over all ${ratio.length} read: min ${f(ratio.length ? Math.min(...ratio) : null, 3)}, median ${f(median(ratio), 3)}, max ${f(ratio.length ? Math.max(...ratio) : null, 3)}`);
  if (tz === TK) {
    console.log(`  the first bar with volume: stamped 09:05 on ${at0905} of ${n} sessions; a bar before 09:05 on ${early}; its open is the daily open on ${openIsDaily} of ${n}; its volume is five times the median of the next ten bars or more on ${fiveTimes} of ${n}. A's test of an opening print (the open is the daily open on every session, and the volume at least five times): ${notMet.length ? `not met on ${notMet.length} of ${n} (${notMet.slice(0, 8).join(", ")}${notMet.length > 8 ? " …" : ""})` : "MET on every session read"}`);
    console.log(`  the afternoon's first bar: five times the median of the next ten bars or more on ${pmFive} of ${n} sessions`);
    console.log(`  daily bar − minute sum, as a share of the daily bar (V-4: what lies outside the minute bars; the closing auction is in it): min ${f(outside.length ? Math.min(...outside) * 100 : null, 1)}%, median ${f(median(outside) == null ? null : (median(outside) as number) * 100, 1)}%, max ${f(outside.length ? Math.max(...outside) * 100 : null, 1)}%, standard deviation ${f(sd(outside) == null ? null : (sd(outside) as number) * 100, 1)} points over ${outside.length} sessions; negative on ${outside.filter((x) => x < 0).length} (the minutes sum to more than the daily bar there)`);
  } else console.log(`  the first bar's open is the daily open on ${openIsDaily} of ${n} sessions`);
}

if (s) {
  head("Yahoo's results-date fields as sent (A-37): every field of the quote named \"earnings…\", each moment in UTC, JST and New York's time");
  for (const sym of RESULTS) {
    const q = qs.get(sym);
    if (!q) { console.log(`  ${sym}: no quote`); continue; }
    const keys = Object.keys(q).filter((k) => /earnings/i.test(k)).sort();
    console.log(`  ${sym}: ${["earningsTimestamp", "earningsTimestampStart", "isEarningsDateEstimate"].map((k) => `${k} ${k in q ? JSON.stringify(q[k]) : "ABSENT"}`).join("; ")}`);
    for (const k of keys) { const v = q[k], t = num(v); console.log(`    ${k}: ${JSON.stringify(v)}${t != null && t > 1e9 && t < 4e9 ? ` = ${iso(t)} = ${clock(TK, t)} JST = ${clock(NY, t)} New York` : ""}`); }
    if (!keys.length) console.log("    no field named \"earnings…\" in this quote");
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX} planned, and at most 3 asked again after a 429); ${Math.round((Date.now() - t0) / 1000)} s`);
