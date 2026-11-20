// B-10: liquidity and funding, euro area and Japan.
//   - ECB Data Portal (the server's policy job already reads it): €STR, daily; the Eurosystem's weekly financial
//     statement, total assets (dataset ILM).
//   - Bank of Japan: current account balances and the Bank's own accounts. No machine-readable address is known
//     to me; these are the statistics pages (candidate addresses), searched for links to data files.
// Runtime: deno (the ECB series would be read by the server's daily function, from the edge runtime).
//   Actions > source-probe > Run workflow: probe = ecb_boj_liquidity, runtime = deno
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
function lastObs(text: string): string {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const h = lines[0]?.split(",") ?? [], iT = h.indexOf("TIME_PERIOD"), iV = h.indexOf("OBS_VALUE"), iK = h.indexOf("KEY");
  const obs = lines.slice(1).map((l) => l.split(",")).map((c) => `${c[iT]} ${c[iV]}`);
  return `${lines.length - 1} rows${iK >= 0 && lines[1] ? ` of ${lines[1].split(",")[iK]}` : ""}: ${obs.join("; ")}`;
}

for (const [what, url] of [
  ["ECB: €STR (euro short-term rate), the last 5 days", "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?format=csvdata&lastNObservations=5"],
  ["ECB: Eurosystem weekly financial statement, total assets, the last 5 weeks", "https://data-api.ecb.europa.eu/service/data/ILM/W.U2.C.T000000.Z5.Z01?format=csvdata&lastNObservations=5"],
  ["ECB: the same total assets from 2016, for the history's length", "https://data-api.ecb.europa.eu/service/data/ILM/W.U2.C.T000000.Z5.Z01?format=csvdata&startPeriod=2016-01-01&detail=dataonly"],
]) {
  head(what);
  const r = await look(url, { headers: { accept: "text/csv" }, show: 0, timeoutMs: 60000 });
  if (r.ok) { const s = lastObs(r.text); console.log(`  ${s.length > 900 ? `${s.slice(0, 300)} … ${s.slice(-300)}` : s}`); }
  await pause(500);
}

const links = (html: string, base: string): string[] => [...new Set([...html.matchAll(/href="([^"]+\.(?:csv|xlsx?|pdf|zip))"/gi)].map((m) => new URL(m[1], base).toString()))];
for (const [what, url] of [
  ["Bank of Japan: sources of changes in current account balances (candidate address)", "https://www.boj.or.jp/en/statistics/boj/fm/juqp/index.htm"],
  ["Bank of Japan: the Bank of Japan's accounts, every ten days (candidate address)", "https://www.boj.or.jp/en/statistics/boj/other/acmai/index.htm"],
  ["Bank of Japan: monetary base (candidate address)", "https://www.boj.or.jp/en/statistics/boj/other/mb/index.htm"],
  ["Bank of Japan: time-series data search (candidate address)", "https://www.stat-search.boj.or.jp/index_en.html"],
]) {
  head(what);
  const r = await look(url, { show: 0 });
  if (r.ok) { const ls = links(r.text, url); console.log(`  ${ls.length} data-file links${ls.length ? `; first 8:\n  ${ls.slice(0, 8).join("\n  ")}` : ""}`); }
  await pause(500);
}
