// Fed funds target (FRED DFEDTARU) -> policy_rates.FED. Runs from GitHub Actions (.github/workflows/fred.yml):
// the Supabase edge runtime cannot reach fred.stlouisfed.org (HTTP/2 stream errors), Node from Actions can.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx fred.ts
import { db } from "./lib/db.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function series(id: string): Promise<Array<{ d: string; v: number }>> {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`FRED ${id}: HTTP ${r.status}`);
  const text = await r.text();
  return text.split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => c.length >= 2 && c[1] !== "." && c[1] !== "").map((c) => ({ d: c[0], v: Number(c[1]) })).filter((o) => Number.isFinite(o.v));
}

(async () => {
  const sb = db();
  const obs = await series("DFEDTARU");
  if (!obs.length) throw new Error("DFEDTARU: no observations");
  const last = obs[obs.length - 1];
  let lastChange = last.d;
  for (let k = obs.length - 2; k >= 0; k--) { if (obs[k].v !== last.v) break; lastChange = obs[k].d; }
  const { error } = await sb.from("policy_rates").update({ rate: last.v, as_of: last.d, last_change: lastChange, updated_at: new Date().toISOString(), source_note: "FRED DFEDTARU (upper bound of the target range), via GitHub Actions" }).eq("bank", "FED");
  if (error) throw new Error(error.message);
  await sb.from("source_status").upsert({ name: "fred", last_ok: new Date().toISOString(), last_error: null, last_error_at: null }, { onConflict: "name" });
  await sb.from("job_runs").insert({ job: "actions:fred", ok: true, detail: `FED ${last.v}% as of ${last.d} (since ${lastChange})`, ms: 0 });
  console.log(`FED ${last.v}% as of ${last.d} (unchanged since ${lastChange})`);
})().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try { await db().from("source_status").upsert({ name: "fred", last_error: String(e instanceof Error ? e.message : e).slice(0, 500), last_error_at: new Date().toISOString() }, { onConflict: "name" }); } catch { /* ignore */ }
  process.exit(1);
});
