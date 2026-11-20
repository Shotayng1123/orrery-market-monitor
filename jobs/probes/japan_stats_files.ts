// B-02 Japan (must) and B-09 Japan: the official Japanese files for Japan's row of the ECONOMY view, no key. On 19 Nov
// (econ_offices) the Statistics Bureau's English CPI page linked three workbooks named like base lists
// (2025base-list.xlsx and two older) and its labour force page none, so Japan's CPI and unemployment have no
// machine-readable source yet; GDP and industrial production were not tried. mof.go.jp and stat.go.jp answer GitHub's
// machines; esri.cao.go.jp, meti.go.jp and e-stat.go.jp are new.
// What it checks (eleven requests at most, 0.8 s apart; Excel files opened only under Deno):
//   - Cabinet Office (ESRI), quarterly GDP: the year's list of releases (a candidate address) for the newest menu
//     (pattern /jp/sna/data/data_list/sokuhou/files/<year>/qe<yy><q>[_2]/gdemenuja.html, seen in search results; the
//     2026 Jul-Sep first estimate was due 16 Nov 2026 08:50 JST and the second is due 8 Dec 2026, by e-Stat's release
//     calendar), the menu's CSV files, and one of them (the growth-rate file if it can be told by its name);
//   - METI, industrial production index (2020 base): the statistics-table page (meti.go.jp/statistics/tyo/iip/
//     b2020_result-2.html) and its seasonally adjusted monthly workbook by industry (b2020_gsm1j.xlsx, as a search
//     extract lists it);
//   - Statistics Bureau, consumer price index: the 2025-base results are published from 21 Aug 2026, and its long-term
//     series sit on e-Stat ("2025年基準長期時系列データ", search extracts of stat.go.jp). e-Stat's API needs an application
//     ID after registration (its API guide); whether its file pages need nothing is part of what this checks. The
//     listing tstat=000001243876 is the one a search extract ties to the 2025 base (a candidate); this reads it, follows
//     its long-term-series link, and fetches the first file it offers;
//   - Statistics Bureau, labour force survey: the long-term series page (stat.go.jp/data/roudou/longtime/03roudou.html,
//     named by the Bureau's own documents) and its first workbook;
//   - MOF, the 10-year inflation-indexed JGB's break-even inflation rate (BEI): the Ministry publishes a chart,
//     jgbs/topics/bond/10year_inflation-indexed/bei.pdf ("BEI(10年)は、物価連動国債の複利利回りと同じ残存期間の10年利付国債
//     の複利利回りを基に計算", by a search extract); the folder's index page (a candidate) is read for a data file.
// Serves: B-02 Japan (real GDP q/q and y/y, industrial production y/y, headline and core CPI y/y, unemployment rate:
// I-21), B-09 Japan (a breakeven from the Ministry, where B-09 says "source unknown": I-15), B-25.
// Terms: the Statistics Bureau asks that a quotation name its source ("出典(総務省「消費者物価指数」)"); e-Stat: data
// given through its API follows e-Stat's terms of use and may be used commercially (its API guide, search extract);
// ESRI, METI and MOF: not read here. No key, no secret, nothing written.
// Runtime: deno (a job on GitHub, started by the database after each release).
//   Actions > source-probe > Run workflow: probe = japan_stats_files, runtime = deno
import { head, masked, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Every link on a page with its text, made absolute. */
const anchors = (html: string, base: string): Array<[string, string]> => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m): [string, string] => { try { return [new URL(m[1].replace(/&amp;/g, "&"), base).toString(), strip(m[2])]; } catch { return ["", ""]; } })
  .filter(([u]) => u !== "");
const isFile = (u: string, ext = "csv|xlsx?|zip|pdf") => new RegExp(`\\.(?:${ext})(?:$|\\?)`, "i").test(u);
const lines = (t: string) => t.split(/\r?\n/).filter((l) => l.trim() !== "");
const GAP = 800;
const y = new Date().getUTCFullYear();

