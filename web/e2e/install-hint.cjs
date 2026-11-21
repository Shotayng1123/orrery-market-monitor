// "Add Orrery to your Home Screen". Since 21 Nov 2026 (the designer's note on the phone's first MARKETS screen) it is
// one 44-px line on MARKETS, under the morning note, and its words and steps open in a sheet from the bottom of the
// screen, from that line or from the menu's ADD TO HOME SCREEN on any tab. The card it was stood 199 px between the
// data and the list. The words and the steps are the card's own, unchanged.
// Run from web/:  node e2e/run.cjs install-hint   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
// the line on MARKETS: where it stands, what it says, what a finger can hit
const line = (p) => p.evaluate(() => { const c = document.querySelector("#mk-install"); if (!c) return null; const R = (e) => e.getBoundingClientRect(), r = R(c), x = R(c.querySelector(".x")), o = R(c.querySelector(".open")), head = document.querySelector(".mp-head") ? R(document.querySelector(".mp-head")) : null, strip = document.querySelector("#mk-sigma") ? R(document.querySelector("#mk-sigma")) : null, note = document.querySelector("#mk-note") ? R(document.querySelector("#mk-note")) : null, t = c.querySelector(".t");
  return { text: t.textContent, fs: parseFloat(getComputedStyle(t).fontSize), weight: getComputedStyle(t).fontWeight, cut: t.scrollWidth > t.clientWidth + 1, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height * 10) / 10, vw: innerWidth, vh: innerHeight, headBottom: head ? Math.round(head.bottom) : null, stripBottom: strip ? Math.round(strip.bottom) : null, noteBottom: note ? Math.round(note.bottom) : null, inLines: !!c.closest(".mp-lines"), xW: Math.round(x.width), xH: Math.round(x.height), xTip: c.querySelector(".x").title, openH: Math.round(o.height), chevron: c.querySelector(".go")?.textContent ?? null, popup: c.querySelector(".open").getAttribute("aria-haspopup"), overflowX: document.documentElement.scrollWidth - innerWidth }; });
// the sheet: where it stands, what it says, how it is closed
const sheet = (p) => p.evaluate(() => { const s = document.querySelector("#a2hs-sheet"); if (!s) return null; const R = (e) => e.getBoundingClientRect(), r = R(s), bg = s.closest(".sheet-bg"), x = R(s.querySelector(".sheet-head .x")), cs = getComputedStyle(s), body = s.querySelector(".sheet-body"); const fs = []; const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim()) fs.push(parseFloat(getComputedStyle(n.parentElement).fontSize));
  const go = s.querySelector(".a2hs-tx .go"), hide = s.querySelector("#a2hs-hide");
  return { title: s.querySelector(".sheet-head .t").textContent, text: s.querySelector(".a2hs-tx").textContent.replace(/\s+/g, " ").trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, radius: cs.borderTopLeftRadius, radiusB: cs.borderBottomLeftRadius, dim: getComputedStyle(bg).backgroundColor, bgTop: Math.round(R(bg).top), bgH: Math.round(R(bg).height), role: s.getAttribute("role"), modal: s.getAttribute("aria-modal"), labelled: document.getElementById(s.getAttribute("aria-labelledby") ?? "")?.textContent ?? null, focusIn: s === document.activeElement || s.contains(document.activeElement),
    xW: Math.round(x.width), xH: Math.round(x.height), minFont: Math.min(...fs), go: !!go, goH: go ? Math.round(R(go).height) : null, share: !!s.querySelector("svg.sh"), hide: hide ? { text: hide.textContent, h: Math.round(R(hide).height) } : null, pageLocked: getComputedStyle(document.documentElement).overflowY === "hidden", bodyScrolls: getComputedStyle(body).overflowY, overflowX: document.documentElement.scrollWidth - innerWidth }; });
