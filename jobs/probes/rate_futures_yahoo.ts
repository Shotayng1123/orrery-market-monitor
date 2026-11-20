// Facts for an owner decision, OD-B1 (B-01: what the market prices for the Fed): the free option would read the
// 30-day fed funds and three-month SOFR futures as Yahoo Finance republishes them (unofficial; the exchange, CME
// Group, is the primary source and its terms for automated use are not known). This prints, for the front contract
// and the contract months of the next meetings, whether Yahoo has them, the last price and its time, and the rate
// it implies (100 less the price, worked out here). Nothing is built on it until the owner decides.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = rate_futures_yahoo, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const SYMS = ["ZQ=F", "ZQZ26.CBT", "ZQF27.CBT", "ZQG27.CBT", "ZQH27.CBT", "ZQJ27.CBT", "SR3=F", "SR3Z26.CME", "SR3H27.CME", "SR3M27.CME", "SR3U27.CME"];

head("Yahoo Finance: fed funds (ZQ) and three-month SOFR (SR3) futures, daily bars of the last five sessions");
for (const s of SYMS) {
  const r = await look(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1d`, { headers: { accept: "application/json" }, show: 0 });
  const res = ((J(r.text) as { chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } } | null)?.chart?.result ?? [])[0];
  if (!res?.meta) { console.log(`  ${s}: no data`); await pause(500); continue; }
  const m = res.meta, px = Number(m.regularMarketPrice), at = Number(m.regularMarketTime);
  const closes = (res.indicators?.quote?.[0]?.close ?? []).map((c, i) => `${new Date((res.timestamp?.[i] ?? 0) * 1000).toISOString().slice(0, 10)} ${c ?? "–"}`);
  console.log(`  ${s}: ${m.shortName ?? m.symbol} (${m.exchangeName}, ${m.instrumentType}); last ${px} at ${Number.isFinite(at) ? new Date(at * 1000).toISOString() : "?"}; implied ${Number.isFinite(px) ? (100 - px).toFixed(3) : "–"}% (worked out here); closes: ${closes.join(", ")}`);
  await pause(500);
}
