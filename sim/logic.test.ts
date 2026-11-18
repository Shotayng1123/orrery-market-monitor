// Logic checks that need no browser and no database: exchange sessions (web and server copies must agree),
// rolling sigma bands, exchange-local dating of Yahoo bars.  Run:  cd jobs && npx tsx ../sim/logic.test.ts
import * as web from "../web/src/lib/sessions.ts";
import * as srv from "../supabase/functions/_shared/sessions.ts";
import { rollingBands, pct } from "../web/src/lib/stats.ts";
import { fxClosesFromDaily, fxClosesFromHourly, fxDay, suspectBars } from "../supabase/functions/_shared/fx.ts";
import { AFTER_CLOSE_MIN, quoteMove, scanDue, sessionMove, stockMarket } from "../supabase/functions/_shared/moves.ts";

let pass = 0, fail = 0;
const ck = (name: string, cond: boolean, detail?: unknown) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
const at = (iso: string) => new Date(iso);

console.log("\n[A] Tokyo session (TSE 09:00–11:30, 12:30–15:30 JST)");
{
  const m = web.marketById("TSE"), s = srv.marketById("TSE")!;
  const cases: Array<[string, web.MarketState]> = [
    ["2026-11-08T23:59:00Z", "CLOSED"], ["2026-11-09T01:00:00Z", "OPEN"], ["2026-11-09T02:29:00Z", "OPEN"], ["2026-11-09T02:30:00Z", "BREAK"],
    ["2026-11-09T03:29:00Z", "BREAK"], ["2026-11-09T03:30:00Z", "OPEN"], ["2026-11-09T06:29:00Z", "OPEN"], ["2026-11-09T06:30:00Z", "CLOSED"], ["2026-11-07T02:00:00Z", "CLOSED"],
  ];
  for (const [iso, want] of cases) {
    const w = web.marketStatus(m, at(iso)).state, v = srv.marketState(s, at(iso));
    ck(`${iso} -> ${want}`, w === want && v === want, { web: w, srv: v });
  }
  ck("recentlyClosed 15:40 JST true", srv.recentlyClosed(s, at("2026-11-09T06:40:00Z")));
  ck("recentlyClosed 16:20 JST false", !srv.recentlyClosed(s, at("2026-11-09T07:20:00Z")));
  web.setHolidays({ TSE: ["2026-11-23"] });
  ck("holiday 2026-11-23 10:00 JST -> HOLIDAY (web)", web.marketStatus(m, at("2026-11-23T01:00:00Z")).state === "HOLIDAY");
  ck("holiday 2026-11-23 10:00 JST -> HOLIDAY (srv)", srv.marketState(s, at("2026-11-23T01:00:00Z"), { TSE: new Set(["2026-11-23"]) }) === "HOLIDAY");
}

console.log("\n[B] New York (09:30–16:00 ET, EST in November)");
{
  const m = web.marketById("NYSE");
  ck("14:29Z closed", web.marketStatus(m, at("2026-11-09T14:29:00Z")).state === "CLOSED");
  ck("14:30Z open", web.marketStatus(m, at("2026-11-09T14:30:00Z")).state === "OPEN");
  ck("20:59Z open", web.marketStatus(m, at("2026-11-09T20:59:00Z")).state === "OPEN");
  ck("21:00Z closed", web.marketStatus(m, at("2026-11-09T21:00:00Z")).state === "CLOSED");
}

