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
import { docUrl, edinetCodeOf, edinetFin, edinetWaiting, filingLink, legacyStatements, yahooFin, yahooFinTypes } from "../supabase/functions/_shared/finsrc.ts";
import { keyStatsOf } from "../supabase/functions/_shared/yahoo.ts";
import { MOVE_RULE, SWING_PCT, SWING_PCT_2, bigMoves, isLargeCap, moveCtx, moveText, settledBars, siblingKind, turningPoints } from "../supabase/functions/_shared/bigmoves.ts";
import { liveRows } from "../supabase/functions/_shared/intraday.ts";
import { CAUSE_SYSTEM, causeQuestion, readCause, type MoveCtx } from "../supabase/functions/_shared/movecause.ts";
import { ALERTS, COMPANY, FIRST, PHILOSOPHY, PHONE, TABS, WELCOME_SUBJECT, welcomeMail } from "../supabase/functions/_shared/welcome.ts";
import { FEED_LATE_MIN, OWN_SHORT_MIN, barDayEnd, barSettled, feedState, fxTrading, silence, stoppedBeforeClose, type Print } from "../supabase/functions/_shared/feedhealth.ts";
import { OWN_FRESH_MIN, RELAY_BEAT_MAX_S, RELAY_CRON, RELAY_JOBS, RELAY_LATE_MIN, RELAY_OK_RUN, RELAY_WAIT_MIN, beatFresh, cronDue, current, newerOnly, reading, relayAct, relayJobsDue, usable, type RelayView } from "../supabase/functions/_shared/relay.ts";
import { CBOE_YIELDS, closeDay, isYieldQuote, isYieldRow, sourceName, watchRowFromQuote, watchRowFromTable, type QuoteLike } from "../supabase/functions/_shared/watchrow.ts";
import { alertFigWord, alertHeadline, sigmaNoteLine } from "../web/src/lib/alertline.ts";
import { asOfCell, asOfLine, asOfOf, asOfTitle, rowAsOfTitle, rowSource, tileStamp } from "../web/src/lib/time.ts";
import { finBack, finFit, finRest } from "../web/src/lib/finscroll.ts";
import { sectorShort } from "../web/src/lib/sectors.ts";
import { feedRows, fmtDay, fmtDayTime, fmtPc, fmtPp, fmtRatio, fyName, moveParts, noDocWhy, periodDoc, periodName, type MoveRow, type StockFeed } from "../web/src/lib/stock.ts";
import { axisDecimals, fallbackDecimals, fmtChg, fmtLevel, fmtNum, fmtPct, fmtSigma, fmtSigned, signCls, stockDecimals } from "../web/src/lib/fmt.ts";
import { datesIn, fmtDate, fmtDayMon, fmtDayTime as dayTime, fmtStamp, fmtWhen } from "../web/src/lib/time.ts";
import { avgTurnover as avgTurnoverLabel, avgVolume, bankName, classLabel, delayed, dottedLine, hitLine, MOVERS_SIGMA, NEWS, NEWS_FILINGS, SIGMA_1D, SIGMA_1M as SIGMA_1M_WORD, SIGMA_MOVE, stockKind, TAB, TAB_BAR, WORKED } from "../web/src/lib/labels.ts";
import { TIME_VALUES } from "../web/src/lib/chart.ts";
import { PERIOD_DAYS, periodHolding } from "../web/src/lib/periods.ts";
import { anchorsOf, change, INSTRUMENT_QUOTES, instrumentFigures, isOfficial, legacyStockFields, publisher, quoteDecimals, seriesStats, swings, volStat, type InstrumentDef, type QuoteLike, type RowLike } from "../supabase/functions/_shared/instrstats.ts";
import { eventCcy as srvEventCcy, eventCurrencies, eventsFor, matchHeadlines, newsWords, pairOf, wordsPg, wordsRegex, type EventRow } from "../supabase/functions/_shared/instrfeed.ts";
import { asOfWords, calSource, ccyWords, DAILY_PERIODS, distCls, distText, isInstrumentPage, lastAndDay, moveCls, moveText as instrMove, noEvents, pctlText, perfNote, periodsOf, sourceNote, volLine, workedLine, workedOut } from "../web/src/lib/instrument.ts";
import { FEED_ALERTS, FEED_DAYS, FEED_NEWS, INSTR_HISTORY_DAYS, INSTRUMENT_COLS, eventsOf, feedFor, instrFeed, pageOrQuote, type Db } from "../supabase/functions/_shared/pagefeed.ts";
import { MOCK_WORDS, mockCcys } from "../web/src/lib/mockInstr.ts";
import { calendarRows, currencyOptions, eventCcy } from "../web/src/lib/calendar.ts";
import { checkRoll, contractName, fromReading, isFuture, knownFrom, monthWord, QUOTE_SOURCE, rollDay, rollSegments, rollViews, tradeDate, type RollRow } from "../supabase/functions/_shared/futures.ts";
import { dailyChanges, dayWords, LISTED_ALERTS, listed, moveWords, SIGMA_CLASSES, SIGMA_LIST, SIGMA_MIN, SIGMA_N, SIGMA_RAISE, sessionDay, sigmaCandidate, sigmaMsg, sigmaNote, sigmaStats, sigmaWrites, usableSd, z1mOf, zDay } from "../supabase/functions/_shared/sigma.ts";
import { ALERT_KINDS, DEFAULT_KINDS, prefsFromBody, PUSH_LINE, PUSH_LINES, sigmaReaches } from "../supabase/functions/_shared/pushrules.ts";
import { futuresInfo } from "../supabase/functions/_shared/instrstats.ts";
import { commonWindow, moveLine, moversInSigma, sigmaTip, sortBySigma, STRIP_N } from "../web/src/lib/movers.ts";
import { codeOf, monthOf, rollWords } from "../web/src/lib/futures.ts";
import { contractLine, contractSource, lastRollLine, rollMarks, rollsOutLine, SERIES_LINE } from "../web/src/lib/instrument.ts";
import { mockSegments } from "../web/src/lib/mockInstr.ts";
import type { TableRow } from "../web/src/lib/types.ts";
import { byResultsDay, calendarFlag, fmtResultsDate, jpxDated, listingCity, listingTz, MARKS_NOTE, RESULTS_NOTE, resultsDay, resultsDayLabel, resultsMark, resultsStatus, resultsStatusShort, resultsTip, resultsWords } from "../web/src/lib/results.ts";
import { opensAtTop } from "../web/src/lib/nav.ts";
import { readFileSync as readText, readdirSync as listDir } from "node:fs";
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
    ck("a fall: a red mark, then the alert's line as the title, its kind and Singapore time under it; a tap opens the stock", n.title === `${RED} Rakuten Bank down 17% intraday` && n.body === "Stock move · 18 Nov 10:05 SGT" && n.hash === "#asset/5838.T" && n.tag === "alert-1", n);
    const up = a(5, "7203.T", "stock", "Toyota Motor up 8.2% intraday", undefined, 8.2), idxUp = a(6, "^GSPC", "index", "S&P 500 up 3.1%", undefined, 3.1);
    ck("a rise: a green mark, for a stock and for an index", alertNote(up).title === `${GREEN} Toyota Motor up 8.2% intraday` && alertNote(idxUp).title === `${GREEN} S&P 500 up 3.1%` && alertNote(idx).title === `${RED} Nikkei 225 down 3.2%`, [alertNote(up).title, alertNote(idxUp).title, alertNote(idx).title]);
    ck("an acquisition, a buyback and a guidance change carry no mark (no direction to show)", alertNote(deal).title === deal.msg && alertNote(buy).title === buy.msg && alertNote(a(7, "6758.T", "revision", "Guidance: Sony raises its full-year outlook")).title === "Guidance: Sony raises its full-year outlook" && moveMark({ ...bank, pct: 0 }) === "" && moveMark({ ...bank, pct: null }) === "");
    ck("an index move opens the index; a headline about a company opens the company; one about no listed company opens NEWS", alertNote(idx).hash === "#asset/%5EN225" && alertNote(idx).body.startsWith("Index move") && alertNote(buy).hash === "#asset/7203.T" && alertNote(buy).body.startsWith("Buyback") && alertNote(deal).hash === "#news" && alertNote(deal).body.startsWith("M&A"), [alertNote(idx), alertNote(buy), alertNote(deal)]);
    ck("times are written as on the page (\"18 Nov 23:59 SGT\", never \"11/18\"), across midnight too, and the same as the page's own", stampSgt("2026-11-18T15:59:00Z") === "18 Nov 23:59 SGT" && stampSgt("2026-11-18T16:00:00Z") === "19 Nov 00:00 SGT" && stampSgt("2026-11-05T01:05:00Z") === fmtStamp("2026-11-05T01:05:00Z"));
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

    // --- the rule since 19 Nov 2026: a day of 10%, and the peaks and bottoms of the closes on two levels ---
    const ramp = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 1)) / n);
    // a year at 100, up to 150, down to 120, up to 141 (a lower high), down to 115, up to 180, then a dip to 160
    const path = [...flat(300), ...ramp(100, 150, 20), ...ramp(150, 120, 10), ...ramp(120, 141, 10), ...ramp(141, 115, 10), ...ramp(115, 180, 20), ...ramp(180, 160, 5)];
    const at = (k: number) => D(T0 + k * 86400);
    const big = turningPoints(series(path), SWING_PCT, 252, 0);
    ck("the large peaks and bottoms are the turning points of the closes when only moves of 15% count: the new high, then each bottom, oldest first", SWING_PCT === 15 && big.map((x) => x.kind).join() === "pk,bt,bt" && big[0].to === at(319) && near(big[0].toPx, 150) && near(big[0].pct, 50) && big[1].to === at(329) && near(big[1].toPx, 120) && near(big[1].pct, -20) && big[1].from === at(319) && big[2].to === at(349) && near(big[2].toPx, 115), big.map((x) => [x.kind, x.to, x.pct]));
    ck("a peak points down and a bottom up, whatever the move into it: the colour on the page is the turn the stock took there", big[0].dir === -1 && big[0].pct > 0 && big[1].dir === 1 && big[1].pct < 0 && big[2].dir === 1);
    ck("on the large level alone, a high that was not the highest close of the twelve months before it is not marked, but the next bottom is measured from it", !big.some((x) => near(x.toPx, 141)) && big[2].from === at(339) && near(big[2].fromPx, 141) && near(big[2].pct, (115 / 141 - 1) * 100), big[2]);
    const tp = turningPoints(series(path));
    ck("the second level adds the smaller turning points (moves of 10%): the lower high, and the last high once the close has fallen 10% from it; the large ones stay as they are", SWING_PCT_2 === 10 && tp.map((x) => x.kind).join() === "pk,bt,p2,bt,p2" && JSON.stringify(tp.filter((x) => x.kind === "pk" || x.kind === "bt")) === JSON.stringify(big) && tp[2].to === at(339) && near(tp[2].toPx, 141) && tp[2].from === at(329) && near(tp[2].pct, 17.5) && tp[2].dir === -1 && tp[4].to === at(369) && near(tp[4].toPx, 180) && tp[4].from === at(349), tp.map((x) => [x.kind, x.to, x.pct]));
    ck("the stretch still running has no turning point yet: the last high is none until the close has fallen 10% from it, and a large one once it has fallen 15%", !turningPoints(series(path.slice(0, 374))).some((x) => near(x.toPx, 180)) && turningPoints(series([...path, ...ramp(160, 152, 4)])).some((x) => x.kind === "pk" && near(x.toPx, 180) && x.from === at(349)));
    const early = turningPoints(series(path.slice(0, 325)));
    ck("a turning point does not move, but it can grow: a peak first seen as a smaller one (10% below it) is the large one on the same day once the close is 15% below it, and the two share their reason", early.length === 1 && early[0].kind === "p2" && early[0].to === at(319) && tp[0].kind === "pk" && tp[0].to === at(319) && siblingKind("p2") === "pk" && siblingKind("pk") === "p2" && siblingKind("b2") === "bt" && siblingKind("bt") === "b2" && siblingKind("d1") === null && JSON.stringify(turningPoints(series(path.slice(0, 345)))) === JSON.stringify(tp.slice(0, 2)), early);
    ck("a rise or a fall of under 10% turns nothing, one of under 15% only the smaller points; an empty or a one-bar history gives nothing", turningPoints(series([...flat(50), ...ramp(100, 109, 10), ...ramp(109, 100, 10), ...ramp(100, 109, 10)])).length === 0 && turningPoints(series([...flat(50), ...ramp(100, 114, 10), ...ramp(114, 100, 10), ...ramp(100, 114, 10), ...ramp(114, 100, 10)])).every((x) => x.kind === "p2" || x.kind === "b2") && turningPoints([]).length === 0 && turningPoints(series([100])).length === 0);
    const sw = bigMoves(series([...path, 168, 168 * 0.94, 168 * 0.94 * 1.1, 168 * 0.94 * 1.1 * 1.0999]), 0, "swings");   // +5%, -6%, +10%, +9.99%
    ck("by this rule a day counts from 10%, not from 5%, and five-session and one-month moves are not marked; newest first", sw.map((x) => x.kind).join() === "d1,b2,p2,bt,p2,bt,pk" && near(sw[0].pct, 10) && sw[0].dir === 1 && sw.every((x, k) => k === 0 || x.t <= sw[k - 1].t) && bigMoves(series(path)).every((x) => x.kind === "d1" || x.kind === "w1" || x.kind === "m1"), sw.map((x) => [x.kind, x.to]));
    ck("since 19 Nov 2026 this is the rule the page and the look-up job follow, for every large company; the first rule is still what bigMoves gives when asked for it", MOVE_RULE === "swings" && bigMoves(series(path), 0, "classic").length === bigMoves(series(path)).length);
    ck("a peak and a bottom in words, large and smaller", moveText({ kind: "pk", pct: 62.44, from: "2026-04-07", to: "2026-10-21" }) === "New high: +62.4% from the low of 7 Apr" && moveText({ kind: "bt", pct: -30.04, from: "2026-10-21", to: "2026-11-17" }) === "Bottom: −30.0% from the high of 21 Oct" && moveText({ kind: "p2", pct: 13.2, from: "2026-01-20", to: "2026-01-29" }) === "Smaller peak: +13.2% from the low of 20 Jan" && moveText({ kind: "b2", pct: -11.05, from: "2026-01-29", to: "2026-02-05" }) === "Smaller bottom: −11.1% from the high of 29 Jan");
    const cx = moveCtx(tp[1], { symbol: "NVDA", name: "NVIDIA Corporation", exchange: null, sector: "Information Technology", currency: "USD" }, { name: "S&P 500", bars: series(path.map((_, k) => 5000 + k)) });
    ck("what the look-up is given for a move: the stock, the move in words, the benchmark's change over the same dates, and for a peak or a bottom the turn that made it one", cx.symbol === "NVDA" && cx.kind === "bt" && cx.text === moveText(tp[1]) && cx.from === at(319) && cx.to === at(329) && cx.bench === "S&P 500" && near(cx.benchPct!, (5329 / 5319 - 1) * 100) && cx.turn === 15 && moveCtx(tp[2], { symbol: "NVDA", name: "NVIDIA", exchange: null, sector: null, currency: "USD" }, null).turn === 10 && moveCtx(tp[1], { symbol: "NVDA", name: "NVIDIA", exchange: null, sector: null, currency: "USD" }, null).benchPct === null && !("turn" in moveCtx(sw[0], { symbol: "NVDA", name: "NVIDIA", exchange: null, sector: null, currency: "USD" }, null)), cx);
  }

  console.log("\n[P] a stock's page: asking why a big move happened, and reading the answer");
  {
    const ctx: MoveCtx = { symbol: "7203.T", name: "Toyota Motor Corp", exchange: "Tokyo", sector: "Consumer Discretionary", currency: "JPY", kind: "d1", from: "2026-08-04", to: "2026-08-05", pct: -8.23, fromPx: 3200, toPx: 2936.6, text: "−8.2% on the day", bench: "Nikkei 225", benchPct: -1.14 };
    const q = causeQuestion(ctx);
    ck("the question names the stock, the move with its dates and closes, and the benchmark's change over the same dates", q.includes("Toyota Motor Corp (7203.T, Tokyo, Consumer Discretionary)") && q.includes("-8.2% on the day on 5 August 2026 (previous close 4 August 2026); close 3,200 to 2,937 JPY.") && q.includes("Over the same dates the Nikkei 225 changed -1.1%.") && /reported reason/.test(q), q);
    const qm = causeQuestion({ ...ctx, kind: "m1", from: "2026-07-07", to: "2026-08-05", pct: -24, fromPx: 96.5, toPx: 73.34, text: "−24.0% from the high of 7 Jul to the low of 5 Aug", bench: null, benchPct: null, currency: "USD", exchange: null, sector: null });
    ck("a move over several days gives both closes' dates; a missing benchmark is said to be missing, not left as nought", qm.includes("between the close of 7 July 2026 and the close of 5 August 2026; close 96.50 to 73.34 USD.") && qm.includes("The benchmark's change over these dates is not available.") && qm.includes("Toyota Motor Corp (7203.T)"), qm);
    const qp = causeQuestion({ ...ctx, symbol: "NVDA", name: "NVIDIA Corporation", exchange: null, sector: "Information Technology", currency: "USD", kind: "pk", from: "2026-04-07", to: "2026-10-21", pct: 62.44, fromPx: 118.2, toPx: 192, text: "New high: +62.4% from the low of 7 Apr", bench: "S&P 500", benchPct: 21.3 });
    const qb = causeQuestion({ ...ctx, symbol: "NVDA", name: "NVIDIA Corporation", exchange: null, sector: null, currency: "USD", kind: "bt", from: "2026-10-21", to: "2026-11-17", pct: -30.04, fromPx: 192, toPx: 134.32, text: "Bottom: −30.0% from the high of 21 Oct", bench: null, benchPct: null });
    ck("for a new peak the question is what ended the rise there: the high, that it was the highest close in twelve months, what it rose from, and the days to search", qp.includes("Turning point: a closing high of 192.00 USD on 21 October 2026, the highest close in twelve months, 62.4% above the closing low of 7 April 2026 (118.20). After it the stock fell 15% or more.") && qp.includes("Search for reports dated from two days before 21 October 2026 to five days after it.") && qp.endsWith("What is the reported reason the rise ended at this high?") && qp.includes("Over the same dates the S&P 500 changed +21.3%."), qp);
    ck("for a bottom it is what ended the fall and turned the stock up", qb.includes("Turning point: a closing low of 134.32 USD on 17 November 2026, 30.0% below the closing high of 21 October 2026 (192.00). After it the stock rose 15% or more.") && qb.endsWith("What is the reported reason the fall ended at this low and the stock turned up?") && qb.includes("The benchmark's change over these dates is not available."), qb);
    const q2 = causeQuestion({ ...ctx, symbol: "NVDA", name: "NVIDIA Corporation", exchange: null, sector: null, currency: "USD", kind: "p2", from: "2026-01-20", to: "2026-01-29", pct: 13.2, fromPx: 170, toPx: 192.44, text: "Smaller peak: +13.2% from the low of 20 Jan", bench: null, benchPct: null, turn: 10 });
    ck("for a smaller peak the same question with its own turn, and no claim of a twelve-month high", q2.includes("Turning point: a closing high of 192.44 USD on 29 January 2026, 13.2% above the closing low of 20 January 2026 (170.00). After it the stock fell 10% or more.") && !/twelve months/.test(q2) && q2.endsWith("What is the reported reason the rise ended at this high?"), q2);
    ck("the instructions say what a turning point asks for, and to say so when the reports explain only the move into it or out of it", /turning point \(a closing high or a closing low\)/.test(CAUSE_SYSTEM) && /ended the rise or the fall there/.test(CAUSE_SYSTEM) && /say which it is/.test(CAUSE_SYSTEM));
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

    // the document behind each column (A-01's links, 20 Nov 2026): the provider's own address, never a made-up one
    {
      const Qp = f.quarterly.periods, fc = A.periods[10];
      ck("a year from the 有価証券報告書 opens that filing: the provider's address, with its document ID; no filing date where the answer gives none", A.periods[9].url === "https://example.org/filing/S100T2026" && A.periods[9].doc === "S100T2026" && A.periods[9].filed === null, A.periods[9]);
      ck("the guidance column opens the 決算短信 its figures were read from (the consolidated one), with that release's date", fc.kind === "FC" && fc.url === "https://example.org/ir/2q.pdf" && fc.filed === "2026-11-05", fc);
      ck("a quarter opens the 決算短信 of the same fiscal year end and quarter where a stored row gives its address; a quarter whose rows give none has none", Qp[11].label === "2Q 3/27" && Qp[11].url === "https://example.org/ir/2q.pdf" && Qp[11].filed === "2026-11-05" && Qp[10].label === "1Q 3/27" && Qp[10].url === null && Qp[10].filed === null && Qp.slice(0, 10).every((p) => p.url === null), Qp.map((p) => [p.label, p.url]));
      // addresses on some rows only, as EDINET DB gives them (Toyota on 20 Nov 2026: three of its six newest). Rows:
      // 0 the parent alone (2Q, later), 1 consolidated 2Q, 2 a correction of 1Q, 3 the first 1Q, 4 the full year, 5 3Q
      const patched = (patch: Record<number, Record<string, unknown>>) => ({ ...earnings, earnings: earnings.earnings.map((r, i) => ({ ...r, ...(patch[i] ?? {}) })) });
      const years = { ...annual, data: annual.data.map((r) => (r.fiscalYear === 2026 ? { ...r, edinetFilingUrl: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2026", submitDateTime: "2026-06-10 15:33" } : r.fiscalYear === 2017 ? { ...r, edinetFilingUrl: "javascript:alert(1)" } : r)) };
      const v = edinetFin({ annual: years, standalone, earnings: patched({ 0: { pdfUrl: "https://example.org/ir/2q-parent.pdf" }, 1: { pdfUrl: undefined }, 3: { pdfUrl: "https://example.org/ir/1q.pdf" }, 4: { pdfUrl: "https://example.org/ir/4q.pdf" }, 5: { pdfUrl: "ir/3q.pdf" } }) }, "2026-11-19")!;
      const vq = (label: string) => v.quarterly.periods.find((p) => p.label === label)!;
      ck("a consolidated release without an address leaves its quarter and the guidance without one: the parent-only release's PDF, another document, is not put in its place", vq("2Q 3/27").url === null && v.annual.periods[10].kind === "FC" && v.annual.periods[10].url === null, [vq("2Q 3/27"), v.annual.periods[10]]);
      ck("where the newest release of a quarter (a correction) has no address and the first one has, the first one's PDF is linked, with its own date", vq("1Q 3/27").url === "https://example.org/ir/1q.pdf" && vq("1Q 3/27").filed === "2026-08-05", vq("1Q 3/27"));
      ck("a full-year release's PDF is the fourth quarter's document", vq("4Q 3/26").url === "https://example.org/ir/4q.pdf" && vq("4Q 3/26").filed === "2026-05-10", vq("4Q 3/26"));
      ck("only an address a browser can open is kept: a relative path or a script address is no address (the document ID stays)", vq("3Q 3/26").url === null && v.annual.periods[0].label === "FY3/17" && v.annual.periods[0].url === null && v.annual.periods[0].doc === "S100T2017", [vq("3Q 3/26"), v.annual.periods[0]]);
      ck("an EDINET address is kept exactly as given, with the filing date from submitDateTime", v.annual.periods[9].url === "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2026" && v.annual.periods[9].filed === "2026-06-10", v.annual.periods[9]);
      const solo = edinetFin({ annual, standalone, earnings: { earnings: [{ disclosureDate: "2026-11-05", quarter: 2, isConsolidated: false, fiscalYearEnd: "2027-03-31", revenue: 800000, forecastRevenue: 1650000, pdfUrl: "https://example.org/ir/2q-solo.pdf" }] } }, null)!;
      ck("a company that reports its own figures only (no consolidated release) links that release", solo.quarterly.periods.find((p) => p.label === "2Q 3/27")!.url === "https://example.org/ir/2q-solo.pdf" && solo.annual.periods.slice(-1)[0].url === "https://example.org/ir/2q-solo.pdf");
      ck("an address is kept exactly as an http(s) address and nothing else is one", docUrl(" https://example.org/a.pdf ") === "https://example.org/a.pdf" && docUrl("http://example.org/a") === "http://example.org/a" && [null, 7, "", "ftp://x/y", "javascript:alert(1)", "/ir/a.pdf", "https://exa mple.org", 'https://x.example/a"b'].every((x) => docUrl(x) === null));
      // EDINET DB's own flag on each filing's address (the reviewer's R2B-04): a filing aged out of EDINET's ~10-year
      // retention keeps its document ID but gets no address, and says why; one flagged available, or not flagged, keeps it
      const flagged = { ...annual, data: annual.data.map((r) => (r.fiscalYear === 2017 ? { ...r, edinetFilingUrl: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2017", edinetFilingUrlAvailability: "expired", edinetFilingUrlNote: "past the  retention\nperiod" } : r.fiscalYear === 2026 ? { ...r, edinetFilingUrl: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2026", edinetFilingUrlAvailability: "available" } : r.fiscalYear === 2025 ? { ...r, edinetFilingUrl: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2025" } : r)) };
      const ag = edinetFin({ annual: flagged, standalone, earnings }, "2026-11-19")!, a17 = ag.annual.periods[0], a26 = ag.annual.periods[9], a25 = ag.annual.periods[8];
      ck(`a year EDINET DB flags as no longer on EDINET has no address, keeps its document ID, and says why ("${a17.docGone}")`, a17.label === "FY3/17" && a17.url === null && a17.doc === "S100T2017" && a17.docGone === "document S100T2017 no longer on EDINET, per EDINET DB (expired: past the retention period)", a17);
      ck("a year flagged available keeps its address; a year whose answer carries no flag keeps it too (as before); neither says anything is gone", a26.url === "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2026" && a26.docGone === undefined && a25.url === "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100T2025" && !("docGone" in a25), [a26, a25]);
      ck("the flag is read whatever its case or the field names' style; a flag on a row with no usable address changes nothing", filingLink({ edinetfilingurl: "https://x.example/a", edinetfilingurlavailability: " Available " }).url === "https://x.example/a" && filingLink({ edinetfilingurl: "https://x.example/a", edinetfilingurlavailability: "unavailable" }).gone === "the filing no longer on EDINET, per EDINET DB (unavailable)" && JSON.stringify(filingLink({ edinetfilingurl: "javascript:x", edinetfilingurlavailability: "expired" })) === JSON.stringify({ url: null, gone: null }) && edinetFin({ annual: { data: [{ fiscal_year: 2026, revenue: 1, edinet_filing_url: "https://x.example/b", edinet_filing_url_availability: "expired", doc_id: "S1" }] }, standalone: null, earnings: null }, null)!.annual.periods[0].docGone === "document S1 no longer on EDINET, per EDINET DB (expired)");
      ck("the page's header tip: the source's own reason where it gives one, otherwise that it gave no address", noDocWhy({ docGone: "document S1 no longer on EDINET, per EDINET DB (expired)" }) === "document S1 no longer on EDINET, per EDINET DB (expired)" && noDocWhy({}) === "no document address from the source" && noDocWhy({ docGone: "  " }) === "no document address from the source");
    }

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
    // 18 Nov 2026 as it was: crypto current, everything else standing at 15:52 UTC
    const nov18 = feedState([P("BTC-USD", "CRYPTO", "2026-11-18T17:29:00Z"), P("USDJPY=X", "FX", "2026-11-18T15:52:00Z"), P("^GSPC", "NYSE", "2026-11-18T15:52:00Z"), P("ES=F", "CME", "2026-11-18T15:42:00Z")], at("2026-11-18T17:30:00Z"));
    ck("crypto arriving does not vouch for the rest: with every other price standing still the feed has stopped, and the print named is the newest of the rest", nov18.expected && !nov18.ok && nov18.symbol !== "BTC-USD" && nov18.newest === "2026-11-18T15:52:00.000Z" && nov18.lateMin === 98, nov18);
    const cr = feedState([P("BTC-USD", "CRYPTO", "2026-11-18T16:00:00Z"), P("USDJPY=X", "FX", "2026-11-18T17:29:00Z")], at("2026-11-18T17:30:00Z"));
    ck("nor the rest for crypto: crypto standing still while currencies print is a feed that has stopped; both current is a feed that works", cr.expected && !cr.ok && cr.symbol === "BTC-USD" && feedState([P("BTC-USD", "CRYPTO", "2026-11-18T17:29:00Z"), P("USDJPY=X", "FX", "2026-11-18T17:29:00Z")], at("2026-11-18T17:30:00Z")).ok);
    const friday = [P("USDJPY=X", "FX", "2026-11-20T21:59:00Z"), P("ES=F", "CME", "2026-11-20T21:59:00Z")];
    ck("at the weekend currencies and futures are shut and their Friday prints are not a stopped feed: on Friday evening, on Saturday and on Sunday before 17:00 New York, with or without crypto", !feedState(friday, at("2026-11-20T23:30:00Z")).expected && !feedState(friday, at("2026-11-21T12:00:00Z")).expected && !feedState(friday, at("2026-11-22T20:00:00Z")).expected && feedState([...friday, P("BTC-USD", "CRYPTO", "2026-11-21T11:59:00Z")], at("2026-11-21T12:00:00Z")).ok && !feedState([...friday, P("BTC-USD", "CRYPTO", "2026-11-21T09:00:00Z")], at("2026-11-21T12:00:00Z")).ok);
    ck("once the week has begun again (Sunday 17:00 New York) currencies are expected to print: Friday's print an hour and a half in is a stopped feed, a current one is not", !feedState(friday, at("2026-11-22T23:30:00Z")).ok && feedState(friday, at("2026-11-22T23:30:00Z")).expected && feedState([P("USDJPY=X", "FX", "2026-11-22T23:29:00Z")], at("2026-11-22T23:30:00Z")).ok);
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
    ck("a market read on its own minute bars has a grace of 75 minutes: Mexico's bars, which end an hour before the bell kept for it, hold its close; New York's of 10:52 do not, nor would bars ending 80 minutes short", OWN_SHORT_MIN === 75 && barSettled("BMV", "2026-11-18", at("2026-11-18T20:00:00Z"), OWN_SHORT_MIN) && !barSettled("BMV", "2026-11-18", at("2026-11-18T20:00:00Z")) && !barSettled("NYSE", "2026-11-18", stop, OWN_SHORT_MIN) && !barSettled("NYSE", "2026-11-18", at("2026-11-18T19:40:00Z"), OWN_SHORT_MIN) && barSettled("KRX", "2026-11-18", at("2026-11-18T06:00:00Z"), OWN_SHORT_MIN));
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

  console.log("\n[the second path for prices: when the relay on GitHub takes over, and when it hands back]");
  {
    const at = (iso: string) => Date.parse(iso), P = (symbol: string, market: string, marketTime: string): Print => ({ symbol, market, marketTime });
    // what each machine was handed on 18 Nov 2026 at 17:30 UTC: the server the prices of 15:52, GitHub current ones
    const now = at("2026-11-18T17:30:00Z");
    const server = reading([P("BTC-USD", "CRYPTO", "2026-11-18T17:29:00Z"), P("USDJPY=X", "FX", "2026-11-18T15:52:00Z"), P("^GSPC", "NYSE", "2026-11-18T15:52:00Z"), P("ES=F", "CME", "2026-11-18T15:42:00Z")], 4, now);
    const github = reading([P("BTC-USD", "CRYPTO", "2026-11-18T17:29:00Z"), P("USDJPY=X", "FX", "2026-11-18T17:29:00Z"), P("^GSPC", "NYSE", "2026-11-18T17:29:00Z"), P("ES=F", "CME", "2026-11-18T17:19:00Z")], 4, now);
    ck("18 Nov as it was: the server's own answers are 98 minutes behind and not current; GitHub's are a minute behind, current and usable", server.expected && server.lateMin === 98 && !current(server) && !usable(server) && github.lateMin === 1 && current(github) && usable(github) && server.got === 4 && server.due === 4, { server, github });
    const edge = (min: number) => reading([P("EURUSD=X", "FX", new Date(now - min * 60000).toISOString())], 1, now);
    ck(`the line is ${RELAY_LATE_MIN} minutes behind: nine is current, ten is not (the red bar on screen waits for twenty)`, RELAY_LATE_MIN === 10 && RELAY_LATE_MIN < FEED_LATE_MIN && current(edge(9)) && !current(edge(10)));
    ck("a pull that brings back less than half of what was asked is not current, however fresh the few are; half is enough", !current(reading([P("USDJPY=X", "FX", "2026-11-18T17:29:00Z")], 3, now)) && current(reading([P("USDJPY=X", "FX", "2026-11-18T17:29:00Z"), P("EURUSD=X", "FX", "2026-11-18T17:29:00Z")], 4, now)) && !current(reading([], 80, now)));
    const sat = reading([], 0, at("2026-11-21T12:00:00Z")), satFx = reading([P("USDJPY=X", "FX", "2026-11-20T21:59:00Z")], 1, at("2026-11-21T12:00:00Z"));
    ck("nothing due, or no market open, is current (the server is not asked to stand down for a quiet weekend) but not usable: there is nothing to write", current(sat) && !usable(sat) && current(satFx) && !usable(satFx) && !sat.expected);

    const v = (o: Partial<RelayView>): RelayView => ({ active: false, screenStopped: false, mineOk: true, ownOkRun: 0, heldMin: 0, forced: false, ...o });
    ck("a relay that starts and finds the prices on screen current has nothing to do (GitHub's schedule starts one twice an hour)", relayAct(v({})) === "not-needed" && relayAct(v({ mineOk: false, heldMin: 1 })) === "not-needed" && relayAct(v({ ownOkRun: 9 })) === "not-needed");
    ck("the prices on screen behind and its own answers usable: it takes over", relayAct(v({ screenStopped: true })) === "take");
    ck(`behind on screen and not usable here either: it waits, writing nothing, and gives up after ${RELAY_WAIT_MIN} minutes (the source has stopped for everyone)`, relayAct(v({ screenStopped: true, mineOk: false, heldMin: 1 })) === "hold" && relayAct(v({ screenStopped: true, mineOk: false, heldMin: RELAY_WAIT_MIN - 1 })) === "hold" && relayAct(v({ screenStopped: true, mineOk: false, heldMin: RELAY_WAIT_MIN })) === "give-up");
    ck("once on, it writes every minute its answers are usable, whatever the screen now says (the screen is current because it writes)", relayAct(v({ active: true })) === "write" && relayAct(v({ active: true, screenStopped: true })) === "write" && relayAct(v({ active: true, ownOkRun: RELAY_OK_RUN - 1 })) === "write");
    ck(`it hands back when the server has reported its own answers current ${RELAY_OK_RUN} minutes in a row, not before; one current minute is not a recovery`, RELAY_OK_RUN === 3 && relayAct(v({ active: true, ownOkRun: 1 })) === "write" && relayAct(v({ active: true, ownOkRun: 3 })) === "hand-back" && relayAct(v({ active: true, ownOkRun: 3, mineOk: false, heldMin: 4 })) === "hand-back");
    ck("on, and its own answers stop too: it holds (no beat, so the server carries on) and gives up after ten such minutes", relayAct(v({ active: true, mineOk: false, heldMin: 2 })) === "hold" && relayAct(v({ active: true, mineOk: false, heldMin: 10 })) === "give-up");
    ck("a drill, or the next shift of a relay that is on, takes over at once although the screen is current, and does not hand back while it lasts; without usable answers it still writes nothing", relayAct(v({ forced: true })) === "take" && relayAct(v({ forced: true, active: true, ownOkRun: 9 })) === "write" && relayAct(v({ forced: true, mineOk: false, heldMin: 1 })) === "hold" && relayAct(v({ active: true, ownOkRun: 9 })) === "hand-back");
    // the evening of 18 Nov, minute by minute, with the rules as they are now
    { let active = false, wrote = 0, took = -1, back = -1; const stopAt = 0, recoverAt = 454;   // 15:52 to 23:26 UTC
      for (let m = 0; m <= 470 && back < 0; m++) {
        const ownLate = m < recoverAt ? m - stopAt : 1, screenLate = active ? 1 : ownLate, ownOkRun = m >= recoverAt ? m - recoverAt + 1 : 0;
        const act = relayAct({ active, screenStopped: screenLate >= RELAY_LATE_MIN, mineOk: true, ownOkRun, heldMin: 0, forced: false });
        if (act === "take") { active = true; took = m; }
        if (act === "take" || act === "write") wrote++;
        if (act === "hand-back") back = m;
      }
      ck("18 Nov replayed: a relay looking every minute takes over ten minutes into the stop, writes for the seven hours and more, and hands back three minutes after the server's answers return", took === 10 && back === 456 && wrote === 446, { took, back, wrote }); }

    const t = at("2026-11-18T17:30:25Z");
    ck(`the relay's beat counts for ${RELAY_BEAT_MAX_S} seconds: one from the last minute is fresh, one three minutes old is not, an ended relay (no time) or an unreadable one is not, nor one stamped far in the future`, beatFresh("2026-11-18T17:29:25Z", t) && beatFresh("2026-11-18T17:27:55Z", t) && !beatFresh("2026-11-18T17:27:25Z", t) && !beatFresh(null, t) && !beatFresh(undefined, t) && !beatFresh("soon", t) && !beatFresh("2026-11-18T17:40:00Z", t) && OWN_FRESH_MIN === 3);

    const q = (symbol: string, market_time: string) => ({ symbol, market_time, price: 1 });
    const kept = newerOnly([q("USDJPY=X", "2026-11-18T15:52:00Z"), q("^GSPC", "2026-11-18T17:29:00Z"), q("ES=F", "2026-11-18T17:19:00.000Z"), q("NEW", "2026-11-18T15:52:00Z")], new Map([["USDJPY=X", "2026-11-18T17:29:00+00:00"], ["^GSPC", "2026-11-18T17:28:00+00:00"], ["ES=F", "2026-11-18T17:19:00+00:00"]]));
    ck("a print never replaces a newer one already stored (the server's old answer in the minute the relay takes over); a newer one, an equal one and a first one are written", kept.map((x) => x.symbol).join() === "^GSPC,ES=F,NEW", kept);

    // the timetable: the same minutes as the database's own
    const u = (iso: string) => at(iso);
    ck("a timetable line is read as pg_cron reads it, in UTC: steps, lists, ranges, weekdays", cronDue("*/10 14-21 * * 1-5", u("2026-11-18T14:00:00Z")) && cronDue("*/10 14-21 * * 1-5", u("2026-11-18T21:50:30Z")) && !cronDue("*/10 14-21 * * 1-5", u("2026-11-18T22:00:00Z")) && !cronDue("*/10 14-21 * * 1-5", u("2026-11-18T14:05:00Z")) && !cronDue("*/10 14-21 * * 1-5", u("2026-11-21T14:00:00Z")) && cronDue("3,23,43 0-6 * * 1-5", u("2026-11-19T06:43:00Z")) && !cronDue("3,23,43 0-6 * * 1-5", u("2026-11-19T07:03:00Z")) && cronDue("35 22 * * 1-5", u("2026-11-18T22:35:59Z")) && !cronDue("35 22 * * 1-5", u("2026-11-22T22:35:00Z")) && cronDue("40 0 * * *", u("2026-11-22T00:40:00Z")) && cronDue("30 2 * * 2-6", u("2026-11-21T02:30:00Z")) && !cronDue("30 2 * * 2-6", u("2026-11-23T02:30:00Z")) && cronDue("0 0 * * 7", u("2026-11-22T00:00:00Z")) && !cronDue("bad", u("2026-11-18T14:00:00Z")) && !cronDue("61 * * * *", u("2026-11-18T14:00:00Z")));
    const names = (a: number, b: number) => relayJobsDue(a, b).map((j) => j.name).sort().join();
    ck("at 14:10 UTC on a weekday the S&P 500's flow is due; at 14:15 the Nasdaq 100's; at 22:35 the daily closes; on a Saturday nothing", names(u("2026-11-18T14:09:25Z"), u("2026-11-18T14:10:25Z")) === "monitor-flow-sp500" && names(u("2026-11-18T14:14:25Z"), u("2026-11-18T14:15:25Z")) === "monitor-flow-ndx" && names(u("2026-11-18T22:34:25Z"), u("2026-11-18T22:35:25Z")) === "monitor-history-us" && names(u("2026-11-21T14:09:25Z"), u("2026-11-21T14:10:25Z")) === "");
    ck("a relay minute that ran long does not skip a job: the minutes since the last look are all read, each job once; nor does it replay an afternoon (ten minutes back at most)", names(u("2026-11-18T14:08:25Z"), u("2026-11-18T14:11:40Z")) === "monitor-flow-sp500" && relayJobsDue(u("2026-11-18T14:00:25Z"), u("2026-11-18T14:21:25Z")).filter((j) => j.idx === "SP500").length === 1 && names(u("2026-11-18T10:00:00Z"), u("2026-11-18T14:21:25Z")) === "monitor-flow-ndx,monitor-flow-sp500" && names(u("2026-11-18T14:10:25Z"), u("2026-11-18T14:10:50Z")) === "");
    // against the database's timetable itself: the newest migration that defines monitor_install_cron
    const migDir = new URL("../supabase/migrations/", import.meta.url), newest = listDir(migDir).filter((f) => f.endsWith(".sql")).sort().filter((f) => /function monitor_install_cron/.test(readText(new URL(f, migDir), "utf8"))).pop()!;
    const body = readText(new URL(newest, migDir), "utf8"), fn = body.slice(body.indexOf("function monitor_install_cron"), body.indexOf("end $$", body.indexOf("function monitor_install_cron")));
    const lines = [...fn.matchAll(/cron\.schedule\('([^']+)',\s*'([^']+)',\s*\$c\$select monitor_call\('daily', 'job=([a-z0-9]+)(?:&idx=([A-Z0-9]+))?[^']*'\)\$c\$\)/g)].map((m) => ({ name: m[1], cron: m[2], job: m[3], idx: m[4] }));
    const wanted = lines.filter((l) => (RELAY_JOBS as readonly string[]).includes(l.job)), key = (l: { name: string; cron: string; job: string; idx?: string }) => `${l.name}|${l.cron}|${l.job}|${l.idx ?? ""}`;
    const missing = wanted.filter((l) => !RELAY_CRON.some((r) => key(r) === key(l))).map(key), extra = RELAY_CRON.filter((r) => !wanted.some((l) => key(l) === key(r))).map(key);
    ck(`the relay's timetable is the database's own (${newest}): every flow, statistics and history line, the same minutes, none more (${wanted.length} lines)`, lines.length > 40 && wanted.length === 24 && missing.length === 0 && extra.length === 0, { missing, extra });
    ck("the server's `daily` function stands down for exactly the jobs the relay runs, and the tick asks for the relay through the database, also when its pull fails outright (asked first, the failure reported after)", /RELAY_JOBS\.includes\(job as RelayJob\)/.test(readText(new URL("../supabase/functions/daily/index.ts", import.meta.url), "utf8")) && RELAY_JOBS.join() === "flow,mflow,stats,history" && /db\.rpc\("feed_relay_kick"\)/.test(readText(new URL("../supabase/functions/tick/index.ts", import.meta.url), "utf8")) && /pullErr = e;[\s\S]*feed_relay_kick[\s\S]*if \(pullErr\) throw/.test(readText(new URL("../supabase/functions/tick/index.ts", import.meta.url), "utf8")) && /YAHOO_RETRIES/.test(readText(new URL("../.github/workflows/feed-relay.yml", import.meta.url), "utf8")));
  }

  console.log("\n[the watchlist: a yield's changes in bp as on MARKETS, and what each row is as of, and from whom]");
  {
    // made-up market-table rows in computeTable's shape (table.ts): a print carries the database's "+00:00" time,
    // a booked close is stamped "<date>T00:00:00Z"
    const tnx = { symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", group: "rates", currency: "USD", source: "yahoo", last: 4.859, lastAt: "2026-11-19T15:18:00+00:00",
      pct: { d1: -0.98, w1: 0.43, m1: -1.88, m3: 3.45, m12: 8.33, m36: 52 }, chg: { d1: -0.048, w1: 0.021, m1: -0.093, m3: 0.162, m12: 0.374, m36: 1.66 }, pos52: 54, vs200: 0.112 };
    const y = watchRowFromTable(tnx);
    ck("a yield on the watchlist carries the market table's change of its level for each window, exactly as MARKETS has it (which prints it in bp), and no per cent of its level", y.isYield && y.chg1d === -0.048 && y.chg1w === 0.021 && y.chg1m === -0.093 && y.chg3m === 0.162 && y.chg12m === 0.374 && [y.pct1d, y.pct1w, y.pct1m, y.pct3m, y.pct12m].every((v) => v === null), y);
    ck("its distance from the 200-day average goes out in points (vs200chg), never in the per-cent field an older page prints with a %", y.vs200 === null && y.vs200chg === 0.112 && y.vs50 === null && y.pos52 === 54, y);
    ck("a print is as of its own time; the source is named", y.asOfKind === "print" && y.asOf === "2026-11-19T15:18:00+00:00" && y.source === "Yahoo Finance", y);
    const fx = watchRowFromTable({ ...tnx, symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", currency: "JPY", last: 158.42, lastAt: "2026-11-18T00:00:00Z", pct: { d1: 0.26 }, chg: { d1: 0.41 }, vs200: 2.3 });
    ck("a price keeps its per-cent changes and its % from the 200-day average; a booked close is as of its session's date", !fx.isYield && fx.pct1d === 0.26 && fx.chg1d === 0.41 && fx.vs200 === 2.3 && fx.vs200chg === null && fx.asOfKind === "close" && fx.asOf === "2026-11-18", fx);
    const zn = watchRowFromTable({ ...tnx, symbol: "ZN=F", name: "10Y T-Note future", vs200: -0.8 });
    ck("a bond future sits in the rates group but is a price: per cent, as the table measures it", !zn.isYield && zn.pct1d === -0.98 && zn.vs200 === -0.8 && zn.vs200chg === null, zn);
    const cv = (symbol: string, source: string) => watchRowFromTable({ ...tnx, symbol, source, lastAt: "2026-11-18T00:00:00Z" });
    const official = [cv("UST2Y", "treasury"), cv("JGB10Y", "mof"), cv("UST3M", "curve"), cv("JGB2Y", "curve"), cv("DE10Y", "curve"), cv("GB10Y", "curve"), cv("EA10Y", "curve"), cv("CA10Y", "curve")];
    ck("a yield read from an official curve is that publisher's figure for its date, and the publisher is named", official.every((r) => r.asOfKind === "published" && r.asOf === "2026-11-18" && r.isYield) && official.map((r) => r.source).join("|") === "US Treasury|Japan MOF|US Treasury|Japan MOF|Bundesbank|Bank of England|ECB|Bank of Canada", official.map((r) => [r.symbol, r.source, r.asOfKind, r.asOf]));
    ck("a booked close's stamp is told from a print's time, also a print at midnight", closeDay("2026-11-18T00:00:00Z") === "2026-11-18" && closeDay("2026-11-18T00:00:00+00:00") === null && closeDay("2026-11-18T14:30:00Z") === null && closeDay(null) === null && sourceName("yahoo", "^TNX") === "Yahoo Finance" && isYieldRow({ group: "rates", symbol: "^TNX" }) && !isYieldRow({ group: "rates", symbol: "ZN=F" }));
    ck("the route builds a market instrument's row with this mapping", /if \(t\) return \{ \.\.\.watchRowFromTable\(t\), symbol: w\.symbol \}/.test(readText(new URL("../supabase/functions/api/index.ts", import.meta.url), "utf8")));

    // the page's reading of it (web/src/lib/time.ts), in Singapore time
    const now = at("2026-11-19T15:30:00Z");   // 23:30 SGT on 19 Nov
    const close = asOfOf("2026-11-19", "close", now), pub = asOfOf("2026-11-18", "published", now), today = asOfOf("2026-11-19T15:18:00+00:00", "print", now), earlier = asOfOf("2026-11-18T09:05:00Z", "print", now);
    ck("a close by its date (\"close 19 Nov\" on a phone), a published yield by its date, today's print by its time, an earlier print by date and time", asOfCell(close) === "19 Nov" && asOfLine(close) === "close 19 Nov" && asOfCell(pub) === "18 Nov" && asOfLine(pub) === "18 Nov" && asOfCell(today) === "23:18" && asOfLine(today) === "23:18" && asOfCell(earlier) === "18 Nov 17:05", [close, pub, today, earlier].map(asOfCell));
    ck("a session's date is its own: a US close of 18 Nov stays 18 Nov in Singapore", asOfCell(asOfOf("2026-11-18", "close", at("2026-11-19T05:00:00Z"))) === "18 Nov");
    ck("today is Singapore's day: a print at 23:59 SGT read two minutes after midnight SGT carries its date", asOfCell(asOfOf("2026-11-19T15:59:00Z", "print", at("2026-11-19T16:01:00Z"))) === "19 Nov 23:59" && asOfCell(asOfOf("2026-11-19T16:00:00Z", "print", at("2026-11-19T16:01:00Z"))) === "00:00");
    ck("an older server sends no kind: a date, or a stamp at midnight UTC, is a close; any other time a print", asOfOf("2026-11-18T00:00:00Z", undefined, now)?.kind === "close" && asOfCell(asOfOf("2026-11-18T00:00:00Z", undefined, now)) === "18 Nov" && asOfOf("2026-11-19", null, now)?.kind === "close" && asOfOf("2026-11-19T15:18:00Z", undefined, now)?.kind === "print");
    ck("no as-of gives a dash, never a guessed date; the tooltip names the source", asOfCell(asOfOf(null, "close", now)) === "–" && asOfCell(asOfOf("not a time", "print", now)) === "–" && asOfTitle(close, "Yahoo Finance") === "Yahoo Finance · close of 19 Nov 2026" && asOfTitle(pub, "Japan MOF") === "Japan MOF · published for 18 Nov 2026" && asOfTitle(today, "Yahoo Finance") === "Yahoo Finance · last print 19 Nov 2026 23:18 SGT");

    // a name that is neither on MARKETS nor in an index comes as a plain quote (the reviewer's R2A-06): a Treasury
    // yield index the table lacks must not move in per cent of its level either. Made-up quotes in yahoo.ts's shape.
    const quote = (o: Partial<QuoteLike>): QuoteLike => ({ name: null, quoteType: null, currency: "USD", price: null, prevClose: null, time: null, marketCap: null, earningsAt: null, earningsEst: null, ...o });
    const irx = watchRowFromQuote("^IRX", "13 WEEK TREASURY BILL", quote({ name: "13 WEEK TREASURY BILL", quoteType: "INDEX", price: 3.852, prevClose: 3.871, time: Date.parse("2026-11-19T15:18:00Z") / 1000 }));
    ck("the 13-week bill's yield index (^IRX, not on MARKETS) is a yield: its 1D is the change of its level in points (bp on the page), never a per cent of it; a print with its time, from Yahoo Finance", irx.isYield && Math.abs(irx.chg1d! + 0.019) < 1e-9 && irx.pct1d === null && irx.kind === "Fixed income" && irx.last === 3.852 && irx.asOfKind === "print" && irx.asOf === "2026-11-19T15:18:00.000Z" && irx.source === "Yahoo Finance" && irx.mcap === null && irx.earningsAt === null, irx);
    const named = watchRowFromQuote("^XYZ", null, quote({ name: "Treasury Yield 7 Years", quoteType: "INDEX", price: 4.1, prevClose: 4.05 }));
    const fund = watchRowFromQuote("TBIL", null, quote({ name: "US Treasury 3 Month Bill ETF", quoteType: "ETF", price: 49.9, prevClose: 49.88 }));
    const billFund = watchRowFromQuote("XBIL", null, quote({ name: "Treasury Bill ETF", quoteType: "ETF", price: 50, prevClose: 49.9 }));
    const stock = watchRowFromQuote("9999.T", "Stand-in KK", quote({ name: "Stand-in KK", quoteType: "EQUITY", currency: "JPY", price: 1100, prevClose: 1000, marketCap: 5e10, earningsAt: Date.parse("2026-12-01T06:00:00Z") / 1000, earningsEst: true }));
    ck("an index Yahoo names as a Treasury yield is one too; a fund of bills and a stock are prices with a per-cent 1D, as before", named.isYield && Math.abs(named.chg1d! - 0.05) < 1e-9 && named.pct1d === null && !fund.isYield && !billFund.isYield && Math.abs(fund.pct1d! - (49.9 / 49.88 - 1) * 100) < 1e-9 && fund.chg1d === null && !stock.isYield && Math.abs(stock.pct1d! - 10) < 1e-9 && stock.chg1d === null && stock.mcap === 5e10 && stock.kind === "EQUITY" && stock.earningsAt === "2026-12-01T06:00:00.000Z" && stock.earningsEst === true, { named, fund, stock });
    const bare = watchRowFromQuote("ZZZZ", "Typed in", undefined), half = watchRowFromQuote("^IRX", null, quote({ quoteType: "INDEX", price: 3.85 }));
    ck("^FVX, ^TNX and ^TYX are the same yields when they come as quotes; a yield with no previous close has no 1D; no quote leaves the name and dashes", CBOE_YIELDS.every((x) => isYieldQuote(x, null, null)) && !isYieldQuote("SHV", "iShares Short Treasury Bond ETF", "ETF") && half.isYield && half.chg1d === null && half.pct1d === null && bare.name === "Typed in" && bare.last === null && bare.pct1d === null && bare.chg1d === null && bare.asOfKind === null && bare.source === null && !bare.isYield, { half, bare });
    ck("the route builds a plain quote's row with this mapping", /return watchRowFromQuote\(w\.symbol, w\.name, q\);/.test(readText(new URL("../supabase/functions/api/index.ts", import.meta.url), "utf8")));
  }

  console.log("\n[the header's alert line: what its figure is, from the server's own words (the reviewer's R2A-05)]");
  {
    // the server's wording (supabase/functions/_shared/alerts.ts, which needs the database and cannot load here)
    const src = readText(new URL("../supabase/functions/_shared/alerts.ts", import.meta.url), "utf8");
    ck("the server still words a move \"<name> up|down <n>%\", with \" intraday\" when measured in the session", src.includes('export const alertMsg = (name: string, pct: number, intraday: boolean) => `${name} ${pct >= 0 ? "up" : "down"} ${fmtPct(pct)}${intraday ? " intraday" : ""}`;') && /const fmtPct = \(p: number\) => `\$\{Math\.abs\(p\) >= 10 \? Math\.round\(Math\.abs\(p\)\) : r1\(Math\.abs\(p\)\)\}%`;/.test(src));
    const w = (kind: string, msg: string) => alertFigWord({ kind, msg });
    ck("a stock measured in the session reads intraday (its largest move, kept after it comes back); measured at its official close, at close", w("stock", "KIOXIA HOLDINGS CORP. down 11% intraday") === "intraday" && w("stock", "Toyota Motor up 7.4% intraday") === "intraday" && w("stock", "Intuit Inc. down 7.2%") === "at close");
    ck("an index while its market trades reads intraday; otherwise (a lunch break, the close) its 1D, never a guessed \"at close\"", w("index", "Nikkei 225 down 3.4% intraday") === "intraday" && w("index", "Nikkei 225 down 3.4%") === "1D" && w("index", "PHLX Semiconductor (SOX) down 4.11%") === "1D");
    ck("a news alert has no figure word, nor a message in other words", w("mna", "M&A: Two lenders agree to merge") === null && w("buyback", "Buyback: Toyota to buy back shares") === null && w("stock", "NVIDIA Corporation fell 7.4% on the day, beyond its 5% line") === null && w("stock", "") === null);
    ck("a news alert that names no company shows its headline without its kind", alertHeadline("M&A: Two regional lenders agree to merge in a USD 2.1bn deal") === "Two regional lenders agree to merge in a USD 2.1bn deal" && alertHeadline("Buyback: X buys back") === "X buys back" && alertHeadline("Guidance: Y raises") === "Y raises" && alertHeadline("No kind here") === "No kind here");
  }

  console.log("\n[a statements table wider than its box: where it rests, one screen back, and short-interest sector names (the designer's D-03, D-07)]");
  {
    // an iPhone SE: line names 128 px wide in a 357-px box, eleven periods of 72 px (the table 920 px)
    const starts = Array.from({ length: 11 }, (_, i) => 128 + i * 72), tableW = 128 + 11 * 72;
    const r = finRest(128, 357, starts, tableW);
    ck("it rests with the latest periods whole and the first of them against the names: as many as fit (three of 72 px in 229), and a spacer gives the 13 px left after the last", r.k === 8 && r.left === starts[8] - 128 && r.pad === 13, r);
    ck("at that place the scroll reaches exactly (the spacer makes the table end there) and nothing of the period before shows beside the names", tableW + r.pad - 357 === r.left && starts[7] + 72 - r.left === 128, { r, end: tableW + r.pad - 357 });
    const uneven = [128, 200, 290, 362, 450], q = finRest(128, 357, uneven, 530);
    ck("periods of different widths: the first from which the rest fit (362 to 530 in 229 px), 61 px of spacer", q.k === 3 && q.left === 234 && q.pad === 61, q);
    ck("a table that fits rests at its start", finRest(128, 1200, starts, tableW).left === 0 && finRest(128, 1200, starts, tableW).k === 0);
    ck("a single period wider than the room for periods rests at the start, with no spacer", JSON.stringify(finRest(128, 357, [128], 500)) === JSON.stringify({ k: 0, left: 0, pad: 0 }) && JSON.stringify(finRest(128, 357, [], 128)) === JSON.stringify({ k: 0, left: 0, pad: 0 }));
    const steps = [r.left]; for (let i = 0; i < 6 && steps[steps.length - 1] > 0; i++) steps.push(finBack(128, 357, starts, steps[steps.length - 1]));
    ck(`"earlier years" goes back a screen at a time, each time to a period's edge, the one before the screen's first period ending against the names: ${steps.join(" → ")}`, steps.join() === "576,360,144,0" && steps.every((x) => (x + 128 - 128) % 72 === 0), steps);
    ck("from a place between two edges it goes back to an edge; at the start it stays", finBack(128, 357, starts, 600) === 432 && finBack(128, 357, starts, 0) === 0 && finBack(128, 357, [128], 0) === 0);
    // the right edge (the designer's verdict on D-03, 20 Nov 2026): periods of 72.6 px left 11 to 66 px of the next
    // one showing at the box's right edge after a press or a swipe; each period now takes room ÷ n
    const PHONES: Array<[string, number, number, number]> = [["iPhone SE", 357, 76, 129], ["iPhone 13", 372, 81, 129], ["Pixel 7", 394, 88, 130], ["iPhone 14 Pro Max", 412, 94, 130]];
    for (const [phone, boxW, col, names] of PHONES) {
      const f = finFit(boxW, 128, 72.609375, 11);
      // every place the box can rest: a period's edge against the names, from the start to where it rests
      const st = Array.from({ length: 11 }, (_, i) => (f?.names ?? 0) + i * (f?.col ?? 0)), tw = (f?.names ?? 0) + 11 * (f?.col ?? 0), rest = f && finRest(f.names, boxW, st, tw);
      const stops = rest ? Array.from({ length: rest.k + 1 }, (_, k) => k * f!.col) : [];
      // at the k-th place: period k against the names, period k + 2 ending at the box's right edge, period k + 3 (if
      // any) starting there
      const clean = stops.every((s, k) => st[k] - s === f!.names && st[k + 2] + f!.col - s === boxW && (k + 3 >= st.length || st[k + 3] - s >= boxW));
      ck(`${phone} (a ${boxW}-px box, names 128 px, eleven periods of 72.6 px): three periods of ${f?.col} px, the names ${f?.names} px; at each of its ${stops.length} resting places the third period ends exactly at the box's right edge and the next starts there`, !!f && f.n === 3 && f.col === col && f.names === names && f.names + 3 * f.col === boxW && !!rest && rest.pad === 0 && rest.left === 8 * col && clean, { f, rest, stops });
    }
    const back = [PHONES[1]].map(([, boxW]) => { const f = finFit(boxW, 128, 72.609375, 11)!, st = Array.from({ length: 11 }, (_, i) => f.names + i * f.col), out = [finRest(f.names, boxW, st, f.names + 11 * f.col).left]; for (let i = 0; i < 6 && out[out.length - 1] > 0; i++) out.push(finBack(f.names, boxW, st, out[out.length - 1])); return out; })[0];
    ck(`iPhone 13: "earlier years" goes back exactly three periods at a time (${back.join(" → ")}), the last screen the first three`, back.join() === "648,405,162,0", back);
    ck("a layout width already whole is not rounded up (73 px stays 73); 1/64 px more is (74)", finFit(372, 128, 73, 11)?.col === 81 && finFit(300, 80, 73, 11)?.n === 3 && finFit(300, 80, 73 + 1 / 64, 11)?.n === 2 && finFit(300, 80, 73 + 1 / 64, 11)?.col === 110);
    ck("nothing to fit: every period fits beside the names, one period is wider than the room, or there are none", finFit(1200, 270, 72.6, 11) === null && finFit(357, 128, 240, 11) === null && finFit(357, 128, 0, 0) === null && finFit(357, 128, 72.6, 3) === null);
    const pc = finFit(1019.5, 270.25, 90.3, 12);
    ck(`a computer's box with fractions (1,019.5 px, names 270.25): ${pc?.n} periods of ${pc?.col} px, the names ${pc?.names} px, filling the box exactly and never narrower than before`, !!pc && pc.n === 8 && pc.col === 93 && pc.names === 275.5 && pc.names + pc.n * pc.col === 1019.5 && pc.names >= 270.25, pc);
    const tr = sectorShort("輸送用機器", 25), ws = sectorShort("倉庫・運輸関連業", 25), gics = sectorShort("Consumer Discretionary", 25), none = sectorShort(null);
    ck(`a JPX sector is named in English, whole up to 25 characters ("${tr.text}"), cut at a word beyond ("${ws.text}"), with the English and the Japanese on hover ("${ws.full}")`, tr.text === "Transportation Equipment" && ws.text === "Warehousing & Harbor…" && ws.full === "Warehousing & Harbor Transportation Services (倉庫・運輸関連業)" && tr.full === "Transportation Equipment (輸送用機器)", { tr, ws });
    ck("a sector the map does not know (the server's GICS names) is kept as it is; none gives an empty cell; without a limit nothing is cut", gics.text === "Consumer Discretionary" && gics.full === "Consumer Discretionary" && none.text === "" && sectorShort("倉庫・運輸関連業").text === "Warehousing & Harbor Transportation Services");
  }

  console.log("\n[S] a stock's page (I-3): a big move in parts, the document behind a column, the NEWS rows, the period that holds a day");
  {
    const mp = (kind: MoveRow["kind"], pct: number) => moveParts({ kind, pct, from: "2026-05-25", to: "2026-09-14" });
    ck("a day's move: no word, the figure with its sign, \"on the day\"", JSON.stringify(mp("d1", -12.94)) === JSON.stringify({ word: null, fig: "\u221212.9%", rest: "on the day" }), mp("d1", -12.94));
    ck("a peak and a bottom: the turn as a word, the figure with its sign, where the move came from", mp("pk", 22.6).word === "New high" && mp("pk", 22.6).fig === "+22.6%" && mp("pk", 22.6).rest === "from the low of 25 May" && mp("bt", -24.1).word === "Bottom" && mp("bt", -24.1).fig === "\u221224.1%" && mp("bt", -24.1).rest === "from the high of 25 May" && mp("p2", 11.3).word === "Smaller peak" && mp("b2", -11.8).word === "Smaller bottom");
    ck("the parts say word for word what the server's sentence says, for every kind of move and both signs", (["d1", "pk", "bt", "p2", "b2", "w1", "m1"] as const).every((kind) => [12.34, -12.34].every((pct) => { const m = { kind, pct, from: "2026-05-25", to: "2026-09-14" }, p = moveParts(m); return [p.word ? `${p.word}:` : null, p.fig, p.rest].filter(Boolean).join(" ") === moveText(m); })));
    const edinet = periodDoc({ kind: "FY", label: "FY3/26", doc: "S100Y8NY", url: "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100Y8NY", filed: "2026-06-10" });
    ck("a year from the 有価証券報告書 on EDINET: the address as given, and a tip with the document ID and the filing date", edinet?.href === "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100Y8NY" && edinet.tip === "Open the 有価証券報告書 for FY3/26 on EDINET (document S100Y8NY, filed 10 Jun 2026) \u2197", edinet);
    ck("the guidance column and a quarter: the 決算短信 PDF and the day it was disclosed (the designer's words)", periodDoc({ kind: "FC", label: "FY3/27", doc: null, url: "https://example.com/ir/2q.pdf", filed: "2026-11-05" })?.tip === "Open the 決算短信 PDF, disclosed 5 Nov 2026 \u2197" && periodDoc({ kind: "Q", label: "1Q 3/27", doc: null, url: "https://example.com/ir/1q.pdf", filed: "2026-08-04" })?.tip === "Open the 決算短信 PDF for 1Q FY3/27, disclosed 4 Aug 2026 \u2197");
    ck("no address, or one a browser cannot open, opens nothing; a filing elsewhere than EDINET says where", periodDoc({ kind: "Q", label: "2Q 3/27", doc: null, url: null, filed: null }) === null && periodDoc({ kind: "FY", label: "FY3/26", doc: "S1", url: "javascript:alert(1)", filed: null }) === null && periodDoc({ kind: "FC", label: "FY3/27", doc: null, url: "/ir/x.pdf" }) === null && periodDoc({ kind: "FY", label: "FY3/26", doc: "S1", url: "https://example.org/x", filed: null })?.tip === "Open the 有価証券報告書 for FY3/26 on example.org (document S1) \u2197");
    const feed: StockFeed = { days: 90, news: [{ id: 1, publishedAt: "2026-11-19T15:22:00Z", source: "Nikkei Asia", title: "A", url: "https://example.com/1", category: null }, { id: 2, publishedAt: "2026-11-18T01:00:00Z", source: "FT Markets", title: "B", url: "https://example.com/2", category: "JP Equities" }],
      alerts: [{ id: 7, at: "2026-11-19T02:05:00Z", kind: "stock", pct: 16.7, market: "TSE", msg: "TOYOTA MOTOR CORP. up 16.7% intraday", url: null }, { id: 8, at: "2026-11-19T20:00:00Z", kind: "buyback", pct: null, market: "Nikkei Asia", msg: "Buyback: a stand-in", url: "https://example.com/a" }] };
    const all = feedRows(feed);
    ck("NEWS: the headlines and the alerts as one list, newest first; an alert says what it is and where it was read, a move has no link", all.map((r) => r.key).join() === "a8,h1,a7,h2" && all[0].source === "buyback, Nikkei Asia" && all[2].source === "move, TSE" && all[2].url === null && all[1].kind === "headline" && all[1].source === "Nikkei Asia" && all[1].url === "https://example.com/1", all);
    ck("its filters: headlines only, alerts only; nothing from no feed", feedRows(feed, "headlines").map((r) => r.key).join() === "h1,h2" && feedRows(feed, "alerts").map((r) => r.key).join() === "a8,a7" && feedRows(undefined).length === 0 && feedRows({ days: 90, news: [], alerts: [] }).length === 0);
    ck("a row's time in Singapore (\"19 Nov 23:22\"); a data date as \"5 Nov 2026\"", fmtDayTime("2026-11-19T15:22:00Z") === "19 Nov 23:22" && fmtDayTime("x") === "–" && fmtDay("2026-11-05") === "5 Nov 2026" && fmtDay(null) === "–");
    const now = Date.parse("2026-11-20T01:25:00Z") / 1000, day = (d: string) => Date.parse(d + "T00:00:00Z") / 1000;
    ck("a move tapped in the list opens on the shortest daily view that holds its day: 3M, 12M, 36M, then 5Y and 10Y (A-25)", periodHolding(day("2026-09-14"), now) === "3M" && periodHolding(day("2026-08-20"), now) === "3M" && periodHolding(day("2026-08-19"), now) === "12M" && periodHolding(day("2025-11-20"), now) === "12M" && periodHolding(day("2025-11-19"), now) === "36M" && periodHolding(day("2023-10-01"), now) === "5Y" && periodHolding(day("2018-01-01"), now) === "10Y");
    const ranges = /RANGES: Record<string, number> = \{([^}]*)\}/.exec(readText(new URL("../supabase/functions/_shared/assets.ts", import.meta.url), "utf8"))?.[1] ?? "";
    const server = Object.fromEntries([...ranges.matchAll(/"(\w+)":\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
    ck("every period the page offers past a day is one the server sends, over the same number of days (5Y and 10Y included)", Object.entries(PERIOD_DAYS).filter(([k]) => k !== "1D").every(([k, d]) => server[k] === d) && server["5Y"] === 1827 && server["10Y"] === 3653, server);
  }

  console.log("\n[T] one precision per instrument, one date format, one word per idea (I-5)");
  {
    // D-36: a figure that rounds to zero at the precision shown carries no sign
    ck("a change that rounds to zero has no sign: 0.0%, 0.00%, 0.0bp, 0.0σ; a real one keeps it", fmtPct(-0.04, 1) === "0.0%" && fmtPct(0.004) === "0.00%" && fmtPct(-0.05, 1) === "-0.1%" && fmtPct(0.06, 1) === "+0.1%" && fmtChg(-0.0004, 3, true) === "0.0bp" && fmtChg(-0.0006, 3, true) === "-0.1bp" && fmtSigma(-0.04) === "0.0σ" && fmtSigma(2.66) === "+2.7σ" && fmtNum(-0.0001, 2) === "0.00" && fmtNum(-1234.5, 1) === "-1,234.5");
    ck("the same on the stock page's own figures (a true minus there): 0.0, never −0.0; a plus only where asked", fmtPc(-0.04) === "0.0%" && fmtPc(-0.04, true) === "0.0%" && fmtPc(3.21, true) === "+3.2%" && fmtPc(3.21) === "3.2%" && fmtPc(-3.21) === "\u22123.2%" && fmtRatio(-0.04, true) === "0.0" && fmtPp(-0.04) === "0.0" && fmtPp(-0.6) === "\u22120.6" && fmtPp(1.26) === "+1.3" && fmtSigned(null, 1) === "–");
    ck("a zero at the precision shown is not coloured (grey, not red); a real move is", signCls(-0.04, 1) === "" && signCls(-0.04, 2) === "dn" && signCls(-0.04) === "dn" && signCls(0.06, 1) === "up" && signCls(0) === "" && signCls(null, 1) === "");
    // D-05: one precision per instrument, a yield in %
    ck("a level with the instrument's own decimals, \"%\" after a yield: USD/JPY 158.400, EUR/USD 1.1143, the Nikkei 57,000.00, UST 2Y 4.510%", fmtLevel(158.4, 3) === "158.400" && fmtLevel(1.1143, 4) === "1.1143" && fmtLevel(57000, 2) === "57,000.00" && fmtLevel(4.51, 3, true) === "4.510%" && fmtLevel(null, 3, true) === "–");
    ck("a stock by one rule everywhere: two decimals under 1,000, none from 1,000; without the instruments row a pair 3 (4 under 10) and a yield 3", stockDecimals(182.44) === 2 && stockDecimals(3120.5) === 0 && stockDecimals(null) === 2 && fallbackDecimals(158.21, "fx") === 3 && fallbackDecimals(1.11, "fx") === 4 && fallbackDecimals(4.8, "yield") === 3 && fallbackDecimals(57434, "other") === 0);
    ck("an axis uses the fewest decimals its ticks need, never more than the instrument's: 159.5 / 159.0 under a 158.400 line", axisDecimals(0.5, 3) === 1 && axisDecimals(0.25, 3) === 2 && axisDecimals(2500, 2) === 0 && axisDecimals(0.001, 3) === 3 && axisDecimals(0.0005, 3) === 3 && axisDecimals(0.1, 0) === 0 && axisDecimals(NaN, 2) === 2);
    // D-16: one date format, one time format
    const now = new Date("2026-11-20T01:25:00Z");   // 09:25 in Singapore
    ck("a date of the data is \"19 Nov 2026\": a plain date as written, a time in Singapore; \"–\" for none", fmtDate("2026-11-19") === "19 Nov 2026" && fmtDate("2026-11-05") === "5 Nov 2026" && fmtDate("2026-11-19T16:30:00Z") === "20 Nov 2026" && fmtDate(Date.parse("2026-11-19T00:00:00Z"), "UTC") === "19 Nov 2026" && fmtDate(null) === "–" && fmtDate("not a date") === "–" && fmtDayMon("2026-11-19") === "19 Nov");
    ck("a session's date is its own: a US close of 18 Nov is 18 Nov, not the 19th it already is in Singapore", fmtDate("2026-11-18") === "18 Nov 2026");
    ck("a time is \"19 Nov 23:18 SGT\"; in a panel that says SGT, \"23:18\" for today and \"19 Nov 23:18\" before", fmtStamp("2026-11-19T15:18:00Z") === "19 Nov 23:18 SGT" && fmtWhen("2026-11-20T00:10:00Z", now) === "08:10" && fmtWhen("2026-11-19T15:18:00Z", now) === "19 Nov 23:18" && dayTime("2026-11-19T15:18:00Z") === "19 Nov 23:18" && fmtStamp(null) === "–" && fmtWhen(undefined, now) === "–");
    ck("never the old forms: no \"11/19\", no \"19-Nov-26\" from any of them", ![fmtStamp("2026-11-19T15:18:00Z"), fmtWhen("2026-11-18T15:18:00Z", now), fmtDate("2026-11-19"), dayTime("2026-11-19T15:18:00Z")].some((x) => /\d{1,2}\/\d{1,2}|\d{2}-[A-Z][a-z]{2}-\d{2}/.test(x)));
    ck("a source's words with a date inside are written the same way", datesIn("As of 2026-11-18, revised 2026-10-29") === "As of 18 Nov 2026, revised 29 Oct 2026" && datesIn("no date") === "no date" && datesIn("2026-13-40") === "2026-13-40");
    ck("a daily chart's axis reads days as \"19 Nov\", months as \"Nov\", years as \"2026\" (uPlot's own was \"11/19\")", TIME_VALUES.every((r) => !String(r[1]).includes("{M}/")) && TIME_VALUES.some((r) => r[0] === 86400 && r[1] === "{D} {MMM}") && TIME_VALUES.some((r) => r[1] === "{YYYY}"));
    ck("a statements column: a year FY3/26; a quarter \"2Q FY3/27\" over two lines; a quarter known by its month \"Sep 2026\" (no day-like 3/27 or Sep 26)", periodName({ kind: "FY", label: "FY3/26" }).full === "FY3/26" && JSON.stringify(periodName({ kind: "Q", label: "2Q 3/27" })) === JSON.stringify({ full: "2Q FY3/27", top: "2Q", sub: "FY3/27" }) && JSON.stringify(periodName({ kind: "Q", label: "Sep 26" })) === JSON.stringify({ full: "Sep 2026", top: "Sep", sub: "2026" }) && fyName("2027-03-31") === "FY3/27" && fyName(null) === "–");
    ck("a quarter's document tip names it the same way", periodDoc({ kind: "Q", label: "1Q 3/27", doc: null, url: "https://example.com/1q.pdf", filed: "2026-08-04" })?.tip === "Open the 決算短信 PDF for 1Q FY3/27, disclosed 4 Aug 2026 \u2197");
    ck("a big move that turned across a new year says the year it came from; within one year, as before", moveParts({ kind: "pk", pct: 31.2, from: "2025-12-19", to: "2026-02-03" }).rest === "from the low of 19 Dec 2025" && moveParts({ kind: "bt", pct: -20, from: "2026-05-25", to: "2026-09-14" }).rest === "from the high of 25 May");
    // D-17: one word per idea, the same on both layouts
    ck("the tabs: MARKETS and RATES & FX (the phone's bar: Markets, Rates)", TAB.market.toUpperCase() === "MARKETS" && TAB.rates.toUpperCase() === "RATES & FX" && TAB_BAR.market === "Markets" && TAB_BAR.rates === "Rates" && TAB.rates === "Rates & FX");
    ck("the glossary's words: FX and Rates for the classes, central banks as written in text, the feed's delay, the earlier curve, the averages", classLabel("Currency") === "FX" && classLabel("Fixed income") === "Rates" && classLabel("Equities") === "Equities" && classLabel(null) === "" && bankName("BOJ") === "BoJ" && bankName("FED") === "Fed" && bankName("PBOC") === "PBoC" && bankName("XYZ") === "XYZ" && delayed(10, true) === "DELAYED ~10m" && delayed(20) === "Delayed ~20m" && dottedLine("20 Nov 2025", "12M") === "dotted line: 20 Nov 2025 (12M ago)" && avgVolume(60) === "Avg daily volume (60d)" && avgTurnoverLabel(20) === "Avg daily turnover (20d)");
    ck("the words later panels will use are written now, once (I-6's σ move, I-20's filings), and none is a second word for one already there", SIGMA_1D === "1D in σ" && MOVERS_SIGMA === "Movers in σ" && SIGMA_MOVE === "σ move" && NEWS_FILINGS === "News & filings" && NEWS === "News" && SIGMA_1M_WORD === "σ vs 1M avg" && new Set([SIGMA_1D, MOVERS_SIGMA, SIGMA_MOVE, SIGMA_1M_WORD]).size === 4);
    ck("a search hit says what it is: \"Tokyo stock · Nikkei 225 · Transportation\", \"US stock\", \"FX\", \"Rates\" (not \"Equity · NK225\" or \"Monitor instrument\")", hitLine({ symbol: "7203.T", kind: "Equity", note: "NK225 · Transportation" }) === "Tokyo stock · Nikkei 225 · Transportation" && hitLine({ symbol: "NVDA", kind: "Equity", note: "SP500 · Information Technology" }) === "US stock · S&P 500 · Information Technology" && hitLine({ symbol: "USDJPY=X", kind: "Currency", note: "Monitor instrument" }) === "FX" && hitLine({ symbol: "^TNX", kind: "Fixed income", note: "Monitor instrument" }) === "Rates" && hitLine({ symbol: "TM", kind: "Equity", note: "NYSE" }) === "US stock · NYSE" && stockKind("0700.HK") === "Hong Kong stock");
    // the watchlist route sends each instrument's decimals (the page reads them; a page from before ignores them)
    const t = { symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", currency: "JPY", source: "yahoo", decimals: 3, last: 158.4, lastAt: "2026-11-20T01:20:00+00:00", pct: { d1: 0.26 }, chg: { d1: 0.41 } };
    ck("the watchlist's row for an instrument carries its decimals; a plain quote's row none (the page's own rule)", watchRowFromTable(t).decimals === 3 && watchRowFromTable({ ...t, decimals: undefined }).decimals === null && watchRowFromTable({ ...t, decimals: 2.5 }).decimals === null && watchRowFromQuote("^IRX", null, null).decimals === null);
  }

  console.log("\n[U] an instrument's own page (I-4): figures in its own units, its calendar, its headlines, and the answer a page from before still reads");
  {
    const D = 86400, day0 = Date.UTC(2021, 0, 4) / 1000;   // a Monday
    // weekdays from day0 on, n of them, each close given by f(i)
    const weekdays = (n: number, f: (i: number) => number) => { const out: Array<{ t: number; c: number }> = []; for (let t = day0, i = 0; out.length < n; t += D) { const wd = new Date(t * 1000).getUTCDay(); if (wd === 0 || wd === 6) continue; out.push({ t, c: f(i++) }); } return out; };
    const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
    // units: a yield in points of its level (bp on the page), a price in per cent
    ck("a change in the instrument's own units: a yield's in points of its level, a price's in per cent; none from a zero or a missing level", change(4.859, 4.907, "yield")!.toFixed(3) === "-0.048" && change(158.4, 158.0, "price")!.toFixed(4) === "0.2532" && change(1, 0, "price") === null && change(null, 1, "yield") === null && change(1, 0, "yield") === 1);
    // realised volatility: a yield's in points a day (and a year), a price's in per cent; its percentile among three years of readings
    const calmThenWild = weekdays(1150, (i) => 2 + (i < 1129 ? (i % 2 ? 0.01 : -0.01) : (i % 2 ? 0.08 : -0.08)));   // 4½ years of ±1bp, then a month of ±8bp
    const v1 = volStat(calmThenWild, 21, "yield");
    const last21 = calmThenWild.slice(-22).map((b, i, a) => (i ? b.c - a[i - 1].c : null)).filter((x): x is number => x != null), m = last21.reduce((a, x) => a + x, 0) / 21, sdRef = Math.sqrt(last21.reduce((a, x) => a + (x - m) ** 2, 0) / 20);
    ck(`a yield's realised volatility over 21 sessions is the standard deviation of its daily changes, in points (page: ${(v1.day! * 100).toFixed(1)} bp/day, ${Math.round(v1.ann! * 100)} bp a year)`, Math.abs(v1.day! - sdRef) < 1e-12 && Math.abs(v1.ann! - sdRef * Math.sqrt(252)) < 1e-12 && v1.day! * 100 > 10, { day: v1.day, sdRef });
    ck("after a calm 4½ years, a wild month stands at the top of three years of readings (100th percentile); the 12-month window, still mostly calm, lower", v1.pctl === 100 && volStat(calmThenWild, 252, "yield").pctl! === 100 && volStat(calmThenWild, 63, "yield").pctl! > 90, { m1: v1.pctl, m3: volStat(calmThenWild, 63, "yield").pctl, m12: volStat(calmThenWild, 252, "yield").pctl });
    const wildThenCalm = weekdays(1150, (i) => 100 * Math.exp(i < 1120 ? (i % 2 ? 0.02 : 0) : (i % 2 ? 0.001 : 0)));
    const vp = volStat(wildThenCalm, 21, "price");
    const lr = wildThenCalm.slice(-22).map((b, i, a) => (i ? Math.log(b.c / a[i - 1].c) : null)).filter((x): x is number => x != null), mr = lr.reduce((a, x) => a + x, 0) / 21, sdr = Math.sqrt(lr.reduce((a, x) => a + (x - mr) ** 2, 0) / 20);
    ck(`a price's realised volatility is a yearly per cent of its log returns (${vp.ann!.toFixed(2)}% ann.); a calm last month stands at the bottom (${vp.pctl!.toFixed(1)}th percentile)`, Math.abs(vp.ann! - sdr * Math.sqrt(252) * 100) < 1e-9 && Math.abs(vp.day! - sdr * 100) < 1e-9 && vp.pctl! < 2, vp);
    const short = weekdays(400, (i) => 1 + (i % 2) * 0.01);
    ck("a history shorter than three years of readings gets no percentile (a dash on the page), never one from a shorter stretch", volStat(short, 21, "yield").pctl === null && volStat(short, 21, "yield").day != null && volStat(short, 252, "yield").pctl === null && volStat(weekdays(10, () => 1), 21, "yield").ann === null);
    // the largest rise and fall of twelve months, with both ends' dates
    const sw = weekdays(300, (i) => (i < 100 ? 1.0 : i < 150 ? 1.0 + (i - 99) * 0.01 : i < 230 ? 1.5 - (i - 149) * 0.0075 : 0.9 + (i - 229) * 0.001));
    const s = swings(sw, "yield");
    ck(`the largest rise and fall over 12 months in points with both dates (rise +${s.rise!.chg.toFixed(2)} from ${s.rise!.from} to ${s.rise!.to}; fall ${s.fall!.chg.toFixed(2)} to ${s.fall!.to})`, Math.abs(s.rise!.chg - 0.5) < 1e-9 && s.rise!.to === iso(sw[149].t) && Math.abs(s.fall!.chg + 0.6) < 1e-9 && s.fall!.from === iso(sw[149].t) && s.fall!.to === iso(sw[229].t), s);
    const sp = swings(sw, "price");
    ck("the same for a price, in per cent (+50.0% and −40.0%); a series that only rises has no fall", Math.abs(sp.rise!.chg - 50) < 1e-9 && Math.abs(sp.fall!.chg + 40) < 1e-9 && swings(weekdays(50, (i) => 1 + i), "price").fall === null);
    // the table's statistics for a series it does not keep (fn_table_stats): σ vs 1M avg, the 52W range, vs 200D
    const ss = seriesStats(sw, 1.0, "yield"), c21 = sw.slice(-21).map((b) => b.c), m21 = c21.reduce((a, x) => a + x, 0) / 21, sd21 = Math.sqrt(c21.reduce((a, x) => a + (x - m21) ** 2, 0) / 20);
    ck("σ vs 1M avg, the 52W range (with the dates of its high and low) and vs 200D as the market table works them out", Math.abs(ss.z1m! - (1.0 - m21) / sd21) < 1e-9 && ss.hi === 1.5 && ss.hiDate === iso(sw[149].t) && Math.abs(ss.lo! - 0.9) < 1e-9 && ss.loDate === iso(sw[229].t) && Math.abs(ss.pos52! - (0.1 / 0.6) * 100) < 1e-9 && Math.abs(ss.vs200! - (1.0 - sw.slice(-200).reduce((a, b) => a + b.c, 0) / 200)) < 1e-9, ss);
    // the anchors of each window for a series the table does not keep (fn_table_anchors)
    const an = anchorsOf(sw, sw[sw.length - 1].t + 3 * D);   // a print three days after the last close (a Monday after a Friday close)
    const lastT = sw[sw.length - 1].t;
    ck("the anchors by the table's rule: 1D the last close before the print's day, 1W seven days back, 1M to 36M the same day that many months back; none where the history does not reach", an.d1!.t === lastT && an.w1!.t <= lastT + 3 * D - 7 * D && an.m1!.t <= Date.UTC(new Date((lastT + 3 * D) * 1000).getUTCFullYear(), new Date((lastT + 3 * D) * 1000).getUTCMonth() - 1, new Date((lastT + 3 * D) * 1000).getUTCDate()) / 1000 && an.m36 === null, { d1: iso(an.d1!.t), w1: iso(an.w1!.t), m1: iso(an.m1!.t), m36: an.m36 });
    // the page's figures: a Monitor instrument takes MARKETS' own
    const bars = weekdays(1300, (i) => 4 + Math.sin(i / 40) * 0.6 + (i % 3) * 0.01), lb = bars[bars.length - 1];
    const tnxDef: InstrumentDef = { symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", grp: "rates", market: "NYSE", currency: "USD", decimals: 3, provider: "yahoo" };
    const row: RowLike = { symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", group: "rates", market: "NYSE", currency: "USD", decimals: 3, order: 32, last: 4.859, lastAt: "2026-11-20T01:20:00+00:00", live: true, source: "yahoo",
      closes: { d1: 4.907, w1: 4.912, m1: 5.193, m3: 5.032, m12: 5.738, m36: 6.455 }, closeDates: { d1: "2026-11-19", w1: "2026-11-13", m1: "2026-10-20", m3: "2026-08-20", m12: "2025-11-20", m36: "2023-11-20" },
      pct: { d1: -0.98, w1: -1.08, m1: -6.43, m3: -3.44, m12: -15.32, m36: -24.73 }, chg: { d1: -0.048, w1: -0.053, m1: -0.334, m3: -0.173, m12: -0.879, m36: -1.596 }, z1m: -1.7, pos52: 27, vs200: -0.021 };
    const q: QuoteLike = { name: "CBOE Interest Rate 10 Year T No", quoteType: "INDEX", currency: "USD", exchange: "Cboe Indices", price: 4.86, prevClose: 4.907, time: Date.parse("2026-11-20T01:20:00Z") / 1000, open: 4.9, high: 4.91, low: 4.85, volume: 0 };
    const f = instrumentFigures({ symbol: "^TNX", def: tnxDef, row, quote: q, bars, yieldQuote: false, now: Date.parse("2026-11-20T01:25:00Z") });
    ck("^TNX: a yield; its 1D … 36M are MARKETS' own changes of level (points, bp on the page), never a per cent of the level", f.units === "yield" && f.perf.map((r) => r.h).join() === "1D,1W,1M,3M,12M,36M" && f.perf.every((r, k) => r.chg === Object.values(row.chg!)[k] && r.base === Object.values(row.closes)[k]) && f.day === -0.048 && f.kind === "Rates", f.perf);
    ck("^TNX: σ vs 1M avg, vs 200D and the 52W position are MARKETS'; the session's range comes from the quote; Yahoo Finance; a print", f.z1m === -1.7 && f.vs200 === -0.021 && f.range52.pos === 27 && f.session!.low === 4.85 && f.session!.high === 4.91 && f.source === "Yahoo Finance" && f.asOfKind === "print" && f.asOf === row.lastAt && f.monitor && !f.official, { session: f.session, asOf: f.asOf });
    ck("^TNX: its volatility, 52-week high and low and largest moves are worked out from the stored closes, in points", f.vol.m3.day != null && f.vol.m3.ann! > f.vol.m3.day! && f.range52.hi === Math.max(...bars.slice(-252).map((b) => b.c)) && f.range52.lo === Math.min(...bars.slice(-252).map((b) => b.c)) && Math.abs(f.range52.fromHi! - (4.859 - f.range52.hi!)) < 1e-12 && Math.abs(f.range52.fromLo! - (4.859 - f.range52.lo!)) < 1e-12 && f.history.from === iso(bars[0].t) && f.history.source === "the Monitor's stored daily closes", { hi: f.range52.hi, fromHi: f.range52.fromHi });
    // an official yield: no quote, no session; its last published figure against the one before; its publisher named
    const jgbDef: InstrumentDef = { symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", grp: "rates", market: "TSE", currency: "JPY", decimals: 3, provider: "mof" };
    const jb = weekdays(800, (i) => 1.5 + i * 0.001);
    const fj = instrumentFigures({ symbol: "JGB10Y", def: jgbDef, row: null, quote: null, bars: jb, yieldQuote: false, now: Date.parse("2026-11-20T01:25:00Z") });
    ck(`JGB 10Y (no table row): Japan MOF, published for ${fj.asOf}, its last figure against the one before (${(fj.day! * 100).toFixed(1)}bp), no day's range, a daily-only row for the chart`, fj.official && fj.source === "Japan MOF" && fj.asOfKind === "published" && fj.asOf === iso(jb[jb.length - 1].t) && Math.abs(fj.day! - 0.001) < 1e-9 && fj.prev.date === iso(jb[jb.length - 2].t) && fj.session === null && fj.row.group === "rates" && fj.row.decimals === 3 && fj.row.lastAt === `${iso(jb[jb.length - 1].t)}T00:00:00Z` && !fj.row.live, { asOf: fj.asOf, day: fj.day, prev: fj.prev });
    ck("each official curve's publisher by name: US Treasury, Japan MOF, Bundesbank, ECB, Bank of England, Bank of Canada; anything else Yahoo Finance", publisher("treasury", "UST2Y") === "US Treasury" && publisher("curve", "UST3M") === "US Treasury" && publisher("curve", "JGB30Y") === "Japan MOF" && publisher("curve", "DE10Y") === "Bundesbank" && publisher("curve", "EA10Y") === "ECB" && publisher("curve", "GB10Y") === "Bank of England" && publisher("curve", "CA10Y") === "Bank of Canada" && publisher("yahoo", "^TNX") === "Yahoo Finance" && isOfficial("curve") && isOfficial("mof") && !isOfficial("yahoo"));
    // a plain quote that is not a stock: worked out from its quote and Yahoo's daily bars, today's bar left out of the statistics
    const ib = weekdays(1300, (i) => 5000 + i), qDay = ib[ib.length - 1].t;
    const qi: QuoteLike = { name: "BSE SENSEX", quoteType: "INDEX", currency: "INR", exchange: "BSE", price: 6301.5, prevClose: 6298, time: qDay + 6 * 3600, open: 6299, high: 6310, low: 6290, volume: null };
    const fi = instrumentFigures({ symbol: "^BSESN", def: null, row: null, quote: qi, bars: ib, yieldQuote: false, now: (qDay + 7 * 3600) * 1000 });
    ck("a searched index (no table row): its last print and the quote's previous close for 1D, the bars' closes for the rest; two decimals; Yahoo Finance; an index's class", fi.units === "price" && fi.last === 6301.5 && fi.prev.level === 6298 && Math.abs(fi.day! - (6301.5 / 6298 - 1) * 100) < 1e-9 && fi.perf[1].base === ib[ib.length - 6].c && fi.row.decimals === 2 && fi.row.cls === "Equities" && fi.kind === "Equities" && !fi.monitor && fi.source === "Yahoo Finance" && fi.history.to === iso(ib[ib.length - 2].t), { day: fi.day, w1: fi.perf[1], to: fi.history.to });
    ck("Yahoo's kinds of quote that get an instrument's page: an index, a pair, a future, a coin; a share, an ETF or a fund keeps a stock's page", ["INDEX", "CURRENCY", "FUTURE", "CRYPTOCURRENCY"].every((k) => INSTRUMENT_QUOTES.has(k)) && !INSTRUMENT_QUOTES.has("EQUITY") && !INSTRUMENT_QUOTES.has("ETF") && !INSTRUMENT_QUOTES.has("MUTUALFUND"));
    const fy = instrumentFigures({ symbol: "^IRX", def: null, row: null, quote: { ...qi, name: "13 WEEK TREASURY BILL", price: 3.98, prevClose: 3.999 }, bars: weekdays(300, () => 4), yieldQuote: true, now: (qDay + 7 * 3600) * 1000 });
    ck("a Treasury yield index outside the table (^IRX) is a yield: its day in points, three decimals", fy.units === "yield" && Math.abs(fy.day! - (3.98 - 3.999)) < 1e-12 && fy.row.decimals === 3 && fy.row.group === "rates" && quoteDecimals("price", "Currency", 1.1) === 4 && quoteDecimals("price", "Currency", 158) === 3 && quoteDecimals("price", "Crypto", 90000) === 0);
    // the answer keeps every field the page of before 20 Nov 2026 reads (it shows every name as a stock), filled or empty
    const legacy = { symbol: "^TNX", name: "UST 10Y yield", ...legacyStockFields(f, q, bars) } as Record<string, unknown>;
    const at = (o: unknown, p: string): unknown => p.split(".").reduce<unknown>((x, k) => (x == null ? undefined : (x as Record<string, unknown>)[k]), o);
    const paths = ["symbol", "name", "exchange", "currency", "sector", "industry", "indices", "price", "prevClose", "pct", "asOf", "open", "high", "low", "volume", "mcap", "benchmarks", "perf", "range.hi", "range.hiDate", "range.lo", "range.loDate", "range.fromHi", "range.fromLo", "range.pos", "vol.m1", "vol.m3", "vol.m12", "beta", "drawdown.pct", "drawdown.from", "drawdown.to", "turnover.d20.shares", "turnover.d20.value", "turnover.d60.shares", "turnover.d60.value", "shares.outstanding", "shares.diluted", "shares.dilutedNote", "shares.treasury", "shares.source", "shares.asOf", "short", "moves.eligible", "moves.rows", "earningsAt", "earningsEst", "val.pe", "val.peGuide", "val.pb", "val.yield", "val.yieldGuide", "val.basis", "fin", "finNote"];
    const missing = paths.filter((p) => at(legacy, p) === undefined);
    ck("the answer keeps every field the published page reads (it draws an instrument as it drew it before): none missing, the lists lists, no statements, shares or big moves", missing.length === 0 && Array.isArray(legacy.benchmarks) && Array.isArray(legacy.indices) && Array.isArray(legacy.beta) && Array.isArray(legacy.perf) && (legacy.perf as Array<{ bench: unknown[]; rel: unknown[] }>).every((r) => Array.isArray(r.bench) && Array.isArray(r.rel)) && at(legacy, "moves.eligible") === false && legacy.fin === null && legacy.short === null && legacy.mcap === null && legacy.price === 4.859, { missing });
    // its calendar's currencies and its headlines' words (instrfeed.ts)
    ck("the calendar's currencies: a pair's two (CNH is China's CNY), the dollar index's dollar, otherwise the quoting currency", eventCurrencies("USDJPY=X", "USD/JPY", "JPY").join() === "USD,JPY" && eventCurrencies("JPY=X", null, "JPY").join() === "USD,JPY" && eventCurrencies("CNH=X", "USD/CNH", "CNH").join() === "USD,CNY" && eventCurrencies("EURJPY=X", "EUR/JPY", "JPY").join() === "EUR,JPY" && eventCurrencies("DX-Y.NYB", "US Dollar Index (DXY)", "USD").join() === "USD" && eventCurrencies("GC=F", "Gold", "USD").join() === "USD" && eventCurrencies("^STOXX50E", "Euro Stoxx 50", "EUR").join() === "EUR" && eventCurrencies("JGB10Y", "JGB 10Y yield", "JPY").join() === "JPY" && pairOf("^TNX") === null);
    ck("an index future's calendar is its index's country's first, then the currency it is quoted in where that differs (B-04 (b), 20 Nov 2026): the CME's Nikkei 225 future JPY and USD; the yen-quoted one JPY; the US E-minis USD alone", eventCurrencies("NKD=F", "Nikkei 225 future (CME)", "USD").join() === "JPY,USD" && eventCurrencies("NIY=F", "Nikkei 225 Yen future", "JPY").join() === "JPY" && ["ES=F", "NQ=F", "YM=F", "RTY=F"].every((s) => eventCurrencies(s, s, "USD").join() === "USD") && eventCurrencies("NKD=F", null, null).join() === "JPY");
    ck("the words: USD/JPY's are B-04's (yen, BoJ, Bank of Japan) and JPY; a pair without the dollar, both sides'; the dollar index, the dollar's; a yield, its market's and bank's; nothing for an instrument with no rule", newsWords("USDJPY=X", "USD/JPY").join() === "yen,JPY,BoJ,Bank of Japan" && newsWords("EURJPY=X", "EUR/JPY").includes("euro") && newsWords("EURJPY=X", "EUR/JPY").includes("yen") && !newsWords("EURUSD=X").includes("Fed") && newsWords("DX-Y.NYB").includes("Fed") && newsWords("JGB10Y").includes("JGB") && newsWords("GC=F").join() === "gold,bullion" && newsWords("^XYZ").length === 0 && newsWords("KRW=X").includes("Korean won") && !newsWords("KRW=X").includes("won") && !newsWords("TRY=X").some((w) => /^try$/i.test(w)));
    const re = wordsRegex(newsWords("USDJPY=X"))!;
    ck("whole words, any case: \"Yen firms … the Bank of Japan's next move\", \"BoJ holds\", \"USD/JPY rises\" match; \"Yemen\", \"Bank of Japanese art\", \"bojangles\" do not", re.test("Yen firms as traders weigh the Bank of Japan&#x2019;s next move") && re.test("BoJ holds rates") && re.test("USD/JPY rises") && re.test("the yen's slide") && !re.test("Yemen talks resume") && !re.test("Bank of Japanese art") && !re.test("bojangles") && !re.test("Hayen rises") && wordsRegex([]) === null);
    ck("the database's form of the same rule: PostgreSQL's word edges, no backslash (a query string keeps it as written), the words in lower case", wordsPg(["yen", "JPY", "BoJ", "Bank of Japan"]) === "[[:<:]](yen|jpy|boj|bank of japan)[[:>:]]" && !wordsPg(newsWords("^GSPC"))!.includes("\\") && wordsPg(newsWords("^GSPC"))!.includes("s&p 500") && wordsPg([]) === null);
    const hl = [{ title: "Yen slides", publishedAt: "2026-11-19T01:00:00Z" }, { title: "Oil climbs", publishedAt: "2026-11-19T03:00:00Z" }, { title: "BoJ meets", publishedAt: "2026-11-19T02:00:00Z" }, { title: "Yen again", publishedAt: "2026-11-18T02:00:00Z" }];
    ck("the matching headlines newest first, at most the number asked for", matchHeadlines(hl, ["yen", "BoJ"]).map((h) => h.title).join("|") === "BoJ meets|Yen slides|Yen again" && matchHeadlines(hl, ["yen", "BoJ"], 2).length === 2 && matchHeadlines(hl, []).length === 0);
    const ev: EventRow[] = [{ id: 1, at: "2026-11-20T00:00:00Z", country: "US", currency: "USD", title: "US CPI", impact: "High", forecast: null, previous: null, actual: null }, { id: 2, at: "2026-11-19T00:00:00Z", country: "JPY", currency: null, title: "JP CPI (ForexFactory)", impact: "High", forecast: null, previous: null, actual: null }, { id: 3, at: "2026-11-19T06:00:00Z", country: "EUR", currency: "EUR", title: "EUR ZEW", impact: "High", forecast: null, previous: null, actual: null }, { id: 4, at: "2026-12-30T00:00:00Z", country: "US", currency: "USD", title: "Too far", impact: "High", forecast: null, previous: null, actual: null }];
    ck("the calendar's rows of the currencies within the window, in time order: a FXStreet row by its currency, a ForexFactory row by the code in its country", eventsFor(ev, ["USD", "JPY"], "2026-11-15T00:00:00Z", "2026-11-28T00:00:00Z").map((e) => e.id).join() === "2,1" && srvEventCcy(ev[1]) === "JPY" && eventCcy(ev[0]) === "USD");
    // the page's words and figures (web/src/lib/instrument.ts)
    ck("written as MARKETS writes them: a yield's day \"-4.8bp\", a large move \"-160bp\", a price's \"+0.26%\"; the colour by the precision shown", instrMove(-0.048, "yield") === "-4.8bp" && instrMove(-1.596, "yield") === "-160bp" && instrMove(0.26, "price") === "+0.26%" && moveCls(-0.048, "yield") === "dn" && moveCls(0.0004, "yield") === "" && distText(-0.883, "yield") === "-88.3bp" && distText(-11.47, "price") === "-11.5%" && distCls(0.0001, "price") === "");
    const vy = volLine({ m1: { day: 0.048, ann: 0.048 * Math.sqrt(252), pctl: 76.4, since: "2023-11-20" }, m3: { day: 0.049, ann: 0.049 * Math.sqrt(252), pctl: 19.2, since: null }, m12: { day: null, ann: null, pctl: null, since: null } }, "yield");
    const vpr = volLine({ m1: { day: 0.6, ann: 9.04, pctl: 85, since: null }, m3: { day: 0.5, ann: 8.9, pctl: null, since: null }, m12: { day: 0.4, ann: 7.8, pctl: 41, since: null } }, "price");
    ck(`realised volatility as the designer writes it: "${vy.main}" over "${vy.sub}"; "${vpr.main}" over "${vpr.sub}"`, vy.main === "4.8 / 4.9 / – bp/day" && vy.sub === "76 / 78 / – bp ann. · 3Y pctl 76 / 19 / –%" && vpr.main === "9.0 / 8.9 / 7.8% ann." && vpr.sub === "3Y pctl 85 / – / 41%" && pctlText(null) === "–" && pctlText(71.6) === "72%", { vy, vpr });
    ck("as of: an official yield \"published for 19 Nov 2026\", a close \"close of 19 Nov 2026\", a print in SGT", asOfWords({ asOf: "2026-11-19", asOfKind: "published" }) === "published for 19 Nov 2026" && asOfWords({ asOf: "2026-11-19", asOfKind: "close" }) === "close of 19 Nov 2026" && asOfWords({ asOf: "2026-11-19T15:18:00Z", asOfKind: "print" }) === "19 Nov 23:18 SGT" && asOfWords({ asOf: null, asOfKind: null }) === "–");
    ck("an official yield's chart offers the daily periods only (3M to 10Y); any other the whole list", periodsOf({ official: true }).join() === "3M,12M,36M,5Y,10Y" && DAILY_PERIODS.length === 5 && periodsOf({ official: false }).includes("1D") && periodsOf({ official: false }).includes("10Y"));
    ck("the last print and the day from the chart's row, as MARKETS has them: a yield's day the change of its level, a price's the table's per cent", lastAndDay({ last: 4.859, closes: { d1: 4.907 }, pct: { d1: -0.98 } }, "yield").day!.toFixed(3) === "-0.048" && lastAndDay({ last: 158.4, closes: { d1: 158 }, pct: { d1: 0.25 } }, "price").day === 0.25);
    ck("an answer with `instrument` is an instrument's page; a stock's, or a server's from before, is not", isInstrumentPage({ ...(legacy as object), instrument: f } as never) && !isInstrumentPage(legacy as never) && !isInstrumentPage(null));
    ck("its calendar in words: \"USD and JPY\"; the source's name as NEWS gives it; an empty list says what to widen", ccyWords(["USD", "JPY"]) === "USD and JPY" && ccyWords(["EUR"]) === "EUR" && calSource([{ source: "fxstreet" }]) === "FXStreet" && calSource([]) === "" && noEvents(["USD", "JPY"], "high") === "No High-impact USD and JPY events from five days back to eight days ahead: Impact All shows the rest." && /Japan MOF publishes this yield once a day/.test(sourceNote({ official: true, monitor: true, source: "Japan MOF", history: { from: "2016-01-04", to: null, n: 0, source: "" } })));
    // the NEWS calendar's Currency picker (B-12)
    const cal = [{ id: 1, at: "2026-11-20T00:00:00Z", country: "JP", currency: "JPY", title: "JP CPI", impact: "High" as const, forecast: null, previous: null, actual: null }, { id: 2, at: "2026-11-20T01:00:00Z", country: "US", currency: "USD", title: "US CPI", impact: "High" as const, forecast: null, previous: null, actual: null }, { id: 3, at: "2026-11-20T02:00:00Z", country: "NZ", currency: "NZD", title: "NZ retail", impact: "Medium" as const, forecast: null, previous: null, actual: null }, { id: 4, at: "2026-11-20T03:00:00Z", country: "EUR", currency: "EUR", title: "EUR ZEW", impact: "Medium" as const, forecast: null, previous: null, actual: null }];
    const jp = calendarRows(cal, "all", "major", "JPY");
    ck("filtering by JPY shows only Japan's events (B-12); the choices are the currencies the Countries pick leaves, the majors first in B's order", jp.events.map((e) => e.country).join() === "JP" && jp.ccy === "JPY" && jp.ccys.join() === "All,USD,EUR,JPY" && currencyOptions(cal).join() === "All,USD,EUR,JPY,NZD");
    ck("a currency the Countries pick no longer offers reads as All; Impact still applies within a currency", calendarRows(cal, "all", "major", "NZD").ccy === "All" && calendarRows(cal, "all", "all", "NZD").events.map((e) => e.id).join() === "3" && calendarRows(cal, "high", "all", "EUR").events.length === 0);
    // the local copy's stand-in words are the server's (so the designer and the PMs see the real rule)
    ck(`the mock's words for its ${Object.keys(MOCK_WORDS).length} instruments are the server's, word for word; and its calendar currencies`, Object.entries(MOCK_WORDS).every(([sym, w]) => newsWords(sym).join() === w.join()) && mockCcys("USDJPY=X", "USD/JPY", "JPY").join() === eventCurrencies("USDJPY=X", "USD/JPY", "JPY").join() && mockCcys("DX-Y.NYB", "US Dollar Index (DXY)", "USD").join() === "USD" && mockCcys("GC=F", "Gold", "USD").join() === "USD" && ["NKD=F", "ES=F", "NQ=F", "YM=F", "RTY=F"].every((s) => mockCcys(s, s, "USD").join() === eventCurrencies(s, s, "USD").join()), Object.entries(MOCK_WORDS).filter(([sym, w]) => newsWords(sym).join() !== w.join()).map(([sym]) => sym));
  }

  console.log("\n[V] fixes after the check (20 Nov 2026): a date for a figure with no time of day, the zone on a tile, the worked-out mark, and the page's reads run against a stand-in database");
  {
    // R2B-01, R2B-06: the chart tile's stamp and the MARKETS tooltips
    const now = new Date("2026-11-20T06:00:00Z");   // 14:00 in Singapore
    const jgb = { symbol: "JGB10Y", lastAt: "2026-11-19T00:00:00Z", live: false, source: "mof" };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    ck(`an official yield, which the table stamps at midnight UTC, shows the date it was published for, never "19 Nov 08:00" ("${tileStamp(jgb, now).label} ${tileStamp(jgb, now).text}", "${tileStamp(jgb, now).tip}")`, same(tileStamp(jgb, now), { label: "PUBLISHED", text: "19 Nov 2026", tip: "Japan MOF · published for 19 Nov 2026" }) && rowAsOfTitle(jgb, now) === "Japan MOF · published for 19 Nov 2026");
    ck("each official curve's publisher: UST2Y the US Treasury, UST3M too (a curve), the Bund the Bundesbank; a row with no provider (a stock's page) Yahoo Finance", tileStamp({ symbol: "UST2Y", lastAt: "2026-11-19T00:00:00Z", live: false, source: "treasury" }, now).tip === "US Treasury · published for 19 Nov 2026" && rowSource({ symbol: "UST3M", source: "curve" }) === "US Treasury" && rowSource({ symbol: "DE10Y", source: "curve" }) === "Bundesbank" && rowSource({ symbol: "7203.T" }) === "Yahoo Finance" && rowSource({ symbol: "XX", source: "curve" }) === "official yield curve");
    const missing = { symbol: "^HSI", lastAt: "2026-11-19T00:00:00Z", live: false, source: "yahoo" };
    ck("an instrument whose quote is missing (the table falls back to its booked close) shows that close's date, not a time", same(tileStamp(missing, now), { label: "CLOSED", text: "19 Nov 2026", tip: "Yahoo Finance · close of 19 Nov 2026" }));
    const today = { symbol: "USDJPY=X", lastAt: "2026-11-20T05:35:00+00:00", live: true, source: "yahoo" }, before = { ...today, lastAt: "2026-11-19T07:35:00+00:00", live: false };
    ck(`a print keeps its time, now with its zone, the tile's panel not saying SGT ("${tileStamp(today, now).text}", "${tileStamp(before, now).text}")`, same(tileStamp(today, now), { label: "LIVE", text: "13:35 SGT", tip: "Yahoo Finance · last print 20 Nov 2026 13:35 SGT" }) && same(tileStamp(before, now), { label: "CLOSED", text: "19 Nov 15:35 SGT", tip: "Yahoo Finance · last print 19 Nov 2026 15:35 SGT" }) && tileStamp({ symbol: "NVDA", lastAt: "2026-11-20T05:35:00+00:00", live: false }, now).tip === "Yahoo Finance · last print 20 Nov 2026 13:35 SGT");
    ck("no as-of: a dash; a figure with only a date never gets a clock time", tileStamp({ symbol: "X", lastAt: null, live: false, source: "yahoo" }, now).text === "–" && ![jgb, missing].some((r) => /\d{2}:\d{2}/.test(tileStamp(r, now).text) || /\d{2}:\d{2}/.test(tileStamp(r, now).tip)));

    // R2B-05: the worked-out mark on an instrument's KEY DATA, and the line under it
    const hist = { from: "2021-11-26", to: "2026-11-19", n: 1300, source: "x" };
    ck("† marks the 52-week high and low, the distance from them, realised volatility and the largest moves; σ vs 1M avg and vs 200D only where MARKETS does not carry the name", WORKED === "†" && (["range52", "fromHiLo", "vol", "rise", "fall"] as const).every((k) => workedOut({ monitor: true }, k) && workedOut({ monitor: false }, k)) && !workedOut({ monitor: true }, "z1m") && !workedOut({ monitor: true }, "vs200") && workedOut({ monitor: false }, "z1m") && workedOut({ monitor: false }, "vs200"));
    ck("the line under KEY DATA names what the figures were worked out from and over which dates: an official yield's publisher, the closes the Monitor stores, or Yahoo's own", workedLine({ official: true, monitor: true, source: "Japan MOF", history: hist }) === "† worked out here from Japan MOF's published daily yields, 26 Nov 2021 – 19 Nov 2026; the other figures as on MARKETS." && workedLine({ official: false, monitor: true, source: "Yahoo Finance", history: hist }) === "† worked out here from the daily closes the Monitor stores from Yahoo Finance, 26 Nov 2021 – 19 Nov 2026; the other figures as on MARKETS." && workedLine({ official: false, monitor: false, source: "Yahoo Finance", history: hist }) === "† worked out here from Yahoo Finance's daily closes, 26 Nov 2021 – 19 Nov 2026." && workedLine({ official: false, monitor: false, source: "Yahoo Finance", history: { ...hist, from: null, to: null } }) === "† worked out here from Yahoo Finance's daily closes.");
    ck("PERFORMANCE's line says whose its changes are; the worked-out figures are KEY DATA's to name", perfNote({ official: false, monitor: true, source: "Yahoo Finance" }) === "The same figures as MARKETS (Yahoo Finance)." && /^Japan MOF publishes this yield once a day/.test(perfNote({ official: true, monitor: true, source: "Japan MOF" })) && /by the rules of the MARKETS table\.$/.test(perfNote({ official: false, monitor: false, source: "Yahoo Finance" })) && !/worked out/i.test(perfNote({ official: false, monitor: true, source: "Yahoo Finance" })));

    // R2B-03: the server's reads (supabase/functions/_shared/pagefeed.ts), run against a stand-in database that records
    // each query, as supabase-js builds it, and answers it
    type Asked = { table: string; ops: Array<[string, unknown[]]> };
    const stub = (answer: (a: Asked) => { data: unknown; error: { message: string } | null }) => {
      const asked: Asked[] = [];
      const db: Db = { from(table: string) {
        const a: Asked = { table, ops: [] }; asked.push(a);
        // every call returns the same chain; awaiting it answers the query as built so far
        const b: unknown = new Proxy({}, { get: (_t, k) => (k === "then" ? (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(() => answer(a)).then(ok, bad) : (...args: unknown[]) => { a.ops.push([String(k), args]); return b; }) });
        return b;
      } };
      return { db, asked };
    };
    const opOf = (a: Asked | undefined, name: string): unknown[][] => (a ? a.ops.filter((o) => o[0] === name).map((o) => o[1]) : []);
    const has = (a: Asked | undefined, name: string, ...args: unknown[]) => opOf(a, name).some((x) => JSON.stringify(x) === JSON.stringify(args));
    const T0 = Date.parse("2026-11-20T01:25:00Z"), ago = (d: number) => new Date(T0 - d * 86400e3).toISOString(), ahead = (d: number) => new Date(T0 + d * 86400e3).toISOString();
    const NEWS_ROWS = [
      { id: 1, published_at: "2026-11-19T23:00:00Z", source: "Nikkei Asia", title: "Yen firms as the Bank of Japan meets", url: "https://example.com/1", category: "FX" },
      { id: 2, published_at: "2026-11-19T22:00:00Z", source: "CNBC", title: "Hayen Corp shares rise", url: "https://example.com/2", category: null },
      { id: 3, published_at: "2026-11-18T03:00:00Z", source: "WSJ", title: "BoJ holds rates", url: "https://example.com/3", category: "Macro" },
      { id: 4, published_at: "2026-11-19T21:00:00Z", source: "FT", title: "Bojangles sales climb", url: "https://example.com/4", category: null },
    ];
    const ALERT_ROWS = [{ id: 9, at: "2026-11-19T06:00:00Z", kind: "index", pct: -3.2, market: "TSE", msg: "USD/JPY alert (stand-in)", url: null }];
    const EVENTS = [
      { id: 11, at: ahead(1), country: "US", currency: "USD", title: "US CPI", impact: "High", forecast: null, previous: null, actual: null },
      { id: 12, at: ago(1), country: "JPY", currency: null, title: "JP CPI (ForexFactory)", impact: "High", forecast: null, previous: null, actual: null },
      { id: 13, at: ahead(2), country: "EU", currency: "EUR", title: "EZ PMI", impact: "Medium", forecast: null, previous: null, actual: null },
      { id: 14, at: ago(9), country: "US", currency: "USD", title: "too old", impact: "High", forecast: null, previous: null, actual: null },
    ];
    const D = 86400, closes: Array<{ d: string; close: number }> = [];
    for (let t = Math.floor(T0 / 1000 / D) * D - 1400 * D, i = 0; t < T0 / 1000 - D / 2; t += D) { const wd = new Date(t * 1000).getUTCDay(); if (wd === 0 || wd === 6) continue; closes.push({ d: new Date(t * 1000).toISOString().slice(0, 10), close: 1.5 + Math.sin(i++ / 30) * 0.3 }); }
    const jgbRow: RowLike = { symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", group: "rates", market: "TSE", currency: "JPY", decimals: 3, order: 34, last: closes[closes.length - 1].close, lastAt: `${closes[closes.length - 1].d}T00:00:00Z`, live: false, source: "mof",
      closes: { d1: closes[closes.length - 2].close }, closeDates: { d1: closes[closes.length - 2].d }, pct: {}, chg: {}, z1m: 0.4, pos52: 61, vs200: 0.02 };
    const DEFS: Record<string, InstrumentDef> = {
      JGB10Y: { symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", grp: "rates", market: "TSE", currency: "JPY", decimals: 3, provider: "mof" },
      "USDJPY=X": { symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", grp: "fx", market: "FX", currency: "JPY", decimals: 3, provider: "yahoo" },
    };
    let refusePattern = false, failAlerts = false;
    const answer = (a: Asked): { data: unknown; error: { message: string } | null } => {
      if (a.table === "instruments") return { data: DEFS[opOf(a, "eq")[0]?.[1] as string] ?? null, error: null };
      if (a.table === "snapshots") return { data: { payload: { rows: [jgbRow, { ...jgbRow, symbol: "UST2Y", source: "treasury" }] } }, error: null };
      if (a.table === "prices_daily") { const [from, to] = opOf(a, "range")[0] as [number, number]; return { data: closes.slice(from, to + 1), error: null }; }
      if (a.table === "econ_events") return { data: EVENTS, error: null };
      if (a.table === "news_items") return refusePattern && opOf(a, "filter").length ? { data: null, error: { message: "invalid regular expression (stand-in)" } } : { data: NEWS_ROWS, error: null };
      if (a.table === "alerts") return failAlerts ? { data: null, error: { message: "permission denied (stand-in)" } } : { data: ALERT_ROWS, error: null };
      return { data: null, error: { message: `no such table here: ${a.table}` } };
    };
    // a stock's NEWS
    {
      const { db, asked } = stub(answer);
      const f = await feedFor(db, "7203.T", T0);
      const nw = asked.find((a) => a.table === "news_items"), al = asked.find((a) => a.table === "alerts");
      ck(`a stock's NEWS asks for the headlines whose tickers name it, of ${FEED_DAYS} days, newest first, at most ${FEED_NEWS}`, has(nw, "select", "id,published_at,source,title,url,category") && has(nw, "overlaps", "tickers", ["7203.T"]) && has(nw, "gte", "published_at", ago(90)) && has(nw, "order", "published_at", { ascending: false }) && has(nw, "limit", FEED_NEWS), nw);
      ck(`and the alerts on it over the same days, newest first (by time, then by id), at most ${FEED_ALERTS}`, has(al, "eq", "symbol", "7203.T") && has(al, "gte", "at", ago(90)) && JSON.stringify(opOf(al, "order")) === JSON.stringify([["at", { ascending: false }], ["id", { ascending: false }]]) && has(al, "limit", FEED_ALERTS), al);
      ck("the rows in the page's shape: a headline's time, publisher, title, address and category; an alert's kind, move, market and message", f.days === 90 && f.news.length === 4 && f.news[0].publishedAt === "2026-11-19T23:00:00Z" && f.news[0].source === "Nikkei Asia" && f.news[1].category === null && f.alerts[0].kind === "index" && f.alerts[0].pct === -3.2 && f.alerts[0].url === null && !("error" in f) && asked.length === 2, f);
      failAlerts = true; const g = await feedFor(stub(answer).db, "7203.T", T0); failAlerts = false;
      ck(`a table that cannot be read says which and why, and the other's rows still come ("${g.error}")`, g.error === "alerts: permission denied (stand-in)" && g.news.length === 4 && g.alerts.length === 0, g);
    }
    // an instrument's headlines: one pattern, or plain parts where the pattern is refused; whole words either way
    {
      const words = newsWords("USDJPY=X", "USD/JPY");
      let { db, asked } = stub(answer);
      const f = await instrFeed(db, "USDJPY=X", words, T0);
      const nw = asked.filter((a) => a.table === "news_items");
      ck("an instrument's headlines are asked for with the words as one pattern, whole words any case, over 30 days", nw.length === 1 && has(nw[0], "filter", "title", "imatch", "[[:<:]](yen|jpy|boj|bank of japan)[[:>:]]") && has(nw[0], "gte", "published_at", ago(30)) && has(nw[0], "limit", 150) && has(nw[0], "order", "published_at", { ascending: false }), nw);
      ck(`what comes back is held to the same rule: "Hayen" and "Bojangles" are not the yen or the BoJ (${f.news.map((n) => n.title).join(" | ")})`, f.news.map((n) => n.id).join() === "1,3" && f.alerts.length === 1 && f.days === 30 && !("error" in f), f.news);
      refusePattern = true; ({ db, asked } = stub(answer)); const g = await instrFeed(db, "USDJPY=X", words, T0); refusePattern = false;
      const both = asked.filter((a) => a.table === "news_items");
      ck("a database that refuses the pattern is asked again with each word as a plain part of the title, and the page keeps whole words only", both.length === 2 && has(both[1], "or", "title.ilike.*yen*,title.ilike.*JPY*,title.ilike.*BoJ*,title.ilike.*Bank of Japan*") && has(both[1], "limit", 300) && g.news.map((n) => n.id).join() === "1,3" && !("error" in g), { both, news: g.news });
      ({ db, asked } = stub(answer)); const none = await instrFeed(db, "X=F", [], T0);
      ck("an instrument with no words asks for no headlines, only its alerts", none.news.length === 0 && asked.every((a) => a.table === "alerts"), asked);
    }
    // its calendar: the rows of its currencies, a FXStreet row by its currency, a ForexFactory row by its country
    {
      const { db, asked } = stub(answer);
      const e = await eventsOf(db, ["USD", "JPY"], T0), ev = asked[0];
      ck(`the calendar is asked for both kinds of row of USD and JPY, five days back and eight ahead (${e.rows.map((r) => r.title).join(" | ")})`, has(ev, "or", "currency.in.(USD,JPY),country.in.(USD,JPY)") && has(ev, "gte", "at", ago(5)) && has(ev, "lte", "at", ahead(8)) && has(ev, "limit", 600) && e.rows.map((r) => r.id).join() === "12,11" && e.from === ago(5) && e.to === ahead(8), { ev, rows: e.rows });
      const { db: db2, asked: asked2 } = stub(answer);
      ck("no currency, no calendar query", (await eventsOf(db2, [], T0)).rows.length === 0 && asked2.length === 0);
    }
    // which page a symbol gets, and what each asks for
    {
      const calls = { quote: [] as string[], quoteFor: [] as string[], bars: [] as string[] };
      const deps = (db: Db, q: Partial<QuoteLike> & { quoteType: string | null } = { quoteType: "EQUITY" }) => ({
        db, now: T0,
        quote: async (sym: string) => { calls.quote.push(sym); return { name: "USD/JPY", quoteType: "CURRENCY", currency: "JPY", exchange: "CCY", price: 158.4, prevClose: 158.0, time: T0 / 1000 - 300, open: 158.1, high: 158.6, low: 157.9, volume: 0 } as QuoteLike; },
        quoteFor: async (sym: string) => { calls.quoteFor.push(sym); return { name: sym, currency: "EUR", exchange: "STOXX", price: 5612, prevClose: 5600, time: T0 / 1000 - 300, open: 5601, high: 5620, low: 5590, volume: null, ...q } as QuoteLike; },
        dailyBars: async (sym: string) => { calls.bars.push(sym); return closes.map((c) => ({ t: Date.parse(c.d + "T00:00:00Z") / 1000, c: 5000 + c.close * 100 })); },
      });
      const OTHER = ["asset_cache", "move_causes", "constituents", "jp_short_positions", "short_volume"];
      let s = stub(answer);
      const j = await pageOrQuote(deps(s.db), "JGB10Y");
      const ji = "instrument" in j ? j.instrument : null, tables = [...new Set(s.asked.map((a) => a.table))].sort().join();
      ck(`JGB 10Y (a Monitor instrument from an official curve): its instruments row is read (${INSTRUMENT_COLS.split(",").length} columns), no quote is asked for, and the page has its own figures`, has(s.asked[0], "select", INSTRUMENT_COLS) && has(s.asked[0], "eq", "symbol", "JGB10Y") && opOf(s.asked[0], "maybeSingle").length === 1 && calls.quote.length === 0 && calls.quoteFor.length === 0 && calls.bars.length === 0 && !!ji, { asked: s.asked[0], calls });
      ck(`it reads the market table's row, its stored closes (${INSTR_HISTORY_DAYS} days back, a page at a time), its calendar, its headlines and its alerts, and nothing that is a stock's: no EDINET DB store, no big-move queue (${tables})`, tables === "alerts,econ_events,instruments,news_items,prices_daily,snapshots" && !s.asked.some((a) => OTHER.includes(a.table)) && has(s.asked.find((a) => a.table === "snapshots"), "eq", "key", "table") && has(s.asked.find((a) => a.table === "prices_daily"), "gte", "d", new Date(T0 - INSTR_HISTORY_DAYS * 86400e3).toISOString().slice(0, 10)) && has(s.asked.find((a) => a.table === "prices_daily"), "range", 0, 999), tables);
      ck(`its answer: a yield, Japan MOF's, published for ${ji?.instrument.asOf}, its events in yen, the words its headlines were matched by, the table's own last figure; and every field the page of before reads`, !!ji && ji.instrument.units === "yield" && ji.instrument.official && ji.instrument.source === "Japan MOF" && ji.instrument.asOfKind === "published" && ji.instrument.asOf === closes[closes.length - 1].d && ji.instrument.events.ccys.join() === "JPY" && ji.instrument.matched.includes("Bank of Japan") && ji.price === jgbRow.last && ji.instrument.row.source === "mof" && ji.instrument.session === null && ji.instrument.vol.m3.day != null && ji.feed.days === 30 && Array.isArray(ji.benchmarks) && ji.fin === null && ji.moves.eligible === false, ji?.instrument);
      s = stub(answer); const u = await pageOrQuote(deps(s.db), "USDJPY=X"), ui = "instrument" in u ? u.instrument : null;
      ck("USD/JPY (a Monitor instrument with a quote): its quote is asked for once; the day's range is the quote's; its calendar is USD and JPY's", !!ui && calls.quote.join() === "USDJPY=X" && ui.instrument.session?.low === 157.9 && ui.instrument.events.ccys.join() === "USD,JPY" && ui.instrument.events.rows.map((r) => r.id).join() === "12,11" && ui.feed.news.map((n) => n.id).join() === "1,3" && ui.instrument.source === "Yahoo Finance", ui?.instrument.events);
      s = stub(answer); const x = await pageOrQuote(deps(s.db, { quoteType: "INDEX" }), "^STOXX50E"), xi = "instrument" in x ? x.instrument : null;
      ck("an index the Monitor does not follow: its quote decides (an index), its daily bars come from the reader handed in, and neither the market table nor the stored closes are asked", !!xi && calls.quoteFor.join() === "^STOXX50E" && calls.bars.join() === "^STOXX50E" && !s.asked.some((a) => a.table === "snapshots" || a.table === "prices_daily") && xi.instrument.monitor === false && xi.instrument.events.ccys.join() === "EUR" && xi.instrument.units === "price", { asked: s.asked.map((a) => a.table), calls });
      s = stub(answer); const st = await pageOrQuote(deps(s.db, { quoteType: "EQUITY" }), "7203.T");
      ck("a share: its quote is handed back for a stock's page, and nothing else is read here", "stock" in st && st.stock.quoteType === "EQUITY" && s.asked.map((a) => a.table).join() === "instruments" && calls.bars.join() === "^STOXX50E", { asked: s.asked.map((a) => a.table) });
    }
  }

  console.log("\n[W] moves in σ and alerts on them (I-6), a future's contract and its rolls (B-27)");
  {
    const D = 86400, t0 = Date.parse("2026-01-02T00:00:00Z") / 1000;
    // weekdays from 2 Jan 2026, oldest first, as stored closes are dated
    const days: string[] = []; for (let t = t0; days.length < 300; t += D) { const wd = new Date(t * 1000).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(new Date(t * 1000).toISOString().slice(0, 10)); }
    const tOf = (d: string) => Date.parse(d + "T00:00:00Z") / 1000;
    // a made-up price walk: deterministic, about 1% a day
    let v = 100; const walk = days.map((d, i) => { v *= 1 + (((i * 7919) % 97) / 97 - 0.5) * 0.035; return { d, close: Math.round(v * 1e4) / 1e4 }; });
    // the names of a contract and the day a CME session belongs to
    ck("a named contract by CME's month codes: CLF27.NYM is January 2027, NKDZ26.CME December 2026, BZG27.NYM February 2027, ALIG27.CMX February 2027, ZNZ26.CBT December 2026; anything else none", contractName("CLF27.NYM")?.label === "Jan 2027" && contractName("CLF27.NYM")?.code === "CLF27" && contractName("NKDZ26.CME")?.label === "Dec 2026" && contractName("NKDZ26.CME")?.root === "NKD" && contractName("BZG27.NYM")?.ym === "2027-02" && contractName("ALIG27.CMX")?.root === "ALI" && contractName("ZNZ26.CBT")?.root === "ZN" && contractName("ES=F") === null && contractName(null) === null && monthWord("CLZ26.NYM") === "Dec" && isFuture("CL=F") && !isFuture("USDJPY=X"));
    ck("CME's trade date: a session opens at 18:00 New York the evening before (19 Nov 23:30 UTC is 20 Nov's), 20 Nov 12:38 UTC is 20 Nov's, a Saturday stamp is Friday's, Sunday 18:00 New York is Monday's", tradeDate(Date.parse("2026-11-19T23:30:00Z") / 1000) === "2026-11-20" && tradeDate(Date.parse("2026-11-20T12:38:00Z") / 1000) === "2026-11-20" && tradeDate(Date.parse("2026-11-21T15:00:00Z") / 1000) === "2026-11-20" && tradeDate(Date.parse("2026-11-22T23:05:00Z") / 1000) === "2026-11-23" && tradeDate(Date.parse("2026-11-20T21:59:00Z") / 1000) === "2026-11-20");
    // a reading of the quote: the session's record, and a roll when the contract changed since the last session recorded
    const at20 = Date.parse("2026-11-20T12:38:00Z") / 1000;
    const r0 = fromReading({ symbol: "BZ=F", contract: "BZG27.NYM", prevClose: 89.44, at: at20 }, null);
    const r1 = fromReading({ symbol: "BZ=F", contract: "BZG27.NYM", prevClose: 89.44, at: at20 }, { d: "2026-11-20", contract: "BZG27.NYM" });
    const r2 = fromReading({ symbol: "BZ=F", contract: "BZG27.NYM", prevClose: 89.44, at: at20 }, { d: "2026-11-19", contract: "BZF27.NYM" }, "2026-12-31");
    ck("the first reading of a future: its session's record (CME's date, the contract, that contract's own previous close), no roll", !!r0 && r0.record.d === "2026-11-20" && r0.record.contract === "BZG27.NYM" && r0.record.prev_close === 89.44 && r0.roll === null, r0);
    ck("the same contract as the session before: no roll; a new one (BZ=F, 20 Nov 2026, BZF27.NYM to BZG27.NYM, as the probe read it): a roll on that session, measured from the new contract's own close (89.44), to be checked", !!r1 && r1.roll === null && !!r2?.roll && r2.roll.d === "2026-11-20" && r2.roll.from_contract === "BZF27.NYM" && r2.roll.to_contract === "BZG27.NYM" && r2.roll.prev_close === 89.44 && r2.roll.source === QUOTE_SOURCE && !r2.roll.checked && r2.record.expires === "2026-12-31", r2);
    ck("a quote that names no contract, or has no time, records nothing (the σ scan then hears nothing of that future)", fromReading({ symbol: "TIO=F", contract: null, prevClose: 1, at: at20 }, null) === null && fromReading({ symbol: "CL=F", contract: "CLF27.NYM", prevClose: 1, at: null }, null) === null);
    // the session after a roll: on which day did the series change contract? (ZQ=F, 19 Nov 2026)
    const roll: RollRow = { symbol: "ZQ=F", d: "2026-11-19", from_contract: "ZQX26.CBT", to_contract: "ZQF27.CBT", prev_close: 95.83, source: QUOTE_SOURCE, checked: false };
    const next = { d: "2026-11-20", contract: "ZQF27.CBT", prevClose: 95.835 };
    const moved = checkRoll(roll, next, { rollDay: 96.118, before: 96.12, lastBefore: "2026-11-19" });
    const kept = checkRoll(roll, next, { rollDay: 95.835, before: 96.12, lastBefore: "2026-11-19" });
    ck("ZQ=F: the quote moved to January on 19 Nov, but the day's bar was rewritten to November's close (96.118): the next session moves the roll to 20 Nov, measured from January's close of 19 Nov (95.835)", moved.act === "move" && moved.roll.d === "2026-11-20" && moved.roll.prev_close === 95.835 && moved.roll.checked, moved);
    ck("when the series' close on the roll day is the new contract's own, the roll stands and is marked checked; before the next session, or with the roll day not booked, it waits; with sessions missed it stands", kept.act === "keep" && kept.roll.d === "2026-11-19" && kept.roll.checked && checkRoll(roll, { ...next, d: "2026-11-19" }, { rollDay: 96, before: 96, lastBefore: "2026-11-18" }).act === "wait" && checkRoll(roll, next, { rollDay: null, before: 96.12, lastBefore: "2026-11-18" }).act === "wait" && checkRoll(roll, { ...next, d: "2026-11-24" }, { rollDay: 96.118, before: 96.12, lastBefore: "2026-11-23" }).act === "keep");
    // the statistics with the step taken out (B-27's check: "its realised vol and largest fall equal those of the same series with the step taken out")
    const at = walk.length - 40, rd = walk[at].d, step = 1.03;   // a roll 40 sessions back: inside the 63-session windows and the 12 months
    const stepped = walk.map((x, i) => ({ t: tOf(x.d), c: i < at ? x.close : x.close * step }));          // the series as Yahoo's =F gives it: a 3% step at the roll
    const clean = walk.map((x) => ({ t: tOf(x.d), c: x.close * step }));                                 // the same series with the step taken out
    const rolls = [{ d: rd, prevClose: walk[at - 1].close * step }];                                     // the new contract's own close before the roll
    const segs = rollSegments(stepped, rolls);
    ck("a measured roll: the series is set on the new contract's level, one piece, the roll day's change the change within the contract", segs.length === 1 && segs[0].length === stepped.length && segs[0].every((b, i) => Math.abs(b.c - clean[i].c) < 1e-9), segs.map((s) => s.length));
    const vs = volStat(stepped, 63, "price", rolls), vc = volStat(clean, 63, "price"), vn = volStat(stepped, 63, "price");
    const sw = swings(stepped, "price", 12, rolls), sc = swings(clean, "price", 12);
    ck(`its realised vol equals that of the series with the step taken out (${vs.ann?.toFixed(4)}% against ${vc.ann?.toFixed(4)}%; ${vn.ann?.toFixed(4)}% with the step in)`, vs.ann != null && vc.ann != null && Math.abs(vs.ann - vc.ann) < 1e-9 && Math.abs((vn.ann ?? 0) - vc.ann) > 0.05, { vs, vc, vn });
    ck(`its largest rise and fall equal those of the series with the step taken out (fall ${sw.fall?.chg.toFixed(3)}% from ${sw.fall?.from} to ${sw.fall?.to})`, !!sw.fall && !!sc.fall && Math.abs(sw.fall.chg - sc.fall.chg) < 1e-9 && sw.fall.from === sc.fall.from && sw.fall.to === sc.fall.to && !!sw.rise && Math.abs(sw.rise.chg - (sc.rise?.chg ?? 0)) < 1e-9, { sw, sc });
    const cut = rollSegments(stepped, [{ d: rd, prevClose: null }]), vu = volStat(stepped, 63, "price", [{ d: rd, prevClose: null }]);
    const changes = dailyChanges(walk, "price", [{ d: rd, prevClose: null }]);
    ck("a roll whose change of contract is not known cuts the series: no change is measured across it (the day is left out)", cut.length === 2 && cut[0].length === at && cut[1].length === walk.length - at && vu.ann != null && changes.find((c) => c.d === rd)?.chg === null, cut.map((s) => s.length));
    const views = rollViews([{ d: rd, from_contract: "GCZ26.CMX", to_contract: "GCG27.CMX", prev_close: walk[at - 1].close * step, source: "stand-in" }], stepped);
    ck(`a roll as the page shows it: the months and the change of contract (${views[0]?.step?.toFixed(2)}%)`, views.length === 1 && views[0].fromMonth === "Dec 2026" && views[0].toMonth === "Feb 2027" && Math.abs((views[0].step ?? 0) - 3) < 1e-9, views);
    const fi = futuresInfo({ d: "2026-11-20", contract: "CLF27.NYM", expires: "2026-12-21", seen_at: "2026-11-20T12:38:00Z" }, [{ d: "2026-10-21", from_contract: null, to_contract: "CLZ26.NYM", prev_close: null, source: "probe" }, { d: "2026-11-20", from_contract: "CLZ26.NYM", to_contract: "CLF27.NYM", prev_close: 82.44, source: "probe" }], "2026-11-20", [{ t: tOf("2026-11-19"), c: 83.21 }, { t: tOf("2026-11-20"), c: 82.22 }]);
    ck(`CL=F's page, as the probe of 20 Nov left the record: on CLF27 (Jan 2027, expires 21 Dec 2026), last roll 20 Nov from CLZ26 (${fi.lastRoll?.step?.toFixed(2)}%), the record from 21 Oct (rolls before are not known)`, fi.contract === "CLF27.NYM" && fi.month === "Jan 2027" && fi.expires === "2026-12-21" && fi.lastRoll?.d === "2026-11-20" && fi.lastRoll.from === "CLZ26.NYM" && Math.abs((fi.lastRoll.step ?? 0) - (82.44 / 83.21 - 1) * 100) < 1e-9 && fi.knownFrom === "2026-10-21" && fi.rolls.length === 2 && fi.rolls[0].step === null && knownFrom([{ d: "2026-10-21" }], [{ d: "2026-11-20" }]) === "2026-10-21", fi);
    const rdx = rollDay(83.21, 82.44), rdn = rollDay(83.21, null);
    ck("a roll day's 1D (MARKETS): from the new contract's own close, with the change of contract apart; not measured: the series' own, no step", rdx.base === 82.44 && Math.abs((rdx.step ?? 0) - (82.44 / 83.21 - 1) * 100) < 1e-12 && rdn.base === 83.21 && rdn.step === null);
    // σ of daily changes: in per cent for a price, points for a yield; the latest change never in its own yardstick
    const st = sigmaStats(walk, "price"), ch = dailyChanges(walk, "price").map((x) => x.chg as number);
    const sdOf = (xs: number[]) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
    ck(`σ of the last ${SIGMA_N} daily changes in per cent (${st.sd?.toFixed(4)}%), from the close of ${st.from} to that of ${st.to}; and of the ${SIGMA_N} before the newest (${st.sdx?.toFixed(4)}%)`, st.n === 63 && st.nx === 63 && Math.abs((st.sd ?? 0) - sdOf(ch.slice(0, 63))) < 1e-12 && Math.abs((st.sdx ?? 0) - sdOf(ch.slice(1, 64))) < 1e-12 && st.to === walk[walk.length - 1].d && st.from === walk[walk.length - 64].d && st.tox === walk[walk.length - 2].d && st.fromx === walk[walk.length - 65].d, st);
    const ys = walk.map((x) => ({ d: x.d, close: 4 + x.close / 1000 })), sy = sigmaStats(ys, "yield"), cy = dailyChanges(ys, "yield").map((x) => x.chg as number);
    ck(`a yield's in points of its level (${((sy.sd ?? 0) * 100).toFixed(2)}bp a day), never a per cent of it`, Math.abs((sy.sd ?? 0) - sdOf(cy.slice(0, 63))) < 1e-12 && Math.abs(cy[0] - (ys[ys.length - 1].close - ys[ys.length - 2].close)) < 1e-12, sy);
    const sr = sigmaStats(stepped.map((b) => ({ d: new Date(b.t * 1000).toISOString().slice(0, 10), close: b.c })), "price", rolls);
    const sc2 = sigmaStats(clean.map((b) => ({ d: new Date(b.t * 1000).toISOString().slice(0, 10), close: b.c })), "price");
    ck("a future's σ with a roll in its window: the roll day counts its change within the new contract, as the series with the step taken out", walk.length - at < 63 && Math.abs((sr.sd ?? 0) - (sc2.sd ?? 0)) < 1e-9 && sr.n === 63, { sr, sc2 });
    const su = sigmaStats(walk, "price", [{ d: walk[walk.length - 5].d, prevClose: null }]);
    ck(`a roll not measured leaves its day out (${su.n} changes), and a σ needs ${SIGMA_MIN} of the ${SIGMA_N}`, su.n === 62 && usableSd(su.sd, su.n) === su.sd && usableSd(1, SIGMA_MIN - 1) === null && usableSd(0, 63) === null && usableSd(null, 63) === null);
    ck("the day in σ: its change over that σ; none without a σ", Math.abs((zDay(2.7, 1) ?? 0) - 2.7) < 1e-12 && zDay(1, null) === null && zDay(null, 1) === null && zDay(1, 0) === null);
    // σ alerts: what they say, which rows raise them, one per instrument and session
    ck(`the message (the designer's I-6 note): "${sigmaMsg("USD/JPY", "price", 1.9, 2.7, 158.42, 3)}"; a yield's move in bp and its level in % ("${sigmaMsg("UST 10Y yield", "yield", -0.124, -2.6, 4.983, 3)}"); its note "${sigmaNote(63, "2026-11-19", "Yahoo Finance")}"`, sigmaMsg("USD/JPY", "price", 1.9, 2.7, 158.42, 3) === "USD/JPY +1.9% · 2.7σ · 158.420" && sigmaMsg("UST 10Y yield", "yield", -0.124, -2.6, 4.983, 3) === "UST 10Y yield -12.4bp · 2.6σ · 4.983%" && sigmaMsg("EUR/USD", "price", -0.41, -2.5, 1.0984, 4) === "EUR/USD -0.41% · 2.5σ · 1.0984" && sigmaMsg("Nikkei 225 future (CME)", "price", -2.4, -2.1, 56530, 0) === "Nikkei 225 future (CME) -2.4% · 2.1σ · 56,530" && sigmaNote(63, "2026-11-19", "Yahoo Finance") === "σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance" && moveWords(0.004, "price") === "0.00%" && dayWords("2026-11-05") === "5 Nov 2026");
    const row = (o: Record<string, unknown>) => ({ symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", group: "fx", market: "FX", decimals: 3, source: "yahoo", last: 158.42, lastAt: "2026-11-20T03:10:00Z", z1d: 2.7, pct: { d1: 1.9 }, chg: { d1: 2.95 }, zTo: "2026-11-19", zN: 63, ...o }) as Parameters<typeof sigmaCandidate>[0];
    const src = (r: { source?: string | null }) => (r.source === "yahoo" ? "Yahoo Finance" : "Japan MOF"), none = new Set<string>();
    const c1 = sigmaCandidate(row({}), none, src);
    ck(`USD/JPY at 2.7σ: a σ alert, filed under its FX day (${c1?.d}), with its σ, its move, its level, its window and source`, !!c1 && c1.kind === "sigma" && c1.sigma === 2.7 && c1.pct === 1.9 && c1.price === 158.42 && c1.d === "2026-11-20" && c1.msg === "USD/JPY +1.9% · 2.7σ · 158.420" && c1.note === "σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance", c1);
    const jgb = sigmaCandidate(row({ symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", group: "rates", market: "TSE", source: "mof", last: 2.817, lastAt: "2026-11-19T00:00:00Z", z1d: -3.1, pct: { d1: -2.4 }, chg: { d1: -0.069 }, zTo: "2026-11-18" }), none, src);
    ck("an official yield once its day is booked: filed under the day it was published for, its move in bp, its publisher named", !!jgb && jgb.d === "2026-11-19" && jgb.msg === "JGB 10Y yield -6.9bp · 3.1σ · 2.817%" && jgb.pct === null && /Japan MOF$/.test(jgb.note), jgb);
    ck(`not raised: an equity index (it has the ±3% index alert), a move under ${SIGMA_RAISE}σ, a row with no σ`, sigmaCandidate(row({ symbol: "^N225", cls: "Equities", group: "equity", market: "TSE" }), none, src) === null && sigmaCandidate(row({ z1d: 1.99 }), none, src) === null && sigmaCandidate(row({ z1d: null }), none, src) === null && SIGMA_CLASSES.has("Futures") && SIGMA_CLASSES.has("Crypto") && !SIGMA_CLASSES.has("Equities"));
    const gc = row({ symbol: "GC=F", name: "Gold", cls: "Commodities", group: "cmdty", market: "CME", decimals: 2, last: 4074.9, lastAt: "2026-11-20T14:05:00Z", z1d: 2.9, pct: { d1: 3.2 } });
    ck("a future at 2.9σ raises one only when its contract was read this minute (B-27: else a roll could not be told from a move)", sigmaCandidate(gc, none, src) === null && sigmaCandidate(gc, new Set(["GC=F"]), src)?.d === "2026-11-20");
    // B-27, the stand-in roll day: gold's naive 1D across a 3% change of contract reads about 2.9σ; measured within the new contract it is an ordinary day, and raises nothing
    const prev = 3950, prevNew = prev * 1.03, lastGC = prevNew * 1.0021, sdGC = 1.1;
    const naive = zDay((lastGC / prev - 1) * 100, sdGC), within = zDay((lastGC / rollDay(prev, prevNew).base! - 1) * 100, sdGC);
    ck(`a roll day: gold +${((lastGC / prev - 1) * 100).toFixed(2)}% across the change of contract would read ${naive?.toFixed(1)}σ; within the new contract it is +${((lastGC / prevNew - 1) * 100).toFixed(2)}%, ${within?.toFixed(2)}σ, and raises no σ alert`, (naive ?? 0) > SIGMA_LIST && Math.abs(within ?? 9) < 0.5 && sigmaCandidate({ ...gc, z1d: within, pct: { d1: (lastGC / prevNew - 1) * 100 } }, new Set(["GC=F"]), src) === null);
    const stored = new Map([["USDJPY=X|2026-11-20", { sigma: 2.6 }], ["EURUSD=X|2026-11-20", { sigma: -2.9 }]]);
    const eur = { ...c1!, symbol: "EURUSD=X", sigma: -2.7 }, grow = { ...c1!, sigma: 2.7 }, more = { ...c1!, sigma: 2.64 };
    ck("one alert per instrument and session: written when new or when the move has grown (by more than 0.05σ), not when it eases", sigmaWrites([grow], stored).length === 1 && sigmaWrites([more], stored).length === 0 && sigmaWrites([eur], stored).length === 0 && sigmaWrites([{ ...c1!, symbol: "AUDUSD=X" }], stored).length === 1);
    ck("the session of a row: a booked close's own date, a currency pair's FX day, a market's own date otherwise", sessionDay({ symbol: "JGB10Y", market: "TSE", lastAt: "2026-11-19T00:00:00Z" }) === "2026-11-19" && sessionDay({ symbol: "USDJPY=X", market: "FX", lastAt: "2026-11-19T22:30:00Z" }) === "2026-11-20" && sessionDay({ symbol: "USDJPY=X", market: "FX", lastAt: "2026-11-20T22:30:00Z" }) === "2026-11-20" && sessionDay({ symbol: "GC=F", market: "CME", lastAt: "2026-11-20T14:05:00Z" }) === "2026-11-20" && sessionDay({ symbol: "X", market: "CME", lastAt: null }) === null);
    ck("a future's evening print (18:30 New York) is the next session's, as CME dates it: a σ move then is the new day's, not the one before", sessionDay({ symbol: "CL=F", market: "NYMEX", lastAt: "2026-11-19T23:30:00Z" }) === "2026-11-20" && sessionDay({ symbol: "CL=F", market: "NYMEX", lastAt: "2026-11-19T21:30:00Z" }) === "2026-11-19" && sessionDay({ symbol: "ES=F", market: "CME", lastAt: "2026-11-22T23:10:00Z" }) === "2026-11-23");
    ck(`the lists everyone reads show a σ alert from ${SIGMA_LIST}σ (PostgREST "${LISTED_ALERTS}")`, LISTED_ALERTS === "kind.neq.sigma,sigma.gte.2.5,sigma.lte.-2.5" && listed({ kind: "sigma", sigma: -2.5 }) && !listed({ kind: "sigma", sigma: 2.2 }) && listed({ kind: "stock" }) && listed({ kind: "index", sigma: null }));
    // a device's kinds and its σ line (B's correction to B-03; the designer's Notifications window)
    const usd: AlertLite = { id: 31, at: "2026-11-20T03:10:00Z", symbol: "USDJPY=X", name: "USD/JPY", kind: "sigma", pct: 1.9, msg: "USD/JPY +1.9% · 2.7σ · 158.420", sigma: 2.7, note: "σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance", pushedSigma: null };
    const all = new Set<string>(), dev = (sigmaLine: number, kinds: string[] | null = [...DEFAULT_KINDS, "sigma"]) => ({ scope: "all" as const, kinds, sigmaLine });
    ck("B's check: a stand-in 2.7σ USD/JPY move reaches a device set at 2.5σ, not one set at 3.0σ, nor one that has not chosen σ moves (devices that exist keep what they received before)", notesFor([usd], dev(2.5), all).length === 1 && notesFor([usd], dev(3), all).length === 0 && notesFor([usd], dev(2), all).length === 1 && notesFor([usd], "all", all).length === 0 && notesFor([usd], dev(2.5, null), all).length === 0 && !DEFAULT_KINDS.includes("sigma") && ALERT_KINDS.includes("sigma") && PUSH_LINE === 2.5 && PUSH_LINES.join() === "2,2.5,3");
    const n31 = alertNote(usd);
    ck(`its notification: a green mark and the alert's line, then "σ move", its window and source and the time ("${n31.body}"); a tap opens USD/JPY's page`, n31.title === "\u{1F7E2} USD/JPY +1.9% · 2.7σ · 158.420" && n31.body === "σ move · σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance · 20 Nov 11:10 SGT" && n31.hash === "#asset/USDJPY%3DX" && n31.tag === "alert-31", n31);
    ck("a move that grows is told again to the devices whose line it has crossed since: raised at 2.2σ (a device at 2σ hears), at 3.1σ a device at 3σ hears, the one at 2σ not again", sigmaReaches(2, 2.2, null) && !sigmaReaches(2.5, 2.2, null) && sigmaReaches(3, 3.1, 2.2) && !sigmaReaches(2, 3.1, 2.2) && sigmaReaches(2.5, 3.1, 2.2) && notesFor([{ ...usd, sigma: 3.1, pushedSigma: 2.2 }], dev(3), all).length === 1 && notesFor([{ ...usd, sigma: 3.1, pushedSigma: 2.2 }], dev(2), all).length === 0 && alertNote({ ...usd, sigma: 3.1, pushedSigma: 2.2 }).tag === "alert-31-31");
    ck("what a page may send: kinds out of the six and a line of 2, 2.5 or 3; neither from a page of before (the stored choice is kept)", JSON.stringify(prefsFromBody({ kinds: ["stock", "sigma", "sigma"], sigmaLine: 3 })) === JSON.stringify({ kinds: ["stock", "sigma"], sigmaLine: 3 }) && prefsFromBody({ kinds: ["stock", "guessed"] }).error === "bad kinds" && prefsFromBody({ sigmaLine: 2.7 }).error === "bad σ line" && JSON.stringify(prefsFromBody({})) === "{}" && prefsFromBody({ kinds: "stock" }).error === "bad kinds");
    ck("the kinds of before still reach a device that never chose (a stock move, an index move, a buyback)", ["stock", "index", "buyback", "revision", "mna"].every((k) => wanted("all", all, { ...usd, kind: k, sigma: null })) && !wanted("all", all, usd));
  }

  console.log("\n[X] MARKETS' moves in σ and a future's lines, as the page writes them (I-6, B-27)");
  {
    const tr = (o: Partial<TableRow>): TableRow => ({ symbol: "X", name: "X", cls: "Currency", market: "FX", currency: "USD", decimals: 3, group: "fx", order: 1, last: 100, lastAt: "2026-11-20T03:00:00Z", live: true, source: "yahoo", closes: { d1: 99 }, closeDates: { d1: "2026-11-19" }, pct: { d1: 1.0101 }, marketTab: true, z1d: 0.5, sd1d: 0.6, zFrom: "2026-08-20", zTo: "2026-11-19", zN: 63, ...o } as TableRow);
    const rows = [tr({ symbol: "A", name: "A", cls: "Equities", order: 1, z1d: -1.2 }), tr({ symbol: "B", name: "B", cls: "Equities", order: 2, z1d: 2.1 }), tr({ symbol: "C", name: "C", cls: "Currency", order: 3, z1d: 2.7 }), tr({ symbol: "D", name: "D", cls: "Currency", order: 4, z1d: null }),
      tr({ symbol: "E", name: "E", cls: "Currency", order: 5, z1d: -0.3, marketTab: false }), ...Array.from({ length: 12 }, (_, k) => tr({ symbol: `F${k}`, name: `F${k}`, cls: "Commodities", order: 10 + k, z1d: 0.1 * k, zFrom: k < 3 ? "2026-08-21" : "2026-08-20" }))];
    const top = moversInSigma(rows);
    ck(`MOVERS IN σ: the ${STRIP_N} largest |σ| of the rows MARKETS shows, any class (${top.map((r) => r.symbol).join(" ")}); none without a σ, none off the table`, top.length === 10 && top[0].symbol === "C" && top[1].symbol === "B" && top[2].symbol === "A" && !top.some((r) => r.symbol === "D" || r.symbol === "E"));
    const sorted = sortBySigma(rows).map((r) => r.symbol);
    ck(`sorting by 1D in σ keeps the class bars and their members, each bar by |σ| (${sorted.slice(0, 5).join(" ")} …), rows without a σ last in their bar`, sorted.slice(0, 2).join() === "B,A" && sorted.slice(2, 5).join() === "C,E,D" && sorted.slice(5).join() === Array.from({ length: 12 }, (_, k) => `F${11 - k}`).join());
    const win = commonWindow(top);
    ck(`the window most cells share (${win?.from} – ${win?.to}); none without windows`, win?.from === "2026-08-20" && win.to === "2026-11-19" && commonWindow([tr({ zFrom: null, zTo: null })]) === null);
    ck(`a cell's change and level ("${moveLine(rows[2])}"); a yield's in bp ("${moveLine(tr({ group: "rates", cls: "Fixed income", symbol: "UST2Y", last: 4.51, closes: { d1: 4.574 }, decimals: 3 }))}")`, moveLine(rows[2]) === "+1.01% · 100.000" && moveLine(tr({ group: "rates", cls: "Fixed income", symbol: "UST2Y", last: 4.51, closes: { d1: 4.574 }, decimals: 3 })) === "-6.4bp · 4.510%");
    const tip = sigmaTip(rows[2]), jgb = sigmaTip(tr({ symbol: "JGB10Y", group: "rates", cls: "Fixed income", source: "mof", lastAt: "2026-11-19T00:00:00Z", sd1d: 0.031, z1d: -1.1 }));
    ck(`its tooltip: "${tip}"; an official yield's: "…${jgb.split(" · ").slice(1).join(" · ")}"`, tip === "The day's change over the σ of the 63 daily changes before it (0.60% a day), worked out † from the daily closes of 20 Aug 2026 – 19 Nov 2026 (Yahoo Finance)" && /\(3\.1bp a day\).*\(Japan MOF\) · measured on 19 Nov 2026's close \(published a day late\)$/.test(jgb));
    const rolled = sigmaTip(tr({ symbol: "GC=F", roll: { d: "2026-11-20", from: "GCZ26.CMX", to: "GCG27.CMX", step: 3 } })), unmeasured = sigmaTip(tr({ symbol: "GC=F", z1d: null, roll: { d: "2026-11-20", from: null, to: "GCG27.CMX", step: null } }));
    ck(`a roll day: "…${rolled.split(" · ").pop()}"; not measured: "${unmeasured}"`, /a change of contract today: \+3\.00% from Dec 2026 to Feb 2027, left out \(the day is the change within Feb 2027\)$/.test(rolled) && /^A change of contract today \(to Feb 2027\): .* has no σ$/.test(unmeasured));
    const none = (o: Partial<TableRow>) => sigmaTip(tr({ z1d: null, ...o }));
    ck(`a cell without a σ says why: "${none({ sd1d: null, zN: 12 })}"; "${none({ sd1d: null, zN: 63 })}"; "${none({ sd1d: 0.6 })}"; from a server before I-6: "${sigmaTip(tr({ z1d: undefined }))}"`, none({ sd1d: null, zN: 12 }) === "No σ: 12 daily changes stored, 60 needed" && none({ sd1d: null, zN: 63 }) === "No σ: its 63 daily changes before the day do not move" && none({ sd1d: null, zN: null }) === "No σ: fewer than 60 daily changes stored" && none({ sd1d: 0.6 }) === "No σ: there is no close to measure the day's change from" && sigmaTip(tr({ z1d: undefined })) === "No σ yet: the server sends it with the table once its update is deployed");
    ck("a contract's month and code by CME's month codes, as the server reads them", monthOf("CLF27.NYM") === "Jan 2027" && monthOf("ZNZ26.CBT") === contractName("ZNZ26.CBT")?.label && monthOf("XYZ") === "XYZ" && monthOf(null) === "–" && codeOf("CLF27.NYM") === "CLF27" && rollWords("CLZ26.NYM", "CLF27.NYM") === "roll from Dec to Jan" && rollWords(null, "ESZ26.CME") === "roll to Dec");
    const fi = futuresInfo({ d: "2026-11-20", contract: "CLF27.NYM", expires: "2026-12-21", seen_at: "2026-11-20T12:38:00Z" }, [{ d: "2026-10-21", from_contract: null, to_contract: "CLZ26.NYM", prev_close: null, source: "probe" }, { d: "2026-11-20", from_contract: "CLZ26.NYM", to_contract: "CLF27.NYM", prev_close: 82.44, source: "probe" }], "2026-11-20", [{ t: Date.parse("2026-11-19T00:00:00Z") / 1000, c: 83.21 }]);
    ck(`the page's lines for CL=F: "${contractLine(fi, "2026-11-20")}"; "${lastRollLine(fi)}"`, contractLine(fi, "2026-11-20") === "Jan 2027 (CLF27) · expires 21 Dec 2026" && contractLine(fi, "2026-12-21") === "Jan 2027 (CLF27) · expires 21 Dec 2026" && contractLine(fi, "2026-12-22") === "Jan 2027 (CLF27) · expired 21 Dec 2026" && lastRollLine(fi) === "20 Nov 2026 · from Dec 2026, -0.93% change of contract" && lastRollLine({ ...fi, lastRoll: null, rolls: [] }) === "none recorded since 21 Oct 2026" && lastRollLine({ ...fi, lastRoll: { ...fi.lastRoll!, fromMonth: null, step: null } }) === "20 Nov 2026 · from a contract no longer listed, change of contract not measured" && contractLine(undefined) === "–" && contractLine({ ...fi, expires: "2021-10-01", seen: "2021-08-11" }, "2026-11-20") === "Jan 2027 (CLF27) · expired 1 Oct 2021" && contractLine({ ...fi, expires: null }, "2026-11-20") === "Jan 2027 (CLF27)");
    ck(`what the series is, and which figures leave the rolls out ("${rollsOutLine({ futures: fi, rollsOut: 2 }).slice(0, 80)}…")`, SERIES_LINE.startsWith("A front-month series") && rollsOutLine({ futures: fi, rollsOut: 2 }).startsWith("Rolls left out of realised vol and its percentile, σ vs 1M avg, the largest rise and fall and the 1D in σ: 2 since 21 Oct 2026. Changes of contract before 21 Oct 2026 are not known") && rollsOutLine({}) === "");
    const marks = rollMarks(fi);
    ck(`each roll a mark on the chart: "${marks[1]?.items[0].text}"; an unmeasured one says so`, marks.length === 2 && marks.every((m) => m.roll) && marks[1].items[0].text === "roll from Dec to Jan: -0.93% is a change of contract" && marks[0].items[0].text === "roll to Dec: the change of contract was not measured" && /not a move/.test(marks[1].items[0].why) && marks[1].title === "20 Nov 2026 · change of contract");
    // the local copy's stand-in page leaves the roll out by the server's own rule
    const D2 = 86400, bars = Array.from({ length: 300 }, (_, i) => ({ t: Date.parse("2026-01-02T00:00:00Z") / 1000 + i * D2, c: 100 + Math.sin(i / 7) * 3 + i * 0.01 }));
    const rl = [{ d: new Date(bars[260].t * 1000).toISOString().slice(0, 10), prevClose: bars[259].c * 1.03 }, { d: new Date(bars[120].t * 1000).toISOString().slice(0, 10), prevClose: null }];
    const a = mockSegments(bars, rl), b = rollSegments(bars, rl);
    ck(`the local copy's stand-in rule (mockSegments) gives the server's pieces (${a.map((x) => x.length).join("+")})`, a.length === b.length && a.every((seg, i) => seg.length === b[i].length && seg.every((x, j) => x.t === b[i][j].t && Math.abs(x.c - b[i][j].c) < 1e-9)));
  }

  console.log("\n[Y] a results date as its source gives it (A-30, first step) and where a page opens (B-28)");
  {
    ck("a listing's market by its symbol: Tokyo, New York (no suffix, an ADR too), Hong Kong, Seoul, Shanghai, London; a stand-in symbol by its index list", listingTz("7203.T") === "Asia/Tokyo" && listingTz("NVDA") === "America/New_York" && listingTz("TM") === "America/New_York" && listingTz("0700.HK") === "Asia/Hong_Kong" && listingTz("005930.KS") === "Asia/Seoul" && listingTz("600519.SS") === "Asia/Shanghai" && listingTz("BP.L") === "Europe/London" && listingTz("XHK8", ["HSI"]) === "Asia/Hong_Kong" && listingTz("US0", ["SP500"]) === "America/New_York" && listingTz("7203.T", ["SP500"]) === "Asia/Tokyo" && listingCity("7203.T") === "Tokyo" && listingCity("NVDA") === "New York");
    // Yahoo's stamps of 19 Nov 2026 (calendarEvents in the source probe): Toyota 1801722600, NVIDIA 1794949200
    const toyota = new Date(1801722600 * 1000).toISOString(), nvda = new Date(1794949200 * 1000).toISOString();
    ck(`Toyota's stamp ${toyota} (15:30 in Tokyo, the close) is 4 Feb 2027 there; NVIDIA's ${nvda} (16:00 in New York) is 17 Nov 2026 there, not the 18th it is in Singapore`, resultsDay(toyota, "7203.T") === "2027-02-04" && fmtResultsDate(toyota, "7203.T") === "4 Feb 2027" && resultsDay(nvda, "NVDA") === "2026-11-17" && fmtResultsDate(nvda, "NVDA") === "17 Nov 2026" && fmtDate(nvda) === "18 Nov 2026");
    ck("a plain date is read as written (JPX's, later); none, empty or unreadable is a dash; never a time of day", resultsDay("2027-02-04", "NVDA") === "2027-02-04" && resultsDay(null, "NVDA") === null && resultsDay("", "NVDA") === null && resultsDay("soon", "NVDA") === null && fmtResultsDate(null, "7203.T") === "–" && [toyota, nvda, "2026-11-20T23:59:00Z"].every((t) => !/\d:\d\d/.test(fmtResultsDate(t, "NVDA") + fmtResultsDate(t, "7203.T"))));
    ck(`a day bar: "${resultsDayLabel("2026-11-17")}", "${resultsDayLabel("2027-02-04")}"`, resultsDayLabel("2026-11-17") === "Tuesday 17 Nov" && resultsDayLabel("2027-02-04") === "Thursday 4 Feb" && resultsDayLabel("x") === "x");
    // a US name late on the 17th in New York comes after a Tokyo name early on the 18th by the clock, but before it by its day
    const list = byResultsDay([{ s: "7203.T", at: "2026-11-18T00:00:00Z" }, { s: "NVDA", at: "2026-11-18T04:00:00Z" }, { s: "AAPL", at: null }, { s: "6758.T", at: "2026-11-17T06:30:00Z" }], (r) => r.at, (r) => r.s);
    ck(`a list in the order of each company's own day, then its moment; a name without a date left out (${list.map((r) => `${r.s} ${r.day}`).join(", ")})`, list.map((r) => r.s).join() === "6758.T,NVDA,7203.T" && list.map((r) => r.day).join() === "2026-11-17,2026-11-17,2026-11-18");
    ck("the source's mark in the designer's words: est. (Yahoo Finance), confirmed (Yahoo Finance), the source alone where it says nothing; conf. / est. / a dash in a narrow column", resultsWords(true) === "est. (Yahoo Finance)" && resultsWords(false) === "confirmed (Yahoo Finance)" && resultsWords(null) === "Yahoo Finance" && resultsStatus(true) === "est." && resultsStatus(false) === "confirmed" && resultsStatus(undefined) === null && resultsStatusShort(true) === "est." && resultsStatusShort(false) === "conf." && resultsStatusShort(null) === "–");
    const tip = resultsTip("NVDA", true);
    ck(`its tooltip names the day's market and why there is no time: "${tip.slice(0, 92)}…"`, /the day in New York, where the company is listed; estimated by Yahoo, not confirmed by the company\. No time of day: the source gives a time with the date but does not say that it is the company's release time\.$/.test(tip) && /the day in Tokyo/.test(resultsTip("7203.T", false)) && /no time of day: the source states no release time$/.test(RESULTS_NOTE));
    const R = (view: string, sub = "") => ({ view, sub });
    ck("a page opened from a list starts at its top: a name's page from any tab or from another name's; an index's page on EQUITIES from another tab", opensAtTop(R("market"), R("asset", "USDJPY=X")) && opensAtTop(R("watch"), R("asset", "GC=F")) && opensAtTop(R("asset", "NVDA"), R("asset", "7203.T")) && opensAtTop(null, R("asset", "NVDA")) && opensAtTop(R("market"), R("equities", "nk225")) && opensAtTop(R("news"), R("equities", "sp500")));
    ck("and nothing else: the same name again, another index from EQUITIES' own picker, a tab of its own, a piece of RESEARCH (it places itself)", !opensAtTop(R("asset", "NVDA"), R("asset", "NVDA")) && !opensAtTop(R("equities", "topix"), R("equities", "nk225")) && !opensAtTop(R("market"), R("equities")) && !opensAtTop(R("market"), R("news")) && !opensAtTop(R("research"), R("research", "note:2026-11-20")) && !opensAtTop(R("market"), R("asset")));
  }

  console.log("\n[Z] fixes after the check of round 3a (20 Nov 2026): σ vs 1M avg never across a change of contract (F1), a σ move's line on WATCHLIST (F3), the results calendar's flag as the source gives it (F4), a Tokyo date's mark (S5), the contract's source (S2)");
  {
    const D = 86400, ymd = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
    // 120 weekday closes from 1 Jun 2026, about 1% a day; a series ending on a Thursday so the next session is a weekday
    const raw: Bar[] = []; let v = 80;
    for (let i = 0, t = Date.parse("2026-06-01T00:00:00Z") / 1000; raw.length < 120; t += D) { const wd = new Date(t * 1000).getUTCDay(); if (wd === 0 || wd === 6) continue; v *= 1 + (((i++ * 7919) % 97) / 97 - 0.5) * 0.02; raw.push({ t, c: v }); }
    while (new Date(raw[raw.length - 1].t * 1000).getUTCDay() !== 4) raw.pop();
    const lastBar = raw[raw.length - 1], next = lastBar.t + D;   // the next session: a Friday
    // a 5% step 14 sessions back, as BZ=F's seeded roll of 2 Nov (its change of contract not known) is 14 sessions before 20 Nov
    const k = raw.length - 14, stepped = raw.map((b, i) => (i >= k ? { ...b, c: b.c * 1.05 } : b)), rd = ymd(raw[k].t), clean = raw.map((b) => ({ ...b, c: b.c * 1.05 }));
    const def: InstrumentDef = { symbol: "BZ=F", name: "Brent crude", cls: "Commodities", grp: "cmdty", market: "NYMEX", currency: "USD", decimals: 2, provider: "yahoo" };
    const lastS = stepped[stepped.length - 1].c * 1.001;
    const tableRow: RowLike = { symbol: "BZ=F", name: "Brent crude", cls: "Commodities", group: "cmdty", market: "NYMEX", currency: "USD", decimals: 2, order: 1, last: lastS, lastAt: new Date((next + 14 * 3600) * 1000).toISOString(), live: true, source: "yahoo", closes: { d1: stepped[stepped.length - 1].c }, closeDates: { d1: ymd(lastBar.t) }, pct: { d1: 0.1 }, chg: { d1: 0 }, z1m: null, pos52: 50, vs200: null };
    const quote = (price: number): QuoteLike => ({ name: "Brent Crude Oil", quoteType: "FUTURE", currency: "USD", exchange: "NYM", price, prevClose: null, time: next + 14 * 3600, open: null, high: null, low: null });
    const fig = (o: { row?: RowLike | null; bars: Bar[]; price: number; rolls: Array<{ d: string; prevClose: number | null }> }) => instrumentFigures({ symbol: "BZ=F", def, row: o.row ?? null, quote: quote(o.price), bars: o.bars, yieldQuote: false, now: (next + 15 * 3600) * 1000, rolls: o.rolls });
    const rawZ = seriesStats(stepped, lastS, "price").z1m;
    const withTable = fig({ row: tableRow, bars: stepped, price: lastS, rolls: [{ d: rd, prevClose: null }] });
    ck(`F1: a future whose market-table row has no σ vs 1M avg (a change of contract not known among its 21 closes): its page shows none either, not the ${rawZ?.toFixed(2)} the raw closes give across the step`, withTable.z1m === null && rawZ != null && Math.abs(rawZ) > 0.3, { page: withTable.z1m, rawZ });
    ck("a Monitor instrument's σ vs 1M avg is the table's own where it gives one", fig({ row: { ...tableRow, z1m: 1.23 }, bars: stepped, price: lastS, rolls: [] }).z1m === 1.23);
    // no table row (the market table could not be read): the page works it out by the database's rule
    const cleanZ = seriesStats(clean, lastS, "price").z1m;
    const measured = fig({ bars: stepped, price: lastS, rolls: [{ d: rd, prevClose: raw[k - 1].c * 1.05 }] }), unmeasured = fig({ bars: stepped, price: lastS, rolls: [{ d: rd, prevClose: null }] });
    ck(`without the table's row: across a measured roll σ vs 1M avg is that of the series with the step taken out (${measured.z1m?.toFixed(4)} = ${cleanZ?.toFixed(4)}); across a roll not measured, none`, measured.z1m != null && cleanZ != null && Math.abs(measured.z1m - cleanZ) < 1e-9 && Math.abs(measured.z1m - (rawZ ?? 0)) > 0.1 && unmeasured.z1m === null, { measured: measured.z1m, cleanZ, unmeasured: unmeasured.z1m });
    // a roll on the print's own session, after the newest booked close: the print is the new contract's
    const lastNew = lastBar.c * 1.05 * 1.002, today = ymd(next);
    const todayM = fig({ bars: raw, price: lastNew, rolls: [{ d: today, prevClose: lastBar.c * 1.05 }] }), todayU = fig({ bars: raw, price: lastNew, rolls: [{ d: today, prevClose: null }] });
    const wantToday = seriesStats(raw.map((b) => ({ ...b, c: b.c * 1.05 })), lastNew, "price").z1m;
    ck(`a roll today, after the newest booked close: the booked closes on the new contract's level (${todayM.z1m?.toFixed(4)} = ${wantToday?.toFixed(4)}); not measured, none (it would read ${seriesStats(raw, lastNew, "price").z1m?.toFixed(1)} against the old contract)`, todayM.z1m != null && wantToday != null && Math.abs(todayM.z1m - wantToday) < 1e-9 && todayU.z1m === null, { m: todayM.z1m, wantToday, u: todayU.z1m });
    ck("a roll older than the 21 closes changes nothing; a roll after the print's session is not the print's", fig({ bars: stepped, price: lastS, rolls: [{ d: ymd(raw[k - 30].t), prevClose: null }] }).z1m === seriesStats(stepped, lastS, "price").z1m && fig({ bars: raw, price: lastBar.c, rolls: [{ d: ymd(next + 3 * D), prevClose: null }] }).z1m === seriesStats(raw, lastBar.c, "price").z1m);
    // the market table's own rule (table.ts): a roll after the newest booked close sets the closes on the new level by f; not known, none
    const m21 = 100, s21 = 2;
    ck("the market table's σ vs 1M avg (z1mOf): (print − mean) / σ; a roll today measured: on the new contract's level; not measured: none, as the database gives none for a booked one", z1mOf(104, m21, s21) === 2 && Math.abs((z1mOf(107.1, m21, s21, 1.05) ?? 0) - (107.1 - 105) / 2.1) < 1e-12 && z1mOf(104, m21, s21, null) === null && z1mOf(104, m21, 0) === null && z1mOf(null, m21, s21) === null && z1mOf(104, null, s21) === null);
    // F3: a σ move on WATCHLIST says what it is, its window and source
    ck(`F3: a σ move's second line on WATCHLIST: "${sigmaNoteLine({ note: "σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance" })}"; without a note its kind alone`, sigmaNoteLine({ note: "σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance" }) === "σ move · σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance" && sigmaNoteLine({ note: null }) === "σ move" && sigmaNoteLine({}) === "σ move");
    // F4: the results calendar's flag
    ck("F4: the calendar's flag from a server that sends it as the source gives it: true est., false confirmed, null not said; from a server before (a missing flag sent as false): false is not said, never confirmed", calendarFlag(true, true) === true && calendarFlag(false, true) === false && calendarFlag(null, true) === null && calendarFlag(true, undefined) === true && calendarFlag(false, undefined) === null && calendarFlag(false, false) === null && resultsStatusShort(calendarFlag(false, undefined), "NVDA") === "–" && resultsStatusShort(calendarFlag(false, true), "NVDA") === "conf.");
    // S5: a Tokyo company's date is est. until JPX's own calendar is read (A-30)
    const tip7203 = resultsTip("7203.T", false), tipNk = resultsTip("JP1", null, ["NK225"]);
    ck(`S5: a Tokyo company's Yahoo date is marked est. whatever Yahoo's flag (7203.T: "${resultsWords(false, "7203.T")}", "${resultsStatusShort(false, "7203.T")}"); a US company's keeps Yahoo's ("${resultsWords(false, "NVDA")}")`, jpxDated("7203.T") && jpxDated("JP1", ["NK225"]) && !jpxDated("NVDA") && !jpxDated("TM") && resultsMark(false, "7203.T") === true && resultsMark(null, "6758.T") === true && resultsMark(false, "NVDA") === false && resultsMark(null, "NVDA") === null && resultsMark(false) === false && resultsWords(false, "7203.T") === "est. (Yahoo Finance)" && resultsStatus(false, "JP1", ["NK225"]) === "est." && resultsStatusShort(false, "7203.T") === "est." && resultsWords(false, "NVDA") === "confirmed (Yahoo Finance)" && resultsStatusShort(null, "NVDA") === "–");
    ck(`its tooltip says why, and what Yahoo marks: "…${tip7203.split("; ")[1]?.split(". No time")[0]}"`, /; marked est\.: a Tokyo company's date is confirmed by JPX's results calendar \(決算発表予定日\), which the Monitor does not read yet \(Yahoo marks it confirmed\)\. No time of day/.test(tip7203) && /\(Yahoo gives no mark\)\. No time of day/.test(tipNk) && /the day in New York, where the company is listed; confirmed, as Yahoo marks it\./.test(resultsTip("NVDA", false)), { tip7203, tipNk });
    ck(`the line under a list of marks: "${MARKS_NOTE}"`, /^conf\. or est\. as Yahoo marks the date; a Tokyo company's est\. until JPX's own calendar is read$/.test(MARKS_NOTE));
    // S4: a future's 1D in σ says from when its changes of contract are left out (a change before the record stays in)
    const futRow = { symbol: "CL=F", name: "WTI crude", cls: "Commodities", group: "cmdty", market: "NYMEX", currency: "USD", decimals: 2, order: 36, last: 80, lastAt: "2026-11-20T14:00:00Z", live: true, source: "yahoo", closes: { d1: 79 }, closeDates: { d1: "2026-11-19" }, pct: { d1: 1.27 }, chg: { d1: 1 }, z1d: 0.9, sd1d: 1.4, zFrom: "2026-08-20", zTo: "2026-11-19", zN: 63, z1m: 0.1, pos52: 40, vs200: 1, marketTab: true, chart: true, contract: "CLF27.NYM", roll: null } as unknown as TableRow;
    const ftip = sigmaTip(futRow), xtip = sigmaTip({ ...futRow, symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", contract: null } as TableRow);
    ck(`S4: a future's 1D in σ says its changes of contract are left out only from when the Monitor records them ("…${ftip.split(" · ").pop()}"); a currency's says nothing of contracts`, /its changes of contract are left out from when the Monitor records them; any before stay in \(its page says from when\)$/.test(ftip) && !/contract/.test(xtip), { ftip, xtip });
    // S2: the contract's source and when it was read, under it on both layouts
    ck(`S2: under a future's contract: "${contractSource({ source: "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol)", seenAt: "2026-11-20T17:38:00Z" })}"`, contractSource({ source: "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol)", seenAt: "2026-11-20T17:38:00Z" }) === "Yahoo Finance (unofficial) · read 21 Nov 01:38 SGT" && contractSource({ source: "Yahoo Finance (unofficial) quote: x", seenAt: null }) === "Yahoo Finance (unofficial)");
  }

  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})();
