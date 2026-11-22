// The one-screen header, one row by rule (the designer's notes of 22 Nov 2026, Part A, revision 1: its check A.7). It
// replaces the paper portfolio suite's loop of the one-screen header (e2e/portfolio.cjs, 21 Nov: two checks failed on
// GitHub's machines, where the row was full and took a second line, and a FULL step pressed in the row).
// On the local copy (5179). Nothing here reads the machine's clock: every page sets `om_mock_now` (Tue 24 Nov 2026,
// 07:10 SGT) and "DATA OK", "↻ 10:00" and a 14-letter account are written into the chips (the live page's longest
// states). Lengths are CSS px of the page's layout (a screen px over the zoom). Both tab counts: seven (the paper
// portfolio's switch on, as in the local copy) and six (`om_paper` "0", as on the published page).
//   (a) one row: the header at most 25 px tall, and no item of it ends right of the window
//   (b) the margin: the alert line's holder at least 102 px wider than the line's promise (its own width with the holder
//       unconstrained and the name replaced by its first 8 characters and "…"), in its longest states written in
//   (c) what shows: the stand-in alert whole; in each longest state everything whole but the name, which keeps at
//       least 8 characters and "…"; no fit class
//   (d) no sideways scroll with the focus in the search box, with a letter typed and the list open, and with a
//       33-character query; the box 96 px; no item moved; still one row
//   (e) the menu (≡): inside the window, no sideways scroll, nothing in it cut; the three clocks, TEXT SIZE, COMPACT,
//       FULL, the account; Escape closes it with the focus on ≡; a second press and a press outside close it
//   (f) FULL from the menu: the header gone, key 7 opens PORTFOLIO (seven tabs), Escape: one row again, the layout kept
//   (g) the floor: no one-screen layout in a layout under 1,300 px, and COMPACT's tooltip says why
//   (h) outside the one-screen layout nothing changed: the clocks in the row, no ≡, the account in the row
//   (i) a wider drawing: DejaVu Sans forced, (a), (c) and (d) at 1280x720 and 1495x900 L, seven tabs; and with 0.9 px
//       added to every letter as well, the stock move at text M in 1448x900 and 1458x900 windows: the name keeps 8
//       characters, or the label has left (the fit's first step)
// It must pass as installed and GitHub's way (letters on whole px): the margin is twice the largest difference the
// designer measured between the two (50.7 px).
// Run from web/:  node e2e/run.cjs header   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const MOCK = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d).slice(0, 2400)}`); };
const MORNING = "2026-11-23T23:10:00Z";
const MARGIN = 102;
const WINDOWS = [[1170, 800, "AUTO"], [1280, 720, "AUTO"], [1366, 768, "AUTO"], [1440, 900, "AUTO"], [1536, 864, "AUTO"], [1610, 1000, "AUTO"], [1920, 1080, "AUTO"], [1105, 800, "S"], [1300, 800, "M"], [1495, 900, "L"], [1755, 1000, "XL"]];
const DEJAVU = "*{font-family:'DejaVu Sans'!important}";

async function open(b, { vw, vh, size = "AUTO", six = false, compact = true }) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, prefs, six]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_prefs", JSON.stringify(prefs)); localStorage.setItem("om_a2hs_hide", "1"); if (six) localStorage.setItem("om_paper", "0"); } catch {} }, [MORNING, { size, compact, v: 2 }, six]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const settle = async (p, ms = 200) => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(ms); };
const go = async (p) => { await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("table.mkt", { timeout: 20000 }); await p.waitForSelector("#alerts .alrt .nm"); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await settle(p, 300); };
// the live page's longer states of the row's chips: DATA OK, a countdown of four characters, a 14-letter account
const longChips = (p) => p.evaluate(() => { document.querySelector("#hlth").lastChild.nodeValue = "OK"; document.querySelector("#nxt").lastChild.nodeValue = "10:00"; const u = document.querySelector("#userchip"); if (u) u.firstChild.nodeValue = "ABCDEFGHIJKLMN"; });

