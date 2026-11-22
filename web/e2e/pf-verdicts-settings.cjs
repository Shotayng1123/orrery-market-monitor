// The paper book's Settings after the verdicts of round 3b (22 Nov 2026: D/verdict-r3b.md's "not yet" items and the
// PMs' answers on the rows C settled), on the local copy (5179), whose stand-in store keeps its books in this browser.
// Nothing here reads the machine's clock: every page sets `om_mock_now` (Sat 21 Nov 2026, 17:00 SGT unless named).
// A computer is 1440x900 (C1); a phone an iPhone SE (P1), an iPhone 13 (P2) or 360x800.
//   [1] RT-3 / EN-8 with EG-3 (the PMs' answers on R-53): the change form says what is pending under "In force now";
//       the value in force typed again says, muted, that the pending one is withdrawn, and saves with a reason; HISTORY
//       and ACTIVITY record a take-back as one; the value in force keeps its BY and SINCE after the would-be day
//   [2] UI-13: a form sheet keeps CANCEL and its action side by side in a foot that does not scroll, 12 px above the
//       window's foot, equal widths, in five states, at P1, P2 and 360x800, and with DejaVu Sans forced; the body's last
//       line reachable; RE-SET FOR NEXT YEAR's sheet the same
//   [3] UI-15: GO TO stays under the header while Settings scrolls and lights the section in view; a lit chip pressed
//       again brings its section back (the scrolling and the one-screen layout)
//   [4] EN-9 (the PMs' answers of 22 Nov): an equity book's change before Tokyo opens is in force for that day's
//       sessions, at once; the macro book's from the next day; on Tokyo's holiday, the New York session
//   [5] R-50 (PM B's answer): from 450 notes a line under the box says how many are left
// Run from web/:  node e2e/run.cjs pf-verdicts-settings   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2000)}`); };
const NOW = "2026-11-21T09:00:00Z";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13" };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DEJAVU = "*{font-family:'DejaVu Sans',sans-serif!important}";

async function open(b, { phone = null, clock = NOW, ls = {}, width, height, compact = false } = {}) {
  const dev = phone ? devices[PHONES[phone]] : null;
  const ctx = await b.newContext(dev ? { ...dev, deviceScaleFactor: 1, ...(width ? { viewport: { width, height: height ?? dev.viewport.height } } : {}) } : { viewport: { width: width ?? 1440, height: height ?? 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, more, cmp]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); if (cmp) localStorage.setItem("om_prefs", JSON.stringify({ size: "AUTO", compact: true, v: 2 })); for (const [k, v] of Object.entries(more)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {} }, [clock, ls, compact]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p, hash, sel) => { await p.goto(MOCK + "#" + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); };
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const flat = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, " ").trim() ?? null, sel);

