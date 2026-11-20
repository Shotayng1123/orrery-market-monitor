// A future's contract and its changes of contract (B-27, I-6; 20 Nov 2026). The Monitor's futures (ES=F, CL=F, GC=F …)
// are Yahoo's front-month series. What the Monitor's source probe of 20 Nov 2026 read from GitHub (C/probes
// yahoo_futures.log, run 44737367820), and what this file is built on:
//   - the v7 quote of an =F series names the contract its price is from (`underlyingSymbol`: CL=F on CLF27.NYM). Its
//     shortName and expiry can lag a roll (CL=F's read "Crude Oil Dec 26", with December's expiry, while on January);
//   - its previous close is that contract's own (BZ=F 89.44 = BZG27.NYM's), not the series' last close (91.98 on
//     BZF27.NYM): on a roll day the series steps by the change of contract, which is not a move (NG=F +12.64% on 20 Nov);
//   - Yahoo keeps no expired contract (ESU26.CME, CLX26.NYM … "no quote and no closes"), so a roll older than what the
//     Monitor has recorded cannot be measured afterwards;
//   - a day's bar can be rewritten after the quote moved (ZQ=F's close of 19 Nov read January's 95.835 that evening and
//     November's 96.118 the next day): the session after a roll checks on which day the series really changed contract.
// Daily bars are dated by CME's trade date, which starts at 18:00 New York the evening before (the bar of 20 Nov holds
// the minutes from 23:00 UTC on 19 Nov). Pure: sim/logic.test.ts checks it; the reads and writes are in tick.ts.
import { localDate } from "./sessions.ts";

export const isFuture = (symbol: string): boolean => /=F$/.test(symbol);

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CODES = "FGHJKMNQUVXZ";   // CME's month codes, January to December
/** A named contract read from its symbol by CME's month codes: "CLF27.NYM" is CL, January 2027 ("Jan 2027", code
 *  "CLF27"). null for anything else. */
export interface ContractName { code: string; root: string; ym: string; label: string }
export function contractName(contract: string | null | undefined): ContractName | null {
  const m = /^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{2})(?:\.[A-Z]+)?$/.exec(contract ?? "");
  if (!m) return null;
  const mo = CODES.indexOf(m[2]) + 1, y = 2000 + Number(m[3]);
  return { code: `${m[1]}${m[2]}${m[3]}`, root: m[1], ym: `${y}-${String(mo).padStart(2, "0")}`, label: `${MON[mo - 1]} ${y}` };
}
/** "Dec" for a contract, the month alone ("roll from Dec to Jan"); the code where the symbol is not a named contract. */
export const monthWord = (contract: string | null | undefined): string => { const n = contractName(contract); return n ? n.label.slice(0, 3) : contract ?? "–"; };

const weekday = (ymd: string): number => new Date(ymd + "T00:00:00Z").getUTCDay();
const dayBefore = (ymd: string, n = 1): string => new Date(Date.parse(ymd + "T00:00:00Z") - n * 86400e3).toISOString().slice(0, 10);
/** CME's trade date of an instant: the New York date six hours later (a session opens at 18:00 New York the evening
 *  before); a stamp in the weekend belongs to Friday's. */
export function tradeDate(epochSec: number): string {
  const d = localDate("America/New_York", epochSec + 6 * 3600), wd = weekday(d);
  return wd === 6 ? dayBefore(d) : wd === 0 ? dayBefore(d, 2) : d;
}

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

/** One reading of a future's quote: the contract it names, that contract's own previous close, the quote's time. */
export interface FutReading { symbol: string; contract: string | null; prevClose: number | null; at: number | null /* Unix seconds */ }
/** A session's record (table fut_contracts). */
export interface ContractRow { symbol: string; d: string; contract: string; expires: string | null; prev_close: number | null }
/** A change of contract (table fut_rolls): `d` is the first session on the new contract; `prev_close` the new contract's
 *  own close on the session before it, from which that day's change within the contract is measured (null where the
 *  source did not give it: the day's change is then left out); `checked` once the session after it has been read. */
export interface RollRow { symbol: string; d: string; from_contract: string | null; to_contract: string; prev_close: number | null; source: string; checked: boolean }
export const QUOTE_SOURCE = "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol) and its previous close";   // the owner's P3: named contracts are labelled unofficial

/** What one reading adds: this session's record, and a roll when its contract is not the one recorded for the last
 *  session before this one (`lastBefore`). Nothing for a quote that names no contract or has no time. */
export function fromReading(r: FutReading, lastBefore: { d: string; contract: string } | null, expires: string | null = null): { record: ContractRow; roll: RollRow | null } | null {
  if (!r.contract || r.at == null || !Number.isFinite(r.at)) return null;
  const d = tradeDate(r.at), prev = ok(r.prevClose) ? r.prevClose : null;
  const record: ContractRow = { symbol: r.symbol, d, contract: r.contract, expires, prev_close: prev };
  const roll = lastBefore && lastBefore.d < d && lastBefore.contract !== r.contract
    ? { symbol: r.symbol, d, from_contract: lastBefore.contract, to_contract: r.contract, prev_close: prev, source: QUOTE_SOURCE, checked: false }
    : null;
  return { record, roll };
}

