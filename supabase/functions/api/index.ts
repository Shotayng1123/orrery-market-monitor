// api — everything the page reads, one function, `?action=`. Sign-in issues an HMAC token; every other action
// needs it as a bearer. The research desk publishes with POST report_put and the x-report-secret header.
import { db, selectAll } from "../_shared/db.ts";
import { bearer, signToken, verifyToken } from "../_shared/auth.ts";
import { clientIp, corsHeaders, json, timingSafeEqual } from "../_shared/http.ts";
import { computeTable } from "../_shared/table.ts";
import { CURVE_LABELS } from "../_shared/curves.ts";
import { homeIndex, quoteFor, relativeLine, statementsFor, yahooSeries } from "../_shared/assets.ts";
import { fetchText } from "../_shared/http.ts";

const RANGES: Record<string, number> = { "1W": 7, "1M": 31, "3M": 93, "12M": 366, "36M": 1096 };
const SIGMA_LOOKBACK_DAYS = 1120;   // 756 trading days ≈ 1,100 calendar days, so the 36M band is defined from the first point shown

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const q = (k: string) => url.searchParams.get(k);
  try {
    if (action === "login") return await login(req);
    if (action === "report_put") return await reportPut(req);
    const user = await verifyToken(bearer(req));
    if (!user) return json(req, { error: "unauthorised" }, 401);
    switch (action) {
      case "health": return json(req, await health());
      case "table": {
        const { data } = await db.from("snapshots").select("payload,at").eq("key", "table").maybeSingle();
        if (data) return json(req, data.payload);
        return json(req, await computeTable());
      }
      case "series": return json(req, await series(q("symbol") ?? "", q("range") ?? "12M"));
      case "curve": return json(req, await curve(q("country") ?? "US", q("ago")));
      case "curves": {
        const { data } = await db.rpc("fn_curve_latest");
        return json(req, { rows: ((data ?? []) as Array<{ country: string; d: string; n: number }>).map((r) => ({ country: r.country, label: CURVE_LABELS[r.country] ?? r.country, latest: r.d, tenors: r.n })) });
      }
      case "calendar": return json(req, await calendar());
      case "news": return json(req, await news(q("category"), Number(q("n") ?? 120)));
      case "notes": {
        const { data } = await db.from("notes").select("id,d,title,generated_at,kind").lte("d", new Date().toISOString().slice(0, 10)).order("d", { ascending: false }).limit(30);
        return json(req, { rows: (data ?? []).map((r) => ({ id: r.id, d: r.d, title: r.title, generatedAt: r.generated_at, kind: r.kind ?? "daily" })) });
      }
      case "note": {
        const want = q("d");
        const { data } = await (want ? db.from("notes").select("id,d,title,generated_at,model,sections,sources,pack,kind").eq("d", want) : db.from("notes").select("id,d,title,generated_at,model,sections,sources,pack,kind").lte("d", new Date().toISOString().slice(0, 10))).order("d", { ascending: false }).limit(1).maybeSingle();
        return json(req, { note: data ? { id: data.id, d: data.d, title: data.title, generatedAt: data.generated_at, model: data.model, sections: data.sections, sources: data.sources, pack: data.pack, kind: data.kind ?? "daily" } : null });
      }
      case "reports": {
        const { data } = await db.from("reports").select("id,kind,title,summary,published_at").order("published_at", { ascending: false }).limit(Math.min(200, Number(q("n") ?? 100)));
        return json(req, { rows: (data ?? []).map((r) => ({ id: r.id, kind: r.kind, title: r.title, summary: r.summary, publishedAt: r.published_at })) });
      }
      case "report": {
        const { data } = await db.from("reports").select("*").eq("id", Number(q("id"))).maybeSingle();
        if (!data) return json(req, { error: "not found" }, 404);
        return json(req, { report: { id: data.id, kind: data.kind, title: data.title, summary: data.summary, md: data.md, publishedAt: data.published_at } });
      }
      case "index_stats": return json(req, await indexStats(q("idx") ?? "SP500"));
      case "breadth_history": return json(req, await breadthHistory(q("idx") ?? "SP500", Math.min(1200, Number(q("days") ?? 400))));
      case "jp_shorts": return json(req, await jpShorts(q("idx") ?? "NK225"));
      case "asset": return json(req, await asset(q("symbol") ?? "", q("range") ?? "12M", q("lite") === "1"));
      case "search": return json(req, await search(q("q") ?? ""));
      case "alerts": {
        const { data } = await db.from("alerts").select("id,at,upd,d,symbol,name,kind,pct,price,market,msg").order("upd", { ascending: false }).limit(Math.min(50, Number(q("n") ?? 20)));
        return json(req, { rows: (data ?? []).map((a) => ({ id: a.id, at: a.upd, first: a.at, d: a.d, symbol: a.symbol, name: a.name, kind: a.kind, pct: a.pct, price: a.price, market: a.market, msg: a.msg })) });
      }
      case "policy_history": {
        const { data, error } = await db.rpc("fn_policy_steps");
        if (error) return json(req, { error: error.message }, 500);
        const { data: src } = await db.from("policy_history").select("bank,source").order("d", { ascending: false }).limit(2000);
        const sources: Record<string, string> = {};
        for (const r of (src ?? []) as Array<{ bank: string; source: string }>) if (!sources[r.bank]) sources[r.bank] = r.source;
        return json(req, { rows: data ?? [], sources });
      }
      case "policy": {
        const { data } = await db.from("policy_rates").select("bank,name,rate_label,rate,as_of,last_change,next_meeting,source_url,source_note,updated_at").order("bank");
        return json(req, { rows: (data ?? []).map((r) => ({ bank: r.bank, name: r.name, rateLabel: r.rate_label, rate: r.rate, asOf: r.as_of, lastChange: r.last_change, nextMeeting: r.next_meeting, sourceUrl: r.source_url, sourceNote: r.source_note, updatedAt: r.updated_at })) });
      }
      case "instruments": {
        const { data } = await db.from("instruments").select("*").eq("active", true).order("ord");
        return json(req, { rows: data ?? [] });
      }
      default: return json(req, { error: "unknown action" }, 400);
    }
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ---------- sign-in ----------
async function login(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const ip = clientIp(req);
  const windowStart = new Date(Date.now() - 10 * 60e3).toISOString();
  const { count } = await db.from("login_attempts").select("*", { count: "exact", head: true }).eq("ip", ip).eq("ok", false).gte("at", windowStart);
  if ((count ?? 0) >= 10) return json(req, { error: "Too many attempts; wait ten minutes" }, 429);
  const body = (await req.json().catch(() => ({}))) as { id?: string; password?: string; remember?: boolean };
  const id = String(body.id ?? "").trim();
  const pw = String(body.password ?? "");
  const shared = Deno.env.get("MONITOR_PASSWORD") ?? "";
  if (!/^[A-Za-z0-9_.-]{2,32}$/.test(id)) return json(req, { error: "ID: 2 to 32 letters, digits, . _ -" }, 400);
  if (!shared || !pw || !timingSafeEqual(shared, pw)) {
    await db.from("login_attempts").insert({ ip, ok: false });
    return json(req, { error: "Wrong password" }, 401);
  }
  const remember = body.remember === true;
  const ttl = remember ? 30 * 86400 : 12 * 3600;
  const token = await signToken(id, ttl);
  await db.from("login_attempts").insert({ ip, ok: true });
  const { data: u } = await db.from("users").select("logins").eq("id", id).maybeSingle();
  await db.from("users").upsert({ id, last_seen: new Date().toISOString(), logins: (u?.logins ?? 0) + 1, remember }, { onConflict: "id" });
  return json(req, { token, id, expiresIn: ttl });
}

// ---------- publishing (research desk) ----------
async function reportPut(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const secret = Deno.env.get("REPORT_SECRET") ?? "";
  const given = req.headers.get("x-report-secret") ?? "";
  if (!secret || !given || !timingSafeEqual(secret, given)) return json(req, { error: "forbidden" }, 403);
  const b = (await req.json().catch(() => ({}))) as { kind?: string; title?: string; summary?: string; md?: string; meta?: unknown; published_at?: string };
  if (!b.kind || !b.title || !b.md) return json(req, { error: "bad kind" }, 400);
  const { data, error } = await db.from("reports").insert({ kind: b.kind, title: b.title, summary: b.summary ?? null, md: b.md, meta: b.meta ?? null, published_at: b.published_at ?? new Date().toISOString() }).select("id").single();
  if (error) return json(req, { error: error.message }, 500);
  return json(req, { ok: true, id: data.id });
}

// ---------- health ----------
async function health() {
  const now = Date.now();
  const [{ data: tick }, { data: daily }, { data: sources }, { data: cal }, unverifiedRes] = await Promise.all([
    db.from("job_runs").select("at,ok,detail").eq("job", "tick").order("at", { ascending: false }).limit(1).maybeSingle(),
    db.from("job_runs").select("at,ok,detail,job").like("job", "daily:%").order("at", { ascending: false }).limit(1).maybeSingle(),
    db.from("source_status").select("*"),
    db.from("sessions_cal").select("market,d").gte("d", new Date(now - 2 * 86400e3).toISOString().slice(0, 10)),
    db.from("sessions_cal").select("market", { count: "exact", head: true }).eq("verified", false),
  ]);
  const unverifiedCount = unverifiedRes.count ?? 0;
  const tickAge = tick ? Math.round((now - Date.parse(tick.at)) / 60000) : null;
  const holidays: Record<string, string[]> = {};
  for (const r of (cal ?? []) as Array<{ market: string; d: string }>) (holidays[r.market] ??= []).push(r.d);
  const tickOk = !!tick && tick.ok && tickAge != null && tickAge <= 3;
  return {
    ok: true,
    at: new Date(now).toISOString(),
    tick: { lastAt: tick?.at ?? null, ageMin: tickAge, ok: tickOk, note: tick ? (tick.ok ? tick.detail : `last run failed: ${tick.detail}`) : "no tick yet" },
    daily: { lastAt: daily?.at ?? null, ok: !!daily && daily.ok, note: daily ? `${daily.job}: ${daily.detail}` : "no daily run yet" },
    sources: (sources ?? []).map((s) => ({ name: s.name, lastOk: s.last_ok, lastError: s.last_error })),
    holidays,
    holidaysVerified: unverifiedCount === 0,
  };
}

// ---------- series ----------
// Frequencies (Shota): 1D one-minute bars of the latest session, 1W / 1M hourly bars, 3M and longer daily closes.
let instCache: { at: number; set: Set<string> } | null = null;
async function isInstrument(symbol: string): Promise<boolean> {
  if (!instCache || Date.now() - instCache.at > 10 * 60e3) { const { data } = await db.from("instruments").select("symbol"); instCache = { at: Date.now(), set: new Set((data ?? []).map((r) => r.symbol as string)) }; }
  return instCache.set.has(symbol);
}
async function series(symbol: string, range: string) {
  if (!symbol) throw new Error("symbol required");
  if (!(await isInstrument(symbol))) return yahooSeries(symbol, range);
  return seriesDb(symbol, range);
}
async function seriesDb(symbol: string, range: string) {
  // Each range returns more history than it shows, so the page can pan back: 1D sends the three days kept in
  // bars_intraday (the page shows the latest session), 1W a month of hourly bars, 1M two months.
  if (range === "1D") {
    const since = new Date(Date.now() - 3 * 86400e3).toISOString();
    const rows = await selectAll<{ t: string; close: number }>(() => db.from("bars_intraday").select("t,close").eq("symbol", symbol).gte("t", since).order("t"));
    return { symbol, res: "1m", points: rows.map((r) => ({ t: Date.parse(r.t) / 1000, v: r.close })), asOf: rows.length ? rows[rows.length - 1].t : null };
  }
  if (range === "1W") {   // 15-minute bars (Shota: as dense as the 1D chart); hourly bars while the 15-minute table is still filling
    const since15 = new Date(Date.now() - 14 * 86400e3).toISOString();
    const q15 = await selectAll<{ t: string; close: number }>(() => db.from("bars_15m").select("t,close").eq("symbol", symbol).gte("t", since15).order("t"));
    if (q15.length > 20) return { symbol, res: "15m", points: q15.map((r) => ({ t: Date.parse(r.t) / 1000, v: r.close })), asOf: q15[q15.length - 1].t };
  }
  if (range === "1W" || range === "1M") {
    const since = new Date(Date.now() - (range === "1W" ? 31 : 62) * 86400e3).toISOString();
    const rows = await selectAll<{ t: string; close: number }>(() => db.from("bars_hourly").select("t,close").eq("symbol", symbol).gte("t", since).order("t"));
    return { symbol, res: "1h", points: rows.map((r) => ({ t: Date.parse(r.t) / 1000, v: r.close })), asOf: rows.length ? rows[rows.length - 1].t : null };
  }
  const days = RANGES[range] ?? RANGES["12M"];
  const from = new Date(Date.now() - (days * 2 + SIGMA_LOOKBACK_DAYS) * 86400e3).toISOString().slice(0, 10);   // one extra window of history to pan into
  const rows = await selectAll<{ d: string; close: number }>(() => db.from("prices_daily").select("d,close").eq("symbol", symbol).gte("d", from).order("d"));
  return { symbol, res: "1d", shownFrom: new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10), points: rows.map((r) => ({ t: Date.parse(r.d + "T00:00:00Z") / 1000, v: r.close })), asOf: rows.length ? rows[rows.length - 1].d : null };
}

