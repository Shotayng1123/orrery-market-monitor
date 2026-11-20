// Yahoo Finance access (unofficial endpoints). Two shapes are used:
//   spark: many symbols per call, {symbol: {timestamp[], close[], previousClose, chartPreviousClose, dataGranularity}}
//   chart: one symbol, full OHLCV with meta (exchange time zone, delay not reported).
// Hosts rotate query1 -> query2 on failure. Callers decide what to do with gaps (nulls are kept, never filled).
import { BROWSER_UA } from "./http.ts";

export interface SparkSeries { symbol: string; timestamp: number[]; close: Array<number | null>; previousClose: number | null; chartPreviousClose: number | null; granularity: number }
export interface ChartSeries { symbol: string; tz: string; timestamp: number[]; open: Array<number | null>; high: Array<number | null>; low: Array<number | null>; close: Array<number | null>; volume: Array<number | null>; prevClose: number | null; regularMarketPrice: number | null; regularMarketTime: number | null }

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const headers = { "user-agent": BROWSER_UA, accept: "application/json" };

// YAHOO_RETRIES: how many more rounds over the hosts after one in which a host answered 429, a little later each
// time. None on the server, where a minute's work must fit in the minute; the relay on GitHub sets it
// (feed-relay.yml), as the batch jobs' own reader has always done (jobs/lib/yahoo.ts).
const RETRIES = Math.max(0, Math.min(4, Number((typeof Deno !== "undefined" ? Deno.env.get("YAHOO_RETRIES") : undefined) ?? "0") || 0));   // (no Deno in the logic checks, which run on Node)
async function getJson(path: string, timeoutMs = 25000): Promise<unknown> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let limited = false;
    for (const h of HOSTS) {
      try {
        const r = await fetch(h + path, { headers, signal: AbortSignal.timeout(timeoutMs) });
        if (r.status === 429) { lastErr = new Error("HTTP 429 rate limited"); limited = true; continue; }
        if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
        return await r.json();
      } catch (e) { lastErr = e; }
    }
    if (!limited || attempt === RETRIES) break;
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Batched spark call (max 20 symbols per request). Symbols Yahoo does not know are simply absent. */
export async function spark(symbols: string[], range: string, interval: string): Promise<Record<string, SparkSeries>> {
  const out: Record<string, SparkSeries> = {};
  for (let i = 0; i < symbols.length; i += 20) {
    const batch = symbols.slice(i, i + 20);
    const j = (await getJson(`/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=${range}&interval=${interval}`)) as Record<string, { timestamp?: number[]; close?: Array<number | null>; previousClose?: number; chartPreviousClose?: number; dataGranularity?: number }>;
    for (const [sym, v] of Object.entries(j)) {
      if (!v || !Array.isArray(v.timestamp) || !Array.isArray(v.close)) continue;
      out[sym] = { symbol: sym, timestamp: v.timestamp, close: v.close, previousClose: v.previousClose ?? null, chartPreviousClose: v.chartPreviousClose ?? null, granularity: Number(v.dataGranularity ?? 0) };
    }
  }
  return out;
}

export async function chart(symbol: string, range: string, interval: string): Promise<ChartSeries> {
  const j = (await getJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, 40000)) as {
    chart: { result: Array<{ meta: { exchangeTimezoneName: string; regularMarketPrice?: number; regularMarketTime?: number; chartPreviousClose?: number; previousClose?: number }; timestamp?: number[]; indicators: { quote: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> | null; error: { description?: string } | null };
  };
  const res = j.chart.result?.[0];
  if (!res) throw new Error(j.chart.error?.description ?? "no result");
  const q = res.indicators.quote[0] ?? {};
  const n = res.timestamp?.length ?? 0;
  const arr = (a?: Array<number | null>) => (a && a.length === n ? a : new Array(n).fill(null));
  return { symbol, tz: res.meta.exchangeTimezoneName, timestamp: res.timestamp ?? [], open: arr(q.open), high: arr(q.high), low: arr(q.low), close: arr(q.close), volume: arr(q.volume), prevClose: res.meta.chartPreviousClose ?? res.meta.previousClose ?? null, regularMarketPrice: res.meta.regularMarketPrice ?? null, regularMarketTime: res.meta.regularMarketTime ?? null };
}

// ---- quotes (market cap, volume, average volume): the v7 endpoint needs a session cookie and a crumb ----
export interface QuoteRow { symbol: string; price: number | null; marketCap: number | null; volume: number | null; adv3m: number | null; adv10d: number | null; currency: string | null; name: string | null; exchange: string | null; quoteType: string | null; prevClose: number | null; time: number | null; high: number | null; low: number | null; open: number | null; earningsAt: number | null; earningsEst: boolean | null }
let crumbCache: { cookie: string; crumb: string; at: number } | null = null;
async function crumb(): Promise<{ cookie: string; crumb: string }> {
  if (crumbCache && Date.now() - crumbCache.at < 25 * 60e3) return crumbCache;
  const any = { "user-agent": headers["user-agent"], accept: "*/*" };   // getcrumb answers 406 to accept: application/json
  const r1 = await fetch("https://fc.yahoo.com", { headers: any, redirect: "manual", signal: AbortSignal.timeout(20000) });
  const setc: string[] = (r1.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""];
  const cookie = setc.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("yahoo: no session cookie");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...any, cookie }, signal: AbortSignal.timeout(20000) });
  const c = (await r2.text()).trim();
  if (!r2.ok || !c || c.includes("<")) throw new Error(`yahoo: crumb failed (${r2.status})`);
  crumbCache = { cookie, crumb: c, at: Date.now() };
  return crumbCache;
}
interface EarningsFields { earningsTimestamp?: number; earningsTimestampStart?: number; isEarningsDateEstimate?: boolean }
/** The next earnings date: the start of Yahoo's next window when it lies ahead, otherwise the last reported date
 *  (which is still "next" on the day itself). `earningsEst` says whether the company has confirmed it. */
