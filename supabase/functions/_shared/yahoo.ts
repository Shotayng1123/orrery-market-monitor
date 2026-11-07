// Yahoo Finance access (unofficial endpoints). Two shapes are used:
//   spark: many symbols per call, {symbol: {timestamp[], close[], previousClose, chartPreviousClose, dataGranularity}}
//   chart: one symbol, full OHLCV with meta (exchange time zone, delay not reported).
// Hosts rotate query1 -> query2 on failure. Callers decide what to do with gaps (nulls are kept, never filled).
import { BROWSER_UA } from "./http.ts";

export interface SparkSeries { symbol: string; timestamp: number[]; close: Array<number | null>; previousClose: number | null; chartPreviousClose: number | null; granularity: number }
export interface ChartSeries { symbol: string; tz: string; timestamp: number[]; open: Array<number | null>; high: Array<number | null>; low: Array<number | null>; close: Array<number | null>; volume: Array<number | null>; regularMarketPrice: number | null; regularMarketTime: number | null }

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const headers = { "user-agent": BROWSER_UA, accept: "application/json" };

async function getJson(path: string, timeoutMs = 25000): Promise<unknown> {
  let lastErr: unknown = null;
  for (const h of HOSTS) {
    try {
      const r = await fetch(h + path, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status === 429) { lastErr = new Error("HTTP 429 rate limited"); continue; }
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      return await r.json();
    } catch (e) { lastErr = e; }
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
    chart: { result: Array<{ meta: { exchangeTimezoneName: string; regularMarketPrice?: number; regularMarketTime?: number }; timestamp?: number[]; indicators: { quote: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> | null; error: { description?: string } | null };
  };
  const res = j.chart.result?.[0];
  if (!res) throw new Error(j.chart.error?.description ?? "no result");
  const q = res.indicators.quote[0] ?? {};
  const n = res.timestamp?.length ?? 0;
  const arr = (a?: Array<number | null>) => (a && a.length === n ? a : new Array(n).fill(null));
  return { symbol, tz: res.meta.exchangeTimezoneName, timestamp: res.timestamp ?? [], open: arr(q.open), high: arr(q.high), low: arr(q.low), close: arr(q.close), volume: arr(q.volume), regularMarketPrice: res.meta.regularMarketPrice ?? null, regularMarketTime: res.meta.regularMarketTime ?? null };
}

// ---- quotes (market cap, volume, average volume): the v7 endpoint needs a session cookie and a crumb ----
export interface QuoteRow { symbol: string; price: number | null; marketCap: number | null; volume: number | null; adv3m: number | null; adv10d: number | null; currency: string | null; name: string | null; exchange: string | null; quoteType: string | null; prevClose: number | null; time: number | null }
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
/** Batched quotes (100 symbols per request). Symbols Yahoo does not know are absent. */
export async function quotes(symbols: string[]): Promise<Record<string, QuoteRow>> {
  const out: Record<string, QuoteRow> = {};
  const { cookie, crumb: cr } = await crumb();
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100);
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}&fields=symbol,marketCap,regularMarketPrice,regularMarketVolume,averageDailyVolume3Month,averageDailyVolume10Day,currency,shortName,longName,fullExchangeName,quoteType,regularMarketPreviousClose,regularMarketTime&crumb=${encodeURIComponent(cr)}`;
    const r = await fetch(url, { headers: { ...headers, cookie }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`yahoo quote: HTTP ${r.status}`);
    const j = (await r.json()) as { quoteResponse?: { result?: Array<{ symbol: string; marketCap?: number; regularMarketPrice?: number; regularMarketVolume?: number; averageDailyVolume3Month?: number; averageDailyVolume10Day?: number; currency?: string; shortName?: string; longName?: string; fullExchangeName?: string; quoteType?: string; regularMarketPreviousClose?: number; regularMarketTime?: number }> } };
    for (const q of j.quoteResponse?.result ?? []) out[q.symbol] = { symbol: q.symbol, price: q.regularMarketPrice ?? null, marketCap: q.marketCap ?? null, volume: q.regularMarketVolume ?? null, adv3m: q.averageDailyVolume3Month ?? null, adv10d: q.averageDailyVolume10Day ?? null, currency: q.currency ?? null, name: q.longName ?? q.shortName ?? null, exchange: q.fullExchangeName ?? null, quoteType: q.quoteType ?? null, prevClose: q.regularMarketPreviousClose ?? null, time: q.regularMarketTime ?? null };
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
