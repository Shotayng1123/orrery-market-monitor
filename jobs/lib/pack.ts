// The numbers pack for the Morning Notes: everything the model is allowed to cite. Computed from the Monitor's
// own data (table snapshot, daily history, calendar, news) plus constituent and sector-ETF moves from Yahoo.
// Every figure carries where it came from; nothing is estimated here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { nikkei225, sp500, type ConstituentList } from "./constituents.js";
import { lastTwo, spark } from "./yahoo.js";
import { selectAll, SGT, ymdIn } from "./db.js";
import { barDayEnd, stoppedBeforeClose } from "../../supabase/functions/_shared/feedhealth.js";

export interface Move { symbol: string; name: string; last: number; prev: number; pct: number; sector?: string; weight?: number | null }
export interface SectorMove { sector: string; pct: number; n: number; weighted: boolean }
export interface Pack {
  kind?: "daily"; generatedAt: string; dateSgt: string;
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; lastAt: string | null; d1Pct: number | null; d1Chg: number | null; w1Pct: number | null; m1Pct: number | null; unit: "pct" | "bp" }>;
  us: { session: string | null; indices: Move[]; sectorsEtf: Move[]; sectorsConstituents: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number } | null; source: string };
  jp: { session: string | null; indices: Move[]; sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number } | null; impliedOpenPct: number | null; impliedNote: string; source: string };
  technicals: Array<{ symbol: string; name: string; last: number; dma20: number | null; dma50: number | null; dma200: number | null; z1m: number | null; z12m: number | null; vsDma200Pct: number | null }>;
  calendar: Array<{ atSgt: string; country: string; title: string; impact: string; forecast: string | null; previous: string | null }>;
  headlines: Array<{ publishedAt: string; source: string; title: string; url: string; category: string }>;
  notes: string[];
  /** Said to the reader, on the page and by the writer: a market whose prices stopped arriving before its close,
   *  so that its figures here are not closing levels (19 Nov 2026; absent from older packs). */
  warnings?: string[];
}

const SECTOR_ETFS: Array<[string, string]> = [["XLK", "Technology"], ["XLF", "Financials"], ["XLV", "Health Care"], ["XLE", "Energy"], ["XLY", "Consumer Discretionary"], ["XLP", "Consumer Staples"], ["XLI", "Industrials"], ["XLU", "Utilities"], ["XLRE", "Real Estate"], ["XLB", "Materials"], ["XLC", "Communication Services"]];
const pct = (a: number, b: number) => (b / a - 1) * 100;
const r2 = (x: number) => Math.round(x * 100) / 100;

async function movesFor(list: ConstituentList, log: (s: string) => void): Promise<Move[]> {
  const syms = list.rows.map((r) => r.symbol);
  const s = await spark(syms, "5d", "1d", (d, t) => { if (d % 100 === 0 || d === t) log(`  ${list.index}: ${d}/${t}`); });
  const out: Move[] = [];
  for (const r of list.rows) {
    const x = s[r.symbol]; if (!x) continue;
    const { prev, last } = lastTwo(x);
    if (!prev || !last || prev.v === 0) continue;
    out.push({ symbol: r.symbol, name: r.name, sector: r.sector, weight: r.weight, last: last.v, prev: prev.v, pct: r2(pct(prev.v, last.v)) });
  }
  return out;
}
function breadth(m: Move[]) {
  if (!m.length) return null;
  return { n: m.length, up: m.filter((x) => x.pct > 0).length, down: m.filter((x) => x.pct < 0).length, over2: m.filter((x) => x.pct >= 2).length, under2: m.filter((x) => x.pct <= -2).length, over5: m.filter((x) => x.pct >= 5).length, under5: m.filter((x) => x.pct <= -5).length };
}
function sectorAgg(m: Move[], weighted: boolean): SectorMove[] {
  const by = new Map<string, { w: number; s: number; n: number }>();
  for (const x of m) {
    const k = x.sector ?? "Other", w = weighted ? (x.weight ?? 0) : 1;
    const e = by.get(k) ?? { w: 0, s: 0, n: 0 }; e.w += w; e.s += w * x.pct; e.n++; by.set(k, e);
  }
  return [...by.entries()].filter(([, e]) => e.w > 0).map(([sector, e]) => ({ sector, pct: r2(e.s / e.w), n: e.n, weighted })).sort((a, b) => b.pct - a.pct);
}
const sortDesc = (m: Move[]) => [...m].sort((a, b) => b.pct - a.pct);

