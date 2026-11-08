// Runs the constituent statistics (and optionally money flow) for one or more indices with Deno, outside the
// Edge Function's time limits. Same code as the `daily` function; used by GitHub Actions for TOPIX (1,600+
// names) and as a manual fallback for any index.
//   deno run -A jobs/stats_deno.ts TOPIX            statistics (5y closes, breadth history, quotes)
//   deno run -A jobs/stats_deno.ts TOPIX --mflow    net money flow from minute bars as well
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import { computeIndexStats, computeMoneyFlow } from "../supabase/functions/_shared/istats.ts";
import type { IndexId } from "../supabase/functions/_shared/constituents.ts";
import { logRun } from "../supabase/functions/_shared/db.ts";

const args = Deno.args.filter((a) => !a.startsWith("--"));
const mflowOnly = Deno.args.includes("--mflow-only");
const mflow = mflowOnly || Deno.args.includes("--mflow");
const idxs = (args.length ? args : ["TOPIX"]) as IndexId[];
for (const idx of idxs) {
  const t0 = Date.now();
  try {
    if (!mflowOnly) {
      const detail = await computeIndexStats(idx, (s) => console.log("  " + s));
      console.log(`stats ${detail}`);
      await logRun(`stats-actions:${idx}`, true, detail, t0);
    }
    if (mflow) { const d2 = await computeMoneyFlow(idx, (s) => console.log("  " + s)); console.log(`mflow ${d2}`); await logRun(`mflow-actions:${idx}`, true, d2, t0); }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${idx}: ${msg}`);
    await logRun(`stats-actions:${idx}`, false, msg, t0);
    Deno.exitCode = 1;
  }
}
