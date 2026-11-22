// COPY of supabase/functions/_shared/pf/view.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// A paper portfolio as its screens read it (P-1): which value of each setting is in force and since when, what is
// pending, the settings' history, the activity, the targets and their window. Worked out from the store's rows, which
// are only ever added to: a change is a new row in force from the next session, and nothing is edited.
import type { After, BookFull, BookRow, Field, SettingRow } from "./types.ts";
import type { Values } from "./form.ts";
import { numText, showValue } from "./form.ts";
import { BY_ACCOUNT, STARTS } from "./presets.ts";
import { bookDayFrom, dmy, targetWindow, valuationDay, wdmy, type TargetWindow } from "./calendar.ts";
import { fmtFull, fromMinor } from "./money.ts";

export interface NowRow {
  key: string; field: Field;
  value: number | string;
  /** whose the value in force is: the row's own tag, or "you" for a value the account set */
  by: string; basis: string;
  since: string;                 // the day it is in force from
  at: string;                    // the moment it was set (creation, or the change)
  changed: boolean;              // the value in force is not the start's default (EN-4: a limit set back to it is not)
  own: boolean;                  // the value in force was set by the account (at creation or by a change)
  pending: { value: number | string; from: string; at: string } | null;
}
const byId = (a: SettingRow, b: SettingRow): number => a.id - b.id;
/** Whether a later row of the same setting was made before this one came into force. */
function replaced(r: SettingRow, later: SettingRow[]): boolean {
  if (r.origin !== "change" || !r.effectiveFrom) return false;
  return later.some((x) => x.id > r.id && valuationDay(new Date(x.at)) < r.effectiveFrom!);
}
/** What stood on a valuation day among a setting's rows (sorted, oldest first): the row whose value is in force, and the
 *  change that waits for its session. The creation row, then each change that has not been replaced, on its day; a
 *  change that only sets the value back to the one in force (a pending change taken back: RT-3) changes nothing, so
 *  the row before it keeps its BY and its SINCE (EG-3 of the review of part 2a; PM B's answer on R-53, 22 Nov 2026). */
function standing(rows: SettingRow[], day: string): { inForce: SettingRow; ahead: SettingRow | null } {
  const live = rows.filter((r) => !replaced(r, rows));
  let inForce = rows[0];
  for (const r of live) if (r.origin === "creation" || (r.effectiveFrom != null && r.effectiveFrom <= day)) { if (r.origin === "creation" || r.value !== inForce.value) inForce = r; }
  const ahead = [...live].reverse().find((r) => r.origin === "change" && r.effectiveFrom != null && r.effectiveFrom > day) ?? null;
  return { inForce, ahead };
}
/** Every stored setting of a book but its name and its targets' re-sets: the value in force on a valuation day. */
export function settingsNow(book: BookFull, day: string): NowRow[] {
  const out: NowRow[] = [];
  for (const f of STARTS[book.start].fields) {
    const rows = book.settings.filter((r) => r.key === f.key && r.forYear == null).sort(byId);
    if (!rows.length) continue;
    const { inForce, ahead } = standing(rows, day);
    const own = inForce.basis === BY_ACCOUNT.basis, def = f.num ? f.num.def : f.choices ? f.choices.def : undefined;
    out.push({ key: f.key, field: f, value: inForce.value, by: own ? BY_ACCOUNT.tag : f.who.tag, basis: inForce.basis, since: inForce.effectiveFrom ?? book.startedOn, at: inForce.at, changed: def !== undefined ? inForce.value !== def : own, own,
      // a change back to the value in force, saved while another waited (RT-3), leaves nothing pending to show
      pending: ahead && ahead.value !== inForce.value ? { value: ahead.value, from: ahead.effectiveFrom!, at: ahead.at } : null });
  }
  return out;
}
export const valuesNow = (rows: NowRow[]): Values => Object.fromEntries(rows.map((r) => [r.key, r.value]));
/** The values that will be in force once the changes already saved are: each setting's pending value where one
 *  waits, else its value in force. A new change is checked against these (RT-2, RT-3). */
export const valuesAhead = (rows: NowRow[]): Values => Object.fromEntries(rows.map((r) => [r.key, r.pending ? r.pending.value : r.value]));
/** What a change of one of a book's settings is checked against on a valuation day (route.ts and the page's CHANGE form
 *  alike): the values in force, those that will be, and the target volatilities the VaR limit has to cover (the pair in
 *  force after a January re-set, and a pair entered for next year). `targetsDay`: the day the targets are read on, the
 *  same book day (a page of before 22 Nov 2026 handed New York's date). */
