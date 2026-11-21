// The phone's first MARKETS screen (the designer's D-14 and note (b) of round 3b, 21 Nov 2026). The list started at
// y 790 on an iPhone SE, below the tab bar: the alert, the title, Movers in σ, the morning note and the install card
// stood above it, each as tall as its words wrapped. Every block above the list is now a fixed height on one line, so
// no font can move the list: the site header 52, the alert line 40 (+ 5 of margin and the header's rule), the title
// row 44, the σ head 44, the cards 76 (+ 6), the morning note 44, the install line 44 (+ its rule), the first class
// head 28 (+ the card's border). The first list row starts at y 386 with everything showing.
// The checks are on the room, which no font moves, and count rows only where they stand 50 px (in a wider font a
// row's state wraps to a second line, 63 px). The page's clock is set (`om_mock_now`), never the machine's: a weekend
// (the longest lines under each name) and a Tuesday morning; each once in the machine's fonts and once with a wide
// font forced, on an iPhone SE, an iPhone 13 and a Pixel 7.
//   - the blocks' heights, the room above the tab bar, nothing cut but the alert's name and the note's title, the rows;
//   - the other states: no alert (the line is not drawn), no fresh note, the install line hidden;
//   - the taps: the alert line, PERIOD, both parts of the toggle, the note's row, the install row and its ✕, 44 px each;
//   - the alert line's parts (the label, the kind, the name, the figure, the time, a chevron): only the name is cut,
//     also at 62 characters; no "intraday" and no publisher on it; "unavailable" when the list does not come.
// Run from web/:  node e2e/run.cjs phone-first   (the runner starts the servers this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const MOCK = "http://localhost:5179/orrery-market-monitor/", STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const SAT = "2026-11-21T06:12:00Z";       // Sat 21 Nov 14:12 SGT: every market but the coins' shut, each line with a date in it
const MORNING = "2026-11-23T23:10:00Z";   // Tue 24 Nov 07:10 SGT
const WIDE = "*{font-family:monospace!important}";
const PHONES = { P1: "iPhone SE (3rd gen)", P2: "iPhone 13", PX7: "Pixel 7" };
const ROWS4 = 203;   // four rows of 50 px with the three 1-px rules between them
async function page(b, code, clock, extra) {
  const ctx = await b.newContext({ ...devices[PHONES[code]], deviceScaleFactor: 1 });
  await ctx.addInitScript(([at, more]) => { try { if (at) localStorage.setItem("om_mock_now", at); localStorage.removeItem("om_a2hs_hide"); for (const [k, v] of Object.entries(more || {})) localStorage.setItem(k, v); } catch {} }, [clock || null, extra || null]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); return { ctx, p, errs };
}
const go = async (p, base, hash, sel) => { await p.goto(base + hash, { waitUntil: "networkidle" }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await p.evaluate(() => document.fonts.ready); await p.addStyleTag({ content: "#mockbar{display:none!important}" }); await p.waitForTimeout(450); };
// the screen as it stands at the top of the page: each block's place, the rows, what is cut, what a finger can hit
const screen = (p) => p.evaluate(() => {
  const px = (x) => Math.round(x * 10) / 10, R = (e) => e.getBoundingClientRect();
  const box = (sel) => { const e = document.querySelector(sel); if (!e || R(e).height === 0) return null; const r = R(e); return { y: px(r.top), b: px(r.bottom), h: px(r.height) }; };
  const nav = R(document.querySelector("#pnav")).top;
  const rows = [...document.querySelectorAll(".mp-row.inst")].map((r) => ({ n: r.querySelector(".n").textContent, y: px(R(r).top), b: px(R(r).bottom), h: px(R(r).height), st: r.querySelector(".mp-st").innerText.replace(/\s+/g, " ").trim() }));
  const cut = (sel) => [...document.querySelectorAll(sel)].filter((e) => R(e).width > 0 && e.scrollWidth > e.clientWidth + 1).map((e) => `${sel} "${e.textContent.slice(0, 24)}" ${e.clientWidth}/${e.scrollWidth}`);
  // how many px of height take a tap at the element's middle (what a finger hits, a ::before reach included)
  const tap = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = R(el), x = r.left + Math.min(r.width / 2, 40); let n = 0; for (let y = Math.floor(r.top) - 12; y <= Math.ceil(r.bottom) + 12; y++) { const hit = document.elementFromPoint(x, y); if (hit && (hit === el || el.contains(hit))) n++; } return { w: Math.round(r.width), h: n }; };
  const one = (sel) => { const e = document.querySelector(sel); if (!e) return null; const lh = parseFloat(getComputedStyle(e).lineHeight); return R(e).height <= (Number.isFinite(lh) ? lh : parseFloat(getComputedStyle(e).fontSize) * 1.4) * 1.5; };
  return { vw: innerWidth, vh: innerHeight, nav: px(nav), y0: Math.round(scrollY),
    blocks: { header: box("#topbar .brand"), alert: box("#alerts .alrt"), title: box(".mp-head"), sigma: box("#mk-sigma h2"), cards: box(".mp-sgrow"), note: box("#mk-note"), install: box("#mk-install"), first: box(".mp-sec.first h2") },
    firstRow: rows[0]?.y ?? null, room: rows[0] ? px(nav - rows[0].y) : null, rows: rows.slice(0, 8), whole: rows.filter((r) => r.y >= 0 && r.b <= nav + 0.5).length,
    // nothing cut but two texts: the alert's name and the note's title
    cut: [...cut("#alerts .alrt .k"), ...cut("#alerts .alrt .kd"), ...cut("#alerts .alrt .fig"), ...cut("#alerts .alrt .t"), ...cut(".mp-head h1"), ...cut("#mk-sigma h2 > span"), ...cut("#mk-sgpick button"), ...cut(".mp-sgcard .nm"), ...cut(".mp-sgcard .z"), ...cut(".mp-sgcard .day"), ...cut(".mp-sgcard .mv:not(.ls)"), ...cut(".mp-sgcard .mv.ls .f"), ...cut("#mk-note .k"), ...cut("#mk-install .t"), ...cut(".mp-sec.first h2")],
    mayCut: { name: cut("#alerts .alrt .one .nm").length, title: cut("#mk-note .t").length },
    lines: { alert: one("#alerts .alrt .one .nm"), noteK: one("#mk-note .k"), noteT: one("#mk-note .t"), install: one("#mk-install .t"), asof: one("#mk-sigma h2 .aux") },
    inside: (() => { const al = document.querySelector("#alerts .alrt"); if (!al) return null; const ar = R(al); return [...al.querySelectorAll(".k,.kd,.nm,.fig,.t")].filter((e) => R(e).width > 0).every((e) => R(e).left >= ar.left - 0.5 && R(e).right <= ar.right + 0.5); })(),
    taps: { alert: tap("#alerts .alrt"), period: tap(".mp-head .pick"), today: tap('#mk-sgpick [data-mode="today"]'), last: tap('#mk-sgpick [data-mode="last"]'), note: tap("#mk-note"), install: tap("#mk-install .open"), hide: tap("#mk-install .x") },
    sub: document.querySelector(".mp-head .mp-asof")?.innerText.trim() ?? "", h1: parseFloat(getComputedStyle(document.querySelector(".mp-head h1")).fontSize), asof: document.querySelector("#mk-sigma h2 .aux")?.textContent ?? null,
    ox: document.documentElement.scrollWidth - innerWidth };
});
const near = (v, want, tol = 0.5) => v != null && Math.abs(v - want) <= tol;

