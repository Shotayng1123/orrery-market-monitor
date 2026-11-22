// The market table's rows, worked out from a database client handed in: no client of its own, so that the logic checks
// can run it under Node against a stand-in that cuts every answer at 1,000 rows, as PostgREST does (sim/logic.test.ts;
// the review of fix part 1, FH-3 and CF-3: nothing ran the read and the wiring LS-5 fixed). table.ts hands it the
// server's client. One row per active instrument with last print, period anchors and % changes.
import { fxDay, isFxPair } from "./fx.ts";
import { selectAll } from "./paging.ts";
import type { InstrumentRow } from "./db.ts";   // a type only: nothing of db.ts (the server's client) is loaded
import { localDate, marketById, marketState, type Holidays } from "./sessions.ts";
import { prevCloses, tableLastSession, usableSd, z1mOf, zDay, type AnchorLite, type Booked, type LastSession } from "./sigma.ts";
import { isFuture, rollDay, tradeDate } from "./futures.ts";

type PeriodKey = "d1" | "w1" | "m1" | "m3" | "m12" | "m36";
const PERIODS: PeriodKey[] = ["d1", "w1", "m1", "m3", "m12", "m36"];

interface Anchor { symbol: string; ref_d: string; last_d: string | null; last_close: number | null; [k: string]: string | number | null }
interface Quote { symbol: string; price: number; prev_close: number | null; market_time: string; fetched_at: string }
interface Stat {
  symbol: string; mean21: number | null; sd21: number | null; hi252: number | null; lo252: number | null; mean200: number | null;
  // since 20 Nov 2026 (I-6): the σ of daily changes over 63 sessions ending at the newest close and one session before
  sd63?: number | null; n63?: number | null; from63?: string | null; to63?: string | null;
  sd63x?: number | null; n63x?: number | null; from63x?: string | null; to63x?: string | null;
}
interface RollRec { symbol: string; d: string; from_contract: string | null; to_contract: string; prev_close: number | null }

export interface TableRow {
  symbol: string; name: string; cls: string; group: string; market: string; currency: string; decimals: number; proxyFor?: string; order: number;
  last: number | null; lastAt: string | null; live: boolean; source: string;
  closes: Partial<Record<PeriodKey, number | null>>; closeDates: Partial<Record<PeriodKey, string | null>>;
  pct: Partial<Record<PeriodKey, number | null>>; chg: Partial<Record<PeriodKey, number | null>>;
  marketTab: boolean; chart: boolean;
  z1m: number | null;    // (last − 21-day mean) / 21-day standard deviation
  pos52: number | null;  // position in the 52-week range, 0–100
  vs200: number | null;  // % (bp for yields handled by the view) above the 200-day average
  // I-6 (20 Nov 2026): the day's change over the σ of the instrument's daily changes in the 63 sessions before it
  // (sigma.ts), that σ in the row's units (% for a price, points for a yield), and the window it was worked out from
  // (`zN` the changes counted in it, sent also where they are too few for a σ, so the page can say how many)
  z1d: number | null; sd1d: number | null; zFrom: string | null; zTo: string | null; zN: number | null;
  // B-27: a future's named contract (the quote's underlyingSymbol, as last recorded), and the roll its 1D crosses: the
  // 1D is then the change within the new contract; `step` the change of contract in % (null where not measured)
  contract: string | null;
  roll: { d: string; from: string | null; to: string; step: number | null } | null;
  // B-32 (21 Nov 2026): the instrument's newest completed session, between its last two booked closes, over the σ of the
  // 63 daily changes before it (sigma.ts lastSession); null where the Monitor holds fewer than two closes
  ls: LastSession | null;
}

/** Yields are compared in points; a bond future in the rates group is a price and is compared in per cent. */
const isYield = (i: { grp: string; symbol: string }): boolean => i.grp === "rates" && !i.symbol.endsWith("=F");

/** The client the table reads with: the server's Supabase client, or the checks' stand-in. */
// deno-lint-ignore no-explicit-any
export type TableDb = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

export async function loadHolidaysWith(db: TableDb, now: Date = new Date()): Promise<Holidays> {
  const { data } = await db.from("sessions_cal").select("market,d").gte("d", new Date(now.getTime() - 2 * 86400e3).toISOString().slice(0, 10)).lte("d", new Date(now.getTime() + 400 * 86400e3).toISOString().slice(0, 10));
  const h: Holidays = {};
  for (const r of (data ?? []) as Array<{ market: string; d: string }>) (h[r.market] ??= new Set()).add(r.d);
  return h;
}

