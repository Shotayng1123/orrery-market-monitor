// Source lines: drawn whole or in their short form, never cut; "personal use" whole, on a computer and a phone, and in
// FULL; JPX's holiday calendar named with "(personal use)"; no source named that is not read (round 3b, 22 Nov 2026:
// UI-2 and LV-1 to LV-5 of the second review of P-1, by the designer's B.0.3 and B.1).
// On the local copy (5179), six tabs (`om_paper` "0", the page as published). Every page sets its clock
// (`om_mock_now`), so nothing here depends on the hour or the day. Lengths are CSS px of the page's own layout.
//   [1] the one-screen layout at 1170x800, 1280x720, 1440x900, 1920x1080 (AUTO), 1105x800 (S) and 1495x900 (L), on
//       EQUITIES with the Nikkei 225 and TOPIX, RATES & FX, WATCHLIST and a Tokyo stock's News screen: no panel head's
//       source line has its drawn text (a range over it) wider than its own box, none scrolls; a "personal use" that is
//       drawn lies wholly inside its head; a line in its short form has the whole line as its tooltip; EQUITIES'
//       SHORT INTEREST reads "JPX · personal use" with at least 145 px to spare (twice the largest difference the
//       designer measured between the two letter placements)
//   [2] the same with DejaVu Sans forced (a wider face) at 1170x800 and 1440x900
//   [3] 1440x900 resized to 1170x800 and back, with no reload: never cut at any step; FLOW BY SECTOR's line takes the
//       head's second line and comes back beside its title
//   [4] the short form's "personal use" opens Help at its paragraph, as the whole line's does
//   [5] a phone at 360, 375 and 390 px: the dot keeps a space on each side ("JPX · personal use", the distance from the
//       dot to "personal" a space ±0.5 px); no heading's title on two lines; every source line inside its heading
//   [6] FULL: "personal use" opens Help over the page, scrolled to its paragraph
//   [7] Tokyo's holiday (Mon 23 Nov 2026): every text that names JPX's calendar says "(personal use)" right after it
//   [8] TOPIX's PROXY badges name what the prices are (Yahoo Finance's), not an official close nobody reads
// It must pass as installed and GitHub's way (letters on whole px).
// Run from web/:  node e2e/run.cjs source-lines   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
const MORNING = "2026-11-23T23:10:00Z", HOLIDAY = "2026-11-23T02:00:00Z";
const DEJAVU = "*{font-family:'DejaVu Sans'!important}";
const WINDOWS = [[1170, 800, "AUTO"], [1280, 720, "AUTO"], [1440, 900, "AUTO"], [1920, 1080, "AUTO"], [1105, 800, "S"], [1495, 900, "L"]];
const PAGES = [["equities", ".panel[data-k='eq-short'] .phead .aux"], ["equities/topix", ".panel[data-k='eq-short'] .phead .aux"], ["rates", ".panel[data-k='curve'] .phead .aux"], ["watch", ".panel[data-k='wl-earn'] .phead .aux"], ["asset/7203.T", "#st-short-src", "SHORT INTEREST"]];
const SPARE = 145;

async function open(b, { vw, vh, size = "AUTO", compact = true, clock = MORNING }) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, prefs]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); } catch {} }, [clock, { size, compact, v: 2 }]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
async function go(p, hash, sel, chip, face = "") {
  await p.goto(`${MOCK}#${hash}`, { waitUntil: "networkidle" }); await p.waitForSelector(chip ? "#scrbar .chip-sm" : sel, { timeout: 20000 });
  await p.addStyleTag({ content: "#mockbar{display:none!important}" + face }); await settle(p);
  // a stock's SHORT INTEREST is on its News screen in the one-screen layout: GO TO › SHORT INTEREST
  if (chip) { await p.locator("#scrbar .chip-sm").filter({ hasText: new RegExp(`^${chip}$`, "i") }).first().click(); await p.waitForSelector(sel, { timeout: 10000 }); await settle(p, 300); }
}