const openMenu = async (p) => { await p.evaluate(() => scrollTo(0, 0)); await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(350); };
const chip = (p) => p.evaluate(() => { const e = document.querySelector("#a2hs"); return !!e && e.getBoundingClientRect().height > 0; });
const offerInstall = (p, outcome) => p.evaluate((o) => { const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: o }); window.dispatchEvent(e); window.__prevented = e.defaultPrevented; }, outcome);
const openSheet = async (p) => { await p.locator("#mk-install .open").tap(); await p.waitForSelector("#a2hs-sheet"); await p.waitForTimeout(300); };
const gone = async (p) => { await p.waitForTimeout(350); return (await p.locator("#a2hs-sheet").count()) === 0; };
(async () => { const b = await chromium.launch();
  console.log("\n[iPhone, in the browser]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(900);
    const c = await line(p); await p.screenshot({ path: "a2hs-ios.png" });
    ck(`the line is on the first screen, under the Markets title, Movers in σ and the morning note, in their block, inside the screen's width: "${c?.text}" on one line of ${c?.h} px (with its rule), ${c?.fs} px, a chevron and ✕`, !!c && c.left >= 0 && c.right <= c.vw && c.overflowX <= 0 && c.top >= c.headBottom && c.stripBottom != null && c.top >= c.stripBottom && (c.noteBottom == null || c.top >= c.noteBottom - 1) && c.bottom < c.vh - 60 && c.inLines && c.text === "Add Orrery to your Home Screen" && c.h === 45 && c.fs === 14.5 && Number(c.weight) >= 600 && !c.cut && c.chevron === "›", c);
    ck(`a finger can hit it: the row ${c?.openH} px high, its ✕ ${c?.xW}×${c?.xH}px ("${c?.xTip}")`, !!c && c.openH >= 44 && c.xW >= 44 && c.xH >= 44 && /^Hide this line\. It can be opened again from the menu$/.test(c.xTip) && c.popup === "dialog", c);
    await openSheet(p); const s = await sheet(p); await p.screenshot({ path: "a2hs-ios-sheet.png" });
    ck(`a tap on the line opens a sheet at the bottom of the screen: as wide as the screen (${s?.left}–${s?.right} of ${s?.vw}), ${s?.h} px of ${s?.vh} (at most 80%), top corners ${s?.radius}, over a dimmed page (${s?.dim}); "${s?.title}"`, !!s && s.left === 0 && s.right === s.vw && s.bottom === s.vh && s.h <= s.vh * 0.8 + 1 && s.radius === "16px" && s.radiusB === "0px" && /rgba\(0, 0, 0, 0\.6\)/.test(s.dim) && s.bgTop === 0 && s.bgH === s.vh && s.title === "Add Orrery to your Home Screen" && s.overflowX <= 0, s);
    ck("its words are the card's: opens full screen like an app; the iPhone steps: the Share menu (with its icon), Add to Home Screen, Add, and the second sign-in; no Install button", !!s && /^It opens full screen like an app, with the same data\./.test(s.text) && /Share menu/.test(s.text) && s.share && /Add to Home Screen/.test(s.text) && /then Add\./.test(s.text) && /sign in once more/.test(s.text) && !s.go, s);
    ck(`readable and closable: text ≥ 13px (smallest ${s?.minFont}px), its ✕ ${s?.xW}×${s?.xH}px, "${s?.hide?.text}" ${s?.hide?.h} px high; a dialog named by its title, the focus inside it; the page behind does not scroll and its own body does (${s?.bodyScrolls})`, !!s && s.minFont >= 13 && s.xW >= 44 && s.xH >= 44 && s.hide?.text === "Hide the line on Markets" && s.hide.h >= 44 && s.role === "dialog" && s.modal === "true" && s.labelled === s.title && s.focusIn && s.pageLocked && s.bodyScrolls === "auto", s);
    // closing it: ✕, a tap on the dimmed page, Esc, Back; each leaves the page where it was
    await p.locator("#a2hs-sheet .sheet-head .x").tap(); const x1 = await gone(p);
    await openSheet(p); await p.touchscreen.tap(195, 60); const x2 = await gone(p);
    await openSheet(p); await p.keyboard.press("Escape"); const x3 = await gone(p);
    await openSheet(p); await p.goBack(); const x4 = await gone(p);
    const after = await p.evaluate(() => ({ hash: location.hash, line: !!document.querySelector("#mk-install"), locked: getComputedStyle(document.documentElement).overflowY === "hidden", rows: document.querySelectorAll(".mp-row").length, y: Math.round(scrollY) }));
    ck("✕ closes it, a tap on the dimmed page closes it, Esc closes it, Back closes it and stays on MARKETS; the line stays, the page scrolls again", x1 && x2 && x3 && x4 && (after.hash === "" || after.hash === "#market") && after.line && !after.locked && after.rows > 5, { x1, x2, x3, x4, after });
    await p.evaluate(() => scrollTo(0, 900)); await p.waitForTimeout(300); const st = await p.evaluate(() => ({ head: Math.round(document.querySelector(".mp-head").getBoundingClientRect().top), line: Math.round(document.querySelector("#mk-install").getBoundingClientRect().bottom) }));
    ck("scrolling: the line scrolls away, the Markets title still pins to the top", st.head === 0 && st.line < 0, st);
    await p.goto(MOCK + "#news"); await p.waitForSelector(".mp-picks"); await p.waitForTimeout(400); ck("other tabs do not carry the line", (await line(p)) === null && (await p.locator("#a2hs-sheet").count()) === 0);
    await p.goto(MOCK + "#market"); await p.waitForSelector(".mp-row"); await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 0)); await p.locator("#mk-install .x").tap(); await p.waitForTimeout(300);
    ck("✕ on the line: the line goes and the choice is kept", (await line(p)) === null && (await p.evaluate(() => localStorage.getItem("om_a2hs_hide"))) === "1");
    await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(500); ck("it stays away after reopening", (await line(p)) === null);
    await p.goto(MOCK + "#news"); await p.waitForSelector(".mp-picks"); await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 400)); await openMenu(p);
    const hasChip = await chip(p); await p.screenshot({ path: "a2hs-menu.png" }); await p.locator("#a2hs").tap(); await p.waitForSelector("#a2hs-sheet"); await p.waitForTimeout(400);
    const again = await sheet(p); const after2 = await p.evaluate(() => ({ menuOpen: document.querySelector("#topbar").classList.contains("open"), hash: location.hash }));
    ck("menu > ADD TO HOME SCREEN: the sheet opens on the tab in view with the same steps, the menu closes; the line being hidden already, the sheet offers no way to hide it", hasChip && !!again && /Share menu/.test(again.text) && again.hide === null && !after2.menuOpen && after2.hash === "#news", { hasChip, again, after2 });
    await p.locator("#a2hs-sheet .sheet-head .x").tap(); ck("its ✕ closes it; NEWS is still the tab in view", (await gone(p)) && (await p.evaluate(() => location.hash)) === "#news");
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { // "Hide the line on Markets", in the sheet: what ✕ on the line does, and the sheet closes
    const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector("#mk-install"); await p.waitForTimeout(500);
    await openSheet(p); await p.locator("#a2hs-hide").tap(); const closed = await gone(p);
    ck("\"Hide the line on Markets\" in the sheet hides the line, keeps the choice and closes the sheet", closed && (await line(p)) === null && (await p.evaluate(() => localStorage.getItem("om_a2hs_hide"))) === "1" && errs.length === 0, errs); await ctx.close(); }

  console.log("\n[Android phone, in the browser]");
  { const ctx = await b.newContext({ ...devices["Pixel 7"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(900);
    await openSheet(p); const c0 = await sheet(p); await p.screenshot({ path: "a2hs-android.png" });
    ck("no install offer from the browser: the sheet names the browser's menu, no Install button, no iPhone steps", !!c0 && /browser's menu/.test(c0.text) && /Add to Home screen or Install app/.test(c0.text) && !c0.go && !/Share menu|sign in once more/.test(c0.text) && c0.overflowX <= 0, c0);
    await offerInstall(p, "dismissed"); await p.waitForTimeout(300); const c1 = await sheet(p); await p.screenshot({ path: "a2hs-android-install.png" });
    ck(`the browser offers an install: an Install button (${c1?.goH}px tall) appears and the browser's own banner is held back`, !!c1 && c1.go && c1.goH >= 52 && /One tap/.test(c1.text) && (await p.evaluate(() => window.__prevented)) === true, c1);
    await p.locator("#a2hs-sheet .a2hs-tx .go").tap(); await p.waitForTimeout(400); const c2 = await sheet(p);
    ck("Install, then \"not now\" in the browser's prompt: asked once, the sheet stays with the menu steps", (await p.evaluate(() => window.__prompted)) === 1 && !!c2 && !c2.go && /browser's menu/.test(c2.text), c2);
    await offerInstall(p, "accepted"); await p.waitForTimeout(300); await p.locator("#a2hs-sheet .a2hs-tx .go").tap(); await p.waitForTimeout(500); const goneNow = (await p.locator("#a2hs-sheet").count()) === 0, lineGone = (await line(p)) === null; await openMenu(p);
    ck("Install, accepted: the sheet goes, the line on MARKETS goes, and the menu entry with it", goneNow && lineGone && !(await chip(p)) && (await p.evaluate(() => window.__prompted)) === 2);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const ctx = await b.newContext({ ...devices["Pixel 7"] }); const p = await ctx.newPage(); await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(600);
    const had = (await line(p)) !== null; await p.evaluate(() => window.dispatchEvent(new Event("appinstalled"))); await p.waitForTimeout(300); ck("installed from the browser's own menu (appinstalled): the line goes", had && (await line(p)) === null); await ctx.close(); }

  console.log("\n[already on the home screen, and screens that are not phones]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }); }); const p = await ctx.newPage();
    await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.waitForTimeout(600); const none = (await line(p)) === null; await openMenu(p);
    ck("opened from the home screen: no line, no menu entry", none && !(await chip(p))); await ctx.close(); }
  for (const [name, opts, url] of [["iPad", { ...devices["iPad (gen 7)"] }, MOCK], ["laptop 1440×900", { viewport: { width: 1440, height: 900 } }, MOCK], ["phone on the classic layout", { ...devices["iPhone 13"] }, MOCK + "?phone=old"]]) { const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(url, { waitUntil: "networkidle" }); await p.waitForSelector("#topbar"); await p.waitForTimeout(600);
    ck(`${name}: no line, no sheet, no menu entry`, (await line(p)) === null && (await p.locator("#a2hs-sheet").count()) === 0 && (await p.locator("#a2hs").count()) === 0 && errs.length === 0, errs); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