export async function computeTableWith(db: TableDb, now: Date = new Date()): Promise<{ rows: TableRow[]; asOf: string }> {
  const since = new Date(now.getTime() - 15 * 86400e3).toISOString().slice(0, 10);
  const [{ data: inst, error: e1 }, { data: anchors, error: e2 }, { data: quotes, error: e3 }, holidays, { data: stats }, { data: futc }, { data: futr }] = await Promise.all([
    db.from("instruments").select("*").eq("active", true).order("ord"),
    db.rpc("fn_table_anchors"),
    db.from("quotes_latest").select("symbol,price,prev_close,market_time,fetched_at"),
    loadHolidaysWith(db, now),
    db.rpc("fn_table_stats"),
    // B-27: each future's contract as last recorded, and its rolls of the last two weeks (none before the 20 Nov 2026 change)
    db.from("fut_contracts").select("symbol,d,contract").gte("d", since).order("d", { ascending: false }),
    db.from("fut_rolls").select("symbol,d,from_contract,to_contract,prev_close").gte("d", since),
  ]);
  if (e1 || e2 || e3) throw new Error((e1 ?? e2 ?? e3)!.message);
  const contractOf = new Map<string, string>();
  for (const c of (futc ?? []) as Array<{ symbol: string; d: string; contract: string }>) if (!contractOf.has(c.symbol)) contractOf.set(c.symbol, c.contract);   // newest first
  const rollsOf = new Map<string, RollRec[]>();
  for (const r of (futr ?? []) as RollRec[]) { if (!rollsOf.has(r.symbol)) rollsOf.set(r.symbol, []); rollsOf.get(r.symbol)!.push(r); }
  const sBy = new Map(((stats ?? []) as Stat[]).map((x) => [x.symbol, x]));
  const aBy = new Map((anchors as Anchor[]).map((a) => [a.symbol, a]));
  const qBy = new Map((quotes as Quote[]).map((q) => [q.symbol, q]));
  // The SQL dates a quote in the instrument's time zone. When that date is after the last booked close but the
  // quote is not a new session (a currency pair's Friday quote that Yahoo re-stamps on Saturday), the SQL hands
  // back the last close itself as the "previous close". Fetch the close before it for those symbols.
  const stuck = (anchors as Anchor[]).filter((a) => a.last_d && a.d1_d === a.last_d);
  let prevBy = new Map<string, Booked>();
  if (stuck.length) {
    const lo = stuck.map((a) => a.last_d as string).sort()[0];
    const from = new Date(Date.parse(lo + "T00:00:00Z") - 14 * 86400e3).toISOString().slice(0, 10);
    // Read page by page (the checks of round 3b: LS-5). One request brought at most 1,000 rows, and in New York's
    // hours this read asks for 650 to 740 (most instruments' quotes are then the newer view); with one instrument's
    // closes unbooked for a week it passed 1,000, the newest dates were the ones left out, and those rows lost their
    // earlier close without a word. Ordered by day, then symbol, so that the pages do not overlap. A read that fails
    // leaves the rows without that close, as before, and the table is still built.
    let prevRows: Array<{ symbol: string; d: string; close: number }> = [];
    try { prevRows = await selectAll<{ symbol: string; d: string; close: number }>(() => db.from("prices_daily").select("symbol,d,close").in("symbol", stuck.map((a) => a.symbol)).gte("d", from).order("d").order("symbol")); } catch { prevRows = []; }
    prevBy = prevCloses(prevRows, new Map(stuck.map((a) => [a.symbol, a.last_d as string])));
  }
  const rows: TableRow[] = [];
  for (const i of inst as InstrumentRow[]) {
    const a = aBy.get(i.symbol), q = qBy.get(i.symbol);
    const m = marketById(i.market);
    // The quote is the newer view only when its exchange-local date is after the last booked close.
    // (a currency pair's day rolls at 17:00 New York, the same boundary its daily closes are booked on)
    const qDate = q ? (isFxPair(i.symbol) ? fxDay(Date.parse(q.market_time) / 1000) : localDate(i.tz, Date.parse(q.market_time) / 1000)) : null;
    const useQuote = !!q && (!a?.last_d || (qDate! > a.last_d));
    const last = useQuote ? q!.price : a?.last_close ?? null;
    const lastAt = useQuote ? q!.market_time : a?.last_d ? `${a.last_d}T00:00:00Z` : null;
    const open = m ? marketState(m, now, holidays) === "OPEN" : false;
    const ageMin = q ? (now.getTime() - Date.parse(q.market_time)) / 60000 : Infinity;
    const live = useQuote && open && ageMin < (m?.delayMin ?? 0) + 15;
    const closes: TableRow["closes"] = {}, closeDates: TableRow["closeDates"] = {}, pct: TableRow["pct"] = {}, chg: TableRow["chg"] = {};
    // B-27: a future whose day runs across a change of contract (a roll after the close its 1D is measured from, and not
    // after the session its last figure belongs to: a print's CME trade date, or the last booked close): its 1D is the
    // change within the new contract, from that contract's own close before it; unmeasured, the day has no σ
    const dayEnd = useQuote ? tradeDate(Date.parse(q!.market_time) / 1000) : a?.last_d ?? null;
    const dayFrom = useQuote ? a?.last_d ?? null : a?.last_d && a.d1_d === a.last_d ? prevBy.get(i.symbol)?.d ?? null : a?.d1_d ?? null;
    const rr = isFuture(i.symbol) && dayEnd ? (rollsOf.get(i.symbol) ?? []).filter((r) => r.d <= dayEnd && (!dayFrom || r.d > dayFrom)).sort((x, y) => y.d.localeCompare(x.d))[0] : undefined;
    let roll: TableRow["roll"] = null;
    for (const p of PERIODS) {
      // When the quote is newer than the last booked close, that close is the previous close by definition. (The
      // SQL anchors date a quote in the instrument's time zone; a currency pair's day rolls at 17:00 New York, so
      // for the hours between that roll and London midnight the SQL "previous close" would be a day too old.)
      const prevIsLast = p === "d1" && useQuote && a?.last_close != null;
      const before = p === "d1" && !useQuote && a?.last_d && a.d1_d === a.last_d ? prevBy.get(i.symbol) : undefined;   // see `stuck` above
      let c = prevIsLast ? a!.last_close : before ? before.close : a ? (a[p] as number | null) : null;
      const d = prevIsLast ? a!.last_d : before ? before.d : a ? (a[`${p}_d`] as string | null) : null;
      if (p === "d1" && rr) { const x = rollDay(c, rr.prev_close); roll = { d: rr.d, from: rr.from_contract, to: rr.to_contract, step: x.step }; c = x.base; }
      closes[p] = c; closeDates[p] = d;
      pct[p] = c != null && last != null && c !== 0 ? (last / c - 1) * 100 : null;
      chg[p] = c != null && last != null ? last - c : null;
    }
    const st = sBy.get(i.symbol);
    // σ vs 1M avg across a roll (B-27): a roll today, after the newest booked close, sets the booked closes on the new
    // contract's level as the database sets those before a booked roll (times the new contract's own close over the
    // series'); a day across a change of contract that is not known has none, as the database gives none for a booked
    // one (the reviewer's F1: with f = 1 the print was set against the old contract's 21 closes)
    const f = !rr ? 1 : rr.prev_close == null || !(rr.prev_close > 0) ? null : useQuote ? (a?.last_close ? rr.prev_close / a.last_close : null) : 1;
    const z1m = z1mOf(last, st?.mean21, st?.sd21, f);
    // the day in σ: a print after the last booked close against the 63 changes up to that close; a day that is the
    // last booked close itself (a closed market, an official yield) against the 63 before it (sigma.ts)
    const own = useQuote, sd = usableSd(own ? st?.sd63 : st?.sd63x, own ? st?.n63 : st?.n63x);
    const z1d = roll && roll.step == null ? null : zDay(isYield(i) ? chg.d1 : pct.d1, sd);
    // B-32: the newest completed session, whatever the row shows now: the last booked close against the one before it
    // (the anchors give that one unless the quote is the newer view, when it was fetched above: `stuck`), over the σ of
    // the 63 changes before it; a roll between the two closes counted within the new contract
    // (which closes, which roll and which window: sigma.ts tableLastSession, where the logic checks run it)
    const ls = tableLastSession(a as AnchorLite | undefined, prevBy.get(i.symbol), rollsOf.get(i.symbol) ?? [], st, isYield(i) ? "yield" : "price", isFuture(i.symbol));
    const pos52 = st && st.hi252 != null && st.lo252 != null && st.hi252 > st.lo252 && last != null ? ((last - st.lo252) / (st.hi252 - st.lo252)) * 100 : null;
    const vs200 = st && st.mean200 && last != null ? (isYield(i) ? last - st.mean200 : (last / st.mean200 - 1) * 100) : null;
    rows.push({ marketTab: i.market_tab !== false, chart: i.chart !== false, z1m, pos52, vs200,
      z1d, sd1d: sd, zFrom: sd == null ? null : (own ? st?.from63 : st?.from63x) ?? null, zTo: sd == null ? null : (own ? st?.to63 : st?.to63x) ?? null, zN: (own ? st?.n63 : st?.n63x) ?? null,
      contract: isFuture(i.symbol) ? contractOf.get(i.symbol) ?? null : null, roll, ls, symbol: i.symbol, name: i.name, cls: i.cls, group: i.grp, market: i.market, currency: i.currency, decimals: i.decimals, proxyFor: i.proxy_for ?? undefined, order: i.ord, last, lastAt, live, source: i.provider, closes, closeDates, pct, chg });
  }
  return { rows, asOf: now.toISOString() };
}
