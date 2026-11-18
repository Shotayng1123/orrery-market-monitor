// The reasons for big moves (Shota, 18 Nov 2026). A stock page of a large company marks its big moves and puts
// each one without a reason on the queue (table move_causes; supabase/functions/_shared/stock.ts). This job takes
// the queue, newest move first, and for each one asks the model, with web search, for the reported reason.
// A reason is stored only with the reports behind it (pages the search returned); otherwise the move is stored
// as "not found". Nothing is guessed (the rules are in _shared/movecause.ts).
//
//   npx tsx move_causes.ts                 up to 60 moves
//   npx tsx move_causes.ts --max 10        fewer
//   npx tsx move_causes.ts --dry           ask and print, store nothing
// Needs ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: MOVE_CAUSE_MODEL (default
// claude-opus-5-5), MOVE_CAUSE_EFFORT (default medium). Each look-up prints what it cost.
import { db } from "./lib/db.js";
import { ask, newClient } from "./lib/llm.js";
import { CAUSE_SYSTEM, causeQuestion, readCause, type MoveCtx } from "../supabase/functions/_shared/movecause.js";

const arg = (k: string, d = ""): string => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] ?? d : d; };
const DRY = process.argv.includes("--dry");
const MAX = Math.max(1, Math.min(300, Number(arg("max", "60")) || 60));
const MODEL = process.env.MOVE_CAUSE_MODEL || "claude-opus-5-5", EFFORT = process.env.MOVE_CAUSE_EFFORT || "medium";
const SEARCHES = 4, PARALLEL = 3, MAX_TRIES = 3;

interface Row { symbol: string; kind: string; d: string; ctx: MoveCtx; tries: number }

async function main(): Promise<void> {
  const sb = db(), client = newClient();
  const { data, error } = await sb.from("move_causes").select("symbol,kind,d,ctx,tries").in("status", ["queued", "error"]).lt("tries", MAX_TRIES).order("d", { ascending: false }).limit(MAX);
  if (error) {
    // a database from before this change has no queue: that is not a failure of this job
    if (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|does not exist/i.test(error.message)) { console.log("The move_causes table is not in the database yet (the database change of 18 Nov 2026 has not been applied): nothing to look up."); return; }
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Row[];
  console.log(`${rows.length} move(s) to look up (model ${MODEL}, effort ${EFFORT}, up to ${SEARCHES} searches each)`);
  let found = 0, none = 0, failed = 0, cost = 0;
  const work = [...rows];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let r = work.shift(); r; r = work.shift()) {
      const tag = `${r.symbol} ${r.kind} ${r.d}`;
      try {
        const t = await ask(client, { model: MODEL, effort: EFFORT, system: CAUSE_SYSTEM, user: causeQuestion(r.ctx), maxSearches: SEARCHES });
        const a = readCause(t.text, t.pages);
        cost += t.costUsd;
        if (a.found) found++; else none++;
        console.log(`${tag}: ${a.found ? a.cause : "no report found"} [${t.searches} searches, $${t.costUsd.toFixed(3)}]${a.found ? ` <- ${a.sources.map((x) => x.url).join(" ")}` : ""}`);
        if (DRY) continue;
        const { error: e } = await sb.from("move_causes").update({ status: a.found ? "found" : "not_found", cause: a.cause, sources: a.sources, model: t.model, cost_usd: t.costUsd, tries: r.tries + 1, done_at: new Date().toISOString() }).eq("symbol", r.symbol).eq("kind", r.kind).eq("d", r.d);
        if (e) throw new Error(e.message);
      } catch (e) {
        failed++;
        console.warn(`${tag}: failed (${e instanceof Error ? e.message.slice(0, 200) : e})`);
        if (!DRY) await sb.from("move_causes").update({ status: "error", tries: r.tries + 1 }).eq("symbol", r.symbol).eq("kind", r.kind).eq("d", r.d);
      }
    }
  }));
  console.log(`done: ${found} with a reason, ${none} with none found, ${failed} failed; $${cost.toFixed(2)} in all`);
  if (!DRY && rows.length === MAX) { const { data: k } = await sb.rpc("move_causes_kick"); console.log(`more may be waiting: ${k ?? "the next run takes them"}`); }
  if (failed && failed === rows.length) process.exit(1);   // every look-up failed: something is wrong with the set-up, say so
}
main().catch((e) => { console.error(e); process.exit(1); });
