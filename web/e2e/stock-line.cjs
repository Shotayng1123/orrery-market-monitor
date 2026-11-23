// A stock's line on its chart's head, whose name, sector and industry may be of any length (section [10] of
// source-lines.cjs until the check of fix part 4, 23 Nov 2026, moved here and widened; EQUITIES' heads, its section
// [9], are the suite source-lines-fit: each suite stays under three minutes). On the local copy (5179), six tabs
// (`om_paper` "0"); every page sets its clock (`om_mock_now`), so nothing here depends on the hour or the day. Lengths
// are CSS px of the page's own layout.
//   [10] a Tokyo stock's line: its memberships' credit on the line ("(Nikkei, JPX · personal use)", WD-6), and, for
//       real-world names, sectors and industries and for far longer ones, at the least window of each text size and the
//       windows where the credit made the line too long for its head (N1 of the check of fix part 4: "… · Yah…", at
//       worst "… (Nikkei, JPX · …"), in both letter placements: nothing of the line cut or drawn off its head; the
//       symbol, the memberships, their credit, "personal use" and Yahoo Finance always drawn whole in it; the industry
//       left out before the sector and the sector before the exchange; the whole line its tooltip, and a title cut only
//       where it is wider than its head's whole line, with the whole name as its own; in the scrolling layout and the
//       classic phone layout (where the computer's page is drawn on a touch screen) the credit adds at most one line
//       to the head; a US stock's line carries no credit; "personal use" opens Help at its paragraph
// It must pass as installed and GitHub's way (letters on whole px).
// Run from web/:  node e2e/run.cjs stock-line   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
const TOKYO_OPEN = "2026-11-24T02:00:00Z";   // Tue 24 Nov 10:00 SGT, Tokyo open
const DEJAVU = "*{font-family:'DejaVu Sans'!important}";
const label = (w, h, size) => `${w}x${h}${size !== "AUTO" ? ` ${size}` : ""}`;
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const frames = (p) => p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
// a face put in by the check comes with no font event (a page's own web face sends "loadingdone", on which the fit runs
// again): a resize, on which the fit runs too, has every source line fitted in the face now drawn
const face = async (p, css) => { if (!css) return; await p.addStyleTag({ content: css }); await p.evaluate(() => window.dispatchEvent(new Event("resize"))); await settle(p, 300); };


