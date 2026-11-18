// A stock's own page (#asset/SYMBOL): the chart with volume, key data, performance against the benchmark, short
// interest and the statements table, on a desktop and in the phone layout; a name with the full set of lines
// (ten years, guidance, twelve quarters) and one with the sparse set; and the earlier page for a server that does
// not answer the `stock` action yet. The figures are the mock feed's (made up, but consistent with each other, so
// the sums and ratios on the page can be checked against the cells they come from).
// Run from web/:  node e2e/run.cjs stock-page   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const num = (t) => { const s = String(t).replace(/[,%x+]/g, "").replace(/−/g, "-").trim(); return s === "–" || s === "" ? null : Number(s); };
const hideBar = (p) => p.evaluate(() => { const m = document.querySelector("#mockbar"); if (m) m.style.display = "none"; });
// the statements table as data: period labels, and for every line its cells' text and classes
const fin = (p) => p.evaluate(() => {
  const t = document.querySelector("table.fin"); if (!t) return null;
  const head = [...t.querySelectorAll("thead th")].map((th) => th.textContent);
  const rows = {}; const order = {};
  for (const tb of t.querySelectorAll("tbody")) { const sec = tb.dataset.sec; order[sec] = [];
    for (const tr of tb.querySelectorAll("tr[data-line]")) { order[sec].push(tr.dataset.line); rows[tr.dataset.line] = { label: tr.cells[0].textContent, strong: tr.classList.contains("strong"), cells: [...tr.cells].slice(1).map((c) => c.textContent), cls: [...tr.cells].slice(1).map((c) => c.className) }; } }
  const box = t.closest(".finbox");
  return { unit: t.querySelector("thead th .u").textContent, perShare: t.querySelector("thead th small").textContent, periods: head.slice(1), fc: [...t.querySelectorAll("thead th")].slice(1).map((th) => th.classList.contains("fc")), bands: [...t.querySelectorAll("tr.band")].map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent]), order, rows, box: { w: box.clientWidth, sw: box.scrollWidth, left: box.scrollLeft } };
});
// The marks are drawn on the chart's canvas, so they are found by their colour: a filled disc of the "up" green or
// the "down" red (the price line is one of those colours too, but only a pixel or two wide). Returns each disc's
// centre in page coordinates, ready for the mouse or a finger.
const discs = (p, sel) => p.evaluate((sel) => {
  const c = document.querySelector(sel + " canvas"), g = c.getContext("2d"), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data, r = c.getBoundingClientRect(), k = r.width / w, dpr = w / c.clientWidth;
  const is = (x, y, col) => { const i = (y * w + x) * 4; return d[i + 3] > 240 && Math.abs(d[i] - col[0]) < 14 && Math.abs(d[i + 1] - col[1]) < 14 && Math.abs(d[i + 2] - col[2]) < 14; };
  const half = Math.max(2, Math.round(2 * dpr)), out = { up: [], dn: [] };   // the fill is ~3.7 CSS px in radius inside its dark rim: a box 2 px each way from a point near the centre is all fill
  for (const [name, col] of [["up", [63, 208, 126]], ["dn", [255, 77, 66]]]) {
    const hits = [];
    for (let y = half; y < h - half; y += 2) for (let x = half; x < w - half; x += 2) {
      if (!is(x, y, col)) continue;
      let n = 0, all = 0; for (let dy = -half; dy <= half; dy += 1) for (let dx = -half; dx <= half; dx += 1) { all++; if (is(x + dx, y + dy, col)) n++; }
      if (n / all >= 0.85) hits.push([x, y]);
    }
    for (const [x, y] of hits) { const near = out[name].find((o) => Math.hypot(o.cx - x, o.cy - y) < 10 * dpr); if (near) { near.n++; near.sx += x; near.sy += y; near.cx = near.sx / near.n; near.cy = near.sy / near.n; } else out[name].push({ cx: x, cy: y, sx: x, sy: y, n: 1 }); }
    out[name] = out[name].map((o) => ({ x: r.left + o.cx * k, y: r.top + o.cy * k })).sort((a, b) => a.x - b.x);
  }
  return out;
}, sel);
const IS = "revenue,cogs,gross,sga,op,nonOpInc,nonOpExp,ordinary,extraInc,extraLoss,pretax,ni,eps,dps", BS = "cash,stDebt,ltDebt,netCash,assets,liabilities,equity", CF = "ocf,icf,fincf,capex,fcf";

