// The second path for prices (19 Nov 2026). On 18 Nov, from 15:52 to 23:26 UTC, the source answered the Monitor's
// server with the same prices for everything but crypto, while it gave GitHub's machines current ones at the same
// moment. Why is not established; it came back by itself. The source is one, but there are two roads to it, and
// this is the second: when the server's own answers stop, a job on GitHub (jobs/relay_deno.ts, the workflow
// feed-relay.yml) pulls the same prices from there and writes them, and the server stands down until its own
// answers are current again. One writer at a time:
//
//   the server's tick, every minute     pulls as always and records how far behind ITS answers are ("own");
//                                        while a relay is writing it stores nothing and only sends notifications
//   the relay, every minute while on    pulls, and if ITS answers are current writes the quotes, the minute bars,
//                                        the table and the alerts, runs the constituent jobs on the server's own
//                                        timetable (RELAY_CRON), and leaves a beat the server reads
//   handing back                        the server's own answers current three minutes in a row: the relay ends
//
// What it does not cover: the source stopping for everyone. Then the relay finds its own answers stopped as well,
// writes nothing, and the "No new prices" bar stays on screen, as it should.
// Everything in this file is pure and checked in sim/logic.test.ts; the reads and writes are in relaystore.ts.
import { feedState, type Print } from "./feedhealth.ts";
import type { Holidays } from "./sessions.ts";

export const RELAY_LATE_MIN = 10;      // behind, after a feed's own delay, before the other path is asked to take over
export const RELAY_OK_RUN = 3;         // the server's own answers current this many minutes in a row: hand back
export const RELAY_WAIT_MIN = 10;      // the relay's answers stopped as well: it tries this long, then gives up
export const RELAY_BEAT_MAX_S = 150;   // a beat older than this: no relay is writing, the server carries on
export const OWN_FRESH_MIN = 3;        // the server's report of its own answers counts for this long

/** How far behind one machine's answers are, read from what it was just handed. */
export interface Reading { at: string; expected: boolean; lateMin: number | null; newest: string | null; symbol: string | null; got: number; due: number }

/** The reading of one pull: `prints` are the last prints of the instruments that answered, `due` how many were
 *  asked. (feedState: the freshest instrument among the open markets, crypto and the rest read apart.) */
export function reading(prints: Print[], due: number, nowMs: number, holidays: Holidays = {}): Reading {
  const f = feedState(prints, nowMs, holidays);
  return { at: new Date(nowMs).toISOString(), expected: f.expected, lateMin: f.lateMin, newest: f.newest, symbol: f.symbol, got: prints.length, due };
}
/** Whether a reading is current. A pull that brought back less than half of what was asked is not: an answer
 *  that does not come is no better than an old one. Nothing asked, or no market open, is current. */
export function current(r: Pick<Reading, "expected" | "lateMin" | "got" | "due">): boolean {
  if (r.due > 0 && r.got * 2 < r.due) return false;
  return !r.expected || (r.lateMin ?? 0) < RELAY_LATE_MIN;
}
/** A reading that can be written from: current, and a price is in fact expected. */
export const usable = (r: Pick<Reading, "expected" | "lateMin" | "got" | "due">): boolean => r.expected && current(r);

export function beatFresh(at: string | null | undefined, nowMs: number): boolean {
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) && nowMs - t <= RELAY_BEAT_MAX_S * 1000 && t - nowMs <= 60000;
}

export type RelayAct = "not-needed" | "take" | "write" | "hold" | "hand-back" | "give-up";
export interface RelayView {
  active: boolean;          // this run is the one writing
  screenStopped: boolean;   // the prices in the database, the ones on screen, are behind
  mineOk: boolean;          // this machine's own answers are usable
  ownOkRun: number;         // minutes in a row the server has reported its own answers current (fresh reports only)
  heldMin: number;          // minutes in a row this run has been without usable answers
  forced: boolean;          // a drill, or the next shift of a relay that is on: take over without waiting
}
/** What the relay does this minute. */
export function relayAct(v: RelayView): RelayAct {
  if (!v.active) {
    if (!v.screenStopped && !v.forced) return "not-needed";
    if (v.mineOk) return "take";
    return v.heldMin >= RELAY_WAIT_MIN ? "give-up" : "hold";
  }
  if (!v.forced && v.ownOkRun >= RELAY_OK_RUN) return "hand-back";
  if (v.mineOk) return "write";
  return v.heldMin >= RELAY_WAIT_MIN ? "give-up" : "hold";
}

