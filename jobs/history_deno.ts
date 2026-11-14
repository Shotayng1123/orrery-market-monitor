// Catch-up run of the daily history job outside the Edge Function: the same code as `daily?job=history`.
// The three weekday pg_cron runs miss a bar that Yahoo publishes late (on Saturday 14 Nov 2026 the Hang Seng,
// Straits Times and iron ore were still without Friday's close) and never book crypto's Friday and weekend
// days; this run, twice a day every day from GitHub Actions, picks those up.
//   deno run -A --node-modules-dir=none jobs/history_deno.ts
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import { history } from "../supabase/functions/_shared/history.ts";
import { logRun } from "../supabase/functions/_shared/db.ts";

const t0 = Date.now();
try {
  const detail = await history();
  console.log(detail);
  await logRun("history-actions", true, detail, t0);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  await logRun("history-actions", false, msg, t0);
  Deno.exitCode = 1;
}
