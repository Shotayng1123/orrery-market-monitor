// The reasons for big moves (Shota, 18 Nov 2026). A stock page of a large company marks its big moves and puts
// each one without a reason on the queue (table move_causes; supabase/functions/_shared/stock.ts). This job takes
// the queue, newest move first, and for each one asks the model, with web search, for the reported reason.
// A reason is stored only with the reports behind it (pages the search returned); otherwise the move is stored
// as "not found". Nothing is guessed (the rules are in _shared/movecause.ts).
//
//   npx tsx move_causes.ts                 up to 30 moves
//   npx tsx move_causes.ts --max 10        fewer
//   npx tsx move_causes.ts --dry           ask and print, store nothing
//   npx tsx move_causes.ts --again         also look again at moves stored as "not found" (fewer than three tries)
//   npx tsx move_causes.ts --symbol CRWV   only that stock's moves
//   npx tsx move_causes.ts --redo          every move chosen, also one that already has its answer (with --symbol)
//   npx tsx move_causes.ts --parallel 1    look-ups at a time (default 3)
//   npx tsx move_causes.ts --trace         print what each look-up did: its searches, the pages returned, its reply
//   npx tsx move_causes.ts --seed          first put the moves of the trial's stocks on the queue (below)
//
// A second rule for which moves are marked is on trial (Shota, 19 Nov 2026; _shared/bigmoves.ts, SWING_TRIAL):
// one-day moves of 10% and the peaks and bottoms of the twelve-month chart. While SWING_TRIAL is not empty this
// job looks up the moves of those stocks only, by that rule; every other stock's queue waits. A stock's page puts
// its moves on the queue when someone opens it; --seed does the same from here (the source's daily closes, the
// same rule), so the reasons can be there before the page is first opened.
// Needs ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: MOVE_CAUSE_MODEL (default
// claude-opus-5-5), MOVE_CAUSE_EFFORT (default medium), MOVE_CAUSE_SEARCHES (searches allowed a look-up, default 4). Each look-up prints what it cost, how many pages its
// searches returned, any search that failed, and, when nothing is stored as the reason, which way it came to that.
import { db } from "./lib/db.js";
import { ask, newClient } from "./lib/llm.js";
import { CAUSE_SYSTEM, causeQuestion, readCause, type MoveCtx } from "../supabase/functions/_shared/movecause.js";
import { SWING_D1, SWING_TRIAL, bigMoves, moveCtx, settledBars } from "../supabase/functions/_shared/bigmoves.js";
import { localDate, marketById, marketState } from "../supabase/functions/_shared/sessions.js";
import { spark } from "./lib/yahoo.js";

const arg = (k: string, d = ""): string => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] ?? d : d; };
const DRY = process.argv.includes("--dry"), AGAIN = process.argv.includes("--again"), TRACE = process.argv.includes("--trace"), REDO = process.argv.includes("--redo"), SEED = process.argv.includes("--seed");
const SYMBOL = arg("symbol").trim().toUpperCase();
if (SYMBOL && !/^[A-Z0-9^.=&-]{1,24}$/.test(SYMBOL)) { console.error(`not a symbol: ${SYMBOL}`); process.exit(2); }
// --redo spends again on moves that are already answered, so it is taken only for one named stock
if (REDO && !SYMBOL) { console.error("--redo needs --symbol"); process.exit(2); }
const MAX = Math.max(1, Math.min(300, Number(arg("max", "30")) || 30));
const PARALLEL = Math.max(1, Math.min(6, Number(arg("parallel", "3")) || 3));
const MODEL = process.env.MOVE_CAUSE_MODEL || "claude-opus-5-5", EFFORT = process.env.MOVE_CAUSE_EFFORT || "medium";
// Each search costs about USD 0.09 (its results are read by the model), so the number allowed sets what a look-up
// can cost: measured on 27 look-ups (18 Nov 2026), one search 0.09 to 0.10, two 0.18 to 0.20, three 0.24 to 0.31, four 0.37 to 0.43.
const SEARCHES = Math.max(1, Math.min(8, Number(process.env.MOVE_CAUSE_SEARCHES) || 4)), MAX_TRIES = 3, EMPTY_WAIT_MS = 30_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const WHY: Record<string, string> = { "none reported": "the model found no report", "no sentence": "the model gave no usable sentence", "no returned page cited": "the model gave a reason but cited no page its searches returned" };

