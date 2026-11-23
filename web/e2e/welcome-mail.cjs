// The welcome email as a reader sees it (supabase/functions/_shared/welcome.ts), drawn in a browser at the width
// of a mail program on a desktop and on a phone: its three pictures arrive from the site (the 1-minute tour's since
// slice 11, inside a link to the tour's page), nothing is wider than the screen, the opening is the italic serif it is
// meant to be, and its links go where they say. The words themselves are checked in sim/logic.test.ts.
// Run from web/:  node e2e/run.cjs welcome-mail   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium } = require("playwright");
const path = require("path");
const SITE = "http://localhost:5179/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

(async () => {
  // Node reads the TypeScript file as it is (it has no imports and only types to drop)
  const { welcomeMail, TABS } = await import(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "welcome.ts"));
  const m = welcomeMail(SITE);
  const b = await chromium.launch();
  for (const [name, w, h] of [["a desktop mail program", 760, 900], ["a phone", 390, 844]]) {
    console.log(`\n[${name}, ${w}px wide]`);
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.setContent(m.html, { waitUntil: "load" }); await p.waitForFunction(() => [...document.images].every((i) => i.complete)); await p.waitForTimeout(200);
    const v = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth, box = (e) => e.getBoundingClientRect();
      const wide = [...document.querySelectorAll("table,td,p,img,a")].filter((e) => box(e).right > vw + 0.5 || box(e).left < -0.5).map((e) => e.tagName + ":" + (e.textContent || e.getAttribute("src") || "").slice(0, 30));
      const q = [...document.querySelectorAll("p.om-quote")], welcome = [...document.querySelectorAll("p")].find((e) => e.textContent === "Welcome."), btn = [...document.querySelectorAll("a")].find((a) => /Open the Monitor/.test(a.textContent));
      const texts = [...document.querySelectorAll("p,td")].filter((e) => e.children.length === 0 && e.textContent.trim().length > 3);
      return { vw, over: document.documentElement.scrollWidth - vw, wide, imgs: [...document.images].map((i) => ({ src: i.getAttribute("src"), w: i.naturalWidth, shown: Math.round(box(i).width), link: i.closest("a")?.getAttribute("href") ?? null })),
        tour: [...document.querySelectorAll("a")].filter((a) => /Watch the 1-minute tour/.test(a.textContent)).map((a) => a.getAttribute("href")),
        quote: q.map((e) => { const cs = getComputedStyle(e); return { italic: cs.fontStyle, family: cs.fontFamily, px: parseFloat(cs.fontSize), top: box(e).top }; }), welcomeTop: welcome ? box(welcome).top : null,
        btn: btn ? { href: btn.getAttribute("href"), h: Math.round(box(btn).height), w: Math.round(box(btn).width) } : null, minPx: Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize))),
        tabs: [...document.querySelectorAll("td.om-tab a")].map((a) => [a.textContent, a.getAttribute("href"), Math.round(box(a.closest("tr")).height)]), card: Math.round(box(document.querySelectorAll("table")[1]).width), bg: getComputedStyle(document.body).backgroundColor };
    });
    ck("the Monitor's mark, the orrery and the 1-minute tour's picture arrive from the site, the last two shown at the card's width, the tour's inside a link to its page, as are the words \"Watch the 1-minute tour\"", v.imgs.length === 3 && v.imgs[0].src === SITE + "mail/mark.png" && v.imgs[0].w === 128 && v.imgs[0].shown === 30 && v.imgs[1].src === SITE + "mail/orrery.png" && v.imgs[1].w === 1200 && Math.abs(v.imgs[1].shown - v.card) <= 2 && v.imgs[2].src === SITE + "mail/tour.jpg" && v.imgs[2].w === 1200 && Math.abs(v.imgs[2].shown - v.card) <= 2 && v.imgs[2].link === SITE + "tour/" && v.tour.length === 1 && v.tour[0] === SITE + "tour/", { imgs: v.imgs, tour: v.tour });
    ck(`nothing is wider than the screen (the card is ${v.card}px of ${v.vw}px)`, v.over <= 0 && v.wide.length === 0 && v.card <= 600 && v.card >= Math.min(600, v.vw - 30), { over: v.over, wide: v.wide, card: v.card });
    ck(`the opening is three paragraphs of italic Times New Roman (${v.quote[0]?.px}px), above the welcome`, v.quote.length === 3 && v.quote.every((q) => q.italic === "italic" && /Times New Roman/.test(q.family) && q.px >= 19 && q.top < v.welcomeTop), v.quote);
    ck("the button opens the Monitor and is large enough for a thumb; the six tab names are links to their tabs", v.btn && v.btn.href === SITE && v.btn.h >= 40 && v.tabs.length === 6 && v.tabs.every((t, i) => t[0] === TABS[i][1] && t[1] === SITE + "#" + TABS[i][0]), { btn: v.btn, tabs: v.tabs });
    ck(`the smallest text is ${v.minPx}px; the page is dark like the Monitor; no errors`, v.minPx >= 11 && v.bg === "rgb(5, 5, 5)" && errs.length === 0, { minPx: v.minPx, bg: v.bg, errs });
    await p.close();
  }
  console.log("\n[pictures switched off]");
  { const p = await b.newPage({ viewport: { width: 390, height: 844 } }); await p.route("**/mail/*.{png,jpg}", (r) => r.abort()); await p.setContent(m.html, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(500);
    const v = await p.evaluate(() => ({ text: document.body.innerText, alt: document.images[1].alt, tourAlt: document.images[2]?.alt ?? null, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    ck("the email still reads whole: the name, the opening, the welcome and every section, with the banner's and the tour picture's own words in their place, and \"Watch the 1-minute tour\"", /Orrery Monitor/.test(v.text) && /In the early 1700s/.test(v.text) && /Welcome\./.test(v.text) && ["WHAT YOU CAN SEE", "ANY COMPANY", "ALERTS", "ON YOUR PHONE", "A GOOD FIRST FIVE MINUTES"].every((t) => v.text.toUpperCase().includes(t)) && /orrery/.test(v.alt) && /1-minute tour/.test(v.tourAlt ?? "") && /Watch the 1-minute tour/.test(v.text) && v.over <= 0, { alt: v.alt, tourAlt: v.tourAlt, over: v.over });
    await p.close(); }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
