// The pattern for a probe, on a source the Monitor already uses (the US Treasury's daily par yield curve, read by
// jobs/backfill.ts and the server). Copy it for a new source: fetch, print what came back, write nothing.
//   Actions > source-probe > Run workflow: branch = the one holding the probe, probe = example
import { head, look } from "./lib.ts";

const y = new Date().getUTCFullYear();
head("US Treasury daily par yield curve, this year (CSV)");
const r = await look(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { show: 300 });
if (r.ok) {
  const lines = r.text.trim().split(/\r?\n/);
  console.log(`  ${lines.length - 1} rows; columns: ${lines[0]}`);
  console.log(`  newest row: ${lines[1]}`);
}
