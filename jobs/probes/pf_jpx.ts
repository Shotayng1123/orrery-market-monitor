// HELD FOR THE OWNER. Every read of jpx.co.jp the paper portfolio's plan still wants, in one probe that asks nothing
// until the owner answers (P-0b, 21 Nov 2026).
//
// The owner's answer of 21 Nov 2026 (SGT) on publishers' terms: do without JPX's new files (the TOPIX weight file, 品貸料,
// margin balances by name, the OSE settlement and volume pages, the 決算発表予定日 workbook). JPX's terms, as the probe of
// 20 Nov read them in full, bar "secondary use and redistribution" whatever the purpose and ask readers to refrain from
// automated retrieval that could mean high frequency or high load (C/probes/pf_bench.log l.331, l.337). Whether that
// answer also covers the rest of JPX's site was asked the same day and is not answered: UNTIL IT IS, NO PROBE AND NO
// NEW JOB SENDS A REQUEST TO jpx.co.jp (lib.ts refuses the host; only this file can lift that, part by part).
// The files the owner's answer names are never read here, whatever the switches say.
//
// To run a part once the owner has said yes to it: set its switch below to true, in a commit whose message quotes
// the owner's answer, and run the probe. With every switch false it prints what it would read and makes no request.
//
// It prints ONLY the values the plan needs: numbers, dates, clock times, each page's own title and date, and the row
// and column labels a number needs to be read (a cell is cut at 40 characters, a line at 220). Never a page's text.
//   rules (P-2; A's X-5 and V-10; the question's part (i)), from JPX's English pages on domestic stock trading (the
//     addresses of 20 Nov's log, pf_rules.log l.109–162):
//       the two tick-size tables' values (TOPIX 500 constituents' and the others') and the tables in force from
//       1 Mar 2027 with their classes by liquidity; the document on those classes the page links, if it is JPX's;
//       the daily price limits table; the trading hours and the closing auction's order period (lines that carry a
//       clock time); the short-selling price restriction (lines that carry a percentage or a number of units), on
//       the page JPX's own pages link, or else at one candidate address from the engineer's memory, said to be one;
//   etfList (P-3; C-39 and §2.20): on JPX's list of listed ETFs, the row of 2559 (its index, as listed) and the rows
//     whose index is MSCI Japan itself: code, name and index only;
//   calendar (O-3 of the check of "when a closed market opens"; the question's part (ii)): JPX's market-holiday
//     calendar page, English and Japanese: the lines that carry a date of 2026 or 2027, and for each Tokyo row the
//     Monitor holds from 1 Nov 2026 to 31 Jan 2027 (migrations 20261107000002 and 20261107000010) whether a line of
//     the page names that day. This was section 3 of sessions_check until 21 Nov 2026.
// Requests: at most 13, all to jpx.co.jp, 3 s apart (its robots.txt first): rules 8, etfList 1, calendar 2; its
// robots.txt is asked once more if it answers 429 (so 14 at the very most). None while the three switches are off.
// Runtime: deno (the document on tick classes may be a PDF; under node it is only measured).
//   Actions > source-probe > Run workflow: probe = pf_jpx, runtime = deno   (ONLY after the owner's answer)
import { readFileSync } from "node:fs";
import { bytes, head, liftJpxHold, linksOf, masked, page, pause, pdfPages, requestsMade, robots, tablesOf, textLines, titleOf, type Page, type Robots } from "./lib.ts";

/** THE OWNER'S ANSWER, part by part. All false: asked on 21 Nov 2026, not answered. */
const OWNER_HAS_RELEASED = { rules: false, etfList: false, calendar: false };

const MAX = 13, GAP = 3000, JPX = "https://www.jpx.co.jp";
const DOMESTIC = `${JPX}/english/equities/trading/domestic`;
const ADDR = {
  index: `${DOMESTIC}/index.html`, hours: `${DOMESTIC}/01.html`, limits: `${DOMESTIC}/06.html`, ticks: `${DOMESTIC}/07.html`,
  shortCandidates: [`${JPX}/english/markets/equities/ss-reg/index.html`, `${JPX}/markets/equities/ss-reg/index.html`],
  etfs: `${JPX}/equities/products/etfs/issues/01.html`,
  calendar: [["English", `${JPX}/english/corporate/about-jpx/calendar/index.html`], ["Japanese", `${JPX}/corporate/about-jpx/calendar/index.html`]] as Array<[string, string]>,
};
const t0 = Date.now();
const cut = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC`);
console.log(`the owner's answer, as this file holds it: rules ${OWNER_HAS_RELEASED.rules ? "released" : "HELD"}, etfList ${OWNER_HAS_RELEASED.etfList ? "released" : "HELD"}, calendar ${OWNER_HAS_RELEASED.calendar ? "released" : "HELD"}`);

