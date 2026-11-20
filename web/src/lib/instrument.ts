// An instrument's own page (I-4, 20 Nov 2026; B-04 and the designer's I-4 note): the shape the server adds to its
// `stock` answer for a currency, a yield, a commodity, a future or an index (supabase/functions/_shared/instrstats.ts
// and instrfeed.ts), and how its figures are written. Display only: every figure is the server's.
//
// Units. A yield's figures come in points of its level and are written in basis points, as MARKETS writes them; a
// price's in per cent. The page never shows a yield's change as a per cent of its level (B's defect 1).
import { cellBp, cellPct, fmtPct, signCls } from "./fmt";
import { fmtDate, fmtStamp, partsIn, SGT } from "./time";
import { ASSET_PERIODS, type ChartPeriod } from "./periods";
import type { EconEvent, TableRow } from "./types";
import type { StockPage } from "./stock";
import { codeOf, monthOf, rollWords } from "./futures";
import type { ChartMark } from "../components/SigmaChart";

export type Units = "yield" | "price";
/** Realised volatility over a window: `day` and `ann` in points for a yield (bp a day, bp a year on the page), in per
 *  cent for a price; `pctl` where today's reading stands among the daily readings of the last three years (null when
 *  the history is shorter), `since` the first of those readings. */
export interface VolStat { day: number | null; ann: number | null; pctl: number | null; since: string | null }
export interface Swing { chg: number; from: string; to: string }
export interface InstrumentInfo {
  units: Units;
  kind: string;          // the glossary's class word: FX, Rates, Equities, Futures, Commodities, Volatility, Crypto
  monitor: boolean;      // one of the Monitor's instruments: its figures are MARKETS' own
  official: boolean;     // a yield from an official publisher's daily file: no session, no day's range
  source: string;        // whose figures: "Yahoo Finance", "Japan MOF", "US Treasury" …
  row: TableRow;         // the chart tile's row: the instrument's own class, group and decimals (a yield's tile in bp)
  asOf: string | null; asOfKind: "print" | "close" | "published" | null;
  last: number | null;
  prev: { level: number | null; date: string | null };
  day: number | null;
  session: { open: number | null; low: number | null; high: number | null; at: string | null } | null;
  range52: { lo: number | null; loDate: string | null; hi: number | null; hiDate: string | null; pos: number | null; fromHi: number | null; fromLo: number | null };
  z1m: number | null; vs200: number | null;
  vol: { m1: VolStat; m3: VolStat; m12: VolStat };
  rise: Swing | null; fall: Swing | null;
  perf: Array<{ h: string; from: string | null; base: number | null; chg: number | null }>;
  history: { from: string | null; to: string | null; n: number; source: string };
  events: { ccys: string[]; from: string; to: string; rows: EconEvent[]; error?: string } | null;
  matched: string[];     // the words its headlines were matched by
  futures?: FuturesInfo; // a Monitor future (B-27, 20 Nov 2026): its contract and its changes of contract
  rollsOut?: number;     // the changes of contract its volatility and largest moves leave out
}
/** A roll as the page shows it: its day (the first session on the new contract), the contracts and their months, the
 *  change of contract in per cent (null where it was not measured), and where it was read. */
export interface RollView { d: string; from: string | null; to: string; fromMonth: string | null; toMonth: string; step: number | null; source: string }
/** A Monitor future's record (supabase/functions/_shared/instrstats.ts futuresInfo): the named contract its last price is
 *  from, as Yahoo's quote names it, its month and expiry, the session and time it was read, from when the record runs,
 *  and every roll in it. */
export interface FuturesInfo { contract: string | null; month: string | null; expires: string | null; seen: string | null; seenAt: string | null; knownFrom: string | null; rolls: RollView[]; lastRoll: RollView | null; source: string }
export type InstrumentPage = StockPage & { instrument: InstrumentInfo };
/** An answer for an instrument's page (a server from before 20 Nov 2026 sends a stock's answer for every name). */
export const isInstrumentPage = (d: StockPage | null | undefined): d is InstrumentPage => !!d && !!(d as Partial<InstrumentPage>).instrument;

