// The paper portfolio's probe of settlement holidays for the currencies other than the dollar (P-0b: C/portfolio-plan.md
// §3.1b item 8; B's V-18, before P-8a builds value dates). The Fed's K.8 is read for USD (C/probes/pf_rules.log l.38–54).
// Here, from official pages only, for each: the status, the format, the years covered and the dates of 2026 and 2027:
//   EUR  the ECB's long-term calendar of TARGET closing days (its press release of 14 Dec 2000), then its page on
//        working hours;
//   GBP  the UK government's bank-holiday list (gov.uk's JSON: England and Wales, Scotland, Northern Ireland);
//   JPY  Japan's Cabinet Office file of national holidays (syukujitsu.csv);
//   AUD  the Reserve Bank of Australia's bank-holiday pages for 2026 and 2027;
//   CAD  the Bank of Canada's holiday schedule;
//   CHF  the Swiss National Bank, and NZD the Reserve Bank of New Zealand: no address known here, so each bank's own
//        home page is read for a link that names holidays, and that link followed;
//   SEK  the Riksbank's open API of calendar days (Swedish bank days); NOK Norges Bank, from its home page's links.
//        (B named the first seven; SEK and NOK complete the G10 and are the engineer's candidates.)
// Every address is a candidate where no log shows it: a refusal or a 404 is the finding. Each site's robots.txt is
// read before its page or file; none of these needs a key or a login. They are governments' and central banks' own
// pages and files: their terms are not read here (the probes that read a site's terms are pf_bench and pf_borrow, for
// publishers' files, and pf_yahoo_hist, for the record).
//
// Then, with the Cabinet Office's file: whether 23 Nov 2026, and each Tokyo holiday row the Monitor holds from 1 Nov
// 2026 to 31 Jan 2027 (migrations 20261107000002 and 20261107000010), is a national holiday in that file; and the
// file's holidays of those months that fall on a weekday and are not among the Monitor's rows.
// AN EXCHANGE'S OWN CLOSING DAYS ARE NOT IN A NATIONAL-HOLIDAY FILE: Tokyo's market is also shut from 31 December to
// 3 January, of which only 1 January is a national holiday. So a row for 31 Dec not found in the file is no fault of
// the row; JPX's own calendar page is the source for those days: pf_jpx reads it (released by the owner on 21 Nov 2026).
// Likewise a bank holiday is not always a settlement holiday of a payment system: P-8a says which list it takes.
// Requests: at most 27, 1.5 s apart, to nine sites (a robots.txt each, then one to four pages or one file); a
// robots.txt that answers 429 is asked once more after the wait it names (60 s at most), so 36 at the very most.
// Runtime: node (the file is Shift_JIS; node:fs reads the two migrations from the checkout).
//   Actions > source-probe > Run workflow: probe = pf_holidays, runtime = node
import { readFileSync } from "node:fs";
import { bytes, gapFor, head, linksOf, look, masked, page, type Page, pause, requestsMade, robots, siteOf, textLines, titleOf } from "./lib.ts";

