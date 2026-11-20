// A-06 (must: "the next report: KEY DATA says confirmed with its source, or est."), A-14 and A-15 (results dates in the
// events list and the phone's first block) and A-11 (crowding over time): the exchange's and FINRA's own files.
//   - JPX, 決算発表予定日 (the results dates TSE-listed companies have announced): one workbook per fiscal period end on
//     jpx.co.jp/listing/event-schedules/financial-announcement/index.html; "3月期・9月期決算会社については、毎営業日午後5時
//     頃を目処に翌営業日分が更新される"; JPX warns that an actual date can differ from the list; JPX総研 also sells the same
//     list as one CSV (search extracts of the page). For a Tokyo name this is the company-announced date where the
//     Monitor today has only Yahoo's.
//   - JPX, margin balances by name: the weekly 銘柄別信用取引週末残高 has been a PDF (margin/05.html; files such as
//     syumatsu2026091800.pdf). JPX replaced its margin system in September 2026; by its July 2026 notice (search
//     extract) issue-level balances are now published every business day at 16:00 and the weekly per-name file every
//     Tuesday at 16:30. JPX also sells the per-name data as CSV (paid-info-equities). What the margin pages link now,
//     and in what form, is the finding. Links named 品貸料 (lending fees) are printed too: whether they give a fee by
//     name, a borrow cost for Tokyo names, is not known.
//   - FINRA, equity short interest: FINRA "publishes short interest reports ... for all exchange-listed and
//     over-the-counter (OTC) equity securities"; data "available online for one rolling year based on the settlement
//     date, and archived data is available via download", archive files from 2014 (finra.org, Equity Short Interest
//     pages, search extracts). FINRA's Query API needs credentials from its API Console (developer.finra.org: the
//     equity datasets "now require API credentials"), which is an account (an owner decision), so only the public
//     files page is read: its file links, then the first file. The server already reads FINRA's daily short-volume
//     files from cdn.finra.org.
// Serves: A-06 and A-15 (a Tokyo name's next results date with its source: I-14, I-22), A-14 (EVENTS AHEAD), A-11
// (a US name's short interest twice a month for 12 months; a Tokyo name's 信用残 by week or by day; borrow fees),
// A-12 (short interest in the screener).
// Terms: JPX: "有料情報としてJPXと契約して当サイトから取得する場合、またはJPXの許可により当サイトから取得する場合を除き、商用目的
// によるデータ収集及び二次利用はできません" (jpx.co.jp/term-of-use, search extract): the same condition as the JPX files the
// server already reads, for the owner to judge. FINRA's site terms: not read.
// No key, no secret, nothing written; seven requests at most, 0.8 s apart. Workbooks are opened only under Deno.
// Runtime: deno (a job on GitHub, after each publication).
//   Actions > source-probe > Run workflow: probe = stock_dates_crowding, runtime = deno
import { head, look, masked, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Every link on a page with its text, made absolute. */
const anchors = (html: string, base: string): Array<[string, string]> => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m): [string, string] => { try { return [new URL(m[1].replace(/&amp;/g, "&"), base).toString(), strip(m[2])]; } catch { return ["", ""]; } })
  .filter(([u]) => u !== "");
const isData = (u: string) => /\.(?:csv|txt|zip|xlsx?|pdf)(?:$|\?)/i.test(u) || /cdn\.finra\.org/i.test(u);
const ext = (u: string) => (u.match(/\.([a-z]+)(?:$|\?)/i)?.[1] ?? "?").toLowerCase();
const GAP = 800;

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
/** Opens a workbook (Deno only): its sheets, first and last rows, and up to three rows matching `find`. */
async function showBook(b: Uint8Array, find?: RegExp, first = 5, last = 2): Promise<void> {
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
    if (find) for (const r of rows.filter((r) => r.some((c) => find.test(cell(c)))).slice(0, 3)) console.log(`  row matching ${find}: ${rowText(r)}`);
  } catch (e) { console.log(`  workbook not read: ${e instanceof Error ? e.message : String(e)}`); }
}

