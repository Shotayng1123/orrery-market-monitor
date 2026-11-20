// A stock's page, increment I-3 (20 Nov 2026), part two: big moves and the charts. The figures are the mock feed's.
//   - D-27 (with the PMs' answer to Q3): every figure on the page takes the colour of its sign, a big move's too; the
//     circles and the dots keep the turn's colour (a peak red, a bottom green), and the turn is a word. On a computer
//     and on a phone, in the list and in the chart's card.
//   - D-39: BIG MOVES says how many in its head; the rule is a line under the table.
//   - A-25: on a phone, a move tapped in the list opens on the chart: PERIOD the shortest view that holds it, the chart
//     brought up under the page's head, its card open and its circle ringed for two seconds.
//   - D-42: on a phone, a tap on a chart puts the crosshair on that day and the line under the chart gives the date,
//     the level and the σ distance; it stays until the next tap; a sideways drag still moves the chart. The same on a
//     MARKETS chart.
//   - A-16 (5Y and 10Y; the log scale comes with I-24): a stock's page offers 5Y and 10Y, and 10Y shows ten years in
//     one view on both layouts; the other tabs keep 1D to 36M.
// Nothing here depends on the time of day: the stand-in moves sit on the mock chart's own days, found by their words.
// Run from web/:  node e2e/run.cjs stock-moves-periods   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 1500)}`); };
async function page(b, opts, prefs) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); } catch {} }, prefs || null);
  await ctx.route(/^https?:\/\/(www\.)?example\.(org|com)\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stand-in</title>stand-in" }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, hash, sel) => { await p.goto(MOCK + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(600); };
const UP = "rgb(63, 208, 126)", DN = "rgb(255, 77, 66)";
// Every signed figure written on the page ("+11.4%", "−12.9%", "−0.7"), with the colour it is drawn in: a figure in
// the green of a rise or the red of a fall must have that sign (the designer's check for D-27, the whole page).
const signScan = (p) => p.evaluate(([UP, DN]) => {
  const bad = [], seen = { up: 0, dn: 0 }, w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const el = t.parentElement; if (!el || !el.checkVisibility()) continue;
    const col = getComputedStyle(el).color; if (col !== UP && col !== DN) continue;
    for (const m of t.data.matchAll(/(?:^|[\s(:/])([+−-])\d[\d,]*(?:\.\d+)?/g)) {
      const neg = m[1] !== "+"; seen[col === UP ? "up" : "dn"]++;
      if (neg === (col === UP)) bad.push(`${t.data.trim().slice(0, 60)} (${col === UP ? "green" : "red"})`);
    }
  }
  return { seen, bad };
}, [UP, DN]);
// the circles on a chart's canvas, found by their colour (as e2e/stock-page.cjs): page coordinates of each disc
const discs = (p, sel) => p.evaluate((sel) => {
  const c = document.querySelector(sel + " canvas"), g = c.getContext("2d"), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data, r = c.getBoundingClientRect(), k = r.width / w, dpr = w / c.clientWidth;
  const is = (x, y, col) => { const i = (y * w + x) * 4; return d[i + 3] > 240 && Math.abs(d[i] - col[0]) < 14 && Math.abs(d[i + 1] - col[1]) < 14 && Math.abs(d[i + 2] - col[2]) < 14; };
  const half = Math.max(2, Math.round(2 * dpr)), out = { up: [], dn: [] };
  for (const [name, col] of [["up", [63, 208, 126]], ["dn", [255, 77, 66]]]) {
    const hits = [];
    for (let y = half; y < h - half; y += 2) for (let x = half; x < w - half; x += 2) { if (!is(x, y, col)) continue; let n = 0, all = 0; for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) { all++; if (is(x + dx, y + dy, col)) n++; } if (n / all >= 0.85) hits.push([x, y]); }
    for (const [x, y] of hits) { const near = out[name].find((o) => Math.hypot(o.cx - x, o.cy - y) < 10 * dpr); if (near) { near.n++; near.sx += x; near.sy += y; near.cx = near.sx / near.n; near.cy = near.sy / near.n; } else out[name].push({ cx: x, cy: y, sx: x, sy: y, n: 1 }); }
    out[name] = out[name].map((o) => ({ x: r.left + o.cx * k, y: r.top + o.cy * k, cx: o.cx, cy: o.cy })).sort((a, z) => a.x - z.x);
  }
  return out;
}, sel);
// the ring a mark opened from the list gets (#e8e5de, 2 px, 5 px out from the circle): its pixels in an annulus round a disc
const ringAt = (p, sel, disc) => p.evaluate(([sel, disc]) => {
  const c = document.querySelector(sel + " canvas"), g = c.getContext("2d"), dpr = c.width / c.clientWidth, R0 = 7 * dpr, R1 = 13 * dpr;
  const x0 = Math.max(0, Math.floor(disc.cx - R1)), y0 = Math.max(0, Math.floor(disc.cy - R1)), size = Math.ceil(2 * R1), d = g.getImageData(x0, y0, size, size).data;
  let n = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const r = Math.hypot(x0 + x - disc.cx, y0 + y - disc.cy); if (r < R0 || r > R1) continue; const i = (y * size + x) * 4; if (d[i + 3] > 200 && Math.abs(d[i] - 232) < 16 && Math.abs(d[i + 1] - 229) < 16 && Math.abs(d[i + 2] - 222) < 16) n++; }
  return n;
}, [sel, disc]);
// a finger's drag across a chart (Chrome's own touch events: the page sees touch pointers)
async function touchDrag(p, x0, y, dx) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (dx * i) / 8, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
const dateIn = (t) => (/^(\d{4}-\d{2}-\d{2}) · /.exec(t || "") ?? [])[1] ?? null;
// a height on the chart at `x` that is clear of every circle by `reach` px (a circle near the pointer shows its own
// card instead of the day's figures: 9 px for a mouse, 22 px for a finger)
async function clearY(p, sel, x, reach) {
  const o = await p.locator(sel + " .u-over").boundingBox(), ds = await discs(p, sel), all = [...ds.up, ...ds.dn];
  return [0.08, 0.5, 0.92, 0.3, 0.7].map((f) => o.y + o.height * f).find((y) => all.every((d) => Math.hypot(d.x - x, d.y - y) > reach + 4)) ?? o.y + o.height * 0.08;
}
const years = (a, z) => (Date.parse(z) - Date.parse(a)) / (365.25 * 86400e3);