// ---- the constituent jobs the relay runs while it is on, at the minutes the server would have run them ----
// The same expressions as the database's own timetable (monitor_install_cron); sim/logic.test.ts reads the
// newest migration that defines it and fails if the two differ. While a relay writes, the server's `daily`
// function skips exactly these (RELAY_JOBS), so each runs once, from the machine whose answers are current.
export type RelayJob = "flow" | "mflow" | "stats" | "history";
export const RELAY_JOBS: readonly RelayJob[] = ["flow", "mflow", "stats", "history"];
export const RELAY_CRON: ReadonlyArray<{ name: string; cron: string; job: RelayJob; idx?: string }> = [
  { name: "monitor-history-asia", cron: "5 7 * * 1-5", job: "history" },
  { name: "monitor-history-europe", cron: "5 17 * * 1-5", job: "history" },
  { name: "monitor-history-us", cron: "35 22 * * 1-5", job: "history" },
  { name: "monitor-stats-nk225", cron: "15 7 * * 1-5", job: "stats", idx: "NK225" },
  { name: "monitor-stats-kospi200", cron: "0 7 * * 1-5", job: "stats", idx: "KOSPI200" },
  { name: "monitor-stats-sse180", cron: "25 7 * * 1-5", job: "stats", idx: "SSE180" },
  { name: "monitor-stats-hsi", cron: "25 8 * * 1-5", job: "stats", idx: "HSI" },
  { name: "monitor-stats-sp500", cron: "45 22 * * 1-5", job: "stats", idx: "SP500" },
  { name: "monitor-stats-ndx", cron: "55 22 * * 1-5", job: "stats", idx: "NDX" },
  { name: "monitor-flow-nk225", cron: "*/10 0-6 * * 1-5", job: "flow", idx: "NK225" },
  { name: "monitor-flow-topix", cron: "3,23,43 0-6 * * 1-5", job: "flow", idx: "TOPIX" },
  { name: "monitor-flow-kospi200", cron: "7,27,47 0-6 * * 1-5", job: "flow", idx: "KOSPI200" },
  { name: "monitor-flow-sse180", cron: "9,29,49 1-7 * * 1-5", job: "flow", idx: "SSE180" },
  { name: "monitor-flow-hsi", cron: "4,24,44 1-8 * * 1-5", job: "flow", idx: "HSI" },
  { name: "monitor-flow-sp500", cron: "*/10 14-21 * * 1-5", job: "flow", idx: "SP500" },
  { name: "monitor-flow-ndx", cron: "5,15,25,35,45,55 14-21 * * 1-5", job: "flow", idx: "NDX" },
  { name: "monitor-mflow-nk225", cron: "35 2,4,6 * * 1-5", job: "mflow", idx: "NK225" },
  { name: "monitor-mflow-kospi200", cron: "50 2,4,6 * * 1-5", job: "mflow", idx: "KOSPI200" },
  { name: "monitor-mflow-sse180", cron: "12 3,5,7 * * 1-5", job: "mflow", idx: "SSE180" },
  { name: "monitor-mflow-hsi", cron: "18 4,6,8 * * 1-5", job: "mflow", idx: "HSI" },
  { name: "monitor-mflow-sp500", cron: "40 16,18,21 * * 1-5", job: "mflow", idx: "SP500" },
  { name: "monitor-mflow-ndx", cron: "48 16,18,21 * * 1-5", job: "mflow", idx: "NDX" },
  { name: "monitor-flow-topix-close", cron: "3 7 * * 1-5", job: "flow", idx: "TOPIX" },
  { name: "monitor-flow-kospi200-close", cron: "7 7 * * 1-5", job: "flow", idx: "KOSPI200" },
];

function fieldDue(field: string, v: number): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/"), step = stepText ? Number(stepText) : 1;
    if (!(step >= 1)) return false;
    if (range === "*") return v % step === 0;
    const [a, b] = range.split("-").map(Number), lo = a, hi = b ?? a;
    return Number.isFinite(lo) && Number.isFinite(hi) && v >= lo && v <= hi && (v - lo) % step === 0;
  });
}
/** Whether a five-field cron expression (minute hour day month weekday, UTC, as pg_cron reads it) falls on the
 *  minute of `ms`. Numbers, lists, ranges and steps; a restricted day and a restricted weekday are joined by
 *  "or", as cron does. */
export function cronDue(expr: string, ms: number): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const d = new Date(ms), wd = d.getUTCDay();
  if (!fieldDue(f[0], d.getUTCMinutes()) || !fieldDue(f[1], d.getUTCHours()) || !fieldDue(f[3], d.getUTCMonth() + 1)) return false;
  const dom = fieldDue(f[2], d.getUTCDate()), dow = fieldDue(f[4], wd) || (wd === 0 && fieldDue(f[4], 7));
  return f[2] !== "*" && f[4] !== "*" ? dom || dow : dom && dow;
}
/** The jobs of RELAY_CRON that fall in the minutes after `fromMs` up to and including the minute of `toMs`
 *  (at most the last ten: a relay minute that ran long must not skip a job, nor replay an afternoon). Each job
 *  once, however many of its minutes passed. */
export function relayJobsDue(fromMs: number, toMs: number): Array<{ name: string; job: RelayJob; idx?: string }> {
  const end = Math.floor(toMs / 60000), start = Math.max(Math.floor(fromMs / 60000) + 1, end - 9), out = new Map<string, { name: string; job: RelayJob; idx?: string }>();
  for (let m = start; m <= end; m++) for (const j of RELAY_CRON) if (cronDue(j.cron, m * 60000)) out.set(`${j.job}:${j.idx ?? ""}`, { name: j.name, job: j.job, idx: j.idx });
  return [...out.values()];
}

/** The quotes that may be written: a print never replaces a newer one already stored. For the minute in which
 *  a relay takes over or hands back, two machines may write; the one holding old answers must not put them
 *  over the other's new ones. An equal print is written (it renews the time the quote was fetched). */
export function newerOnly<T extends { symbol: string; market_time: string }>(quotes: T[], stored: Map<string, string>): T[] {
  return quotes.filter((q) => { const s = stored.get(q.symbol); return !s || !(Date.parse(q.market_time) < Date.parse(s)); });
}

/** The note the relay leaves for the server (snapshots key 'relay'); `at` null says it has ended. */
export interface RelayNote { at: string | null; run: string | null; since: string | null; note: string | null }