export async function buildPack(sb: SupabaseClient, log: (s: string) => void = console.log): Promise<Pack> {
  const notes: string[] = [];
  const now = new Date();
  // 1. the market table (last, 1D/1W/1M) from the snapshot the tick keeps
  const { data: snap } = await sb.from("snapshots").select("payload,at").eq("key", "table").maybeSingle();
  type Row = { symbol: string; name: string; cls: string; group: string; last: number | null; lastAt: string | null; pct: Record<string, number | null>; chg: Record<string, number | null> };
  const rows: Row[] = (snap?.payload as { rows?: Row[] } | null)?.rows ?? [];
  if (!rows.length) notes.push("market table snapshot missing: the backend has not run yet");
  const table: Pack["table"] = rows.map((r) => ({ symbol: r.symbol, name: r.name, cls: r.cls, last: r.last, lastAt: r.lastAt, d1Pct: r.pct?.d1 ?? null, d1Chg: r.chg?.d1 ?? null, w1Pct: r.pct?.w1 ?? null, m1Pct: r.pct?.m1 ?? null, unit: r.group === "rates" ? "bp" : "pct" }));
  const byRow = new Map(rows.map((r) => [r.symbol, r]));
  // 1b. Did the prices stop before a market closed? On 18 Nov 2026 every price stopped at 10:52 New York time
  // and the feed went on answering with it: read at 22:15 UTC those are not closing levels, and a note that
  // presented them as such would be wrong in every table (supabase/functions/_shared/feedhealth.ts).
  const warnings: string[] = [];
  // a fault in this reading must not cost the morning its note: it is logged, and the note is written without it
  try {
    const { data: shut } = await sb.from("sessions_cal").select("market,d").gte("d", new Date(now.getTime() - 20 * 86400e3).toISOString().slice(0, 10));
    const holidays: Record<string, Set<string>> = {};
    for (const r of (shut ?? []) as Array<{ market: string; d: string }>) (holidays[r.market] ??= new Set()).add(r.d);
    const clock = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)).replace(",", "");
    // The table gives each row its last value's time: a quote's own print time, or, once the day's close is
    // booked, that day's date alone (table.ts). Only a quote can have stopped short of the close; a booked close
    // is a closing level. (The first version of this check read the date-only stamp as a print at midnight UTC,
    // and its first run on live data, 18 Nov, wrongly reported Tokyo as stopped at 09:00.)
    const dated = (at: string) => /T00:00:00(?:\.000)?Z$/.test(at);
    const { data: lastQ } = await sb.from("quotes_latest").select("symbol,price,market_time").in("symbol", ["^GSPC", "^N225"]);
    const quoteOf = new Map(((lastQ ?? []) as Array<{ symbol: string; price: number; market_time: string }>).map((r) => [r.symbol, r]));
    for (const [symbol, market, tz, place, whose] of [["^GSPC", "NYSE", "America/New_York", "New York", "US"], ["^N225", "TSE", "Asia/Tokyo", "Tokyo", "Japanese"]] as const) {
      const at = byRow.get(symbol)?.lastAt ?? null;
      if (at && !dated(at)) {
        const st = stoppedBeforeClose(market, at, now.getTime(), holidays);
        if (st) warnings.push(`Prices from ${place} stopped arriving at ${clock(st.last, tz)} ${place} time, before the close at ${clock(st.close, tz)}. The ${whose} figures in these tables are as of then, not closing levels.`);
      } else {
        // The close is booked, but the minute feed of that session stopped short of it. The daily history is read
        // from the same source: where that too had stopped, what it booked as the day's close is the last price
        // before the stop (19 Nov 2026: the S&P 500's "close" of 18 Nov was 7303.98, its quote of 10:52 New York
        // time). A booked close equal to that quote is not a close, and the note is warned as for a quote. Where
        // the two differ the history went on after the feed stopped, and the writer is only told where the booked
        // levels come from.
        const q = quoteOf.get(symbol), booked = byRow.get(symbol)?.last ?? null;
        const st = stoppedBeforeClose(market, q?.market_time ?? null, now.getTime(), holidays);
        if (st && q && booked != null && q.price > 0 && Math.abs(booked / q.price - 1) < 1e-6) warnings.push(`Prices from ${place} stopped arriving at ${clock(st.last, tz)} ${place} time, before the close at ${clock(st.close, tz)}, and the level booked as that day's close is that last price. The ${whose} figures in these tables are as of then, not closing levels.`);
        else if (st) notes.push(`the minute feed from ${place} stopped at ${clock(st.last, tz)} ${place} time, before the close at ${clock(st.close, tz)}; the ${whose} closing levels here were booked afterwards from the daily history`);
      }
    }
    // Row by row, for everything else in the table, market by market (the stop of 18 Nov 2026 spared crypto, so
    // it cannot be read from the table as a whole). A market's prices reach as far as the newest print of any
    // of its instruments. A row whose day had not ended by then, and whose booked close still equals its last
    // quote, was booked from that quote. (19 Nov 2026: the indices and currencies had been booked again from
    // the source's real closes, the futures and commodities not yet: oil's "close" of 18 Nov was its price of
    // 10:42 New York time.)
    const [{ data: allQ }, { data: inst }] = await Promise.all([sb.from("quotes_latest").select("symbol,price,market_time").in("symbol", rows.map((r) => r.symbol)), sb.from("instruments").select("symbol,market,provider")]);
    const qBy = new Map(((allQ ?? []) as Array<{ symbol: string; price: number; market_time: string }>).map((q) => [q.symbol, q]));
    const marketOf = new Map(((inst ?? []) as Array<{ symbol: string; market: string; provider: string }>).filter((i) => i.provider === "yahoo").map((i) => [i.symbol, i.market]));
    const reach = new Map<string, number>();
    for (const q of qBy.values()) { const m = marketOf.get(q.symbol), t = Date.parse(q.market_time); if (m && Number.isFinite(t) && t > (reach.get(m) ?? 0)) reach.set(m, t); }
    log(`prices reach, by market: ${[...reach].sort().map(([m, t]) => `${m} ${new Date(t).toISOString().slice(5, 16).replace("T", " ")}`).join("; ") || "no reading"} (UTC)`);
    const frozen = rows.filter((r) => {
      const q = qBy.get(r.symbol), m = marketOf.get(r.symbol), to = m ? reach.get(m) : undefined;
      if (!q || !m || to == null || r.last == null || !r.lastAt || !dated(r.lastAt) || !(q.price > 0)) return false;
      const end = barDayEnd(m, r.lastAt.slice(0, 10));
      return end != null && end - 30 * 60000 > to && Math.abs(r.last / q.price - 1) < 1e-6;
    });
    if (frozen.length) {
      const stops = [...new Set(frozen.map((r) => reach.get(marketOf.get(r.symbol)!)!))].sort((x, y) => x - y);
      warnings.push(`Prices for these rows stopped arriving at ${clock(new Date(stops[0]).toISOString(), "UTC")} UTC${stops.length > 1 ? ` (the latest of them at ${clock(new Date(stops[stops.length - 1]).toISOString(), "UTC")} UTC)` : ""}, before the end of their day, and the level booked as their latest close is that last price, not a closing level: ${frozen.map((r) => r.name).join(", ")}.`);
    }
  } catch (e) { log(`the check for prices that stopped before a close could not be made: ${e instanceof Error ? e.message : String(e)}`); }
  if (warnings.length) log(`WARNING: ${warnings.join(" ")}`);
  const idx = (symbol: string, name: string): Move | null => { const r = byRow.get(symbol); if (!r || r.last == null || r.pct?.d1 == null) return null; const prev = r.last / (1 + r.pct.d1 / 100); return { symbol, name, last: r.last, prev, pct: r2(r.pct.d1) }; };

  // 2. US constituents and sector ETFs
  log("US constituents…");
  const sp = await sp500();
  const usMoves = await movesFor(sp, log);
  const etf = await spark(SECTOR_ETFS.map(([s]) => s), "5d", "1d");
  const sectorsEtf: Move[] = SECTOR_ETFS.flatMap(([sym, name]) => { const x = etf[sym]; if (!x) return []; const { prev, last } = lastTwo(x); return prev && last ? [{ symbol: sym, name, last: last.v, prev: prev.v, pct: r2(pct(prev.v, last.v)) }] : []; });
  const usSession = usMoves.length ? null : null;
  const usIdx = [idx("^GSPC", "S&P 500"), idx("^IXIC", "NASDAQ Composite"), idx("^SOX", "SOX"), idx("^DJI", "Dow"), idx("^RUT", "Russell 2000"), idx("^VIX", "VIX")].filter((x): x is Move => !!x);

  // 3. Japan constituents (previous session)
  log("Nikkei 225 constituents…");
  const nk = await nikkei225();
  // Nikkei's CSV carries upper-case short names ("TAISEI CORP."); the page and the weekly note show the English
  // company names kept in `constituents`, so the daily tables use the same ones.
  const nkNames = await selectAll<{ symbol: string; name_en: string | null }>(() => sb.from("constituents").select("symbol,name_en").eq("idx", "NK225").order("symbol"));
  const nameBy = new Map(nkNames.filter((r) => r.name_en).map((r) => [r.symbol, r.name_en as string]));
  for (const r of nk.rows) r.name = nameBy.get(r.symbol) ?? r.name;
  const jpMoves = await movesFor(nk, log);
  const jpIdx = [idx("^N225", "Nikkei 225"), idx("1306.T", "TOPIX (1306.T proxy)")].filter((x): x is Move => !!x);
  const n225 = byRow.get("^N225"), nkd = byRow.get("NKD=F");
  const impliedOpenPct = n225?.last != null && nkd?.last != null ? r2(pct(n225.last, nkd.last)) : null;

  // 4. technicals from daily history
  log("technicals…");
  const technicals: Pack["technicals"] = [];
  for (const [symbol, name] of [["^N225", "Nikkei 225"], ["1306.T", "TOPIX proxy"], ["^GSPC", "S&P 500"], ["^IXIC", "NASDAQ Composite"], ["USDJPY=X", "USD/JPY"], ["^TNX", "UST 10Y"]] as const) {
    const hist = await selectAll<{ d: string; close: number }>(() => sb.from("prices_daily").select("d,close").eq("symbol", symbol).order("d", { ascending: false }).limit(300));
    const closes = hist.map((h) => h.close).reverse();
    if (closes.length < 30) continue;
    const last = byRow.get(symbol)?.last ?? closes[closes.length - 1];
    const dma = (n: number) => (closes.length >= n ? closes.slice(-n).reduce((a, b) => a + b, 0) / n : null);
    const z = (n: number) => { if (closes.length < n) return null; const w = closes.slice(-n); const m = w.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n); return sd ? r2((last - m) / sd) : null; };
    const d200 = dma(200);
    technicals.push({ symbol, name, last, dma20: dma(20), dma50: dma(50), dma200: d200, z1m: z(21), z12m: z(252), vsDma200Pct: d200 ? r2(pct(d200, last)) : null });
  }

  // 5. today's calendar (SGT day) and the last 14 hours of headlines
  const dateSgt = ymdIn(SGT, now);
  const dayStart = new Date(`${dateSgt}T00:00:00+08:00`), dayEnd = new Date(dayStart.getTime() + 86400e3);
  const { data: cal } = await sb.from("econ_events").select("at,country,title,impact,forecast,previous").gte("at", dayStart.toISOString()).lt("at", dayEnd.toISOString()).in("impact", ["High", "Medium"]).order("at");
  const fmtSgt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: SGT, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const calendar = (cal ?? []).map((e) => ({ atSgt: fmtSgt(e.at), country: e.country, title: e.title, impact: e.impact, forecast: e.forecast, previous: e.previous }));
  const { data: news } = await sb.from("news_items").select("published_at,source,title,url,category").gte("published_at", new Date(now.getTime() - 14 * 3600e3).toISOString()).order("published_at", { ascending: false }).limit(40);
  const headlines = (news ?? []).map((n) => ({ publishedAt: n.published_at, source: n.source, title: n.title, url: n.url, category: n.category ?? "Macro" }));

  const us = { session: usSession, indices: usIdx, sectorsEtf: sortDesc(sectorsEtf), sectorsConstituents: sectorAgg(usMoves, false), top: sortDesc(usMoves).slice(0, 10), bottom: sortDesc(usMoves).slice(-10).reverse(), big: usMoves.filter((m) => Math.abs(m.pct) >= 5), breadth: breadth(usMoves), source: `${sp.source} (${sp.asOf}); prices Yahoo Finance daily closes` };
  const jp = { session: null, indices: jpIdx, sectors: sectorAgg(jpMoves, true), top: sortDesc(jpMoves).slice(0, 10), bottom: sortDesc(jpMoves).slice(-10).reverse(), big: jpMoves.filter((m) => Math.abs(m.pct) >= 5), breadth: breadth(jpMoves), impliedOpenPct, impliedNote: "CME Nikkei future (USD) vs the Nikkei 225 cash close; an approximation of the opening gap (E)", source: `${nk.source} (${nk.asOf}); prices Yahoo Finance daily closes` };
  return { kind: "daily", generatedAt: now.toISOString(), dateSgt, table, us, jp, technicals, calendar, headlines, notes, ...(warnings.length ? { warnings } : {}) };
}

