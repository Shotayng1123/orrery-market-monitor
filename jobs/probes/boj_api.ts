// B-10 (must: the BoJ's current account balances and total assets), B-02 Japan (must: the Tankan as Japan's business
// survey) and B-01 (the call rate, to confirm a BoJ decision): the Bank of Japan's own API for its Time-Series Data
// Search. The Bank launched it on 18 Feb 2026, "in formats such as JSON and CSV" (its notice, boj.or.jp/en/statistics/
// outline/notice_2026/not260218a.htm, read through search extracts). On 19 Nov (ecb_boj_liquidity) the BoJ's accounts
// page linked no data file, the monetary base files it printed were PDFs, and the juqp page linked 13 files, the 8
// printed being monthly workbooks (sources of changes in current account balances); total assets and the Tankan
// still have no machine-readable source.
// What is known, and from where (the Bank's manual, stat-search.boj.or.jp/info/api_manual_en.pdf, could not be opened
// from the session that wrote this, so these are candidates):
//   - the base address https://www.stat-search.boj.or.jp/api/v1 and the calls getDataCode and getDataLayer, with
//     db and code parameters, as an unofficial R client (bojapi, CRAN) uses them; its examples: db FM08 with code
//     FXERM07 (USD/JPY, monthly), and "MADR1Z@D" as a code of IR01 (codes go without the database prefix);
//   - a metadata call (getMetadata here) is named by two unofficial clients but not confirmed;
//   - database codes: IR01 (basic discount and loan rates, by a dataset listing), MD01-MD14 (money and deposits) and
//     BS01-BS02 (balance sheets) and CO (Tankan), by an unofficial Python client (bojstat); FM01 is a candidate for
//     the call market;
//   - the unofficial clients say the API refuses a layer request that matches more than 1,250 series, and wait at
//     least one second between requests.
// Terms: the Bank's "Notice Regarding the Use of the API Service" was not read; the unofficial clients report that it
// forbids excessive access frequency and asks a released service to show a set credit and notify the Research and
// Statistics Department: not confirmed. Hence one request at a time, 1.5 s apart.
// What it checks: getMetadata for IR01 first; if that is not JSON, getDataCode for the two codes above, and stop. If it
// is, getMetadata for FM01, MD01, BS01 and CO, then getDataCode for up to four series picked by their names (the
// uncollateralized overnight call rate, current account balances, the Bank's total assets, a Tankan diffusion index):
// status, the answer's shape, the newest observations and their dates. Nine requests at most.
// Serves: B-10 (BoJ current account balances and total assets: I-16), B-02 Japan and B-25 (the Tankan: I-21), B-01
// and B-03(4) (the call rate after a BoJ decision: I-7, I-8). No key, no secret, nothing written.
// Runtime: node (a job on GitHub, started by the database after each release).
//   Actions > source-probe > Run workflow: probe = boj_api, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const API = "https://www.stat-search.boj.or.jp/api/v1";
const GAP = 1500;
const A = { headers: { accept: "application/json" }, timeoutMs: 60000 };

/** Every object in a JSON answer, depth first (the answer's shape is not known yet). */
function objects(x: unknown, out: Array<Record<string, unknown>> = [], depth = 0): Array<Record<string, unknown>> {
  if (depth > 10 || x === null || typeof x !== "object") return out;
  if (Array.isArray(x)) { for (const v of x) objects(v, out, depth + 1); return out; }
  const o = x as Record<string, unknown>;
  out.push(o);
  for (const v of Object.values(o)) objects(v, out, depth + 1);
  return out;
}
const topKeys = (x: unknown): string =>
  x !== null && typeof x === "object" ? (Array.isArray(x) ? `an array of ${x.length}` : Object.keys(x).slice(0, 25).join(", ")) : String(x);

interface Series { db: string; code: string; name: string; freq: string }
/** The series a metadata answer lists: objects with a string field named like a code and one named like a name
 *  (the English one when the names come in two languages). */
function seriesIn(db: string, j: unknown): Series[] {
  const out: Series[] = [];
  for (const o of objects(j)) {
    const ks = Object.keys(o);
    const str = (k: string) => typeof o[k] === "string" && String(o[k]).trim() !== "";
    const ck = ks.find((k) => /series.?code|^code$/i.test(k) && str(k));
    const nk = ks.find((k) => /name/i.test(k) && /(^|[_.-])(en|e|eng|english)$/i.test(k) && str(k)) ?? ks.find((k) => /name/i.test(k) && str(k));
    if (!ck || !nk) continue;
    const fk = ks.find((k) => /freq/i.test(k));
    out.push({ db, code: String(o[ck]).trim(), name: String(o[nk]).trim(), freq: fk ? String(o[fk]) : "?" });
  }
  return out;
}

