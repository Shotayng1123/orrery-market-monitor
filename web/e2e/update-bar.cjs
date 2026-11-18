// The "a new version is ready" bar.
// Run from web/:  node e2e/run.cjs update-bar   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const fs = require("fs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", PREVIEW = "http://localhost:5187/orrery-market-monitor/";
const DIST = require("path").join(__dirname, ".dist", "version.json");
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const bar = (p) => p.evaluate(() => { const b = document.querySelector("#updbar"); if (!b) return null; const r = b.getBoundingClientRect(), g = b.querySelector("button").getBoundingClientRect(), nav = document.querySelector("#pnav")?.getBoundingClientRect(); return { text: b.querySelector("span").textContent, btn: b.querySelector("button").textContent, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, btnH: Math.round(g.height), navTop: nav ? Math.round(nav.top) : null, font: parseFloat(getComputedStyle(b).fontSize), overflowX: document.documentElement.scrollWidth - innerWidth }; });
const look = (p) => p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
(async () => { const b = await chromium.launch();
  for (const [name, opts, phone] of [["iPhone 13", { ...devices["iPhone 13"] }, true], ["laptop 1440×900", { viewport: { width: 1440, height: 900 } }, false]]) { console.log(`\n[${name}, dev server]`);
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    let answer = null; const asked = [];
    await p.route("**/version.json*", (r) => { asked.push(r.request().url()); if (answer == null) return r.fulfill({ status: 404, body: "not found" }); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: answer, at: new Date().toISOString() }) }); });
    await p.goto(MOCK + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800);
    const mine = await p.evaluate(() => document.documentElement.dataset.build);
    ck("the page knows its own build, and asks for version.json past the caches when it opens", !!mine && asked.length >= 1 && /version\.json\?t=\d+$/.test(asked[0]), { mine, asked });
    ck("no version file (a dev server): no bar", (await bar(p)) === null);
    answer = mine; await look(p); await p.waitForTimeout(500); ck("the published build is this one: no bar", (await bar(p)) === null);
    answer = "newbuild0001"; await look(p); await p.waitForTimeout(600); const c = await bar(p); await p.screenshot({ path: `upd-${phone ? "phone" : "laptop"}.png` });
    ck("a newer build is published: the bar appears when the page comes back into view", !!c && /new version/i.test(c.text) && c.btn === "Update", c);
    ck(phone ? `on the phone it sits above the tab bar, inside the screen, with a ${c?.btnH}px button` : "on a laptop it sits at the foot of the window, centred", !!c && c.left >= 0 && c.right <= c.vw && c.overflowX <= 0 && (phone ? c.bottom <= c.navTop - 4 && c.btnH >= 44 && c.font >= 13 : c.bottom <= c.vh && Math.abs((c.left + c.right) / 2 - c.vw / 2) <= 2), c);
    await p.evaluate(() => { window.__same = true; }); const nav = p.waitForNavigation({ waitUntil: "load" }); await p.locator("#updbar button").click(); const resp = await nav; await p.waitForSelector("#topbar"); await p.waitForTimeout(700);
    const after = await p.evaluate(() => ({ reloaded: window.__same !== true, url: location.href.replace(location.origin, ""), tried: JSON.parse(sessionStorage.getItem("om_upd_tried") || "null")?.id }));
    ck("Update: the page is loaded again from a new address (?v=…), which is then tidied away; the tab is kept", after.reloaded && /\?v=newbuild0001/.test(resp.url()) && after.url === "/orrery-market-monitor/#news" && after.tried === "newbuild0001", { after, loaded: resp.url() });
    await look(p); await p.waitForTimeout(500); ck("if the page that came back is still the old build, the same update is not offered again at once", (await bar(p)) === null);
    answer = "newbuild0002"; await look(p); await p.waitForTimeout(500); ck("a further build is offered", (await bar(p)) !== null);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the built site, as published]");
  { const original = fs.readFileSync(DIST, "utf8"); const built = JSON.parse(original).id;
    try { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(PREVIEW, { waitUntil: "networkidle" }); await p.waitForSelector(".gatewrap .modal"); await p.waitForTimeout(700);
      const mine = await p.evaluate(() => document.documentElement.dataset.build);
      ck(`the page's build id is the one in version.json (${built})`, mine === built && (await bar(p)) === null, { mine, built });
      fs.writeFileSync(DIST, JSON.stringify({ id: "published-later", at: new Date().toISOString() }) + "\n"); await look(p); await p.waitForTimeout(700); const c = await bar(p); await p.screenshot({ path: "upd-gate.png" });
      ck("a later build is published while the sign-in screen is open: the bar appears there too", !!c && c.right <= c.vw && c.bottom <= c.vh && c.btnH >= 44, c);
      const nav = p.waitForNavigation({ waitUntil: "load" }); await p.locator("#updbar button").tap(); await nav; await p.waitForSelector(".gatewrap .modal"); await p.waitForTimeout(500);
      ck("Update reloads the sign-in screen", /\/orrery-market-monitor\/$/.test(p.url()) && errs.length === 0, { url: p.url(), errs }); await ctx.close(); }
    finally { fs.writeFileSync(DIST, original); } }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
