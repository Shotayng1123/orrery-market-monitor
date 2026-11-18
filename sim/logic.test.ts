// Logic checks that need no browser and no database: exchange sessions (web and server copies must agree),
// rolling sigma bands, exchange-local dating of Yahoo bars.  Run:  cd jobs && npx tsx ../sim/logic.test.ts
import * as web from "../web/src/lib/sessions.ts";
import * as srv from "../supabase/functions/_shared/sessions.ts";
import { rollingBands, pct } from "../web/src/lib/stats.ts";
import { fxClosesFromDaily, fxClosesFromHourly, fxDay, suspectBars } from "../supabase/functions/_shared/fx.ts";
import { AFTER_CLOSE_MIN, closeMove, LARGE_STOCK_PCT, quoteMove, scanDue, sessionMove, STOCK_PCT, stockLine, stockMarket } from "../supabase/functions/_shared/moves.ts";
import { b64u, encryptPush, pushEndpointOk, unb64u, vapidHeader } from "../supabase/functions/_shared/webpush.ts";
import { alertNote, moveMark, notesFor, stampSgt, wanted, type AlertLite } from "../supabase/functions/_shared/pushrules.ts";
import { CODE_MAX_TRIES, CODE_TTL_MIN, checkRefusal, cleanCode, codeHash, codeMail, newCode, noticeMail, sendRefusal, verifyLink } from "../supabase/functions/_shared/signup.ts";
import { readVerify } from "../web/src/lib/verify.ts";
import { SmtpError, appPassword, buildMessage, dotStuff, parseFrom, smtpTalk, type Wire } from "../supabase/functions/_shared/smtp.ts";
import { mailReady, mailSetup, resendRequest } from "../supabase/functions/_shared/mail.ts";
import { avgTurnover, barOnOrBefore, betaCorr, maxDrawdown, monthsBack, perfRows, range52w, realisedVol, type Bar } from "../supabase/functions/_shared/stockstats.ts";
import { fyLabel, justReported, LAYOUT_FOREIGN, LAYOUT_JP, pickUnit, progress, qEndLabel, qLabel, quarterEnd, ratiosOf, resultsDateToWatch, singleQuarters, valuation, type FinPeriod, type FinRowId, type FinSet } from "../supabase/functions/_shared/fin.ts";
import { edinetCodeOf, edinetFin, edinetWaiting, legacyStatements, yahooFin, yahooFinTypes } from "../supabase/functions/_shared/finsrc.ts";
import { keyStatsOf } from "../supabase/functions/_shared/yahoo.ts";
import { bigMoves, isLargeCap, moveText, settledBars } from "../supabase/functions/_shared/bigmoves.ts";
import { liveRows } from "../supabase/functions/_shared/intraday.ts";
import { CAUSE_SYSTEM, causeQuestion, readCause, type MoveCtx } from "../supabase/functions/_shared/movecause.ts";
import { ALERTS, COMPANY, FIRST, PHILOSOPHY, PHONE, TABS, WELCOME_SUBJECT, welcomeMail } from "../supabase/functions/_shared/welcome.ts";
import { FEED_LATE_MIN, barDayEnd, barSettled, feedState, fxTrading, silence, stoppedBeforeClose, type Print } from "../supabase/functions/_shared/feedhealth.ts";
import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync } from "node:crypto";

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
  // the official close: a closing auction prints after the last one-minute bar (figures made up to the shape of
  // Intuit on 17 Nov 2026: around -6.5% during the day, -7.2% at the close, and no alert from the bars)
  const bars = sessionMove([1, 2, 3, 4], [938, 935, 934, 931.5], 1000, 7), shut = closeMove(1000, 928, 7);
  ck("a stock whose one-minute bars all stop short of the line but whose official close is beyond it is caught at the close", bars === null && !!shut && Math.abs(shut.pct - -7.2) < 1e-9 && shut.price === 928, { bars, shut });
  ck("a close inside the line raises nothing; exactly 7.0% counts, either way; a rise is reported as a rise", closeMove(1000, 935, 7) === null && closeMove(1000, 1069.9, 7) === null && closeMove(1000, 930, 7) !== null && closeMove(1000, 1070, 7)!.pct > 0);
  ck("no previous close or no closing price: nothing", closeMove(null, 900, 7) === null && closeMove(0, 900, 7) === null && closeMove(1000, null, 7) === null && closeMove(1000, 0, 7) === null);
  // the line itself: 5% for a large company, 7% for the rest (Shota, 19 Nov 2026)
  ck("a large company's line is 5%: 1tn yen and above in Tokyo, 10bn US dollars and above elsewhere (other currencies through the dollar)", stockLine(1e12, "JPY", null) === 5 && stockLine(9.99e11, "JPY", null) === 7 && stockLine(1e10, "USD", 1) === 5 && stockLine(9.9e9, "USD", 1) === 7 && stockLine(1.5e13, "KRW", 1400) === 5 && stockLine(1.3e13, "KRW", 1400) === 7 && LARGE_STOCK_PCT === 5 && STOCK_PCT === 7);
  ck("a company whose size or currency rate is not known is held to 7%", stockLine(null, "USD", 1) === 7 && stockLine(5e11, null, 1) === 7 && stockLine(1e13, "KRW", null) === 7 && stockLine(undefined, undefined, undefined) === 7);
  // ServiceNow, 17 Nov 2026: reported down about 6.5% at the close (figures here are made up to that shape)
  const now65 = closeMove(1000, 935, stockLine(1.9e11, "USD", 1)), small65 = closeMove(1000, 935, stockLine(4e9, "USD", 1));
  ck("a large company down 6.5% now raises an alert; a small one at the same figure does not", !!now65 && Math.abs(now65.pct - -6.5) < 1e-9 && small65 === null && sessionMove([1, 2], [962, 948], 1000, stockLine(2e12, "JPY", null))!.pct === (948 / 1000 - 1) * 100 && sessionMove([1, 2], [962, 948], 1000, stockLine(2e11, "JPY", null)) === null, { now65, small65 });
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

