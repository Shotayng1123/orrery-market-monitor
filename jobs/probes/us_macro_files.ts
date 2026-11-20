// B-10 and B-02 United States (both must): official US files that need no key, for what the 19 Nov probes left open.
//   - IORB: on 19 Nov the Board's reserve-balances page answered but "no rate figure found in the page's text"
//     (us_liquidity). The Board has a Policy Rates (PRATES) release with its own feeds page (federalreserve.gov/feeds/
//     prates.html, seen in search results) and data package; its feeds/prates.xml is, by a search extract, an
//     announcements feed. This reads the feeds page's XML links and the first data feed among them.
//   - H.4.1 after the Data Download Program (DDP): the Board's pages, read through search extracts on 20 Nov 2026: "As
//     announced on July 16, today the Build Your Package function in the Data Download Program has been retired" (H.15,
//     12 Nov 2026); "the preformatted data package feature in the Data Download Program (DDP) will be retired on March
//     31, 2027, in preparation for the July 1, 2027, DDP page removal" (H.8); "The XML format is still available on
//     Board statistical release pages". The H.4.1 zip read on 19 Nov is such a package. This reads the H.4.1 release
//     page's data links and the text edition of the current release (h41.txt, an address seen in search results).
//   - G.17 industrial production: the download page's text files ("refreshed monthly with each G.17 release"; the
//     page is releases/g17/download.htm in older copies and releases/g17/Revisions/Current/ipdisk/download.htm in a
//     search result, so both are candidates, the second asked only if the first gives no text file), and one of them
//     (first lines, newest line).
//   - Philadelphia Fed Manufacturing Business Outlook Survey: its historical-data page offers a file with "all
//     seasonally adjusted diffusion indexes" and a full history; "Data begin in May 1968" (search extract of
//     philadelphiafed.org/surveys-and-data/mbos-historical-data). ISM and S&P Global PMIs are proprietary.
//   - Census Bureau, Advance Monthly Retail Trade (MARTS): the Census Data API now needs a key for every data query
//     ("an API key must be used with all queries made to the Census Data API", census.gov API user guide; from 12 May
//     2026, by the Bureau's e-mail as a third party reposted it), so this reads the Bureau's Time Series page for
//     MARTS instead, which marks Excel files (census.gov/econ/currentdata/?programCode=MARTS), and the first file it
//     links.
// Serves: B-10 (SOFR − IORB and EFFR − IORB; the Fed's balance sheet after the DDP: I-16), B-02 United States
// (industrial production y/y, retail sales y/y, "one business survey where a free one exists": I-21), B-25.
// No key, no secret, nothing written; ten requests, eleven at most, 0.6 s apart. Excel files are opened only under
// Deno (the npm package the server uses); under Node their status, type and size are printed.
// Runtime: deno (a job on GitHub, started by the database after each release).
//   Actions > source-probe > Run workflow: probe = us_macro_files, runtime = deno
import { head, look, masked, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Every link on a page with its text, made absolute. */
const anchors = (html: string, base: string): Array<[string, string]> => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m): [string, string] => { try { return [new URL(m[1].replace(/&amp;/g, "&"), base).toString(), strip(m[2])]; } catch { return ["", ""]; } })
  .filter(([u]) => u !== "");
