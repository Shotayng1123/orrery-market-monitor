// B-09: US real yields and breakevens. The Treasury's daily par real yield curve comes from the same data centre, in
// the same CSV form, as the nominal par curve the server already reads (supabase/functions/daily/index.ts,
// treasuryUrl), with type=daily_treasury_real_yield_curve. A breakeven would be worked out on the page as the
// nominal par yield less the real par yield of the same date and tenor; this probe prints both for the newest date.
// Runtime: deno (the server's daily curves job would make these requests).
//   Actions > source-probe > Run workflow: probe = ust_real_curve, runtime = deno
import { head, look } from "./lib.ts";

const y = new Date().getUTCFullYear();
const u = (type: string, year: number) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=${type}&field_tdr_date_value=${year}&page&_format=csv`;
const split = (l: string) => l.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
const iso = (mdY: string) => { const m = mdY.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
function table(text: string): { cols: string[]; rows: Array<{ d: string; cells: string[] }> } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const cols = split(lines[0] ?? "");
  const rows = lines.slice(1).map(split).map((c) => ({ d: iso(c[0] ?? "") ?? "", cells: c })).filter((r) => r.d).sort((a, b) => b.d.localeCompare(a.d));
  return { cols, rows };
}
const col = (cols: string[], years: number) => cols.findIndex((c) => new RegExp(`^${years}\\s*Y`, "i").test(c));

head(`US Treasury daily par REAL yield curve, ${y} (CSV)`);
const real = await look(u("daily_treasury_real_yield_curve", y), { show: 300 });
const R = real.ok ? table(real.text) : null;
if (R) {
  console.log(`  columns: ${R.cols.join(" | ")}`);
  console.log(`  ${R.rows.length} rows this year; newest ${R.rows[0]?.d}: ${R.rows[0]?.cells.slice(1).join(", ")}`);
  console.log(`  oldest this year ${R.rows[R.rows.length - 1]?.d}`);
}

head("the same curve for 2016 (the first year of the Monitor's curve history), for the history's length");
const r16 = await look(u("daily_treasury_real_yield_curve", 2016), { show: 0 });
if (r16.ok) { const T = table(r16.text); console.log(`  2016: ${T.rows.length} rows, ${T.rows[T.rows.length - 1]?.d} .. ${T.rows[0]?.d}; columns ${T.cols.join(" | ")}`); }

head(`US Treasury daily par NOMINAL yield curve, ${y}: the same date, for the breakevens`);
const nom = await look(u("daily_treasury_yield_curve", y), { show: 0 });
if (nom.ok && R?.rows.length) {
  const N = table(nom.text), d = R.rows[0].d, n = N.rows.find((r) => r.d === d);
  if (!n) console.log(`  the nominal curve has no row for ${d} (its newest is ${N.rows[0]?.d})`);
  else for (const t of [5, 10, 30]) {
    const rv = Number(R.rows[0].cells[col(R.cols, t)]), nv = Number(n.cells[col(N.cols, t)]);
    console.log(`  ${d} ${t}Y: nominal ${Number.isFinite(nv) ? nv : "–"}%, real ${Number.isFinite(rv) ? rv : "–"}%${Number.isFinite(nv) && Number.isFinite(rv) ? `, breakeven ${(nv - rv).toFixed(2)}% (worked out here)` : ""}`);
  }
}