// ---------- curve ----------
async function curve(country: string, ago: string | null) {
  const { data: latest } = await db.from("curves").select("d").eq("country", country).order("d", { ascending: false }).limit(1).maybeSingle();
  if (!latest) return { country, current: null, ghost: null };
  const pick = async (d: string) => {
    const { data } = await db.from("curves").select("tenor,years,yield,source,d").eq("country", country).eq("d", d).order("years");
    return data?.length ? { date: d, points: data.map((r) => ({ tenor: r.tenor, years: r.years, yield: r.yield })), source: data[0].source } : null;
  };
  const current = await pick(latest.d);
  let ghost = null;
  const back = ago ? RANGES[ago] : null;
  if (back) {
    const target = new Date(Date.parse(latest.d) - back * 86400e3).toISOString().slice(0, 10);
    const { data: gd } = await db.from("curves").select("d").eq("country", country).lte("d", target).order("d", { ascending: false }).limit(1).maybeSingle();
    if (gd) ghost = await pick(gd.d);
  }
  return { country, current, ghost };
}

// ---------- index statistics (EQUITIES pages) ----------
interface StatRow { symbol: string; name: string; sector: string | null; weight: number | null; d: string; close: number; prev: number | null; pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null; dma50: number | null; dma200: number | null; hi52: number | null; lo52: number | null; mcap: number | null; volume: number | null; adv3m: number | null; turnover: number | null; adv_turnover: number | null; quote_at: string | null; pct6m: number | null; pct36m: number | null; industry: string | null; mf_up: number | null; mf_down: number | null; mf_net: number | null; mf_d: string | null; mf_at: string | null }
async function indexStats(idx: string) {
  const rows = await selectAll<StatRow>(() => db.from("constituent_stats").select("symbol,name,sector,industry,weight,d,close,prev,pct1d,pct1w,pct1m,pct3m,pct6m,pct12m,pct36m,dma50,dma200,hi52,lo52,mcap,volume,adv3m,turnover,adv_turnover,quote_at,mf_up,mf_down,mf_net,mf_d,mf_at").eq("idx", idx).order("symbol"));
  if (!rows.length) return { idx, asOf: null, rows: [], breadth: null, sectors: [], movers: { top: [], bottom: [] }, shorts: null };
  const asOf = rows.map((r) => r.d).sort().pop() ?? null;
  const n = rows.length;
  const cnt = (f: (r: StatRow) => boolean) => rows.filter(f).length;
  const breadth = {
    n, adv: cnt((r) => (r.pct1d ?? 0) > 0), dec: cnt((r) => (r.pct1d ?? 0) < 0),
    above50: cnt((r) => r.dma50 != null && r.close > r.dma50), above200: cnt((r) => r.dma200 != null && r.close > r.dma200),
    newHi: cnt((r) => r.hi52 != null && r.close >= r.hi52 * 0.999), newLo: cnt((r) => r.lo52 != null && r.close <= r.lo52 * 1.001),
    over2: cnt((r) => (r.pct1d ?? 0) >= 2), under2: cnt((r) => (r.pct1d ?? 0) <= -2),
  };
  const bySector = new Map<string, StatRow[]>();
  for (const r of rows) { const k = r.sector ?? "Other"; bySector.set(k, [...(bySector.get(k) ?? []), r]); }
  // sector moves weighted by the published index weight where there is one (Nikkei 225, Nasdaq-100), otherwise by
  // market cap, so the sector figure matches what a cap-weighted sector index would show; equal weight only as a last resort
  const wavg = (xs: StatRow[], f: (r: StatRow) => number | null) => { let s = 0, w = 0; for (const r of xs) { const v = f(r); if (v == null) continue; const ww = r.weight ?? r.mcap ?? 1; s += v * ww; w += ww; } return w ? s / w : null; };
  const totalTurn = rows.reduce((a, r) => a + (r.turnover ?? 0), 0), totalMcap = rows.reduce((a, r) => a + (r.mcap ?? 0), 0);
  const sectors = [...bySector.entries()].map(([sector, xs]) => {
    const turnover = xs.reduce((a, r) => a + (r.turnover ?? 0), 0), advT = xs.reduce((a, r) => a + (r.adv_turnover ?? 0), 0), mcap = xs.reduce((a, r) => a + (r.mcap ?? 0), 0);
    return { sector, n: xs.length, weight: xs.some((r) => r.weight != null) ? xs.reduce((a, r) => a + (r.weight ?? 0), 0) : null, mcapShare: totalMcap ? (mcap / totalMcap) * 100 : null,
      pct1d: wavg(xs, (r) => r.pct1d), pct1w: wavg(xs, (r) => r.pct1w), pct1m: wavg(xs, (r) => r.pct1m), pct3m: wavg(xs, (r) => r.pct3m), pct12m: wavg(xs, (r) => r.pct12m), above200: xs.filter((r) => r.dma200 != null && r.close > r.dma200).length,
      turnover, turnoverShare: totalTurn ? (turnover / totalTurn) * 100 : null, flow: advT ? turnover / advT : null,   // flow = today's traded value vs the 3-month average
      mfUp: xs.reduce((a, r) => a + (r.mf_up ?? 0), 0), mfDown: xs.reduce((a, r) => a + (r.mf_down ?? 0), 0), mfNet: xs.some((r) => r.mf_net != null) ? xs.reduce((a, r) => a + (r.mf_net ?? 0), 0) : null };
  }).sort((a, b) => (b.pct1d ?? -1e9) - (a.pct1d ?? -1e9));
  const quoteAt = rows.map((r) => r.quote_at).filter(Boolean).sort().pop() ?? null;
  const mfAt = rows.map((r) => r.mf_at).filter(Boolean).sort().pop() ?? null, mfD = rows.map((r) => r.mf_d).filter(Boolean).sort().pop() ?? null;
  const sorted = [...rows].filter((r) => r.pct1d != null).sort((a, b) => b.pct1d! - a.pct1d!);
  // short-volume ratio (US indices): latest day per symbol
  let shorts: { d: string; avgRatio: number; top: Array<{ symbol: string; name: string; ratio: number }>; history: Array<{ d: string; v: number | null }> } | null = null;
  if (idx === "SP500" || idx === "NDX") {
    const { data: lastD } = await db.from("short_volume").select("d").order("d", { ascending: false }).limit(1).maybeSingle();
    if (lastD) {
      const sv = await selectAll<{ symbol: string; ratio: number }>(() => db.from("short_volume").select("symbol,ratio").eq("d", lastD.d));
      const byS = new Map(sv.map((x) => [x.symbol, x.ratio]));
      const inIdx = rows.filter((r) => byS.has(r.symbol)).map((r) => ({ symbol: r.symbol, name: r.name, ratio: byS.get(r.symbol)! }));
      const { data: hist } = await db.from("short_agg").select("d,value,n").eq("idx", idx).eq("metric", "finra_avg_ratio").gte("d", new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10)).order("d").limit(1000);
      if (inIdx.length) shorts = { d: lastD.d, avgRatio: inIdx.reduce((a, x) => a + x.ratio, 0) / inIdx.length, top: [...inIdx].sort((a, b) => b.ratio - a.ratio).slice(0, 15), history: (hist ?? []).map((h) => ({ d: h.d, v: h.value })) };
      for (const r of rows as Array<StatRow & { shortRatio?: number | null }>) r.shortRatio = byS.get(r.symbol) ?? null;
    }
  }
  // JPX short positions (Japan): latest reported position per holder within 60 days, summed per code
  if (idx === "NK225" || idx === "TOPIX") {
    const { data: jp } = await db.rpc("fn_jp_short_latest", { p_since: new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10) });
    const byCode = new Map(((jp ?? []) as Array<{ code: string; total_ratio: number; holders: number; latest: string }>).map((x) => [x.code, x]));
    for (const r of rows as Array<StatRow & { shortRatio?: number | null; shortHolders?: number | null }>) { const x = byCode.get(r.symbol.replace(/\.T$/, "")); r.shortRatio = x ? x.total_ratio : null; r.shortHolders = x ? x.holders : null; }
  }
  return { idx, asOf, quoteAt, mfAt, mfD, breadth, sectors, movers: { top: sorted.slice(0, 15), bottom: sorted.slice(-15).reverse() }, shorts, rows };
}
async function breadthHistory(idx: string, days: number) {
  const from = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const rows = await selectAll<{ d: string; n: number; adv: number; dec: number; above50: number; above200: number; new_hi: number; new_lo: number }>(() => db.from("breadth_history").select("d,n,adv,dec,above50,above200,new_hi,new_lo").eq("idx", idx).gte("d", from).order("d"));
  return { idx, rows };
}

