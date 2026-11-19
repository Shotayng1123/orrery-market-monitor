// The relay: the second path for prices, run on GitHub's machines (workflow feed-relay.yml). What it is for and
// who does what is at the head of supabase/functions/_shared/relay.ts. In short: when the prices on screen are
// behind and this machine's answers from the source are current, it does the tick's work from here, once a
// minute, with the same code, until the server reports its own answers current three minutes in a row.
//
//   deno run -A --node-modules-dir=none jobs/relay_deno.ts
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Optional:
//   RELAY_FORCE_MIN=3   a drill (or the next shift of a relay that is on): take over at once and write for that
//                       many minutes although nothing is wrong, then hand back by the usual rule
//   RELAY_DRY=1         look once and say what it would do; nothing is written
//   RELAY_MAX_MIN=330   the length of a shift (a GitHub job may run six hours); a relay still needed then asks
//                       for the next one by writing again=true to GITHUB_OUTPUT
// It ends with exit code 1 only when it gave up: the prices on screen were behind and this machine's answers
// were not usable either, for ten minutes. That is the source stopping for everyone, and worth a red run.
import { db, logRun } from "../supabase/functions/_shared/db.ts";
import { feedState } from "../supabase/functions/_shared/feedhealth.ts";
import { loadHolidays } from "../supabase/functions/_shared/table.ts";
import { dueInstruments, printsOf, pull, store, tableAndAlerts } from "../supabase/functions/_shared/tick.ts";
import { beatFresh, current, OWN_FRESH_MIN, reading, RELAY_LATE_MIN, relayAct, relayJobsDue, usable, type Reading } from "../supabase/functions/_shared/relay.ts";
import { readOwn, relayBeat, relayNote } from "../supabase/functions/_shared/relaystore.ts";
import { computeIndexStats, refreshQuotes } from "../supabase/functions/_shared/istats.ts";
import { history } from "../supabase/functions/_shared/history.ts";
import type { IndexId } from "../supabase/functions/_shared/constituents.ts";
import type { Holidays } from "../supabase/functions/_shared/sessions.ts";

const RUN = Deno.env.get("GITHUB_RUN_ID") ?? `local-${Date.now()}`;
const FORCE_MIN = Math.max(0, Number(Deno.env.get("RELAY_FORCE_MIN") ?? "0") || 0);
const DRY = Deno.env.get("RELAY_DRY") === "1";
const SHIFT_MIN = Math.max(1, Number(Deno.env.get("RELAY_MAX_MIN") ?? "330") || 330);
const SECOND = 25;   // of each minute: the server's tick starts at second 0 and has left its own reading by then

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const say = (r: Reading | null, old = false): string => !r ? "no report" : `${r.got}/${r.due} answered${r.expected ? `, ${r.lateMin} min behind` : ", no market open long enough to expect a price"}${old ? " (an old report)" : ""}`;

