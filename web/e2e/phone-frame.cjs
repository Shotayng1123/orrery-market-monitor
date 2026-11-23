// The Home Screen app's frame (PNAV-1, 23 Nov 2026; web/src/lib/scroller.ts): in the app added to an iPhone's Home
// Screen the document no longer scrolls; the page scrolls in #pscroll and the tab bar is the last item of a column, so
// it stands at the window's foot whatever the page's scroll. On the owner's iPhone the fixed bar and the sticky heads
// moved with iOS's lagging layout viewport; this Chromium cannot draw that fault, so these checks say what the frame
// does here, not that it mends iOS. An iPhone 15 Pro at its whole screen, 393 x 852, opened from the Home Screen
// (navigator.standalone and display-mode standalone, as an iPhone reports them); the local copy stands in for an
// account in the preview list with `om_paper = "preview"`, as pf-preview.cjs does. Nothing here reads the machine's
// clock: every page sets `om_mock_now`.
//   [1] when it is on: the Home Screen app, the phone layout, the Monitor's page and the preview flag, all four; Safari's
//       tab, an account outside the list, the classic layout and a computer keep the page as it was
//   [2] the nine phone screens (the six tabs, a company page, PORTFOLIO with and without books) at the top, the middle
//       and the end: the bar's foot on the window's foot, the document never scrolled, the sticky head at the frame's
//       top, the footer whole above the bar at the end; a wheel scrolls the frame; a form's sticky foot on the bar
//       (2b), the window turned (2c), and printing, where the frame gives way (2d)
//   [3] a tab from the bar opens at its top; Back returns WATCHLIST and RESEARCH's list to where they stood
//   [4] every kind of sheet opens, holds the page still, and closes by ✕, by Back and by a tap outside, with the page
//       where it was and scrolling again
//   [5] search and the watchlist's add box; the connection bar and the paper book's notice stand above the bar
//   [6] the preview flag arriving after the page is drawn (the sign-in server, `me` answered late): the frame takes
//       over the reader's place, and the content stays where it was on the screen; signing out gives the window back
// Run from web/:  node e2e/run.cjs phone-frame   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", GATE = "http://localhost:5183/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1800)}`); };
const NOW = "2026-11-23T15:10:00Z", EMPTY = JSON.stringify({ seq: 0, consents: {}, books: [] });
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const near = (a, b, d = 1) => Math.abs(a - b) <= d;

/** A page. `home`: opened from the Home Screen; `ls`: storage set before the page loads (om_paper "preview" is the
 *  preview account); `phone`: false for a computer. */
async function open(b, { home = true, ls = { om_paper: "preview" }, phone = true, url = MOCK, hash = "market", sel = ".mp", route, wait = "networkidle" } = {}) {
  const ctx = await b.newContext(phone ? { ...devices["iPhone 15 Pro"], viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([now, ls, home]) => {
    try { localStorage.setItem("om_mock_now", now); localStorage.setItem("om_a2hs_hide", "1"); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } catch {}
    if (home) {
      Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true });
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => { const m = mm(q); return /display-mode:\s*standalone/.test(q) ? Object.assign(Object.create(m), { matches: true, media: q, addEventListener() {}, removeEventListener() {} }) : m; };
    }
  }, [NOW, ls, home]);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
  if (route) await route(p);
  await p.goto(url + "#" + hash, { waitUntil: wait });
  if (sel) await p.waitForSelector(sel, { timeout: 20000 });
  await p.addStyleTag({ content: "#mockbar{display:none!important}" });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const frames = (p, n = 2) => p.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const go = async (p, hash, sel) => {
  await p.evaluate((h) => new Promise((res) => { const drawn = () => requestAnimationFrame(() => requestAnimationFrame(() => res())); if (location.hash === `#${h}`) drawn(); else { addEventListener("hashchange", drawn, { once: true }); location.hash = h; } }), hash);
  if (sel) await p.waitForSelector(sel, { timeout: 20000 });
  await p.waitForTimeout(500);
};
/** The frame as drawn: whether it is on, the page's and the window's scroll, the bar, the first sticky head, the footer. */
const state = (p) => p.evaluate(() => {
  const s = document.getElementById("pscroll"), n = document.getElementById("pnav"), R = (e) => (e ? e.getBoundingClientRect() : null);
  const head = document.querySelector("#grid .mp-head"), foot = document.querySelector("#wrap > footer"), cs = s ? getComputedStyle(s) : null;
  const hr = R(head), nr = R(n), fr = R(foot), sr = R(s);
  return {
    on: document.documentElement.classList.contains("pframe"), box: cs ? cs.display : null, ov: cs ? cs.overflowY : null,
    winY: window.scrollY, docH: document.documentElement.scrollHeight, ih: innerHeight, top: s ? s.scrollTop : null, max: s ? s.scrollHeight - s.clientHeight : null,
    sTop: sr ? sr.top : null, sBottom: sr ? sr.bottom : null, bar: nr ? { top: nr.top, bottom: nr.bottom, pos: getComputedStyle(n).position } : null,
    head: hr ? { top: hr.top, h: hr.height, sticky: getComputedStyle(head).position, natural: head.offsetTop } : null, foot: fr ? { top: fr.top, bottom: fr.bottom } : null,
  };
});
const scrollFrame = (p, y) => p.evaluate((y) => { const s = document.getElementById("pscroll"); s.scrollTop = y === "end" ? s.scrollHeight : y; return s.scrollTop; }, y);