(async () => {
  const b = await chromium.launch();
  try {
    // N1 of the check of fix part 4: WD-6's credit made a Tokyo stock's line longer than its head at the least window of
    // each text size, for longer real names, and the head cut it with an ellipsis (the check read the local copy's short
    // name at two windows). The line now leaves out its descriptive parts first (Panel `auxDrop`): the industry, then the
    // sector, then the exchange, and only then takes the head's second line; the symbol, the memberships, their credit,
    // "personal use" and Yahoo Finance are never left out. Names, sectors and industries are put in with `om_mock_names`
    // (lib/mockStock.ts): real-world ones as their sources would give them, and far longer ones.
    console.log("\n[10] a Tokyo stock's line: its credit on the line, nothing of it cut, its sources never left out, whatever the length of its name, sector and industry (WD-6, N1)");
    {
      const X = (n, w) => w.repeat(Math.ceil(n / w.length)).slice(0, n).trim();
      const NAMES = [
        ["7203.T", "Toyota Motor Corporation", "Consumer Discretionary", "Auto Manufacturers"],
        ["8035.T", "Tokyo Electron Limited", "Information Technology", "Semiconductor Equipment & Materials"],
        ["6857.T", "Advantest Corporation", "Information Technology", "Semiconductor Equipment & Materials"],
        ["7974.T", "Nintendo Co., Ltd.", "Communication Services", "Electronic Gaming & Multimedia"],
        ["8766.T", "Tokio Marine Holdings, Inc.", "Financials", "Insurance - Property & Casualty"],
        ["6301.T", "Komatsu Ltd.", "Industrials", "Farm & Heavy Construction Machinery"],
        ["8306.T", "Mitsubishi UFJ Financial Group, Inc.", "Financials", "Banks - Diversified"],
        ["6501.T", "Hitachi, Ltd.", "Industrials", "Specialty Industrial Machinery"],
        ["4063.T", "Shin-Etsu Chemical Co., Ltd.", "Materials", "Specialty Chemicals"],
        ["9433.T", "KDDI Corporation", "Communication Services", "Telecom Services"],
        ["9501.T", "Tokyo Electric Power Company Holdings, Incorporated", "Utilities", "Utilities - Regulated Electric"],
        // far longer than any real one: the name; the sector and industry; all three; all three absurd
        ["9991.T", "Nippon Stand-in Holdings, a Registered Name Far Longer Than Any Listed Company's, Written Out", "Information Technology", "Semiconductor Equipment & Materials"],
        ["9992.T", "Tokyo Electron Limited", "A Stand-in Sector Whose Name Runs Far Longer Than Any GICS Sector's Name", "A Stand-in Industry Whose Name Runs Far Longer Than Any Industry a Source Gives It"],
        ["9993.T", "Nippon Stand-in Holdings, a Registered Name Far Longer Than Any Listed Company's, Written Out in Full for the Checks", "A Stand-in Sector Whose Name Runs Far Longer Than Any GICS Sector's", "A Stand-in Industry Whose Name Runs Far Longer Than Any Industry a Source Gives, for the Checks of the Line"],
        ["9994.T", X(400, "Absurdly Long Name "), X(300, "Absurd Sector "), X(300, "Absurd Industry ")],
      ];
      const names = Object.fromEntries(NAMES.map(([s, n, se, i]) => [s, [n, se, i]]));
      // the head as it was before the credit (dfd0970): the whole line, no part left out, and no credit
      const BEFORE = "#st-members-by{display:none!important}.phead .aux.src-fit [data-drop]{display:inline!important}";
      const opening = async (ctx, prefs, extra = {}) => { await ctx.addInitScript(([at, prefs, names, extra]) => { try { localStorage.setItem("om_mock_now", at); if (prefs) localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); localStorage.setItem("om_mock_names", JSON.stringify(names)); for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v); } catch {} }, [TOKYO_OPEN, prefs, names, extra]); };
      // the line as drawn: each of its parts (on view or left out), whether it lies whole inside the head, the form
      const line = (p) => p.evaluate(() => {
        const hd = document.querySelector(".panel[data-k='st-chart'] > .phead"), a = hd?.querySelector(":scope > .aux"), t = hd?.querySelector(":scope > .t");
        if (!hd || !a) return null;
        const R = (e) => e.getBoundingClientRect(), hr = R(hd), z = Number(document.body.style.zoom) || 1;
        const shown = (e) => { if (!e || !e.getClientRects().length) return false; for (let x = e; x && x !== a; x = x.parentElement) if (getComputedStyle(x).display === "none") return false; return true; };
        const inHead = (e) => { if (!shown(e)) return false; const rg = document.createRange(); rg.selectNodeContents(e); const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5); return rs.length > 0 && rs.every((r) => r.left >= hr.left - 0.5 && r.right <= hr.right + 0.5 && r.top >= hr.top - 0.5 && r.bottom <= hr.bottom + 0.5); };
        const long = a.querySelector(":scope > .src-long") ?? a, cs = getComputedStyle(a), lcs = getComputedStyle(long), rg = document.createRange(); rg.selectNodeContents(long);
        const need = rg.getBoundingClientRect().width, box = R(a).width - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * z;
        const parts = [...long.querySelectorAll(".sp")].map((e) => ({ text: e.textContent.replace(/\s+/g, " ").trim(), drop: e.closest("[data-drop]")?.dataset.drop ?? null, on: shown(e), whole: inHead(e) }));
        const by = document.querySelector("#st-members-by"), pu = by?.querySelector(".puse");
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45;
        return { term: document.body.classList.contains("term"), symbol: document.querySelector(".panel[data-k='st-chart'] .phead .aux .src-long > .sp")?.textContent ?? "", parts, by: by ? by.textContent.replace(/\s+/g, " ").trim() : null, byWhole: inHead(by), puWhole: pu ? inHead(pu) : null, tip: a.title, whole: (long.textContent ?? "").replace(/\s+/g, " ").trim(),
          cut: ((lcs.whiteSpace === "nowrap" || cs.whiteSpace === "nowrap") && !a.classList.contains("wrap") && need > box + 0.01) || a.scrollWidth > a.clientWidth + 0.5, form: ["d1", "d2", "d3"].find((c) => a.classList.contains(c)) ?? "whole", second: a.classList.contains("wrap"),
          titleCut: !!t && t.scrollWidth > t.clientWidth + 0.5, titleTip: t?.title ?? "", title: t?.textContent ?? "", headH: hr.height / z, line: lh, sideways: document.documentElement.scrollWidth - innerWidth,
          // a title may be cut only where it alone is wider than its head's whole line (beside the CSV button, where drawn)
          titleTooWide: !!t && t.clientWidth > 0 && (() => { const hs = getComputedStyle(hd), csv = hd.querySelector(":scope > .csvbtn"), cw = csv && csv.getClientRects().length ? R(csv).width + (parseFloat(hs.columnGap) || 0) * z : 0; return R(t).width * (t.scrollWidth / t.clientWidth) > hr.width - (parseFloat(hs.paddingLeft) + parseFloat(hs.paddingRight)) * z - cw + 0.5; })() };
      });
      // the rule, on one line as read: every part that may never go drawn whole in the head; the parts left out in order;
      // the whole line the tooltip; a title cut only where it alone is wider than its head's line, its tooltip whole
      const against = (r, sym, name) => {
        if (!r) return ["no line"];
        const w = [], keep = r.parts.filter((x) => x.drop === null), gone = r.parts.filter((x) => !x.on).map((x) => Number(x.drop));
        if (r.cut) w.push("cut");
        if (r.sideways > 0) w.push(`sideways ${r.sideways}`);
        for (const x of keep) if (!x.whole) w.push(`"${x.text}" not whole in its head`);
        if (r.by !== "(Nikkei, JPX · personal use)" || !r.byWhole || r.puWhole !== true) w.push(`credit ${JSON.stringify(r.by)} whole ${r.byWhole}, personal use ${r.puWhole}`);
        if (!keep.some((x) => x.text === "Yahoo Finance") || !keep.some((x) => x.text === sym) || !keep.some((x) => /^NK225, TOPIX$/.test(x.text))) w.push("a source part missing");
        for (const n of gone) if (r.parts.some((x) => x.drop !== null && Number(x.drop) < n && x.on)) w.push(`part ${n} left out before a lower one`);
        const unstar = (x) => x.replace(/^[☆★]\s*/, "");
        if (unstar(r.tip) !== unstar(r.whole) || !r.tip.includes(names[sym]?.[1] ?? "") || !r.tip.includes("Yahoo Finance")) w.push(`tooltip is not the whole line: "${r.tip}"`);
        if (r.titleCut && r.titleTip !== name.toUpperCase().trim() && r.titleTip !== name.trim()) w.push("title cut, tooltip not whole");
        if (r.titleCut && !r.titleTooWide) w.push("a title that fits its head's line cut");
        return w;
      };
      const WINDOWS = [[1179, 540, "AUTO"], [1114, 540, "S"], [1310, 560, "M"], [1507, 644, "L"], [1769, 756, "XL"], [1179, 800, "AUTO"], [1114, 800, "S"]];
      for (const [w, h, size, css] of [...WINDOWS.map((x) => [...x, ""]), [1179, 540, "AUTO", DEJAVU]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await opening(ctx, { size, compact: true, v: 2 });
        const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
        await p.goto(`${MOCK}#asset/7203.T`, { waitUntil: "networkidle" }); await p.waitForSelector(".panel[data-k='st-chart'] .phead .aux", { timeout: 20000 });
        await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); await face(p, css);
        const seen = [], bad = [];
        for (const [sym, name] of NAMES) {
          await p.evaluate((s) => { location.hash = `asset/${s}`; }, sym);
          await p.waitForFunction((s) => (document.querySelector(".panel[data-k='st-chart'] .phead .aux")?.textContent ?? "").includes(` ${s}`), sym, { timeout: 10000 }).catch(() => {});
          await frames(p); await p.waitForTimeout(60); await frames(p);
          const r = await line(p), why = against(r, sym, name);
          seen.push(`${sym} ${r?.form ?? "?"}${r?.second ? "+second line" : ""}${r?.titleCut ? " (title cut)" : ""}`);
          if (why.length) bad.push({ sym, why, r: r && { form: r.form, second: r.second, parts: r.parts.filter((x) => !x.whole).map((x) => x.text) } });
        }
        const forms = {}; for (const s of seen) { const f = s.split(" ")[1]; forms[f] = (forms[f] ?? 0) + 1; }
        ck(`${label(w, h, size)}${css ? " in DejaVu Sans" : ""}: ${NAMES.length} Tokyo stocks' lines (${Object.entries(forms).map(([f, n]) => `${f} ${n}`).join(", ")}): none cut or off its head; the symbol, "NK225, TOPIX", "(Nikkei, JPX · personal use)" and "Yahoo Finance" whole in every head; parts left out in order; the whole line the tooltip`, bad.length === 0 && errs.length === 0, { bad, seen, errs });
        await ctx.close();
      }

      // the local copy's own two stocks, in both computer layouts: the credit drawn, "personal use" opening Help; a US
      // stock's line without one; in the scrolling layout the credit adds at most one line to its head
      for (const [w, h, size, compact] of [[1440, 900, "AUTO", true], [1179, 800, "AUTO", true], [1440, 900, "AUTO", false], [1280, 720, "AUTO", false], [1024, 768, "AUTO", false]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await opening(ctx, { size, compact, v: 2 });
        const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
        const read = async (sym) => { await p.goto(`${MOCK}#asset/${sym}`, { waitUntil: "networkidle" }); await p.waitForSelector(".panel[data-k='st-chart'] .phead .aux", { timeout: 20000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p, 300); return line(p); };
        const us = await read("NVDA"), jp = await read("7203.T");
        const tip = await p.evaluate(() => document.querySelector("#st-members-by")?.getAttribute("title") ?? "");
        const without = await p.addStyleTag({ content: BEFORE }); await frames(p); await p.waitForTimeout(150);
        const bare = await line(p); await without.evaluate((e) => e.remove()); await frames(p); await p.waitForTimeout(150);
        if (await p.locator("#st-members-by .puse").count()) { await p.locator("#st-members-by .puse").click(); await p.waitForTimeout(350); }
        const helpAt = await p.evaluate(() => !!document.querySelector("#help-personal-use.at"));
        const added = jp && bare ? Math.round((jp.headH - bare.headH) * 10) / 10 : null;
        ck(`${label(w, h, size)} ${compact ? "one-screen" : "scrolling"}: 7203.T reads "${jp?.whole}", the credit "${jp?.by}" drawn whole in its head, "personal use" opening Help at its paragraph (${helpAt}); the credit adds ${added} px to the head (a line is ${jp ? Math.round(jp.line * 10) / 10 : "?"}); NVDA (S&P 500, Nasdaq-100: not Nikkei's or JPX's lists) carries none ("${us?.whole}")`,
          !!jp && jp.by === "(Nikkei, JPX · personal use)" && jp.byWhole && jp.puWhole === true && !jp.cut && helpAt && /Nikkei Inc\., its weights file/.test(tip) && /list of TSE-listed issues/.test(tip) && added !== null && added <= jp.line + 1 && !!us && us.by === null && !us.cut && errs.length === 0, { jp, us, helpAt, added, errs });
        await ctx.close();
      }

      // the classic phone layout (the computer's page on a phone, CLASSIC LAYOUT): a touch screen, where the credit is
      // why it is drawn (WD-6); it adds at most one line to the head (it added two, the check of fix part 4: 83 to 125 px)
      const heights = [];
      for (const [w, h] of [[390, 844], [375, 667], [360, 800]]) {
        const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await opening(ctx, null, { om_phone_v2: "0" });
        const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
        await p.goto(`${MOCK}#asset/7203.T`, { waitUntil: "networkidle" }); await p.waitForSelector(".panel[data-k='st-chart'] .phead .aux", { timeout: 20000 });
        await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p, 300);
        const jp = await line(p);
        const without = await p.addStyleTag({ content: BEFORE }); await frames(p); await p.waitForTimeout(150);
        const bare = await line(p); await without.evaluate((e) => e.remove());
        const added = jp && bare ? Math.round((jp.headH - bare.headH) * 10) / 10 : null;
        heights.push(`${w} px: ${jp ? Math.round(jp.headH) : "?"} px (${bare ? Math.round(bare.headH) : "?"} with the whole line and no credit)`);
        ck(`the classic phone layout at ${w} px: the credit "${jp?.by}" drawn whole in its head, "personal use" whole; the head ${jp ? Math.round(jp.headH) : "?"} px (${jp?.parts.filter((x) => !x.on).map((x) => x.text).join(", ") || "nothing"} left out), ${added} px more than the whole line without the credit (at most a line, ${jp ? Math.round(jp.line * 10) / 10 : "?"} px); no sideways scroll`,
          !!jp && jp.by === "(Nikkei, JPX · personal use)" && jp.byWhole && jp.puWhole === true && added !== null && added <= jp.line + 1 && jp.sideways <= 0 && errs.length === 0, { jp, bare, errs });
        await ctx.close();
      }
      console.log(`    the stock's head in the classic phone layout: ${heights.join("; ")}`);
    }
  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
