// Fed funds target range (upper bound) from the Federal Reserve Bank of New York's Markets Data API: the EFFR
// rows carry the target range in force on each business day (targetRateFrom / targetRateTo).
// FRED's fredgraph.csv (DFEDTARU) loaded the history up to 2026-11-06 but refuses connections from GitHub's
// runners and from the Supabase edge runtime, so the daily refresh reads the New York Fed instead.
// Writes policy_rates (current) and policy_history (change points). Run: npx tsx fed.ts   (env: SUPABASE_*)
import { db } from "./lib/db.js";

type Obs = { d: string; v: number };
const NOTE = "Federal Reserve Bank of New York, EFFR data (upper bound of the target range), via GitHub Actions";
const SOURCE = "New York Fed EFFR data (upper bound of the target range)";
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

async function targets(from: string, to: string): Promise<Obs[]> {
  const url = `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${from}&endDate=${to}`;
  let lastErr: unknown;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`New York Fed: HTTP ${r.status}`);
      const j = (await r.json()) as { refRates?: Array<{ effectiveDate: string; targetRateTo?: number }> };
      return (j.refRates ?? []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.effectiveDate) && Number.isFinite(x.targetRateTo))
        .map((x) => ({ d: x.effectiveDate, v: Number(x.targetRateTo) })).sort((a, b) => a.d.localeCompare(b.d));
    } catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 5000)); }
  }
  const c = lastErr instanceof Error && lastErr.cause instanceof Error ? ` (${lastErr.cause.message})` : "";
  throw new Error(`${lastErr instanceof Error ? lastErr.message : lastErr}${c}`);
}

(async () => {
  const sb = db();
  const { data: cur, error: ce } = await sb.from("policy_rates").select("rate,as_of,last_change").eq("bank", "FED").single();
  if (ce) throw new Error(ce.message);
  const haveTo: string = cur.as_of ?? "2008-12-16";
  const obs = (await targets(day(Date.parse(haveTo) - 10 * 86400000), day(Date.now()))).filter((o) => o.d > haveTo);
  if (!obs.length) {   // weekend or holiday: nothing newer than what is stored
    await sb.from("source_status").upsert({ name: "nyfed", last_ok: new Date().toISOString(), last_error: null, last_error_at: null }, { onConflict: "name" });
    await sb.from("job_runs").insert({ job: "actions:fed", ok: true, detail: `FED no rows after ${haveTo}`, ms: 0 });
    console.log(`FED no rows after ${haveTo}`);
    return;
  }
  // change points after the stored date, plus the latest day so the step line reaches it
  let prev: number | null = cur.rate === null ? null : Number(cur.rate);
  let lastChange: string | null = cur.last_change;
  const rows: Array<{ bank: string; d: string; rate: number; source: string }> = [];
  for (const o of obs) { if (prev === null || o.v !== prev) { rows.push({ bank: "FED", d: o.d, rate: o.v, source: SOURCE }); lastChange = o.d; } prev = o.v; }
  const last = obs[obs.length - 1];
  if (!rows.length || rows[rows.length - 1].d !== last.d) rows.push({ bank: "FED", d: last.d, rate: last.v, source: SOURCE });
  const { error: he } = await sb.from("policy_history").upsert(rows, { onConflict: "bank,d" });
  if (he) throw new Error(he.message);
  const { error } = await sb.from("policy_rates").update({ rate: last.v, as_of: last.d, last_change: lastChange, updated_at: new Date().toISOString(), source_note: NOTE }).eq("bank", "FED");
  if (error) throw new Error(error.message);
  const detail = `FED ${last.v}% as of ${last.d} (since ${lastChange}; ${obs.length} new days)`;
  await sb.from("source_status").upsert({ name: "nyfed", last_ok: new Date().toISOString(), last_error: null, last_error_at: null }, { onConflict: "name" });
  await sb.from("job_runs").insert({ job: "actions:fed", ok: true, detail, ms: 0 });
  console.log(detail);
})().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  try { await db().from("source_status").upsert({ name: "nyfed", last_error: msg.slice(0, 500), last_error_at: new Date().toISOString() }, { onConflict: "name" }); } catch { /* ignore */ }
  try { await db().from("job_runs").insert({ job: "actions:fed", ok: false, detail: msg.slice(0, 2000), ms: 0 }); } catch { /* ignore */ }
  process.exit(1);
});
