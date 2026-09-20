// Orrery Market Monitor -- snapshot builder. Runs in the monitor repository's GitHub Actions workflow
// (Node 20+), reads the Orrery Analytics api ONCE per run for every visitor, and writes the static files
// the Monitor page reads (data/...). File names must match snapPath() in index.html.
//   node tools/snapshot.mjs --out site/data --cache .snapcache [--api URL] [--tiers fast,medium,daily]
// Tiers (JST): fast every run (state, health, intraday, 1D charts, minute bars, news, brief);
// macro at most hourly (its answer is 383 KB gzipped); medium every 25 min in the TSE session, 55 min otherwise (other chart ranges, 30m/1h bars, econ, flow, funda, reports, sector news, recent
// briefs); daily after 07:30 JST (every name's history and news, every report).
// Conditional GETs (If-None-Match with the api's ETag) keep unchanged answers off the wire.
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
export const API = arg("api", process.env.ORRERY_API || "https://tksqbbezvpjjjgqkpknw.supabase.co/functions/v1/api");
const OUT = arg("out", "site/data"), CACHE = arg("cache", ".snapcache");
const NOW = Number(process.env.SNAP_NOW_MS || Date.now());
const FORCE = String(arg("tiers", process.env.SNAP_TIERS || "")).split(",").filter(Boolean);

export const fn = (x) => encodeURIComponent(String(x || "")).replace(/%/g, "_").replace(/\./g, "_2E");
export const DRV_SYMS = ["USDJPY=X", "1306.T", "JGB10Y", "^GSPC", "^N225", "^SOX", "^TNX", "ZN=F", "^VIX", "^HSI", "2510.T", "CL=F", "DGS10", "236A.T", "^TYX", "^TWII", "^KS11", "^NSEI", "000001.SS", "AAXJ"];
export const RANGES = ["1D", "1W", "1M", "3M", "6M", "12M"];   // the api chart action serves these; 24M+ are drawn from the state's daily series
export const MKTS = ["jp", "world", "asia"];
const STRIP_STATE = ["players", "navs", "positions", "orders", "intraday_navs"];