/** The session after a roll, read: its quote's previous close is the new contract's own close on the roll day. If the
 *  series' close booked for the roll day is further from that than half the change of contract, the series was still on
 *  the old contract that day (ZQ=F, 19 Nov 2026), and the roll moves to this session, measured from that close.
 *    `booked`  the series' close on the roll day, its close before it, and the date of its last close before the
 *              session read (the roll day itself when this is the session after it)
 *  "wait": not the session after yet, or the roll day not booked yet; "keep": the roll stands (checked); "move". */
export function checkRoll(roll: RollRow, r: { d: string; contract: string; prevClose: number | null }, booked: { rollDay: number | null; before: number | null; lastBefore: string | null }): { act: "wait" } | { act: "keep"; roll: RollRow } | { act: "move"; roll: RollRow } {
  const keep = { act: "keep" as const, roll: { ...roll, checked: true } };
  if (r.d <= roll.d) return { act: "wait" };
  if (r.contract !== roll.to_contract) return keep;
  if (booked.lastBefore == null || booked.lastBefore < roll.d) return { act: "wait" };
  if (booked.lastBefore > roll.d) return keep;                       // sessions were missed: this reading cannot tell
  if (!ok(roll.prev_close) || !ok(booked.before) || !ok(booked.rollDay) || !ok(r.prevClose)) return keep;
  const step = roll.prev_close / booked.before - 1, off = booked.rollDay / r.prevClose - 1;
  if (Math.abs(off) <= Math.abs(step) / 2) return keep;
  return { act: "move", roll: { ...roll, d: r.d, prev_close: r.prevClose, checked: true } };
}

/** A future's 1D on a roll day (table.ts): measured from the new contract's own close before the roll (`prevClose`), the
 *  change of contract set apart as `step` (in per cent of `c0`, the series' close the 1D would otherwise be measured
 *  from). Where the new contract's close is not known the 1D stays as the series gives it and has no step. */
export function rollDay(c0: number | null, prevClose: number | null): { base: number | null; step: number | null } {
  return ok(prevClose) ? { base: prevClose, step: ok(c0) ? (prevClose / c0 - 1) * 100 : null } : { base: c0, step: null };
}

/** A roll as the statistics need it: its date and the new contract's own close before it. */
export interface RollLite { d: string; prevClose: number | null }
export interface DayBar { t: number; c: number }
const dayOf = (t: number): string => new Date(t * 1000).toISOString().slice(0, 10);
/** A series with its changes of contract taken out (B-27): every close before a roll is multiplied by the new contract's
 *  own close before it over the series' own close that day, so the roll day's change is the change within the new
 *  contract. Where a roll's close before it is not known the series is cut there instead: no change is measured across
 *  it. Returns the pieces, oldest first, each on its newest contract's level; `bars` oldest first, dated at midnight UTC. */
export function rollSegments<B extends DayBar>(bars: B[], rolls: RollLite[]): B[][] {
  if (!bars.length) return [];
  const rs = [...rolls].sort((a, b) => b.d.localeCompare(a.d));
  const out: B[][] = [];
  let seg: B[] = [], f = 1, k = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i], d = dayOf(b.t);
    // the rolls after this bar's day not yet taken (the newer ones went with the newer bars; for the newest bar, any
    // later roll, today's not yet booked): this bar is the series' close before each of them
    while (k < rs.length && rs[k].d > d) {
      const r = rs[k++];
      if (ok(r.prevClose) && b.c > 0) f *= r.prevClose / b.c;
      else { if (seg.length) out.unshift(seg.reverse()); seg = []; f = 1; }
    }
    seg.push(f === 1 ? b : { ...b, c: b.c * f });
  }
  if (seg.length) out.unshift(seg.reverse());
  return out;
}

/** The first day the Monitor's record of a future's contracts covers: rolls before it are not known to it. */
export function knownFrom(rolls: Array<{ d: string }>, contracts: Array<{ d: string }>): string | null {
  const ds = [...rolls.map((r) => r.d), ...contracts.map((c) => c.d)].sort();
  return ds[0] ?? null;
}

/** A roll as an instrument's page shows it: the months, the change of contract (the new contract's close before the
 *  roll over the series' own, in per cent; null where not measured), and where it was read. */
export interface RollView { d: string; from: string | null; to: string; fromMonth: string | null; toMonth: string; step: number | null; source: string }
export function rollViews(rolls: Array<Pick<RollRow, "d" | "from_contract" | "to_contract" | "prev_close" | "source">>, bars: DayBar[]): RollView[] {
  return [...rolls].sort((a, b) => a.d.localeCompare(b.d)).map((r) => {
    let before: number | null = null;
    for (const b of bars) { if (dayOf(b.t) < r.d) before = b.c; else break; }
    return { d: r.d, from: r.from_contract, to: r.to_contract, fromMonth: r.from_contract ? contractName(r.from_contract)?.label ?? null : null, toMonth: contractName(r.to_contract)?.label ?? r.to_contract,
      step: ok(r.prev_close) && ok(before) ? (r.prev_close / before - 1) * 100 : null, source: r.source };
  });
}
