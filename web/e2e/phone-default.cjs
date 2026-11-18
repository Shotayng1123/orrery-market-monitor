// The phone layout is the default on a phone; the sign-in and account windows at phone size.
// Run from web/:  node e2e/run.cjs phone-default   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", GATE = "http://localhost:5183/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const state = (p) => p.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !!e && e.getBoundingClientRect().height > 0; }; let stored = "blocked"; try { stored = localStorage.getItem("om_phone_v2"); } catch {}
  return { pv2: document.body.classList.contains("pv2"), zoom: document.body.style.zoom || "", tabs: document.querySelectorAll("#pnav a").length, mp: !!document.querySelector(".mp"), stored, newBtn: v("#pv2-on"), nav: v("#nav"), search: location.search, overflowX: document.documentElement.scrollWidth - innerWidth }; });
const token = Buffer.from(JSON.stringify({ id: "reader@example.com" })).toString("base64") + ".sig";
// the stand-in API with a sign-in: an ordinary account (role "user", not a manager)
const signIn = async (p, role = "user") => { await routes(p); await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); const ok = (b) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(b) });
  if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  if (a === "login") return ok({ token }); if (a === "me") return ok({ email: "reader@example.com", role, mustChange: false }); return r.fallback(); }); };
(async () => { const b = await chromium.launch();
  console.log("\n[an app just added to the Home Screen: empty storage, the plain address, an ordinary account]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await signIn(p);
    await p.goto(GATE, { waitUntil: "networkidle" }); await p.waitForSelector(".gatewrap .modal"); await p.waitForTimeout(700);
    const g = await p.evaluate(() => { const m = document.querySelector(".gatewrap .modal").getBoundingClientRect(); const fs = [...document.querySelectorAll(".gatewrap input[type=email], .gatewrap input[type=password]")].map((i) => parseFloat(getComputedStyle(i).fontSize) * (Number(document.body.style.zoom) || 1)); const go = document.querySelector(".gatewrap button.go").getBoundingClientRect();
      return { left: Math.round(m.left), right: Math.round(m.right), vw: innerWidth, bottom: Math.round(go.bottom), vh: innerHeight, goH: Math.round(go.height), inputPx: Math.min(...fs), zoom: document.body.style.zoom, overflowX: document.documentElement.scrollWidth - innerWidth }; });
    await p.screenshot({ path: "def-gate.png" });
    ck(`sign-in screen at phone size (card ${g.left}–${g.right}px of ${g.vw}px, fields ${g.inputPx}px, SIGN IN button ${g.goH}px tall and on the first screen)`, g.left >= 0 && g.right <= g.vw && g.overflowX <= 0 && g.bottom <= g.vh && g.goH >= 44 && g.inputPx >= 16, g);
    await p.locator(".gtabs span").nth(1).tap(); await p.waitForTimeout(300); const up = await p.evaluate(() => { const go = document.querySelector(".gatewrap button.go").getBoundingClientRect(), m = document.querySelector(".gatewrap .modal").getBoundingClientRect(); return { fields: document.querySelectorAll(".gatewrap input:not([type=checkbox])").length, tabH: Math.round(document.querySelector(".gtabs span").getBoundingClientRect().height), goBottom: Math.round(go.bottom), vh: innerHeight, cardTop: Math.round(m.top) }; }); await p.screenshot({ path: "def-gate-create.png" });
    ck(`CREATE ACCOUNT: three fields, the tabs ${up.tabH}px tall, the whole card on the screen`, up.fields === 3 && up.tabH >= 44 && up.goBottom <= up.vh && up.cardTop >= 0, up); await p.locator(".gtabs span").nth(0).tap(); await p.waitForTimeout(200);
    await p.locator("#g-id").fill("reader@example.com"); await p.locator("#g-pw").fill("a-password"); await p.locator(".gatewrap button.go").tap(); await p.waitForSelector("#topbar"); await p.waitForTimeout(1200);
    const s1 = await state(p); await p.screenshot({ path: "def-home.png" });
    ck("after sign-in the app opens in the phone layout, with nothing stored and no parameter in the address", s1.pv2 && s1.zoom === "1" && s1.tabs === 6 && s1.mp && s1.stored === null && s1.search === "" && s1.overflowX <= 0, s1);
    await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(400);
    const menu = await p.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !!e && e.getBoundingClientRect().height > 0; }; return { off: v("#pv2-off"), account: v("#userchip"), chip: document.querySelector("#userchip")?.textContent }; });
    ck("its menu has CLASSIC LAYOUT and the account", menu.off && menu.account, menu);
    await p.locator("#userchip").tap(); await p.waitForTimeout(600);
    const acct = await p.evaluate(() => { const m = document.querySelector(".modal"); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, text: m.textContent.slice(0, 60), overflowX: document.documentElement.scrollWidth - innerWidth }; });
    await p.screenshot({ path: "def-account.png" });
    const ac2 = await p.evaluate(() => { const m = document.querySelector(".modal"); const r = m.getBoundingClientRect(); return { inputPx: Math.min(...[...m.querySelectorAll("input")].map((i) => parseFloat(getComputedStyle(i).fontSize))), btnH: Math.min(...[...m.querySelectorAll("button.go")].map((x) => Math.round(x.getBoundingClientRect().height))), xH: Math.round(m.querySelector("h3 .x").getBoundingClientRect().height), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
    ck(`the account window at phone size (fields ${ac2.inputPx}px, buttons ${ac2.btnH}px, close ${ac2.xH}px, all on the screen)`, !!acct && acct.left >= 0 && acct.right <= acct.vw && acct.overflowX <= 0 && ac2.inputPx >= 16 && ac2.btnH >= 44 && ac2.xH >= 44 && ac2.top >= 0 && ac2.bottom <= ac2.vh, { acct, ac2 });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200); if (await p.locator(".modal").count()) { const x = p.locator(".modal .x, .modal [aria-label=Close], .modal button.ghost").first(); if (await x.count()) await x.tap(); else await p.mouse.click(5, 5); await p.waitForTimeout(300); }
    const closed = (await p.locator(".modal").count()) === 0; ck("the account window closes", closed);
    if (!(await p.locator("#pv2-off").isVisible().catch(() => false))) { await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); }
    await p.locator("#pv2-off").tap(); await p.waitForTimeout(900); const s2 = await state(p);
    ck("CLASSIC LAYOUT: the earlier layout, remembered on this device", !s2.pv2 && s2.zoom === "0.88" && s2.tabs === 0 && s2.nav && s2.stored === "0", s2);
    await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800); const s3 = await state(p);
    ck("closing and reopening keeps the classic layout, and NEW LAYOUT is offered to an ordinary account", !s3.pv2 && s3.stored === "0" && s3.newBtn, s3);
    await p.locator("#pv2-on").tap(); await p.waitForTimeout(900); const s4 = await state(p);
    ck("NEW LAYOUT: back to the phone layout", s4.pv2 && s4.tabs === 6 && s4.stored === "1", s4);
    await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800); const s5 = await state(p); ck("and it stays after reopening", s5.pv2 && s5.tabs === 6, s5);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[every tab opens in the phone layout on a phone with empty storage]");
  for (const dev of ["iPhone 13", "Pixel 7", "iPhone 13 landscape"]) { const ctx = await b.newContext({ ...devices[dev] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); const bad = [];
    for (const h of ["", "#market", "#news", "#research", "#equities", "#rates", "#watch", "#asset/7203.T"]) { await p.goto(MOCK + h, { waitUntil: "networkidle" }); if (h === "") await p.waitForSelector("#topbar"); await p.waitForTimeout(700); const s = await state(p); if (!(s.pv2 && s.mp && s.tabs === 6 && s.overflowX <= 0 && s.stored === null)) bad.push({ h, s }); }
    ck(`${dev}: the start page, six tabs and a stock page`, bad.length === 0 && errs.length === 0, { bad, errs }); await ctx.close(); }

  console.log("\n[choices made earlier are respected; the address parameter still switches]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); await ctx.addInitScript(() => { if (localStorage.getItem("om_phone_v2") == null && !sessionStorage.getItem("seeded")) { localStorage.setItem("om_phone_v2", "0"); sessionStorage.setItem("seeded", "1"); } }); const p = await ctx.newPage();
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(700); const s = await state(p);
    ck("a phone that had picked CLASSIC LAYOUT stays on it", !s.pv2 && s.stored === "0" && s.newBtn, s); await ctx.close(); }
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage();
    await p.goto(MOCK + "?phone=old#news", { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(700); const a = await state(p);
    await p.goto(MOCK + "?phone=new#news", { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(700); const c = await state(p);
    ck("?phone=old gives the classic layout, ?phone=new the phone layout; the parameter leaves the address", !a.pv2 && a.stored === "0" && a.search === "" && c.pv2 && c.stored === "1" && c.search === "" && p.url().endsWith("#news"), { a, c, url: p.url() }); await ctx.close(); }

  console.log("\n[a browser that will not store anything]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }); }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800); const a = await state(p);
    await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); await p.locator("#pv2-off").tap(); await p.waitForTimeout(800); const c = await state(p);
    await p.locator("#pv2-on").tap(); await p.waitForTimeout(800); const d = await state(p);
    ck("opens in the phone layout; CLASSIC LAYOUT and NEW LAYOUT still switch for the visit", a.pv2 && a.tabs === 6 && a.stored === "blocked" && !c.pv2 && c.newBtn && d.pv2 && errs.length === 0, { a, c, d, errs }); await ctx.close(); }

  console.log("\n[not a phone: unchanged]");
  for (const [name, opts] of [["iPad (gen 7)", { ...devices["iPad (gen 7)"] }], ["iPad landscape", { ...devices["iPad (gen 7) landscape"] }], ["laptop 1440×900", { viewport: { width: 1440, height: 900 } }], ["desktop 1920×1080", { viewport: { width: 1920, height: 1080 } }]]) { const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(700); const s = await state(p); const sw = await p.evaluate(() => !!document.querySelector("#pv2-on, #pv2-off"));
    ck(`${name}: the desktop layout, no bottom bar, no layout switch`, !s.pv2 && !s.mp && s.tabs === 0 && s.nav && !sw && errs.length === 0, { s, sw, errs }); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