console.log("\n[C] FX (Mon 05:00 SGT to Sat 06:00 SGT) and CME Globex (Sun 18:00 ET to Fri 17:00 ET, daily 17:00–18:00 break)");
{
  const fx = web.marketById("FX"), cme = web.marketById("CME");
  ck("FX Sat 10:00 SGT closed", web.marketStatus(fx, at("2026-11-07T02:00:00Z")).state === "CLOSED");
  ck("FX Sat 04:00 SGT open", web.marketStatus(fx, at("2026-11-06T20:00:00Z")).state === "OPEN");
  ck("FX Mon 04:00 SGT closed", web.marketStatus(fx, at("2026-11-08T20:00:00Z")).state === "CLOSED");
  ck("FX Mon 05:30 SGT open", web.marketStatus(fx, at("2026-11-08T21:30:00Z")).state === "OPEN");
  ck("CME Sun 17:00 ET closed", web.marketStatus(cme, at("2026-11-08T22:00:00Z")).state === "CLOSED");
  ck("CME Sun 18:30 ET open", web.marketStatus(cme, at("2026-11-08T23:30:00Z")).state === "OPEN");
  ck("CME Thu 17:30 ET break", web.marketStatus(cme, at("2026-11-05T22:30:00Z")).state === "CLOSED");
  ck("CME Thu 18:30 ET open", web.marketStatus(cme, at("2026-11-05T23:30:00Z")).state === "OPEN");
  ck("CME Fri 17:30 ET closed", web.marketStatus(cme, at("2026-11-06T22:30:00Z")).state === "CLOSED");
  ck("anyOpen Sat 08:00 SGT true (crypto trades all week; FX is shut)", web.anyOpen(at("2026-11-07T00:00:00Z")) && web.marketStatus(web.marketById("FX"), at("2026-11-07T00:00:00Z")).state === "CLOSED");
  ck("anyOpen Tue 03:00 SGT true (FX)", web.anyOpen(at("2026-11-09T19:00:00Z")));
}

console.log("\n[D] rolling bands and percentages");
{
  const { mean, sd } = rollingBands([1, 2, 3, 4, 5], 3);
  ck("mean null before the window fills", mean[0] === null && mean[1] === null);
  ck("mean [2,3,4]", mean[2] === 2 && mean[3] === 3 && mean[4] === 4, mean);
  ck("population sd of [1,2,3] = 0.8165", Math.abs((sd[2] ?? 0) - Math.sqrt(2 / 3)) < 1e-12, sd);
  const g = rollingBands([1, null, 3, 4, 5], 3);
  ck("a null inside the window leaves the band undefined there", g.mean[2] === null && g.mean[3] === null && g.mean[4] === 4, g.mean);
  ck("pct 100 -> 110 = +10", pct(100, 110) === 10.000000000000009 || Math.abs((pct(100, 110) ?? 0) - 10) < 1e-9);
  ck("pct with missing = null", pct(null, 5) === null && pct(0, 5) === null);
}

console.log("\n[E] exchange-local dating of Yahoo daily bars");
{
  ck("Tokyo bar 2026-11-06T00:00Z dates 2026-11-06", srv.localDate("Asia/Tokyo", 1793923200) === "2026-11-06");
  ck("New York bar 14:30Z dates the same US day", srv.localDate("America/New_York", Date.UTC(2026, 10, 6, 14, 30) / 1000) === "2026-11-06");
  ck("London FX bar 00:00Z dates that day", srv.localDate("Europe/London", Date.UTC(2026, 10, 6) / 1000) === "2026-11-06");
  ck("CME bar stamped 23:00Z Thursday dates Thursday in New York", srv.localDate("America/New_York", Date.UTC(2026, 10, 5, 23) / 1000) === "2026-11-05");
}

