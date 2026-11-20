// The reads behind a stock's NEWS and an instrument's own page (I-3 and I-4, 20 Nov 2026), from the Monitor's own tables:
// news_items, alerts, econ_events, the instruments, the market table's snapshot and the stored daily closes. The
// database client is handed in (the reviewer's R2B-03): stock.ts hands in the server's; sim/logic.test.ts a stand-in
// that records each query and answers it, so these reads are checked without a server; jobs/live_check.ts the jobs'
// own client, to run the same reads against the live tables after a deploy. Nothing here asks EDINET DB, and no
// big-move look-up is queued for an instrument; the only outside reads are a quote and daily bars from Yahoo, through
// readers the caller hands in.
import { selectAll } from "./paging.ts";
import { INSTRUMENT_QUOTES, instrumentFigures, isOfficial, legacyStockFields, type InstrumentDef, type InstrumentFigures, type QuoteLike, type RowLike } from "./instrstats.ts";
import { EVENTS_AHEAD_DAYS, EVENTS_BACK_DAYS, INSTR_FEED_DAYS, eventCurrencies, eventsFor, matchHeadlines, newsWords, wordsPg, type EventRow } from "./instrfeed.ts";
import { isYieldQuote } from "./watchrow.ts";
import type { Bar } from "./stockstats.ts";

/** The database client, as far as these reads use it: supabase-js's (the server's npm:@supabase/supabase-js@2, the
 *  jobs' @supabase/supabase-js, or a stand-in with the same chain of calls). */
// deno-lint-ignore no-explicit-any
export type Db = { from(table: string): any };

const soft = async <T>(p: Promise<T>, fallback: T, what: string): Promise<T> => { try { return await p; } catch (e) { console.log(`stock: ${what}:`, e instanceof Error ? e.message : String(e)); return fallback; } };

// ---- a stock's NEWS panel: the Monitor's own headlines that name the stock, and its own alerts on it ----
// Read from the Monitor's tables only (news_items, alerts): no source is asked. Headlines are kept 90 days (the
// daily prune); alerts, which are kept longer, are read over the same 90 days so the panel means one thing.
export const FEED_DAYS = 90, FEED_NEWS = 60, FEED_ALERTS = 40;
export interface StockFeed {
  days: number;
  news: Array<{ id: number; publishedAt: string; source: string; title: string; url: string; category: string | null }>;
  alerts: Array<{ id: number; at: string; kind: string; pct: number | null; market: string; msg: string; url: string | null }>;
  error?: string;   // a table could not be read: what it said (the other's rows are still sent)
}
const NEWS_COLS = "id,published_at,source,title,url,category", ALERT_COLS = "id,at,kind,pct,market,msg,url";
const headline = (r: Record<string, unknown>): StockFeed["news"][number] => ({ id: r.id as number, publishedAt: r.published_at as string, source: r.source as string, title: r.title as string, url: r.url as string, category: (r.category as string | null) ?? null });
const alertRow = (a: Record<string, unknown>): StockFeed["alerts"][number] => ({ id: a.id as number, at: a.at as string, kind: a.kind as string, pct: (a.pct as number | null) ?? null, market: a.market as string, msg: a.msg as string, url: (a.url as string | null) ?? null });
/** The alerts on a symbol since `since`, newest first (the same order the page lists them in). */
const alertsOf = (db: Db, symbol: string, since: string) => db.from("alerts").select(ALERT_COLS).eq("symbol", symbol).gte("at", since).order("at", { ascending: false }).order("id", { ascending: false }).limit(FEED_ALERTS);
const failed = (nw: { error?: { message: string } | null }, al: { error?: { message: string } | null }): string => [nw.error ? `headlines: ${nw.error.message}` : null, al.error ? `alerts: ${al.error.message}` : null].filter(Boolean).join("; ");

/** A stock's NEWS: the headlines whose tickers name it and the alerts on it, over the last 90 days. */
export async function feedFor(db: Db, symbol: string, now: number = Date.now()): Promise<StockFeed> {
  const since = new Date(now - FEED_DAYS * 86400e3).toISOString();
  const [nw, al] = await Promise.all([
    db.from("news_items").select(NEWS_COLS).overlaps("tickers", [symbol]).gte("published_at", since).order("published_at", { ascending: false }).limit(FEED_NEWS),
    alertsOf(db, symbol, since),
  ]);
  const error = failed(nw, al);
  return {
    days: FEED_DAYS,
    news: ((nw.data ?? []) as Array<Record<string, unknown>>).map(headline),
    alerts: ((al.data ?? []) as Array<Record<string, unknown>>).map(alertRow),
    ...(error ? { error } : {}),
  };
}

