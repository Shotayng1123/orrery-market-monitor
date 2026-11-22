// The hold that keeps a list where it stood after Back gives way to the reader, and it ends (the checks of round 3b,
// 21 Nov 2026: NH-2; web/src/lib/nav.ts). After Back to a list, the page is held at the place it was left at while the
// list's rows and the answers that draw above them are still on their way: a move of the page that the reader did not
// make is put right meanwhile (B's B-33; the suite page-top checks that the place is kept). The hold is given up at the
// reader's first touch, wheel or key, and it is over a moment after the last answer has come. Every check of a Back
// only waited and read, so a hold that did not yield, or one that outlived its answers and went on moving the page,
// passed them all. Here, on a phone's WATCHLIST of eleven names with its answers late, as on the live site (the names
// 0.5 s after the address, the market table 1.5 s: the hold is then on for about 1.8 s after Back):
//   - with no input the row that was tapped is back where it stood (the hold does its work);
//   - a wheel or a key while the list is still on its way ends the hold: the page is not put back when the answers come;
//   - three seconds after Back the hold is over: a move to the top that comes with no touch, wheel or key stays.
// The page's clock is set (Tue 24 Nov 2026, 07:10 SGT), never the machine's. Positions are compared with where the same
// row stood when it was left, never with a number of pixels.
// Run from web/:  node e2e/run.cjs nav-hold   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const NOW = "2026-11-23T23:10:00Z";
const WATCH = ["USDJPY=X", "EURUSD=X", "DX-Y.NYB", "^TNX", "UST2Y", "JGB10Y", "GC=F", "CL=F", "NKD=F", "^STOXX50E", "^GSPC"], NK = "Nikkei 225 future (CME)";
const STORE = { om_prefs: JSON.stringify({ size: "AUTO", compact: false, v: 2 }), om_a2hs_hide: "1", om_mock_watch: JSON.stringify(WATCH.map((symbol) => ({ symbol, name: null }))), om_mock_now: NOW };
async function page(b) {
  const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
  await ctx.addInitScript((st) => { try { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } catch {} }, STORE);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const settle = (p, ms) => p.waitForTimeout(ms);
// where the tapped row stands on screen, and where the page stands
const rowTop = (p) => p.evaluate((name) => { const rows = [...document.querySelectorAll(".mp-sec .mp-row.tap")], r = rows.find((x) => x.querySelector(".n")?.textContent === name); return r ? { top: Math.round(r.getBoundingClientRect().top), y: Math.round(scrollY), rows: rows.length } : null; }, NK);

(async () => { const b = await chromium.launch();
  // the local copy's own answers for this list, served late by the suite on the stand-in server
  const { ctx: c0, p: p0 } = await page(b);
  await p0.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await p0.waitForSelector(".mp-sec .mp-row.tap");
  const ans = await p0.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return { watch_syms: mockAction("watch_syms"), watch_list: mockAction("watch_list"), watch_feed: mockAction("watch_feed"), table: mockAction("table"), stock: mockAction("stock", { symbol: "NKD=F" }) }; });
  await c0.close();
  const LATE = { watch_syms: 200, watch_list: 500, watch_feed: 500, table: 1500, stock: 800 };
  const late = (p) => p.route("**/fakeapi?*", async (r) => { const a = new URL(r.request().url()).searchParams.get("action");
    const ok = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (a in ans) { await new Promise((res) => setTimeout(res, LATE[a])); return ok(ans[a]); }
    return ok(a === "health" ? { ok: true, at: NOW, tick: { lastAt: NOW, ageMin: 1, ok: true }, daily: { lastAt: NOW, ok: true }, sources: [], holidays: {}, holidaysVerified: true } : { rows: [] }); });
  // one visit in a context of its own: the list, the row brought into view, the tap, the browser's Back, an input (or
  // none) a quarter of a second later, and three seconds after that where the row stands; then a move to the top
  const visit = async (input) => { const { ctx, p, errs } = await page(b);
    await p.clock.setFixedTime(new Date(NOW)); await late(p);
    await p.goto(STANDIN + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-sec .mp-row.tap"); await p.evaluate(() => document.fonts.ready); await settle(p, 600);
    const row = p.locator(".mp-sec .mp-row.tap", { has: p.locator(".n", { hasText: NK }) }).first(); await row.scrollIntoViewIfNeeded(); await settle(p, 250);
    const before = await rowTop(p); await row.click(); await settle(p, 900);
    const opened = await p.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY) }));
    await p.goBack(); await settle(p, 250);
    const waiting = await p.evaluate(() => !!document.querySelector("[data-nav-wait]"));   // the list is still on its way: the hold is on
    if (input === "wheel") await p.mouse.wheel(0, -160); else if (input === "key") await p.keyboard.press("ArrowUp");
    await settle(p, 3000); const after = await rowTop(p), hash = await p.evaluate(() => location.hash);
    await p.evaluate(() => scrollTo(0, 0)); await settle(p, 700); const top = await p.evaluate(() => Math.round(scrollY));
    await ctx.close(); return { input, waiting, before, after, opened, hash, moved: before && after ? after.top - before.top : null, top, errs }; };

  console.log("\n[a phone's WATCHLIST, its answers late: the hold after Back does its work, gives way to the reader, and ends]");
  const none = await visit(null), wheel = await visit("wheel"), key = await visit("key");
  const sound = (v) => v.waiting && v.hash === "#watch" && v.opened.hash === "#asset/NKD%3DF" && v.opened.y === 0 && v.before?.rows === 11 && v.before.y > 100 && v.errs.length === 0;
  ck(`with no input: ${NK}'s page opened from y ${none.before?.y}, the browser's Back, and three seconds later the line is where it stood (moved ${none.moved} px), the list having been on its way a quarter of a second after Back`, sound(none) && Math.abs(none.moved) <= 2, none);
  ck(`a wheel while the hold is on ends it: the page is not put back when the answers come (the line ${wheel.moved} px from where it stood)`, sound(wheel) && Math.abs(wheel.moved) > 100, wheel);
  ck(`a key the same (the line ${key.moved} px from where it stood)`, sound(key) && Math.abs(key.moved) > 100, key);
  ck(`the hold is over once the answers have come: a move to the top that no touch, wheel or key came with stays (y ${none.top}; the list had stood at y ${none.after?.y})`, none.top === 0 && none.after?.y > 100, none);
  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
})();