(async () => {
  const b = await chromium.launch();

  console.log("\n[1] when the frame is on");
  {
    const cases = [
      ["the Home Screen app, the phone layout, the preview account", {}, true],
      ["Safari's tab (not the Home Screen app), the preview account", { home: false }, false],
      ["the Home Screen app, an account outside the list (the local copy's default state)", { ls: {} }, false],
      ["the Home Screen app, the classic phone layout, the preview account", { ls: { om_paper: "preview", om_phone_v2: "0" }, sel: "#topbar" }, false],
      ["the Home Screen app on a computer (1440x900), the preview account", { phone: false, sel: "#topbar" }, false],
    ];
    for (const [name, o, want] of cases) {
      const { ctx, p, errs } = await open(b, o); const s = await state(p);
      const off = !s.on && s.box === "contents" && (s.bar == null || s.bar.pos === "fixed");
      ck(`${name}: ${want ? "on" : "off"} (pframe ${s.on}, #pscroll ${s.box}, the bar ${s.bar ? s.bar.pos : "not drawn"})`, (want ? s.on && s.box === "block" && s.bar?.pos === "relative" : off) && !errs.length, { s, errs });
      await ctx.close();
    }
  }

  console.log("\n[2] the nine phone screens at the top, the middle and the end");
  {
    const SCREENS = [["MARKETS", "market", ".mp"], ["NEWS", "news", ".mp"], ["RESEARCH", "research", ".rs-row"], ["EQUITIES", "equities", ".mp"], ["RATES & FX", "rates", ".mp"],
      ["WATCHLIST", "watch", ".mp-row.tap"], ["a company page (7203.T)", "asset/7203.T", ".mp-hero"], ["PORTFOLIO without books", "portfolio", "#pf-cards", { om_paper: "preview", om_mock_pf: EMPTY }], ["PORTFOLIO with books", "portfolio/all", "#pf-list, .pfp-list, .mp"]];
    for (const [name, hash, sel, ls] of SCREENS) {
      const { ctx, p, errs } = await open(b, { hash, sel, ls: ls ?? { om_paper: "preview" } });
      const seen = [];
      for (const where of ["top", "middle", "end"]) {
        const m0 = await state(p), y = where === "top" ? 0 : where === "middle" ? Math.round(m0.max / 2) : "end";
        await scrollFrame(p, y); await frames(p); const s = await state(p); seen.push({ where, ...s });
        const barOk = s.bar && near(s.bar.bottom, s.ih, 0.5) && near(s.bar.bottom - s.bar.top, 59, 0.5) && near(s.sBottom, s.bar.top, 0.5);
        const still = s.winY === 0 && s.docH <= s.ih;
        // the head sticks at the frame's top once the page has scrolled past its own place; above that it stands in it
        const headOk = !s.head || s.head.sticky !== "sticky" || (s.top > s.head.natural + 1 ? near(s.head.top, s.sTop, 0.5) : s.head.top >= s.sTop - 0.5);
        const footOk = where !== "end" || (s.foot && s.foot.top >= s.sTop - 0.5 && s.foot.bottom <= s.bar.top + 0.5 && near(s.top, s.max, 1));
        ck(`${name}, ${where} (frame at ${Math.round(s.top)} of ${s.max}): the bar ${Math.round(s.bar?.top)}-${Math.round(s.bar?.bottom)} on the window's foot ${s.ih}, the document at ${s.winY}${s.head ? `, the head at ${Math.round(s.head.top)}` : ""}${where === "end" && s.foot ? `, the footer ${Math.round(s.foot.top)}-${Math.round(s.foot.bottom)} above the bar` : ""}`,
          s.on && barOk && still && headOk && footOk, s);
      }
      // a wheel over the page scrolls the frame and never the document
      // (over the header: a box of the page that scrolls by itself, a calendar or a table, takes a wheel first)
      await scrollFrame(p, 0); await p.mouse.move(150, 26); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(40); }
      await p.waitForTimeout(350); const w = await state(p);
      ck(`${name}: a wheel scrolls the frame (to ${Math.round(w.top)} of ${w.max}), the document stays at ${w.winY}, the bar stays on the foot`, w.top >= Math.min(100, w.max) - 0.5 && w.winY === 0 && near(w.bar.bottom, w.ih, 0.5), w);
      ck(`${name}: no error on the page`, !errs.length, errs);
      await ctx.close();
    }
  }

  console.log("\n[2b] a form's foot (sticky to the bottom) stands on the tab bar");
  {
    const { ctx, p, errs } = await open(b, { hash: "portfolio/new/ar-ls-jp", sel: "#pf-review" });
    for (const where of ["top", "middle", "end"]) {
      const m0 = await state(p); await scrollFrame(p, where === "top" ? 0 : where === "middle" ? Math.round(m0.max / 2) : "end"); await frames(p);
      const s = await state(p), f = await p.evaluate(() => { const e = document.querySelector(".pfp-foot"), r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, natural: e.offsetTop + e.offsetHeight }; });
      // the foot stands on the frame's foot (the bar's top) wherever the page is, and comes to its own place at the end
      const ok = f.bottom <= s.bar.top + 0.5 && (where === "end" ? f.top >= s.sTop : near(f.bottom, s.sBottom, 0.5)) && s.winY === 0;
      ck(`the new book's form, ${where} (frame at ${Math.round(s.top)} of ${s.max}): its foot ${Math.round(f.top)}-${Math.round(f.bottom)}, the bar's top ${Math.round(s.bar.top)}`, ok, { f, s });
    }
    ck("no error on the page", !errs.length, errs);
    await ctx.close();
  }

  console.log("\n[2c] the frame follows the window: turned on its side and back");
  {
    const { ctx, p, errs } = await open(b, { hash: "rates", sel: ".mp" });
    await scrollFrame(p, 600); await frames(p);
    for (const [w, h, name] of [[852, 393, "on its side, 852 x 393"], [393, 852, "upright again, 393 x 852"]]) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500);
      const s = await state(p);
      ck(`${name}: the bar ${Math.round(s.bar.top)}-${Math.round(s.bar.bottom)} on the window's foot ${s.ih}, the frame ${Math.round(s.sBottom)} tall, the document at ${s.winY}`, s.on && near(s.bar.bottom, s.ih, 0.5) && near(s.sBottom, s.bar.top, 0.5) && s.winY === 0 && s.docH <= s.ih, s);
    }
    ck("no error on the page", !errs.length, errs);
    await ctx.close();
  }

  console.log("\n[2d] printing a piece (RESEARCH's PDF): the frame gives way to the whole page");
  {
    const { ctx, p, errs } = await open(b, { hash: "research", sel: ".rs-row" });
    await p.locator(".rs-row").first().click(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(400);
    await p.emulateMedia({ media: "print" }); await p.waitForTimeout(200);
    const pr = await p.evaluate(() => ({ box: getComputedStyle(document.getElementById("pscroll")).display, ov: getComputedStyle(document.documentElement).overflowY, docH: document.documentElement.scrollHeight, ih: innerHeight }));
    await p.emulateMedia({ media: "screen" }); await p.waitForTimeout(200); const back = await state(p);
    ck(`printing: #pscroll ${pr.box}, the page's overflow ${pr.ov}, the piece ${pr.docH} px long over a ${pr.ih}-px window; on the screen again the frame is back (${back.box})`, pr.box === "contents" && pr.ov === "visible" && pr.docH > pr.ih && back.on && back.box === "block", { pr, back });
    ck("no error on the page", !errs.length, errs);
    await ctx.close();
  }

  console.log("\n[3] a tab opens at its top; Back returns a list to where it stood");
  {
    const { ctx, p, errs } = await open(b, { hash: "market" });
    const s0 = await state(p); await scrollFrame(p, Math.round(s0.max / 2)); await frames(p);
    await p.locator('#pnav a[href="#news"]').click(); await p.waitForSelector('#grid[data-view="news"]'); await p.waitForTimeout(500);
    const a = await state(p);
    ck(`MARKETS at ${Math.round(s0.max / 2)} › NEWS from the bar: NEWS opens at its top (${a.top}), the document at ${a.winY}`, a.top === 0 && a.winY === 0, a);
    await scrollFrame(p, 900); await frames(p); await p.locator('#pnav a[href="#news"]').click(); await p.waitForTimeout(400);
    const a2 = await state(p); ck(`NEWS at 900 › NEWS again from the bar: back to its top (${a2.top})`, a2.top === 0, a2);
    // WATCHLIST › a company › Back (the page's own and the browser's): the last company of "My names" (a symbol with no
    // "^" or "=": not an index, a currency or a future), brought to the middle of the frame so that the list stands well
    // down
    await go(p, "watch", ".mp-row.tap");
    for (const how of ["the page's ‹ button", "the browser's Back"]) {
      const sym = await p.evaluate(() => { const s = document.getElementById("pscroll"), rows = [...document.querySelectorAll(".mp-sec")].slice(0, 1).flatMap((x) => [...x.querySelectorAll(".mp-row.tap")]);
        const symOf = (r) => (r.innerText.split("\n").find((l) => / · /.test(l)) ?? "").split(" · ")[0].trim();
        const co = rows.filter((r) => !!symOf(r) && !/[=^]/.test(symOf(r)));
        const r = co[co.length - 1] ?? rows[rows.length - 1]; r.setAttribute("data-pick", "1"); s.scrollTop += r.getBoundingClientRect().top - 400; return symOf(r); });
      await p.waitForTimeout(250);
      const row = p.locator("[data-pick]"), y = (await state(p)).top, name = (await row.locator(".n").textContent())?.trim();
      await row.click(); await p.waitForFunction(() => location.hash !== "#watch", null, { timeout: 15000 }); await p.waitForTimeout(900);
      const c = await state(p), h1 = await p.evaluate(() => ({ text: document.querySelector(".mp-doc h1")?.textContent ?? null, hash: decodeURIComponent(location.hash), hero: !!document.querySelector(".mp-hero") }));
      ck(`WATCHLIST at ${Math.round(y)} › ${name} (${sym}): the company's page opens at its top (${c.top}), "${h1.text}" (${h1.hash})`, y > 100 && c.top === 0 && c.winY === 0 && h1.hash === `#asset/${sym}` && h1.hero && !!h1.text, { y, c, h1, sym });
      const own = how !== "the browser's Back" && (await p.locator(".mp-head .mp-back").count()) > 0;
      if (own) await p.locator(".mp-head .mp-back").click(); else await p.goBack();
      await p.waitForSelector('#grid[data-view="watch"] .mp-row.tap'); await p.waitForTimeout(1200);
      await p.evaluate(() => document.querySelector("[data-pick]")?.removeAttribute("data-pick"));
      const back = await state(p);
      ck(`Back by ${own ? how : "the browser's Back"}: WATCHLIST where it stood (${Math.round(back.top)} against ${Math.round(y)}), the document at ${back.winY}`, near(back.top, y, 2) && back.winY === 0, { back, y });
    }
    // RESEARCH's list › a piece › Back
    await go(p, "research", ".rs-row");
    const piece = p.locator(".rs-row").nth(14); await piece.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    const ry = (await state(p)).top; await piece.click(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(500);
    const rd = await state(p);
    ck(`RESEARCH's list at ${Math.round(ry)} › a piece: it opens at its top (${rd.top})`, ry > 100 && rd.top === 0 && rd.winY === 0, { ry, rd });
    await p.goBack(); await p.waitForSelector(".rs-row"); await p.waitForTimeout(900);
    const rb = await state(p);
    ck(`Back: RESEARCH's list where it stood (${Math.round(rb.top)} against ${Math.round(ry)})`, near(rb.top, ry, 2) && rb.winY === 0, { rb, ry });
    ck("no error on the page", !errs.length, errs);
    await ctx.close();
  }

  console.log("\n[4] every kind of sheet: it opens, the page holds still, and it closes by ✕, Back and a tap outside");
  {
    const SHEETS = [
      ["Preview (PORTFOLIO's first line)", "portfolio", "#pf-cards", "#pf-preview", EMPTY],
      ["PAPER (a book's mark)", `portfolio/${ID(1)}`, "#pf-switch", "#pf-paper"],
      ["the book switch", `portfolio/${ID(1)}`, "#pf-switch", "#pf-switch"],
      ["Whose it is (a value's tag)", "portfolio/new/ar-ls-jp/edit/targets", "#pf-equiv", '[data-row="band"] .pf-tap.by'],
      ["a setting's change (a sheet with a foot)", `portfolio/${ID(1)}/settings`, "[data-sec]", '[data-sec="limits"] button.pfp-set[data-row="one_long"]'],
      ["Source (a \"personal use\" line)", "equities/topix", ".psrc", ".psrc"],
    ];
    for (const [name, hash, ready, trigger, store] of SHEETS) {
      const { ctx, p, errs } = await open(b, { hash, sel: ready, ls: { om_paper: "preview", ...(store ? { om_mock_pf: store } : {}) } });
      const res = [];
      for (const how of ["✕", "Back", "a tap outside"]) {
        const t = p.locator(trigger).first(); await t.scrollIntoViewIfNeeded();
        // the page a little scrolled, where the frame can: the sheet must leave it there
        await p.evaluate((sel) => { const s = document.getElementById("pscroll"), e = document.querySelector(sel); const r = e.getBoundingClientRect(); s.scrollTop += Math.max(0, r.top - 300); }, trigger); await frames(p);
        const before = await state(p), hashBefore = await p.evaluate(() => location.hash);
        await t.click(); await p.waitForSelector(".sheet", { timeout: 8000 }); await p.waitForTimeout(350);
        const during = await state(p);
        // a wheel over the dimmed page: nothing under it moves
        await p.mouse.move(196, 60); await p.mouse.wheel(0, 400); await p.waitForTimeout(300); const wheeled = await state(p);
        if (how === "✕") await p.locator(".sheet-head .x").click();
        else if (how === "Back") await p.goBack();
        else await p.mouse.click(196, 30);
        await p.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(700);
        const after = await state(p), gone = await p.evaluate(() => !document.querySelector(".sheet")), hashAfter = await p.evaluate(() => location.hash);
        await p.mouse.move(196, 420); await p.mouse.wheel(0, -60); await p.waitForTimeout(300); const moved = await state(p);
        res.push({ how, before: before.top, during: { ov: during.ov, top: during.top, winY: during.winY }, wheeled: wheeled.top, after: { ov: after.ov, top: after.top, winY: after.winY }, gone, hashBefore, hashAfter, moved: moved.top, max: after.max });
        const ok = during.ov === "hidden" && near(during.top, before.top) && near(wheeled.top, before.top) && wheeled.winY === 0 && gone && after.ov === "auto" && near(after.top, before.top) && after.winY === 0 && hashAfter === hashBefore && (before.top < 1 || moved.top < after.top);
        ck(`${name}, closed by ${how}: held still while open (overflow ${during.ov}, ${Math.round(during.top)} → ${Math.round(wheeled.top)} under a wheel), closed with the page at ${Math.round(after.top)} (was ${Math.round(before.top)}) and scrolling again`, ok, res[res.length - 1]);
      }
      ck(`${name}: no error on the page`, !errs.length, errs);
      await ctx.close();
    }
  }

  console.log("\n[5] search, the watchlist's add box, and what stands above the bar");
  {
    const { ctx, p, errs } = await open(b, { hash: "market" });
    await p.locator('#pv2-btns button[aria-label="Search stocks, bonds, currencies"]').click(); await p.waitForSelector("#topbar.open #search input");
    await p.locator("#search input").fill("toyota"); await p.waitForSelector(".sres .sitem:not(.mut)", { timeout: 8000 });
    const res = await p.evaluate(() => { const r = document.querySelector(".sres").getBoundingClientRect(); return { n: document.querySelectorAll(".sres .sitem:not(.mut)").length, top: r.top, bottom: r.bottom }; });
    await p.locator(".sres .sitem:not(.mut)").first().dispatchEvent("mousedown"); await p.waitForSelector(".mp-hero", { timeout: 15000 }); await p.waitForTimeout(500);
    const s = await state(p), hash = await p.evaluate(() => location.hash);
    ck(`search: "toyota" lists ${res.n} names in view (${Math.round(res.top)}-${Math.round(res.bottom)}), and the first opens its page at its top (${hash}, frame at ${s.top})`, res.n > 0 && res.bottom <= s.bar.top && /^#asset\//.test(hash) && s.top === 0 && s.winY === 0, { res, s, hash });
    await go(p, "watch", ".mp-row.tap");
    const box = p.locator("#wl-add"); await box.scrollIntoViewIfNeeded(); await box.click(); await box.fill("toyo");
    await p.waitForSelector("#wl-cands .mp-cand .n", { timeout: 8000 }); await p.waitForTimeout(300);
    const wl = await p.evaluate(() => { const i = document.querySelector("#wl-add").getBoundingClientRect(), c = document.querySelector("#wl-cands").getBoundingClientRect(); return { focus: document.activeElement?.id, input: [i.top, i.bottom], cands: [c.top, c.bottom], n: document.querySelectorAll("#wl-cands .mp-cand").length }; });
    const s2 = await state(p);
    ck(`the watchlist's add box: typed into (focus ${wl.focus}), ${wl.n} candidates under it, the box in view (${Math.round(wl.input[0])}-${Math.round(wl.input[1])}), the document at ${s2.winY}`, wl.focus === "wl-add" && wl.n > 0 && wl.input[0] >= s2.sTop && wl.input[1] <= s2.bar.top && s2.winY === 0, { wl, s2 });
    // the connection bar (#footbars) and the paper book's notice (.pf-flash) stand above the bar, as before
    await ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event("offline"))); await p.waitForSelector("#footbars #netbar", { timeout: 8000 }); await p.waitForTimeout(300);
    const fb = await p.evaluate(() => { const f = document.querySelector("#footbars > div").getBoundingClientRect(), n = document.querySelector("#pnav").getBoundingClientRect(); return { bottom: f.bottom, top: f.top, bar: n.top }; });
    ck(`the connection bar stands above the tab bar (its foot ${Math.round(fb.bottom)}, the bar's top ${Math.round(fb.bar)})`, fb.bottom <= fb.bar && fb.top > 0, fb);
    await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await go(p, "portfolio/all", "#pf-list, .mp");
    // the notice through the page's own module (the address the page loaded it from: a development server that has
    // hot-updated a file serves it with a ?t= stamp, and a bare import would be another copy with no notice on screen)
    await p.evaluate(async () => {
      const u = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/src/components/pf/shared.tsx")).pop() ?? "/orrery-market-monitor/src/components/pf/shared.tsx";
      const m = await import(u); m.flash("A stand-in notice for this check.");
    });
    await p.waitForSelector(".pf-flash", { timeout: 5000 }); await p.waitForTimeout(200);
    const fl = await p.evaluate(() => { const f = document.querySelector(".pf-flash").getBoundingClientRect(), n = document.querySelector("#pnav").getBoundingClientRect(); return { bottom: f.bottom, bar: n.top }; });
    ck(`the paper book's notice stands above the tab bar (its foot ${Math.round(fl.bottom)}, the bar's top ${Math.round(fl.bar)})`, fl.bottom <= fl.bar, fl);
    ck("no error on the page", !errs.length, errs);
    await ctx.close();
  }

  console.log("\n[6] the preview flag arriving after the page is drawn (the sign-in server; `me` answered late)");
  {
    let release; const held = new Promise((r) => { release = r; });
    const tokenFor = (id) => Buffer.from(JSON.stringify({ id })).toString("base64") + ".sig";
    const route = async (p) => {
      await routes(p);
      await p.route("**/fakeapi?*", async (r) => {
        if (new URL(r.request().url()).searchParams.get("action") !== "me") return r.fallback();
        if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
        await held;
        return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ email: "preview@example.com", role: "user", mustChange: false, paperPreview: true }) });
      });
    };
    // (`me` is held, so the page is never idle on the network until it is let go)
    const { ctx, p, errs } = await open(b, { url: GATE, hash: "news", sel: ".mp .mp-sec", ls: { om_token: tokenFor("preview@example.com") }, route, wait: "domcontentloaded" });
    await p.waitForTimeout(1200);
    const s0 = await state(p);
    await p.evaluate(() => window.scrollTo(0, 700)); await frames(p);
    // what stands at the middle of the screen, and the header, before the word comes
    const mark = await p.evaluate(() => { const e = document.elementFromPoint(196, 420); e.setAttribute("data-mark", "1"); const t = document.querySelector("#topbar").getBoundingClientRect(); return { top: e.getBoundingClientRect().top, tag: e.tagName, head: t.height, y: window.scrollY }; });
    release(); await p.waitForFunction(() => document.documentElement.classList.contains("pframe"), null, { timeout: 8000 }).catch(() => undefined); await frames(p, 3);
    const s1 = await state(p), after = await p.evaluate(() => ({ top: document.querySelector("[data-mark]")?.getBoundingClientRect().top ?? null, head: document.querySelector("#topbar").getBoundingClientRect().height }));
    const moved = after.top - mark.top, headChange = after.head - mark.head;
    ck(`before the word: the window scrolls, the bar fixed at the foot (frame ${s0.on}, bar ${Math.round(s0.bar?.bottom)} of ${s0.ih})`, !s0.on && s0.bar?.pos === "fixed" && near(s0.bar.bottom, s0.ih, 0.5), s0);
    ck(`the word comes at the window's ${mark.y}: the frame is on and holds the place (frame at ${Math.round(s1.top)}, the document at ${s1.winY}), the content moved ${moved.toFixed(1)} px on the screen (the header changed ${headChange.toFixed(1)} px)`,
      s1.on && s1.winY === 0 && near(s1.top, mark.y, 1) && after.top != null && Math.abs(moved) <= Math.abs(headChange) + 1 && near(s1.bar.bottom, s1.ih, 0.5), { s1, mark, after });
    await p.evaluate(() => window.dispatchEvent(new Event("om:unauth"))); await p.waitForSelector(".gatewrap .modal", { timeout: 8000 }); await p.waitForTimeout(300);
    const out = await p.evaluate(() => ({ on: document.documentElement.classList.contains("pframe"), ov: getComputedStyle(document.documentElement).overflowY }));
    ck(`signing out: the sign-in screen without the frame (pframe ${out.on}, html overflow ${out.ov})`, !out.on && out.ov === "visible", out);
    ck("no error on the page", !errs.length, errs);
    await ctx.close();
  }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
