// Stand-in API answers for the browser checks (synthetic; nothing here is a real figure), and a page opener.
// The rows are those of web/src/lib/standin.json (read by e2e/standin.cjs), which the local copy's mock feed
// shows too: 70 calendar events from three days back to four ahead, 45 earnings dates, 70 headlines over the last
// 31 hours (so they always cross a midnight in Singapore), 39 daily notes and 6 weekly reports, each time counted
// from when the suite starts.
const { chromium } = require("playwright");
const { S, note, report } = require("./standin.cjs");
const BASE = "http://localhost:5181/orrery-market-monitor/";
const { notes, reports, calendar, earnings, news: newsRows } = S;
const health = { ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true, note: "stand-in" }, daily: { lastAt: new Date().toISOString(), ok: true, note: "stand-in" }, sources: [], holidays: {}, holidaysVerified: true };
async function open({ width, height, compact = false, size = "AUTO", hash = "#research", waitFor = '.panel[data-k="report"] .brnar' }) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([c, s]) => { try { localStorage.setItem("om_prefs", JSON.stringify({ size: s, compact: c, v: 2 })); } catch {} }, [compact, size]);
  await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} });   // these checks are of the classic layout
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await routes(p);
  await p.goto(BASE + hash, { waitUntil: "networkidle" });
  await p.waitForSelector(waitFor, { timeout: 8000 });
  await p.waitForTimeout(400);
  return { b, p, errs };
}
async function routes(p) {
  await p.route("**/fakeapi?*", (r) => { const q = new URL(r.request().url()).searchParams; const a = q.get("action");
    const body = a === "health" ? health : a === "notes" ? { rows: notes } : a === "reports" ? { rows: reports } : a === "report" ? { report: report(Number(q.get("id"))) } : a === "note" ? { note: note(q.get("d")) } : a === "calendar" ? { rows: calendar } : a === "news" ? { rows: q.get("category") ? newsRows.filter((n) => n.category === q.get("category")) : newsRows } : a === "earnings" ? { rows: earnings, source: S.earningsSource } : { rows: [] };
    (p.__calls = p.__calls || []).push(a);
    if (a === "asset") return r.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "no stand-in data for a stock page" }) });
    r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }); });
}
module.exports = { open, routes, note, S };