export function changeBasis(book: BookFull, day: string, targetsDay: string = day): { now: Values; ahead: Values; vols: number[] } {
  const rows = settingsNow(book, day), t = targetsNow(book, targetsDay);
  return { now: valuesNow(rows), ahead: valuesAhead(rows), vols: t.pending ? [t.vol, t.pending.vol] : [t.vol] };
}
export const rowsOf = (rows: NowRow[], after: After, skipTargets = true): NowRow[] => rows.filter((r) => r.field.after === after && (!skipTargets || r.field.section !== "targets"));

/** A value in short, for a change's line: "10%", "≤ 200%", "± 20 points", "− 0.25%". */
export function shortValue(f: Field, v: number | string): string {
  if (!f.num || typeof v !== "number") return showValue(f, v);
  const n = f.num, t = numText(Math.abs(v), n.fix ?? 0), unit = n.unit.startsWith("%") ? "%" : n.unit ? ` ${n.unit.split(",")[0]}` : "";
  if (n.signed) return `${v < 0 ? "−" : "+"} ${t}%`;
  const pre = n.pre && ["≤", "≥", "±", "×", "+"].includes(n.pre) ? (n.pre === "±" || n.pre === "+" ? n.pre : `${n.pre} `) : "";
  return `${pre}${v < 0 ? "−" : ""}${t}${unit}`;
}

/** `state` "taken back": a change that set the value back to the one in force while another waited (RT-3): it puts
 *  nothing in force (`inForceFrom` null), its FROM is the value that was pending, and `note` says so. */
export interface HistoryRow { id: number; at: string; key: string; label: string; from: string; to: string; inForceFrom: string | null; reason: string | null; by: string; origin: "creation" | "change"; state: "" | "pending" | "replaced before it was in force" | "taken back"; note: string | null }
/** The words of a take-back, in HISTORY and ACTIVITY (the designer's B.1 RT-3; PM A's and PM B's answers on R-53, 22
 *  Nov 2026): "back to the value in force: the pending ±15% taken back before it was in force". */
export const takenBackWords = (pending: string): string => `back to the value in force: the pending ${pending} taken back before it was in force`;
/** The settings' own log, newest first: every row of the limits, or of the assumptions. A creation default reads its
 *  adviser in BY and has no reason; a change reads "set by the account" with its reason whole, FROM the value in force
 *  when it was made; a take-back reads FROM the value that was pending. */
export function historyOf(book: BookFull, after: After | null, day: string): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (const f of STARTS[book.start].fields) {
    if (after ? f.after !== after : f.after !== "limit" && f.after !== "assumption") continue;
    const rows = book.settings.filter((r) => r.key === f.key && r.forYear == null).sort(byId);
    rows.forEach((r, i) => {
      const base = { id: r.id, at: r.at, key: f.key, label: f.label, to: shortValue(f, r.value), reason: r.reason, by: r.basis, origin: r.origin };
      if (r.origin === "creation" || i === 0) { out.push({ ...base, from: "–", inForceFrom: r.effectiveFrom, state: "", note: null }); return; }
      // what stood when it was made: the value in force on that valuation day, and the change then waiting
      const was = standing(rows.slice(0, i), valuationDay(new Date(r.at))), waiting = was.ahead && was.ahead.value !== was.inForce.value ? was.ahead : null;
      if (waiting && r.value === was.inForce.value) {
        const p = shortValue(f, waiting.value);
        out.push({ ...base, from: p, inForceFrom: null, state: "taken back", note: takenBackWords(p) });
        return;
      }
      out.push({ ...base, from: shortValue(f, was.inForce.value), inForceFrom: r.effectiveFrom,
        state: replaced(r, rows) ? "replaced before it was in force" : r.effectiveFrom != null && r.effectiveFrom > day ? "pending" : "", note: null });
    });
  }
  return out.sort((a, b) => b.id - a.id);
}

