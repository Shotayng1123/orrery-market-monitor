// The market table: one row per active instrument with last print, period anchors and % changes.
// Rebuilt by `tick` once a minute (and by `daily` after history runs) into snapshots.key = 'table'.
import { db, type InstrumentRow } from "./db.ts";
import { localDate, marketById, marketState, partsIn, type Holidays } from "./sessions.ts";

type PeriodKey = "d1" | "w1" | "m1" | "m3" | "m12" | "m36";
const PERIODS: PeriodKey[] = ["d1", "w1", "m1", "m3", "m12", "m36"];

interface Anchor { symbol: string; ref_d: string; last_d: string | null; last_close: number | null; [k: string]: string | number | null }
interface Quote { symbol: string; price: number; prev_close: number | null; market_time: string; fetched_at: string }
interface Stat { symbol: string; mean21: number | null; sd21: number | null; hi252: number | null; lo252: number | null; mean200: number | null }

export interface TableRow {
  symbol: string; name: string; cls: string; group: string; market: string; currency: string; decimals: number; proxyFor?: string; order: number;
  last: number | null; lastAt: string | null; live: boolean; source: string;
  closes: Partial<Record<PeriodKey, number | null>>; closeDates: Partial<Record<PeriodKey, string | null>>;
  pct: Partial<Record<PeriodKey, number | null>>; chg: Partial<Record<PeriodKey, number | null>>;
  marketTab: boolean; chart: boolean;
  z1m: number | null;    // (last − 21-day mean) / 21-day standard deviation
  pos52: number | null;  // position in the 52-week range, 0–100
  vs200: number | null;  // % (bp for yields handled by the view) above the 200-day average
}

export async function loadHolidays(): Promise<Holidays> {
  const { data } = await db.from("sessions_cal").select("market,d").gte("d", new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10)).lte("d", new Date(Date.now() + 400 * 86400e3).toISOString().slice(0, 10));
  const h: Holidays = {};
  for (const r of (data ?? []) as Array<{ market: string; d: string }>) (h[r.market] ??= new Set()).add(r.d);
  return h;
}

export async function computeTable(now: Date = new Date()): Promise<{ rows: TableRow[]; asOf: string }> {
  const [{ data: inst, error: e1 }, { data: anchors, error: e2 }, { data: quotes, error: e3 }, holidays, { data: stats }] = await Promise.all([
    db.from("instruments").select("*").eq("active", true).order("ord"),
    db.rpc("fn_table_anchors"),
    db.from("quotes_latest").select("symbol,price,prev_close,market_time,fetched_at"),
    loadHolidays(),
    db.rpc("fn_table_stats"),
  ]);
  if (e1 || e2 || e3) throw new Error((e1 ?? e2 ?? e3)!.message);
  const sBy = new Map(((stats ?? []) as Stat[]).map((x) => [x.symbol, x]));
  const aBy = new Map((anchors as Anchor[]).map((a) => [a.symbol, a]));
  const qBy = new Map((quotes as Quote[]).map((q) => [q.symbol, q]));
  const rows: TableRow[] = [];
  for (const i of inst as InstrumentRow[]) {
    const a = aBy.get(i.symbol), q = qBy.get(i.symbol);
    const m = marketById(i.market);
    // The quote is the newer view only when its exchange-local date is after the last booked close.
    const qDate = q ? localDate(i.tz, Date.parse(q.market_time) / 1000) : null;
    const useQuote = !!q && (!a?.last_d || (qDate! > a.last_d));
    const last = useQuote ? q!.price : a?.last_close ?? null;
    const lastAt = useQuote ? q!.market_time : a?.last_d ? `${a.last_d}T00:00:00Z` : null;
    const open = m ? marketState(m, now, holidays) === "OPEN" : false;
    const ageMin = q ? (now.getTime() - Date.parse(q.market_time)) / 60000 : Infinity;
    const live = useQuote && open && ageMin < (m?.delayMin ?? 0) + 15;
    const closes: TableRow["closes"] = {}, closeDates: TableRow["closeDates"] = {}, pct: TableRow["pct"] = {}, chg: TableRow["chg"] = {};
    for (const p of PERIODS) {
      const c = a ? (a[p] as number | null) : null, d = a ? (a[`${p}_d`] as string | null) : null;
      closes[p] = c; closeDates[p] = d;
      pct[p] = c != null && last != null && c !== 0 ? (last / c - 1) * 100 : null;
      chg[p] = c != null && last != null ? last - c : null;
    }
    const st = sBy.get(i.symbol);
    const z1m = st && st.mean21 != null && st.sd21 && last != null ? (last - st.mean21) / st.sd21 : null;
    const pos52 = st && st.hi252 != null && st.lo252 != null && st.hi252 > st.lo252 && last != null ? ((last - st.lo252) / (st.hi252 - st.lo252)) * 100 : null;
    const vs200 = st && st.mean200 && last != null ? (i.grp === "rates" ? last - st.mean200 : (last / st.mean200 - 1) * 100) : null;
    rows.push({ marketTab: i.market_tab !== false, chart: i.chart !== false, z1m, pos52, vs200, symbol: i.symbol, name: i.name, cls: i.cls, group: i.grp, market: i.market, currency: i.currency, decimals: i.decimals, proxyFor: i.proxy_for ?? undefined, order: i.ord, last, lastAt, live, source: i.provider, closes, closeDates, pct, chg });
  }
  return { rows, asOf: now.toISOString() };
}

export async function saveTableSnapshot(now: Date = new Date()): Promise<number> {
  const t = await computeTable(now);
  const { error } = await db.from("snapshots").upsert({ key: "table", payload: t, at: t.asOf }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return t.rows.length;
}

export const todayIn = (tz: string, now: Date = new Date()): string => partsIn(tz, now).ymd;