const MAX = 27, GAP = 1500;
const t0 = Date.now();
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC`);
const MONTHS = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
const DATED = new RegExp(`\\b${MONTHS}\\.?\\s+\\d{1,2}\\b|\\b\\d{1,2}(st|nd|rd|th)?\\s+${MONTHS}\\b|\\b20\\d\\d[-/.]\\d{1,2}[-/.]\\d{1,2}\\b|\\b\\d{1,2}[-/.]\\d{1,2}[-/.]20\\d\\d\\b`, "i");
const HOLIDAY = /holiday|closing day|closed|new year|easter|good friday|christmas|boxing|labour|labor|national day|king|queen|anzac|waitangi|matariki|canada day|thanksgiving|ascension|whit|midsummer|constitution|1 may|26 december|25 december/i;
const yearsIn = (ls: string[]) => [...new Set(ls.flatMap((l) => l.match(/\b20(2[4-9]|3[0-5])\b/g) ?? []))].sort();

/** Prints what a page gives on holidays: its title and date, the years its dated lines name, and those lines for 2026
 *  and 2027 (each once, cut at 320 characters, 45 at most). Returns how many lines it found. */
function holidayLines(p: Page): number {
  const ls = textLines(p.html), hits = [...new Set(ls.filter((l) => l.length < 400 && (DATED.test(l) && (HOLIDAY.test(l) || /\b20(26|27)\b/.test(l)) || (HOLIDAY.test(l) && /saturdays? and sundays?|until further notice|every year/i.test(l)))))];
  console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text${ls.length < 15 ? " (few: the page may be built by scripts)" : ""}; format: an HTML page; years named in its dated lines: ${yearsIn(hits).join(", ") || "none"}`);
  const show = hits.filter((l) => !/\b20(2[0-5]|2[89]|3\d)\b/.test(l) || /\b20(26|27)\b/.test(l));
  for (const l of show.slice(0, 45)) console.log(`  | ${masked(l.slice(0, 320))}${l.length > 320 ? " …" : ""}`);
  if (show.length > 45) console.log(`  … ${show.length - 45} more dated lines not printed`);
  if (!hits.length) console.log("  no line carries a date beside a holiday's name");
  return hits.length;
}
/** One currency's source: robots.txt, then the candidate pages in turn until one gives dated holiday lines (every
 *  one of them with `readAll`: a page a year), then (if none did) the home page's links that name holidays, the first
 *  of them followed. At most `tries.length + 3` requests. */
async function source(what: string, origin: string, tries: string[], home: string | null, readAll = false): Promise<void> {
  head(what);
  const rb = await robots(origin, [...tries, ...(home ? [home] : [])]);
  await pause(gapFor(rb, GAP));
  let found = 0;
  for (const path of tries) {
    if (found && !readAll) break;
    if (!rb.allows(path)) { console.log(`  not asked: robots.txt holds ${path}`); continue; }
    const p = await page(origin + path, { timeoutMs: 45000 });
    await pause(gapFor(rb, GAP));
    if (p.ok) found += holidayLines(p);
  }
  if (found || !home) return;
  if (!rb.allows(home)) { console.log(`  not asked: robots.txt holds ${home}`); return; }
  const h = await page(origin + home, { timeoutMs: 45000 });
  await pause(gapFor(rb, GAP));
  if (!h.ok) return;
  const ls = linksOf(h.html, h.final).filter((l) => /holiday|closing day|business day|operating day|opening hours|feiertag|bankfeiertag/i.test(`${l.text} ${l.href}`) && l.text.length < 90);
  console.log(`  ${titleOf(h.html) || "the home page"}: links that name holidays: ${ls.slice(0, 8).map((l) => `${l.text.slice(0, 50) || "(no text)"} -> ${masked(l.href)}`).join(" · ") || "none (the page may be built by scripts, or the list is deeper in the site)"}`);
  const next = ls.find((l) => siteOf(l.href) === siteOf(origin) && new URL(l.href).origin === origin && rb.allows(l.href));
  if (!next) return;
  const p = await page(next.href, { timeoutMs: 45000 });
  await pause(gapFor(rb, GAP));
  if (p.ok) holidayLines(p);
}

// ---- EUR ----
await source("EUR · the ECB: TARGET closing days (the long-term calendar of 14 Dec 2000; then its working-hours page)", "https://www.ecb.europa.eu", ["/press/pr/date/2000/html/pr001214_4.en.html", "/ecb/contacts/working-hours/html/index.en.html"], null);

