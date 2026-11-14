// daily — the batch jobs, selected with ?job=…  (pg_cron schedules in supabase/cron.sql):
//   history   daily closes for the last 3 months (spark, batched), skipping a session still in progress
//   curves    US Treasury par curve (country=US) or Japan MOF reference yields (country=JP); full=1 backfills
//   calendar  ForexFactory week feed(s) -> econ_events
//   news      RSS feeds -> news_items with rule-based categories
//   fred      Fed funds target (DFEDTARU) -> policy_rates
//   prune     old intraday bars, login attempts, job runs, news
import { chunk, db, logRun, selectAll, sourceErr, sourceOk, type InstrumentRow } from "../_shared/db.ts";
import { fetchJson, fetchText, isCron, json } from "../_shared/http.ts";
import { localDate, marketById, marketState, partsIn } from "../_shared/sessions.ts";
import { loadHolidays, saveTableSnapshot } from "../_shared/table.ts";
import { chart, profiles, quotes, spark, type Profile, type QuoteRow } from "../_shared/yahoo.ts";
import { fetchHsi, fetchKospi200, fetchNikkei225, fetchSp500, fetchSse180, fetchTopix, type IndexId } from "../_shared/constituents.ts";
import { fetchBoc, fetchBoe, fetchBundesbank, fetchEcb } from "../_shared/curves.ts";
import { computeIndexStats, computeMoneyFlow, loadShortVolume, refreshQuotes } from "../_shared/istats.ts";
import { loadMarginTotals, loadShortPositions, loadShortRatio } from "../_shared/jpx.ts";
import { fetchNasdaq100 } from "../_shared/constituents.ts";

