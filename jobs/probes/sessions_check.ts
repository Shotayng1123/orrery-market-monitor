// What the session table rests on, read from the sources themselves (the reviewer's check of "when a closed market
// opens", 21 Nov 2026: findings O-1, O-2 and O-3). Read-only, no key, nothing written.
//   1. O-1, the FX week. Since 21 Nov 2026 both session tables keep it by New York's clock, Sunday 17:00 to Friday 17:00
//      there (the server's fxTrading); before, Monday 05:00 to Saturday 06:00 SGT all year. Which of the two the feed
//      follows was in no log. Here: Yahoo's five-minute bars of USDJPY=X and EURUSD=X over a month, and for each weekend
//      in them the last bar before it and the first after, in UTC, New York's time and SGT. The month before 21 Nov 2026
//      holds New York's change of clocks on 1 Nov, so an opening by New York's clock moves from 05:00 to 06:00 SGT in it,
//      and one kept in SGT does not. Then USDJPY=X's one-minute bars over five days, the bars the Monitor's minute job
//      reads: the same two ends of the newest weekend.
//   2. O-2, six instruments the instruments table gives New York's session though New York's exchange is not their
//      market: the dollar index (DX-Y.NYB), the yield indices ^FVX, ^TNX and ^TYX, and ^VIX and ^VXN. For each, and
//      for ^GSPC beside them: the exchange and time zone Yahoo names, the regular session it declares for today, and
//      the first and last one-minute bar of each of the last five days, in New York's time: the hours the feed prints.
//   3. O-3, Tokyo's holidays. The Monitor holds JPX's for 2026 and 2027 (migrations 20261107000002 and 20261107000010,
//      "checked against the publishers' own pages on 2026-11-07"); no log of this cycle shows the page. Here: JPX's
//      market-holiday calendar page (the address in HOLIDAY_SOURCES), its lines that carry a date, and for each of the
//      Monitor's Tokyo rows from 1 Nov 2026 to 31 Jan 2027 whether a line of the page names that day. Two pages, the
//      English and the Japanese, read once each: JPX's terms ask readers to refrain from high-frequency, high-load
//      automated retrieval (C/probes/pf_bench.log).
// Requests: at most 13 (Yahoo 10, 1.2 s apart; JPX 3). Runtime: node.
//   Actions > source-probe > Run workflow: probe = sessions_check, runtime = node
import { readFileSync } from "node:fs";
import { head, look, page, pause, printLines, requestsMade, robots, textLines, titleOf } from "./lib.ts";

type J = Record<string, unknown>;
const NY = "America/New_York", SG = "Asia/Singapore";
const fmts = new Map<string, Intl.DateTimeFormat>();
const inZone = (tz: string, t: number): string => {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); fmts.set(tz, f); }
  return f.format(new Date(t * 1000)).replace(",", "");
};
const utc = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const three = (t: number) => `${utc(t)} = ${inZone(NY, t)} New York = ${inZone(SG, t)} SGT`;

interface Chart { meta: J; ts: number[]; close: Array<number | null> }
async function chart(symbol: string, range: string, interval: string): Promise<Chart | null> {
  const r = await look(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { headers: { accept: "application/json" }, show: 0, timeoutMs: 40000 });
  await pause(1200);
  let j: J | null = null;
  try { j = JSON.parse(r.text) as J; } catch { /* reported below */ }
  const res = ((j?.chart as { result?: Array<{ meta?: J; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } | undefined)?.result ?? [])[0];
  if (!r.ok || !res?.meta) { console.log(`  no chart in the answer${r.text ? `: ${JSON.stringify(r.text.slice(0, 200))}` : ""}`); return null; }
  const ts = res.timestamp ?? [], c = res.indicators?.quote?.[0]?.close ?? [];
  return { meta: res.meta, ts, close: ts.map((_, k) => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : null)) };
}
/** The times of the bars that carry a price. */
const priced = (c: Chart): number[] => c.ts.filter((_, k) => c.close[k] != null);
const session = (m: J): string => {
  const reg = (m.currentTradingPeriod as { regular?: { start?: number; end?: number } } | undefined)?.regular;
  return reg?.start && reg.end ? `${inZone(NY, reg.start)} to ${inZone(NY, reg.end)} New York (${utc(reg.start)} to ${utc(reg.end)})` : "not given";
};

head("1. The FX week in Yahoo's bars (O-1): each weekend's last bar before it and first bar after");
console.log("  by New York's clock the week ends Friday 17:00 and opens Sunday 17:00 there: 21:00 UTC until 31 Oct 2026, 22:00 UTC from 1 Nov 2026;");
console.log("  by the rule the session table kept until 21 Nov 2026 it opened Monday 05:00 SGT = Sunday 21:00 UTC all year, and ended Saturday 06:00 SGT = Friday 22:00 UTC");
for (const [sym, range, interval] of [["USDJPY=X", "1mo", "5m"], ["EURUSD=X", "1mo", "5m"], ["USDJPY=X", "5d", "1m"]] as const) {
  const c = await chart(sym, range, interval);
  if (!c) continue;
  const t = priced(c);
  console.log(`  ${sym} ${interval} over ${range}: ${t.length} bars with a price of ${c.ts.length}; exchange "${String(c.meta.fullExchangeName ?? c.meta.exchangeName ?? "–")}", time zone ${String(c.meta.exchangeTimezoneName ?? "–")}; regular session declared for today: ${session(c.meta)}`);
  if (t.length) console.log(`    first bar ${three(t[0])}; last bar ${three(t[t.length - 1])}`);
  let gaps = 0;
  for (let k = 1; k < t.length; k++) {
    if (t[k] - t[k - 1] < 12 * 3600) continue;
    gaps++;
    console.log(`    a gap of ${((t[k] - t[k - 1]) / 3600).toFixed(1)} h:`);
    console.log(`      last bar before  ${three(t[k - 1])}`);
    console.log(`      first bar after  ${three(t[k])}`);
  }
  if (!gaps) console.log("    no gap of twelve hours or more between two bars");
}