// ---- an instrument's own page (I-4): a currency, a yield, a commodity, a future or an index ----
/** How far back the stored closes are read: five years and a month, for the 36M change, a stock page's 60M (the
 *  answer's older fields) and three years of 12-month volatility readings. */
export const INSTR_HISTORY_DAYS = 5 * 366 + 35;
/** An instrument's stored daily closes, oldest first. */
export async function storedCloses(db: Db, symbol: string, now: number = Date.now()): Promise<Bar[]> {
  const from = new Date(now - INSTR_HISTORY_DAYS * 86400e3).toISOString().slice(0, 10);
  const rows = await selectAll<{ d: string; close: number }>(() => db.from("prices_daily").select("d,close").eq("symbol", symbol).gte("d", from).order("d"));
  return rows.filter((r) => Number.isFinite(r.close)).map((r) => ({ t: Date.parse(r.d + "T00:00:00Z") / 1000, c: r.close }));
}
/** The market table's row for a symbol, as MARKETS shows it (the snapshot `tick` rebuilds every minute). */
export async function tableRow(db: Db, symbol: string): Promise<RowLike | null> {
  const { data } = await db.from("snapshots").select("payload").eq("key", "table").maybeSingle();
  return (((data?.payload as { rows?: RowLike[] } | null)?.rows) ?? []).find((r) => r.symbol === symbol) ?? null;
}
export interface InstrumentEvents { ccys: string[]; from: string; to: string; rows: EventRow[]; error?: string }
/** Its calendar: the events of its currencies, five days back and eight ahead (as the calendar on NEWS). A FXStreet
 *  row has its currency in `currency`, a ForexFactory row in `country`: both are asked for. */
export async function eventsOf(db: Db, ccys: string[], now: number = Date.now()): Promise<InstrumentEvents> {
  const from = new Date(now - EVENTS_BACK_DAYS * 86400e3).toISOString(), to = new Date(now + EVENTS_AHEAD_DAYS * 86400e3).toISOString();
  if (!ccys.length) return { ccys, from, to, rows: [] };
  const list = ccys.join(",");
  const { data, error } = await db.from("econ_events").select("id,at,country,currency,title,impact,forecast,previous,actual,better,kind,source").gte("at", from).lte("at", to).or(`currency.in.(${list}),country.in.(${list})`).order("at").limit(600);
  return { ccys, from, to, rows: eventsFor((data ?? []) as EventRow[], ccys, from, to), ...(error ? { error: error.message } : {}) };
}
/** The headline query by an instrument's words: one pattern for PostgreSQL's ~* (PostgREST's `imatch`), whole words
 *  any case (instrfeed.ts wordsPg); or, where a database refuses the pattern, each word as a plain part of the title
 *  (`ilike`), which the page's own rule then narrows to whole words. Exported for jobs/live_check.ts, which asks the
 *  live database whether it takes the pattern. */
export function headlineQuery(db: Db, words: string[], since: string, how: "pattern" | "parts") {
  const q = db.from("news_items").select(NEWS_COLS).gte("published_at", since);
  if (how === "pattern") return q.filter("title", "imatch", wordsPg(words)).order("published_at", { ascending: false }).limit(150);
  return q.or(words.map((w) => `title.ilike.*${w.replace(/[,()*]/g, "")}*`).join(",")).order("published_at", { ascending: false }).limit(300);
}
/** Its NEWS: the headlines of the last 30 days whose title holds one of its words (instrfeed.ts), and the Monitor's
 *  own alerts on it. The database is asked with the words as one pattern; the same rule is applied again here. */
