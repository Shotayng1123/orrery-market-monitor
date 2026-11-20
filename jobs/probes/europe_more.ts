// B-02 euro area and United Kingdom (must), B-09 euro area, B-13 (Italy, France), B-06 and B-11: Europe's official
// series beyond what the 19 Nov probe read. Three hosts GitHub's machines already reach (Eurostat, the ECB Data Portal,
// the ONS) and one new path of the ONS.
// Why now: on 19 Nov (econ_offices) Eurostat's euro-area HICP came back with "updated 2026-02-06" and its newest month
// 2025-12, and the euro-area (EA20) unemployment rate came back as dashes for 2026-08..10. Two changes of 2026 explain
// it, both read through search extracts of Eurostat's own pages: "Starting with the HICP data for January 2026, the
// European classification of individual consumption according to purpose (ECOICOP) version 2 ... replaces the
// ECOICOP", with the new datasets in a folder prc_hicp_ecoicop2 and the old ones archived (ec.europa.eu/eurostat/web/
// hicp/information-data); and Eurostat's glossary (Euro area enlargements) lists "EA-21 (from 1 January 2026)" as EA-20
// and Bulgaria. The ONS says its v0 timeseries endpoint "currently returns a 404" and points to its v1 search and data
// endpoints (developer.ons.gov.uk/retirement/v0api/); the "/data" pages read on 19 Nov still answered.
// What it checks (no key, no secret, nothing written; ten requests, eleven at most, 0.7 s apart):
//   - Eurostat prc_hicp_minr (HICP, ECOICOP ver.2, monthly index and rates; the code is from Eurostat's v2 folder as
//     mirrors list it), euro area (geo EA, then EA21 if EA is refused): the dimensions and codes, and the newest values
//     of all items and of the ex energy, food, alcohol and tobacco aggregate where the codes CP00 and TOT_X_NRG_FOOD
//     still exist;
//   - Eurostat une_rt_m, ei_bssi_m_r2 (the Commission's Economic Sentiment Indicator, BS-ESI-I, seasonally adjusted),
//     sts_inpr_m (industrial production, B-D) and sts_trtu_m (retail trade, G47): asked with no geo filter, so the
//     answer shows which euro-area codes (EA, EA20, EA21) carry 2026 values; the newest two months for EA* and EU*;
//   - ECB CISS (Composite Indicator of Systemic Stress), euro area and US: the keys CISS.D.U2.Z0Z.4F.EC.SS_CIN.IDX and
//     CISS.D.US.Z0Z.4F.EC.SS_CIN.IDX are on the ECB Data Portal; "The CISS data for the Euro Area and the US is updated
//     weekly on Monday with the figures for the previous week" (data.ecb.europa.eu/data/datasets/CISS/data-information);
//   - ECB Survey of Professional Forecasters, the newest round's averages of every topic, breakdown and horizon (the
//     point-forecast code is not known: the answer lists them); quarterly, the Q4 2026 round published 30 Oct 2026;
//   - ECB IRS, the monthly long-term interest rates for convergence purposes of Italy, France and Germany (key pattern
//     IRS.M.<area>.L.L40.CI.0000.EUR.N.Z, as on the portal's pages for other countries);
//   - ONS v1: the search endpoint for the CDIDs D7G7 (CPI annual rate, read on 19 Nov), K222 and J5EK (candidates for
//     the index of production and retail sales volume: the answer's titles say what they are), and the data endpoint
//     for D7G7's uri.
// Serves: B-02 euro area (HICP and core, unemployment, industrial production and retail y/y, the ESI as "one business
// survey where a free one exists": I-21), B-02 United Kingdom (CPI, production, retail sales from the ONS's current
// API: I-21), B-09 euro area (survey expectations, labelled as a survey, where no market breakeven is free: I-15),
// B-13 (Italy and France 10Y, monthly, against the Bund), B-06 and B-11 (an official stress gauge beside the PROXY
// credit funds: I-23).
// Terms: Eurostat: reuse "for commercial or non-commercial purposes is authorised provided the source is
// acknowledged" (ec.europa.eu/eurostat/help/copyright-notice). ECB: "All publicly available ESCB statistics may be
// reused free of charge on the condition that the source is quoted (e.g. "Source: ECB statistics.") and that the
// statistics (including metadata) are not modified" (ecb.europa.eu, ESCB statistics usage policy). ONS: not read here.
// Runtime: node (a job on GitHub, or the server's daily job for the ECB parts, as today).
//   Actions > source-probe > Run workflow: probe = europe_more, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const GAP = 700;

