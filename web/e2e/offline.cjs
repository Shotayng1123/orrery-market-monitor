// Opening without a connection: the service worker and the kept data.
// Run from web/:  node e2e/run.cjs offline   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const fs = require("fs"); const { routes } = require("./harness.cjs");
// the bar's items on the site as published: six while the paper book's switch is off, seven once it is on
// (PAPER_ON_LIVE_SITE in src/lib/paper.ts, read as local-copy.cjs reads it: PC-8, DC-2 of the second review of P-1)
const BAR_ITEMS = /^export const PAPER_ON_LIVE_SITE = true;/m.test(require("fs").readFileSync(require("path").join(__dirname, "..", "src", "lib", "paper.ts"), "utf8")) ? 7 : 6;
const PREVIEW = "http://localhost:5187/orrery-market-monitor/", MOCK = "http://localhost:5179/orrery-market-monitor/", INDEX = require("path").join(__dirname, ".dist", "index.html");
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const token = Buffer.from(JSON.stringify({ id: "reader@example.com" })).toString("base64") + ".sig";
// a stand-in market table whose first level rises by one with every answer, so a fresh answer can be told from a kept one
const net = { mode: "ok", calls: 0, table: 0 };
const row = (i, symbol, name, cls, last) => ({ symbol, name, cls, market: "TSE", currency: "JPY", decimals: 1, group: cls === "Currency" ? "fx" : cls === "Fixed income" ? "rates" : "equity", order: i, last, lastAt: new Date().toISOString(), live: false, closes: { d1: last * 0.99 }, closeDates: {}, pct: { d1: 1.01, w1: 2.2, m1: -3.1, m3: 4.4, m12: 12.5, m36: 30 }, z1m: 0.4, pos52: 61, vs200: 3.2 });
const table = () => ({ asOf: new Date().toISOString(), rows: [row(1, "^N225", "Nikkei 225", "Equities", 57000 + (++net.table)), row(2, "1306.T", "TOPIX", "Equities", 388), row(3, "USDJPY=X", "USD/JPY", "Currency", 158.4), row(4, "^TNX", "UST 10Y", "Fixed income", 4.859)] });
const api = async (p) => { await routes(p); await p.route("**/fakeapi?*", async (r) => { net.calls++; const a = new URL(r.request().url()).searchParams.get("action");
  if (net.mode === "down") return r.abort("internetdisconnected");
  if (net.mode === "slow") await new Promise((res) => setTimeout(res, 4000));
  const ok = (x) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(x) });
  if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  if (a === "login") return ok({ token }); if (a === "me") return ok({ email: "reader@example.com", role: "user", mustChange: false }); if (a === "table") return ok(table()); return r.fallback(); }); };
