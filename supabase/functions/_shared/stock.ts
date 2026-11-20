// A stock's own page (Shota, 18 Nov 2026): one answer with the quote, the change over each horizon against the
// benchmark, the figures worked out from the price history, share counts, short interest, valuation and the
// statements. The arithmetic lives in stockstats.ts and fin.ts and the reading of each source in finsrc.ts
// (all three checked in sim/logic.test.ts); this file only fetches, caches and puts the parts together.
import { db, selectAll } from "./db.ts";
import { fetchText } from "./http.ts";
import { keyStats, quotes, type KeyStats } from "./yahoo.ts";
import { benchmarksFor, dailyBars, quoteFor } from "./assets.ts";
import { INSTRUMENT_QUOTES, instrumentFigures, isOfficial, legacyStockFields, type InstrumentDef, type InstrumentFigures, type QuoteLike, type RowLike } from "./instrstats.ts";
import { EVENTS_AHEAD_DAYS, EVENTS_BACK_DAYS, INSTR_FEED_DAYS, eventCurrencies, eventsFor, matchHeadlines, newsWords, wordsPg, type EventRow } from "./instrfeed.ts";
import { isYieldQuote } from "./watchrow.ts";
import { avgTurnover, betaCorr, maxDrawdown, perfRows, range52w, realisedVol, type Bar } from "./stockstats.ts";
import { justReported, resultsDateToWatch, valuation, type Fin, type FinLine } from "./fin.ts";
import { yahooFin, yahooFinTypes } from "./finsrc.ts";
import { edinetStatements } from "./edinet.ts";
import { MOVE_RULE, SWING_D1, SWING_PCT, SWING_PCT_2, bigMoves, isLargeCap, moveCtx, moveText, settledBars, siblingKind, type BigMove, type MoveRule } from "./bigmoves.ts";
import { stockMarket } from "./moves.ts";
import { localDate, marketById, marketState } from "./sessions.ts";
import type { MoveCtx } from "./movecause.ts";

const today = (): string => new Date().toISOString().slice(0, 10);
const isoDay = (t: number | null | undefined): string | null => (t == null ? null : new Date(t * 1000).toISOString().slice(0, 10));
const soft = async <T>(p: Promise<T>, fallback: T, what: string): Promise<T> => { try { return await p; } catch (e) { console.log(`stock: ${what}:`, e instanceof Error ? e.message : String(e)); return fallback; } };