/** Rows of a CSV text, with quoted fields. */
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
const records = (text: string): Array<Record<string, string>> => {
  const [hdr, ...body] = csv(text);
  return hdr ? body.map((r) => Object.fromEntries(hdr.map((h, i) => [h.trim(), (r[i] ?? "").trim()]))) : [];
};

// ---------- JSON-stat 2.0, as Eurostat sends it ----------
type JStat = {
  label?: string; updated?: string; id?: string[]; size?: number[];
  value?: Record<string, number | null> | Array<number | null>;
  dimension?: Record<string, { label?: string; category?: { index?: Record<string, number> | string[]; label?: Record<string, string> } }>;
  error?: unknown;
};
interface Obs { k: Record<string, string>; v: number }
/** The codes of one dimension, in their order. */
function codesOf(j: JStat, d: string): string[] {
  const idx = j.dimension?.[d]?.category?.index;
  if (Array.isArray(idx)) return idx;
  const out: string[] = [];
  for (const [c, p] of Object.entries(idx ?? {})) out[p] = c;
  return out;
}
/** Every non-empty value with its code in each dimension (the flat index read in row-major order). */
function observations(j: JStat): Obs[] {
  const ids = j.id ?? [], size = j.size ?? [], codes = ids.map((d) => codesOf(j, d));
  const entries: Array<[number, number | null]> = Array.isArray(j.value)
    ? j.value.map((v, i): [number, number | null] => [i, v])
    : Object.entries(j.value ?? {}).map(([k, v]): [number, number | null] => [Number(k), v]);
  const out: Obs[] = [];
  for (const [flat0, v] of entries) {
    if (v === null || v === undefined) continue;
    let flat = flat0;
    const k: Record<string, string> = {};
    for (let i = ids.length - 1; i >= 0; i--) { k[ids[i]] = codes[i][flat % size[i]] ?? "?"; flat = Math.floor(flat / size[i]); }
    out.push({ k, v });
  }
  return out;
}
/** Prints a Eurostat answer: its label and dimensions (with a few codes of each small one), then the newest two
 *  periods of every series `keep` accepts, one line per series. Returns false when the answer is not a dataset. */
function showStat(text: string, keep: (k: Record<string, string>) => boolean, maxSeries = 16): boolean {
  const j = J(text) as JStat | null;
  if (!j) { console.log("  the answer is not JSON"); return false; }
  if (!j.id || !j.size || !j.dimension) { console.log(`  no dataset in the answer: ${JSON.stringify(j.error ?? j).slice(0, 300)}`); return false; }
  console.log(`  ${j.label ?? "?"}; updated ${j.updated ?? "?"}`);
  console.log(`  dimensions: ${j.id.map((d, i) => `${d}=${j.size?.[i]}`).join(" ")}`);
  for (const d of j.id) {
    if (d === "time" || d === "geo") continue;
    const cs = codesOf(j, d);
    if (cs.length > 1) console.log(`  ${d}: ${cs.slice(0, 14).join(", ")}${cs.length > 14 ? ` … (${cs.length})` : ""}`);
  }
  const geos = codesOf(j, "geo").filter((g) => /^E[AU]/.test(g));
  if (geos.length) console.log(`  euro-area and EU codes in the answer: ${geos.join(", ")}`);
  const series = new Map<string, Array<[string, number]>>();
  for (const o of observations(j)) {
    if (!keep(o.k)) continue;
    const name = j.id.filter((d) => d !== "time" && d !== "freq").map((d) => o.k[d]).join(" ");
    const list = series.get(name) ?? [];
    list.push([o.k.time ?? "?", o.v]);
    series.set(name, list);
  }
  console.log(`  ${series.size} series kept${series.size > maxSeries ? `; the first ${maxSeries}` : ""}:`);
  for (const [name, list] of [...series.entries()].slice(0, maxSeries)) {
    list.sort((a, b) => a[0].localeCompare(b[0]));
    console.log(`  ${name}: ${list.slice(-2).map(([t, v]) => `${t} ${v}`).join(", ")}`);
  }
  return true;
}
const euroEU = (k: Record<string, string>) => /^E[AU]/.test(k.geo ?? "");