interface Row { symbol: string; kind: string; d: string; ctx: MoveCtx; tries: number }
const TRIAL = [...SWING_TRIAL];
const CAUSES_FOR_DAYS = 366, MOVES_SHOWN_MONTHS = 37;   // as on the page (_shared/stock.ts)

/** Puts the moves of one of the trial's stocks on the queue, as its page would: the same daily closes (ten
 *  years, a day still trading left out), the same rule, the same context for the look-up. US-listed members of
 *  the S&P 500 only: that is what the trial holds, and where the name and the sector are read from. */
async function seed(sb: ReturnType<typeof db>, symbol: string): Promise<void> {
  const { data: con } = await sb.from("constituents").select("name,name_en,sector").eq("idx", "SP500").eq("symbol", symbol).limit(1);
  const who = (con ?? [])[0] as { name: string; name_en: string | null; sector: string | null } | undefined;
  if (!who) { console.log(`seed ${symbol}: not among the S&P 500 members on record; its page queues its moves when it is opened`); return; }
  const s = await spark([symbol, "^GSPC"], "10y", "1d");
  const bars = (x: typeof s[string] | undefined) => (x ? x.timestamp.map((t, k) => ({ t: Math.floor(t / 86400) * 86400, c: x.close[k] as number })).filter((b) => b.c != null && Number.isFinite(b.c)) : []);
  const own = bars(s[symbol]), bench = bars(s["^GSPC"]);
  if (own.length < 300) { console.log(`seed ${symbol}: only ${own.length} daily closes from the source; nothing queued`); return; }
  const now = Date.now() / 1000, m = marketById("NYSE")!, state = marketState(m, new Date());
  const moves = bigMoves(settledBars(own, state === "OPEN" || state === "BREAK", localDate(m.tz, now)), now - MOVES_SHOWN_MONTHS * 30.5 * 86400, "swings");
  const recent = moves.filter((x) => now - x.t <= CAUSES_FOR_DAYS * 86400);
  console.log(`seed ${symbol}: ${own.length} daily closes (${new Date(own[0].t * 1000).toISOString().slice(0, 10)} to ${new Date(own[own.length - 1].t * 1000).toISOString().slice(0, 10)}); ${moves.length} marks in three years by the rule on trial, ${recent.length} of them in the last twelve months:`);
  for (const x of moves) console.log(`  ${x.to} ${x.kind} ${x.pct >= 0 ? "+" : ""}${x.pct.toFixed(1)}% (from ${x.from}, ${x.fromPx.toFixed(2)} to ${x.toPx.toFixed(2)})${now - x.t <= CAUSES_FOR_DAYS * 86400 ? "" : "  [older than twelve months: no look-up]"}`);
  if (DRY || !recent.length) return;
  const rows = recent.map((x) => ({ symbol, kind: x.kind, d: x.to, from_d: x.from, pct: x.pct, ctx: moveCtx(x, { symbol, name: who.name_en ?? who.name, exchange: null, sector: who.sector, currency: "USD" }, bench.length ? { name: "S&P 500", bars: bench } : null) }));
  const { error } = await sb.from("move_causes").upsert(rows, { onConflict: "symbol,kind,d", ignoreDuplicates: true });
  if (error) throw new Error(`seed ${symbol}: ${error.message}`);
}

