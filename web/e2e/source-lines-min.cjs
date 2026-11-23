// EQUITIES' minimal forms in the one-screen layout keep what every short form keeps (section [9b], batch 7a, 23 Nov 2026:
// N5-3 of the check of fix part 5 and the designer's verdict on it; source-lines-fit holds [9], which this suite would
// have pushed past three minutes). On the local copy (5179), six tabs (`om_paper` "0"); every page sets its clock
// (`om_mock_now`) and, for a weekend, the flow's turnover time (`om_mock_flow`, lib/mock.ts), so nothing here depends on
// the hour or the day. Lengths are CSS px of the page's own layout.
//   [9b] at the least window of every text size (1179x540, 1114x540 S, 1310x560 M, 1507x644 L, 1769x756 XL) and once in
//        DejaVu Sans, KOSPI, NASDAQ COMP and SHANGHAI COMP (their names a STAND-IN), in session and on a weekend whose
//        turnover time carries its day (the longest state): FLOW BY SECTOR's form holds the panel's currency; every
//        statistics head whose panel draws the 1W to 12M columns holds their close; no head on a second line, none cut;
//        a badge's word apart from its neighbours in every head's tooltip; the INTRADAY badge that leads its text apart
//        from the word after it; a net flow read in another pull than the turnover keeps its date
// It must pass as installed and GitHub's way (letters on whole px).
// Run from web/:  node e2e/run.cjs source-lines-min   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
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
    // N5-3 of the check of fix part 5 and the designer's verdict on it: the minimal form left out what every short form
    // keeps (the designer's B.0.3): FLOW BY SECTOR's unit, the panel's currency, whose cells are bare ("212bn"), and the
    // longer periods' close on the heads whose panels draw the 1W to 12M columns. At the least window of every text
    // size, in session and on a weekend whose turnover time carries its day (the longest state: om_mock_flow), once in
    // a wide face: FLOW's form holds its currency, every statistics head that draws longer periods holds their close,
    // no head takes a second line and none is cut; each head's tooltip has a badge's word apart from its neighbours,
    // and the INTRADAY badge that leads its text does not touch the word after it. A net flow read in another pull than
    // the turnover keeps its date (no time dates it), on a second line if it must, never cut.
    console.log("\n[9b] EQUITIES' minimal forms keep the unit and every date of the figures drawn; badges apart from the words beside them");
    {
      const LEAST = [[1179, 540, "AUTO", ""], [1114, 540, "S", ""], [1310, 560, "M", ""], [1507, 644, "L", ""], [1769, 756, "XL", ""], [1179, 540, "AUTO", DEJAVU]];
      const SESSION = "2026-11-24T02:12:00Z", WEEKEND = "2026-11-28T04:00:00Z", FRIDAY = "2026-11-27T07:10:00Z";   // Tue 10:12, Sat 12:00, Fri 15:10 SGT
      const CCYS = { kospi: "KRW", ixic: "USD", sse: "CNY" }, STATS = { kospi: "KOSPI200", ixic: "NDX", sse: "SSE180" }, NAMES = { kospi: "KOSPI", ixic: "NASDAQ COMP", sse: "SHANGHAI COMP" }, LONGER = ["eq-sectors", "eq-movers", "eq-breadth", "eq-screener"];
      const heads = (p) => p.evaluate((longer) => {
        const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), out = {};
        for (const pn of document.querySelectorAll("#grid > .panel")) {
          const k = pn.dataset.k, hd = pn.querySelector(":scope > .phead"), a = hd?.querySelector(":scope > .aux.src-fit"); if (!a || !k?.startsWith("eq-")) continue;
          const vis = [...a.querySelectorAll(":scope > .src-long, :scope > .src-short, :scope > .src-compact, :scope > .src-min")].find((e) => getComputedStyle(e).display !== "none") ?? a;
          const parts = [...vis.querySelectorAll(".sp")].map((e) => e.textContent.replace(/\s+/g, " ").trim());
          // the room between a leading badge and the word after it, as drawn
          const lead = [...vis.querySelectorAll(".badge")].find((e) => e.textContent === "INTRADAY"), next = lead?.nextSibling;
          let gap = null; if (lead && next) { const rg = document.createRange(); rg.selectNodeContents(next); const nr = [...rg.getClientRects()].find((r) => r.width > 0.5); if (nr) gap = Math.round(((nr.left - R(lead).right) / z) * 10) / 10; }
          const form = a.classList.contains("wrap") ? "second line" : a.classList.contains("min") ? "min" : a.classList.contains("compact") ? "compact" : a.classList.contains("short") ? "short" : "whole";
          const rg = document.createRange(); rg.selectNodeContents(vis); const cs = getComputedStyle(a), box = R(a).width - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * z;
          const badges = [...a.querySelectorAll(":scope > .src-long .badge")].map((e) => e.textContent), tip = a.title;
          const apart = vis.cloneNode(true); apart.querySelectorAll(".badge").forEach((x) => x.replaceWith(` ${x.textContent} `));
          out[k] = { form, text: apart.textContent.replace(/\s+/g, " ").trim(), parts, gap, tip, glued: badges.filter((t) => !new RegExp(`(^|\\s)${t}(\\s|$)`).test(tip)), spare: Math.round(((box - rg.getBoundingClientRect().width) / z) * 10) / 10, cut: (form !== "second line" && rg.getBoundingClientRect().width > box + 0.01) || a.scrollWidth > a.clientWidth, longer: longer.includes(k) };
        }
        return { out, term: document.body.classList.contains("term") };
      }, LONGER);
      const spares = { flow: [], sectors: [] };
      for (const [w, h, size, css] of LEAST) for (const open of [true, false]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await ctx.addInitScript(([at, prefs, live, flow]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); if (live) localStorage.setItem("om_mock_live", "1"); else localStorage.removeItem("om_mock_live"); if (flow) localStorage.setItem("om_mock_flow", JSON.stringify(flow)); else localStorage.removeItem("om_mock_flow"); } catch {} }, [open ? SESSION : WEEKEND, { size, compact: true, v: 2 }, open, open ? null : { quoteAt: FRIDAY, mfAt: FRIDAY, mfD: "2026-11-27" }]);
        const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
        // the first index by a page load, the others in place (the address's index changed), as a person moves
        for (const [i, idx] of Object.keys(CCYS).entries()) {
          if (i === 0) { await p.goto(`${MOCK}#equities/${idx}`, { waitUntil: "networkidle" }); await p.waitForSelector(".panel[data-k='eq-flow'] .pbody table", { timeout: 20000 }); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); await face(p, css); }
          else { await p.evaluate((x) => { location.hash = `equities/${x}`; }, idx); await p.waitForFunction((st) => (document.querySelector(".panel[data-k='eq-flow'] > .phead .src-long")?.textContent ?? "").startsWith(`${st} `) && !!document.querySelector(".panel[data-k='eq-flow'] .pbody table"), STATS[idx], { timeout: 20000 }); }
          await frames(p); await p.waitForTimeout(150); await frames(p);
          const { out, term } = await heads(p), flow = out["eq-flow"], bad = [];
          if (!flow || !flow.parts.includes(CCYS[idx])) bad.push(`FLOW without ${CCYS[idx]}: "${flow?.text}"`);
          if (!open && flow && !/turnover 27 Nov 15:10 SGT/.test(flow.text)) bad.push(`FLOW's weekend stamp not dated: "${flow.text}"`);
          for (const k of LONGER) if (out[k] && !/\bclose(s| of)? (of )?\d{1,2} [A-Z][a-z]{2}\b|\bat the close of \d{1,2} [A-Z][a-z]{2}\b/.test(out[k].text)) bad.push(`${k.slice(3)} without the longer periods' close: "${out[k].text}"`);
          for (const [k, x] of Object.entries(out)) {
            if (x.form === "second line") bad.push(`${k.slice(3)} on a second line`);
            if (x.cut) bad.push(`${k.slice(3)} cut`);
            if (x.glued.length) bad.push(`${k.slice(3)}'s tooltip glues ${x.glued.join(", ")}: "${x.tip.slice(0, 120)}"`);
            if (open && x.gap !== null && x.gap < 3) bad.push(`${k.slice(3)}: INTRADAY ${x.gap} px from the word after it`);
          }
          if (out["eq-flow"]?.form === "min") spares.flow.push(out["eq-flow"].spare);
          if (out["eq-sectors"]?.form === "min") spares.sectors.push(out["eq-sectors"].spare);
          ck(`${label(w, h, size)}${css ? " in DejaVu Sans" : ""}, ${NAMES[idx]} (STAND-IN), ${open ? "in session" : "a weekend (turnover dated Fri 27 Nov)"}: FLOW "${flow?.text}" (${flow?.form}, ${flow?.spare} px spare); SECTORS "${out["eq-sectors"]?.text}" (${out["eq-sectors"]?.form}, ${out["eq-sectors"]?.spare} px spare); every statistics head that draws longer periods holds their close; no second line, nothing cut; badges apart in every tooltip${open ? `; INTRADAY ${out["eq-sectors"]?.gap} px from the next word` : ""}`, term && bad.length === 0 && errs.length === 0, { bad, errs });
        }
        await ctx.close();
      }
      console.log(`    room left beside the title where the minimal form stands (px): FLOW ${spares.flow.length ? `${Math.min(...spares.flow)} to ${Math.max(...spares.flow)}` : "-"}; SECTOR PERFORMANCE ${spares.sectors.length ? `${Math.min(...spares.sectors)} to ${Math.max(...spares.sectors)}` : "-"}`);
      // a net flow from another pull than the turnover: no time on the head dates it, so its date stays
      {
        const ctx = await b.newContext({ viewport: { width: 1179, height: 540 }, deviceScaleFactor: 1 });
        await ctx.addInitScript(([at, prefs]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); localStorage.setItem("om_mock_live", "1"); localStorage.setItem("om_mock_flow", JSON.stringify({ quoteAt: "2026-11-24T02:12:00Z", mfAt: "2026-11-24T01:52:00Z", mfD: "2026-11-24" })); } catch {} }, [SESSION, { size: "AUTO", compact: true, v: 2 }]);
        const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
        await p.goto(`${MOCK}#equities/kospi`, { waitUntil: "networkidle" }); await p.waitForSelector(".panel[data-k='eq-flow'] .pbody table", { timeout: 20000 });
        await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); await frames(p);
        const flow = (await heads(p)).out["eq-flow"];
        ck(`1179x540, KOSPI in session, a net flow of 09:52 SGT beside a turnover of 10:12 SGT: FLOW's head reads "${flow?.text}" (${flow?.form}), its net flow's date kept, its currency kept, not cut`, !!flow && /net flow 24 Nov/.test(flow.text) && flow.parts.includes("KRW") && !flow.cut && errs.length === 0, { flow, errs });
        await ctx.close();
      }
    }

  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
