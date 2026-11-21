// The "add to your home screen" hint.
// Run from web/:  node e2e/run.cjs install-hint   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const card = (p) => p.evaluate(() => { const c = document.querySelector(".mp-a2hs"); if (!c) return null; const r = c.getBoundingClientRect(), x = c.querySelector(".x").getBoundingClientRect(), head = document.querySelector(".mp-head")?.getBoundingClientRect(), strip = document.querySelector("#mk-sigma")?.getBoundingClientRect(), note = document.querySelector(".mp-today")?.getBoundingClientRect(); const fs = []; const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim() && !n.parentElement.closest("button.x")) fs.push(parseFloat(getComputedStyle(n.parentElement).fontSize));
  return { text: c.querySelector(".tx").textContent.replace(/\s+/g, " ").trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), vw: innerWidth, headTop: head ? Math.round(head.top) : null, headBottom: head ? Math.round(head.bottom) : null, stripBottom: strip ? Math.round(strip.bottom) : null, noteBottom: note ? Math.round(note.bottom) : null, vh: innerHeight, xW: Math.round(x.width), xH: Math.round(x.height), minFont: Math.min(...fs), go: !!c.querySelector(".go"), goH: c.querySelector(".go") ? Math.round(c.querySelector(".go").getBoundingClientRect().height) : null, share: !!c.querySelector("svg.sh"), overflowX: document.documentElement.scrollWidth - innerWidth }; });