// the Monitor's Tokyo rows, read from the two migrations that write them (no request)
const mine: string[] = [];
for (const fn of ["20261107000002_seed.sql", "20261107000010_holidays_verified.sql"]) {
  try { for (const m of readFileSync(new URL(`../../supabase/migrations/${fn}`, import.meta.url), "utf8").matchAll(/\('TSE',\s*'(\d{4}-\d{2}-\d{2})',\s*'((?:[^']|'')*)'/g)) if (!mine.includes(`${m[1]} ${m[2].replace(/''/g, "'")}`)) mine.push(`${m[1]} ${m[2].replace(/''/g, "'")}`); }
  catch (e) { console.log(`  ${fn} not read: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`); }
}
mine.sort();
const window = mine.filter((x) => x >= "2026-11-01" && x < "2027-02-01");

const any = OWNER_HAS_RELEASED.rules || OWNER_HAS_RELEASED.etfList || OWNER_HAS_RELEASED.calendar;
if (!any) {
  head("HELD FOR THE OWNER: nothing is asked of jpx.co.jp");
  console.log("  what this probe would read, once the owner says yes to a part:");
  console.log(`  rules: ${ADDR.index} · ${ADDR.ticks} (and the document on tick classes it links) · ${ADDR.limits} · ${ADDR.hours} (and a page on the closing auction, if the index links one) · the short-selling restriction page JPX's pages link, else the candidates ${ADDR.shortCandidates.join(" then ")}`);
  console.log(`  etfList: ${ADDR.etfs} (the row of 2559; the rows whose index is MSCI Japan)`);
  console.log(`  calendar: ${ADDR.calendar.map(([, u]) => u).join(" · ")} (beside the Monitor's Tokyo rows of 1 Nov 2026 to 31 Jan 2027: ${window.join(" · ") || "none read"})`);
  console.log("  meanwhile: Tokyo's tick sizes are A's assumption, marked (A); its holiday rows stay those read on 7 Nov 2026, and pf_holidays sets them against Japan's national-holiday file; 2559.T is not used (C-39)");
}

let rb: Robots | null = null;
const get = async (url: string): Promise<Page | null> => {
  if (rb && !rb.allows(url)) { console.log(`  not asked: robots.txt holds ${new URL(url).pathname}`); return null; }
  const p = await page(url, { timeoutMs: 45000 });
  await pause(GAP);
  if (p.ok) console.log(`  title: ${cut(titleOf(p.html), 120) || "–"}${p.lastModified ? ` · last-modified ${p.lastModified}` : ""}`);
  return p.ok ? p : null;
};
/** A page's tables: the heading before each, its header row and every row that carries a digit, each cell cut. */
const printTables = (html: string, want: RegExp | null = null, maxRows = 60): void => {
  const ts = tablesOf(html).filter((t) => t.rows.some((r) => r.some((c) => /\d/.test(c))) && (!want || want.test(`${t.heading} ${t.rows.slice(0, 3).flat().join(" ")}`)));
  console.log(`  ${ts.length} table(s) with figures${want ? ` that match ${want}` : ""}`);
  ts.forEach((t, k) => {
    console.log(`  table ${k + 1}${t.heading ? ` · under "${cut(t.heading, 80)}"` : ""}: ${t.rows.length} rows`);
    let n = 0;
    t.rows.forEach((r, i) => { if (i > 1 && !r.some((c) => /\d/.test(c))) return; if (n++ < maxRows) console.log(`    ${r.map((c) => cut(c)).join(" | ")}`); });
    if (n > maxRows) console.log(`    … ${n - maxRows} more rows not printed`);
  });
};
/** The lines of a page that match `want` (a line of 400 characters or more is prose, and left out), each once, cut at 220. */
const printValues = (html: string, want: RegExp, max = 40): void => {
  const seen = new Set<string>();
  let n = 0;
  for (const l of textLines(html)) { if (!want.test(l) || seen.has(l) || l.length > 400) continue; seen.add(l); if (++n <= max) console.log(`  | ${cut(masked(l), 220)}`); }
  console.log(n ? (n > max ? `  … ${n - max} more matching lines not printed` : `  ${n} line(s)`) : "  no line carries such a value");
};
const CLOCK = /\b\d{1,2}[:：]\d{2}\s*(a\.?m\.?|p\.?m\.?)?|\d{1,2}時\d{0,2}分?/i;

if (any) {
  liftJpxHold();
  head("JPX's robots.txt");
  rb = await robots(JPX, ["/english/equities/trading/domestic/", "/english/markets/equities/", "/equities/products/etfs/issues/", "/english/corporate/about-jpx/calendar/", "/corporate/about-jpx/calendar/"]);
  await pause(GAP);
}

if (OWNER_HAS_RELEASED.rules) {
  head("rules 1. The pages on domestic stock trading (the index's own links)");
  const ix = await get(ADDR.index);
  const links = ix ? linksOf(ix.html, ix.final).filter((l) => /jpx\.co\.jp\/english\/(equities|markets)\//.test(l.href) && l.text.length > 2 && l.text.length < 70) : [];
  const under = links.filter((l) => l.href.includes("/english/equities/trading/"));
  console.log(`  ${under.length} links under /english/equities/trading/: ${under.slice(0, 30).map((l) => `${cut(l.text, 40)} -> ${l.href.replace(JPX, "")}`).join(" · ") || "none"}`);
  let short = links.find((l) => /short[- ]?sell/i.test(l.text)), closing = links.find((l) => /closing auction|order acceptance|pre-closing/i.test(l.text));

  head("rules 2. Tick sizes: both tables in force, and those from 1 Mar 2027 (V-10)");
  const tk = await get(ADDR.ticks);
  if (tk) {
    printTables(tk.html);
    printValues(tk.html, /(19|20)\d\d|effective|STR|TOPIX ?500/i, 12);
    const doc = linksOf(tk.html, tk.final).find((l) => /jpx\.co\.jp/.test(l.href) && /implementation arrangements|optimi[sz]ation of tick|tick size.*(class|group|list)/i.test(l.text));
    if (doc) {
      console.log(`  the document on the classes: ${cut(doc.text, 80)} -> ${masked(doc.href)}`);
      if (rb && !rb.allows(doc.href)) console.log("  not asked: robots.txt holds its path");
      else if (/\.pdf(\?|$)/i.test(doc.href)) {
        const b = await bytes(doc.href, { timeoutMs: 90000 });
        await pause(GAP);
        const pages = b.data ? await pdfPages(b.data) : null;
        if (pages) {
          console.log(`  ${pages.length} pages`);
          let n = 0;
          pages.forEach((t, i) => { for (const m of t.matchAll(/(STR|Spread-to-Tick|class|group|categor|effective|March 1, 2027)[^.]{0,60}\d[^.]{0,50}/gi)) if (n++ < 12) console.log(`  p.${i + 1}: …${cut(m[0].replace(/\s+/g, " "), 140)}`); });
          if (!n) console.log("  no passage carries a class or a threshold with a figure");
        }
      } else { const d = await get(doc.href); if (d) printTables(d.html); }
    } else console.log("  no document on the classes is linked by that name");
    short = short ?? linksOf(tk.html, tk.final).find((l) => /short[- ]?sell/i.test(l.text));
  }

  head("rules 3. Daily price limits: the table's values");
  const lm = await get(ADDR.limits);
  if (lm) printTables(lm.html);

  head("rules 4. Trading hours, and the closing auction's order period (X-5): lines and rows that carry a clock time");
  const hr = await get(ADDR.hours);
  if (hr) { printValues(hr.html, CLOCK, 30); closing = closing ?? linksOf(hr.html, hr.final).find((l) => /jpx\.co\.jp/.test(l.href) && /closing auction|order acceptance|pre-closing/i.test(l.text)); short = short ?? linksOf(hr.html, hr.final).find((l) => /short[- ]?sell/i.test(l.text)); }
  if (closing) { console.log(`  a page on the closing auction is linked: ${cut(closing.text, 60)} -> ${masked(closing.href)}`); const c = await get(closing.href); if (c) printValues(c.html, CLOCK, 30); }
  else console.log("  no page on the closing auction is linked from the index or the hours page");

  head("rules 5. The short-selling price restriction: lines that carry a percentage or a number of units");
  const SS = /\d+(\.\d+)?\s*(%|％|percent)|\d+\s*(trading )?units|\d+\s*単元|base price|基準値段/i;
  if (short) { console.log(`  linked from JPX's own pages: ${cut(short.text, 60)} -> ${masked(short.href)}`); const p = await get(short.href); if (p) { printValues(p.html, SS, 20); printTables(p.html, /short|空売り|%|％/i, 20); } }
  else {
    console.log("  no page read links one by the words \"short selling\": the candidates below are from the engineer's memory, not from a JPX page");
    for (const u of ADDR.shortCandidates) { const p = await get(u); if (p) { printValues(p.html, SS, 20); printTables(p.html, /short|空売り|%|％/i, 20); break; } }
  }
}

if (OWNER_HAS_RELEASED.etfList) {
  head("etfList. JPX's list of listed ETFs: the row of 2559, and the rows whose index is MSCI Japan");
  const p = await get(ADDR.etfs);
  if (p) {
    const rows = tablesOf(p.html).flatMap((t) => t.rows);
    const header = rows.find((r) => r.some((c) => /コード|Code/i.test(c)) && r.length >= 3);
    console.log(`  ${rows.length} table rows on the page; the header row: ${header ? header.map((c) => cut(c, 24)).join(" | ") : "not found"}`);
    const r2559 = rows.filter((r) => r.some((c) => /^2559$/.test(c.trim())));
    for (const r of r2559) console.log(`  2559: ${r.map((c) => cut(c, 60)).join(" | ")}`);
    if (!r2559.length) console.log("  no row carries the code 2559");
    const msci = rows.filter((r) => r.some((c) => /MSCI.{0,8}(Japan|ジャパン)|ＭＳＣＩ.{0,8}(ジャパン|日本)/i.test(c)) && !r.some((c) => /^2559$/.test(c.trim())));
    console.log(`  rows that name MSCI Japan: ${msci.length}`);
    for (const r of msci.slice(0, 12)) console.log(`    ${r.filter((c) => /^\d{4}$|^\d{3}[A-Z]$|MSCI|ＭＳＣＩ/i.test(c.trim()) || (c.length > 6 && c.length < 70 && !/\d{4}\/|http/.test(c))).slice(0, 4).map((c) => cut(c, 60)).join(" | ")}`);
  }
}

if (OWNER_HAS_RELEASED.calendar) {
  head("calendar. JPX's market-holiday calendar page beside the Tokyo rows the Monitor holds (O-3)");
  console.log(`  the Monitor holds ${mine.length} Tokyo rows (2026 and 2027); those from 1 Nov 2026 to 31 Jan 2027: ${window.join(" · ")}`);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  for (const [what, url] of ADDR.calendar) {
    console.log(`  -- the ${what} page`);
    const p = await get(url);
    if (!p) continue;
    const ls = textLines(p.html);
    // every line that carries a date of the calendar: a month's name with a day, a slashed or dotted date, or 月 and 日
    printValues(p.html, /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\b20(26|27)[\/.\-年]\s*\d{1,2}|\d{1,2}月\s*\d{1,2}日/i, 80);
    for (const row of window) {
      const [y, mo, d] = row.slice(0, 10).split("-").map(Number);
      const res = [new RegExp(`\\b(${MON[mo - 1]}\\.?|${LONG[mo - 1]})\\s+0?${d}\\b`, "i"), new RegExp(`\\b0?${d}\\s+(${MON[mo - 1]}\\.?|${LONG[mo - 1]})\\b`, "i"), new RegExp(`(^|\\D)0?${mo}月\\s*0?${d}日`), new RegExp(`${y}[\\/.\\-]0?${mo}[\\/.\\-]0?${d}(\\D|$)`), new RegExp(`(^|\\D)0?${mo}\\/0?${d}(\\D|$)`)];
      const hit = ls.find((l) => res.some((re) => re.test(l)));
      console.log(`  ${row}: ${hit ? `a line of the page names the day: "${cut(hit, 120)}"` : "no line of the page names this day in the forms looked for (the page may give its dates another way, or in a file it links)"}`);
    }
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}${any ? "" : "; held for the owner: none"}); ${Math.round((Date.now() - t0) / 1000)} s`);
