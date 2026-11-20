// B-15, B-10, B-26, B-25, B-02, B-13 and B-01: international bodies and two central banks the Monitor does not read
// yet, no key.
//   - BIS (stats.bis.org/api/v2, the API the server already reads for WS_CBPOL): effective exchange rates (WS_EER;
//     real and nominal, broad and narrow baskets, data.bis.org/topics/EER), central bank total assets (WS_CBTA; cited
//     as "WS_CBTA 1.0" in the BIS's own documentation) and total credit (WS_TC). The EER key M.R.B.<area> (monthly,
//     real, broad) and the TC key Q.CN.P.A.M.770.A (China, private non-financial sector, % of GDP) are candidates; a
//     4xx on version 1.0 is retried once with "~" (latest), and an EER key the API refuses is retried as every series'
//     newest value, so the answer shows the key's layout.
//   - OECD (sdmx.oecd.org/public/rest, new to the Monitor): composite leading indicators (DF_CLI; the key from the
//     OECD's own API explainer, narrowed to six countries) and monthly long-term interest rates (DF_FINMARK, measure
//     IRLT, unit PA: the filters FRED shows for the OECD's series; the dataflow name is a candidate) for Korea, whose
//     daily yields need a key (ECOS), and Australia, as a check against the RBA.
//   - Reserve Bank of Australia, table F2 (Capital market yields – government bonds, daily): f02d.xlsx, published
//     on Fridays at 2.00 pm with daily yields up to two business days earlier (RBA release schedule, search extract);
//     and the CSV form, by the pattern of the RBA's other tables (f11-data.csv): a candidate.
//   - People's Bank of China, English site: the open market operations announcements (pages under
//     /en/3688110/3688181/, seen in search results; the list page is a candidate) and the newest one's text, for the
//     7-day reverse repo rate (B-01: the PBoC has called it its main policy rate since 2024). CFETS, which
//     publishes the central parity for the PBoC, asks for a written licence to use its data ("Any institution or
//     individual that needs to use CFETS market data should submit an application to CFETS and obtain a written
//     license or authorization", chinamoney.com.cn/english/svcmds/, search extract), so it is not probed.
// Serves: B-15 (REER against its 10-year average: I-23), B-10 (the PBoC's and the BoJ's balance sheets where no daily
// file exists: I-16), B-26 (China's credit), B-25 and B-02 (a growth gauge for every region, China included: I-21),
// B-13 (Australia 3Y and 10Y; Korea 10Y, monthly), B-01 (the PBoC's 7-day reverse repo rate beside the LPR: I-7).
// Limits and terms: OECD: "API access is currently restricted to a maximum of 60 data downloads per hour" (oecd.org
// data explainer "API best practices and recommendations", search extract; another copy of it says 20 queries a
// minute and 20 downloads an hour, with a temporary block beyond): two OECD requests here, 3 s apart. BIS: "The use
// of the statistics is unrestricted, provided that: if the statistics are reproduced, the BIS must be cited ... as
// the source", and it may restrict an IP address "at any time and without notice" (bis.org/terms_statistics.htm). RBA
// and PBoC: not read.
// No key, no secret, nothing written; nine requests when every address answers, twelve at most (the BIS retries), 0.8 s
// apart (3 s before each OECD request). The RBA workbook is opened only under Deno.
// Runtime: deno (a job on GitHub; monthly and quarterly series, and the RBA's weekly file).
//   Actions > source-probe > Run workflow: probe = intl_official, runtime = deno
import { head, look, masked, UA, type Look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const y = new Date().getUTCFullYear();
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const anchors = (html: string, base: string): Array<[string, string]> => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m): [string, string] => { try { return [new URL(m[1].replace(/&amp;/g, "&"), base).toString(), strip(m[2])]; } catch { return ["", ""]; } })
  .filter(([u]) => u !== "");

/** Rows of a CSV text, with quoted fields (labels can hold commas). */
function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
/** Prints a CSV answer's columns and row count, then per series (told apart by the columns in `by` that exist) its
 *  first period, newest period and value, and its number of observations, among the rows `keep` accepts. */