/** Text in UTF-8, or in Shift_JIS when it is not valid UTF-8 (older Japanese pages and CSV files). */
function decode(b: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch { try { return new TextDecoder("shift_jis").decode(b); } catch { return new TextDecoder().decode(b); } }
}
interface Got { ok: boolean; bytes: Uint8Array; text: string }
/** Fetches `url`, prints status, type, size and time (and `show` characters of the decoded text). */
async function get(url: string, show = 0, timeoutMs = 60000): Promise<Got> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    const bytes = new Uint8Array(await r.arrayBuffer());
    const text = decode(bytes);
    const lm = r.headers.get("last-modified");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${r.headers.get("content-type") ?? "no type"}  ${bytes.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${lm ? `\n  headers: last-modified=${lm}` : ""}`);
    if (show > 0) console.log(`  first ${Math.min(show, text.length)} chars: ${JSON.stringify(text.slice(0, show))}`);
    return { ok: r.ok, bytes, text };
  } catch (e) {
    console.log(`FAILED  ${Date.now() - t0} ms  ${masked(url)}\n  ${masked(e instanceof Error ? e.message : String(e))}`);
    return { ok: false, bytes: new Uint8Array(0), text: "" };
  }
}
type Book = { SheetNames: string[]; Sheets: Record<string, unknown> };
type XlsxMod = { read(d: Uint8Array, o: { type: "array" }): Book; utils: { sheet_to_json(ws: unknown, o: { header: 1; raw: boolean; defval: string }): unknown[][] } };
const cell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const rowText = (r: unknown[]) => { const cs = r.map(cell); return (cs.length > 10 ? [...cs.slice(0, 6), "…", ...cs.slice(-3)] : cs).join(" | ").slice(0, 220); };
/** Opens a workbook (Deno only): its sheets, first and last rows, and up to three rows matching `find`. */
async function showBook(b: Uint8Array, find?: RegExp, first = 4, last = 2): Promise<void> {
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

// ---------- Cabinet Office (ESRI): quarterly GDP ----------
const ESRI = "https://www.esri.cao.go.jp";
const tagOf = (u: string) => u.match(/\/(qe\d+(?:_\d)?)\//)?.[1] ?? "";
head(`Cabinet Office (ESRI): the ${y} list of quarterly GDP releases (candidate address), for the newest release's menu`);
let menu = `${ESRI}/jp/sna/data/data_list/sokuhou/files/${y}/qe${String(y).slice(2)}3/gdemenuja.html`;   // the Jul-Sep first estimate
{
  const url = `${ESRI}/jp/sna/data/data_list/sokuhou/files/${y}/toukei_${y}.html`;
  const r = await get(url);
  if (r.ok) {
    const ms = [...new Set(anchors(r.text, url).map(([u]) => u).filter((u) => /gdemenuja\.html$/i.test(u)))].sort((a, b) => tagOf(b).localeCompare(tagOf(a)));
    console.log(`  ${ms.length} release menus; newest first: ${ms.slice(0, 6).map(tagOf).join(", ")}`);
    if (ms[0]) menu = ms[0]; else console.log(`  none listed; the Jul-Sep first estimate's menu is read: ${menu}`);
  }
}
await pause(GAP);
head("Cabinet Office (ESRI): the newest release's menu, its CSV files");
{
  const r = await get(menu);
  if (r.ok) {
    const cs = anchors(r.text, menu).filter(([u]) => isFile(u, "csv"));
    console.log(`  ${cs.length} CSV files; first 16:`);
    for (const [u, t] of cs.slice(0, 16)) console.log(`  ${u.split("/").slice(-1)[0]}  (${t.slice(0, 60)})`);
    const pick = (cs.find(([u]) => /ritu-j/i.test(u)) ?? cs.find(([u]) => /gaku-j/i.test(u)) ?? cs[0] ?? [""])[0];
    if (pick) {
      await pause(GAP);
      head("Cabinet Office (ESRI): the CSV chosen (a growth-rate file if named so): first characters and newest lines");
      const f = await get(pick, 300);
      if (f.ok) { const ls = lines(f.text); console.log(`  ${ls.length} lines; last 2:\n  ${ls.slice(-2).map((l) => l.slice(0, 200)).join("\n  ")}`); }
    }
  }
}

// ---------- METI: industrial production ----------
await pause(GAP);
head("METI: industrial production index (2020 base), the statistics-table page's workbooks");
let iip = "";
{
  const url = "https://www.meti.go.jp/statistics/tyo/iip/b2020_result-2.html";
  const r = await get(url);
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => isFile(u, "csv|xlsx?"));
    console.log(`  ${fs.length} files; first 12:`);
    for (const [u, t] of fs.slice(0, 12)) console.log(`  ${u.split("/").slice(-1)[0]}  (${t.slice(0, 60)})`);
    iip = (fs.find(([u]) => /b2020_gsm1j\.xlsx/i.test(u)) ?? fs.find(([u]) => /\.xlsx/i.test(u)) ?? [""])[0];
  }
}
if (iip) {
  await pause(GAP);
  head("METI: the seasonally adjusted monthly workbook by industry (b2020_gsm1j.xlsx when linked)");
  const f = await get(iip, 0, 90000);
  if (f.ok) await showBook(f.bytes, /^鉱工業/);
}

