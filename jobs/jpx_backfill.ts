// One-off: JPX daily short-selling share for the last twelve months from the monthly archive pages.
//   deno run -A jobs/jpx_backfill.ts [months]      (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment)
import { backfillShortRatio } from "../supabase/functions/_shared/jpx.ts";

const months = Number(Deno.args[0] ?? "12");
console.log(await backfillShortRatio(months, (s) => console.log(s)));
