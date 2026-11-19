// B-10: liquidity and funding, US side. What a daily job on GitHub would read:
//   - the New York Fed's Markets Data API (already reached from GitHub by jobs/fed.ts): SOFR and EFFR with their
//     percentiles and volumes, the overnight reverse repo and the standing repo operations;
//   - the Treasury's FiscalData API: the Daily Treasury Statement's operating cash balance (the TGA);
//   - the Federal Reserve Board: the H.4.1 release (total assets, reserve balances) and the rate of interest on
//     reserve balances (IORB). The Board's data download addresses are candidates (marked so).
// Runtime: node (a job on GitHub, started by the database after each release).
//   Actions > source-probe > Run workflow: probe = us_liquidity, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const NY = "https://markets.newyorkfed.org/api";
const H = { headers: { accept: "application/json" }, show: 0 };

head("New York Fed: SOFR, the last 5 publications (rate, percentiles, volume)");
{
  const r = await look(`${NY}/rates/secured/sofr/last/5.json`, H);
  const rows = ((J(r.text) as { refRates?: Array<Record<string, unknown>> } | null)?.refRates ?? []);
  for (const x of rows) console.log(`  ${x.effectiveDate}: ${x.percentRate}% (1st ${x.percentPercentile1}, 25th ${x.percentPercentile25}, 75th ${x.percentPercentile75}, 99th ${x.percentPercentile99}), volume ${x.volumeInBillions}bn`);
  if (rows[0]) console.log(`  fields: ${Object.keys(rows[0]).join(", ")}`);
}
await pause(400);
head("New York Fed: EFFR, the last 5 publications (rate, target range, percentiles)");
{
  const r = await look(`${NY}/rates/unsecured/effr/last/5.json`, H);
  const rows = ((J(r.text) as { refRates?: Array<Record<string, unknown>> } | null)?.refRates ?? []);
  for (const x of rows) console.log(`  ${x.effectiveDate}: ${x.percentRate}% (target ${x.targetRateFrom}–${x.targetRateTo}; 1st ${x.percentPercentile1}, 99th ${x.percentPercentile99}), volume ${x.volumeInBillions}bn`);
}
await pause(400);
head("New York Fed: SOFR's first month (April 2018), for the history's length");
{
  const r = await look(`${NY}/rates/secured/sofr/search.json?startDate=2018-04-01&endDate=2018-04-30`, H);
  const rows = ((J(r.text) as { refRates?: Array<{ effectiveDate: string }> } | null)?.refRates ?? []);
  console.log(`  ${rows.length} days in April 2018${rows.length ? `, from ${rows.map((x) => x.effectiveDate).sort()[0]}` : ""}`);
}
for (const [what, path] of [["overnight reverse repo operations", "rp/reverserepo/all/results/last/5.json"], ["repo operations (the standing repo facility)", "rp/repo/all/results/last/5.json"]]) {
  await pause(400);
  head(`New York Fed: ${what}, the last 5 results`);
  const r = await look(`${NY}/${path}`, { ...H, show: 300 });
  const ops = ((J(r.text) as { repo?: { operations?: Array<Record<string, unknown>> } } | null)?.repo?.operations ?? []);
  for (const o of ops) console.log(`  ${o.operationDate} ${o.operationType ?? ""} ${o.term ?? ""}: accepted ${o.totalAmtAccepted}, submitted ${o.totalAmtSubmitted}`);
  if (ops[0]) console.log(`  fields: ${Object.keys(ops[0]).join(", ")}`);
}

await pause(400);
head("US Treasury FiscalData: Daily Treasury Statement, operating cash balance (the TGA), newest rows");
{
  const r = await look("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?sort=-record_date&page%5Bsize%5D=8", H);
  const j = J(r.text) as { data?: Array<Record<string, unknown>>; meta?: Record<string, unknown> } | null;
  for (const x of j?.data ?? []) console.log(`  ${x.record_date} | ${x.account_type} | open today ${x.open_today_bal} | close today ${x.close_today_bal}`);
  if (j?.data?.[0]) console.log(`  fields: ${Object.keys(j.data[0]).join(", ")}; total rows ${String(j.meta?.["total-count"] ?? "?")}`);
}

await pause(400);
head("Federal Reserve Board: H.4.1, the current release (total assets, reserve balances)");
{
  const r = await look("https://www.federalreserve.gov/releases/h41/current/h41.htm", { show: 0 });
  if (r.ok) {
    const t = strip(r.text);
    for (const k of ["Release Date", "Reserve balances with Federal Reserve Banks", "Total assets", "Reverse repurchase agreements", "U.S. Treasury, General Account"]) {
      const at = t.indexOf(k);
      console.log(`  ${k}: ${at < 0 ? "not found" : `…${t.slice(at, at + 160)}…`}`);
    }
  }
}
await pause(400);
head("Federal Reserve Board: data download, the whole H.4.1 release as one file (candidate address; status and size only)");
await look("https://www.federalreserve.gov/datadownload/Output.aspx?rel=H41&filetype=zip", { show: 0, timeoutMs: 60000 });
await pause(400);
head("Federal Reserve Board: interest on reserve balances (IORB), its page");
{
  const r = await look("https://www.federalreserve.gov/monetarypolicy/reserve-balances.htm", { show: 0 });
  if (r.ok) {
    const t = strip(r.text);
    const hits = [...t.matchAll(/\b\d{1,2}\.\d{2}\b/g)].slice(0, 6).map((m) => `…${t.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + 20)}…`);
    for (const h of hits) console.log(`  ${h}`);
    if (!hits.length) console.log("  no rate figure found in the page's text");
  }
}