console.log("\n[F] currency pairs: the day ends at 17:00 New York; vendor misprints");
{
  const u = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  ck("Fri 21:59Z (16:59 EST) is Friday", fxDay(u(2026, 11, 13, 21, 59)) === "2026-11-13");
  ck("Thu 22:00Z (17:00 EST) rolls to Friday", fxDay(u(2026, 11, 12, 22)) === "2026-11-13");
  ck("the weekend gap still belongs to Friday (a quote re-stamped Sat 05:49Z, Sun 21:00Z)", fxDay(u(2026, 11, 14, 5, 49)) === "2026-11-13" && fxDay(u(2026, 11, 15, 21)) === "2026-11-13");
  ck("Sun 22:05Z (17:05 EST, the weekly open) is Monday", fxDay(u(2026, 11, 15, 22, 5)) === "2026-11-16");
  ck("summer: Wed 20:59Z (16:59 EDT) is Wednesday", fxDay(u(2026, 7, 15, 20, 59)) === "2026-07-15");
  ck("summer: Wed 21:00Z (17:00 EDT) is Thursday", fxDay(u(2026, 7, 15, 21)) === "2026-07-16");
  // hourly bars from Thu 20:00Z to Fri 21:00Z, then the Sunday open
  const ts: number[] = [], cl: number[] = [];
  for (let h = 20; h <= 45; h++) { ts.push(u(2026, 11, 12, 0) + h * 3600); cl.push(100 + h); }
  ts.push(u(2026, 11, 15, 22)); cl.push(999);
  const got = fxClosesFromHourly(ts, cl, u(2026, 11, 14, 9));
  ck("hourly: Thursday closes on the 21:00Z bar, Friday on its last bar", JSON.stringify(got) === JSON.stringify([{ d: "2026-11-12", close: 121 }, { d: "2026-11-13", close: 145 }]), got);
  ck("hourly: an unfinished day is not booked", fxClosesFromHourly(ts, cl, u(2026, 11, 13, 20)).every((x) => x.d !== "2026-11-13"));
  ck("hourly: no weekend date and nothing after 'now'", fxClosesFromHourly(ts, cl, u(2026, 11, 15, 23)).every((x) => x.d <= "2026-11-13"));
  // daily bars stamped 00:00 London describe the previous FX day; Monday's bar stands in for Friday
  const dd = fxClosesFromDaily([u(2026, 11, 12, 0), u(2026, 11, 13, 0), u(2026, 11, 16, 0)], [1, 2, 3]);
  ck("daily: re-dated to the day that closed", JSON.stringify(dd) === JSON.stringify([{ d: "2026-11-11", close: 1 }, { d: "2026-11-12", close: 2 }, { d: "2026-11-13", close: 3 }]), dd);
  const dst = fxClosesFromDaily([u(2026, 3, 17, 0), u(2026, 7, 14, 23), u(2026, 10, 27, 0)], [1, 2, 3]).map((x) => x.d).join();
  ck("daily: summer time and the weeks when the clocks differ", dst === "2026-03-16,2026-07-14,2026-10-26", dst);
  const s = (xs: number[]) => xs.map((c, k) => ({ d: "2026-01-" + String(k + 1).padStart(2, "0"), close: c }));
  ck("misprint: one bad day between agreeing neighbours", suspectBars(s([18.1, 18.2, 18.2, 14.9, 18.2, 17.9, 18.0]), 0.12).map((x) => x.close).join() === "14.9");
  ck("misprint: two bad days in a row (an ETF reported at a tenth)", suspectBars(s([383.6, 382.6, 382.7, 37.64, 37.14, 389.2, 383, 386.6]), 0.3).map((x) => x.close).join() === "37.64,37.14");
  ck("a real crash that holds is kept", suspectBars(s([100, 101, 100, 60, 61, 59, 60]), 0.3).length === 0);
  ck("a real sell-off day that partly reverts is kept", suspectBars(s([5791, 5800, 5791, 5093, 5583, 5600, 5590]), 0.3).length === 0);
  ck("the newest two bars are never judged", suspectBars(s([18, 18, 18, 18, 18, 14, 18]), 0.12).length === 0);
}

