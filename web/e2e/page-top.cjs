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
//   - a phone's WATCHLIST of eleven names (B's B-33, 21 Nov 2026): the browser's Back (and so a swipe from the edge)
//     returns the row that was tapped to where it stood, in ten fresh contexts of ten; the same for the last row and
//     for the page's own Back, and with the list's answers 0.8 s late. The list is first drawn without its rows, and
//     the rows then arrive above what is on screen: the hold of lib/nav.ts ended at that first drawing and the browser
//     kept the sections below in place, so the row stood 589 px higher (B's measurement, ten of ten);
//   - the same fault from an answer of its own that draws above a list after the list's rows: WATCHLIST's "Closed now"
//     line once the market table comes (42 px), and MARKETS' morning note (44 px). Each view says while such an answer
//     is on its way (`data-nav-wait`), and Back holds the place until it has come.
// Positions are compared with where the same list stood when it was left, never with a number of pixels, so taller
// rows on another machine move both alike.
// Run from web/:  node e2e/run.cjs page-top   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const AUTO = { size: "AUTO", compact: false, v: 2 };
async function page(b, opts, store) {
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript(([pr, st]) => { try { localStorage.setItem("om_prefs", JSON.stringify(pr)); localStorage.setItem("om_a2hs_hide", "1"); for (const [k, v] of Object.entries(st || {})) localStorage.setItem(k, v); } catch {} }, [AUTO, store || null]);
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
      await p.locator("#alerts .alrt").click(); await p.waitForSelector("#alerts .aldrop [data-kind]");
      await p.locator("#alerts .aldrop [data-kind]", { hasText: "USD/JPY" }).first().click(); await settle(p, 900);   // a phone's list is rows, each a tap (the designer's D-63)
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
    await ctx.close();
    // The morning note's line stands above the list and comes from an answer of its own. A second after the table's,
    // it arrives when the rows are drawn and the place is reached: the browser then keeps the rows on screen by moving
    // the page, and the list stood 50 px from where it was left (the same fault as B-33's, seen while fixing it).
    { const { ctx, p, errs } = await page(b, devices["iPhone 13"]);
      const note = { id: 1, d: new Date().toISOString().slice(0, 10), title: "A stand-in morning note, for the check of Back", generatedAt: new Date(Date.now() - 2 * 3600e3).toISOString(), kind: "daily" };
      await p.route("**/fakeapi?*", async (r) => { const a = new URL(r.request().url()).searchParams.get("action"), wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const ok = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
        if (a === "table" || a === "stock") { await wait(400); return ok(a === "table" ? ans.table : ans.gold); }
        if (a === "notes") { await wait(1400); return ok({ rows: [note] }); }
        return ok(a === "health" ? { ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true }, daily: { lastAt: new Date().toISOString(), ok: true }, sources: [], holidays: {}, holidaysVerified: true } : { rows: [] }); });
      await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("#mk-note"); await settle(p, 600);
      const o = await openFromRow(p, "Gold", "Open Gold's page"); await p.waitForSelector(".mp-doc h1"); await settle(p, 300);
      await p.goBack(); await p.waitForSelector("#mk-note"); await settle(p, 900);
      const back = await at(p), open = await openRow(p);
      ck(`Back with the morning note's answer a second after the table's: once its line is drawn above the list, MARKETS where it stood (y ${back.y} against ${o.y}), Gold's line open`, back.hash === "#market" && near(back.y, o.y) && open === "Gold" && errs.length === 0, { back, open, o, errs });
      await ctx.close(); } }

  console.log("\n[a phone's WATCHLIST of eleven names (B-33): Back returns the row that was tapped to where it stood]");
  { const WATCH = ["USDJPY=X", "EURUSD=X", "DX-Y.NYB", "^TNX", "UST2Y", "JGB10Y", "GC=F", "CL=F", "NKD=F", "^STOXX50E", "^GSPC"], NK = "Nikkei 225 future (CME)";
    const STORE = { om_mock_watch: JSON.stringify(WATCH.map((symbol) => ({ symbol, name: null }))), om_mock_now: "2026-11-23T23:10:00Z" };   // the clock is the page's own: Tue 24 Nov 07:10 SGT
    // where a row stands on screen: by its name, or the list's last
    const rowTop = (p, pick) => p.evaluate((pick) => { const rows = [...document.querySelectorAll(".mp-sec .mp-row.tap")], r = pick === "last" ? rows[rows.length - 1] : rows.find((x) => x.querySelector(".n")?.textContent === pick); return r ? { top: Math.round(r.getBoundingClientRect().top), y: Math.round(scrollY), rows: rows.length, name: r.querySelector(".n")?.textContent ?? null } : null; }, pick);
    const rowOf = (p, pick) => pick === "last" ? p.locator(".mp-sec .mp-row.tap").last() : p.locator(".mp-sec .mp-row.tap", { has: p.locator(".n", { hasText: pick }) }).first();
    // one visit in a context of its own: the list, the row brought into view, the tap, Back, and 1.5 s later where the row stands
    const visit = async (base, pick, how, routes, wait = 1500) => { const { ctx, p, errs } = await page(b, devices["iPhone 13"], STORE);
      if (routes) await routes(p);
      await p.goto(base + "#watch", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-sec .mp-row.tap"); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p, 600);
      const row = rowOf(p, pick); await row.scrollIntoViewIfNeeded(); await settle(p, 250);
      const before = await rowTop(p, pick); await row.click(); await settle(p, 900);
      const opened = await p.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY) }));
      if (how === "page") await p.locator(".mp-head .mp-back").click(); else await p.goBack();
      await settle(p, wait); const after = await rowTop(p, pick), hash = await p.evaluate(() => location.hash);
      await ctx.close(); return { before, after, opened, hash, moved: before && after ? after.top - before.top : null, errs }; };
    const held = (v) => v.hash === "#watch" && v.moved != null && Math.abs(v.moved) <= 2 && v.opened.y === 0 && v.opened.hash !== "#watch" && v.errs.length === 0;
    { const vs = []; for (let k = 0; k < 10; k++) vs.push(await visit(MOCK, NK, "browser"));
      ck(`WATCHLIST › ${NK} (the ninth of ${vs[0].before?.rows} lines, brought into view at y ${vs[0].before?.y}) › its page (${vs[0].opened.hash}, at y ${vs[0].opened.y}) › the browser's Back: 1.5 s later the line is where it was, in ten fresh contexts of ten (moved ${vs.map((v) => v.moved).join(", ")} px; it stood 589 px higher)`, vs.length === 10 && vs.every(held) && vs[0].before.rows === 11 && vs[0].before.y > 100 && vs[0].opened.hash === "#asset/NKD%3DF", vs.filter((v) => !held(v)).slice(0, 3)); }
    { const vs = []; for (let k = 0; k < 2; k++) vs.push(await visit(MOCK, "last", "browser"));
      ck(`the list's last line (${vs[0].before?.name}, which opens ${vs[0].opened.hash}) › the browser's Back: where it was (moved ${vs.map((v) => v.moved).join(", ")} px)`, vs.every(held) && vs[0].before.name === "S&P 500" && vs[0].opened.hash === "#equities/spx", vs); }
    { const vs = []; for (let k = 0; k < 2; k++) vs.push(await visit(MOCK, NK, "page"));
      ck(`${NK} › the page's own Back: where it was, as before (moved ${vs.map((v) => v.moved).join(", ")} px)`, vs.every(held), vs); }
    // the list's answers 0.8 s late, as on the live site (B expected the same or worse there): the local copy's own answers, served by the suite
    { const { ctx: c0, p: p0 } = await page(b, devices["iPhone 13"], STORE); await fresh(p0, MOCK, "#watch", ".mp-sec .mp-row.tap");
      const ans = await p0.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return { watch_syms: mockAction("watch_syms"), watch_list: mockAction("watch_list"), watch_feed: mockAction("watch_feed"), table: mockAction("table"), stock: mockAction("stock", { symbol: "NKD=F" }) }; }); await c0.close();
      const late = (p, ms = {}) => p.route("**/fakeapi?*", async (r) => { const a = new URL(r.request().url()).searchParams.get("action"), now = "2026-11-23T23:10:00Z";
        const ok = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
        if (a in ans) { await new Promise((res) => setTimeout(res, ms[a] ?? (a === "watch_syms" ? 200 : 800))); return ok(ans[a]); }
        return ok(a === "health" ? { ok: true, at: now, tick: { lastAt: now, ageMin: 1, ok: true }, daily: { lastAt: now, ok: true }, sources: [], holidays: {}, holidaysVerified: true } : { rows: [] }); });
      const vs = []; for (let k = 0; k < 2; k++) vs.push(await visit(STANDIN, NK, "browser", async (p) => { await p.clock.setFixedTime(new Date("2026-11-23T23:10:00Z")); await late(p); }));
      ck(`the same with the list's answers 0.8 s late (the stand-in server): the browser's Back, and 1.5 s later the line is where it was (moved ${vs.map((v) => v.moved).join(", ")} px)`, vs.every(held) && vs[0].before?.rows === 11, vs);
      // the names 0.5 s late and the market table, which names each row's market for the "Closed now" line above the
      // list, a second after them: that line grows when the table comes, above the row that was tapped
      const vt = []; for (let k = 0; k < 2; k++) vt.push(await visit(STANDIN, NK, "browser", async (p) => { await p.clock.setFixedTime(new Date("2026-11-23T23:10:00Z")); await late(p, { watch_list: 500, watch_feed: 500, table: 1500 }); }, 3000));
      ck(`and with the names 0.5 s late and the market table 1.5 s late: 3 s after Back the line is where it was (moved ${vt.map((v) => v.moved).join(", ")} px)`, vt.every(held) && vt[0].before?.rows === 11, vt); }
  }

  await b.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
})();
