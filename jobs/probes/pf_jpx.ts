// Every read of jpx.co.jp the paper portfolio's plan still wants, in one probe (P-0b, 21 Nov 2026). Two of its three
// parts are released by the owner; the third is still held.
//
// The owner's answer of 21 Nov 2026 (SGT) on publishers' terms: do without JPX's new files (the TOPIX weight file, 品貸料,
// margin balances by name, the OSE settlement and volume pages, the 決算発表予定日 workbook). JPX's terms, as the probe of
// 20 Nov read them in full, bar "secondary use and redistribution" whatever the purpose and ask readers to refrain from
// automated retrieval that could mean high frequency or high load (C/probes/pf_bench.log l.331, l.337). Whether that
// answer also covers the rest of JPX's site was asked the same day, with three things named: (i) JPX's rule pages (tick
// sizes, daily price limits, the closing auction's times, the short-selling price restriction), (ii) its market-holiday
// calendar, (iii) the weekly trading by type of investors and the monthly TOPIX PER and PBR; options (a) rules and
// holidays yes, statistics no, (b) none, (c) all. The owner's answer, about 18:00 SGT that day, in the owner's words:
// "(c) all." So `rules` and `calendar` below are released. `etfList` (2559's row on JPX's list of listed ETFs) was not
// among the three things named, so it stays held until the owner is asked about it; (iii)'s two statistics files are
// not read by this probe.
// lib.ts refuses jpx.co.jp to every other probe; only this file lifts that, part by part.
// The files the owner's first answer names are never read here, whatever the switches say.
//
// To run a held part once the owner has said yes to it: set its switch below to true, in a commit whose message quotes
// the owner's answer, and run the probe. A part whose switch is false makes no request.
//
// WHAT IT PRINTS (jpx_read.ts holds the rules, and sim/logic.test.ts checks them, also by running this file offline
// with its fetch replaced). Only values, never a page's text: each page's own title and date; the cells of a table of
// figures, under its heading or the short label before it (a table of notices or of text is left out whole, and a
// cell of prose in a table of figures is counted, not printed); a page's values (a clock time, a date, a percentage, a
// number of units) in order, joined only by the one short word between two of them ("9:00 am to 11:30 am"), never the
// words around them; a market holiday as its date; addresses. Every piece of a page but its title goes through one
// guard (`piece`): nothing of more than nine words or ninety characters, nothing with the signs of a sentence (a verb of
// being or a modal, a full stop after a word; in Japanese an ending of one, or more than 28 characters), and nothing
// but figures, dates, clock times and the words of a closed list of the labels and units JPX's tables carry, which
// holds no verb, so that no sentence of a page, however short, is printed (jpx_read.ts labelOnly: PL-1 of the final
// review of pull request #50). (Until 22 Nov 2026 a value came with two words on each side, and the pieces of one paragraph of the
// hours page touched and overlapped, so consecutive lines gave its sentences back: PX-1.) (The run of 21 Nov, before this rule, printed every line that held a match, cut at 220
// characters: four sentences of JPX's pages, two navigation labels, seventeen link labels and three notice titles
// went into a public job log: the checks of round 3b, PR-5.)
// WHAT IT ASKS. Only addresses on jpx.co.jp, and only these: its robots.txt; the four pages on domestic stock trading
// whose addresses the log of 20 Nov gave (pf_rules.log l.109-162: the index, tick sizes, daily price limits, trading
// hours); a page one of those links by name, if it is on jpx.co.jp (the document on tick classes, the closing
// auction, the short-selling price restriction), of which nothing but its address, status and title is printed when
// its own title or first heading names a list, figures or a report (jpx_read.ts notRulePage; PL-3 of the final review
// of pull request #50: the title is known only once the page is asked); the ETF list; the two calendar pages. NO
// ADDRESS IS TRIED FROM MEMORY:
// where no JPX page read links the short-selling rule by name (a name that says short selling and a rule, and not
// figures, a list or a report: jpx_read.ts shortRuleLink), the probe says "not found" and stops for that rule
// (the run of 21 Nov tried an address from the engineer's memory, which was JPX's daily list of triggered stocks, not a
// rule page: PR-4). A request that ends on another site is not read.
//   rules (P-2; A's X-5 and V-10; the question's part (i)): the tick-size tables' values and the dates they are in
//     force from; the document on the classes by liquidity that the page links, if any; the daily price limits table;
//     the trading hours and the closing auction's order period (clock times); the short-selling price restriction
//     (a percentage, a number of units), on the page JPX's own pages link;
//   etfList (P-3; C-39 and §2.20): on JPX's list of listed ETFs, the row of 2559 (its index, as listed) and the rows
//     whose index is MSCI Japan itself: code, name and index only;
//   calendar (O-3 of the check of "when a closed market opens"; the question's part (ii)): JPX's market-holiday
//     calendar page, English and Japanese: the holidays it gives for 2026 and 2027, each taken only where the page
//     gives the date with its weekday and the two agree (the English page gives no year in a line: the year is the one
//     in which the date falls on that weekday), set against the Tokyo rows the Monitor holds (migrations 20261107000002
//     and 20261107000010), both ways: a row the page does not give, and a weekday holiday of the page the Monitor has
//     no row for. (The first version looked for the month and the day alone, so 2027-01-01 was "named" by 2026's line:
//     PR-3.) This was section 3 of sessions_check until 21 Nov 2026.
// Requests: at most 11, all to jpx.co.jp, 3 s apart (its robots.txt first): rules 7, etfList 1, calendar 2; its
// robots.txt is asked once more if it answers 429 (so 12 at the very most). With etfList held: at most 10.
// Runtime: deno (the document on tick classes may be a PDF; under node it is only measured).
//   Actions > source-probe > Run workflow: probe = pf_jpx, runtime = deno
import { readFileSync } from "node:fs";
import { bytes, head, liftJpxHold, linksOf, masked, page, pause, pdfPages, requestsMade, robots, tablesOf, textLines, titleOf, type Page, type Robots } from "./lib.ts";
import { calendarCheck, calendarDays, cellOut, figureTables, linkedOnJpx, notRulePage, onJpx, otherTables, sayable, shortOtherLinks, shortRuleLink, valueBits } from "./jpx_read.ts";

