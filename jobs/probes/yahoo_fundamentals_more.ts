// A-02 (valuation: EV needs minority interests, EV/EBITDA needs D&A) and A-17 (more statement lines): which further
// series Yahoo's fundamentals time series carries, asked exactly as the server asks it for the statements
// (supabase/functions/_shared/stock.ts, yahooStatements: the same address, twelve years back, one request for the
// yearly series and one for the quarterly). For NVDA and 7203.T it prints, per series, how many periods came,
// their first and last dates and the last value; a series that does not come for a company is listed as absent.
// Runtime: deno (the server's stock page makes these requests from the edge runtime).
//   Actions > source-probe > Run workflow: probe = yahoo_fundamentals_more, runtime = deno
import { head, look } from "./lib.ts";

const TYPES = ["TotalRevenue", "DepreciationAndAmortization", "ReconciledDepreciation", "DepreciationAmortizationDepletion", "EBITDA", "NormalizedEBITDA", "EBIT", "InterestExpense",
  "MinorityInterest", "TotalDebt", "NetDebt", "CapitalLeaseObligations", "LongTermCapitalLeaseObligation", "CurrentCapitalLeaseObligation",
  "AccountsReceivable", "Inventory", "AccountsPayable", "Goodwill", "OtherIntangibleAssets", "GoodwillAndOtherIntangibleAssets", "ShareIssued", "TreasurySharesNumber", "OrdinarySharesNumber"];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 12 * 366 * 86400;

for (const sym of ["NVDA", "7203.T"]) {
  for (const scope of ["annual", "quarterly"] as const) {
    head(`${sym}, ${scope} series`);
    const types = TYPES.map((t) => scope + t).join(",");
    const r = await look(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types}&period1=${p1}&period2=${p2}`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, show: 0, timeoutMs: 30000 });
    const result = ((J(r.text) as { timeseries?: { result?: Array<Record<string, unknown> & { meta?: { type?: string[] } }> } } | null)?.timeseries?.result ?? []);
    const seen = new Set<string>();
    for (const x of result) {
      const type = x.meta?.type?.[0]; if (!type) continue;
      const vals = ((x[type] as Array<{ asOfDate?: string; currencyCode?: string; reportedValue?: { raw?: number } } | null> | undefined) ?? []).filter((v): v is { asOfDate?: string; currencyCode?: string; reportedValue?: { raw?: number } } => !!v && v.reportedValue?.raw != null);
      if (!vals.length) continue;
      seen.add(type.slice(scope.length));
      const last = vals[vals.length - 1];
      console.log(`  ${type.slice(scope.length)}: ${vals.length} periods ${vals[0].asOfDate} .. ${last.asOfDate}; last ${last.reportedValue?.raw} ${last.currencyCode ?? ""}`);
    }
    const absent = TYPES.filter((t) => !seen.has(t));
    console.log(`  absent for ${sym} (${scope}): ${absent.length ? absent.join(", ") : "none"}`);
    await pause(800);
  }
}