const openMenu = async (p) => { await p.evaluate(() => scrollTo(0, 0)); await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(350); };
const chip = (p) => p.evaluate(() => { const e = document.querySelector("#a2hs"); return !!e && e.getBoundingClientRect().height > 0; });
const offerInstall = (p, outcome) => p.evaluate((o) => { const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: o }); window.dispatchEvent(e); window.__prevented = e.defaultPrevented; }, outcome);
(async () => { const b = await chromium.launch();
  console.log("\n[iPhone, in the browser]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(900);
    const c = await card(p); await p.screenshot({ path: "a2hs-ios.png" });
    // since I-6 (the designer's I-6 check: no card or hint above the data) it sits under Movers in σ and the morning note
    ck("the hint is on the first screen, under the Markets title, Movers in σ and the morning note, inside the screen's width", !!c && c.left >= 0 && c.right <= c.vw && c.overflowX <= 0 && c.top >= c.headBottom && c.stripBottom != null && c.top >= c.stripBottom && (c.noteBottom == null || c.top >= c.noteBottom) && c.top < c.vh - 60, c);
    ck("iPhone steps: the Share menu (with its icon), Add to Home Screen, Add, and the second sign-in", !!c && /Share menu/.test(c.text) && c.share && /Add to Home Screen/.test(c.text) && /then Add\./.test(c.text) && /sign in once more/.test(c.text) && !c.go, c);
    ck(`readable and closable: text ≥ 13px (smallest ${c?.minFont}px), close button ${c?.xW}×${c?.xH}px`, !!c && c.minFont >= 13 && c.xW >= 44 && c.xH >= 44, c);
    await p.evaluate(() => scrollTo(0, 900)); await p.waitForTimeout(300); const st = await p.evaluate(() => ({ head: Math.round(document.querySelector(".mp-head").getBoundingClientRect().top), card: Math.round(document.querySelector(".mp-a2hs").getBoundingClientRect().bottom) }));
    ck("scrolling: the hint scrolls away, the Markets title still pins to the top", st.head === 0 && st.card < 0, st);
    await p.goto(MOCK + "#news"); await p.waitForSelector(".mp-picks"); await p.waitForTimeout(400); ck("other tabs do not carry the hint", (await card(p)) === null);
    await p.goto(MOCK + "#market"); await p.waitForSelector(".mp-row"); await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 0)); await p.locator(".mp-a2hs .x").tap(); await p.waitForTimeout(300);
    ck("×: the hint goes and the choice is kept", (await card(p)) === null && (await p.evaluate(() => localStorage.getItem("om_a2hs_hide"))) === "1");
    await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(500); ck("it stays away after reopening", (await card(p)) === null);
    await p.goto(MOCK + "#news"); await p.waitForSelector(".mp-picks"); await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 400)); await openMenu(p);
    const hasChip = await chip(p); await p.screenshot({ path: "a2hs-menu.png" }); await p.locator("#a2hs").tap(); await p.waitForTimeout(400);
    const again = await card(p); const after = await p.evaluate(() => ({ menuOpen: document.querySelector("#topbar").classList.contains("open"), y: Math.round(scrollY), hash: location.hash }));
    ck("menu > ADD TO HOME SCREEN: the hint opens on the tab in view, the menu closes, the page is at its top", hasChip && !!again && !after.menuOpen && after.y === 0 && after.hash === "#news", { hasChip, again: !!again, after });
    await p.locator(".mp-a2hs .x").tap(); await p.waitForTimeout(300); ck("× hides it again", (await card(p)) === null);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[Android phone, in the browser]");
  { const ctx = await b.newContext({ ...devices["Pixel 7"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(900);
    const c0 = await card(p); await p.screenshot({ path: "a2hs-android.png" });
    ck("no install offer from the browser: the hint names the browser's menu, no Install button, no iPhone steps", !!c0 && /browser's menu/.test(c0.text) && /Add to Home screen or Install app/.test(c0.text) && !c0.go && !/Share menu|sign in once more/.test(c0.text) && c0.overflowX <= 0, c0);
    await offerInstall(p, "dismissed"); await p.waitForTimeout(300); const c1 = await card(p); await p.screenshot({ path: "a2hs-android-install.png" });
    ck(`the browser offers an install: an Install button (${c1?.goH}px tall) appears and the browser's own banner is held back`, !!c1 && c1.go && c1.goH >= 44 && /One tap/.test(c1.text) && (await p.evaluate(() => window.__prevented)) === true, c1);
    await p.locator(".mp-a2hs .go").tap(); await p.waitForTimeout(400); const c2 = await card(p);
    ck("Install, then \"not now\" in the browser's prompt: asked once, the hint stays with the menu steps", (await p.evaluate(() => window.__prompted)) === 1 && !!c2 && !c2.go && /browser's menu/.test(c2.text), c2);
    await offerInstall(p, "accepted"); await p.waitForTimeout(300); await p.locator(".mp-a2hs .go").tap(); await p.waitForTimeout(400); await openMenu(p);
    ck("Install, accepted: the hint goes and the menu entry with it", (await card(p)) === null && !(await chip(p)) && (await p.evaluate(() => window.__prompted)) === 2);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const ctx = await b.newContext({ ...devices["Pixel 7"] }); const p = await ctx.newPage(); await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(600);
    await p.evaluate(() => window.dispatchEvent(new Event("appinstalled"))); await p.waitForTimeout(300); ck("installed from the browser's own menu (appinstalled): the hint goes", (await card(p)) === null); await ctx.close(); }

  console.log("\n[already on the home screen, and screens that are not phones]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }); }); const p = await ctx.newPage();
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(600); const none = (await card(p)) === null; await openMenu(p);
    ck("opened from the home screen: no hint, no menu entry", none && !(await chip(p))); await ctx.close(); }
  for (const [name, opts, url] of [["iPad", { ...devices["iPad (gen 7)"] }, MOCK], ["laptop 1440×900", { viewport: { width: 1440, height: 900 } }, MOCK], ["phone on the classic layout", { ...devices["iPhone 13"] }, MOCK + "?phone=old"]]) { const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(url, { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(600);
    ck(`${name}: no hint, no menu entry`, (await card(p)) === null && (await p.locator("#a2hs").count()) === 0 && errs.length === 0, errs); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