// ---------- calendar & news ----------
async function calendar() {
  const from = new Date(Date.now() - 5 * 86400e3).toISOString(), to = new Date(Date.now() + 8 * 86400e3).toISOString();   // the week so far (for the record) and the week ahead
  const { data } = await db.from("econ_events").select("id,at,country,currency,title,impact,forecast,previous,actual,better,kind,source").gte("at", from).lte("at", to).order("at").limit(1500);
  return { rows: data ?? [] };
}
async function news(category: string | null, n: number) {
  let qb = db.from("news_items").select("id,published_at,source,title,url,category,tickers").order("published_at", { ascending: false }).limit(Math.min(300, Math.max(1, n || 120)));
  if (category) qb = qb.eq("category", category);
  const { data } = await qb;
  return { rows: (data ?? []).map((r) => ({ id: r.id, publishedAt: r.published_at, source: r.source, title: r.title, url: r.url, category: r.category, tickers: r.tickers })) };
}

// ---------- Japan short selling (JPX) ----------
async function jpShorts(idx: string) {
  const since = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10);   // twelve months of daily history (Shota)
  const [{ data: market }, { data: sectorsAll }, { data: margin }, { data: latest }] = await Promise.all([
    db.from("jp_short_ratio").select("d,actual,short_restricted,short_free,total").eq("scope", "market").gte("d", since).order("d").limit(1000),
    db.from("jp_short_ratio").select("d,name,actual,short_restricted,short_free,total").eq("scope", "sector").order("d", { ascending: false }).limit(40),
    db.from("jp_short_ratio").select("d,actual,short_restricted,short_free,total").eq("scope", "margin").order("d", { ascending: false }).limit(8),
    db.rpc("fn_jp_short_latest", { p_since: new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10) }),
  ]);
  const ratio = (r: { short_restricted: number | null; short_free: number | null; total: number | null }) => (r.total ? ((r.short_restricted ?? 0) + (r.short_free ?? 0)) / r.total * 100 : null);
  const mk = (market ?? []).map((r) => ({ d: r.d, ratio: ratio(r), restricted: r.total ? (r.short_restricted ?? 0) / r.total * 100 : null, total: r.total }));
  const secD = sectorsAll?.[0]?.d ?? null;
  const sectors = (sectorsAll ?? []).filter((r) => r.d === secD).map((r) => ({ sector: r.name, ratio: ratio(r), total: r.total })).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const cons = await selectAll<{ symbol: string; name: string; name_en: string | null; sector: string | null }>(() => db.from("constituents").select("symbol,name,name_en,sector").eq("idx", idx).order("symbol"));
  const inIdx = new Map(cons.map((c) => [c.symbol.replace(/\.T$/, ""), { ...c, name: c.name_en ?? c.name }]));
  const pos = ((latest ?? []) as Array<{ code: string; name: string; holders: number; total_ratio: number; latest: string }>).filter((x) => inIdx.has(x.code)).map((x) => ({ symbol: x.code + ".T", name: inIdx.get(x.code)!.name, sector: inIdx.get(x.code)!.sector, holders: x.holders, ratio: x.total_ratio, d: x.latest })).sort((a, b) => b.ratio - a.ratio);
  const mg = (margin ?? []).map((r) => ({ d: r.d, sellShares: r.actual, sellValue: r.short_restricted, buyShares: r.short_free, buyValue: r.total }));
  const { data: agg } = await db.from("short_agg").select("d,metric,value,n").eq("idx", idx).in("metric", ["jpx_positions_avg", "jpx_positions_names"]).gte("d", new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10)).order("d").limit(1000);
  const posHist = (agg ?? []).filter((a) => a.metric === "jpx_positions_avg").map((a) => ({ d: a.d, v: a.value }));
  const namesHist = (agg ?? []).filter((a) => a.metric === "jpx_positions_names").map((a) => ({ d: a.d, v: a.value }));
  return { idx, market: mk, sectorsAsOf: secD, sectors, positions: { asOf: pos.map((p) => p.d).sort().pop() ?? null, names: pos.length, covered: inIdx.size, top: pos.slice(0, 20), avgRatio: pos.length ? pos.reduce((a, p) => a + p.ratio, 0) / pos.length : null, history: posHist, namesHistory: namesHist }, margin: mg };
}

