// A read-only look at the live database (Shota, 19 Nov 2026): what the jobs last did, whether EQUITIES has
// today's quotes, the alerts of the last two days, the reasons for big moves and what they cost, and how much of
// the EDINET DB allowance is used. It changes nothing. It prints market data and counts only: no email address,
// no watchlist, no account detail.
//
//   npx tsx live_check.ts
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (workflow live-check: Actions > live-check > Run workflow).
import { db } from "./lib/db.js";
import { spark } from "./lib/yahoo.js";

const now = Date.now();
const age = (iso: string | null | undefined): string => { if (!iso) return "never"; const m = Math.round((now - Date.parse(iso)) / 60000); return m < 120 ? `${m} min ago` : m < 2880 ? `${(m / 60).toFixed(1)} h ago` : `${Math.round(m / 1440)} days ago`; };
const utc = (iso: string | null | undefined): string => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "–");
const head = (t: string): void => console.log(`\n== ${t}`);
// a table or a column that a database from before some change does not have is said, not thrown
// LIVE_CHECK_ONLY (the workflow's "only" input): a comma-separated choice of parts, by the first word of each title
// below (jobs, relay, sources, market, source, equities, alerts, reasons, edinet, counts); empty for all of them
const ONLY = (process.env.LIVE_CHECK_ONLY ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
async function part(key: string, title: string, f: () => Promise<void>): Promise<void> { if (ONLY.length && !ONLY.includes(key)) return; head(title); try { await f(); } catch (e) { console.log(`  could not be read: ${e instanceof Error ? e.message : String(e)}`); } }
const must = <T>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

async function main(): Promise<void> {
  const sb = db();
  console.log(`live check at ${utc(new Date(now).toISOString())}`);

  await part("jobs", "jobs that ran in the last 48 hours: the last run of each, and failures in the last 24", async () => {
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

  await part("relay", "relay: the second path for prices (the server's own answers, the relay on GitHub, and the requests made to GitHub)", async () => {
    const notes = must(await sb.from("snapshots").select("key,payload,at").in("key", ["feed_own", "relay"])) as Array<{ key: string; payload: Record<string, unknown>; at: string }>;
    const own = notes.find((n) => n.key === "feed_own")?.payload as { at: string; expected: boolean; lateMin: number | null; symbol: string | null; newest: string | null; got: number; due: number } | undefined;
    const relay = notes.find((n) => n.key === "relay")?.payload as { at: string | null; run: string | null; since: string | null; note: string | null } | undefined;
    if (!own) console.log("  the server's tick has left no reading of its own answers yet (a server from before the second path)");
    else console.log(`  the server's own answers, read ${age(own.at)}: ${own.got} of ${own.due} instruments answered; ${own.expected ? `the freshest open market is ${own.lateMin} min behind (${own.symbol}, last print ${utc(own.newest)}); the relay is asked for at 10` : "no market open long enough to expect a price"}`);
    const on = !!relay?.at && now - Date.parse(relay.at) <= 150e3;
    console.log(relay ? `  the relay: ${on ? `WRITING NOW (run ${relay.run}, since ${utc(relay.since)}; last beat ${age(relay.at)})` : `not running; the last one was run ${relay.run}, ${relay.since ? `which wrote from ${utc(relay.since)}` : "which wrote nothing"}`}` : "  the relay has never written");
    const runs = must(await sb.from("job_runs").select("job,at,ok,detail").like("job", "relay%").order("at", { ascending: false }).limit(400)) as Array<{ job: string; at: string; ok: boolean; detail: string | null }>;
    const mins = runs.filter((r) => r.job === "relay");
    console.log(`  relay lines on record (the newest 400 at most): ${mins.length} of the relay itself, ${runs.length - mins.length} of the jobs it ran`);
    for (const r of mins.slice(0, 6)) console.log(`    ${utc(r.at)} ${r.ok ? "ok" : "FAILED"}: ${(r.detail ?? "").slice(0, 300)}`);
    for (const r of runs.filter((x) => x.job !== "relay").slice(0, 6)) console.log(`    ${utc(r.at)} ${r.job} ${r.ok ? "ok" : "FAILED"}: ${(r.detail ?? "").slice(0, 160)}`);
    const stood = must(await sb.from("job_runs").select("job,at,detail").or("detail.like.standing down%,detail.like.stood down%").order("at", { ascending: false }).limit(5)) as Array<{ job: string; at: string; detail: string | null }>;
    console.log(stood.length ? `  the server last stood down ${age(stood[0].at)}: ${stood[0].job}: ${(stood[0].detail ?? "").slice(0, 220)}` : "  the server has never stood down for a relay");
    // how long a currency pair goes without a minute bar in ordinary hours: the relay is asked for at ten minutes
    // behind, so an ordinary pause of that length (the daily roll at 17:00 New York) would start it for nothing
    for (const sym of ["USDJPY=X", "EURUSD=X", "BTC-USD"]) {
      const bars: string[] = [];
      for (let from = 0; from < 4000; from += 1000) { const page = must(await sb.from("bars_intraday").select("t").eq("symbol", sym).gte("t", new Date(now - 36 * 3600e3).toISOString()).order("t").range(from, from + 999)) as Array<{ t: string }>; bars.push(...page.map((r) => r.t)); if (page.length < 1000) break; }
      const gaps: Array<{ from: string; min: number }> = [];
      for (let k = 1; k < bars.length; k++) { const min = Math.round((Date.parse(bars[k]) - Date.parse(bars[k - 1])) / 60000); if (min >= 5) gaps.push({ from: bars[k - 1], min }); }
      console.log(`  ${sym}: ${bars.length} minute bars in 36 h; pauses of 5 min or more: ${gaps.length ? gaps.map((g) => `${g.min} min from ${utc(g.from)}`).join("; ") : "none"}`);
    }
    // what the database asked GitHub for, and what GitHub answered (kept a few hours only)
    const asked = await sb.rpc("monitor_dispatch_status");
    if (asked.error) console.log(`  requests to GitHub: could not be read (${asked.error.message})`);
    else { const rows = (asked.data ?? []) as Array<{ at: string; workflow: string; status: number | null; answer: string | null }>;
      console.log(rows.length ? `  the database's last requests to GitHub (204 = accepted; 401 = the token is wrong or has expired; no status = answered too long ago to be kept):` : "  the database has never asked GitHub to start a workflow: no GitHub token is stored (NOTE_DISPATCH_TOKEN), so the relay starts on GitHub's schedule only");
      for (const r of rows.slice(0, 6)) console.log(`    ${utc(r.at)} ${r.workflow}: ${r.status ?? "–"}${r.status && r.status !== 204 ? " " + (r.answer ?? "").slice(0, 120) : ""}`); }
  });

  await part("sources", "sources whose last attempt failed", async () => {
    const rows = must(await sb.from("source_status").select("name,last_ok,last_error,last_error_at")) as Array<{ name: string; last_ok: string | null; last_error: string | null; last_error_at: string | null }>;
    const failed = rows.filter((r) => r.last_error_at && (!r.last_ok || Date.parse(r.last_error_at) > Date.parse(r.last_ok)));
    // as the Monitor's own health reading has it: a source with nothing for a week is one that is no longer asked
    const week = now - 7 * 86400e3, bad = failed.filter((r) => Date.parse(r.last_error_at!) > week), dropped = failed.filter((r) => Date.parse(r.last_error_at!) <= week);
    console.log(`  ${rows.length} sources on record, ${bad.length} failing now`);
    for (const r of bad) console.log(`  ${r.name}: failed ${age(r.last_error_at)}, last ok ${age(r.last_ok)}: ${(r.last_error ?? "").slice(0, 160)}`);
    if (dropped.length) console.log(`  no longer asked (their last attempt, a failure, is more than a week old): ${dropped.map((r) => r.name).join(", ")}`);
  });

  await part("market", "the market table's own quotes (pulled every minute): when each last printed", async () => {
    const rows = must(await sb.from("quotes_latest").select("symbol,price,market_time,fetched_at").in("symbol", ["^GSPC", "^IXIC", "^N225", "^VIX", "ES=F", "NKD=F", "USDJPY=X", "EURUSD=X", "^TNX", "CL=F", "GC=F", "^GDAXI", "^STOXX50E", "^FCHI", "^SSMI", "^FTSE", "^MXX", "^BVSP", "BTC-USD"])) as Array<{ symbol: string; price: number; market_time: string; fetched_at: string }>;
    for (const r of rows.sort((a, b) => a.symbol.localeCompare(b.symbol))) console.log(`  ${r.symbol.padEnd(9)} ${String(r.price).padEnd(11)} printed ${utc(r.market_time)} (${age(r.market_time)}), pulled ${age(r.fetched_at)}`);
    if (!rows.length) console.log("  none of the instruments asked for is in the table");
    // the closes booked for the same instruments: a close booked while the quotes stood still shows here as a
    // close equal to the quote it was frozen at
    const closes = must(await sb.from("prices_daily").select("symbol,d,close").in("symbol", rows.map((r) => r.symbol)).gte("d", new Date(now - 8 * 86400e3).toISOString().slice(0, 10)).order("d", { ascending: false })) as Array<{ symbol: string; d: string; close: number }>;
    console.log("  booked closes, newest first:");
    for (const r of rows) {
      const c = closes.filter((x) => x.symbol === r.symbol).slice(0, 3);
      console.log(`  ${r.symbol.padEnd(9)} ${c.map((x) => `${x.d} ${x.close}`).join("; ") || "none in the last 8 days"}${c[0] && Math.abs(c[0].close / r.price - 1) < 1e-6 ? "   <- the newest close equals the quote" : ""}`);
    }
  });

  await part("source", "the price source asked directly from here (not through the Monitor's server): its newest minute bar", async () => {
    // tells a source that has stopped apart from a server that is being handed old answers
    for (const symbol of ["USDJPY=X", "^GSPC", "AAPL"]) for (const host of ["query1", "query2"]) {
      try {
        const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "application/json" }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) { console.log(`  ${symbol} at ${host}: HTTP ${r.status}`); continue; }
        const j = (await r.json()) as { chart?: { result?: Array<{ meta?: { regularMarketTime?: number; regularMarketPrice?: number }; timestamp?: number[] }> } };
        const x = j.chart?.result?.[0], last = x?.timestamp?.at(-1), mt = x?.meta?.regularMarketTime;
        console.log(`  ${symbol.padEnd(9)} at ${host}: price ${x?.meta?.regularMarketPrice ?? "–"}, market time ${mt ? utc(new Date(mt * 1000).toISOString()) + " (" + age(new Date(mt * 1000).toISOString()) + ")" : "–"}, last minute bar ${last ? utc(new Date(last * 1000).toISOString()) : "–"}`);
      } catch (e) { console.log(`  ${symbol} at ${host}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    // The same question through the reader the batch jobs use (it waits and asks again on HTTP 429): the daily
    // closes and the newest minute bar as GitHub's machine is given them. Set beside the booked closes above,
    // this tells whether the source itself has the real closes while the Monitor's server is handed old ones.
    const syms = ["^GSPC", "^IXIC", "ES=F", "CL=F", "USDJPY=X", "AAPL", "^GDAXI", "^STOXX50E", "^FCHI", "^SSMI", "^FTSE", "^MXX", "^BVSP"];
    const daily = await spark(syms, "5d", "1d"), minute = await spark(syms, "1d", "1m");
    console.log("  through the jobs' reader (daily closes, newest last; then the newest minute bar):");
    for (const sym of syms) {
      const d = daily[sym], m = minute[sym];
      const bars = d ? d.timestamp.map((t, k) => ({ t, c: d.close[k] })).filter((x) => x.c != null).slice(-3).map((x) => `${utc(new Date(x.t * 1000).toISOString())} ${x.c}`).join("; ") : "no answer";
      const lastMin = m ? m.timestamp.map((t, k) => ({ t, c: m.close[k] })).filter((x) => x.c != null).at(-1) : null;
      console.log(`  ${sym.padEnd(9)} ${bars} | minute: ${lastMin ? `${utc(new Date(lastMin.t * 1000).toISOString())} ${lastMin.c} (${age(new Date(lastMin.t * 1000).toISOString())})` : "no answer"}`);
    }
  });

  await part("equities", "EQUITIES: the lists, their booked closes and today's quotes", async () => {
    const rows: Array<{ idx: string; symbol: string; d: string; q_time: string | null; q_price: number | null; q_prev: number | null; quote_at: string | null }> = [];
    for (let from = 0; ; from += 1000) { const page = must(await sb.from("constituent_stats").select("idx,symbol,d,q_time,q_price,q_prev,quote_at").order("idx").order("symbol").range(from, from + 999)) as typeof rows; rows.push(...page); if (page.length < 1000) break; }
    const by = new Map<string, typeof rows>();
    for (const r of rows) { const a = by.get(r.idx) ?? []; a.push(r); by.set(r.idx, a); }
    for (const [idx, rs] of [...by].sort()) {
      const d = rs.map((r) => r.d).sort().at(-1), q = rs.filter((r) => r.q_time && r.q_price != null && r.q_prev != null), newest = q.map((r) => r.q_time!).sort().at(-1);
      // "later" here is by date in UTC, a rough reading: the page decides by each exchange's own calendar day
      const later = q.filter((r) => r.q_time!.slice(0, 10) > r.d).length, fresh = q.filter((r) => now - Date.parse(r.q_time!) < 30 * 60000).length;
      // quote_at is when the Monitor last pulled the quotes; q_time is when the exchange printed each price
      const pulled = rs.map((r) => r.quote_at).filter((x): x is string => !!x).sort(), oldest = q.map((r) => r.q_time!).sort()[0];
      console.log(`  ${idx}: ${rs.length} names, closes of ${d}; quotes last pulled ${age(pulled.at(-1))} (the oldest pull ${age(pulled[0])}); ${q.length} with a quote, prints from ${utc(oldest)} to ${utc(newest)}; ${fresh} printed in the last 30 min; ${later} from a later day than the close`);
      for (const r of q.slice(0, 3)) console.log(`      ${r.symbol}: ${r.q_price} against ${r.q_prev} (${(((r.q_price! / r.q_prev!) - 1) * 100).toFixed(2)}%), printed ${utc(r.q_time)}, pulled ${utc(r.quote_at)}`);
    }
    if (!by.size) console.log("  no rows");
  });

  await part("alerts", "alerts of the last 48 hours", async () => {
    const rows = must(await sb.from("alerts").select("at,upd,d,symbol,name,kind,pct,market,msg,pushed_at").gte("at", new Date(now - 48 * 3600e3).toISOString()).order("at", { ascending: false }).limit(200)) as Array<{ at: string; upd: string; d: string; symbol: string; name: string; kind: string; pct: number | null; market: string; msg: string; pushed_at: string | null }>;
    const stock = rows.filter((r) => r.kind === "stock"), under7 = stock.filter((r) => r.pct != null && Math.abs(r.pct) < 7);
    console.log(`  ${rows.length} in all: ${["stock", "index", "buyback", "revision", "mna"].map((k) => `${rows.filter((r) => r.kind === k).length} ${k}`).join(", ")}; of the stock alerts ${under7.length} are between 5% and 7% (the line for large companies); ${rows.filter((r) => r.pushed_at).length} went out as notifications`);
    for (const r of rows.slice(0, 40)) console.log(`  ${utc(r.at)}  ${r.kind.padEnd(8)} ${r.symbol.padEnd(10)} ${r.pct == null ? "      " : (r.pct >= 0 ? "+" : "") + r.pct.toFixed(1) + "%"}  ${r.msg.slice(0, 110)}`);
    if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
  });

  await part("reasons", "reasons for big moves", async () => {
    const rows = must(await sb.from("move_causes").select("symbol,kind,d,from_d,pct,status,tries,cost_usd,done_at,queued_at").order("d", { ascending: false }).limit(5000)) as Array<{ symbol: string; kind: string; d: string; from_d: string | null; pct: number | null; status: string; tries: number; cost_usd: number | null; done_at: string | null; queued_at: string }>;
    const n = (s: string) => rows.filter((r) => r.status === s).length, cost = rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
    console.log(`  ${rows.length} moves on record: ${n("found")} with a reason, ${n("not_found")} with none found, ${n("queued")} waiting, ${n("error")} failed (of which ${rows.filter((r) => r.status === "error" && r.tries >= 3).length} given up after three tries)`);
    console.log(`  cost of the look-ups stored (the last one of each move): USD ${cost.toFixed(2)}`);
    const syms = new Map<string, string[]>();
    for (const r of rows) { const a = syms.get(r.symbol) ?? []; a.push(r.status); syms.set(r.symbol, a); }
    for (const [s, st] of [...syms].sort()) console.log(`  ${s}: ${st.length} moves; ${["found", "not_found", "queued", "error"].filter((k) => st.includes(k)).map((k) => `${st.filter((x) => x === k).length} ${k}`).join(", ")}`);
    // what is waiting, move by move: a day (d1), five sessions (w1), a swing within a month (m1)
    const waiting = rows.filter((r) => r.status === "queued");
    for (const s of [...new Set(waiting.map((r) => r.symbol))].sort()) {
      const w = waiting.filter((r) => r.symbol === s);
      console.log(`  ${s} waiting: ${["d1", "w1", "m1"].map((k) => `${w.filter((r) => r.kind === k).length} ${k}`).join(", ")}`);
      for (const r of w) console.log(`    ${r.kind} ${r.from_d ?? "?"} to ${r.d}: ${r.pct == null ? "?" : `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%`}`);
    }
  });

  await part("edinet", "EDINET DB: stored answers and today's allowance", async () => {
    const rows: Array<{ key: string; fetched_at: string; payload: { used?: number } | null }> = [];
    for (let from = 0; ; from += 1000) { const page = must(await sb.from("asset_cache").select("key,fetched_at,payload->used").like("key", "edb:%").range(from, from + 999)) as unknown as Array<{ key: string; fetched_at: string; used?: number }>; rows.push(...page.map((r) => ({ key: r.key, fetched_at: r.fetched_at, payload: { used: r.used } }))); if (page.length < 1000) break; }
    const kind = (k: string) => k.split(":")[1];
    console.log(`  stored: ${["id", "earn", "fin", "qs"].map((k) => `${rows.filter((r) => kind(r.key) === k).length} ${k}`).join(", ")} (id = company code, earn = 決算短信, fin = annual statements, qs = single quarters)`);
    const budget = rows.filter((r) => kind(r.key) === "budget").sort((a, b) => b.key.localeCompare(a.key)).slice(0, 4);
    for (const b of budget) console.log(`  requests counted on ${b.key.split(":")[2]} (Japan's day): ${b.payload?.used ?? "?"}`);
    if (!budget.length) console.log("  no request has been counted yet: no Tokyo stock's statements have been asked for from EDINET DB");
  });

  await part("counts", "counts (numbers only)", async () => {
    for (const [t, what] of [["accounts", "rows in accounts"], ["users", "rows in users"], ["watchlists", "watchlist entries"], ["push_subs", "devices subscribed to notifications"], ["notes", "morning notes"], ["reports", "reports"]] as const) {
      const r = await sb.from(t).select("*", { count: "exact", head: true });
      console.log(`  ${what}: ${r.error ? `could not be read (${r.error.message})` : r.count}`);
    }
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
