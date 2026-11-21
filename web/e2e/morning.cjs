// MARKETS at the morning hour (B's B-32, 21 Nov 2026; the designer's note (a) of round 3b). At 07:00 SGT a currency's day
// is an hour old (its day ended at 17:00 New York and is booked at 06:35 SGT), so MOVERS IN σ missed the session that
// had just ended, and nothing said which day a figure was of. On the local copy's stand-in rows, with the page's clock
// set (never the machine's hour; `om_mock_now`):
//   - Tue 24 Nov 2026, 07:10 SGT (Tokyo was shut on Monday the 23rd): the strip's two readings, TODAY and LAST SESSION,
//     chosen right after its title on a computer and by a toggle on a phone; under LAST SESSION every cell carries its
//     session's date, and USD/JPY's tooltip names its two closes with their levels; under TODAY USD/JPY's cell shows
//     today's σ with "last session -2.2σ" under it, and a day stands beside a figure exactly when its row's day is not
//     today's; the table's name cells carry the day of a row that is not today's, a live row none; the 1D IN σ tooltip
//     names the last session; a phone line's pill names the row's day in place of "1D"; an opened row says its last
//     session, as a phone has no tooltip;
//   - heights: the strip's panel no taller than without the choice and the days, and no table row lost to them; in the
//     one-screen layout a cell takes two lines, the panel at most 54 CSS px, all 18 rows on the screen;
//   - nothing cut at the designer's sizes, in the machine's fonts and with a wide font forced (GitHub's are wider);
//   - Tue 24 Nov 2026, 17:00 SGT: USD/JPY's cell and card show one reading, no "last session" line;
//   - a server from before 21 Nov 2026 (rows without the last session): no choice, no day, the strip as it was.
// Run from web/:  node e2e/run.cjs morning   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const MORNING = "2026-11-23T23:10:00Z";   // Tue 24 Nov 07:10 SGT, Mon 18:10 in New York: the FX day of the 23rd ended 70 minutes ago
const EVENING = "2026-11-24T09:00:00Z";   // Tue 24 Nov 17:00 SGT: the FX day is eleven hours old
const WIDE = "*{font-family:monospace!important}";
const SIZES = {   // the designer's sizes (plan review §3.7)
  C1: { vp: [1440, 900], prefs: { size: "AUTO", compact: false } }, C2: { vp: [1280, 720], prefs: { size: "AUTO", compact: false } }, C3: { vp: [1440, 900], prefs: { size: "XL", compact: false } },
  C4: { vp: [1440, 900], prefs: { size: "AUTO", compact: true } }, C4b: { vp: [1280, 720], prefs: { size: "AUTO", compact: true } }, CL: { vp: [1440, 900], prefs: { size: "L", compact: false } },
  P1: { dev: "iPhone SE (3rd gen)" }, P2: { dev: "iPhone 13" },
};
async function page(b, code, clock) {
  const z = SIZES[code], opts = z.dev ? { ...devices[z.dev] } : { viewport: { width: z.vp[0], height: z.vp[1] } };
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript(([pr, at]) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify({ ...pr, v: 2 })); if (at) localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, [z.prefs || null, clock || null]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs, phone: !!z.dev };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(400); };
// the stand-in table as the page receives it (lib/mock.ts) at the page's own clock
const table = (p) => p.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction("table").rows.filter((r) => r.marketTab !== false); });
const fmtS = (z) => { if (z == null) return "–"; const s = Math.abs(z).toFixed(1); return /[1-9]/.test(s) ? `${z > 0 ? "+" : "-"}${s}σ` : `${s}σ`; };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (ymd) => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`, dmy = (ymd) => `${dm(ymd)} ${ymd.slice(0, 4)}`;
// a row's day as the designer's rule has it: a print's date in Singapore, a booked or published figure's own date
const rowDay = (r) => (/T00:00:00(\.000)?Z$/.test(r.lastAt) ? r.lastAt.slice(0, 10) : new Date(Date.parse(r.lastAt) + 8 * 3600e3).toISOString().slice(0, 10));
// the computer's strip: its head, its cells and what is cut (CSS px: the page is zoomed on a computer)
const strip = (p) => p.evaluate(() => {
  const z = Number(document.body.style.zoom) || 1, pn = document.querySelector('.panel[data-k="sigma"]'), head = pn.querySelector(".phead"), R = (e) => e.getBoundingClientRect();
  const t = head.querySelector(".t"), pick = head.querySelector("#mk-sgpick"), btns = pick ? [...pick.querySelectorAll("button")] : [];
  const cut = (e) => !!e && getComputedStyle(e).display !== "none" && e.scrollWidth > e.clientWidth + 1;
  return { h: R(pn).height / z, aux: head.querySelector(".aux").textContent, title: t.textContent, mode: pn.querySelector(".sgstrip")?.dataset.mode ?? null,
    pick: pick ? { texts: btns.map((x) => x.textContent), on: btns.map((x) => x.classList.contains("on")), pressed: btns.map((x) => x.getAttribute("aria-pressed")), sameLine: Math.abs((R(pick).top + R(pick).bottom) / 2 - (R(t).top + R(t).bottom) / 2) <= 4 * z, after: R(pick).left >= R(t).right - 0.5, joined: btns.length === 2 && Math.abs(R(btns[1]).left - R(btns[0]).right) <= 0.5, onBg: getComputedStyle(btns.find((x) => x.classList.contains("on")) ?? btns[0]).backgroundColor, role: pick.getAttribute("role") } : null,
    cells: [...pn.querySelectorAll(".sgcell")].map((c) => { const zl = c.querySelector(".zl"), zz = c.querySelector(".z"), d = c.querySelector(".zl .day"), mv = c.querySelector(".mv"), ls = mv.querySelector(".ls"), shown = (e) => !!e && getComputedStyle(e).display !== "none" && R(e).width > 0;
      return { nm: c.querySelector(".nm").textContent, z: zz.textContent, day: shown(d) ? d.textContent : null, dayRight: shown(d) ? R(d).left >= R(zz).right - 0.5 && Math.abs(R(d).bottom - R(zz).bottom) < 8 * z : null, d2: shown(mv.querySelector(".d2")) ? mv.querySelector(".d2").textContent : null, cg: mv.querySelector(".cg")?.textContent ?? null, lv: shown(mv.querySelector(".lv")) ? mv.querySelector(".lv").textContent : null, ls: ls ? ls.textContent : null, lsTip: ls ? ls.title : null, tip: c.title, hot: c.classList.contains("hot"),
        h: R(c).height / z, mvLines: Math.round(R(mv).height / parseFloat(getComputedStyle(mv).lineHeight || "1") / z * 10) / 10, cut: cut(zl) || cut(zz) || cut(mv) || cut(c) || [...c.querySelectorAll(".day,.ls,.cg,.d2")].some((e) => getComputedStyle(e).display !== "none" && (R(e).right > R(c).right + 0.5 || R(e).left < R(c).left - 0.5)) }; }),
    note: pn.querySelector("#mk-sigma-note")?.textContent ?? null, ox: document.documentElement.scrollWidth - innerWidth };
});
// the table: each row's name cell (its day, its badges), whether it is live, its 1D IN σ tooltip; the rows whole on the first screen
const tableRows = (p) => p.evaluate(() => { const heads = [...document.querySelectorAll("table.mkt thead th")].map((t) => t.innerText.trim()), zi = heads.findIndex((h) => h.startsWith("1D IN σ"));
  const rows = [...document.querySelectorAll("table.mkt tbody tr.click")].map((tr) => { const td = tr.children[0], d = td.querySelector(".asday"), tr2 = td.getBoundingClientRect(); return { name: td.querySelector("a").textContent, live: tr.classList.contains("live"), day: d ? d.textContent : null, dayTip: d ? d.title : null, dayBox: d ? getComputedStyle(d).borderTopWidth : null, dayIn: d ? d.getBoundingClientRect().right <= tr2.right + 0.5 : true, cut: td.scrollWidth > td.clientWidth + 1, ztip: tr.children[zi].title, onScreen: tr.getBoundingClientRect().bottom <= innerHeight + 0.5 }; });
  return { rows, on: rows.filter((r) => r.onScreen).length }; });
// the strip without the choice and the days, as it was: how tall the panel is, and how many table rows are whole on the screen
const without = async (p) => { const st = await p.addStyleTag({ content: "#mk-sgpick,.sgcell .day,.asday{display:none!important}" }); await p.waitForTimeout(250);
  const v = await p.evaluate(() => { const z = Number(document.body.style.zoom) || 1; return { h: document.querySelector('.panel[data-k="sigma"]').getBoundingClientRect().height / z, on: [...document.querySelectorAll("table.mkt tbody tr.click")].filter((tr) => tr.getBoundingClientRect().bottom <= innerHeight + 0.5).length }; });
  await st.evaluate((e) => e.remove()); await p.waitForTimeout(250); return v; };

(async () => { const b = await chromium.launch();
  for (const code of ["C1", "C4", "C4b"]) {
    const one = code !== "C1";
    console.log(`\n[${code}, ${SIZES[code].vp.join("x")}${one ? ", the one-screen layout" : ""}: Tue 24 Nov 2026, 07:10 SGT]`);
    const { ctx, p, errs } = await page(b, code, MORNING);
    await go(p, MOCK, "#market", ".sgcell");
    const rows = await table(p), today = "2026-11-24", by = (sym) => rows.find((r) => r.symbol === sym), usd = by("USDJPY=X"), nk = by("^N225");
    ck(`the stand-in rows at this clock: USD/JPY's 1D runs from the close of ${usd.closeDates.d1}, its last session is ${usd.ls.from} to ${usd.ls.d} at ${fmtS(usd.ls.z)}; the Nikkei 225's last figure is of ${rowDay(nk)} (Tokyo shut on the 23rd)`, usd.closeDates.d1 === "2026-11-23" && usd.ls.d === "2026-11-23" && usd.ls.from === "2026-11-20" && fmtS(usd.ls.z) === "-2.2σ" && usd.live && rowDay(nk) === "2026-11-20" && !nk.live && rows.length === 18, { usd: usd.ls, nk: nk.lastAt });
    const s = await strip(p);
    ck(`the strip's head: "${s.title}", then ${s.pick?.texts.join(" · ")} after the title on its line, the two joined, TODAY lit; "${s.aux}"`, s.title === "MOVERS IN σ" && !!s.pick && s.pick.texts.join("|") === "TODAY|LAST SESSION" && s.pick.on.join() === "true,false" && s.pick.pressed.join() === "true,false" && s.pick.sameLine && s.pick.after && s.pick.joined && s.pick.onBg === "rgb(255, 111, 97)" && s.pick.role === "group" && /^the day's change ÷ σ of its daily changes, 63 sessions · as of 24 Nov 07:10 SGT/.test(s.aux) && !/official-curve/.test(s.aux), s.pick);
    // under TODAY
    const want = [...rows].filter((r) => r.z1d != null).sort((a, c) => Math.abs(c.z1d) - Math.abs(a.z1d) || a.order - c.order).slice(0, 10);
    const cu = s.cells.find((c) => c.nm === "USD/JPY");
    ck(`under TODAY the ten largest of the day (${s.cells.map((c) => `${c.nm} ${c.z}`).join(", ")})`, s.mode === "today" && s.cells.length === 10 && s.cells.every((c, i) => c.z === fmtS(want[i].z1d)), s.cells.map((c) => c.z));
    ck(`USD/JPY's cell shows today's σ (${cu?.z}) and "${cu?.ls}" under it, in place of the change and the level; that line's tooltip names the two closes`, !!cu && cu.z === "+2.7σ" && cu.ls === "last session -2.2σ" && cu.cg === null && cu.day === null && /The change between the closes of 20 Nov 2026 and 23 Nov 2026 \([\d.]+ to [\d.]+, -\d\.\d\d%\) over the σ of the 63 daily changes before it/.test(cu.lsTip ?? ""), cu);
    const badDay = s.cells.filter((c, i) => { const r = want[i], d = rowDay(r), wantDay = !r.live && d !== today ? dm(d) : null; return (one ? c.d2?.replace(" · ", "") ?? null : c.day) !== wantDay; });
    ck(`for every cell a day stands ${one ? "before the change" : "at the right of the σ"} exactly when its row's day is not 24 Nov (${s.cells.filter((c) => (one ? c.d2 : c.day)).map((c) => `${c.nm} ${one ? c.d2.replace(" · ", "") : c.day}`).join(", ")})`, badDay.length === 0 && s.cells.some((c) => (one ? c.d2 : c.day)) && s.cells.some((c) => !(one ? c.d2 : c.day)) && (one || s.cells.filter((c) => c.day).every((c) => c.dayRight)), badDay);
    ck(`a cell whose row is not from today says whose day the move is on its tooltip ("…${s.cells.find((c) => (one ? c.d2 : c.day))?.tip.split(" · ").pop()}")`, s.cells.every((c, i) => { const r = want[i], d = rowDay(r); return (!r.live && d !== today) === c.tip.endsWith(` · the move of ${dmy(d)}`); }), s.cells.map((c) => c.tip.slice(-40)));
    // the table
    const t = await tableRows(p), tn = t.rows.find((r) => r.name === "Nikkei 225"), tu = t.rows.find((r) => r.name === "USD/JPY");
    ck(`the table: the Nikkei 225's name cell carries "${tn?.day}" (no box; "${tn?.dayTip}"); no live row carries a day (${t.rows.filter((r) => r.live).length} live); a row has one exactly when its day is not today's (${t.rows.filter((r) => r.day).length} of ${t.rows.length})`, tn?.day === "20 Nov" && tn.dayTip === "The row's last figure is of 20 Nov 2026: its LAST, 1D and 1D in σ are that day's" && tn.dayBox === "0px" && t.rows.filter((r) => r.live).length >= 4 && t.rows.every((r) => !r.live || r.day === null) && t.rows.filter((r) => r.day).map((r) => r.day).sort().join() === rows.filter((r) => !r.live && rowDay(r) !== today).map((r) => dm(rowDay(r))).sort().join() && t.rows.some((r) => !r.live && r.day === null), t.rows.map((r) => [r.name, r.live, r.day]));
    ck("no name cell that carries a day is cut by it, and each day stands inside its cell", t.rows.filter((r) => r.day).every((r) => !r.cut && r.dayIn), t.rows.filter((r) => r.day && (r.cut || !r.dayIn)).map((r) => r.name));
    ck(`USD/JPY's 1D IN σ tooltip names the last session and its two closes ("…${tu?.ztip.split(" · ").pop()}")`, / · last session \(23 Nov 2026\): -2\.2σ, between the closes of 20 Nov 2026 and 23 Nov 2026$/.test(tu?.ztip ?? "") && /^The day's change over the σ of the 63 daily changes before it/.test(tu.ztip), tu?.ztip);
    // heights: what the choice and the days cost
    const w0 = await without(p), h1 = (await strip(p)).h, on1 = (await tableRows(p)).on;
    if (!one) ck(`heights: the strip's panel is ${h1.toFixed(1)} CSS px, ${w0.h.toFixed(1)} without the choice and the days (within 1 px); the table keeps its rows on the first screen (${on1} of ${t.rows.length}, ${w0.on} without)`, Math.abs(h1 - w0.h) <= 1 && on1 >= w0.on && on1 >= 12, { h1, w0, on1 });
    else ck(`heights: a cell takes two lines (the name and the σ; the day and the change), the strip's panel ${h1.toFixed(1)} CSS px (at most 54), and the table shows ${on1} of ${t.rows.length} rows`, h1 <= 54 && on1 === 18 && t.rows.length === 18 && s.cells.every((c) => c.h <= 32 && c.lv === null && c.day === null) && cu.ls === "last session -2.2σ", { h1, on1, cells: s.cells.map((c) => c.h) });
    // LAST SESSION
    await p.locator('#mk-sgpick [data-mode="last"]').click(); await p.waitForTimeout(300);
    const l = await strip(p), wl = [...rows].filter((r) => r.ls?.z != null).sort((a, c) => Math.abs(c.ls.z) - Math.abs(a.ls.z) || a.order - c.order).slice(0, 10), lu = l.cells.find((c) => c.nm === "USD/JPY");
    ck(`a click on LAST SESSION lights it ("${l.aux.split(" · as of")[0]}"): the ten largest last sessions (${l.cells.map((c) => `${c.nm} ${c.z}`).join(", ")}), every cell with its session's date and no "last session" line`, l.mode === "last" && l.pick.on.join() === "false,true" && l.pick.pressed.join() === "false,true" && /^each instrument's last completed day ÷ σ of the 63 daily changes before it · as of 24 Nov 07:10 SGT/.test(l.aux) && l.cells.length === 10 && l.cells.every((c, i) => c.z === fmtS(wl[i].ls.z) && (one ? c.d2 === `${dm(wl[i].ls.d)} · ` : c.day === dm(wl[i].ls.d)) && c.ls === null && /^[+-]?\d[\d,.]*(%|bp)$/.test(c.cg ?? "")), l.cells.map((c) => [c.nm, c.z, c.day, c.d2, c.cg]));
    ck(`USD/JPY's reads the stand-in's last session, ${lu?.z} with "23 Nov"${one ? "" : `, its change and its close under it ("${lu?.cg}${lu?.lv}")`}; its tooltip names the closes of 20 Nov 2026 and 23 Nov 2026 with both levels`, !!lu && lu.z === "-2.2σ" && (one ? lu.d2 === "23 Nov · " : lu.day === "23 Nov" && /^ · \d{3}\.\d{3}$/.test(lu.lv ?? "")) && /^USD\/JPY \(USDJPY=X\) · The change between the closes of 20 Nov 2026 and 23 Nov 2026 \(\d{3}\.\d{3} to \d{3}\.\d{3}, -\d\.\d\d%\) over the σ of the 63 daily changes before it \(\d\.\d\d% a day\), worked out † from the daily closes of \d{1,2} [A-Z][a-z]{2} 2026 – 20 Nov 2026 \(Yahoo Finance\)$/.test(lu.tip), lu);
    ck(`the table keeps today's column under either choice: USD/JPY's 1D IN σ is still ${fmtS(usd.z1d)}`, (await p.evaluate(() => { const heads = [...document.querySelectorAll("table.mkt thead th")].map((t) => t.innerText.trim()), zi = heads.findIndex((h) => h.startsWith("1D IN σ")); return [...document.querySelectorAll("table.mkt tbody tr.click")].find((tr) => tr.children[0].querySelector("a").textContent === "USD/JPY").children[zi].textContent; })) === fmtS(usd.z1d));
    // the keyboard, and the choice kept with the visit
    await p.locator('#mk-sgpick [data-mode="last"]').focus(); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(200);
    const k1 = await strip(p); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(200); const k2 = await strip(p);
    ck("Left and Right move between the two", k1.mode === "today" && k2.mode === "last" && (await p.evaluate(() => document.activeElement?.dataset.mode)) === "last", { k1: k1.mode, k2: k2.mode });
    if (!one) { await p.locator(".sgcell").first().click(); await p.waitForTimeout(500); await p.goBack(); await p.waitForSelector(".sgcell"); await p.waitForTimeout(400);
      const back = await strip(p); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector(".sgcell"); await p.waitForTimeout(300); const fresh = await strip(p);
      ck("the choice stays with the visit (Back from a cell's page returns to LAST SESSION) and is not stored: a page opened anew starts on TODAY", back.mode === "last" && fresh.mode === "today", { back: back.mode, fresh: fresh.mode }); }
    ck("nothing runs off the page sideways; no page errors", s.ox <= 0 && l.ox <= 0 && errs.length === 0, { ox: [s.ox, l.ox], errs });
    await ctx.close();
  }

  console.log("\n[nothing cut at C2, C3 (text XL) and text L, in the machine's fonts and with a wide font forced]");
  for (const code of ["C1", "C2", "C3", "CL", "C4", "C4b"]) {
    const { ctx, p, errs } = await page(b, code, MORNING);
    await go(p, MOCK, "#market", ".sgcell");
    for (const font of ["the machine's fonts", "a wide font forced"]) {
      if (font !== "the machine's fonts") { await p.addStyleTag({ content: WIDE }); await p.waitForTimeout(350); }
      for (const mode of ["today", "last"]) {
        await p.locator(`#mk-sgpick [data-mode="${mode}"]`).click(); await p.waitForTimeout(250);
        const s = await strip(p), bad = s.cells.filter((c) => c.cut);
        ck(`${code}, ${font}, ${mode === "today" ? "TODAY" : "LAST SESSION"}: no cell's σ, day or third line is cut (${s.cells.filter((c) => c.day || c.d2).length} with a day; the third line of at most ${Math.max(...s.cells.map((c) => c.mvLines))} line(s))`, s.cells.length === 10 && bad.length === 0 && s.ox <= 0, { bad, ox: s.ox });
      }
    }
    ck(`${code}: no page errors`, errs.length === 0, errs); await ctx.close();
  }

  for (const code of ["P1", "P2"]) {
    console.log(`\n[${code}, ${SIZES[code].dev}: Tue 24 Nov 2026, 07:10 SGT]`);
    const { ctx, p, errs } = await page(b, code, MORNING);
    await go(p, MOCK, "#market", ".mp-sgcard");
    const rows = await table(p), today = "2026-11-24";
    const view = () => p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), row = document.querySelector(".mp-sgrow"), seg = document.querySelector("#mk-sgpick"), shown = (e) => !!e && R(e).width > 0;
      const tap = (el) => { const r = R(el), x = r.left + r.width / 2; let n = 0; for (let y = Math.floor(r.top) - 10; y <= Math.ceil(r.bottom) + 10; y++) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) n++; } return { w: Math.round(r.width), h: n }; };
      return { vw: innerWidth, rowRight: R(row).right, seg: seg ? [...seg.querySelectorAll("button")].map((x) => ({ text: x.textContent, on: x.classList.contains("on"), pressed: x.getAttribute("aria-pressed"), ...tap(x), frame: Math.round(R(seg).height) })) : null,
        cards: [...document.querySelectorAll(".mp-sgcard")].map((c) => { const mv = c.querySelector(".mv"), d = c.querySelector(".day"), zz = c.querySelector(".z"), nm = c.querySelector(".nm"); return { nm: nm.textContent, z: zz.textContent, day: shown(d) ? d.textContent : null, mv: mv.textContent, ls: mv.classList.contains("ls") ? { w: mv.querySelector(".w").textContent, f: mv.querySelector(".f").textContent, figCut: mv.querySelector(".f").scrollWidth > mv.querySelector(".f").clientWidth + 1 || R(mv.querySelector(".f")).right > R(c).right - 1 } : null, w: R(c).width, h: R(c).height, left: R(c).left, right: R(c).right,
          cut: nm.scrollWidth > nm.clientWidth + 1 || zz.scrollWidth > zz.clientWidth + 1 || (shown(d) && R(d).right > R(c).right - 1) || (!mv.classList.contains("ls") && mv.scrollWidth > mv.clientWidth + 1) }; }),
        lines: [...document.querySelectorAll(".mp-row.inst")].map((r) => ({ n: r.querySelector(".n").textContent, w: r.querySelector(".mp-chg .w").textContent, fig: r.querySelector(".mp-chg .fig").textContent, h: Math.round(R(r).height), pillW: Math.round(R(r.querySelector(".mp-chg")).width), wCut: r.querySelector(".mp-chg .w").scrollWidth > r.querySelector(".mp-chg").clientWidth + 1 })), ox: document.documentElement.scrollWidth - innerWidth }; });
    const v = await view(), cu = v.cards.find((c) => c.nm === "USD/JPY");
    ck(`the toggle at the right of the head: "${v.seg?.map((x) => x.text).join(" | ")}", Today lit, each part taking a tap of at least 44 x 44 px (${v.seg?.map((x) => `${x.w} x ${x.h}`).join(", ")}; the frame ${v.seg?.[0].frame} px)`, !!v.seg && v.seg.map((x) => x.text).join("|") === "Today|Last session" && v.seg[0].on && !v.seg[1].on && v.seg[0].pressed === "true" && v.seg.every((x) => x.w >= 44 && x.h >= 44) && v.seg[0].frame <= 36, v.seg);
    ck(`under Today, USD/JPY's card reads ${cu?.z} and "${cu?.ls?.w} ${cu?.ls?.f}" (the figure never cut)`, !!cu && cu.z === "+2.7σ" && cu.ls?.w === "last session" && cu.ls.f === "-2.2σ" && !cu.ls.figCut && cu.day === null, cu);
    const wantCards = [...rows].filter((r) => r.z1d != null).sort((a, c) => Math.abs(c.z1d) - Math.abs(a.z1d) || a.order - c.order).slice(0, 10);
    ck(`a card carries a day at the right of its σ exactly when its row's day is not 24 Nov (${v.cards.filter((c) => c.day).map((c) => `${c.nm} ${c.day}`).join(", ")})`, v.cards.length === 10 && v.cards.every((c, i) => { const r = wantCards[i], d = rowDay(r); return c.day === (!r.live && d !== today ? dm(d) : null); }) && v.cards.some((c) => c.day), v.cards.map((c) => [c.nm, c.day]));
    const nk = v.lines.find((x) => x.n === "Nikkei 225"), uj = v.lines.find((x) => x.n === "USD/JPY");
    ck(`a line's pill names the row's day in place of "1D" where its move is not today's: the Nikkei 225's "${nk?.fig}" over "${nk?.w}", USD/JPY's over "${uj?.w}"; every row ${[...new Set(v.lines.map((x) => x.h))].join(" or ")} px, no pill's day cut`, nk?.w === "20 Nov" && uj?.w === "1D" && v.lines.every((x) => !x.wCut && x.h >= 50) && v.lines.filter((x) => x.w !== "1D").map((x) => x.w).sort().join() === rows.filter((r) => !r.live && rowDay(r) !== today).map((r) => dm(rowDay(r))).sort().join() && v.lines.length === rows.length, v.lines.map((x) => [x.n, x.w]));
    ck(`a card is ${v.cards[0].w} x ${v.cards[0].h} px; the third is cut by the row's right edge (${Math.round(v.cards[2].left)}–${Math.round(v.cards[2].right)} of ${Math.round(v.rowRight)}); no name or figure is cut`, v.cards.every((c) => Math.abs(c.w - 144) < 0.5 && Math.abs(c.h - 76) < 0.5 && !c.cut) && v.cards[2].left < v.rowRight && v.cards[2].right > v.rowRight && v.ox <= 0, v.cards.slice(0, 3));
    // the other period keeps its period on the pill
    await p.locator(".mp-head .pick select").selectOption("1W"); await p.waitForTimeout(300);
    ck("with PERIOD on 1W every pill keeps its period", (await view()).lines.every((x) => x.w === "1W")); await p.locator(".mp-head .pick select").selectOption("1D"); await p.waitForTimeout(300);
    // Last session
    await p.locator('#mk-sgpick [data-mode="last"]').tap(); await p.waitForTimeout(350);
    const l = await view(), wl = [...rows].filter((r) => r.ls?.z != null).sort((a, c) => Math.abs(c.ls.z) - Math.abs(a.ls.z) || a.order - c.order).slice(0, 10), lu = l.cards.find((c) => c.nm === "USD/JPY");
    ck(`a tap on "Last session" puts a date on every card (${l.cards.slice(0, 3).map((c) => `${c.nm} ${c.z} ${c.day}`).join(", ")} …); USD/JPY's reads ${lu?.z} with "${lu?.day}" and the session's change ("${lu?.mv}")`, l.seg[1].on && l.seg[1].pressed === "true" && l.cards.length === 10 && l.cards.every((c, i) => c.z === fmtS(wl[i].ls.z) && c.day === dm(wl[i].ls.d) && c.ls === null && !c.cut) && lu?.z === "-2.2σ" && lu.day === "23 Nov" && /^-\d\.\d\d%$/.test(lu.mv), l.cards.map((c) => [c.nm, c.z, c.day, c.mv]));
    // the wide font
    await p.addStyleTag({ content: WIDE }); await p.waitForTimeout(350);
    const lw = await view(); await p.locator('#mk-sgpick [data-mode="today"]').tap(); await p.waitForTimeout(350); const tw = await view(), cw = tw.cards.find((c) => c.nm === "USD/JPY");
    ck(`with a wide font forced: a card still ${tw.cards[0].w} x ${tw.cards[0].h} px, no name, σ, day or change cut under either reading; "last session" may lose letters, its figure "${cw?.ls?.f}" never; the toggle's parts ${tw.seg.map((x) => `${x.w} x ${x.h}`).join(", ")}; nothing sideways`, [...lw.cards, ...tw.cards].every((c) => Math.abs(c.w - 144) < 0.5 && Math.abs(c.h - 76) < 0.5 && !c.cut) && !!cw?.ls && !cw.ls.figCut && cw.ls.f === "-2.2σ" && tw.seg.every((x) => x.w >= 44 && x.h >= 44) && tw.lines.every((x) => !x.wCut) && tw.ox <= 0 && lw.ox <= 0, { cards: tw.cards.filter((c) => c.cut), cw });
    // the opened row
    await p.locator(".mp-row.inst", { has: p.locator(".n", { hasText: /^USD\/JPY$/ }) }).tap(); await p.waitForSelector(".mp-item.open .mp-grid.two"); await p.waitForTimeout(300);
    const det = await p.evaluate(() => { const c = document.querySelector(".mp-item.open .mp-grid.two > div"); return { k: c.querySelector(".k").textContent, v: c.querySelector(".v").textContent, ls: c.querySelector(".ls")?.textContent ?? null, fs: c.querySelector(".ls") ? parseFloat(getComputedStyle(c.querySelector(".ls")).fontSize) : null, below: c.querySelector(".ls") ? c.querySelector(".ls").getBoundingClientRect().top >= c.querySelector(".v").getBoundingClientRect().bottom - 1 : null, inBox: c.querySelector(".ls") ? c.querySelector(".ls").getBoundingClientRect().right <= c.getBoundingClientRect().right + 0.5 : null }; });
    ck(`the opened USD/JPY row shows "${det.ls}" under "${det.k}" ${det.v} (${det.fs} px), inside its box`, det.k === "1D in σ" && det.v === "+2.7σ" && det.ls === "last session -2.2σ · 23 Nov" && det.fs >= 11 && det.below && det.inBox, det);
    const note = await p.locator("#mk-sigma-note").textContent();
    ck(`the note under the lists says what Last session is: "…${note.split(". ").slice(1, 2)}."`, /Last session: each instrument's newest completed day, between its last two booked closes\./.test(note), note);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[Tue 24 Nov 2026, 17:00 SGT: one reading]");
  { const { ctx, p, errs } = await page(b, "C1", EVENING);
    await go(p, MOCK, "#market", ".sgcell");
    const s = await strip(p), cu = s.cells.find((c) => c.nm === "USD/JPY");
    ck(`C1: USD/JPY's cell under TODAY shows ${cu?.z} with its change and level ("${cu?.cg}${cu?.lv}") and no "last session" line; no cell has one (the futures' day is as old)`, !!cu && cu.z === "+2.7σ" && cu.ls === null && /^\+\d\.\d\d%$/.test(cu.cg) && s.cells.every((c) => c.ls === null), s.cells.map((c) => [c.nm, c.ls]));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { const { ctx, p, errs } = await page(b, "P2", EVENING);
    await go(p, MOCK, "#market", ".mp-sgcard");
    const c = await p.evaluate(() => [...document.querySelectorAll(".mp-sgcard")].map((x) => ({ nm: x.querySelector(".nm").textContent, z: x.querySelector(".z").textContent, ls: x.querySelector(".mv").classList.contains("ls"), mv: x.querySelector(".mv").textContent })));
    const cu = c.find((x) => x.nm === "USD/JPY");
    ck(`P2: USD/JPY's card under Today shows ${cu?.z} and its change ("${cu?.mv}"), no "last session" line; no card has one`, !!cu && cu.z === "+2.7σ" && !cu.ls && /^\+\d\.\d\d%$/.test(cu.mv) && c.every((x) => !x.ls), c);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  console.log("\n[a server from before 21 Nov 2026: the same rows without the last session]");
  { const { ctx: c0, p: p0 } = await page(b, "C1", MORNING);
    await go(p0, MOCK, "#market", ".sgcell");
    const ans = await p0.evaluate(async () => { const { mockAction } = await import("/orrery-market-monitor/src/lib/mock.ts"); return mockAction("table"); });
    await c0.close();
    const old = { ...ans, rows: ans.rows.map(({ ls, ...r }) => r) };
    for (const code of ["C1", "C4", "P2"]) {
      const { ctx, p, errs, phone } = await page(b, code, null);
      await routes(p);
      await p.route("**/fakeapi?*", (r) => (new URL(r.request().url()).searchParams.get("action") === "table" ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(old) }) : r.fallback()));
      await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(phone ? ".mp-sgcard" : ".sgcell"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
      if (!phone) { const s = await strip(p), t = await tableRows(p);
        ck(`${code}: no choice after the title, no day in a cell or after a name, the head as it was ("${s.aux.slice(0, 96)}…"), each cell with its change${code === "C4" ? " hidden, one line, as before" : " and level"}; the 1D IN σ tooltip without a last session`, s.pick === null && s.cells.length === 10 && s.cells.every((c) => c.day === null && c.d2 === null && c.ls === null) && /^today's change ÷ σ of daily changes, 63 sessions · official-curve yields once their day is booked · as of /.test(s.aux) && t.rows.every((r) => r.day === null && !/last session/.test(r.ztip)) && (code !== "C4" || s.cells.every((c) => c.h <= 24)), { pick: s.pick, cells: s.cells.map((c) => [c.day, c.d2, c.h]) }); }
      else { const v = await p.evaluate(() => ({ seg: !!document.querySelector("#mk-sgpick"), headH: Math.round(document.querySelector("#mk-sigma h2").getBoundingClientRect().height), days: document.querySelectorAll(".mp-sgcard .day").length, pills: [...new Set([...document.querySelectorAll(".mp-row.inst .mp-chg .w")].map((x) => x.textContent))], note: document.querySelector("#mk-sigma-note").textContent, cards: document.querySelectorAll(".mp-sgcard").length }));
        ck(`${code}: no toggle (the head keeps its ${v.headH} px), no day on a card, every pill "1D", the note without the Last session sentence`, !v.seg && v.headH === 44 && v.days === 0 && v.pills.join() === "1D" && !/Last session/.test(v.note) && v.cards === 10, v); }
      ck(`${code}: no page errors`, errs.length === 0, errs); await ctx.close();
    }
  }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