(async () => { const b = await chromium.launch();
  console.log("\n[D-27 and D-39 on a computer (1440x900): figures in their sign's colour, the turn in the dot and a word; the rule under the table]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: false, v: 2 });
    for (const sym of ["7203.T", "NVDA"]) {
      await go(p, "#asset/" + sym, "#st-moves tbody tr");
      const sc = await signScan(p);
      ck(`${sym}: no negative figure in green and no positive figure in red anywhere on the page (${sc.seen.up} green and ${sc.seen.dn} red figures read)`, sc.bad.length === 0 && sc.seen.up > 10 && sc.seen.dn > 10, sc.bad);
      const mv = await p.evaluate(() => [...document.querySelectorAll("#st-moves tbody tr")].map((tr) => ({ kind: tr.dataset.kind, dot: getComputedStyle(tr.querySelector(".dot")).backgroundColor, word: tr.querySelector(".mvw")?.innerText ?? null, wordCol: tr.querySelector(".mvw") ? getComputedStyle(tr.querySelector(".mvw")).color : null, fig: tr.querySelector(".mvf").textContent, figCol: getComputedStyle(tr.querySelector(".mvf")).color, rest: tr.querySelector(".mvr").textContent })));
      const WORD = { pk: "NEW HIGH", bt: "BOTTOM", p2: "SMALLER PEAK", b2: "SMALLER BOTTOM", d1: null };
      ck(`${sym}: each move as a word for its turn (none for a day), the figure in its sign's colour, the rest muted; the dot in the turn's colour, a peak red and a bottom green (${mv.map((m) => `${m.word ?? ""} ${m.fig}`.trim()).join("; ")})`, mv.length === 6 && mv.every((m) => m.word === WORD[m.kind] && m.figCol === (m.fig.startsWith("+") ? UP : DN) && (m.word === null || m.wordCol === "rgb(198, 194, 183)") && m.dot === (m.kind === "pk" || m.kind === "p2" ? DN : m.kind === "bt" || m.kind === "b2" ? UP : m.fig.startsWith("+") ? UP : DN) && /^(on the day|from the (low|high) of \d{1,2} [A-Z][a-z]{2})$/.test(m.rest)), mv);
      const hd = await p.evaluate(() => { const pn = document.querySelector('.panel[data-k="st-moves"]'), rule = pn.querySelector("#st-moverule"); return { aux: pn.querySelector(".phead .aux").textContent, rule: rule?.textContent ?? null, below: rule ? rule.getBoundingClientRect().top >= pn.querySelector("#st-movebox").getBoundingClientRect().bottom - 1 : false }; });
      ck(`${sym}: the head says "${hd.aux}" only; the rule is a muted line under the table (D-39)`, hd.aux === "6 in three years, newest first" && hd.rule === "10% in a day · peaks red, bottoms green · large circles: turns of 15%, a peak only when a 12-month high · small circles: turns of 10% · circles on the daily charts (3M to 10Y) for the last three years" && hd.below, hd);
    }
    // the chart's card follows the same rule
    await go(p, "#asset/7203.T", ".bigwrap canvas"); await p.mouse.move(5, 5); await p.waitForTimeout(150);
    const ds = await discs(p, ".bigwrap"), red = ds.dn[ds.dn.length - 1];
    await p.mouse.move(red.x, red.y); await p.waitForTimeout(250);
    const card = await p.evaluate(() => { const e = document.querySelector(".bigwrap .mvtip"); if (!e || getComputedStyle(e).display === "none") return null; return { text: e.innerText, tCls: e.querySelector(".t").className, tCol: getComputedStyle(e.querySelector(".t")).color, dot: getComputedStyle(e.querySelector(".t .dot")).backgroundColor, figs: [...e.querySelectorAll(".mvf")].map((f) => [f.textContent, getComputedStyle(f).color]) }; });
    ck("the chart's card: the day after a dot in the circle's colour, in plain text; each figure in its sign's colour (\"−12.9%\" red, \"+11.3%\" green)", !!card && card.tCls === "t" && card.tCol === "rgb(232, 229, 222)" && card.dot === DN && card.figs.length === 2 && card.figs.every(([f, c]) => c === (f.startsWith("+") ? UP : DN)) && /−12\.9% on the day/.test(card.text) && /SMALLER PEAK \+11\.3% from the low of/.test(card.text), card);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the phone (iPhone 13): the same colours; a move in the list opens on the chart (A-25)]");
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, "#asset/7203.T", "#st-movebox li");
    const sc = await signScan(p);
    ck(`no negative figure in green and no positive figure in red anywhere on the page (${sc.seen.up} green and ${sc.seen.dn} red figures read)`, sc.bad.length === 0 && sc.seen.up > 10 && sc.seen.dn > 10, sc.bad);
    const li = await p.evaluate(() => [...document.querySelectorAll("#st-movebox li")].map((e) => ({ role: e.getAttribute("role"), h: Math.round(e.getBoundingClientRect().height), go: e.querySelector(".dl .go")?.textContent ?? null, date: e.querySelector(".dl .d")?.textContent ?? null, links: [...e.querySelectorAll(".s a")].map((a) => Math.round(a.getBoundingClientRect().height)) })));
    ck(`each move is a row to tap (${Math.min(...li.map((x) => x.h))} px at least), its date on a line of its own with "On the chart ›" at its right; a reason's sources ${Math.min(...li.flatMap((x) => x.links))} px tall`, li.length === 6 && li.every((x) => x.role === "button" && x.h >= 44 && x.go === "On the chart ›" && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) && li.flatMap((x) => x.links).every((h) => h >= 44), li);
    const before = await p.evaluate(() => document.querySelector('.mp-picks select[aria-label="Period"]').value);
    // a source link opens the report and leaves the chart alone
    const src = p.locator("#st-movebox li", { hasText: "on the day" }).first().locator(".s a").first();
    await src.scrollIntoViewIfNeeded();
    const [pop] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }), src.tap()]); await pop.close();
    ck("a reason's source opens the report in a new tab and does not move the chart", (await p.evaluate(() => document.querySelector('.mp-picks select[aria-label="Period"]').value)) === before && before === "12M", before);
    const move = p.locator("#st-movebox li", { hasText: "−12.9%" });
    await move.scrollIntoViewIfNeeded(); await move.locator(".h").tap(); await p.waitForTimeout(500);
    const st = await p.evaluate(() => { const hero = document.querySelector(".mp-hero").getBoundingClientRect(), head = document.querySelector(".mp-head").getBoundingClientRect(), e = document.querySelector(".mp-hero .mvtip"); return { period: document.querySelector('.mp-picks select[aria-label="Period"]').value, heroTop: Math.round(hero.top), headBottom: Math.round(head.bottom), vh: innerHeight, card: e && getComputedStyle(e).display !== "none" ? e.innerText : null }; });
    ck(`tapping "−12.9% on the day" sets PERIOD to ${st.period}, brings the chart up under the page's head (at ${st.heroTop} px, the head ends at ${st.headBottom}) and opens its card`, st.period === "3M" && st.heroTop >= st.headBottom - 1 && st.heroTop < st.vh * 0.3 && !!st.card && /^\d{4}-\d{2}-\d{2}\n−12\.9% on the day\nMock: a recall/.test(st.card), st);
    const pd = await discs(p, ".mp-hero"), ring0 = pd.dn.length ? await ringAt(p, ".mp-hero", pd.dn[pd.dn.length - 1]) : 0;
    const cardBox = await p.evaluate(() => { const r = document.querySelector(".mp-hero .mvtip").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }), circle = pd.dn[pd.dn.length - 1];
    ck(`its circle is ringed (${ring0} ring pixels round it) and the card does not cover it`, ring0 > 20 && !!circle && !(circle.x > cardBox.l && circle.x < cardBox.r && circle.y > cardBox.t && circle.y < cardBox.b), { ring0, circle, cardBox });
    await p.waitForFunction(() => true); await p.waitForTimeout(2600);
    const ring1 = await ringAt(p, ".mp-hero", (await discs(p, ".mp-hero")).dn.slice(-1)[0]);
    ck(`after two seconds the ring is gone (${ring1}) and the card stays`, ring1 < 5 && (await p.evaluate(() => getComputedStyle(document.querySelector(".mp-hero .mvtip")).display)) !== "none", ring1);
    // a move older than three months: the shortest view that holds it
    const old = p.locator("#st-movebox li", { hasText: "BOTTOM" });
    await old.scrollIntoViewIfNeeded(); await old.locator(".h").tap(); await p.waitForTimeout(500);
    const st2 = await p.evaluate(() => ({ period: document.querySelector('.mp-picks select[aria-label="Period"]').value, card: getComputedStyle(document.querySelector(".mp-hero .mvtip")).display !== "none" ? document.querySelector(".mp-hero .mvtip").innerText : null }));
    ck(`the bottom of about four months ago opens on ${st2.period}, its card open`, st2.period === "12M" && /BOTTOM −24\.1% from the high of/.test(st2.card ?? ""), st2);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the phone: a tap on a chart reads that day (D-42)]");
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, "#asset/7203.T", ".mp-hero canvas");
    await p.evaluate(() => { const h = document.querySelector(".mp-hero"); scrollTo(0, h.getBoundingClientRect().top + scrollY - 70); }); await p.waitForTimeout(300);
    const ov = await p.locator(".mp-hero .u-over").boundingBox(), y = await clearY(p, ".mp-hero", ov.x + ov.width * 0.3, 22);
    const idle = await p.locator(".mp-hero .rdout").textContent();
    await p.touchscreen.tap(ov.x + ov.width * 0.3, y); await p.waitForTimeout(300);
    const rd1 = await p.locator(".mp-hero .rdout").textContent();
    const cx = await p.evaluate(() => { const x = document.querySelector(".mp-hero .u-cursor-x"), r = x.getBoundingClientRect(); return { left: r.left, off: x.classList.contains("u-off"), shown: getComputedStyle(x).display !== "none" }; });
    ck(`a tap puts the crosshair on the tapped day (${Math.round(cx.left)} px, tapped at ${Math.round(ov.x + ov.width * 0.3)}) and the line under the chart reads "${rd1}"`, /daily closes/.test(idle) && /^\d{4}-\d{2}-\d{2} · [\d,]+(\.\d+)? · 12M [+\-−]\d+\.\d\dσ · vol \d/.test(rd1) && cx.shown && !cx.off && Math.abs(cx.left - (ov.x + ov.width * 0.3)) <= 2, { idle, rd1, cx });
    await p.waitForTimeout(1500);
    ck("it stays until the next tap", (await p.locator(".mp-hero .rdout").textContent()) === rd1);
    await touchDrag(p, ov.x + ov.width * 0.5, y, 90); await p.waitForTimeout(400);
    const rd2 = await p.locator(".mp-hero .rdout").textContent();
    ck(`a sideways drag still moves the chart: the crosshair stays where it was and now reads an earlier day (${dateIn(rd2)} after ${dateIn(rd1)})`, !!dateIn(rd2) && dateIn(rd2) < dateIn(rd1), { rd1, rd2 });
    await p.touchscreen.tap(ov.x + ov.width * 0.8, y); await p.waitForTimeout(300);
    const rd3 = await p.locator(".mp-hero .rdout").textContent();
    ck(`the next tap moves it to its own day (${dateIn(rd3)})`, !!dateIn(rd3) && dateIn(rd3) > dateIn(rd2), rd3);
    // the same on a MARKETS chart
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row"); await p.addStyleTag({ content: "#mockbar{display:none!important}" });
    await p.locator("button.mp-row").first().tap(); await p.waitForSelector(".mp-item.open .u-over"); await p.waitForTimeout(700);
    await p.evaluate(() => { const o = document.querySelector(".mp-item.open .u-over"); scrollTo(0, o.getBoundingClientRect().top + scrollY - 150); }); await p.waitForTimeout(300);
    const mo = await p.locator(".mp-item.open .u-over").boundingBox();
    await p.touchscreen.tap(mo.x + mo.width * 0.5, mo.y + mo.height * 0.5); await p.waitForTimeout(300);
    const mrd = await p.locator(".mp-item.open .rdout").textContent();
    ck(`on MARKETS too: a tap on an instrument's chart reads "${mrd}"`, /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2} \d{2}:\d{2} SGT) · [\d,]+(\.\d+)?/.test(mrd), mrd);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[5Y and 10Y on a stock's page (A-16): ten years in one view, on both layouts]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, { size: "AUTO", compact: false, v: 2 });
    await go(p, "#market", "table");
    const mkt = await p.evaluate(() => [...document.querySelector('select[aria-label="Period"]').options].map((o) => o.value));
    await go(p, "#asset/NVDA", ".bigwrap canvas");
    const opts = await p.evaluate(() => [...document.querySelector('select[aria-label="Period"]').options].map((o) => o.value));
    ck(`a stock's PERIOD offers ${opts.join(" ")}; MARKETS keeps ${mkt.join(" ")}`, opts.join() === "1D,1W,1M,3M,12M,36M,5Y,10Y" && mkt.join() === "1D,1W,1M,3M,12M,36M", { opts, mkt });
    const span = async (sel) => { const o = await p.locator(sel + " .u-over").boundingBox(), xa = o.x + 2, xz = o.x + o.width - 2;
      await p.mouse.move(xa, await clearY(p, sel, xa, 9), { steps: 2 }); await p.waitForTimeout(200); const a = dateIn(await p.locator(sel + " .rdout").textContent());
      await p.mouse.move(5, 5); await p.waitForTimeout(150); const yz = await clearY(p, sel, xz, 9);
      await p.mouse.move(xz, yz, { steps: 2 }); await p.waitForTimeout(200); const z = dateIn(await p.locator(sel + " .rdout").textContent());
      await p.mouse.move(5, 5); await p.waitForTimeout(200); return { a, z, years: a && z ? years(a, z) : 0 }; };
    for (const [per, lo, hi] of [["10Y", 9.8, 10.01], ["5Y", 4.9, 5.01]]) {
      await p.locator('select[aria-label="Period"]').first().selectOption(per); await p.waitForTimeout(900);
      const s = await span(".bigwrap"), idle = await p.locator(".bigwrap .rdout").textContent(), ch = await p.locator(".bigwrap .ch").textContent();
      ck(`computer · ${per}: ${s.years.toFixed(2)} years in one view (${s.a} to ${s.z}); the change is over ${per}; under the chart "${idle}"`, s.years >= lo && s.years <= hi && new RegExp(` ${per} · from `).test(ch) && /circles: last three years/.test(idle), { s, idle, ch });
    }
    await p.locator('select[aria-label="Period"]').first().selectOption("3M"); await p.waitForTimeout(900);
    ck("3M: no word about the circles, which cover it all", !/circles/.test(await p.locator(".bigwrap .rdout").textContent()));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { ...devices["iPhone 13"] });
    await go(p, "#asset/NVDA", ".mp-hero canvas");
    const opts = await p.evaluate(() => [...document.querySelector('.mp-picks select[aria-label="Period"]').options].map((o) => o.value));
    await p.locator('.mp-picks select[aria-label="Period"]').selectOption("10Y"); await p.waitForTimeout(900);
    await p.evaluate(() => { const h = document.querySelector(".mp-hero"); scrollTo(0, h.getBoundingClientRect().top + scrollY - 70); }); await p.waitForTimeout(300);
    const ov = await p.locator(".mp-hero .u-over").boundingBox();
    // a tap 1.5 px in from each edge: on a phone's chart of about 280 px for ten years, about two weeks from each end
    await p.touchscreen.tap(ov.x + 1.5, await clearY(p, ".mp-hero", ov.x + 1.5, 22)); await p.waitForTimeout(300); const a = dateIn(await p.locator(".mp-hero .rdout").textContent());
    await p.touchscreen.tap(ov.x + ov.width - 1.5, await clearY(p, ".mp-hero", ov.x + ov.width - 1.5, 22)); await p.waitForTimeout(300); const z = dateIn(await p.locator(".mp-hero .rdout").textContent());
    ck(`phone · PERIOD offers ${opts.join(" ")}; 10Y shows ${a && z ? years(a, z).toFixed(2) : "?"} years in one view (${a} to ${z})`, opts.join() === "1D,1W,1M,3M,12M,36M,5Y,10Y" && !!a && !!z && years(a, z) >= 9.75 && years(a, z) <= 10.01, { opts, a, z });
    ck("phone · no page errors", errs.length === 0, errs); await ctx.close(); }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
