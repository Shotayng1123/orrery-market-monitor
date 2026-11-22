// A tab that cannot be drawn must not take the page with it (components/TabGuard.tsx), on a desktop and in the
// phone layout; and the desktop watchlist draws when its feed comes without its lists, which is how the fault was
// found (the stand-in feed answered `{ rows: [] }` to what it did not know, and the page went blank; since the
// mock knows the feed, `om_mock_bare` = "watch_feed" makes it answer that way again).
// The fault is made with the development-only switch: `om_crash` = a tab's id in the browser's storage.
// Run from web/:  node e2e/run.cjs tab-guard   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const see = (p) => p.evaluate(() => { const c = document.querySelector("#tab-crash"), g = document.querySelector("#grid");
  return { crash: !!c, text: c ? c.textContent : "", view: g ? g.dataset.view : null, topbar: !!document.querySelector("#topbar .brand"), nav: (document.querySelector("#pnav") ? document.querySelectorAll("#pnav a") : document.querySelectorAll("#nav a")).length, kids: g ? g.children.length : 0,
    wide: c ? Math.round(c.getBoundingClientRect().width) : 0, page: document.documentElement.clientWidth, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });

(async () => { const b = await chromium.launch();
  for (const [name, opts, drawn, tab] of [["desktop", { viewport: { width: 1440, height: 900 } }, ".panel", (v) => `#nav a[href="#${v}"]`], ["phone", { ...devices["iPhone 13"] }, ".mp-row", (v) => `#pnav a[href="#${v}"]`]]) {
    console.log(`\n[${name}: a tab that throws while it is drawn]`);
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(drawn);
    await p.evaluate(() => localStorage.setItem("om_crash", "news"));
    await p.locator(tab("news")).click(); await p.waitForSelector("#tab-crash"); await p.waitForTimeout(300);
    const a = await see(p);
    ck("the tab says it could not be drawn and that the others are not affected, with the error's own words", a.crash && /THIS TAB COULD NOT BE DRAWN/.test(a.text) && /other tabs are not affected/.test(a.text) && /crash switch for the news tab/.test(a.text) && /TRY AGAIN/.test(a.text), a);
    ck("the header and the tabs are still there (seven on a development server, with the paper portfolio's), and the notice fits the screen", a.topbar && a.nav === 7 && a.view === "news" && a.wide > a.page * 0.8 && a.wide <= a.page && a.over <= 0, a);
    await p.locator(tab("market")).click(); await p.waitForSelector(drawn); await p.waitForTimeout(300);
    const m = await see(p);
    ck("another tab opens as usual", !m.crash && m.view === "market" && m.kids > 0, m);
    await p.locator(tab("news")).click(); await p.waitForSelector("#tab-crash");
    await p.evaluate(() => localStorage.removeItem("om_crash"));
    await p.locator("#tab-retry").click(); await p.waitForFunction(() => !document.querySelector("#tab-crash") && document.querySelector("#grid").children.length > 0); await p.waitForTimeout(300);
    const r = await see(p);
    ck("TRY AGAIN draws the tab once the fault is gone", !r.crash && r.view === "news" && r.kids > 0, r);
    // another page of the same tab starts clean: a stock's page that throws, then another stock
    await p.evaluate(() => localStorage.setItem("om_crash", "asset"));
    await p.goto(MOCK + "#asset/7203.T"); await p.waitForSelector("#tab-crash");
    await p.evaluate(() => localStorage.removeItem("om_crash"));
    await p.evaluate(() => { location.hash = "asset/NVDA"; }); await p.waitForFunction(() => !document.querySelector("#tab-crash")); await p.waitForSelector("table.fin");
    ck("opening another page of the same tab draws it afresh, without a reload", !(await see(p)).crash && (await p.evaluate(() => /NVDA/.test(document.body.innerText))), await see(p));
    ck("none of this reaches the page as an unhandled error", errs.length === 0, errs);
    await ctx.close();
  }
  console.log("\n[desktop: the watchlist when its feed comes without its lists]");
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { localStorage.setItem("om_mock_bare", "watch_feed"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="wl"]'); await p.waitForTimeout(500);
    const v = await p.evaluate(() => ({ crash: !!document.querySelector("#tab-crash"), panels: [...document.querySelectorAll("#grid .panel")].map((x) => x.dataset.k), empty: [...document.querySelectorAll('#grid .panel[data-k="wl-alerts"] .empty, #grid .panel[data-k="wl-news"] .empty, #grid .panel[data-k="wl-research"] .empty')].map((e) => e.textContent.slice(0, 14)) }));
    // MY NAMES across, then the two-column page (19 Nov 2026): its left column (alerts, earnings ahead) comes before
    // its right (headlines, research) in the document; which panels are drawn is what matters here
    ck("all five panels are drawn, the three without data saying so", !v.crash && [...v.panels].sort().join() === "wl,wl-alerts,wl-earn,wl-news,wl-research" && v.empty.length === 3 && errs.length === 0, { v, errs });
    await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