const ES = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const JA = { headers: { accept: "application/json" }, show: 0, timeoutMs: 90000 };

head("Eurostat: HICP, ECOICOP ver.2 (prc_hicp_minr), euro area (geo EA): dimensions, and all items / core where coded CP00 / TOT_X_NRG_FOOD");
{
  const hicp = (k: Record<string, string>) => Object.entries(k).some(([d, c]) => /coicop/i.test(d) && /^(CP00|TOT_X_NRG_FOOD|TOTAL)$/.test(c));
  let r = await look(`${ES}/prc_hicp_minr?format=JSON&lang=EN&geo=EA&lastTimePeriod=2`, JA);
  if (!r.text || !showStat(r.text, hicp)) {
    await pause(GAP);
    console.log("  asked again with geo EA21:");
    r = await look(`${ES}/prc_hicp_minr?format=JSON&lang=EN&geo=EA21&lastTimePeriod=2`, JA);
    if (r.text) showStat(r.text, hicp);
  }
}

for (const [what, url, keep] of [
  ["Eurostat: unemployment rate, seasonally adjusted, total, % of labour force (une_rt_m), every area: EA* and EU*",
    `${ES}/une_rt_m?format=JSON&lang=EN&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&lastTimePeriod=2`, euroEU],
  ["Eurostat: Economic Sentiment Indicator, seasonally adjusted (ei_bssi_m_r2, BS-ESI-I), every area: EA* and EU*",
    `${ES}/ei_bssi_m_r2?format=JSON&lang=EN&indic=BS-ESI-I&s_adj=SA&lastTimePeriod=2`, euroEU],
  ["Eurostat: industrial production, B-D (sts_inpr_m), every area and unit: EA* and EU*, y/y (PCH_SM) where it exists",
    `${ES}/sts_inpr_m?format=JSON&lang=EN&nace_r2=B-D&lastTimePeriod=1`, (k: Record<string, string>) => euroEU(k) && k.unit === "PCH_SM"],
  ["Eurostat: retail trade, G47 (sts_trtu_m), every area, indicator and unit: EA* and EU*, y/y (PCH_SM) where it exists",
    `${ES}/sts_trtu_m?format=JSON&lang=EN&nace_r2=G47&lastTimePeriod=1`, (k: Record<string, string>) => euroEU(k) && k.unit === "PCH_SM"],
] as Array<[string, string, (k: Record<string, string>) => boolean]>) {
  await pause(GAP);
  head(what);
  const r = await look(url, JA);
  if (r.text) showStat(r.text, keep);
}

const ECB = "https://data-api.ecb.europa.eu/service/data";
const CA = { headers: { accept: "text/csv" }, show: 0, timeoutMs: 90000 };
await pause(GAP);
head("ECB: CISS, euro area and United States (SS_CIN), the three newest daily figures");
{
  const r = await look(`${ECB}/CISS/D.U2+US.Z0Z.4F.EC.SS_CIN.IDX?format=csvdata&lastNObservations=3`, CA);
  if (r.ok) for (const x of records(r.text)) console.log(`  ${x.KEY} | ${x.TIME_PERIOD} | ${x.OBS_VALUE} | ${(x.TITLE ?? "").slice(0, 70)}`);
  else if (r.text) console.log(`  ${r.text.slice(0, 300)}`);
}

