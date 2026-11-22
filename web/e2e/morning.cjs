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
//   - nothing cut at the designer's sizes and at each layout's smallest window, with a margin in px, in the machine's
//     fonts and drawn wider (GitHub's machines draw the same faces wider; e2e/room.cjs says how both are measured);
//   - a name cell that carries a day has room for the name, its PROXY mark and the day in every layout the table is
//     drawn in: the scrolling layout down to its least width, the one-screen layout down to its smallest window at
//     AUTO, 1170 x 540, and at text L and XL in theirs, 1495 x 900 and 1755 x 1000 (GitHub's run of 21 Nov 2026 found
//     TOPIX's cell a pixel short at 1280 x 720; the review of 22 Nov, SF-1, its day cut at L and XL in layouts under
//     1,150 px, which the one-screen layout no longer offers), and the classic phone layout, where the day stands
//     under its name;
//   - Tue 24 Nov 2026, 17:00 SGT: USD/JPY's cell and card show one reading, no "last session" line;
//   - Mon 23 Nov 2026, 08:10 SGT: the week's first hours count as a young day too (the checks of round 3b: LS-3): the
//     1D runs from Friday's close, and USD/JPY's cell and card show Friday's session under today's σ; at 09:10 SGT not;
//   - a server from before 21 Nov 2026 (rows without the last session): no choice, no day, the strip as it was.
// Run from web/:  node e2e/run.cjs morning   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const fs = require("fs");
const { routes } = require("./harness.cjs");
const { ROOM, MONO, widen } = require("./room.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const MORNING = "2026-11-23T23:10:00Z";   // Tue 24 Nov 07:10 SGT, Mon 18:10 in New York: the FX day of the 23rd ended 70 minutes ago
const EVENING = "2026-11-24T09:00:00Z";   // Tue 24 Nov 17:00 SGT: the FX day is eleven hours old
// the margins, in CSS px: what a text that may not be cut keeps between its end and the edge that would cut it, in the
// machine's own fonts, and what is left of it with every letter drawn 2% of the type's size wider (e2e/room.cjs)
const ROOM_OWN = 3, ROOM_WIDER = 0.5, NAME_OWN = 6, NAME_WIDER = 2;
const SIZES = {   // the designer's sizes (plan review §3.7), and each layout's smallest window
  C1: { vp: [1440, 900], prefs: { size: "AUTO", compact: false } }, C2: { vp: [1280, 720], prefs: { size: "AUTO", compact: false } }, C3: { vp: [1440, 900], prefs: { size: "XL", compact: false } },
  C4: { vp: [1440, 900], prefs: { size: "AUTO", compact: true } }, C4b: { vp: [1280, 720], prefs: { size: "AUTO", compact: true } }, CL: { vp: [1440, 900], prefs: { size: "L", compact: false } },
  // the one-screen layout is offered where its layout is at least 1,300 CSS px wide (lib/prefs.ts): from a window of
  // 1170 x 540 at AUTO, 1495 at L and 1755 at XL; the scrolling layout's table keeps a least width under which its
  // panel scrolls sideways, so a window of 760 px draws its name column at its narrowest
  C4c: { vp: [1170, 540], prefs: { size: "AUTO", compact: true } }, C4L: { vp: [1495, 900], prefs: { size: "L", compact: true } }, C4X: { vp: [1755, 1000], prefs: { size: "XL", compact: true } },
  C0: { vp: [760, 800], prefs: { size: "AUTO", compact: false } },
  P1: { dev: "iPhone SE (3rd gen)" }, P2: { dev: "iPhone 13" },
  // the classic phone layout (CLASSIC LAYOUT in the menu): the computer's table in a 104-px name column
  K1: { dev: "iPhone SE (3rd gen)", classic: true }, K1c: { dev: "iPhone SE (3rd gen)", classic: true, prefs: { size: "AUTO", compact: true } }, K2: { dev: "iPhone 13", classic: true },
};
const sizeWords = (code) => { const z = SIZES[code]; return `${code}, ${z.dev ? `${z.dev}, the classic phone layout${z.prefs?.compact ? " with COMPACT on" : ""}` : `${z.vp.join("x")}${z.prefs.compact ? `, the one-screen layout${z.prefs.size !== "AUTO" ? ` at text ${z.prefs.size}` : ""}` : z.prefs.size !== "AUTO" ? `, text ${z.prefs.size}` : ""}`}`; };
async function page(b, code, clock) {
  const z = SIZES[code], opts = z.dev ? { ...devices[z.dev] } : { viewport: { width: z.vp[0], height: z.vp[1] } };
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
  await ctx.addInitScript(([pr, at, classic]) => { try { if (pr) localStorage.setItem("om_prefs", JSON.stringify({ ...pr, v: 2 })); if (at) localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); if (classic) localStorage.setItem("om_phone_v2", "0"); } catch {} }, [z.prefs || null, clock || null, !!z.classic]);
  await ctx.addInitScript({ content: ROOM });   // window.__room on every page of the context, a reloaded one too
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
  const t = head.querySelector(".t"), pick = head.querySelector("#mk-sgpick"), btns = pick ? [...pick.querySelectorAll("button")] : [], m = window.__room;
  // The room each part of a cell has, in CSS px (e2e/room.cjs). A part that cannot wrap: the name where it is on one
  // line (the one-screen layout), the σ and the day on their line (what the line has left once both are written), the
  // one-screen layout's second line. The third line of the scrolling layout wraps (the designer's D-70: two lines at
  // most), so it is never cut: it only may not stand out of its cell.
  const room = (c) => { const nm = c.querySelector(".nm"), zl = c.querySelector(".zl"), mv = c.querySelector(".mv"), parts = {}, wraps = getComputedStyle(mv).whiteSpace === "normal";
    if (getComputedStyle(nm).whiteSpace === "nowrap") parts.name = m.spare(nm, c); else parts.nameIn = m.within(nm, c);
    if (getComputedStyle(c).flexDirection === "column" && getComputedStyle(c).display === "flex") parts.sigmaLine = m.free(zl, [...zl.children], parseFloat(getComputedStyle(zl).columnGap) || 0);   // the scrolling layout: the σ at the left, its day at the right
    parts.sigmaIn = m.within(zl, c);
    if (m.shown(mv)) { if (wraps) parts.thirdIn = m.within(mv, c); else parts.secondLine = m.spare(mv, c); }
    const hard = ["name", "sigmaLine", "secondLine"].filter((k) => parts[k] != null), soft = ["nameIn", "sigmaIn", "thirdIn"].filter((k) => parts[k] != null);
    const least = hard.reduce((a, k) => (parts[k] < parts[a] ? k : a), hard[0]);
    return { parts, least: parts[least], leastOf: least, out: soft.some((k) => parts[k] < -0.05) }; };
  return { h: R(pn).height / z, aux: head.querySelector(".aux").textContent, title: t.textContent, mode: pn.querySelector(".sgstrip")?.dataset.mode ?? null,
    pick: pick ? { texts: btns.map((x) => x.textContent), on: btns.map((x) => x.classList.contains("on")), pressed: btns.map((x) => x.getAttribute("aria-pressed")), sameLine: Math.abs((R(pick).top + R(pick).bottom) / 2 - (R(t).top + R(t).bottom) / 2) <= 4 * z, after: R(pick).left >= R(t).right - 0.5, joined: btns.length === 2 && Math.abs(R(btns[1]).left - R(btns[0]).right) <= 0.5, onBg: getComputedStyle(btns.find((x) => x.classList.contains("on")) ?? btns[0]).backgroundColor, role: pick.getAttribute("role") } : null,
    cells: [...pn.querySelectorAll(".sgcell")].map((c) => { const zl = c.querySelector(".zl"), zz = c.querySelector(".z"), d = c.querySelector(".zl .day"), mv = c.querySelector(".mv"), ls = mv.querySelector(".ls"), shown = (e) => !!e && getComputedStyle(e).display !== "none" && R(e).width > 0;
      return { nm: c.querySelector(".nm").textContent, z: zz.textContent, day: shown(d) ? d.textContent : null, dayRight: shown(d) ? R(d).left >= R(zz).right - 0.5 && Math.abs(R(d).bottom - R(zz).bottom) < 8 * z : null, d2: shown(mv.querySelector(".d2")) ? mv.querySelector(".d2").textContent : null, cg: mv.querySelector(".cg")?.textContent ?? null, lv: shown(mv.querySelector(".lv")) ? mv.querySelector(".lv").textContent : null, ls: ls ? ls.textContent : null, lsTip: ls ? ls.title : null, tip: c.title, hot: c.classList.contains("hot"),
        h: R(c).height / z, mvLines: Math.round(R(mv).height / parseFloat(getComputedStyle(mv).lineHeight || "1") / z * 10) / 10, room: room(c) }; }),
    note: pn.querySelector("#mk-sigma-note")?.textContent ?? null, ox: document.documentElement.scrollWidth - innerWidth };
});
// the table: each row's name cell (its day, its badges), whether it is live, its 1D IN σ tooltip; the rows whole on the first screen
const tableRows = (p) => p.evaluate(() => { const heads = [...document.querySelectorAll("table.mkt thead th")].map((t) => t.innerText.trim()), zi = heads.findIndex((h) => h.startsWith("1D IN σ"));
  // a name cell's room (e2e/room.cjs): the CSS px between the end of its name, of each mark and of its day and the
  // cell's content edge, the least of them; and whether the browser itself calls the cell's content wider than it
  const m = window.__room, R = (e) => e.getBoundingClientRect();
  const rows = [...document.querySelectorAll("table.mkt tbody tr.click")].map((tr) => { const td = tr.children[0], a = td.querySelector("a"), d = td.querySelector(".asday"), marks = [...td.querySelectorAll(".badge")].filter(m.shown);
    return { name: a.textContent, marks: marks.map((x) => x.textContent).join(" "), live: tr.classList.contains("live"), day: d ? d.textContent : null, dayTip: d ? d.title : null, dayBox: d ? getComputedStyle(d).borderTopWidth : null, room: Math.min(m.spare(a, td), ...marks.map((x) => m.spare(x, td)), d ? m.spare(d, td) : 999), cut: td.scrollWidth > td.clientWidth, widths: [td.scrollWidth, td.clientWidth], under: d ? R(d).top >= R(a).bottom - 2 * m.z() : null, h: Math.round(R(tr).height / m.z() * 10) / 10, ztip: zi >= 0 ? tr.children[zi].title : null, onScreen: R(tr).bottom <= innerHeight + 0.5 }; });
  return { rows, on: rows.filter((r) => r.onScreen).length }; });