function newest(text: string, by: string[], keep: (r: Record<string, string>) => boolean, max = 14): void {
  const rows = csv(text);
  if (rows.length < 2) { console.log("  no rows"); return; }
  const [hdr, ...body] = rows;
  console.log(`  ${body.length} rows; columns: ${hdr.slice(0, 24).join(", ")}`);
  const recs = body.map((r) => Object.fromEntries(hdr.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
  if (!hdr.some((h) => h.trim() === "TIME_PERIOD") || !hdr.some((h) => h.trim() === "OBS_VALUE")) return;
  const keys = by.filter((b) => hdr.some((h) => h.trim() === b));
  const series = new Map<string, { first: string; last: Record<string, string>; n: number }>();
  for (const x of recs) {
    if (!keep(x)) continue;
    const k = keys.map((b) => x[b]).join(" ");
    const s = series.get(k);
    if (!s) series.set(k, { first: x.TIME_PERIOD, last: x, n: 1 });
    else { s.n++; if (x.TIME_PERIOD < s.first) s.first = x.TIME_PERIOD; if (x.TIME_PERIOD > s.last.TIME_PERIOD) s.last = x; }
  }
  console.log(`  ${series.size} series kept${series.size > max ? `; the first ${max}` : ""}:`);
  for (const [k, s] of [...series.entries()].slice(0, max)) console.log(`  ${k}: ${s.last.TIME_PERIOD} ${s.last.OBS_VALUE} (${s.n} observations from ${s.first})`);
}

const BIS = "https://stats.bis.org/api/v2/data/dataflow/BIS";
const BA = { headers: { accept: "text/csv" }, timeoutMs: 90000 };
/** One BIS dataflow: version 1.0 first, then "~" (latest) if 1.0 is refused. */
async function bis(flow: string, key: string, q: string): Promise<Look> {
  let r = await look(`${BIS}/${flow}/1.0/${key}?${q}`, { ...BA, show: 0 });
  if (r.status !== null && r.status >= 400 && r.status < 500) {
    console.log(`  refused: ${r.text.slice(0, 200)}`);
    await pause(800);
    console.log("  retried with version ~ (latest):");
    r = await look(`${BIS}/${flow}/~/${key}?${q}`, { ...BA, show: 200 });
  }
  return r;
}
const inAreas = (areas: string[]) => (x: Record<string, string>) => areas.includes(x.REF_AREA ?? "") || areas.includes(x.BORROWERS_CTY ?? "");

head("BIS effective exchange rates (WS_EER): monthly, real, broad (candidate key M.R.B), JP, US, CN, XM, GB, from 2016");
{
  let r = await bis("WS_EER", "M.R.B.JP+US+CN+XM+GB", "format=csv&detail=dataonly&startPeriod=2016-01");
  if (r.ok) newest(r.text, ["FREQ", "EER_TYPE", "EER_BASKET", "REF_AREA"], () => true);
  else if (r.status !== null) {
    await pause(800);
    console.log("  asked instead for every series' newest observation (version ~), to show the key's layout:");
    r = await look(`${BIS}/WS_EER/~/*?format=csv&detail=dataonly&lastNObservations=1`, { ...BA, show: 200 });
    if (r.ok) newest(r.text, ["FREQ", "EER_TYPE", "EER_BASKET", "REF_AREA"], inAreas(["JP", "US", "CN", "XM", "GB"]));
  }
}
await pause(800);
head("BIS central bank total assets (WS_CBTA): every series' newest observation, kept for JP, CN, US, XM, GB, CH");
{
  const r = await bis("WS_CBTA", "*", "format=csv&detail=dataonly&lastNObservations=1");
  if (r.ok) newest(r.text, ["FREQ", "REF_AREA", "UNIT_MEASURE", "UNIT_TYPE", "CBTA_TYPE"], inAreas(["JP", "CN", "US", "XM", "GB", "CH"]));
}
await pause(800);
head("BIS total credit (WS_TC): China, private non-financial sector, % of GDP (candidate key Q.CN.P.A.M.770.A)");
{
  const r = await bis("WS_TC", "Q.CN.P.A.M.770.A", "format=csv&detail=dataonly&lastNObservations=4");
  if (r.ok) newest(r.text, ["FREQ", "BORROWERS_CTY", "TC_BORROWERS", "TC_LENDERS", "VALUATION", "UNIT_TYPE", "TC_ADJUST"], () => true);
}

const OECD = "https://sdmx.oecd.org/public/rest/data";
await pause(3000);
head("OECD composite leading indicators (DF_CLI), monthly: US, Japan, China, UK, Germany, Korea (the OECD explainer's key, by country)");
{
  const r = await look(`${OECD}/OECD.SDD.STES,DSD_STES@DF_CLI/USA+JPN+CHN+GBR+DEU+KOR.M.LI...AA...H?startPeriod=${y - 1}-01&dimensionAtObservation=AllDimensions&format=csvfilewithlabels`, { show: 200, timeoutMs: 90000 });
  if (r.ok) newest(r.text, ["REF_AREA", "MEASURE", "ADJUSTMENT", "METHODOLOGY"], () => true);
}
await pause(3000);
head("OECD long-term interest rates (DF_FINMARK, IRLT, % a year; the dataflow is a candidate), monthly: Korea, Australia");
{
  const r = await look(`${OECD}/OECD.SDD.STES,DSD_STES@DF_FINMARK/KOR+AUS.M.IRLT.PA.....?startPeriod=${y}-01&dimensionAtObservation=AllDimensions&format=csvfilewithlabels`, { show: 200, timeoutMs: 90000 });
  if (r.ok) newest(r.text, ["REF_AREA", "MEASURE", "UNIT_MEASURE"], () => true);
}

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
const rowText = (r: unknown[]) => { const cs = r.map(cell); return (cs.length > 12 ? [...cs.slice(0, 8), "…", ...cs.slice(-3)] : cs).join(" | ").slice(0, 240); };

const RBA = "https://www.rba.gov.au/statistics/tables";
await pause(800);
head("RBA: table F2, government bond yields, daily (f02d.xlsx): its title rows and newest rows");
{
  const b = await getBytes(`${RBA}/xls/f02d.xlsx`);
  if (b) {
    try {
      // @ts-ignore: a Deno npm: specifier, the package the server uses; under Node the import fails and is reported
      const X = (await import("npm:xlsx@0.18.5")) as unknown as XlsxMod;
      const wb = X.read(b, { type: "array" });
      const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }).filter((r) => r.some((c) => cell(c) !== ""));
      console.log(`  ${wb.SheetNames.length} sheets; "${wb.SheetNames[0]}": ${rows.length} non-empty rows`);
      for (const r of rows.slice(0, 2)) console.log(`  ${rowText(r)}`);
      const ids = rows.find((r) => /series id/i.test(cell(r[0])));
      if (ids) console.log(`  ${rowText(ids)}`);
      for (const r of rows.slice(-2)) console.log(`  ${rowText(r)}`);
    } catch (e) { console.log(`  (workbook not opened: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)})`); }
  }
}
await pause(800);
head("RBA: table F2 as CSV (candidate address f2-data.csv, by the pattern of f11-data.csv)");
{
  const r = await look(`${RBA}/csv/f2-data.csv`, { show: 0, timeoutMs: 60000 });
  if (r.ok) { const ls = r.text.split(/\r?\n/).filter((l) => l.trim() !== ""); console.log(`  ${ls.length} lines; first 2 and last:\n  ${[...ls.slice(0, 2), ls[ls.length - 1] ?? ""].map((l) => l.slice(0, 200)).join("\n  ")}`); }
}

const PBC = "https://www.pbc.gov.cn";
await pause(800);
head("People's Bank of China (English): the open market operations announcements list (candidate address), the newest titles");
let omo = "";
{
  const url = `${PBC}/en/3688110/3688181/index.html`;
  const r = await look(url, { show: 200 });
  if (r.ok) {
    const as = anchors(r.text, url).filter(([u, t]) => /\/en\/3688110\/3688181\//.test(u) && /open market/i.test(t));
    console.log(`  ${as.length} announcement links; first 5:`);
    for (const [u, t] of as.slice(0, 5)) console.log(`  ${t.slice(0, 80)}  ${u}`);
    omo = as[0]?.[0] ?? "";
  }
}
if (omo) {
  await pause(800);
  head("People's Bank of China: the newest announcement, its sentences on reverse repos and rates");
  const r = await look(omo, { show: 0 });
  if (r.ok) for (const s of strip(r.text).split(/(?<=\.)\s+/).filter((s) => /reverse repo|interest rate|%/i.test(s)).slice(0, 4)) console.log(`  ${s.slice(0, 240)}`);
}