/** THE OWNER'S ANSWER, part by part. rules and calendar: "(c) all", 21 Nov 2026, about 18:00 SGT. etfList: not asked yet. */
const OWNER_HAS_RELEASED = { rules: true, etfList: false, calendar: true };

const MAX = 11, GAP = 3000, JPX = "https://www.jpx.co.jp";
const DOMESTIC = `${JPX}/english/equities/trading/domestic`;
const ADDR = {
  index: `${DOMESTIC}/index.html`, hours: `${DOMESTIC}/01.html`, limits: `${DOMESTIC}/06.html`, ticks: `${DOMESTIC}/07.html`,
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
const FROM = "2026-11-01", TO = "2027-01-31";
const window = mine.filter((x) => x.slice(0, 10) >= FROM && x.slice(0, 10) <= TO);

const any = OWNER_HAS_RELEASED.rules || OWNER_HAS_RELEASED.etfList || OWNER_HAS_RELEASED.calendar;
if (!any) {
  head("HELD FOR THE OWNER: nothing is asked of jpx.co.jp");
  console.log("  what this probe would read, once the owner says yes to a part:");
  console.log(`  rules: ${ADDR.index} · ${ADDR.ticks} (and the document on tick classes it links) · ${ADDR.limits} · ${ADDR.hours} (and a page on the closing auction, if the index links one) · the short-selling restriction page, if JPX's pages link it`);
  console.log(`  etfList: ${ADDR.etfs} (the row of 2559; the rows whose index is MSCI Japan)`);
  console.log(`  calendar: ${ADDR.calendar.map(([, u]) => u).join(" · ")} (beside the Monitor's Tokyo rows of 1 Nov 2026 to 31 Jan 2027: ${window.join(" · ") || "none read"})`);
  console.log("  meanwhile: Tokyo's tick sizes are A's assumption, marked (A); its holiday rows stay those read on 7 Nov 2026, and pf_holidays sets them against Japan's national-holiday file; 2559.T is not used (C-39)");
}

let rb: Robots | null = null;
/** One page of jpx.co.jp. An address on another site is not asked, and a request that ends on one is not read. */
const get = async (url: string): Promise<Page | null> => {
  if (!onJpx(url)) { console.log(`  not asked: ${masked(url)} is not on jpx.co.jp`); return null; }
  if (rb && !rb.allows(url)) { console.log(`  not asked: robots.txt holds ${new URL(url).pathname}`); return null; }
  const p = await page(url, { timeoutMs: 45000, only: onJpx });
  await pause(GAP);
  if (p.ok && !onJpx(p.final)) { console.log(`  the request ended on another site (${masked(p.final)}): not read`); return null; }
  if (p.ok) console.log(`  title: ${cut(titleOf(p.html), 120) || "–"}${p.lastModified ? ` · last-modified ${p.lastModified}` : ""}`);
  return p.ok ? p : null;
};
/** THE GUARD: every piece of a page's text that this probe prints goes through here. A piece that reads as a sentence
 *  (more than nine words or ninety characters; in Japanese, one that ends with 。 or runs past 28 characters:
 *  jpx_read.ts sayable) is not printed, only counted. */
let unsaid = 0;
const piece = (s: string): string | null => { if (sayable(s)) return masked(s); unsaid++; return null; };
/** A page's tables of figures, cell by cell (jpx_read.ts figureTables): a table of notices or of text is left out. */
const printTables = (html: string, want: RegExp | null = null, maxRows = 60): void => {
  const ts = figureTables(html, want), other = otherTables(html);
  console.log(`  ${ts.length} table(s) of figures${want ? ` that match ${want}` : ""}${other ? `; ${other} other table(s) on the page (notices, text) left out` : ""}`);
  ts.forEach((t, k) => {
    const h = t.heading ? piece(cut(t.heading, 80)) : null;
    console.log(`  table ${k + 1}${h ? ` · under "${h}"` : ""}: ${t.rows.length} rows${t.held ? `; ${t.held} cell(s) of text not printed` : ""}`);
    t.rows.slice(0, maxRows).forEach((r) => console.log(`    ${r.map((c) => piece(c) ?? "(not printed)").join(" | ")}`));
    if (t.rows.length > maxRows) console.log(`    … ${t.rows.length - maxRows} more rows not printed`);
  });
};
/** The values a page's text gives: the matches of `want`, values only, joined by the one short word between two of
 *  them (jpx_read.ts valueBits). */
const printValues = (lines: string[], want: RegExp, max = 30): void => {
  const bits = valueBits(lines, want, max).map(piece).filter((b): b is string => b !== null);
  for (const b of bits) console.log(`  | ${b}`);
  console.log(bits.length ? `  ${bits.length} value(s), values only` : "  no such value on the page");
};
/** A page taken by its link's name whose own title or first heading names a list, figures or a report (jpx_read.ts
 *  notRulePage): its address, status and title are printed, and nothing else of it. */
const NOT_PRINTED = "  that page's own title or first heading names a list, figures or a report, not a rule: nothing of it is printed";
const CLOCK = /\b\d{1,2}[:：]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}時\d{0,2}分?/i;
/** A date with its year: "March 1, 2027", "Aug. 06, 2026", "2026/04/22", "1 Mar 2027", 2027年3月1日. */
const DATED = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d\d\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+20\d\d\b|\b20\d\d[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b|20\d\d年\s*\d{1,2}月\s*\d{1,2}日/i;

if (any) {
  liftJpxHold({ etfList: OWNER_HAS_RELEASED.etfList });   // the ruled-out files and the list of triggered stocks stay held (lib.ts)
  head("JPX's robots.txt");
  rb = await robots(JPX, ["/english/equities/trading/domestic/", "/english/markets/equities/", "/equities/products/etfs/issues/", "/english/corporate/about-jpx/calendar/", "/corporate/about-jpx/calendar/"]);
  await pause(GAP);
}

if (OWNER_HAS_RELEASED.rules) {
  const CLOSING = /closing auction|order acceptance|pre-closing/i;
  const shortSeen: string[] = [];   // links that name short selling and are not the rule page: their addresses, for a person
  head("rules 1. The pages on domestic stock trading (the index's own links, addresses only)");
  const ix = await get(ADDR.index);
  const links = ix ? linksOf(ix.html, ix.final).filter((l) => onJpx(l.href)) : [];
  const under = links.filter((l) => /\/english\/equities\/trading\//.test(l.href));
  console.log(`  ${under.length} links under /english/equities/trading/: ${under.slice(0, 30).map((l) => l.href.replace(JPX, "")).join(" · ") || "none"}`);
  let short = shortRuleLink(links), closing = linkedOnJpx(links, CLOSING);
  shortSeen.push(...shortOtherLinks(links));

  head("rules 2. Tick sizes: the tables' values, and the dates the page gives (V-10)");
  const tk = await get(ADDR.ticks);
  if (tk) {
    printTables(tk.html);
    printValues(textLines(tk.html), DATED, 12);
    const tkLinks = linksOf(tk.html, tk.final);
    const doc = linkedOnJpx(tkLinks, /implementation arrangements|optimi[sz]ation of tick|tick size.*(class|group|list)/i);
    if (doc) {
      console.log(`  a document on the classes is linked: ${masked(doc.href)}`);
      if (rb && !rb.allows(doc.href)) console.log("  not asked: robots.txt holds its path");
      else if (/\.pdf(\?|$)/i.test(doc.href)) {
        const b = await bytes(doc.href, { timeoutMs: 90000, only: onJpx });
        await pause(GAP);
        const pages = b.data && onJpx(b.final) ? await pdfPages(b.data) : null;
        if (pages) {
          console.log(`  ${pages.length} pages`);
          // a class or a threshold with its figure: the key word, at most two words, the figure
          printValues(pages, /(?:STR|Spread-to-Tick(?: Ratio)?|class(?:es)?|groups?|categor(?:y|ies))\s+(?:\S+\s+){0,2}?\d[\d.,%]*/i, 12);
        }
      } else { const d = await get(doc.href); if (d && notRulePage(d.html)) console.log(NOT_PRINTED); else if (d) printTables(d.html); }
    } else console.log("  no document on the classes is linked by that name on jpx.co.jp");
    short = short ?? shortRuleLink(tkLinks);
    shortSeen.push(...shortOtherLinks(tkLinks));
  }

  head("rules 3. Daily price limits: the table's values");
  const lm = await get(ADDR.limits);
  if (lm) printTables(lm.html);

  head("rules 4. Trading hours, and the closing auction's order period (X-5): the clock times");
  const hr = await get(ADDR.hours);
  if (hr) { printTables(hr.html); printValues(textLines(hr.html), CLOCK, 30); const hl = linksOf(hr.html, hr.final); closing = closing ?? linkedOnJpx(hl, CLOSING); short = short ?? shortRuleLink(hl); shortSeen.push(...shortOtherLinks(hl)); }
  if (closing) { console.log(`  a page on the closing auction is linked: ${masked(closing.href)}`); const c = await get(closing.href); if (c && notRulePage(c.html)) console.log(NOT_PRINTED); else if (c) { printTables(c.html); printValues(textLines(c.html), CLOCK, 30); } }
  else console.log("  no page on the closing auction is linked from the index or the hours page");

  head("rules 5. The short-selling price restriction: a percentage, a number of units");
  const SS = /\d+(?:\.\d+)?\s*(?:%|％|percent)|\d+\s*(?:trading )?units|\d+\s*単元/i;
  if (short) {
    console.log(`  linked from JPX's own pages: ${masked(short.href)}`);
    const p = await get(short.href);
    // the page taken by its link's name is read only if its own title and first heading say it is not a list of
    // figures or names (PX-6: JPX's section name for the list of triggered stocks passes the link's test)
    if (p && notRulePage(p.html)) console.log(`${NOT_PRINTED}; a person gives the address of the rule page`);
    else if (p) { printValues(textLines(p.html), SS, 20); printTables(p.html, /short|空売り|%|％/i, 20); }
  }
  else console.log("  NOT FOUND: no page read (the index, tick sizes, trading hours) links a page on jpx.co.jp whose name says short selling and a rule (regulation, restriction, rule, price). No address is tried from memory: a person gives the address of JPX's rule page, and it is read in a later run");
  const others = [...new Set(shortSeen)].filter((h) => h !== short?.href);
  if (others.length) console.log(`  links that name short selling and were not read (figures, lists or reports by their names; addresses only): ${others.slice(0, 8).map((h) => masked(h)).join(" · ")}`);
}

if (OWNER_HAS_RELEASED.etfList) {
  head("etfList. JPX's list of listed ETFs: the row of 2559, and the rows whose index is MSCI Japan");
  const p = await get(ADDR.etfs);
  if (p) {
    const rows = tablesOf(p.html).flatMap((t) => t.rows);
    const header = rows.find((r) => r.some((c) => /コード|Code/i.test(c)) && r.length >= 3);
    console.log(`  ${rows.length} table rows on the page; the header row: ${header ? header.map((c) => piece(cut(c, 24)) ?? "(not printed)").join(" | ") : "not found"}`);
    const r2559 = rows.filter((r) => r.some((c) => /^2559$/.test(c.trim())));
    for (const r of r2559) console.log(`  2559: ${r.map((c) => piece(cellOut(c)) ?? "(not printed)").join(" | ")}`);
    if (!r2559.length) console.log("  no row carries the code 2559");
    const msci = rows.filter((r) => r.some((c) => /MSCI.{0,8}(Japan|ジャパン)|ＭＳＣＩ.{0,8}(ジャパン|日本)/i.test(c)) && !r.some((c) => /^2559$/.test(c.trim())));
    console.log(`  rows that name MSCI Japan: ${msci.length}`);
    for (const r of msci.slice(0, 12)) console.log(`    ${r.filter((c) => /^\d{4}$|^\d{3}[A-Z]$|MSCI|ＭＳＣＩ/i.test(c.trim()) || (c.length > 6 && c.length < 70 && !/\d{4}\/|http/.test(c))).slice(0, 4).map((c) => piece(cellOut(c)) ?? "(not printed)").join(" | ")}`);
  }
}

if (OWNER_HAS_RELEASED.calendar) {
  head("calendar. JPX's market-holiday calendar page beside the Tokyo rows the Monitor holds (O-3)");
  const mineDays = mine.map((x) => x.slice(0, 10));
  console.log(`  the Monitor holds ${mine.length} Tokyo rows (2026 and 2027); those from 1 Nov 2026 to 31 Jan 2027: ${window.join(" · ")}`);
  for (const [what, url] of ADDR.calendar) {
    console.log(`  -- the ${what} page`);
    const p = await get(url);
    if (!p) continue;
    // the holidays the page gives, as dates: each only where the page gives it with its weekday and the two agree
    const cal = calendarDays(textLines(p.html)), all = calendarCheck(cal.days, mineDays, "2026-01-01", "2027-12-31"), win = calendarCheck(cal.days, mineDays, FROM, TO);
    console.log(`  the page gives ${cal.days.length} holidays of 2026 and 2027 with a weekday that fits its date${cal.odd ? `; ${cal.odd} dated piece(s) whose weekday fits no year of the two: not counted` : ""}`);
    console.log(`  from 1 Nov 2026 to 31 Jan 2027 the page gives: ${cal.days.filter((d) => d >= FROM && d <= TO).join(" · ") || "none"}`);
    for (const row of window) console.log(`  ${row}: ${win.named.includes(row.slice(0, 10)) ? "the page gives this day, year, month and day" : "THE PAGE DOES NOT GIVE THIS DAY (in the forms read: a date with its weekday)"}`);
    console.log(`  in that window, weekday holidays of the page the Monitor has no row for: ${win.lacking.join(" · ") || "none"}`);
    console.log(`  over both years: of the Monitor's ${mineDays.length} rows the page gives ${all.named.length}; not given: ${all.notNamed.join(" · ") || "none"}; weekday holidays of the page without a row: ${all.lacking.join(" · ") || "none"}`);
  }
}

console.log(`\n${unsaid ? `${unsaid} piece(s) of a page that read as a sentence were not printed. ` : ""}requests made: ${requestsMade()} (at most ${MAX}${any ? "" : "; held for the owner: none"}); ${Math.round((Date.now() - t0) / 1000)} s`);