Deno.serve(async (req) => {
  if (!isCron(req)) return json(req, { error: "forbidden" }, 403);
  const url = new URL(req.url);
  const job = url.searchParams.get("job") ?? "";
  const t0 = Date.now();
  try {
    let detail = "";
    switch (job) {
      case "history": detail = await history(); break;
      case "hourly": detail = await hourly(); break;
      case "q15": detail = await intradayBars("15m", url.searchParams.get("all") === "1"); break;
      case "bars1m": detail = await intradayBars("1m", true); break;
      case "constituents": detail = await constituents(req.url); break;
      case "sectors": detail = await sectorsJob(Number(url.searchParams.get("limit") ?? 400), url.searchParams.get("idx")); break;
      case "stats": { const idx = (url.searchParams.get("idx") ?? "SP500") as IndexId; detail = await computeIndexStats(idx); break; }
      case "mflow": { const idx = (url.searchParams.get("idx") ?? "SP500") as IndexId; detail = await computeMoneyFlow(idx); break; }
      case "jpx": { const part = url.searchParams.get("part") ?? "positions"; detail = part === "ratio" ? await loadShortRatio() : part === "margin" ? await loadMarginTotals() : await loadShortPositions(); break; }
      case "shorts": { const back = Number(url.searchParams.get("back") ?? ""); detail = await loadShortVolume(Number.isFinite(back) && back > 0 ? back : undefined); break; }
      case "flow": { const idx = (url.searchParams.get("idx") ?? "SP500") as IndexId; detail = await refreshQuotes(idx); break; }
      case "policy": detail = await policy(url.searchParams.get("full") === "1", url.searchParams.get("bank")); break;
      case "curves": detail = await curves(url.searchParams.get("country") ?? "US", url.searchParams.get("full") === "1"); break;
      case "calendar": detail = await calendar(); break;
      case "news": detail = await news(); break;
      case "fred": detail = await fred(); break;
      case "prune": detail = await prune(); break;
      default: return json(req, { error: "unknown job" }, 400);
    }
    await logRun(`daily:${job}`, true, detail, t0);
    return json(req, { ok: true, job, detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logRun(`daily:${job}`, false, msg, t0);
    return json(req, { ok: false, job, error: msg }, 500);
  }
});

// ---------- history ----------
async function history(): Promise<string> {
  const now = new Date();
  const holidays = await loadHolidays();
  const { data, error } = await db.from("instruments").select("*").eq("active", true).eq("provider", "yahoo");
  if (error) throw new Error(error.message);
  const inst = data as InstrumentRow[];
  let series: Awaited<ReturnType<typeof spark>>;
  try { series = await spark(inst.map((i) => i.symbol), "3mo", "1d"); await sourceOk("yahoo"); } catch (e) { await sourceErr("yahoo", e); throw e; }
  const rows: Array<Record<string, unknown>> = [];
  const missing: string[] = [];
  for (const i of inst) {
    const s = series[i.symbol];
    if (!s) { missing.push(i.symbol); continue; }
    const m = marketById(i.market);
    const today = partsIn(i.tz, now).ymd;
    const inSession = m ? ["OPEN", "BREAK"].includes(marketState(m, now, holidays)) : false;
    for (let k = 0; k < s.timestamp.length; k++) {
      const v = s.close[k];
      if (v == null || !Number.isFinite(v)) continue;
      const d = localDate(i.tz, s.timestamp[k]);
      if (d > today) continue;
      if (d === today && inSession) continue;              // never book a session still trading
      rows.push({ symbol: i.symbol, d, close: v, source: "yahoo", updated_at: now.toISOString() });
    }
  }
  const uniq = [...new Map(rows.map((r) => [`${r.symbol}|${r.d}`, r])).values()];   // two bars can land on one exchange-local date (DST edges, Sydney): keep the last
  for (const part of chunk(uniq, 1000)) {
    const { error: ue } = await db.from("prices_daily").upsert(part, { onConflict: "symbol,d" });
    if (ue) throw new Error("prices_daily: " + ue.message);
  }
  const n = await saveTableSnapshot(now);
  return `${rows.length} closes for ${inst.length - missing.length} instruments${missing.length ? `, missing: ${missing.join(" ")}` : ""}; table ${n} rows`;
}

// ---------- constituents (alert scan, breadth, movers) ----------
async function constituents(reqUrl: string): Promise<string> {
  const parts: string[] = [];
  const { data: spRows } = await db.from("constituents").select("symbol,gics_sector").eq("idx", "SP500");
  const spSector = new Map((spRows ?? []).map((r) => [r.symbol, r.gics_sector as string | null]));
  const ndx = () => fetchNasdaq100(() => null);
  const only = new URL(reqUrl).searchParams.get("idx");
  const all = [["SP500", fetchSp500], ["NK225", fetchNikkei225], ["NDX", ndx], ["TOPIX", fetchTopix], ["KOSPI200", fetchKospi200], ["HSI", fetchHsi], ["SSE180", fetchSse180]] as const;
  for (const [name, fn] of all.filter(([n]) => !only || n === only)) {
    try {
      const rows = [...new Map((await fn()).map((r) => [r.symbol, r])).values()];   // one row per symbol (lists can repeat a code)
      // the source scheme goes to sector_local; `sector` is written only where it is official GICS (S&P 500, and
      // Nasdaq-100 names the S&P 500 covers) so the Yahoo-derived GICS sector of the other names survives the refresh
      const payload = rows.map((r) => {
        const official = name === "SP500" ? r.sector : name === "NDX" ? spSector.get(r.symbol) ?? null : null;
        return { idx: r.idx, symbol: r.symbol, name: r.name, weight: r.weight, as_of: r.as_of, sector_local: r.sector, ...(official ? { sector: official, gics_sector: official, gics_source: "GICS (S&P 500 list)" } : {}) };
      });
      for (const part of chunk(payload, 500)) { const { error } = await db.from("constituents").upsert(part, { onConflict: "idx,symbol" }); if (error) throw new Error(error.message); }
      // drop names that left the index
      const keep = rows.map((r) => r.symbol);
      const existing = await selectAll<{ symbol: string }>(() => db.from("constituents").select("symbol").eq("idx", name).order("symbol"));
      const keepSet = new Set(keep);
      const gone = existing.map((e) => e.symbol).filter((s) => !keepSet.has(s));
      if (gone.length) await db.from("constituents").delete().eq("idx", name).in("symbol", gone);
      parts.push(`${name} ${rows.length} (as of ${rows[0]?.as_of}${gone.length ? `, ${gone.length} removed` : ""})`);
      await sourceOk(`constituents:${name}`);
    } catch (e) { parts.push(`${name} ERR ${e instanceof Error ? e.message : e}`); await sourceErr(`constituents:${name}`, e); }
  }
  return parts.join("; ");
}

// ---------- GICS sectors and English names (Yahoo) for constituents that lack them ----------
/** Yahoo's (Morningstar) sectors mapped to the 11 GICS sector names. */
const GICS_MAP: Record<string, string> = {
  "Technology": "Information Technology", "Financial Services": "Financials", "Healthcare": "Health Care", "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples", "Basic Materials": "Materials", "Industrials": "Industrials", "Energy": "Energy", "Utilities": "Utilities",
  "Real Estate": "Real Estate", "Communication Services": "Communication Services",
};
async function sectorsJob(limit: number, only: string | null): Promise<string> {
  let q = db.from("constituents").select("idx,symbol,name,gics_sector,name_en").or("gics_sector.is.null,name_en.is.null").order("idx").order("symbol").limit(Math.min(800, Math.max(1, limit)));
  if (only) q = q.eq("idx", only);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ idx: string; symbol: string; name: string; gics_sector: string | null; name_en: string | null }>;
  if (!rows.length) return "all constituents have a sector and an English name";
  const needSector = [...new Set(rows.filter((r) => r.gics_sector == null).map((r) => r.symbol))];
  const needName = [...new Set(rows.filter((r) => r.name_en == null).map((r) => r.symbol))];
  const empty = <T,>(): Record<string, T> => ({});
  const [prof, qs]: [Record<string, Profile>, Record<string, QuoteRow>] = await Promise.all([needSector.length ? profiles(needSector) : Promise.resolve(empty<Profile>()), needName.length ? quotes(needName).catch(() => empty<QuoteRow>()) : Promise.resolve(empty<QuoteRow>())]);
  let sectored = 0, named = 0, i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (;;) {
      const r = rows[i++]; if (!r) return;
      const upd: Record<string, unknown> = {};
      if (r.gics_sector == null && prof[r.symbol]) {
        const pr = prof[r.symbol]; const gs = pr.sector ? (GICS_MAP[pr.sector] ?? pr.sector) : null;
        Object.assign(upd, { gics_sector: gs ?? "", gics_industry: pr.industry, gics_source: gs ? "Yahoo classification mapped to GICS sector names" : "not classified" });
        if (r.idx !== "SP500") upd.sector = gs;   // no Yahoo sector: null (shown as Other) rather than the exchange scheme, so groupings stay on GICS names
        sectored++;
      }
      if (r.name_en == null && qs[r.symbol]?.name) { upd.name_en = qs[r.symbol].name; named++; }
      if (!Object.keys(upd).length) continue;
      const { error: ue } = await db.from("constituents").update(upd).match({ idx: r.idx, symbol: r.symbol });
      if (ue) throw new Error("constituents: " + ue.message);
    }
  }));
  const { data: n } = await db.rpc("fn_sync_sectors");
  return `${rows.length} rows checked: ${sectored} sectors, ${named} names set; ${n ?? 0} statistics rows synced`;
}