// The checks below wait on the browser-grade cryptography, so the file ends inside this function.
(async () => {
  console.log("\n[I] push notifications: the message encryption (RFC 8291) and the sender's signature (RFC 8292)");
  {
    // the example of RFC 8291, Appendix A: with its keys and salt the message body must come out exactly as printed there
    const rfc = { plain: "When I grow up, I want to be a watermelon", p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg",
      asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8", asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", salt: "DGv6ra1nlYgDCS1FRnbzlw",
      body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN" };
    const got = b64u(await encryptPush(new TextEncoder().encode(rfc.plain), { p256dh: rfc.p256dh, auth: rfc.auth }, { key: { publicKey: rfc.asPublic, privateKey: rfc.asPrivate }, salt: unb64u(rfc.salt) }));
    ck("the RFC 8291 example comes out byte for byte", got === rfc.body, got);

    // a message of our own, read back the way a browser would, with Node's separate cryptography
    const ua = createECDH("prime256v1"); ua.generateKeys(); const auth = new Uint8Array(16).map((_, i) => (i * 37 + 11) & 255);
    const payload = JSON.stringify({ title: "Rakuten Bank down 17% intraday", body: "Stock move · 11/18 10:05 SGT", hash: "#asset/5838.T", tag: "alert-1" });
    const msg = Buffer.from(await encryptPush(new TextEncoder().encode(payload), { p256dh: b64u(new Uint8Array(ua.getPublicKey())), auth: b64u(auth) }));
    const salt = msg.subarray(0, 16), rs = msg.readUInt32BE(16), idlen = msg[20], asPub = msg.subarray(21, 21 + idlen), sealed = msg.subarray(21 + idlen);
    const shared = ua.computeSecret(asPub);
    const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub]), 32));
    const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16)), nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const d = createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(sealed.subarray(sealed.length - 16));
    const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
    ck("a message of ours decrypts on the receiving side to the same text, with the end-of-record byte", rs === 4096 && idlen === 65 && plain[plain.length - 1] === 2 && plain.subarray(0, plain.length - 1).toString() === payload, { rs, idlen });
    const again = Buffer.from(await encryptPush(new TextEncoder().encode(payload), { p256dh: b64u(new Uint8Array(ua.getPublicKey())), auth: b64u(auth) }));
    ck("every message has its own salt and one-time key", !again.subarray(0, 16).equals(salt) && !again.subarray(21, 86).equals(asPub));
    let refused = 0; for (const bad of [{ p256dh: "AAAA", auth: b64u(auth) }, { p256dh: b64u(new Uint8Array(ua.getPublicKey())), auth: "AAAA" }]) { try { await encryptPush(new Uint8Array(4), bad); } catch { refused++; } }
    try { await encryptPush(new Uint8Array(5000), { p256dh: b64u(new Uint8Array(ua.getPublicKey())), auth: b64u(auth) }); } catch { refused++; }
    ck("malformed subscription keys and an over-long message are refused", refused === 3, refused);

    // VAPID: a signed token for the push service's origin, checked with the public key
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" }); const jwk = privateKey.export({ format: "jwk" }) as { x: string; y: string; d: string };
    const pub = b64u(new Uint8Array(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")])));
    const t0 = Date.parse("2026-11-18T01:00:00Z");
    const h = await vapidHeader("https://web.push.apple.com/QGk3example", { publicKey: pub, privateKey: jwk.d }, "https://shotayng1123.github.io/orrery-market-monitor/", t0);
    const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
    const claims = m ? JSON.parse(Buffer.from(m[2], "base64url").toString()) : null, head = m ? JSON.parse(Buffer.from(m[1], "base64url").toString()) : null;
    ck("the header names the push service's origin, expires in twelve hours and carries the public key", !!m && head.alg === "ES256" && head.typ === "JWT" && claims.aud === "https://web.push.apple.com" && claims.exp === t0 / 1000 + 43200 && /^https:/.test(claims.sub) && m[4] === pub, { head, claims });
    const vk = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const good = !!m && await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vk, Buffer.from(m[3], "base64url"), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    const forged = !!m && await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vk, Buffer.from(m[3], "base64url"), new TextEncoder().encode(`${m[1]}.${m[2]}x`));
    ck("its signature verifies with the public key, and not for an altered token", good && !forged, { good, forged });

    ck("push addresses: Apple, Google, Mozilla and Windows are accepted", ["https://web.push.apple.com/QGk3", "https://fcm.googleapis.com/fcm/send/abc:def", "https://updates.push.services.mozilla.com/wpush/v2/gAAA", "https://wns2-sg2p.notify.windows.com/w/?token=x"].every(pushEndpointOk));
    ck("anything else is refused: another host, a look-alike, plain http, not an address", ["https://example.com/push", "https://push.apple.com.evil.example/x", "https://evilfcm.googleapis.com.example/", "http://fcm.googleapis.com/fcm/send/x", "https://169.254.169.254/latest", "not a url", ""].every((u) => !pushEndpointOk(u)));
  }

  console.log("\n[J] push notifications: what they say and who gets them");
  {
    const a = (id: number, symbol: string, kind: string, msg: string, at = "2026-11-18T02:05:00Z", pct: number | null = kind === "stock" || kind === "index" ? -7.5 : null): AlertLite => ({ id, at, symbol, name: msg.split(" ")[0], kind, pct, msg });
    const GREEN = "\u{1F7E2}", RED = "\u{1F534}";
    const bank = a(1, "5838.T", "stock", "Rakuten Bank down 17% intraday"), idx = a(2, "^N225", "index", "Nikkei 225 down 3.2%"), buy = a(3, "7203.T", "buyback", "Buyback: Toyota to buy back up to ¥1.2tn"), deal = a(4, "news:812", "mna", "M&A: a USD 4.0bn deal for a private company");
    const n = alertNote(bank);
    ck("a fall: a red mark, then the alert's line as the title, its kind and Singapore time under it; a tap opens the stock", n.title === `${RED} Rakuten Bank down 17% intraday` && n.body === "Stock move · 11/18 10:05 SGT" && n.hash === "#asset/5838.T" && n.tag === "alert-1", n);
    const up = a(5, "7203.T", "stock", "Toyota Motor up 8.2% intraday", undefined, 8.2), idxUp = a(6, "^GSPC", "index", "S&P 500 up 3.1%", undefined, 3.1);
    ck("a rise: a green mark, for a stock and for an index", alertNote(up).title === `${GREEN} Toyota Motor up 8.2% intraday` && alertNote(idxUp).title === `${GREEN} S&P 500 up 3.1%` && alertNote(idx).title === `${RED} Nikkei 225 down 3.2%`, [alertNote(up).title, alertNote(idxUp).title, alertNote(idx).title]);
    ck("an acquisition, a buyback and a guidance change carry no mark (no direction to show)", alertNote(deal).title === deal.msg && alertNote(buy).title === buy.msg && alertNote(a(7, "6758.T", "revision", "Guidance: Sony raises its full-year outlook")).title === "Guidance: Sony raises its full-year outlook" && moveMark({ ...bank, pct: 0 }) === "" && moveMark({ ...bank, pct: null }) === "");
    ck("an index move opens the index; a headline about a company opens the company; one about no listed company opens NEWS", alertNote(idx).hash === "#asset/%5EN225" && alertNote(idx).body.startsWith("Index move") && alertNote(buy).hash === "#asset/7203.T" && alertNote(buy).body.startsWith("Buyback") && alertNote(deal).hash === "#news" && alertNote(deal).body.startsWith("M&A"), [alertNote(idx), alertNote(buy), alertNote(deal)]);
    ck("times are written as on the page, across midnight too", stampSgt("2026-11-18T15:59:00Z") === "11/18 23:59 SGT" && stampSgt("2026-11-18T16:00:00Z") === "11/19 00:00 SGT");
    const watch = new Set(["5838.T", "NVDA"]);
    ck("'my names': only alerts on the account's watchlist", wanted("mine", watch, bank) && !wanted("mine", watch, idx) && !wanted("mine", watch, buy) && !wanted("mine", watch, deal) && [bank, idx, buy, deal].every((x) => wanted("all", watch, x)));
    ck("up to four alerts at once: one notification each", notesFor([bank, idx, buy, deal], "all", watch).length === 4 && notesFor([bank, idx, buy, deal], "mine", watch).length === 1 && notesFor([idx], "mine", watch).length === 0);
    const many = Array.from({ length: 30 }, (_, i) => a(100 + i, `${7000 + i}.T`, "stock", `Company ${i} ${i === 28 ? "up" : "down"} 8% intraday`, `2026-11-18T02:${String(10 + i).padStart(2, "0")}:00Z`, i === 28 ? 8 : -8));
    const sum = notesFor(many, "all", watch);
    ck("thirty at once (a sell-off): a single notification with the count and the three newest, each with its mark", sum.length === 1 && sum[0].title === "30 new alerts" && sum[0].body === `${RED} Company 29 down 8% intraday · ${GREEN} Company 28 up 8% intraday · ${RED} Company 27 down 8% intraday and 27 more` && sum[0].hash === "#market", sum);
  }

  console.log("\n[K] an account by email: the code, the button's link, the words, the emails, the sender");
  {
    // the code
    const seq = (...v: number[]) => { let i = 0; return () => v[i++]; };
    ck("a code is six digits, zeros kept in front", newCode(seq(42)) === "000042" && newCode(seq(123456789)) === "456789" && /^\d{6}$/.test(newCode()));
    ck("random numbers above the last full million are drawn again, so no code is likelier than another", newCode(seq(4_294_967_295, 4_294_000_000, 4_293_999_999)) === "999999");
    const seen = new Set<string>(); for (let i = 0; i < 400; i++) seen.add(newCode());
    ck("400 codes in a row are (nearly) all different", seen.size >= 395, seen.size);
    const h = await codeHash("a-secret-of-at-least-16", "a@example.com", "123456");
    ck("what is stored is an HMAC: the same for the same code, different for another code, another address or another secret", /^[0-9a-f]{64}$/.test(h) && h === await codeHash("a-secret-of-at-least-16", "a@example.com", "123456") && h !== await codeHash("a-secret-of-at-least-16", "a@example.com", "123457") && h !== await codeHash("a-secret-of-at-least-16", "b@example.com", "123456") && h !== await codeHash("another-secret-16-long", "a@example.com", "123456"));
    ck("the code as typed: spaces and a dash are dropped; anything but six digits is refused", cleanCode("123 456") === "123456" && cleanCode(" 123-456 ") === "123456" && cleanCode("12345") === null && cleanCode("1234567") === null && cleanCode("12345a") === null && cleanCode(undefined) === null && cleanCode("１２３４５６") === null);
    // the words
    ck("a code that was sent: no refusal", sendRefusal("ok", 0) === null && checkRefusal("ok", 5) === null);
    const gap = sendRefusal("gap", 37)!, hour = sendRefusal("email_hour", 1790)!;
    ck("too soon: says how many seconds", gap.status === 429 && gap.error === "An email was sent a moment ago. A new one can be sent in 37 s." && gap.waitSec === 37, gap);
    ck("too many to one address: says how many minutes", hour.status === 429 && hour.error === "Too many emails were sent to this address. Try again in 30 min." && hour.waitSec === 1790, hour);
    ck("too many from one network, and the daily total, are refusals too; an answer the code does not know is an error, not a pass", sendRefusal("ip_hour", 0)!.status === 429 && sendRefusal("day", 0)!.status === 429 && sendRefusal("", 0)!.status === 500 && checkRefusal("", 0) !== null);
    ck("a wrong code says how many tries are left", checkRefusal("wrong", 4) === "That code is not right. 4 tries left." && checkRefusal("wrong", 1) === "That code is not right. 1 try left." && checkRefusal("wrong", 0) === "That code is not right, and it can no longer be used. Send a new email.");
    ck("nothing waiting, an email past its time and a used-up code each say to send a new email", ["none", "expired", "spent"].every((x) => /Send a new email\.$/.test(checkRefusal(x, 0) ?? "")));
    // the button's link: made on the server, read by the page
    const SITE = "https://shotayng1123.github.io/orrery-market-monitor/";
    const link = verifyLink(SITE, "new.person+desk@example.co.jp", "048213");
    ck("the button opens the Monitor's own page, with the code and the address after the # (the part browsers do not send to a server)", link.startsWith(SITE + "#verify=048213.") && !link.includes("?") && !link.slice(SITE.length + 1).includes("#") && !link.includes("@") && /^[A-Za-z0-9_.=#-]+$/.test(link.slice(SITE.length)), link);
    const back = readVerify(link.slice(SITE.length));
    ck("the page reads the same address and code back out of it", back?.email === "new.person+desk@example.co.jp" && back.code === "048213", back);
    ck("addresses of every length read back the same (base64 with and without padding)", ["a@b.co", "ab@b.co", "abc@b.co", "x_y-z.w+tag@sub.example.com"].every((e) => { const r = readVerify(verifyLink(SITE, e, "000001").slice(SITE.length)); return r?.email === e && r.code === "000001"; }));
    ck("anything else after the # is not a verification link: a tab, a stock page, a short or lettered code, a payload that is not an address", [ "#market", "#asset/7203.T", "#verify=", "#verify=12345.YUBiLmNv", "#verify=12345a.YUBiLmNv", "#verify=123456", "#verify=123456.", "#verify=123456.!!!!", `#verify=123456.${Buffer.from("not an address").toString("base64url")}`, `#verify=123456.${Buffer.from("a@b.co").toString("base64url")}&x=1`, "" ].every((h) => readVerify(h) === null));
    // the emails
    const mail = codeMail("048213", link);
    const hrefs = [...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    ck("the email: a Verify my email button that opens that link and nothing else, the code for the Home Screen app, how long both are valid", mail.subject === "Verify your email for Orrery Monitor" && hrefs.length === 1 && hrefs[0] === link && />Verify my email<\/a>/.test(mail.html) && mail.html.includes("048 213") && mail.text.includes(link) && mail.text.includes("048 213") && mail.text.includes(`${CODE_TTL_MIN} minutes`) && mail.html.includes(`${CODE_TTL_MIN} minutes`) && (mail.text.match(/https?:\/\//g) ?? []).length === 1 && CODE_MAX_TRIES === 5, mail);
    const have = noticeMail("have", SITE), off = noticeMail("off", SITE);
    ck("an address that already has an account is told so by email, with where to sign in, and gets no button and no code", /already has an account/.test(have.text) && /sign in with your password/.test(have.text) && have.text.includes(SITE) && !/verify=|\d{3} \d{3}|Verify my email/.test(have.text + have.html) && [...have.html.matchAll(/href="([^"]*)"/g)].every((m) => m[1] === SITE), have);
    ck("an address whose account was switched off is told to contact the manager, with no link at all", /switched off/.test(off.text) && /contact the Monitor's manager/.test(off.text) && !/https?:|href|verify=/.test(off.text + off.html) && off.subject === have.subject, off);
    // who it comes from
    const env = (o: Record<string, string>) => (k: string) => o[k];
    ck("no sender set up: none, and that is not an error", mailSetup(env({})) === null && !mailReady(env({})));
    const gm = mailSetup(env({ SMTP_USER: "desk@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop" }));
    ck("a Gmail address and its app password are enough: Gmail's server, port 465, mail from that address", gm?.kind === "smtp" && gm.host === "smtp.gmail.com" && gm.port === 465 && gm.from.email === "desk@gmail.com" && gm.from.name === "Orrery Monitor" && mailReady(env({ SMTP_USER: "desk@gmail.com", SMTP_PASS: "x" })), gm);
    ck("an app password is used without the spaces it is shown with; any other password is left alone", appPassword("abcd efgh ijkl mnop") === "abcdefghijklmnop" && appPassword("my pass word") === "my pass word" && appPassword("abcdefghijklmnop") === "abcdefghijklmnop");
    const rs = mailSetup(env({ RESEND_API_KEY: "re_test", MAIL_FROM: "Orrery Desk <notes@orrery.example>" }));
    ck("a Resend key and a sender address: Resend, with the name given", rs?.kind === "resend" && rs.from.email === "notes@orrery.example" && rs.from.name === "Orrery Desk", rs);
    const threw = (o: Record<string, string>) => { try { mailSetup(env(o)); return ""; } catch (e) { return (e as Error).message; } };
    ck("half a set-up is named, not guessed around: no sender address, no password, a port Supabase blocks", /MAIL_FROM is not set/.test(threw({ RESEND_API_KEY: "re_test" })) && /both be set/.test(threw({ SMTP_USER: "desk@gmail.com" })) && /465/.test(threw({ SMTP_USER: "a@b.co", SMTP_PASS: "x", SMTP_PORT: "587" })) && /465/.test(threw({ SMTP_USER: "a@b.co", SMTP_PASS: "x", SMTP_PORT: "25" })) && /not an email address/.test(threw({ SMTP_USER: "desk", SMTP_PASS: "x" })) && !mailReady(env({ RESEND_API_KEY: "re_test" })));
    const rq = resendRequest({ from: { name: "Orrery Monitor", email: "notes@orrery.example" }, key: "re_test" }, { to: "a@example.com", ...mail });
    const sent = JSON.parse(String(rq.init.body)) as Record<string, unknown>;
    ck("the request to Resend: its address, the key as a bearer, one recipient, both versions of the text", rq.url === "https://api.resend.com/emails" && (rq.init.headers as Record<string, string>).authorization === "Bearer re_test" && sent.from === "Orrery Monitor <notes@orrery.example>" && JSON.stringify(sent.to) === '["a@example.com"]' && sent.subject === mail.subject && sent.text === mail.text && sent.html === mail.html, sent);
    ck("a sender is read as written: with a name, in quotes, or bare; nonsense is refused", parseFrom("Orrery Monitor <Notes@Example.com>")?.email === "notes@example.com" && parseFrom('"Orrery, Desk" <n@example.com>')?.name === "Orrery, Desk" && parseFrom("n@example.com")?.name === "" && parseFrom("not an address") === null && parseFrom("a@b") === null && parseFrom("a b@example.com") === null && parseFrom("a@example.com\r\nBcc: x@example.com") === null);

    // the message as it goes on the wire
    const msg = buildMessage({ from: { name: "Orrery Monitor", email: "desk@gmail.com" }, to: "a@example.com", ...mail }, new Date("2026-11-18T02:05:09Z"), "abc123");
    const [head, ...rest] = msg.split("\r\n\r\n");
    const un64 = (b: string) => Buffer.from(b.replace(/\r\n/g, ""), "base64").toString("utf8");
    ck("headers: from, to, subject, a date with a numeric zone, an id on the sender's domain", head.includes('From: "Orrery Monitor" <desk@gmail.com>\r\n') && head.includes("To: <a@example.com>\r\n") && head.includes(`Subject: ${mail.subject}\r\n`) && head.includes("Date: Wed, 18 Nov 2026 02:05:09 +0000\r\n") && head.includes("Message-ID: <abc123@gmail.com>\r\n") && head.includes("MIME-Version: 1.0") && /Content-Type: multipart\/alternative; boundary="=_orrery_abc123"$/.test(head), head);
    ck("the text and the HTML version come back out of the message unchanged", un64(rest[1].split("\r\n--")[0]) === mail.text.replace(/\n/g, "\r\n") && un64(rest[2].split("\r\n--")[0]) === mail.html && msg.endsWith("--=_orrery_abc123--\r\n"), [rest[1], rest[2]]);
    ck("every line ends with CR LF and none is longer than 78 characters", !/[^\r]\n/.test(msg) && msg.split("\r\n").every((l) => l.length <= 78), msg.split("\r\n").filter((l) => l.length > 78));
    const plain = buildMessage({ from: { name: "", email: "desk@gmail.com" }, to: "a@example.com", subject: "Zürich 東京 — a subject that is long enough to need more than one encoded word", text: "ü" }, new Date("2026-11-18T02:05:09Z"), "x1");
    const subj = /Subject: ((?:.|\r\n )*)\r\n/.exec(plain)![1].split("\r\n ").map((w) => Buffer.from(/^=\?UTF-8\?B\?(.*)\?=$/.exec(w)![1], "base64").toString("utf8")).join("");
    ck("a subject beyond ASCII travels as encoded words and reads back the same; without HTML the message is the text alone", subj === "Zürich 東京 — a subject that is long enough to need more than one encoded word" && plain.includes("From: <desk@gmail.com>") && plain.includes("Content-Type: text/plain; charset=utf-8") && !plain.includes("multipart") && un64(plain.split("\r\n\r\n")[1]) === "ü", plain);
    let bad = 0; for (const [f, t] of [["desk@gmail.com", "a@example.com\r\nRCPT TO:<x@example.com>"], ["desk@gmail.com>\r\nDATA", "a@example.com"], ["desk@gmail.com", "a b@example.com"]]) { try { buildMessage({ from: { name: "", email: f }, to: t, subject: "s", text: "t" }, new Date(), "x"); } catch { bad++; } }
    ck("an address carrying a line break or a space is refused before anything is sent", bad === 3);
    ck("a line that starts with a dot gets a second dot, so a lone dot can only end the message", dotStuff("a\r\n.\r\n.b\r\nc.\r\n") === "a\r\n..\r\n..b\r\nc.\r\n" && dotStuff(".first") === "..first");

    // the conversation with a mail server (a scripted one: what a server sends is fixed by RFC 5321 and RFC 4954)
    const server = (o: { auth?: string; user?: string; pass?: string; greet?: string; rcpt?: string; split?: boolean; hangUpAfter?: string } = {}) => {
      const out: string[] = [o.greet ?? "220 smtp.test ESMTP ready\r\n"], lines: string[] = []; let data: string | null = null, body = "", loginStep = 0, loginUser = "";
      const push = (t: string) => { if (o.split && t.length > 6) { out.push(t.slice(0, 5)); out.push(t.slice(5)); } else out.push(t); };
      const b = (t: string) => Buffer.from(t, "base64").toString("utf8");
      const wire: Wire = {
        read: async () => (out.length ? out.shift()! : null),
        write: async (t) => {
          if (data != null) { data += t; if (data.endsWith("\r\n.\r\n")) { body = data.slice(0, -3); data = null; push("250 2.0.0 OK queued as 1a2b\r\n"); } return; }
          for (const line of t.split("\r\n").filter(Boolean)) {
            lines.push(line);
            if (o.hangUpAfter && line.startsWith(o.hangUpAfter)) return;
            if (loginStep === 1) { loginUser = b(line); loginStep = 2; push("334 UGFzc3dvcmQ6\r\n"); }
            else if (loginStep === 2) { loginStep = 0; push(loginUser === (o.user ?? "desk@gmail.com") && b(line) === (o.pass ?? "abcdefghijklmnop") ? "235 2.7.0 Accepted\r\n" : "535 5.7.8 Username and Password not accepted\r\n"); }
            else if (line.startsWith("EHLO")) push(`250-smtp.test at your service\r\n250-SIZE 35882577\r\n250-8BITMIME\r\n250-AUTH ${o.auth ?? "LOGIN PLAIN XOAUTH2"}\r\n250 SMTPUTF8\r\n`);
            else if (line.startsWith("AUTH PLAIN ")) push(b(line.slice(11)) === `\0${o.user ?? "desk@gmail.com"}\0${o.pass ?? "abcdefghijklmnop"}` ? "235 2.7.0 Accepted\r\n" : "535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 See the help page\r\n");
            else if (line === "AUTH LOGIN") { loginStep = 1; push("334 VXNlcm5hbWU6\r\n"); }
            else if (line.startsWith("MAIL FROM:")) push("250 2.1.0 OK\r\n");
            else if (line.startsWith("RCPT TO:")) push(o.rcpt ?? "250 2.1.5 OK\r\n");
            else if (line === "DATA") { data = ""; push("354 Go ahead\r\n"); }
            else if (line === "QUIT") push("221 2.0.0 closing\r\n");
            else push("502 5.5.1 Unrecognized command\r\n");
          }
        },
      };
      return { wire, lines, body: () => body };
    };
    const cred = { user: "desk@gmail.com", pass: "abcdefghijklmnop" };
    let sv = server();
    let answer = await smtpTalk(sv.wire, cred, "desk@gmail.com", "a@example.com", msg);
    ck("a message is handed over in the order a mail server expects, and its own answer comes back", answer === "2.0.0 OK queued as 1a2b" && sv.lines.join("|") === `EHLO [127.0.0.1]|AUTH PLAIN ${Buffer.from("\0desk@gmail.com\0abcdefghijklmnop").toString("base64")}|MAIL FROM:<desk@gmail.com>|RCPT TO:<a@example.com>|DATA|QUIT` && sv.body() === msg, [answer, sv.lines]);
    sv = server({ split: true });
    ck("answers that arrive in pieces are read the same", await smtpTalk(sv.wire, cred, "desk@gmail.com", "a@example.com", msg) === "2.0.0 OK queued as 1a2b" && sv.body() === msg);
    sv = server({ auth: "LOGIN" });
    ck("a server that only offers the other sign-in is spoken to that way", await smtpTalk(sv.wire, cred, "desk@gmail.com", "a@example.com", msg) === "2.0.0 OK queued as 1a2b" && sv.lines[1] === "AUTH LOGIN" && sv.lines[2] === Buffer.from("desk@gmail.com").toString("base64"), sv.lines);
    sv = server();
    await smtpTalk(sv.wire, cred, "desk@gmail.com", "a@example.com", "Subject: dots\r\n\r\n.\r\n.hidden line\r\nlast");
    ck("a message with lines starting with a dot arrives whole (the server's end mark is not triggered early)", dotStuff("Subject: dots\r\n\r\n.\r\n.hidden line\r\nlast\r\n") === sv.body() && sv.lines.at(-1) === "QUIT", sv.body());
    const refusal = async (o: Parameters<typeof server>[0], c = cred): Promise<Error> => { try { await smtpTalk(server(o).wire, c, "desk@gmail.com", "a@example.com", msg); return new Error("was accepted"); } catch (e) { return e as Error; } };
    const wrongPw = await refusal({}, { user: "desk@gmail.com", pass: "a-wrong-password" });
    ck("a refused sign-in: the server's own words, the step that failed, and never the password", wrongPw instanceof SmtpError && wrongPw.code === 535 && wrongPw.step === "the sign-in" && /Username and Password not accepted/.test(wrongPw.message) && !wrongPw.message.includes("a-wrong-password") && !wrongPw.message.includes(Buffer.from("\0desk@gmail.com\0a-wrong-password").toString("base64")), wrongPw.message);
    const noBox = await refusal({ rcpt: "550 5.1.1 The email account that you tried to reach does not exist\r\n" });
    ck("an address the server refuses is reported as that", noBox instanceof SmtpError && noBox.code === 550 && noBox.step === "the recipient" && /does not exist/.test(noBox.message), noBox.message);
    ck("a server that hangs up, one that greets with a refusal, and one with no sign-in this client knows each give an error, not a hang", /closed the connection/.test((await refusal({ hangUpAfter: "MAIL FROM" })).message) && (await refusal({ greet: "554 5.7.1 No service\r\n" }) as SmtpError).step === "the connection" && /no sign-in this client knows/.test((await refusal({ auth: "XOAUTH2 OAUTHBEARER" })).message) && /unexpected answer/.test((await refusal({ greet: "hello there\r\n" })).message));
  }

  console.log("\n[L] a stock's page: the numbers worked out from its price history");
  {
    const T = (d: string) => Date.parse(d + "T00:00:00Z") / 1000, D = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
    const near = (a: number | null, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;
    ck("N months back is the same day of the month, or the month's last day when it has no such day", D(monthsBack(T("2026-11-18"), 1)) === "2026-10-18" && D(monthsBack(T("2026-03-30"), 1)) === "2026-02-28" && D(monthsBack(T("2024-03-31"), 1)) === "2024-02-29" && D(monthsBack(T("2026-01-15"), 3)) === "2025-10-15" && D(monthsBack(T("2026-11-18"), 60)) === "2021-11-18" && D(monthsBack(T("2026-05-31"), 6)) === "2025-11-30");
    // weekdays from 2 Jan 2020 to 18 Nov 2026: the stock gains 0.05% a day, the benchmark 0.02%
    const days: number[] = []; for (let t = T("2020-01-02"); t <= T("2026-11-18"); t += 86400) { const w = new Date(t * 1000).getUTCDay(); if (w !== 0 && w !== 6) days.push(t); }
    const own: Bar[] = days.map((t, i) => ({ t, c: 100 * 1.0005 ** i, h: 100 * 1.0005 ** i * 1.01, l: 100 * 1.0005 ** i * 0.99, v: 1000 + (i % 7) * 100 }));
    const bench: Bar[] = days.map((t, i) => ({ t, c: 1000 * 1.0002 ** i }));
    const n = own.length - 1, idx = (d: string) => days.findIndex((t) => D(t) === d);
    ck("the last close on or before a day: the day itself, the Friday before a weekend, nothing before the history starts", D(barOnOrBefore(own, T("2026-08-18"))!.t) === "2026-08-18" && D(barOnOrBefore(own, T("2026-10-18"))!.t) === "2026-10-16" && barOnOrBefore(own, T("2019-12-31")) === null && D(barOnOrBefore(own, T("2030-01-01"))!.t) === "2026-11-18");
    const rows = perfRows(own, [bench], own[n].c, own[n - 1].c);
    const want: Record<string, string> = { "1M": "2026-10-16", "3M": "2026-08-18", "6M": "2026-05-18", "12M": "2025-11-18", "36M": "2023-11-17", "60M": "2021-11-18" };
    ck("the horizons are 1D, 1M, 3M, 6M, 12M, 36M, 60M, each measured from the last close on or before that day", rows.map((r) => r.h).join() === "1D,1M,3M,6M,12M,36M,60M" && Object.entries(want).every(([h, d]) => rows.find((r) => r.h === h)!.from === d), rows.map((r) => [r.h, r.from]));
    ck("each change is the price now against that close, for the stock and for the benchmark over the same dates", Object.entries(want).every(([h, d]) => { const k = n - idx(d), r = rows.find((x) => x.h === h)!; return near(r.stock, (1.0005 ** k - 1) * 100, 1e-7) && near(r.bench[0], (1.0002 ** k - 1) * 100, 1e-7) && near(r.base, own[idx(d)].c, 1e-9); }), rows);
    ck("the last column is the stock's change minus the benchmark's, in percentage points", rows.every((r) => r.stock != null && r.bench[0] != null && near(r.rel[0], r.stock - r.bench[0])) && rows.every((r) => (r.rel[0] as number) > 0));
    ck("1D uses the quote's previous close for the stock and the benchmark's previous close for the benchmark", near(perfRows(own, [bench], 110, 100)[0].stock, 10) && near(rows[0].bench[0], 0.02, 1e-9) && perfRows(own, [bench], 110, 100)[0].from === "2026-11-17");
    ck("with no quote the latest close stands in for the price now", near(perfRows(own, [bench], null, null).find((r) => r.h === "1M")!.stock, rows.find((r) => r.h === "1M")!.stock as number));
    const short = perfRows(own.slice(-400), [bench], own[n].c, own[n - 1].c);
    ck("a history that does not reach back far enough leaves the horizon empty, it is never measured over a shorter time", short.find((r) => r.h === "12M")!.stock != null && short.find((r) => r.h === "36M")!.stock === null && short.find((r) => r.h === "60M")!.rel[0] === null && short.find((r) => r.h === "36M")!.from === null);
    const holed = own.filter((b) => b.t < T("2026-04-20") || b.t > T("2026-05-25"));
    ck("a hole in the history at the anchor leaves that horizon empty too (the others stand)", perfRows(holed, [bench], null, null).find((r) => r.h === "6M")!.stock === null && perfRows(holed, [bench], null, null).find((r) => r.h === "12M")!.stock != null);
    ck("a benchmark with no history gives the stock's change and no comparison; no bars at all give empty rows", perfRows(own, [[]], null, null).every((r) => r.stock != null && r.bench[0] === null && r.rel[0] === null) && perfRows([], [[]], null, null).every((r) => r.stock === null && r.bench.length === 1) && perfRows([], [], null, null).length === 7);
    // two benchmarks (Tokyo names: Nikkei 225 and TOPIX), the second with a shorter history
    const second: Bar[] = days.slice(-800).map((t, i) => ({ t, c: 500 * 1.0001 ** i }));
    const two = perfRows(own, [bench, second], own[n].c, own[n - 1].c);
    ck("against two benchmarks: each has its own change and its own difference, in the order given", two.every((r) => r.bench.length === 2 && r.rel.length === 2) && two.find((r) => r.h === "12M")!.bench.every((x) => x != null) && near(two.find((r) => r.h === "12M")!.bench[1], (1.0001 ** (n - idx("2025-11-18")) - 1) * 100, 1e-7) && near(two.find((r) => r.h === "12M")!.rel[1], (two.find((r) => r.h === "12M")!.stock as number) - (two.find((r) => r.h === "12M")!.bench[1] as number)) && near(two[0].bench[1], 0.01, 1e-9), two.find((r) => r.h === "12M"));
    ck("a benchmark whose history is shorter leaves only its own cells empty for the longer horizons", two.find((r) => r.h === "60M")!.bench[0] != null && two.find((r) => r.h === "60M")!.bench[1] === null && two.find((r) => r.h === "60M")!.rel[1] === null && two.find((r) => r.h === "60M")!.rel[0] != null && two.find((r) => r.h === "60M")!.stock != null);
    // 52-week range: a spike older than a year must not count
    const spiky = own.map((b) => ({ ...b })); const old = idx("2025-10-01"), hiI = idx("2026-03-10"), loI = idx("2026-06-15");
    spiky[old].h = 9999; spiky[hiI].h = 500; spiky[loI].l = 50;
    const rg = range52w(spiky, 200);
    ck("the 52-week high and low are the highest high and lowest low of the last twelve months, with their dates", rg.hi === 500 && rg.hiDate === "2026-03-10" && rg.lo === 50 && rg.loDate === "2026-06-15", rg);
    ck("and the price now is placed against them: per cent from the high, from the low, and its position between", near(rg.fromHi, -60) && near(rg.fromLo, 300) && near(rg.pos, (150 / 450) * 100) && range52w([], 1).hi === null, rg);
    ck("without highs and lows in the feed the closes are used", range52w(bench, null).hi === bench[n].c && near(range52w(bench, null).fromHi, 0));
    // volatility: returns of +1% and -1% in turn
    const zig: Bar[] = [{ t: T("2026-01-01"), c: 100 }]; for (let i = 1; i <= 40; i++) zig.push({ t: T("2026-01-01") + i * 86400, c: zig[i - 1].c * Math.exp(i % 2 ? 0.01 : -0.01) });
    ck("realised volatility is the standard deviation of the daily log returns times the square root of 252", near(realisedVol(zig, 20), 0.01 * Math.sqrt(20 / 19) * Math.sqrt(252) * 100, 1e-9) && near(realisedVol(zig, 40), 0.01 * Math.sqrt(40 / 39) * Math.sqrt(252) * 100, 1e-9) && realisedVol(zig, 41) === null && realisedVol(own, 20)! < 1e-6);
    // beta: a stock that moves twice as far as the benchmark, one that moves half as far the other way
    const bm: Bar[] = [{ t: T("2026-01-01"), c: 1000 }]; for (let i = 1; i <= 80; i++) bm.push({ t: T("2026-01-01") + i * 86400, c: bm[i - 1].c * Math.exp(((i * 7) % 11 - 5) / 500) });
    const twice: Bar[] = bm.map((b, i) => ({ t: b.t, c: 50 * Math.exp(2 * Math.log(bm[i].c / 1000)) })), against: Bar[] = bm.map((b, i) => ({ t: b.t, c: 50 * Math.exp(-0.5 * Math.log(bm[i].c / 1000)) }));
    const b2 = betaCorr(twice, bm, 60), bn = betaCorr(against, bm, 60);
    ck("beta 2 and correlation 1 for a stock that moves twice the benchmark; beta -0.5 and correlation -1 for one that moves half as far the other way", near(b2.beta, 2, 1e-9) && near(b2.corr, 1, 1e-9) && b2.days === 60 && near(bn.beta, -0.5, 1e-9) && near(bn.corr, -1, 1e-9), [b2, bn]);
    const gaps = twice.filter((_, i) => i % 5 !== 2);
    ck("days on which only one of the two traded are left out, and the returns are taken between common days", near(betaCorr(gaps, bm, 50).beta, 2, 1e-9) && betaCorr(gaps, bm, 50).days === 50 && betaCorr(twice, bm, 81).beta === null && betaCorr(twice, bm.map((b) => ({ ...b, c: 1000 })), 60).beta === null);
    // turnover: the latest bar (possibly a day in progress) is left out
    const tv: Bar[] = [1, 2, 3, 4, 5].map((k) => ({ t: T("2026-11-0" + k), c: 10 * k, v: 100 * k }));
    const at = avgTurnover(tv, 3);
    ck("average daily volume and value traded are over the sessions before the latest one", at.shares === 300 && at.value === (200 * 20 + 300 * 30 + 400 * 40) / 3 && at.days === 3 && avgTurnover(tv, 5).shares === null && avgTurnover(tv.map((b) => ({ ...b, v: null })), 2).shares === null, at);
    const path: Bar[] = [100, 120, 110, 90, 95, 110].map((c, i) => ({ t: T("2026-11-0" + (i + 1)), c }));
    const dd = maxDrawdown(path, 12);
    ck("the largest fall from a high to a later low, with both dates", near(dd.pct, -25) && dd.from === "2026-11-02" && dd.to === "2026-11-04" && near(maxDrawdown(own, 12).pct, 0) && maxDrawdown([], 12).pct === null, dd);
  }

  console.log("\n[M] a stock's page: statements in one shape, one unit, and the ratios");
  {
    const near = (a: number | null | undefined, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;
    ck("a fiscal year is named by the month and year it ends in; a quarter by its number, or by its last month when that is all that is known", fyLabel("2026-03-31") === "FY3/26" && fyLabel("2025-12-31") === "FY12/25" && fyLabel("2009-09-30") === "FY9/09" && qLabel("2027-03-31", 1) === "1Q 3/27" && qEndLabel("2026-09-30") === "Sep 26");
    ck("the last day of each quarter of a fiscal year", quarterEnd("2027-03-31", 1) === "2026-06-30" && quarterEnd("2027-03-31", 2) === "2026-09-30" && quarterEnd("2027-03-31", 3) === "2026-12-31" && quarterEnd("2027-03-31", 4) === "2027-03-31" && quarterEnd("2025-12-31", 1) === "2025-03-31" && quarterEnd("2024-02-29", 4) === "2024-02-29" && quarterEnd("2024-02-29", 3) === "2023-11-30" && quarterEnd("2026-08-31", 2) === "2026-02-28");
    const P = (end: string, kind: FinPeriod["kind"] = "FY", months = 12): FinPeriod => ({ key: `${kind}:${end}`, end, label: end, kind, months, std: "JP", doc: null, url: null, note: null });
    const set = (rev: Array<number | null>): FinSet => ({ periods: rev.map((_, i) => P(`${2020 + i}-03-31`)), lines: { revenue: rev } });
    const u = (rev: number) => pickUnit(set([rev]));
    ck("one unit per company, from the size of its revenue: bn from 100bn, tn from 100tn, m below, thousands below 100m", u(45.1e12).label === "bn" && u(1e11).label === "bn" && u(9.99e10).label === "m" && u(1e8).label === "m" && u(9.9e7).label === "k" && u(3e14).label === "tn" && u(45.1e12).div === 1e9 && u(45.1e12).dp === 1 && u(5e9).dp === 0);
    ck("a company with no revenue line (a bank under some standards) is sized by its total assets; the largest year decides", pickUnit({ periods: [P("2026-03-31")], lines: { assets: [1.3e13] } }).label === "bn" && pickUnit(set([5e10, 2e11, 9e10])).label === "bn" && pickUnit(set([-3e11])).label === "bn" && pickUnit({ periods: [], lines: {} }).label === "k");
    // ratios, annual: FY3/23 .. FY3/26 plus guidance
    const A: FinSet = { periods: [P("2023-03-31"), P("2024-03-31"), P("2025-03-31"), P("2026-03-31"), P("2027-03-31", "FC")],
      lines: { revenue: [1000, 1100, 990, null, 1320], gross: [400, 462, null, 500, null], op: [100, 132, -50, 120, 150], ni: [70, 88, -60, 80, 99], eps: [70, 88, -60, 80, 99], dps: [21, 30, 30, 32, 40], equity: [700, 800, 720, 800, null], assets: [1400, 1600, 1800, 2000, null] } };
    const r = ratiosOf(A);
    ck("sales growth is against the year that ended twelve months before; the first year, a year with no figure and the year after it have none", r.salesYoy![0] === null && near(r.salesYoy![1], 10) && near(r.salesYoy![2], -10) && r.salesYoy![3] === null && r.salesYoy![4] === null, r.salesYoy);
    ck("margins are the profit over revenue; a missing figure on either side leaves the margin empty", near(r.gpm![0], 40) && near(r.gpm![1], 42) && r.gpm![2] === null && r.gpm![3] === null && near(r.opm![1], 12) && near(r.opm![2], -50 / 990 * 100) && r.opm![3] === null && near(r.npm![0], 7) && near(r.npm![4], 7.5), r);
    ck("the payout ratio is the dividend over earnings per share, and empty in a loss-making year", near(r.payout![0], 30) && near(r.payout![1], 30 / 88 * 100) && r.payout![2] === null && near(r.payout![3], 40) && near(r.payout![4], 40 / 99 * 100), r.payout);
    ck("return on equity and the equity ratio use the year-end balance sheet; guidance has neither", near(r.roe![0], 10) && near(r.roe![1], 11) && r.roe![4] === null && near(r.equityRatio![0], 50) && near(r.equityRatio![3], 40) && r.equityRatio![4] === null, r);
    ck("a payout ratio the company states itself is used as stated", near(ratiosOf({ ...A, lines: { ...A.lines, payoutReported: [35.2, null, null, null, null] } }).payout![0], 35.2) && near(ratiosOf({ ...A, lines: { ...A.lines, payoutReported: [35.2, null, null, null, null] } }).payout![1], 30 / 88 * 100));
    // quarterly: growth is against the same quarter a year earlier, never against the quarter before
    const Q: FinSet = { periods: ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"].map((e) => P(e, "Q", 3)), lines: { revenue: [100, 200, 300, 400, 120, 190], op: [10, 30, 30, 20, 18, 19] } };
    const rq = ratiosOf(Q);
    ck("a quarter's sales growth is against the same quarter a year earlier", rq.salesYoy!.slice(0, 4).every((x) => x === null) && near(rq.salesYoy![4], 20) && near(rq.salesYoy![5], -5) && near(rq.opm![4], 15) && rq.roe!.every((x) => x === null), rq);
    ck("a fiscal year that changed its year-end has no growth figure across the change", ratiosOf({ periods: [P("2024-03-31"), P("2024-12-31", "FY", 9), P("2025-12-31")], lines: { revenue: [100, 80, 120] } }).salesYoy!.every((x) => x === null));
    // year-to-date into single quarters
    const sq = singleQuarters([{ fy: "2026-03-31", q: 1, v: 100 }, { fy: "2026-03-31", q: 2, v: 250 }, { fy: "2026-03-31", q: 3, v: 370 }, { fy: "2026-03-31", q: 4, v: 600 }, { fy: "2027-03-31", q: 1, v: 130 }, { fy: "2027-03-31", q: 2, v: 240 }]);
    ck("year-to-date figures become single quarters: the first as it is, each later one less the one before", sq.map((x) => x.v).join() === "100,150,120,230,130,110", sq);
    const hole = singleQuarters([{ fy: "2026-03-31", q: 1, v: 100 }, { fy: "2026-03-31", q: 3, v: 370 }, { fy: "2026-03-31", q: 4, v: null }, { fy: "2027-03-31", q: 2, v: 240 }]);
    ck("a quarter whose predecessor is missing stays empty: a half-year or nine-month figure is never shown as a quarter", hole.map((x) => x.v).join() === "100,,," && hole[1].v === null && hole[3].v === null, hole);
    ck("a negative year-to-date change is a negative quarter (a loss, or a reversal), not an error", singleQuarters([{ fy: "x", q: 1, v: 50 }, { fy: "x", q: 2, v: 20 }])[1].v === -30);
    ck("progress against full-year guidance is the year-to-date figure over the guidance, for the first three quarters only", near(progress(370, 600, 3), 370 / 600 * 100) && near(progress(100, 600, 1), 100 / 6) && progress(600, 700, 4) === null && progress(null, 600, 2) === null && progress(100, null, 2) === null && progress(100, -50, 2) === null && progress(100, 600, null) === null);
    const val = valuation(3000, { eps: 200, epsGuide: 250, bps: 2400, dps: 60, dpsGuide: 75 });
    ck("valuation: price over earnings (last year's and the guided), price over book, dividend yield", near(val.pe, 15) && near(val.peGuide, 12) && near(val.pb, 1.25) && near(val.yield, 2) && near(val.yieldGuide, 2.5), val);
    const none = valuation(3000, { eps: -20, epsGuide: null, bps: 0, dps: null, dpsGuide: 0 });
    ck("no multiple on a loss, on a missing figure or on zero book value; a guided dividend of nil is a yield of nil", none.pe === null && none.peGuide === null && none.pb === null && none.yield === null && none.yieldGuide === 0 && valuation(null, { eps: 1, epsGuide: 1, bps: 1, dps: 1, dpsGuide: 1 }).yield === null, none);
    // stored statements around a results date
    const H = 3600e3, D0 = Date.UTC(2026, 10, 10, 6);   // results due 10 Nov 2026, 06:00 UTC
    ck("stored statements are asked for again daily from 18 hours after the results date until six days after it", !justReported(D0, D0 - H) && !justReported(D0, D0 + 17 * H) && justReported(D0, D0 + 18 * H) && justReported(D0, D0 + 5 * 24 * H) && !justReported(D0, D0 + 6 * 24 * H) && !justReported(null, D0) && !justReported(undefined, D0));
    ck("the results date kept with the statements: a date just passed stays until its six days have run, even when the quote already shows next quarter's", resultsDateToWatch(D0, D0 + 91 * 24 * H, D0 + 2 * 24 * H) === D0 && resultsDateToWatch(D0, null, D0 + H) === D0);
    ck("after those days the next date the quote knows is kept; a date still ahead is replaced by the quote's newer one, and kept when the quote has none", resultsDateToWatch(D0, D0 + 91 * 24 * H, D0 + 7 * 24 * H) === D0 + 91 * 24 * H && resultsDateToWatch(D0, D0 + 24 * H, D0 - 24 * H) === D0 + 24 * H && resultsDateToWatch(D0, null, D0 - 24 * H) === D0 && resultsDateToWatch(D0, null, D0 + 7 * 24 * H) === null && resultsDateToWatch(null, D0 - H, D0) === null && resultsDateToWatch(null, null, D0) === null);
  }

  console.log("\n[N] a stock's page: reading Yahoo's statements and key statistics (made-up answers in Yahoo's shape)");
  {
    const near = (a: number | null | undefined, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;
    const ser = (type: string, vals: Array<[string, number | null]>) => ({ meta: { symbol: ["XYZ"], type: [type] }, timestamp: vals.map(() => 0), [type]: vals.map(([asOfDate, raw]) => (raw == null ? null : { asOfDate, periodType: type.startsWith("annual") ? "12M" : "3M", currencyCode: "USD", reportedValue: { raw, fmt: String(raw) } })) });
    const A = ["2022-09-30", "2023-09-30", "2024-09-30", "2025-09-30"], Q = ["2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"];
    const json = { timeseries: { error: null, result: [
      ser("annualTotalRevenue", [[A[0], 394e9], [A[1], 383e9], [A[2], 391e9], [A[3], 416e9]]),
      ser("annualCostOfRevenue", [[A[0], 224e9], [A[1], 214e9], [A[2], 210e9], [A[3], 221e9]]),
      ser("annualGrossProfit", [[A[0], 170e9], [A[1], 169e9], [A[2], 181e9], [A[3], 195e9]]),
      ser("annualOperatingIncome", [[A[0], 119e9], [A[1], 114e9], [A[2], 123e9], [A[3], 133e9]]),
      ser("annualNetIncome", [[A[0], 99.8e9], [A[1], 97e9], [A[2], 93.7e9], [A[3], 112e9]]),
      ser("annualDilutedEPS", [[A[0], 6.11], [A[1], 6.13], [A[2], 6.08], [A[3], 7.46]]),
      ser("annualDilutedAverageShares", [[A[3], 15.0e9]]),
      ser("annualCapitalExpenditure", [[A[2], -9.4e9], [A[3], -12.7e9]]),
      ser("annualOperatingCashFlow", [[A[2], 118e9], [A[3], 111e9]]),
      ser("annualTotalAssets", [[A[3], 359e9]]), ser("annualStockholdersEquity", [[A[3], 74e9]]), ser("annualCurrentDebt", [[A[3], 20e9]]), ser("annualLongTermDebt", [[A[3], 78e9]]), ser("annualCashAndCashEquivalents", [[A[3], 36e9]]),
      ser("annualOrdinarySharesNumber", [[A[3], 14.8e9]]),
      // the lines of a company outside Japan: R&D, interest and other income down to pretax income, tax; what it paid out
      ser("annualResearchAndDevelopment", [[A[2], 31e9], [A[3], 34e9]]), ser("annualNetNonOperatingInterestIncomeExpense", [[A[3], -1.2e9]]), ser("annualOtherIncomeExpense", [[A[3], 0.9e9]]),
      ser("annualPretaxIncome", [[A[3], 132.7e9]]), ser("annualTaxProvision", [[A[3], 20.7e9]]), ser("annualTotalUnusualItems", [[A[3], -0.4e9]]),
      ser("annualCashCashEquivalentsAndShortTermInvestments", [[A[3], 55e9]]),
      ser("annualRepurchaseOfCapitalStock", [[A[2], -95e9], [A[3], -90e9]]), ser("annualCashDividendsPaid", [[A[2], -15.2e9], [A[3], -15.4e9]]), ser("annualStockBasedCompensation", [[A[3], 12.9e9]]),
      ser("annualSomethingNew", [[A[3], 1]]),
      ser("quarterlyTotalRevenue", Q.map((d, i) => [d, 90e9 + i * 5e9] as [string, number])),
      ser("quarterlyOperatingIncome", [[Q[0], 28e9], [Q[1], null], [Q[2], 30e9], [Q[4], 33e9]]),
      { meta: { type: ["quarterlyNetIncome"] }, quarterlyNetIncome: [{ asOfDate: Q[4], reportedValue: { raw: "n/a" } }, { asOfDate: "not a date", reportedValue: { raw: 5 } }, { reportedValue: { raw: 5 } }] },
      { meta: {}, nothing: [] }, null,
    ] } };
    const f = yahooFin(json, "USD", "2026-11-18");
    const [reqA, reqQ] = yahooFinTypes();
    ck("two requests, one naming every line by year and one by quarter, each short enough for any network path (under 1,000 characters)", yahooFinTypes().length === 2 && reqA.split(",").length === 30 && reqQ.split(",").length === 30 && reqA.split(",").every((x) => x.startsWith("annual")) && reqQ.split(",").every((x) => x.startsWith("quarterly")) && reqA.includes("annualTotalRevenue") && reqQ.includes("quarterlyCapitalExpenditure") && new Set([...reqA.split(","), ...reqQ.split(",")]).size === 60 && reqA.length < 1000 && reqQ.length < 1000, [reqA.length, reqQ.length]);
    { const half = (pick: (t: string) => boolean) => ({ timeseries: { result: json.timeseries.result.filter((r) => { const t = (r as { meta?: { type?: string[] } } | null)?.meta?.type?.[0]; return typeof t === "string" && pick(t); }) } });
      const split = yahooFin([half((t) => t.startsWith("annual")), half((t) => t.startsWith("quarterly"))], "USD", "2026-11-18");
      ck("the two answers read together give the same statements as one answer holding everything", JSON.stringify(split.annual) === JSON.stringify(f.annual) && JSON.stringify(split.quarterly.lines.revenue) === JSON.stringify(f.quarterly.lines.revenue) && JSON.stringify(split.ratios) === JSON.stringify(f.ratios)); }
    ck("years come out oldest first, named by the month and year they end in; quarters by their last month", f.annual.periods.map((p) => p.label).join() === "FY9/22,FY9/23,FY9/24,FY9/25" && f.quarterly.periods.map((p) => p.label).join() === "Sep 25,Dec 25,Mar 26,Jun 26,Sep 26" && f.annual.periods.every((p) => p.kind === "FY" && p.months === 12) && f.quarterly.periods.every((p) => p.kind === "Q" && p.months === 3));
    ck("each figure lands on its line and its period, exactly as sent", f.annual.lines.revenue!.join() === "394000000000,383000000000,391000000000,416000000000" && f.annual.lines.eps!.join() === "6.11,6.13,6.08,7.46" && f.annual.lines.ni![3] === 112e9 && f.annual.lines.cogs![0] === 224e9);
    ck("a line reported for some periods only is empty (not zero) in the others", f.annual.lines.ocf!.join() === ",,118000000000,111000000000" && f.annual.lines.assets!.slice(0, 3).every((v) => v === null) && f.annual.lines.assets![3] === 359e9 && f.quarterly.lines.op!.join() === "28000000000,,30000000000,,33000000000");
    ck("cash paid out is shown as the amount paid, a positive number: capex, buybacks, dividends", f.annual.lines.capex![2] === 9.4e9 && f.annual.lines.capex![3] === 12.7e9 && f.annual.lines.buyback!.join() === ",,95000000000,90000000000" && f.annual.lines.divPaid![3] === 15.4e9);
    ck("the lines of a company outside Japan land on their own rows, signs as sent: R&D, net interest, other income, pretax income, tax, unusual items, cash with short-term investments, stock-based compensation", f.annual.lines.rd!.join() === ",,31000000000,34000000000" && f.annual.lines.interestNet![3] === -1.2e9 && f.annual.lines.otherNonOp![3] === 0.9e9 && f.annual.lines.pretax![3] === 132.7e9 && f.annual.lines.tax![3] === 20.7e9 && f.annual.lines.unusual![3] === -0.4e9 && f.annual.lines.cashSti![3] === 55e9 && f.annual.lines.sbc![3] === 12.9e9);
    ck("lines Yahoo does not have stay absent: no ordinary profit, no extraordinary items, no guidance; a dividend per share only when it is sent", f.annual.lines.ordinary === undefined && f.annual.lines.extraInc === undefined && f.annual.lines.dps === undefined && f.guidance === null && f.annual.periods.every((p) => p.kind !== "FC"));
    ck("the table's rows are those of a company outside Japan: no row of Japanese accounting, and every row that is not common to all companies appears only when reported", f.layout === LAYOUT_FOREIGN && !LAYOUT_FOREIGN.is.some((x) => ["nonOpInc", "nonOpExp", "ordinary", "extraInc", "extraLoss"].includes(x)) && ["revenue", "pretax", "ni", "eps", "cash", "assets", "liabilities", "equity", "ocf", "icf", "fincf"].every((x) => !LAYOUT_FOREIGN.optional.includes(x as FinRowId)) && ["cogs", "gross", "rd", "sga", "op", "tax", "dps", "unusual", "stDebt", "ltDebt", "capex", "buyback", "divPaid", "sbc"].every((x) => LAYOUT_FOREIGN.optional.includes(x as FinRowId)) && [...LAYOUT_FOREIGN.is, ...LAYOUT_FOREIGN.bs, ...LAYOUT_FOREIGN.cf].length === new Set([...LAYOUT_FOREIGN.is, ...LAYOUT_FOREIGN.bs, ...LAYOUT_FOREIGN.cf]).size);
    ck("a Japanese company keeps the lines asked for, in their order; only those that exist under Japanese accounting alone can drop out (for a company reporting under IFRS)", LAYOUT_JP.is.join() === "revenue,cogs,gross,sga,op,nonOpInc,nonOpExp,ordinary,extraInc,extraLoss,pretax,ni,eps,dps" && LAYOUT_JP.bs.join() === "cash,stDebt,ltDebt,netCash,assets,liabilities,equity" && LAYOUT_JP.cf.join() === "ocf,icf,fincf,capex,fcf" && LAYOUT_JP.optional.join() === "nonOpInc,nonOpExp,ordinary,extraInc,extraLoss,pretax");
    ck("a series this page does not know, a value that is not a number, a date that is not a date and an empty entry are all skipped", f.quarterly.lines.ni === undefined && !Object.keys(f.annual.lines).includes("SomethingNew") && f.quarterly.periods.length === 5);
    ck("the unit comes from the revenue (bn here), and the ratios are worked out from the lines", f.unit.label === "bn" && f.source === "yahoo" && f.currency === "USD" && near(f.ratios.annual.salesYoy![3], (416 / 391 - 1) * 100) && near(f.ratios.annual.gpm![3], 195 / 416 * 100) && near(f.ratios.annual.opm![0], 119 / 394 * 100) && near(f.ratios.quarterly.salesYoy![4], (110 / 90 - 1) * 100) && f.ratios.quarterly.salesYoy![3] === null, f.ratios);
    ck("with no dividend per share from the source, the payout ratio is dividends paid over net income; empty where either is missing", f.ratios.annual.payout![0] === null && near(f.ratios.annual.payout![2], 15.2 / 93.7 * 100) && near(f.ratios.annual.payout![3], 15.4 / 112 * 100));
    { const P = (end: string): FinPeriod => ({ key: `FY:${end}`, end, label: end, kind: "FY", months: 12, std: null, doc: null, url: null, note: null });
      const withDps = ratiosOf({ periods: [P("2025-12-31")], lines: { eps: [10], dps: [4], divPaid: [9e9], ni: [10e9] } }), loss = ratiosOf({ periods: [P("2025-12-31")], lines: { divPaid: [9e9], ni: [-1e9] } });
      ck("a dividend per share, where given, is what the payout ratio is made from (over EPS); no ratio on a loss", near(withDps.payout![0], 40) && loss.payout![0] === null); }
    const none = yahooFin({ timeseries: { result: [] } }, "USD", null), junk = yahooFin({ nothing: true }, null, null), nul = yahooFin(null, null, null);
    ck("an answer with no series, or not in the expected shape at all, gives empty statements and no error", none.annual.periods.length === 0 && none.quarterly.periods.length === 0 && junk.annual.periods.length === 0 && nul.quarterly.periods.length === 0);
    const many = yahooFin({ timeseries: { result: [ser("annualTotalRevenue", Array.from({ length: 14 }, (_, i) => [`${2012 + i}-12-31`, 1e9 + i] as [string, number])), ser("quarterlyTotalRevenue", Array.from({ length: 20 }, (_, i) => [new Date(Date.UTC(2021, 3 * i + 3, 0)).toISOString().slice(0, 10), 1e8 + i] as [string, number]))] } }, "USD", null);
    ck("at most the last ten years and the last twelve quarters are kept", many.annual.periods.length === 10 && many.annual.periods[0].end === "2016-12-31" && many.annual.periods[9].end === "2025-12-31" && many.quarterly.periods.length === 12 && many.quarterly.lines.revenue![11] === 1e8 + 19);
    // the hover card reads a shorter shape, made from statements the page already holds
    const full = yahooFin({ timeseries: { result: [ser("annualTotalRevenue", Array.from({ length: 7 }, (_, i) => [`${2019 + i}-03-31`, 1e12 + i * 1e11] as [string, number])), ser("annualOperatingIncome", Array.from({ length: 7 }, (_, i) => [`${2019 + i}-03-31`, 1e11 + i * 1e10] as [string, number])), ser("annualOperatingCashFlow", [["2025-03-31", 3e11]]), ser("quarterlyTotalRevenue", Array.from({ length: 8 }, (_, i) => [new Date(Date.UTC(2024, 3 * i + 12, 0)).toISOString().slice(0, 10), 2e11 + i] as [string, number]))] } }, "JPY", "2026-11-18");
    full.annual.periods.push({ key: "FC:2026-03-31", end: "2026-03-31", label: "FY3/26", kind: "FC", months: 12, std: null, doc: null, url: null, note: null });
    for (const k of Object.keys(full.annual.lines) as Array<keyof typeof full.annual.lines>) full.annual.lines[k]!.push(k === "revenue" ? 1.9e12 : null);
    full.annual.lines.dps = [null, null, null, null, null, null, null, 80]; full.guidance = { end: "2026-03-31", disclosed: "2025-11-05", quarter: 2, progress: {}, ytdMonths: 6 };
    const card = legacyStatements(full);
    ck("for the hover card: the last five fiscal years (guidance is not a year), the last six quarters, and the guidance with its date", card.annual.map((r) => r.period).join() === "2021-03-31,2022-03-31,2023-03-31,2024-03-31,2025-03-31" && card.annual[4].revenue === 1.6e12 && card.annual[4].op === 1.6e11 && card.annual[4].cfo === 3e11 && card.annual[0].cfo === null && card.annual[4].ni === null && card.quarterly.length === 6 && card.quarterly[5].revenue === 2e11 + 7 && card.forecast?.fiscalYearEnd === "2026-03-31" && card.forecast.revenue === 1.9e12 && card.forecast.op === null && card.forecast.dps === 80 && card.forecast.disclosed === "2025-11-05" && card.source === "yahoo" && card.currency === "JPY", card);
    ck("statements without guidance give a card without it", legacyStatements(f).forecast === null && legacyStatements(f).annual.length === 4 && legacyStatements(f).quarterly.length === 5);
    const ks = keyStatsOf({ quoteSummary: { result: [{ defaultKeyStatistics: { sharesOutstanding: { raw: 14.8e9, fmt: "14.8B" }, floatShares: { raw: 14.7e9 }, sharesShort: { raw: 1.1e8 }, shortRatio: { raw: 2.3 }, shortPercentOfFloat: { raw: 0.0075 }, sharesPercentSharesOut: { raw: 0.0074 }, sharesShortPriorMonth: { raw: 1.0e8 }, dateShortInterest: { raw: 1793318400 }, sharesShortPreviousMonthDate: { raw: 1790726400 }, bookValue: {}, beta: { raw: 1.2 } } }], error: null } });
    ck("key statistics: share counts and short interest are read from their raw values; an empty one is null", ks.sharesOutstanding === 14.8e9 && ks.floatShares === 14.7e9 && ks.sharesShort === 1.1e8 && ks.shortRatio === 2.3 && ks.shortPercentOfFloat === 0.0075 && ks.sharesPercentSharesOut === 0.0074 && ks.sharesShortPriorMonth === 1.0e8 && ks.dateShortInterest === 1793318400 && ks.bookValue === null, ks);
    ck("an answer without the statistics (a Tokyo stock has no short interest there; a wrong shape) gives nulls, not an error", keyStatsOf({ quoteSummary: { result: [{}] } }).sharesShort === null && keyStatsOf({ quoteSummary: { result: null } }).sharesOutstanding === null && keyStatsOf(null).floatShares === null && keyStatsOf({ quoteSummary: { result: [{ defaultKeyStatistics: { sharesShort: { raw: "many" }, floatShares: 5e6 } }] } }).sharesShort === null);
  }

  console.log("\n[O] a stock's page: the big moves marked on the chart");
  {
    const T0 = Date.parse("2026-01-05T00:00:00Z") / 1000, D = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
    const series = (closes: number[]): Bar[] => closes.map((c, i) => ({ t: T0 + i * 86400, c }));
    const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
    const flat = (n: number, v = 100) => Array.from({ length: n }, () => v);
    // one day
    let m = bigMoves(series([...flat(10), 94, 94, 94]));
    ck("a day that closes 5% or more from the previous close is a big move, dated that day, with both closes", m.length === 1 && m[0].kind === "d1" && m[0].dir === -1 && near(m[0].pct, -6) && m[0].to === D(T0 + 10 * 86400) && m[0].from === D(T0 + 9 * 86400) && m[0].fromPx === 100 && m[0].toPx === 94, m);
    ck("exactly 5% counts (up and down); 4.99% does not", bigMoves(series([...flat(8), 95])).length === 1 && bigMoves(series([...flat(8), 105])).length === 1 && bigMoves(series([...flat(8), 105]))[0].dir === 1 && bigMoves(series([...flat(8), 95.01])).length === 0 && bigMoves(series([...flat(8), 104.99])).length === 0);
    // a week: five sessions, no single day of 5%
    m = bigMoves(series([...flat(6), 102, 104.5, 107, 109, 111.5, 111.5, 111.5]));
    ck("five sessions that move the close 10% or more are one big move, even when no single day is", m.length === 1 && m[0].kind === "w1" && near(m[0].pct, 11.5) && m[0].from === D(T0 + 5 * 86400) && m[0].to === D(T0 + 10 * 86400), m);
    m = bigMoves(series([...flat(6), 103, 106, 109, 112, 115, 118, 121, 124, 124, 124, 124, 124, 124]));
    ck("a rise that runs on gives one mark for its largest week, not one for every overlapping window", m.filter((x) => x.kind === "w1").length === 1 && near(m.find((x) => x.kind === "w1")!.pct, 15) && m.filter((x) => x.kind === "d1").length === 0, m);
    const twoWeeks = bigMoves(series([...flat(6), 97, 94, 91, 88, 86, ...flat(10, 86), 89, 92, 95, 98, 101, 101]));
    ck("a week down and, later, a week up are two moves, each in its own direction", twoWeeks.filter((x) => x.kind === "w1").length === 2 && twoWeeks.filter((x) => x.kind === "w1").map((x) => x.dir).sort().join() === "-1,1", twoWeeks);
    // a month: a slide of 1.2% a day
    const slide = Array.from({ length: 31 }, (_, i) => 100 * 0.988 ** i);
    m = bigMoves(series([...flat(5), ...slide, ...flat(5, slide[30])]));
    const month = m.filter((x) => x.kind === "m1");
    ck("a fall of 20% or more from a high to a later low within 21 sessions is one big move, from the high to the low", month.length === 1 && month[0].dir === -1 && near(month[0].pct, (0.988 ** 21 - 1) * 100, 1e-6) && m.filter((x) => x.kind === "d1").length === 0 && m.filter((x) => x.kind === "w1").length === 0, m);
    ck("a slide of under 20% in a month is not one (1% a day for a month is 19%)", bigMoves(series([...flat(5), ...Array.from({ length: 31 }, (_, i) => 100 * 0.99 ** i)])).length === 0);
    const vee = [...flat(4), ...Array.from({ length: 16 }, (_, i) => 100 * 0.985 ** (i + 1)), ...Array.from({ length: 16 }, (_, i) => 100 * 0.985 ** 16 * 1.016 ** (i + 1))];
    m = bigMoves(series(vee)).filter((x) => x.kind === "m1");
    ck("a fall and the recovery after it are two moves: one ending at the low, one starting from it", m.length === 2 && m.some((x) => x.dir === -1 && x.to === D(T0 + 19 * 86400)) && m.some((x) => x.dir === 1 && x.from === D(T0 + 19 * 86400) && x.pct >= 20), m);
    // everything at once: a crash day at the end of a bad week in a bad month
    const crash = [...flat(10), 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 77];
    m = bigMoves(series(crash));
    ck("a crash day that ends a bad week and a bad month gives all three, on the same day, newest first", m.length >= 3 && m.slice(0, 3).map((x) => x.kind).join() === "d1,m1,w1" && new Set(m.slice(0, 3).map((x) => x.to)).size === 1 && m.every((x) => x.dir === -1), m);
    ck("only moves ending on or after the day asked for are returned", bigMoves(series(crash), T0 + 26 * 86400).length === 0 && bigMoves(series(crash), T0 + 25 * 86400).every((x) => x.t === T0 + 25 * 86400) && bigMoves(series(crash), T0 + 25 * 86400).length === 3);
    ck("bars without a price are skipped, and too short a history gives nothing", bigMoves(series([100, 0, 100, 100])).length === 0 && bigMoves([]).length === 0 && bigMoves(series([100])).length === 0);
    const live = series([...flat(10), 93]), lastDay = D(T0 + 10 * 86400);
    ck("while the market is open today's bar is left out: a fall at lunchtime is not yet a day that closed down", bigMoves(settledBars(live, true, lastDay)).length === 0 && bigMoves(settledBars(live, false, lastDay)).length === 1 && settledBars(live, true, lastDay).length === 10);
    ck("an open market with no bar for today yet (the feed is behind, or it is a holiday) drops nothing", settledBars(live, true, D(T0 + 11 * 86400)).length === 11 && settledBars([], true, lastDay).length === 0);
    ck("large enough to be explained: 1tn yen and above, 10bn dollars and above, other currencies by their dollar value", isLargeCap(1e12, "JPY", 155) && !isLargeCap(9.99e11, "JPY", 155) && isLargeCap(1e10, "USD", 1) && !isLargeCap(9.9e9, "USD", 1) && isLargeCap(1.5e13, "KRW", 1400) && !isLargeCap(1.3e13, "KRW", 1400) && !isLargeCap(1e15, "KRW", null) && !isLargeCap(null, "JPY", 155) && !isLargeCap(1e13, null, 1));
    ck("each move in words", moveText({ kind: "d1", pct: -8.23, from: "2026-08-04", to: "2026-08-05" }) === "−8.2% on the day" && moveText({ kind: "w1", pct: 12.44, from: "2026-08-03", to: "2026-08-10" }) === "+12.4% in five sessions (from 3 Aug)" && moveText({ kind: "m1", pct: -24, from: "2026-08-03", to: "2026-08-27" }) === "−24.0% from the high of 3 Aug to the low of 27 Aug" && moveText({ kind: "m1", pct: 21.5, from: "2026-04-07", to: "2026-04-30" }) === "+21.5% from the low of 7 Apr to the high of 30 Apr");
  }

  console.log("\n[P] a stock's page: asking why a big move happened, and reading the answer");
  {
    const ctx: MoveCtx = { symbol: "7203.T", name: "Toyota Motor Corp", exchange: "Tokyo", sector: "Consumer Discretionary", currency: "JPY", kind: "d1", from: "2026-08-04", to: "2026-08-05", pct: -8.23, fromPx: 3200, toPx: 2936.6, text: "−8.2% on the day", bench: "Nikkei 225", benchPct: -1.14 };
    const q = causeQuestion(ctx);
    ck("the question names the stock, the move with its dates and closes, and the benchmark's change over the same dates", q.includes("Toyota Motor Corp (7203.T, Tokyo, Consumer Discretionary)") && q.includes("-8.2% on the day on 5 August 2026 (previous close 4 August 2026); close 3,200 to 2,937 JPY.") && q.includes("Over the same dates the Nikkei 225 changed -1.1%.") && /reported reason/.test(q), q);
    const qm = causeQuestion({ ...ctx, kind: "m1", from: "2026-07-07", to: "2026-08-05", pct: -24, fromPx: 96.5, toPx: 73.34, text: "−24.0% from the high of 7 Jul to the low of 5 Aug", bench: null, benchPct: null, currency: "USD", exchange: null, sector: null });
    ck("a move over several days gives both closes' dates; a missing benchmark is said to be missing, not left as nought", qm.includes("between the close of 7 July 2026 and the close of 5 August 2026; close 96.50 to 73.34 USD.") && qm.includes("The benchmark's change over these dates is not available.") && qm.includes("Toyota Motor Corp (7203.T)"), qm);
    ck("the instructions forbid guessing and ask for the reports relied on", /Never infer a reason from the price alone/.test(CAUSE_SYSTEM) && /a guess is harmful/.test(CAUSE_SYSTEM) && /"sources"/.test(CAUSE_SYSTEM) && /none was found/.test(CAUSE_SYSTEM));
    ck("the instructions ask for the most authoritative report first, a rewrite site only when nothing better says the same, and no extra search for a better-known name", /rest the reason on the most authoritative/.test(CAUSE_SYSTEM) && /company's own release or filing/.test(CAUSE_SYSTEM) && /only when none of the better kind reports the same thing/.test(CAUSE_SYSTEM) && /Do not search again only to find a better-known outlet/.test(CAUSE_SYSTEM));
    const pages = [{ title: "Toyota cuts full-year outlook as tariffs bite | Example News", url: "https://www.example.com/business/toyota-outlook-cut?utm=x" }, { title: "Toyota Motor: Consolidated results for the first quarter", url: "https://global.example.org/ir/q1.pdf" }, { title: "Unrelated page", url: "https://other.example.net/page" }];
    const good = readCause('I searched and found two reports.\n\n{"found": true, "cause": "Toyota cut its full-year operating profit forecast by 16% with first-quarter results, citing US tariffs.", "sources": ["https://example.com/business/toyota-outlook-cut", "https://global.example.org/ir/q1.pdf"]}', pages);
    ck("a reason is read with the reports behind it, matched to the pages the search returned (their titles and addresses)", good.found && good.cause === "Toyota cut its full-year operating profit forecast by 16% with first-quarter results, citing US tariffs." && good.sources.length === 2 && good.sources[0].url === pages[0].url && good.sources[0].title === pages[0].title && good.sources[1].url === pages[1].url, good);
    const invented = readCause('{"found": true, "cause": "The company announced a large recall of vehicles before the open.", "sources": ["https://made-up.example/recall"]}', pages);
    ck("a reason whose only report is a page the search never returned is not shown: the move is stored as not found", invented.found === false && invented.cause === null && invented.sources.length === 0, invented);
    const mixed = readCause('{"found": true, "cause": "Toyota cut its full-year forecast with first-quarter results.", "sources": ["https://made-up.example/x", "https://global.example.org/ir/q1.pdf", "https://global.example.org/ir/q1.pdf"]}', pages);
    ck("an invented address among real ones is dropped, a repeated one counted once", mixed.found && mixed.sources.length === 1 && mixed.sources[0].url === pages[1].url, mixed);
    ck("a reason with no report named is not shown either", readCause('{"found": true, "cause": "Probably profit-taking after a strong run in the shares.", "sources": []}', pages).found === false && readCause('{"found": true, "cause": "Likely sector rotation.", "sources": null}', pages).found === false);
    ck("'not found' is read as that, whatever else the reply says", readCause('Several pages mention the stock but none explains this move.\n{"found": false, "cause": null, "sources": []}', pages).found === false && readCause('{"found": false, "cause": "maybe earnings", "sources": ["https://global.example.org/ir/q1.pdf"]}', pages).cause === null && readCause('{"found": "yes", "cause": "Toyota cut its forecast with results.", "sources": ["https://global.example.org/ir/q1.pdf"]}', pages).found === false);
    const fenced = readCause('Here is my answer {see below}.\n```json\n{"found": true, "cause": "**Toyota** cut its `full-year` forecast with first-quarter results.", "sources": ["https://global.example.org/ir/q1.pdf/"]}\n```', pages);
    ck("the answer is found inside a code fence and after other braces; marks are taken out of the sentence", fenced.found && fenced.cause === "Toyota cut its full-year forecast with first-quarter results." && fenced.sources[0].url === pages[1].url, fenced);
    const long = readCause(`{"found": true, "cause": "${"Toyota cut its full-year forecast and announced further measures in response to tariffs ".repeat(5).trim()}", "sources": ["https://global.example.org/ir/q1.pdf"]}`, pages);
    ck("an over-long sentence is cut at a word and marked as cut; at most three reports are kept", long.found && long.cause!.length <= 258 && long.cause!.endsWith("…") && readCause(`{"found": true, "cause": "Toyota cut its forecast with results.", "sources": ${JSON.stringify([...pages.map((p) => p.url), "https://fourth.example/x"])}}`, [...pages, { title: "4", url: "https://fourth.example/x" }]).sources.length === 3, long.cause);
    ck("an answer that is not found says which way it came to that, for the job's log; a found one says nothing", invented.why === "no returned page cited" && readCause('{"found": false, "cause": null, "sources": []}', pages).why === "none reported" && readCause('{"found": true, "cause": "Results.", "sources": ["https://global.example.org/ir/q1.pdf"]}', pages).why === "no sentence" && good.why === undefined, [invented.why, good.why]);
    let threw = 0; for (const bad of ["I could not find anything.", "{not json}", "", '["found", true]', '{"cause": "x"}']) { try { readCause(bad, pages); } catch { threw++; } }
    ck("a reply with no answer object is an error, so the job tries that move again instead of storing nothing", threw === 5);
  }

  console.log("\n[Q] a stock's page: reading EDINET DB's three answers (made-up answers in the provider's shape)");
  {
    const near = (a: number | null | undefined, b: number, eps = 1e-6) => a != null && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
    const B = 1e9;
    // a made-up company with a March year: twelve fiscal years, a 2-for-1 split in fiscal 2021, loans and bonds
    const year = (y: number, extra: Record<string, unknown> = {}): Record<string, unknown> => {
      const rev = (1000 + (y - 2015) * 50) * B, op = rev * 0.1, ord = op + 2 * B, pre = ord - 3 * B, ni = pre * 0.7, split = y <= 2020 ? 2 : 1;
      return { fiscalYear: y, revenue: rev, costOfSales: rev * 0.7, grossProfit: rev * 0.3, sga: rev * 0.2, operatingIncome: op, nonOperatingIncome: 5 * B, nonOperatingExpenses: 3 * B, ordinaryIncome: ord,
        extraordinaryIncome: 1 * B, extraordinaryLoss: 4 * B, profitBeforeTax: pre, netIncome: ni, eps: (ni / 1e9) * split, adjustedEps: ni / 1e9, dividendPerShare: 30 * split, adjustedDividendPerShare: 30, bps: 900 * split, adjustedBps: 900,
        splitAdjustmentFactor: split, payoutRatio: 0.3, cash: 200 * B, shortTermLoans: 50 * B, currentPortionBondsPayable: 10 * B, longTermLoans: 120 * B, bondsPayable: 80 * B, marketCap: 2000 * B, ev: 2060 * B,
        totalAssets: 1500 * B, totalLiabilities: 900 * B, netAssets: 600 * B, cfOperating: 150 * B, cfInvesting: -90 * B, cfFinancing: -40 * B, purchaseOfPpe: -60 * B, purchaseOfIntangibleAssets: -5 * B, capex: 70 * B,
        sharesIssued: 1.0e9, sharesIssuedFiscalYearEnd: 1.01e9, accountingStandard: "JP", docID: `S100T${y}`, edinetFilingUrl: `https://example.org/filing/S100T${y}`, treasurySharesAsOfDate: `${y}-03-31`, numEmployees: 1000, ...extra };
    };
    const annual = { data: [
      ...[2015, 2016, 2017, 2018].map((y) => year(y)),
      year(2019, { ev: 2100 * B }),                                                   // the provider's total says 300bn of debt, the detail adds up to 260bn
      year(2020, { adjustedEps: undefined, adjustedDividendPerShare: undefined, adjustedBps: undefined }),   // before the split, and no adjusted figures
      ...[2021, 2022, 2023].map((y) => year(y)),
      year(2024, { purchaseOfPpeAndIntangibleAssets: -70 * B }),                        // the combined line beside the two separate ones
      year(2025),
      year(2026, { dilutedEps: 73.0 }),
    ], latest_shares_snapshot: { sharesOutstanding: 1.0e9, treasuryShares: 0.05e9, sharesOutstandingExcludingTreasury: 0.95e9, sharesMeasurementDate: "2026-09-30", disclosureDate: "2026-11-05", fiscalYearEnd: "2027-03-31", quarter: 2, splitAdjustmentStatus: "not_needed" }, _attribution: "made up" };
    const qrow = (fy: number, q: number, extra: Record<string, unknown> = {}) => ({ fiscalYear: fy, quarter: q, accountingStandard: "JP", revenue: (300 + fy - 2024 + q) * B, costOfSales: 200 * B, grossProfit: (100 + fy - 2024 + q) * B, sga: 60 * B, operatingIncome: 30 * B, nonOperatingIncome: 1 * B, ordinaryIncome: 31 * B, profitBeforeTax: 30 * B, netIncome: 21 * B, eps: 21 + q, totalAssets: 1500 * B, netAssets: 600 * B, derivationMethod: q === 1 ? "direct_q1" : "ytd_diff", sourceType: "edinet_quarterly", ...extra });
    const standalone = { data: [...[2024, 2025, 2026].flatMap((fy) => [1, 2, 3, 4].map((q) => qrow(fy, q))), qrow(2027, 1, { costOfSales: undefined, grossProfit: undefined, sourceType: "quarterly_disclosure" }), { fiscalYear: 2027, quarter: 2, accountingStandard: "JP", totalAssets: 1510 * B, netAssets: 610 * B, cash: 210 * B, derivationMethod: "no_prev_ytd", sourceType: "edinet_quarterly" }], meta: { period: "quarterly_standalone" } };
    const fc = { forecastRevenue: 1650000, forecastOperatingIncome: 170000, forecastOrdinaryIncome: 172000, forecastNetIncome: 118000, forecastEps: 118.0, forecastDividendPerShare: 36.0 };
    const earnings = { edinetCode: "E99999", count: 6, earnings: [
      { disclosureDate: "2026-11-20", quarter: 2, isConsolidated: false, isCorrection: false, fiscalYearEnd: "2027-03-31", revenue: 1, operatingIncome: 1, netIncome: 1, forecastRevenue: 1 },   // the parent alone: not the one to read
      { disclosureDate: "2026-11-05", title: "2Q", quarter: 2, accountingStandard: "JP_GAAP", isConsolidated: true, isCorrection: false, fiscalYearEnd: "2027-03-31", revenue: 800000, operatingIncome: 90000, ordinaryIncome: 91000, netIncome: 62000, eps: 62.0, ...fc,
        effectiveForecastRevenue: 1700000, effectiveForecastRevenueSource: "revision_notice", effectiveForecastRevenueState: "point", effectiveForecastRevenueAsOfDate: "2026-11-12",
        effectiveForecastOperatingIncome: null, effectiveForecastOperatingIncomeSource: "revision_notice", effectiveForecastOperatingIncomeState: "range", effectiveForecastOperatingIncomeAsOfDate: "2026-11-12",
        effectiveForecastOrdinaryIncome: 172000, effectiveForecastOrdinaryIncomeSource: "tanshin", effectiveForecastOrdinaryIncomeAsOfDate: "2026-11-05", pdfUrl: "https://example.org/ir/2q.pdf" },
      { disclosureDate: "2026-08-20", quarter: 1, accountingStandard: "JP", isConsolidated: true, isCorrection: true, fiscalYearEnd: "2027-03-31", revenue: 390000, operatingIncome: 44000, ordinaryIncome: 45000, netIncome: 30000, eps: 30.0, ...fc },
      { disclosureDate: "2026-08-05", quarter: 1, accountingStandard: "JP", isConsolidated: true, isCorrection: false, fiscalYearEnd: "2027-03-31", revenue: 380000, operatingIncome: 44000, ordinaryIncome: 45000, netIncome: 30000, eps: 30.0, ...fc },
      { disclosureDate: "2026-05-10", quarter: 4, accountingStandard: "JP_GAAP", isConsolidated: true, isCorrection: false, fiscalYearEnd: "2026-03-31", revenue: 1550000, operatingIncome: 155000, ordinaryIncome: 157000, netIncome: 107800, eps: 107.8, bps: 905.0, totalAssets: 1500000, netAssets: 600000, cfOperating: 150000, cfInvesting: -90000, cfFinancing: -40000, dividendPerShare: 32.0, ...fc },
      { disclosureDate: "2026-02-03", quarter: 3, accountingStandard: "JP_GAAP", isConsolidated: true, isCorrection: false, fiscalYearEnd: "2026-03-31", revenue: 1150000, operatingIncome: 115000, ordinaryIncome: 116000, netIncome: 80000, eps: 80.0 },
    ], marketSegment: "prime" };
    const f = edinetFin({ annual, standalone, earnings }, "2026-11-19")!;
    const A = f.annual, col = (id: string, i: number) => (A.lines as Record<string, Array<number | null>>)[id]?.[i] ?? null;

    ck("the last ten fiscal years, oldest first, named by the month and year they end in, then the company's guidance as the last column", A.periods.map((p) => p.label).join() === "FY3/17,FY3/18,FY3/19,FY3/20,FY3/21,FY3/22,FY3/23,FY3/24,FY3/25,FY3/26,FY3/27" && A.periods.map((p) => p.kind).join("") === "FYFYFYFYFYFYFYFYFYFYFC" && A.periods[0].end === "2017-03-31" && A.periods[10].end === "2027-03-31", A.periods.map((p) => p.label));
    ck("each line of the income statement lands on its row and year, in yen as sent", col("revenue", 9) === 1550 * B && near(col("cogs", 9), 1085 * B) && near(col("gross", 9), 465 * B) && near(col("sga", 9), 310 * B) && near(col("op", 9), 155 * B) && col("nonOpInc", 9) === 5 * B && col("nonOpExp", 9) === 3 * B && near(col("ordinary", 9), 157 * B) && col("extraInc", 9) === 1 * B && col("extraLoss", 9) === 4 * B && near(col("pretax", 9), 154 * B) && near(col("ni", 9), 107.8 * B) && col("revenue", 0) === 1100 * B);
    ck("the balance sheet and the cash flows likewise; each year keeps its filing's number and link", col("cash", 9) === 200 * B && col("assets", 9) === 1500 * B && col("liabilities", 9) === 900 * B && col("equity", 9) === 600 * B && col("ocf", 9) === 150 * B && col("icf", 9) === -90 * B && col("fincf", 9) === -40 * B && A.periods[9].doc === "S100T2026" && A.periods[9].url === "https://example.org/filing/S100T2026" && A.periods[9].std === "JP");
    ck("capex is the cash paid for property, plant, equipment and intangibles from the cash flow statement (not the capex of the facilities section): the combined line where there is one, never added to the two separate lines", col("capex", 9) === 65 * B && col("capex", 7) === 70 * B);
    ck("short-term debt is short-term loans and bonds due within a year, long-term debt is long-term loans and bonds: no leases", col("stDebt", 9) === 60 * B && col("ltDebt", 9) === 200 * B);
    ck("where the provider's own total of debt (enterprise value less market value plus cash) disagrees with the detail, no debt figure is shown for that year, and the table says so", col("stDebt", 2) === null && col("ltDebt", 2) === null && col("stDebt", 1) === 60 * B && f.notes.some((x) => /did not add up to its own total/.test(x)), [col("stDebt", 2), f.notes]);
    ck("per-share figures are the ones adjusted for the later split, so 2020 and 2021 compare; a year before the split with no adjusted figure is left empty, not shown on the old share count", near(col("eps", 4), 91 * 0.7 * 1.0 + 0) === false && near(col("eps", 4), ((1300 * 0.1 + 2 - 3) * 0.7)) && col("dps", 4) === 30 && col("bps", 2) === 900 && col("eps", 3) === null && col("dps", 3) === null && col("bps", 3) === null && near(col("eps", 2), (1200 * 0.1 + 2 - 3) * 0.7) && f.notes.some((x) => /adjusted for later share splits/.test(x)), [col("eps", 2), col("eps", 3), col("eps", 4)]);
    ck("the payout ratio is the one the provider gives (in per cent); shares are the count at the year's end", near(f.ratios.annual.payout![9], 30) && col("shares", 9) === 1.01e9);
    ck("a diluted share count only where a diluted EPS is reported: net income over that EPS", near(col("dilutedShares", 9), (107.8 * B) / 73.0) && col("dilutedShares", 8) === null);

    // guidance
    ck("guidance is the newest earnings release's forecast for the year in progress: its consolidated disclosure, not the parent-only one of a later date", f.guidance !== null && f.guidance.end === "2027-03-31" && f.guidance.quarter === 2 && f.guidance.ytdMonths === 6 && near(col("ordinary", 10), 172 * B) && near(col("ni", 10), 118 * B) && col("eps", 10) === 118.0 && col("dps", 10) === 36.0, f.guidance);
    ck("a line a later revision notice changed carries the revised figure and the notice's date; a line the notice turned into a range is empty, not left at the old figure", near(col("revenue", 10), 1700 * B) && col("op", 10) === null && f.guidance!.disclosed === "2026-11-12");
    ck("progress is the year-to-date figure over the full-year guidance (the revised one), for the lines that have both", near(f.guidance!.progress.revenue, (800 / 1700) * 100) && f.guidance!.progress.op === null && near(f.guidance!.progress.ordinary, (91 / 172) * 100) && near(f.guidance!.progress.ni, (62 / 118) * 100), f.guidance!.progress);
    ck("the guidance column has only what the company guides: the other lines are empty there", ["cogs", "gross", "sga", "cash", "assets", "equity", "ocf", "capex", "stDebt"].every((k) => col(k, 10) === null));

    // quarters
    const Q = f.quarterly, qcol = (id: string, i: number) => (Q.lines as Record<string, Array<number | null>>)[id]?.[i] ?? null;
    ck("the last twelve single quarters, each named by its quarter and fiscal year and dated by its last day", Q.periods.length === 12 && Q.periods[0].label === "3Q 3/24" && Q.periods[0].end === "2023-12-31" && Q.periods[11].label === "2Q 3/27" && Q.periods[11].end === "2026-09-30" && Q.periods[10].label === "1Q 3/27" && Q.periods.every((p) => p.kind === "Q" && p.months === 3), Q.periods.map((p) => p.label));
    ck("a quarter's figures are the provider's single-quarter figures as sent; a line a quarter's source does not carry is empty in that quarter only", qcol("revenue", 0) === 303 * B && qcol("eps", 0) === 24 && qcol("revenue", 10) === 304 * B && qcol("cogs", 10) === null && qcol("gross", 10) === null && qcol("cogs", 9) === 200 * B);
    ck("a quarter whose flows the provider could not derive keeps its balance sheet and stays empty elsewhere", qcol("revenue", 11) === null && qcol("ni", 11) === null && qcol("assets", 11) === 1510 * B && qcol("cash", 11) === 210 * B && near(f.ratios.quarterly.salesYoy![10], (304 / 303 - 1) * 100) && f.ratios.quarterly.salesYoy![11] === null);
    ck("one unit for the company from its revenue (bn here: 1,550bn a year), the Japanese table rows, the source and currency", f.unit.label === "bn" && f.layout === LAYOUT_JP && f.source === "edinetdb" && f.currency === "JPY" && f.asOf === "2026-11-19");
    ck("share counts as of the latest earnings release: issued (treasury shares included) and treasury", f.sharesNow?.outstanding === 1.0e9 && f.sharesNow.treasury === 0.05e9 && f.sharesNow.asOf === "2026-09-30");

    // the REST interface sends snake_case and other wrappers
    const snake = (v: unknown): unknown => (Array.isArray(v) ? v.map(snake) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()), snake(x)])) : v);
    const r = edinetFin({ annual: snake(annual), standalone: snake(standalone), earnings: { data: snake(earnings) } }, "2026-11-19")!;
    ck("the same answers in snake_case and inside another wrapper (as the REST interface sends them) give the same statements", JSON.stringify(r) === JSON.stringify(f) && "fiscal_year" in ((snake(annual) as { data: Array<Record<string, unknown>> }).data[0]) && "doc_i_d" in ((snake(annual) as { data: Array<Record<string, unknown>> }).data[0]));

    // a full year the earnings release has, the annual report not yet
    const early = edinetFin({ annual: { ...annual, data: annual.data.slice(0, -1) }, standalone: null, earnings: { ...earnings, earnings: earnings.earnings.slice(4) } }, null)!;
    const ecol = (id: string, i: number) => (early.annual.lines as Record<string, Array<number | null>>)[id]?.[i] ?? null, last = early.annual.periods.findIndex((p) => p.end === "2026-03-31");
    ck("a fiscal year reported in the earnings release but not yet in the annual report is shown from the release (millions turned into yen), marked as such, with the lines a release does not carry left empty", last === 9 && early.annual.periods[last].kind === "FY" && /決算短信/.test(early.annual.periods[last].note ?? "") && ecol("revenue", last) === 1550 * B && ecol("ni", last) === 107.8 * B && ecol("eps", last) === 107.8 && ecol("dps", last) === 32 && ecol("assets", last) === 1500 * B && ecol("ocf", last) === 150 * B && ecol("cogs", last) === null && ecol("stDebt", last) === null && early.notes.some((x) => /FY3\/26 is from the 決算短信/.test(x)), early.annual.periods.map((p) => p.label));
    ck("after a full-year release the guidance is next year's: its column is the year after, and there is no progress to show", early.guidance?.end === "2027-03-31" && early.guidance.quarter === 4 && early.guidance.ytdMonths === null && Object.keys(early.guidance.progress).length === 0 && early.annual.periods.slice(-1)[0].kind === "FC" && ecol("revenue", 10) === 1650 * B && early.quarterly.periods.length === 0);

    // when to ask again
    const day = 86400e3, t = (d: string) => Date.parse(d);
    ck("the earnings answer is asked again daily once the next release is due (70 days after the newest), not before", !edinetWaiting({ annual, standalone, earnings }, t("2026-12-01")).earnings && edinetWaiting({ annual, standalone, earnings }, t("2026-11-20") + 70 * day).earnings && !edinetWaiting({ annual, standalone, earnings: null }, t("2027-06-01")).earnings);
    ck("the annual answer is asked again while a full-year release is out for a year it does not have, and not otherwise", !edinetWaiting({ annual, standalone, earnings }, t("2026-12-01")).annual && edinetWaiting({ annual: { data: annual.data.slice(0, -1) }, standalone, earnings }, t("2026-06-01")).annual && edinetWaiting({ annual: null, standalone, earnings }, t("2026-06-01")).annual);

    // a company reporting under IFRS with a December year, and one with no debt
    const ifrsYear = (y: number) => ({ fiscalYear: y, revenue: 3000 * B, costOfSales: 1300 * B, grossProfit: 1700 * B, sga: 1000 * B, operatingIncome: 700 * B, profitBeforeTax: 640 * B, netIncome: 450 * B, eps: 250, adjustedEps: 250, dividendPerShare: 200, adjustedDividendPerShare: 200, splitAdjustmentFactor: 1, cash: 800 * B, ibdCurrent: 80 * B, ibdNoncurrent: 1600 * B, marketCap: 11000 * B, ev: 11880 * B, totalAssets: 8000 * B, totalLiabilities: 4000 * B, netAssets: 4000 * B, cfOperating: 500 * B, cfInvesting: -260 * B, cfFinancing: -470 * B, purchaseOfPpe: -140 * B, accountingStandard: "IFRS", docID: "S100I" + y });
    const i = edinetFin({ annual: { data: [ifrsYear(2024), ifrsYear(2025)], latest_shares_snapshot: { sharesOutstanding: 2e9, treasuryShares: null, splitAdjustmentStatus: "applied", sharesOutstandingSplitAdjusted: 4e9, treasurySharesSplitAdjusted: 4e8, disclosureDate: "2026-10-29" } }, standalone: { data: [{ fiscalYear: 2026, quarter: 3, accountingStandard: "IFRS", revenue: 900 * B, netIncome: 130 * B }] }, earnings: { earnings: [{ disclosureDate: "2026-10-29", quarter: 3, fiscalYearEnd: "2026-12-31", isConsolidated: true, revenue: 2600000, netIncome: 400000, forecastRevenue: 3500000, forecastEps: 290.0, forecastShareBasis: "pre_split", adjustedForecastEps: 145.0, forecastDividendPerShare: 208.0, adjustedForecastDividendPerShare: 104.0 }] } }, null)!;
    const icol = (id: string, k: number) => (i.annual.lines as Record<string, Array<number | null>>)[id]?.[k] ?? null;
    ck("a December year is named by December; a third quarter of it ends in September", i.annual.periods.map((p) => p.label).join() === "FY12/24,FY12/25,FY12/26" && i.annual.periods[1].end === "2025-12-31" && i.quarterly.periods[0].label === "3Q 12/26" && i.quarterly.periods[0].end === "2026-09-30");
    ck("under IFRS the lines of Japanese accounting are absent (so their rows drop out), debt is the interest-bearing debt lines, and the table says how debt is read", i.annual.lines.ordinary === undefined && i.annual.lines.nonOpInc === undefined && i.annual.lines.extraLoss === undefined && icol("stDebt", 1) === 80 * B && icol("ltDebt", 1) === 1600 * B && icol("capex", 1) === 140 * B && i.layout?.titles?.stDebt !== undefined && i.layout.is.join() === LAYOUT_JP.is.join() && i.notes.some((x) => /interest-bearing debt lines of the balance sheet under IFRS/.test(x)));
    ck("a forecast per share made before a pending split is the provider's split-adjusted figure; share counts follow a split the provider has confirmed", icol("eps", 2) === 145.0 && icol("dps", 2) === 104.0 && icol("revenue", 2) === 3500 * B && i.sharesNow?.outstanding === 4e9 && i.sharesNow.treasury === 4e8 && near(i.guidance!.progress.revenue, (2600 / 3500) * 100) && i.guidance!.ytdMonths === 9);
    const unsure = edinetFin({ annual: { data: [ifrsYear(2025)] }, standalone: null, earnings: { earnings: [{ disclosureDate: "2026-10-29", quarter: 3, fiscalYearEnd: "2026-12-31", forecastRevenue: 3500000, forecastEps: 290.0, forecastShareBasis: "indeterminate", forecastDividendPerShare: 208.0 }] } }, null)!;
    ck("a forecast per share whose share basis the provider could not determine is not shown; the forecast in yen still is", (unsure.annual.lines.eps ?? [])[1] == null && (unsure.annual.lines.dps ?? [])[1] == null && unsure.annual.lines.revenue![1] === 3500 * B);
    const noDebt = edinetFin({ annual: { data: [{ fiscalYear: 2026, revenue: 2000 * B, netIncome: 400 * B, cash: 1300 * B, marketCap: 11000 * B, ev: 9700 * B, totalAssets: 3800 * B, netAssets: 2900 * B, accountingStandard: "JP" }, { fiscalYear: 2025, revenue: 1100 * B, cash: 1400 * B, accountingStandard: "JP" }] }, standalone: null, earnings: null }, null)!;
    ck("a company whose total of debt is nil by the provider's own reckoning has debt of nil, not an empty line; with nothing to reckon from, the line stays empty", noDebt.annual.lines.stDebt?.join() === ",0" && noDebt.annual.lines.ltDebt?.join() === ",0" && noDebt.annual.periods.map((p) => p.label).join() === "FY2025,FY2026" && noDebt.guidance === null && noDebt.quarterly.periods.length === 0, noDebt.annual);
    ck("an answer with no yearly rows, or nothing at all, gives no statements (the caller lets another source stand in)", edinetFin({ annual: { data: [] }, standalone, earnings }, null) === null && edinetFin({ annual: null, standalone: null, earnings: null }, null) === null && edinetFin({ annual: { error: "not found" }, standalone: "x", earnings: 5 }, null) === null);

    // which company
    const found = [{ edinetCode: "E04147", name: "A", secCode: "90200" }, { edinetCode: "E01892", name: "B", secCode: "69020" }];
    ck("the company is the one whose securities code is exactly the one asked for (with its check digit), not another whose code merely contains it", edinetCodeOf({ companies: found }, "9020") === "E04147" && edinetCodeOf({ data: [...found].reverse() }, "9020") === "E04147" && edinetCodeOf(found, "6902") === "E01892" && edinetCodeOf([{ edinet_code: "E1", sec_code: "285A0" }], "285a") === "E1" && edinetCodeOf(found, "902") === "" && edinetCodeOf({ companies: [] }, "9020") === "" && edinetCodeOf(null, "9020") === "");
  }

  console.log("\n[R] EQUITIES during a session: a list's names at today's prices while its market is open");
  {
    const near = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1e-9;
    const ny = (iso: string) => srv.localDate("America/New_York", Date.parse(iso) / 1000);
    // closes booked for Tuesday the 17th; quotes printed on Wednesday the 18th, New York time (11:24 there)
    const row = (symbol: string, close: number, pct1d: number, q: number | null, qt: string | null = "2026-11-18T16:24:00Z") => ({ symbol, d: "2026-11-17", close, prev: close / (1 + pct1d / 100), pct1d, pct1w: -3, dma200: 100, q_price: q, q_prev: q == null ? null : close, q_time: q == null ? null : qt });
    const open = liveRows([row("A", 100, -7.2, 103), row("B", 50, -6.5, 49), row("C", 200, 1.0, 200), row("D", 80, 2.0, null)], ny);
    ck("with the market open, a name's day change is its last price against the previous close, not yesterday's move", open.live !== null && open.live.n === 3 && open.live.asOf === "2026-11-18T16:24:00Z" && near(open.rows[0].pct1d, 3) && open.rows[0].close === 103 && open.rows[0].prev === 100 && near(open.rows[1].pct1d, -2) && near(open.rows[2].pct1d, 0));
    ck("a name with no quote keeps its close; the longer periods are left as measured to the last close", open.rows[3].pct1d === 2.0 && open.rows[3].close === 80 && open.rows.every((r) => r.pct1w === -3 && r.d === "2026-11-17"));
    const ranked = [...open.rows].sort((a, b) => (b.pct1d ?? 0) - (a.pct1d ?? 0)).map((r) => r.symbol).join("");
    ck("so the movers are today's: yesterday's worst faller can be today's best riser", ranked === "ADCB", ranked);
    // the quotes still carry Tuesday's close (before the open, or after the daily job has booked the session)
    const shut = liveRows([row("A", 100, -7.2, 100, "2026-11-17T21:00:02Z"), row("B", 50, -6.5, 50, "2026-11-17T21:00:01Z")], ny);
    ck("before the open, and once the session has been booked, the tab reads from the closes as before", shut.live === null && shut.rows[0].pct1d === -7.2 && shut.rows[1].close === 50);
    ck("a print at 20:30 New York time on the 17th is still that session, though it is already the 18th in UTC", liveRows([row("A", 100, -7.2, 99, "2026-11-18T01:30:00Z")], ny).live === null && liveRows([row("A", 100, -7.2, 99, "2026-11-18T14:31:00Z")], ny).live !== null);
    const few = liveRows([row("A", 100, 1, 103), row("B", 50, 1, 50, "2026-11-17T21:00:00Z"), row("C", 200, 1, 200, "2026-11-17T21:00:00Z")], ny);
    ck("fresh quotes for under half of the names change nothing: a list half at today's prices would rank wrongly", few.live === null && few.rows[0].pct1d === 1 && few.rows[0].close === 100);
    ck("a quote without a price, without its previous close or without a time is not used; an empty list is an empty list", liveRows([{ ...row("A", 100, 1, 103), q_prev: null }, { ...row("B", 50, 1, 51), q_time: null }, { ...row("C", 20, 1, 0) }], ny).live === null && liveRows([], ny).live === null && liveRows([], ny).rows.length === 0);
  }

  console.log("\n[has the price feed stopped?]");
  {
    const at = (iso: string) => Date.parse(iso), P = (symbol: string, market: string, marketTime: string): Print => ({ symbol, market, marketTime });
    // 18 Nov 2026, 17:30 UTC, as it was: New York open three hours, currencies trading, and nothing newer than 15:52
    const frozen = [P("^GSPC", "NYSE", "2026-11-18T15:52:00Z"), P("USDJPY=X", "FX", "2026-11-18T15:52:10Z"), P("ES=F", "CME", "2026-11-18T15:42:00Z"), P("^N225", "TSE", "2026-11-18T06:30:00Z")];
    const f = feedState(frozen, at("2026-11-18T17:30:00Z"));
    ck("the evening of 18 Nov: every open market's newest print is an hour and a half old, so the feed has stopped; the closed Tokyo market is not counted", f.expected && !f.ok && f.lateMin === 98 && f.symbol === "USDJPY=X" && f.newest === "2026-11-18T15:52:10.000Z", f);
    const live = feedState([...frozen.slice(0, 1), P("USDJPY=X", "FX", "2026-11-18T17:29:00Z"), ...frozen.slice(2)], at("2026-11-18T17:30:00Z"));
    ck("one instrument that printed a minute ago is enough: quiet instruments beside it prove nothing", live.expected && live.ok && live.lateMin === 1 && live.symbol === "USDJPY=X", live);
    ck("a feed's own delay is allowed for: a futures price ten minutes old on a ten-minute feed is on time", feedState([P("ES=F", "CME", "2026-11-18T17:20:00Z")], at("2026-11-18T17:30:00Z")).lateMin === 0 && feedState([P("^N225", "TSE", "2026-11-19T04:35:00Z")], at("2026-11-19T05:00:00Z")).lateMin === 5);
    const edge = (min: number) => feedState([P("EURUSD=X", "FX", new Date(at("2026-11-18T17:30:00Z") - min * 60000).toISOString())], at("2026-11-18T17:30:00Z"));
    ck(`up to ${FEED_LATE_MIN} minutes behind is still a feed; a minute more is not`, FEED_LATE_MIN === 20 && edge(20).ok && !edge(21).ok && edge(21).lateMin === 21);
    const weekend = feedState(frozen, at("2026-11-21T12:00:00Z"));
    ck("with every market closed (a Saturday) nothing is expected, and old prints are not a fault", !weekend.expected && weekend.ok && weekend.newest === null && weekend.lateMin === null, weekend);
    // Tokyo, Thursday 19 Nov: 12:40 is ten minutes after lunch, and the newest print is the one from 11:30
    const lunch = feedState([P("^N225", "TSE", "2026-11-19T02:30:00Z")], at("2026-11-19T03:40:00Z"));
    ck("just after a lunch break or an open the newest print is the one from before it: not judged yet", !lunch.expected && lunch.ok, lunch);
    ck("fifty minutes into the afternoon it is judged, and a print still from before lunch means the feed has stopped", !feedState([P("^N225", "TSE", "2026-11-19T02:30:00Z")], at("2026-11-19T04:25:00Z")).ok && feedState([P("^N225", "TSE", "2026-11-19T04:00:00Z")], at("2026-11-19T04:25:00Z")).ok);
    ck("on 25 December and 1 January currencies and futures do not trade: their old prints are not a stopped feed, while an exchange that is open that day is still judged", !feedState([P("USDJPY=X", "FX", "2026-12-24T22:00:00Z"), P("ES=F", "CME", "2026-12-24T18:00:00Z")], at("2026-12-25T15:00:00Z")).expected && !feedState([P("USDJPY=X", "FX", "2026-12-31T22:00:00Z")], at("2027-01-01T03:00:00Z")).expected && feedState([P("USDJPY=X", "FX", "2026-12-24T22:00:00Z"), P("^N225", "TSE", "2026-12-25T04:50:00Z")], at("2026-12-25T05:00:00Z")).ok && !feedState([P("USDJPY=X", "FX", "2026-12-24T22:00:00Z"), P("^N225", "TSE", "2026-12-25T02:30:00Z")], at("2026-12-25T05:00:00Z")).ok);
    ck("a market on holiday is not expected to print; an unknown market and an unreadable time are passed over", !feedState([P("^N225", "TSE", "2026-11-19T02:30:00Z")], at("2026-11-19T05:00:00Z"), { TSE: new Set(["2026-11-19"]) }).expected && !feedState([P("X", "MARS", "2026-11-18T17:29:00Z"), P("Y", "FX", "not a time")], at("2026-11-18T17:30:00Z")).expected && !feedState([], at("2026-11-18T17:30:00Z")).expected);
  }

  console.log("\n[after the close: did the prices stop before it?]");
  {
    const at = (iso: string) => Date.parse(iso), sb = stoppedBeforeClose;
    // 18 Nov 2026: New York closes at 21:00 UTC; the Morning Note is written at 22:15 UTC
    const stop = sb("NYSE", "2026-11-18T15:52:00Z", at("2026-11-18T22:15:00Z"));
    ck("a last print at 10:52 New York time, read after the 16:00 close, is not a closing level: the close it fell short of is named", !!stop && stop.close === "2026-11-18T21:00:00.000Z" && stop.last === "2026-11-18T15:52:00.000Z", stop);
    ck("a last print in the final minute of the session, or half an hour short at most, is the close", sb("NYSE", "2026-11-18T20:59:00Z", at("2026-11-18T22:15:00Z")) === null && sb("NYSE", "2026-11-18T20:30:00Z", at("2026-11-18T22:15:00Z")) === null && sb("NYSE", "2026-11-18T20:29:00Z", at("2026-11-18T22:15:00Z")) !== null);
    ck("while the session is still on, the same print is measured against yesterday's close and passes (the live reading above covers the session itself)", sb("NYSE", "2026-11-18T15:52:00Z", at("2026-11-18T17:30:00Z")) === null && sb("NYSE", "2026-11-18T15:52:00Z", at("2026-11-18T21:10:00Z")) === null);
    ck("in summer New York closes an hour earlier in UTC, and the close is found there", sb("NYSE", "2026-07-15T19:59:00Z", at("2026-07-15T22:15:00Z")) === null && sb("NYSE", "2026-07-15T17:30:00Z", at("2026-07-15T22:15:00Z"))?.close === "2026-07-15T20:00:00.000Z");
    ck("over a weekend the last close is Friday's", sb("NYSE", "2026-11-20T20:59:00Z", at("2026-11-23T00:30:00Z")) === null && sb("NYSE", "2026-11-20T16:00:00Z", at("2026-11-22T22:15:00Z"))?.close === "2026-11-20T21:00:00.000Z");
    const tg = { NYSE: new Set(["2026-11-26"]) };
    ck("a holiday in the calendar is not a session: the close before it is the one that counts; without it the day would be misread", sb("NYSE", "2026-11-25T20:59:00Z", at("2026-11-27T03:00:00Z"), tg) === null && sb("NYSE", "2026-11-25T20:59:00Z", at("2026-11-27T03:00:00Z")) !== null);
    ck("New York's half days end at 13:00 (the Friday after Thanksgiving, 24 December, 3 July): a last print then is that day's close; on any other day a feed that stops at 13:00 has stopped", sb("NYSE", "2026-11-27T18:00:00Z", at("2026-11-28T00:00:00Z"), tg) === null && sb("NYSE", "2026-11-27T17:30:00Z", at("2026-11-28T00:00:00Z"), tg) !== null && sb("NYSE", "2026-12-24T18:00:00Z", at("2026-12-24T23:00:00Z")) === null && sb("NYSE", "2026-07-15T17:00:00Z", at("2026-07-15T22:15:00Z")) !== null && sb("NYSE", "2026-11-18T18:00:00Z", at("2026-11-18T22:15:00Z")) !== null);
    ck("Tokyo closes at 15:30 (06:30 UTC): a print in its last minute is the close, one from the morning session is not", sb("TSE", "2026-11-19T06:29:00Z", at("2026-11-19T22:15:00Z")) === null && sb("TSE", "2026-11-19T02:10:00Z", at("2026-11-19T22:15:00Z"))?.close === "2026-11-19T06:30:00.000Z");
    ck("currencies and futures have no close to fall short of; an unknown market or no print gives no reading", sb("FX", "2026-11-18T15:52:00Z", at("2026-11-18T22:15:00Z")) === null && sb("CME", "2026-11-18T15:42:00Z", at("2026-11-18T22:15:00Z")) === null && sb("MARS", "2026-11-18T15:52:00Z", at("2026-11-18T22:15:00Z")) === null && sb("NYSE", null, at("2026-11-18T22:15:00Z")) === null);
  }

  console.log("\n[a daily bar is a close only once the answers in hand reach the end of its day]");
  {
    const at = (iso: string) => Date.parse(iso), iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
    // 18 Nov 2026: the server was handed the prices of 15:52 UTC (10:52 New York time) all evening
    const stop = at("2026-11-18T15:52:00Z");
    ck("the day of a bar ends at the exchange's last bell, at 17:00 New York for a currency pair and a future, at midnight UTC for crypto", iso(barDayEnd("NYSE", "2026-11-18")) === "2026-11-18T21:00:00.000Z" && iso(barDayEnd("TSE", "2026-11-18")) === "2026-11-18T06:30:00.000Z" && iso(barDayEnd("LSE", "2026-11-18")) === "2026-11-18T16:30:00.000Z" && iso(barDayEnd("FX", "2026-11-18")) === "2026-11-18T22:00:00.000Z" && iso(barDayEnd("CME", "2026-11-18")) === "2026-11-18T22:00:00.000Z" && iso(barDayEnd("CRYPTO", "2026-11-18")) === "2026-11-19T00:00:00.000Z" && barDayEnd("MARS", "2026-11-18") === null, [iso(barDayEnd("NYSE", "2026-11-18")), iso(barDayEnd("FX", "2026-11-18")), iso(barDayEnd("CRYPTO", "2026-11-18"))]);
    ck("in summer New York's bell and the 17:00 New York roll are an hour earlier in UTC", iso(barDayEnd("NYSE", "2026-07-15")) === "2026-07-15T20:00:00.000Z" && iso(barDayEnd("FX", "2026-07-15")) === "2026-07-15T21:00:00.000Z");
    ck("answers that end at 10:52 New York time cannot hold that day's close in New York, London, the currencies, the futures or crypto", !barSettled("NYSE", "2026-11-18", stop) && !barSettled("LSE", "2026-11-18", stop) && !barSettled("FX", "2026-11-18", stop) && !barSettled("CME", "2026-11-18", stop) && !barSettled("CRYPTO", "2026-11-18", stop));
    ck("they do hold the closes that came before the stop: Tokyo's of the same day, and every market's of the day before", barSettled("TSE", "2026-11-18", stop) && barSettled("HKEX", "2026-11-18", stop) && ["NYSE", "LSE", "FX", "CME", "CRYPTO", "TSE"].every((m) => barSettled(m, "2026-11-17", stop)));
    ck("half an hour short of the bell still holds the close (an index may stop printing a little early); a minute more does not", barSettled("NYSE", "2026-11-18", at("2026-11-18T20:30:00Z")) && !barSettled("NYSE", "2026-11-18", at("2026-11-18T20:29:00Z")));
    ck("current answers hold everything that has ended: at 22:35 UTC New York's close, the currencies' and the futures' day; crypto's day only after midnight UTC", ["NYSE", "FX", "CME", "LSE", "TSE"].every((m) => barSettled(m, "2026-11-18", at("2026-11-18T22:34:00Z"))) && !barSettled("CRYPTO", "2026-11-18", at("2026-11-18T22:34:00Z")) && barSettled("CRYPTO", "2026-11-18", at("2026-11-19T00:05:00Z")));
    ck("on New York's usual half days the bell is at 13:00, and answers that reach it hold that day's close", iso(barDayEnd("NYSE", "2026-11-27")) === "2026-11-27T18:00:00.000Z" && iso(barDayEnd("NYSE", "2026-12-24")) === "2026-12-24T18:00:00.000Z" && barSettled("NYSE", "2026-11-27", at("2026-11-27T18:00:00Z")) && !barSettled("NYSE", "2026-11-27", at("2026-11-27T16:00:00Z")) && iso(barDayEnd("NYSE", "2026-11-20")) === "2026-11-20T21:00:00.000Z");
    ck("over a weekend, Friday's bars are held by answers that reach Friday's 17:00 New York; a market not known is not judged", ["NYSE", "FX", "CME"].every((m) => barSettled(m, "2026-11-20", at("2026-11-20T21:59:00Z"))) && barSettled("MARS", "2026-11-18", stop));
  }

  console.log("\n[a stop that is over leaves a silence in the stored minute bars]");
  {
    const at = (iso: string) => Date.parse(iso), iso = (ms: number) => new Date(ms).toISOString().slice(0, 16);
    const every = (from: string, to: string) => { const out: number[] = []; for (let t = at(from); t <= at(to); t += 60000) out.push(t); return out; };
    // 18 Nov 2026: USD/JPY printed to 15:52 UTC and again from 22:00 (the bars of the new day were filled in when prices came back at 23:27)
    const day = [...every("2026-11-18T08:00:00Z", "2026-11-18T15:52:00Z"), ...every("2026-11-18T22:00:00Z", "2026-11-18T23:40:00Z")];
    const g = silence(day, at("2026-11-18T23:41:00Z"));
    ck("the stop of 18 Nov is found in the stored minute bars, from the last print before it to the first after it", !!g && iso(g.from) === "2026-11-18T15:52" && iso(g.to) === "2026-11-18T22:00", g && [iso(g.from), iso(g.to)]);
    const open = silence(every("2026-11-18T08:00:00Z", "2026-11-18T15:52:00Z"), at("2026-11-18T18:00:00Z"));
    ck("a stop that has not ended runs to now", !!open && iso(open.from) === "2026-11-18T15:52" && iso(open.to) === "2026-11-18T18:00");
    ck("a day of prints every minute has no silence; a hole of half an hour is not one, of 45 minutes is", silence(every("2026-11-18T00:00:00Z", "2026-11-18T23:40:00Z"), at("2026-11-18T23:41:00Z")) === null && silence([...every("2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z"), ...every("2026-11-18T09:30:00Z", "2026-11-18T10:00:00Z")], at("2026-11-18T10:01:00Z")) === null && silence([...every("2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z"), ...every("2026-11-18T09:45:00Z", "2026-11-18T10:00:00Z")], at("2026-11-18T10:01:00Z")) !== null);
    ck("the weekend is not a stop: currencies close on Friday at 17:00 New York and open on Sunday at 17:00", silence([...every("2026-11-20T18:00:00Z", "2026-11-20T21:59:00Z"), ...every("2026-11-22T22:00:00Z", "2026-11-22T23:00:00Z")], at("2026-11-22T23:01:00Z")) === null && silence(every("2026-11-20T18:00:00Z", "2026-11-20T21:59:00Z"), at("2026-11-21T12:00:00Z")) === null);
    ck("currencies trade from Sunday 17:00 New York to Friday 17:00, and not on 25 December or 1 January", fxTrading(at("2026-11-18T15:53:00Z")) && !fxTrading(at("2026-11-20T22:00:00Z")) && fxTrading(at("2026-11-20T21:59:00Z")) && !fxTrading(at("2026-11-21T12:00:00Z")) && !fxTrading(at("2026-11-22T21:59:00Z")) && fxTrading(at("2026-11-22T22:00:00Z")) && !fxTrading(at("2026-12-25T15:00:00Z")) && !fxTrading(at("2027-01-01T15:00:00Z")) && fxTrading(at("2026-07-17T20:59:00Z")) && !fxTrading(at("2026-07-17T21:00:00Z")));
    ck("of two silences the longer is given; no prints at all gives none", iso(silence([...every("2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z"), ...every("2026-11-18T10:00:00Z", "2026-11-18T11:00:00Z"), ...every("2026-11-18T14:00:00Z", "2026-11-18T14:10:00Z")], at("2026-11-18T14:11:00Z"))!.from) === "2026-11-18T11:00" && silence([], at("2026-11-18T14:11:00Z")) === null);
  }

  console.log("\n[the welcome email]");
  {
    const site = "https://example.github.io/orrery-market-monitor/", m = welcomeMail(site);
    const lines = m.text.split("\n");
    ck("the subject, and a plain-text part that opens with the idea behind the name before it says welcome", m.subject === WELCOME_SUBJECT && m.subject === "Welcome to Orrery Monitor" && lines[0] === PHILOSOPHY[0] && m.text.indexOf(PHILOSOPHY[2]) < m.text.indexOf("WELCOME") && PHILOSOPHY.length === 3 && PHILOSOPHY.every((p) => m.text.includes(p)), lines.slice(0, 3));
    ck("the opening says what an orrery was and what the Monitor is, and names no date or maker it could get wrong", /early 1700s/.test(PHILOSOPHY[0]) && /London clockmakers/.test(PHILOSOPHY[0]) && /orrery/.test(PHILOSOPHY[1]) && /small, simple and powerful/.test(PHILOSOPHY[1]) && /what moved, by how much, and why/.test(PHILOSOPHY[2]) && !/17\d\d[^s]|Graham|Tompion|Rowley/.test(PHILOSOPHY.join(" ")), PHILOSOPHY);
    ck("the six tabs in the order of the Monitor's header, each with what is there", TABS.map((t) => t[1]).join() === "MARKET,NEWS,RESEARCH,EQUITIES,RATES & CURRENCY,WATCHLIST" && TABS.map((t) => t[0]).join() === "market,news,research,equities,rates,watch" && TABS.every(([, name, what]) => what.length > 30 && m.text.includes(`- ${name}: ${what}`)), TABS.map((t) => t[1]));
    ck("it says the alert lines as the Monitor has them (5% and 7% for a stock, 3% for an index, deals of USD 1bn) and both kinds of notification", ALERTS.includes(`${LARGE_STOCK_PCT}% in a session (${STOCK_PCT}% for smaller companies)`) && /index moves 3%/.test(ALERTS) && /USD 1bn/.test(ALERTS) && /Home Screen/.test(PHONE) && /NOTIFICATIONS/.test(PHONE) && /all of them, or only those on your watchlist/.test(PHONE) && [ALERTS, PHONE, COMPANY, ...FIRST].every((t) => m.text.includes(t)), [ALERTS, PHONE]);
    const links = [...m.html.matchAll(/<a href="([^"]+)"/g)].map((x) => x[1]), imgs = [...m.html.matchAll(/<img src="([^"]+)"[^>]*alt="([^"]*)"/g)].map((x) => [x[1], x[2]]);
    ck("every link goes to the Monitor itself: its front page from the button, and each tab", links.length === 7 && links[0] === site && links.slice(1).join() === TABS.map((t) => `${site}#${t[0]}`).join(), links);
    ck("its two pictures come from the Monitor's own site, and the banner says what it shows where pictures are off", imgs.length === 2 && imgs[0][0] === `${site}mail/mark.png` && imgs[1][0] === `${site}mail/orrery.png` && /orrery/.test(imgs[1][1]), imgs);
    const quote = [...m.html.matchAll(/<p class="om-quote" style="([^"]+)">([^<]+)<\/p>/g)];
    ck("the opening is set in italic Times New Roman, and is the first text of the page after the name", quote.length === 3 && quote.every((q) => /font-family:'Times New Roman',Times,Georgia,serif/.test(q[1]) && /font-style:italic/.test(q[1])) && m.html.indexOf('class="om-quote"') < m.html.indexOf("Welcome.") && m.html.indexOf("Orrery Monitor</td>") < m.html.indexOf('class="om-quote"'), quote.map((q) => q[1].slice(0, 60)));
    ck("an email's own rules: tables and styles on the elements, no script, no web font, no style sheet from elsewhere; text that could be read as markup is escaped", !/<script|<link|@import|@font-face|url\(/i.test(m.html) && /<table role="presentation"/.test(m.html) && m.html.includes("RATES &amp; CURRENCY") && !m.html.includes("RATES & CURRENCY") && m.html.includes("today&#39;s") === false && !/undefined|\[object/.test(m.html + m.text) && m.html.length < 20000, m.html.length);
    // as it goes on the wire through the Monitor's own sender (smtp.ts): both versions, no line too long for a mail server
    const wire = buildMessage({ from: { name: "Orrery Monitor", email: "desk@example.com" }, to: "new.reader@example.com", ...m }, new Date("2026-11-19T01:00:00Z"), "abc123");
    const wl = wire.split("\r\n"), parts = wire.split(/--=_orrery_abc123(?:--)?\r\n/), back = (part: string) => Buffer.from(part.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    ck("sent by the Monitor's own sender it is one message with the plain text and the page side by side, each arriving whole, and no line longer than 78 characters", /^Subject: Welcome to Orrery Monitor$/m.test(wire) && /multipart\/alternative/.test(wire) && parts.length === 4 && back(parts[1]) === m.text.replace(/\n/g, "\r\n") && back(parts[2]) === m.html.replace(/\n/g, "\r\n") && wl.every((l) => l.length <= 78), { parts: parts.length, longest: Math.max(...wl.map((l) => l.length)) });
    const other = welcomeMail("https://monitor.example.com/");
    ck("another site address is used throughout", !other.html.includes("example.github.io") && other.html.includes('href="https://monitor.example.com/#watch"') && other.text.includes("\nhttps://monitor.example.com/\n"));
  }

  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})();