// ---- statements: kept in asset_cache, since they change four times a year and the sources are rationed ----
const FIN_TTL = 7 * 86400e3, FIN_RETRY = 86400e3;   // a week; a day after a failure, a stand-in source, or fresh results
const FIN_PRIMARY = 6 * 3600e3;                    // EDINET DB's answers are stored and rationed one by one in edinet.ts
async function yahooStatements(symbol: string, currency: string | null): Promise<Fin> {
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 12 * 366 * 86400;
  const answers = await Promise.all(yahooFinTypes().map(async (types) => JSON.parse(await fetchText(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types}&period1=${p1}&period2=${p2}`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }, 30000)) as unknown));
  return yahooFin(answers, currency, today());
}
/** The statements for a symbol, from the cache while it is fresh.
 *    primary          the fuller source for the market (EDINET DB for Tokyo). Yahoo stands in when it has none or
 *                     cannot answer, and then the cache is kept for a day only, so the fuller source is asked
 *                     again tomorrow
 *    nextEarningsAt   the next results date the quote knows (Unix seconds). It is stored with the statements:
 *                     once it has passed they are asked for again daily for a few days (fin.ts justReported),
 *                     so new results do not wait for the weekly refresh */
export async function finFor(symbol: string, currency: string | null, primary?: (symbol: string) => Promise<Fin | null>, nextEarningsAt?: number | null): Promise<{ fin: Fin | null; note: string | null }> {
  const key = `fin2:${symbol}`, now = Date.now();
  const { data } = await db.from("asset_cache").select("payload,fetched_at").eq("key", key).maybeSingle();
  const c = data ? (data.payload as { fin: Fin | null; note: string | null; ttl: number; due?: number | null }) : null;
  if (data && c) {
    const ttl = justReported(c.due, now) ? Math.min(c.ttl ?? FIN_RETRY, FIN_RETRY) : c.ttl ?? FIN_RETRY;
    if (now - Date.parse(data.fetched_at) < ttl) return { fin: c.fin, note: c.note };
  }
  let fin: Fin | null = null, note: string | null = null, ttl = FIN_TTL;
  if (primary) { try { fin = await primary(symbol); if (fin) ttl = FIN_PRIMARY; } catch (e) { note = e instanceof Error ? e.message : String(e); ttl = FIN_RETRY; } }
  if (!fin) {
    try { fin = await yahooStatements(symbol, currency); if (primary) ttl = FIN_RETRY; if (!fin.annual.periods.length && !fin.quarterly.periods.length) { fin = null; note = [note, "Yahoo Finance has no statements for this name"].filter(Boolean).join("; "); } }
    catch (e) { note = [note, `statements unavailable: ${e instanceof Error ? e.message : String(e)}`].filter(Boolean).join("; "); ttl = Math.min(ttl, 3600e3); }
  }
  if (fin && note) fin.notes.push(`The fuller source could not be used (${note}); it is tried again tomorrow.`);
  const due = resultsDateToWatch(c?.due, nextEarningsAt == null ? null : nextEarningsAt * 1000, now);
  await db.from("asset_cache").upsert({ key, payload: { fin, note, ttl, due } as unknown as Record<string, unknown>, fetched_at: new Date().toISOString() });
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

// ---- big moves and their reasons (large companies only) ----
const USD_PAIR: Record<string, string> = { JPY: "USDJPY=X", KRW: "KRW=X", HKD: "HKD=X", CNY: "CNY=X" };
/** Units of a currency per US dollar from the market table's quotes; null for a currency the table does not follow. */
async function perUsd(ccy: string | null): Promise<number | null> {
  if (ccy === "USD") return 1;
  const pair = ccy ? USD_PAIR[ccy] : undefined;
  if (!pair) return null;
  const { data } = await db.from("quotes_latest").select("price").eq("symbol", pair).maybeSingle();
  const v = (data as { price: number } | null)?.price;
  return v && v > 0 ? v : null;
}
const MOVES_SHOWN_MONTHS = 37;    // the chart's longest view is 36 months
const CAUSES_FOR_DAYS = 366;      // reasons are looked up for moves of the last twelve months
const QUEUE_PER_VIEW = 15;        // at most this many new look-ups are queued by one opening of a page
const CAUSE_TRIES = 3;            // the job gives a look-up that fails this many tries, then leaves it (jobs/move_causes.ts)
type MoveOut = BigMove & { text: string; status: "found" | "not_found" | "queued" | "failed" | "old" | "off"; cause: string | null; sources: Array<{ title: string; url: string }> };
/** The big moves of a large company with the reason stored for each. A move of the last twelve months with no
 *  reason yet is put on the queue for the job that finds them (jobs/move_causes.ts) and shown as being looked up.
 *  Where the store is not there (a database from before this change) the moves are shown without reasons. */
async function movesFor(symbol: string, q: { name: string | null; exchange: string | null; currency: string | null; marketCap: number | null }, sector: string | null, own: Bar[], bench: { name: string; bars: Bar[] } | null): Promise<{ eligible: boolean; rule: MoveRule; sizes?: { day: number; large: number; small: number }; rows: MoveOut[] }> {
  const rule = MOVE_RULE;
  if (!isLargeCap(q.marketCap, q.currency, q.currency === "JPY" ? 1 : await perUsd(q.currency))) return { eligible: false, rule, rows: [] };
  const now = Date.now() / 1000;
  // a session still in progress is not yet a day's move
  const market = marketById(stockMarket(symbol) ?? ""), state = market ? marketState(market, new Date()) : "CLOSED";
  const found = bigMoves(settledBars(own, state === "OPEN" || state === "BREAK", market ? localDate(market.tz, now) : ""), now - MOVES_SHOWN_MONTHS * 30.5 * 86400, rule);
  const { data, error } = await db.from("move_causes").select("kind,d,status,cause,sources,tries").eq("symbol", symbol);
  const stored = new Map(((data ?? []) as Array<{ kind: string; d: string; status: string; cause: string | null; sources: Array<{ title: string; url: string }> | null; tries: number }>).map((r) => [`${r.kind}|${r.d}`, r]));
  const queue: Array<Record<string, unknown>> = [];
  const rows = found.map((m): MoveOut => {
    // a turning point keeps its answer when it passes from the smaller level to the large one (siblingKind)
    const sib = siblingKind(m.kind), own = stored.get(`${m.kind}|${m.to}`), other = sib ? stored.get(`${sib}|${m.to}`) : undefined;
    const answered = (x?: { status: string }) => !!x && (x.status === "found" || x.status === "not_found");
    const text = moveText(m), hit = answered(own) || !answered(other) ? own ?? other : other;
    if (error) return { ...m, text, status: "off", cause: null, sources: [] };
    if (hit) return { ...m, text, status: hit.status === "found" ? "found" : hit.status === "not_found" ? "not_found" : hit.status === "error" && hit.tries >= CAUSE_TRIES ? "failed" : "queued", cause: hit.status === "found" ? hit.cause : null, sources: hit.status === "found" ? hit.sources ?? [] : [] };
    if (now - m.t > CAUSES_FOR_DAYS * 86400) return { ...m, text, status: "old", cause: null, sources: [] };
    if (queue.length < QUEUE_PER_VIEW) {
      const ctx: MoveCtx = moveCtx(m, { symbol, name: q.name ?? symbol, exchange: q.exchange, sector, currency: q.currency }, bench);
      queue.push({ symbol, kind: m.kind, d: m.to, from_d: m.from, pct: m.pct, ctx });
    }
    return { ...m, text, status: "queued", cause: null, sources: [] };
  });
  if (queue.length) {
    const { error: e } = await db.from("move_causes").upsert(queue, { onConflict: "symbol,kind,d", ignoreDuplicates: true });
    if (e) console.log("stock: queueing moves:", e.message); else await db.rpc("move_causes_kick");
  }
  return { eligible: true, rule, ...(rule === "swings" ? { sizes: { day: SWING_D1, large: SWING_PCT, small: SWING_PCT_2 } } : {}), rows };
}

// ---- the page's NEWS panel: the Monitor's own headlines that name the stock, and its own alerts on it ----
// Read from the Monitor's tables only (news_items, alerts): no source is asked. Headlines are kept 90 days (the
// daily prune); alerts, which are kept longer, are read over the same 90 days so the panel means one thing.
export const FEED_DAYS = 90, FEED_NEWS = 60, FEED_ALERTS = 40;
export interface StockFeed {
  days: number;
  news: Array<{ id: number; publishedAt: string; source: string; title: string; url: string; category: string | null }>;
  alerts: Array<{ id: number; at: string; kind: string; pct: number | null; market: string; msg: string; url: string | null }>;
  error?: string;   // a table could not be read: what it said (the other's rows are still sent)
}
async function feedFor(symbol: string): Promise<StockFeed> {
  const since = new Date(Date.now() - FEED_DAYS * 86400e3).toISOString();
  const [nw, al] = await Promise.all([
    db.from("news_items").select("id,published_at,source,title,url,category").overlaps("tickers", [symbol]).gte("published_at", since).order("published_at", { ascending: false }).limit(FEED_NEWS),
    db.from("alerts").select("id,at,kind,pct,market,msg,url").eq("symbol", symbol).gte("at", since).order("at", { ascending: false }).order("id", { ascending: false }).limit(FEED_ALERTS),
  ]);
  const error = [nw.error ? `headlines: ${nw.error.message}` : null, al.error ? `alerts: ${al.error.message}` : null].filter(Boolean).join("; ");
  return {
    days: FEED_DAYS,
    news: (nw.data ?? []).map((r) => ({ id: r.id as number, publishedAt: r.published_at as string, source: r.source as string, title: r.title as string, url: r.url as string, category: (r.category as string | null) ?? null })),
    alerts: (al.data ?? []).map((a) => ({ id: a.id as number, at: a.at as string, kind: a.kind as string, pct: (a.pct as number | null) ?? null, market: a.market as string, msg: a.msg as string, url: (a.url as string | null) ?? null })),
    ...(error ? { error } : {}),
  };
}

// ---- an instrument's own page (I-4, 20 Nov 2026): a currency, a yield, a commodity, a future or an index ----
// Read from the Monitor's own tables (the instruments, the market table, the stored daily closes, the calendar, the
// headlines, the alerts) and, for a name the table does not carry, from the same Yahoo quote and daily bars a stock's
// page reads. No other source is asked: EDINET DB is never asked for an instrument, and no big-move look-up is queued.
/** How far back the stored closes are read: five years and a month, for the 36M change, a stock page's 60M (the
 *  answer's older fields) and three years of 12-month volatility readings. */
const INSTR_HISTORY_DAYS = 5 * 366 + 35;
async function storedCloses(symbol: string): Promise<Bar[]> {
  const from = new Date(Date.now() - INSTR_HISTORY_DAYS * 86400e3).toISOString().slice(0, 10);
  const rows = await selectAll<{ d: string; close: number }>(() => db.from("prices_daily").select("d,close").eq("symbol", symbol).gte("d", from).order("d"));
  return rows.filter((r) => Number.isFinite(r.close)).map((r) => ({ t: Date.parse(r.d + "T00:00:00Z") / 1000, c: r.close }));
}
/** The market table's row for a symbol, as MARKETS shows it (the snapshot `tick` rebuilds every minute). */
async function tableRow(symbol: string): Promise<RowLike | null> {
  const { data } = await db.from("snapshots").select("payload").eq("key", "table").maybeSingle();
  return (((data?.payload as { rows?: RowLike[] } | null)?.rows) ?? []).find((r) => r.symbol === symbol) ?? null;
}
/** Its calendar: the events of its currencies, five days back and eight ahead (as the calendar on NEWS). */
async function eventsOf(ccys: string[]): Promise<{ ccys: string[]; from: string; to: string; rows: EventRow[]; error?: string }> {
  const from = new Date(Date.now() - EVENTS_BACK_DAYS * 86400e3).toISOString(), to = new Date(Date.now() + EVENTS_AHEAD_DAYS * 86400e3).toISOString();
  if (!ccys.length) return { ccys, from, to, rows: [] };
  const list = ccys.join(",");
  const { data, error } = await db.from("econ_events").select("id,at,country,currency,title,impact,forecast,previous,actual,better,kind,source").gte("at", from).lte("at", to).or(`currency.in.(${list}),country.in.(${list})`).order("at").limit(600);
  return { ccys, from, to, rows: eventsFor((data ?? []) as EventRow[], ccys, from, to), ...(error ? { error: error.message } : {}) };
}
/** Its NEWS: the headlines of the last 30 days whose title holds one of its words (instrfeed.ts), and the Monitor's
 *  own alerts on it. The database is asked with the words as one pattern; the same rule is applied again here. */
async function instrFeed(symbol: string, words: string[]): Promise<StockFeed> {
  const since = new Date(Date.now() - INSTR_FEED_DAYS * 86400e3).toISOString(), pg = wordsPg(words);
  const heads = () => db.from("news_items").select("id,published_at,source,title,url,category").gte("published_at", since);
  const [first, al] = await Promise.all([
    pg ? heads().filter("title", "imatch", pg).order("published_at", { ascending: false }).limit(150) : Promise.resolve({ data: [], error: null }),
    db.from("alerts").select("id,at,kind,pct,market,msg,url").eq("symbol", symbol).gte("at", since).order("at", { ascending: false }).order("id", { ascending: false }).limit(FEED_ALERTS),
  ]);
  // should the pattern be refused, the words are asked for as plain parts of the title; the rule below keeps whole words
  const nw = first.error && words.length ? await heads().or(words.map((w) => `title.ilike.*${w.replace(/[,()*]/g, "")}*`).join(",")).order("published_at", { ascending: false }).limit(300) : first;
  const error = [nw.error ? `headlines: ${nw.error.message}` : null, al.error ? `alerts: ${al.error.message}` : null].filter(Boolean).join("; ");
  const rows = ((nw.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as number, publishedAt: r.published_at as string, source: r.source as string, title: r.title as string, url: r.url as string, category: (r.category as string | null) ?? null }));
  return {
    days: INSTR_FEED_DAYS,
    news: matchHeadlines(rows, words, FEED_NEWS),
    alerts: ((al.data ?? []) as Array<Record<string, unknown>>).map((a) => ({ id: a.id as number, at: a.at as string, kind: a.kind as string, pct: (a.pct as number | null) ?? null, market: a.market as string, msg: a.msg as string, url: (a.url as string | null) ?? null })),
    ...(error ? { error } : {}),
  };
}
/** The page of a Monitor instrument (`def`) or of a plain quote that is not a stock (`q`). The answer keeps every
 *  field of a stock's (filled for what an instrument has, empty for the rest: legacyStockFields), so the page from
 *  before 20 Nov 2026 still draws it, and adds `instrument` with the figures in the instrument's own units. */
async function instrumentPage(symbol: string, def: InstrumentDef | null, q: QuoteLike | null) {
  const name = def?.name ?? q?.name ?? symbol, currency = def?.currency ?? q?.currency ?? null;
  const words = newsWords(symbol, name), ccys = eventCurrencies(symbol, name, currency);
  const [row, bars, events, feed] = await Promise.all([
    def ? soft(tableRow(symbol), null, "market table") : Promise.resolve(null),
    def ? soft(storedCloses(symbol), [] as Bar[], "stored closes") : soft(dailyBars(symbol), [] as Bar[], "price history"),
    soft(eventsOf(ccys), { ccys, from: "", to: "", rows: [], error: "the calendar could not be read" }, "calendar"),
    soft(instrFeed(symbol, words), { days: INSTR_FEED_DAYS, news: [], alerts: [], error: "the headlines and alerts could not be read" } as StockFeed, "news and alerts"),
  ]);
  const f: InstrumentFigures = instrumentFigures({ symbol, def, row, quote: q, bars, yieldQuote: !def && !!q && isYieldQuote(symbol, q.name, q.quoteType), now: Date.now() });
  return {
    symbol, name,
    ...legacyStockFields(f, q, bars),
    feed,
    instrument: { ...f, events, matched: words },   // since 20 Nov 2026; a page from before ignores it
  };
}
const INSTRUMENT_COLS = "symbol,name,cls,grp,market,currency,decimals,provider,provider_symbol,proxy_for";

export async function stockPage(symbol: string) {
  if (!symbol) throw new Error("symbol required");
  // a Monitor instrument has its own page; a yield read from an official curve has no quote to ask for
  const { data: def } = await db.from("instruments").select(INSTRUMENT_COLS).eq("symbol", symbol).maybeSingle();
  if (def) {
    const d = def as InstrumentDef;
    const quote = isOfficial(d.provider) ? null : await soft(quotes([symbol]).then((x) => x[symbol] ?? null), null, "quote");
    return instrumentPage(symbol, d, quote);
  }
  const q = await quoteFor(symbol);
  if (q.quoteType && INSTRUMENT_QUOTES.has(q.quoteType)) return instrumentPage(symbol, null, q);
  const benchmarks = benchmarksFor(symbol), jp = /\.T$/.test(symbol), equity = q.quoteType === "EQUITY";
  const [{ data: con }, own, benches, fin, ks, feed] = await Promise.all([
    db.from("constituents").select("idx,sector,gics_industry,gics_source").eq("symbol", symbol).limit(5),
    soft(dailyBars(symbol), [] as Bar[], "price history"),
    Promise.all(benchmarks.map((b) => soft(dailyBars(b.symbol), [] as Bar[], `${b.name} history`))),
    equity ? finFor(symbol, q.currency, jp ? edinetStatements : undefined, q.earningsAt) : Promise.resolve({ fin: null, note: "Statements are available for equities only." }),
    equity ? soft(keyStats(symbol), null as KeyStats | null, "key statistics") : Promise.resolve(null),
    soft(feedFor(symbol), { days: FEED_DAYS, news: [], alerts: [], error: "the headlines and alerts could not be read" } as StockFeed, "news and alerts"),
  ]);
  const member = (con ?? []).find((c) => c.sector) ?? (con ?? [])[0] ?? null;
  const d20 = avgTurnover(own, 20), d60 = avgTurnover(own, 60);
  const moves = equity ? await soft(movesFor(symbol, q, member?.sector ?? null, own, benchmarks.length ? { name: benchmarks[0].name, bars: benches[0] } : null), { eligible: false, rule: "classic" as MoveRule, rows: [] as MoveOut[] }, "big moves") : { eligible: false, rule: "classic" as MoveRule, rows: [] as MoveOut[] };

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

  // share counts. Japan: the company's own count in its latest 決算短信 (treasury shares included, and shown
  // beside it), since that is the count its market value is quoted on. Elsewhere Yahoo's key statistics, and
  // failing those the latest annual statements.
  const f = fin.fin;
  const finShares = lastFy(f, "shares"), finDiluted = lastFy(f, "dilutedShares"), now = f?.sharesNow ?? null;
  const shares = {
    outstanding: now?.outstanding ?? ks?.sharesOutstanding ?? finShares, diluted: finDiluted,
    dilutedNote: finDiluted == null ? (f?.source === "edinetdb" ? "No diluted share count: the company reports no diluted EPS for the latest fiscal year (nothing that would dilute), or a later split changed the share basis" : "The source gives no diluted share count for this company")
      : f?.source === "edinetdb" ? "Implied by the latest fiscal year's diluted EPS: net income over diluted EPS (a company in Japan reports the diluted EPS, not the share count behind it)" : "Weighted average diluted shares of the latest fiscal year, as in the statements",
    treasury: now?.treasury ?? null, float: ks?.floatShares ?? null,
    asOf: now ? now.asOf : ks?.sharesOutstanding != null ? today() : null,
    source: now ? "The company's latest 決算短信 (EDINET DB); treasury shares included" : ks?.sharesOutstanding != null ? "Yahoo Finance" : finShares != null ? "the latest annual statements" : null,
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
    benchmarks, perf: perfRows(own, benches, q.price, q.prevClose), range: range52w(own, q.price),
    vol: { m1: realisedVol(own, 21), m3: realisedVol(own, 63), m12: realisedVol(own, 252) },
    beta: benches.map((b) => betaCorr(own, b, 252)), drawdown: maxDrawdown(own, 12),
    turnover: { d20: { shares: d20.shares, value: d20.value }, d60: { shares: d60.shares, value: d60.value } },
    shares, short, moves,
    earningsAt: q.earningsAt ? new Date(q.earningsAt * 1000).toISOString() : null, earningsEst: q.earningsEst ?? null,
    val, fin: f, finNote: fin.note,
    feed,   // since 20 Nov 2026; a page from before ignores it, and the page shows no NEWS panel without it
  };
}
