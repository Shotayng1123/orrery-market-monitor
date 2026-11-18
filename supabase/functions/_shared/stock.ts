// A stock's own page (Shota, 18 Nov 2026): one answer with the quote, the change over each horizon against the
// benchmark, the figures worked out from the price history, share counts, short interest, valuation and the
// statements. The arithmetic lives in stockstats.ts and fin.ts and the reading of each source in finsrc.ts
// (all three checked in sim/logic.test.ts); this file only fetches, caches and puts the parts together.
import { db } from "./db.ts";
import { fetchText } from "./http.ts";
import { keyStats, type KeyStats } from "./yahoo.ts";
import { dailyBars, homeIndex, quoteFor } from "./assets.ts";
import { avgTurnover, betaCorr, maxDrawdown, perfRows, range52w, realisedVol, type Bar } from "./stockstats.ts";
import { valuation, type Fin, type FinLine } from "./fin.ts";
import { yahooFin, yahooFinTypes } from "./finsrc.ts";

const today = (): string => new Date().toISOString().slice(0, 10);
const isoDay = (t: number | null | undefined): string | null => (t == null ? null : new Date(t * 1000).toISOString().slice(0, 10));
const soft = async <T>(p: Promise<T>, fallback: T, what: string): Promise<T> => { try { return await p; } catch (e) { console.log(`stock: ${what}:`, e instanceof Error ? e.message : String(e)); return fallback; } };

