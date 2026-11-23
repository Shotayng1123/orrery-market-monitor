// Source lines that must fit their heads on EQUITIES, whose indices' names may be a STAND-IN (section [9] of
// source-lines.cjs until the check of fix part 4, 23 Nov 2026, moved here and widened; a stock's line, its section [10],
// is the suite stock-line: each suite stays under three minutes). On the local copy (5179), six tabs (`om_paper` "0");
// every page sets its clock (`om_mock_now`), so nothing here depends on the hour or the day. Lengths are CSS px of the
// page's own layout.
//   [9] EQUITIES in the one-screen layout, the market open and closed, TOPIX and the three indices whose names are a
//       STAND-IN (KOSPI, NASDAQ COMP, SHANGHAI COMP), at 1280x720, 1179x800, 1114x800 (S) and 1769x1000 (XL), and in
//       DejaVu Sans: no head on a second line (where even the compact form is wider than its room the minimal form
//       stands beside the title: the state's badges and the time of the figures, R2 of the check of fix part 4: KOSPI's,
//       NASDAQ COMP's and SHANGHAI COMP's charts were 5 to 13 px shorter than live there); every STAND-IN and INTRADAY
//       badge drawn whole inside its head; no whole table row and no chart height fewer than with every line held on
//       its title's line (the live site's); no panel over another; no source line cut (DP-1 and R2 of the final review
//       of pull request #50 and its checks)
// It must pass as installed and GitHub's way (letters on whole px).
// Run from web/:  node e2e/run.cjs source-lines-fit   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
const MORNING = "2026-11-23T23:10:00Z";   // Tue 24 Nov 07:10 SGT ("the market open": om_mock_live)
const DEJAVU = "*{font-family:'DejaVu Sans'!important}";
const label = (w, h, size) => `${w}x${h}${size !== "AUTO" ? ` ${size}` : ""}`;
const settle = async (p, ms = 250) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const frames = (p) => p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
// a face put in by the check comes with no font event (a page's own web face sends "loadingdone", on which the fit runs
// again): a resize, on which the fit runs too, has every source line fitted in the face now drawn
const face = async (p, css) => { if (!css) return; await p.addStyleTag({ content: css }); await p.evaluate(() => window.dispatchEvent(new Event("resize"))); await settle(p, 300); };

// Every source line in a panel head: its drawn text (a range over the form that shows) against its own content box.
const audit = (p) => p.evaluate(() => {
  const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), px = (x) => Math.round((x / z) * 10) / 10;
  return [...document.querySelectorAll(".phead .aux")].filter((a) => a.getClientRects().length && a.textContent.trim()).map((a) => {
    const head = a.closest(".phead"), vis = [...a.querySelectorAll(":scope > .src-long, :scope > .src-short, :scope > .src-compact, :scope > .src-min")].find((e) => getComputedStyle(e).display !== "none") ?? a;
    const rg = document.createRange(); rg.selectNodeContents(vis); const cs = getComputedStyle(a), box = R(a).width - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * z, need = rg.getBoundingClientRect().width;
    const wrap = a.classList.contains("wrap"), nowrap = !wrap && (cs.whiteSpace === "nowrap" || getComputedStyle(vis).whiteSpace === "nowrap");
    return { k: head.parentElement?.dataset.k ?? "", text: vis.textContent.replace(/\s+/g, " ").trim(), over: nowrap && need > box + 0.01, scrolls: a.scrollWidth > a.clientWidth, spare: px(box - need) };
  });
});
const cutLines = (rows) => rows.filter((r) => r.over || r.scrolls);

