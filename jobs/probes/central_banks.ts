// B-01 and B-03 (rate decisions): the central banks' own published sources.
//   1. Meeting calendars, from each bank's own page. The Monitor would keep the dates in a table entered by hand,
//      each row with the page it came from, and a weekly job would read these pages again and report any date
//      that differs. This prints what each page gives: its status and the dates found in it.
//   2. Decision announcements, from the banks' own press-release feeds: a job at the announcement time would read
//      the feed for the statement's address. This prints the newest items of each feed.
//   3. Whether the rate can be read from the Fed's own statement: the newest FOMC statement's wording.
// Some addresses below are candidates (marked so): a 404 is a finding, not a failure of the probe.
// Runtime: node (a job on GitHub, started by the database at the meeting's time).
//   Actions > source-probe > Run workflow: probe = central_banks, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const year = new Date().getUTCFullYear();
const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "-").replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d))).replace(/\s+/g, " ").trim();
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?";

/** The dates a page mentions, with a little text around each: enough to see the page's format and its dates. */
function datesIn(text: string, max = 24): string[] {
  const re = new RegExp(`(?:\\b\\d{1,2}(?:\\s*[-–/]\\s*\\d{1,2})?\\s+${MONTH}(?:\\s+\\d{4})?|${MONTH}\\s+\\d{1,2}(?:\\s*[-–,]\\s*\\d{1,2})?(?:\\s*\\([A-Za-z.]+\\))?(?:,?\\s+\\d{4})?|\\b\\d{2}/\\d{2}/\\d{4})`, "g");
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    out.push(`…${text.slice(Math.max(0, at - 40), at + m[0].length + 40)}…`);
    if (out.length >= max) break;
  }
  return out;
}

// ---- 1. meeting calendars ----
head("Federal Reserve: FOMC meeting calendar (federalreserve.gov)");
{
  const r = await look("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", { show: 0 });
  if (r.ok) {
    const parts = r.text.split(/(\d{4}) FOMC Meetings/);
    let shown = 0;
    for (let i = 1; i < parts.length; i += 2) {
      const y = Number(parts[i]);
      if (y < year) continue;
      const ms = [...parts[i + 1].matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g)].map((m) => `${m[1].trim()} ${m[2].trim()}`);
      console.log(`  ${y}: ${ms.length} meetings: ${ms.join("; ")}`);
      shown++;
    }
    if (!shown) for (const s of datesIn(strip(r.text))) console.log(`  ${s}`);
  }
}
await pause(500);
head("ECB: meetings of the Governing Council (ecb.europa.eu)");
{
  const r = await look("https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", { show: 0 });
  if (r.ok) {
    const t = strip(r.text);
    const mp = [...t.matchAll(/(\d{2}\/\d{2}\/\d{4})\s*([^/]{0,160}?monetary policy meeting[^/]{0,60})/gi)].filter((m) => Number(m[1].slice(6)) >= year).map((m) => `${m[1]} ${m[2].trim()}`);
    console.log(`  ${mp.length} monetary policy meeting lines from ${year} on:`);
    for (const s of mp.slice(0, 24)) console.log(`  ${s}`);
    if (!mp.length) for (const s of datesIn(t)) console.log(`  ${s}`);
  }
}
await pause(500);
for (const [bank, url, note] of [
  ["Bank of Japan: Monetary Policy Meetings schedule", "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm", ""],
  ["Bank of England: upcoming MPC dates", "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", ""],
  ["Reserve Bank of Australia: board meeting schedule", "https://www.rba.gov.au/schedules-events/board-meeting-schedules.html", " (candidate address)"],
  ["Bank of Canada: key interest rate announcements", "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/", " (candidate address)"],
] as Array<[string, string, string]>) {
  head(`${bank}${note}`);
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const t = strip(r.text);
    const ds = datesIn(t).filter((s) => s.includes(String(year)) || s.includes(String(year + 1)) || !/\b20\d{2}\b/.test(s));
    console.log(`  ${ds.length} date mentions (shown with 40 characters around each):`);
    for (const s of ds) console.log(`  ${s}`);
  }
  await pause(500);
}

// ---- 2. press-release feeds ----
function items(xml: string): Array<{ title: string; link: string; date: string }> {
  const out: Array<{ title: string; link: string; date: string }> = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const it = m[0];
    const pick = (re: RegExp) => (it.match(re)?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    const link = pick(/<link[^>]*>([\s\S]*?)<\/link>/i) || (it.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    out.push({ title: strip(pick(/<title[^>]*>([\s\S]*?)<\/title>/i)), link, date: pick(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || pick(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || pick(/<updated[^>]*>([\s\S]*?)<\/updated>/i) });
  }
  return out;
}
const feeds: Record<string, Array<{ title: string; link: string; date: string }>> = {};
for (const [bank, url, note] of [
  ["Federal Reserve: monetary policy press releases (RSS)", "https://www.federalreserve.gov/feeds/press_monetary.xml", ""],
  ["ECB: press releases (RSS)", "https://www.ecb.europa.eu/rss/press.html", ""],
  ["Bank of England: news (RSS)", "https://www.bankofengland.co.uk/rss/news", " (candidate address)"],
  ["Bank of Japan: what's new (RSS)", "https://www.boj.or.jp/en/rss/whatsnew.xml", " (candidate address)"],
] as Array<[string, string, string]>) {
  head(`${bank}${note}`);
  const r = await look(url, { headers: { accept: "application/rss+xml, application/xml, text/xml, */*" }, show: 0 });
  if (r.ok) {
    const xs = items(r.text);
    feeds[bank] = xs;
    console.log(`  ${xs.length} items; newest 6:`);
    for (const x of xs.slice(0, 6)) console.log(`  ${x.date} | ${x.title} | ${x.link}`);
  }
  await pause(500);
}

// ---- 3. the rate as the Fed's own statement words it ----
head("Federal Reserve: the newest FOMC statement, read for the target range and the vote");
{
  const fed = Object.entries(feeds).find(([k]) => k.startsWith("Federal Reserve"))?.[1] ?? [];
  const st = fed.find((x) => /FOMC statement/i.test(x.title));
  if (!st) console.log("  no FOMC statement among the feed's items");
  else {
    const link = st.link.startsWith("http") ? st.link : `https://www.federalreserve.gov${st.link}`;
    const r = await look(link, { show: 0 });
    if (r.ok) {
      const t = strip(r.text);
      const range = t.match(/target range for the federal funds rate (?:at|to) ([^.]{3,60}?) percent/i);
      const voteFor = t.match(/Voting for the monetary policy action were ([^.]+)\./i);
      const voteAgainst = t.match(/Voting against (?:the|this) action[^.]*\./i);
      console.log(`  statement of ${st.date}: ${link}`);
      console.log(`  target range as worded: ${range ? `"${range[1]} percent"` : "not found with the expected wording"}`);
      console.log(`  voting for: ${voteFor ? voteFor[1].slice(0, 300) : "not found"}`);
      console.log(`  voting against: ${voteAgainst ? voteAgainst[0].slice(0, 300) : "none found (unanimous, or other wording)"}`);
    }
  }
}
