// A-01 (ten years of US statements), A-05 (US filings), A-06 (report times), A-07 (segments), A-10 (insiders and
// holders): SEC EDGAR, official and free, from GitHub's machines. What a job would read, for NVIDIA (CIK 1045810):
//   company_tickers.json (ticker -> CIK), submissions (every filing with its form, items and acceptance time),
//   companyfacts (the XBRL facts of every filing), one frames call (one line for every filer), and the files of the
//   latest 10-K (whose own XBRL holds the segment facts that companyfacts does not carry).
// The SEC asks automated clients to declare who they are (a name and a contact) in the User-Agent. Which identity
// the Monitor declares is the owner's choice (OD-4), so this probe sends none of the owner's details: it says only
// that it is a read-only test. Six requests, 0.4 s apart (the SEC's limit is ten a second). A refusal for want of a
// declared identity is a finding.
// Runtime: node (a job on GitHub; whether the SEC answers Supabase's edge runtime is not tested by this workflow).
//   Actions > source-probe > Run workflow: probe = sec_edgar, runtime = node
import { head, look } from "./lib.ts";

const SEC_UA = "source-probe/1.0 (read-only test run from GitHub Actions)";
const H = { "user-agent": SEC_UA, accept: "application/json" };
const pause = () => new Promise((r) => setTimeout(r, 400));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const CIK = 1045810, CIK10 = String(CIK).padStart(10, "0");
const since = (days: number) => new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);

head("SEC: ticker to CIK map (company_tickers.json)");
{
  const r = await look("https://www.sec.gov/files/company_tickers.json", { headers: H, show: 200 });
  const j = J(r.text) as Record<string, { cik_str: number; ticker: string; title: string }> | null;
  if (j) { const all = Object.values(j); const nv = all.find((x) => x.ticker === "NVDA"); console.log(`  ${all.length} tickers; NVDA -> CIK ${nv?.cik_str} (${nv?.title})`); }
}

await pause();
head(`SEC: submissions of NVIDIA (CIK${CIK10})`);
let tenK: { acc: string; date: string } | null = null;
{
  const r = await look(`https://data.sec.gov/submissions/CIK${CIK10}.json`, { headers: H, show: 0 });
  const j = J(r.text) as { name?: string; fiscalYearEnd?: string; tickers?: string[]; exchanges?: string[]; sicDescription?: string; filings?: { recent?: Record<string, string[]>; files?: unknown[] } } | null;
  const f = j?.filings?.recent;
  if (j && f) {
    const n = f.form?.length ?? 0, idx = Array.from({ length: n }, (_, i) => i);
    const row = (i: number) => `${f.form[i]} filed ${f.filingDate[i]}, accepted ${f.acceptanceDateTime[i]}${f.items?.[i] ? `, items ${f.items[i]}` : ""} · ${f.accessionNumber[i]} · ${f.primaryDocument?.[i] ?? ""}`;
    console.log(`  ${j.name}; fiscal year ends ${j.fiscalYearEnd} (MMDD); ${j.tickers?.join(",")} on ${j.exchanges?.join(",")}; ${j.sicDescription}`);
    console.log(`  ${n} recent filings (${f.filingDate?.[n - 1]} .. ${f.filingDate?.[0]}); ${j.filings?.files?.length ?? 0} older pages`);
    for (const form of ["10-K", "10-Q", "8-K"]) { const i = idx.find((k) => f.form[k] === form); if (i != null) console.log(`  newest ${row(i)}`); }
    const yr = since(400);
    const results = idx.filter((i) => f.form[i] === "8-K" && (f.items?.[i] ?? "").split(",").includes("2.02") && f.filingDate[i] >= yr);
    console.log(`  8-K with item 2.02 (results) since ${yr}: ${results.length}; newest three: ${results.slice(0, 3).map((i) => f.acceptanceDateTime[i]).join(", ")}`);
    const count = (re: RegExp) => idx.filter((i) => re.test(f.form[i]) && f.filingDate[i] >= since(365)).length;
    console.log(`  in the last 365 days: Form 4 ${count(/^4$/)}, Schedule 13D/G ${count(/13[DG]/)}, 10-Q ${count(/^10-Q$/)}, 8-K ${count(/^8-K$/)}`);
    const k = idx.find((i) => f.form[i] === "10-K");
    if (k != null) tenK = { acc: f.accessionNumber[k], date: f.filingDate[k] };
  }
}

