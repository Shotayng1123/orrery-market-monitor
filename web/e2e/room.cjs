// How much room a text has, for the checks of "nothing is cut" (round 3b's fix step, 21 Nov 2026). Not a suite: the
// suites that measure room take these helpers from here.
//
// The checks used to ask `scrollWidth > clientWidth + 1`. That passes a text that is a pixel too wide, which a browser
// already ends with "…" (GitHub's run of pull request #49: TOPIX's name cell at 1280x720 was 115 px of text in 114, and
// passed here by exactly that pixel); it measures nothing at all on an inline box (both widths are 0 there); and it
// cannot see a part that a box around it hides (a phone's alert figure behind its own row's edge). `spare` measures
// the text itself: how many CSS px its glyphs stand inside the content edge of every box that would cut them, a part
// that draws padding or a border around its letters (a badge) by that box (CF-5 of 22 Nov 2026). A check
// asks for a margin in px, in the machine's own fonts and in a drawing that is really wider.
//
// The wider drawings. GitHub's machines draw the same faces about one per cent wider than this one, and a reader's
// machine may draw them wider still.
//   - `widen(page)` adds 2% of its size to every letter's spacing, on top of the spacing the page itself sets, in
//     whatever face the page uses: 3.3% more width in the Monitor's monospaced figures, whose letters are 0.6 of their
//     size wide, about three times what GitHub's machines add. A forced `monospace` widens those by next to nothing
//     (IBM Plex Mono's letters are 0.600 of their size wide, DejaVu Sans Mono's 0.602 and Liberation Mono's 0.600, so
//     on a computer that "wide font" was the page's own width within half a pixel: the check CK-6 of 21 Nov 2026).
//     It is written on the elements there are, so it is called again after
//     anything that draws new ones (a click that changes what a cell shows).
//   - `MONO` swaps every face for the generic monospace: a real widening where the page sets a proportional face (a
//     phone's names and lines), as the designer's notes ask for.
const MONO = "*{font-family:monospace!important}";

// Runs in the page: defines window.__room. Give it to context.addInitScript({ content: ROOM }), so that a page that is
// loaded again has it too (it reads the page only when one of its functions is called).
const ROOM = `window.__room = (() => {
  const z = () => Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect();
  const shown = (e) => !!e && getComputedStyle(e).display !== "none" && R(e).width > 0;
  // the box of everything a node draws as text, wrapped or not, cut or not
  const text = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); };
  // the same, with the border box of every part inside it that draws padding or a border around its letters (a badge:
  // "DELAYED ~10m" ends 4 to 5 px before its own box does, and that box is what a cell cuts; CF-5 of the review of fix
  // part 1, 22 Nov 2026: the text alone read 4.9 px of room on a badge already drawn "DELAYED ~10…")
  const drawn = (e) => { const t = text(e); let l = t.left, r = t.right;
    for (const d of [e, ...e.querySelectorAll("*")]) { const cs = getComputedStyle(d); if (cs.display === "none" || (d === e && !/^inline/.test(cs.display))) continue;   // e itself only where it is a part of a line, not the box around it
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      if (pad > 0) { const b = R(d); if (b.width > 0) { l = Math.min(l, b.left); r = Math.max(r, b.right); } } }
    return { left: l, right: r, width: r - l, top: t.top, bottom: t.bottom }; };
  // a box's content edges on screen (its border and padding are in CSS px, its place in the window's px)
  const inner = (a) => { const r = R(a), cs = getComputedStyle(a), k = z(); return { left: r.left + (parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)) * k, right: r.right - (parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight)) * k }; };
  // CSS px between the end of e's text and the content edge of the nearest box that cuts what passes it: e itself and
  // every box around it up to root (the page when none is given). Negative: that much of the text is cut or hidden
  // (at either edge: a text that starts before a box's left edge counts too). 999 where no box up to root cuts.
  const spare = (e, root) => { const t = drawn(e), k = z(); let s = 999;
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display !== "inline" && cs.display !== "contents" && cs.overflowX !== "visible") { const i = inner(a), left = (t.left - i.left) / k; s = Math.min(s, (i.right - t.right) / k, left < -0.05 ? left : 999); }
      if (a === root) break;
    }
    return Math.round(s * 10) / 10; };
  // CSS px between the end of e's text and box's content edge, whether or not box cuts: negative when the text
  // stands out of it (a part that a row may not leave, cut or not)
  const within = (e, box) => { const t = drawn(e), i = inner(box), k = z(), left = (t.left - i.left) / k; return Math.round(Math.min((i.right - t.right) / k, left < -0.05 ? left : 999) * 10) / 10; };
  // the CSS px a line has left: box's content width less its parts' texts and the gaps between them. For parts that
  // stand at the line's two ends (the σ at the left, its day at the right), where each part's own edge says nothing
  const free = (box, parts, gap) => { const i = inner(box), k = z(), ps = parts.filter(shown); return Math.round(((i.right - i.left) / k - ps.reduce((s, e) => s + text(e).width / k, 0) - (gap || 0) * Math.max(0, ps.length - 1)) * 10) / 10; };
  // the width of e's text and of the room its own box gives it, in CSS px
  const widths = (e) => { const i = inner(e), k = z(); return { text: Math.round(text(e).width / k * 10) / 10, room: Math.round((i.right - i.left) / k * 10) / 10 }; };
  // every letter's spacing wider by pct % of its size, on top of what the page sets; an element is widened once
  const widen = (pct) => { const all = [...document.body.querySelectorAll("*")].filter((e) => e.__ls0 === undefined && e.style);
    const was = all.map((e) => { const cs = getComputedStyle(e); return [parseFloat(cs.letterSpacing) || 0, parseFloat(cs.fontSize) || 0]; });
    all.forEach((e, i) => { e.__ls0 = was[i][0]; e.style.setProperty("letter-spacing", (was[i][0] + was[i][1] * pct / 100) + "px", "important"); });
    return all.length; };
  return { z, shown, text, drawn, inner, spare, within, free, widths, widen };
})();`;

/** Draws every text of the page wider (see above); call again after new elements are drawn. */
const widen = async (page, pct = 2) => { await page.evaluate((x) => window.__room.widen(x), pct); await page.waitForTimeout(250); };

module.exports = { ROOM, MONO, widen };
