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

/** Last non-null close and its timestamp. */
export function lastPrint(s: { timestamp: number[]; close: Array<number | null> }): { price: number; t: number } | null {
  for (let i = s.close.length - 1; i >= 0; i--) { const v = s.close[i]; if (v != null && Number.isFinite(v)) return { price: v, t: s.timestamp[i] }; }
  return null;
}
