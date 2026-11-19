// Facts for an owner decision, OD-3 (A-05: a Tokyo name's own disclosures, 適時開示, within minutes; A-06 release
// times; A-14; A-20): TDnet, run by JPX, publishes each day's disclosures as public HTML lists with a PDF for each.
// There is no official free API known to me, so reading these lists would be scraping an official source; whether
// automated reading is allowed is for the owner to check in TDnet's terms. This reads only what a person's browser
// would: the robots.txt, today's first list page and its format (time, code, company, title, PDF), and the main
// page, the last two only where robots.txt allows them. Nothing is built on it until the owner decides.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = tdnet_list, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const BASE = "https://www.release.tdnet.info/inbs";
const jst = (offsetDays: number) => { const d = new Date(Date.now() + 9 * 3600e3 - offsetDays * 86400e3); return d.toISOString().slice(0, 10).replace(/-/g, ""); };

/** The Disallow rules that apply to every user agent ("User-agent: *"), read group by group. */
function disallowedForAll(txt: string): string[] {
  const out: string[] = [];
  let agents: string[] = [], inRules = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), i = line.indexOf(":");
    if (!line || i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (key === "user-agent") { if (inRules) { agents = []; inRules = false; } agents.push(v); }
    else { inRules = true; if (key === "disallow" && v && agents.includes("*")) out.push(v); }
  }
  return out;
}

head("TDnet: robots.txt");
const robots = await look("https://www.release.tdnet.info/robots.txt", { show: 600 });
// The list pages are read only where robots.txt allows them: no robots.txt (404/410) allows everything; one that
// could not be read is taken as a refusal.
const rules = robots.ok ? disallowedForAll(robots.text) : robots.status === 404 || robots.status === 410 ? [] : null;
const mayRead = (path: string) => rules != null && !rules.some((r) => path.startsWith(r));
console.log(`  rules for every user agent: ${rules == null ? "robots.txt could not be read, so no list page is read" : rules.length ? rules.join(" | ") : "none"}`);

for (const back of [0, 1, 3]) {
  if (!mayRead(`/inbs/I_list_001_${jst(back)}.html`)) { console.log(`  /inbs/ list pages: not read (robots.txt)`); break; }
  await pause(800);
  const day = jst(back);
  head(`TDnet: the first list page for ${day} (JST)`);
  const r = await look(`${BASE}/I_list_001_${day}.html`, { show: 0 });
  if (!r.ok) continue;
  const rows = [...r.text.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]).filter((tr) => /\.pdf/i.test(tr));
  const pdfs = rows.map((tr) => tr.match(/href="([^"]+\.pdf)"/i)?.[1] ?? "");
  const pages = new Set([...r.text.matchAll(/I_list_(\d{3})_\d{8}\.html/g)].map((m) => m[1]));
  console.log(`  ${rows.length} rows with a PDF on this page; ${pages.size} list pages referenced; first 5 rows:`);
  for (const [i, tr] of rows.slice(0, 5).entries()) console.log(`  ${strip(tr).slice(0, 160)} | ${pdfs[i]}`);
  if (rows.length) break;
}
await pause(800);
head("TDnet: the main page");
if (mayRead("/inbs/I_main_00.html")) await look(`${BASE}/I_main_00.html`, { show: 300 });
else console.log("  not read (robots.txt)");
