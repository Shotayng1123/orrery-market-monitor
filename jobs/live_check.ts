// A read-only look at the live database (Shota, 19 Nov 2026): what the jobs last did, whether EQUITIES has
// today's quotes, the alerts of the last two days, the reasons for big moves and what they cost, and how much of
// the EDINET DB allowance is used. It changes nothing. It prints market data and counts only: no email address,
// no watchlist, no account detail.
//
//   npx tsx live_check.ts
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (workflow live-check: Actions > live-check > Run workflow).
import { db } from "./lib/db.js";

const now = Date.now();
const age = (iso: string | null | undefined): string => { if (!iso) return "never"; const m = Math.round((now - Date.parse(iso)) / 60000); return m < 120 ? `${m} min ago` : m < 2880 ? `${(m / 60).toFixed(1)} h ago` : `${Math.round(m / 1440)} days ago`; };
const utc = (iso: string | null | undefined): string => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "–");
const head = (t: string): void => console.log(`\n== ${t}`);
// a table or a column that a database from before some change does not have is said, not thrown
async function part(title: string, f: () => Promise<void>): Promise<void> { head(title); try { await f(); } catch (e) { console.log(`  could not be read: ${e instanceof Error ? e.message : String(e)}`); } }
const must = <T>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

async function main(): Promise<void> {
  const sb = db();
  console.log(`live check at ${utc(new Date(now).toISOString())}`);

  await part("jobs that ran in the last 48 hours: the last run of each, and failures in the last 24", async () => {
    // the minute job alone writes 1,440 rows a day, so the two days are read in pages
    const rows: Array<{ job: string; at: string; ok: boolean; detail: string | null; ms: number | null }> = [];
    for (let from = 0; from < 8000; from += 1000) { const page = must(await sb.from("job_runs").select("job,at,ok,detail,ms").gte("at", new Date(now - 48 * 3600e3).toISOString()).order("at", { ascending: false }).range(from, from + 999)) as typeof rows; rows.push(...page); if (page.length < 1000) break; }
    const by = new Map<string, typeof rows>();
    for (const r of rows) { const a = by.get(r.job) ?? []; a.push(r); by.set(r.job, a); }
    for (const [job, rs] of [...by].sort()) {
      const day = rs.filter((r) => now - Date.parse(r.at) < 86400e3), bad = day.filter((r) => !r.ok);
      console.log(`  ${job}: last ${age(rs[0].at)} (${rs[0].ok ? "ok" : "FAILED"}${rs[0].ms != null ? `, ${rs[0].ms} ms` : ""}); ${day.length} runs in 24 h, ${bad.length} failed${bad.length ? `; last failure ${utc(bad[0].at)}: ${(bad[0].detail ?? "").slice(0, 160)}` : ""}`);
    }
    if (!by.size) console.log("  no runs on record in the last 48 hours");
  });

  await part("sources whose last attempt failed", async () => {
    const rows = must(await sb.from("source_status").select("name,last_ok,last_error,last_error_at")) as Array<{ name: string; last_ok: string | null; last_error: string | null; last_error_at: string | null }>;
    const bad = rows.filter((r) => r.last_error_at && (!r.last_ok || Date.parse(r.last_error_at) > Date.parse(r.last_ok)));
    console.log(`  ${rows.length} sources on record, ${bad.length} failing now`);
    for (const r of bad) console.log(`  ${r.name}: failed ${age(r.last_error_at)}, last ok ${age(r.last_ok)}: ${(r.last_error ?? "").slice(0, 160)}`);
  });

  await part("EQUITIES: the lists, their booked closes and today's quotes", async () => {
    const rows: Array<{ idx: string; d: string; q_time: string | null; q_price: number | null; q_prev: number | null }> = [];
    for (let from = 0; ; from += 1000) { const page = must(await sb.from("constituent_stats").select("idx,d,q_time,q_price,q_prev").range(from, from + 999)) as typeof rows; rows.push(...page); if (page.length < 1000) break; }
    const by = new Map<string, typeof rows>();
    for (const r of rows) { const a = by.get(r.idx) ?? []; a.push(r); by.set(r.idx, a); }
    for (const [idx, rs] of [...by].sort()) {
      const d = rs.map((r) => r.d).sort().at(-1), q = rs.filter((r) => r.q_time && r.q_price != null && r.q_prev != null), newest = q.map((r) => r.q_time!).sort().at(-1);
      // "later" here is by date in UTC, a rough reading: the page decides by each exchange's own calendar day
      const later = q.filter((r) => r.q_time!.slice(0, 10) > r.d).length, fresh = q.filter((r) => now - Date.parse(r.q_time!) < 30 * 60000).length;
      console.log(`  ${idx}: ${rs.length} names, closes of ${d}; ${q.length} with a quote, newest print ${age(newest)}; ${fresh} printed in the last 30 min; ${later} from a later day than the close`);
    }
    if (!by.size) console.log("  no rows");
  });

  await part("alerts of the last 48 hours", async () => {
    const rows = must(await sb.from("alerts").select("at,upd,d,symbol,name,kind,pct,market,msg,pushed_at").gte("at", new Date(now - 48 * 3600e3).toISOString()).order("at", { ascending: false }).limit(200)) as Array<{ at: string; upd: string; d: string; symbol: string; name: string; kind: string; pct: number | null; market: string; msg: string; pushed_at: string | null }>;
    const stock = rows.filter((r) => r.kind === "stock"), under7 = stock.filter((r) => r.pct != null && Math.abs(r.pct) < 7);
    console.log(`  ${rows.length} in all: ${["stock", "index", "buyback", "revision", "mna"].map((k) => `${rows.filter((r) => r.kind === k).length} ${k}`).join(", ")}; of the stock alerts ${under7.length} are between 5% and 7% (the line for large companies); ${rows.filter((r) => r.pushed_at).length} went out as notifications`);
    for (const r of rows.slice(0, 40)) console.log(`  ${utc(r.at)}  ${r.kind.padEnd(8)} ${r.symbol.padEnd(10)} ${r.pct == null ? "      " : (r.pct >= 0 ? "+" : "") + r.pct.toFixed(1) + "%"}  ${r.msg.slice(0, 110)}`);
    if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
  });

  await part("reasons for big moves", async () => {
    const rows = must(await sb.from("move_causes").select("symbol,kind,d,status,tries,cost_usd,done_at,queued_at").order("d", { ascending: false }).limit(5000)) as Array<{ symbol: string; kind: string; d: string; status: string; tries: number; cost_usd: number | null; done_at: string | null; queued_at: string }>;
    const n = (s: string) => rows.filter((r) => r.status === s).length, cost = rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
    console.log(`  ${rows.length} moves on record: ${n("found")} with a reason, ${n("not_found")} with none found, ${n("queued")} waiting, ${n("error")} failed (of which ${rows.filter((r) => r.status === "error" && r.tries >= 3).length} given up after three tries)`);
    console.log(`  cost of the look-ups stored (the last one of each move): USD ${cost.toFixed(2)}`);
    const syms = new Map<string, string[]>();
    for (const r of rows) { const a = syms.get(r.symbol) ?? []; a.push(r.status); syms.set(r.symbol, a); }
    for (const [s, st] of [...syms].sort()) console.log(`  ${s}: ${st.length} moves; ${["found", "not_found", "queued", "error"].filter((k) => st.includes(k)).map((k) => `${st.filter((x) => x === k).length} ${k}`).join(", ")}`);
  });

  await part("EDINET DB: stored answers and today's allowance", async () => {
    const rows: Array<{ key: string; fetched_at: string; payload: { used?: number } | null }> = [];
    for (let from = 0; ; from += 1000) { const page = must(await sb.from("asset_cache").select("key,fetched_at,payload->used").like("key", "edb:%").range(from, from + 999)) as unknown as Array<{ key: string; fetched_at: string; used?: number }>; rows.push(...page.map((r) => ({ key: r.key, fetched_at: r.fetched_at, payload: { used: r.used } }))); if (page.length < 1000) break; }
    const kind = (k: string) => k.split(":")[1];
    console.log(`  stored: ${["id", "earn", "fin", "qs"].map((k) => `${rows.filter((r) => kind(r.key) === k).length} ${k}`).join(", ")} (id = company code, earn = 決算短信, fin = annual statements, qs = single quarters)`);
    const budget = rows.filter((r) => kind(r.key) === "budget").sort((a, b) => b.key.localeCompare(a.key)).slice(0, 4);
    for (const b of budget) console.log(`  requests counted on ${b.key.split(":")[2]} (Japan's day): ${b.payload?.used ?? "?"}`);
    if (!budget.length) console.log("  no request has been counted yet: no Tokyo stock's statements have been asked for from EDINET DB");
  });

  await part("counts (numbers only)", async () => {
    for (const [t, what] of [["accounts", "rows in accounts"], ["users", "rows in users"], ["watchlists", "watchlist entries"], ["push_subs", "devices subscribed to notifications"], ["notes", "morning notes"], ["reports", "reports"]] as const) {
      const r = await sb.from(t).select("*", { count: "exact", head: true });
      console.log(`  ${what}: ${r.error ? `could not be read (${r.error.message})` : r.count}`);
    }
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