// ---------- 15-minute bars (1W charts) and the minute-bar backfill (1D charts after a weekend) ----------
/** Fetches Yahoo bars for the instruments whose market is open or closed within the last 45 minutes (all of
 *  them with `all`), and upserts them: 15-minute bars into bars_15m (last ten days), one-minute bars into
 *  bars_intraday (last three days, the same table the tick writes every minute). */
async function intradayBars(res: "15m" | "1m", all: boolean): Promise<string> {
  const now = new Date();
  const holidays = await loadHolidays();
  const { data, error } = await db.from("instruments").select("*").eq("active", true).eq("provider", "yahoo");
  if (error) throw new Error(error.message);
  const inst = (data as InstrumentRow[]).filter((i) => {
    if (all) return true;
    const m = marketById(i.market); if (!m) return false;
    const st = marketState(m, now, holidays);
    return st === "OPEN" || st === "BREAK" || recentlyClosedMin(m, now, 45, holidays);
  });
  if (!inst.length) return "idle: no market open";
  const table = res === "15m" ? "bars_15m" : "bars_intraday";
  const cutoff = now.getTime() / 1000 - (res === "15m" ? 10 : 3) * 86400;
  const rows: Array<Record<string, unknown>> = [];
  const failed: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (;;) {
      const k = i++; if (k >= inst.length) return;
      const ins = inst[k];
      try {
        const c = await chart(ins.symbol, res === "15m" ? "1mo" : "5d", res);
        for (let j = 0; j < c.timestamp.length; j++) { const v = c.close[j]; if (v != null && Number.isFinite(v) && c.timestamp[j] >= cutoff) rows.push({ symbol: ins.symbol, t: new Date(c.timestamp[j] * 1000).toISOString(), close: v }); }
      } catch { failed.push(ins.symbol); }
    }
  }));
  for (const part of chunk(rows, 1000)) { const { error: ue } = await db.from(table).upsert(part, { onConflict: "symbol,t" }); if (ue) throw new Error(table + ": " + ue.message); }
  if (failed.length < inst.length) await sourceOk("yahoo"); else await sourceErr("yahoo", res + ": every chart call failed");
  return `${rows.length} ${res} bars for ${inst.length - failed.length} instruments${failed.length ? `, failed: ${failed.join(" ")}` : ""}`;
}
/** True when the market's regular session ended within the last `min` minutes (same rule as the tick). */
function recentlyClosedMin(m: ReturnType<typeof marketById>, now: Date, min: number, holidays: Awaited<ReturnType<typeof loadHolidays>>): boolean {
  if (!m) return false;
  for (let k = 1; k <= min; k++) if (marketState(m, new Date(now.getTime() - k * 60e3), holidays) === "OPEN") return true;
  return false;
}

// ---------- hourly bars (1W and 1M charts) ----------
async function hourly(): Promise<string> {
  const now = new Date();
  const { data, error } = await db.from("instruments").select("*").eq("active", true).eq("provider", "yahoo");
  if (error) throw new Error(error.message);
  const inst = data as InstrumentRow[];
  const rows: Array<Record<string, unknown>> = [];
  const failed: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (;;) {
      const k = i++; if (k >= inst.length) return;
      const ins = inst[k];
      try {
        const c = await chart(ins.symbol, "3mo", "1h");   // two months shown at most (1M window plus one to pan into); three fetched for safety
        for (let j = 0; j < c.timestamp.length; j++) { const v = c.close[j]; if (v != null && Number.isFinite(v)) rows.push({ symbol: ins.symbol, t: new Date(c.timestamp[j] * 1000).toISOString(), close: v }); }
      } catch { failed.push(ins.symbol); }
    }
  }));
  for (const part of chunk(rows, 1000)) { const { error: ue } = await db.from("bars_hourly").upsert(part, { onConflict: "symbol,t" }); if (ue) throw new Error("bars_hourly: " + ue.message); }
  if (failed.length < inst.length) await sourceOk("yahoo"); else await sourceErr("yahoo", "hourly: every chart call failed");
  return `${rows.length} hourly bars for ${inst.length - failed.length} instruments${failed.length ? `, failed: ${failed.join(" ")}` : ""} (${Math.round((Date.now() - now.getTime()) / 1000)} s)`;
}