// Every source line in a panel head: its drawn text (a range over the form that shows) against its own content box,
// scrolling, the "personal use" that shows against the head's box, and the tooltip of a line in its short form.
const audit = (p) => p.evaluate(() => {
  const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), px = (x) => Math.round((x / z) * 10) / 10;
  return [...document.querySelectorAll(".phead .aux")].filter((a) => a.getClientRects().length && a.textContent.trim()).map((a) => {
    const head = a.closest(".phead"), t = head.querySelector(".t"), vis = [...a.querySelectorAll(":scope > .src-long, :scope > .src-short")].find((e) => getComputedStyle(e).display !== "none") ?? a;
    const rg = document.createRange(); rg.selectNodeContents(vis); const cs = getComputedStyle(a), box = R(a).width - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * z, need = rg.getBoundingClientRect().width;
    const pu = [...vis.querySelectorAll(".puse")].find((e) => e.getClientRects().length) ?? null, hr = R(head), ar = R(a);
    const puIn = pu ? (() => { const r = R(pu); return r.left >= Math.max(hr.left, ar.left) - 0.5 && r.right <= Math.min(hr.right, ar.right) + 0.5 && r.top >= hr.top - 0.5 && r.bottom <= hr.bottom + 0.5; })() : null;
    const long = a.querySelector(":scope > .src-long"), short = a.classList.contains("short");
    return { panel: t ? t.textContent.trim() : "?", k: head.parentElement?.dataset.k ?? "", text: vis.textContent.replace(/\s+/g, " ").trim(), need: px(need), box: px(box), spare: px(box - need), over: need > box + 0.01, scrolls: a.scrollWidth > a.clientWidth, pu: !!pu, puIn, short, wrap: a.classList.contains("wrap"), tipWhole: !short || (!!long && a.title === long.textContent.replace(/\s+/g, " ").trim()), headH: px(hr.height) };
  });
});
const bad = (rows) => rows.filter((r) => r.over || r.scrolls || r.puIn === false || !r.tipWhole);
const label = (w, h, size) => `${w}x${h}${size !== "AUTO" ? ` ${size}` : ""}`;