// ---- GBP ----
head("GBP · the UK government's bank-holiday list (gov.uk, JSON)");
{
  const rb = await robots("https://www.gov.uk", ["/bank-holidays.json"]);
  await pause(GAP);
  if (!rb.allows("/bank-holidays.json")) console.log("  not asked: robots.txt holds /bank-holidays.json");
  else {
    const r = await look("https://www.gov.uk/bank-holidays.json", { headers: { accept: "application/json" }, show: 0 });
    await pause(GAP);
    let j: Record<string, { division?: string; events?: Array<{ title?: string; date?: string; notes?: string }> }> | null = null;
    try { j = JSON.parse(r.text); } catch { /* below */ }
    if (!r.ok || !j) console.log("  no JSON read");
    else for (const [k, v] of Object.entries(j)) {
      const ev = (v.events ?? []).filter((e) => typeof e.date === "string"), ds = ev.map((e) => e.date as string).sort();
      console.log(`  ${k}: ${ev.length} events, ${ds[0] ?? "–"} to ${ds[ds.length - 1] ?? "–"}; format: JSON (title, date, notes); years: ${[...new Set(ds.map((d) => d.slice(0, 4)))].join(", ")}`);
      console.log(`    2026: ${ev.filter((e) => e.date!.startsWith("2026")).map((e) => `${e.date} ${e.title}${e.notes ? ` (${e.notes})` : ""}`).join("; ") || "none"}`);
      console.log(`    2027: ${ev.filter((e) => e.date!.startsWith("2027")).map((e) => `${e.date} ${e.title}${e.notes ? ` (${e.notes})` : ""}`).join("; ") || "none"}`);
    }
  }
}

// ---- JPY ----
head("JPY · Japan's Cabinet Office: the file of national holidays (syukujitsu.csv, Shift_JIS)");
const national = new Map<string, string>();   // ISO date -> the holiday's name as the file gives it
let caoRead = false;
{
  const rb = await robots("https://www8.cao.go.jp", ["/chosei/shukujitsu/syukujitsu.csv"]);
  await pause(GAP);
  if (!rb.allows("/chosei/shukujitsu/syukujitsu.csv")) console.log("  not asked: robots.txt holds the file's path");
  else {
    const b = await bytes("https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv");
    await pause(GAP);
    if (b.data) {
      let text: string, decodedAs = "Shift_JIS";
      try { text = new TextDecoder("shift_jis").decode(b.data); } catch { text = new TextDecoder("latin1").decode(b.data); decodedAs = "bytes (this runtime has no Shift_JIS decoder: the dates are read, the names are not)"; }
      const ls = text.split(/\r?\n/).filter((l) => l.trim());
      for (const l of ls) { const m = l.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.*)$/); if (m) national.set(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, decodedAs === "Shift_JIS" ? m[4].trim() : "(name not decoded)"); }
      const ds = [...national.keys()].sort();
      caoRead = ds.length > 0;
      console.log(`  ${ls.length} lines, read as ${decodedAs}; header: ${decodedAs === "Shift_JIS" ? ls[0] : "(not decoded)"}; ${ds.length} dated rows, ${ds[0] ?? "–"} to ${ds[ds.length - 1] ?? "–"}; format: CSV (date as Y/M/D, name); rows in 2026: ${ds.filter((d) => d.startsWith("2026")).length}, in 2027: ${ds.filter((d) => d.startsWith("2027")).length}, in 2028: ${ds.filter((d) => d.startsWith("2028")).length}`);
      for (const y of ["2026", "2027"]) console.log(`    ${y}: ${ds.filter((d) => d.startsWith(y)).map((d) => `${d} ${national.get(d)}`).join("; ") || "none"}`);
    }
  }
}

// ---- AUD, CAD, CHF, NZD ----
await source("AUD · the Reserve Bank of Australia: bank holidays, its pages for 2026 and 2027", "https://www.rba.gov.au", ["/schedules-events/bank-holidays/bank-holidays-2026.html", "/schedules-events/bank-holidays/bank-holidays-2027.html"], "/schedules-events/bank-holidays/", true);
await source("CAD · the Bank of Canada: its holiday schedule", "https://www.bankofcanada.ca", ["/about/contact-information/bank-of-canada-holiday-schedule/"], "/");
await source("CHF · the Swiss National Bank: its home page's links that name holidays", "https://www.snb.ch", [], "/en/");
await source("NZD · the Reserve Bank of New Zealand: its home page's links that name holidays", "https://www.rbnz.govt.nz", [], "/");

