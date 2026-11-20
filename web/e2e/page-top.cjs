// A page opened from a list starts at its top, and Back returns the list to where it stood (B's B-28, 20 Nov 2026;
// web/src/lib/nav.ts), on the local copy's stand-in rows:
//   - a phone (iPhone 13): MARKETS › USD/JPY › "Open USD/JPY's page ›", MARKETS › Gold, RATES & FX › JGB 10Y and
//     WATCHLIST's last row each open their page at y 0 with Back, the symbol and the name (.mp-doc h1) on screen; Back
//     (the page's own, and the browser's) returns the list to where it stood, with MARKETS' and RATES & FX's opened
//     row still open; the same from EQUITIES' lists, a headline's company on NEWS, the alert list and search;
//   - an address entered again (a new entry without a change of address) changes none of it;
//   - a computer: a name low on MARKETS opens its page at y 0, and Back returns MARKETS to where it stood;
//   - answers that come late (as on the live site; the local copy answers at once): Back waits for the list to be drawn
//     tall enough and then returns to where it stood, and a page still loading opens at its top.
// Positions are compared with where the same list stood when it was left, never with a number of pixels, so taller
// rows on another machine move both alike.
// Run from web/:  node e2e/run.cjs page-top   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const AUTO = { size: "AUTO", compact: false, v: 2 };
async function page(b, opts) {
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript((pr) => { try { localStorage.setItem("om_prefs", JSON.stringify(pr)); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, AUTO);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
// a fresh page at an address: loaded anew, so every case starts from a page as it is opened
const fresh = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); await p.reload({ waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(500); };
// where the page stands, and whether a page's head is on screen: Back, the symbol line and the name, under the pinned head
const at = (p) => p.evaluate(() => {
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; };
  const h1 = document.querySelector(".mp-doc h1");
  return { hash: location.hash, y: Math.round(scrollY), h1: h1?.textContent ?? null, h1On: vis(h1), backOn: vis(document.querySelector(".mp-head .mp-back")), metaOn: vis(document.querySelector(".mp-doc .meta")), meta: document.querySelector(".mp-doc .meta")?.textContent ?? null };
});
const settle = (p, ms = 700) => p.waitForTimeout(ms);
const near = (a, b) => Math.abs(a - b) <= 2;
// MARKETS and RATES & FX on a phone: open a row, then its "Open … page ›"; where the list stood at the tap
async function openFromRow(p, name, label) {
  const row = p.locator(".mp-item", { has: p.locator(".mp-nm .n", { hasText: name }) }).first();
  await row.scrollIntoViewIfNeeded(); await row.locator("button.mp-row").click(); await settle(p, 500);
  const btn = row.locator("button.mp-more"); await btn.scrollIntoViewIfNeeded(); await settle(p, 200);
  const y = await p.evaluate(() => Math.round(scrollY)), text = (await btn.textContent()).trim();
  await btn.click(); await settle(p, 900);
  return { y, text, label };
}
const openRow = (p) => p.evaluate(() => document.querySelector(".mp-item.open .mp-nm .n")?.textContent ?? null);

(async () => { const b = await chromium.launch();
  console.log("\n[a phone, iPhone 13: a page opened from a list starts at its top; Back returns the list to where it stood]");
  { const { ctx, p, errs } = await page(b, devices["iPhone 13"]);
    for (const [name, label, h1, sym] of [["USD/JPY", "Open USD/JPY's page", "USD/JPY", "USDJPY=X"], ["Gold", "Open Gold's page", "Gold", "GC=F"]]) {
      await fresh(p, MOCK, "#market", ".mp-item");
      const o = await openFromRow(p, name, label), a = await at(p);
      ck(`MARKETS › ${name} › "${o.text}" (the list at y ${o.y}): the page opens at its top, y ${a.y}, with Back, "${a.meta}" and "${a.h1}" on screen`, o.text.startsWith(label) && o.y > 600 && a.hash === `#asset/${encodeURIComponent(sym)}` && a.y === 0 && a.h1 === h1 && a.h1On && a.backOn && a.metaOn, { o, a });
      await p.locator(".mp-head .mp-back").click(); await settle(p, 900);
      const back = await at(p), open = await openRow(p);
      ck(`its Back: MARKETS where it stood (y ${back.y} against ${o.y}), ${name}'s line still open`, back.hash === "#market" && near(back.y, o.y) && open === name, { back, open, o });
    }
    // RATES & FX: a yield low in the list
    await fresh(p, MOCK, "#rates", ".mp-item");
    { const o = await openFromRow(p, "JGB 10Y", "Open JGB 10Y's page"), a = await at(p);
      ck(`RATES & FX › JGB 10Y › "${o.text}" (the list at y ${o.y}): the page opens at y ${a.y} with "${a.h1}" on screen`, o.y > 300 && a.hash === "#asset/JGB10Y" && a.y === 0 && /JGB 10Y/.test(a.h1 ?? "") && a.h1On && a.backOn, { o, a });
      await p.goBack(); await settle(p, 900);
      const back = await at(p), open = await openRow(p);
      ck(`the browser's own Back: RATES & FX where it stood (y ${back.y} against ${o.y}), JGB 10Y's line still open`, back.hash === "#rates" && near(back.y, o.y) && open === "JGB 10Y", { back, open, o }); }
    // WATCHLIST: its last line
    await fresh(p, MOCK, "#watch", ".mp-row.tap");
    { const last = p.locator(".mp-sec").first().locator(".mp-row.tap").last(); await last.scrollIntoViewIfNeeded(); await settle(p, 200);
      const y = await p.evaluate(() => Math.round(scrollY)), name = await last.locator(".n").textContent();
      await last.click(); await settle(p, 900); const a = await at(p);
      ck(`WATCHLIST's last line (${name}, the list at y ${y}): its page opens at y ${a.y} with "${a.h1}" on screen`, y > 100 && a.y === 0 && a.h1 === name && a.h1On && a.backOn, { y, a });
      await p.locator(".mp-head .mp-back").click(); await settle(p, 900); const back = await at(p);
      ck(`Back: WATCHLIST where it stood (y ${back.y} against ${y})`, back.hash === "#watch" && near(back.y, y), { back, y }); }
    // EQUITIES: a line of the screener, low on the page
    await fresh(p, MOCK, "#equities/nk225", ".mp-row.tap");
    { const row = p.locator(".mp-row.tap").nth(12); await row.scrollIntoViewIfNeeded(); await settle(p, 200);
      const y = await p.evaluate(() => Math.round(scrollY)); await row.click(); await settle(p, 900); const a = await at(p);
      ck(`EQUITIES › a line low in its lists (the page at y ${y}): the company's page opens at y ${a.y}, "${a.h1}" on screen`, y > 600 && a.hash.startsWith("#asset/") && a.y === 0 && !!a.h1 && a.h1On, { y, a });
      await p.locator(".mp-head .mp-back").click(); await settle(p, 900); const back = await at(p);
      ck(`Back: EQUITIES where it stood (y ${back.y} against ${y})`, back.hash === "#equities/nk225" && near(back.y, y), { back, y }); }
    // NEWS: a headline's company
    await fresh(p, MOCK, "#news", ".nw-row");
    { const chip = p.locator(".nw-row .nw-tk button").nth(6); await chip.scrollIntoViewIfNeeded(); await settle(p, 200);
      const y = await p.evaluate(() => Math.round(scrollY)), name = await chip.textContent(); await chip.click(); await settle(p, 900); const a = await at(p);
      ck(`NEWS › a headline's company (${name}, the page at y ${y}): its page opens at y ${a.y}, "${a.h1}" on screen`, y > 600 && a.hash.startsWith("#asset/") && a.y === 0 && !!a.h1 && a.h1On, { y, a }); }
    // search, from low on MARKETS
    await fresh(p, MOCK, "#market", ".mp-item");
    { await p.evaluate(() => scrollTo(0, 1200)); await settle(p, 300);
      await p.locator('#pv2-btns button[aria-label^="Search"]').click(); await settle(p, 300);
      await p.locator("#search input").fill("toyota"); await p.waitForSelector("#search .sitem b"); await p.locator("#search input").press("Enter"); await settle(p, 900);
      const a = await at(p);
      ck(`search ("toyota", from MARKETS at y 1200): the page opens at y ${a.y}, "${a.h1}" on screen`, a.hash === "#asset/7203.T" && a.y === 0 && !!a.h1 && a.h1On && a.backOn, a); }
    // the alert list, from low on MARKETS: the header's alert line opens it, and a line with a page opens that page at its top
    await fresh(p, MOCK, "#market", ".mp-item");
    { await p.evaluate(() => scrollTo(0, 1200)); await settle(p, 300);
      await p.locator("#alerts .alrt").click(); await p.waitForSelector("#alerts .aldrop .lnk");
      await p.locator("#alerts .aldrop tr", { hasText: "USD/JPY" }).locator(".lnk").first().click(); await settle(p, 900);
      const a = await at(p);
      ck(`the alert list (from MARKETS at y 1200) › USD/JPY's σ move: its page opens at y ${a.y}, "${a.h1}" on screen`, a.hash === "#asset/USDJPY%3DX" && a.y === 0 && a.h1 === "USD/JPY" && a.h1On && a.backOn, a); }
    // an address entered again (a new history entry, no change of address): Back still finds the list as it was left
    await fresh(p, MOCK, "#market", ".mp-item");
    { await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await settle(p, 400);
      const o = await openFromRow(p, "Gold", "Open Gold's page"), a = await at(p);
      await p.locator(".mp-head .mp-back").click(); await settle(p, 900); const back = await at(p), open = await openRow(p);
      ck(`the same address entered again before opening Gold: its page at y ${a.y}; Back to y ${back.y} against ${o.y}, Gold's line open`, a.y === 0 && back.hash === "#market" && near(back.y, o.y) && open === "Gold", { a, back, open, o }); }
    // a page opened afresh (a tab's own tap) keeps its list's first state: nothing kept leaks into a new visit
    { await p.locator('#pnav a[href="#rates"]').click(); await settle(p, 400); await p.locator('#pnav a[href="#market"]').click(); await settle(p, 600);
      ck("MARKETS opened again from the tab bar starts at its top, no line open", (await p.evaluate(() => Math.round(scrollY))) === 0 && (await openRow(p)) === null, await openRow(p)); }
    ck("no page errors", errs.length === 0, errs);
    await ctx.close(); }

  console.log("\n[a computer, 1440x900: a name low on MARKETS]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } });
    await fresh(p, MOCK, "#market", "table.mkt tbody tr:not(.cls)");
    const link = p.locator(".mtile .lb a", { hasText: "Gold" }).first(); await link.scrollIntoViewIfNeeded(); await settle(p, 200);
    const y = await p.evaluate(() => Math.round(scrollY)); await link.click(); await settle(p, 900);
    const a = await p.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY), chart: Math.round(document.querySelector('.panel[data-k="in-chart"]')?.getBoundingClientRect().top ?? -1) }));
    ck(`Gold's chart title, low on MARKETS (y ${y}): its page opens at y ${a.y}, the chart's panel at the top (${a.chart}px)`, y > 600 && a.hash === "#asset/GC%3DF" && a.y === 0 && a.chart > 0 && a.chart < 300, { y, a });
    await p.goBack(); await settle(p, 900); const back = await p.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY) }));
    ck(`Back: MARKETS where it stood (y ${back.y} against ${y})`, back.hash === "#market" && near(back.y, y), { back, y });
    ck("no page errors", errs.length === 0, errs);
    await ctx.close(); }

  console.log("\n[answers that come late, as on the live site: a phone, iPhone 13, on the stand-in server]");
  { // the local copy's own answers, served 0.8 s late: MARKETS' table and the pages' answers
    const { ctx: c0, p: p0 } = await page(b, devices["iPhone 13"]); await fresh(p0, MOCK, "#market", ".mp-item");
    const ans = await p0.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return { table: mockAction("table"), gold: mockAction("stock", { symbol: "GC=F" }) }; }); await c0.close();
    const { ctx, p, errs } = await page(b, devices["iPhone 13"]);
    await p.route("**/fakeapi?*", async (r) => { const q = new URL(r.request().url()).searchParams, a = q.get("action");
      const ok = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
      if (a === "table" || a === "stock") { await new Promise((res) => setTimeout(res, 800)); return ok(a === "table" ? ans.table : ans.gold); }
      return ok(a === "health" ? { ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true }, daily: { lastAt: new Date().toISOString(), ok: true }, sources: [], holidays: {}, holidaysVerified: true } : { rows: [] }); });
    await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-item"); await settle(p, 600);
    const o = await openFromRow(p, "Gold", "Open Gold's page");
    await p.waitForSelector(".mp-doc h1"); await settle(p, 400); const a = await at(p);
    ck(`Gold's page, its answer 0.8 s late (the list at y ${o.y}): it opens at y ${a.y}, "${a.h1}" on screen once it comes`, o.y > 600 && a.y === 0 && a.h1 === "Gold" && a.h1On, { o, a });
    await p.locator(".mp-head .mp-back").click();
    const early = await p.evaluate(() => ({ y: Math.round(scrollY), items: document.querySelectorAll(".mp-item").length }));
    await p.waitForSelector(".mp-item"); await settle(p, 900);
    const back = await at(p), open = await openRow(p);
    ck(`Back while MARKETS' table is still on its way (y ${early.y}, ${early.items} lines drawn): once it is drawn, MARKETS where it stood (y ${back.y} against ${o.y}), Gold's line open`, early.items === 0 && back.hash === "#market" && near(back.y, o.y) && open === "Gold", { early, back, open, o });
    ck("no page errors", errs.length === 0, errs);
    await ctx.close(); }

  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
})();