// The header as drawn: its height, how many rows its items stand in, what passes the window, the alert line's parts
// (each one's box cut by the line's box and by `.one` and `.core`; a part on the hidden second line of `.one` shows
// nothing), the search box.
const measure = (p) => p.evaluate(() => {
  const z = Number(document.body.style.zoom) || 1, R = (e) => e.getBoundingClientRect(), px = (x) => Math.round((x / z) * 10) / 10;
  const tb = document.querySelector("#topbar"), kids = [...tb.children].filter((e) => getComputedStyle(e).display !== "none" && getComputedStyle(e).position !== "absolute" && e.getClientRects().length);
  const tops = [...new Set(kids.map((e) => Math.round(R(e).top / z)))].sort((a, c) => a - c), rows = [];
  for (const t of tops) if (!rows.length || t - rows[rows.length - 1] > 8) rows.push(t);
  const al = document.querySelector("#alerts .alrt"), one = al && al.querySelector(".one");
  const vis = (e) => { if (!e || !e.getClientRects().length || getComputedStyle(e).display === "none") return null; const r = R(e), a = R(al), bw = parseFloat(getComputedStyle(al).borderLeftWidth) * z; let l = Math.max(r.left, a.left + bw), rr = Math.min(r.right, a.right - bw), hidden = false;
    for (const box of [e.closest(".one"), e.closest(".core")]) { if (!box || box === e) continue; const o = R(box); l = Math.max(l, o.left); rr = Math.min(rr, o.right); if (r.top >= o.bottom - 1 || r.bottom <= o.top + 1) hidden = true; }
    const cut = e.scrollWidth > e.clientWidth + 0.5; return { text: e.textContent.trim(), shown: px(hidden ? 0 : Math.max(0, rr - l)), whole: px(r.width), cut, hidden }; };
  const part = (s) => vis(al && al.querySelector(s));
  const whole = (v) => !!v && !v.hidden && !v.cut && v.shown >= v.whole - 0.6;
  const alert = al ? { cls: al.className, fit: document.querySelector("#alerts").className, holder: px(R(document.querySelector("#alerts")).width), label: part(":scope > .k"), kind: part(".kd"), name: part(".nm"), figure: part(".fig"), word: part(".q"), src: part(".src"), time: part(":scope > .t") } : null;
  if (alert) { alert.wholeParts = ["label", "kind", "name", "figure", "word", "time"].filter((k) => whole(alert[k])); }
  return { z, W: Math.round(innerWidth / z), term: document.body.classList.contains("term"), tight: document.body.classList.contains("tight"), tabs: document.querySelectorAll("#nav a").length, h: px(R(tb).height), rows: rows.length,
    pastWindow: [...tb.querySelectorAll("*")].filter((e) => e.getClientRects().length && getComputedStyle(e).position !== "absolute" && !e.closest("#more,.sres,.aldrop") && R(e).right > innerWidth + 0.5).map((e) => e.id || e.className).slice(0, 4),
    brandWords: getComputedStyle(document.querySelector("#topbar .brand .bw")).display !== "none", clock: document.querySelector("#clock").innerText.replace(/\s+/g, " ").trim(),
    alert, search: px(R(document.querySelector("#search input")).width), placeholder: document.querySelector("#search input").placeholder, sideways: document.documentElement.scrollWidth - innerWidth, scrollX: Math.round(scrollX) };
});
// the alert line's longest states, written into the line (as the designer measured them)
const STATE = (name) => {
  const al = document.querySelector("#alerts .alrt"), core = al.querySelector(".core"), k = al.querySelector(":scope > .k"), t = al.querySelector(":scope > .t");
  const nm = core.querySelector(".nm"); let fig = core.querySelector(".fig"), q = core.querySelector(".q"), kd = core.querySelector(".kd");
  if (!fig) { fig = document.createElement("span"); fig.className = "fig dn"; core.appendChild(fig); }
  if (!q) { q = document.createElement("span"); q.className = "q"; core.appendChild(q); }
  if (!kd) { kd = document.createElement("span"); kd.className = "kd"; core.insertBefore(kd, core.firstChild); }
  let src = al.querySelector(".one > .src"); if (!src) { src = document.createElement("span"); src.className = "src"; al.querySelector(".one").appendChild(src); }
  if (!window.__std) window.__std = { nm: nm.textContent, fig: fig.textContent, q: q.textContent, t: t.textContent, k: k.textContent, lit: al.classList.contains("new") };
  const S = { sigma: { kd: "σ move", nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "+12.3σ", q: null, src: null },
    stock: { kd: null, nm: "Mitsubishi UFJ Financial Group, Inc.", fig: "+102.4%", q: "intraday", src: null },
    news: { kd: "guidance", nm: "Two lenders agree to merge their Japanese trust banking units by April", fig: null, q: null, src: "via Reuters" } }[name];
  const show = (e, v) => { e.style.display = v == null ? "none" : ""; if (v != null) e.textContent = v; };
  if (!S) { show(kd, null); show(src, null); nm.textContent = window.__std.nm; show(fig, window.__std.fig); show(q, window.__std.q); t.textContent = window.__std.t; k.textContent = window.__std.k; al.classList.toggle("new", window.__std.lit); }
  else { al.classList.add("new"); k.textContent = "NEW ALERT"; t.textContent = "23 Nov 23:55"; show(kd, S.kd); nm.textContent = S.nm; show(fig, S.fig); show(q, S.q); show(src, S.src); }
  return name;
};
// the line's promise in its present state: its own width with the holder unconstrained and the name's text replaced by
// its first 8 characters and "…" (whole when it has 8 or fewer); "via" left out
const PROMISE = () => {
  const z = Number(document.body.style.zoom) || 1, a = document.querySelector("#alerts"), al = a.querySelector(".alrt"), nm = al.querySelector(".nm"), src = al.querySelector(".one > .src");
  const cls = a.className, sv = { a: a.getAttribute("style"), al: al.getAttribute("style"), src: src && src.style.display, nm: nm.textContent };
  a.classList.remove("a-nolabel", "a-min", "a-refuse"); if (src) src.style.display = "none"; a.style.flex = "none"; a.style.width = "2400px"; al.style.maxWidth = "none";
  const ch = [...sv.nm]; if (ch.length > 8) nm.textContent = ch.slice(0, 8).join("") + "…";
  const w = al.getBoundingClientRect().width / z;
  nm.textContent = sv.nm; a.setAttribute("style", sv.a || ""); al.setAttribute("style", sv.al || ""); if (src) src.style.display = sv.src; a.className = cls;
  return Math.round(w * 10) / 10;
};
// how many characters of the name are drawn before its "…": the most k with width(first k characters and "…") at most the
// name's box, both measured in the name; the whole count when the name is whole
const shownChars = (p) => p.evaluate(() => { const nm = document.querySelector("#alerts .nm"); if (!nm || !nm.getClientRects().length) return 0; const ch = [...nm.textContent], box = nm.getBoundingClientRect().width;
  if (nm.scrollWidth <= nm.clientWidth) return ch.length;
  const w = (k) => { const s = document.createElement("span"); s.textContent = ch.slice(0, k).join("") + "…"; s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;left:0;top:0"; nm.appendChild(s); const x = s.getBoundingClientRect().width; s.remove(); return x; };
  let k = 0; while (k < ch.length && w(k + 1) <= box + 0.01) k++; return k; });
const fitClass = (p) => p.evaluate(() => (document.querySelector("#alerts").className.match(/a-(nolabel|min|refuse)/) || [""])[0]);
const lefts = (p) => p.evaluate(() => [...document.querySelectorAll("#topbar > *, #topbar .bmq > *")].filter((e) => e.id !== "search" && e.getClientRects().length && getComputedStyle(e).position !== "absolute").map((e) => Math.round(e.getBoundingClientRect().left * 10) / 10).join());
const sideways = (p) => p.evaluate(() => ({ scrollX: Math.round(scrollX), over: document.documentElement.scrollWidth - innerWidth, box: Math.round(document.querySelector("#search input").getBoundingClientRect().width / (Number(document.body.style.zoom) || 1) * 10) / 10, list: !!document.querySelector("#search .sres"), h: Math.round(document.querySelector("#topbar").getBoundingClientRect().height / (Number(document.body.style.zoom) || 1) * 10) / 10 }));
// (d): the focus in the box, then "t" typed and the list open, then a 33-character query; the row's items stay where they stood
async function typing(p) {
  const before = await lefts(p);
  await p.focus("#search input"); await p.waitForTimeout(150);
  const focus = { ...(await sideways(p)), moved: before !== (await lefts(p)) };
  await p.keyboard.type("t"); await p.waitForSelector("#search .sres .sitem", { timeout: 5000 }).catch(() => null); await p.waitForTimeout(120);
  const typed = { ...(await sideways(p)), moved: before !== (await lefts(p)) };
  await p.keyboard.type("oyota motor corporation and more"); await p.waitForTimeout(400);
  const long = { ...(await sideways(p)), moved: before !== (await lefts(p)), q: await p.evaluate(() => document.querySelector("#search input").value.length) };
  await p.fill("#search input", ""); await p.keyboard.press("Escape"); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(80);
  const ok = [focus, typed, long].every((s) => s.scrollX === 0 && s.over <= 0 && Math.abs(s.box - 96) <= 0.6 && !s.moved && s.h <= 25) && typed.list && long.q === 33;
  return { ok, focus, typed, long };
}
// every element's own letter-spacing wider by `px` (the checker's case of A.5: DejaVu Sans and 0.9 px)
// (every value read before any is set: a child's own spacing is otherwise read with its parent's addition in it)
const spaced = (p, px) => p.evaluate((x) => { const all = [...document.body.querySelectorAll("*")].filter((e) => e.style), was = all.map((e) => parseFloat(getComputedStyle(e).letterSpacing) || 0); all.forEach((e, i) => e.style.setProperty("letter-spacing", (was[i] + x) + "px", "important")); }, px);

(async () => {
  const b = await chromium.launch(); const t0 = Date.now();
  for (const [vw, vh, size] of WINDOWS) for (const six of [false, true]) {
    const tabs = six ? "six tabs" : "seven tabs", where = `${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, ${tabs}`;
    const { ctx, p, errs } = await open(b, { vw, vh, size, six });
    await go(p); await longChips(p); await p.waitForTimeout(120);
    const m = await measure(p);
    ck(`${where}: (a) the one-screen layout (zoom ${m.z}, a layout of ${m.W} px) in one row, ${m.h} px tall, nothing past the window; the name's words ${m.brandWords ? "shown" : "left to the mark's tooltip"} (from 1,420 px), the clock "${m.clock}", the search box ${m.search} px ("${m.placeholder}")`,
      m.term && m.tabs === (six ? 6 : 7) && m.rows === 1 && m.h <= 25 && m.pastWindow.length === 0 && m.brandWords === (m.W >= 1420) && /^\d\d:\d\d SGT$/.test(m.clock) && Math.abs(m.search - 96) <= 0.6 && m.placeholder === "Search" && m.sideways <= 0, m);
    // (c) the stand-in alert, whole, and no fit class
    const a = m.alert, f0 = await fitClass(p);
    ck(`${where}: (c) the stand-in alert whole: "${[a.label, a.name, a.figure, a.word, a.time].map((v) => v && v.text).join(" · ")}" (the line's holder ${a.holder} px), no fit class`,
      ["label", "name", "figure", "word", "time"].every((k) => a.wholeParts.includes(k)) && a.name.text === "KIOXIA HOLDINGS CORP." && a.figure.text === "-11.2%" && a.word.text === "intraday" && a.time.text === "07:07" && /^(NEW )?ALERT$/.test(a.label.text) && f0 === "", { a, f0 });
    // (b) and (c) in the longest states
    let least = null; const shows = [];
    for (const s of ["sigma", "stock", "news"]) {
      await p.evaluate(`(${STATE})(${JSON.stringify(s)})`); await p.waitForTimeout(80);
      const ms = await measure(p), pr = await p.evaluate(`(${PROMISE})()`); await p.waitForTimeout(40);
      const free = Math.round((ms.alert.holder - pr) * 10) / 10, al = ms.alert, k = await shownChars(p), fc = await fitClass(p);
      const want = s === "news" ? ["label", "kind", "time"] : s === "sigma" ? ["label", "kind", "figure", "time"] : ["label", "figure", "word", "time"];
      const okState = want.every((x) => al.wholeParts.includes(x)) && k >= 8 && fc === "" && ms.rows === 1 && ms.h <= 25 && ms.sideways <= 0;
      shows.push({ s, free, okState, k, fit: fc, src: al.src && !al.src.hidden && al.src.shown > 0 });
      if (!least || free < least.free) least = { s, free, holder: al.holder, promise: pr };
      if (!okState) ck(`${where}: (c) ${s}: what shows`, false, { al, k, fc });
    }
    await p.evaluate(`(${STATE})("standin")`); await p.waitForTimeout(60);
    ck(`${where}: (b) the alert line's holder is ${least.free} px wider than its longest promise (${least.s}: ${least.holder} - ${least.promise}; at least ${MARGIN}), and (c) in each longest state the label, kind, figure, word and time are whole, the name keeps 8 characters and "…" or more (${shows.map((x) => `${x.s} ${x.k}`).join(", ")}), no fit class; "via Reuters" ${shows[2].src ? "beside the whole headline" : "not beside a cut headline"}`,
      least.free >= MARGIN && shows.every((x) => x.okState) && !shows[2].src, shows);
    // (d) focus and typing
    const d = await typing(p);
    ck(`${where}: (d) with the focus in the box, with "t" typed and the list open, and with a 33-character query: no sideways scroll (${d.focus.over}, ${d.typed.over}, ${d.long.over}), the box ${d.focus.box}, ${d.typed.box} and ${d.long.box} px, nothing in the row moved, one row (${d.long.h} px)`, d.ok, d);
    // (e) the menu
    await p.click("#more-btn"); await p.waitForTimeout(150);
    const e = await p.evaluate(() => { const box = document.querySelector("#more"), r = box.getBoundingClientRect(), kids = [...box.children].filter((x) => x.getClientRects().length);
      return { open: document.querySelector("#topbar").classList.contains("more"), expanded: document.querySelector("#more-btn").getAttribute("aria-expanded"), inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight, over: document.documentElement.scrollWidth - innerWidth, scrollX: Math.round(scrollX),
        items: kids.map((x) => (x.innerText || x.textContent || "").replace(/\s+/g, " ").trim()), cut: kids.filter((x) => x.scrollWidth > x.clientWidth + 0.5 || x.getBoundingClientRect().right > r.right + 0.5).map((x) => x.id || x.className) }; });
    const has = (re) => e.items.some((x) => re.test(x));
    await p.keyboard.press("Escape"); await p.waitForTimeout(80);
    const esc = await p.evaluate(() => ({ open: document.querySelector("#topbar").classList.contains("more"), focus: document.activeElement && document.activeElement.id }));
    ck(`${where}: (e) the menu ≡ opens a list inside the window with no sideways scroll and nothing cut: ${e.items.join(" | ")}; Escape closes it, the focus on ≡ ("${esc.focus}")`, e.open && e.expanded === "true" && e.inside && e.over <= 0 && e.scrollX === 0 && e.cut.length === 0 && has(/^\d\d:\d\d:\d\d SGT · \d\d:\d\d JST · \d\d:\d\d ET$/) && has(/TEXT SIZE|Text size/i) && has(/^COMPACT$/) && has(/FULL$/) && has(/^ABCDEFGHIJKLMN · ACCOUNT$/) && !esc.open && esc.focus === "more-btn", { e, esc });
    if (vw === 1440 && !six) {   // a second press, and a press outside: closed, the focus where that press put it
      await p.click("#more-btn"); await p.waitForTimeout(60); await p.click("#more-btn"); await p.waitForTimeout(60);
      const second = await p.evaluate(() => document.querySelector("#topbar").classList.contains("more"));
      await p.click("#more-btn"); await p.waitForTimeout(60); await p.click("#topbar .brand"); await p.waitForTimeout(120);
      const outside = await p.evaluate(() => ({ open: document.querySelector("#topbar").classList.contains("more"), focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }));
      ck(`${where}: the menu closes on a second press and on a press outside it, the focus where that press put it ("${outside.focus}")`, !second && !outside.open && outside.focus !== "more-btn", { second, outside });
    }
    if ([1300, 1440, 1536].includes(vw)) {   // the menu open, then "/" and a letter (the second checker's case, 22 Nov 2026)
      await p.click("#more-btn"); await p.waitForTimeout(60); await p.keyboard.press("/"); await p.keyboard.type("t");
      await p.waitForSelector("#search .sres .sitem", { timeout: 5000 }).catch(() => null); await p.waitForTimeout(120);
      const ws = await p.evaluate(() => { const box = (e) => (e && e.getClientRects().length ? e.getBoundingClientRect() : null), m = box(document.querySelector("#more")), l = box(document.querySelector("#search .sres"));
        return { open: document.querySelector("#topbar").classList.contains("more"), list: !!l, focus: document.activeElement && document.activeElement.tagName, over: !!(m && l && m.left < l.right && l.left < m.right && m.top < l.bottom && l.top < m.bottom) }; });
      await p.fill("#search input", ""); await p.keyboard.press("Escape"); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(80);
      ck(`${where}: the menu open, then "/" and "t": the menu closes as the focus goes to the search box, and nothing lies over the results list`, !ws.open && ws.list && ws.focus === "INPUT" && !ws.over, ws);
    }
    // (f) FULL from the menu
    await p.click("#more-btn"); await p.waitForTimeout(60); await p.click("#fs-ctl"); await p.waitForFunction(() => document.body.classList.contains("full"));
    const strip = await p.evaluate(() => (document.querySelector("#fsx")?.textContent ?? "").replace(/\s+/g, " ").trim());
    let k7 = null;
    if (!six) { await p.keyboard.press("7"); await p.waitForSelector("#pf-list", { timeout: 10000 }).catch(() => null); k7 = await p.evaluate(() => ({ hash: location.hash, view: document.querySelector("#grid")?.dataset.view })); }
    await p.keyboard.press("Escape"); await p.waitForFunction(() => !document.body.classList.contains("full")); await p.waitForTimeout(250);
    const back = await measure(p), fb = await fitClass(p);
    ck(`${where}: (f) FULL from the menu hides the header (the corner strip "${strip.slice(0, 16)}")${six ? "" : `, key 7 opens ${k7 && k7.hash}`}; Escape: the header back in one row (${back.h} px), the one-screen layout kept, no fit class`,
      new RegExp(`^1–${six ? 6 : 7} TABS · ESC`).test(strip) && (six || (k7 && k7.hash === "#portfolio" && k7.view === "portfolio")) && back.term && back.rows === 1 && back.h <= 25 && fb === "", { strip, k7, back: { term: back.term, rows: back.rows, h: back.h }, fb });
    ck(`${where}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }

  console.log("\n[(g) the floor: COMPACT on in a layout under 1,300 px gives the scrolling layout, and its chip says why]");
  for (const [vw, vh, size] of [[1100, 800, "AUTO"], [1104, 800, "S"], [1280, 720, "M"], [1440, 900, "L"], [1440, 900, "XL"]]) {
    const { ctx, p, errs } = await open(b, { vw, vh, size });
    await go(p);
    const f = await p.evaluate(() => { const c = document.querySelector("#cmp-ctl"), mb = document.querySelector("#more-btn"); return { term: document.body.classList.contains("term"), cmp: document.body.classList.contains("cmp"), W: Math.round(innerWidth / (Number(document.body.style.zoom) || 1)), shown: !!c && c.getClientRects().length > 0, opacity: c ? getComputedStyle(c).opacity : null, title: c ? c.title : null, btn: !!mb && mb.getClientRects().length > 0 }; });
    ck(`${vw}x${vh}, text ${size}, COMPACT on (a layout of ${f.W} px): no one-screen layout; COMPACT stays lit in the row at ${f.opacity} opacity and says why; no ≡`, !f.term && f.cmp && f.shown && Math.abs(Number(f.opacity) - 0.55) < 0.01 && /^COMPACT is on\. One screen per tab needs a layout 1,300 px wide: a window of 1,170 px at AUTO, 1,105 at S, 1,300 at M, 1,495 at L, 1,755 at XL\. This window scrolls\. Click to turn COMPACT off\.$/.test(f.title) && !f.btn && errs.length === 0, { f, errs });
    await ctx.close();
  }

  console.log("\n[(h) outside the one-screen layout nothing changed]");
  for (const [what, opts] of [["1000x800, COMPACT on", { vw: 1000, vh: 800 }], ["1440x900, COMPACT off", { vw: 1440, vh: 900, compact: false }]]) {
    const { ctx, p, errs } = await open(b, opts);
    await go(p);
    const s = await p.evaluate(() => { const mb = document.querySelector("#more-btn"), u = document.querySelector("#userchip"); return { term: document.body.classList.contains("term"), btn: !!mb && mb.getClientRects().length > 0, clock: document.querySelector("#clock").innerText.replace(/\s+/g, " ").trim(), clockTip: document.querySelector("#clock").title, user: !!u && u.getClientRects().length > 0 && !u.closest("#more")?.getClientRects().length, words: getComputedStyle(document.querySelector("#topbar .brand .bw")).display }; });
    ck(`${what}: the row as before: the clocks "${s.clock}", the account in the row, no ≡, the Monitor's name in words`, !s.term && !s.btn && /^\d\d:\d\d:\d\d SGT · \d\d:\d\d JST · \d\d:\d\d ET$/.test(s.clock) && s.clockTip === "Singapore time (default), Tokyo, New York" && s.user && s.words !== "none" && errs.length === 0, { s, errs });
    await ctx.close();
  }
  { const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
    await ctx.addInitScript(([at]) => { try { localStorage.setItem("om_mock_now", at); localStorage.setItem("om_a2hs_hide", "1"); } catch {} }, [MORNING]);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(MOCK + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-row.inst", { timeout: 20000 }); await settle(p, 300);
    await p.locator("#pv2-btns button").last().tap(); await p.waitForTimeout(350);
    const s = await p.evaluate(() => { const mb = document.querySelector("#more-btn"), u = document.querySelector("#userchip"); return { btn: !!mb && mb.getClientRects().length > 0, clock: document.querySelector("#clock").innerText.replace(/\s+/g, " ").trim(), user: !!u && u.getClientRects().length > 0, open: document.querySelector("#topbar").classList.contains("open") }; });
    ck(`iPhone 13 with the menu open: the clocks "${s.clock}" and the account in it, no ≡`, s.open && !s.btn && /^\d\d:\d\d:\d\d SGT · \d\d:\d\d JST · \d\d:\d\d ET$/.test(s.clock) && s.user && errs.length === 0, { s, errs });
    await ctx.close(); }

  console.log("\n[(i) a wider drawing: DejaVu Sans forced on every element, seven tabs]");
  for (const [vw, vh, size] of [[1280, 720, "AUTO"], [1495, 900, "L"]]) {
    const where = `${vw}x${vh}${size === "AUTO" ? "" : `, text ${size}`}, DejaVu Sans`;
    const { ctx, p, errs } = await open(b, { vw, vh, size });
    await go(p); await p.addStyleTag({ content: DEJAVU }); await settle(p, 400); await longChips(p); await p.waitForTimeout(150);
    const m = await measure(p), a = m.alert, f0 = await fitClass(p);
    ck(`${where}: (a) one row, ${m.h} px, nothing past the window; (c) the stand-in alert whole (${a.wholeParts.join(", ")}), no fit class`, m.term && m.rows === 1 && m.h <= 25 && m.pastWindow.length === 0 && ["label", "name", "figure", "word", "time"].every((k) => a.wholeParts.includes(k)) && f0 === "", { m, f0 });
    const shows = [];
    for (const s of ["sigma", "stock", "news"]) {
      await p.evaluate(`(${STATE})(${JSON.stringify(s)})`); await p.waitForTimeout(100);
      const ms = await measure(p), al = ms.alert, want = s === "news" ? ["label", "kind", "time"] : s === "sigma" ? ["label", "kind", "figure", "time"] : ["label", "figure", "word", "time"], k = await shownChars(p), fc = await fitClass(p);
      shows.push({ s, ok: want.every((x) => al.wholeParts.includes(x)) && ms.rows === 1 && ms.h <= 25 && ms.sideways <= 0 && k >= 8 && fc === "", k, fit: fc });
    }
    await p.evaluate(`(${STATE})("standin")`); await p.waitForTimeout(60);
    ck(`${where}: (c) in each longest state the label, kind, figure, word and time whole, the name 8 characters and "…" or more (${shows.map((x) => `${x.s} ${x.k}`).join(", ")}), no fit class`, shows.every((x) => x.ok), shows);
    const d = await typing(p);
    ck(`${where}: (d) no sideways scroll with the focus, with the list open and with a 33-character query, the box 96 px, nothing moved, one row`, d.ok, d);
    ck(`${where}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }
  for (const vw of [1448, 1458]) {   // the checker's case (A.5): DejaVu Sans and 0.9 px added to every letter, text M, the stock move
    const { ctx, p, errs } = await open(b, { vw, vh: 900, size: "M" });
    await go(p); await p.addStyleTag({ content: DEJAVU }); await settle(p, 300); await longChips(p); await spaced(p, 0.9); await p.waitForTimeout(150);
    await p.evaluate(`(${STATE})("stock")`); await p.waitForTimeout(150);
    const k = await shownChars(p), fc = await fitClass(p), m = await measure(p);
    ck(`${vw}x900, text M, DejaVu Sans and 0.9 px more to every letter, the stock move: the name keeps ${k} characters and "…"${fc ? `, the fit has acted (${fc})` : ""}: at least 8, or the label has left; the figure, the word and the time whole; one row`, (k >= 8 || fc === "a-nolabel") && ["figure", "word", "time"].every((x) => m.alert.wholeParts.includes(x)) && m.rows === 1 && m.term && errs.length === 0, { k, fc, alert: m.alert, rows: m.rows, errs });
    await ctx.close();
  }
  { // the fit's last step (A.2.5 step 3): 7 px more to every letter, where the row's fixed items alone pass the row (A.5)
    const { ctx, p, errs } = await open(b, { vw: 1440, vh: 900 });
    await go(p); await longChips(p); await spaced(p, 7); await p.waitForTimeout(400);
    const st = () => p.evaluate(() => { const c = document.querySelector("#cmp-ctl"); return { term: document.body.classList.contains("term"), cmp: document.body.classList.contains("cmp"), shown: !!c && c.getClientRects().length > 0 && !c.closest("#more")?.getClientRects().length, opacity: c ? getComputedStyle(c).opacity : null, title: c ? c.title : null }; });
    const r = await st();
    await p.evaluate(() => document.body.querySelectorAll("*").forEach((e) => e.style && e.style.removeProperty("letter-spacing")));
    await p.setViewportSize({ width: 1500, height: 900 }); await p.waitForTimeout(400);
    const other = await p.evaluate(() => document.body.classList.contains("term"));
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(400);
    const again = await st();
    ck(`1440x900, 7 px more to every letter: the one-screen layout is refused for this window and text size, COMPACT stays lit in the row at ${r.opacity} opacity and says why; another window size tries again (${other ? "one-screen" : "refused"}); back at 1440x900 it stays refused for the page's life`,
      !r.term && r.cmp && r.shown && Math.abs(Number(r.opacity) - 0.55) < 0.01 && /^COMPACT is on\. This browser draws the one-screen header wider than this window holds, so the window scrolls\. Another window size or text size tries again\. Click to turn COMPACT off\.$/.test(r.title) && other && !again.term && again.title === r.title && errs.length === 0, { r, other, again, errs });
    await ctx.close();
  }

  console.log(`\n${Math.round((Date.now() - t0) / 1000)} s`);
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