(async () => { const b = await chromium.launch();
  console.log("\n[desktop, a name with the full set of lines]");
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#asset/7203.T", { waitUntil: "networkidle" }); await p.waitForSelector("table.fin"); await p.waitForSelector(".bigwrap canvas"); await p.waitForTimeout(900); await hideBar(p);
    const panels = await p.evaluate(() => [...document.querySelectorAll("#grid .panel")].map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`));
    ck("the panels: the chart, KEY DATA, PERFORMANCE VS the benchmarks, SHORT INTEREST, BIG MOVES AND WHY (a large company), FINANCIALS", panels.join("|") === "01 MOCK MOTOR CORP|02 KEY DATA|03 PERFORMANCE VS NIKKEI 225 AND TOPIX|04 SHORT INTEREST|05 BIG MOVES AND WHY|06 FINANCIALS", panels);
    // the chart: volume along its foot, named under the chart and in the read-out at the pointer
    const hint = await p.locator(".bigwrap .rdout").textContent();
    const box = await p.locator(".bigwrap .u-over").boundingBox(); await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4); await p.waitForTimeout(250);
    const tip = await p.locator(".bigwrap .ctip").textContent(), rd = await p.locator(".bigwrap .rdout").textContent();
    ck("the chart has its σ corridors and volume: said under the chart, and the pointer reads date, price, σ distance and that day's volume", /σ corridors · volume/.test(hint) && /^\d{4}-\d{2}-\d{2}\s+[\d,.]+\s+[+-]\d+\.\d+σ\s+vol \d+(\.\d+)?[kmb]/.test(tip) && /vol \d/.test(rd), { hint, tip, rd });
    await p.mouse.move(5, 5);
    const pix = await p.evaluate(() => { const c = document.querySelector(".bigwrap canvas"), g = c.getContext("2d"), w = c.width, h = c.height; let grey = 0; const y0 = Math.floor(h * 0.70), d = g.getImageData(0, y0, w, Math.floor(h * 0.22)).data; /* the bars are a part-clear grey: the pixels hold that grey with a part-way alpha */ for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i + 3] < 130 && d[i] > 150 && d[i] < 210 && Math.abs(d[i] - d[i + 1]) < 14 && Math.abs(d[i + 1] - d[i + 2]) < 22) grey++; return { grey, share: grey / (d.length / 4) }; });
    ck(`volume bars are drawn along the foot of the chart (${(pix.share * 100).toFixed(1)}% of that band is the bars' grey)`, pix.share > 0.02, pix);
    // key data
    const key = await p.evaluate(() => ({ krow: [...document.querySelectorAll('.panel[data-no="02"] .krow .k')].map((e) => e.textContent), mcap: document.querySelector("#st-mcap").textContent, rows: Object.fromEntries([...document.querySelectorAll("#st-key tr")].map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent])) }));
    const want = ["Shares outstanding", "Diluted shares", "ADTV, 60 sessions", "ADTV, 20 sessions", "Short interest (reported)", "52-week range", "Volatility, 1M / 3M / 12M", "Beta vs Nikkei 225, 12M", "Beta vs TOPIX, 12M", "P/E, last year / guidance", "P/B", "Dividend yield, last year / guidance", "Next earnings"];
    ck("KEY DATA: last, day, market cap; then shares outstanding, diluted shares, ADTV, short interest and the rest", key.krow.join() === "Last,Day,Market cap" && /^\d+(\.\d+)?(tn|bn|m) JPY$/.test(key.mcap) && want.every((k) => k in key.rows) && /^\d+(\.\d+)?(bn|m)$/.test(key.rows["Shares outstanding"]) && /^\d+(\.\d+)?m · \d+(\.\d+)?(tn|bn|m) JPY$/.test(key.rows["ADTV, 60 sessions"]) && /^\d\.\d\d% · \d+\.\dd$/.test(key.rows["Short interest (reported)"]) && /^\d+(\.\d)?x \/ \d+(\.\d)?x$/.test(key.rows["P/E, last year / guidance"]), key);
    ck("a figure the source does not give is a dash, not a zero (diluted shares here)", key.rows["Diluted shares"] === "–", key.rows["Diluted shares"]);
    // performance
    const perf = await p.evaluate(() => { const t = document.querySelector("#st-perf"); return { cols: [...t.querySelectorAll("thead th")].slice(1).map((x) => x.textContent), rows: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.cells].map((c) => c.textContent)), cls: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.cells].slice(1).map((c) => c.className)) }; });
    ck("PERFORMANCE: 1D, 1M, 3M, 6M, 12M, 36M, 60M; the price then, the stock, each of the two benchmarks, and the difference against each", perf.cols.join() === "1D,1M,3M,6M,12M,36M,60M" && perf.rows.map((r) => r[0]).join("|") === "Price then|7203.T|Nikkei 225|TOPIXPROXY|Against Nikkei 225, pp|Against TOPIX, pp" && perf.rows.every((r) => r.length === 8), perf);
    ck("each difference is the stock's change less that benchmark's, in every column, and each change is coloured by its sign", perf.cols.every((_, i) => { const s = num(perf.rows[1][i + 1]); return [2, 3].every((b) => { const bm = num(perf.rows[b][i + 1]), d = num(perf.rows[b + 2][i + 1]); return s != null && bm != null && Math.abs(s - bm - d) <= 0.11; }) && perf.cls[1][i].includes(s > 0 ? "up" : s < 0 ? "dn" : ""); }), perf.rows);
    const proxy = await p.evaluate(() => ({ tip: document.querySelector('#st-perf tr[data-r="bench"]:nth-of-type(4) td.l')?.title ?? "", notes: [...document.querySelectorAll('.panel[data-no="03"] .finnote')].map((e) => e.textContent) }));
    ck("TOPIX is marked as read from the 1306.T fund, with what that means, under the table and on the row", /1306\.T exchange-traded fund/.test(proxy.tip) && proxy.notes.some((n) => /1306\.T exchange-traded fund/.test(n) && /once a year/.test(n)), proxy);
    const price = num((await p.locator('.panel[data-no="02"] .krow .v').first().textContent()));
    ck("the stock's change agrees with the price then and the price now", perf.cols.every((_, i) => { const then = num(perf.rows[0][i + 1]), s = num(perf.rows[1][i + 1]); return Math.abs((price / then - 1) * 100 - s) <= 0.12; }), { price, rows: perf.rows.slice(0, 2) });
    // short interest
    const sh = await p.evaluate(() => [...document.querySelectorAll("#st-short tr")].map((tr) => [...tr.cells].map((c) => c.textContent)));
    ck("SHORT INTEREST (Tokyo): the reported positions in total, the shares and days of volume, then each holder", /^Reported positions \(0\.5% and above\) · \d{4}-\d{2}-\d{2}$/.test(sh[0][0]) && sh[0][1] === "1.23%" && /^Shares · days/.test(sh[1][0]) && sh.length === 4 && Math.abs(num(sh[2][1]) + num(sh[3][1]) - 1.23) < 0.011, sh);
    // big moves: circles on the chart, the reason at the pointer, and the list
    await p.mouse.move(5, 5); await p.waitForTimeout(150);
    let ds = await discs(p, ".bigwrap");
    ck(`the chart marks the big moves of its window with small circles, green for a rise and red for a fall (${ds.up.length} green, ${ds.dn.length} red)`, ds.up.length === 2 && ds.dn.length === 3, ds);
    const card = () => p.evaluate(() => { const e = document.querySelector(".bigwrap .mvtip"); return e && getComputedStyle(e).display !== "none" ? { text: e.innerText, cls: e.querySelector(".t").className, box: (() => { const r = e.getBoundingClientRect(), o = document.querySelector(".bigwrap .u-over").getBoundingClientRect(); return r.left >= o.left - 1 && r.right <= o.right + 1 && r.top >= o.top - 1 && r.bottom <= o.bottom + 1; })() } : null; });
    const last = ds.up[ds.up.length - 1];
    await p.mouse.move(last.x, last.y); await p.waitForTimeout(200); let cd = await card();
    ck("pointing at a circle shows what moved and why: the date, the move, the reported reason; inside the chart; and the plain price read-out steps aside", cd && /^\d{4}-\d{2}-\d{2}\n\+6\.4% on the day\nMock: second-quarter operating profit/.test(cd.text) && cd.cls.includes("up") && cd.box && !(await p.locator(".bigwrap .ctip").isVisible()), cd);
    await p.mouse.move(last.x - 60, last.y + 40); await p.waitForTimeout(200);
    ck("moving off the circle puts the card away and the price read-out back", (await card()) === null && (await p.locator(".bigwrap .ctip").isVisible()));
    const two = ds.dn[ds.dn.length - 1];
    await p.mouse.move(two.x, two.y); await p.waitForTimeout(200); cd = await card();
    ck("two moves that end on the same day share one circle, and its card gives both, each with its own answer", cd && /\u22127\.9% on the day\nMock: a recall/.test(cd.text) && /\u221211\.3% in five sessions \(from \d+ \w+\)\nNo reliable report of the reason was found\./.test(cd.text) && cd.cls.includes("dn"), cd);
    await p.mouse.move(5, 5);
    const mv = await p.evaluate(() => ({ aux: document.querySelector('.panel[data-no="05"] .aux').textContent, rows: [...document.querySelectorAll("#st-moves tbody tr")].map((tr) => ({ kind: tr.dataset.kind, status: tr.dataset.status, dot: tr.querySelector(".dot").className, d: tr.cells[0].textContent, move: tr.cells[1].textContent, moveCls: tr.cells[1].className, why: tr.cells[2].childNodes[0].textContent, links: [...tr.querySelectorAll("a")].map((a) => ({ t: a.textContent, href: a.href, target: a.target, rel: a.rel, title: a.title })) })) }));
    ck("BIG MOVES AND WHY lists them, newest first: the day each ended, the move in words and in its colour, and the rule in the header", mv.rows.length === 6 && mv.rows.map((r) => r.kind).join() === "d1,d1,w1,m1,m1,d1" && mv.rows.every((r, i) => i === 0 || r.d <= mv.rows[i - 1].d) && mv.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.d) && r.dot.includes(r.move.startsWith("+") ? "up" : "dn") && r.moveCls.includes(r.move.startsWith("+") ? "up" : "dn")) && /5% in a day · 10% in five sessions · 20% from high to low/.test(mv.aux), mv);
    ck("each state of the search reads as what it is: a reason with its sources, none found, being looked up, older than a year", mv.rows.map((r) => r.status).join() === "found,found,not_found,found,queued,old" && /^Mock: second-quarter/.test(mv.rows[0].why) && mv.rows[2].why === "No reliable report of the reason was found." && /being looked up/.test(mv.rows[4].why) && /last twelve months/.test(mv.rows[5].why) && mv.rows.filter((r) => r.status !== "found").every((r) => r.links.length === 0), mv.rows.map((r) => [r.status, r.why]));
    ck("a reason's sources are links named by their site, opening in a new tab", mv.rows[0].links.map((l) => l.t).join() === "example.com,example.org" && mv.rows[0].links.every((l) => /^https:\/\/example\./.test(l.href) && l.target === "_blank" && /noreferrer/.test(l.rel) && l.title.length > 5), mv.rows[0].links);
    const mb = await p.evaluate(() => { const b = document.querySelector("#st-movebox"), cs = getComputedStyle(b), fin = document.querySelector('.panel[data-no="06"]'); return { oy: cs.overflowY, maxH: parseFloat(cs.maxHeight), h: b.getBoundingClientRect().height, sticky: getComputedStyle(b.querySelector("thead th")).position, aux: document.querySelector('.panel[data-no="05"] .aux').textContent, gap: Math.round(fin.getBoundingClientRect().top - b.getBoundingClientRect().top) }; });
    ck(`the list sits in a short box with its own scrolling (at most ${mb.maxH}px), the column heads staying in view, the header saying how many there are; FINANCIALS starts ${mb.gap}px below the top of the list`, mb.oy === "auto" && mb.maxH >= 150 && mb.maxH <= 260 && mb.h <= mb.maxH + 1 && mb.sticky === "sticky" && /^6 in three years, newest first/.test(mb.aux) && mb.gap <= mb.maxH + 60, mb);
    await p.locator('select[aria-label="Period"]').first().selectOption("1D"); await p.waitForTimeout(900);
    const per = await p.evaluate(() => document.querySelector(".bigwrap .rdout").textContent);
    { ds = await discs(p, ".bigwrap"); ck("the one-day chart (minute bars) carries no marks: they belong to daily closes", /1-minute/.test(per) && ds.up.length === 0, { per, ds }); await p.locator('select[aria-label="Period"]').first().selectOption("12M"); await p.waitForTimeout(900); }
    // the statements, by year
    let f = await fin(p);
    ck("FINANCIALS by year: ten fiscal years and the company's guidance as the last column, marked E and tinted", f.periods.join() === "FY3/17,FY3/18,FY3/19,FY3/20,FY3/21,FY3/22,FY3/23,FY3/24,FY3/25,FY3/26,FY3/27E" && f.fc.join() === "false,false,false,false,false,false,false,false,false,false,true" && f.rows.revenue.cls[10].includes("fc") && !f.rows.revenue.cls[9].includes("fc"), f.periods);
    ck("the sections and their lines, in order: income statement, ratios, balance sheet, cash flow", f.bands.map((x) => x[0]).join("|") === "Income statement|Ratios, %|Balance sheet|Cash flow" && f.order.is.join() === IS && f.order.ratios.join() === "salesYoy,gpm,opm,npm,payout,roe,equityRatio" && f.order.bs.join() === BS && f.order.cf.join() === CF, f.order);
    ck("the lines are named as asked: revenue to DPS, cash to equity, operating cash flow to capex", ["Revenue", "Cost of sales", "Gross profit", "SG&A", "Operating profit", "Non-operating income", "Non-operating expenses", "Ordinary profit", "Extraordinary income", "Extraordinary losses", "Profit before tax", "Net income", "EPS", "DPS"].join() === f.order.is.map((k) => f.rows[k].label).join() && f.order.bs.map((k) => f.rows[k].label).join() === "Cash and deposits,Short-term debt,Long-term debt,Net cash,Total assets,Total liabilities,Equity" && f.order.cf.map((k) => f.rows[k].label).join() === "Operating cash flow,Investing cash flow,Financing cash flow,Capex,Free cash flow");
    const money = [...f.order.is.filter((k) => k !== "eps" && k !== "dps"), ...f.order.bs, ...f.order.cf];
    ck("the unit is written once, in the table's header (bn JPY), and nowhere else: not on the sections, not on any figure; every amount is in that unit, to its one decimal", f.unit === "bn JPY" && f.perShare === "per share: JPY" && f.bands.every((x) => x[1] === "") && Object.values(f.rows).every((r) => r.cells.every((c) => !/[a-zA-Z%]/.test(c))) && money.every((k) => f.rows[k].cells.every((c) => c === "–" || /^\u2212?[\d,]+\.\d$/.test(c))), { unit: f.unit, perShare: f.perShare, bands: f.bands });
    const perShare = (c) => (Math.abs(num(c)) >= 1000 ? /^−?[\d,]+\.\d$/ : /^−?[\d,]+\.\d\d$/).test(c), sharesTxt = key.rows["Shares outstanding"], sharesN = num(sharesTxt.replace(/[a-z]+$/, "")) * (sharesTxt.endsWith("bn") ? 1e9 : 1e6);
    ck("per-share lines are in the currency itself (two decimals, one from 1,000 up) and never scaled to the unit: EPS times the shares gives back net income; ratios are bare numbers under the heading that says per cent", f.rows.eps.cells.every(perShare) && f.rows.dps.cells.every(perShare) && Math.abs((num(f.rows.eps.cells[9]) * sharesN) / 1e9 / num(f.rows.ni.cells[9]) - 1) < 0.02 &&f.order.ratios.every((k) => f.rows[k].cells.every((c) => c === "–" || /^[+\u2212]?\d+\.\d$/.test(c))), [f.rows.eps.cells, f.rows.payout.cells]);
    ck("guidance fills only what the company guides (revenue, operating and ordinary profit, net income, EPS, DPS); the rest of its column is a dash", ["revenue", "op", "ordinary", "ni", "eps", "dps"].every((k) => f.rows[k].cells[10] !== "–") && ["cogs", "gross", "sga", "nonOpInc", "extraLoss", "pretax", "cash", "assets", "equity", "ocf", "capex", "netCash", "fcf"].every((k) => f.rows[k].cells[10] === "–" && f.rows[k].cls[10].includes("na")), f.periods);
    const col = (k) => f.rows[k].cells.map(num), ok = (a, b, tol) => a == null || b == null ? a === b : Math.abs(a - b) <= tol;
    const rev = col("revenue"), cogs = col("cogs"), gross = col("gross"), sga = col("sga"), op = col("op");
    ck("the columns line up: in every year gross profit = revenue - cost of sales and operating profit = gross profit - SG&A (to the rounding)", rev.slice(0, 10).every((_, i) => ok(gross[i], rev[i] - cogs[i], 0.11) && ok(op[i], gross[i] - sga[i], 0.11)), { rev, cogs, gross });
    ck("the ratios are the lines above them: gross, operating and net margin, sales growth on the year before, payout = DPS over EPS", rev.slice(0, 10).every((_, i) => ok(col("gpm")[i], gross[i] / rev[i] * 100, 0.06) && ok(col("opm")[i], op[i] / rev[i] * 100, 0.06) && ok(col("npm")[i], col("ni")[i] / rev[i] * 100, 0.06) && ok(col("payout")[i], col("dps")[i] / col("eps")[i] * 100, 0.06) && (i === 0 ? col("salesYoy")[0] === null : ok(col("salesYoy")[i], (rev[i] / rev[i - 1] - 1) * 100, 0.06))), { yoy: col("salesYoy"), gpm: col("gpm") });
    ck("the two sums made on the page: net cash = cash - short-term - long-term debt; free cash flow = operating cash flow - capex", rev.slice(0, 10).every((_, i) => ok(col("netCash")[i], col("cash")[i] - col("stDebt")[i] - col("ltDebt")[i], 0.16) && ok(col("fcf")[i], col("ocf")[i] - col("capex")[i], 0.11)), { net: col("netCash"), fcf: col("fcf") });
    ck("growth is green or red by its sign, a negative amount is red, a cash outflow from investing is not", f.rows.salesYoy.cells.every((c, i) => c === "–" || f.rows.salesYoy.cls[i].includes(num(c) > 0 ? "up" : num(c) < 0 ? "dn" : "num")) && f.rows.netCash.cls.slice(0, 10).every((c) => c.includes("neg")) && f.rows.icf.cls.slice(0, 10).every((c) => !c.includes("neg")) && f.rows.icf.cells.slice(0, 10).every((c) => c.startsWith("−")));
    ck("the main lines are set in bold: revenue, gross, operating and ordinary profit, net income, total assets, equity, operating cash flow", Object.entries(f.rows).filter(([, r]) => r.strong).map(([k]) => k).sort().join() === "assets,equity,gross,ni,ocf,op,ordinary,revenue");
    const guide = await p.locator(".finguide").textContent();
    ck("above the table: the guidance, when it was disclosed, and how far the year has come against it", /Company guidance · FY3\/27 · disclosed 2026-11-05 · after 6 months of the year: revenue 48\.7%, operating profit 52\.1%, ordinary profit 51\.4%, net income 55\.0% of the full-year figure/.test(guide), guide);
    await p.screenshot({ path: "stock-desktop-annual.png", fullPage: true });
    // by quarter
    await p.locator("#st-view .chip-sm").nth(1).click(); await p.waitForTimeout(350); f = await fin(p);
    const qg = await p.locator(".finguide").textContent();
    ck("QUARTERLY: the last twelve quarters, each a single quarter (said so), named by quarter and fiscal year, with no guidance column", f.periods.length === 12 && f.periods[11] === "2Q 3/27" && f.periods[0] === "3Q 3/24" && f.periods.every((x) => /^[1-4]Q 3\/\d\d$/.test(x)) && f.fc.every((x) => !x) && /Single quarters \(three months each\), not year to date/.test(qg), { periods: f.periods, qg });
    const qy = f.rows.salesYoy.cells.map(num), qr = f.rows.revenue.cells.map(num);
    ck("a quarter's sales growth is against the same quarter a year earlier; the first four quarters have none", qy.slice(0, 4).every((x) => x === null) && qy.slice(4).every((x, i) => Math.abs(x - (qr[i + 4] / qr[i] - 1) * 100) <= 0.06) && !f.order.ratios.includes("roe"), { qy, qr });
    ck("lines the quarterly source does not carry are dashes (cost of sales in the latest four quarters; the balance sheet)", f.rows.cogs.cells.slice(8).every((c) => c === "–") && f.rows.cogs.cells.slice(0, 8).every((c) => c !== "–") && f.rows.assets.cells.every((c) => c === "–") && f.unit === "bn JPY", f.rows.cogs.cells);
    await p.locator("#st-view .chip-sm").nth(0).click(); await p.waitForTimeout(250);
    ck("back to ANNUAL", (await fin(p)).periods.length === 11);
    const page = await p.evaluate(() => ({ ox: document.documentElement.scrollWidth - innerWidth, csv: document.querySelectorAll(".csvbtn").length }));
    ck("nothing wider than the window; no errors on the page", page.ox <= 0 && errs.length === 0, { page, errs }); await ctx.close(); }

  console.log("\n[desktop, a name with the sparse set (as from Yahoo): four years, five quarters]");
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#asset/AAPL", { waitUntil: "networkidle" }); await p.waitForSelector("table.fin"); await p.waitForTimeout(700); await hideBar(p);
    const f = await fin(p);
    ck("four fiscal years, no guidance column, the unit in the stock's own currency", f.periods.join() === "FY12/22,FY12/23,FY12/24,FY12/25" && f.fc.every((x) => !x) && /^(bn|m) USD$/.test(f.unit) && f.perShare === "per share: USD" && (await p.locator(".finguide").count()) === 0, f.periods);
    ck("a company outside Japan gets the lines of its own kind of statements, in their order: R&D, interest and other income down to pretax income, income tax; nothing of Japanese accounting (no ordinary profit, no extraordinary items)", f.order.is.join() === "revenue,cogs,gross,rd,sga,op,interestNet,otherNonOp,pretax,tax,ni,eps,dps,unusual" && ["nonOpInc", "nonOpExp", "ordinary", "extraInc", "extraLoss"].every((k) => !(k in f.rows)) && f.order.is.every((k) => f.rows[k].cells.every((c) => c !== "–")), f.order.is);
    ck("and they are worded as such a company words them", f.order.is.map((k) => f.rows[k].label).join("|") === "Revenue|Cost of revenue|Gross profit|R&D|SG&A|Operating income|Net interest income (expense)|Other income (expense)|Pretax income|Income tax|Net income|EPS (diluted)|DPS|Unusual items (memo)" && f.order.bs.map((k) => f.rows[k].label).join("|") === "Cash and equivalents|Cash and short-term investments|Short-term debt|Long-term debt|Net cash|Total assets|Total liabilities|Shareholders' equity" && f.order.cf.map((k) => f.rows[k].label).join("|") === "Operating cash flow|Investing cash flow|Financing cash flow|Capex|Free cash flow|Share buybacks|Dividends paid|Stock-based compensation", [f.order.bs, f.order.cf]);
    { const col = (k) => f.rows[k].cells.map(num), near = (a, b, tol) => Math.abs(a - b) <= tol;
      const op = col("op"), ints = col("interestNet"), oth = col("otherNonOp"), pre = col("pretax"), tax = col("tax"), ni = col("ni"), sti = col("cashSti"), st = col("stDebt"), lt = col("ltDebt"), nc = col("netCash");
      ck("the income statement adds up as shown: operating income, net interest and other income make pretax income; less tax, net income", op.every((v, i) => near(v + ints[i] + oth[i], pre[i], 0.21) && near(pre[i] - tax[i], ni[i], 0.11)), { op, ints, oth, pre, tax, ni });
      ck("net cash counts short-term investments with the cash where the company reports that total; pretax income is set in bold where there is no ordinary profit", nc.every((v, i) => near(v, sti[i] - st[i] - lt[i], 0.21)) && f.rows.pretax.strong && f.rows.op.strong && !f.rows.tax.strong, { nc, sti, st, lt }); }
    await p.locator("#st-view .chip-sm").nth(1).click(); await p.waitForTimeout(350);
    { const q = await fin(p);
      ck("a line the company does not report in a view is left out there, not shown as a row of dashes (no DPS, unusual items or stock-based compensation by quarter here); the lines every company has stay", q.periods.length === 5 && ["dps", "unusual", "sbc"].every((k) => !(k in q.rows)) && ["revenue", "pretax", "ni", "eps", "cash", "assets", "equity", "ocf", "icf", "fincf"].every((k) => k in q.rows) && q.order.is.join() === "revenue,cogs,gross,rd,sga,op,interestNet,otherNonOp,pretax,tax,ni,eps" && q.order.cf.join() === "ocf,icf,fincf,capex,fcf,buyback,divPaid", q.order); }
    await p.locator("#st-view .chip-sm").nth(0).click(); await p.waitForTimeout(350);
    const perf = await p.evaluate(() => [...document.querySelectorAll("#st-perf tbody tr")].map((tr) => [...tr.cells].map((c) => c.textContent)));
    ck("one benchmark elsewhere (S&P 500): four rows; a horizon the history does not reach is a dash in every row (60M here)", perf.map((r) => r[0]).join("|") === "Price then|AAPL|S&P 500|Against S&P 500, pp" && perf.every((r) => r[7] === "–") && perf[1].slice(1, 7).every((c) => c !== "–"), perf);
    const sh = await p.evaluate(() => [...document.querySelectorAll("#st-short tr")].map((tr) => tr.cells[0].textContent)), aux = await p.locator('.panel[data-no="04"] .aux').textContent();
    ck("SHORT INTEREST (elsewhere): shares short with its date, per cent of float and of shares, days to cover, a month earlier, and FINRA's daily share named as not being short interest", sh.length === 6 && /^Shares short · \d{4}-/.test(sh[0]) && sh[1] === "Per cent of float" && sh[3] === "Days to cover" && /^FINRA short-volume share/.test(sh[5]) && /exchange-reported/.test(aux), { sh, aux });
    const note = await p.locator(".finnote").last().textContent();
    ck("the source's limits are said under the table; no errors on the page", /four years and five quarters/.test(note) && errs.length === 0, { note, errs });
    await p.screenshot({ path: "stock-desktop-sparse.png", fullPage: true }); await ctx.close(); }

  console.log("\n[desktop: an index's own page is its page on EQUITIES, wherever the link is]");
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const at = async (hash) => { await p.goto(MOCK + hash, { waitUntil: "networkidle" }); await p.waitForTimeout(900); return p.evaluate(() => ({ hash: location.hash, index: [...document.querySelectorAll(".pick select")].map((x) => x.value), fin: document.querySelectorAll("table.fin").length, key: document.querySelectorAll("#st-key").length })); };
    const nk = await at("#asset/%5EN225"), topix = await at("#asset/1306.T"), sox = await at("#asset/%5ESOX"), stock = await at("#asset/7203.T");
    ck("the Nikkei 225 and TOPIX (read from the 1306.T fund) open on EQUITIES with that index chosen", nk.hash === "#equities/nk225" && nk.index.includes("nk225") && nk.key === 0 && topix.hash === "#equities/topix" && topix.index.includes("topix"), { nk, topix });
    ck("an index EQUITIES has no page for, and a stock, keep the single-name page; no errors", sox.hash === "#asset/%5ESOX" && sox.key === 1 && stock.hash === "#asset/7203.T" && stock.fin === 1 && errs.length === 0, { sox, stock, errs });
    await ctx.close(); }

  console.log("\n[desktop, a company below 1tn yen: no big-move marks]");
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#asset/9999.T", { waitUntil: "networkidle" }); await p.waitForSelector("table.fin"); await p.waitForSelector(".bigwrap canvas"); await p.waitForTimeout(900); await hideBar(p);
    const panels = await p.evaluate(() => [...document.querySelectorAll("#grid .panel")].map((x) => `${x.dataset.no} ${x.querySelector(".phead .t").textContent}`)), ds = await discs(p, ".bigwrap");
    ck("no BIG MOVES panel and no circles on the chart; the other panels as usual, FINANCIALS numbered 05", panels.length === 5 && panels[4] === "05 FINANCIALS" && !panels.some((x) => /BIG MOVES/.test(x)) && ds.up.length === 0 && errs.length === 0, { panels, ds, errs }); await ctx.close(); }

  console.log("\n[phone layout]");
  { const ctx = await b.newContext({ ...devices["iPhone 13"] }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#asset/7203.T", { waitUntil: "networkidle" }); await p.waitForSelector("table.fin"); await p.waitForSelector(".mp-hero canvas"); await p.waitForTimeout(900); await hideBar(p);
    const top = await p.evaluate(() => ({ secs: [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent), hint: document.querySelector(".mp-hero .rdout").textContent, stats: [...document.querySelectorAll("#st-key .mp-grid .k")].map((e) => e.textContent), kv: [...document.querySelectorAll("#st-key table.kv tr")].map((tr) => tr.cells[0].childNodes[0].textContent) }));
    ck("the same page as cards: Key data, Performance, Big moves, Short interest, Financials; the chart with volume", top.secs.join("|") === "Key data|Performance|Big moves|Short interest|Financials" && /volume/.test(top.hint), top);
    ck("key data: six figures at a glance, then the list (shares, diluted shares, average volume and value, short interest, …)", top.stats.join() === "Day,Market cap,P/E, guidance,52-week low,52-week high,From the high" && ["Shares outstanding", "Diluted shares", "Average daily volume, 60 sessions", "Average daily value traded, 60 sessions", "Short interest (reported)", "Next earnings"].every((k) => top.kv.includes(k)), top);
    { const hh = await p.evaluate(() => ({ tile: Math.round(document.querySelector(".mp-hero .mtile.cp").getBoundingClientRect().height), chart: Math.round(document.querySelector(".mp-hero .chartbox").getBoundingClientRect().height), vh: innerHeight }));
      ck(`the chart has room on a phone: ${hh.chart}px of a ${hh.tile}px tile on a ${hh.vh}px screen (the tile was 350px)`, hh.tile >= 410 && hh.tile <= 540 && hh.chart >= 290, hh); }
    // big moves on a phone: tap a circle for the reason, tap elsewhere to put it away; the list with links below
    const pd = await discs(p, ".mp-hero");
    const pcard = () => p.evaluate(() => { const e = document.querySelector(".mp-hero .mvtip"); if (!e || getComputedStyle(e).display === "none") return null; const r = e.getBoundingClientRect(); return { text: e.innerText, left: r.left, right: r.right, vw: innerWidth, px: parseFloat(getComputedStyle(e.querySelector(".w")).fontSize) }; });
    const tgt = pd.up[pd.up.length - 1];
    await p.touchscreen.tap(tgt.x + 6, tgt.y - 7); await p.waitForTimeout(250); let pc = await pcard();
    ck(`a tap on a circle (here 9px off its centre) opens its card: the move and the reason, inside the screen, ${pc ? pc.px : "?"}px type`, pd.up.length === 2 && pd.dn.length === 3 && pc && /\+6\.4% on the day\nMock: second-quarter/.test(pc.text) && pc.left >= 0 && pc.right <= pc.vw && pc.px >= 13, { pd, pc });
    await p.waitForTimeout(600); ck("the card stays until the next tap", (await pcard()) !== null);
    // The live page renders once a second (its refresh countdown), which the mock does not. Any render of the page
    // must leave an open card alone (Shota, 19 Nov 2026: on the phone the card was gone again at once).
    { const before = (await pcard())?.text ?? null, canvas0 = await p.evaluate(() => { const c = document.querySelector(".mp-hero canvas"); c.__same = true; return !!c; });
      const pickOf = (value) => p.evaluateHandle((v) => [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === v)), value);
      const viewSel = await pickOf("quarterly"); await viewSel.asElement().selectOption("quarterly"); await p.waitForTimeout(500); await viewSel.asElement().selectOption("annual"); await p.waitForTimeout(500);
      const kept = await pcard(), sameChart = await p.evaluate(() => document.querySelector(".mp-hero canvas")?.__same === true);
      ck("the page rendering again (as it does every second on the live site) neither rebuilds the chart nor closes the open card", canvas0 && before !== null && kept !== null && kept.text === before && sameChart, { before, kept, sameChart });
      const sig = await pickOf("m36"); await sig.asElement().selectOption("m36"); await p.waitForTimeout(900);
      const after = await pcard(), rebuilt = await p.evaluate(() => document.querySelector(".mp-hero canvas")?.__same !== true);
      ck("when the chart really is rebuilt (here: another σ window; on the live site, fresh prices), the card that was open opens again on the new chart", rebuilt && after !== null && after.text === before, { after, rebuilt });
      await sig.asElement().selectOption("m12"); await p.waitForTimeout(900);
      ck("and it is still there after the next rebuild", (await pcard())?.text === before); }
    const ov = await p.locator(".mp-hero .u-over").boundingBox();
    await p.touchscreen.tap(ov.x + 20, ov.y + 12); await p.waitForTimeout(250);
    ck("a tap elsewhere on the chart puts it away", (await pcard()) === null);
    const pl = await p.evaluate(() => ({ items: [...document.querySelectorAll("#st-moves .mp-moves li")].map((li) => ({ status: li.dataset.status, head: li.querySelector(".h b").textContent, d: li.querySelector(".h .d").textContent, dH: li.querySelector(".h .d").getBoundingClientRect().height, why: li.querySelector(".w").textContent, links: [...li.querySelectorAll(".s a")].map((a) => ({ t: a.textContent, h: Math.round(a.getBoundingClientRect().height), target: a.target })) })), hint: [...document.querySelectorAll(".mp > p.mp-note")].map((e) => e.textContent).find((t) => /Circles/.test(t)) ?? "", ox: document.documentElement.scrollWidth - innerWidth }));
    ck("under Big moves the same six, each with its reason or its state, the date on one line, and the sources as links", pl.items.length === 6 && pl.items.map((x) => x.status).join() === "found,found,not_found,found,queued,old" && pl.items.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.dH < 24) && pl.items[0].links.map((l) => l.t).join() === "example.com,example.org" && pl.items[0].links.every((l) => l.h >= 24 && l.target === "_blank") && /Tap one for the reason/.test(pl.hint) && pl.ox <= 0, pl);
    const pb = await p.evaluate(async () => { const b = document.querySelector("#st-movebox"); b.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 150)); const y0 = window.scrollY; b.scrollTop = 200; await new Promise((r) => setTimeout(r, 150));
      return { h: Math.round(b.getBoundingClientRect().height), sh: b.scrollHeight, top: b.scrollTop, moved: window.scrollY - y0, vh: innerHeight, note: [...document.querySelectorAll("#st-moves .mp-note")].map((e) => e.textContent).join(" ") }; });
    ck(`the list is a short box that scrolls on its own (${pb.h}px of a ${pb.vh}px screen, ${pb.sh}px of moves inside), and says so`, pb.h < pb.sh && pb.h <= pb.vh * 0.5 && pb.top >= 150 && pb.moved === 0 && /6 moves in three years, newest first: scroll inside the box for earlier ones/.test(pb.note), pb);
    const jump = await p.evaluate(() => [...document.querySelectorAll('.mp-picks select[aria-label="Go to"] option')].map((o) => o.value));
    await p.locator('.mp-picks select[aria-label="Go to"]').selectOption("Financials"); await p.waitForTimeout(500);
    const jt = await p.evaluate(() => { const h2 = [...document.querySelectorAll(".mp .mp-sec > h2")].find((e) => e.querySelector("span").textContent === "Financials"), head = document.querySelector(".mp-head").getBoundingClientRect(); return { top: Math.round(h2.getBoundingClientRect().top), headBottom: Math.round(head.bottom), vh: innerHeight }; });
    ck(`GO TO lists the page's sections (${jump.filter(Boolean).join(", ")}) and Financials brings the statements to the top of the screen`, ["Key data", "Performance", "Big moves", "Short interest", "Financials"].every((n) => jump.includes(n)) && jt.top >= jt.headBottom - 2 && jt.top < jt.vh * 0.4, { jump, jt });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    const perf = await p.evaluate(() => { const t = document.querySelector("#st-perf"), r = t.getBoundingClientRect(), t2 = document.querySelector("#st-bench"), tab = (x) => ({ head: [...x.querySelectorAll("thead th")].map((c) => c.textContent), rows: [...x.querySelectorAll("tbody tr")].map((tr) => [...tr.cells].map((c) => c.textContent)) }); return { ...tab(t), idx: tab(t2), left: r.left, right: r.right, vw: innerWidth, px: parseFloat(getComputedStyle(t.querySelector("td")).fontSize) }; });
    ck(`performance turned on its side so it fits the width: a row per horizon; the price then, the stock, and its difference against each index (${Math.round(perf.left)}–${Math.round(perf.right)}px of ${perf.vw}px, ${perf.px}px type)`, perf.head.join("|") === "|Price then|7203.T|vs Nikkei 225|vs TOPIX" && perf.rows.map((r) => r[0]).join() === "1D,1M,3M,6M,12M,36M,60M" && perf.rows.every((r) => r.length === 5) && perf.left >= 0 && perf.right <= perf.vw && perf.px >= 13, perf);
    ck("under it the two indices' own changes, and each difference is the stock's change less the index's", perf.idx.head.join("|") === "|Nikkei 225|TOPIX" && perf.idx.rows.length === 7 && perf.rows.every((r, i) => [0, 1].every((k) => Math.abs(num(r[2]) - num(perf.idx.rows[i][k + 1]) - num(r[3 + k])) <= 0.11)), perf.idx);
    let f = await fin(p);
    const geo = await p.evaluate(() => { const box = document.querySelector(".finbox"), first = document.querySelector('table.fin tr[data-line="revenue"] td.l'), last = document.querySelector('table.fin tr[data-line="revenue"] td:last-child'); const b = box.getBoundingClientRect(), a = first.getBoundingClientRect(), z = last.getBoundingClientRect(); return { boxL: b.left, boxR: b.right, nameL: a.left, nameW: a.width, lastR: z.right, vw: innerWidth, px: parseFloat(getComputedStyle(last).fontSize), namePx: parseFloat(getComputedStyle(first).fontSize), ox: document.documentElement.scrollWidth - innerWidth }; });
    ck(`the statements scroll sideways inside their card and open at the latest periods (table ${f.box.sw}px in ${f.box.w}px, guidance column ending at ${Math.round(geo.lastR)}px of ${geo.vw}px)`, f.box.sw > f.box.w && Math.abs(f.box.left + f.box.w - f.box.sw) <= 2 && geo.lastR <= geo.vw + 1 && geo.ox <= 0 && f.periods.length === 11, { box: f.box, geo });
    ck(`the line names stay put at the left while the periods slide under them (${geo.namePx}px names, ${geo.px}px figures)`, Math.abs(geo.nameL - geo.boxL) <= 1 && geo.nameW >= 120 && geo.px >= 13 && geo.namePx >= 13, geo);
    await p.evaluate(() => { document.querySelector(".finbox").scrollLeft = 0; }); await p.waitForTimeout(200);
    const g0 = await p.evaluate(() => { const box = document.querySelector(".finbox").getBoundingClientRect(), first = document.querySelector('table.fin tr[data-line="revenue"] td.l').getBoundingClientRect(), th = document.querySelector("table.fin thead th:nth-child(2)").getBoundingClientRect(); return { nameL: first.left - box.left, firstPeriodL: th.left - box.left, nameR: first.right - box.left }; });
    ck("scrolled to the start: the names are still at the left edge and the first year sits beside them", Math.abs(g0.nameL) <= 1 && g0.firstPeriodL >= g0.nameR - 1, g0);
    await p.evaluate(() => document.querySelector("#st-view").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
    const pick = await p.evaluate(() => { const e = document.querySelector("#st-view"); const host = e.closest(".pick") || e; const r = host.getBoundingClientRect(); return { h: Math.round(r.height), tag: e.tagName }; });
    await p.locator("#st-view").selectOption("quarterly"); await p.waitForTimeout(400); f = await fin(p);
    ck(`Periods switches to the twelve single quarters, again opening at the latest (its control ${pick.h}px tall)`, f.periods.length === 12 && f.periods[11] === "2Q 3/27" && Math.abs(f.box.left + f.box.w - f.box.sw) <= 2 && pick.h >= 36, { periods: f.periods, box: f.box, pick });
    const sh = await p.evaluate(() => [...document.querySelectorAll("#st-short tr")].map((tr) => tr.cells[1].textContent));
    ck("short interest lists the total, the shares and each holder; no errors on the page", sh[0] === "1.23%" && sh.length === 4 && errs.length === 0, { sh, errs });
    await p.evaluate(() => scrollTo(0, document.querySelector(".fin-card").getBoundingClientRect().top + scrollY - 70)); await p.waitForTimeout(250); await p.screenshot({ path: "stock-phone-fin.png" });
    await p.evaluate(() => scrollTo(0, document.querySelector("#st-key").getBoundingClientRect().top + scrollY - 70)); await p.waitForTimeout(250); await p.screenshot({ path: "stock-phone-key.png" });
    await p.evaluate(() => scrollTo(0, document.querySelector("#st-perf").getBoundingClientRect().top + scrollY - 110)); await p.waitForTimeout(250); await p.screenshot({ path: "stock-phone-perf.png" });
    await ctx.close(); }

  console.log("\n[a server that does not answer `stock` yet: the earlier page, on a desktop and on a phone]");
  { const legacy = { symbol: "7203.T", name: "Toyota Motor Corp (stand-in)", exchange: "Tokyo", currency: "JPY", quoteType: "EQUITY", sector: "Consumer Discretionary", industry: "Auto Manufacturers", price: 3000, prevClose: 2950, pct: 1.69, mcap: 4.2e13, volume: 2.4e7, adv3m: 2e7, adv10d: 2.2e7, asOf: new Date().toISOString(), home: { symbol: "^N225", name: "Nikkei 225" }, rel: [], indices: ["NK225"],
      statements: { source: "yahoo", currency: "JPY", unit: "1", annual: [{ period: "2026-03-31", label: "FY 2026-03", revenue: 4.5e13, op: 5e12, ni: 4e12, eps: 300 }], quarterly: [], forecast: null, note: "stand-in", asOf: "2026-11-18" }, short: null, series: null };
    for (const [name, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["phone", { ...devices["iPhone 13"] }]]) {
      const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = [], asked = []; p.on("pageerror", (e) => errs.push(e.message));
      await routes(p);
      await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); const send = (status, body) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
        if (a === "stock") { asked.push(a); return send(400, { error: "unknown action" }); } if (a === "asset") { asked.push(a); return send(200, legacy); } return r.fallback(); });
      await p.goto(STANDIN + "#asset/7203.T", { waitUntil: "networkidle" }); await p.waitForSelector(name === "phone" ? ".mp-doc.asset h1" : '.panel[data-no="03"]'); await p.waitForTimeout(700);
      const v = await p.evaluate((phone) => phone ? { secs: [...document.querySelectorAll(".mp-sec > h2 > span:first-child")].map((e) => e.textContent), h1: document.querySelector(".mp-doc.asset h1").textContent, fin: !!document.querySelector("table.fin") } : { secs: [...document.querySelectorAll("#grid .panel .phead .t")].map((e) => e.textContent), h1: "", fin: !!document.querySelector("table.fin") }, name === "phone");
      ck(`${name}: the page asks for the new answer, is told the server does not know it, and shows the earlier page from the earlier answer (nothing breaks before the server is deployed)`, asked.includes("stock") && asked.includes("asset") && !v.fin && (name === "phone" ? v.secs.join() === "Quote,Short data,Statements" && /stand-in/.test(v.h1) : v.secs.join("|") === "TOYOTA MOTOR CORP (STAND-IN)|QUOTE|STATEMENTS") && errs.length === 0, { asked, v, errs }); await ctx.close(); } }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