// daily slot: 07:30 JST -- after the nightly JP eod (22:12 JST) and the US close have both landed
export function lastDailySlot(nowMs) {
  const j = new Date(nowMs + 9 * 3600e3);
  const day0 = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - 9 * 3600e3;   // 00:00 JST today, in UTC ms
  const slots = [day0 - 86400e3 + 7.5 * 3600e3, day0 + 7.5 * 3600e3];
  return Math.max(...slots.filter((t) => t <= nowMs));
}
export function dueTiers(meta, nowMs, force = []) {
  const last = meta.last || {};
  // medium: every 25 minutes while the TSE is open (00:00-06:30 UTC, Mon-Fri), every 55 minutes otherwise
  const u = new Date(nowMs), mins = u.getUTCHours() * 60 + u.getUTCMinutes(), wd = u.getUTCDay();
  const tse = wd >= 1 && wd <= 5 && mins < 390;
  const due = { fast: true, macro: !last.macro || nowMs - last.macro >= 55 * 60e3, medium: !last.medium || nowMs - last.medium >= (tse ? 25 : 55) * 60e3, daily: !last.daily || last.daily < lastDailySlot(nowMs) };
  for (const f of force) if (f === "all") { due.macro = due.medium = due.daily = true; } else due[f] = true;
  if (due.daily) due.medium = true;
  return due;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function main({ fetchImpl = fetch, log = console.log } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  if (fs.existsSync(path.join(CACHE, "data"))) fs.cpSync(path.join(CACHE, "data"), OUT, { recursive: true });
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(CACHE, "meta.json"), "utf8")); } catch { meta = {}; }
  meta.etag = meta.etag || {}; meta.last = meta.last || {};
  const due = dueTiers(meta, NOW, FORCE);
  const stats = { calls: 0, notModified: 0, bytes: 0, failed: [] };
  const write = (rel, obj) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj)); };
  const has = (rel) => fs.existsSync(path.join(OUT, rel));
  // GET api?qs. Returns the parsed body, or null when unchanged (304) -- the file already in OUT stays.
  async function get(qs, { conditional = true } = {}) {
    const url = API + "?" + qs, key = qs;
    if ((stats.down || 0) >= 8) { stats.skipped = (stats.skipped || 0) + 1; return undefined; }   // the api is down: stop asking, keep every previous file
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const h = { accept: "application/json" };
        if (conditional && meta.etag[key]) h["if-none-match"] = meta.etag[key];
        const r = await fetchImpl(url, { headers: h, signal: AbortSignal.timeout(90000) });
        stats.calls++;
        if (r.status === 304) { stats.notModified++; return null; }
        const t = await r.text();
        stats.bytes += t.length;
        if (r.status >= 500) throw new Error("HTTP " + r.status + " " + t.slice(0, 120));
        if (r.status !== 200) { stats.failed.push(qs + " -> " + r.status); return undefined; }
        const e = r.headers.get("etag"); if (e && conditional) meta.etag[key] = e;
        return JSON.parse(t);
      } catch (err) {
        if (attempt === 2) { stats.down = (stats.down || 0) + 1; stats.failed.push(qs + " -> " + String(err && err.message || err).slice(0, 120)); return undefined; }
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  // fetch -> transform -> write; unchanged (304) or failed answers keep the previous file
  async function snap(qs, rel, tf = (j) => j, opt) { const j = await get(qs, opt); if (j) write(rel, tf(j)); return j; }

  // ---------------- fast ----------------
  const state = await snap("action=state", "state.json", (j) => { for (const k of STRIP_STATE) if (k in j) j[k] = []; j.league = {}; return j; });
  if (due.macro) { await snap("action=macro", "macro.json"); meta.last.macro = NOW; }   // 383 KB gzipped: at most hourly
  await snap("action=health", "health.json");
  await snap("action=intraday", "intraday.json", (j) => { j.navs = {}; return j; });
  for (const m of MKTS) await snap("action=chart&mkt=" + m + "&range=1D&days=9", "chart/" + m + "_1D.json");
  const brief = await snap("action=brief&n=400", "brief.json");
  if (brief && brief.brief && brief.brief.d) write("brief/" + fn(brief.brief.d) + ".json", brief);
  await snap("action=news&n=300", "news.json");
  // minute bars: keep seven days, add the latest day every run (the full seven days with the daily tier)
  {
    let drv = {}; try { drv = JSON.parse(fs.readFileSync(path.join(OUT, "drv1m.json"), "utf8")).bars || {}; } catch { drv = {}; }
    const range = due.daily || !Object.keys(drv).length ? "7d" : "1d";
    for (let i = 0; i < DRV_SYMS.length; i += 16) {
      const j = await get("action=bars_all&res=1m&range=" + range + "&symbols=" + encodeURIComponent(DRV_SYMS.slice(i, i + 16).join(",")), { conditional: false });
      if (!j || !j.bars) continue;
      for (const [s, arr] of Object.entries(j.bars)) {
        const m = new Map((range === "7d" ? [] : drv[s] || []).map((b) => [b[0], b[1]]));
        for (const b of arr) m.set(b[0], b[1]);
        const cut = NOW / 1000 - 7 * 86400;
        drv[s] = [...m.entries()].filter((b) => b[0] >= cut).sort((a, b) => a[0] - b[0]);
      }
    }
    write("drv1m.json", { res: "1m", bars: drv });
  }

  // ---------------- medium ----------------
  if (due.medium) {
    for (const m of MKTS) for (const rg of RANGES.slice(1)) await snap("action=chart&mkt=" + m + "&range=" + rg, "chart/" + m + "_" + rg + ".json");
    for (const res of ["30m", "1h"]) await snap("action=bars_all&res=" + res, "bars_all_" + res + ".json", undefined, { conditional: false });
    await snap("action=econ", "econ.json");
    await snap("action=flow", "flow.json");
    await snap("action=funda", "funda.json");
    const reps = await snap("action=reports&n=150", "reports.json");
    const rows = reps ? reps.rows || [] : (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, "reports.json"), "utf8")).rows || []; } catch { return []; } })();
    for (const r of rows) if (due.daily || !has("report/" + Number(r.id) + ".json")) await snap("action=report&id=" + Number(r.id), "report/" + Number(r.id) + ".json");
    const dates = (brief && brief.dates) || [];
    for (const x of dates.slice(0, 5)) { const d = x && (x.d || x); if (typeof d === "string") await snap("action=brief&n=400&d=" + encodeURIComponent(d), "brief/" + fn(d) + ".json"); }
    for (const x of dates.slice(5)) { const d = x && (x.d || x); if (typeof d === "string" && !has("brief/" + fn(d) + ".json")) await snap("action=brief&n=400&d=" + encodeURIComponent(d), "brief/" + fn(d) + ".json"); }
    let st = state; if (!st) { try { st = JSON.parse(fs.readFileSync(path.join(OUT, "state.json"), "utf8")); } catch { st = null; } }
    const sectors = [...new Set(((st && st.instruments) || []).filter((i) => i.in_universe).map((i) => i.sector).filter(Boolean))];
    for (const s of sectors) await snap("action=news&n=40&days=7&sector=" + encodeURIComponent(s), "news/sector/" + fn(s) + ".json");
    meta.last.medium = NOW;
  }

  // ---------------- daily ----------------
  if (due.daily) {
    let st = state; if (!st) { try { st = JSON.parse(fs.readFileSync(path.join(OUT, "state.json"), "utf8")); } catch { st = null; } }
    const jp = ((st && st.instruments) || []).filter((i) => i.in_universe).map((i) => String(i.code).toUpperCase());
    const world = ((st && st.world_instruments) || []).map((w) => String(w.symbol).toUpperCase()).filter((s) => /^[A-Z0-9][A-Z0-9.&\-]{0,15}$/.test(s));
    const all = [...new Set([...jp, ...world])];
    for (let i = 0; i < all.length; i += 40) {
      const j = await get("action=hist_many&codes=" + encodeURIComponent(all.slice(i, i + 40).join(",")) + (i === 0 ? "&bm=1" : ""), { conditional: false });
      if (!j || !j.rows) continue;
      if (i === 0 && j.bmj) write("hist_bm.json", { bmj: j.bmj, bmw: j.bmw });
      for (const row of j.rows) write("hist/" + fn(row.code) + ".json", row);
    }
    for (let i = 0; i < all.length; i += 60) {
      const j = await get("action=news_codes&days=60&n=40&codes=" + encodeURIComponent(all.slice(i, i + 60).join(",")), { conditional: false });
      if (!j || !j.rows) continue;
      for (const [c, rows] of Object.entries(j.rows)) {
        const rel = "news/code/" + fn(c) + ".json";
        if (rows.length) write(rel, { rows }); else if (has(rel)) fs.rmSync(path.join(OUT, rel));
      }
    }
    meta.last.daily = NOW;
  }
  meta.last.fast = NOW;
  const manifest = { at: new Date(NOW).toISOString(), source: "Orrery Analytics api", tiers: Object.keys(due).filter((k) => due[k]), calls: stats.calls, not_modified: stats.notModified, bytes: stats.bytes, failed: stats.failed.slice(0, 20) };
  write("manifest.json", manifest);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.rmSync(path.join(CACHE, "data"), { recursive: true, force: true });
  fs.cpSync(OUT, path.join(CACHE, "data"), { recursive: true });
  fs.writeFileSync(path.join(CACHE, "meta.json"), JSON.stringify(meta));
  manifest.skipped = stats.skipped || 0;
  write("manifest.json", manifest);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "save_cache=" + (due.medium || due.daily ? "true" : "false") + "\n");
  log(JSON.stringify(manifest));
  return manifest;
}
if (process.argv[1] && import.meta.url === "file://" + path.resolve(process.argv[1])) {
  main().then((m) => { if (m.failed.length > 5) process.exitCode = 1; });
}