/** A change in the instrument's units, as MARKETS writes it: "−4.8bp", "+160bp", "+0.32%". */
export const moveText = (v: number | null | undefined, u: Units): string => (u === "yield" ? cellBp(v) : cellPct(v));
/** Its colour: none for one that rounds to zero at the precision shown. */
export const moveCls = (v: number | null | undefined, u: Units): string => (u === "yield" ? signCls(v == null ? null : v * 100, 1) : signCls(v, 2));
/** A distance (from the 52-week high or low, from the 200-day average, the largest rise or fall): bp for a yield, a per
 *  cent with one decimal for a price. */
export const distText = (v: number | null | undefined, u: Units): string => (u === "yield" ? cellBp(v) : fmtPct(v, 1));
export const distCls = (v: number | null | undefined, u: Units): string => (u === "yield" ? signCls(v == null ? null : v * 100, 1) : signCls(v, 1));

/** A percentile: "72%"; "–" where the history is shorter than three years. */
export const pctlText = (p: number | null | undefined): string => (p == null || !Number.isFinite(p) ? "–" : `${Math.round(p)}%`);

/** What the page's figures are as of, in words: "published for 18 Nov 2026" (an official yield), "close of 19 Nov
 *  2026", "19 Nov 23:18 SGT" (a print). */
export function asOfWords(i: Pick<InstrumentInfo, "asOf" | "asOfKind">): string {
  if (!i.asOf) return "–";
  return i.asOfKind === "published" ? `published for ${fmtDate(i.asOf.slice(0, 10))}` : i.asOfKind === "close" ? `close of ${fmtDate(i.asOf.slice(0, 10))}` : fmtStamp(i.asOf);
}
/** The currencies of its calendar in words: "USD and JPY", "EUR". */
export const ccyWords = (ccys: string[]): string => (ccys.length <= 1 ? ccys.join("") : `${ccys.slice(0, -1).join(", ")} and ${ccys[ccys.length - 1]}`);
/** The words its headlines were matched by, as the NEWS head says them: "yen, JPY, BoJ, Bank of Japan". */
export const matchedWords = (w: string[]): string => w.join(", ");

/** The impact levels of a calendar list, as the NEWS tab offers them. */
export type ImpactPick = "high" | "hm" | "all";
export const impactOk = (e: Pick<EconEvent, "impact">, imp: ImpactPick): boolean => imp === "all" || e.impact === "High" || (imp === "hm" && e.impact === "Medium");

/** The daily periods: an official yield is published once a day, so its chart has no 1D, 1W or 1M. */
export const DAILY_PERIODS: ChartPeriod[] = ASSET_PERIODS.filter((p) => !["1D", "1W", "1M"].includes(p));
export const periodsOf = (i: Pick<InstrumentInfo, "official">): ChartPeriod[] => (i.official ? DAILY_PERIODS : ASSET_PERIODS);

/** The last print and the day's change from the chart's row (MARKETS' own for a Monitor instrument): a yield's day is
 *  the change of its level (points; bp on the page), a price's the table's per cent. */
export function lastAndDay(row: Pick<TableRow, "last" | "closes" | "pct">, u: Units): { last: number | null; day: number | null } {
  const c = row.closes.d1;
  return { last: row.last, day: u === "yield" ? (row.last != null && c != null ? row.last - c : null) : row.pct.d1 ?? null };
}

/** The three readings of realised volatility on one line: a yield's "6.1 / 5.8 / 6.4 bp/day", a price's "7.4 / 8.1 /
 *  9.0% ann." (the designer's §3.2); under it a yield's per year, and each window's three-year percentile. */