function earningsOf(q: EarningsFields): { earningsAt: number | null; earningsEst: boolean | null } {
  const now = Date.now() / 1000;
  const next = q.earningsTimestampStart && q.earningsTimestampStart > now - 86400 ? q.earningsTimestampStart : q.earningsTimestamp && q.earningsTimestamp > now - 86400 ? q.earningsTimestamp : null;
  return { earningsAt: next, earningsEst: next == null ? null : next === q.earningsTimestamp && q.earningsTimestampStart !== q.earningsTimestamp ? false : q.isEarningsDateEstimate ?? null };
}

/** Batched quotes (100 symbols per request). Symbols Yahoo does not know are absent. */
export async function quotes(symbols: string[]): Promise<Record<string, QuoteRow>> {
  const out: Record<string, QuoteRow> = {};
  const { cookie, crumb: cr } = await crumb();
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100);
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}&fields=symbol,marketCap,regularMarketPrice,regularMarketVolume,averageDailyVolume3Month,averageDailyVolume10Day,currency,shortName,longName,fullExchangeName,quoteType,regularMarketPreviousClose,regularMarketTime,regularMarketDayHigh,regularMarketDayLow,regularMarketOpen,earningsTimestamp,earningsTimestampStart,isEarningsDateEstimate&crumb=${encodeURIComponent(cr)}`;
    const r = await fetch(url, { headers: { ...headers, cookie }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`yahoo quote: HTTP ${r.status}`);
    const j = (await r.json()) as { quoteResponse?: { result?: Array<{ symbol: string; marketCap?: number; regularMarketPrice?: number; regularMarketVolume?: number; averageDailyVolume3Month?: number; averageDailyVolume10Day?: number; currency?: string; shortName?: string; longName?: string; fullExchangeName?: string; quoteType?: string; regularMarketPreviousClose?: number; regularMarketTime?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number; regularMarketOpen?: number }> } };
    for (const q of j.quoteResponse?.result ?? []) out[q.symbol] = { symbol: q.symbol, price: q.regularMarketPrice ?? null, marketCap: q.marketCap ?? null, volume: q.regularMarketVolume ?? null, adv3m: q.averageDailyVolume3Month ?? null, adv10d: q.averageDailyVolume10Day ?? null, currency: q.currency ?? null, name: q.longName ?? q.shortName ?? null, exchange: q.fullExchangeName ?? null, quoteType: q.quoteType ?? null, prevClose: q.regularMarketPreviousClose ?? null, time: q.regularMarketTime ?? null, high: q.regularMarketDayHigh ?? null, low: q.regularMarketDayLow ?? null, open: q.regularMarketOpen ?? null, ...earningsOf(q as EarningsFields) };
  }
  return out;
}

/** A future's quote as the roll record needs it (futures.ts, B-27): the named contract the =F series is on, that
 *  contract's own previous close, the quote's time, and, for a named contract's own quote, its expiry and name. Asked
 *  for with every field, as the source probe of 20 Nov 2026 read them (`underlyingSymbol`, `expireIsoDate`). */
export interface FutQuote { symbol: string; underlying: string | null; prevClose: number | null; price: number | null; time: number | null; expires: string | null; name: string | null }
export async function futuresQuotes(symbols: string[]): Promise<Record<string, FutQuote>> {
  const out: Record<string, FutQuote> = {};
  if (!symbols.length) return out;
  const { cookie, crumb: cr } = await crumb();
  for (let i = 0; i < symbols.length; i += 50) {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.slice(i, i + 50).join(","))}&crumb=${encodeURIComponent(cr)}`;
    // a failed request's own message can carry the address, and with it the crumb: the note says only what failed
    let r: Response;
    try { r = await fetch(url, { headers: { ...headers, cookie }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { throw new Error(`yahoo quote (futures): ${e instanceof Error && e.name === "TimeoutError" ? "no answer in 20 s" : "the request failed"}`); }
    if (!r.ok) throw new Error(`yahoo quote (futures): HTTP ${r.status}`);
    const j = (await r.json()) as { quoteResponse?: { result?: Array<{ symbol: string; underlyingSymbol?: string; regularMarketPreviousClose?: number; regularMarketPrice?: number; regularMarketTime?: number; expireIsoDate?: string; expireDate?: number; shortName?: string; longName?: string }> } };
    for (const q of j.quoteResponse?.result ?? []) {
      const exp = typeof q.expireIsoDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(q.expireIsoDate) ? q.expireIsoDate.slice(0, 10) : typeof q.expireDate === "number" ? new Date(q.expireDate * 1000).toISOString().slice(0, 10) : null;
      out[q.symbol] = { symbol: q.symbol, underlying: typeof q.underlyingSymbol === "string" && q.underlyingSymbol ? q.underlyingSymbol : null, prevClose: q.regularMarketPreviousClose ?? null, price: q.regularMarketPrice ?? null, time: q.regularMarketTime ?? null, expires: exp, name: q.shortName ?? q.longName ?? null };
    }
  }
  return out;
}

/** Last non-null close and its timestamp. */
export function lastPrint(s: { timestamp: number[]; close: Array<number | null> }): { price: number; t: number } | null {
  for (let i = s.close.length - 1; i >= 0; i--) { const v = s.close[i]; if (v != null && Number.isFinite(v)) return { price: v, t: s.timestamp[i] }; }
  return null;
}

// ---- company profiles: sector and industry (Yahoo's Morningstar-based classification) ----
export interface Profile { sector: string | null; industry: string | null }
/** Asset profiles, one request per symbol with a small concurrency; symbols Yahoo does not know are absent. */
export async function profiles(symbols: string[], concurrency = 4): Promise<Record<string, Profile>> {
  const out: Record<string, Profile> = {};
  const { cookie, crumb: cr } = await crumb();
  const any = { "user-agent": headers["user-agent"], accept: "*/*", cookie };
  const work = [...symbols];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const s = work.shift(); if (!s) return;
      try {
        const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=assetProfile&crumb=${encodeURIComponent(cr)}`, { headers: any, signal: AbortSignal.timeout(20000) });
        if (!r.ok) { if (r.status === 404) out[s] = { sector: null, industry: null }; continue; }
        const j = (await r.json()) as { quoteSummary?: { result?: Array<{ assetProfile?: { sector?: string; industry?: string } }> } };
        const p = j.quoteSummary?.result?.[0]?.assetProfile;
        out[s] = { sector: p?.sector || null, industry: p?.industry || null };
      } catch { /* left absent: retried on the next run */ }
    }
  }));
  return out;
}

// ---- key statistics: share counts and US short interest (the exchange-reported figure Yahoo republishes) ----
export interface KeyStats { sharesOutstanding: number | null; floatShares: number | null; sharesShort: number | null; shortRatio: number | null; shortPercentOfFloat: number | null; sharesPercentSharesOut: number | null; sharesShortPriorMonth: number | null; dateShortInterest: number | null; sharesShortPreviousMonthDate: number | null; bookValue: number | null }
/** Reads the figures out of a quoteSummary answer (module defaultKeyStatistics). Each arrives as { raw, fmt };
 *  only a numeric `raw` counts, anything else is null. Ratios are fractions (0.0123 = 1.23%); dates are Unix seconds. */
export function keyStatsOf(json: unknown): KeyStats {
  const k = ((json as { quoteSummary?: { result?: Array<{ defaultKeyStatistics?: Record<string, unknown> }> } } | null)?.quoteSummary?.result?.[0]?.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const raw = (name: string): number | null => { const v = k[name]; const x = v && typeof v === "object" ? (v as { raw?: unknown }).raw : v; return typeof x === "number" && Number.isFinite(x) ? x : null; };
  return { sharesOutstanding: raw("sharesOutstanding"), floatShares: raw("floatShares"), sharesShort: raw("sharesShort"), shortRatio: raw("shortRatio"), shortPercentOfFloat: raw("shortPercentOfFloat"), sharesPercentSharesOut: raw("sharesPercentSharesOut"), sharesShortPriorMonth: raw("sharesShortPriorMonth"), dateShortInterest: raw("dateShortInterest"), sharesShortPreviousMonthDate: raw("sharesShortPreviousMonthDate"), bookValue: raw("bookValue") };
}
export async function keyStats(symbol: string): Promise<KeyStats> {
  const { cookie, crumb: cr } = await crumb();
  const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics&crumb=${encodeURIComponent(cr)}`, { headers: { "user-agent": headers["user-agent"], accept: "*/*", cookie }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`yahoo key statistics: HTTP ${r.status}`);
  return keyStatsOf(await r.json());
}