// the strip without the choice and the days, as it was: how tall the panel is, and how many table rows are whole on the screen
const without = async (p) => { const st = await p.addStyleTag({ content: "#mk-sgpick,.sgcell .day,.asday{display:none!important}" }); await p.waitForTimeout(250);
  const v = await p.evaluate(() => { const z = Number(document.body.style.zoom) || 1; return { h: document.querySelector('.panel[data-k="sigma"]').getBoundingClientRect().height / z, on: [...document.querySelectorAll("table.mkt tbody tr.click")].filter((tr) => tr.getBoundingClientRect().bottom <= innerHeight + 0.5).length }; });
  await st.evaluate((e) => e.remove()); await p.waitForTimeout(250); return v; };

(async () => { const b = await chromium.launch();
  // the measure itself (CF-5 of the review of fix part 1, 22 Nov 2026): a part that ends on a badge has the room its
  // box has, not its letters: a 100-px cell holding a 100-px badge whose letters end 5 px before its border
  { const ctx = await b.newContext({ viewport: { width: 400, height: 200 }, deviceScaleFactor: 1 }); await ctx.addInitScript({ content: ROOM }); const p = await ctx.newPage();
    await p.setContent('<div id="c" style="width:100px;overflow:hidden;white-space:nowrap;font:12px monospace"><span id="t"><span id="g" style="display:inline-block;padding:0 4px;border:1px solid #888">DELAYED~10</span></span></div>');
    const m = await p.evaluate(() => { const t = document.getElementById("t"), g = document.getElementById("g"), c = document.getElementById("c").getBoundingClientRect(); return { spare: window.__room.spare(g), outer: window.__room.spare(t), boxRoom: Math.round((c.right - g.getBoundingClientRect().right) * 10) / 10, textRoom: Math.round((c.right - window.__room.text(g).right) * 10) / 10 }; });
    ck(`the room of a part that ends on a badge is measured to the badge's border: ${m.spare} px (its box leaves ${m.boxRoom}, its letters ${m.textRoom})`, Math.abs(m.spare - m.boxRoom) <= 0.1 && Math.abs(m.outer - m.boxRoom) <= 0.1 && m.textRoom - m.spare >= 4, m);
    await ctx.close(); }
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
    { const dated = t.rows.filter((r) => r.day), tight = dated.reduce((a, r) => (r.room < a.room ? r : a), dated[0]);
      ck(`no name cell that carries a day is cut by it: each keeps at least ${NAME_OWN} CSS px between its name, its mark and its day and the cell's edge (the least ${tight?.room} px: ${tight?.name}${tight?.marks ? " " + tight.marks : ""} ${tight?.day})`, dated.length >= 6 && dated.every((r) => !r.cut && r.room >= NAME_OWN), dated.filter((r) => r.cut || r.room < NAME_OWN).map((r) => [r.name, r.marks, r.day, r.room, r.widths])); }
    // the panel's CSV: the day and the marks stand after the name in its cell, and the file ran them into the name
    // ("Nikkei 22520 Nov", "TOPIXPROXY20 Nov": the checks of round 3b). The name is a column of its own there, then the
    // marks, then the day of a figure that is not today's
    if (code === "C1") {
      const [dl] = await Promise.all([p.waitForEvent("download"), p.locator('.panel[data-k="mkt"] .csvbtn').click()]);
      const file = fs.readFileSync(await dl.path(), "utf8").replace(/^\uFEFF/, "");
      const cells = (line) => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
      const lines = file.split("\r\n").map(cells), head = lines[0], data = lines.slice(1).filter((l) => l.length > 3 && l.slice(3).some((x) => x !== "")), by = (n) => data.find((l) => l[0] === n);
      ck(`the panel's CSV keeps the name apart: its columns begin ${head.slice(0, 4).join(" | ")}; the first column is the ${data.length} names of the table and nothing else; ${by("Nikkei 225")?.slice(0, 3).join(" | ")}; ${by("TOPIX")?.slice(0, 3).join(" | ")}; ${by("USD/JPY")?.slice(0, 3).join(" | ")}`, head.slice(0, 5).join("|") === "Name|Marks|Figures of (blank: today in SGT)|Last|1D" && data.map((l) => l[0]).join("|") === t.rows.map((r) => r.name).join("|") && by("Nikkei 225")?.[1] === "" && by("Nikkei 225")[2] === "20 Nov 2026" && by("TOPIX")?.[1] === "PROXY" && by("TOPIX")[2] === "20 Nov 2026" && by("USD/JPY")?.[1] === "LIVE" && by("USD/JPY")[2] === "" && data.every((l) => l.length === head.length) && data.filter((l) => l[2]).length === t.rows.filter((r) => r.day).length && /^\d[\d,]*\.\d\d$/.test(by("Nikkei 225")[3]), { head, first: data.map((l) => l.slice(0, 4)) });
    }
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

  // Nothing cut, with a margin, at the designer's sizes and at each layout's smallest window. Twice: in the machine's
  // fonts, and with every letter drawn 2% of its size wider (e2e/room.cjs: GitHub's machines draw the same faces wider
  // than this one, and the generic monospace this suite used to force is no wider than the Monitor's own face). The
  // strip's cells under both readings, and the table's name cells that carry a day.
  console.log("\n[nothing cut, with a margin: the strip's cells and the name cells that carry a day, in the machine's fonts and drawn wider]");
  for (const code of ["C1", "C2", "C3", "CL", "C0", "C4", "C4b", "C4c", "C4L", "C4X"]) {
    const { ctx, p, errs } = await page(b, code, MORNING);
    await go(p, MOCK, "#market", ".sgcell");
    if (SIZES[code].prefs.compact) ck(`${sizeWords(code)}: the one-screen layout is drawn`, await p.evaluate(() => document.body.classList.contains("term")));
    for (const font of ["the machine's fonts", "drawn wider"]) {
      const wider = font !== "the machine's fonts", need = wider ? ROOM_WIDER : ROOM_OWN, needName = wider ? NAME_WIDER : NAME_OWN;
      for (const mode of ["today", "last"]) {
        await p.locator(`#mk-sgpick [data-mode="${mode}"]`).click(); await p.waitForTimeout(250);
        if (wider) await widen(p);
        const s = await strip(p), bad = s.cells.filter((c) => c.room.least < need || c.room.out || c.mvLines > 2.05), tight = s.cells.reduce((a, c) => (c.room.least < a.room.least ? c : a), s.cells[0]);
        ck(`${sizeWords(code)}, ${font}, ${mode === "today" ? "TODAY" : "LAST SESSION"}: no cell's name, σ, day or line under them is cut: each keeps at least ${need} CSS px (the least ${tight.room.least} px: ${tight.nm}'s ${tight.room.leastOf}; ${s.cells.filter((c) => c.day || c.d2).length} with a day; a third line of at most ${Math.max(...s.cells.map((c) => c.mvLines))} line(s))`, s.cells.length === 10 && bad.length === 0 && s.ox <= 0, { bad: bad.map((c) => [c.nm, c.room, c.mvLines]), ox: s.ox });
      }
      const t = await tableRows(p), dated = t.rows.filter((r) => r.day), tight = dated.reduce((a, r) => (r.room < a.room ? r : a), dated[0]), tp = dated.find((r) => r.name === "TOPIX");
      ck(`${sizeWords(code)}, ${font}: every name cell that carries a day has room for its name, its mark and the day, at least ${needName} CSS px to spare (the least ${tight?.room} px: ${tight?.name}${tight?.marks ? " " + tight.marks : ""} ${tight?.day}; ${dated.length} such rows; TOPIX with ${tp?.marks || "no mark"})`, dated.length >= 6 && dated.every((r) => !r.cut && r.room >= needName) && tp?.marks === "PROXY" && dated.some((r) => r.name === "Nikkei 225"), dated.filter((r) => r.cut || r.room < needName).map((r) => [r.name, r.marks, r.day, r.room, r.widths]));
    }
    ck(`${code}: no page errors`, errs.length === 0, errs); await ctx.close();
  }
  // The classic phone layout: the name column is 104 px (the figures show beside it), so the day stands under its name.
  for (const code of ["K1", "K1c", "K2"]) {
    const { ctx, p, errs } = await page(b, code, MORNING);
    await go(p, MOCK, "#market", "table.mkt tbody tr.click");
    for (const font of ["the machine's fonts", "drawn wider"]) {
      const wider = font !== "the machine's fonts", needName = wider ? NAME_WIDER : NAME_OWN;
      if (wider) await widen(p);
      const t = await tableRows(p), dated = t.rows.filter((r) => r.day), plain = t.rows.filter((r) => !r.day), tight = dated.reduce((a, r) => (r.room < a.room ? r : a), dated[0]);
      ck(`${sizeWords(code)}, ${font}: every name cell that carries a day shows its name and, under it, its day, whole, at least ${needName} CSS px to spare (the least ${tight?.room} px: ${tight?.name} ${tight?.day}; ${dated.length} such rows, ${[...new Set(dated.map((r) => r.h))].join(" or ")} px tall, the others ${[...new Set(plain.map((r) => r.h))].join(" or ")})`, dated.length >= 6 && dated.every((r) => !r.cut && r.room >= needName && r.under) && dated.some((r) => r.name === "Nikkei 225") && plain.length >= 6 && Math.max(...plain.map((r) => r.h)) < Math.min(...dated.map((r) => r.h)), dated.filter((r) => r.cut || r.room < needName || !r.under).map((r) => [r.name, r.day, r.room, r.widths, r.under]));
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
        // a card's room, in CSS px (e2e/room.cjs): its name in its own line, what the σ's line has left once the σ and
        // its day are written, its third line (the change, or the last session's figure: the words before that figure
        // may lose letters, the figure never); the least of them. A pill's: what its second line has left
        cards: [...document.querySelectorAll(".mp-sgcard")].map((c) => { const mv = c.querySelector(".mv"), d = c.querySelector(".day"), zz = c.querySelector(".z"), nm = c.querySelector(".nm"), zl = c.querySelector(".zl"), ls = mv.classList.contains("ls"), m = window.__room;
          const parts = { name: m.spare(nm, c), sigmaLine: zl ? m.free(zl, [...zl.children], parseFloat(getComputedStyle(zl).columnGap) || 0) : m.spare(zz, c), third: ls ? Math.min(m.free(mv, [mv.querySelector(".f")], 0), m.within(mv.querySelector(".f"), c) < -0.05 ? m.within(mv.querySelector(".f"), c) : 999) : m.spare(mv, c) }, least = Object.keys(parts).reduce((a, k) => (parts[k] < parts[a] ? k : a), "name");
          return { nm: nm.textContent, z: zz.textContent, day: shown(d) ? d.textContent : null, mv: mv.textContent, ls: ls ? { w: mv.querySelector(".w").textContent, f: mv.querySelector(".f").textContent, room: parts.third } : null, w: R(c).width, h: R(c).height, left: R(c).left, right: R(c).right, room: parts[least], roomOf: least, parts }; }),
        lines: [...document.querySelectorAll(".mp-row.inst")].map((r) => ({ n: r.querySelector(".n").textContent, w: r.querySelector(".mp-chg .w").textContent, fig: r.querySelector(".mp-chg .fig").textContent, h: Math.round(R(r).height), pillW: Math.round(R(r.querySelector(".mp-chg")).width), room: Math.min(window.__room.within(r.querySelector(".mp-chg .w"), r.querySelector(".mp-chg")), window.__room.within(r.querySelector(".mp-chg .fig"), r.querySelector(".mp-chg"))) })), ox: document.documentElement.scrollWidth - innerWidth }; });
    const tightest = (cards) => cards.reduce((a, c) => (c.room < a.room ? c : a), cards[0]);
    const v = await view(), cu = v.cards.find((c) => c.nm === "USD/JPY");
    ck(`the toggle at the right of the head: "${v.seg?.map((x) => x.text).join(" | ")}", Today lit, each part taking a tap of at least 44 x 44 px (${v.seg?.map((x) => `${x.w} x ${x.h}`).join(", ")}; the frame ${v.seg?.[0].frame} px)`, !!v.seg && v.seg.map((x) => x.text).join("|") === "Today|Last session" && v.seg[0].on && !v.seg[1].on && v.seg[0].pressed === "true" && v.seg.every((x) => x.w >= 44 && x.h >= 44) && v.seg[0].frame <= 36, v.seg);
    ck(`under Today, USD/JPY's card reads ${cu?.z} and "${cu?.ls?.w} ${cu?.ls?.f}" (the figure never cut: its line has ${cu?.ls?.room} CSS px beyond it)`, !!cu && cu.z === "+2.7σ" && cu.ls?.w === "last session" && cu.ls.f === "-2.2σ" && cu.ls.room >= ROOM_OWN && cu.day === null, cu);
    const wantCards = [...rows].filter((r) => r.z1d != null).sort((a, c) => Math.abs(c.z1d) - Math.abs(a.z1d) || a.order - c.order).slice(0, 10);
    ck(`a card carries a day at the right of its σ exactly when its row's day is not 24 Nov (${v.cards.filter((c) => c.day).map((c) => `${c.nm} ${c.day}`).join(", ")})`, v.cards.length === 10 && v.cards.every((c, i) => { const r = wantCards[i], d = rowDay(r); return c.day === (!r.live && d !== today ? dm(d) : null); }) && v.cards.some((c) => c.day), v.cards.map((c) => [c.nm, c.day]));
    const nk = v.lines.find((x) => x.n === "Nikkei 225"), uj = v.lines.find((x) => x.n === "USD/JPY");
    ck(`a line's pill names the row's day in place of "1D" where its move is not today's: the Nikkei 225's "${nk?.fig}" over "${nk?.w}", USD/JPY's over "${uj?.w}"; every row ${[...new Set(v.lines.map((x) => x.h))].join(" or ")} px, no pill's figure or day cut (the least room ${Math.min(...v.lines.map((x) => x.room))} CSS px, at least ${ROOM_OWN})`, nk?.w === "20 Nov" && uj?.w === "1D" && v.lines.every((x) => x.room >= ROOM_OWN && x.h >= 50) && v.lines.filter((x) => x.w !== "1D").map((x) => x.w).sort().join() === rows.filter((r) => !r.live && rowDay(r) !== today).map((r) => dm(rowDay(r))).sort().join() && v.lines.length === rows.length, v.lines.map((x) => [x.n, x.w, x.room]));
    ck(`a card is ${v.cards[0].w} x ${v.cards[0].h} px; the third is cut by the row's right edge (${Math.round(v.cards[2].left)}–${Math.round(v.cards[2].right)} of ${Math.round(v.rowRight)}); no name or figure is cut: each keeps at least ${ROOM_OWN} CSS px (the least ${tightest(v.cards).room} px: ${tightest(v.cards).nm}'s ${tightest(v.cards).roomOf})`, v.cards.every((c) => Math.abs(c.w - 144) < 0.5 && Math.abs(c.h - 76) < 0.5 && c.room >= ROOM_OWN) && v.cards[2].left < v.rowRight && v.cards[2].right > v.rowRight && v.ox <= 0, v.cards.slice(0, 3));
    // the other period keeps its period on the pill
    await p.locator(".mp-head .pick select").selectOption("1W"); await p.waitForTimeout(300);
    ck("with PERIOD on 1W every pill keeps its period", (await view()).lines.every((x) => x.w === "1W")); await p.locator(".mp-head .pick select").selectOption("1D"); await p.waitForTimeout(300);
    // Last session
    await p.locator('#mk-sgpick [data-mode="last"]').tap(); await p.waitForTimeout(350);
    const l = await view(), wl = [...rows].filter((r) => r.ls?.z != null).sort((a, c) => Math.abs(c.ls.z) - Math.abs(a.ls.z) || a.order - c.order).slice(0, 10), lu = l.cards.find((c) => c.nm === "USD/JPY");
    ck(`a tap on "Last session" puts a date on every card (${l.cards.slice(0, 3).map((c) => `${c.nm} ${c.z} ${c.day}`).join(", ")} …); USD/JPY's reads ${lu?.z} with "${lu?.day}" and the session's change ("${lu?.mv}")`, l.seg[1].on && l.seg[1].pressed === "true" && l.cards.length === 10 && l.cards.every((c, i) => c.z === fmtS(wl[i].ls.z) && c.day === dm(wl[i].ls.d) && c.ls === null && c.room >= ROOM_OWN) && lu?.z === "-2.2σ" && lu.day === "23 Nov" && /^-\d\.\d\d%$/.test(lu.mv), l.cards.map((c) => [c.nm, c.z, c.day, c.mv]));
    // Two wider drawings (e2e/room.cjs). Every letter 2% of its size wider, in the page's own faces: that widens the
    // monospaced σ, day and change, which the forced monospace below draws as wide as the page does. Then the generic
    // monospace in every face's place: a phone's names and its toggle are set in a proportional face, far narrower.
    for (const [how, on] of [["every letter drawn 2% of its size wider", async () => { await widen(p); }], ["a wide font forced (the generic monospace)", async () => { await p.addStyleTag({ content: MONO }); await p.waitForTimeout(350); }]]) {
      await p.locator('#mk-sgpick [data-mode="last"]').tap(); await p.waitForTimeout(350); await on();
      const lw = await view(); await p.locator('#mk-sgpick [data-mode="today"]').tap(); await p.waitForTimeout(350); if (how.startsWith("every")) await widen(p);
      const tw = await view(), cw = tw.cards.find((c) => c.nm === "USD/JPY"), all = [...lw.cards, ...tw.cards];
      ck(`${how}: a card still ${tw.cards[0].w} x ${tw.cards[0].h} px, no name, σ, day or change cut under either reading (each keeps at least ${ROOM_WIDER} CSS px; the least ${tightest(all).room} px: ${tightest(all).nm}'s ${tightest(all).roomOf}); "last session" may lose letters, its figure "${cw?.ls?.f}" never (${cw?.ls?.room} px beyond it); the toggle's parts ${tw.seg.map((x) => `${x.w} x ${x.h}`).join(", ")}; no pill cut; nothing sideways`, all.every((c) => Math.abs(c.w - 144) < 0.5 && Math.abs(c.h - 76) < 0.5 && c.room >= ROOM_WIDER) && !!cw?.ls && cw.ls.room >= ROOM_WIDER && cw.ls.f === "-2.2σ" && tw.seg.every((x) => x.w >= 44 && x.h >= 44) && tw.lines.every((x) => x.room >= ROOM_WIDER) && tw.ox <= 0 && lw.ox <= 0, { cards: all.filter((c) => c.room < ROOM_WIDER), cw, lines: tw.lines.filter((x) => x.room < ROOM_WIDER) });
    }
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

  // The week's first hours (LS-3). The rule counted three hours from 17:00 New York on the date of the close the 1D is
  // measured from; on a Monday morning that close is Friday's, two days back, so no cell ever showed the line then. The
  // day before the one that begins at Sunday's bell is Friday's.
  console.log("\n[Mon 23 Nov 2026, 08:10 SGT: the week opened two hours ago, and the session before it is Friday's]");
  { const MONDAY = "2026-11-23T00:10:00Z", MONDAY9 = "2026-11-23T01:10:00Z";
    { const { ctx, p, errs } = await page(b, "C1", MONDAY);
      await go(p, MOCK, "#market", ".sgcell");
      const rows = await table(p), usd = rows.find((r) => r.symbol === "USDJPY=X"), s = await strip(p), cu = s.cells.find((c) => c.nm === "USD/JPY");
      ck(`C1: USD/JPY is live, its 1D runs from the close of ${usd.closeDates.d1} (Friday), and its cell under TODAY shows ${cu?.z} with "${cu?.ls}" under it; the line's tooltip names the closes of 19 Nov 2026 and 20 Nov 2026`, usd.live && usd.closeDates.d1 === "2026-11-20" && usd.ls.d === "2026-11-20" && !!cu && cu.z === "+2.7σ" && cu.ls === "last session -2.2σ" && cu.cg === null && /The change between the closes of 19 Nov 2026 and 20 Nov 2026 /.test(cu.lsTip ?? "") && s.cells.every((c) => c.room.least >= ROOM_OWN && !c.room.out), { usd: [usd.live, usd.closeDates.d1, usd.ls], cu });
      ck("no page errors", errs.length === 0, errs); await ctx.close(); }
    { const { ctx, p, errs } = await page(b, "P2", MONDAY);
      await go(p, MOCK, "#market", ".mp-sgcard");
      const c = await p.evaluate(() => [...document.querySelectorAll(".mp-sgcard")].map((x) => ({ nm: x.querySelector(".nm").textContent, z: x.querySelector(".z").textContent, ls: x.querySelector(".mv").classList.contains("ls"), f: x.querySelector(".mv .f")?.textContent ?? null })));
      const cu = c.find((x) => x.nm === "USD/JPY");
      ck(`P2: USD/JPY's card under Today reads ${cu?.z} and "last session ${cu?.f}"`, !!cu && cu.z === "+2.7σ" && cu.ls && cu.f === "-2.2σ", c);
      ck("no page errors", errs.length === 0, errs); await ctx.close(); }
    { const { ctx, p, errs } = await page(b, "C1", MONDAY9);
      await go(p, MOCK, "#market", ".sgcell");
      const s = await strip(p), cu = s.cells.find((c) => c.nm === "USD/JPY");
      ck(`C1 at 09:10 SGT, three hours and ten minutes after Sunday's 17:00 in New York: USD/JPY's cell shows its change and level again ("${cu?.cg}${cu?.lv}"), and no cell has the line`, !!cu && cu.ls === null && /^\+\d\.\d\d%$/.test(cu.cg ?? "") && s.cells.every((c) => c.ls === null) && errs.length === 0, s.cells.map((c) => [c.nm, c.ls]));
      await ctx.close(); }
  }

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