(async () => {
  const b = await chromium.launch();
  try {
    // DP-1 of the final review of pull request #50: a short form on its head's second line grew the head into the
    // panel's body, and whole rows of SECTOR PERFORMANCE, FLOW BY SECTOR and MARKET BREADTH went behind the panel's own
    // scroll. The line took its height from the chart beside it then (Equities.tsx useHeadRoom), and the heat map, the
    // index chart and its drivers were shorter than before (R2 of the check of that fix), then only where a STAND-IN
    // badge made even the compact form too wide (R2 of the check of fix part 4: KOSPI, NASDAQ COMP, SHANGHAI COMP). Now
    // the minimal form ("INTRADAY 1D 10:12 SGT STAND-IN", "turnover 10:12 SGT STAND-IN") stands beside the title there.
    // Each case is measured twice on one page: as drawn, and with every line held on its title's line (cut), whose rows
    // and chart heights are the live site's: none fewer as drawn, and no head on a second line at all.
    console.log("\n[9] EQUITIES in the one-screen layout: every head on one line, its badges whole, no whole table row and no chart height given to a source line");
    {
      const ONE_LINE = "body.term .phead:has(>.aux.src-fit.wrap){flex-wrap:nowrap!important}body.term .phead .aux.src-fit.wrap{flex:1 1 0!important;order:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}body.term .phead .aux.src-fit.wrap>.src-short,body.term .phead .aux.src-fit.wrap>.src-compact,body.term .phead .aux.src-fit.wrap>.src-min{white-space:nowrap!important}body.term .phead:has(>.aux.src-fit.wrap)>.csvbtn{order:0!important;margin-left:5px!important}body.term .phead:has(>.aux.src-fit.wrap)>.t{flex:0 1 auto!important}";
      const TABLES = ["eq-sectors", "eq-flow", "eq-breadth", "eq-movers", "eq-screener"], HEADS = ["eq-sectors", "eq-flow", "eq-breadth", "eq-movers", "eq-short", "eq-heat", "eq-screener"];
      const rows = (p) => p.evaluate(([ks, hs]) => {
        const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), px = (x) => Math.round((x / z) * 10) / 10, out = {}, heads = {};
        for (const k of ks) {
          const pn = document.querySelector(`#grid > .panel[data-k="${k}"]`), body = pn?.querySelector(":scope > .pbody");
          if (!body) continue;
          const br = R(body), sc = body.offsetHeight ? br.height / body.offsetHeight : 1, top = br.top + body.clientTop * sc, bot = top + body.clientHeight * sc;
          let whole = 0, all = 0;
          for (const tr of body.querySelectorAll("table tr")) { if (tr.closest("thead") || !tr.getClientRects().length) continue; all++; const r = R(tr); if (r.top >= top - 0.5 && r.bottom <= bot + 0.5) whole++; }
          out[k] = { whole, all };
        }
        // each head's form, and its badges: every badge of the whole line is in the form on view (none dropped), drawn
        // whole across the head (an inline badge's border may stand half a px above its line box, as it always has)
        for (const k of hs) {
          const hd = document.querySelector(`#grid > .panel[data-k="${k}"] > .phead`), a = hd?.querySelector(":scope > .aux"); if (!a) continue;
          const long = a.querySelector(":scope > .src-long") ?? a, vis = [...a.querySelectorAll(":scope > .src-long, :scope > .src-short, :scope > .src-compact, :scope > .src-min")].find((e) => getComputedStyle(e).display !== "none") ?? a, hr = R(hd);
          const badges = [...vis.querySelectorAll(".badge")].map((e) => { const r = R(e); return { text: e.textContent, whole: e.getClientRects().length > 0 && r.width > 1 && r.left >= hr.left - 0.5 && r.right <= hr.right + 0.5 && r.top >= hr.top - 1.5 && r.bottom <= hr.bottom + 1.5 }; });
          const dropped = [...long.querySelectorAll(".badge")].map((e) => e.textContent).filter((t) => !badges.some((x) => x.text === t));
          const form = a.classList.contains("wrap") ? "second line" : a.classList.contains("min") ? "min" : a.classList.contains("compact") ? "compact" : a.classList.contains("short") ? "short" : "whole";
          heads[k] = { form, badges, dropped, text: vis.textContent.replace(/\s+/g, " ").trim(), headH: px(hr.height) };
        }
        const h = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? px(R(e).height) : null; };
        const charts = { heat: h('#grid > .panel[data-k="eq-heat"] .tmap'), index: h('#grid > .panel[data-k="eq-index"] .bigwrap canvas'), drivers: h('#grid > .panel[data-k="eq-drivers"] .sqgrid canvas') };
        const ps = [...document.querySelectorAll("#grid > .panel")].map((e) => [e.dataset.k, R(e)]), overlap = [];
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const [ka, x] = ps[i], [kb, y] = ps[j]; if (x.left < y.right - 0.5 && y.left < x.right - 0.5 && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5) overlap.push(`${ka}/${kb}`); }
        return { out, heads, charts, overlap, term: document.body.classList.contains("term") };
      }, [TABLES, HEADS]);
      const IDX = [["topix", "TOPIX"], ["kospi", "KOSPI"], ["ixic", "NASDAQ COMP"], ["sse", "SHANGHAI COMP"]], STAND_IN = ["kospi", "ixic", "sse"];
      const cases = [[1280, 720, "AUTO", ""], [1179, 800, "AUTO", ""], [1114, 800, "S", ""], [1769, 1000, "XL", ""], [1179, 800, "AUTO", DEJAVU]];
      for (const [w, h, size, css] of cases) for (const open of [true, false]) {
        if (css && !open) continue;
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await ctx.addInitScript(([at, prefs, live]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); localStorage.setItem("om_paper", "0"); if (live) localStorage.setItem("om_mock_live", "1"); else localStorage.removeItem("om_mock_live"); } catch {} }, [MORNING, { size, compact: true, v: 2 }, open]);
        const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
        for (const [idx, name] of css ? IDX.filter(([i]) => STAND_IN.includes(i)) : IDX) {
          await p.goto(`${MOCK}#equities/${idx}`, { waitUntil: "networkidle" }); await p.waitForSelector(".panel[data-k='eq-flow'] .pbody table", { timeout: 20000 });
          await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p); await face(p, css); await frames(p); await p.waitForTimeout(150);
          const drawn = await rows(p), cut = cutLines(await audit(p));
          const held = await p.addStyleTag({ content: ONE_LINE }); await frames(p); await p.waitForTimeout(250); await frames(p);
          const before = await rows(p); await held.evaluate((e) => e.remove());
          const lost = TABLES.filter((k) => drawn.out[k] && before.out[k] && drawn.out[k].whole < before.out[k].whole);
          const second = HEADS.filter((k) => drawn.heads[k]?.form === "second line");
          const shorter = Object.keys(drawn.charts).filter((c) => drawn.charts[c] != null && before.charts[c] != null && drawn.charts[c] < before.charts[c] - 1.5);
          // every badge the whole line holds is drawn whole in the form on view; and a STAND-IN index's statistics heads
          // all carry STAND-IN, and with the market open INTRADAY too where the whole line does (FLOW's does not)
          const standIn = STAND_IN.includes(idx), badgeHeads = HEADS.filter((k) => k !== "eq-short" && drawn.heads[k]);
          const badgeLost = badgeHeads.filter((k) => { const hd = drawn.heads[k]; return hd.dropped.length > 0 || hd.badges.some((x) => !x.whole) || (standIn && !hd.badges.some((x) => x.text === "STAND-IN")) || (open && k !== "eq-flow" && !hd.badges.some((x) => x.text === "INTRADAY")); });
          const mins = HEADS.filter((k) => drawn.heads[k]?.form === "min").map((k) => `${k.slice(3)} "${drawn.heads[k].text}"`);
          ck(`${label(w, h, size)}${css ? " in DejaVu Sans" : ""}, ${name}${standIn ? " (STAND-IN)" : ""}, market ${open ? "open" : "closed"}: ${second.length} head(s) on a second line; ${mins.length ? `minimal form: ${mins.join(", ")}` : "no minimal form"}; badges whole in ${badgeHeads.length - badgeLost.length} of ${badgeHeads.length} heads; charts as drawn / held (px): ${Object.keys(drawn.charts).map((c) => `${c} ${drawn.charts[c]}/${before.charts[c]}`).join(", ")}; whole rows as drawn / held: ${TABLES.map((k) => `${k.slice(3)} ${drawn.out[k]?.whole}/${before.out[k]?.whole}`).join(", ")}`,
            drawn.term && second.length === 0 && badgeLost.length === 0 && shorter.length === 0 && lost.length === 0 && drawn.overlap.length === 0 && cut.length === 0 && errs.length === 0, { second: second.map((k) => [k, drawn.heads[k]]), badgeLost: badgeLost.map((k) => [k, drawn.heads[k]]), shorter, lost, overlap: drawn.overlap, cut, errs });
        }
        await ctx.close();
      }
    }

  } finally { await b.close(); }
  console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
