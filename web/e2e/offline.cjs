// Opening without a connection: the service worker and the kept data.
// Run from web/:  node e2e/run.cjs offline   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const fs = require("fs"); const { routes } = require("./harness.cjs");
const path = require("path"), http = require("http"), crypto = require("crypto"), { spawnSync } = require("child_process");
// the bar's items on the site as published: six while the paper book's switch is off, seven once it is on
// (PAPER_ON_LIVE_SITE in src/lib/paper.ts, read as local-copy.cjs reads it: PC-8, DC-2 of the second review of P-1)
const BAR_ITEMS = /^export const PAPER_ON_LIVE_SITE = true;/m.test(require("fs").readFileSync(require("path").join(__dirname, "..", "src", "lib", "paper.ts"), "utf8")) ? 7 : 6;
const PREVIEW = "http://localhost:5187/orrery-market-monitor/", MOCK = "http://localhost:5179/orrery-market-monitor/", INDEX = require("path").join(__dirname, ".dist", "index.html");
// the worker's cache, by the worker's own name (public/sw.js): its name changes with what a new worker must drop (slice 11)
const CACHE = /const CACHE = "([^"]+)"/.exec(fs.readFileSync(require("path").join(__dirname, "..", "public", "sw.js"), "utf8"))[1];
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
  const sw = await p.evaluate(async (CACHE) => ({ controlled: !!navigator.serviceWorker.controller, kept: (await (await caches.open(CACHE)).keys()).map((r) => r.url.replace(location.origin + "/orrery-market-monitor/", "/")) }), CACHE);
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

  // The 1-minute tour (slice 11, the designer's work order §7.4): a page of the worker's scope that is not the app's. The
  // worker before it answered every page of its scope from the network and kept the answer under the app's own key, so
  // the tour's page, once opened, was what the device showed for the Monitor without a connection.
  console.log(`\n[the tour's page and its film are the network's: the app's key keeps the app (cache ${CACHE})]`);
  { const c4 = await b.newContext({ viewport: { width: 1280, height: 800 } }); await c4.addInitScript((t) => { try { if (!localStorage.getItem("om_token")) localStorage.setItem("om_token", t); } catch {} }, token); const q = await c4.newPage(); const e4 = []; q.on("pageerror", (e) => e4.push(e.message)); await api(q);
    await q.goto(PREVIEW, { waitUntil: "networkidle" }); await q.waitForSelector("table.mkt tbody tr:not(.cls)");
    const keptApp = (pg) => pg.evaluate(async (CACHE) => { const c = await caches.open(CACHE), page = await c.match(location.origin + "/orrery-market-monitor/"); return { page: page ? await page.text() : null, keys: (await c.keys()).map((r) => r.url.replace(location.origin + "/orrery-market-monitor/", "/")) }; }, CACHE);
    for (let i = 0; i < 20 && !(await keptApp(q)).page; i++) await q.waitForTimeout(250);   // the page sends the worker its files once it has loaded
    const before = await keptApp(q), ctl = await q.evaluate(() => !!navigator.serviceWorker.controller);
    const t1 = await q.goto(PREVIEW + "tour/", { waitUntil: "load" }), tour = await q.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? null, controlled: !!navigator.serviceWorker.controller }));
    const t2 = await q.goto(PREVIEW + "tour/orrery-tour.mp4", { waitUntil: "commit" }).then((r) => r.status(), (e) => String(e.message).slice(0, 80)); await q.waitForTimeout(400);
    await q.goto(PREVIEW + "tour/", { waitUntil: "load" }); const after = await keptApp(q);
    ck(`the app's page kept under its key (${before.keys.length} entries); then the tour's page (${t1.status()}, "${tour.h1}") and its film (${t2}) opened by address: the key still holds the app's page, and nothing of the tour is kept`,
      ctl && /<div id="root">/.test(before.page ?? "") && t1.status() === 200 && tour.h1 === "The one-minute tour" && t2 === 200 && /<div id="root">/.test(after.page ?? "") && !/one-minute tour/.test(after.page ?? "") && !after.keys.some((k) => /^\/tour\//.test(k)), { ctl, tour, t2, before: before.keys, after: after.keys, page: (after.page ?? "").slice(0, 120) });
    await c4.setOffline(true); await q.goto(PREVIEW, { waitUntil: "load" }).catch(() => undefined); await q.waitForSelector("#topbar", { timeout: 8000 }).catch(() => undefined); await q.waitForTimeout(800);
    const off = await q.evaluate(() => ({ app: !!document.querySelector("#topbar"), h1: document.querySelector("h1")?.textContent ?? null }));
    ck("offline, the app's address opens the Monitor (from the device), not the tour", off.app && off.h1 !== "The one-minute tour" && e4.length === 0, { off, e4 });
    await c4.setOffline(false); await c4.close(); }

  // An update of the worker itself (V11-1 of slice 11's check). A device whose Monitor was kept by live's worker (cache
  // om-shell-v1; e2e/sw-om-shell-v1.js is web/public/sw.js as published until slice 11, byte for byte) visits once after
  // the publish that brings this worker, then has no connection. That visit is answered by the worker before (the app's
  // "keep" at its load goes there too) and the new one's activation removes the older cache: nothing of the visit was
  // left, and without a connection the Monitor did not open until a second visit. The first visit is the app's, or the
  // tour's page, which live's worker keeps under the app's own key. One origin, served as GitHub Pages serves a folder:
  // live's worker on a build of its own (GitHub checks out one commit, so live's site cannot be built from its commit
  // there), then this site; "off" drops every connection, the page's and the worker's, and no-cache keeps the browser's
  // own cache from standing in for the device's copy.
  console.log(`\n[an update from live's worker (om-shell-v1) to this one (${CACHE}) on one origin: one visit, then no connection]`);
  { const PORT = 5189, UPG = `http://localhost:${PORT}/orrery-market-monitor/`, OLD = path.join(__dirname, ".out", "upgrade-live"), NEW = path.join(__dirname, ".dist"), site = { dir: OLD, off: false };
    const v1 = fs.readFileSync(path.join(__dirname, "sw-om-shell-v1.js")), v1sha = crypto.createHash("sha256").update(v1).digest("hex");
    // the older site: a build of its own (GITHUB_SHA empty: its id from the time, another release than this site's) with live's worker
    const lb = spawnSync(process.execPath, [path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", OLD, "--emptyOutDir"], { cwd: path.join(__dirname, ".."), env: { ...process.env, VITE_API_URL: "http://localhost:5187/fakeapi", GITHUB_SHA: "" }, encoding: "utf8" });
    if (lb.status !== 0) throw new Error(`the older site's build failed: ${(lb.stderr || lb.stdout || "").split("\n").slice(-6).join(" | ")}`);
    fs.writeFileSync(path.join(OLD, "sw.js"), v1);
    const id = (d) => JSON.parse(fs.readFileSync(path.join(d, "version.json"), "utf8")).id, page = (d) => fs.readFileSync(path.join(d, "index.html"), "utf8");
    const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
    const srv = http.createServer((rq, rs) => { if (site.off) return rq.socket.destroy();
      let f = path.join(site.dir, decodeURIComponent(new URL(rq.url, UPG).pathname).replace(/^\/orrery-market-monitor\//, "")); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
      if (!f.startsWith(site.dir) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end("not found"); }
      rs.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-cache" }); fs.createReadStream(f).pipe(rs); });
    await new Promise((res) => srv.listen(PORT, res));
    const ROW = "table.mkt tbody tr:not(.cls)";
    const held = (pg) => pg.evaluate(async (P) => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k), r = await c.match(P), keys = (await c.keys()).map((x) => x.url.replace(P, "/")); out[k] = { n: keys.length, tour: keys.filter((u) => u.startsWith("/tour/")).length, page: r ? await r.text() : null }; } return { out, ctl: !!navigator.serviceWorker.controller }; }, UPG).catch((e) => ({ out: {}, err: String(e.message).slice(0, 80) }));
    const said = (k) => ({ ctl: k.ctl, err: k.err, caches: Object.fromEntries(Object.entries(k.out).map(([n, v]) => [n, `${v.n} entries${v.tour ? `, ${v.tour} of the tour` : ""}, page: ${v.page == null ? "none" : v.page === page(OLD) ? "live's" : v.page === page(NEW) ? "this build's" : v.page.slice(0, 50)}`])) });
    for (const firstVisit of ["", "tour/"]) {
      site.dir = OLD; const c5 = await b.newContext({ viewport: { width: 1280, height: 800 } }); await c5.addInitScript((t) => { try { if (!localStorage.getItem("om_token")) localStorage.setItem("om_token", t); } catch {} }, token);
      const q = await c5.newPage(); const e5 = []; q.on("pageerror", (e) => e5.push(e.message)); await api(q);
      const go = (u, waitUntil = "networkidle") => q.goto("about:blank").then(() => q.goto(UPG + u, { waitUntil })).then(() => "", (e) => String(e.message).split("\n")[0].slice(0, 100));
      try {
        await go(""); await q.waitForSelector(ROW); for (let i = 0; i < 40 && !(await held(q)).out["om-shell-v1"]?.page; i++) await q.waitForTimeout(250);   // the page sends live's worker its files once it has loaded
        await go(""); await q.waitForSelector(ROW); await q.waitForTimeout(1500); const k1 = await held(q), before = await level(q);
        if (!firstVisit) ck(`live's worker (sha256 ${v1sha.slice(0, 12)}…) with a build of its own (${id(OLD)}), opened twice: the worker controls the page, and om-shell-v1 keeps it and its files`,
          v1sha === "1d698aff117f6fdc3d98aac97aa1f127e5ffe06b4946e8562bcf3d409b7b2a00" && id(OLD) !== id(NEW) && k1.ctl && Object.keys(k1.out).join() === "om-shell-v1" && k1.out["om-shell-v1"].page === page(OLD), said(k1));
        site.dir = NEW; const nav = await go(firstVisit, firstVisit ? "load" : "networkidle");
        const seen = firstVisit ? await q.evaluate(() => document.querySelector("h1")?.textContent ?? null) : await q.waitForSelector(ROW).then(() => level(q), () => null);
        let k2 = await held(q); for (let i = 0; i < 80 && (k2.err || "om-shell-v1" in k2.out); i++) { await q.waitForTimeout(250); k2 = await held(q); }   // the visit brings the new worker (the browser looks for one at every visit); its activation removes om-shell-v1
        ck(firstVisit ? `a first visit to the tour's page after the publish ("${seen}"): the new worker takes over and keeps this build's page and its files (${k2.out[CACHE]?.n} entries), nothing of the tour`
          : `the site published again with this worker (${id(NEW)}): one visit with a connection opens the Monitor with fresh data, and the new worker takes over (om-shell-v1 removed) and keeps what that visit loaded, this build's page and its files (${k2.out[CACHE]?.n} entries)`,
          !nav && (firstVisit ? seen === "The one-minute tour" : seen != null && seen !== before) && k2.ctl && !("om-shell-v1" in k2.out) && k2.out[CACHE]?.page === page(NEW) && !k2.out[CACHE].tour && k2.out[CACHE].n >= 3, { nav, seen, before, ...said(k2) });
        const last = firstVisit ? before : await level(q);
        site.off = true; net.mode = "down"; await c5.setOffline(true);
        const offNav = await go("", "load"); await q.waitForSelector(ROW, { timeout: 8000 }).catch(() => undefined); await q.waitForTimeout(800);
        const off = await q.evaluate(() => ({ app: !!document.querySelector("#topbar"), build: document.documentElement.dataset.build ?? null, bar: document.querySelector("#netbar")?.textContent ?? null })).catch(() => ({ app: false })), kept = await level(q).catch(() => null);
        const tourOff = firstVisit ? await go("tour/", "load") : null;
        ck(`then no connection: the Monitor opens from the device, this build's page, with the last data it received (${last}) and a bar that says so${firstVisit ? "; the tour's page is not answered from the device" : ""}`,
          !offNav && off.app && off.build === id(NEW) && kept != null && kept === last && /^No connection\. Data from /.test(off.bar ?? "") && (!firstVisit || /ERR_/.test(tourOff)) && e5.length === 0, { offNav, off, last, kept, tourOff, e5 });
      } finally { site.off = false; net.mode = "ok"; await c5.setOffline(false); await c5.close(); }
    }
    srv.closeAllConnections(); await new Promise((res) => srv.close(res)); }

  console.log("\n[the dev servers]");
  { const c3 = await b.newContext({ ...devices["iPhone 13"] }); const q = await c3.newPage(); await q.goto(MOCK, { waitUntil: "networkidle" }); await q.waitForSelector(".mp-row"); await q.waitForTimeout(800);
    ck("no service worker on a dev server", (await q.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0); await c3.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
