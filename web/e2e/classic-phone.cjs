// The classic phone layout: the calendar's ten-row box and RESEARCH titles first.
// Run from web/:  node e2e/run.cjs classic-phone   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright"); const { routes } = require("./harness.cjs");
const LIVE = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const vis = (p, sel) => p.locator(sel).count();
(async () => { const b = await chromium.launch();
  for (const dev of ["iPhone 13", "Pixel 7"]) {
    console.log(`\n[calendar on ${dev}]`);
    { const ctx = await b.newContext({ ...devices[dev] }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await routes(p);
      await p.goto(LIVE + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("tr.ecrow"); await p.waitForTimeout(500);
      const m = await p.evaluate(() => { const box = document.querySelector(".calwrap"), br = box.getBoundingClientRect(), head = box.querySelector("th").getBoundingClientRect() /* the cells are the sticky part */; const rows = [...box.querySelectorAll("tr.ecrow")]; const rh = rows[0].getBoundingClientRect().height;
        const full = rows.filter((r) => { const x = r.getBoundingClientRect(); return x.top >= head.bottom - 0.5 && x.bottom <= br.bottom + 0.5; }).length; const labels = [...box.querySelectorAll("tr.cls")].filter((r) => { const x = r.getBoundingClientRect(); return x.top >= head.bottom - 0.5 && x.bottom <= br.bottom + 0.5; }).length;
        const next = rows.find((r) => !r.classList.contains("past")), nx = next?.getBoundingClientRect();
        return { total: rows.length, boxH: Math.round(br.height), want: Math.round(box.querySelector("thead").getBoundingClientRect().height + box.querySelector("tr.cls").getBoundingClientRect().height + 10 * rh), full, labels, scrollable: box.scrollHeight > box.clientHeight + 2, scrollTop: Math.round(box.scrollTop), nextInView: !!nx && nx.top >= head.bottom - 1 && nx.bottom <= br.bottom + 1, panelH: Math.round(document.querySelector('.panel[data-no="01"]').getBoundingClientRect().height), vh: innerHeight }; });
      ck(`box is sized to ten events plus one date line (${m.boxH}px, ${m.total} events in the feed)`, Math.abs(m.boxH - m.want) <= 2, m);
      ck(`${m.full} whole events and ${m.labels} date line(s) in view, starting on a whole row`, m.full === 10 - Math.max(0, m.labels - 1) && m.labels >= 1, m);   // the number of date lines in view depends on the hour the check runs at (three just after midnight in Singapore); whole rows only is what must hold
      ck("the rest is reached by scrolling inside the box", m.scrollable, m);
      ck("opens at the next upcoming event, with the latest results above it", m.nextInView && m.scrollTop > 0, m);
      ck("the calendar panel is under half the screen tall", m.panelH < m.vh * 0.6, m);
      const y0 = await p.evaluate(() => scrollY); const box = await p.locator(".calwrap").boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.wheel(0, 150); await p.waitForTimeout(300);
      const s1 = await p.evaluate(() => ({ st: Math.round(document.querySelector(".calwrap").scrollTop), y: Math.round(scrollY) }));
      ck("scrolling over it moves the events, not the page", s1.st > m.scrollTop && s1.y === Math.round(y0), s1);
      // scroll so that dimmed past rows pass under the column heads: the heads must stay on top of them
      const top = await p.evaluate(() => { const box = document.querySelector(".calwrap"); const firstPast = box.querySelector("tr.ecrow.past"); box.scrollTop = Math.max(0, firstPast.offsetTop + firstPast.offsetHeight * 2.5 - box.querySelector("thead").offsetHeight); const ths = [...box.querySelectorAll("th")]; return ths.map((th) => { const r = th.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && (el === th || th.contains(el)); }); });
      ck("the column heads stay on top of the rows scrolling under them", top.every(Boolean), top);
      await p.locator(".pick", { has: p.locator('.lbl:text-is("Type")') }).locator("select").selectOption("earnings"); await p.waitForSelector("table.ernT tr.ecrow"); await p.waitForTimeout(400);
      const e = await p.evaluate(() => { const box = document.querySelector(".calwrap"), head = box.querySelector("thead").getBoundingClientRect(), rh = box.querySelector("tr.ecrow").getBoundingClientRect().height; return { boxH: Math.round(box.getBoundingClientRect().height), want: Math.round(head.height + box.querySelector("tr.cls").getBoundingClientRect().height + 10 * rh), scrollable: box.scrollHeight > box.clientHeight + 2 }; });
      ck("earnings calendar: same ten-row box, scrolls inside", Math.abs(e.boxH - e.want) <= 2 && e.scrollable, e);
      ck("no page errors", errs.length === 0, errs); await p.locator(".pick", { has: p.locator('.lbl:text-is("Type")') }).locator("select").selectOption("macro"); await p.waitForSelector("table.calT:not(.ernT) tr.ecrow"); await p.waitForTimeout(500);
      const back = await p.evaluate(() => { const box = document.querySelector(".calwrap"), hb = box.querySelector("th").getBoundingClientRect().bottom, bb = box.getBoundingClientRect().bottom; const next = [...box.querySelectorAll("tr.ecrow")].find((r) => !r.classList.contains("past"))?.getBoundingClientRect(); return { st: Math.round(box.scrollTop), nextInView: !!next && next.top >= hb - 1 && next.bottom <= bb + 1 }; });
      ck("back from Earnings to Macro: the list opens at the next event again", back.st > 0 && back.nextInView, back);
      if (dev === "iPhone 13") await p.screenshot({ path: "phone-calendar.png" }); await ctx.close(); }
    console.log(`\n[RESEARCH on ${dev}]`);
    { const ctx = await b.newContext({ ...devices[dev] }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); await routes(p);
      const calls = []; p.on("request", (r) => { const u = r.url(); if (u.includes("fakeapi")) calls.push(new URL(u).searchParams.get("action")); });
      await p.goto(LIVE + "#research", { waitUntil: "networkidle" }); await p.waitForSelector("table.repT"); await p.waitForTimeout(500);
      ck("opens on the titles only: list shown, no document panel", (await vis(p, '.panel[data-k="replist"]')) === 1 && (await vis(p, '.panel[data-k="report"]')) === 0);
      ck("no document is downloaded until a title is tapped", !calls.includes("note") && !calls.includes("report"), calls);
      if (dev === "iPhone 13") await p.screenshot({ path: "phone-research-list.png" });
      await p.evaluate(() => scrollTo(0, 700)); await p.waitForTimeout(200); const yList = await p.evaluate(() => Math.round(scrollY));
      const row = p.locator("table.repT tbody tr").nth(12); const title = (await row.locator("td").nth(2).textContent()).trim(); const rb = await row.boundingBox();
      await p.touchscreen.tap(rb.x + rb.width * 0.6, rb.y + rb.height / 2); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(400);
      const d = await p.evaluate(() => ({ hash: location.hash, list: document.querySelectorAll('.panel[data-k="replist"]').length, h2: document.querySelector('.panel[data-k="report"] h2')?.textContent, y: Math.round(scrollY), backs: document.querySelectorAll(".rsback .chip-sm").length }));
      ck("tap a title: the piece replaces the list, at its top, address names it", d.list === 0 && d.h2 === title && d.y === 0 && /^#research\/(note|report):/.test(d.hash), { ...d, title });
      ck("a back button above and below the piece", d.backs === 2, d);
      if (dev === "iPhone 13") await p.screenshot({ path: "phone-research-doc.png" });
      await p.locator(".rsback .chip-sm").first().tap(); await p.waitForSelector("table.repT"); await p.waitForTimeout(400);
      const l = await p.evaluate(() => ({ hash: location.hash, doc: document.querySelectorAll('.panel[data-k="report"]').length, y: Math.round(scrollY), sel: document.querySelector("table.repT tr.sel td:nth-child(3)")?.textContent?.trim() }));
      ck("back button: the list again, where it was left, the piece just read marked", l.doc === 0 && l.hash === "#research" && Math.abs(l.y - yList) <= 2 && l.sel === title, { ...l, yList, title });
      const row2 = p.locator("table.repT tbody tr").nth(14); const title2 = (await row2.locator("td").nth(2).textContent()).trim(); const rb2 = await row2.boundingBox();
      await p.touchscreen.tap(rb2.x + rb2.width * 0.6, rb2.y + rb2.height / 2); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(300);
      ck("a second piece shows its own title", (await p.locator('.panel[data-k="report"] h2').textContent()) === title2);
      await p.goBack(); await p.waitForSelector("table.repT"); await p.waitForTimeout(400);
      const g = await p.evaluate(() => ({ hash: location.hash, doc: document.querySelectorAll('.panel[data-k="report"]').length, y: Math.round(scrollY) }));
      ck("the phone's own Back returns to the list at the same place", g.doc === 0 && g.hash === "#research" && Math.abs(g.y - yList) <= 2, { ...g, yList });
      // search, open, come back: the search is kept
      await p.locator(".searchrow input").fill("weekly"); await p.waitForTimeout(300); const nf = await p.locator("table.repT tbody tr").count();
      await p.locator("table.repT tbody tr").nth(1).tap(); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(300); await p.goBack(); await p.waitForSelector("table.repT"); await p.waitForTimeout(300);
      ck(`search kept after reading (${nf} matches still listed)`, (await p.locator(".searchrow input").inputValue()) === "weekly" && (await p.locator("table.repT tbody tr").count()) === nf && nf > 0 && nf < 45);
      ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  }
  { console.log("\n[RESEARCH opened by a link, iPhone 13]");
    const ctx = await b.newContext({ ...devices["iPhone 13"] }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); await routes(p);
    await p.goto(LIVE + "#research/report:1", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(300);
    ck("a link to a piece opens that piece", (await vis(p, '.panel[data-k="replist"]')) === 0 && /Weekly Strategy/.test(await p.locator('.panel[data-k="report"] h2').textContent()));
    await p.locator(".rsback .chip-sm").first().tap(); await p.waitForSelector("table.repT"); await p.waitForTimeout(300);
    ck("its back button leads to the list (not out of the app)", p.url().endsWith("#research") && (await vis(p, '.panel[data-k="report"]')) === 0, p.url()); await ctx.close(); }
  { console.log("\n[phone on its side: iPhone 13 landscape]");
    const ctx = await b.newContext({ ...devices["iPhone 13 landscape"] }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); await routes(p);
    await p.goto(LIVE + "#research", { waitUntil: "networkidle" }); await p.waitForSelector("table.repT"); await p.waitForTimeout(400);
    const q = await p.evaluate(() => ({ w: innerWidth, h: innerHeight, coarse: matchMedia("(pointer:coarse)").matches }));
    ck(`RESEARCH opens on the titles only (${q.w}x${q.h})`, (await vis(p, '.panel[data-k="replist"]')) === 1 && (await vis(p, '.panel[data-k="report"]')) === 0, q);
    await p.locator("table.repT tbody tr").nth(1).tap(); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(300);
    ck("a tap opens the piece alone", (await vis(p, '.panel[data-k="replist"]')) === 0);
    await p.goto(LIVE + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("tr.ecrow"); await p.waitForTimeout(500);
    const c = await p.evaluate(() => { const box = document.querySelector(".calwrap"); return { capped: box.style.maxHeight !== "", h: Math.round(box.getBoundingClientRect().height), scrollable: box.scrollHeight > box.clientHeight + 2 }; });
    ck("calendar: ten-row box that scrolls inside", c.capped && c.h < 300 && c.scrollable, c); await ctx.close(); }
  { console.log("\n[tablet: iPad (gen 7) portrait: unchanged]");
    const ctx = await b.newContext({ ...devices["iPad (gen 7)"] }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); await routes(p);
    await p.goto(LIVE + "#research", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(300);
    ck("RESEARCH: list above the document, first piece open, no back button", (await vis(p, '.panel[data-k="replist"]')) === 1 && (await vis(p, '.panel[data-k="report"]')) === 1 && (await vis(p, ".rsback")) === 0);
    await p.goto(LIVE + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("tr.ecrow"); await p.waitForTimeout(400);
    ck("NEWS: the calendar keeps its tall box", await p.evaluate(() => document.querySelector(".calwrap").style.maxHeight === "" && document.querySelector(".calwrap").getBoundingClientRect().height > 400)); await ctx.close(); }
  { console.log("\n[laptop 1440x900: unchanged]");
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { try { if (localStorage.getItem("om_phone_v2") == null) localStorage.setItem("om_phone_v2", "0"); } catch {} }); const p = await ctx.newPage(); await routes(p);
    await p.goto(LIVE + "#research", { waitUntil: "networkidle" }); await p.waitForSelector('.panel[data-k="report"] .brnar h2'); await p.waitForTimeout(300);
    ck("RESEARCH: list and document side by side, first piece open, no back button", (await vis(p, '.panel[data-k="replist"]')) === 1 && (await vis(p, '.panel[data-k="report"]')) === 1 && (await vis(p, ".rsback")) === 0);
    await p.locator("table.repT tbody tr").nth(2).click(); await p.waitForTimeout(400);
    ck("clicking a title opens it beside the list and leaves the address alone", p.url().endsWith("#research") && (await p.locator('.panel[data-k="report"] h2').textContent()) === (await p.locator("table.repT tbody tr").nth(2).locator("td").nth(2).textContent()).trim(), p.url());
    await p.goto(LIVE + "#news", { waitUntil: "networkidle" }); await p.waitForSelector("tr.ecrow"); await p.waitForTimeout(400);
    const c = await p.evaluate(() => ({ inline: document.querySelector(".calwrap").style.maxHeight, h: Math.round(document.querySelector(".calwrap").getBoundingClientRect().height) }));
    ck("NEWS: the calendar keeps its tall desktop box", c.inline === "" && c.h > 500, c); await ctx.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