async function main(): Promise<void> {
  const sb = db(), client = newClient();
  if (TRIAL.length && SYMBOL && !SWING_TRIAL.has(SYMBOL)) { console.log(`${SYMBOL} is not in the trial (${TRIAL.join(", ")}): while the rule for big moves is on trial, reasons are looked up for the trial's stocks only. Nothing done.`); return; }
  if (SEED) for (const sym of SYMBOL ? [SYMBOL] : TRIAL) await seed(sb, sym);
  let q = sb.from("move_causes").select("symbol,kind,d,ctx,tries");
  if (SYMBOL) q = q.eq("symbol", SYMBOL);
  // the trial's stocks, and of their moves only those the rule on trial marks (a stock's queue may still hold
  // moves of the usual rule from before it joined the trial)
  if (TRIAL.length) q = q.in("symbol", TRIAL).or(`kind.in.(pk,bt),and(kind.eq.d1,or(pct.gte.${SWING_D1},pct.lte.-${SWING_D1}))`);
  if (!REDO) q = q.in("status", AGAIN ? ["queued", "error", "not_found"] : ["queued", "error"]).lt("tries", MAX_TRIES);
  const { data, error } = await q.order("d", { ascending: false }).limit(MAX);
  if (error) {
    // a database from before this change has no queue: that is not a failure of this job
    if (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|does not exist/i.test(error.message)) { console.log("The move_causes table is not in the database yet (the database change of 18 Nov 2026 has not been applied): nothing to look up."); return; }
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Row[];
  console.log(`${rows.length} move(s) to look up (model ${MODEL}, effort ${EFFORT}, up to ${SEARCHES} searches each, ${PARALLEL} at a time${TRIAL.length ? `, the trial's stocks only: ${TRIAL.join(", ")}` : ""}${SYMBOL ? `, ${SYMBOL} only` : ""}${REDO ? ", including those already answered" : AGAIN ? ", including those stored as not found" : ""})`);
  let found = 0, none = 0, failed = 0, cost = 0;
  const work = [...rows];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let r = work.shift(); r; r = work.shift()) {
      const tag = `${r.symbol} ${r.kind} ${r.d}`;
      try {
        let spent = 0;
        const look = async () => { const x = await ask(client, { model: MODEL, effort: EFFORT, system: CAUSE_SYSTEM, user: causeQuestion(r.ctx), maxSearches: SEARCHES }); cost += x.costUsd; spent += x.costUsd; return x; };
        const errs = (x: { searchErrors: string[] }) => (x.searchErrors.length ? `searches that failed: ${x.searchErrors.join(", ")}` : "no search reported a failure");
        let t = await look();
        // A look-up whose searches brought back no page at all has not looked at anything: that says nothing about
        // the move. It is asked once more after a pause, and if that is empty too the move is left for a later run
        // (status "error") instead of being stored as "not found".
        if (!t.pages.length) {
          console.warn(`${tag}: ${t.searches} search(es) returned no page (${errs(t)}); asking again in ${EMPTY_WAIT_MS / 1000} s`);
          await sleep(EMPTY_WAIT_MS);
          t = await look();
          if (!t.pages.length) throw new Error(`the searches returned no page, twice (${t.searches} search(es); ${errs(t)})`);
        }
        if (TRACE) console.log(`${tag}: the question:\n${causeQuestion(r.ctx)}\n${tag}: what the look-up did:\n  ${t.trace.join("\n  ")}`);
        const a = readCause(t.text, t.pages);
        if (a.found) found++; else none++;
        console.log(`${tag}: ${a.found ? a.cause : `no report found (${WHY[a.why ?? ""] ?? "no reason given"})`} [${t.searches} searches, ${t.pages.length} pages${t.searchErrors.length ? `, ${errs(t)}` : ""}, $${spent.toFixed(3)}]${a.found ? ` <- ${a.sources.map((x) => x.url).join(" ")}` : ""}`);
        if (DRY) continue;
        const { error: e } = await sb.from("move_causes").update({ status: a.found ? "found" : "not_found", cause: a.cause, sources: a.sources, model: t.model, cost_usd: spent, tries: r.tries + 1, done_at: new Date().toISOString() }).eq("symbol", r.symbol).eq("kind", r.kind).eq("d", r.d);
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