// ---------- Statistics Bureau: CPI through e-Stat's file pages ----------
const ESTAT = "https://www.e-stat.go.jp";
await pause(GAP);
head("e-Stat: the CPI listing tied to the 2025 base by a search extract (tstat=000001243876, candidate): its sub-lists and files");
let sub = "", fileLink = "";
{
  const url = `${ESTAT}/stat-search/files?tstat=000001243876`;
  const r = await get(url);
  if (r.ok) {
    const as = anchors(r.text, url);
    const lists = as.filter(([u]) => /stat-search\/files\?/i.test(u)).filter(([, t]) => t !== "");
    const files = as.filter(([u]) => /file-download/i.test(u));
    console.log(`  ${lists.length} list links, ${files.length} file links; list links named like a series or a period (first 12):`);
    for (const [u, t] of lists.filter(([, t]) => /長期|時系列|月次|年次|基準/.test(t)).slice(0, 12)) console.log(`  ${t.slice(0, 50)}  ${u}`);
    sub = lists.find(([, t]) => /長期時系列/.test(t))?.[0] ?? "";
    fileLink = files.find(([u]) => /fileKind=1/i.test(u))?.[0] ?? files[0]?.[0] ?? "";
  }
}
if (sub && !fileLink) {
  await pause(GAP);
  head("e-Stat: the long-term series list, its files");
  const r = await get(sub);
  if (r.ok) {
    const files = anchors(r.text, sub).filter(([u]) => /file-download/i.test(u));
    console.log(`  ${files.length} file links; first 8:`);
    for (const [u, t] of files.slice(0, 8)) console.log(`  ${t.slice(0, 50)}  ${u}`);
    const rows = [...r.text.matchAll(/<li[^>]*class="[^"]*stat-dataset_list-item[^"]*"[\s\S]*?<\/li>/gi)].map((m) => strip(m[0]).slice(0, 120));
    if (rows.length) console.log(`  ${rows.length} dataset rows; first 6:\n  ${rows.slice(0, 6).join("\n  ")}`);
    fileLink = files.find(([u]) => /fileKind=1/i.test(u))?.[0] ?? files[0]?.[0] ?? "";
  }
}
if (fileLink) {
  await pause(GAP);
  head("e-Stat: the first CPI file offered (CSV when one is offered): status, size, first characters");
  const f = await get(fileLink, 300, 90000);
  const workbook = (f.bytes[0] === 0x50 && f.bytes[1] === 0x4b) || (f.bytes[0] === 0xd0 && f.bytes[1] === 0xcf);   // xlsx (zip) or xls
  if (f.ok && workbook) await showBook(f.bytes);
  else if (f.ok) { const ls = lines(f.text); console.log(`  ${ls.length} lines; last 2:\n  ${ls.slice(-2).map((l) => l.slice(0, 200)).join("\n  ")}`); }
}

// ---------- Statistics Bureau: labour force survey ----------
await pause(GAP);
head("Statistics Bureau: labour force survey, the long-term series page's workbooks");
let lfs = "";
{
  const url = "https://www.stat.go.jp/data/roudou/longtime/03roudou.html";
  const r = await get(url);
  if (r.ok) {
    const fs = anchors(r.text, url).filter(([u]) => isFile(u, "csv|xlsx?"));
    console.log(`  ${fs.length} files; first 12:`);
    for (const [u, t] of fs.slice(0, 12)) console.log(`  ${u.split("/").slice(-1)[0]}  (${t.slice(0, 60)})`);
    lfs = (fs.find(([, t]) => /主要項目|完全失業率/.test(t)) ?? fs[0] ?? [""])[0];
  }
}
if (lfs) {
  await pause(GAP);
  head("Statistics Bureau: the first labour-force workbook (the main items when named so)");
  const f = await get(lfs, 0, 90000);
  if (f.ok) await showBook(f.bytes, /完全失業率/);
}

// ---------- MOF: break-even inflation ----------
await pause(GAP);
head("MOF: the 10-year inflation-indexed JGB folder's index page (candidate), its BEI and data links");
{
  const url = "https://www.mof.go.jp/jgbs/topics/bond/10year_inflation-indexed/index.htm";
  const r = await get(url);
  if (r.ok) {
    const ls = anchors(r.text, url).filter(([u, t]) => /bei/i.test(u) || /BEI|ブレーク/i.test(t) || isFile(u, "csv|xlsx?"));
    console.log(`  ${ls.length} links on BEI or to data files:`);
    for (const [u, t] of ls.slice(0, 12)) console.log(`  ${u}  (${t.slice(0, 60)})`);
  }
}
