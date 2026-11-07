// The numbers pack for the Morning Notes: everything the model is allowed to cite. Computed from the Monitor's
// own data (table snapshot, daily history, calendar, news) plus constituent and sector-ETF moves from Yahoo.
// Every figure carries where it came from; nothing is estimated here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { nikkei225, sp500, type ConstituentList } from "./constituents.js";
import { lastTwo, spark } from "./yahoo.js";
import { selectAll, SGT, ymdIn } from "./db.js";

export interface Move { symbol: string; name: string; last: number; prev: number; pct: number; sector?: string; weight?: number | null }
export interface SectorMove { sector: string; pct: number; n: number; weighted: boolean }
export interface Pack {
  generatedAt: string; dateSgt: string;
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; lastAt: string | null; d1Pct: number | null; d1Chg: number | null; w1Pct: number | null; m1Pct: number | null; unit: "pct" | "bp" }>;
  us: { session: string | null; indices: Move[]; sectorsEtf: Move[]; sectorsConstituents: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number } | null; source: string };
  jp: { session: string | null; indices: Move[]; sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number } | null; impliedOpenPct: number | null; impliedNote: string; source: string };
  technicals: Array<{ symbol: string; name: string; last: number; dma20: number | null; dma50: number | null; dma200: number | null; z1m: number | null; z12m: number | null; vsDma200Pct: number | null }>;
  calendar: Array<{ atSgt: string; country: string; title: string; impact: string; forecast: string | null; previous: string | null }>;
  headlines: Array<{ publishedAt: string; source: string; title: string; url: string; category: string }>;
  notes: string[];
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
  return { generatedAt: now.toISOString(), dateSgt, table, us, jp, technicals, calendar, headlines, notes };
}