// ---------- single asset ----------
async function asset(symbol: string, range: string, lite: boolean) {
  if (!symbol) throw new Error("symbol required");
  const q = await quoteFor(symbol);
  const home = homeIndex(symbol);
  const { data: con } = await db.from("constituents").select("idx,sector,gics_industry,gics_source").eq("symbol", symbol).limit(5);
  const member = (con ?? []).find((c) => c.sector) ?? (con ?? [])[0] ?? null;
  const idxSeries = (await series(home.symbol, "12M")).points;
  const [rel, statements, ser] = await Promise.all([
    relativeLine(symbol, idxSeries).catch(() => []),
    q.quoteType === "EQUITY" ? statementsFor(symbol, q.currency) : Promise.resolve(null),
    lite ? Promise.resolve(null) : series(symbol, range),
  ]);
  // short data: FINRA short-volume share (US) or JPX positions (Japan)
  let short: Record<string, unknown> | null = null;
  if (/^[A-Z.-]+$/.test(symbol)) {
    const { data } = await db.from("short_volume").select("d,short_vol,total_vol,ratio").eq("symbol", symbol).order("d", { ascending: false }).limit(20);
    if (data?.length) short = { kind: "finra", d: data[0].d, ratio: data[0].ratio, shortVol: data[0].short_vol, totalVol: data[0].total_vol, history: data.map((r) => ({ d: r.d, ratio: r.ratio })).reverse() };
  } else if (/\.T$/.test(symbol)) {
    const code = symbol.replace(/\.T$/, "");
    const { data } = await db.from("jp_short_positions").select("d,holder,ratio,shares").eq("code", code).gte("d", new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10)).order("d", { ascending: false }).limit(200);
    if (data?.length) {
      const seen = new Map<string, { holder: string; ratio: number; d: string }>();
      for (const r of data) if (!seen.has(r.holder)) seen.set(r.holder, { holder: r.holder, ratio: r.ratio, d: r.d });
      const live = [...seen.values()].filter((x) => x.ratio >= 0.005).sort((a, b) => b.ratio - a.ratio);
      short = { kind: "jpx", d: data[0].d, ratio: live.reduce((a, x) => a + x.ratio, 0), holders: live };
    }
  }
  const pct = q.price != null && q.prevClose ? (q.price / q.prevClose - 1) * 100 : null;
  return { symbol, name: q.name ?? symbol, exchange: q.exchange, currency: q.currency, quoteType: q.quoteType, sector: member?.sector ?? null, industry: member?.gics_industry ?? null, sectorSource: member?.gics_source ?? null, indices: (con ?? []).map((c) => c.idx), price: q.price, prevClose: q.prevClose, pct, mcap: q.marketCap, volume: q.volume, adv3m: q.adv3m, adv10d: q.adv10d, asOf: q.time ? new Date(q.time * 1000).toISOString() : null, home, rel, statements, short, series: ser };
}