/** Date and value pairs in a data answer: parallel arrays named like dates and values, or objects with both. */
function observations(j: unknown): Array<[string, string]> {
  for (const o of objects(j)) {
    const arrays = Object.entries(o).filter((e): e is [string, unknown[]] => Array.isArray(e[1]));
    const d = arrays.find(([k, v]) => /date|period|time/i.test(k) && v.length > 0);
    const v = arrays.find(([k, a]) => /value|obs/i.test(k) && a.length > 0);
    if (d && v && d[1].length === v[1].length) return d[1].map((x, i): [string, string] => [String(x), String(v[1][i])]);
  }
  const rows: Array<[string, string]> = [];
  for (const o of objects(j)) {
    const ks = Object.keys(o);
    const scalar = (k: string) => typeof o[k] === "string" || typeof o[k] === "number" || o[k] === null;
    const dk = ks.find((k) => /date|period|time/i.test(k) && scalar(k));
    const vk = ks.find((k) => /value|obs/i.test(k) && scalar(k));
    if (dk && vk) rows.push([String(o[dk]), String(o[vk])]);
  }
  return rows;
}
/** getDataCode for one series: status, shape, newest observations. */
async function data(what: string, db: string, code: string): Promise<void> {
  head(`getDataCode: ${what} (db ${db}, code ${code})`);
  const r = await look(`${API}/getDataCode?format=json&lang=en&db=${db}&code=${encodeURIComponent(code)}`, { ...A, show: 400 });
  const j = J(r.text);
  if (j === null) { if (r.text) console.log("  the answer is not JSON"); return; }
  console.log(`  top-level keys: ${topKeys(j)}`);
  const obs = observations(j);
  console.log(obs.length ? `  ${obs.length} observations; first ${obs[0][0]}; newest: ${obs.slice(-3).map(([d, v]) => `${d} ${v}`).join(", ")}` : "  observations not recognised (see the first characters above)");
}

const DBS: Array<[string, string]> = [
  ["IR01", "basic discount and loan rates"],
  ["FM01", "call money market (candidate code)"],
  ["MD01", "money and deposits: the first of MD01-MD14"],
  ["BS01", "balance sheets: the first of BS01-BS02"],
  ["CO", "Tankan"],
];
const found: Series[] = [];
let metadataWorks = true;
for (const [db, what] of DBS) {
  head(`getMetadata, db=${db}: ${what}`);
  const r = await look(`${API}/getMetadata?format=json&lang=en&db=${db}`, { ...A, show: 300 });
  const j = J(r.text);
  if (j === null) {
    if (r.text) console.log("  the answer is not JSON");
    if (db === "IR01") { metadataWorks = false; await pause(GAP); break; }
  } else {
    const s = seriesIn(db, j);
    console.log(`  top-level keys: ${topKeys(j)}; ${s.length} series recognised`);
    for (const x of s.slice(0, 4)) console.log(`  ${x.code} | ${x.freq} | ${x.name.slice(0, 110)}`);
    found.push(...s);
  }
  await pause(GAP);
}

if (!metadataWorks) {
  console.log("\n(getMetadata gave no JSON for IR01: the two codes from the unofficial client's examples are asked for instead)");
  await data("the basic discount rate (an unofficial client's example code)", "IR01", "MADR1Z@D");
  await pause(GAP);
  await data("USD/JPY, monthly (an unofficial client's example code)", "FM08", "FXERM07");
} else {
  const WANT: Array<[string, RegExp]> = [
    ["the uncollateralized overnight call rate", /call rate|uncollateralized overnight/i],
    ["current account balances", /current account/i],
    ["the Bank's total assets", /total assets|assets,? total/i],
    ["a Tankan diffusion index", /business conditions|diffusion index|\bD\.I\./i],
  ];
  const picks: Array<[string, Series]> = [];
  for (const [what, re] of WANT) {
    const s = found.find((x) => re.test(x.name));
    if (s) picks.push([what, s]); else console.log(`\n(no series named like ${what} among the ${found.length} listed)`);
  }
  for (const [what, s] of picks) { await data(`${what}, frequency ${s.freq}`, s.db, s.code); await pause(GAP); }
  if (!picks.length) await data("the basic discount rate (an unofficial client's example code)", "IR01", "MADR1Z@D");
  console.log(`\n${found.length} series listed in all; ${picks.length} read.`);
}