// ---------- curves ----------
const US_TENORS: Array<[string, number]> = [["1 Mo", 1 / 12], ["1.5 Month", 1.5 / 12], ["2 Mo", 2 / 12], ["3 Mo", 0.25], ["4 Mo", 4 / 12], ["6 Mo", 0.5], ["1 Yr", 1], ["2 Yr", 2], ["3 Yr", 3], ["5 Yr", 5], ["7 Yr", 7], ["10 Yr", 10], ["20 Yr", 20], ["30 Yr", 30]];
const treasuryUrl = (year: number) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
const MOF_CURRENT = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
const MOF_ALL = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv";

function splitCsv(line: string): string[] { return line.split(",").map((x) => x.trim().replace(/^"|"$/g, "")); }

async function curves(country: string, full: boolean): Promise<string> {
  const now = new Date().toISOString();
  const curveRows: Array<Record<string, unknown>> = [], priceRows: Array<Record<string, unknown>> = [];
  if (country === "US") {
    const years = full ? Array.from({ length: new Date().getUTCFullYear() - 2015 }, (_, k) => 2016 + k) : [new Date().getUTCFullYear()];
    for (const y of years) {
      let text: string;
      try { text = await fetchText(treasuryUrl(y), {}, 60000); await sourceOk("treasury"); } catch (e) { await sourceErr("treasury", e); throw e; }
      const lines = text.split(/\r?\n/).filter(Boolean);
      const head = splitCsv(lines[0]);
      const idx = new Map(head.map((h, k) => [h, k]));
      for (const line of lines.slice(1)) {
        const c = splitCsv(line);
        const md = c[idx.get("Date") ?? 0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!md) continue;
        const d = `${md[3]}-${md[1]}-${md[2]}`;
        for (const [tenor, yrs] of US_TENORS) {
          const k = idx.get(tenor); if (k == null) continue;
          const v = Number(c[k]); if (!Number.isFinite(v) || c[k] === "") continue;
          curveRows.push({ country: "US", d, tenor, years: yrs, yield: v, source: "treasury.gov daily par yield curve" });
          if (tenor === "2 Yr") priceRows.push({ symbol: "UST2Y", d, close: v, source: "treasury", updated_at: now });
        }
      }
    }
  } else if (country === "JP") {
    let text: string;
    try { text = await fetchText(full ? MOF_ALL : MOF_CURRENT, {}, 90000); await sourceOk("mof"); } catch (e) { await sourceErr("mof", e); throw e; }
    const lines = text.split(/\r?\n/);
    const hi = lines.findIndex((l) => /^Date,/i.test(l));
    if (hi < 0) throw new Error("MOF csv: header not found");
    const head = splitCsv(lines[hi]);
    for (const line of lines.slice(hi + 1)) {
      const c = splitCsv(line);
      const md = c[0]?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (!md) continue;
      const d = `${md[1]}-${md[2].padStart(2, "0")}-${md[3].padStart(2, "0")}`;
      for (let k = 1; k < head.length; k++) {
        const tenor = head[k]; const yrs = Number(tenor.replace(/Y$/i, ""));
        const v = Number(c[k]); if (!tenor || !Number.isFinite(yrs) || c[k] === "" || c[k] === "-" || !Number.isFinite(v)) continue;
        curveRows.push({ country: "JP", d, tenor, years: yrs, yield: v, source: "MOF Japan reference yields (jgbcme)" });
        if (tenor === "10Y") priceRows.push({ symbol: "JGB10Y", d, close: v, source: "mof", updated_at: now });
      }
    }
  } else if (country === "DE" || country === "EA" || country === "EB" || country === "GB" || country === "CA") {
    const srcName = { DE: "bundesbank", EA: "ecb", EB: "ecb", GB: "boe", CA: "boc" }[country];
    try {
      const rows = country === "DE" ? await fetchBundesbank(full) : country === "EA" || country === "EB" ? await fetchEcb(country, full) : country === "GB" ? await fetchBoe() : await fetchBoc(full);
      for (const r of rows) curveRows.push({ ...r });   // a loop: the full Bundesbank history is ~200,000 rows, too many to spread
      await sourceOk(srcName);
    } catch (e) { await sourceErr(srcName, e); throw e; }
  } else throw new Error("country must be one of US JP DE EA EB GB CA");
  for (const part of chunk(curveRows, 1000)) { const { error } = await db.from("curves").upsert(part, { onConflict: "country,d,tenor" }); if (error) throw new Error("curves: " + error.message); }
  // instruments whose daily series is a point on this curve (provider 'curve', provider_symbol 'CC:years')
  const { data: yi } = await db.from("instruments").select("symbol,provider_symbol").eq("provider", "curve").eq("active", true);
  const want = new Map(((yi ?? []) as Array<{ symbol: string; provider_symbol: string | null }>).filter((x) => x.provider_symbol?.startsWith(country + ":")).map((x) => [Number(x.provider_symbol!.split(":")[1]), x.symbol]));
  if (want.size) for (const r of curveRows as Array<{ d: string; years: number; yield: number; source: string }>) { const sym = want.get(r.years); if (sym) priceRows.push({ symbol: sym, d: r.d, close: r.yield, source: r.source, updated_at: now }); }
  for (const part of chunk(priceRows, 1000)) { const { error } = await db.from("prices_daily").upsert(part, { onConflict: "symbol,d" }); if (error) throw new Error("prices_daily: " + error.message); }
  const n = await saveTableSnapshot();
  return `${country}: ${curveRows.length} curve points, ${priceRows.length} daily yields; table ${n} rows`;
}