const lines = (t: string) => t.split(/\r?\n/).filter((l) => l.trim() !== "");
const tag = (xml: string, name: string): string => strip(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
const GAP = 600;

/** Fetches a file as bytes and prints one line like look()'s. */
async function getBytes(url: string, timeoutMs = 60000): Promise<Uint8Array | null> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    const b = new Uint8Array(await r.arrayBuffer());
    const lm = r.headers.get("last-modified");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${r.headers.get("content-type") ?? "no type"}  ${b.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${lm ? `\n  headers: last-modified=${lm}` : ""}`);
    return r.ok ? b : null;
  } catch (e) {
    console.log(`FAILED  ${Date.now() - t0} ms  ${masked(url)}\n  ${masked(e instanceof Error ? e.message : String(e))}`);
    return null;
  }
}
type Book = { SheetNames: string[]; Sheets: Record<string, unknown> };
type XlsxMod = { read(d: Uint8Array, o: { type: "array" }): Book; utils: { sheet_to_json(ws: unknown, o: { header: 1; raw: boolean; defval: string }): unknown[][] } };
const cell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const rowText = (r: unknown[]) => { const cs = r.map(cell); return (cs.length > 10 ? [...cs.slice(0, 6), "…", ...cs.slice(-3)] : cs).join(" | ").slice(0, 220); };
/** Opens a workbook (Deno only) and prints its sheets, the first rows and the last rows of its first sheet. */
async function showBook(b: Uint8Array, first = 4, last = 2): Promise<void> {
  let X: XlsxMod;
  try {
    // @ts-ignore: a Deno npm: specifier, the package the server uses; under Node the import fails and is reported
    X = (await import("npm:xlsx@0.18.5")) as unknown as XlsxMod;
  } catch (e) { console.log(`  (workbook not opened under this runtime: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)})`); return; }
  try {
    const wb = X.read(b, { type: "array" });
    const name = wb.SheetNames[0];
    const rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }).filter((r) => r.some((c) => cell(c) !== ""));
    console.log(`  ${wb.SheetNames.length} sheets (${wb.SheetNames.slice(0, 8).join(", ")}); "${name}": ${rows.length} non-empty rows`);
    for (const r of rows.slice(0, first)) console.log(`  ${rowText(r)}`);
    if (rows.length > first) { console.log("  …"); for (const r of rows.slice(-last)) console.log(`  ${rowText(r)}`); }
  } catch (e) { console.log(`  workbook not read: ${e instanceof Error ? e.message : String(e)}`); }
}

const FRB = "https://www.federalreserve.gov";
head("Federal Reserve Board: the Policy Rates (PRATES) feeds page, its XML feeds");
let feed = `${FRB}/feeds/prates.xml`;
{
  const url = `${FRB}/feeds/prates.html`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const xs = [...new Set(anchors(r.text, url).filter(([u]) => /\.xml(?:$|\?)/i.test(u)).map(([u, t]) => `${u}  (${t.slice(0, 70)})`))];
    console.log(`  ${xs.length} XML links; first 12:\n  ${xs.slice(0, 12).join("\n  ")}`);
    const data = anchors(r.text, url).map(([u]) => u).find((u) => /\/feeds\/data\//i.test(u) && /\.xml(?:$|\?)/i.test(u));
    if (data) feed = data; else console.log("  no feed under /feeds/Data/ on the page; feeds/prates.xml is read instead");
  }
}
await pause(GAP);
head("Federal Reserve Board: the chosen PRATES feed, its newest items (a rate figure and its date, if the feed carries them)");
{
  const r = await look(feed, { show: 200 });
  if (r.ok) {
    const items = [...r.text.matchAll(/<item[\s\S]*?<\/item>/gi)].map((m) => m[0]);
    console.log(`  ${items.length} items`);
    for (const it of items.slice(0, 8)) {
      const vals = [...it.matchAll(/<cb:value[^>]*>([\s\S]*?)<\/cb:value>/gi)].map((m) => strip(m[1]));
      const when = tag(it, "cb:observationPeriod") || tag(it, "dc:date") || tag(it, "pubDate");
      console.log(`  ${tag(it, "title").slice(0, 110)} | ${when} | ${vals.length ? `values: ${vals.join(", ")}` : tag(it, "description").slice(0, 140)}`);
    }
  }
}

await pause(GAP);
head("Federal Reserve Board: the H.4.1 release page, its data links (XML, text, CSV, zip)");
{
  const url = `${FRB}/releases/h41/`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const ls = [...new Set(anchors(r.text, url).filter(([u]) => /\.(xml|txt|csv|zip)(?:$|\?)|datadownload/i.test(u)).map(([u, t]) => `${u}  (${t.slice(0, 60)})`))];
    console.log(`  ${ls.length} data links; first 12:\n  ${ls.slice(0, 12).join("\n  ")}`);
  }
}
await pause(GAP);
head("Federal Reserve Board: H.4.1, the current release as text (h41.txt): its date and the lines the liquidity panel needs");
{
  const r = await look(`${FRB}/releases/h41/current/h41.txt`, { show: 0, timeoutMs: 60000 });
  if (r.ok) {
    const ls = lines(r.text);
    console.log(`  ${ls.length} lines; first 4:\n  ${ls.slice(0, 4).map((l) => l.trim().slice(0, 160)).join("\n  ")}`);
    for (const l of ls.filter((x) => /Total assets|Reserve balances with Federal Reserve Banks|U\.S\. Treasury, General Account|Reverse repurchase agreements/i.test(x)).slice(0, 8)) console.log(`  > ${l.trim().slice(0, 170)}`);
  }
}

await pause(GAP);
head("Federal Reserve Board: G.17 industrial production, the download page's file links (two candidate addresses)");
let ipFile = "";
for (const url of [`${FRB}/releases/g17/download.htm`, `${FRB}/releases/g17/Revisions/Current/ipdisk/download.htm`]) {
  const r = await look(url, { show: 0 });
  if (!r.ok) { await pause(GAP); continue; }
  const fs = anchors(r.text, url).filter(([u]) => /\.(txt|xml|csv|zip)(?:$|\?)/i.test(u));
  console.log(`  ${fs.length} file links; first 15:`);
  for (const [u, t] of fs.slice(0, 15)) console.log(`  ${u}  (${t.slice(0, 70)})`);
  ipFile = (fs.find(([u, t]) => /ip_sa|table ?1|1_2|seasonally adjusted/i.test(`${u} ${t}`) && /\.txt/i.test(u)) ?? fs.find(([u]) => /\.txt/i.test(u)) ?? [""])[0];
  if (ipFile) break;
  await pause(GAP);
}
if (ipFile) {
  await pause(GAP);
  head("Federal Reserve Board: the G.17 text file chosen (first lines, newest line)");
  const r = await look(ipFile, { show: 0, timeoutMs: 60000 });
  if (r.ok) {
    const ls = lines(r.text);
    console.log(`  ${ls.length} lines; first 3:\n  ${ls.slice(0, 3).map((l) => l.slice(0, 160)).join("\n  ")}\n  last:\n  ${(ls[ls.length - 1] ?? "").slice(0, 160)}`);
  }
}

await pause(GAP);
head("Philadelphia Fed: Manufacturing Business Outlook Survey, the historical-data page's files");
let bos = "";
{
  const url = "https://www.philadelphiafed.org/surveys-and-data/mbos-historical-data";
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => /\.(csv|xlsx?|txt)(?:$|\?)/i.test(u));
    console.log(`  ${fs.length} file links:`);
    for (const [u, t] of fs.slice(0, 10)) console.log(`  ${u}  (${t.slice(0, 70)})`);
    bos = (fs.find(([u, t]) => /dif/i.test(`${u} ${t}`)) ?? fs.find(([u]) => /\.csv/i.test(u)) ?? fs[0] ?? [""])[0];
  }
}
if (bos) {
  await pause(GAP);
  head("Philadelphia Fed: the diffusion-index file (header and the newest rows)");
  if (/\.csv|\.txt/i.test(bos)) {
    const r = await look(bos, { show: 0, timeoutMs: 60000 });
    if (r.ok) { const ls = lines(r.text); console.log(`  ${ls.length} lines; header: ${(ls[0] ?? "").slice(0, 300)}\n  newest 2:\n  ${ls.slice(-2).map((l) => l.slice(0, 200)).join("\n  ")}`); }
  } else { const b = await getBytes(bos); if (b) await showBook(b); }
}

await pause(GAP);
head("Census Bureau: Advance Monthly Retail Trade (MARTS), the Time Series page's files");
let marts = "";
{
  const url = "https://www.census.gov/econ/currentdata/?programCode=MARTS";
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u, t]) => /\.(xlsx?|csv)(?:$|\?)/i.test(u) || /excel|xlsx/i.test(t));
    console.log(`  ${fs.length} file links:`);
    for (const [u, t] of fs.slice(0, 10)) console.log(`  ${u}  (${t.slice(0, 70)})`);
    if (!fs.length) console.log(`  page text (first 300 characters): ${strip(r.text).slice(0, 300)}`);
    marts = fs[0]?.[0] ?? "";
  }
}
if (marts) {
  await pause(GAP);
  head("Census Bureau: the first MARTS file listed");
  const b = await getBytes(marts);
  if (b) await showBook(b, 6, 2);
}