export function volLine(v: InstrumentInfo["vol"], u: Units): { main: string; sub: string } {
  const xs: VolStat[] = [v.m1, v.m3, v.m12];
  const num = (s: VolStat) => (s.ann == null ? "–" : u === "yield" ? (s.day == null ? "–" : (s.day * 100).toFixed(1)) : s.ann.toFixed(1));
  const ann = u === "yield" ? `${xs.map((s) => (s.ann == null ? "–" : String(Math.round(s.ann * 100)))).join(" / ")} bp ann. · ` : "";
  const pc = xs.every((s) => s.pctl == null) ? "–" : `${xs.map((s) => (s.pctl == null || !Number.isFinite(s.pctl) ? "–" : String(Math.round(s.pctl)))).join(" / ")}%`;
  return { main: `${xs.map(num).join(" / ")}${u === "yield" ? " bp/day" : "% ann."}`, sub: `${ann}3Y pctl ${pc}` };
}
export const volTip = (u: Units): string => (u === "yield"
  ? "Standard deviation of the yield's daily changes over 21, 63 and 252 sessions, in bp a day (and times √252, a year). 3Y pctl: where today's reading stands among the daily readings of the last three years (0% the calmest, 100% the most volatile)."
  : "Standard deviation of the daily log returns over 21, 63 and 252 sessions, as a yearly figure (times √252). 3Y pctl: where today's reading stands among the daily readings of the last three years (0% the calmest, 100% the most volatile).");

/** Where an instrument's figures come from, in words, under its tables. */
export function sourceNote(i: Pick<InstrumentInfo, "official" | "monitor" | "source" | "history">): string {
  if (i.official) return `${i.source} publishes this yield once a day: these are its daily figures, with no prices within the day. Realised volatility, the 52-week high and low and the largest moves are worked out from them since ${fmtDate(i.history.from)}.`;
  if (i.monitor) return `The same figures as MARKETS (${i.source}). Realised volatility, the 52-week high and low and the largest moves are worked out from the Monitor's stored daily closes since ${fmtDate(i.history.from)}.`;
  return `Worked out from Yahoo Finance's quote and its daily closes since ${fmtDate(i.history.from)}, by the rules of the MARKETS table.`;
}

/** Where PERFORMANCE's changes come from, in words, under it: MARKETS' own figures, an official publisher's daily
 *  ones, or worked out by MARKETS' rules from Yahoo Finance's quote and daily closes. */
export function perfNote(i: Pick<InstrumentInfo, "official" | "monitor" | "source">): string {
  if (i.official) return `${i.source} publishes this yield once a day: these are its daily figures, with no prices within the day.`;
  if (i.monitor) return `The same figures as MARKETS (${i.source}).`;
  return "Worked out from Yahoo Finance's quote and its daily closes, by the rules of the MARKETS table.";
}

/** Which of KEY DATA's figures the Monitor works out itself (the designer's † of §3.2; the reviewer's R2B-05): the
 *  52-week high and low with their dates and the distance from them, realised volatility with its percentile, the
 *  largest rise and fall; and, where the instrument is not on MARKETS, σ vs 1M avg and vs 200D too (MARKETS' own
 *  otherwise, as there, without the mark). */
export type KeyLine = "range52" | "fromHiLo" | "z1m" | "vs200" | "vol" | "rise" | "fall";
export const workedOut = (i: Pick<InstrumentInfo, "monitor">, line: KeyLine): boolean => (line === "z1m" || line === "vs200" ? !i.monitor : true);
/** The line under KEY DATA that says what † means here: "† worked out here from the daily closes the Monitor stores
 *  from Yahoo Finance, 26 Nov 2021 – 19 Nov 2026; the other figures as on MARKETS". An official yield's are its
 *  publisher's daily figures; a name the Monitor does not follow, Yahoo Finance's daily closes. */
export function workedLine(i: Pick<InstrumentInfo, "official" | "monitor" | "source" | "history">): string {
  const from = i.history.from ? fmtDate(i.history.from) : null, to = i.history.to ? fmtDate(i.history.to) : null;
  const span = from && to ? `, ${from} – ${to}` : from ? ` since ${from}` : "";
  const what = i.official ? `${i.source}'s published daily yields` : i.monitor ? `the daily closes the Monitor stores from ${i.source}` : "Yahoo Finance's daily closes";
  return `\u2020 worked out here from ${what}${span}${i.monitor ? "; the other figures as on MARKETS" : ""}.`;
}