export async function instrFeed(db: Db, symbol: string, words: string[], now: number = Date.now()): Promise<StockFeed> {
  const since = new Date(now - INSTR_FEED_DAYS * 86400e3).toISOString();
  const [first, al] = await Promise.all([
    words.length ? headlineQuery(db, words, since, "pattern") : Promise.resolve({ data: [], error: null }),
    alertsOf(db, symbol, since),
  ]);
  // should the pattern be refused, the words are asked for as plain parts of the title; the rule below keeps whole words
  const nw = first.error && words.length ? await headlineQuery(db, words, since, "parts") : first;
  const error = failed(nw, al);
  return {
    days: INSTR_FEED_DAYS,
    news: matchHeadlines(((nw.data ?? []) as Array<Record<string, unknown>>).map(headline), words, FEED_NEWS),
    alerts: ((al.data ?? []) as Array<Record<string, unknown>>).map(alertRow),
    ...(error ? { error } : {}),
  };
}

/** What an instrument's page reads from outside the database: Yahoo's daily bars, for a name the Monitor does not
 *  store (assets.ts dailyBars on the server). `now` in ms, for the windows (the checks fix it). */
export interface InstrumentDeps { db: Db; dailyBars: (symbol: string) => Promise<Bar[]>; now?: number }
export type InstrumentAnswer = ReturnType<typeof legacyStockFields> & { symbol: string; name: string; feed: StockFeed; instrument: InstrumentFigures & { events: InstrumentEvents; matched: string[] } };
/** The page of a Monitor instrument (`def`) or of a plain quote that is not a stock (`q`). The answer keeps every
 *  field of a stock's (filled for what an instrument has, empty for the rest: legacyStockFields), so the page from
 *  before 20 Nov 2026 still draws it, and adds `instrument` with the figures in the instrument's own units. */
export async function instrumentPage(deps: InstrumentDeps, symbol: string, def: InstrumentDef | null, q: QuoteLike | null): Promise<InstrumentAnswer> {
  const { db } = deps, now = deps.now ?? Date.now();
  const name = def?.name ?? q?.name ?? symbol, currency = def?.currency ?? q?.currency ?? null;
  const words = newsWords(symbol, name), ccys = eventCurrencies(symbol, name, currency);
  const [row, bars, events, feed] = await Promise.all([
    def ? soft(tableRow(db, symbol), null, "market table") : Promise.resolve(null),
    def ? soft(storedCloses(db, symbol, now), [] as Bar[], "stored closes") : soft(deps.dailyBars(symbol), [] as Bar[], "price history"),
    soft(eventsOf(db, ccys, now), { ccys, from: "", to: "", rows: [], error: "the calendar could not be read" }, "calendar"),
    soft(instrFeed(db, symbol, words, now), { days: INSTR_FEED_DAYS, news: [], alerts: [], error: "the headlines and alerts could not be read" } as StockFeed, "news and alerts"),
  ]);
  const f = instrumentFigures({ symbol, def, row, quote: q, bars, yieldQuote: !def && !!q && isYieldQuote(symbol, q.name, q.quoteType), now });
  return {
    symbol, name,
    ...legacyStockFields(f, q, bars),
    feed,
    instrument: { ...f, events, matched: words },   // since 20 Nov 2026; a page from before ignores it
  };
}

export const INSTRUMENT_COLS = "symbol,name,cls,grp,market,currency,decimals,provider,provider_symbol,proxy_for";
/** Which page a symbol gets (stock.ts stockPage's first step): a Monitor instrument's (a row in the instruments
 *  table; a yield read from an official curve has no quote to ask for), the page of a plain quote that is not a stock
 *  (an index, a pair, a future, a coin), or else a stock's, for which the quote read here is handed back. */
export async function pageOrQuote<Q extends QuoteLike>(deps: InstrumentDeps & { quote: (symbol: string) => Promise<QuoteLike | null>; quoteFor: (symbol: string) => Promise<Q> }, symbol: string): Promise<{ instrument: InstrumentAnswer } | { stock: Q }> {
  const { data: def } = await deps.db.from("instruments").select(INSTRUMENT_COLS).eq("symbol", symbol).maybeSingle();
  if (def) {
    const d = def as InstrumentDef;
    const quote = isOfficial(d.provider) ? null : await soft(deps.quote(symbol), null, "quote");
    return { instrument: await instrumentPage(deps, symbol, d, quote) };
  }
  const q = await deps.quoteFor(symbol);
  if (q.quoteType && INSTRUMENT_QUOTES.has(q.quoteType)) return { instrument: await instrumentPage(deps, symbol, null, q) };
  return { stock: q };
}