/** The prices on screen: the last prints stored for the active instruments, read as the site's header reads them. */
async function screen(nowMs: number, holidays: Holidays): Promise<{ stopped: boolean; text: string }> {
  const [{ data: inst, error: e1 }, { data: prints, error: e2 }] = await Promise.all([
    db.from("instruments").select("symbol,market").eq("active", true),
    db.from("quotes_latest").select("symbol,market_time"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  const marketOf = new Map(((inst ?? []) as Array<{ symbol: string; market: string }>).map((r) => [r.symbol, r.market]));
  const f = feedState(((prints ?? []) as Array<{ symbol: string; market_time: string }>).filter((r) => marketOf.has(r.symbol)).map((r) => ({ symbol: r.symbol, market: marketOf.get(r.symbol)!, marketTime: r.market_time })), nowMs, holidays);
  return { stopped: f.expected && (f.lateMin ?? 0) >= RELAY_LATE_MIN, text: f.expected ? `${f.lateMin} min behind (${f.symbol})` : "nothing expected" };
}

/** The constituent jobs whose minute has come (RELAY_CRON), each logged under its own name. */
async function runJobs(fromMs: number, toMs: number): Promise<string> {
  const notes: string[] = [];
  for (const j of relayJobsDue(fromMs, toMs)) {
    const t = Date.now(), name = `relay:${j.job}${j.idx ? ":" + j.idx : ""}`;
    try {
      const d = j.job === "history" ? await history() : j.job === "stats" ? await computeIndexStats(j.idx as IndexId) : await refreshQuotes(j.idx as IndexId);
      await logRun(name, true, d, t); notes.push(`${j.job}${j.idx ? " " + j.idx : ""} done`);
    } catch (e) { await logRun(name, false, msg(e), t); notes.push(`${j.job}${j.idx ? " " + j.idx : ""} failed: ${msg(e)}`); }
  }
  return notes.length ? `, jobs: ${notes.join("; ")}` : "";
}

const started = Date.now();
let active = false, since: string | null = null, ownOkRun = 0, lastOwnAt = "", held = 0, lastJobsMs = 0, wrote = 0, errs = 0;
let outcome = "", gaveUp = false, again = false;
const end = async () => { if (!DRY) await relayBeat({ at: null, run: RUN, since, note: "ended" }); };

console.log(`relay run ${RUN}${FORCE_MIN ? `, forced for ${FORCE_MIN} min` : ""}${DRY ? ", dry" : ""}`);
for (;;) {
  const t0 = Date.now(), now = new Date(t0);
  let step = "", ok = true;
  try {
    const holidays = await loadHolidays();
    const other = await relayNote();
    if (!active && other && other.run !== RUN && beatFresh(other.at, t0)) { outcome = `another relay run (${other.run}) is writing: nothing to do here`; break; }
    const due = await dueInstruments(now, holidays);
    const { got } = due.length ? await pull(due, "spark") : { got: [] };
    const mine = reading(printsOf(got), due.length, t0, holidays), scr = await screen(t0, holidays), own = await readOwn();
    const ownFresh = !!own && t0 - Date.parse(own.at) <= OWN_FRESH_MIN * 60000;
    // each of the server's minutes counts once; an old report, or one that is behind, starts the count again
    if (own && ownFresh && current(own)) { if (own.at !== lastOwnAt) ownOkRun++; } else ownOkRun = 0;
    lastOwnAt = own?.at ?? "";
    const forced = FORCE_MIN > 0 && t0 - started < FORCE_MIN * 60000, mineOk = usable(mine);
    held = mineOk ? 0 : held + 1;
    const act = relayAct({ active, screenStopped: scr.stopped, mineOk, ownOkRun, heldMin: held, forced });
    const view = `here ${say(mine)}; on screen ${scr.text}; the server's own answers ${say(own, !ownFresh)}`;
    if (act === "not-needed") { outcome = `not needed: the prices on screen are current (${view})`; break; }
    if (act === "give-up") { gaveUp = true; if (active) await end(); outcome = `gave up: no usable answers here for ${held} minutes while the prices on screen are behind. The source has stopped for this machine too (${view})`; break; }
    if (act === "hand-back") { await end(); outcome = `handed back after writing for ${wrote} minutes: the server's own answers have been current for ${ownOkRun} minutes (${view})`; break; }
    if (act === "hold") step = `holding, nothing written: this machine's answers are not usable (${view})`;
    else {
      if (act === "take") { active = true; since = now.toISOString(); lastJobsMs = t0 - 60000; }
      if (DRY) step = `dry: would ${act === "take" ? "take over and " : ""}write ${got.filter((g) => g.ok).length} quotes (${view})`;
      else {
        // the beat first: the server reads it at its next minute and stands down
        await relayBeat({ at: now.toISOString(), run: RUN, since, note: forced ? "forced" : null });
        const st = await store(got, now);
        const { rows, note } = await tableAndAlerts(now, holidays);
        const jobs = await runJobs(lastJobsMs, t0); lastJobsMs = t0;
        // and again after the work, so that a long minute does not read as silence
        await relayBeat({ at: new Date().toISOString(), run: RUN, since, note: forced ? "forced" : null });
        wrote++;
        step = `${act === "take" ? "TOOK OVER. " : ""}${st.quotes}/${due.length} quotes, ${st.bars} 1m bars, table ${rows} rows${st.older ? `, ${st.older} older than the stored print left alone` : ""}${note}${jobs}; ${view}`;
      }
    }
    errs = 0;
  } catch (e) {
    ok = false; errs++; step = `failed: ${msg(e)}`;
    if (errs >= 8) { gaveUp = true; outcome = `gave up after eight failed minutes in a row: ${msg(e)}`; try { if (active) await end(); } catch { /* the beat goes old by itself */ } break; }
  }
  console.log(`${now.toISOString().slice(11, 19)} ${step}`);
  if (!DRY) { try { await logRun("relay", ok, step, t0); } catch { /* the log is not worth a stop */ } }
  if (DRY) { outcome = "dry: looked once"; break; }
  if (Date.now() - started >= SHIFT_MIN * 60000) {
    if (active) { again = true; await end(); outcome = `end of this shift (${SHIFT_MIN} minutes) with the server's answers still stopped: the next shift is asked for`; }
    else outcome = `end of this shift (${SHIFT_MIN} minutes)`;
    break;
  }
  // the next second 25: of this minute if it is still ahead, of the next one otherwise
  const nowMs = Date.now(), here = Math.floor(nowMs / 60000) * 60000 + SECOND * 1000;
  await sleep((here > nowMs + 1000 ? here : here + 60000) - nowMs);
}
console.log(outcome);
if (!DRY) { try { await logRun("relay", !gaveUp, outcome, started); } catch { /* as above */ } }
const out = Deno.env.get("GITHUB_OUTPUT");
if (out) await Deno.writeTextFile(out, `again=${again}\nwrote=${wrote}\n`, { append: true });
if (gaveUp) Deno.exitCode = 1;