/** The calendar's source, as the NEWS tab names it. */
export const calSource = (rows: Array<Pick<EconEvent, "source">>): string => (rows[0]?.source === "fxstreet" ? "FXStreet" : rows.length ? "ForexFactory" : "");
/** What an empty calendar says. */
export const noEvents = (ccys: string[], imp: ImpactPick): string => `No ${imp === "high" ? "High-impact " : imp === "hm" ? "High or Medium " : ""}${ccyWords(ccys) || "currency"} events from five days back to eight days ahead${imp === "all" ? "" : ": Impact All shows the rest"}.`;


// ---- a future's contract and its rolls (B-27, 20 Nov 2026) ----
/** "Feb 2027 (GCG27) · expires 24 Feb 2027"; "–" before the Monitor has read the contract. */
export function contractLine(f: FuturesInfo | undefined, today: string = partsIn(SGT).ymd): string {
  if (!f?.contract) return "–";
  // "expired" once its day has passed (Singapore's date): a stale quote can name a contract long gone (TIO=F's, 2021)
  const past = !!f.expires && f.expires < today;
  return `${f.month ?? f.contract} (${codeOf(f.contract)})${f.expires ? ` · ${past ? "expired" : "expires"} ${fmtDate(f.expires)}` : ""}`;
}
/** "20 Nov 2026 · from Dec 2026, +3.00% change of contract"; "none since <date>" when the record holds none. */
export function lastRollLine(f: FuturesInfo | undefined): string {
  const r = f?.lastRoll;
  if (!r) return f?.knownFrom ? `none recorded since ${fmtDate(f.knownFrom)}` : "–";
  return `${fmtDate(r.d)} · ${r.fromMonth ? `from ${r.fromMonth}` : "from a contract no longer listed"}${r.step != null ? `, ${fmtPct(r.step, 2)} change of contract` : ", change of contract not measured"}`;
}
/** What the series is (B's line): said under KEY DATA on both layouts. */
export const SERIES_LINE = "A front-month series (Yahoo's =F): on a roll day it moves to the next contract, and that step is not a move.";
/** Which figures leave the rolls out, and from when the Monitor knows them (B-27). */
export function rollsOutLine(i: Pick<InstrumentInfo, "futures" | "rollsOut">): string {
  const f = i.futures;
  if (!f) return "";
  const from = f.knownFrom ? fmtDate(f.knownFrom) : null;
  return `Rolls left out of realised vol and its percentile, σ vs 1M avg, the largest rise and fall and the 1D in σ: ${i.rollsOut ?? f.rolls.length}${from ? ` since ${from}` : ""}.${from ? ` Changes of contract before ${from} are not known to the Monitor (Yahoo keeps no expired contract) and stay in figures over windows that reach back before then.` : ""} The 52W range, vs 200D and the changes over 1W to 36M are the series' own.`;
}
/** Each roll as a mark on the daily chart (B: "roll from Dec to Jan: x% is a change of contract"). */
export function rollMarks(f: FuturesInfo | undefined): ChartMark[] {
  return (f?.rolls ?? []).map((r) => ({
    t: Date.parse(r.d + "T12:00:00Z") / 1000, dir: (r.step ?? 0) >= 0 ? 1 : -1, roll: true, title: `${fmtDate(r.d)} · change of contract`,
    items: [{ text: r.step != null ? `${rollWords(r.from, r.to)}: ${fmtPct(r.step, 2)} is a change of contract` : `${rollWords(r.from, r.to)}: the change of contract was not measured`,
      why: `Yahoo's front-month series moved ${r.from ? `from ${monthOf(r.from)} (${codeOf(r.from)}) ` : ""}to ${monthOf(r.to)} (${codeOf(r.to)}) on this day. The step is not a move: it is left out of the volatility, σ and the largest moves here, and raises no alert. Source: ${r.source}.` }],
  }));
}