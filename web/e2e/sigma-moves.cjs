// Moves in σ and alerts on them (I-6, 20 Nov 2026; B-06 (a), B-03 (1)) with B-27 (a future names its contract, and its
// roll day is kept out of moves, volatility, σ and the σ alerts), on the local copy's stand-in rows:
//   - MARKETS on a computer: MOVERS IN σ (ten cells, largest |σ| first, each a link, the alert line marked) and the
//     1D IN σ column right after 1D, sorted by |σ| within each class bar and back; the official yield's day "measured on
//     its close (published a day late)"; gold's stand-in roll day: its 1D within the new contract, marked ROLL, no jump in σ;
//   - the one-screen layout (the strip is the first row, names and σ on one line) and text size XL (two rows of five);
//   - MARKETS on a phone: Movers in σ first, a row of 144 x 76 cards that moves sideways, the third cut at the edge, the
//     as-of in its head, the morning note and the install line under it; an opened row's 1D in σ;
//   - the header's alert list: the stand-in 2.7σ USD/JPY move with its σ, its window and its source; WATCHLIST's alerts on
//     my names, both layouts: a σ move with its kind, window and source under its line and its σ as its figure (a yield's
//     too), and one under 2.5σ not listed (the server's rule; the reviewer's F3, 20 Nov 2026);
//   - the strip's head names its as-of (S1); a future's tooltip says its changes of contract are left out from when the
//     Monitor records them (S4); in the one-screen layout a roll day's mark is an R after its 1D in σ, so the name cell
//     keeps its DELAYED badge whole (S3); gold's contract says Yahoo Finance (unofficial) on screen on a computer (S2);
//   - gold's page, both layouts: its contract, its last roll, the line saying what the series is and that the rolls are
//     left out, the roll marked on its chart; its realised vol and largest fall those of the series with the step taken out;
//   - a server from before 20 Nov 2026 (rows without σ, contract or roll): MARKETS says so in the strip's place, the
//     column holds dashes, the phone has no σ section and keeps its as-of in the screen's head.
// Since 21 Nov 2026 the strip has two readings and names the day of a move that is not today's (B-32): e2e/morning.cjs
// checks those at a set clock; here the stand-in rows keep their fixed states, and the strip is read under TODAY.
// Run from web/:  node e2e/run.cjs sigma-moves   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { S } = require("./standin.cjs");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const AUTO = { size: "AUTO", compact: false, v: 2 }, XL = { size: "XL", compact: false, v: 2 }, CMP = { size: "AUTO", compact: true, v: 2 };
async function page(b, opts, prefs) {
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript((pr) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify(pr)); localStorage.removeItem("om_a2hs_hide"); } catch {} }, prefs || null);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, hash, sel) => { await p.goto(MOCK + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(500); };
// the stand-in table as the page receives it (lib/mock.ts), and what the page's rules make of it
const table = (p) => p.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction("table").rows; });
const fmtS = (z) => { if (z == null) return "–"; const s = Math.abs(z).toFixed(1); return /[1-9]/.test(s) ? `${z > 0 ? "+" : "-"}${s}σ` : `${s}σ`; };
const tableView = (p) => p.evaluate(() => {
  const heads = [...document.querySelectorAll("table.mkt thead th")].map((t) => t.innerText.trim());
  const zi = heads.findIndex((h) => h.startsWith("1D IN σ")), di = heads.indexOf("1D");
  const rows = []; let cls = null;
  for (const tr of document.querySelectorAll("table.mkt tbody tr")) { if (tr.classList.contains("cls")) { cls = tr.textContent.trim(); continue; } rows.push({ cls, name: tr.children[0].querySelector("a").textContent, z: tr.children[zi].textContent, ztip: tr.children[zi].title, d1: tr.children[di].textContent, d1tip: tr.children[di].title, badges: [...tr.children[0].querySelectorAll(".badge")].map((x) => x.textContent), rollTip: tr.children[0].querySelector(".badge.roll")?.title ?? null }); }
  const th = document.querySelector("#mk-zsort");
  return { heads, zi, di, rows, sortTxt: th?.textContent ?? null, sortCase: th ? getComputedStyle(th.querySelector(".sig")).textTransform : null, ox: document.documentElement.scrollWidth - innerWidth };
});
const stripView = (p) => p.evaluate(() => {
  const pn = document.querySelector('.panel[data-k="sigma"]'); if (!pn) return null;
  const r = pn.getBoundingClientRect();
  return { no: pn.dataset.no, title: pn.querySelector(".phead .t").textContent, aux: pn.querySelector(".phead .aux").textContent, top: Math.round(r.top), h: Math.round(r.height),
    cells: [...pn.querySelectorAll(".sgcell")].map((c) => { const b = c.getBoundingClientRect(); return { nm: c.querySelector(".nm").textContent, z: c.querySelector(".z").textContent, mv: c.querySelector(".mv").innerText.replace(/\s+/g, " ").trim(), href: c.getAttribute("href"), hot: c.classList.contains("hot"), quiet: c.classList.contains("quiet"), border: getComputedStyle(c).borderTopColor, zCls: c.querySelector(".z").className, top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), whole: [...c.querySelectorAll(".z,.mv")].every((x) => x.scrollWidth <= x.clientWidth + 1 || getComputedStyle(x).display === "none"), mvShown: getComputedStyle(c.querySelector(".mv")).display !== "none" }; }),
    note: pn.querySelector("#mk-sigma-note")?.textContent ?? null };
});
const AMBER = "rgb(255, 111, 97)", D = "\\d{1,2} [A-Z][a-z]{2} \\d{4}";