// the first row's text, long enough to hold its level after the longest state line ("Last print 09:44 · session 08:00–10:30
// SGT, scheduled" in Tokyo's morning: at 60 characters the level was cut off, and the checks failed in those hours only)
const first = (p) => p.evaluate(() => { const r = document.querySelector(".mp-row, table.mkt tbody tr:not(.cls)"); return r ? r.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : null; });
const level = async (p) => { const t = await first(p); const m = t && t.match(/57,0\d\d/); return m ? Number(m[0].replace(",", "")) : null; };
const bars = (p) => p.evaluate(() => ({ net: document.querySelector("#netbar")?.textContent ?? null, cls: document.querySelector("#netbar")?.className ?? null, upd: !!document.querySelector("#updbar") }));
const keptCount = (p) => p.evaluate(() => new Promise((res) => { const r = indexedDB.open("om-keep"); r.onsuccess = () => { try { const q = r.result.transaction("api").objectStore("api").getAllKeys(); q.onsuccess = () => res(q.result.map(String)); q.onerror = () => res(null); } catch { res([]); } }; r.onerror = () => res(null); }));
(async () => { const b = await chromium.launch();
  console.log("\n[a phone: first visit with a connection]");
  const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await api(p);
  await p.goto(PREVIEW, { waitUntil: "networkidle" }); await p.waitForSelector(".gatewrap .modal");
  await p.locator("#g-id").fill("reader@example.com"); await p.locator("#g-pw").fill("a-password"); await p.locator(".gatewrap button.go").tap(); await p.waitForSelector(".mp-row"); await p.waitForTimeout(2500);
  const sw = await p.evaluate(async () => ({ controlled: !!navigator.serviceWorker.controller, kept: (await (await caches.open("om-shell-v1")).keys()).map((r) => r.url.replace(location.origin + "/orrery-market-monitor/", "/")) }));
  ck("the service worker is in control and holds the page, its script and its stylesheet", sw.controlled && sw.kept.includes("/") && sw.kept.some((u) => /^\/assets\/index-.*\.js$/.test(u)) && sw.kept.some((u) => /^\/assets\/index-.*\.css$/.test(u)), sw);
  const fonts = await p.evaluate(() => ({ loaded: performance.getEntriesByType("resource").filter((e) => /fonts\.(googleapis|gstatic)\.com/.test(e.name)).length }));
  const keptFonts = sw.kept.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)).length;
  if (fonts.loaded) ck(`the fonts are kept too: the font stylesheet and its font files (${keptFonts} files)`, keptFonts >= 2 && sw.kept.some((u) => /fonts\.googleapis\.com/.test(u)), { fonts, keptFonts }); else console.log("  · the font host is not reachable from this machine: font keeping not checked here");
  const l1 = await level(p), b1 = await bars(p); ck("with a connection: fresh data, no bar", l1 != null && b1.net === null, { l1, b1, first: await first(p) });
  await p.goto(PREVIEW + "#news"); await p.waitForSelector(".nw-row"); await p.waitForTimeout(400); const heads = await p.locator(".nw-row").count();
  await p.goto(PREVIEW + "#market"); await p.waitForSelector(".mp-row"); await p.waitForTimeout(400);
  const keys = await keptCount(p); ck(`what the screens received is kept on the device, per account (${keys?.length} entries)`, Array.isArray(keys) && keys.some((k) => k === "reader@example.com|table|{}") && keys.some((k) => /^reader@example\.com\|news\|/.test(k)) && !keys.some((k) => /\|search\|/.test(k)), keys);

  console.log("\n[the connection goes]");
  net.mode = "down"; await ctx.setOffline(true); const before = await level(p);
  await p.reload({ waitUntil: "load" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(1200);
  const l2 = await level(p), b2 = await bars(p); await p.screenshot({ path: "off-phone.png" });
  ck(`the app opens without a connection (the page comes from the device): ${BAR_ITEMS} items in the bar, as the page's switch says`, (await p.locator("#pnav a").count()) === BAR_ITEMS && (await p.evaluate(() => document.body.classList.contains("pv2"))));
  ck("Markets shows the last data it received", l2 != null && l2 === before, { before, l2, first: await first(p) });
  ck("a bar says so, with the time of that data", !!b2.net && /^No connection\. Data from \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT\.$/.test(b2.net) && b2.cls === "off", b2);
  const pos = await p.evaluate(() => { const r = document.querySelector("#footbars").getBoundingClientRect(), n = document.querySelector("#pnav").getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), navTop: Math.round(n.top), vw: innerWidth, font: parseFloat(getComputedStyle(document.querySelector("#netbar")).fontSize), overflowX: document.documentElement.scrollWidth - innerWidth }; });
  ck("the bar sits above the tab bar, inside the screen", pos.left >= 0 && pos.right <= pos.vw && pos.bottom <= pos.navTop - 4 && pos.font >= 13 && pos.overflowX <= 0, pos);
  await p.locator("#pnav a", { hasText: "News" }).tap(); await p.waitForTimeout(900); ck("News shows its last headlines", (await p.locator(".nw-row").count()) === heads && heads > 0, { now: await p.locator(".nw-row").count(), heads });
  await p.locator("#pnav a", { hasText: "Rates" }).tap(); await p.waitForTimeout(900); const empty = await p.evaluate(() => [...document.querySelectorAll(".mp .empty")].map((e) => e.textContent).slice(0, 2));
  ck("Rates, never opened before: its pairs and yields come from the kept market table; the policy rates, never received, say there is no connection", (await p.locator(".mp-row").count()) >= 2 && empty.some((t) => /No connection to the Monitor's server/.test(t)) && errs.length === 0, { rows: await p.locator(".mp-row").count(), empty, errs });

  console.log("\n[the connection comes back]");
  await p.locator("#pnav a", { hasText: "Market" }).tap(); await p.waitForSelector(".mp-row"); net.mode = "ok"; const c0 = net.calls; await ctx.setOffline(false); await p.waitForTimeout(2500);
  const l3 = await level(p), b3 = await bars(p); ck("the page asks again at once: fresh data, the bar goes", net.calls > c0 && l3 != null && l3 > l2 && b3.net === null, { l2, l3, b3, asked: net.calls - c0 });
  ck("panels that refresh only every half hour (the yield curves) asked again too: nothing on screen is kept data any more", (await p.evaluate(() => document.querySelector("#netbar") === null)) && net.calls - c0 >= 4, { asked: net.calls - c0 });

  console.log("\n[a slow connection]");
  net.mode = "slow"; await p.reload({ waitUntil: "load" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(800);
  ck("for the first second and a half the screen waits for a fresh answer", (await level(p)) === null && (await bars(p)).net === null, { first: await first(p), bars: await bars(p) });
  await p.waitForTimeout(1500); const l4 = await level(p), b4 = await bars(p);
  ck("then it shows the last data and says the connection is slow", l4 === l3 && !!b4.net && /^Slow connection\. Data from /.test(b4.net) && b4.cls === "slow", { l3, l4, b4 });
  await p.waitForTimeout(3200); const l5 = await level(p), b5 = await bars(p); ck("the fresh answer replaces it when it arrives, and the bar goes", l5 != null && l5 > l4 && b5.net === null, { l4, l5, b5 }); net.mode = "ok";

  console.log("\n[a new version is not held back by the kept page]");
  { const original = fs.readFileSync(INDEX, "utf8");
    try { fs.writeFileSync(INDEX, original.replace('<div id="root"></div>', '<div id="root" data-published="2"></div>')); if (!fs.readFileSync(INDEX, "utf8").includes('data-published="2"')) throw new Error("the page was not rewritten");
      await p.reload({ waitUntil: "load" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(600);
      ck("with a connection the page always comes from the network: the newly published page is the one shown", (await p.evaluate(() => document.getElementById("root").dataset.published)) === "2");
      net.mode = "down"; await ctx.setOffline(true); await p.reload({ waitUntil: "load" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(600);
      ck("and that newer page is what the device keeps for the next time without a connection", (await p.evaluate(() => document.getElementById("root").dataset.published)) === "2");
      net.mode = "ok"; await ctx.setOffline(false); await p.waitForTimeout(600); }
    finally { fs.writeFileSync(INDEX, original); } }

  console.log("\n[sign-out]");
  await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(300); await p.locator("#userchip").tap(); await p.waitForTimeout(500);
  await p.locator(".modal button.go.ghost").tap(); await p.waitForSelector(".gatewrap .modal #g-id"); await p.waitForTimeout(600);
  const after = await keptCount(p); ck("signing out empties the kept data", Array.isArray(after) && after.length === 0, after);
  net.mode = "down"; await ctx.setOffline(true); await p.reload({ waitUntil: "load" }); await p.waitForSelector(".gatewrap .modal"); await p.waitForTimeout(500); const bg = await bars(p);
  ck("without a connection the sign-in screen still opens, and says there is none", bg.net === "No connection.", bg); net.mode = "ok"; await ctx.setOffline(false);
  ck("no page errors", errs.length === 0, errs); await ctx.close();

  console.log("\n[a laptop]");
  { const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c2.addInitScript((t) => { try { if (!localStorage.getItem("om_token")) localStorage.setItem("om_token", t); } catch {} }, token); const q = await c2.newPage(); const e2 = []; q.on("pageerror", (e) => e2.push(e.message)); await api(q);
    await q.goto(PREVIEW, { waitUntil: "networkidle" }); await q.waitForSelector("table.mkt tbody tr:not(.cls)"); await q.waitForTimeout(2500); const d1 = await level(q);
    net.mode = "down"; await c2.setOffline(true); await q.reload({ waitUntil: "load" }); await q.waitForSelector("#topbar"); await q.waitForTimeout(1200); const d2 = await level(q), bb = await bars(q);
    const pos = await q.evaluate(() => { const r = document.querySelector("#footbars").getBoundingClientRect(); return { mid: Math.round((r.left + r.right) / 2), vw: innerWidth, bottom: Math.round(r.bottom), vh: innerHeight }; }); await q.screenshot({ path: "off-laptop.png" });
    ck("the desktop table opens without a connection with its last data, the bar centred at the foot of the window", d1 != null && d2 === d1 && /^No connection\. Data from /.test(bb.net ?? "") && Math.abs(pos.mid - pos.vw / 2) <= 2 && pos.bottom <= pos.vh && e2.length === 0, { d1, d2, bb, pos, e2 }); net.mode = "ok"; await c2.close(); }

  console.log("\n[the dev servers]");
  { const c3 = await b.newContext({ ...devices["iPhone 13"] }); const q = await c3.newPage(); await q.goto(MOCK, { waitUntil: "networkidle" }); await q.waitForSelector(".mp-row"); await q.waitForTimeout(800);
    ck("no service worker on a dev server", (await q.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0); await c3.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