console.log("\n[G] stock alerts: the whole session is measured, and the scan runs on after the close");
{
  // one-minute closes from 09:00 JST on 18 Nov 2026 (00:00 UTC); previous close 1000
  const t0 = Date.parse("2026-11-18T00:00:00Z") / 1000, bars = (v: Array<number | null>) => ({ ts: v.map((_, i) => t0 + i * 60), v });
  // a dip through -7% that lasts three minutes and comes back: 09:01 -6.8, 09:02 -7.2, 09:03 -7.5, 09:04 -7.1, 09:05 -6.6 ... close -5.7
  const dip = bars([940, 932, 928, 925, 929, 934, 938, 940, 941, 942, 943, 943]);
  const m = sessionMove(dip.ts, dip.v, 1000, 7);
  ck("a dip beyond -7% that comes back within five minutes is caught", !!m && Math.abs(m.pct - -7.5) < 1e-9 && m.price === 925, m);
  ck("its time is the first minute beyond the threshold (09:02), not the low", !!m && m.crossT === t0 + 120, m && new Date(m.crossT * 1000).toISOString());
  ck("the latest bar alone would raise nothing (the test used until 18 Nov)", !!m && Math.abs(m.lastPct) < 7 && m.lastT === t0 + 11 * 60, m);
  ck("a stock that stays inside ±7% raises nothing", sessionMove(dip.ts, [960, 950, 940, 931, 935, 940, 945, 950, 950, 950, 950, 950], 1000, 7) === null);
  ck("exactly -7.0% counts (930 against 1000, whatever floating point makes of it), -6.99% does not", sessionMove([t0], [930], 1000, 7) !== null && sessionMove([t0], [1070], 1000, 7) !== null && sessionMove([t0], [930.1], 1000, 7) === null);
  const up = sessionMove(dip.ts, [1050, 1072, 1090, 1120, 1110, 1100, 1095, 1090, 1085, 1080, 1078, 1075], 1000, 7);
  ck("a rise: the largest move of the session is kept after it fades (+12%, first passed at 09:01)", !!up && Math.abs(up.pct - 12) < 1e-9 && up.crossT === t0 + 60, up);
  const both = sessionMove(dip.ts, [1072, 1080, 1000, 950, 910, 905, 920, 940, 950, 960, 960, 960], 1000, 7);
  ck("up 8% then down 9.5%: the larger move is reported, the time is the first crossing", !!both && Math.abs(both.pct - -9.5) < 1e-9 && both.crossT === t0, both);
  const gaps = sessionMove(dip.ts, [null, null, 925, null, 0, 940, null, null, null, null, null, null], 1000, 7);
  ck("minutes without a trade and zero prices are skipped", !!gaps && gaps.price === 925 && gaps.crossT === t0 + 120 && gaps.lastT === t0 + 300, gaps);
  ck("no previous close, no alert", sessionMove(dip.ts, dip.v, null, 7) === null && sessionMove(dip.ts, dip.v, 0, 7) === null && sessionMove([], [], 1000, 7) === null);
  // the scan window: Tokyo prices are 20 minutes late, so the scan runs to 15:30 + 20 + 15 = 16:05 JST
  const tse = srv.marketById("TSE")!, ny = srv.marketById("NYSE")!;
  ck("after-close allowance is the feed delay plus 15 minutes", AFTER_CLOSE_MIN === 15 && tse.delayMin === 20 && ny.delayMin === 0);
  const due = (iso: string, mk = tse, h = {}) => scanDue(mk, at(iso), h);
  ck("Tokyo: not before the open (08:55 JST)", !due("2026-11-17T23:55:00Z"));
  ck("Tokyo: in the session and in the lunch break", due("2026-11-18T00:00:00Z") && due("2026-11-18T03:00:00Z") && due("2026-11-18T06:25:00Z"));
  ck("Tokyo: still due at 15:30, 15:50 and 16:00 JST, when the closing prices arrive", due("2026-11-18T06:30:00Z") && due("2026-11-18T06:50:00Z") && due("2026-11-18T07:00:00Z"));
  ck("Tokyo: over at 16:05 JST", !due("2026-11-18T07:05:00Z") && !due("2026-11-18T09:00:00Z"));
  ck("Tokyo: not on a Saturday, not on a holiday", !due("2026-11-21T03:00:00Z") && !due("2026-11-23T06:40:00Z", tse, { TSE: new Set(["2026-11-23"]) }));
  ck("New York: due at the close and ten minutes after (16:00, 16:10 ET), over at 16:15", due("2026-11-18T21:00:00Z", ny) && due("2026-11-18T21:10:00Z", ny) && !due("2026-11-18T21:15:00Z", ny));
}