// ---------- calendar ----------
interface FfEvent { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string }
async function sha1(s: string): Promise<string> { const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
interface FxEvent { id: string; dateUtc: string; name: string; countryCode: string; currencyCode?: string; volatility?: string; consensus?: number | string | null; previous?: number | string | null; actual?: number | string | null; revised?: number | string | null; unit?: string | null; isBetterThanExpected?: boolean | null; isSpeech?: boolean; isReport?: boolean; isAllDay?: boolean }
const FX_IMPACT: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low", NONE: "Low" };
const fxNum = (v: number | string | null | undefined, unit: string | null | undefined): string | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  const abs = Math.abs(n), txt = abs >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(Math.round(n * 1000) / 1000);
  const u = unit ?? "";
  return u === "%" ? txt + "%" : u === "$" || u === "€" || u === "£" || u === "¥" ? u + txt : u && u !== "null" ? txt + " " + u : txt;
};
/** FXStreet's calendar API: every country, consensus / previous / actual, "better than expected" flag. */
async function calendarFx(): Promise<string> {
  const from = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10) + "T00:00:00Z", to = new Date(Date.now() + 15 * 86400e3).toISOString().slice(0, 10) + "T00:00:00Z";
  const text = await fetchText(`https://calendar-api.fxstreet.com/en/api/v1/eventDates/${from}/${to}`, { headers: { accept: "application/json", referer: "https://www.fxstreet.com/", origin: "https://www.fxstreet.com" } }, 40000);
  const ev = JSON.parse(text) as FxEvent[];
  if (!Array.isArray(ev) || ev.length < 50) throw new Error(`FXStreet: ${Array.isArray(ev) ? ev.length : "no"} events`);
  const rows: Array<Record<string, unknown>> = [];
  for (const e of ev) {
    const at = new Date(e.dateUtc); if (Number.isNaN(at.getTime()) || !e.name) continue;
    rows.push({
      ext_key: "fx:" + e.id, at: at.toISOString(), country: e.countryCode === "EMU" ? "EUR" : e.countryCode, currency: e.currencyCode ?? null, title: e.name,
      impact: FX_IMPACT[e.volatility ?? "LOW"] ?? "Low", forecast: fxNum(e.consensus, e.unit), previous: fxNum(e.revised ?? e.previous, e.unit), actual: fxNum(e.actual, e.unit),
      better: e.isBetterThanExpected ?? null, kind: e.isSpeech ? "speech" : e.isReport ? "report" : e.isAllDay ? "allday" : "release", source: "fxstreet", updated_at: new Date().toISOString(),
    });
  }
  for (const part of chunk(rows, 500)) { const { error } = await db.from("econ_events").upsert(part, { onConflict: "ext_key" }); if (error) throw new Error("econ_events: " + error.message); }
  // the ForexFactory rows of the same window are superseded
  await db.from("econ_events").delete().eq("source", "forexfactory").gte("at", from).lte("at", to);
  await sourceOk("fxstreet");
  return `${rows.length} events (FXStreet, ${from.slice(0, 10)} to ${to.slice(0, 10)})`;
}
async function calendar(): Promise<string> {
  try { return await calendarFx(); } catch (e) { await sourceErr("fxstreet", e); }
  return calendarFf();
}
async function calendarFf(): Promise<string> {
  const rows: Array<Record<string, unknown>> = [];
  let got = 0, failed = 0;
  for (const week of ["thisweek", "nextweek"]) {
    try {
      const ev = await fetchJson<FfEvent[]>(`https://nfs.faireconomy.media/ff_calendar_${week}.json`);
      if (!Array.isArray(ev)) throw new Error("not an array");
      for (const e of ev) {
        const at = new Date(e.date); if (Number.isNaN(at.getTime())) continue;
        const impact = ["High", "Medium", "Low", "Holiday"].includes(e.impact) ? e.impact : "Low";
        rows.push({ ext_key: await sha1(`${e.title}|${e.country}|${e.date}`), at: at.toISOString(), country: e.country, title: e.title, impact, forecast: e.forecast || null, previous: e.previous || null, source: "forexfactory", updated_at: new Date().toISOString() });
      }
      got++;
    } catch (e) { failed++; if (week === "thisweek") { await sourceErr("forexfactory", e); throw e; } }
  }
  for (const part of chunk(rows, 500)) { const { error } = await db.from("econ_events").upsert(part, { onConflict: "ext_key" }); if (error) throw new Error("econ_events: " + error.message); }
  await sourceOk("forexfactory");
  return `${rows.length} events from ${got} week file(s)${failed ? `, ${failed} unavailable` : ""}`;
}

