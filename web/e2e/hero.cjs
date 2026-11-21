// The chart at the top of a phone's page of one name (a stock's, an instrument's: `.mp-hero`) keeps its room whatever
// the lines above it. Shared by stock-page.cjs and instrument-pages.cjs; not a suite of its own.
//
// The tile was a fixed height, a little over half the screen (410 to 540 px), and the chart had what the price, the
// stamp's line and the change left of it: about 290 px on an iPhone 13. Round 3a put "opens 24 Nov 08:00 SGT" after
// the stamp. Where the two no longer fit on one line the chart paid for the second: 273 px. That happens on a weekend
// (the stamp carries its date) and, in a wider font than this machine's, whenever the opening carries a date:
// stock-page's check passed on the engineer's machine by 2 px and failed on GitHub's (pull request #48, 21 Nov 2026,
// 06:12 UTC), and it read the machine's clock, so its result also turned on the day and the hour.
//
// So nothing here reads the machine's clock or trusts its fonts. The page is opened at a set moment of the local
// copy's clock (`om_mock_now`: lib/mockclock.ts; the stand-in rows then follow the session table), and the rule is
// about the tile's parts, in whatever font they are drawn: the chart at least 290 px, the tile between 410 and 540 px,
// no taller than its parts need, nothing of it cut. `WIDE` forces a wide font on every element; `EACH_TAG_A_LINE`
// puts every badge, the stamp and the opening on a line of its own, the tallest head there can be, on any machine.
const { devices } = require("playwright");

const SAT = "2026-11-21T06:12:00Z";    // Sat 21 Nov 14:12 SGT, when the check failed on GitHub: every market but the coins' shut, each line with a date in it
const FRI = "2026-11-20T13:16:00Z";    // Fri 20 Nov 21:16 SGT: Tokyo shut since 14:30 the same day (a stamp without a date), FX and the futures trading
const OPEN = "2026-11-24T02:00:00Z";   // Tue 24 Nov 10:00 SGT: Tokyo open, its feed 20 minutes behind
const WIDE = "*{font-family:monospace!important}";
const EACH_TAG_A_LINE = ".mp-hero .mtile.cp>.vl>.tags{flex-direction:column;align-items:flex-start}";   // each at its own width: nothing made wider than the tile
const FLOOR = 290, LEAST = 410, MOST = 540;

/** The hero tile of `url` on a phone at the moment `now`, measured after `css` (if any) is put on the page: the
 *  heights of the tile, its head (the price with the stamp's line), the chart's box and the canvas in it, in px; how
 *  many lines the badges, the stamp and the opening take; whether anything of the tile is cut. */
async function heroRoom(b, url, { now, css = "", dev = "iPhone 13" }) {
  const ctx = await b.newContext({ ...devices[dev] });
  await ctx.addInitScript((n) => { try { localStorage.setItem("om_mock_now", n); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, now);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: "networkidle" }); await p.waitForSelector(".mp-hero canvas", { timeout: 15000 }); await p.evaluate(() => document.fonts.ready);
  if (css) await p.addStyleTag({ content: css });
  await p.waitForTimeout(800);   // the chart follows its box (a ResizeObserver) before it is measured
  const m = await p.evaluate(() => {
    const px = (x) => Math.round(x * 10) / 10;
    const t = document.querySelector(".mp-hero .mtile.cp"), c = t.querySelector(":scope > .chartbox"), vl = t.querySelector(":scope > .vl"), rd = t.querySelector(":scope > .rdout"), cv = c.querySelector("canvas");
    const tr = t.getBoundingClientRect(), tags = [...vl.querySelectorAll(":scope > .tags > *")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).sort((x, y) => x.top - y.top);
    let lines = 0, bottom = -Infinity; for (const r of tags) { if (r.top >= bottom - 2) lines++; bottom = Math.max(bottom, r.bottom); }
    return { tile: px(tr.height), head: px(vl.getBoundingClientRect().height), chart: px(c.getBoundingClientRect().height), canvas: px(cv.getBoundingClientRect().height), lines,
      text: vl.innerText.replace(/\s+/g, " ").trim(), vh: innerHeight, least: px(Math.min(540, Math.max(410, innerHeight * 0.58))),
      cut: rd.getBoundingClientRect().bottom > tr.bottom + 0.5 || t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1 || tr.left < -0.5 || tr.right > innerWidth + 0.5 };
  });
  await ctx.close();
  return { ...m, errs };
}

/** The rule: the chart at least 290 px and drawn as tall as its box; the tile between 410 and 540 px, and where it is
 *  taller than its least (58% of the screen, within those two) the chart is at its 290 px, so the tile is no taller
 *  than its head needs; nothing of the tile cut at its foot or its sides, the tile inside the window; no error on the
 *  page. (The rest of the page in a forced font is not this rule's business.) */
const roomOk = (m) => m.chart >= FLOOR && Math.abs(m.canvas - m.chart) <= 1 && m.tile >= LEAST && m.tile <= MOST && (m.tile <= m.least + 1 || m.chart <= FLOOR + 1) && !m.cut && m.errs.length === 0;

/** "290px of a 427.4px tile, its head 80.5px (2 lines under the price)": the words of a check's name. */
const roomWords = (m) => `${m.chart}px of a ${m.tile}px tile, its head ${m.head}px (${m.lines} line${m.lines === 1 ? "" : "s"} under the price)`;

module.exports = { heroRoom, roomOk, roomWords, SAT, FRI, OPEN, WIDE, EACH_TAG_A_LINE, FLOOR };