// ---------- search: table instruments, constituents, then Yahoo ----------
async function search(qs: string) {
  const term = qs.trim();
  if (term.length < 1) return { rows: [] };
  const like = "%" + term.replace(/[%_]/g, "") + "%";
  const [{ data: inst }, { data: cons }] = await Promise.all([
    db.from("instruments").select("symbol,name,cls").or("symbol.ilike." + like + ",name.ilike." + like).limit(8),
    db.from("constituents").select("symbol,name,name_en,sector,idx").or("symbol.ilike." + like + ",name.ilike." + like + ",name_en.ilike." + like).limit(12),
  ]);
  const rows: Array<{ symbol: string; name: string; kind: string; note: string }> = [];
  const seen = new Set<string>();
  for (const r of inst ?? []) if (!seen.has(r.symbol)) { seen.add(r.symbol); rows.push({ symbol: r.symbol, name: r.name, kind: String(r.cls), note: "Monitor instrument" }); }
  for (const r of cons ?? []) if (!seen.has(r.symbol)) { seen.add(r.symbol); rows.push({ symbol: r.symbol, name: r.name_en ?? r.name, kind: "Equity", note: r.idx + (r.sector ? " · " + r.sector : "") }); }
  try {
    const t = await fetchText("https://query2.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(term) + "&quotesCount=8&newsCount=0&listsCount=0", { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }, 15000);
    const j = JSON.parse(t) as { quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string; sector?: string }> };
    for (const r of j.quotes ?? []) if (r.symbol && !seen.has(r.symbol)) { seen.add(r.symbol); rows.push({ symbol: r.symbol, name: r.longname ?? r.shortname ?? r.symbol, kind: r.typeDisp ?? "", note: [r.exchDisp, r.sector].filter(Boolean).join(" · ") }); }
  } catch { /* Yahoo search is best effort */ }
  return { rows: rows.slice(0, 20) };
}