// ---------- news ----------
// Publishers only, tier one (Shota): Reuters and Bloomberg offer no public feed; aggregators and searches are out.
const FEEDS: Array<{ source: string; url: string; lang?: string; cat?: string }> = [
  { source: "WSJ Markets", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain" },
  { source: "FT Markets", url: "https://www.ft.com/markets?format=rss" },
  { source: "Nikkei Asia", url: "https://asia.nikkei.com/rss/feed/nar" },          // RSS 1.0 without dates: first-seen time is used
  { source: "CNBC Markets", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { source: "CNBC World", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  { source: "CNBC Asia", url: "https://www.cnbc.com/id/19832390/device/rss/rss.html", cat: "Asia Equities" },
  { source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { source: "Japan Times", url: "https://www.japantimes.co.jp/feed/", cat: "JP Equities" },
];
const RULES: Array<[string, RegExp]> = [
  ["JP Equities", /\b(nikkei|topix|tokyo stocks?|japan(ese)? (stocks?|shares|equit)|toyota|sony|softbank|hitachi|keyence|fast retailing|jpx)\b/i],
  ["Asia Equities", /\b(hang seng|kospi|shanghai|csi 300|shenzhen|taiex|tsmc|samsung|nifty|sensex|asian? (stocks?|shares|equit)|hong kong stocks?|china stocks?|korea stocks?)\b/i],
  ["US Equities", /\b(s&p ?500|nasdaq|dow jones|dow\b|wall street|us stocks?|u\.s\. stocks?|nvidia|apple|microsoft|tesla|amazon|alphabet|meta platforms|earnings|russell 2000|semiconductor)/i],
  ["DM Rates", /\b(treasur(y|ies)|fed\b|federal reserve|fomc|boj|bank of japan|jgb|ecb|bank of england|gilts?|bund|yields?|rate (cut|hike|decision)|powell|ueda|lagarde)\b/i],
  ["EM Rates", /\b(pboc|people'?s bank of china|loan prime rate|bank of korea|reserve bank of india|rbi\b|bank indonesia|banxico|central bank of (brazil|turkey|russia))\b/i],
  ["Currency", /\b(dollar|yen|euro\b|sterling|pound|yuan|renminbi|won\b|forex|fx\b|currenc(y|ies)|usd\/?jpy|eur\/?usd|exchange rate)\b/i],
  ["Commodities", /\b(oil|crude|brent|wti|opec|gold|silver|copper|natural gas|lng|commodit(y|ies)|iron ore|wheat)\b/i],
  ["Macro", /\b(inflation|cpi|ppi|gdp|payrolls|jobs report|unemployment|pmi|ism\b|tariffs?|trade (war|deal)|recession|consumer (confidence|sentiment)|retail sales|housing starts)\b/i],
];
function categorise(title: string, fallback = "Macro"): string { for (const [cat, re] of RULES) if (re.test(title)) return cat; return fallback; }
const unesc = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/<[^>]+>/g, "").trim();
function parseRss(xml: string): Array<{ title: string; link: string; pubDate: string; src?: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; src?: string }> = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const title = unesc(it.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = unesc(it.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? "");
    const pubDate = unesc(it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? it.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1] ?? "");
    if (title && /^https?:\/\//.test(link)) items.push({ title, link, pubDate, src: unesc(it.match(/<News:Source[^>]*>([\s\S]*?)<\/News:Source>/i)?.[1] ?? "").trim() || undefined });
  }
  return items;
}
async function news(): Promise<string> {
  const rows: Array<Record<string, unknown>> = [];
  const since = Date.now() - 7 * 86400e3;
  const report: string[] = [];
  for (const f of FEEDS) {
    try {
      const xml = await fetchText(f.url, { headers: { accept: "application/rss+xml, application/xml, text/xml, */*" } }, 25000);
      const items = parseRss(xml);
      let n = 0;
      for (const it of items) {
        const t = it.pubDate ? Date.parse(it.pubDate) : Date.now();   // feeds without dates (RSS 1.0) are stamped when first seen
        if (!Number.isFinite(t) || t < since) continue;
        const gm = f.source === "Bing News" && !it.src ? it.title.match(/^(.*)\s+-\s+([^-]{2,40})$/) : null;
        if (gm) it.title = gm[1].trim();
        rows.push({ url: it.link.slice(0, 1000), published_at: new Date(t).toISOString(), source: f.source === "Bing News" ? (it.src ?? gm?.[2]?.trim() ?? f.source) : f.source, title: it.title.slice(0, 400), category: categorise(it.title, f.cat ?? "Macro"), tagged_by: f.cat ? "rules+feed" : "rules" });
        n++;
      }
      report.push(`${f.source} ${n}`);
      await sourceOk(`rss:${f.source}`);
    } catch (e) { report.push(`${f.source} ERR`); await sourceErr(`rss:${f.source}`, e); }
  }
  const seen = new Set<string>();
  const uniq = rows.filter((r) => { const u = r.url as string; if (seen.has(u)) return false; seen.add(u); return true; });
  for (const part of chunk(uniq, 500)) { const { error } = await db.from("news_items").upsert(part, { onConflict: "url", ignoreDuplicates: true }); if (error) throw new Error("news_items: " + error.message); }
  return `${uniq.length} items (${report.join(", ")})`;
}

// ---------- fred ----------
async function fred(): Promise<string> {
  let text: string;
  try { text = await fetchText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU", {}, 60000); await sourceOk("fred"); } catch (e) { await sourceErr("fred", e); throw e; }
  const obs = text.split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => c.length >= 2 && c[1] !== "." && c[1] !== "").map((c) => ({ d: c[0], v: Number(c[1]) })).filter((o) => Number.isFinite(o.v));
  if (!obs.length) throw new Error("DFEDTARU: no observations");
  const last = obs[obs.length - 1];
  let lastChange = last.d;
  for (let k = obs.length - 2; k >= 0; k--) { if (obs[k].v !== last.v) break; lastChange = obs[k].d; }
  const { error } = await db.from("policy_rates").update({ rate: last.v, as_of: last.d, last_change: lastChange, updated_at: new Date().toISOString(), source_note: "FRED DFEDTARU (upper bound of the target range)" }).eq("bank", "FED");
  if (error) throw new Error(error.message);
  return `FED ${last.v}% as of ${last.d} (since ${lastChange})`;
}

// ---------- policy rates from official feeds (Fed comes from the fed-target GitHub job, jobs/fed.ts) ----------
async function policy(full: boolean, only: string | null = null): Promise<string> {   // bank=… runs one bank (full loads are heavy)
  const parts: string[] = [];
  const want = (b: string) => !only || only === b;
  const set = async (bank: string, rate: number, asOf: string, lastChange: string | null, note: string) => {
    const { error } = await db.from("policy_rates").update({ rate, as_of: asOf, last_change: lastChange, source_note: note, updated_at: new Date().toISOString() }).eq("bank", bank);
    if (error) throw new Error(error.message);
  };
  // history rows (collapsed to change points so the table stays small)
  const history = async (bank: string, obs: Array<{ d: string; v: number }>, source: string) => {
    const rows: Array<Record<string, unknown>> = [];
    let prev: number | null = null;
    for (const o of obs) { if (prev === null || o.v !== prev) rows.push({ bank, d: o.d, rate: o.v, source }); prev = o.v; }
    if (obs.length) { const last = obs[obs.length - 1]; if (!rows.length || rows[rows.length - 1].d !== last.d) rows.push({ bank, d: last.d, rate: last.v, source }); }
    for (const part of chunk(rows, 1000)) { const { error } = await db.from("policy_history").upsert(part, { onConflict: "bank,d" }); if (error) throw new Error("policy_history: " + error.message); }
    return rows.length;
  };
  const lastChangeOf = (obs: Array<{ d: string; v: number }>) => { const last = obs[obs.length - 1]; let lc = last.d; for (let k = obs.length - 2; k >= 0; k--) { if (obs[k].v !== last.v) break; lc = obs[k].d; } return lc; };
  // ECB deposit facility rate: the series only has rows on change dates
  if (want("ECB")) try {
    const t = await fetchText(`https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?format=csvdata${full ? "" : "&lastNObservations=3"}`, { headers: { accept: "text/csv" } }, 60000);
    const lines = t.split(/\r?\n/).filter(Boolean); const head = lines[0].split(","); const iT = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
    const obs = lines.slice(1).map((l) => l.split(",")).map((c) => ({ d: c[iT], v: Number(c[iV]) })).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.d) && Number.isFinite(o.v)).sort((a, b) => a.d.localeCompare(b.d));
    const last = obs[obs.length - 1];
    if (!last) throw new Error("no observations");
    const src = "ECB Data Portal FM.B.U2.EUR.4F.KR.DFR.LEV (deposit facility rate)";
    await set("ECB", last.v, last.d, last.d, src + " (rows on change dates)");
    const n = await history("ECB", obs, src);
    parts.push(`ECB ${last.v} (${n} hist)`); await sourceOk("ecb");
  } catch (e) { parts.push(`ECB ERR ${e instanceof Error ? e.message : e}`); await sourceErr("ecb", e); }
  // Bank of England Bank Rate: daily series IUDBEDR (from 1975)
  if (want("BOE")) try {
    const t = await fetchText(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${full ? "01/Jan/1975" : "01/Jan/2024"}&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`, {}, 90000);
    const obs = t.split(/\r?\n/).map((l) => l.split(",")).filter((c) => c.length >= 2 && /^\d{2} \w{3} \d{4}$/.test(c[0]) && Number.isFinite(Number(c[1]))).map((c) => ({ d: new Date(c[0] + " UTC").toISOString().slice(0, 10), v: Number(c[1]) }));
    const last = obs[obs.length - 1];
    if (!last) throw new Error("no observations");
    const src = "Bank of England IADB series IUDBEDR (Bank Rate)";
    await set("BOE", last.v, last.d, lastChangeOf(obs), src);
    const n = await history("BOE", obs, src);
    parts.push(`BOE ${last.v} (${n} hist)`); await sourceOk("boe");
  } catch (e) { parts.push(`BOE ERR ${e instanceof Error ? e.message : e}`); await sourceErr("boe", e); }
  // HKMA base rate today: daily monetary statistics API (history comes from the BIS below)
  if (want("HKMA")) try {
    const j = await fetchJson<{ result: { records: Array<{ end_of_date: string; disc_win_base_rate: number }> } }>("https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity?pagesize=60&sortby=end_of_date&sortorder=desc", 60000);
    const obs = (j.result?.records ?? []).filter((r) => Number.isFinite(r.disc_win_base_rate)).map((r) => ({ d: r.end_of_date, v: r.disc_win_base_rate })).sort((a, b) => a.d.localeCompare(b.d));
    const last = obs[obs.length - 1];
    if (!last) throw new Error("no records");
    await set("HKMA", last.v, last.d, lastChangeOf(obs), "HKMA daily monetary statistics API, discount window base rate");
    parts.push(`HKMA ${last.v}`); await sourceOk("hkma");
  } catch (e) { parts.push(`HKMA ERR ${e instanceof Error ? e.message : e}`); await sourceErr("hkma", e); }
  // BIS central bank policy rates (daily): the banks without a direct feed, plus the HKMA history
  const BIS: Array<[string, string, string, boolean]> = [
    ["BOJ", "JP", "Bank of Japan uncollateralised overnight call rate target (BIS WS_CBPOL)", true],
    ["RBA", "AU", "Reserve Bank of Australia cash rate target (BIS WS_CBPOL)", true],
    ["BOK", "KR", "Bank of Korea base rate (BIS WS_CBPOL)", true],
    ["PBOC", "CN", "People's Bank of China 1-year loan prime rate (BIS WS_CBPOL)", true],
    ["HKMA", "HK", "HKMA base rate (BIS WS_CBPOL)", false],
  ];
  for (const [bank, area, src, setCurrent] of BIS) {
    if (!want(bank)) continue;
    try {
      const t = await fetchText(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.${area}?format=csv&detail=dataonly${full ? "" : "&lastNObservations=40"}`, { headers: { accept: "text/csv" } }, 90000);
      const lines = t.split(/\r?\n/).filter(Boolean);
      const head = csvLine(lines[0]); const iT = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
      if (iT < 0 || iV < 0) throw new Error("unexpected columns");
      const obs = lines.slice(1).map(csvLine).map((c) => ({ d: c[iT], v: Number(c[iV]) })).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.d) && Number.isFinite(o.v)).sort((a, b) => a.d.localeCompare(b.d));
      const last = obs[obs.length - 1];
      if (!last) throw new Error("no observations");
      if (setCurrent) await set(bank, last.v, last.d, lastChangeOf(obs), src);
      const n = await history(bank, obs, src);
      parts.push(`${bank} ${last.v} (${n} hist, BIS)`); await sourceOk("bis");
    } catch (e) { parts.push(`${bank} ERR ${e instanceof Error ? e.message : e}`); await sourceErr("bis", e); }
  }
  return parts.join("; ");
}

/** One CSV line with quoted fields ("" escapes a quote). */
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

// ---------- prune ----------
async function prune(): Promise<string> {
  const ago = (days: number) => new Date(Date.now() - days * 86400e3).toISOString();
  const r1 = await db.from("bars_intraday").delete({ count: "exact" }).lt("t", ago(3));
  const r5 = await db.from("bars_hourly").delete({ count: "exact" }).lt("t", ago(60));
  const r6 = await db.from("bars_15m").delete({ count: "exact" }).lt("t", ago(14));
  const r2 = await db.from("login_attempts").delete({ count: "exact" }).lt("at", ago(2));
  const r3 = await db.from("job_runs").delete({ count: "exact" }).lt("at", ago(30));
  const r4 = await db.from("news_items").delete({ count: "exact" }).lt("published_at", ago(90));
  for (const r of [r1, r5, r6, r2, r3, r4]) if (r.error) throw new Error(r.error.message);
  return `1m bars ${r1.count ?? 0}, 15m bars ${r6.count ?? 0}, hourly bars ${r5.count ?? 0}, attempts ${r2.count ?? 0}, runs ${r3.count ?? 0}, news ${r4.count ?? 0}`;
}
