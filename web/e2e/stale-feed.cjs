// A price feed that has stopped must be said on screen (lib/feed.ts; the server's reading is
// supabase/functions/_shared/feedhealth.ts). On 18 Nov 2026 every price was an hour and a half old with New York
// open and the header said DATA OK, because the jobs had run on time. Checked here on a desktop and in the phone
// layout: the bar at the foot of the screen and the DATA chip while the feed is stopped, both gone when prices
// arrive again, and nothing claimed for a server that does not give the reading.
// Run from web/:  node e2e/run.cjs stale-feed   (the runner starts the server this needs; see e2e/run.cjs)
const { chromium, devices } = require("playwright");
const { routes } = require("./harness.cjs");
const STANDIN = "http://localhost:5181/orrery-market-monitor/";
let fails = 0; const ck = (name, ok, d) => { if (!ok) fails++; console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const base = () => ({ ok: true, at: new Date().toISOString(), tick: { lastAt: new Date().toISOString(), ageMin: 1, ok: true, note: "stand-in" }, daily: { lastAt: new Date().toISOString(), ok: true, note: "stand-in" }, sources: [], holidays: {}, holidaysVerified: true });
const stopped = () => ({ expected: true, ok: false, newest: new Date(Date.now() - 99 * 60e3).toISOString(), symbol: "USDJPY=X", lateMin: 99 });
const arriving = () => ({ expected: true, ok: true, newest: new Date(Date.now() - 60e3).toISOString(), symbol: "USDJPY=X", lateMin: 1 });

(async () => { const b = await chromium.launch();
  for (const [name, opts, phone] of [["desktop", { viewport: { width: 1440, height: 900 } }, false], ["phone", { ...devices["iPhone 13"] }, true]]) {
    console.log(`\n[${name}]`);
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    let feed = stopped(), relay;   // relay: absent from a server older than the second path
    await routes(p);
    await p.route("**/fakeapi?*", (r) => { const a = new URL(r.request().url()).searchParams.get("action"); if (a !== "health") return r.fallback();
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ...base(), ...(feed ? { feed } : {}), ...(relay !== undefined ? { relay } : {}) }) }); });
    await p.goto(STANDIN + "#market", { waitUntil: "networkidle" }); await p.waitForSelector("#feedbar", { timeout: 8000 }); await p.waitForTimeout(300);
    const menu = async (open) => { if (!phone) return; const on = await p.evaluate(() => document.querySelector("#topbar").classList.contains("open")); if (on !== open) { await p.locator('#topbar button[aria-expanded]').click(); await p.waitForTimeout(250); } };
    const see = async () => { await menu(true); const v = await p.evaluate(() => { const bar = document.querySelector("#feedbar"), chip = document.querySelector("#hlth"), nav = document.querySelector("#pnav"), r = bar ? bar.getBoundingClientRect() : null;
      return { bar: bar ? bar.textContent : null, role: bar ? bar.getAttribute("role") : null, left: r ? Math.round(r.left) : null, right: r ? Math.round(r.right) : null, bottom: r ? Math.round(r.bottom) : null, navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null, vw: innerWidth, vh: innerHeight,
        chip: chip.textContent.trim(), chipCls: chip.className, title: chip.getAttribute("title"), over: document.documentElement.scrollWidth - innerWidth }; }); await menu(false); return v; };
    let v = await see();
    ck("the bar says no new price has arrived, since when and how far behind, and that the figures on screen are as of then", /^No new prices since \d\d\/\d\d \d\d:\d\d SGT \(1 h 39 min behind\)\. The source has stopped sending them; the figures on screen are as of then\.$/.test(v.bar ?? "") && v.role === "alert", v.bar);
    ck(`it fits the screen${phone ? " and sits above the tabs" : ""} (${v.left}–${v.right}px of ${v.vw}px)`, v.left >= 0 && v.right <= v.vw && v.over <= 0 && (phone ? v.bottom <= v.navTop : v.bottom <= v.vh), v);
    ck("the DATA chip reads as a failure and gives the reason first, although the jobs ran on time", /DATA\s*✕/.test(v.chip) && /hl-bad/.test(v.chipCls) && /^DATA HEALTH: NO NEW PRICES since \d\d\/\d\d \d\d:\d\d SGT \(1 h 39 min behind\): the source has stopped sending new prices; tick 1 min old/.test(v.title), { chip: v.chip, cls: v.chipCls, title: v.title });
    // prices arrive again: the next refresh takes the bar away
    feed = arriving(); await menu(true); await p.locator("#nxt").click(); await menu(false);
    await p.waitForFunction(() => !document.querySelector("#feedbar"), null, { timeout: 8000 }); v = await see();
    ck("when prices arrive again the bar goes and the chip says DATA OK", v.bar === null && /DATA\s*OK/.test(v.chip) && /hl-ok/.test(v.chipCls) && !/NO NEW PRICES/.test(v.title), { chip: v.chip, title: v.title });
    // a market that is closed, and a server from before the reading: nothing is claimed either way
    feed = { expected: false, ok: true, newest: null, symbol: null, lateMin: null }; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const closed = await see();
    feed = null; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const older = await see();
    ck("with every market closed, or a server that does not give the reading, there is no bar and the chip is as before", closed.bar === null && /DATA\s*OK/.test(closed.chip) && older.bar === null && /DATA\s*OK/.test(older.chip) && errs.length === 0, { closed: closed.chip, older: older.chip, errs });
    // the second path (19 Nov 2026): the relay on GitHub is writing, so prices are current, and the chip says how
    feed = arriving(); relay = { since: new Date(Date.now() - 42 * 60e3).toISOString(), ownLateMin: 52 }; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const second = await see();
    ck("while the second path is writing the prices there is no bar (they are current); the chip is amber and says since when and why", second.bar === null && /DATA\s*!/.test(second.chip) && /hl-warn/.test(second.chipCls) && /^DATA HEALTH: PRICES THROUGH THE SECOND PATH since \d\d\/\d\d \d\d:\d\d SGT: the source has stopped answering the Monitor's server \(its own answers are 52 min behind\), so a job on GitHub is pulling the prices and they are current; tick 1 min old/.test(second.title), { chip: second.chip, title: second.title });
    relay = null; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForTimeout(900);
    const handed = await see();
    feed = stopped(); relay = { since: new Date(Date.now() - 42 * 60e3).toISOString(), ownLateMin: 52 }; await menu(true); await p.locator("#nxt").click(); await menu(false); await p.waitForSelector("#feedbar", { timeout: 8000 });
    const both = await see();
    ck("handed back, the chip is green again; and if the prices stop although a relay is on, the red bar and DATA ✕ stand", /DATA\s*OK/.test(handed.chip) && !/SECOND PATH/.test(handed.title) && both.bar !== null && /DATA\s*✕/.test(both.chip) && /^DATA HEALTH: NO NEW PRICES/.test(both.title) && !/SECOND PATH/.test(both.title) && errs.length === 0, { handed: handed.chip, both: both.chip, title: both.title, errs });
    await ctx.close();
  }
  await b.close(); console.log(fails ? `\n✗ ${fails} check(s) failed` : "\n✓ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
