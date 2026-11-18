// The economic calendar opens on high-impact events.
// Run from web/:  node e2e/run.cjs calendar-default   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const { routes } = require("./harness.cjs");
const LIVE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const impacts = (p) => p.evaluate(() => [...document.querySelectorAll("table.calT tr.ecrow td:nth-child(4)")].map((td) => td.getAttribute("title")));
const count = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
(async () => { const b = await chromium.launch();
  for (const [name, opts] of [["laptop 1440x900", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", devices["iPhone 13"]]]) {
    console.log(`\n[${name}]`); const ctx = await b.newContext(opts); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await routes(p);
    await p.goto(LIVE + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("tr.ecrow"); await p.waitForTimeout(500);
    const pick = p.locator(".pick", { has: p.locator('.lbl:text-is("Impact")') });
    const v0 = (await pick.locator(".val").textContent()).trim(); const i0 = await impacts(p);
    ck(`opens on Impact = High: ${i0.length} events, all high-impact`, v0 === "High" && i0.length > 0 && i0.every((x) => x === "High"), { v0, counts: count(i0) });
    const next = await p.evaluate(() => { const box = document.querySelector(".calwrap"), r = [...box.querySelectorAll("tr.ecrow")].find((x) => !x.classList.contains("past"))?.getBoundingClientRect(), hb = box.querySelector("th").getBoundingClientRect().bottom, bb = Math.min(box.getBoundingClientRect().bottom, innerHeight); return !!r && r.top >= hb - 1 && r.bottom <= bb + 1; });
    ck("the next upcoming event is in view", next);
    await pick.locator("select").selectOption("hm"); await p.waitForTimeout(400); const i1 = await impacts(p);
    ck(`High + Medium still one pick away: ${i1.length} events`, i1.length > i0.length && i1.every((x) => x === "High" || x === "Medium") && i1.includes("Medium"), count(i1));
    await pick.locator("select").selectOption("all"); await p.waitForTimeout(400); const i2 = await impacts(p);
    ck(`All: ${i2.length} events, Low included`, i2.length > i1.length && i2.includes("Low"), count(i2));
    await pick.locator("select").selectOption("high"); await p.waitForTimeout(400);
    ck("back to High", (await impacts(p)).length === i0.length); ck("no page errors", errs.length === 0, errs);
    if (name === "iPhone 13") await p.screenshot({ path: "phone-high-default.png" }); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