(async () => {
  const b = await chromium.launch();
  try {
    console.log("\n[1] the one-screen layout: every source line whole or in its short form, never cut");
    for (const [w, h, size] of WINDOWS) {
      const { ctx, p, errs } = await open(b, { vw: w, vh: h, size });
      const all = [], short = [];
      for (const [hash, sel, chip] of PAGES) { await go(p, hash, sel, chip); const rows = await audit(p); all.push(...rows.map((r) => ({ ...r, page: hash }))); }
      const term = await p.evaluate(() => document.body.classList.contains("term"));
      for (const hash of ["equities", "equities/topix"]) { const r = all.find((x) => x.page === hash && x.k === "eq-short"); short.push(r); }
      const badRows = bad(all);
      ck(`${label(w, h, size)}: ${all.length} source lines on the five screens, none cut, none wider than its box, every "personal use" drawn inside its head, every short form with the whole line as its tooltip (${all.filter((r) => r.short).length} in their short form, ${all.filter((r) => r.wrap).length} of them on the head's second line)`, term && all.length >= 20 && badRows.length === 0 && errs.length === 0, { term, badRows, errs });
      ck(`${label(w, h, size)}: EQUITIES' SHORT INTEREST (Nikkei 225, TOPIX) reads "${short[0]?.text}" with ${short.map((r) => r?.spare).join(" and ")} px to spare (at least ${SPARE}), "personal use" whole in its head`, short.every((r) => r && r.text === "JPX · personal use" && r.short && r.spare >= SPARE && r.puIn === true), short);
      await ctx.close();
    }

    console.log("\n[2] a wider face: DejaVu Sans forced");
    for (const [w, h] of [[1170, 800], [1440, 900]]) {
      const { ctx, p, errs } = await open(b, { vw: w, vh: h });
      const all = [];
      for (const [hash, sel, chip] of PAGES) { await go(p, hash, sel, chip, DEJAVU); all.push(...(await audit(p)).map((r) => ({ ...r, page: hash }))); }
      const badRows = bad(all), sh = all.filter((r) => r.k === "eq-short");
      ck(`${w}x${h} in DejaVu Sans: ${all.length} source lines, none cut or wider than its box; SHORT INTEREST "${sh[0]?.text}" with ${sh.map((r) => r.spare).join(" and ")} px to spare`, all.length >= 20 && badRows.length === 0 && sh.length === 2 && sh.every((r) => r.spare >= SPARE && r.puIn) && errs.length === 0, { badRows, sh, errs });
      await ctx.close();
    }

    console.log("\n[3] a window resized with no reload: the line follows its head's width");
    {
      const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900 });
      await go(p, "equities", ".panel[data-k='eq-flow'] .phead .aux");
      const step = async (w, h) => { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(450); const rows = await audit(p); return { rows, flow: rows.find((r) => r.k === "eq-flow") }; };
      const a = await step(1440, 900), c = await step(1170, 800), d = await step(1440, 900);
      ck(`1440x900 → 1170x800 → 1440x900: never cut (${[a, c, d].map((s) => bad(s.rows).length).join(", ")} cut); FLOW BY SECTOR "${c.flow?.text}" ${c.flow?.wrap ? "on the head's second line" : "beside its title"} at 1170x800, then ${d.flow?.wrap ? "still on the second line" : d.flow?.short ? "short beside its title" : "whole beside its title"} at 1440x900`,
        [a, c, d].every((s) => bad(s.rows).length === 0) && !!c.flow && c.flow.wrap && !!d.flow && !d.flow.wrap && !!a.flow && !a.flow.wrap && errs.length === 0, { a: a.flow, c: c.flow, d: d.flow, cut: [a, c, d].map((s) => bad(s.rows)), errs });
      await ctx.close();
    }

    console.log("\n[4] the short form's \"personal use\" opens Help at its paragraph");
    {
      const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900 });
      await go(p, "equities/topix", ".panel[data-k='eq-short'] .phead .aux");
      const shown = p.locator(".panel[data-k='eq-short'] .phead .aux .src-short .puse");
      const before = await shown.isVisible();
      await shown.click(); await p.waitForSelector("#help-personal-use", { timeout: 5000 }); await p.waitForTimeout(250);
      const h = await p.evaluate(() => { const row = document.querySelector("#help-personal-use"), box = document.querySelector(".helpbody").getBoundingClientRect(), r = row.getBoundingClientRect(); return { at: row.classList.contains("at"), inView: r.top >= box.top - 1 && r.bottom <= box.bottom + 1 }; });
      ck(`SHORT INTEREST's short line: "personal use" can be pressed (${before ? "drawn" : "not drawn"}) and Help opens with its paragraph outlined and in view`, before && h.at && h.inView && errs.length === 0, { before, h, errs });
      await ctx.close();
    }

    console.log("\n[5] a phone: \"· personal use\" with a space on each side of the dot; titles on one line");
    for (const [w, h] of [[360, 800], [375, 667], [390, 664]]) {
      const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await ctx.addInitScript(([at]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); } catch {} }, [MORNING]);
      const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      const rows = [];
      for (const hash of ["equities", "equities/topix", "asset/7203.T"]) {
        await p.goto(`${MOCK}#${hash}`, { waitUntil: "networkidle" }); await p.waitForSelector(".psrc", { timeout: 20000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p, 300);
        rows.push(...(await p.evaluate(() => [...document.querySelectorAll(".psrc")].filter((x) => x.getClientRects().length).map((x) => {
          const R = (e) => e.getBoundingClientRect(), h2 = x.closest("h2"), title = h2.querySelector(":scope > span:first-child"), pu = x.querySelector(".pu");
          // the dot: the last "·" of the line's own text, outside "personal use"
          let dot = null; const tw = document.createTreeWalker(x, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) { const i = n.nodeValue.lastIndexOf("·"); if (i >= 0 && !pu.contains(n)) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); dot = r.getBoundingClientRect(); } }
          if (!dot) return { section: title.textContent, line: x.textContent, gap: null, space: null, titleLines: 0, inside: false, h2H: 0 };
          const sp = document.createElement("span"); sp.textContent = " "; sp.style.whiteSpace = "pre"; x.appendChild(sp); const space = R(sp).width; sp.remove();
          const tr = document.createRange(); tr.selectNodeContents(title); const lines = tr.getClientRects().length; const lh = parseFloat(getComputedStyle(title).lineHeight) || 16;
          const hr = R(h2), br = R(x);
          return { section: title.textContent, line: x.textContent, gap: Math.round((R(pu).left - dot.right) * 10) / 10, space: Math.round(space * 10) / 10, titleLines: Math.round(R(title).height / lh) <= 1 && lines <= 1 ? 1 : 2, inside: br.left >= hr.left - 0.5 && br.right <= hr.right + 0.5 && br.top >= hr.top - 0.5 && br.bottom <= hr.bottom + 0.5, h2H: Math.round(hr.height) };
        }))).map((r) => ({ ...r, page: hash })));
      }
      const off = rows.filter((r) => Math.abs(r.gap - r.space) > 0.5 || r.titleLines !== 1 || !r.inside || !/ · personal use$/.test(r.line));
      ck(`${w} px: ${rows.length} source lines (${[...new Set(rows.map((r) => `"${r.line}"`))].join(", ")}), the dot then a space (${[...new Set(rows.map((r) => `${r.gap} of ${r.space} px`))].join(", ")}), every title on one line, every line inside its heading (headings ${[...new Set(rows.map((r) => r.h2H))].join(" or ")} px)`, rows.length >= 5 && off.length === 0 && errs.length === 0, { off, errs });
      await ctx.close();
    }

    console.log("\n[6] FULL: \"personal use\" opens Help over the page, at its paragraph");
    {
      const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900 });
      await go(p, "equities/topix", "#eq-members-src");
      await p.click("#more-btn"); await p.waitForTimeout(60); await p.click("#fs-ctl");   // FULL is in the one-screen header's menu (≡)
      await p.waitForFunction(() => document.body.classList.contains("full"), null, { timeout: 5000 }).catch(() => {});
      const full = await p.evaluate(() => ({ full: document.body.classList.contains("full"), header: getComputedStyle(document.querySelector("#topbar")).display }));
      await p.locator("#eq-members-src .puse").click(); await p.waitForTimeout(400);
      const h = await p.evaluate(() => { const box = document.querySelector(".helpbox"), row = document.querySelector("#help-personal-use"); if (!box || !row) return null; const b = box.getBoundingClientRect(), body = document.querySelector(".helpbody").getBoundingClientRect(), r = row.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), onScreen: b.width > 100 && b.height > 100 && b.top >= 0 && b.bottom <= innerHeight + 1, rowIn: r.top >= body.top - 1 && r.bottom <= body.bottom + 1, at: row.classList.contains("at") }; });
      ck(`FULL on (the header ${full.header === "none" ? "hidden" : "drawn"}): SCREENER's "personal use" opens Help on screen (${h ? `${h.w}x${h.h} px` : "nothing"}), its paragraph outlined and in view`, full.full && full.header === "none" && !!h && h.onScreen && h.rowIn && h.at && errs.length === 0, { full, h, errs });
      await ctx.close();
    }

    console.log("\n[7] Tokyo's holiday: JPX's calendar is named with \"(personal use)\"");
    {
      const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900, compact: false, clock: HOLIDAY });
      await p.goto(`${MOCK}#market`, { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt"); await settle(p, 400);
      const texts = async () => p.evaluate(() => { const out = []; for (const e of document.querySelectorAll("*")) { const t = e.getAttribute("title"); if (t && /JPX's calendar|calendar \(JPX/.test(t)) out.push(t); } const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/JPX's calendar/.test(n.nodeValue)) out.push(n.nodeValue); return out; });
      const market = await texts();
      await p.locator("#help-ctl").click(); await p.waitForSelector(".helpbox"); const help = await p.evaluate(() => [...document.querySelectorAll(".helpbox dd")].map((d) => d.textContent).filter((t) => /JPX's calendar/.test(t)));
      await ctx.close();
      const ph = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
      await ph.addInitScript(([at]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); } catch {} }, [HOLIDAY]);
      const pp = await ph.newPage(); await pp.goto(`${MOCK}#market`, { waitUntil: "networkidle" }); await pp.waitForSelector(".mp-sec"); await settle(pp, 400);
      const row = pp.locator(".mp-row, .mrow, [data-sym]").filter({ hasText: /Nikkei 225/ }).first();
      if (await row.count()) { await row.click().catch(() => {}); await pp.waitForTimeout(400); }
      const phone = await pp.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/JPX's calendar/.test(n.nodeValue)) out.push(n.nodeValue); return out; });
      await ph.close();
      const all = [...market, ...help, ...phone], missing = all.filter((t) => [...t.matchAll(/JPX's calendar(?! \(personal use\))/g)].length > 0);
      ck(`${all.length} texts name JPX's calendar (${market.length} on MARKETS' tooltips, ${help.length} in Help, ${phone.length} in a phone's opened Nikkei 225 row), each followed by "(personal use)"`, market.length > 0 && help.length > 0 && missing.length === 0 && errs.length === 0, { missing, help, phone, errs });
    }

    console.log("\n[8] TOPIX's PROXY: what its prices are, and no source that is not read");
    {
      const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900, compact: false });
      await go(p, "equities/topix", ".panel[data-k='eq-index'] .phead .badge.proxy");
      const eq = await p.locator(".panel[data-k='eq-index'] .phead .badge.proxy").getAttribute("title");
      await p.goto(`${MOCK}#market`, { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt"); await settle(p);
      const mk = await p.evaluate(() => [...document.querySelectorAll("table.mkt .badge.proxy, table.mkt [title]")].map((e) => e.getAttribute("title")).filter((t) => t && /stands in for/.test(t)));
      ck(`EQUITIES: "${eq}"; MARKETS: "${mk[0]}": Yahoo Finance's prices, and no "official" close`, /Yahoo Finance's/.test(eq ?? "") && !/official/i.test(eq ?? "") && mk.length > 0 && mk.every((t) => /Yahoo Finance's/.test(t) && !/official/i.test(t)) && errs.length === 0, { eq, mk, errs });
      await ctx.close();
    }
  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