head("2. Six instruments read in New York's hours (O-2): the session Yahoo declares, and when its minute bars begin and end");
for (const sym of ["^GSPC", "^VIX", "^VXN", "^FVX", "^TNX", "^TYX", "DX-Y.NYB"]) {
  const c = await chart(sym, "5d", "1m");
  if (!c) continue;
  const t = priced(c), byDay = new Map<string, number[]>();
  for (const x of t) { const d = new Intl.DateTimeFormat("en-CA", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(x * 1000)); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(x); }
  console.log(`  ${sym}: "${String(c.meta.shortName ?? c.meta.longName ?? "–")}", exchange "${String(c.meta.fullExchangeName ?? c.meta.exchangeName ?? "–")}", ${String(c.meta.instrumentType ?? "–")}, time zone ${String(c.meta.exchangeTimezoneName ?? "–")}, declared delay ${String(c.meta.exchangeDataDelayedBy ?? "–")} min`);
  console.log(`    regular session declared for today: ${session(c.meta)}`);
  for (const [d, xs] of byDay) console.log(`    ${d} (New York's date): ${xs.length} one-minute bars with a price, from ${inZone(NY, xs[0])} to ${inZone(NY, xs[xs.length - 1])} New York (${utc(xs[0])} to ${utc(xs[xs.length - 1])})`);
  if (!byDay.size) console.log("    no one-minute bar with a price");
}

head("3. Tokyo's market holidays (O-3): JPX's calendar page beside the rows the Monitor holds");
// the Monitor's rows, read from the two migrations that write them
const mine: string[] = [];
for (const f of ["20261107000002_seed.sql", "20261107000010_holidays_verified.sql"]) {
  try { for (const m of readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8").matchAll(/\('TSE',\s*'(\d{4}-\d{2}-\d{2})',\s*'((?:[^']|'')*)'/g)) if (!mine.includes(`${m[1]} ${m[2].replace(/''/g, "'")}`)) mine.push(`${m[1]} ${m[2].replace(/''/g, "'")}`); }
  catch (e) { console.log(`  ${f} not read: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`); }
}
mine.sort();
console.log(`  the Monitor holds ${mine.length} Tokyo rows (2026 and 2027); those from 1 Nov 2026 to 31 Jan 2027: ${mine.filter((x) => x >= "2026-11-01" && x < "2027-02-01").join(" · ")}`);
await robots("https://www.jpx.co.jp", ["/english/corporate/about-jpx/calendar/index.html", "/corporate/about-jpx/calendar/index.html"]);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
for (const [what, url] of [["English", "https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html"], ["Japanese", "https://www.jpx.co.jp/corporate/about-jpx/calendar/index.html"]] as const) {
  console.log(`  -- the ${what} page`);
  const p = await page(url);
  if (!p.ok) continue;
  const ls = textLines(p.html);
  console.log(`  title: ${titleOf(p.html)}; ${ls.length} lines of text`);
  // every line that carries a date of the calendar: a month's name with a day, a slashed or dotted date, or 月 and 日
  printLines(ls, /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\b20(26|27)[\/.\-年]\s*\d{1,2}|\d{1,2}月\s*\d{1,2}日|holiday|休業日|休日/i, 80);
  // each of the Monitor's rows of the next weeks: is there a line of the page that names that day?
  for (const row of mine.filter((x) => x >= "2026-11-01" && x < "2027-02-01")) {
    const [y, mo, d] = row.slice(0, 10).split("-").map(Number);
    const res = [new RegExp(`\\b(${MON[mo - 1]}\\.?|${LONG[mo - 1]})\\s+0?${d}\\b`, "i"), new RegExp(`\\b0?${d}\\s+(${MON[mo - 1]}\\.?|${LONG[mo - 1]})\\b`, "i"), new RegExp(`(^|\\D)0?${mo}月\\s*0?${d}日`), new RegExp(`${y}[\\/.\\-]0?${mo}[\\/.\\-]0?${d}(\\D|$)`), new RegExp(`(^|\\D)0?${mo}\\/0?${d}(\\D|$)`)];
    const hit = ls.find((l) => res.some((re) => re.test(l)));
    console.log(`  ${row}: ${hit ? `a line of the page names the day: "${hit.slice(0, 160)}"` : "no line of the page names this day in the forms looked for (the page may give its dates another way, or in a file it links)"}`);
  }
}

console.log(`\n${requestsMade()} requests made (at most 13)`);
