// Yahoo Finance for the batch jobs (Node). Same endpoints as the Edge Functions; nulls are kept as gaps.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(path: string, timeoutMs = 30000): Promise<unknown> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const h of HOSTS) {
      try {
        const r = await fetch(h + path, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
        if (r.status === 429) { last = new Error("HTTP 429"); await sleep(3000 * (attempt + 1)); continue; }
        if (!r.ok) { last = new Error(`HTTP ${r.status}`); continue; }
        return await r.json();
      } catch (e) { last = e; }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export interface SparkSeries { symbol: string; timestamp: number[]; close: Array<number | null>; previousClose: number | null; chartPreviousClose: number | null }

/** Batched spark (20 symbols per request, 350 ms between requests). Unknown symbols are absent from the result. */
export async function spark(symbols: string[], range: string, interval: string, onProgress?: (done: number, total: number) => void): Promise<Record<string, SparkSeries>> {
  const out: Record<string, SparkSeries> = {};
  for (let i = 0; i < symbols.length; i += 20) {
    const batch = symbols.slice(i, i + 20);
    try {
      const j = (await getJson(`/v8/finance/spark?symbols=${encodeURIComponent(batch.join(","))}&range=${range}&interval=${interval}`)) as Record<string, { timestamp?: number[]; close?: Array<number | null>; previousClose?: number; chartPreviousClose?: number }>;
      for (const [sym, v] of Object.entries(j)) {
        if (!v || !Array.isArray(v.timestamp) || !Array.isArray(v.close)) continue;
        out[sym] = { symbol: sym, timestamp: v.timestamp, close: v.close, previousClose: v.previousClose ?? null, chartPreviousClose: v.chartPreviousClose ?? null };
      }
    } catch (e) { console.warn(`spark batch ${i / 20 + 1} failed: ${e instanceof Error ? e.message : e}`); }
    onProgress?.(Math.min(i + 20, symbols.length), symbols.length);
    await sleep(350);
  }
  return out;
}

/** Last two completed daily closes of a spark daily series: [previous, last] with their epoch seconds. */
export function lastTwo(s: SparkSeries): { prev: { t: number; v: number } | null; last: { t: number; v: number } | null } {
  const pts: Array<{ t: number; v: number }> = [];
  for (let i = 0; i < s.close.length; i++) { const v = s.close[i]; if (v != null && Number.isFinite(v)) pts.push({ t: s.timestamp[i], v }); }
  return { prev: pts.length >= 2 ? pts[pts.length - 2] : null, last: pts.length ? pts[pts.length - 1] : null };
}
