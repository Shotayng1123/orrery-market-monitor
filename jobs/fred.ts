// Policy rates from FRED (the Supabase edge runtime cannot reach fred.stlouisfed.org; GitHub Actions can).
//   FED  target rate: DFEDTARU (upper bound, from 2008-12-16) preceded by DFEDTAR (single target, 1982–2008)
//   BOJ / RBA / BOK  monthly averages of the overnight / cash / call rate from the OECD MEI series on FRED,
//                    a stated proxy for the policy rate until an official daily feed is wired
// Writes policy_rates (current) and policy_history (change points). Run: npx tsx fred.ts   (env: SUPABASE_*)
import { db } from "./lib/db.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
type Obs = { d: string; v: number };

async function series(id: string): Promise<Obs[]> {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`FRED ${id}: HTTP ${r.status}`);
  const text = await r.text();
  return text.split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => c.length >= 2 && c[1] !== "." && c[1] !== "").map((c) => ({ d: c[0], v: Number(c[1]) })).filter((o) => Number.isFinite(o.v));
}
const changePoints = (obs: Obs[]): Obs[] => { const out: Obs[] = []; let prev: number | null = null; for (const o of obs) { if (prev === null || o.v !== prev) out.push(o); prev = o.v; } if (obs.length && out[out.length - 1].d !== obs[obs.length - 1].d) out.push(obs[obs.length - 1]); return out; };
const lastChange = (obs: Obs[]) => { const last = obs[obs.length - 1]; let lc = last.d; for (let k = obs.length - 2; k >= 0; k--) { if (obs[k].v !== last.v) break; lc = obs[k].d; } return lc; };

(async () => {
  const sb = db();
  const out: string[] = [];
  const store = async (bank: string, obs: Obs[], source: string, note: string) => {
    if (!obs.length) throw new Error(`${bank}: no observations`);
    const last = obs[obs.length - 1];
    const { error } = await sb.from("policy_rates").update({ rate: last.v, as_of: last.d, last_change: lastChange(obs), updated_at: new Date().toISOString(), source_note: note }).eq("bank", bank);
    if (error) throw new Error(error.message);
    const rows = changePoints(obs).map((o) => ({ bank, d: o.d, rate: o.v, source }));
    for (let i = 0; i < rows.length; i += 1000) { const { error: he } = await sb.from("policy_history").upsert(rows.slice(i, i + 1000), { onConflict: "bank,d" }); if (he) throw new Error(he.message); }
    out.push(`${bank} ${last.v}% as of ${last.d} (${rows.length} change points)`);
  };
  // Fed: splice the pre-2008 single target onto the upper bound of the range
  const upper = await series("DFEDTARU"), single = await series("DFEDTAR");
  const firstUpper = upper[0]?.d ?? "2008-12-16";
  await store("FED", [...single.filter((o) => o.d < firstUpper), ...upper], "FRED DFEDTAR (to 2008) + DFEDTARU (upper bound of the target range)", "FRED DFEDTARU (upper bound of the target range), via GitHub Actions");
  // monthly OECD proxies
  for (const [bank, id, label] of [["BOJ", "IRSTCB01JPM156N", "overnight call rate"], ["RBA", "IRSTCB01AUM156N", "cash rate"], ["BOK", "IRSTCB01KRM156N", "call rate"]] as const) {
    try {
      const obs = await series(id);
      await store(bank, obs, `FRED ${id} (OECD MEI immediate rate, monthly average; proxy for the policy rate)`, `monthly average ${label} (OECD via FRED ${id}); official policy rate feed not wired`);
    } catch (e) { out.push(`${bank} ERR ${e instanceof Error ? e.message : e}`); }
  }
  await sb.from("source_status").upsert({ name: "fred", last_ok: new Date().toISOString(), last_error: null, last_error_at: null }, { onConflict: "name" });
  await sb.from("job_runs").insert({ job: "actions:fred", ok: true, detail: out.join("; ").slice(0, 2000), ms: 0 });
  console.log(out.join("\n"));
})().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try { await db().from("source_status").upsert({ name: "fred", last_error: String(e instanceof Error ? e.message : e).slice(0, 500), last_error_at: new Date().toISOString() }, { onConflict: "name" }); } catch { /* ignore */ }
  process.exit(1);
});