(async () => { const b = await chromium.launch();
  console.log("\n[MARKETS, computer 1440x900: MOVERS IN σ and the 1D IN σ column]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, AUTO);
    await go(p, "#market", "table.mkt tbody tr:not(.cls)");
    const rows = (await table(p)).filter((r) => r.marketTab !== false), s = await stripView(p), t = await tableView(p);
    const want = rows.filter((r) => r.z1d != null).sort((a, b2) => Math.abs(b2.z1d) - Math.abs(a.z1d) || a.order - b2.order).slice(0, 10);
    ck(`panel 01 is "${s?.title}" (the σ lower case), above MARKETS: "${s?.aux}", its as-of named as on the phone (S1)`, !!s && s.no === "01" && s.title === "MOVERS IN σ" && /^the day's change ÷ σ of its daily changes, 63 sessions · as of \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT/.test(s.aux) && (await p.locator('.panel[data-k="mkt"]').getAttribute("data-no")) === "02", s);
    ck(`ten cells in one row, the largest |σ| first (${s?.cells.map((c) => `${c.nm} ${c.z}`).join(", ")})`, s.cells.length === 10 && new Set(s.cells.map((c) => c.top)).size === 1 && s.cells.every((c, i) => c.z === fmtS(want[i].z1d)) && s.cells.every((c) => /^[+-]?\d+\.\dσ$/.test(c.z)), { got: s.cells.map((c) => c.z), want: want.map((r) => fmtS(r.z1d)) });
    ck("each cell: a name, its σ in its sign's colour, the day's change and the level under it, whole; a link to the instrument's page", s.cells.every((c, i) => /^#(asset|equities)\//.test(c.href) && c.whole && /^[+-]?\d[\d,.]*(%|bp) · [\d,.]+%?$/.test(c.mv) && (want[i].z1d > 0.05 ? /\bup\b/.test(c.zCls) : want[i].z1d < -0.05 ? /\bdn\b/.test(c.zCls) : true)), s.cells);
    const usd = s.cells.find((c) => c.nm === "USD/JPY");
    ck(`USD/JPY's 2.7σ day leads, at the alert line: an amber border ("${usd?.z}", ${usd?.border}); under 1.5σ a cell is muted (${s.cells.filter((c) => c.quiet).length} of 10)`, s.cells[0].nm === "USD/JPY" && usd.z === "+2.7σ" && usd.hot && usd.border === AMBER && s.cells.filter((c) => !c.hot).every((c) => c.border !== AMBER) && s.cells.every((c) => c.quiet === (Math.abs(parseFloat(c.z)) < 1.5)), s.cells.map((c) => [c.nm, c.z, c.hot, c.quiet]));
    // one line since 21 Nov 2026 (the designer's D-69): what a future's changes of contract do is on each future's tooltip, its page and in Help
    ck(`the line under it, one line: "${s.note}"`, new RegExp(`^† worked out here from the Monitor's daily closes, mostly \\d{1,2} [A-Z][a-z]{2}( \\d{4})? – ${D} · each cell's own window on its tooltip$`).test(s.note ?? "") && (await p.evaluate(() => { const n = document.querySelector("#mk-sigma-note"); return n.getBoundingClientRect().height <= parseFloat(getComputedStyle(n).lineHeight) * 1.6; })), s.note);
    ck(`1D IN σ right after 1D, the σ kept lower case under the upper-cased header (${t.heads.slice(1, 5).join(" · ")})`, t.heads[2] === "1D" && t.heads[3] === "1D IN σ" && t.sortCase === "none" && t.heads.length === 12, t.heads);
    // the table's rows in its own order: by `order`, grouped by class in the order the classes first come
    const ordered = [...rows].sort((a, b2) => a.order - b2.order), clsOrder = [...new Set(ordered.map((r) => r.cls))], inTable = clsOrder.flatMap((c) => ordered.filter((r) => r.cls === c));
    const bad = t.rows.filter((x, i) => x.z !== fmtS(inTable[i]?.z1d));
    ck(`every row's 1D IN σ is the table's own figure (${t.rows.length} rows; "${t.rows[0].z}" for ${t.rows[0].name})`, t.rows.length === rows.length && bad.length === 0, bad.slice(0, 3));
    const usdRow = t.rows.find((x) => x.name === "USD/JPY");
    ck(`its tooltip says what it is worked out from ("${usdRow.ztip.slice(0, 90)}…")`, new RegExp(`^The day's change over the σ of the 63 daily changes before it \\([\\d.]+% a day\\), worked out † from the daily closes of ${D} – ${D} \\(Yahoo Finance\\) · last session \\(${D}\\): [+-]\\d\\.\\dσ, between the closes of ${D} and ${D}$`).test(usdRow.ztip), usdRow.ztip);
    const jgb = t.rows.find((x) => /^JGB/.test(x.name));
    ck(`an official-curve yield's day is measured on its booked close ("…${jgb?.ztip.split(" · ")[1]}")`, !!jgb && new RegExp(`\\(Japan MOF\\) · measured on ${D}'s close \\(published a day late\\) · last session `).test(jgb.ztip) && /^[+-]?\d+\.\dσ$/.test(jgb.z), jgb);
    // D-67: the US Treasury publishes its curve on the day itself; only the others are a day late (Help, "Curves")
    const ust = t.rows.find((x) => x.name === "UST 2Y");
    ck(`a US Treasury yield's tooltip does not say "a day late" ("…${ust?.ztip.split(" · ")[1]}")`, !!ust && new RegExp(`\\(US Treasury\\) · measured on ${D}'s close, its newest published day · last session `).test(ust.ztip) && !/a day late/.test(ust.ztip), ust);
    // B-27: gold's stand-in roll day
    const gold = t.rows.find((x) => x.name === "Gold"), gr = rows.find((r) => r.symbol === "GC=F");
    const naive = (gr.last / (gr.closes.d1 / (1 + gr.roll.step / 100)) - 1) * 100, within = gr.pct.d1, naiveZ = naive / gr.sd1d;
    ck(`gold's stand-in roll (${gr.roll.from} to ${gr.roll.to}, +${gr.roll.step.toFixed(2)}%): its name carries ROLL, its 1D is the change within the new contract (${gold.d1}), its σ ${gold.z}; across the change of contract it would read ${naive.toFixed(2)}% and ${naiveZ.toFixed(1)}σ`, gold.badges.includes("ROLL") && /left out of the 1D, its σ and the alerts/.test(gold.rollTip) && gold.d1 === `${within >= 0 ? "+" : "-"}${Math.abs(within).toFixed(2)}%` && Math.abs(naiveZ) >= 2.5 && Math.abs(gr.z1d) < 1.5 && gold.z === fmtS(gr.z1d) && /new contract|own close/.test(gold.d1tip), { gold, naive, naiveZ });
    ck(`a future's 1D in σ says its changes of contract are left out from when the Monitor records them (S4): "…${gold.ztip.split(" · ").find((x) => /records them/.test(x)) ?? ""}"`, /its changes of contract are left out from when the Monitor records them; any before stay in \(its page says from when\)/.test(gold.ztip) && !/records them/.test(usdRow.ztip), { gold: gold.ztip, usd: usdRow.ztip });
    const mark = await p.evaluate(() => { const tr = [...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].find((t) => t.children[0].querySelector("a")?.textContent === "Gold"), z = tr?.querySelector("td.z"); return z ? { after: getComputedStyle(z, "::after").content, cls: z.className } : null; });
    ck(`the scrolling layout marks the roll beside the name only: no R after its 1D in σ (${mark?.after})`, !!mark && /\brolled\b/.test(mark.cls) && (mark.after === "none" || mark.after === "normal"), mark);
    const sg = s.cells.find((c) => c.nm === "Gold");
    ck(`its jump is not among the movers in σ (${sg ? `gold there at its own ${sg.z}` : "gold not there"}), and no stand-in alert names gold`, (!sg || (sg.z === fmtS(gr.z1d) && !sg.hot)) && !S.alerts.some((a) => a.symbol === "GC=F") && !S.watch.feed.alerts.some((a) => a.symbol === "GC=F" && a.kind === "sigma"), sg);
    // sorting by |σ| within each class bar, and back
    await p.locator("#mk-zsort").click(); await p.waitForTimeout(250);
    const t2 = await tableView(p);
    const bars = (x) => [...new Set(x.rows.map((r) => r.cls))].join("|"), members = (x, c) => x.rows.filter((r) => r.cls === c).map((r) => r.name).sort().join();
    const sortedOk = [...new Set(t2.rows.map((r) => r.cls))].every((c) => { const zs = t2.rows.filter((r) => r.cls === c).map((r) => (r.z === "–" ? -1 : Math.abs(parseFloat(r.z)))); return zs.every((z, i) => i === 0 || z <= zs[i - 1] + 1e-9); });
    ck(`a click on 1D IN σ sorts by its size within each bar ("${t2.sortTxt}"): the bars and their members unchanged (${bars(t2)})`, t2.sortTxt === "1D in σ ▼" && sortedOk && bars(t2) === bars(t) && [...new Set(t.rows.map((r) => r.cls))].every((c) => members(t, c) === members(t2, c)), { sortTxt: t2.sortTxt, first: t2.rows.slice(0, 4) });
    await p.locator("#mk-zsort").click(); await p.waitForTimeout(250);
    const t3 = await tableView(p);
    ck("a second click puts the table's own order back", t3.rows.map((r) => r.name).join() === t.rows.map((r) => r.name).join() && t3.sortTxt === "1D in σ", t3.sortTxt);
    ck("nothing runs off the page sideways; no page errors", t.ox <= 0 && errs.length === 0, { ox: t.ox, errs });
    await p.locator(".sgcell").first().click(); await p.waitForTimeout(500);
    ck(`a cell opens its page (${await p.evaluate(() => location.hash)})`, (await p.evaluate(() => location.hash)) === "#asset/USDJPY%3DX");
    await ctx.close(); }

  console.log("\n[MARKETS, the one-screen layout 1440x900 and text size XL]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, CMP);
    await go(p, "#market", ".sgcell");
    const s = await stripView(p);
    const g = await p.evaluate(() => { const pos = (k) => { const e = document.querySelector(`.panel[data-k="${k}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; }; return { sel: (() => { const r = document.querySelector("#grid > .c12:not(.panel)").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; })(), strip: pos("sigma"), mkt: pos("mkt"), eq: pos("mk-eq"), vh: innerHeight, sy: document.documentElement.scrollHeight - innerHeight }; });
    // S3: a roll day's mark leaves the narrow name cell for an R after its 1D in σ, so the badge beside the name (DELAYED
    // while gold's market is open) stays whole; whether it is open does not matter to the check
    const gc = await p.evaluate(() => { const tr = [...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].find((t) => t.children[0].querySelector("a")?.textContent === "Gold"); if (!tr) return null;
      const name = tr.children[0], z = tr.querySelector("td.z"), roll = name.querySelector(".badge.roll");
      return { badges: [...name.querySelectorAll(".badge")].filter((x) => getComputedStyle(x).display !== "none").map((x) => x.textContent), rollShown: !!roll && getComputedStyle(roll).display !== "none", nameWhole: name.scrollWidth <= name.clientWidth + 1, mark: getComputedStyle(z, "::after").content, zText: z.innerText, zWhole: z.scrollWidth <= z.clientWidth + 1, zTip: z.title }; });
    ck(`compact: gold's roll day is an R after its 1D in σ ("${gc?.zText}" ${gc?.mark}), whole, with the change of contract on its tooltip; its name cell keeps ${JSON.stringify(gc?.badges)}, whole (S3)`, !!gc && !gc.rollShown && gc.mark === '"R"' && gc.zWhole && gc.nameWhole && !gc.badges.includes("ROLL") && /^[+-]?\d+\.\dσ$/.test(gc.zText) && /a change of contract today/.test(gc.zTip), gc);
    // two lines a cell since 21 Nov 2026 (B-32: the name and the σ, then the day and the change; e2e/morning.cjs holds the panel to 54 CSS px)
    ck(`compact: the strip is the first row under the picks (${g.strip.top}–${g.strip.bottom} px, ${s.h} px tall), the ten names and σ on one line each with the change under them, the table and the charts under it`, g.strip.top >= g.sel.bottom - 1 && s.h <= 64 && s.cells.length === 10 && s.cells.every((c) => c.mvShown && c.h <= 32 && /^(\d{1,2} [A-Z][a-z]{2} · )?[+-]?\d[\d,.]*(%|bp)$/.test(c.mv)) && g.mkt.top >= g.strip.bottom - 1 && g.eq.top >= g.strip.bottom - 1 && g.mkt.left < g.eq.left, { g, h: s.h, cells: s.cells.map((c) => [c.h, c.mv]) });
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, XL);
    await go(p, "#market", ".sgcell");
    const s = await stripView(p), rowsOf = [...new Set(s.cells.map((c) => c.top))];
    ck(`text size XL: two rows of five (${rowsOf.length} rows), every figure whole`, rowsOf.length === 2 && s.cells.filter((c) => c.top === rowsOf[0]).length === 5 && s.cells.every((c) => c.whole), s.cells.map((c) => [c.nm, c.top, c.whole]));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  for (const dev of ["iPhone SE (3rd gen)", "iPhone 13"]) {
    console.log(`\n[MARKETS on a phone, ${dev}]`);
    const { ctx, p, errs } = await page(b, devices[dev]);
    await go(p, "#market", ".mp-sgcard");
    const m = await p.evaluate(() => { const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right), w: Math.round(x.width), h: Math.round(x.height) }; };
      const sec = document.querySelector(".mp > .mp-sec"), row = document.querySelector(".mp-sgrow"), cards = [...document.querySelectorAll(".mp-sgcard")];
      const navTop = document.querySelector("#pnav").getBoundingClientRect().top;
      return { first: sec?.id ?? null, h2: sec?.querySelector("h2 > span").textContent, sgNote: document.querySelector("#mk-sigma-note")?.textContent ?? null, sgNoteIn: !!sec?.querySelector("#mk-sigma-note"), sgNoteUnder: (() => { const n = document.querySelector("#mk-sigma-note"), items = [...document.querySelectorAll(".mp-item")]; return !!n && items.length > 0 && n.getBoundingClientRect().top >= items[items.length - 1].getBoundingClientRect().bottom - 0.5; })(), sigCase: sec ? getComputedStyle(sec.querySelector("h2 .sig")).textTransform : null, aux: sec?.querySelector("h2 .aux")?.textContent ?? null, screenSub: document.querySelector(".mp-head .mp-asof")?.textContent ?? "",
        cards: cards.map((c) => ({ ...r(c), nm: c.querySelector(".nm").textContent, z: c.querySelector(".z").textContent, mv: c.querySelector(".mv").textContent, cut: [...c.querySelectorAll(".z,.mv")].some((x) => x.scrollWidth > x.clientWidth + 1), href: c.getAttribute("href"), snap: getComputedStyle(c).scrollSnapAlign })),
        row: { ...r(row), scrollW: row.scrollWidth, clientW: row.clientWidth, snap: getComputedStyle(row).scrollSnapType, bar: getComputedStyle(row).scrollbarWidth },
        strip: r(sec), note: r(document.querySelector("#mk-note")), hint: r(document.querySelector("#mk-install")), rows: [...document.querySelectorAll(".mp-row")].filter((e) => e.getBoundingClientRect().bottom <= navTop).length, vw: innerWidth, ox: document.documentElement.scrollWidth - innerWidth }; });
    ck(`the first section is "${m.h2}" (σ lower case), with the screen's as-of in its head ("${m.aux}")`, m.first === "mk-sigma" && m.h2 === "Movers in σ" && m.sigCase === "none" && /^as of \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT$/.test(m.aux ?? "") && !/as of/.test(m.screenSub), m);
    ck(`ten cards of ${m.cards[0]?.w} x ${m.cards[0]?.h} px in one row that moves sideways and stops on a card, no scrollbar; the third is cut at the screen's edge (${m.cards[2]?.left}–${m.cards[2]?.right} of ${m.vw})`, m.cards.length === 10 && m.cards.every((c) => c.w === 144 && c.h === 76 && c.snap === "start" && !c.cut && /^#(asset|equities)\//.test(c.href)) && new Set(m.cards.map((c) => c.top)).size === 1 && m.row.scrollW > m.row.clientW && /x mandatory/.test(m.row.snap) && m.row.bar === "none" && m.cards[2].left < m.vw && m.cards[2].right > m.vw, { cards: m.cards.slice(0, 3), row: m.row });
    // under the lists since 21 Nov 2026 (the designer's verdict on D-14: above them it kept every list row off the first screen)
    ck(`what the cards measure is a note under the lists, not between the cards and them: "${m.sgNote}"`, new RegExp(`^Movers in σ: the day's change ÷ σ of its daily changes, 63 sessions\. Last session: each instrument's newest completed day, between its last two booked closes\. † Worked out by the Monitor from the daily closes, mostly ${D} – ${D}\.$`).test(m.sgNote ?? "") && !m.sgNoteIn && m.sgNoteUnder, { note: m.sgNote, in: m.sgNoteIn, under: m.sgNoteUnder });
    ck(`each card: the name, "${m.cards[0].z}" and the day's change ("${m.cards[0].mv}")`, m.cards[0].nm === "USD/JPY" && m.cards[0].z === "+2.7σ" && m.cards.every((c) => /^[+-]?\d+\.\dσ$/.test(c.z) && /^[+-]?\d[\d,.]*(%|bp)$/.test(c.mv)), m.cards.slice(0, 3));
    // since 21 Nov 2026 the note and the install line are two 44-px rows of one block, and the list follows on the first screen (e2e/phone-first.cjs)
    ck(`no card or hint above the data: the strip comes first (${m.strip.top} px), the morning note (${m.note?.top}) and the install line (${m.hint?.top}) under it, one row each; ${m.rows} list rows on the first screen`, !!m.note && !!m.hint && m.note.top >= m.strip.bottom && m.hint.top >= m.note.bottom - 1 && m.note.h === 44 && m.hint.h === 45 && m.strip.top < 300 && m.rows >= 3, m);
    ck("nothing runs off the page sideways", m.ox <= 0, m.ox);
    await p.locator(".mp-row").nth(1).tap(); await p.waitForSelector(".mp-det"); await p.waitForTimeout(500);
    const det = await p.evaluate(() => [...document.querySelectorAll(".mp-det .mp-grid")].map((g) => ({ two: g.classList.contains("two"), cells: [...g.children].map((c) => c.querySelector(".k").textContent) })));
    ck(`an opened row: the six periods, then 1D in σ beside σ vs 1M avg, the 52W range and vs 200D (${det[1]?.cells.join(" · ")})`, det.length === 2 && det[0].cells.length === 6 && det[1].two && det[1].cells.join() === "1D in σ,σ vs 1M avg,52W range,vs 200D", det);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[the header's alert list: the stand-in 2.7σ USD/JPY move]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, AUTO);
    await go(p, "#market", "#alerts .alrt");
    await p.locator("#alerts .alrt").click(); await p.waitForSelector(".aldrop tbody tr");
    const row = await p.evaluate(() => { const tr = document.querySelector('.aldrop tbody tr[data-kind="sigma"]'); return tr ? { msg: tr.children[1].querySelector(".lnk")?.textContent ?? null, note: tr.querySelector(".alnote")?.textContent ?? null, kind: tr.children[2].textContent, fig: tr.children[3].textContent, cls: tr.children[3].className } : null; });
    const sa = S.alerts.find((a) => a.kind === "sigma");
    ck(`on the list: "${row?.msg}", its kind "${row?.kind}", its σ "${row?.fig}" in its sign's colour, and its window and source under it ("${row?.note}")`, !!row && row.msg === sa.msg && row.kind === "σ move" && row.fig === "+2.7σ" && /\bup\b/.test(row.cls) && row.note === sa.note && /Yahoo Finance/.test(row.note) && /63 daily changes/.test(row.note), row);
    await p.locator('.aldrop tbody tr[data-kind="sigma"] .lnk').first().click(); await p.waitForTimeout(500);
    ck("a tap on it opens USD/JPY's page", (await p.evaluate(() => location.hash)) === "#asset/USDJPY%3DX");
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[WATCHLIST's alerts on my names: a σ move with its kind, window, source and σ; from 2.5σ (the reviewer's F3)]");
  for (const [name, opts] of [["computer 1440x900", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", devices["iPhone 13"]]]) {
    const desk = name.startsWith("computer"), { ctx, p, errs } = await page(b, opts, desk ? AUTO : null);
    await go(p, "#watch", desk ? '.panel[data-k="wl-alerts"] tbody tr' : ".nw-row[data-kind]");
    const feed = await p.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction("watch_feed").alerts; });
    const rows = await p.evaluate((dk) => (dk
      ? [...document.querySelectorAll('.panel[data-k="wl-alerts"] tbody tr')].map((tr) => ({ kind: tr.dataset.kind, msg: tr.children[1].querySelector(".lnk, a")?.textContent ?? null, note: tr.querySelector(".alnote")?.innerText ?? null, fig: tr.children[2].textContent, cls: tr.children[2].className }))
      : [...document.querySelectorAll(".mp-sec .nw-row[data-kind]")].map((r) => ({ kind: r.dataset.kind, msg: r.querySelector(".nw-title")?.textContent ?? null, note: r.querySelector(".nw-note")?.innerText ?? null, fig: r.querySelector(".nw-meta b")?.textContent ?? null, cls: r.querySelector(".nw-meta b")?.className ?? "" }))), desk);
    const sgs = S.alerts.filter((a) => a.kind === "sigma"), usd = sgs.find((a) => a.symbol === "USDJPY=X" && Math.abs(a.sigma) >= 2.5), tnx = sgs.find((a) => a.symbol === "^TNX"), low = sgs.find((a) => Math.abs(a.sigma) < 2.5);
    const ru = rows.find((r) => r.msg === usd.msg), rt = rows.find((r) => r.msg === tnx.msg);
    ck(`${name}: USD/JPY's σ move "${ru?.msg}" says "${ru?.note}" under it, and its figure is its σ "${ru?.fig}"`, !!ru && ru.kind === "sigma" && ru.note === `σ move · ${usd.note}` && /Yahoo Finance/.test(ru.note) && /63 daily changes/.test(ru.note) && ru.fig === "+2.7σ" && /\bup\b/.test(ru.cls), ru);
    ck(`${name}: a yield's σ move, which has no per cent ("${rt?.msg}"), shows its σ "${rt?.fig}" and the same line under it`, !!rt && rt.kind === "sigma" && rt.fig === "-2.6σ" && /\bdn\b/.test(rt.cls) && rt.note === `σ move · ${tnx.note}`, rt);
    ck(`${name}: a σ move under 2.5σ ("${low.msg}") is not listed, as the server lists them: the feed holds ${feed.length}, newest first, none under the line; other alerts carry no σ line`, !rows.some((r) => r.msg === low.msg) && feed.length === 40 && !feed.some((a) => a.kind === "sigma" && Math.abs(a.sigma) < 2.5) && feed.every((a, i) => i === 0 || Date.parse(a.at) <= Date.parse(feed[i - 1].at)) && feed.some((a) => a.msg === usd.msg) && feed.some((a) => a.msg === tnx.msg) && rows.filter((r) => r.kind !== "sigma").every((r) => r.note === null), { n: feed.length, low: low.msg });
    ck(`${name}: no page errors`, errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[gold's page: its contract, its roll, the rolls left out]");
  for (const [name, opts] of [["computer 1440x900", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", devices["iPhone 13"]]]) {
    const { ctx, p, errs } = await page(b, opts, name.startsWith("computer") ? AUTO : null);
    await go(p, "#asset/GC%3DF", "#in-key");
    const d = await p.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); const a = mockAction("stock", { symbol: "GC=F" }), s = mockAction("series", { symbol: "GC=F", range: "10Y" });
      const ctr = document.querySelector("#in-contract")?.closest("tr");
      return { contract: document.querySelector("#in-contract")?.textContent ?? null, contractSrc: ctr ? `${ctr.title} ${ctr.querySelector("small")?.textContent ?? ""}` : null, contractShown: ctr ? ctr.innerText : null, roll: document.querySelector("#in-roll")?.textContent ?? null, rollRow: (document.querySelector("#in-roll")?.closest("tr")?.innerText ?? "").replace(/\s+/g, " ").trim(), rolls: document.querySelector("#in-rolls")?.textContent ?? null, volTxt: [...document.querySelectorAll("#in-key tr")].find((tr) => /Realised vol/.test(tr.cells[0].textContent))?.cells[1].innerText ?? null, fallTxt: [...document.querySelectorAll("#in-key tr")].find((tr) => /Largest fall/.test(tr.cells[0].textContent))?.cells[1].innerText ?? null,
        fut: a.instrument.futures, vol: a.instrument.vol, fall: a.instrument.fall, pts: s.points.map((x) => ({ t: x.t, v: x.v })).slice(-1300) }; });
    // the same series with the step taken out by hand: every close before the roll day on the new contract's level
    const rollT = Date.parse(d.fut.lastRoll.d + "T00:00:00Z") / 1000, clean = d.pts.map((x) => ({ t: x.t, v: x.t < rollT ? x.v * 1.03 : x.v }));
    const lr = (xs) => xs.slice(1).map((x, i) => Math.log(x.v / xs[i].v)), sdv = (xs) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
    const ann = (xs, n) => sdv(lr(xs).slice(-n)) * Math.sqrt(252) * 100;
    const v3 = ann(clean, 63), v3step = ann(d.pts, 63);
    ck(`${name}: the contract's source is labelled unofficial on screen, under it, as the owner asked for Yahoo's named contracts (S2: "${(d.contractShown ?? "").replace(/\s+/g, " ").trim().slice(0, 110)}")`, /Yahoo Finance \(unofficial\)/.test(d.contractSrc ?? "") && /Yahoo Finance \(unofficial\) · read \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT/.test(d.contractShown ?? ""), d.contractShown);
    ck(`${name}: the contract the last price is from ("${d.contract}") and the last change of contract ("${d.roll}")`, new RegExp(`^Feb 2027 \\(GCG27\\) · expires ${D}$`).test(d.contract ?? "") && d.fut.expires > new Date().toISOString().slice(0, 10) && new RegExp(`^${D} · Dec 2026 \u2192 Feb 2027$`).test(d.roll ?? "") && /step \+3\.00%, left out/.test(d.rollRow) && !/change of contract.*change of contract/.test(d.rollRow), d);   // on two lines since 21 Nov 2026 (the designer's D-64)
    ck(`${name}: the line says what the series is and that its rolls are left out ("${(d.rolls ?? "").slice(0, 120)}…")`, /^A front-month series \(Yahoo's =F\): on a roll day it moves to the next contract, and that step is not a move\. Rolls left out of realised vol and its percentile, σ vs 1M avg, the largest rise and fall and the 1D in σ: 1 since /.test(d.rolls ?? "") && /Changes of contract before .* are not known to the Monitor/.test(d.rolls ?? ""), d.rolls);
    ck(`${name}: its realised vol over 3M (${d.vol.m3.ann.toFixed(3)}% ann.) is that of the series with the step taken out (${v3.toFixed(3)}%), not the stepped series' (${v3step.toFixed(3)}%); KEY DATA writes it ("${d.volTxt?.split("\n")[0]}")`, Math.abs(d.vol.m3.ann - v3) < 1e-6 && Math.abs(v3step - v3) > 0.2 && (d.volTxt ?? "").includes(d.vol.m3.ann.toFixed(1)), { page: d.vol.m3.ann, v3, v3step });
    ck(`${name}: its largest fall (${d.fall?.chg.toFixed(2)}%, ${d.fall?.from} to ${d.fall?.to}) is measured on the same series`, !!d.fall && !!d.fallTxt && d.fallTxt.includes(`${Math.abs(d.fall.chg).toFixed(1)}%`), { fall: d.fall, txt: d.fallTxt });
    // the roll on the chart: its mark, and what it says when pointed at or tapped
    await p.evaluate(() => document.querySelector(".bigwrap, .mp-hero")?.scrollIntoView({ block: "center" })); await p.waitForTimeout(300);
    const box = await p.locator(".bigwrap .u-over, .mp-hero .u-over").first().boundingBox();
    const at = await p.evaluate(() => { const o = document.querySelector(".bigwrap .u-over, .mp-hero .u-over"); const r = o.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    let card = null;
    for (let dx = 1; dx <= 14 && !card; dx++) for (let dy = 0; dy <= 1 && !card; dy++) {
      const x = box.x + box.width - dx, ys = []; for (let y = box.y + 4; y < box.y + box.height - 4; y += 6) ys.push(y);
      for (const y of ys) { if (name === "iPhone 13") await p.touchscreen.tap(x, y); else await p.mouse.move(x, y); await p.waitForTimeout(40); card = await p.evaluate(() => { const c = [...document.querySelectorAll(".mvtip")].find((e) => e.style.display !== "none"); return c ? { title: c.querySelector(".t").textContent, dot: c.querySelector(".t .dot").className, text: [...c.querySelectorAll(".l")].map((l) => l.textContent).join(" "), why: [...c.querySelectorAll(".w")].map((l) => l.textContent).join(" ") } : null; }); if (card) break; }
    }
    ck(`${name}: the roll is marked on the chart: "${card?.title}", "${card?.text}"`, !!card && /change of contract$/.test(card.title) && /\broll\b/.test(card.dot) && card.text === "roll from Dec to Feb: +3.00% is a change of contract" && /not a move/.test(card.why), { card, at });
    ck(`${name}: no page errors`, errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a future without a roll in the record: its contract and since when the record runs]");
  { const { ctx, p, errs } = await page(b, { viewport: { width: 1440, height: 900 } }, AUTO);
    await go(p, "#asset/NKD%3DF", "#in-key");
    const n = await p.evaluate(() => ({ contract: document.querySelector("#in-contract")?.textContent, roll: document.querySelector("#in-roll")?.textContent, rolls: document.querySelector("#in-rolls")?.textContent }));
    ck(`NKD=F: "${n.contract}", last change of contract "${n.roll}"`, new RegExp(`^Dec 2026 \\(NKDZ26\\) · expires ${D}$`).test(n.contract ?? "") && new RegExp(`^none recorded since ${D}$`).test(n.roll ?? "") && /: 0 since /.test(n.rolls ?? ""), n);
    await go(p, "#asset/USDJPY%3DX", "#in-key");
    ck("a currency's page has no contract lines", (await p.locator("#in-contract, #in-roll, #in-rolls").count()) === 0 && errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a server from before 20 Nov 2026: the same rows without σ, contract or roll]");
  { // the local copy's table answer, without the fields I-6 added to a row; the page is the stand-in server's (5181)
    const { ctx: c0, p: p0 } = await page(b, { viewport: { width: 1440, height: 900 } }, AUTO);
    await go(p0, "#market", "table.mkt tbody tr:not(.cls)");
    const ans = await p0.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction("table"); });
    await c0.close();
    const old = { ...ans, rows: ans.rows.map(({ z1d, sd1d, zFrom, zTo, zN, contract, roll, ls, ...r }) => r) }, shown = old.rows.filter((r) => r.marketTab !== false).length;
    for (const [name, opts] of [["computer 1440x900", { viewport: { width: 1440, height: 900 } }], ["iPhone 13", devices["iPhone 13"]]]) {
      const desk = name.startsWith("computer"), { ctx, p, errs } = await page(b, opts, desk ? AUTO : null);
      await routes(p);
      await p.route("**/fakeapi?*", (r) => (new URL(r.request().url()).searchParams.get("action") === "table" ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(old) }) : r.fallback()));
      await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(desk ? "table.mkt tbody tr:not(.cls)" : ".mp-row"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
      if (desk) {
        const o = await p.evaluate(() => { const pn = document.querySelector('.panel[data-k="sigma"]'), heads = [...document.querySelectorAll("table.mkt thead th")].map((t) => t.innerText.trim()), zi = heads.findIndex((h) => h.startsWith("1D IN σ"));
          return { title: pn?.querySelector(".phead .t").textContent ?? null, cells: pn ? pn.querySelectorAll(".sgcell").length : -1, empty: pn?.querySelector(".empty")?.innerText.replace(/\s+/g, " ").trim() ?? null, rows: [...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].map((tr) => tr.children[zi].textContent), tips: [...new Set([...document.querySelectorAll("table.mkt tbody tr:not(.cls)")].map((tr) => tr.children[zi].title))], roll: document.querySelectorAll("table.mkt .badge.roll").length }; });
        ck(`${name}: MOVERS IN σ says why it is empty ("${o.empty}"); the table's ${o.rows.length} rows are there, each 1D IN σ a dash saying "${o.tips[0]}", no ROLL`, o.title === "MOVERS IN σ" && o.cells === 0 && /^No moves in σ yet ?The server sends each instrument's σ of daily changes with the table once its update is deployed\.$/.test(o.empty ?? "") && o.rows.length === shown && o.rows.every((z) => z === "–") && o.tips.length === 1 && o.tips[0] === "No σ yet: the server sends it with the table once its update is deployed" && o.roll === 0, o);
      } else {
        const o = await p.evaluate(() => ({ sigma: !!document.querySelector("#mk-sigma"), cards: document.querySelectorAll(".mp-sgcard").length, sub: document.querySelector(".mp-head .mp-asof")?.textContent ?? "", rows: document.querySelectorAll(".mp-row").length }));
        await p.locator(".mp-row").nth(1).tap(); await p.waitForSelector(".mp-det"); await p.waitForTimeout(400);
        const det = await p.evaluate(() => { const g = document.querySelector(".mp-det .mp-grid.two"); return g ? [...g.children].map((c) => [c.querySelector(".k").textContent, c.querySelector(".v")?.textContent ?? c.lastElementChild?.textContent ?? null]) : null; });
        ck(`${name}: no σ section; the screen's as-of in its head ("${o.sub}"); an opened row's 1D in σ a dash (${JSON.stringify(det?.[0])})`, !o.sigma && o.cards === 0 && /as of/.test(o.sub) && o.rows > 10 && !!det && det[0][0] === "1D in σ" && det[0][1] === "–", { o, det });
      }
      ck(`${name}: no page errors`, errs.length === 0, errs); await ctx.close();
    }
  }

  // After the verdicts of round 3a (21 Nov 2026).
  console.log("\n[D-63, B-34: the alert list behind the header's line shows every alert whole, on a phone and on a computer]");
  { // the list as a reader sees it: the box inside the window, nothing sideways, every row's parts inside the box
    const list = (p) => p.evaluate(() => { const d = document.querySelector(".aldrop"), br = d.getBoundingClientRect(), W = document.documentElement.clientWidth;
      const rows = [...d.querySelectorAll("[data-kind]")].map((x) => { const cells = [...x.querySelectorAll(".al-t,.al-msg,.al-kind,.al-fig,.al-note,.alnote")].filter((c) => c.getBoundingClientRect().width > 0); const rg = document.createRange(); rg.selectNodeContents(x);
        const boxes = [...cells.map((c) => c.getBoundingClientRect()), ...[...rg.getClientRects()].filter((q) => q.width > 0)];
        return { kind: x.dataset.kind, h: x.getBoundingClientRect().height, inside: boxes.every((q) => q.left >= br.left - 0.5 && q.right <= br.right + 0.5), cut: cells.some((c) => c.scrollWidth > c.clientWidth + 1), t: x.querySelector(".al-t")?.textContent ?? "", msg: x.querySelector(".al-msg")?.textContent ?? "", fig: x.querySelector(".al-fig")?.textContent ?? "", figCls: x.querySelector(".al-fig")?.className ?? "", kd: x.querySelector(".al-kind")?.textContent ?? null, note: x.querySelector(".al-note,.alnote")?.textContent ?? null }; });
      return { head: d.querySelector(".minih").innerText.replace(/\s+/g, " ").trim(), rules: d.querySelector(".alrules")?.textContent ?? null, inWin: br.left >= 0 && br.right <= W + 0.5, sx: d.scrollWidth - d.clientWidth, rows, ox: document.documentElement.scrollWidth - innerWidth }; });
    const sa = (await (async () => { const { ctx, p } = await page(b, { viewport: { width: 1440, height: 900 } }, AUTO); await go(p, "#market", "#alerts .alrt"); const a = await p.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction("alerts", { n: 20 }).rows; }); await ctx.close(); return a; })());
    const sig = sa.find((a) => a.kind === "sigma");
    for (const [name, dev] of [["P1, iPhone SE", "iPhone SE (3rd gen)"], ["P2, iPhone 13", "iPhone 13"]]) {
      const { ctx, p, errs } = await page(b, devices[dev]);
      await go(p, "#market", "#alerts .alrt");
      await p.locator("#alerts .alrt").tap(); await p.waitForSelector(".aldrop [data-kind]"); await p.waitForTimeout(250);
      const l = await list(p), row = l.rows.find((r) => r.kind === "sigma");
      ck(`${name}: the list is no wider inside than its box (${l.sx} px over) and stands inside the screen; none of its ${l.rows.length} rows has a part outside the box or cut`, l.sx <= 1 && l.inWin && l.ox <= 0 && l.rows.length === sa.length && l.rows.every((r) => r.inside && !r.cut), { sx: l.sx, bad: l.rows.filter((r) => !r.inside || r.cut) });
      ck(`${name}: the stand-in σ move whole: "${row?.msg}", "${row?.fig}" in its sign's colour, and under it "${row?.note}"`, !!row && row.msg === sig.msg && row.fig === "+2.7σ" && /\bup\b/.test(row.figCls) && row.note === `σ move · ${sig.note}` && /Yahoo Finance/.test(row.note), row);
      ck(`${name}: no row under 44 px (the shortest ${Math.round(Math.min(...l.rows.map((r) => r.h)))} px); the head is "${l.head}" and the rules are a note under the list`, l.rows.every((r) => r.h >= 44) && /^LAST \d+ ALERTS · TIMES IN SGT Notifications…$/.test(l.head) && /σ moves from 2\.5σ/.test(l.rules ?? "") && !/Σ/.test(l.head + l.rules) && l.rows.every((r) => !/SGT/.test(r.t)), { head: l.head, t: l.rows.map((r) => r.t) });
      await p.locator('.aldrop [data-kind="sigma"]').first().tap(); await p.waitForTimeout(500);
      ck(`${name}: a tap on it opens USD/JPY's page and closes the list`, (await p.evaluate(() => location.hash)) === "#asset/USDJPY%3DX" && (await p.locator(".aldrop").count()) === 0);
      await p.goBack(); await p.waitForSelector("#alerts .alrt"); await p.locator("#alerts .alrt").tap(); await p.waitForSelector(".aldrop [data-kind]");
      const news = await p.evaluate(() => { const r = document.querySelector('.aldrop a.nw-row[data-kind="buyback"]'); return r ? { href: r.getAttribute("href"), co: r.querySelector(".nw-tk button")?.textContent ?? null } : null; });
      ck(`${name}: a news alert is a link to its article and keeps a button to its company's page ("${news?.co}")`, !!news && /^https?:/.test(news.href ?? "") && !!news.co, news);
      ck(`${name}: no page errors`, errs.length === 0, errs); await ctx.close();
    }
    for (const [name, vp, prefs] of [["C1 1440x900", [1440, 900], AUTO], ["C2 1280x720", [1280, 720], AUTO], ["C3 1440x900 XL", [1440, 900], XL], ["C6 1920x1080", [1920, 1080], AUTO], ["1440x900 L", [1440, 900], { size: "L", compact: false, v: 2 }], ["C4 1440x900, one screen", [1440, 900], CMP]]) {
      const { ctx, p, errs } = await page(b, { viewport: { width: vp[0], height: vp[1] } }, prefs);
      await go(p, "#market", "#alerts .alrt");
      await p.locator("#alerts .alrt").click(); await p.waitForSelector(".aldrop [data-kind]"); await p.waitForTimeout(250);
      const l = await list(p), row = l.rows.find((r) => r.kind === "sigma");
      ck(`${name}: every row's kind and figure lie inside the box, the box inside the window, nothing sideways (${l.rows.length} rows; the σ move: "${row?.kd}", "${row?.fig}")`, l.sx <= 1 && l.inWin && l.ox <= 0 && l.rows.length === sa.length && l.rows.every((r) => r.inside && !r.cut && r.kd !== null) && row?.kd === "σ move" && row.fig === "+2.7σ" && row.note === sig.note, { sx: l.sx, inWin: l.inWin, bad: l.rows.filter((r) => !r.inside || r.cut) });
      if (name.startsWith("C1")) ck(`${name}: "times in SGT" once in the head, not on every row ("${l.rows[0]?.t}"): "${l.head.slice(0, 60)}…"`, /^LAST \d+ ALERTS · TIMES IN SGT · /.test(l.head) && /σ MOVES FROM 2\.5σ/.test(l.head) && l.rows.every((r) => !/SGT/.test(r.t)) && /^(\d{1,2} [A-Z][a-z]{2} )?\d\d:\d\d$/.test(l.rows[0].t), l.head);
      ck(`${name}: no page errors`, errs.length === 0, errs); await ctx.close();
    }
  }

  console.log("\n[D-64: a future with a recorded change of contract: KEY DATA whole at text L, no label over two lines]");
  for (const [name, vp, size] of [["1440x900 L", [1440, 900], "L"], ["1536x864 L", [1536, 864], "L"], ["1366x768 L", [1366, 768], "L"], ["1680x1050 XL", [1680, 1050], "XL"], ["C1 1440x900", [1440, 900], "AUTO"], ["C2 1280x720", [1280, 720], "AUTO"]]) {
    const { ctx, p, errs } = await page(b, { viewport: { width: vp[0], height: vp[1] } }, { size, compact: false, v: 2 });
    await go(p, "#asset/GC%3DF", "table#in-key");
    const k = await p.evaluate(() => { const key = document.querySelector(".panel[data-k='in-key'] .pbody").getBoundingClientRect();
      const rows = [...document.querySelectorAll("table#in-key tr")].map((tr) => { const l = tr.querySelector("td.l"), v = tr.querySelector("td.num"), rg = document.createRange(); rg.selectNodeContents(l);
        const lines = new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size, vr = v.getBoundingClientRect(), inner = [...v.querySelectorAll("*")].map((e) => e.getBoundingClientRect()).filter((q) => q.width > 0);
        return { k: l.textContent, lines, em: l.getBoundingClientRect().width / parseFloat(getComputedStyle(l).fontSize), stacked: getComputedStyle(tr).display === "flex", cut: vr.right > key.right + 0.5 || vr.left < key.left - 0.5 || inner.some((q) => q.right > key.right + 0.5 || q.left < key.left - 0.5) || v.scrollWidth > v.clientWidth + 1, v: v.innerText.replace(/\s+/g, " ").trim() }; });
      return { sideways: [...document.querySelectorAll(".panel .pbody")].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.closest(".panel").dataset.k), rows, ox: document.documentElement.scrollWidth - innerWidth }; });
    const roll = k.rows.find((r) => r.k === "Last change of contract");
    ck(`${name}: no panel body of gold's page scrolls sideways, every KEY DATA value is whole inside the panel, and no label takes more than two lines (${k.rows.filter((r) => r.lines === 2).length} take two); the label column at least 9.5em where it stands beside the values`, k.sideways.length === 0 && k.ox <= 0 && k.rows.length === 12 && k.rows.every((r) => !r.cut && r.lines <= 2 && (r.stacked || r.em >= 9.4)), { sideways: k.sideways, bad: k.rows.filter((r) => r.cut || r.lines > 2 || !(r.stacked || r.em >= 9.4)) });
    if (name.startsWith("1440x900 L")) ck(`${name}: the last change of contract on two lines: "${roll?.v}"`, new RegExp(`^${D} · Dec 2026 \u2192 Feb 2027 step \\+3\\.00%, left out$`).test(roll?.v ?? ""), roll);
    ck(`${name}: no page errors`, errs.length === 0, errs); await ctx.close();
  }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