// ---- SEK, NOK ----
head("SEK · the Riksbank's open API: calendar days and Swedish bank days, 1 Nov 2026 to 31 Dec 2027 (a candidate address)");
{
  const rb = await robots("https://api.riksbank.se", ["/swea/v1/CalendarDays/"]);
  await pause(GAP);
  if (!rb.allows("/swea/v1/CalendarDays/2026-11-01/2027-12-31")) console.log("  not asked: robots.txt holds the path");
  else {
    const r = await look("https://api.riksbank.se/swea/v1/CalendarDays/2026-11-01/2027-12-31", { headers: { accept: "application/json" }, show: 0 });
    await pause(GAP);
    let j: unknown = null;
    try { j = JSON.parse(r.text); } catch { /* below */ }
    const rows = Array.isArray(j) ? (j as Array<Record<string, unknown>>) : [];
    if (!r.ok || !rows.length) console.log(`  no rows read${r.text ? `: ${JSON.stringify(r.text.slice(0, 200))}` : ""}`);
    else {
      const day = (x: Record<string, unknown>) => String(x.calendarDate ?? "").slice(0, 10), wd = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
      const closed = rows.filter((x) => x.swedishBankday === false && wd(day(x)) !== 0 && wd(day(x)) !== 6).map(day);
      console.log(`  ${rows.length} days, ${day(rows[0])} to ${day(rows[rows.length - 1])}; format: JSON; fields: ${Object.keys(rows[0]).join(", ")}; weekdays that are not Swedish bank days: ${closed.join(", ") || "none"}`);
    }
  }
}
await source("NOK · Norges Bank: its home page's links that name holidays", "https://www.norges-bank.no", [], "/en/");

// ---- Tokyo's rows beside the national-holiday file ----
head("Japan's national holidays beside the Tokyo rows the Monitor holds (1 Nov 2026 to 31 Jan 2027)");
{
  const mine = new Map<string, string>();
  for (const fn of ["20261107000002_seed.sql", "20261107000010_holidays_verified.sql"]) {
    try { for (const m of readFileSync(new URL(`../../supabase/migrations/${fn}`, import.meta.url), "utf8").matchAll(/\('TSE',\s*'(\d{4}-\d{2}-\d{2})',\s*'((?:[^']|'')*)'/g)) mine.set(m[1], m[2].replace(/''/g, "'")); }
    catch (e) { console.log(`  ${fn} not read: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`); }
  }
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], wd = (d: string) => WD[new Date(d + "T12:00:00Z").getUTCDay()];
  const inWin = (d: string) => d >= "2026-11-01" && d < "2027-02-01";
  const rows = [...mine.keys()].filter(inWin).sort();
  console.log(`  the Monitor holds ${mine.size} Tokyo rows (2026 and 2027); in the window: ${rows.map((d) => `${d} ${mine.get(d)}`).join(" · ") || "none read"}`);
  if (!caoRead) console.log("  the Cabinet Office's file was not read: nothing to set them against");
  else {
    const own = (d: string) => /-(12-31|01-02|01-03)$/.test(d);
    console.log(`  2026-11-23 (${wd("2026-11-23")}): ${national.has("2026-11-23") ? `a national holiday in the file: ${national.get("2026-11-23")}` : "NOT in the file"}; the Monitor ${mine.has("2026-11-23") ? `holds it for Tokyo ("${mine.get("2026-11-23")}")` : "holds NO Tokyo row for it"}`);
    for (const d of rows) console.log(`  ${d} (${wd(d)}) "${mine.get(d)}": ${national.has(d) ? `a national holiday in the file: ${national.get(d)}` : own(d) ? "not in the file, as expected: an exchange's own closing day (31 Dec to 3 Jan), which a national-holiday file does not hold" : "NOT a national holiday in the file, and not one of the exchange's own closing days: to be checked against JPX's calendar"}`);
    const missing = [...national.keys()].filter((d) => inWin(d) && !mine.has(d) && !["Sat", "Sun"].includes(wd(d))).sort();
    console.log(`  national holidays of the window on a weekday that are NOT among the Monitor's Tokyo rows: ${missing.map((d) => `${d} (${wd(d)}) ${national.get(d)}`).join("; ") || "none"}`);
    const weekend = [...national.keys()].filter((d) => inWin(d) && ["Sat", "Sun"].includes(wd(d))).sort();
    console.log(`  national holidays of the window on a Saturday or Sunday (no row needed): ${weekend.map((d) => `${d} (${wd(d)}) ${national.get(d)}`).join("; ") || "none"}`);
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