console.log("\n[H] stock alerts beyond the Nikkei 225 and S&P 500: the day range of a quote, and which symbols are stocks");
{
  // Rakuten Bank, 18 Nov 2026: reported down almost 17% at the daily limit (figures here are made up to that shape)
  const lim = quoteMove(6000, 5000, 6010, 7);
  ck("a limit-down day: the low against the previous close (-16.7%)", !!lim && Math.abs(lim.pct - (5000 / 6000 - 1) * 100) < 1e-9 && lim.price === 5000, lim);
  const back = quoteMove(1000, 925, 1004, 7);
  ck("a low of -7.5% counts even when the stock has come back since", !!back && Math.abs(back.pct - -7.5) < 1e-9 && back.price === 925, back);
  const up = quoteMove(1000, 995, 1120, 7);
  ck("a high of +12% is reported as a rise", !!up && Math.abs(up.pct - 12) < 1e-9 && up.price === 1120, up);
  const both = quoteMove(1000, 900, 1080, 7);
  ck("low -10% and high +8% on one day: the larger one", !!both && Math.abs(both.pct - -10) < 1e-9, both);
  ck("a day inside ±7% raises nothing; exactly 7.0% counts", quoteMove(1000, 931, 1069, 7) === null && quoteMove(1000, 930, 1000, 7) !== null && quoteMove(1000, 1000, 1070, 7) !== null);
  ck("no previous close or no range: nothing", quoteMove(null, 900, 1100, 7) === null && quoteMove(0, 900, 1100, 7) === null && quoteMove(1000, null, null, 7) === null);
  ck("only one side known: that side is used", quoteMove(1000, null, 1090, 7)?.pct === 9.000000000000007 || Math.abs((quoteMove(1000, null, 1090, 7)?.pct ?? 0) - 9) < 1e-9);
  const mk = (s: string) => stockMarket(s);
  ck("Tokyo stocks, including the new-style codes: 5838.T, 7203.T, 285A.T", mk("5838.T") === "TSE" && mk("7203.T") === "TSE" && mk("285A.T") === "TSE");
  ck("US tickers have no suffix: NVDA, BRK-B, T", mk("NVDA") === "NYSE" && mk("BRK-B") === "NYSE" && mk("T") === "NYSE");
  ck("Hong Kong, Seoul, Shanghai and Shenzhen, London", mk("0700.HK") === "HKEX" && mk("005930.KS") === "KRX" && mk("600519.SS") === "SSE" && mk("000001.SZ") === "SSE" && mk("SHEL.L") === "LSE");
  ck("not stocks: an index, a currency pair, a future, a yield, crypto", [mk("^N225"), mk("USDJPY=X"), mk("GC=F"), mk("^TNX"), mk("BTC-USD")].every((x) => x === null));
  ck("an exchange with no session times kept, or nonsense: skipped", mk("ABC.XX") === null && mk("") === null && mk("7203.t") === null);
  ck("every market a symbol can map to has session times", ["5838.T", "0700.HK", "005930.KS", "600519.SS", "2330.TW", "RELIANCE.NS", "D05.SI", "BHP.AX", "SAP.DE", "NESN.SW", "SHEL.L", "PETR4.SA", "WALMEX.MX", "NVDA"].every((s) => { const id = mk(s); return !!id && !!srv.marketById(id); }));
  ck("a watched Hong Kong stock is scanned in Hong Kong hours and after its close, not at Tokyo's open", scanDue(srv.marketById("HKEX")!, at("2026-11-18T03:00:00Z")) && scanDue(srv.marketById("HKEX")!, at("2026-11-18T08:20:00Z")) && !scanDue(srv.marketById("HKEX")!, at("2026-11-18T00:30:00Z")));
}

console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
process.exit(fail ? 1 : 0);