export interface TargetsNow {
  x: number; vol: number;
  since: string | null;                        // "in force since 4 Jan 2027": the reset that brought a re-set into force
  pending: { x: number; vol: number; forYear: number } | null;
  lapsed: number | null;                        // the year whose re-set was not made: "targets not re-set: no year reset"
  window: TargetWindow;
}
/** The targets of a book on a book day (valuationDay): those in force, a pair pending for next year, a pair that lapsed. */
export function targetsNow(book: BookFull, nyYmd: string): TargetsNow {
  const sets = new Map<number, { x?: number; vol?: number }>();
  for (const r of [...book.settings].sort(byId)) {
    if (r.forYear == null || typeof r.value !== "number") continue;
    const p = sets.get(r.forYear) ?? {};
    if (r.key === "target_x") p.x = r.value; else if (r.key === "target_vol") p.vol = r.value;
    sets.set(r.forYear, p);
  }
  let x = book.targetX, vol = book.targetVol, since: string | null = null, pending: TargetsNow["pending"] = null, lapsed: number | null = null;
  const thisYear = Number(nyYmd.slice(0, 4));
  for (const year of [...sets.keys()].sort((a, b) => a - b)) {
    const p = sets.get(year)!, reset = book.resets.find((r) => r.year === year);
    if (p.x == null || p.vol == null) continue;
    // a pair whose year has ended with no January line on record never came into force: it lapsed (EN-10)
    if (!reset) { if (year < thisYear) { lapsed = year; pending = null; } else { pending = { x: p.x, vol: p.vol, forYear: year }; lapsed = null; } }
    else if (reset.kind === "made") { x = p.x; vol = p.vol; since = reset.d; lapsed = null; pending = null; }
    else { lapsed = year; pending = null; }
  }
  // a later year's reset that was made ends the line on a pair that lapsed (EN-14)
  if (lapsed != null && book.resets.some((r) => r.kind === "made" && r.year > lapsed!)) lapsed = null;
  return { x, vol, since, pending, lapsed, window: targetWindow(nyYmd, book.ladderBase, book.resets, book.startedOn) };
}
export const targetsWords = (x: number, vol: number): string => `cash + ${x.toFixed(1)}% · ${vol.toFixed(1)}%`;
/** The targets in force of a book as the list carries it (EN-6): after a January re-set, the pair it brought in. */
export const rowTargets = (row: BookRow, nyYmd: string): { x: number; vol: number } => targetsNow({ ...row, settings: row.retargets ?? [], notes: [], resets: row.resets ?? [] }, nyYmd);

export interface ActivityRow { at: string; kind: "CREATED" | "SETTING" | "NOTE" | "RENAMED"; text: string }
/** What happened to the book, newest first: its creation, each change of a setting with its reason and when it is in
 *  force, each note added or removed, each renaming. */
export function activityOf(book: BookFull): ActivityRow[] {
  const out: ActivityRow[] = [{ at: book.createdAt, kind: "CREATED", text: `starting NAV ${fmtFull(fromMinor(book.base, book.startingNav))} ${book.base}` }];
  const names = book.settings.filter((r) => r.key === "name").sort(byId);
  names.forEach((r, i) => { if (r.origin === "change") out.push({ at: r.at, kind: "RENAMED", text: `${i > 0 ? `${String(names[i - 1].value)} → ` : ""}${String(r.value)}` }); });
  const re = new Map<string, { at: string; year: number; x?: number; vol?: number }>();
  for (const r of [...book.settings].sort(byId)) {
    if (r.origin !== "change" || r.key === "name") continue;
    if (r.forYear != null) {   // the two targets of one re-set share their moment
      const k = `${r.forYear}|${r.at}`, p = re.get(k) ?? { at: r.at, year: r.forYear };
      if (r.key === "target_x") p.x = Number(r.value); else p.vol = Number(r.value);
      re.set(k, p);
      continue;
    }
  }
  for (const h of historyOf(book, null, valuationDay(new Date(book.createdAt)))) {
    // the day promised, with the moment it begins in SGT (B.0.1; the orchestrator's settlement of 22 Nov, 10:20 UTC):
    // "in force from Fri 13 Nov 2026, 06:00 SGT", a moment under ACTIVITY's "times in SGT"
    // a change in force for the day it was made in (EN-9: none of the book's markets had traded in it yet) says so: the
    // day had begun at 06:00 SGT, before the change, and nothing had traded under the old value
    const when = h.note ? ` · ${h.note}` : !h.inForceFrom ? "" : h.inForceFrom === valuationDay(new Date(h.at)) ? ` · in force for ${wdmy(h.inForceFrom)}'s sessions` : ` · in force from ${bookDayFrom(h.inForceFrom)}`;
    if (h.origin === "change") out.push({ at: h.at, kind: "SETTING", text: `${h.label} ${h.from} → ${h.to}${when}${h.reason ? ` · "${h.reason}"` : ""}` });
  }
  for (const p of re.values()) if (p.x != null && p.vol != null) out.push({ at: p.at, kind: "SETTING", text: `Targets for ${p.year}: ${targetsWords(p.x, p.vol)} · pending until the January reset` });
  for (const n of book.notes) { out.push({ at: n.at, kind: "NOTE", text: "added" }); if (n.removedAt) out.push({ at: n.removedAt, kind: "NOTE", text: "removed" }); }
  // newest first; of two lines of the same moment the later one written stands first (the creation is always last)
  return out.map((r, i) => ({ r, i })).sort((a, b) => Date.parse(b.r.at) - Date.parse(a.r.at) || b.i - a.i).map((x) => x.r);
}
/** "since 1 Oct 2026". */
/** The book's own start on its strip: the SGT day it was created ("since" is a book day only: B.0.1, revision 2). */
export const createdWords = (ymd: string): string => `created ${dmy(ymd)}`;
