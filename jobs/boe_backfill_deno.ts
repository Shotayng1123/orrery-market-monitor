// Loads the UK gilt curve history from the Bank of England's archive of daily nominal spot curves (the daily job
// reads only the current month's file, so the series started on 2 Nov 2026 and the Gilt 10Y chart had nine points).
//   deno run -A --node-modules-dir=none jobs/boe_backfill_deno.ts [from-year, default 2016] [path to an already downloaded glcnominalddata.zip]
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Idempotent: upserts curves (country GB) and the daily yields
// of every instrument that is a point on the gilt curve.
import { parseBoeWorkbook } from "../supabase/functions/_shared/curves.ts";
import { chunk, db, logRun } from "../supabase/functions/_shared/db.ts";

const ARCHIVE = "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip";
const fromYear = Number(Deno.args[0] ?? 2016), local = Deno.args[1];
const t0 = Date.now();
try {
  let zip: Uint8Array;
  if (local) zip = await Deno.readFile(local);
  else {
    const r = await fetch(ARCHIVE, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error(`BoE archive: HTTP ${r.status}`);
    zip = new Uint8Array(await r.arrayBuffer());
  }
  const { unzipSync } = await import("npm:fflate@0.8.2");
  const files = unzipSync(zip);
  const { data: yi } = await db.from("instruments").select("symbol,provider_symbol").eq("provider", "curve").eq("active", true);
  const want = new Map(((yi ?? []) as Array<{ symbol: string; provider_symbol: string | null }>).filter((x) => x.provider_symbol?.startsWith("GB:")).map((x) => [Number(x.provider_symbol!.split(":")[1]), x.symbol]));
  let nCurve = 0, nPrice = 0, first = "9999", last = "0000";
  for (const name of Object.keys(files).sort()) {
    const m = name.match(/_(\d{4}) to (\d{4}|present)/i);
    if (!m || (m[2] !== "present" && Number(m[2]) < fromYear)) continue;
    const rows = (await parseBoeWorkbook(files[name])).filter((r) => r.d >= `${fromYear}-01-01`);
    for (const part of chunk(rows, 1000)) { const { error } = await db.from("curves").upsert(part, { onConflict: "country,d,tenor" }); if (error) throw new Error("curves: " + error.message); }
    const now = new Date().toISOString();
    const prices = rows.filter((r) => want.has(r.years)).map((r) => ({ symbol: want.get(r.years)!, d: r.d, close: r.yield, source: r.source, updated_at: now }));
    for (const part of chunk(prices, 1000)) { const { error } = await db.from("prices_daily").upsert(part, { onConflict: "symbol,d" }); if (error) throw new Error("prices_daily: " + error.message); }
    nCurve += rows.length; nPrice += prices.length;
    for (const r of rows) { if (r.d < first) first = r.d; if (r.d > last) last = r.d; }
    console.log(`${name}: ${rows.length} curve points, ${prices.length} daily yields`);
  }
  const detail = `GB: ${nCurve} curve points, ${nPrice} daily yields (${[...want.values()].join(" ")}), ${first} .. ${last}`;
  console.log(detail);
  await logRun("actions:boe_backfill", true, detail, t0);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  await logRun("actions:boe_backfill", false, msg, t0);
  Deno.exitCode = 1;
}
