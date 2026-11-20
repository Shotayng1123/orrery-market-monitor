// B-07: speculative positioning in futures, from the CFTC's Commitments of Traders, through its Public Reporting
// Environment (publicreporting.cftc.gov, a Socrata service; light use needs no key). A weekly job on GitHub would
// read, on Friday after the 15:30 ET release, the Traders in Financial Futures report (currencies, rates, equity
// indices) and the Disaggregated report (commodities), futures and options combined.
// The dataset identifiers below are what I believe them to be; each is tried, and its newest report date and its
// field names printed, so a wrong one shows at once.
// Runtime: node (a job on GitHub, started by the database after the Friday release).
//   Actions > source-probe > Run workflow: probe = cftc_cot, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const BASE = "https://publicreporting.cftc.gov/resource";
const q = (id: string, params: Record<string, string>) => `${BASE}/${id}.json?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
const DATE = "report_date_as_yyyy_mm_dd";

const DATASETS: Array<[string, string]> = [
  ["Traders in Financial Futures, futures and options combined", "yw9f-hn96"],
  ["Traders in Financial Futures, futures only", "gpe5-46if"],
  ["Disaggregated, futures and options combined", "kh3c-gbw2"],
  ["Disaggregated, futures only", "72hh-3qpy"],
  ["Legacy, futures only", "6dca-aqww"],
];
const FIN: Array<[string, string]> = [["Japanese yen (CME)", "097741"], ["E-mini S&P 500 (CME)", "13874A"], ["Nikkei 225, dollar (CME)", "240741"], ["10-year T-note (CBOT)", "043602"]];
const COM: Array<[string, string]> = [["Gold (COMEX)", "088691"], ["WTI crude, light sweet (NYMEX)", "067651"], ["Copper (COMEX)", "085692"]];

const found = new Map<string, Record<string, unknown>>();
for (const [name, id] of DATASETS) {
  head(`${name} (${id}): the newest row`);
  const r = await look(q(id, { $limit: "1", $order: `${DATE} DESC` }), { headers: { accept: "application/json" }, show: 0 });
  const row = ((J(r.text) as Array<Record<string, unknown>> | null) ?? [])[0];
  if (row) { found.set(id, row); console.log(`  newest report ${row[DATE]} · ${row.market_and_exchange_names}\n  fields (${Object.keys(row).length}): ${Object.keys(row).join(", ")}`); }
  else console.log(`  no row; first 300 chars: ${JSON.stringify(r.text.slice(0, 300))}`);
  await pause(600);
}

async function positions(id: string, list: Array<[string, string]>, groups: RegExp): Promise<void> {
  for (const [name, code] of list) {
    const r = await look(q(id, { $where: `cftc_contract_market_code='${code}'`, $order: `${DATE} DESC`, $limit: "2" }), { headers: { accept: "application/json" }, show: 0 });
    const rows = (J(r.text) as Array<Record<string, unknown>> | null) ?? [];
    for (const x of rows) {
      const keys = Object.keys(x).filter((k) => groups.test(k) && /positions_(long|short)/.test(k) && !/spread|pct|chg/i.test(k));
      console.log(`  ${name} ${x[DATE]}: open interest ${x.open_interest_all}; ${keys.map((k) => `${k} ${x[k]}`).join("; ")}`);
    }
    const c = await look(q(id, { $select: `count(*) as n, min(${DATE}) as first`, $where: `cftc_contract_market_code='${code}'` }), { headers: { accept: "application/json" }, show: 0 });
    const n = ((J(c.text) as Array<Record<string, unknown>> | null) ?? [])[0];
    if (n) console.log(`  ${name}: ${n.n} weekly reports since ${n.first}`);
    await pause(600);
  }
}
if (found.has("yw9f-hn96")) { head("Traders in Financial Futures (combined): leveraged funds and asset managers, the two newest reports, and the history's length"); await positions("yw9f-hn96", FIN, /lev_money|asset_mgr/); }
if (found.has("kh3c-gbw2")) { head("Disaggregated (combined): managed money, the two newest reports, and the history's length"); await positions("kh3c-gbw2", COM, /m_money/); }
