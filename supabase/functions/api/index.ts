// api — everything the page reads, one function, `?action=`. Sign-in issues an HMAC token; every other action
// needs it as a bearer. The research desk publishes with POST report_put and the x-report-secret header.
import { db, selectAll } from "../_shared/db.ts";
import { bearer, signToken, verifyToken } from "../_shared/auth.ts";
import { clientIp, corsHeaders, json, timingSafeEqual } from "../_shared/http.ts";
import { computeTable } from "../_shared/table.ts";

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
      case "calendar": return json(req, await calendar());
      case "news": return json(req, await news(q("category"), Number(q("n") ?? 120)));
      case "note": {
        const { data } = await db.from("notes").select("id,d,title,generated_at,model,sections,sources").lte("d", new Date().toISOString().slice(0, 10)).order("d", { ascending: false }).limit(1).maybeSingle();
        return json(req, { note: data ? { id: data.id, d: data.d, title: data.title, generatedAt: data.generated_at, model: data.model, sections: data.sections, sources: data.sources } : null });
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
  const [{ data: tick }, { data: daily }, { data: sources }, { data: cal }, { data: unverified }] = await Promise.all([
    db.from("job_runs").select("at,ok,detail").eq("job", "tick").order("at", { ascending: false }).limit(1).maybeSingle(),
    db.from("job_runs").select("at,ok,detail,job").like("job", "daily:%").order("at", { ascending: false }).limit(1).maybeSingle(),
    db.from("source_status").select("*"),
    db.from("sessions_cal").select("market,d").gte("d", new Date(now - 2 * 86400e3).toISOString().slice(0, 10)),
    db.from("sessions_cal").select("market", { count: "exact", head: true }).eq("verified", false),
  ]);
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
    holidaysVerified: ((unverified as unknown as { count?: number } | null)?.count ?? 1) === 0,
  };
}

// ---------- series ----------
async function series(symbol: string, range: string) {
  if (!symbol) throw new Error("symbol required");
  if (range === "1D") {
    const since = new Date(Date.now() - 36 * 3600e3).toISOString();
    const rows = await selectAll<{ t: string; close: number }>(() => db.from("bars_intraday").select("t,close").eq("symbol", symbol).gte("t", since).order("t"));
    return { symbol, res: "5m", points: rows.map((r) => ({ t: Date.parse(r.t) / 1000, v: r.close })), asOf: rows.length ? rows[rows.length - 1].t : null };
  }
  const days = RANGES[range] ?? RANGES["12M"];
  const from = new Date(Date.now() - (days + SIGMA_LOOKBACK_DAYS) * 86400e3).toISOString().slice(0, 10);
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

// ---------- calendar & news ----------
async function calendar() {
  const from = new Date(Date.now() - 12 * 3600e3).toISOString(), to = new Date(Date.now() + 8 * 86400e3).toISOString();
  const { data } = await db.from("econ_events").select("id,at,country,title,impact,forecast,previous,actual").gte("at", from).lte("at", to).order("at").limit(400);
  return { rows: data ?? [] };
}
async function news(category: string | null, n: number) {
  let qb = db.from("news_items").select("id,published_at,source,title,url,category,tickers").order("published_at", { ascending: false }).limit(Math.min(300, Math.max(1, n || 120)));
  if (category) qb = qb.eq("category", category);
  const { data } = await qb;
  return { rows: (data ?? []).map((r) => ({ id: r.id, publishedAt: r.published_at, source: r.source, title: r.title, url: r.url, category: r.category, tickers: r.tickers })) };
}