await pause();
head(`SEC: companyfacts of NVIDIA (the XBRL facts of every filing)`);
{
  const r = await look(`https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK10}.json`, { headers: H, show: 0, timeoutMs: 60000 });
  type Fact = { start?: string; end: string; val: number; fy?: number; fp?: string; form?: string; filed?: string; frame?: string };
  const j = J(r.text) as { facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>> } | null;
  const g = j?.facts?.["us-gaap"];
  if (g) {
    console.log(`  ${Object.keys(g).length} us-gaap concepts; taxonomies: ${Object.keys(j!.facts!).join(", ")}`);
    const days = (x: Fact) => (x.start ? (Date.parse(x.end) - Date.parse(x.start)) / 86400e3 : 0);
    for (const [concept, unit] of [["Revenues", "USD"], ["RevenueFromContractWithCustomerExcludingAssessedTax", "USD"], ["OperatingIncomeLoss", "USD"], ["NetIncomeLoss", "USD"], ["DepreciationDepletionAndAmortization", "USD"], ["EarningsPerShareDiluted", "USD/shares"], ["WeightedAverageNumberOfDilutedSharesOutstanding", "shares"], ["MinorityInterest", "USD"]]) {
      const xs = g[concept]?.units?.[unit] ?? [];
      if (!xs.length) { console.log(`  ${concept}: none`); continue; }
      const fy = [...new Map(xs.filter((x) => x.form === "10-K" && days(x) > 350 && days(x) < 380).map((x) => [x.end, x])).values()].sort((a, b) => a.end.localeCompare(b.end));
      const qs = new Set(xs.filter((x) => days(x) > 80 && days(x) < 100).map((x) => x.end));
      console.log(`  ${concept} (${unit}): ${xs.length} facts; ${fy.length} fiscal years ${fy[0]?.end ?? "–"} .. ${fy[fy.length - 1]?.end ?? "–"} (last ${fy[fy.length - 1]?.val ?? "–"}, filed ${fy[fy.length - 1]?.filed ?? "–"}); ${qs.size} three-month periods`);
    }
  }
}

await pause();
head("SEC: frames API, one figure for every filer (revenue, calendar year 2024), for bulk use (peers, screener)");
{
  const r = await look("https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2024.json", { headers: H, show: 0, timeoutMs: 60000 });
  const j = J(r.text) as { data?: unknown[]; label?: string } | null;
  if (j) console.log(`  ${j.label}: ${j.data?.length ?? 0} filers`);
}

if (tenK) {
  await pause();
  const folder = `https://www.sec.gov/Archives/edgar/data/${CIK}/${tenK.acc.replace(/-/g, "")}`;
  head(`SEC: the files of the latest 10-K (${tenK.date}), for its own XBRL (segments)`);
  const r = await look(`${folder}/index.json`, { headers: H, show: 0 });
  const names = ((J(r.text) as { directory?: { item?: Array<{ name: string; size?: string }> } } | null)?.directory?.item ?? []).map((x) => x.name);
  console.log(`  ${names.length} files: ${names.slice(0, 20).join(", ")}${names.length > 20 ? " …" : ""}`);
  const inst = names.find((n) => /_htm\.xml$/i.test(n)) ?? names.find((n) => /\.xml$/i.test(n) && !/FilingSummary|_(cal|def|lab|pre)\.xml$/i.test(n));
  if (inst) {
    await pause();
    const x = await look(`${folder}/${inst}`, { headers: { ...H, accept: "application/xml" }, show: 0, timeoutMs: 90000 });
    if (x.ok) for (const k of ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis", "ConcentrationRiskByBenchmarkAxis", "dei:AuditorName", "AuditorName"]) console.log(`  ${k}: ${x.text.split(k).length - 1} occurrences`);
  } else console.log("  no XBRL instance among the files");
}