await pause(GAP);
head("ECB: Survey of Professional Forecasters, the newest round, euro area, averages (FCT_SOURCE AVG) of every topic, breakdown and horizon");
{
  const r = await look(`${ECB}/SPF/Q.U2.....AVG?format=csvdata&lastNObservations=1&detail=dataonly`, CA);
  if (r.ok) {
    const rs = records(r.text);
    const parts = (x: Record<string, string>) => (x.KEY ?? "").split(".");        // SPF.Q.U2.<topic>.<breakdown>.<horizon>.Q.AVG
    const topics = [...new Set(rs.map((x) => parts(x)[3]))];
    const breakdowns = [...new Set(rs.map((x) => parts(x)[4]))];
    console.log(`  ${rs.length} series; topics: ${topics.join(", ")}`);
    console.log(`  breakdowns (${breakdowns.length}): ${breakdowns.slice(0, 40).join(", ")}`);
    const notBin = rs.filter((x) => !/^F[N0-9]|^T[N0-9]/.test(parts(x)[4] ?? ""));
    console.log(`  ${notBin.length} series whose breakdown is not a probability bin; the first 24:`);
    for (const x of notBin.slice(0, 24)) console.log(`  ${x.KEY} | ${x.TIME_PERIOD} | ${x.OBS_VALUE}`);
  } else if (r.text) console.log(`  ${r.text.slice(0, 300)}`);
}

await pause(GAP);
head("ECB: long-term interest rates for convergence purposes (IRS), Italy, France, Germany, the two newest months");
{
  const r = await look(`${ECB}/IRS/M.IT+FR+DE.L.L40.CI.0000.EUR.N.Z?format=csvdata&lastNObservations=2`, CA);
  if (r.ok) for (const x of records(r.text)) console.log(`  ${x.KEY} | ${x.TIME_PERIOD} | ${x.OBS_VALUE} | ${(x.TITLE ?? "").slice(0, 70)}`);
  else if (r.text) console.log(`  ${r.text.slice(0, 300)}`);
}

/** Every object in a JSON answer, depth first. */
function objects(x: unknown, out: Array<Record<string, unknown>> = [], depth = 0): Array<Record<string, unknown>> {
  if (depth > 10 || x === null || typeof x !== "object") return out;
  if (Array.isArray(x)) { for (const v of x) objects(v, out, depth + 1); return out; }
  const o = x as Record<string, unknown>;
  out.push(o);
  for (const v of Object.values(o)) objects(v, out, depth + 1);
  return out;
}
const ONS = "https://api.beta.ons.gov.uk/v1";
await pause(GAP);
head("ONS v1: search by CDID (D7G7 known; K222 and J5EK candidates): each item's title and uri");
{
  const r = await look(`${ONS}/search?content_type=timeseries&cdids=D7G7,K222,J5EK`, { ...JA, show: 200 });
  const j = J(r.text);
  if (j !== null) {
    const items = objects(j).filter((o) => typeof o.uri === "string");
    console.log(`  ${items.length} items with a uri:`);
    for (const o of items.slice(0, 8)) console.log(`  ${String(o.cdid ?? "?")} | ${String(o.title ?? "").slice(0, 90)} | ${String(o.uri)} | released ${String(o.release_date ?? "?")}`);
  }
}
await pause(GAP);
head("ONS v1: the data endpoint for D7G7 (CPI annual rate), the uri read on 19 Nov");
{
  const r = await look(`${ONS}/data?uri=${encodeURIComponent("/economy/inflationandpriceindices/timeseries/d7g7/mm23")}`, { ...JA, show: 200 });
  const j = J(r.text) as { description?: Record<string, unknown>; months?: Array<{ date?: string; value?: string }> } | null;
  if (j?.description) {
    const d = j.description;
    console.log(`  ${String(d.title ?? "?")}; release ${String(d.releaseDate ?? "?")}; next ${String(d.nextRelease ?? "?")}`);
    console.log(`  ${j.months?.length ?? 0} months; newest: ${(j.months ?? []).slice(-3).map((m) => `${m.date} ${m.value}`).join(", ")}`);
  }
}