(async () => {
  const b = await chromium.launch();
  try {
    console.log("\n[1] RT-3 / EN-8, EG-3: a pending change, said and taken back");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, `portfolio/${ID(1)}/settings/limits`, '[data-sec="limits"] tr[data-row="sector_net"] [data-act="change"]');
      await p.click('[data-sec="limits"] tr[data-row="sector_net"] [data-act="change"]'); await p.waitForSelector("#pf-change");
      const f0 = await p.evaluate(() => ({ now: document.querySelector("#pf-change .ln").innerText.replace(/\s+/g, " ").trim(), pend: document.querySelector("#pf-change-pending")?.innerText.replace(/\s+/g, " ").trim() ?? null }));
      await p.fill("#pf-change-value", "15"); await p.locator("#pf-change-value").blur(); await p.waitForTimeout(80);
      const same = await p.evaluate(() => ({ no: document.querySelector("#pf-change .pf-num .pf-no")?.textContent ?? null, save: document.querySelector("#pf-change-save").disabled }));
      await p.fill("#pf-change-value", "20"); await p.locator("#pf-change-value").blur(); await p.waitForTimeout(80);
      const back = await p.evaluate(() => ({ line: document.querySelector("#pf-change-back")?.textContent ?? null, muted: getComputedStyle(document.querySelector("#pf-change-back") ?? document.body).color, no: document.querySelector("#pf-change .pf-num .pf-no")?.textContent ?? null, save: document.querySelector("#pf-change-save").disabled }));
      await p.fill("#pf-change-reason", "results season over: back to the default"); await p.waitForTimeout(80);
      const can = await p.evaluate(() => !document.querySelector("#pf-change-save").disabled);
      await p.click("#pf-change-save"); await p.waitForFunction(() => !document.querySelector("#pf-change"), null, { timeout: 8000 }); await settle(p, 300);
      const row = await flat(p, '[data-sec="limits"] tr[data-row="sector_net"]');
      await p.click('[data-sec="limits"] [data-tab="history"]'); await p.waitForSelector('[data-sec="limits"] table.pf-hist');
      const hist = await p.evaluate(() => [...document.querySelectorAll('[data-sec="limits"] table.pf-hist tr[data-key="sector_net"]')].map((r) => ({ state: r.dataset.state ?? "", cells: [...r.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()) })));
      ck(`C1, Tokyo L/S › Sector, net › CHANGE: "${f0.now}", then "${f0.pend}"; the pending value typed again: "${same.no}"; the value in force typed again: "${back.line}" (muted), and with a reason SAVE CHANGE can be pressed`,
        f0.now === "In force now ±20% of capital · PM A · since Thu 1 Oct 2026" && f0.pend === "Pending ±15% of capital from Mon 23 Nov 2026, 06:00 SGT" && same.no === "this is the value already pending" && same.save
        && back.line === "back to the value in force: the pending ±15% is withdrawn" && back.no === null && back.save && can && errs.length === 0, { f0, same, back, can, errs });
      const tb = hist.find((h) => h.state === "taken back"), was = hist.find((h) => h.state === "pending" || /replaced before it was in force/.test(h.cells[4] ?? ""));
      ck(`saved: the row reads "${row.slice(0, 60)}…" with nothing pending; HISTORY's new row reads FROM ${tb?.cells[2]} TO ${tb?.cells[3]}, "${tb?.cells[4]}", and the pending one "${was?.cells[4]}"`,
        /^Sector, net ±20% of capital ±5–50%/.test(row) && !/pending/.test(row) && !!tb && tb.cells[2] === "±15%" && tb.cells[3] === "±20%" && tb.cells[4] === "back to the value in force: the pending ±15% taken back before it was in force" && tb.cells[5] === "results season over: back to the default"
        && !!was && was.cells[4] === "Mon 23 Nov 2026 · replaced before it was in force", { row, hist });
      // ACTIVITY, and LIMITS AS SET today and after the day the pending one would have come into force (EG-3)
      await go(p, `portfolio/${ID(1)}`, "#pf-activity");
      const act = await p.evaluate(() => [...document.querySelectorAll("#pf-activity .act")].map((r) => r.innerText.replace(/\s+/g, " ").trim()).find((t) => /taken back/.test(t)) ?? null);
      const asSet = await flat(p, '#pf-limits tr[data-row="sector_net"]');
      const kept = await p.evaluate(() => localStorage.getItem("om_mock_pf"));
      await ctx.close();
      const later = await open(b, { clock: "2026-11-24T09:00:00Z", ls: { om_mock_pf: kept } });
      await go(later.p, `portfolio/${ID(1)}`, "#pf-limits");
      const after = await flat(later.p, '#pf-limits tr[data-row="sector_net"]');
      ck(`ACTIVITY: "${act}"; LIMITS AS SET reads "${asSet}" today and "${after}" on Tue 24 Nov, after the would-be day: the value in force keeps its BY and SINCE`,
        /SETTING Sector, net ±15% → ±20% · back to the value in force: the pending ±15% taken back before it was in force · "results season over: back to the default"$/.test(act ?? "") && asSet === "Sector, net ±20% of capital PM A Thu 1 Oct 2026" && after === asSet && later.errs.length === 0, { act, asSet, after, errs: later.errs });
      await later.ctx.close();
    }
    {
      const { ctx, p, errs } = await open(b, { phone: "P2" });
      await go(p, `portfolio/${ID(1)}/settings/limits`, '[data-sec="limits"] button.pfp-set[data-row="sector_net"]');
      await p.locator('[data-sec="limits"] button.pfp-set[data-row="sector_net"]').tap(); await p.waitForSelector("#pf-change-sheet"); await settle(p, 300);
      const pend = await flat(p, "#pf-change-pending");
      await p.fill("#pf-change-value", "20"); await p.locator("#pf-change-value").blur(); await p.waitForTimeout(80);
      const line = await text(p, "#pf-change-back");
      ck(`P2, the change sheet: "${pend}" under "In force now", and "${line}" for the value in force typed again`, pend === "Pending ±15% of capital from Mon 23 Nov 2026, 06:00 SGT" && line === "back to the value in force: the pending ±15% is withdrawn" && errs.length === 0, { pend, line, errs });
      await ctx.close();
    }

    console.log("\n[2] UI-13: a form sheet's two buttons in a foot that does not scroll");
    const foot = (p, id) => p.evaluate((sid) => {
      const R = (e) => e.getBoundingClientRect(), sh = document.querySelector(sid), bs = [...sh.querySelectorAll(".sheet-foot button")].map((x) => R(x)), body = sh.querySelector(".sheet-body"), s = R(sh);
      const last = [...body.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.getClientRects().length).pop();
      body.scrollTop = body.scrollHeight; const lr = last ? R(last) : null, br = R(body), reach = !lr || (lr.bottom <= br.bottom + 1 && lr.top >= br.top - 1);
      body.scrollTop = 0;
      return { n: bs.length, side: bs.length === 2 && Math.abs(bs[0].top - bs[1].top) < 1 && bs[0].right <= bs[1].left, widths: bs.map((r) => +r.width.toFixed(1)), heights: bs.map((r) => Math.round(r.height)), gap: bs.map((r) => +(innerHeight - r.bottom).toFixed(1)), inSheet: bs.every((r) => r.top >= s.top && r.bottom <= s.bottom + 0.5 && r.left >= s.left && r.right <= s.right + 0.5), reach, vh: innerHeight };
    }, id);
    const footOk = (m) => m.n === 2 && m.side && Math.abs(m.widths[0] - m.widths[1]) <= 0.5 && m.heights.every((h) => h === 52) && m.gap.every((g) => g >= 12 - 0.5) && m.inSheet && m.reach;
    for (const [code, w, h, font] of [["P1"], ["P2"], ["P2", 360, 800], ["P1", undefined, undefined, "dejavu"], ["P2", 360, 800, "dejavu"]]) {
      const { ctx, p, errs } = await open(b, { phone: code, width: w, height: h });
      await go(p, `portfolio/${ID(1)}/settings/limits`, '[data-sec="limits"] button.pfp-set[data-row="one_long"]');
      if (font) { await p.addStyleTag({ content: DEJAVU }); await settle(p, 200); }
      await p.locator('[data-sec="limits"] button.pfp-set[data-row="one_long"]').tap(); await p.waitForSelector("#pf-change-sheet"); await settle(p, 300);
      const states = {};
      states.opened = await foot(p, "#pf-change-sheet");
      await p.locator("#pf-change-reason").focus(); await p.locator("#pf-change-reason").blur(); await p.waitForTimeout(80); states.reason = await foot(p, "#pf-change-sheet");
      await p.fill("#pf-change-value", "99"); await p.locator("#pf-change-value").blur(); await p.waitForTimeout(80); states.refused = await foot(p, "#pf-change-sheet");
      await p.fill("#pf-change-value", "8"); await p.fill("#pf-change-reason", "x".repeat(520)); await p.locator("#pf-change-reason").blur(); await p.waitForTimeout(80); states.long = await foot(p, "#pf-change-sheet");
      await p.fill("#pf-change-reason", "tighter into results season"); await p.evaluate(() => localStorage.setItem("om_mock_pf_refuse", "1")); await p.locator("#pf-change-save").tap(); await p.waitForSelector("#pf-change .pf-msg"); states.server = await foot(p, "#pf-change-sheet");
      await p.evaluate(() => localStorage.removeItem("om_mock_pf_refuse"));
      const bad = Object.entries(states).filter(([, m]) => !footOk(m)).map(([k]) => k);
      ck(`${PHONES[code]}${w ? ` ${w}x${h}` : ""}${font ? ", DejaVu Sans forced" : ""}: as opened, with the reason's sentence, a refused value, a 520-character reason and the server's refusal, CANCEL and Save change stand side by side (${states.opened.widths.join(" and ")} px), 52 px, ${Math.min(...Object.values(states).flatMap((m) => m.gap))} px or more above the window's foot, inside the sheet; the body's last line can be scrolled to`, bad.length === 0 && errs.length === 0, { bad, states, errs });
      await ctx.close();
    }
    {
      // RE-SET FOR NEXT YEAR on a phone, in the window (15 Dec)
      const { ctx, p, errs } = await open(b, { phone: "P1", clock: "2026-12-15T02:00:00Z" });
      await go(p, `portfolio/${ID(1)}/settings/targets`, "#pf-reset");
      await p.locator("#pf-reset").tap(); await p.waitForSelector("#pf-reset-sheet"); await settle(p, 300);
      const m = await foot(p, "#pf-reset-sheet"), names = await p.evaluate(() => [...document.querySelectorAll("#pf-reset-sheet .sheet-foot button")].map((x) => x.textContent));
      ck(`iPhone SE (3rd gen): RE-SET FOR NEXT YEAR is a sheet whose foot holds ${names.join(" and ")} side by side (${m.widths.join(" and ")} px), ${Math.min(...m.gap)} px above the window's foot`, footOk(m) && names.join() === "Cancel,Save" && errs.length === 0, { m, names, errs });
      await ctx.close();
    }

    console.log("\n[3] UI-15: GO TO stays under the header and lights the section in view");
    for (const compact of [false, true]) {
      const { ctx, p, errs } = await open(b, { compact });
      await go(p, `portfolio/${ID(1)}/settings`, "#pf-goto");
      const look = () => p.evaluate(() => {
        const z = Number(document.body.style.zoom) || 1, g = document.querySelector("#pf-goto").getBoundingClientRect(), top = document.querySelector("#topbar").getBoundingClientRect(), line = g.bottom + 8;
        const secs = [...document.querySelectorAll("#pf-settings [data-sec]")].map((s) => ({ k: s.dataset.sec, r: s.getBoundingClientRect() })), cross = secs.filter((x) => x.r.top <= line && x.r.bottom > line).map((x) => x.k);
        // where the line falls between two sections (the grid's gap), the section in view is the next one under it
        const next = secs.find((x) => x.r.bottom > line)?.k ?? null;
        const sc = [...document.querySelectorAll("*")].find((e) => { const o = getComputedStyle(e).overflowY; return (o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 4 && e.contains(document.querySelector("#pf-goto")); }) ?? document.scrollingElement;
        return { on: document.querySelector("#pf-goto a.on")?.textContent ?? null, ons: document.querySelectorAll("#pf-goto a.on").length, under: Math.round((g.top - top.bottom) / z), stuck: getComputedStyle(document.querySelector("#pf-goto")).position, cross, next, y: Math.round(sc.scrollTop), end: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, opaque: getComputedStyle(document.querySelector("#pf-goto")).backgroundColor };
      });
      const scrollBy = (dy) => p.evaluate((d) => { const sc = [...document.querySelectorAll("*")].find((e) => { const o = getComputedStyle(e).overflowY; return (o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 4 && e.contains(document.querySelector("#pf-goto")); }) ?? document.scrollingElement; sc.scrollTop += d; }, dy);
      const s0 = await look();
      await scrollBy(600); await settle(p, 300); const s1 = await look();
      await scrollBy(5000); await settle(p, 300); const s2 = await look();
      await p.click('#pf-goto a[href$="/settings/targets"]'); await settle(p, 500); const s3 = await look();
      await scrollBy(600); await settle(p, 300); const s4 = await look();
      await p.click('#pf-goto a[href$="/settings/targets"]'); await settle(p, 500); const s5 = await look();
      const upper = (k) => k.toUpperCase(), inView = (s) => (s.cross.length ? s.cross.map(upper).includes(s.on) : upper(s.next ?? "") === s.on);
      ck(`${compact ? "the one-screen layout" : "C1"}: GO TO is sticky (${s0.stuck}), opaque, and stays ${s1.under} px under the header while Settings scrolls; one chip lit at a time, the section in view: ${s0.on} at the top, ${s1.on} ${s1.y} px down, ${s2.on} at the page's end; TARGETS pressed: ${s3.on}; pressed again after scrolling away (to ${s4.on}), its section comes back (${s5.y} px, ${s5.on})`,
        s0.stuck === "sticky" && !/rgba\(0, 0, 0, 0\)|transparent/.test(s0.opaque) && [s0, s1, s2, s3, s4, s5].every((s) => s.ons === 1) && s0.on === "PORTFOLIO" && s1.under >= 0 && s1.under <= 12 && s2.under >= 0 && s2.under <= 12
        && !s1.end && inView(s1) && s1.on !== s0.on && s2.end && s2.on === "STATEMENT" && s3.on === "TARGETS" && !s4.end && s4.on !== "TARGETS" && inView(s4) && s5.on === "TARGETS" && Math.abs(s5.y - s3.y) <= 4 && errs.length === 0, { s0, s1, s2, s3, s4, s5, errs });
      await ctx.close();
    }

    console.log("\n[4] EN-9: the session a change is in force from, by the book's start");
    for (const [clock, book, want, label] of [
      ["2026-11-23T23:30:00Z", 1, "In force for Tue 24 Nov 2026's sessions (Tokyo opens 08:00 SGT)", "Tue 24 Nov 07:30 SGT, the Japan book"],
      ["2026-11-23T23:30:00Z", 3, "In force from Wed 25 Nov 2026, 06:00 SGT", "Tue 24 Nov 07:30 SGT, the macro book"],
      ["2026-11-24T02:00:00Z", 1, "In force from Wed 25 Nov 2026, 06:00 SGT", "Tue 24 Nov 10:00 SGT, Tokyo in session, the Japan book"],
      ["2026-11-23T02:00:00Z", 2, "In force for Mon 23 Nov 2026's sessions (New York opens 22:30 SGT)", "Mon 23 Nov 10:00 SGT, Tokyo's holiday, the Global book"],
    ]) {
      const { ctx, p, errs } = await open(b, { clock });
      await go(p, `portfolio/${ID(book)}/settings/limits`, '[data-sec="limits"] tr[data-row="one_long"] [data-act="change"]');
      await p.click('[data-sec="limits"] tr[data-row="one_long"] [data-act="change"]'); await p.waitForSelector("#pf-change-when"); await settle(p, 200);
      const when = await text(p, "#pf-change-when");
      let saved = null;
      if (book === 1 && /07:30/.test(label)) {
        await p.fill("#pf-change-value", "8"); await p.fill("#pf-change-reason", "before the Tokyo open, trimmed"); await p.waitForTimeout(80); await p.click("#pf-change-save");
        await p.waitForFunction(() => !document.querySelector("#pf-change"), null, { timeout: 8000 }); await settle(p, 300);
        const row = await flat(p, '[data-sec="limits"] tr[data-row="one_long"]');
        await go(p, `portfolio/${ID(1)}`, "#pf-activity");
        saved = { row, act: await p.evaluate(() => document.querySelector("#pf-activity .act")?.innerText.replace(/\s+/g, " ").trim() ?? null) };
      }
      ck(`${label}: "${when}"${saved ? `; saved, the row is in force at once ("${saved.row.slice(0, 26)} … ${saved.row.slice(-27)}") and ACTIVITY reads "${saved.act}"` : ""}`, when === want && (!saved || (/^One name, long 8% of capital .* you Tue 24 Nov 2026 CHANGE$/.test(saved.row) && !/pending/.test(saved.row) && /^07:30 SETTING One name, long 10% → 8% · in force for Tue 24 Nov 2026's sessions · "before the Tokyo open, trimmed"$/.test(saved.act ?? ""))) && errs.length === 0, { when, saved, errs });
      await ctx.close();
    }

    console.log("\n[5] R-50: from 450 notes a line says how many are left");
    {
      const { ctx, p, errs } = await open(b);
      await go(p, `portfolio/${ID(1)}`, "#pf-notes");
      const none = await text(p, "#pf-notes-left");
      await p.evaluate(() => { const st = JSON.parse(localStorage.getItem("om_mock_pf")), bk = st.books.find((x) => x.name === "Tokyo L/S"); let id = bk.notes.reduce((m, n) => Math.max(m, n.id), 0); while (bk.notes.length < 450) bk.notes.push({ id: ++id, at: "2026-11-20T01:00:00Z", body: `note ${id}`, removedAt: null }); localStorage.setItem("om_mock_pf", JSON.stringify(st)); });
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#pf-notes-left", { timeout: 15000 }); await settle(p);
      const at450 = await text(p, "#pf-notes-left");
      ck(`with 4 notes no line ("${none}"); with 450 (a removed one counted) "${at450}"`, none === null && at450 === "50 notes left: every note is kept" && errs.length === 0, { none, at450, errs });
      await ctx.close();
    }
  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
