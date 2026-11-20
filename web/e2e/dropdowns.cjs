// Pick-one selections as drop-downs, on every tab and size.
// Run from web/:  node e2e/run.cjs dropdowns   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", LIVE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
// by its list's accessible name, which is the label as written (the σ of "σ window" sits in a span of its own, D-11)
const pick = (p, label) => p.locator(".pick", { has: p.locator(`select[aria-label="${label}"]`) });
const val = async (p, label) => (await pick(p, label).locator(".val").textContent())?.trim();
const choose = async (p, label, value) => { await pick(p, label).locator("select").selectOption(value); await p.waitForTimeout(350); };
(async () => {
  const b = await chromium.launch();
  { console.log("\n[EQUITIES, 1440x900]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
    const labels = await p.locator("#grid .pick .lbl").allTextContents();
    ck("Index, Period and σ window are drop-downs", ["Index", "Period", "σ window"].every((l) => labels.includes(l)), labels);
    const sameRow = await p.evaluate(() => { const ys = [...document.querySelectorAll("#grid>.c12:not(.panel) .pick")].map((e) => Math.round(e.getBoundingClientRect().y)); return new Set(ys).size === 1; });
    ck("the three sit on one line on a wide window", sameRow);
    const cover = await p.evaluate(() => [...document.querySelectorAll(".pick")].every((e) => { const a = e.getBoundingClientRect(), s = e.querySelector("select").getBoundingClientRect(); return Math.abs(a.width - s.width) <= 2.5 && Math.abs(a.height - s.height) <= 2.5; }));
    ck("the whole button opens the list (the select covers it)", cover);
    ck("Period starts at 12M", (await val(p, "Period")) === "12M", await val(p, "Period"));
    await choose(p, "Period", "1M");
    const tile = (await p.locator(".mtile.cp .ch").first().textContent()) ?? "";
    ck("Period -> 1M: button shows 1M and the charts follow", (await val(p, "Period")) === "1M" && /\b1M\b/.test(tile), { v: await val(p, "Period"), tile });
    await choose(p, "σ window", "m36"); ck("σ window -> 36M", (await val(p, "σ window")) === "36M", await val(p, "σ window"));
    const opts = await pick(p, "Index").locator("option").evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
    const target = opts.find(([, t]) => /S&P/i.test(t)) ?? opts[opts.length - 1];
    await choose(p, "Index", target[0]);
    const title = await p.locator('.panel[data-no="01"] .phead .t').textContent();
    ck(`Index -> ${target[1]}: address and first panel follow`, (await val(p, "Index")) === target[1] && p.url().includes("#equities/" + encodeURIComponent(target[0])) && title.toUpperCase().includes(target[1].toUpperCase().slice(0, 3)), { url: p.url(), title, v: await val(p, "Index") });
    await pick(p, "Period").locator("select").focus(); await p.keyboard.press("3"); await p.waitForTimeout(300);
    ck("typing 3 in a focused drop-down does not jump to tab 3", p.url().includes("#equities"), p.url());
    ck("a keyboard choice keeps the focus in the drop-down", await p.evaluate(() => document.activeElement?.tagName === "SELECT"));
    // a choice made with the mouse: pointer goes down on the control, then the list reports the choice
    await pick(p, "Period").locator("select").dispatchEvent("pointerdown", { bubbles: true }); await choose(p, "Period", "12M");
    ck("after a mouse choice the drop-down lets go of the keyboard", (await val(p, "Period")) === "12M" && await p.evaluate(() => document.activeElement === document.body), await p.evaluate(() => document.activeElement?.tagName));
    await p.keyboard.press("2"); await p.waitForTimeout(300);
    ck("so the 1-6 tab keys work straight away", p.url().endsWith("#news"), p.url());
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { console.log("\n[NEWS, 1440x900]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#news", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
    ck("Type, Impact, Countries, Category present", (await Promise.all(["Type", "Impact", "Countries", "Category"].map((l) => pick(p, l).count()))).every((n) => n === 1));
    await choose(p, "Impact", "all"); ck("Impact -> All", (await val(p, "Impact")) === "All");
    await choose(p, "Countries", "all"); ck("Countries -> All", (await val(p, "Countries")) === "All");
    await choose(p, "Category", "Currency"); ck("Category -> Currency, shown as FX (the glossary's word)", (await val(p, "Category")) === "FX");
    await choose(p, "Type", "earnings");
    const t = await p.locator('.panel[data-no="01"] .phead .t').textContent();
    ck("Type -> Results: panel becomes RESULTS CALENDAR (the glossary's word), Impact/Countries give way to Region/Mkt cap", t === "RESULTS CALENDAR" && (await pick(p, "Impact").count()) === 0 && (await pick(p, "Region").count()) === 1 && (await pick(p, "Mkt cap").count()) === 1, t);
    await choose(p, "Region", "Japan"); await choose(p, "Mkt cap", "all");
    ck("Region -> Japan, Mkt cap -> All", (await val(p, "Region")) === "Japan" && (await val(p, "Mkt cap")) === "All");
    await choose(p, "Type", "macro"); ck("Type -> Macro: Impact keeps its last choice", (await val(p, "Impact")) === "All");
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { console.log("\n[top bar Size, 1440x900]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage();
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
    const z0 = await p.evaluate(() => document.body.style.zoom);
    await choose(p, "Text size", "XL"); const z1 = await p.evaluate(() => document.body.style.zoom);
    await choose(p, "Text size", "AUTO"); const z2 = await p.evaluate(() => document.body.style.zoom);
    const dup = await p.evaluate(() => { const l = [...document.querySelectorAll(".pick .lbl")].map((e) => e.textContent); return l.length !== new Set(l).size; });
    ck("no two drop-downs on the page share a label", !dup);
    ck("Text size -> XL scales the page to 1.35, AUTO restores it", z1 === "1.35" && z2 === z0, { z0, z1, z2 });
    ck("MARKET has Period and σ window drop-downs", (await pick(p, "Period").count()) === 1 && (await pick(p, "σ window").count()) === 1);
    await ctx.close(); }
  { console.log("\n[RESEARCH kind filter, 1440x900, stand-in data]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await routes(p);
    await p.goto(LIVE + "#research", { waitUntil: "networkidle" }); await p.waitForSelector("table.repT"); await p.waitForTimeout(400);
    const o = await pick(p, "Kind").locator("option").evaluateAll((os) => os.map((x) => ({ v: x.value, t: x.textContent, d: x.disabled })));
    ck("kinds with nothing published are listed but not selectable", o.find((x) => x.v === "Alpha")?.d === true && /to be added/.test(o.find((x) => x.v === "Alpha")?.t ?? "") && o.find((x) => x.v === "Daily")?.d === false, o);
    const n0 = await p.locator("table.repT tbody tr").count();
    await choose(p, "Kind", "Weekly");
    const kinds = await p.locator("table.repT tbody tr .kchip").allTextContents();
    ck(`Kind -> Weekly: list ${n0} -> ${kinds.length} rows, all Weekly`, kinds.length > 0 && kinds.length < n0 && kinds.every((k) => k === "Weekly"), kinds.slice(0, 5));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  for (const dev of ["iPhone 13", "Pixel 7"]) { console.log(`\n[phone: ${dev}]`);
    const ctx = await b.newContext({ ...devices[dev] }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage();
    for (const v of ["market", "news", "equities", "rates"]) {
      await p.goto(MOCK + "#" + v, { waitUntil: "networkidle" }); await p.waitForTimeout(700);
      const m = await p.evaluate(() => { const z = Number(document.body.style.zoom) || 1; const ps = [...document.querySelectorAll("#grid .pick")]; return { n: ps.length, minH: Math.min(...ps.map((e) => e.getBoundingClientRect().height)), maxRight: Math.max(...ps.map((e) => e.getBoundingClientRect().right)), vw: innerWidth, overflowX: document.documentElement.scrollWidth - innerWidth, selFont: Math.min(...ps.map((e) => parseFloat(getComputedStyle(e.querySelector("select")).fontSize) * z)), rows: new Set(ps.map((e) => Math.round(e.getBoundingClientRect().y))).size }; });
      ck(`${v}: ${m.n} drop-downs on ${m.rows} line(s), each ≥ 28px tall, inside the screen, list type ≥ 16px`, m.n >= 2 && m.minH >= 28 && m.maxRight <= m.vw + 0.5 && m.selFont >= 16, m);
    }
    await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
    await choose(p, "Period", "3M"); ck("equities: Period -> 3M works by touch-size control", (await val(p, "Period")) === "3M");
    await ctx.close(); }
  { console.log("\n[COMPACT one-screen, 1440x900]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); await ctx.addInitScript(() => { try { localStorage.setItem("om_prefs", JSON.stringify({ size: "AUTO", compact: true, v: 2 })); } catch {} });
    const p = await ctx.newPage(); await p.goto(MOCK + "#equities", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
    const m = await p.evaluate(() => ({ term: document.body.classList.contains("term"), pageScroll: document.documentElement.scrollHeight - innerHeight, strip: document.querySelector("#grid>.c12:not(.panel)").getBoundingClientRect().height }));
    ck("still one screen, selector strip one line", m.term && m.pageScroll <= 1 && m.strip < 30, m);
    await choose(p, "Period", "1W"); ck("Period -> 1W", (await val(p, "Period")) === "1W"); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})();
