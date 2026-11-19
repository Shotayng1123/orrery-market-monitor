// B-01 (and B-15 later): the policy rates RATES › POLICY RATES lacks for currencies on the FOREX list (SNB, BoC, RBNZ,
// Taiwan's CBC, RBI, Banxico, BCB, SARB, CBRT), read the way the server's policy job already reads the BoJ, RBA, BoK
// and PBoC: the BIS WS_CBPOL series, daily, one request per central bank (supabase/functions/daily/index.ts,
// policy()). It also prints how many days the newest BIS observation lies behind today for the banks already read,
// which decides whether a decision can reach the screen from this source on the day it is made.
// Runtime: deno (the server's daily function makes these requests from the edge runtime).
//   Actions > source-probe > Run workflow: probe = bis_policy_more, runtime = deno
import { head, look } from "./lib.ts";

const NEW: Array<[string, string]> = [["SNB", "CH"], ["BoC", "CA"], ["RBNZ", "NZ"], ["CBC Taiwan", "TW"], ["RBI", "IN"], ["Banxico", "MX"], ["BCB", "BR"], ["SARB", "ZA"], ["CBRT", "TR"]];
const KNOWN: Array<[string, string]> = [["BoJ", "JP"], ["RBA", "AU"], ["BoK", "KR"], ["PBoC", "CN"], ["HKMA", "HK"], ["Fed", "US"], ["ECB", "XM"], ["BoE", "GB"]];
const url = (area: string, lastN: number | null) => `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.${area}?format=csv&detail=dataonly${lastN ? `&lastNObservations=${lastN}` : ""}`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);
const daysBehind = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400e3);

/** One CSV line with quoted fields, as the policy job reads it. */
function csvLine(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
function obsOf(text: string): Array<{ d: string; v: number }> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const h = csvLine(lines[0]), iT = h.indexOf("TIME_PERIOD"), iV = h.indexOf("OBS_VALUE");
  if (iT < 0 || iV < 0) { console.log(`  columns: ${h.join(" | ")} (no TIME_PERIOD / OBS_VALUE)`); return []; }
  return lines.slice(1).map(csvLine).map((c) => ({ d: c[iT], v: Number(c[iV]) })).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.d) && Number.isFinite(o.v)).sort((a, b) => a.d.localeCompare(b.d));
}

async function one(bank: string, area: string, lastN: number | null): Promise<void> {
  const r = await look(url(area, lastN), { headers: { accept: "text/csv" }, show: 0, timeoutMs: 90000 });
  if (!r.ok) { console.log(`  ${bank} (${area}): no answer to use; first 300 chars: ${JSON.stringify(r.text.slice(0, 300))}`); return; }
  const obs = obsOf(r.text);
  if (!obs.length) { console.log(`  ${bank} (${area}): no observations; first 300 chars: ${JSON.stringify(r.text.slice(0, 300))}`); return; }
  const last = obs[obs.length - 1];
  let since = last.d, before: { d: string; v: number } | null = null;
  for (let k = obs.length - 2; k >= 0; k--) { if (obs[k].v !== last.v) { before = obs[k]; break; } since = obs[k].d; }
  console.log(`  ${bank} (${area}): ${obs.length} observations ${obs[0].d} .. ${last.d}; newest ${last.v}% on ${last.d}, ${daysBehind(last.d)} days behind today (${today}); at this level since ${since}${before ? ` (before: ${before.v}% on ${before.d})` : " (no change inside this window)"}`);
}

head("BIS WS_CBPOL: central banks not yet read, as the policy job would ask (last 40 daily observations each)");
for (const [b, a] of NEW) { await one(b, a, 40); await pause(600); }
head("BIS WS_CBPOL: banks already read or read elsewhere, for the lag of the newest observation behind today");
for (const [b, a] of KNOWN) { await one(b, a, 5); await pause(600); }
head("BIS WS_CBPOL: one full history (SNB), for the length of a series");
await one("SNB", "CH", null);