// ---- statements: kept in asset_cache, since they change four times a year and the sources are rationed ----
const FIN_TTL = 7 * 86400e3, FIN_RETRY = 86400e3;   // a week; a day after a failure or a stand-in source
async function yahooStatements(symbol: string, currency: string | null): Promise<Fin> {
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 12 * 366 * 86400;
  const text = await fetchText(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${yahooFinTypes()}&period1=${p1}&period2=${p2}`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }, 30000);
  return yahooFin(JSON.parse(text), currency, today());
}
/** The statements for a symbol, from the cache while it is fresh. `primary` is the fuller source for the market
 *  (set for Japan in a later step); Yahoo stands in when it has none or cannot answer, and then the cache is
 *  kept for a day only, so the fuller source is asked again tomorrow. */
export async function finFor(symbol: string, currency: string | null, primary?: (symbol: string) => Promise<Fin | null>): Promise<{ fin: Fin | null; note: string | null }> {
  const key = `fin2:${symbol}`;
  const { data } = await db.from("asset_cache").select("payload,fetched_at").eq("key", key).maybeSingle();
  if (data) {
    const c = data.payload as { fin: Fin | null; note: string | null; ttl: number };
    if (Date.now() - Date.parse(data.fetched_at) < (c.ttl ?? FIN_RETRY)) return { fin: c.fin, note: c.note };
  }
  let fin: Fin | null = null, note: string | null = null, ttl = FIN_TTL;
  if (primary) { try { fin = await primary(symbol); } catch (e) { note = e instanceof Error ? e.message : String(e); ttl = FIN_RETRY; } }
  if (!fin) {
    try { fin = await yahooStatements(symbol, currency); if (primary) ttl = FIN_RETRY; if (!fin.annual.periods.length && !fin.quarterly.periods.length) { fin = null; note = [note, "Yahoo Finance has no statements for this name"].filter(Boolean).join("; "); } }
    catch (e) { note = [note, `statements unavailable: ${e instanceof Error ? e.message : String(e)}`].filter(Boolean).join("; "); ttl = Math.min(ttl, 3600e3); }
  }
  if (fin && note) fin.notes.push(`The fuller source could not be used (${note}); it is tried again tomorrow.`);
  await db.from("asset_cache").upsert({ key, payload: { fin, note, ttl } as unknown as Record<string, unknown>, fetched_at: new Date().toISOString() });
  return { fin, note };
}

/** The value of a line in the latest fiscal year of a set (not the guidance column), and that year's label. */
function lastFy(fin: Fin | null, id: FinLine): number | null {
  if (!fin) return null;
  for (let i = fin.annual.periods.length - 1; i >= 0; i--) if (fin.annual.periods[i].kind === "FY") return fin.annual.lines[id]?.[i] ?? null;
  return null;
}
function guided(fin: Fin | null, id: FinLine): number | null {
  const i = fin ? fin.annual.periods.findIndex((p) => p.kind === "FC") : -1;
  return i < 0 ? null : fin!.annual.lines[id]?.[i] ?? null;
}

export async function stockPage(symbol: string) {
  if (!symbol) throw new Error("symbol required");
  const q = await quoteFor(symbol);
  const home = homeIndex(symbol), jp = /\.T$/.test(symbol), equity = q.quoteType === "EQUITY";
  const [{ data: con }, own, bench, fin, ks] = await Promise.all([
    db.from("constituents").select("idx,sector,gics_industry,gics_source").eq("symbol", symbol).limit(5),
    soft(dailyBars(symbol), [] as Bar[], "price history"),
    soft(dailyBars(home.symbol), [] as Bar[], "benchmark history"),
    equity ? finFor(symbol, q.currency) : Promise.resolve({ fin: null, note: "Statements are available for equities only." }),
    equity ? soft(keyStats(symbol), null as KeyStats | null, "key statistics") : Promise.resolve(null),
  ]);
  const member = (con ?? []).find((c) => c.sector) ?? (con ?? [])[0] ?? null;
  const d20 = avgTurnover(own, 20), d60 = avgTurnover(own, 60);

  // short interest: Japan = the positions of 0.5% and above reported to the exchange; elsewhere the exchange-reported
  // short interest Yahoo republishes, with FINRA's daily short-volume share beside it where there is one
  let short: Record<string, unknown> | null = null;
  if (jp) {
    const { data } = await db.from("jp_short_positions").select("d,holder,ratio,shares").eq("code", symbol.replace(/\.T$/, "")).gte("d", new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10)).order("d", { ascending: false }).limit(200);
    if (data?.length) {
      const seen = new Map<string, { holder: string; ratio: number; shares: number | null; d: string }>();
      for (const r of data) if (!seen.has(r.holder)) seen.set(r.holder, { holder: r.holder, ratio: r.ratio, shares: r.shares ?? null, d: r.d });
      const live = [...seen.values()].filter((x) => x.ratio >= 0.005).sort((a, b) => b.ratio - a.ratio);
      const shares = live.length && live.every((x) => x.shares != null) ? live.reduce((a, x) => a + (x.shares as number), 0) : null;
      short = { kind: "jpx", d: data[0].d, ratio: live.reduce((a, x) => a + x.ratio, 0), shares, daysToCover: shares != null && d60.shares ? shares / d60.shares : null, holders: live.map(({ holder, ratio, d }) => ({ holder, ratio, d })) };
    }
  } else {
    let finra: { d: string; ratio: number } | null = null;
    if (/^[A-Z.-]+$/.test(symbol)) {
      const { data } = await db.from("short_volume").select("d,ratio").eq("symbol", symbol).order("d", { ascending: false }).limit(1);
      if (data?.length) finra = { d: data[0].d, ratio: data[0].ratio };
    }
    if (ks?.sharesShort != null) short = { kind: "interest", d: isoDay(ks.dateShortInterest), shares: ks.sharesShort, pctFloat: ks.shortPercentOfFloat == null ? null : ks.shortPercentOfFloat * 100, pctOut: ks.sharesPercentSharesOut == null ? null : ks.sharesPercentSharesOut * 100, daysToCover: ks.shortRatio, prior: ks.sharesShortPriorMonth, priorDate: isoDay(ks.sharesShortPreviousMonthDate), finra };
    else if (finra) short = { kind: "finra", ...finra };
  }

  // share counts: the statements' own where they carry them, otherwise Yahoo's key statistics
  const f = fin.fin;
  const finShares = lastFy(f, "shares"), finDiluted = lastFy(f, "dilutedShares");
  const shares = {
    outstanding: ks?.sharesOutstanding ?? finShares, diluted: finDiluted,
    dilutedNote: finDiluted != null ? "Weighted average diluted shares of the latest fiscal year, as in the statements" : "The source gives no diluted share count for this company",
    treasury: null as number | null, float: ks?.floatShares ?? null,
    asOf: ks?.sharesOutstanding != null ? today() : null, source: ks?.sharesOutstanding != null ? "Yahoo Finance" : finShares != null ? "the latest annual statements" : null,
  };

  // valuation on the latest fiscal year and on the company's guidance; book value per share from the statements
  const eq = lastFy(f, "equity"), sh = lastFy(f, "shares");
  const bps = lastFy(f, "bps") ?? (eq != null && sh != null && sh > 0 ? eq / sh : null);
  const val = { ...valuation(q.price, { eps: lastFy(f, "eps"), epsGuide: guided(f, "eps"), bps, dps: lastFy(f, "dps"), dpsGuide: guided(f, "dps") }), basis: f ? "Price over the latest fiscal year's EPS and book value per share, and over the company's guidance where it gives one; yield = DPS over price" : null };

  return {
    symbol, name: q.name ?? symbol, exchange: q.exchange, currency: q.currency, quoteType: q.quoteType,
    sector: member?.sector ?? null, industry: member?.gics_industry ?? null, indices: (con ?? []).map((c) => c.idx),
    price: q.price, prevClose: q.prevClose, pct: q.price != null && q.prevClose ? (q.price / q.prevClose - 1) * 100 : null, asOf: q.time ? new Date(q.time * 1000).toISOString() : null,
    open: q.open ?? null, high: q.high ?? null, low: q.low ?? null, volume: q.volume, mcap: q.marketCap,
    home, perf: perfRows(own, bench, q.price, q.prevClose), range: range52w(own, q.price),
    vol: { m1: realisedVol(own, 21), m3: realisedVol(own, 63), m12: realisedVol(own, 252) },
    beta: betaCorr(own, bench, 252), drawdown: maxDrawdown(own, 12),
    turnover: { d20: { shares: d20.shares, value: d20.value }, d60: { shares: d60.shares, value: d60.value } },
    shares, short,
    earningsAt: q.earningsAt ? new Date(q.earningsAt * 1000).toISOString() : null, earningsEst: q.earningsEst ?? null,
    val, fin: f, finNote: fin.note,
  };
}