// ---------- the Sunday weekly wrap-up ----------
export interface WeeklyPack {
  kind: "weekly"; generatedAt: string; dateSgt: string; weekStart: string; weekEnd: string;
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; w1Pct: number | null; w1Chg: number | null; m1Pct: number | null; unit: "pct" | "bp"; z1m?: number | null; pos52?: number | null; vs200?: number | null }>;
  us: { sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: { n: number; up: number; down: number } | null };
  jp: { sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: { n: number; up: number; down: number } | null };
  actuals: Array<{ atSgt: string; country: string; title: string; impact: string; actual: string | null; forecast: string | null; previous: string | null; better: boolean | null }>;
  weekAhead: Array<{ atSgt: string; country: string; title: string; impact: string; forecast: string | null; previous: string | null }>;
  headlines: Array<{ publishedAt: string; source: string; title: string; url: string; category: string }>;
  notes: string[];
}

/** Weekly moves from the Monitor's own data: the table's 1W column, the constituent statistics (pct1w per name,
 *  sector averages, weekly movers), the week's calendar actuals, the week ahead and the week's headlines. */
export async function buildWeeklyPack(sb: SupabaseClient, log: (s: string) => void = console.log): Promise<WeeklyPack> {
  const notes: string[] = [];
  const now = new Date();
  const dateSgt = ymdIn(SGT, now);
  const { data: snap } = await sb.from("snapshots").select("payload").eq("key", "table").maybeSingle();
  type Row = { symbol: string; name: string; cls: string; group: string; last: number | null; pct: Record<string, number | null>; chg: Record<string, number | null>; z1m?: number | null; pos52?: number | null; vs200?: number | null };
  const rows: Row[] = (snap?.payload as { rows?: Row[] } | null)?.rows ?? [];
  if (!rows.length) notes.push("market table snapshot missing");
  const table: WeeklyPack["table"] = rows.map((r) => ({ symbol: r.symbol, name: r.name, cls: r.cls, last: r.last, w1Pct: r.pct?.w1 ?? null, w1Chg: r.chg?.w1 ?? null, m1Pct: r.pct?.m1 ?? null, unit: r.group === "rates" ? "bp" : "pct", z1m: r.z1m == null ? null : r2(r.z1m), pos52: r.pos52 == null ? null : Math.round(r.pos52), vs200: r.vs200 == null ? null : r2(r.vs200) }));   // z1m = sigmas from the 21-day mean, pos52 = place in the 52-week range (0-100), vs200 = % (points for yields) from the 200-day average
  type Stat = { symbol: string; name: string; sector: string | null; weight: number | null; close: number; pct1w: number | null; d: string };
  const weekly = async (idx: string, weighted: boolean) => {
    log(`${idx} weekly moves…`);
    const st = await selectAll<Stat>(() => sb.from("constituent_stats").select("symbol,name,sector,weight,close,pct1w,d").eq("idx", idx).order("symbol"));
    const moves: Move[] = st.filter((x) => x.pct1w != null).map((x) => ({ symbol: x.symbol, name: x.name, sector: x.sector ?? undefined, weight: x.weight, last: x.close, prev: x.close / (1 + x.pct1w! / 100), pct: r2(x.pct1w!) }));
    const sorted = sortDesc(moves);
    return { sectors: sectorAgg(moves, weighted), top: sorted.slice(0, 10), bottom: sorted.slice(-10).reverse(), big: moves.filter((m) => Math.abs(m.pct) >= 10), breadth: moves.length ? { n: moves.length, up: moves.filter((m) => m.pct > 0).length, down: moves.filter((m) => m.pct < 0).length } : null, asOf: st[0]?.d ?? null };
  };
  const us = await weekly("SP500", false), jp = await weekly("NK225", true);
  // the week under review ends on the Sunday on or after today (SGT): on a Sunday that is the week just ended,
  // on a Friday (the Weekly Strategy) it is Monday to today; the week ahead starts on that Sunday
  const dow = new Date(`${dateSgt}T12:00:00+08:00`).getUTCDay();
  const sunday = new Date(new Date(`${dateSgt}T00:00:00+08:00`).getTime() + ((7 - dow) % 7) * 86400e3);
  const weekStartD = new Date(sunday.getTime() - 6 * 86400e3), weekEndD = new Date(sunday.getTime() - 1 * 86400e3);
  const fmtSgt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: SGT, weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const { data: past } = await sb.from("econ_events").select("at,country,title,impact,actual,forecast,previous,better").gte("at", weekStartD.toISOString()).lt("at", sunday.toISOString()).eq("impact", "High").not("actual", "is", null).order("at");
  const { data: next } = await sb.from("econ_events").select("at,country,title,impact,forecast,previous").gte("at", sunday.toISOString()).lt("at", new Date(sunday.getTime() + 8 * 86400e3).toISOString()).in("impact", ["High"]).order("at");
  const MAJOR = new Set(["US", "JP", "EUR", "UK", "CN", "KR", "AU", "DE", "FR", "CA", "CH", "HK", "IN", "TW", "SG"]);
  const actuals = (past ?? []).filter((e) => MAJOR.has(e.country)).map((e) => ({ atSgt: fmtSgt(e.at), country: e.country, title: e.title, impact: e.impact, actual: e.actual, forecast: e.forecast, previous: e.previous, better: e.better ?? null }));
  const weekAhead = (next ?? []).filter((e) => MAJOR.has(e.country)).map((e) => ({ atSgt: fmtSgt(e.at), country: e.country, title: e.title, impact: e.impact, forecast: e.forecast, previous: e.previous }));
  const { data: news } = await sb.from("news_items").select("published_at,source,title,url,category").gte("published_at", weekStartD.toISOString()).order("published_at", { ascending: false }).limit(300);
  // a spread of the week's headlines across desks, newest first within each desk
  const byCat = new Map<string, Array<{ publishedAt: string; source: string; title: string; url: string; category: string }>>();
  for (const n of news ?? []) { const c = n.category ?? "Macro"; byCat.set(c, [...(byCat.get(c) ?? []), { publishedAt: n.published_at, source: n.source, title: n.title, url: n.url, category: c }]); }
  const headlines = [...byCat.values()].flatMap((xs) => xs.slice(0, 10)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (us.asOf) notes.push(`constituent statistics as of ${us.asOf} (weekly % = close against five sessions earlier)`);
  return { kind: "weekly", generatedAt: now.toISOString(), dateSgt, weekStart: ymdIn(SGT, weekStartD), weekEnd: ymdIn(SGT, weekEndD), table, us: { sectors: us.sectors, top: us.top, bottom: us.bottom, big: us.big, breadth: us.breadth }, jp: { sectors: jp.sectors, top: jp.top, bottom: jp.bottom, big: jp.big, breadth: jp.breadth }, actuals, weekAhead, headlines, notes };
}