(async () => { const b = await chromium.launch();
  for (const [clock, when] of [[SAT, "a weekend, Sat 21 Nov 14:12 SGT (the longest lines)"], [MORNING, "Tue 24 Nov 07:10 SGT"]]) for (const code of ["P1", "P2", "PX7"]) {
    console.log(`\n[${code}, ${PHONES[code]}: ${when}]`);
    const { ctx, p, errs } = await page(b, code, clock);
    await go(p, MOCK, "#market", ".mp-row.inst");
    for (const font of ["the machine's fonts", "a wide font forced"]) {
      if (font !== "the machine's fonts") { await p.addStyleTag({ content: WIDE }); await p.waitForTimeout(400); }
      const v = await screen(p), B = v.blocks;
      ck(`${font}: the blocks, each its height: alert ${B.alert?.h}, title row ${B.title?.h}, σ head ${B.sigma?.h}, cards ${B.cards?.h}, morning note ${B.note?.h}, install line ${B.install?.h} (with its rule), first class head ${B.first?.h}`, near(B.alert?.h, 40) && near(B.title?.h, 44) && near(B.sigma?.h, 44) && near(B.cards?.h, 76) && near(B.note?.h, 44) && near(B.install?.h, 45) && near(B.first?.h, 28), B);
      ck(`${font}: one under the other: header to ${B.header?.b}, alert ${B.alert?.y}–${B.alert?.b}, title ${B.title?.y}–${B.title?.b}, σ head ${B.sigma?.y}–${B.sigma?.b}, cards ${B.cards?.y}–${B.cards?.b}, note ${B.note?.y}–${B.note?.b}, install ${B.install?.y}–${B.install?.b}, class head ${B.first?.y}–${B.first?.b}; the first list row at y ${v.firstRow}`, near(B.header?.b, 52, 1) && near(B.title?.y, 98, 1) && near(B.sigma?.y, B.title.b) && near(B.cards?.y, B.sigma.b) && near(B.note?.y, B.cards.b + 6) && near(B.install?.y, B.note.b) && near(B.first?.y, B.install.b) && near(v.firstRow, 386, 1), { B, first: v.firstRow });
      ck(`${font}: the room: the first list row's top (${v.firstRow}) is at most the tab bar's top (${v.nav}) less ${ROWS4} px: ${v.room} px of room`, v.room >= ROWS4 && v.y0 === 0, { firstRow: v.firstRow, nav: v.nav, room: v.room });
      ck(`${font}: nothing cut but the two texts that may be (the alert's name ${v.mayCut.name ? "is" : "is not"} cut here, the note's title ${v.mayCut.title ? "is" : "is not"}); every part of the alert line inside it; each of the one-line texts on one line; nothing sideways`, v.cut.length === 0 && v.inside === true && Object.values(v.lines).every((x) => x === true) && v.ox <= 0, { cut: v.cut, lines: v.lines, inside: v.inside, ox: v.ox });
      // the rows: four whole ones above the tab bar on P1 and P2; where a wider font wrapped a row's state, that row is printed and three are asked for
      const first4 = v.rows.slice(0, 4), tall = first4.filter((r) => r.h > 51), need = code === "PX7" ? (tall.length ? 6 : 7) : tall.length ? 3 : 4;
      ck(`${font}: ${v.whole} whole rows above the tab bar (at least ${need} asked for${tall.length ? `: ${tall.map((r) => `${r.n} stands ${r.h} px, "${r.st}"`).join("; ")}` : `, each of the first four ${[...new Set(first4.map((r) => r.h))].join(" or ")} px`})`, v.whole >= need && first4.every((r) => r.h >= 50), { whole: v.whole, need, rows: first4 });
      ck(`${font}: the taps, each at least 44 px high: the alert line ${v.taps.alert?.h}, PERIOD ${v.taps.period?.h}, the toggle ${v.taps.today?.h} and ${v.taps.last?.h}, the note's row ${v.taps.note?.h}, the install row ${v.taps.install?.h} and its ✕ ${v.taps.hide?.w} x ${v.taps.hide?.h}`, Object.values(v.taps).every((t) => t && t.h >= 44) && v.taps.hide.w >= 44 && v.taps.today.w >= 44 && v.taps.last.w >= 44, v.taps);
      if (font === "the machine's fonts") ck(`the title row: "Markets" at ${v.h1} px with no line under it ("${v.sub}"); the screen's as-of is in the σ head, under its title ("${v.asof}")`, v.h1 === 26 && !/as of/.test(v.sub) && /^as of \d{1,2} [A-Z][a-z]{2} \d\d:\d\d SGT$/.test(v.asof ?? ""), { h1: v.h1, sub: v.sub, asof: v.asof });
    }
    // the title row stays at the top when the page moves; the lines scroll away
    await p.evaluate(() => scrollTo(0, 900)); await p.waitForTimeout(300);
    const st = await p.evaluate(() => ({ head: Math.round(document.querySelector(".mp-head").getBoundingClientRect().top), lines: Math.round(document.querySelector("#mk-lines").getBoundingClientRect().bottom) }));
    ck("the title row stays at the top when the page moves; the note and the install line scroll away", st.head === 0 && st.lines < 0, st);
    ck("no page errors", errs.length === 0, errs); await ctx.close();
  }

  console.log("\n[the other states: no alert, no fresh note, the install line hidden]");
  for (const code of ["P1", "P2", "PX7"]) {
    const states = [
      ["no alert at all (the list is empty)", { om_mock_bare: "alerts" }, 341, { alert: false, note: true, install: true }],
      ["no fresh note", { om_mock_bare: "notes" }, 341, { alert: true, note: false, install: true }],
      ["the install line hidden", { om_a2hs_hide: "1" }, 341, { alert: true, note: true, install: false }],
      ["no fresh note and the install line hidden", { om_mock_bare: "notes", om_a2hs_hide: "1" }, 297, { alert: true, note: false, install: false }],
      ["none of the three", { om_mock_bare: "alerts,notes", om_a2hs_hide: "1" }, 252, { alert: false, note: false, install: false }],
    ];
    for (const [what, store, y, has] of states) {
      const { ctx, p, errs } = await page(b, code, MORNING);
      await ctx.addInitScript((more) => { try { for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v); } catch {} }, store);   // after the page's own set-up, so a hidden install line stays hidden
      await go(p, MOCK, "#market", ".mp-row.inst");
      const v = await screen(p), B = v.blocks, lines = await p.locator("#mk-lines").count(), alertBox = await p.locator("#alerts").count();
      ck(`${code}, ${what}: the first list row at y ${v.firstRow} (${y}), ${v.whole} whole rows above the tab bar; the alert line ${B.alert ? "drawn" : "not drawn"}, the note ${B.note ? "drawn" : "not"}, the install line ${B.install ? "drawn" : "not"}`, near(v.firstRow, y, 1) && !!B.alert === has.alert && !!B.note === has.note && !!B.install === has.install && (has.alert || alertBox === 0) && (has.note || has.install ? lines === 1 : lines === 0) && v.room >= ROWS4 && v.ox <= 0 && errs.length === 0, { firstRow: v.firstRow, B, lines, alertBox, errs });
      await ctx.close();
    }
  }

  console.log("\n[the alert line: the computer's parts on one line, and only the name ever cut]");
  { const { ctx, p, errs } = await page(b, "P1", MORNING);
    await go(p, MOCK, "#market", "#alerts .alrt");
    const line = () => p.evaluate(() => { const al = document.querySelector("#alerts .alrt"), R = (e) => e.getBoundingClientRect(), vis = (e) => !!e && getComputedStyle(e).display !== "none" && R(e).width > 0, part = (s) => { const e = al.querySelector(s); return vis(e) ? { text: e.textContent, w: Math.round(R(e).width), cut: e.scrollWidth > e.clientWidth + 1, fs: parseFloat(getComputedStyle(e).fontSize) } : null; };
      const order = [...al.querySelectorAll(".k,.kd,.nm,.fig,.t")].filter(vis).sort((a, c) => R(a).left - R(c).left).map((e) => e.className.split(" ")[0]);
      return { cls: al.className, h: R(al).height, k: part(".k"), kd: part(".one .kd"), nm: part(".one .nm"), fig: part(".one .fig"), q: part(".one .q"), src: part(".one .src"), t: part(".t"), msg: vis(al.querySelector(".msg")), chev: getComputedStyle(al, "::after").content, order, title: al.title, text: al.innerText.replace(/\s+/g, " ").trim(), nmWants: al.querySelector(".one .nm").scrollWidth, ellipsis: getComputedStyle(al.querySelector(".one .nm")).textOverflow }; });
    const a = await line();
    ck(`iPhone SE: "${a.text}" on one line of ${a.h} px: the label, the name, the figure in its sign's colour, the time, then a chevron (${a.order.join(" · ")}); no word after the figure, no sentence under it`, near(a.h, 40) && a.order.join() === "k,nm,fig,t" && /^(NEW )?ALERT$/.test(a.k.text) && a.nm.text === "KIOXIA HOLDINGS CORP." && a.fig.text === "-11.2%" && /^\d\d:\d\d$/.test(a.t.text) && a.q === null && a.src === null && !a.msg && /203A|›/.test(JSON.stringify(a.chev)) && a.k.fs >= 11 && a.t.fs >= 11, a);
    ck(`only the name is cut, with an ellipsis (${a.nm.w} px of the ${a.nmWants} it wants); the word the figure carries on a computer ("intraday") is in the line's tooltip`, a.nm.cut && a.ellipsis === "ellipsis" && !a.k.cut && !a.fig.cut && !a.t.cut && /KIOXIA HOLDINGS CORP\. down 11\.2% intraday/.test(a.title), a);
    // a name of 62 characters, a σ move and a news alert that names no company: the line as the same rules write them
    await p.evaluate(() => { document.querySelector("#alerts .alrt .one .nm").textContent = "SUMITOMO MITSUI FINANCIAL GROUP, INC. AND A LONGER NAME STILL."; }); await p.waitForTimeout(150);
    const long = await line(), ins = await p.evaluate(() => { const al = document.querySelector("#alerts .alrt"), ar = al.getBoundingClientRect(); return [...al.querySelectorAll(".k,.nm,.fig,.t")].every((e) => e.getBoundingClientRect().right <= ar.right + 0.5) && document.documentElement.scrollWidth <= innerWidth; });
    ck(`with a name of ${long.nm.text.length} characters the line is still ${long.h} px and nothing but the name is cut (the figure ${long.fig.w} px, the time ${long.t.w} px, both whole)`, near(long.h, 40) && long.nm.cut && !long.fig.cut && !long.t.cut && !long.k.cut && ins, long);
    await p.locator("#alerts .alrt").tap(); await p.waitForSelector(".aldrop.ph [data-kind]"); await p.waitForTimeout(200);
    const list = await p.evaluate(() => ({ n: document.querySelectorAll(".aldrop.ph [data-kind]").length, first: document.querySelector(".aldrop.ph [data-kind] .al-msg").textContent }));
    ck(`a tap opens the list, where the whole sentence is ("${list.first}")`, list.n >= 5 && /intraday$/.test(list.first), list);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { // the stand-in server: a σ move and a news alert as the newest, and a list that does not come
    const at = (min) => new Date(Date.now() - min * 60e3).toISOString();
    const sigma = { id: 902, at: at(5), d: at(5).slice(0, 10), symbol: "USDJPY=X", name: "USD/JPY", kind: "sigma", pct: 1.57, price: 158.4, market: "FX", msg: "USD/JPY +1.6% · 2.7σ · 158.400", url: null, sigma: 2.7, note: "σ of 63 daily changes to 20 Nov 2026 · Yahoo Finance" };
    const orphan = { id: 903, at: at(3), d: at(3).slice(0, 10), symbol: "news:4512", name: "M&A", kind: "mna", pct: null, price: 2100000000, market: "FT Markets", msg: "M&A: Two regional lenders agree to merge in a USD 2.1bn deal (stand-in)", url: "https://example.com/alert/mna" };
    for (const [what, answer, want] of [["a σ move", { rows: [sigma] }, { order: "k,kd,nm,fig,t", kd: "σ move", nm: "USD/JPY", fig: "+2.7σ" }], ["a news alert that names no company with a page", { rows: [orphan] }, { order: "k,kd,nm,t", kd: "M&A", nm: "Two regional lenders agree to merge in a USD 2.1bn deal (stand-in)", fig: null }], ["a list that does not come", null, null]]) {
      const { ctx, p, errs } = await page(b, "P1", null);
      await routes(p);
      await p.route("**/fakeapi?*", (r) => { if (new URL(r.request().url()).searchParams.get("action") !== "alerts") return r.fallback(); return answer ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(answer) }) : r.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "stand-in failure" }) }); });
      await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("#alerts .alrt"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(answer ? 400 : 2200);
      const a = await p.evaluate(() => { const al = document.querySelector("#alerts .alrt"), R = (e) => e.getBoundingClientRect(), vis = (e) => !!e && getComputedStyle(e).display !== "none" && R(e).width > 0, txt = (s) => { const e = al.querySelector(s); return vis(e) ? e.textContent : null; };
        return { h: R(al).height, cls: al.className, text: al.innerText.replace(/\s+/g, " ").trim(), order: [...al.querySelectorAll(".k,.kd,.nm,.fig,.t")].filter(vis).sort((x, y) => R(x).left - R(y).left).map((e) => e.className.split(" ")[0]).join(), kd: txt(".one .kd"), kdShown: al.querySelector(".one .kd") ? getComputedStyle(al.querySelector(".one .kd")).textTransform : null, nm: txt(".one .nm"), fig: txt(".one .fig"), src: txt(".one .src"), title: al.title, chev: getComputedStyle(al, "::after").content, colour: getComputedStyle(al.querySelector(".mut") ?? al).color, ox: document.documentElement.scrollWidth - innerWidth }; });
      if (want) ck(`${what}: "${a.text}" on one line of ${a.h} px, its kind before the name (${a.order}); no publisher on the line${what.startsWith("a news") ? `, which is in its tooltip ("…${a.title.split("\n")[0].slice(-34)}")` : ""}`, near(a.h, 40) && a.order === want.order && a.kd === want.kd && a.nm === want.nm && a.fig === want.fig && a.src === null && a.ox <= 0 && (!what.startsWith("a news") || /\(FT Markets\)/.test(a.title)), a);
      else ck(`${what}: "${a.text}", muted, on the same line of ${a.h} px, with no chevron`, near(a.h, 40) && a.text === "ALERT · unavailable" && /\bnone\b/.test(a.cls) && (a.chev === "none" || a.chev === "normal") && a.ox <= 0, a);
      ck(`${what}: no page errors`, errs.length === 0, errs); await ctx.close();
    }
  }

  console.log("\n[the morning note's row and the title row while the table has not come]");
  { const { ctx, p, errs } = await page(b, "P1", MORNING);
    await go(p, MOCK, "#market", "#mk-note");
    const n = await p.evaluate(() => { const a = document.querySelector("#mk-note"), k = a.querySelector(".k"), t = a.querySelector(".t"), cs = (e) => getComputedStyle(e); return { k: k.textContent, kShown: cs(k).textTransform, kFs: parseFloat(cs(k).fontSize), t: t.textContent, tFs: parseFloat(cs(t).fontSize), ellipsis: cs(t).textOverflow, tCut: t.scrollWidth > t.clientWidth + 1, tH: t.getBoundingClientRect().height, chev: a.querySelector(".go")?.textContent ?? null, href: a.getAttribute("href"), tip: a.title, lead: cs(document.querySelector("#mk-lines")).borderLeftWidth }; });
    ck(`the note's row: "${n.k}" (upper-cased, ${n.kFs} px) over its title on one line, cut with an ellipsis ("${n.t.slice(0, 40)}…", ${n.tFs} px), a chevron at the right; the whole title on its tooltip`, /^Morning note · \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(n.k) && n.kShown === "uppercase" && n.kFs === 11 && n.tFs === 14.5 && n.ellipsis === "ellipsis" && n.tCut && n.tH <= 20 && n.chev === "›" && /^#research\/note/.test(n.href) && n.tip === n.t && n.lead === "3px", n);
    await p.locator("#mk-note").tap(); await p.waitForSelector(".mp-doc h1"); await p.waitForTimeout(300);
    ck("a tap opens the note in RESEARCH", /^#research\/note/.test(await p.evaluate(() => location.hash)));
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }
  { // while the table fails the title row carries its line again (the check above does not apply to that state)
    const { ctx, p, errs } = await page(b, "P1", null);
    await routes(p);
    await p.route("**/fakeapi?*", (r) => (new URL(r.request().url()).searchParams.get("action") === "table" ? r.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "stand-in failure" }) }) : r.fallback()));
    await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector(".mp-head"); await p.waitForTimeout(2200);
    const v = await p.evaluate(() => ({ one: document.querySelector(".mp-head").classList.contains("one"), sub: document.querySelector(".mp-head .mp-asof")?.innerText.trim() ?? "", h: Math.round(document.querySelector(".mp-head").getBoundingClientRect().height), sigma: !!document.querySelector("#mk-sigma"), ox: document.documentElement.scrollWidth - innerWidth }));
    ck(`while the table does not come the line is under the title as before ("${v.sub.slice(0, 60)}"), the row ${v.h} px, and there is no σ head`, !v.one && v.sub.length > 0 && v.h > 44 && !v.sigma && v.ox <= 0, v);
    ck("no page errors", errs.length === 0, errs); await ctx.close(); }

  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0); })();