const JPX = "https://www.jpx.co.jp";
head("JPX: 決算発表予定日 (announced results dates), the page's workbooks");
let sched = "";
{
  const url = `${JPX}/listing/event-schedules/financial-announcement/index.html`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => /\.(?:xlsx?|csv|pdf)(?:$|\?)/i.test(u));
    console.log(`  ${fs.length} files; first 10:`);
    for (const [u, t] of fs.slice(0, 10)) console.log(`  ${u}  (${t.slice(0, 70)})`);
    sched = (fs.find(([u]) => /\.xlsx?(?:$|\?)/i.test(u)) ?? [""])[0];
  }
}
if (sched) {
  await pause(GAP);
  head("JPX: the first results-date workbook listed (its rows; Toyota, 7203, if it is in this one)");
  const b = await getBytes(sched);
  if (b) await showBook(b, /^7203|トヨタ/);
}

await pause(GAP);
head("JPX: the margin statistics index page, its links on margin balances and lending fees");
{
  const url = `${JPX}/markets/statistics-equities/margin/index.html`;
  const r = await look(url, { show: 0 });
  if (r.ok) for (const [u, t] of anchors(r.text, url).filter(([u, t]) => /\/margin\//i.test(u) && /信用|残高|銘柄|日々|品貸|margin/i.test(t)).slice(0, 16)) console.log(`  ${u}  (${t.slice(0, 70)})`);
}
await pause(GAP);
head("JPX: 銘柄別信用取引週末残高 (margin balances by name), the page's files");
let jpxFile = "";
{
  const url = `${JPX}/markets/statistics-equities/margin/05.html`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => isData(u));
    const kinds = new Map<string, number>();
    for (const [u] of fs) kinds.set(ext(u), (kinds.get(ext(u)) ?? 0) + 1);
    console.log(`  ${fs.length} file links (${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")}); first 8:`);
    for (const [u, t] of fs.slice(0, 8)) console.log(`  ${u}  (${t.slice(0, 60)})`);
    jpxFile = (fs.find(([u]) => /\.(?:csv|xlsx?|zip)(?:$|\?)/i.test(u)) ?? fs[0] ?? [""])[0];
  }
}
if (jpxFile) {
  await pause(GAP);
  head("JPX: the first margin-by-name file listed (a workbook is opened; a PDF only measured)");
  const b = await getBytes(jpxFile);
  if (b && /xlsx?$/.test(ext(jpxFile))) await showBook(b, /^7203/);
}

const FINRA = "https://www.finra.org/finra-data/browse-catalog/equity-short-interest";
await pause(GAP);
head("FINRA: Equity Short Interest Files, the public page's file links");
let finraFile = "";
{
  const url = `${FINRA}/files`;
  const r = await look(url, { show: 0 });
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => isData(u));
    console.log(`  ${fs.length} file links; first 12:`);
    for (const [u, t] of fs.slice(0, 12)) console.log(`  ${u}  (${t.slice(0, 60)})`);
    finraFile = (fs.find(([u]) => /\.(?:csv|txt)(?:$|\?)/i.test(u)) ?? fs[0] ?? [""])[0];
    if (!fs.length) console.log(`  page text (first 300 characters): ${strip(r.text).slice(0, 300)}`);
  }
}
await pause(GAP);
if (finraFile) {
  head("FINRA: the first short-interest file listed (status, size, first characters)");
  const r = await look(finraFile, { show: 400, timeoutMs: 60000 });
  if (r.ok) { const ls = r.text.split(/\r?\n/).filter((l) => l.trim() !== ""); console.log(`  ${ls.length} lines; NVDA's line: ${ls.find((l) => /(^|\|)NVDA(\||$)/.test(l))?.slice(0, 200) ?? "not in this file"}`); }
} else {
  head("FINRA: Equity Short Interest Data, the page that describes the data (its links, when the files page lists none)");
  const url = `${FINRA}/data`;
  const r = await look(url, { show: 0 });
  if (r.ok) for (const [u, t] of anchors(r.text, url).filter(([u, t]) => isData(u) || /download|file|api|short interest/i.test(t)).slice(0, 12)) console.log(`  ${u}  (${t.slice(0, 60)})`);
}
