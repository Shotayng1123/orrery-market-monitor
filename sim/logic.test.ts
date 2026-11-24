// Logic checks that need no browser and no database: exchange sessions (web and server copies must agree),
// rolling sigma bands, exchange-local dating of Yahoo bars.  Run:  cd jobs && npx tsx ../sim/logic.test.ts
// GitHub installs jobs/ alone before it runs this file: nothing imported here may reach a package of the page's
// (React, uPlot), directly or through another file. The last section, [AB], fails on any machine when one does.
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
import { earningsOf, keyStatsOf } from "../supabase/functions/_shared/yahoo.ts";
import { MOVE_RULE, SWING_PCT, SWING_PCT_2, bigMoves, isLargeCap, moveCtx, moveText, settledBars, siblingKind, turningPoints } from "../supabase/functions/_shared/bigmoves.ts";
import { liveRows } from "../supabase/functions/_shared/intraday.ts";
import { CAUSE_SYSTEM, causeQuestion, readCause, type MoveCtx } from "../supabase/functions/_shared/movecause.ts";
import { ALERTS, COMPANY, FIRST, HELP, PHILOSOPHY, PHONE, TABS, TOUR, TOUR_ALT, TOUR_LINK, WELCOME_SUBJECT, welcomeMail } from "../supabase/functions/_shared/welcome.ts";
import { FEED_LATE_MIN, OWN_SHORT_MIN, barDayEnd, barSettled, feedState, fxTrading, silence, stoppedBeforeClose, weekFirstPrint, type Print } from "../supabase/functions/_shared/feedhealth.ts";
import { OWN_FRESH_MIN, RELAY_BEAT_MAX_S, RELAY_CRON, RELAY_JOBS, RELAY_LATE_MIN, RELAY_OK_RUN, RELAY_WAIT_MIN, beatFresh, cronDue, current, newerOnly, reading, relayAct, relayJobsDue, usable, type RelayView } from "../supabase/functions/_shared/relay.ts";
import { CBOE_YIELDS, closeDay, isYieldQuote, isYieldRow, NAME_ORDER, newestStats, sourceName, watchRowFromQuote, watchRowFromStat, watchRowFromTable, watchRowWithLim, type QuoteLike } from "../supabase/functions/_shared/watchrow.ts";
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
import { dailyChanges, dayWords, lastSession, lastSessionOf, prevCloses, tableLastSession, LISTED_ALERTS, listed, moveWords, SIGMA_CLASSES, SIGMA_LIST, SIGMA_MIN, SIGMA_N, SIGMA_RAISE, sessionDay, sigmaCandidate, sigmaMsg, sigmaNote, sigmaStats, sigmaWrites, usableSd, z1mOf, zDay } from "../supabase/functions/_shared/sigma.ts";
import { ALERT_KINDS, DEFAULT_KINDS, prefsFromBody, PUSH_LINE, PUSH_LINES, sigmaReaches } from "../supabase/functions/_shared/pushrules.ts";
import { futuresInfo } from "../supabase/functions/_shared/instrstats.ts";
import { cellDay, columnTip, commonWindow, hasLastSession, lastBell, lastClause, lastLine, lastTip, lastWords, LIVE_PRINT_MIN, LIVE_SLACK_MIN, liveWindowMin, moveLine, stillLive, moveParts as sigmaParts, moversInSigma, rowDay, rowDayTip, showsLast, sigmaTip, sortBySigma, staleDay, STRIP_N, todayTip, YOUNG_HOURS, youngDay } from "../web/src/lib/movers.ts";
import { codeOf, monthOf, rollWords } from "../web/src/lib/futures.ts";
import { contractLine, contractSource, lastRoll, lastRollLine, rollMarks, rollsOutLine, SERIES_LINE } from "../web/src/lib/instrument.ts";
import { mockSegments } from "../web/src/lib/mockInstr.ts";
import type { TableRow } from "../web/src/lib/types.ts";
import { byResultsDay, calendarFlag, fmtResultsDate, resultsAhead, RESULTS_KEPT_MS, jpxDated, listingCity, listingTz, MARKS_NOTE, RESULTS_NOTE, resultsDay, resultsDayLabel, resultsMark, resultsStatus, resultsStatusShort, resultsTip, resultsWords } from "../web/src/lib/results.ts";
import { opensAtTop } from "../web/src/lib/pagetop.ts";
import { bookWord, csvFile, fileWord, sgDay } from "../web/src/lib/csvname.ts";
import { selectAll, selectCols } from "../supabase/functions/_shared/paging.ts";
import * as probe from "../jobs/probes/lib.ts";
import * as tableCore from "../supabase/functions/_shared/tablecore.ts";
import * as pfWalls from "../jobs/lib/pfwalls.ts";
import * as marks from "../jobs/lib/marks.ts";
import * as jpxRead from "../jobs/probes/jpx_read.ts";
import * as yahooProbe from "../jobs/probes/yahoo_lib.ts";
import { closedLine, closedLineText, closedWord, DUE_GRACE_MIN, hoursText, marketSession, pageLine, pageLive, panelRowOf, readInNewYork, rowSession, rowState, rowStateWords, shutLine, shutMarkets, skippedWords, staleInSession, stateWord, symbolMarket, tileState, type Cal } from "../web/src/lib/opens.ts";
import { bookedDays, mockHolidays, printAt, sessionEndMs } from "../web/src/lib/mock.ts";
import { LAST_SESSION, TODAY } from "../web/src/lib/labels.ts";
import * as pfStatement from "../supabase/functions/_shared/pf/statement.ts";
import * as pfTargets from "../supabase/functions/_shared/pf/targets.ts";
import * as pfForm from "../supabase/functions/_shared/pf/form.ts";
import * as pfCal from "../supabase/functions/_shared/pf/calendar.ts";
import * as pfPresets from "../supabase/functions/_shared/pf/presets.ts";
import * as pfView from "../supabase/functions/_shared/pf/view.ts";
import * as pfWords from "../supabase/functions/_shared/pf/words.ts";
import * as pfMoney from "../supabase/functions/_shared/pf/money.ts";
import { parseAmount as pfAmount, fmtFull as pfFull, fmtShort as pfShort } from "../supabase/functions/_shared/pf/money.ts";
import { PF_ACTIONS, pfRoute, type PfDeps } from "../supabase/functions/_shared/pf/route.ts";
import { emptyState as pfEmpty, memStore as pfMem, type MemState as PfMemState } from "../supabase/functions/_shared/pf/memstore.ts";
import { inPreview, PAPER_ON_SERVER, paperOpen, previewFor, previewList } from "../supabase/functions/_shared/pf/switch.ts";
import * as pfSize from "../supabase/functions/_shared/pf/size.ts";
import type { BookFull as PfBook, PfStore, StartId as PfStart } from "../supabase/functions/_shared/pf/types.ts";
import { opensAtTop as pfOpensAtTop, portfolioPage } from "../web/src/lib/pagetop.ts";
import { MEMBERS_SOURCE, PERSONAL_USE, PERSONAL_USE_READ, PERSONAL_USE_TEXT, PORTFOLIO as PORTFOLIO_WORD } from "../web/src/lib/labels.ts";
import * as pl from "../supabase/functions/_shared/rules/pricelimit.ts";
import * as lr from "../supabase/functions/_shared/rules/limitrow.ts";
import { readFileSync, readdirSync, statSync as fileStat } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync } from "node:crypto";
import { builtinModules, createRequire } from "node:module";
import { dirname, join as joinPath, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

// Every file and folder this file reads as it runs, so that [AL] can hold logic-tests' paths to them: this file stops a
// deploy of the server and of the site, and a file it reads that no pull request's check reads with it merges unseen
// and stops the next deploy (the deploy trap of the check of fix part 4, 23 Nov 2026).
const readsSeen = new Set<string>();
const seenRead = (p: unknown): void => { try { if (p instanceof URL) readsSeen.add(fileURLToPath(p)); else if (typeof p === "string") readsSeen.add(resolvePath(p)); } catch { /* not a path of this machine */ } };
const readText = ((p: Parameters<typeof readFileSync>[0], ...rest: unknown[]) => { seenRead(p); return (readFileSync as (...a: unknown[]) => unknown)(p, ...rest); }) as typeof readFileSync;
const listDir = ((p: Parameters<typeof readdirSync>[0], ...rest: unknown[]) => { seenRead(p); return (readdirSync as (...a: unknown[]) => unknown)(p, ...rest); }) as typeof readdirSync;
// The page's copies of the server's pure files, which web/tools/sync-pf.cjs writes: the paper engine (_shared/pf/, since
// P-1) and the market's rules (_shared/rules/, since the limit chip's L-1, 24 Nov 2026). Each file of the server's folder
// but its own (`serverOnly`) is in the page's folder under one line that names it, and nothing else is there.
const pageCopy = (dir: string, serverOnly: string[] = []): { files: string[]; copies: string[]; differs: string[]; extra: string[] } => {
  const from = new URL(`../supabase/functions/_shared/${dir}/`, import.meta.url), to = new URL(`../web/src/lib/${dir}/`, import.meta.url);
  const files = listDir(from).filter((f) => f.endsWith(".ts") && !serverOnly.includes(f)).sort();
  let copies: string[] = [];
  try { copies = listDir(to).filter((f) => f.endsWith(".ts")).sort(); } catch { /* no copy yet */ }
  const differs = files.filter((f) => { const want = `// COPY of supabase/functions/_shared/${dir}/${f}: edit that file, then run \`node tools/sync-pf.cjs\` from web/.\n${readText(new URL(f, from), "utf8")}`; try { return readText(new URL(f, to), "utf8") !== want; } catch { return true; } });
  return { files, copies, differs, extra: copies.filter((f) => !files.includes(f)) };
};

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

console.log("\n[C] FX (Sun 17:00 to Fri 17:00 New York: Mon 06:00 to Sat 06:00 SGT in New York's winter) and CME Globex (Sun 18:00 ET to Fri 17:00 ET, daily 17:00–18:00 break)");
{
  const fx = web.marketById("FX"), cme = web.marketById("CME");
  ck("FX Sat 10:00 SGT closed", web.marketStatus(fx, at("2026-11-07T02:00:00Z")).state === "CLOSED");
  ck("FX Sat 04:00 SGT open", web.marketStatus(fx, at("2026-11-06T20:00:00Z")).state === "OPEN");
  ck("FX Mon 04:00 SGT closed", web.marketStatus(fx, at("2026-11-08T20:00:00Z")).state === "CLOSED");
  ck("FX Mon 05:30 SGT closed in New York's winter (Sunday 16:30 there); open from 06:00 SGT", web.marketStatus(fx, at("2026-11-08T21:30:00Z")).state === "CLOSED" && web.marketStatus(fx, at("2026-11-08T21:59:00Z")).state === "CLOSED" && web.marketStatus(fx, at("2026-11-08T22:00:00Z")).state === "OPEN");
  ck("FX Mon 05:30 SGT open in New York's summer (Sunday 17:30 there); closed from Sat 05:00 SGT", web.marketStatus(fx, at("2026-07-19T21:30:00Z")).state === "OPEN" && web.marketStatus(fx, at("2026-07-19T20:59:00Z")).state === "CLOSED" && web.marketStatus(fx, at("2026-07-17T20:59:00Z")).state === "OPEN" && web.marketStatus(fx, at("2026-07-17T21:00:00Z")).state === "CLOSED");
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
    // The week's first hours (the checks of round 3b, 21 Nov 2026: PR-11). The source's currency bars begin on Monday at
    // 00:00 UTC on all four weekends of the probe's log, two hours after the session table opens the FX week; the rule
    // of 19 Nov called Friday's print a stopped feed from Sunday 22:30 UTC, and would have met its first Monday on the 23rd.
    const sunday = (iso: string) => feedState(friday, at(iso));
    ck("in the week's first hours a print from before the weekend says nothing about the feed: on Sunday 22 Nov at 22:30 and 23:30 UTC and on Monday at 00:20 UTC (06:30, 07:30 and 08:20 SGT) Friday's prints are not a stopped feed and nothing is expected, so the header does not say DATA ✕", [sunday("2026-11-22T22:30:00Z"), sunday("2026-11-22T23:30:00Z"), sunday("2026-11-23T00:20:00Z")].every((x) => !x.expected && x.ok && x.newest === null) && weekFirstPrint(at("2026-11-22T22:00:00Z")) === at("2026-11-23T00:00:00Z") && weekFirstPrint(at("2027-03-21T21:00:00Z")) === at("2027-03-22T00:00:00Z"), [sunday("2026-11-22T22:30:00Z"), sunday("2026-11-23T00:20:00Z")]);
    // The tick's own decision (the checks of 22 Nov 2026, FH-2): the minute job asks the second path to take over when
    // current(reading(...)) is false (supabase/functions/tick/index.ts), which also counts the answers. The answers here
    // are as the minute job's own log had them on the two Sunday evenings on record (8 and 15 Nov 2026, the live
    // check's part "sundays"): from 21:00 to 23:00 UTC 23 of 23 due quotes with a priced bar (the 21 pairs then due,
    // each with Friday's bar, and two coins current); from 23:00 the 16 CME futures are due too and answer with no
    // priced bar until 23:14 to 23:23 (23 of 39), then 15 of them print (38 of 39); from 00:00 the pairs print.
    {
      const pairs = Array.from({ length: 21 }, (_, i) => P(`FX${i}=X`, "FX", "2026-11-20T21:59:00Z")), coins = (iso: string) => [P("BTC-USD", "CRYPTO", iso), P("ETH-USD", "CRYPTO", iso)];
      const futs = (iso: string, n: number) => Array.from({ length: n }, (_, i) => P(`F${i}=F`, "CME", iso));
      const decide = (iso: string, prints: Print[], due: number) => { const r = reading(prints, due, at(iso)); return { at: iso, got: r.got, due: r.due, expected: r.expected, lateMin: r.lateMin, symbol: r.symbol, current: current(r) }; };
      const ticks = [decide("2026-11-22T22:30:00Z", [...pairs, ...coins("2026-11-22T22:29:00Z")], 23), decide("2026-11-22T23:10:00Z", [...pairs, ...coins("2026-11-22T23:09:00Z")], 39),
        decide("2026-11-22T23:30:00Z", [...pairs, ...futs("2026-11-22T23:19:00Z", 15), ...coins("2026-11-22T23:29:00Z")], 39),
        decide("2026-11-23T00:20:00Z", [...pairs.map((x, i) => (i < 15 ? P(x.symbol, "FX", "2026-11-23T00:19:00Z") : x)), ...futs("2026-11-23T00:19:00Z", 15), ...coins("2026-11-23T00:19:00Z")], 39)];
      ck(`the tick's decision on a Sunday evening as the log had it: at ${ticks.map((t) => `${t.at.slice(11, 16)} (${t.got}/${t.due})`).join(", ")} UTC the reading is current, so the second path is not asked`, ticks.every((t) => t.current && t.expected && (t.lateMin ?? 99) < RELAY_LATE_MIN), ticks);
      const still = decide("2026-11-22T22:30:00Z", [...pairs, ...coins("2026-11-22T22:00:00Z")], 23), few = decide("2026-11-22T22:30:00Z", coins("2026-11-22T22:29:00Z"), 23), late = decide("2026-11-22T23:30:00Z", [P("FX0=X", "FX", "2026-11-22T22:05:00Z"), ...pairs.slice(1), ...coins("2026-11-22T23:29:00Z")], 23);
      ck(`and it asks when it should: the coins standing still for half an hour (${still.lateMin} min behind); fewer than half the answers back (${few.got}/${few.due}: the case no Sunday on record shows); a pair that printed after Sunday's bell and then stood still (${late.symbol}, ${late.lateMin} min)`, !still.current && !few.current && !late.current && late.symbol === "FX0=X", { still, few, late });
    }
    ck("half an hour after the source's week has begun (Monday 00:00 UTC; a future's ten minutes later) a print still from before the weekend is a stopped feed, as at any other hour", (() => { const fx = feedState(friday.slice(0, 1), at("2026-11-23T00:31:00Z")), early = feedState(friday.slice(1), at("2026-11-23T00:35:00Z")), fut = feedState(friday.slice(1), at("2026-11-23T00:41:00Z")); return fx.expected && !fx.ok && fx.symbol === "USDJPY=X" && !early.expected && fut.expected && !fut.ok; })());
    ck("an instrument that has printed since the week began is judged at once: a pair current at 23:29 UTC on Sunday is a feed that works; one that printed at 22:05 and nothing since is a stopped feed at 23:30, whatever Friday's prints beside it; a future current on Sunday evening vouches for the feed", feedState([P("USDJPY=X", "FX", "2026-11-22T23:29:00Z"), friday[1]], at("2026-11-22T23:30:00Z")).ok && feedState([P("USDJPY=X", "FX", "2026-11-22T23:29:00Z")], at("2026-11-22T23:30:00Z")).expected && (() => { const st = feedState([P("USDJPY=X", "FX", "2026-11-22T22:05:00Z"), friday[1]], at("2026-11-22T23:30:00Z")); return st.expected && !st.ok && st.lateMin === 85; })() && feedState([friday[0], P("ES=F", "CME", "2026-11-22T23:35:00Z")], at("2026-11-22T23:50:00Z")).ok);
    ck("New York's summer the same, where the table's week begins three hours before the source's: Sunday 21 Mar 2027 at 21:30 and 23:30 UTC nothing is expected of Friday's prints; on Monday at 00:31 UTC they are a stopped feed; and on a weekday evening nothing changes (Tuesday 22:30 UTC, a print from 21:00: stopped)", (() => { const fri = [P("USDJPY=X", "FX", "2027-03-19T20:59:00Z")]; return !feedState(fri, at("2027-03-21T21:30:00Z")).expected && !feedState(fri, at("2027-03-21T23:30:00Z")).expected && !feedState(fri, at("2027-03-22T00:31:00Z")).ok && !feedState([P("USDJPY=X", "FX", "2026-11-24T21:00:00Z")], at("2026-11-24T22:30:00Z")).ok; })());
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
    // by the header's own names (U3-1 of the night review of 23 Nov 2026: "MARKET" and "RATES & CURRENCY" had stayed
    // since the tabs were renamed on 20 Nov, beside a tour picture that shows MARKETS and RATES & FX)
    ck("the six tabs in the order of the Monitor's header and by its names, each with what is there", TABS.map((t) => t[1]).join() === "MARKETS,NEWS,RESEARCH,EQUITIES,RATES & FX,WATCHLIST" && TABS.map((t) => t[1]).join() === Object.values(TAB).map((x) => x.toUpperCase()).join() && TABS.map((t) => t[0]).join() === Object.keys(TAB).join() && TABS.map((t) => t[0]).join() === "market,news,research,equities,rates,watch" && TABS.every(([, name, what]) => what.length > 30 && m.text.includes(`- ${name}: ${what}`)), TABS.map((t) => t[1]));
    ck("it says the alert lines as the Monitor has them (5% and 7% for a stock, 3% for an index, deals of USD 1bn) and both kinds of notification", ALERTS.includes(`${LARGE_STOCK_PCT}% in a session (${STOCK_PCT}% for smaller companies)`) && /index moves 3%/.test(ALERTS) && /USD 1bn/.test(ALERTS) && /Home Screen/.test(PHONE) && /NOTIFICATIONS/.test(PHONE) && /all of them, or only those on your watchlist/.test(PHONE) && [ALERTS, PHONE, COMPANY, ...FIRST].every((t) => m.text.includes(t)), [ALERTS, PHONE]);
    const links = [...m.html.matchAll(/<a href="([^"]+)"/g)].map((x) => x[1]), imgs = [...m.html.matchAll(/<img src="([^"]+)"[^>]*alt="([^"]*)"/g)].map((x) => [x[1], x[2]]);
    ck("every link goes to the Monitor itself: its front page from the button, each tab, and the 1-minute tour's page from its picture and from its words", links.length === 9 && links[0] === site && links.slice(1, 7).join() === TABS.map((t) => `${site}#${t[0]}`).join() && links[7] === `${site}tour/` && links[8] === `${site}tour/`, links);
    ck("its three pictures come from the Monitor's own site, and the banner and the tour's picture say what they show where pictures are off", imgs.length === 3 && imgs[0][0] === `${site}mail/mark.png` && imgs[1][0] === `${site}mail/orrery.png` && /orrery/.test(imgs[1][1]) && imgs[2][0] === `${site}mail/tour.jpg` && imgs[2][1] === TOUR_ALT && /1-minute tour/.test(TOUR_ALT), imgs);
    // the 1-minute tour (slice 11, the designer's work order §5.2): first in the first five minutes, the picture and the
    // words both linking to its page; Help's line says where the ? is on a phone
    const five = lines.indexOf("A GOOD FIRST FIVE MINUTES");
    ck("the plain text starts the first five minutes with the 1-minute tour and its address, before step 1", five > 0 && lines[five + 1] === TOUR && lines[five + 2] === `Watch it: ${site}tour/` && lines[five + 3] === `1. ${FIRST[0]}` && /^Start with the 1-minute tour: /.test(TOUR) && TOUR_LINK === "Watch the 1-minute tour", lines.slice(five, five + 4));
    ck("the page part: the tour's words, then its picture inside a link to its page, then the link in words and the three steps", m.html.indexOf(`${TOUR}</p>`) > 0 && m.html.indexOf(`${TOUR}</p>`) < m.html.indexOf(`<a href="${site}tour/" style="display:block;text-decoration:none"><img src="${site}mail/tour.jpg"`) && m.html.indexOf(`mail/tour.jpg`) < m.html.indexOf(`${TOUR_LINK}&nbsp;&rarr;</a>`) && m.html.indexOf(`${TOUR_LINK}&nbsp;&rarr;</a>`) < m.html.indexOf(FIRST[0]));
    ck("Help's line says where the ? is, on a phone too, in both parts", HELP === "Every column, colour and badge is explained behind the ? in the Monitor's header (on a phone, in its menu)." && m.text.includes(HELP) && m.html.includes(HELP), HELP);
    const quote = [...m.html.matchAll(/<p class="om-quote" style="([^"]+)">([^<]+)<\/p>/g)];
    ck("the opening is set in italic Times New Roman, and is the first text of the page after the name", quote.length === 3 && quote.every((q) => /font-family:'Times New Roman',Times,Georgia,serif/.test(q[1]) && /font-style:italic/.test(q[1])) && m.html.indexOf('class="om-quote"') < m.html.indexOf("Welcome.") && m.html.indexOf("Orrery Monitor</td>") < m.html.indexOf('class="om-quote"'), quote.map((q) => q[1].slice(0, 60)));
    ck("an email's own rules: tables and styles on the elements, no script, no web font, no style sheet from elsewhere; text that could be read as markup is escaped", !/<script|<link|@import|@font-face|url\(/i.test(m.html) && /<table role="presentation"/.test(m.html) && m.html.includes("RATES &amp; FX") && !m.html.includes("RATES & FX") && m.html.includes("today&#39;s") === false && !/undefined|\[object/.test(m.html + m.text) && m.html.length < 20000, m.html.length);
    // as it goes on the wire through the Monitor's own sender (smtp.ts): both versions, no line too long for a mail server
    const wire = buildMessage({ from: { name: "Orrery Monitor", email: "desk@example.com" }, to: "new.reader@example.com", ...m }, new Date("2026-11-19T01:00:00Z"), "abc123");
    const wl = wire.split("\r\n"), parts = wire.split(/--=_orrery_abc123(?:--)?\r\n/), back = (part: string) => Buffer.from(part.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    ck("sent by the Monitor's own sender it is one message with the plain text and the page side by side, each arriving whole, and no line longer than 78 characters", /^Subject: Welcome to Orrery Monitor$/m.test(wire) && /multipart\/alternative/.test(wire) && parts.length === 4 && back(parts[1]) === m.text.replace(/\n/g, "\r\n") && back(parts[2]) === m.html.replace(/\n/g, "\r\n") && wl.every((l) => l.length <= 78), { parts: parts.length, longest: Math.max(...wl.map((l) => l.length)) });
    const other = welcomeMail("https://monitor.example.com/");
    ck("another site address is used throughout", !other.html.includes("example.github.io") && !other.text.includes("example.github.io") && other.html.includes('href="https://monitor.example.com/#watch"') && other.html.includes('href="https://monitor.example.com/tour/"') && other.html.includes('src="https://monitor.example.com/mail/tour.jpg"') && other.text.includes("\nhttps://monitor.example.com/\n") && other.text.includes("\nWatch it: https://monitor.example.com/tour/\n"));
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

    // W-1 (PM A's finding 1.3a, 24 Nov 2026): an index member's row, read from its list's statistics, was its booked close
    // at every hour, while EQUITIES read the same row at its quote. Now each row is read on its own by EQUITIES' rule
    // (intraday.ts freshQuote; a watchlist is not ranked, so liveRows' half-the-list rule has no place here): at the quote
    // while it printed on a later session than the booked close, by its time; otherwise at the close, by its date.
    // Made-up rows in constituent_stats' shape: Toyota's close booked for Fri 20 Nov (Mon 23 Nov a holiday in Tokyo).
    const nr = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1e-9;
    const tokyo = (iso: string) => srv.localDate("Asia/Tokyo", Date.parse(iso) / 1000), nyDay = (iso: string) => srv.localDate("America/New_York", Date.parse(iso) / 1000);
    const member = { idx: "NK225", symbol: "7203.T", name: "Toyota Motor Corp", sector: "Transportation Equipment", d: "2026-11-20", close: 3456, prev: 3415, pct1d: 1.2, pct1w: 3.1, pct1m: -4.2, pct3m: 7.5, pct12m: 17.7, dma50: 3300, dma200: 3000, hi52: 4000, lo52: 2500, mcap: 4.5e13, earnings_at: "2027-02-05T06:00:00+00:00", earnings_est: true,
      q_price: 3500 as number | null | undefined, q_prev: 3456 as number | null | undefined, q_time: "2026-11-24T01:30:00+00:00" as string | null | undefined };   // a quote of Tue 24 Nov, 10:30 JST
    const lv = watchRowFromStat(member, "JPY", tokyo), eq = liveRows([member], tokyo).rows[0];
    ck("W-1: a member whose quote printed on a later session than its booked close is at that quote, by its time: its last, its 1D from the quote's previous close, a print", lv.last === 3500 && lv.asOf === "2026-11-24T01:30:00+00:00" && lv.asOfKind === "print" && nr(lv.pct1d, (3500 / 3456 - 1) * 100) && lv.source === "Yahoo Finance" && lv.kind === "Stock" && lv.ccy === "JPY" && lv.symbol === "7203.T" && lv.earningsEst === true, lv);
    ck("W-1: its last and 1D are EQUITIES' own for the same row (liveRows); its longer periods stay measured to the last close, as there; its distances from the averages and its 52-week place are at the quote, as EQUITIES' screener draws them", lv.last === eq.close && nr(lv.pct1d, eq.pct1d ?? NaN) && lv.pct1w === 3.1 && lv.pct12m === 17.7 && nr(lv.vs50, (3500 / 3300 - 1) * 100) && nr(lv.vs200, (3500 / 3000 - 1) * 100) && nr(lv.pos52, ((3500 - 2500) / 1500) * 100) && lv.chg1d === null && lv.vs200chg === null && !lv.isYield, { lv, eq });
    const booked = watchRowFromStat({ ...member, q_time: "2026-11-20T06:30:00+00:00", q_price: 3456, q_prev: 3415 }, "JPY", tokyo);
    ck("W-1: a quote of the booked session itself (before the next session's first print the Monitor reads) leaves the row at its close, by its date, as before", booked.last === 3456 && booked.asOf === "2026-11-20" && booked.asOfKind === "close" && booked.pct1d === 1.2 && nr(booked.vs50, (3456 / 3300 - 1) * 100), booked);
    const after = watchRowFromStat({ ...member, q_price: 3520, q_time: "2026-11-24T06:30:00+00:00" }, "JPY", tokyo), bookedNow = watchRowFromStat({ ...member, d: "2026-11-24", close: 3520, pct1d: 1.85, q_price: 3520, q_time: "2026-11-24T06:30:00+00:00" }, "JPY", tokyo);
    ck("W-1: after the close the session's last print stands until the daily job books the session; then the row is at that close", after.asOfKind === "print" && after.last === 3520 && after.asOf === "2026-11-24T06:30:00+00:00" && bookedNow.asOfKind === "close" && bookedNow.asOf === "2026-11-24" && bookedNow.pct1d === 1.85 && bookedNow.last === 3520, { after, bookedNow });
    const nvda = { ...member, idx: "SP500", symbol: "NVDA", name: "NVIDIA Corporation", d: "2026-11-23", close: 182.44, q_price: 181, q_prev: 182.44 };
    ck("W-1: a session's date is its exchange's: a print at 20:30 New York time on the 23rd is still that session, though it is the 24th in UTC", watchRowFromStat({ ...nvda, q_time: "2026-11-24T01:30:00+00:00" }, "USD", nyDay).asOfKind === "close" && watchRowFromStat({ ...nvda, q_time: "2026-11-24T14:31:00+00:00" }, "USD", nyDay).asOfKind === "print");
    const noQuote = [watchRowFromStat({ ...member, q_prev: null }, "JPY", tokyo), watchRowFromStat({ ...member, q_time: null }, "JPY", tokyo), watchRowFromStat({ ...member, q_price: 0 }, "JPY", tokyo), watchRowFromStat({ ...member, q_price: undefined, q_prev: undefined, q_time: undefined }, "JPY", tokyo)];
    ck("W-1: a quote without a price, its previous close or a time is not used, nor is there one from a database before the quote's columns: the row is at its close", noQuote.every((r) => r.asOfKind === "close" && r.last === 3456 && r.pct1d === 1.2 && r.asOf === "2026-11-20"), noQuote);
    // a name in two lists (the Nikkei 225 and TOPIX) has a row in each, and each list's quotes are read at its own minutes
    // (every 10 and every 20): the row read is the one with the newest close, then the newest quote
    const two = newestStats([{ ...member, idx: "TOPIX", q_time: "2026-11-24T01:23:00+00:00" }, member, { ...nvda }, { ...member, idx: "OLD", d: "2026-11-19", q_time: "2026-11-24T01:40:00+00:00" }]);
    ck("W-1: of a name's rows in two lists the one with the newest close, then the newest quote, is read", two.get("7203.T")?.idx === "NK225" && two.get("NVDA")?.symbol === "NVDA" && two.size === 2, [...two.values()].map((r) => [r.idx, r.symbol]));
    // W-1's check (F2-1): the Nikkei 225's quotes (read at :x0) and TOPIX's (:03, :23, :43) take turns at being the newest
    // during Tokyo's session, and the two lists' rows can carry different names and sectors (each list's own, until the
    // sector job fills its row). The figures stay the newest row's; the name and sector are the first list's of a fixed
    // order (NAME_ORDER, as INDEX_IDS in constituents.ts: the S&P 500, the Nikkei 225, the Nasdaq-100, TOPIX, ...), so a
    // row is not renamed or moved to another sector between refreshes, in whichever order the database returns the rows
    const nk = { ...member, name: "TOYOTA MOTOR CORP.", sector: "Technology" }, tp = { ...member, idx: "TOPIX", name: "トヨタ自動車", sector: "自動車・輸送機" };
    const quoteAt = (r: typeof member, t: string, px: number) => ({ ...r, q_time: t, q_price: px });
    const turns = [[quoteAt(nk, "2026-11-24T01:30:00+00:00", 3500), quoteAt(tp, "2026-11-24T01:43:00+00:00", 3510)], [quoteAt(tp, "2026-11-24T01:43:00+00:00", 3510), quoteAt(nk, "2026-11-24T01:50:00+00:00", 3520)]];
    const seen = turns.flatMap((rows) => [rows, [...rows].reverse()].map((rs) => { const s = newestStats(rs).get("7203.T")!, w = watchRowFromStat(s, "JPY", tokyo); return { idx: s.idx, name: w.name, sector: w.sector, last: w.last, asOf: w.asOf }; }));
    const usBy = newestStats([{ ...nvda, idx: "NDX", name: "NVIDIA Corp", sector: "Technology", q_time: "2026-11-24T15:10:00+00:00", q_price: 183 }, { ...nvda, sector: "Information Technology", q_time: "2026-11-24T15:00:00+00:00" }]).get("NVDA");
    const consts = readText(new URL("../supabase/functions/_shared/constituents.ts", import.meta.url), "utf8"), ids = /export const INDEX_IDS: IndexId\[\] = \[([^\]]*)\]/.exec(consts)?.[1].replace(/[\s"]/g, "").split(",") ?? [];
    ck("W-1 (F2-1): a name in two lists keeps one name and sector whichever list's quote is the newer (the Nikkei 225's before TOPIX's, the S&P 500's before the Nasdaq-100's: the order of constituents.ts INDEX_IDS), with the newest row's figures, in either order of the rows",
      seen.every((r) => r.name === "TOYOTA MOTOR CORP." && r.sector === "Technology") && seen.map((r) => `${r.idx} ${r.last} ${r.asOf}`).join() === ["TOPIX 3510 2026-11-24T01:43:00+00:00", "TOPIX 3510 2026-11-24T01:43:00+00:00", "NK225 3520 2026-11-24T01:50:00+00:00", "NK225 3520 2026-11-24T01:50:00+00:00"].join()
        && usBy?.idx === "NDX" && usBy.q_price === 183 && usBy.name === "NVIDIA Corporation" && usBy.sector === "Information Technology" && JSON.stringify(ids) === JSON.stringify(NAME_ORDER), { seen, usBy, ids, NAME_ORDER });
    const api = readText(new URL("../supabase/functions/api/index.ts", import.meta.url), "utf8");
    // since L-2 (rebased on this, 24 Nov 2026) the route reads the limit chip's columns first where the database has them,
    // then the quote's, then the closes, moving on at any failure as W-1's try and catch did (selectCols with no fallBack),
    // and builds the row through watchRowWithLim, which is this mapping with `lim` from the same row ([AP])
    ck("W-1: the route reads the quote's columns where the database has them (else the closes, as index_stats does), the newest row of each name, and builds a member's row with this mapping, dated by its list's exchange",
      /selectCols<StatLike & LimitStat>\(\(cols\) => db\.from\("constituent_stats"\)\.select\(cols\)\.in\("symbol", syms\)\.order\("symbol"\), \[COLS \+ ",prev,volume,q_price,q_prev,q_time," \+ LIMIT_COLS\.join\(","\), COLS \+ ",q_price,q_prev,q_time", COLS\]\),\n/.test(api)
        && /const sBy = newestStats\(stats\);/.test(api) && /if \(s\) return watchRowWithLim\(s, CCY\[s\.idx\] \?\? null, \(iso\) => localDate\(LIST_TZ\[s\.idx\] \?\? "UTC", Date\.parse\(iso\) \/ 1000\), lc\);/.test(api)
        && /export function watchRowWithLim\([^\n]*?\) \{\n  const row = watchRowFromStat\(s, ccy, sessionDate\);\n  return withLim\(row, /.test(readText(new URL("../supabase/functions/_shared/watchrow.ts", import.meta.url), "utf8")));
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
    // D-67: the US Treasury publishes its curve on the day itself; the others a day late (Help, "Curves")
    const ust = sigmaTip(tr({ symbol: "UST2Y", group: "rates", cls: "Fixed income", source: "treasury", lastAt: "2026-11-20T00:00:00Z", sd1d: 0.058, z1d: -1.1 })), bund = sigmaTip(tr({ symbol: "DE10Y", group: "rates", cls: "Fixed income", source: "curve", lastAt: "2026-11-19T00:00:00Z", sd1d: 0.04, z1d: 0.4 }));
    ck(`a US Treasury yield's does not say "a day late": "…${ust.split(" · ").slice(1).join(" · ")}"; a Bund's keeps it`, /\(US Treasury\) · measured on 20 Nov 2026's close, its newest published day$/.test(ust) && !/a day late/.test(ust) && /\(Bundesbank\) · measured on 19 Nov 2026's close \(published a day late\)$/.test(bund));
    const rolled = sigmaTip(tr({ symbol: "GC=F", roll: { d: "2026-11-20", from: "GCZ26.CMX", to: "GCG27.CMX", step: 3 } })), unmeasured = sigmaTip(tr({ symbol: "GC=F", z1d: null, roll: { d: "2026-11-20", from: null, to: "GCG27.CMX", step: null } }));
    ck(`a roll day: "…${rolled.split(" · ").pop()}"; not measured: "${unmeasured}"`, /a change of contract today: \+3\.00% from Dec 2026 to Feb 2027, left out \(the day is the change within Feb 2027\)$/.test(rolled) && /^A change of contract today \(to Feb 2027\): .* has no σ$/.test(unmeasured));
    const none = (o: Partial<TableRow>) => sigmaTip(tr({ z1d: null, ...o }));
    ck(`a cell without a σ says why: "${none({ sd1d: null, zN: 12 })}"; "${none({ sd1d: null, zN: 63 })}"; "${none({ sd1d: 0.6 })}"; from a server before I-6: "${sigmaTip(tr({ z1d: undefined }))}"`, none({ sd1d: null, zN: 12 }) === "No σ: 12 daily changes stored, 60 needed" && none({ sd1d: null, zN: 63 }) === "No σ: its 63 daily changes before the day do not move" && none({ sd1d: null, zN: null }) === "No σ: fewer than 60 daily changes stored" && none({ sd1d: 0.6 }) === "No σ: there is no close to measure the day's change from" && sigmaTip(tr({ z1d: undefined })) === "No σ yet: the server sends it with the table once its update is deployed");
    ck("a contract's month and code by CME's month codes, as the server reads them", monthOf("CLF27.NYM") === "Jan 2027" && monthOf("ZNZ26.CBT") === contractName("ZNZ26.CBT")?.label && monthOf("XYZ") === "XYZ" && monthOf(null) === "–" && codeOf("CLF27.NYM") === "CLF27" && rollWords("CLZ26.NYM", "CLF27.NYM") === "roll from Dec to Jan" && rollWords(null, "ESZ26.CME") === "roll to Dec");
    const fi = futuresInfo({ d: "2026-11-20", contract: "CLF27.NYM", expires: "2026-12-21", seen_at: "2026-11-20T12:38:00Z" }, [{ d: "2026-10-21", from_contract: null, to_contract: "CLZ26.NYM", prev_close: null, source: "probe" }, { d: "2026-11-20", from_contract: "CLZ26.NYM", to_contract: "CLF27.NYM", prev_close: 82.44, source: "probe" }], "2026-11-20", [{ t: Date.parse("2026-11-19T00:00:00Z") / 1000, c: 83.21 }]);
    ck(`the page's lines for CL=F: "${contractLine(fi, "2026-11-20")}"; "${lastRollLine(fi)}"`, contractLine(fi, "2026-11-20") === "Jan 2027 (CLF27) · expires 21 Dec 2026" && contractLine(fi, "2026-12-21") === "Jan 2027 (CLF27) · expires 21 Dec 2026" && contractLine(fi, "2026-12-22") === "Jan 2027 (CLF27) · expired 21 Dec 2026" && lastRollLine(fi) === "20 Nov 2026 · Dec 2026 \u2192 Jan 2027 · step -0.93%, left out" && lastRoll(fi).main === "20 Nov 2026 · Dec 2026 \u2192 Jan 2027" && lastRoll(fi).sub === "step -0.93%, left out" && lastRollLine({ ...fi, lastRoll: null, rolls: [] }) === "none recorded since 21 Oct 2026" && lastRoll({ ...fi, lastRoll: null, rolls: [] }).sub === null && lastRollLine({ ...fi, lastRoll: { ...fi.lastRoll!, fromMonth: null, step: null } }) === "20 Nov 2026 · a contract no longer listed \u2192 Jan 2027 · step not measured" && lastRoll(undefined).main === "–" && contractLine(undefined) === "–" && contractLine({ ...fi, expires: "2021-10-01", seen: "2021-08-11" }, "2026-11-20") === "Jan 2027 (CLF27) · expired 1 Oct 2021" && contractLine({ ...fi, expires: null }, "2026-11-20") === "Jan 2027 (CLF27)");
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
    ck(`its tooltip says why, and what Yahoo marks: "…${tip7203.split("; ")[1]?.split(". No time")[0]}"`, /; marked est\.: a Tokyo company's date is confirmed by JPX's results calendar \(決算発表予定日\), which the Monitor does not read yet \(Yahoo marks it confirmed\)\. No time of day/.test(tip7203) && /\(no mark of Yahoo's held: it gives none, or the Monitor has not read it again since 22 Nov 2026\)\. No time of day/.test(tipNk) && /the day in New York, where the company is listed; confirmed, as Yahoo marks it\./.test(resultsTip("NVDA", false)) && /the day in New York, where the company is listed; no mark held: the source gives none, or the Monitor has not read it again since 22 Nov 2026\. No time of day/.test(resultsTip("NVDA", null)), { tip7203, tipNk, nvdaNull: resultsTip("NVDA", null) });
    ck(`the line under a list of marks: "${MARKS_NOTE}"`, /^conf\. or est\. as Yahoo marks the date; a Tokyo company's est\. until JPX's own calendar is read$/.test(MARKS_NOTE));
    // S4: a future's 1D in σ says from when its changes of contract are left out (a change before the record stays in)
    const futRow = { symbol: "CL=F", name: "WTI crude", cls: "Commodities", group: "cmdty", market: "NYMEX", currency: "USD", decimals: 2, order: 36, last: 80, lastAt: "2026-11-20T14:00:00Z", live: true, source: "yahoo", closes: { d1: 79 }, closeDates: { d1: "2026-11-19" }, pct: { d1: 1.27 }, chg: { d1: 1 }, z1d: 0.9, sd1d: 1.4, zFrom: "2026-08-20", zTo: "2026-11-19", zN: 63, z1m: 0.1, pos52: 40, vs200: 1, marketTab: true, chart: true, contract: "CLF27.NYM", roll: null } as unknown as TableRow;
    const ftip = sigmaTip(futRow), xtip = sigmaTip({ ...futRow, symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", contract: null } as TableRow);
    ck(`S4: a future's 1D in σ says its changes of contract are left out only from when the Monitor records them ("…${ftip.split(" · ").pop()}"); a currency's says nothing of contracts`, /its changes of contract are left out from when the Monitor records them; any before stay in \(its page says from when\)$/.test(ftip) && !/contract/.test(xtip), { ftip, xtip });
    // S2: the contract's source and when it was read, under it on both layouts
    ck(`S2: under a future's contract: "${contractSource({ source: "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol)", seenAt: "2026-11-20T17:38:00Z" })}"`, contractSource({ source: "Yahoo Finance (unofficial) quote: the contract it names (underlyingSymbol)", seenAt: "2026-11-20T17:38:00Z" }) === "Yahoo Finance (unofficial) · read 21 Nov 01:38 SGT" && contractSource({ source: "Yahoo Finance (unofficial) quote: x", seenAt: null }) === "Yahoo Finance (unofficial)");
  }

  console.log("\n[AA] when a closed market opens (the owner's request of 20 Nov 2026): the next open from the session table, in each market's own time zone");
  {
    const u = (iso: string) => new Date(iso), z = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16) + "Z" : null);
    // the calendar the Monitor holds: the rows its two migrations write, read here from the files themselves
    const cal: Record<string, string[]> = {};
    for (const f of ["20261107000002_seed.sql", "20261107000010_holidays_verified.sql"]) for (const m of readText(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8").matchAll(/\('(TSE|NYSE)',\s*'(\d{4}-\d{2}-\d{2})'/g)) (cal[m[1]] ??= []).includes(m[2]) || cal[m[1]].push(m[2]);
    for (const k of Object.keys(cal)) cal[k].sort();
    const H: web.HolidayMap = { TSE: new Set(cal.TSE), NYSE: new Set(cal.NYSE) }, HS = { TSE: new Set(cal.TSE), NYSE: new Set(cal.NYSE) };
    const OK: Cal = { holidays: H, state: "ok" };
    const next = (id: web.MarketId, iso: string, c: Cal = OK) => web.nextOpen(web.marketById(id), u(iso), c.holidays, c.state);
    const ses = (id: string, iso: string, c: Cal = OK) => marketSession(id, u(iso), c);

    // --- the two copies of the table, and the calendar ---
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const byId = (ms: Array<{ id: string }>) => [...ms].sort((a, b) => a.id.localeCompare(b.id));
    ck(`the page's and the server's session tables are the same ${web.MARKETS.length} markets: zone, sessions, days and feed delay`, same(byId(web.MARKETS), byId(srv.MARKETS)));
    ck(`their early closes are the same (${Object.entries(web.EARLY_CLOSES).map(([k, v]) => `${k}: ${Object.keys(v!).join(", ")}`).join("; ")}), all at 13:00 local`, same(web.EARLY_CLOSES, srv.EARLY_CLOSES) && Object.values(web.EARLY_CLOSES.NYSE!).every((x) => x === 13 * 60) && same(Object.keys(web.EARLY_CLOSES.NYSE!), ["2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24"]), web.EARLY_CLOSES);
    ck(`and whose holidays the Monitor holds: ${Object.entries(web.HOLIDAY_SOURCES).map(([k, v]) => `${k} from ${v!.publisher}, read ${v!.read}, to ${v!.through}`).join("; ")}`, same(web.HOLIDAY_SOURCES, srv.HOLIDAY_SOURCES) && same(Object.keys(web.HOLIDAY_SOURCES).sort(), ["NYSE", "TSE"]));
    ck(`the calendar's rows (${cal.TSE.length} for Tokyo, ${cal.NYSE.length} for New York) are every one inside what is held, and no other market has any`, cal.TSE.length === 36 && cal.NYSE.length === 20 && [...cal.TSE, ...cal.NYSE].every((d) => d >= "2026-01-01" && d <= "2027-12-31") && Object.keys(cal).length === 2, { tse: cal.TSE.length, nyse: cal.NYSE.length });
    ck("the two days the round asked about are in it: Tokyo shut on Mon 23 Nov 2026, New York on Thu 26 Nov 2026", cal.TSE.includes("2026-11-23") && cal.NYSE.includes("2026-11-26"));
    // NYSE's page as the source-probe pf_rules printed it on 20 Nov 2026 (run 44737850579), its four rows word for word:
    //   "Juneteenth National Independence Day | Friday, June 19 | Friday, June 18 (Juneteenth National Independence Day observed) | Monday, June 19 |"
    //   "Independence Day | Friday, July 3 (Independence Day observed) | Monday, July 5 (Independence Day observed) | Tuesday, July 4** |"
    //   "Thanksgiving Day | Thursday, November 26*** | Thursday, November 25*** | Thursday, November 23*** |"
    //   "Christmas Day | Friday, December 25**** | Friday, December 24 (Christmas Day observed) | Monday, December 25 |"
    const printed = ["2026-06-19", "2027-06-18", "2026-07-03", "2027-07-05", "2026-11-26", "2027-11-25", "2026-12-25", "2027-12-24"];
    ck("the eight days of 2026 and 2027 that NYSE's page gave the probe of 20 Nov 2026 are rows of the calendar (Thanksgiving 2026 among them), and its early closes fall on none of them", printed.every((d) => cal.NYSE.includes(d)) && Object.keys(web.EARLY_CLOSES.NYSE!).every((d) => !cal.NYSE.includes(d) && [1, 2, 3, 4, 5].includes(new Date(d + "T12:00:00Z").getUTCDay())), printed.filter((d) => !cal.NYSE.includes(d)));
    ck("the local copy passes over the same days: its calendar is those rows, from two days back on, as the server's health sends them", same(mockHolidays(Date.parse("2026-01-01T00:00:00Z")), cal) && same(mockHolidays(Date.parse("2026-11-21T00:00:00Z")), { TSE: cal.TSE.filter((d) => d >= "2026-11-19"), NYSE: cal.NYSE.filter((d) => d >= "2026-11-19") }));
    // every market, every half hour, over the weeks that hold a change of clocks, a holiday or an early close
    let diff = 0, seen = 0; const where: string[] = [];
    for (const [from, to] of [["2026-03-05", "2026-03-11"], ["2026-10-22", "2026-11-04"], ["2026-11-19", "2026-12-02"], ["2026-12-23", "2027-01-05"], ["2027-03-11", "2027-03-17"], ["2027-03-25", "2027-03-31"]]) {
      for (let t = Date.parse(from + "T00:00:00Z"); t < Date.parse(to + "T00:00:00Z"); t += 30 * 60e3) for (const m of web.MARKETS) {
        const a = web.marketStatus(m, new Date(t), H).state, b = srv.marketState(srv.marketById(m.id)!, new Date(t), HS); seen++;
        if (a !== b) { diff++; if (where.length < 4) where.push(`${m.id} ${new Date(t).toISOString()} ${a}/${b}`); }
      }
    }
    ck(`the two copies give the same state for every market at every half hour of six such stretches (${seen} readings)`, diff === 0 && seen > 30000, where);
    // The FX week (the reviewer's O-1): both tables against the server's own rule for when currencies trade (fxTrading,
    // feedhealth.ts: Sunday 17:00 to Friday 17:00 New York), at every half hour of 2026 and 2027, so across both
    // changes of New York's clocks in each year. fxTrading also knows 25 December and 1 January (New York's dates),
    // which the session table does not hold: on those two days the tables keep the weekly timetable.
    let fxDiff = 0, fxSeen = 0, fxShut = 0; const fxWhere: string[] = [];
    const nyDay = (t: number) => srv.partsIn("America/New_York", new Date(t)).ymd.slice(5);
    for (let t = Date.parse("2026-01-01T00:00:00Z"); t < Date.parse("2028-01-01T00:00:00Z"); t += 30 * 60e3) {
      const md = nyDay(t), a = web.marketStatus(web.marketById("FX"), new Date(t), H).state, b = srv.marketState(srv.marketById("FX")!, new Date(t), HS);
      if (md === "12-25" || md === "01-01") { fxShut++; continue; }
      fxSeen++;
      if ((a === "OPEN") !== fxTrading(t) || (b === "OPEN") !== fxTrading(t)) { fxDiff++; if (fxWhere.length < 4) fxWhere.push(`${new Date(t).toISOString()} page ${a} server ${b} fxTrading ${fxTrading(t)}`); }
    }
    ck(`both tables call FX open exactly when the server's fxTrading says currencies trade, at every half hour of 2026 and 2027 (${fxSeen} readings; ${fxShut} more on 25 Dec and 1 Jan, which the tables do not hold)`, fxDiff === 0 && fxSeen > 34000 && fxShut === 4 * 48, fxWhere);
    // … and to the minute at the four edges of the week in each season
    const fxAt = (iso: string) => [web.marketStatus(web.marketById("FX"), u(iso), H).state, srv.marketState(srv.marketById("FX")!, u(iso), HS), fxTrading(Date.parse(iso)) ? "OPEN" : "CLOSED"].join("/");
    ck(`to the minute: in New York's winter the week opens at Mon 06:00 SGT and closes at Sat 06:00 SGT (${fxAt("2026-11-22T21:59:00Z")}, ${fxAt("2026-11-22T22:00:00Z")}, ${fxAt("2026-11-27T21:59:00Z")}, ${fxAt("2026-11-27T22:00:00Z")}); in its summer at Mon 05:00 and Sat 05:00 SGT (${fxAt("2026-07-19T20:59:00Z")}, ${fxAt("2026-07-19T21:00:00Z")}, ${fxAt("2026-07-17T20:59:00Z")}, ${fxAt("2026-07-17T21:00:00Z")})`,
      fxAt("2026-11-22T21:59:00Z") === "CLOSED/CLOSED/CLOSED" && fxAt("2026-11-22T22:00:00Z") === "OPEN/OPEN/OPEN" && fxAt("2026-11-27T21:59:00Z") === "OPEN/OPEN/OPEN" && fxAt("2026-11-27T22:00:00Z") === "CLOSED/CLOSED/CLOSED"
      && fxAt("2026-07-19T20:59:00Z") === "CLOSED/CLOSED/CLOSED" && fxAt("2026-07-19T21:00:00Z") === "OPEN/OPEN/OPEN" && fxAt("2026-07-17T20:59:00Z") === "OPEN/OPEN/OPEN" && fxAt("2026-07-17T21:00:00Z") === "CLOSED/CLOSED/CLOSED");
    const syms = ["7203.T", "0700.HK", "005930.KS", "035720.KQ", "600519.SS", "000001.SZ", "2330.TW", "RELIANCE.NS", "D05.SI", "BHP.AX", "SAP.DE", "NESN.SW", "SHEL.L", "PETR4.SA", "WALMEX.MX", "NVDA", "BRK-B", "MC.PA", "RY.TO", "^N225", "USDJPY=X", "GC=F", "BTC-USD", ""];
    ck("a stock's exchange is read from its symbol the same way on the page and on the server; an exchange outside the table (Paris, Toronto) gives none", syms.every((x) => web.stockMarket(x) === stockMarket(x)) && web.stockMarket("MC.PA") === null && web.stockMarket("RY.TO") === null && web.stockMarket("7203.T") === "TSE" && web.stockMarket("NVDA") === "NYSE", syms.filter((x) => web.stockMarket(x) !== stockMarket(x)));

    // --- the owner's moment ---
    const own = next("NYSE", "2026-11-20T13:16:00Z"), ownS = ses("NYSE", "2026-11-20T13:16:00Z");
    ck(`Fri 20 Nov 2026, 21:16 SGT: New York is shut and opens at 22:30 SGT, 09:30 there since its clocks went back on 1 Nov ("${ownS.note?.text}")`, z(own?.at) === "2026-11-20T14:30Z" && own!.firm && ownS.now === "closed" && ownS.note?.text === "opens 22:30 SGT" && !ownS.note.scheduled, { at: z(own?.at), text: ownS.note?.text });
    ck(`its tooltip says whose calendar: "${ownS.note?.tip}"`, ownS.note?.tip === "New York: regular session 09:30–16:00 ET. Next opens 20 Nov 22:30 SGT. Holidays and early closes: NYSE's calendar.", ownS.note?.tip);

    // --- the changes of clocks, by each market's own zone ---
    const dst: Array<[web.MarketId, string, string, string]> = [
      ["NYSE", "2026-03-05T22:00:00Z", "2026-03-06T14:30Z", "the Friday before New York's clocks go forward on 8 Mar 2026: 22:30 SGT"],
      ["NYSE", "2026-03-06T22:00:00Z", "2026-03-09T13:30Z", "the Monday after: 21:30 SGT"],
      ["NYSE", "2026-10-29T21:00:00Z", "2026-10-30T13:30Z", "the Friday before they go back on 1 Nov 2026: 21:30 SGT"],
      ["NYSE", "2026-10-30T21:00:00Z", "2026-11-02T14:30Z", "the Monday after: 22:30 SGT"],
      ["NYSE", "2027-03-11T22:00:00Z", "2027-03-12T14:30Z", "the Friday before they go forward on 14 Mar 2027: 22:30 SGT"],
      ["NYSE", "2027-03-12T22:00:00Z", "2027-03-15T13:30Z", "the Monday after: 21:30 SGT"],
      ["XETRA", "2026-10-22T18:00:00Z", "2026-10-23T07:00Z", "Frankfurt, the Friday before Europe's clocks go back on 25 Oct 2026: 15:00 SGT"],
      ["XETRA", "2026-10-23T18:00:00Z", "2026-10-26T08:00Z", "the Monday after: 16:00 SGT"],
      ["LSE", "2026-10-22T18:00:00Z", "2026-10-23T07:00Z", "London, the Friday before: 15:00 SGT"],
      ["LSE", "2026-10-23T18:00:00Z", "2026-10-26T08:00Z", "the Monday after: 16:00 SGT"],
      ["SIX", "2026-10-23T18:00:00Z", "2026-10-26T08:00Z", "Zurich, the Monday after: 16:00 SGT"],
      ["XETRA", "2027-03-25T18:00:00Z", "2027-03-26T08:00Z", "Frankfurt, the Friday before they go forward on 28 Mar 2027: 16:00 SGT"],
      ["XETRA", "2027-03-26T18:00:00Z", "2027-03-29T07:00Z", "the Monday after: 15:00 SGT"],
      ["LSE", "2027-03-25T18:00:00Z", "2027-03-26T08:00Z", "London, the Friday before: 16:00 SGT"],
      ["LSE", "2027-03-26T18:00:00Z", "2027-03-29T07:00Z", "the Monday after: 15:00 SGT"],
      ["ASX", "2026-10-02T08:00:00Z", "2026-10-04T23:00Z", "Sydney, across its own change on 4 Oct 2026 (10:00 there): Mon 07:00 SGT"],
    ];
    for (const [id, at0, want, what] of dst) { const n = next(id, at0); ck(`${what} (${id} after ${at0.slice(0, 16)}Z -> ${z(n?.at)})`, z(n?.at) === want, { got: z(n?.at), want }); }
    ck("a market with no change of clocks keeps its hour all year: Tokyo opens at 08:00 SGT in March, July and November", ["2026-03-09T10:00:00Z", "2026-07-14T10:00:00Z", "2026-11-17T10:00:00Z"].every((t) => next("TSE", t)!.at.toISOString().slice(11, 16) === "00:00"));

    // --- a Friday close ---
    const fri = next("NYSE", "2026-11-20T21:00:00Z"), cme = next("CME", "2026-11-20T22:00:00Z"), cmeS = next("CME", "2026-07-17T21:00:00Z"), fx = next("FX", "2026-11-20T22:00:00Z");
    ck(`New York after Friday's close opens on Monday (${z(fri?.at)} = 23 Nov 22:30 SGT)`, z(fri?.at) === "2026-11-23T14:30Z" && fri!.firm);
    ck(`CME Globex after Friday 17:00 New York opens on Sunday evening there: Mon 07:00 SGT in winter (${z(cme?.at)}), Mon 06:00 SGT in summer (${z(cmeS?.at)}); scheduled, its holidays are not held`, z(cme?.at) === "2026-11-22T23:00Z" && z(cmeS?.at) === "2026-07-19T22:00Z" && !cme!.firm && !cmeS!.firm);
    ck(`CME's daily break ends at 18:00 New York the same day (${z(next("CME", "2026-11-24T22:30:00Z")?.at)}), and a Sunday before 18:00 opens that evening`, z(next("CME", "2026-11-24T22:30:00Z")?.at) === "2026-11-24T23:00Z" && next("CME", "2026-11-24T22:30:00Z")!.why === "break" && z(next("CME", "2026-11-22T15:00:00Z")?.at) === "2026-11-22T23:00Z");
    // the FX week by New York's clock (O-1): the line of this weekend, of a summer weekend, and across each change of clocks
    const fxN = (iso: string) => z(next("FX", iso)?.at), fxLine = (iso: string) => ses("FX", iso).note?.text;
    ck(`FX after Friday 17:00 New York opens on Sunday at 17:00 there: Mon 23 Nov 06:00 SGT in New York's winter (${z(fx?.at)}, "${fxLine("2026-11-21T02:00:00Z")}"), scheduled; on Monday at 05:30 SGT it is still shut ("${fxLine("2026-11-22T21:30:00Z")}"), from 06:00 open`, z(fx?.at) === "2026-11-22T22:00Z" && !fx!.firm && fxLine("2026-11-21T02:00:00Z") === "opens 23 Nov 06:00 SGT, scheduled" && fxN("2026-11-22T20:00:00Z") === "2026-11-22T22:00Z" && fxN("2026-11-22T21:30:00Z") === "2026-11-22T22:00Z" && fxLine("2026-11-22T21:30:00Z") === "opens 06:00 SGT, scheduled" && next("FX", "2026-11-22T22:00:00Z") === null && ses("FX", "2026-11-22T22:30:00Z").now === "open");
    ck(`in New York's summer the week opens at Mon 05:00 SGT ("${fxLine("2026-07-18T04:00:00Z")}") and closes at Sat 05:00 SGT (at 05:10 SGT: "${fxLine("2026-07-17T21:10:00Z")}")`, fxN("2026-07-18T04:00:00Z") === "2026-07-19T21:00Z" && fxLine("2026-07-18T04:00:00Z") === "opens 20 Jul 05:00 SGT, scheduled" && ses("FX", "2026-07-17T21:10:00Z").now === "closed" && fxLine("2026-07-17T21:10:00Z") === "opens 20 Jul 05:00 SGT, scheduled" && ses("FX", "2026-07-17T20:50:00Z").now === "open");
    ck(`across New York's changes of clocks: the weekend of 1 Nov 2026 opens at Mon 06:00 SGT (${fxN("2026-10-31T04:00:00Z")}), the one before at 05:00 (${fxN("2026-10-24T04:00:00Z")}); the weekend of 14 Mar 2027 at Mon 05:00 SGT (${fxN("2027-03-13T04:00:00Z")}), the one before at 06:00 (${fxN("2027-03-06T04:00:00Z")}); 8 Mar 2026 at 05:00 (${fxN("2026-03-07T04:00:00Z")})`, fxN("2026-10-31T04:00:00Z") === "2026-11-01T22:00Z" && fxN("2026-10-24T04:00:00Z") === "2026-10-25T21:00Z" && fxN("2027-03-13T04:00:00Z") === "2027-03-14T21:00Z" && fxN("2027-03-06T04:00:00Z") === "2027-03-07T22:00Z" && fxN("2026-03-07T04:00:00Z") === "2026-03-08T21:00Z");
    // every opening the page can write for FX is a moment at which fxTrading turns true: every half hour of two years
    let fxBad = 0, fxAsked = 0; const fxOff: string[] = [];
    for (let t = Date.parse("2026-01-01T00:00:00Z"); t < Date.parse("2028-01-01T00:00:00Z"); t += 30 * 60e3) {
      const n = web.nextOpen(web.marketById("FX"), new Date(t), H, "ok"); if (!n) continue; fxAsked++;
      const o = n.at.getTime(), md = nyDay(o);
      if (md === "12-25" || md === "01-01") continue;   // the two days fxTrading knows and the tables do not
      if (!(fxTrading(o) && !fxTrading(o - 60e3) && o > t && o - t <= 49 * 3600e3)) { fxBad++; if (fxOff.length < 4) fxOff.push(`${new Date(t).toISOString()} -> ${n.at.toISOString()}`); }
    }
    ck(`whenever FX is shut, the opening the page gives is the minute fxTrading turns true, never more than 49 hours ahead (${fxAsked} readings over 2026 and 2027)`, fxBad === 0 && fxAsked > 9000, fxOff);

    // --- a midday break ---
    const brk: Array<[web.MarketId, string, string]> = [["TSE", "2026-11-24T02:45:00Z", "2026-11-24T03:30Z"], ["HKEX", "2026-11-24T04:30:00Z", "2026-11-24T05:00Z"], ["SSE", "2026-11-24T04:00:00Z", "2026-11-24T05:00Z"], ["SGX", "2026-11-24T04:30:00Z", "2026-11-24T05:00Z"]];
    for (const [id, at0, want] of brk) { const n = next(id, at0), s0 = ses(id, at0); ck(`${web.marketById(id).name} in its midday break opens for the afternoon the same day ("${s0.note?.text}")`, web.marketStatus(web.marketById(id), u(at0), H).state === "BREAK" && z(n?.at) === want && n!.why === "break" && s0.now === "closed" && /^opens \d\d:\d\d SGT(, scheduled)?$/.test(s0.note?.text ?? ""), { got: z(n?.at), text: s0.note?.text }); }
    ck(`Tokyo's is said plainly, Hong Kong's as scheduled: "${ses("TSE", "2026-11-24T02:45:00Z").note?.text}", "${ses("HKEX", "2026-11-24T04:30:00Z").note?.text}"; the tooltip says "In its midday break."`, ses("TSE", "2026-11-24T02:45:00Z").note?.text === "opens 11:30 SGT" && ses("HKEX", "2026-11-24T04:30:00Z").note?.text === "opens 13:00 SGT, scheduled" && / In its midday break\. /.test(ses("TSE", "2026-11-24T02:45:00Z").note?.tip ?? ""));

    // --- a market that never closes ---
    ck("crypto never closes: no next open and no line at any hour of a week", Array.from({ length: 7 * 24 }, (_, k) => u(new Date(Date.parse("2026-11-16T00:30:00Z") + k * 3600e3).toISOString())).every((t) => web.nextOpen(web.marketById("CRYPTO"), t, H, "ok") === null && marketSession("CRYPTO", t, OK).note === null && marketSession("CRYPTO", t, OK).now === "unknown"));
    ck("a market that is open has no next open, only since when its session began", next("NYSE", "2026-11-20T15:00:00Z") === null && next("TSE", "2026-11-20T01:00:00Z") === null && z(web.openSince(web.marketById("TSE"), u("2026-11-24T00:05:00Z"), H, "ok")?.at) === "2026-11-24T00:00Z" && z(web.openSince(web.marketById("TSE"), u("2026-11-24T04:00:00Z"), H, "ok")?.at) === "2026-11-24T03:30Z" && z(web.openSince(web.marketById("FX"), u("2026-11-24T15:00:00Z"), H, "ok")?.at) === "2026-11-22T22:00Z" && z(web.openSince(web.marketById("FX"), u("2026-11-24T15:00:00Z"), H, "ok")?.end) === "2026-11-27T22:00Z" && z(web.openSince(web.marketById("FX"), u("2026-07-15T15:00:00Z"), H, "ok")?.at) === "2026-07-12T21:00Z" && z(web.openSince(web.marketById("CME"), u("2026-11-24T15:00:00Z"), H, "ok")?.at) === "2026-11-23T23:00Z" && web.openSince(web.marketById("NYSE"), u("2026-11-20T13:16:00Z"), H, "ok") === null);

    // --- holidays: no opening is promised on a day the calendar gives as shut ---
    const tk = next("TSE", "2026-11-20T08:00:00Z"), tkS = ses("TSE", "2026-11-23T01:00:00Z"), ny = next("NYSE", "2026-11-25T21:30:00Z"), ye = next("TSE", "2026-12-30T08:00:00Z");
    ck(`Tokyo after Friday 20 Nov's close opens on Tue 24 Nov at 08:00 SGT, not on Monday the 23rd, a holiday in JPX's calendar (${z(tk?.at)}; passed over: ${tk?.skipped})`, z(tk?.at) === "2026-11-24T00:00Z" && tk!.firm && same(tk!.skipped, ["2026-11-23"]));
    ck(`on that Monday at 10:00 Tokyo time it is a holiday there, and the line reads "${tkS.note?.text}"; the tooltip "${tkS.note?.tip}"`, web.marketStatus(web.marketById("TSE"), u("2026-11-23T01:00:00Z"), H).state === "HOLIDAY" && tkS.now === "closed" && tkS.note?.text === "opens 24 Nov 08:00 SGT" && tkS.note.tip === "Tokyo: regular session 09:00–11:30, 12:30–15:30 JST. Shut today: a holiday in JPX's calendar (personal use). Next opens 24 Nov 08:00 SGT. Holidays: JPX's.");   // "(personal use)" once (DP-5 of the final review of pull request #50)
    ck(`New York after Wednesday 25 Nov's close opens on Friday the 27th, not on Thanksgiving (${z(ny?.at)}; passed over: ${ny?.skipped}); the tooltip names the day`, z(ny?.at) === "2026-11-27T14:30Z" && ny!.firm && same(ny!.skipped, ["2026-11-26"]) && /26 Nov 2026: a holiday in NYSE's calendar\. Next opens 27 Nov 22:30 SGT\./.test(ses("NYSE", "2026-11-25T21:30:00Z").note?.tip ?? ""));
    ck(`Tokyo after 30 Dec 2026 opens on Mon 4 Jan 2027: 31 Dec and 1 Jan are holidays there, then a weekend (${z(ye?.at)}; passed over: ${ye?.skipped})`, z(ye?.at) === "2027-01-04T00:00Z" && ye!.firm && same(ye!.skipped, ["2026-12-31", "2027-01-01"]));
    const hk = ses("HKEX", "2026-11-20T13:16:00Z"), far = ses("NYSE", "2027-12-31T22:00:00Z"), none = ses("NYSE", "2026-11-20T13:16:00Z", { holidays: {}, state: "none" }), bare = ses("NYSE", "2026-11-20T13:16:00Z", { holidays: {}, state: "ok" });
    ck(`a market whose holidays the Monitor does not hold is given its scheduled time, and says so: "${hk.note?.text}" ("${hk.note?.tip}")`, hk.note?.text === "opens 23 Nov 09:30 SGT, scheduled" && hk.note.scheduled && hk.note.tip === "Hong Kong: regular session 09:30–12:00, 13:00–16:00 HKT. Scheduled to open 23 Nov 09:30 SGT. The Monitor does not hold this market's holidays: on one the market stays shut.");
    ck(`so is every market but Tokyo and New York: ${web.MARKETS.filter((m) => m.id !== "CRYPTO" && ses(m.id, "2026-11-21T02:00:00Z").note?.scheduled).map((m) => m.id).join(" ")}`, same(web.MARKETS.filter((m) => m.id !== "CRYPTO" && ses(m.id, "2026-11-21T02:00:00Z").note?.scheduled).map((m) => m.id).sort(), web.MARKETS.map((m) => m.id).filter((id) => !["TSE", "NYSE", "CRYPTO"].includes(id)).sort()) && !ses("TSE", "2026-11-21T02:00:00Z").note!.scheduled && !ses("NYSE", "2026-11-21T02:00:00Z").note!.scheduled);
    ck(`after the last day held, New York's too: "${far.note?.text}" ("…${far.note?.tip.split(". ").slice(-1)[0]}")`, far.note?.text === "opens 3 Jan 22:30 SGT, scheduled" && /The Monitor holds NYSE's calendar to 31 Dec 2027: on a holiday after it the market stays shut\.$/.test(far.note.tip));
    ck(`and when the calendar did not come, or carries no row for the market: "${none.note?.text}" ("…${none.note?.tip.split(". ").slice(-1)[0]}")`, none.note?.text === "opens 22:30 SGT, scheduled" && /could not be loaded/.test(none.note.tip) && bare.note?.text === "opens 22:30 SGT, scheduled");
    const wait: Cal = { holidays: {}, state: "wait" };
    ck("while the calendar is still on its way, Tokyo and New York get no line yet (today could be a holiday there), and are not called open on their hours alone; Hong Kong has its scheduled line at once", ses("NYSE", "2026-11-20T13:16:00Z", wait).note === null && ses("NYSE", "2026-11-20T13:16:00Z", wait).now === "closed" && ses("TSE", "2026-11-23T01:00:00Z", wait).note === null && ses("TSE", "2026-11-23T01:00:00Z", wait).now === "unknown" && ses("HKEX", "2026-11-20T13:16:00Z", wait).note?.text === "opens 23 Nov 09:30 SGT, scheduled");

    // --- an early close ---
    const N = web.marketById("NYSE"), SN = srv.marketById("NYSE")!;
    const st2 = (iso: string) => [web.marketStatus(N, u(iso), H).state, srv.marketState(SN, u(iso), HS)].join("/");
    ck(`Fri 27 Nov 2026, the day after Thanksgiving: New York is open at 12:59 there and closed from 13:00, on the page and on the server (${st2("2026-11-27T17:59:00Z")}, ${st2("2026-11-27T18:00:00Z")}, ${st2("2026-11-27T20:00:00Z")}); on Fri 20 Nov it is open at 13:05 (${st2("2026-11-20T18:05:00Z")})`, st2("2026-11-27T17:59:00Z") === "OPEN/OPEN" && st2("2026-11-27T18:00:00Z") === "CLOSED/CLOSED" && st2("2026-11-27T20:00:00Z") === "CLOSED/CLOSED" && st2("2026-11-20T18:05:00Z") === "OPEN/OPEN");
    const ec = next("NYSE", "2026-11-27T18:05:00Z"), ecS = ses("NYSE", "2026-11-27T18:05:00Z");
    ck(`after it the next open is Monday's ("${ecS.note?.text}"), and the tooltip says why: "${ecS.note?.tip}"`, z(ec?.at) === "2026-11-30T14:30Z" && ec!.why === "early" && ecS.note?.text === "opens 30 Nov 22:30 SGT" && / Closed early today, at 13:00 ET \(NYSE's calendar\)\. /.test(ecS.note.tip));
    ck("the server reads New York for 45 minutes after the early close, as after any close, and not after 16:00 that day", srv.recentlyClosed(SN, u("2026-11-27T18:30:00Z"), 45, HS) && !srv.recentlyClosed(SN, u("2026-11-27T18:50:00Z"), 45, HS) && !srv.recentlyClosed(SN, u("2026-11-27T21:10:00Z"), 45, HS) && srv.recentlyClosed(SN, u("2026-11-20T21:10:00Z"), 45, HS) && scanDue(SN, u("2026-11-27T18:10:00Z"), HS) && !scanDue(SN, u("2026-11-27T19:30:00Z"), HS));
    ck("the other early closes the page of NYSE gave: 24 Dec 2026 and 26 Nov 2027 close at 13:00; 24 Dec 2027 is a holiday in the calendar, not a half day", st2("2026-12-24T18:10:00Z") === "CLOSED/CLOSED" && st2("2026-12-24T17:30:00Z") === "OPEN/OPEN" && st2("2027-11-26T18:10:00Z") === "CLOSED/CLOSED" && st2("2027-12-24T15:00:00Z") === "HOLIDAY/HOLIDAY");

    // --- the words, in the Monitor's own time format ---
    ck(`today in Singapore the time alone, another day with its date: "${ses("NYSE", "2026-11-20T13:16:00Z").note?.text}", "${ses("NYSE", "2026-11-20T23:20:00Z").note?.text}", "${ses("TSE", "2026-11-20T15:59:00Z").note?.text}"`, ses("NYSE", "2026-11-20T13:16:00Z").note?.text === "opens 22:30 SGT" && ses("NYSE", "2026-11-20T23:20:00Z").note?.text === "opens 23 Nov 22:30 SGT" && ses("TSE", "2026-11-20T15:59:00Z").note?.text === "opens 24 Nov 08:00 SGT");
    ck(`"today" is Singapore's day, not the market's: on Tue 24 Nov at 06:30 SGT (Monday 17:30 in New York) CME reads "${ses("CME", "2026-11-23T22:30:00Z").note?.text}"; at 23:59 SGT Tokyo's next morning has its date ("${ses("TSE", "2026-11-24T15:59:00Z").note?.text}"), a minute later none ("${ses("TSE", "2026-11-24T16:00:00Z").note?.text}")`, ses("CME", "2026-11-23T22:30:00Z").note?.text === "opens 07:00 SGT, scheduled" && ses("TSE", "2026-11-24T15:59:00Z").note?.text === "opens 25 Nov 08:00 SGT" && ses("TSE", "2026-11-24T16:00:00Z").note?.text === "opens 08:00 SGT");
    ck(`a market's hours in its own time: "${hoursText(web.marketById("TSE"))}", "${hoursText(web.marketById("NYSE"))}", "${hoursText(web.marketById("ASX"))}", "${hoursText(web.marketById("FX"))}"`, hoursText(web.marketById("TSE")) === "09:00–11:30, 12:30–15:30 JST" && hoursText(web.marketById("NYSE")) === "09:30–16:00 ET" && hoursText(web.marketById("ASX")) === "10:00–16:00 Sydney time" && hoursText(web.marketById("FX")) === "Sunday 17:00 to Friday 17:00 ET");

    // --- what a row says ---
    const row = (o: Partial<TableRow>) => ({ symbol: "^GSPC", market: "NYSE", live: false, source: "yahoo", lastAt: "2026-11-19T21:00:00Z", ...o }) as TableRow;
    const at1 = u("2026-11-20T13:16:00Z"), s1 = rowSession(row({}), at1, OK), st1 = tileStamp(row({}), at1, s1.now);
    ck(`a row that is not live while its market is shut says ${st1.label} ${st1.text} and "${s1.note?.text}"; its tooltip "${rowStateWords(row({}), at1, OK)}"`, st1.label === "CLOSED" && st1.text === "05:00 SGT" && s1.note?.text === "opens 22:30 SGT" && rowStateWords(row({}), at1, OK) === " · market closed · opens 22:30 SGT");
    const at2 = u("2026-11-24T00:05:00Z"), jp = row({ symbol: "^N225", market: "TSE", lastAt: "2026-11-20T06:30:00Z" }), s2 = rowSession(jp, at2, OK), stp = tileStamp(jp, at2, s2.now);
    ck(`a row that is not live in its market's regular hours (Tokyo five minutes after its open, on a feed twenty minutes behind) is not called closed: ${stp.label} ${stp.text} and "${s2.note?.text}"; tooltip "${rowStateWords(jp, at2, OK)}"; on a phone "${stateWord(s2)}"`, stp.label === "LAST PRINT" && stp.text === "20 Nov 14:30 SGT" && s2.now === "open" && s2.note?.kind === "due" && s2.note.text === "first print due ~08:20 SGT" && !s2.note.scheduled && rowStateWords(jp, at2, OK) === " · delayed ~20m · first print due ~08:20 SGT" && stateWord(s2) === "Delayed ~20m"
      && s2.note.tip === "Tokyo: regular session 09:00–11:30, 12:30–15:30 JST; in session since 24 Nov 08:00 SGT. This feed is delayed about 20 minutes: the session's first print is due about 24 Nov 08:20 SGT. Holidays: JPX's calendar (personal use).", s2.note);
    // --- no live price in a market's hours: what the Monitor knows, and no more (the reviewer's O-4) ---
    const word = (id: string, iso: string, c: Cal = OK) => { const x = ses(id, iso, c); return `${stateWord(x)} · ${x.note?.text}`; };
    ck(`the first print stays "due" until the feed's delay and ${DUE_GRACE_MIN} minutes more have passed (Tokyo at 08:34 SGT: "${word("TSE", "2026-11-24T00:34:00Z")}"); from then, for a market whose holidays the Monitor holds, the market is open and says so ("${word("TSE", "2026-11-24T00:35:00Z")}")`, word("TSE", "2026-11-24T00:34:00Z") === "Delayed ~20m · first print due ~08:20 SGT" && word("TSE", "2026-11-24T00:35:00Z") === "No new print · open since 08:00 SGT" && ses("TSE", "2026-11-24T00:35:00Z").note!.kind === "since" && rowStateWords(jp, u("2026-11-24T00:35:00Z"), OK) === " · no new print · open since 08:00 SGT" && /; in session since 24 Nov 08:00 SGT\. The last print the Monitor has is older than a live one; this feed is delayed about 20 minutes\. Holidays: JPX's calendar \(personal use\)\.$/.test(ses("TSE", "2026-11-24T00:35:00Z").note!.tip));
    const kr = ses("KRX", "2026-11-24T00:40:00Z"), ld = ses("LSE", "2026-11-24T16:10:00Z");
    ck(`a market whose holidays the Monitor does not hold is never said to be open: Seoul at 08:05 SGT "${word("KRX", "2026-11-24T00:05:00Z")}", at 08:40 "${word("KRX", "2026-11-24T00:40:00Z")}" ("${kr.note?.tip}")`, word("KRX", "2026-11-24T00:05:00Z") === "Delayed ~20m · first print due ~08:20 SGT, scheduled" && word("KRX", "2026-11-24T00:40:00Z") === "No new print · session 08:00–14:30 SGT, scheduled" && kr.note!.kind === "session" && kr.note!.scheduled
      && kr.note!.tip === "Seoul: regular session 09:00–15:30 KST. Its timetable's session: 24 Nov 08:00 SGT to 24 Nov 14:30 SGT. The last print the Monitor has is older than a live one; this feed is delayed about 20 minutes. The Monitor does not hold this market's holidays: on one there is no session.", kr.note);
    ck(`the reviewer's case, London on Wed 25 Nov at 00:10 SGT with no print since 21:02: "${ld.note?.text}", the timetable's hours in Singapore time, not "open since" ("…${ld.note?.tip.split(". ").slice(1, 2)}")`, ld.now === "open" && ld.note?.text === "session 16:00–00:30 SGT, scheduled" && /Its timetable's session: 24 Nov 16:00 SGT to 25 Nov 00:30 SGT\./.test(ld.note.tip) && rowStateWords(row({ symbol: "^FTSE", market: "LSE", lastAt: "2026-11-24T13:02:00Z" }), u("2026-11-24T16:10:00Z"), OK) === " · no new print · session 16:00–00:30 SGT, scheduled");
    // every market, every half hour of a week with a holiday in it: "open since" only where the calendar is held
    let sinceBad = 0, inHours = 0; const sinceWhere: string[] = [];
    for (let t = Date.parse("2026-11-22T00:00:00Z"); t < Date.parse("2026-11-29T00:00:00Z"); t += 30 * 60e3) for (const m of web.MARKETS) {
      const x = marketSession(m.id, new Date(t), OK); if (x.now !== "open" || !x.note) continue; inHours++;
      const held = m.id === "TSE" || m.id === "NYSE", ok = held ? (x.note.kind === "since" || x.note.kind === "due") && !x.note.scheduled : (x.note.kind === "session" || x.note.kind === "due") && x.note.scheduled && !/open/.test(x.note.text);
      if (!ok || /undefined|NaN|Invalid/.test(x.note.text + x.note.tip)) { sinceBad++; if (sinceWhere.length < 4) sinceWhere.push(`${m.id} ${new Date(t).toISOString()} ${x.note.kind} "${x.note.text}"`); }
    }
    ck(`at every half hour of the week of 22 Nov 2026, a market in its timetable's hours says "open since" only where its holidays are held (Tokyo, New York); every other says its session or its first print, marked scheduled (${inHours} readings)`, sinceBad === 0 && inHours > 1200, sinceWhere);
    ck(`a feed without delay has no first-print line: New York a minute after its open says "${word("NYSE", "2026-11-24T14:31:00Z")}"; Tokyo's afternoon has one after its break ("${word("TSE", "2026-11-24T03:35:00Z")}")`, word("NYSE", "2026-11-24T14:31:00Z") === "No new print · open since 22:30 SGT" && word("TSE", "2026-11-24T03:35:00Z") === "Delayed ~20m · first print due ~11:50 SGT");
    ck(`a pair with no live price in the FX week gives the week's end ("${word("FX", "2026-11-24T16:10:00Z")}"); a future, Globex's session of the day ("${word("CME", "2026-11-24T16:10:00Z")}"), and after its daily break its first print ("${word("CME", "2026-11-24T23:05:00Z")}")`, word("FX", "2026-11-24T16:10:00Z") === "No new print · session to 28 Nov 06:00 SGT, scheduled" && word("CME", "2026-11-24T16:10:00Z") === "No new print · session 07:00–06:00 SGT, scheduled" && word("CME", "2026-11-24T23:05:00Z") === "Delayed ~10m · first print due ~07:10 SGT, scheduled" && /^FX: trades Sunday 17:00 to Friday 17:00 ET\. Its timetable's session: 23 Nov 06:00 SGT to 28 Nov 06:00 SGT\./.test(ses("FX", "2026-11-24T16:10:00Z").note!.tip));
    ck(`when the calendar did not come, Tokyo and New York are not said to be open either: "${word("TSE", "2026-11-24T00:40:00Z", { holidays: {}, state: "none" })}", "${word("NYSE", "2026-11-24T15:00:00Z", { holidays: {}, state: "none" })}"`, word("TSE", "2026-11-24T00:40:00Z", { holidays: {}, state: "none" }) === "No new print · session 08:00–10:30 SGT, scheduled" && word("NYSE", "2026-11-24T15:00:00Z", { holidays: {}, state: "none" }) === "No new print · session 22:30–05:00 SGT, scheduled" && /could not be loaded: on a holiday there is no session\.$/.test(ses("TSE", "2026-11-24T00:40:00Z", { holidays: {}, state: "none" }).note!.tip));
    ck("a session's end is its early close where one is known: New York's on Fri 27 Nov 2026 ends at 13:00 there, its Friday before at 16:00", z(web.openSince(web.marketById("NYSE"), u("2026-11-27T17:00:00Z"), H, "ok")?.end) === "2026-11-27T18:00Z" && z(web.openSince(web.marketById("NYSE"), u("2026-11-20T17:00:00Z"), H, "ok")?.end) === "2026-11-20T21:00Z" && z(web.openSince(web.marketById("TSE"), u("2026-11-24T00:40:00Z"), H, "ok")?.end) === "2026-11-24T02:30Z" && z(web.openSince(web.marketById("CME"), u("2026-11-24T16:10:00Z"), H, "ok")?.end) === "2026-11-24T22:00Z");
    // --- an instrument that is only read in New York's hours (the reviewer's O-2) ---
    const seeded: Array<{ symbol: string; cls: string; market: string; provider: string }> = [];
    for (const f of listDir(new URL("../supabase/migrations/", import.meta.url)).filter((x) => x.endsWith(".sql")).sort()) for (const m of readText(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8").matchAll(/\(\s*\d+,\s*'([^']+)',\s*'[^']*',\s*'([^']+)',\s*'[^']*',\s*'([A-Z0-9]+)',\s*'[A-Za-z_\/]+',\s*'[A-Z]{3}',\s*\d+,\s*(?:null|'[^']*'),\s*'([a-z]+)'/g)) { const k = seeded.findIndex((x) => x.symbol === m[1]); const r = { symbol: m[1], cls: m[2], market: m[3], provider: m[4] }; if (k >= 0) seeded[k] = r; else seeded.push(r); }
    const readOnly = seeded.filter((x) => readInNewYork(x) && !["treasury", "mof", "curve"].includes(x.provider)).map((x) => x.symbol).sort();
    ck(`of the ${seeded.length} instruments the migrations seed, those the table gives New York's session though it is not their market are read as such: ${readOnly.join(" ")} (the dollar index, the Cboe yield and volatility indices); the US equity indices are not (${seeded.filter((x) => x.market === "NYSE" && x.cls === "Equities").map((x) => x.symbol).join(" ")})`, seeded.length >= 80 && same(readOnly, ["DX-Y.NYB", "^FVX", "^TNX", "^TYX", "^VIX", "^VXN"]) && same(seeded.filter((x) => x.market === "NYSE" && x.cls === "Equities").map((x) => x.symbol).sort(), ["^DJI", "^GSPC", "^IXIC", "^NDX", "^RUT", "^SOX"]) && !readInNewYork({ market: "NYSE", cls: "Equities" }) && !readInNewYork({ market: "NYSE" }) && !readInNewYork({ market: "CME", cls: "Futures" }) && !readInNewYork({ market: "FX", cls: "Currency" }), { n: seeded.length, readOnly });
    const tnx = row({ symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", group: "rates", lastAt: "2026-11-19T21:00:00Z" }), sT = rowSession(tnx, at1, OK), stT = tileStamp(tnx, at1, sT.now);
    // PP-1 of the final review of pull request #50: a row the answer called live whose print is past its feed's delay and
    // 18 minutes (the copy kept on the device, refreshes that fail) is not live now, and its market's session says what
    // it is. It read "No new print" on a phone, muted, with no time and no opening, whatever its market's state.
    const held = (o: Partial<TableRow>) => row({ live: true, ...o });
    const sat = u("2026-11-21T01:00:00Z"), hfx = held({ symbol: "USDJPY=X", market: "FX", lastAt: "2026-11-20T06:00:00Z" }), hjp = held({ symbol: "^N225", market: "TSE", lastAt: "2026-11-20T06:00:00Z" });
    const sF = rowSession(hfx, sat, OK), sJ = rowSession(hjp, sat, OK), tue = u("2026-11-24T02:00:00Z"), hjp2 = held({ symbol: "^N225", market: "TSE", lastAt: "2026-11-24T00:40:00Z" }), sJ2 = rowSession(hjp2, tue, OK);
    const fresh = held({ symbol: "^N225", market: "TSE", lastAt: "2026-11-24T01:50:00Z" });
    ck(`PP-1: a row the answer called live, held on Saturday from Friday 14:00 SGT: "${stateWord(sF)} · ${sF.note?.text}" (FX), "${stateWord(sJ)} · ${sJ.note?.text}" (Tokyo; tooltip "${rowStateWords(hjp, sat, OK)}"); held in Tokyo's session at 10:00 SGT from a print of 08:40: open with an old price (amber "Last print": ${staleInSession(sJ2)}, "${sJ2.note?.text}"); a print of ten minutes ago is still live ("${rowStateWords(fresh, tue, OK)}")`,
      sF.now === "closed" && stateWord(sF) === "Closed" && /^opens 23 Nov 06:00 SGT/.test(sF.note?.text ?? "") && sJ.now === "closed" && stateWord(sJ) === "Closed" && sJ.note?.text === "opens 24 Nov 08:00 SGT" && /^ · market closed/.test(rowStateWords(hjp, sat, OK)) && !/market open/.test(rowStateWords(hjp, sat, OK))
      && sJ2.now === "open" && staleInSession(sJ2) && sJ2.note?.text === "open since 08:00 SGT" && rowSession(fresh, tue, OK).now === "open" && rowSession(fresh, tue, OK).note === null && rowStateWords(fresh, tue, OK) === " · market open", { sF, sJ, sJ2, words: rowStateWords(hjp, sat, OK) });
    // R1 of the check of fix part 3 (23 Nov 2026): one rule for a row's state. A chart tile took its word, its live colour
    // and its DELAYED badge from the answer's `live` while its line took stillLive: a kept answer's tile read "LIVE 20 Nov
    // 14:00 SGT" beside "opens 23 Nov 08:00 SGT", amber "LIVE 08:40 SGT" beside "open since 08:00 SGT"; and a stock's page
    // (pageLive allowed the delay and 30 minutes, stillLive 18) amber "LIVE 09:20 SGT" beside "open since 08:00 SGT".
    {
      const agrees = (t: ReturnType<typeof tileState>): boolean => (t.stamp.label === "LIVE") === t.live && (!t.live || (t.ses.note === null && !t.stale)) && (t.ses.note?.kind !== "opens" || t.stamp.label === "CLOSED") && (!t.stale || t.stamp.label === "LAST PRINT" || t.stamp.label === "LAST CLOSE");
      const mon = u("2026-11-22T23:30:00Z"), cases: Array<[string, TableRow, Date]> = [
        ["Sat 09:00 SGT, Tokyo's print of Fri 14:00", hjp, sat], ["Sat 09:00 SGT, USD/JPY's of Fri 14:00", hfx, sat],
        ["Sat 09:00 SGT, CME's of Fri 14:00", held({ symbol: "NKD=F", market: "CME", cls: "Futures", lastAt: "2026-11-20T06:00:00Z" }), sat],
        ["Tue 10:00 SGT, Tokyo's of 08:40", hjp2, tue], ["Tue 10:00 SGT, USD/JPY's of 08:40", held({ symbol: "USDJPY=X", market: "FX", lastAt: "2026-11-24T00:40:00Z" }), tue],
        ["Mon 07:30 SGT, Tokyo's of Fri 23:00", held({ symbol: "^N225", market: "TSE", lastAt: "2026-11-20T15:00:00Z" }), mon], ["Mon 07:30 SGT, VIX's of Fri 23:00", held({ symbol: "^VIX", market: "NYSE", cls: "Equities volatility", lastAt: "2026-11-20T15:00:00Z" }), mon],
        ["Tue 10:00 SGT, Tokyo's of ten minutes ago", fresh, tue]];
      const st = cases.map(([what, r, now]) => ({ what, t: tileState(r, now, OK) }));
      ck(`R1: a kept answer's row and its chart tile read one state: ${st.map(({ what, t }) => `${what}: ${t.stamp.label} ${t.stamp.text}${t.ses.note ? ` · ${t.ses.note.text}` : ""}`).join("; ")}`,
        st.every(({ t }) => agrees(t)) && st[0].t.stamp.label === "CLOSED" && st[0].t.ses.note?.text === "opens 24 Nov 08:00 SGT" && st[1].t.stamp.label === "CLOSED" && st[3].t.stamp.label === "LAST PRINT" && st[3].t.stale && st[3].t.ses.note?.text === "open since 08:00 SGT" && st[4].t.stamp.label === "LAST PRINT" && st[4].t.stale && st[6].t.stamp.label === "LAST PRINT" && st[6].t.ses.note?.kind === "read" && !st[6].t.live
        && st[7].t.live && st[7].t.stamp.label === "LIVE" && st[7].t.ses.note === null && rowState(hjp, sat, OK).live === false && panelRowOf({ ...cases[6][1], name: "VIX" }).live === false, st.map(({ what, t }) => ({ what, live: t.live, stamp: t.stamp.label, note: t.ses.note?.text, stale: t.stale })));
      // a stock's page: the page reads `live` itself (pageLive); the tile and the line beside it read it again by stillLive
      const page = (market: string, ageMin: number, now: Date): TableRow => { const lastAt = new Date(now.getTime() - ageMin * 60e3).toISOString(); return row({ symbol: market === "TSE" ? "7203.T" : "NVDA", market, lastAt, live: pageLive(market, lastAt, now, H) }); };
      const ages = Array.from({ length: 61 }, (_, i) => i), split = (market: string, now: Date) => ages.filter((a) => { const r = page(market, a, now); return r.live !== stillLive(r, now) || !agrees(tileState(r, now, OK)); });
      const t40 = tileState(page("TSE", 40, tue), tue, OK), t30 = tileState(page("TSE", 30, tue), tue, OK), n20 = tileState(page("NYSE", 20, u("2026-11-24T15:30:00Z")), u("2026-11-24T15:30:00Z"), OK);
      ck(`R1: a stock's page uses the one window: in Tokyo's session a quote 30 minutes old is "${t30.stamp.label}", 40 minutes old "${t40.stamp.label} ${t40.stamp.text}" beside "${t40.ses.note?.text}" (stale ${t40.stale}); New York's 20 minutes old "${n20.stamp.label}"; at no age from 0 to 60 minutes do the page's word and the line's differ (Tokyo: ${split("TSE", tue).join(", ") || "none"}; New York: ${split("NYSE", u("2026-11-24T15:30:00Z")).join(", ") || "none"})`,
        t30.live && t30.stamp.label === "LIVE" && t30.ses.note === null && !t40.live && t40.stamp.label === "LAST PRINT" && t40.stale && t40.ses.note?.text === "open since 08:00 SGT" && !n20.live && n20.stamp.label === "LAST PRINT" && split("TSE", tue).length === 0 && split("NYSE", u("2026-11-24T15:30:00Z")).length === 0, { t30, t40, n20 });
    }
    ck(`at the owner's moment the UST 10Y yield is not called closed by New York's hours: ${stT.label} ${stT.text} and "${sT.note?.text}"; tooltip "${rowStateWords(tnx, at1, OK)}"`, sT.now === "unknown" && stateWord(sT) === null && stT.label === "LAST PRINT" && stT.text === "05:00 SGT" && sT.note?.kind === "read" && sT.note.text === "next read 22:30 SGT" && rowStateWords(tnx, at1, OK) === " · next read 22:30 SGT"
      && sT.note.tip === "The Monitor reads this instrument during New York's regular session (09:30–16:00 ET; to 13:00 on NYSE's early closes). New York's exchange is not its market, and the Monitor does not hold its own market's hours: it is called neither open nor closed here. Next read 20 Nov 22:30 SGT.", sT.note);
    const eT = rowSession({ ...tnx, lastAt: "2026-11-27T18:00:00Z" }, u("2026-11-27T18:30:00Z"), OK), dx = rowSession(row({ symbol: "DX-Y.NYB", cls: "Currency", group: "fx" }), u("2026-11-21T02:00:00Z"), OK), vx = rowSession(row({ symbol: "^VIX", cls: "Volatility" }), u("2026-11-25T21:30:00Z"), OK);
    ck(`on Fri 27 Nov 2026 after 13:00 in New York it says when it is next read ("${eT.note?.text}") and nothing of an early close of its own; the dollar index at the weekend "${dx.note?.text}"; VIX over Thanksgiving "${vx.note?.text}"`, eT.note?.text === "next read 30 Nov 22:30 SGT" && !/Closed early|closed early today/.test(eT.note.tip) && eT.now === "unknown" && dx.note?.text === "next read 23 Nov 22:30 SGT" && vx.note?.text === "next read 27 Nov 22:30 SGT");
    ck("in New York's hours such a row has no line when it is not live (its stamp says LAST PRINT), and none when it is (its print two minutes old); without the calendar its next read is the scheduled one", rowSession(tnx, u("2026-11-20T20:30:00Z"), OK).note === null && rowSession(tnx, u("2026-11-20T20:30:00Z"), OK).now === "unknown" && rowStateWords(tnx, u("2026-11-20T20:30:00Z"), OK) === "" && rowSession({ ...tnx, live: true, lastAt: "2026-11-20T14:58:00Z" }, u("2026-11-20T15:00:00Z"), OK).note === null && rowStateWords({ ...tnx, live: true, lastAt: "2026-11-20T14:58:00Z" }, u("2026-11-20T15:00:00Z"), OK) === " · market open" && rowSession(tnx, at1, { holidays: {}, state: "none" }).note?.text === "next read 22:30 SGT, scheduled" && rowSession(tnx, at1, { holidays: {}, state: "wait" }).note === null);
    ck("the S&P 500 beside it keeps CLOSED and its opening; an official US yield (UST 2Y, market NYSE too) keeps PUBLISHED and no line", rowSession(row({}), at1, OK).now === "closed" && rowSession(row({}), at1, OK).note?.text === "opens 22:30 SGT" && rowSession(row({ symbol: "UST2Y", cls: "Fixed income", source: "treasury", lastAt: "2026-11-19T00:00:00Z" }), at1, OK).note === null);
    ck("the same for a booked close (LAST CLOSE with its date), and for a market the table does not keep (no line at all)", tileStamp(row({ lastAt: "2026-11-19T00:00:00Z" }), u("2026-11-20T15:00:00Z"), "open").label === "LAST CLOSE" && tileStamp(row({ lastAt: "2026-11-19T00:00:00Z" }), u("2026-11-20T15:00:00Z"), "open").text === "19 Nov 2026" && tileStamp(row({ lastAt: "2026-11-19T00:00:00Z" }), at1, "closed").label === "CLOSED" && rowSession(row({ market: "TSX" as never }), at1, OK).now === "unknown" && rowSession(row({ market: "TSX" as never }), at1, OK).note === null && tileStamp(row({}), at1, "unknown").label === "LAST PRINT" && rowStateWords(row({ market: "" }), at1, OK) === "");
    ck("a live row (its print a minute old: PP-1), and an official yield (published once a day: no session), get no line; the yield's stamp stays PUBLISHED", rowSession(row({ live: true, lastAt: "2026-11-20T13:15:00Z" }), at1, OK).note === null && rowStateWords(row({ live: true, lastAt: "2026-11-20T13:15:00Z" }), at1, OK) === " · market open" && rowSession(row({ symbol: "JGB10Y", market: "TSE", source: "mof", lastAt: "2026-11-19T00:00:00Z" }), at1, OK).note === null && rowStateWords(row({ symbol: "JGB10Y", market: "TSE", source: "mof" }), at1, OK) === "" && tileStamp(row({ symbol: "JGB10Y", market: "TSE", source: "mof", lastAt: "2026-11-19T00:00:00Z" }), at1, "unknown").label === "PUBLISHED");
    ck("without a session the stamp is as before (CLOSED for a row that is not live): the rule's default", tileStamp(row({}), at1).label === "CLOSED" && tileStamp(row({ live: true, lastAt: "2026-11-20T13:15:00Z" }), at1).label === "LIVE");
    // a stock's page and an instrument outside the table: live read by the page
    ck(`a stock's quote is live by the page's reading in its exchange's hours while it is no older than its feed's delay plus ${LIVE_PRINT_MIN + LIVE_SLACK_MIN} minutes, the window of every row (New York ${liveWindowMin("NYSE")}, Tokyo ${liveWindowMin("TSE")}; it was the delay plus 30: R1 of the check of fix part 3); never outside them, on a holiday, after an early close, or for a booked close`, pageLive("NYSE", "2026-11-20T15:00:00Z", u("2026-11-20T15:18:00Z"), H) && !pageLive("NYSE", "2026-11-20T15:00:00Z", u("2026-11-20T15:18:01Z"), H) && !pageLive("NYSE", "2026-11-20T15:00:00Z", u("2026-11-20T15:20:00Z"), H) && pageLive("TSE", "2026-11-20T01:00:00Z", u("2026-11-20T01:38:00Z"), H) && !pageLive("TSE", "2026-11-20T01:00:00Z", u("2026-11-20T01:38:01Z"), H) && !pageLive("TSE", "2026-11-20T01:00:00Z", u("2026-11-20T01:45:00Z"), H) && !pageLive("NYSE", "2026-11-20T13:10:00Z", at1, H) && !pageLive("TSE", "2026-11-23T01:00:00Z", u("2026-11-23T01:05:00Z"), H) && !pageLive("NYSE", "2026-11-27T18:00:00Z", u("2026-11-27T18:05:00Z"), H) && !pageLive("NYSE", "2026-11-20T00:00:00Z", u("2026-11-20T15:00:00Z"), H) && !pageLive("", "2026-11-20T15:00:00Z", u("2026-11-20T15:01:00Z"), H) && !pageLive("NYSE", null, at1, H));
    ck("a name outside the Monitor's table keeps only the market its symbol gives: a pair the FX week, a coin none that closes, a stock its exchange; an index or a future from the search none", symbolMarket("EURGBP=X") === "FX" && symbolMarket("BTC-USD") === "CRYPTO" && symbolMarket("7203.T") === "TSE" && symbolMarket("NVDA") === "NYSE" && symbolMarket("^AXJO") === null && symbolMarket("FGBL=F") === null && symbolMarket("MC.PA") === null);
    // WATCHLIST's line
    const shut = shutMarkets(["NYSE", "TSE", "NYSE", "FX", "CRYPTO", null, "HKEX"], u("2026-11-20T23:20:00Z"), OK);
    ck(`a list of names says once for each market that is shut when it opens, the soonest first: "${shutLine(shut)}"`, shutLine(shut) === "FX opens 23 Nov 06:00 SGT, scheduled · Hong Kong opens 23 Nov 09:30 SGT, scheduled · New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT" && shutLine(shutMarkets(["NYSE", "FX"], u("2026-11-20T15:00:00Z"), OK)) === "");

    // --- a panel's rows: "Closed now: …" above the table (the designer's D-62; A-41, B-35) ---
    { const prow = (o: Record<string, unknown>) => panelRowOf({ symbol: "^GSPC", name: "S&P 500", market: "NYSE", cls: "Equities", live: false, source: "yahoo", ...o } as never);
      // MARKETS' own rows: Tokyo, New York, Seoul, Hong Kong, Shanghai, Globex, FX; an official yield; the three read in New York's hours
      const mk = (live: string[] = []) => [prow({ symbol: "^N225", name: "Nikkei 225", market: "TSE" }), prow({ symbol: "1306.T", name: "TOPIX via 1306.T", market: "TSE" }), prow({}), prow({ symbol: "^IXIC", name: "Nasdaq Composite" }), prow({ symbol: "^KS11", name: "KOSPI", market: "KRX" }), prow({ symbol: "^HSI", name: "Hang Seng", market: "HKEX" }), prow({ symbol: "000001.SS", name: "Shanghai Composite", market: "SSE" }),
        prow({ symbol: "^VIX", name: "VIX", cls: "Volatility", live: live.includes("NYSE") }), prow({ symbol: "NKD=F", name: "Nikkei 225 future (CME)", market: "CME", cls: "Futures" }), prow({ symbol: "USDJPY=X", name: "USD/JPY", market: "FX", cls: "Currency" }), prow({ symbol: "DX-Y.NYB", name: "US Dollar Index (DXY)", cls: "Currency", live: live.includes("NYSE") }),
        prow({ symbol: "UST2Y", name: "UST 2Y yield", cls: "Fixed income", source: "treasury" }), prow({ symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", live: live.includes("NYSE") }), prow({ symbol: "JGB10Y", name: "JGB 10Y yield", market: "TSE", cls: "Fixed income", source: "mof" })];
      const line = (iso: string, rows = mk()) => { const c = closedLine(rows, u(iso), OK); return c ? closedLineText(c) : null; };
      const owner = line("2026-11-20T13:16:00Z");
      ck(`the owner's moment (Fri 20 Nov, 21:16 SGT), MARKETS' rows: "${owner}"`, owner === "Closed now: New York opens 22:30 SGT · Seoul opens 23 Nov 08:00 SGT, scheduled · Hong Kong and Shanghai open 23 Nov 09:30 SGT, scheduled · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday) · next read 22:30 SGT: VIX, DXY, UST 10Y");   // the holiday Tokyo's opening passes over is named since 21 Nov 2026 (D-65)
      const mon = line("2026-11-22T22:30:00Z");
      ck(`B's moment (Mon 23 Nov, 06:30 SGT): a holiday is named as one, Globex and New York have their openings, FX is trading: "${mon}"`, mon === "Closed now: CME Globex opens 07:00 SGT, scheduled · Seoul opens 08:00 SGT, scheduled · Hong Kong and Shanghai open 09:30 SGT, scheduled · New York opens 22:30 SGT · Tokyo (holiday) opens 24 Nov 08:00 SGT · next read 22:30 SGT: VIX, DXY, UST 10Y");
      const sat = closedLine(mk(), u("2026-11-21T02:00:00Z"), OK)!;
      ck(`a weekend: every market of the rows, the soonest first, each market once ("${sat.entries.map((e) => e.label).join(" | ")}"); an entry's tooltip is its markets' own`, sat.entries.map((e) => e.label).join("|") === "FX|CME Globex|Seoul|Hong Kong and Shanghai|New York|Tokyo" && sat.entries.every((e) => e.why === null) && sat.entries[3].names.length === 2 && /^Hong Kong: regular session .*\nShanghai: regular session /.test(sat.entries[3].tip) && sat.read?.text === "next read 23 Nov 22:30 SGT: VIX, DXY, UST 10Y" && /The Monitor reads this instrument during New York's regular session/.test(sat.read.tip));
      ck("the reason a market is shut, where the Monitor knows one: Tokyo's midday break, Globex's daily break, New York's early close and its holiday; none for hours alone or a weekend (there the only bracket is the holiday Tokyo's opening passes over)",
        /Tokyo \(midday break\) opens 11:30 SGT/.test(line("2026-11-24T02:45:00Z") ?? "") && /CME Globex \(daily break\) opens 07:00 SGT, scheduled/.test(line("2026-11-24T22:30:00Z") ?? "") && /New York \(early close\) opens 30 Nov 22:30 SGT/.test(line("2026-11-27T18:30:00Z") ?? "") && /New York \(holiday\) opens 27 Nov 22:30 SGT/.test(line("2026-11-26T15:00:00Z") ?? "") && !/\((holiday|midday break|daily break|early close)\)/.test(line("2026-11-21T02:00:00Z") ?? "(holiday)") && (line("2026-11-21T02:00:00Z") ?? "").match(/\(/g)?.length === 1 && /Tokyo opens 24 Nov 08:00 SGT \(23 Nov: holiday\)/.test(line("2026-11-21T02:00:00Z") ?? "") && /Hong Kong and Shanghai \(midday break\) open 13:00 SGT, scheduled/.test(line("2026-11-24T04:30:00Z") ?? ""));
      const fx = [prow({ symbol: "USDJPY=X", name: "USD/JPY", market: "FX", cls: "Currency" }), prow({ symbol: "EURUSD=X", name: "EUR/USD", market: "FX", cls: "Currency" }), prow({ symbol: "DX-Y.NYB", name: "US Dollar Index (DXY)", cls: "Currency" })];
      // since 21 Nov 2026 (the designer's note on RATES & FX's FX panel): while the FX week runs and New York is shut, the
      // dollar index holds last night's print, and the line says when it is next read; it said nothing
      ck(`RATES & FX's FX rows on a weekend: "${line("2026-11-21T02:00:00Z", fx)}"; while the FX week runs and New York is shut: "${line("2026-11-24T02:00:00Z", fx)}"; with New York open, no line`, line("2026-11-21T02:00:00Z", fx) === "Closed now: FX opens 23 Nov 06:00 SGT, scheduled · next read 23 Nov 22:30 SGT: DXY" && line("2026-11-24T02:00:00Z", fx) === "Next read 22:30 SGT: DXY" && line("2026-11-20T15:00:00Z", fx) === null);
      ck("with New York open the rows read in its hours end no line; one that is being read is left out of it; an official yield and a coin give none", !/next read/.test(line("2026-11-20T15:00:00Z") ?? "") && /^Closed now: Seoul opens 23 Nov 08:00 SGT, scheduled · /.test(line("2026-11-20T15:00:00Z") ?? "") && closedLine(mk(["NYSE"]), u("2026-11-20T13:16:00Z"), OK)!.read === null && closedLine([prow({ symbol: "JGB10Y", market: "TSE", source: "mof" }), { market: "CRYPTO" }, { market: null }, {}], u("2026-11-21T02:00:00Z"), OK) === null);
      const bare = closedLine(mk(), u("2026-11-20T13:16:00Z"), { holidays: {}, state: "none" })!;
      ck(`without the holiday calendar New York's and Tokyo's are the scheduled times, and say so: "${bare.entries.filter((e) => /New York|Tokyo/.test(e.label)).map((e) => e.text).join(" · ")}"`, bare.entries.some((e) => e.text === "New York opens 22:30 SGT, scheduled") && bare.entries.some((e) => e.label === "Seoul and Tokyo" && e.text === "Seoul and Tokyo open 23 Nov 08:00 SGT, scheduled") && bare.read?.text === "next read 22:30 SGT, scheduled: VIX, DXY, UST 10Y"); }

    // --- the local copy at a set clock (om_mock_now): its rows by the session table ---
    web.setHolidays({ TSE: cal.TSE, NYSE: cal.NYSE } as Parameters<typeof web.setHolidays>[0]);
    const pr = (id: string, iso: string) => printAt(id, Date.parse(iso));
    ck(`at the owner's moment the stand-in S&P 500 is not live, its last print at Thursday's close (${pr("NYSE", "2026-11-20T13:16:00Z")?.lastAt}); the Nikkei's at Friday's (${pr("TSE", "2026-11-20T13:16:00Z")?.lastAt}); a future is live on a print ten minutes old`, same(pr("NYSE", "2026-11-20T13:16:00Z"), { live: false, lastAt: "2026-11-19T21:00:00.000Z" }) && same(pr("TSE", "2026-11-20T13:16:00Z"), { live: false, lastAt: "2026-11-20T06:30:00.000Z" }) && same(pr("CME", "2026-11-20T13:16:00Z"), { live: true, lastAt: "2026-11-20T13:06:00.000Z" }) && pr("TSX", "2026-11-20T13:16:00Z") === null);
    ck(`five minutes after Tokyo's open on Tue 24 Nov its stand-in print is still Friday's close, the Monday being a holiday (${pr("TSE", "2026-11-24T00:05:00Z")?.lastAt}); twenty-five minutes after, it is live`, same(pr("TSE", "2026-11-24T00:05:00Z"), { live: false, lastAt: "2026-11-20T06:30:00.000Z" }) && same(pr("TSE", "2026-11-24T00:25:00Z"), { live: true, lastAt: "2026-11-24T00:05:00.000Z" }) && same(pr("TSE", "2026-11-24T02:45:00Z"), { live: false, lastAt: "2026-11-24T02:30:00.000Z" }) && same(pr("NYSE", "2026-11-27T18:30:00Z"), { live: false, lastAt: "2026-11-27T18:00:00.000Z" }));
  }

  console.log("\n[AC] the small musts of round 3a's verdicts (21 Nov 2026): a results date's mark as the source gives it (A-37)");
  {
    // A's four rows (A/verdict-r3a.md, A-37): what Yahoo's quote can send, and the mark the server must write. Until
    // 21 Nov 2026 the first three were written "confirmed" by the server's own reading of the two timestamps.
    const now = Date.parse("2026-11-21T09:00:00Z") / 1000, ahead = now + 20 * 86400, past = now - 70 * 86400;
    const mark = (e: boolean | null) => (e === true ? "est." : e === false ? "confirmed" : "not said");
    const rows: Array<[string, Parameters<typeof earningsOf>[0], string]> = [
      ["a date ahead, a start in the past, Yahoo's flag: estimate", { earningsTimestamp: ahead, earningsTimestampStart: past, isEarningsDateEstimate: true }, "est."],
      ["a date ahead, no start, Yahoo's flag: estimate", { earningsTimestamp: ahead, isEarningsDateEstimate: true }, "est."],
      ["a date ahead, no start, no flag", { earningsTimestamp: ahead }, "not said"],
      ["a date ahead, the start the same, no flag", { earningsTimestamp: ahead, earningsTimestampStart: ahead }, "not said"],
    ];
    for (const [what, q, want] of rows) { const e = earningsOf(q, now); ck(`${what}: the date is the one ahead, marked "${mark(e.earningsEst)}"`, e.earningsAt === ahead && mark(e.earningsEst) === want, e); }
    const conf = earningsOf({ earningsTimestamp: ahead, earningsTimestampStart: ahead, isEarningsDateEstimate: false }, now), confLone = earningsOf({ earningsTimestamp: ahead, isEarningsDateEstimate: false }, now);
    ck("\"confirmed\" is written only where Yahoo's own flag says so (false), with a start or without one", conf.earningsEst === false && confLone.earningsEst === false && conf.earningsAt === ahead, { conf, confLone });
    const win = earningsOf({ earningsTimestamp: past, earningsTimestampStart: ahead, isEarningsDateEstimate: true }, now);
    ck("the date itself is chosen as before: the start of the next window when it lies ahead, else the last date while it is no more than a day old, else none", win.earningsAt === ahead && win.earningsEst === true && earningsOf({ earningsTimestamp: now - 3600, isEarningsDateEstimate: false }, now).earningsAt === now - 3600 && earningsOf({ earningsTimestamp: past, earningsTimestampStart: past, isEarningsDateEstimate: false }, now).earningsAt === null);
    ck("no date, no mark: a flag without a date ahead is not passed on", earningsOf({ isEarningsDateEstimate: false }, now).earningsEst === null && earningsOf({ earningsTimestamp: past, isEarningsDateEstimate: true }, now).earningsEst === null && earningsOf({}, now).earningsAt === null);
    ck("a flag that is not a true or a false (a string, a number) is no mark", earningsOf({ earningsTimestamp: ahead, isEarningsDateEstimate: "false" as unknown as boolean }, now).earningsEst === null && earningsOf({ earningsTimestamp: ahead, isEarningsDateEstimate: 0 as unknown as boolean }, now).earningsEst === null);
    // the page's marks for the three: MY NAMES writes the short form after the date, RESULTS AHEAD the long one
    ck("the page writes the three marks apart in both forms: est. / conf. / a dash, and est. / confirmed / none", resultsStatusShort(true, "NVDA") === "est." && resultsStatusShort(false, "AAPL") === "conf." && resultsStatusShort(null, "AVGO") === "–" && resultsStatus(false, "AAPL") === "confirmed" && resultsStatus(null, "AVGO") === null && resultsStatusShort(false, "7203.T") === "est.");
  }

  console.log("\n[AD] MARKETS at the morning hour (B-32): the last session's figure, which day a figure is of, and a day under three hours old");
  {
    // ---- the server's figure (sigma.ts lastSession): (c0 − c1) over the σ of the 63 changes before it ----
    const D = 86400, t0 = Date.parse("2026-01-02T00:00:00Z") / 1000;
    const days: string[] = []; for (let t = t0; days.length < 120; t += D) { const wd = new Date(t * 1000).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(new Date(t * 1000).toISOString().slice(0, 10)); }
    let v = 100; const walk = days.map((d, i) => { v *= 1 + (((i * 7919) % 97) / 97 - 0.5) * 0.035; return { d, close: Math.round(v * 1e4) / 1e4 }; });
    const n = walk.length, c0 = walk[n - 1], c1 = walk[n - 2];
    // by hand, with no help from the module: the change into each close, and the sample deviation of the 63 before the newest
    const chgs = walk.slice(1).map((x, i) => (x.close / walk[i].close - 1) * 100), before = chgs.slice(-64, -1), mean = before.reduce((a, x) => a + x, 0) / before.length;
    const sdHand = Math.sqrt(before.reduce((a, x) => a + (x - mean) ** 2, 0) / (before.length - 1)), zHand = chgs[chgs.length - 1] / sdHand;
    const ls = lastSessionOf(walk, "price")!;
    ck(`B's check: on a made-up series the last session's figure is (c0 − c1) over the σ of the 63 changes before it: ${ls.chg?.toFixed(4)}% over ${ls.sd?.toFixed(4)}% = ${ls.z?.toFixed(4)}σ, by hand ${zHand.toFixed(4)}σ`, before.length === 63 && Math.abs(ls.z! - zHand) < 1e-9 && Math.abs(ls.sd! - sdHand) < 1e-9 && Math.abs(ls.chg! - chgs[chgs.length - 1]) < 1e-9 && ls.n === 63, { ls, zHand, sdHand });
    ck(`it names its two closes and its window: ${ls.from} to ${ls.d} (${ls.base} to ${ls.close}), σ from the closes of ${ls.wFrom} – ${ls.wTo}: the window ends at c1, so the newest change is not in its own yardstick`, ls.d === c0.d && ls.from === c1.d && ls.close === c0.close && ls.base === c1.close && ls.wTo === c1.d && ls.wFrom === walk[n - 2 - 63].d && ls.roll === null, ls);
    // the same from what the database gives the table: the two closes and fn_table_stats' σ of the window one session back
    const st = sigmaStats(walk, "price"), viaDb = lastSession(c0, c1, "price", { sd: st.sdx, n: st.nx, from: st.fromx, to: st.tox });
    ck("the table's row gets the same figure from the two closes and the database's σ of the 63 changes ending one session back (sd63x)", JSON.stringify(viaDb) === JSON.stringify(ls) && Math.abs(st.sdx! - sdHand) < 1e-9);
    ck("a σ whose window does not end at the close before (a row of another day) is not this session's: the change stays, the σ and the figure are none", (() => { const x = lastSession(c0, c1, "price", { sd: st.sd, n: st.n, from: st.from, to: st.to })!; return x.z === null && x.sd === null && x.wTo === null && Math.abs(x.chg! - ls.chg!) < 1e-12; })());
    // a yield: the change in points of its level, as every σ of a yield
    const ywalk = walk.map((x) => ({ d: x.d, close: Math.round((4 + (x.close - 100) / 40) * 1000) / 1000 })), yl = lastSessionOf(ywalk, "yield")!, ych = ywalk.slice(1).map((x, i) => x.close - ywalk[i].close), yb = ych.slice(-64, -1), ym = yb.reduce((a, x) => a + x, 0) / 63;
    ck(`a yield's in points of its level: ${(yl.chg! * 100).toFixed(1)}bp over ${(yl.sd! * 100).toFixed(1)}bp`, Math.abs(yl.chg! - ych[ych.length - 1]) < 1e-12 && Math.abs(yl.z! - ych[ych.length - 1] / Math.sqrt(yb.reduce((a, x) => a + (x - ym) ** 2, 0) / 62)) < 1e-9, yl);
    // a roll day counted within the new contract (B-27): the series steps 3% on the newest close's day
    const step = 1.03, stepped = walk.map((x, i) => (i === n - 1 ? { d: x.d, close: x.close * step } : x)), prevNew = c1.close * step;
    const rolled = lastSessionOf(stepped, "price", [{ d: c0.d, prevClose: prevNew, from: "CLZ26.NYM", to: "CLF27.NYM" }])!, naive = lastSessionOf(stepped, "price")!;
    ck(`a roll day is counted within the new contract: ${rolled.chg?.toFixed(4)}% from its own close before (${rolled.base?.toFixed(4)}), ${rolled.z?.toFixed(2)}σ; across the change of contract it would read ${naive.chg?.toFixed(2)}% and ${naive.z?.toFixed(1)}σ`, Math.abs(rolled.chg! - ls.chg!) < 1e-9 && Math.abs(rolled.z! - ls.z!) < 1e-9 && Math.abs(rolled.base! - prevNew) < 1e-12 && Math.abs(rolled.roll!.step! - 3) < 1e-9 && rolled.roll!.to === "CLF27.NYM" && Math.abs(naive.chg! - rolled.chg!) > 2.9 && Math.abs(naive.z! - rolled.z!) > 2.5, { rolled, naive });
    const unknown = lastSessionOf(stepped, "price", [{ d: c0.d, prevClose: null, to: "CLF27.NYM" }])!;
    ck("a roll whose new contract's close before is not known: the change is the series' own, across the change of contract, and has no σ", unknown.z === null && unknown.roll!.step === null && Math.abs(unknown.chg! - naive.chg!) < 1e-12 && unknown.base === c1.close, unknown);
    ck("fewer than two closes, or closes out of order: no last session; fewer than 60 changes before it: the change without a σ", lastSessionOf(walk.slice(0, 1), "price") === null && lastSession(c1, c0, "price", null) === null && lastSession(c0, null, "price", null) === null && (() => { const x = lastSessionOf(walk.slice(-40), "price")!; return x.z === null && x.sd === null && x.n === 38 && x.chg !== null; })());

    // ---- the page's rules (lib/movers.ts) ----
    const tr = (o: Partial<TableRow>): TableRow => ({ symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", market: "FX", currency: "JPY", decimals: 3, group: "fx", order: 1, last: 158.4, lastAt: "2026-11-23T23:10:00Z", live: true, source: "yahoo", closes: { d1: 155.96 }, closeDates: { d1: "2026-11-23" }, pct: { d1: 1.5645 }, marketTab: true, z1d: 2.7, sd1d: 0.58, zFrom: "2026-08-26", zTo: "2026-11-23", zN: 63,
      ls: { d: "2026-11-23", from: "2026-11-20", close: 155.96, base: 157.908, chg: -1.2336, z: -2.2, sd: 0.56, n: 63, wFrom: "2026-08-25", wTo: "2026-11-20", roll: null }, ...o } as TableRow);
    const NY = "America/New_York", bell = (ymd: string) => web.zonedMs(NY, ymd, 17 * 60), at = (ms: number) => new Date(ms);
    // the young day: FX and CME, less than three hours after 17:00 New York on the date of the close the 1D is measured from
    const winter = bell("2026-11-23"), summer = bell("2026-07-20");
    ck(`the 3-hour rule, New York's winter (17:00 there is ${new Date(winter).toISOString().slice(11, 16)} UTC, 06:00 SGT): young at the bell, at + 2 h 59 min, not at + 3 h, not before the bell`, YOUNG_HOURS === 3 && new Date(winter).toISOString() === "2026-11-23T22:00:00.000Z" && youngDay(tr({}), at(winter)) && youngDay(tr({}), at(winter + (2 * 60 + 59) * 60e3)) && !youngDay(tr({}), at(winter + 3 * 3600e3)) && !youngDay(tr({}), at(winter - 60e3)));
    ck(`the same on the other side of New York's change of clocks (17:00 there is ${new Date(summer).toISOString().slice(11, 16)} UTC, 05:00 SGT): young to + 2 h 59 min, 07:59 SGT, not at + 3 h`, new Date(summer).toISOString() === "2026-07-20T21:00:00.000Z" && youngDay(tr({ closeDates: { d1: "2026-07-20" } }), at(summer + (2 * 60 + 59) * 60e3)) && !youngDay(tr({ closeDates: { d1: "2026-07-20" } }), at(summer + 3 * 3600e3)) && youngDay(tr({ closeDates: { d1: "2026-07-20" } }), at(Date.parse("2026-07-20T23:59:00Z"))) && !youngDay(tr({ closeDates: { d1: "2026-07-20" } }), at(Date.parse("2026-07-21T00:00:00Z"))));
    ck("a CME future by the same rule (the live server sends a future such a row on a Monday morning only: section AG); an exchange's instrument, a yield or a coin never; nor a row whose 1D still runs from the close before (the booking not yet made)", youngDay(tr({ market: "CME" }), at(winter + 3600e3)) && !youngDay(tr({ market: "NYSE" }), at(winter + 3600e3)) && !youngDay(tr({ market: "TSE" }), at(winter + 3600e3)) && !youngDay(tr({ market: "CRYPTO" }), at(winter + 3600e3)) && !youngDay(tr({ closeDates: { d1: "2026-11-20" } }), at(winter + 600e3)) && !youngDay(tr({ closeDates: {} }), at(winter)));
    const m7 = at(Date.parse("2026-11-23T23:10:00Z")), e5 = at(Date.parse("2026-11-24T09:00:00Z"));
    ck(`at Tue 24 Nov 07:10 SGT USD/JPY's cell under Today shows "${lastWords(tr({}))}" in place of the change and the level; at 17:00 SGT it does not; nor without that session's σ, nor where the last session is not the one the 1D starts from`, showsLast(tr({}), m7) && lastWords(tr({})) === "last session -2.2σ" && !showsLast(tr({}), e5) && !showsLast(tr({ ls: { ...tr({}).ls!, z: null } }), m7) && !showsLast(tr({ ls: undefined }), m7) && !showsLast(tr({ ls: { ...tr({}).ls!, d: "2026-11-20" } }), m7));
    // which day a figure is of
    const nk = tr({ symbol: "^N225", name: "Nikkei 225", cls: "Equities", group: "equity", market: "TSE", live: false, lastAt: "2026-11-20T06:30:00Z", closeDates: { d1: "2026-11-19" }, z1d: -0.5, ls: { d: "2026-11-20", from: "2026-11-19", close: 57000, base: 57304, chg: -0.53, z: -0.5, sd: 1.14, n: 63, wFrom: "2026-08-17", wTo: "2026-11-19", roll: null } });
    const ust = tr({ symbol: "UST2Y", name: "UST 2Y yield", cls: "Fixed income", group: "rates", market: "NYSE", source: "treasury", live: false, lastAt: "2026-11-20T00:00:00Z", last: 4.51, closes: { d1: 4.574 }, z1d: -1.1, ls: { d: "2026-11-20", from: "2026-11-19", close: 4.51, base: 4.574, chg: -0.064, z: -1.1, sd: 0.058, n: 63, wFrom: "2026-08-24", wTo: "2026-11-19", roll: null } });
    ck(`a row's day: a print's date in Singapore (the Nikkei 225's Friday close, ${rowDay(nk, m7)}), a booked or published figure's own date (${rowDay(ust, m7)}); a New York close at 05:00 SGT is today's there`, rowDay(nk, m7) === "2026-11-20" && rowDay(ust, m7) === "2026-11-20" && rowDay(tr({ lastAt: "2026-11-23T21:00:00Z", live: false }), m7) === "2026-11-24" && rowDay(tr({ lastAt: null }), m7) === null);
    ck("the day beside a figure under Today: none for a live row or a figure of today in Singapore, the row's day otherwise (the Nikkei 225 on Tuesday morning: 20 Nov); none at all from a server that does not send the last session", staleDay(tr({}), m7) === null && staleDay(nk, m7) === "2026-11-20" && staleDay(ust, m7) === "2026-11-20" && staleDay(tr({ lastAt: "2026-11-23T21:00:00Z", live: false }), m7) === null && staleDay({ ...nk, ls: undefined }, m7) === null && staleDay({ ...nk, ls: null }, m7) === "2026-11-20" && staleDay({ ...nk, live: true, lastAt: "2026-11-23T22:55:00Z" }, m7) === null);
    ck("under Last session every cell carries its session's date (its newest close's, as stored); under Today only a figure that is not today's", cellDay(tr({}), "last", m7) === "2026-11-23" && cellDay(nk, "last", m7) === "2026-11-20" && cellDay(tr({}), "today", m7) === null && cellDay(nk, "today", m7) === "2026-11-20" && cellDay(tr({ ls: null }), "last", m7) === null);
    // ranking, and what each cell writes
    const rows = [tr({}), nk, ust, tr({ symbol: "EURUSD=X", name: "EUR/USD", order: 2, z1d: 0.6, ls: { ...tr({}).ls!, z: -0.7 } }), tr({ symbol: "X", order: 3, z1d: 1.9, ls: null }), tr({ symbol: "Y", order: 4, marketTab: false, z1d: 0.1, ls: { ...tr({}).ls!, z: 9 } })];
    ck(`the two readings rank apart: Today ${moversInSigma(rows).map((r) => r.symbol).join(" ")}; Last session ${moversInSigma(rows, STRIP_N, "last").map((r) => r.symbol).join(" ")} (no row without that session's σ, none off the table)`, moversInSigma(rows).map((r) => r.symbol).join() === "USDJPY=X,X,UST2Y,EURUSD=X,^N225" && moversInSigma(rows, STRIP_N, "last").map((r) => r.symbol).join() === "USDJPY=X,UST2Y,EURUSD=X,^N225" && hasLastSession(rows) && !hasLastSession(rows.map((r) => ({ ...r, ls: undefined }))) && !hasLastSession([rows[5]]));
    ck(`a cell under Last session: the session's change and its close ("${moveLine(tr({}), "last")}"; a yield's "${moveLine(ust, "last")}"); under Today as before ("${moveLine(tr({}))}")`, moveLine(tr({}), "last") === "-1.23% · 155.960" && moveLine(ust, "last") === "-6.4bp · 4.510%" && moveLine(tr({})) === "+1.56% · 158.400" && sigmaParts(nk, "last").chg === "-0.53%" && sigmaParts(tr({ ls: null }), "last").chg === "–");
    ck(`the window most cells share follows the reading: ${JSON.stringify(commonWindow([tr({}), tr({})], "last"))}`, commonWindow([tr({}), tr({})], "last")?.from === "2026-08-25" && commonWindow([tr({}), tr({})], "last")?.to === "2026-11-20" && commonWindow([tr({})])?.to === "2026-11-23" && commonWindow([tr({ ls: null })], "last") === null);
    const lt = lastTip(tr({}));
    ck(`its tooltip names the two closes with their dates and levels: "${lt}"`, lt === "The change between the closes of 20 Nov 2026 and 23 Nov 2026 (157.908 to 155.960, -1.23%) over the σ of the 63 daily changes before it (0.56% a day), worked out † from the daily closes of 25 Aug 2026 – 20 Nov 2026 (Yahoo Finance)");
    ck(`an official yield's adds its publication ("…${lastTip(ust).split(" · ").slice(1).join(" · ")}"), a future's that its changes of contract are left out`, /\(4\.574% to 4\.510%, -6\.4bp\) over the σ of the 63 daily changes before it \(5\.8bp a day\).*\(US Treasury\) · measured on 20 Nov 2026's close, its newest published day$/.test(lastTip(ust)) && /its changes of contract are left out from when the Monitor records them/.test(lastTip(tr({ symbol: "CL=F", market: "CME" }))) && /a change of contract that day: \+3\.00% from Dec 2026 to Jan 2027, left out \(the session is the change within Jan 2027, from its own close before\)$/.test(lastTip(tr({ symbol: "CL=F", market: "CME", ls: { ...tr({}).ls!, roll: { from: "CLZ26.NYM", to: "CLF27.NYM", step: 3 } } }))));
    ck(`without a σ it says why: "${lastTip(tr({ ls: { ...tr({}).ls!, z: null, sd: null, n: 12 } }))}"; none at all: "${lastTip(tr({ ls: null }))}"; from a server before: "${lastTip(tr({ ls: undefined }))}"`, /: no σ, 12 daily changes stored before it, 60 needed$/.test(lastTip(tr({ ls: { ...tr({}).ls!, z: null, sd: null, n: 12 } }))) && /^No last session: /.test(lastTip(tr({ ls: null }))) && /^No last session yet: the server sends it/.test(lastTip(tr({ ls: undefined }))) && /across a change of contract \(to Jan 2027\) whose size the source does not give: the session has no σ$/.test(lastTip(tr({ symbol: "CL=F", ls: { ...tr({}).ls!, z: null, roll: { from: null, to: "CLF27.NYM", step: null } } }))));
    ck(`the table's 1D IN σ tooltip adds the last session and its two closes: "…${lastClause(tr({}))}"`, lastClause(tr({})) === "last session (23 Nov 2026): -2.2σ, between the closes of 20 Nov 2026 and 23 Nov 2026" && columnTip(tr({})) === `${sigmaTip(tr({}))} · ${lastClause(tr({}))}` && lastClause(tr({ ls: null })) === null && columnTip(tr({ ls: undefined })) === sigmaTip(tr({})));
    ck(`a cell under Today whose row is not from today says whose day the move is: "…${todayTip(nk, m7).split(" · ").pop()}"; a row of today adds nothing`, todayTip(nk, m7) === `${sigmaTip(nk)} · the move of 20 Nov 2026` && todayTip(tr({}), m7) === sigmaTip(tr({})));
    ck(`an opened phone row, which has no tooltip: "${lastLine(tr({}))}"; a name cell's day: "${rowDayTip("2026-11-20")}"`, lastLine(tr({})) === "last session -2.2σ · 23 Nov" && lastLine(tr({ ls: null })) === null && rowDayTip("2026-11-20") === "The row's last figure is of 20 Nov 2026: its LAST, 1D and 1D in σ are that day's");
    ck(`the glossary's two words: "${TODAY}" and "${LAST_SESSION}" (upper-cased as chips on a computer, lower case in a cell)`, TODAY === "Today" && LAST_SESSION === "Last session");

    // ---- the local copy at a set clock (lib/mock.ts): the booked closes carry the dates the live Monitor's would ----
    const ms = (iso: string) => Date.parse(iso), tue0710 = ms("2026-11-23T23:10:00Z");
    ck(`at Tue 24 Nov 07:10 SGT the newest booked closes: FX ${bookedDays("FX", tue0710, 2)?.join(", ")} (Monday's day ended at 17:00 New York and is booked), Tokyo ${bookedDays("TSE", tue0710, 2)?.join(", ")} (Monday a holiday), New York ${bookedDays("NYSE", tue0710, 2)?.join(", ")}, Seoul ${bookedDays("KRX", tue0710, 2)?.join(", ")}`, bookedDays("FX", tue0710, 2)!.join() === "2026-11-23,2026-11-20" && bookedDays("CME", tue0710, 2)!.join() === "2026-11-23,2026-11-20" && bookedDays("TSE", tue0710, 2)!.join() === "2026-11-20,2026-11-19" && bookedDays("NYSE", tue0710, 2)!.join() === "2026-11-23,2026-11-20" && bookedDays("KRX", tue0710, 2)!.join() === "2026-11-23,2026-11-20");
    ck("a currency's day is booked 35 minutes after 17:00 New York, as the history job books it: at 06:10 SGT the newest is still Friday's, at 06:40 Monday's; over a weekend Friday's; New York's Thanksgiving is passed over", bookedDays("FX", ms("2026-11-23T22:10:00Z"), 1)![0] === "2026-11-20" && bookedDays("FX", ms("2026-11-23T22:40:00Z"), 1)![0] === "2026-11-23" && bookedDays("FX", ms("2026-11-21T06:12:00Z"), 1)![0] === "2026-11-20" && bookedDays("NYSE", ms("2026-11-27T12:00:00Z"), 2)!.join() === "2026-11-25,2026-11-24" && bookedDays("CRYPTO", tue0710, 1) === null && bookedDays("NOWHERE", tue0710, 1) === null);
    ck("a booked day ends when its session does: Tokyo's at 15:30 there, New York's at 13:00 on its early close of 27 Nov 2026", sessionEndMs(web.marketById("TSE"), "2026-11-20") === ms("2026-11-20T06:30:00Z") && sessionEndMs(web.marketById("NYSE"), "2026-11-27") === ms("2026-11-27T18:00:00Z") && sessionEndMs(web.marketById("FX"), "2026-11-23") === ms("2026-11-23T22:35:00Z"));
    ck("a long list of them holds no weekend day and no holiday of the calendar the Monitor holds", (() => { const d = bookedDays("TSE", tue0710, 300)!; const hol = new Set(mockHolidays(0).TSE); return d.length === 300 && d.every((x, i) => (i === 0 || x < d[i - 1]) && ![0, 6].includes(new Date(`${x}T00:00:00Z`).getUTCDay()) && !hol.has(x)); })());
  }

  console.log("\n[AE] why a market is shut, on screen (D-65), an old price in market hours (D-66), and the line of a panel whose markets are all open");
  {
    const cal: Cal = { holidays: Object.fromEntries(Object.entries(mockHolidays(0)).map(([k, v]) => [k, new Set(v)])) as Cal["holidays"], state: "ok" };
    const at = (iso: string) => new Date(iso), ses = (id: string, iso: string) => marketSession(id, at(iso), cal);
    const hol = ses("TSE", "2026-11-23T02:00:00Z"), brk = ses("TSE", "2026-11-24T02:45:00Z"), early = ses("NYSE", "2026-11-27T18:30:00Z"), thx = ses("NYSE", "2026-11-26T15:00:00Z"), sat = ses("TSE", "2026-11-21T02:00:00Z"), ny = ses("NYSE", "2026-11-20T13:16:00Z"), glb = ses("CME", "2026-11-24T22:30:00Z");
    ck(`a phone line's state word is the reason: Tokyo's holiday "${stateWord(hol)}", its midday break "${stateWord(brk)}", New York's early close "${stateWord(early)}", Thanksgiving "${stateWord(thx)}", Globex's break "${stateWord(glb)}"; shut by its hours "${stateWord(ny)}"`, stateWord(hol) === "Holiday" && stateWord(brk) === "Midday break" && stateWord(early) === "Closed early" && stateWord(thx) === "Holiday" && stateWord(glb) === "Daily break" && stateWord(ny) === "Closed" && stateWord(sat) === "Closed" && closedWord(null) === "Closed");
    ck(`a page's own chart: "${pageLine(hol.note!)}", "${pageLine(brk.note!)}", "${pageLine(early.note!)}", "${pageLine(glb.note!)}"; by its hours "${pageLine(ny.note!)}"`, pageLine(hol.note!) === "holiday · opens 24 Nov 08:00 SGT" && pageLine(brk.note!) === "midday break · opens 11:30 SGT" && pageLine(early.note!) === "early close · opens 30 Nov 22:30 SGT" && pageLine(glb.note!) === "daily break · opens 07:00 SGT, scheduled" && pageLine(ny.note!) === "opens 22:30 SGT" && pageLine(thx.note!) === "holiday · opens 27 Nov 22:30 SGT");
    ck(`a holiday the opening passes over is named: on Saturday Tokyo "${pageLine(sat.note!)}" (${JSON.stringify(sat.note!.skipped)}); on the holiday itself it is the reason, not named twice; several days: "${skippedWords({ skipped: ["2026-12-31", "2027-01-01"] })}"`, pageLine(sat.note!) === "opens 24 Nov 08:00 SGT · 23 Nov: holiday" && sat.note!.skipped?.join() === "2026-11-23" && hol.note!.skipped === undefined && skippedWords(sat.note) === "23 Nov: holiday" && skippedWords({ skipped: ["2026-12-31", "2027-01-01"] }) === "31 Dec, 1 Jan: holidays" && skippedWords(ny.note) === null && ses("TSE", "2026-12-30T08:00:00Z").note!.skipped?.join() === "2026-12-31,2027-01-01");
    const row = (o: object) => ({ market: "TSE", live: false, source: "yahoo", cls: "Equities", ...o });
    ck(`an opened phone row says it in full: "${rowStateWords(row({}), at("2026-11-23T02:00:00Z"), cal)}"; "${rowStateWords(row({}), at("2026-11-21T02:00:00Z"), cal)}"`, rowStateWords(row({}), at("2026-11-23T02:00:00Z"), cal) === " · market closed: a holiday in JPX's calendar (personal use) · opens 24 Nov 08:00 SGT" && rowStateWords(row({}), at("2026-11-21T02:00:00Z"), cal) === " · market closed · opens 24 Nov 08:00 SGT · 23 Nov 2026: a holiday in JPX's calendar (personal use)" && rowStateWords(row({}), at("2026-11-24T02:45:00Z"), cal) === " · market closed: its midday break · opens 11:30 SGT" && rowStateWords(row({ market: "NYSE" }), at("2026-11-27T18:30:00Z"), cal) === " · market closed: an early close today, at 13:00 ET · opens 30 Nov 22:30 SGT" && rowStateWords(row({ market: "NYSE" }), at("2026-11-20T13:16:00Z"), cal) === " · market closed · opens 22:30 SGT");
    // D-66: an old price while the market's timetable has a session
    const late = rowSession(row({}), at("2026-11-24T02:00:00Z"), cal), due = rowSession(row({}), at("2026-11-24T00:05:00Z"), cal), dxy = rowSession(row({ market: "NYSE", cls: "Currency" }), at("2026-11-20T13:16:00Z"), cal), dxyOpen = rowSession(row({ market: "NYSE", cls: "Currency" }), at("2026-11-20T15:00:00Z"), cal), lse = rowSession(row({ market: "LSE" }), at("2026-11-24T16:10:00Z"), cal);
    ck(`a row not live in its market's hours, the first minutes over, holds an old price ("${late.note?.text}"): its state is what the figure is as of, in amber; in the first minutes not ("${due.note?.text}"); nor a live row, a closed market, or a row only read in New York's hours`, staleInSession(late) && late.note?.kind === "since" && !staleInSession(due) && !staleInSession(rowSession(row({ live: true }), at("2026-11-24T02:00:00Z"), cal)) && !staleInSession(hol) && !staleInSession(dxy) && !staleInSession(dxyOpen) && staleInSession(lse) && lse.note?.kind === "session");
    // the line of a panel: the holiday passed over, and the next read alone where no market is shut
    const fx = [{ market: "FX" }, { market: "FX" }, { read: "DXY", live: false }];
    const tue = closedLine(fx, at("2026-11-24T02:00:00Z"), cal), tueNy = closedLine([{ market: "FX" }, { read: "DXY", live: true }], at("2026-11-24T15:00:00Z"), cal), satFx = closedLine(fx, at("2026-11-21T02:00:00Z"), cal);
    ck(`RATES & FX's FX panel on a weekday morning, the FX week running and New York shut: "${tue ? closedLineText(tue) : null}", with no "Closed now:" before it; with New York open and the dollar index being read, no line`, !!tue && closedLineText(tue) === "Next read 22:30 SGT: DXY" && tue.lead === "" && tue.entries.length === 0 && tue.read!.names.join() === "DXY" && tueNy === null && closedLine([{ market: "FX" }], at("2026-11-24T02:00:00Z"), cal) === null);
    ck(`with a market shut it is as before: "${satFx ? closedLineText(satFx) : null}"`, !!satFx && closedLineText(satFx) === "Closed now: FX opens 23 Nov 06:00 SGT, scheduled · next read 23 Nov 22:30 SGT: DXY" && satFx.lead === "Closed now: ");
    const wl = closedLine([{ market: "TSE" }, { market: "NYSE" }], at("2026-11-21T02:00:00Z"), cal), mon = closedLine([{ market: "TSE" }, { market: "NYSE" }], at("2026-11-23T02:00:00Z"), cal);
    ck(`the "Closed now" line names a holiday an opening passes over: "${wl ? closedLineText(wl) : null}"; on the holiday itself: "${mon ? closedLineText(mon) : null}"`, !!wl && closedLineText(wl) === "Closed now: New York opens 23 Nov 22:30 SGT · Tokyo opens 24 Nov 08:00 SGT (23 Nov: holiday)" && !!mon && closedLineText(mon) === "Closed now: New York opens 22:30 SGT · Tokyo (holiday) opens 24 Nov 08:00 SGT");
  }

  console.log("\n[AF] the paper portfolio's engine (P-1): the starts' defaults and ranges, the targets, the ladder, the windows, the routes over a store, the statement, the two switches");
  {
    const AR: PfStart[] = ["ar-ls-jp", "ar-ls-gl", "ar-macro"];
    const made = (s: PfStart, edits: Record<string, string> = {}, name = "A book") => { const raw = { ...pfForm.defaultRaw(s, edits.base === "JPY" ? "JPY" : "USD"), ...edits }, c = pfForm.checkForm(s, name, raw, []); return { raw, c }; };
    // ---- the five starts ----
    ck(`three starts are offered (${pfPresets.AR_STARTS.join(", ")}) and two are named and not offered yet, each with the designer's line`, pfPresets.AR_STARTS.join() === AR.join() && AR.every((s) => pfPresets.STARTS[s].offered && pfPresets.STARTS[s].kind === "AR") && pfPresets.RR_STARTS.join() === "rr-eq,rr-fi" && pfPresets.RR_STARTS.every((s) => !pfPresets.STARTS[s].offered && pfPresets.STARTS[s].kind === "RR")
      && pfPresets.STARTS["rr-eq"].notYet?.line === "Equity long-only (against its MSCI index): offered once its benchmark limits are built." && pfPresets.STARTS["rr-fi"].notYet?.line === "Fixed-income long-only (against the Global Aggregate): offered once its benchmark's profile is read.");
    const counts: Record<string, [number, number]> = { "ar-ls-jp": [56, 39], "ar-ls-gl": [58, 41], "ar-macro": [67, 46] };
    for (const s of AR) {
      const { c } = made(s), b = pfForm.buildCreate(s, "A book", c, { requestId: "request-0001", startedOn: "2026-11-20", usdjpy: null }), def = pfPresets.STARTS[s];
      const L = b.book.ladder, typed = def.fields.filter((f) => f.num);
      ck(`${def.name}: its defaults are refused nowhere and store ${b.settings.length} settings of ${def.fields.length} rows: USD 100,000,000, cash + 5% at 5%, the ladder 4/2/2 to 50% and 30% on the guarded yearly base, a restore after 20 final NAVs, a deadline of 1 session, house margin × 1.0`,
        c.refusals.length === 0 && c.changed.length === 0 && def.fields.length === counts[s][0] && b.settings.length === counts[s][1] && b.book.startingNav === 10_000_000_000 && b.book.base === "USD" && b.book.kind === "AR" && b.book.targetX === 5 && b.book.targetVol === 5
        && b.book.ladderBase === "guarded" && [L.cut1, L.cap1, L.cut2, L.cap2, L.out, L.cooling, L.deadline].join() === "4,50,2,30,2,20,1" && b.book.houseMultiple === 1 && b.book.fx === null, { n: def.fields.length, stored: b.settings.length, refusals: c.refusals });
      ck(`${def.short}: every row has its range, one line of why and whose it is; every typed row's default sits in its range and on its step, and its refusal is a sentence`, def.fields.every((f) => f.range.length > 0 && f.why.length > 3 && f.who.tag.length > 0 && f.who.basis.length > 0 && f.who.card.startsWith(f.who.tag.split(" · ")[0]))
        && typed.length > 20 && typed.every((f) => { const n = f.num!; const p = pfForm.parseNum(f, pfForm.inputText(f, n.def)); return p.ok && p.v === n.def && n.lo <= n.def && n.def <= n.hi && /between|at most|at least|from/.test(n.refuse); }), typed.filter((f) => !pfForm.parseNum(f, pfForm.inputText(f, f.num!.def)).ok).map((f) => f.key));
      ck(`${def.short}: whose each default is: only "PM A", "PM B", both, "Owner" or "C · R-nn"; a row settled by C says by whom it was accepted, in its history line and on its card`, def.fields.every((f) => /^(PM A|PM B|PM A · PM B|PM B · PM A|Owner|C · R-\d+)$/.test(f.who.tag))
        && def.fields.filter((f) => f.who.tag.startsWith("C · ")).every((f) => /^default \(settled by C, R-\d+; accepted by PM [AB]( and PM [AB])?, 21 Nov 2026\)$/.test(f.who.basis) && /settled by C/.test(f.who.card) && /accepted by/.test(f.who.card)) && def.fields.filter((f) => f.who.tag.startsWith("C · ")).length >= 2, [...new Set(def.fields.map((f) => f.who.tag))]);
      ck(`${def.short}: an assumption carries the amber A and belongs to one of the four groups; the Reference is fixed by the start; what it can trade is three lists with fixed words: the last holds the Osaka, TOPIX-future and lending-fee lines on the equity starts, and the three lines on duration outside the US, whole in bold, on the macro start (V-13)`, def.fields.filter((f) => f.after === "assumption").every((f) => f.mark === "A" && !!f.group) && pfPresets.fieldOf(s, "reference")?.after === "fixed" && !!def.reference
        && def.trade.can.length >= 4 && (s === "ar-macro" ? def.trade.bold === 3 && def.trade.cannot.slice(0, 2).join(" ") === "JGB, Bund and Gilt futures: not in the free feed the Monitor reads (Yahoo Finance carries none). Osaka's contracts: Osaka's settlement and volume files are not used in this Monitor." && def.trade.cannot[2].startsWith("So duration outside the US only through funds, and they are small:")
          : !def.trade.bold && def.trade.cannot.some((x) => x === "Osaka's futures (Nikkei 225, TOPIX): Osaka's settlement and volume files are not used in this Monitor (the owner's answer of 21 Nov 2026). Japan's index futures here are CME's NIY, and NKD once its multiplier is read from a source.") && def.trade.cannot.some((x) => x.startsWith("CME's yen TOPIX future (TPY):")) && def.trade.cannot.some((x) => x.startsWith("No lending-fee signal for Tokyo:")) && def.trade.cannot.every((x) => x.includes(":")))
        && pfPresets.notBuiltLines(s)[0] === "orders in stocks and ETFs · futures · currencies · options.", def.trade);
    }
    // the probes of 21 Nov 2026 in what a start can trade (the PMs' answers of 22 Nov, C/portfolio-plan.md §0.13): TPY is
    // no longer "not checked yet"; NKD waits for its multiplier from a source, NIY stands meanwhile; a Tokyo short needs
    // a locate (A); ZQ joins the macro start; the funds outside the US are said to be small; FedInvest may not be read
    { const all = (s: PfStart) => [...pfPresets.STARTS[s].trade.can, ...pfPresets.STARTS[s].trade.cannot].join(" | "), eqs = (["ar-ls-jp", "ar-ls-gl"] as PfStart[]).map(all), mac = all("ar-macro");
      ck("the probes of 21 Nov in the trade lists: TPY \"not tradable here: one close in the feed, 19 Nov 2026, 5 contracts\" (nowhere \"not checked yet\"); NKD \"once its multiplier is read from a source\" on every start, NIY offered; a Tokyo short refused \"no locate (A)\" outside TOPIX; ZQ on the macro start; Tokyo's and Germany's bond funds said to be small; cash Treasuries' prices may not be read",
        eqs.every((t) => /CME's yen TOPIX future \(TPY\): not tradable here: one close in the feed, 19 Nov 2026, 5 contracts/.test(t) && /NKD once its multiplier is read from a source/.test(t) && /NIY/.test(t) && /refused, "no locate \(A\)"/.test(t) && /860 of 4,501 Japan listings/.test(t) && !/never refused for a stop on new shorts/.test(t))
        && !(["ar-ls-jp", "ar-ls-gl", "ar-macro", "rr-eq", "rr-fi"] as PfStart[]).some((s) => /not checked yet/.test(all(s))) && /NIY \(NKD once its multiplier is read from a source\)/.test(mac) && /ZQ, the three months after the front/.test(mac) && /JPY 4m to 105m a day/.test(mac) && /under EUR 1m/.test(mac) && /no source of their prices may be read \(TreasuryDirect's robots\.txt disallows every path, read 21 Nov 2026\)/.test(mac), { eqs, mac }); }
    ck("the macro start has no gross limit to type: its first limits read \"Adjusted gross ≤ 600% · VaR ≤ 1.0% · floor 10%\", its Reference is a blend whose shares are picked (60/40 to start), and its help line prints a dash for each figure the Monitor cannot work out yet", pfPresets.STARTS["ar-macro"].summary(made("ar-macro").c.values)[0] === "Adjusted gross ≤ 600% · VaR ≤ 1.0% · floor 10%"
      && pfForm.buildCreate("ar-macro", "M", made("ar-macro").c, { requestId: "request-0002", startedOn: "2026-11-20", usdjpy: null }).book.blend === 60 && pfPresets.referenceLabel("ar-macro", "USD", 70)?.short === "70/30 blend" && /S&P 500 future –% of capital/.test(pfPresets.leverageHelp(5, null)) && /shown once the futures' histories are stored\.$/.test(pfPresets.leverageHelp(5, null)));
    ck("C-27, C-18 and the cap: an Equity long-only book on US shares offers the S&P 500 alone until MSCI USA is stored, then MSCI USA first; the notification on the target volatility is off by default; an account holds at most five open books", pfPresets.usBenchmarks(false).options.join() === "S&P 500" && pfPresets.usBenchmarks(true).preselected === "MSCI USA" && pfPresets.NOTIFY_TARGET_VOL_DEFAULT === false && pfPresets.OPEN_CAP === 5
      && pfPresets.CAP_LINE === "You have 5 open paper portfolios, the most an account may hold. Delete one to start another.");
    // ---- one check per preset row the settlement amended (the plan's P-1; §0.7 R-29 to R-49, C-15, C-18, C-24 to C-28) ----
    {
      const F = (s: PfStart, k: string) => pfPresets.fieldOf(s, k)!, eq: PfStart[] = ["ar-ls-jp", "ar-ls-gl"];
      ck("R-29, R-30, C-26: on every start the target return's range is 0 to 15% in steps of 0.5 (PM B's file had 2 to 12%) and the target volatility's 2 to 8%; both are re-set only in their window, never changed as a limit is", AR.every((s) => { const x = F(s, "target_x").num!, v = F(s, "target_vol").num!; return x.lo === 0 && x.hi === 15 && x.step === 0.5 && x.def === 5 && v.lo === 2 && v.hi === 8 && v.step === 0.5 && v.def === 5 && F(s, "target_x").after === "window" && F(s, "target_vol").after === "window" && /R-29/.test(F(s, "target_x").who.card) && /R-31/.test(F(s, "target_vol").who.card); }));
      ck("R-32, C-18: the band (±20 points to start, ±5 to ±50) and the amber line (120% to start, 100 to 150%) are settings that change as limits do, whose default is \"C · R-32\"; the notification is off by default (PM B's file had 80 to 125%, fixed, with a notification)", AR.every((s) => { const b2 = F(s, "band"), a = F(s, "amber"); return b2.after === "limit" && b2.num!.def === 20 && b2.num!.lo === 5 && b2.num!.hi === 50 && b2.num!.step === 5 && a.after === "limit" && a.num!.def === 120 && a.num!.lo === 100 && a.num!.hi === 150 && a.num!.step === 5 && b2.who.tag === "C · R-32" && a.who.tag === "C · R-32"; }) && pfPresets.NOTIFY_TARGET_VOL_DEFAULT === false);
      ck("R-38: a margin debit pays the overnight rate + 0.40%, within 0 to +1.50 (PM A's file had +0.10 to +1.50); R-37: the stressed multiplier and its amber warning are on PM A's two starts too, settled by C and accepted by PM A; C-15: the funding of Tokyo names is an assumption on a dollar base, changeable later, with no range to type yet", eq.every((s) => { const d = F(s, "debit_spread").num!, st = F(s, "stress_mult"), fu = F(s, "funding"); return d.def === 0.4 && d.lo === 0 && d.hi === 1.5 && /R-38/.test(F(s, "debit_spread").who.card) && st.who.tag === "C · R-37" && st.after === "assumption" && st.num!.def === 1.5 && /Amber below the floor, nothing refused/.test(st.why) && fu.after === "assumption" && fu.usdOnly === true && fu.range === "–" && !fu.num && /C-15/.test(fu.who.card) && /accepted by PM A/.test(fu.who.card); })
        && pfPresets.fieldOf("ar-macro", "stress_mult")?.who.tag === "PM B");
      ck("C-25 and the owner's answer: the ladder's base offers three, the yearly reset that is not made after a losing year preselected; C-24: 25% and 25% after the two cuts is refused as 50% and 50% is; C-28: Fixed-income long-only's list permits no repo", AR.every((s) => { const c2 = F(s, "ladder_base").choices!; return c2.def === "guarded" && c2.options.map((o) => o.value).join() === "guarded,yearly,start" && F(s, "ladder_base").who.tag === "Owner" && F(s, "ladder_base").after === "fixed"; }) && pfTargets.capitalRefusal(25, 25) !== null && pfTargets.capitalRefusal(50, 50) !== null && pfTargets.capitalRefusal(50, 30) === null
        && made("ar-ls-jp", { cap1: "25", cap2: "25" }).c.refusals.some((r) => r.key === "cap2") && !pfPresets.STARTS["rr-fi"].trade.can.some((x) => /repo/i.test(x) && !/no repo/i.test(x)) && pfPresets.STARTS["rr-fi"].trade.can.some((x) => /no repo/.test(x)));
      ck(`an amended row's adviser line: "${pfPresets.settledLine("R-29", "none")}" until an acceptance is entered, then "${pfPresets.settledLine("R-29", { A: pfPresets.R3A, B: pfPresets.R3A })}", each PM with the day of the answer ("${pfPresets.settledLine("R-31", { A: pfPresets.R3A, B: pfPresets.R3B })}")`, pfPresets.settledLine("R-29", "none") === "settled by C (R-29); the PM to accept" && pfPresets.settledLine("R-29", { A: pfPresets.R3A, B: pfPresets.R3A }) === "settled by C (R-29); accepted by PM A and PM B, 21 Nov 2026" && pfPresets.settledLine("R-37", { A: pfPresets.R3A }) === "settled by C (R-37); accepted by PM A, 21 Nov 2026" && pfPresets.settledLine("R-38", null) === "settled by C (R-38)" && pfPresets.settledLine("R-31", { A: pfPresets.R3A, B: pfPresets.R3B }) === "settled by C (R-31); accepted by PM A, 21 Nov 2026, and by PM B, 22 Nov 2026");
      // the PMs' answers of 22 Nov 2026 on the rows C settled (C/portfolio-plan.md §0.13): R-31 accepted by PM B too, R-38 by
      // both, C-25's three bases by both; R-29, R-32, C-24 as before; R-37, C-15 and C-17 PM A's (PM B holds none of them)
      ck("the PMs' answers of 22 Nov on the settled rows: R-31's card names PM A (21 Nov) and PM B (22 Nov), R-38's both PMs (22 Nov), the ladder's base C-25 both PMs (22 Nov); no row of any start reads \"the PM to accept\"", AR.every((s) => /settled by C \(R-31\); accepted by PM A, 21 Nov 2026, and by PM B, 22 Nov 2026$/.test(F(s, "target_vol").who.card) && /C-25\): settled by C \(C-25\); accepted by PM A and PM B, 22 Nov 2026/.test(F(s, "ladder_base").who.card) && pfPresets.STARTS[s].fields.every((f) => !/the PM to accept/.test(f.who.card + f.who.basis)))
        && eq.every((s) => /the range: settled by C \(R-38\); accepted by PM A and PM B, 22 Nov 2026$/.test(F(s, "debit_spread").who.card)), AR.map((s) => F(s, "target_vol").who.card));
    }
    // ---- amounts, and a yen base ----
    ck(`an amount as typed: "100m", "1.5bn", "100,000,000" and "100000000" are read; "5m" and "2bn" are refused in words (${pfForm.parseNav("USD", "5m").ok ? "" : (pfForm.parseNav("USD", "5m") as { text: string }).text}), "10m" and "1bn" taken; "abc" asks for an amount; nothing is corrected`, pfAmount("100m") === 100e6 && pfAmount("1.5bn") === 1.5e9 && pfAmount("100,000,000") === 100e6 && pfAmount("100000000") === 100e6 && pfAmount("1,00") === null && pfAmount("abc") === null
      && JSON.stringify(pfForm.parseNav("USD", "5m")) === JSON.stringify({ ok: false, text: "between USD 10m and USD 1bn" }) && JSON.stringify(pfForm.parseNav("USD", "2bn")) === JSON.stringify({ ok: false, text: "between USD 10m and USD 1bn" }) && pfForm.parseNav("USD", "10m").ok && pfForm.parseNav("USD", "1bn").ok && JSON.stringify(pfForm.parseNav("JPY", "500m")) === JSON.stringify({ ok: false, text: "between JPY 1bn and JPY 100bn" }) && (pfForm.parseNav("USD", "abc") as { text: string }).text === "enter an amount, for example 100m" && pfFull(1234567) === "1,234,567" && pfShort("USD", 63131313) === "USD 63.1m");
    { const { c } = made("ar-ls-gl", { base: "JPY" }), fx = { rate: 158.4, d: "2026-11-20", source: "Yahoo Finance, unofficial" }, b = pfForm.buildCreate("ar-ls-gl", "Y", c, { requestId: "request-0003", startedOn: "2026-11-20", usdjpy: fx }), line = pfForm.usdLine(10e9, fx).line;
      ck(`a yen base starts at JPY 10,000,000,000, kept in yen, with its dollar equivalent, the rate and its date as shown at creation ("${line}"); the funding of Tokyo names is a dollar book's row only (${b.settings.length} settings stored, one fewer)`, c.refusals.length === 0 && b.book.base === "JPY" && b.book.startingNav === 10e9 && b.book.fx?.usd === 63131313 && b.book.fx.rate === 158.4 && b.book.fx.d === "2026-11-20" && /63\.1m/.test(line) && /158\.4/.test(line) && /20 Nov 2026/.test(line) && /Yahoo Finance, unofficial/.test(line)
        && b.settings.length === 40 && !b.settings.some((x) => x.key === "funding"), { fx: b.book.fx, line }); }
    // ---- refusals of the form ----
    const refusal = (s: PfStart, edits: Record<string, string>, key: string) => made(s, edits).c.refusals.find((r) => r.key === key)?.text ?? null;
    ck(`a value out of its range, off its step or not a number is refused in words, never corrected: a target return of 15.5 "${refusal("ar-ls-jp", { target_x: "15.5" }, "target_x")}", of 5.3 "${refusal("ar-ls-jp", { target_x: "5.3" }, "target_x")}"; a first cut of 9 "${refusal("ar-ls-jp", { cut1: "9" }, "cut1")}"; "abc" "${refusal("ar-ls-jp", { gross: "abc" }, "gross")}"; nothing "${refusal("ar-ls-jp", { gross: " " }, "gross")}"`,
      refusal("ar-ls-jp", { target_x: "15.5" }, "target_x") === "between 0% and 15%" && refusal("ar-ls-jp", { target_x: "5.3" }, "target_x") === "in steps of 0.5" && refusal("ar-ls-jp", { cut1: "9" }, "cut1") === "between 2% and 8%" && refusal("ar-ls-jp", { gross: "abc" }, "gross") === "enter a number" && refusal("ar-ls-jp", { gross: " " }, "gross") === "enter a value" && refusal("ar-ls-jp", { target_x: "5.5" }, "target_x") === null);
    ck(`C-24: capital after the second cut must be below capital after the first: 50 and 50 "${refusal("ar-ls-jp", { cap1: "50", cap2: "50" }, "cap2")}"; 50 and 30 pass`, refusal("ar-ls-jp", { cap1: "50", cap2: "50" }, "cap2") === "Capital after the second cut (50%) must be below capital after the first (50%)" && pfTargets.capitalRefusal(50, 30) === null && made("ar-ls-jp", { cap1: "50", cap2: "30" }).c.refusals.length === 0);
    ck(`the amber line cannot be set inside the band, nor the band past the amber line (the designer's Q-P2): amber 115 with ±20 "${pfForm.amberRefusal(115, 20)}"; ±30 with amber 120 "${pfForm.bandRefusal(30, 120)}"; 120 with ±20 passes`, pfForm.amberRefusal(115, 20) === "amber above 115% would fall inside the band, which ends at 120%" && pfForm.bandRefusal(30, 120) === "a band of ±30 points would end at 130%, above the amber line at 120%" && pfForm.amberRefusal(120, 20) === null && pfForm.bandRefusal(20, 120) === null && made("ar-ls-jp", { amber: "115" }).c.refusals.length === 1);
    ck("a name has 1 to 60 characters and is not the name of another open book of the account (the same letters, its ends trimmed; another case is another name); a default name says the start and today", pfForm.nameRefusal("", []) !== null && pfForm.nameRefusal("x".repeat(61), []) !== null && pfForm.nameRefusal("x".repeat(60), []) === null && pfForm.nameRefusal(" Tokyo L/S ", ["Tokyo L/S"]) === pfWords.NAME_TAKEN && pfForm.nameRefusal("tokyo l/s", ["Tokyo L/S"]) === null && pfForm.nameRefusal("Tokyo", ["Tokyo L/S"]) === null
      && pfForm.defaultName("ar-ls-jp", "2026-11-21") === "Equity L/S · Japan · 21 Nov 2026", { taken: pfForm.nameRefusal("tokyo l/s", ["Tokyo L/S"]) });
    ck(`a reason has 10 to 500 characters ("${pfForm.reasonRefusal("too short")}"; "${pfForm.reasonRefusal("x".repeat(512))}") and a note at most 2,000 ("${pfForm.noteRefusal("x".repeat(2121))}"): counted in characters, a Japanese note of 2,000 passing`, pfForm.reasonRefusal("too short") === "give a reason of at least 10 characters: it is kept in the history" && pfForm.reasonRefusal("ten chars!") === null && pfForm.reasonRefusal("x".repeat(500)) === null && pfForm.reasonRefusal("x".repeat(512)) === "500 characters at most · 12 over"
      && pfForm.noteRefusal("x".repeat(2000)) === null && pfForm.noteRefusal("x".repeat(2121)) === "2,000 characters at most · 121 over" && pfForm.noteRefusal("決".repeat(2000)) === null && pfForm.noteLeft("x".repeat(1660)) === 340 && pfForm.noteRefusal("   ") !== null);
    // ---- the targets ----
    const effr = { name: "EFFR", rate: 3.88, d: "2026-11-18", source: "New York Fed", standIn: false }, tona = { name: "TONA", rate: 1.227, d: "2026-11-18", source: "Bank of Japan", standIn: false };
    ck(`cash + 5% as one figure, at the rate named with its date and source: "${pfTargets.equivalentLine(5, effr, "USD")}"; on a yen base "${pfTargets.equivalentLine(5, tona, "JPY")}"; with no rate read, no figure: "${pfTargets.equivalentLine(5, null, "USD")}"`,
      pfTargets.equivalentLine(5, effr, "USD") === "= 9.21% a year at EFFR 3.88% for 18 Nov 2026 (New York Fed)" && pfTargets.equivalentLine(5, tona, "JPY") === "= 6.30% a year at TONA 1.227% for 18 Nov 2026 (Bank of Japan)" && pfTargets.equivalentLine(5, null, "USD") === "= cash + 5.0% a year · the cash rate is not read yet"
      && Math.abs(pfTargets.cashGrowth(3.88, "USD") - 4.0119) < 5e-4 && Math.abs(pfTargets.absoluteEquivalent(5, 3.88, "USD") - 9.2125) < 5e-4 && Math.abs(pfTargets.cashGrowth(1.227, "JPY") - 1.2345) < 5e-4 && pfTargets.equivalentLine(5, { ...effr, standIn: true }, "USD").endsWith(" STAND-IN") && pfTargets.sharpeLine(5, 5) === "implied Sharpe 1.0" && pfTargets.sharpeLine(3, 6) === "implied Sharpe 0.5");
    { const t5 = pfTargets.varTie(5, 1), t6 = pfTargets.varTie(6, 1), t7 = pfTargets.varTie(7, 1), low = pfTargets.varTie(5, 0.7), t8 = pfTargets.varTie(8, 1);
      ck(`the target volatility against the VaR limit (2.326 × σ* ÷ √252): 5.0% is clear ("${t5.line}"), 6.0% is warned and may be created (0.88%), 7.0% is refused (1.03%), and so is 5.0% under a limit of 0.70%; the limit a refusal asks for is one that would pass (8.0%: "at least ${/at least (\S+)%/.exec(t8.line)?.[1]}%", its VaR ${t8.v.toFixed(4)}% rounded up)`,
        t5.state === "clear" && t5.line === "normal 99% one-day VaR 0.73% of capital, under 80% of your 1.00% VaR limit" && t6.state === "warned" && t6.line === "Target volatility 6.0% implies a 99% one-day VaR of 0.88% of capital on a normal law: above 80% of your 1.00% VaR limit, where the limit's own warning starts."
        && t7.state === "refused" && t7.line === "Target volatility 7.0% implies a 99% one-day VaR of 1.03% of capital on a normal law, above your 1.00% VaR limit: lower the target or raise the limit to at least 1.03%" && low.state === "refused" && /above your 0\.70% VaR limit/.test(low.line) && /at least 1\.18%$/.test(t8.line) && pfTargets.varTie(8, 1.18).state !== "refused" && pfTargets.varTie(8, 1.17).state === "refused"
        && made("ar-ls-jp", { target_vol: "6.0" }).c.refusals.length === 0 && made("ar-ls-jp", { target_vol: "6.0" }).c.tie?.state === "warned" && made("ar-ls-jp", { target_vol: "7.0" }).c.refusals.length === 1 && made("ar-ls-jp", { var: "0.7" }).c.refusals.length === 1, { t5, t6, t7, t8 }); }
    { const a = pfTargets.ladderInVols(4, 5), b = pfTargets.ladderInVols(4, 8), c = pfTargets.ladderInVols(4, 10);
      ck(`the ladder's first step in target volatilities (C-31), words only: at 5.0% "${a.line}" and no scale line; at 8.0% ${b.ratio} σ* with the scale line; it refuses nothing`, a.ratio === 0.8 && !a.scale && a.line === "first cut at 4.0% of the reference capital = 0.8 target volatilities (0.8 σ*)" && b.ratio === 0.5 && b.scale && /0\.5 target volatilities/.test(b.line) && c.ratio === 0.4 && c.scale && pfTargets.SCALE_LINE === "For scale (E, B's simulation): a book on target meets the first cut within a year in about 1 year in 10 at 1.0 σ*, 1 in 4 at 0.8 σ*, 1 in 2 at 0.67 σ*, 4 in 5 at 0.5 σ*." && made("ar-ls-jp", { target_vol: "8.0", var: "1.5" }).c.refusals.length === 0); }
    // ---- the ladder ----
    ck(`the ladder as the form prints it: cuts of 3 and 2 stand at ${pfTargets.cumulative({ cut1: 3, cut2: 2, out: 2 }).second.toFixed(1)}% and ${pfTargets.cumulative({ cut1: 3, cut2: 2, out: 2 }).out.toFixed(1)}%, and restore "${pfTargets.restoreLine({ cut1: 3, cut2: 2, cap1: 50 })}" (R-43: each 2 points below the step that cut, never below 0); the three bases, the first the owner's default, each say what they do to capital and limits`,
      pfTargets.cumulative({ cut1: 3, cut2: 2, out: 2 }).second === 5 && pfTargets.cumulative({ cut1: 3, cut2: 2, out: 2 }).out === 7 && pfTargets.restoreLine({ cut1: 3, cut2: 2, cap1: 50 }) === "to 50% at a drawdown of 3.0% or less, to full at 1.0% or less" && pfTargets.restoreLevels({ cut1: 2, cut2: 1 }).toFull === 0 && pfTargets.restoreLine({ cut1: 4, cut2: 2, cap1: 50 }) === "to 50% at a drawdown of 4.0% or less, to full at 2.0% or less"
      && pfTargets.BASE_NAME.guarded === "Yearly reset, not after a losing year" && /After a losing year: unchanged\.$/.test(pfTargets.BASE_LINE.guarded) && /also after a losing year/.test(pfTargets.BASE_LINE.yearly) && /^Never: capital and every limit stay sized to the starting NAV/.test(pfTargets.BASE_LINE.start) && pfPresets.fieldOf("ar-ls-jp", "ladder_base")?.choices?.def === "guarded"
      && pfTargets.ladderShort({ cut1: 4, cap1: 50, cut2: 2, cap2: 30, out: 2, cooling: 20, deadline: 1 }, "guarded") === "4/2/2 · yearly reset, not after a losing year" && pfTargets.ladderCaps({ cut1: 4, cap1: 50, cut2: 2, cap2: 30, out: 2, cooling: 20, deadline: 1 }) === "4/2/2 → capital 50% / 30% / Out");
    // ---- the next session, and the targets' window ----
    const hol = { TSE: ["2026-11-23"], NYSE: ["2026-11-26"] };
    ck(`a change is in force from the next session, the first session day after the valuation day (which ends at 17:00 New York): Sat 21 Nov 17:00 SGT -> ${pfCal.wdmy(pfCal.nextSessionDay(at("2026-11-21T09:00:00Z"), hol))} (Tokyo's holiday that day does not shut New York); Thu 12 Nov 10:02 SGT -> ${pfCal.wdmy(pfCal.nextSessionDay(at("2026-11-12T02:02:00Z"), hol))}; Fri 20 Nov 17:30 New York is already Saturday's valuation day, so the next session is Monday -> ${pfCal.wdmy(pfCal.nextSessionDay(at("2026-11-20T22:30:00Z"), hol))}; a day both markets are shut is passed over`,
      pfCal.nextSessionDay(at("2026-11-21T09:00:00Z"), hol) === "2026-11-23" && pfCal.nextSessionDay(at("2026-11-12T02:02:00Z"), hol) === "2026-11-13" && pfCal.valuationDay(at("2026-11-20T21:59:00Z")) === "2026-11-20" && pfCal.valuationDay(at("2026-11-20T22:00:00Z")) === "2026-11-21" && pfCal.nextSessionDay(at("2026-11-20T22:30:00Z"), hol) === "2026-11-23"
      && pfCal.nextSessionDay(at("2026-12-31T03:00:00Z"), { TSE: ["2027-01-01"], NYSE: ["2027-01-01"] }) === "2027-01-04" && pfCal.sessionDay("2026-11-23", hol) && !pfCal.sessionDay("2026-11-22", hol) && pfCal.wdmy("2026-11-23") === "Mon 23 Nov 2026" && pfCal.stampSgt("2026-10-01T01:12:00Z") === "1 Oct 2026 09:12 SGT" && pfCal.timeSgt("2026-11-19T09:20:00Z") === "19 Nov 17:20");
    { const w = (d: string, base: "guarded" | "yearly" | "start", resets: Array<{ year: number; kind: "made" | "held" | "withheld"; d: string }> = []) => pfCal.targetWindow(d, base, resets);
      ck(`the targets' window (C-26): shut on 21 Nov ("${w("2026-11-21", "guarded").next}"), open from 1 Dec for the next year, open in January until that year's reset is on record, shut after it; never under "since the start"`, !w("2026-11-21", "guarded").open && !w("2026-11-21", "guarded").fixed && w("2026-11-21", "guarded").next === "next window: from Tue 1 Dec 2026, 06:00 SGT, to the first NAV of 2027" && w("2026-12-01", "yearly").open && w("2026-12-01", "yearly").forYear === 2027 && w("2026-12-15", "guarded").forYear === 2027
        && w("2027-01-02", "guarded").open && w("2027-01-02", "guarded").forYear === 2027 && !w("2027-01-05", "guarded", [{ year: 2027, kind: "made", d: "2027-01-04" }]).open && !w("2027-01-05", "guarded", [{ year: 2027, kind: "withheld", d: "2027-01-04" }]).open && w("2026-12-15", "start").fixed && !w("2026-12-15", "start").open && pfCal.WINDOW_WORDS === "re-set only from 1 Dec, 06:00 SGT, to a January reset" && w("2026-12-15", "guarded").from === "Tue 1 Dec 2026, 06:00 SGT" && w("2027-01-02", "guarded").from === "Tue 1 Dec 2026, 06:00 SGT" && pfCal.windowWords(w("2026-11-21", "guarded")) === "re-set only from 1 Dec, 06:00 SGT, to a January reset", w("2026-11-21", "guarded"));
      // B.0.2, revision 2 (22 Nov 2026): every text that names the window carries its opening moment, built from one
      // constant: the targets' lines, the form's fixed line, the route's refusal and Help's row ("1 Dec" never alone)
      const help = readText(new URL("../web/src/components/Help.tsx", import.meta.url), "utf8"), bare = (t: string): string[] => t.match(/\b1 Dec(?!(?: \d{4})?, 06:00 SGT)[^.;"]{0,30}/g) ?? [];
      const texts = [pfCal.WINDOW_WORDS, w("2026-11-21", "guarded").next ?? "", w("2027-02-01", "yearly").next ?? "", pfPresets.FIXED_LINE, pfWords.WINDOW_CLOSED, help], loose = texts.flatMap(bare);
      ck(`B.0.2: the window's opening moment in every text that names it ("${pfWords.WINDOW_CLOSED}"; Help: "${/re-set only from 1 Dec[^)]*\)/.exec(help)?.[0]}"); no "1 Dec" without "06:00 SGT" (${loose.length}: ${loose.join(" | ") || "none"})`, loose.length === 0 && pfCal.WINDOW_OPENS === "1 Dec, 06:00 SGT" && pfWords.WINDOW_CLOSED === "the targets can be re-set from 1 Dec, 06:00 SGT, to the January reset" && pfPresets.FIXED_LINE.endsWith("The targets: re-set only from 1 Dec, 06:00 SGT, to a January reset, under a yearly base.") && help.includes("re-set only from 1 Dec, 06:00 SGT (17:00 New York on 30 Nov), to a January reset"), { loose, texts: texts.slice(0, 5) }); }
    // B.0.1 and B.0.2 (the designer's rules of 22 Nov 2026): a book day with the moment it begins in Singapore, in New
    // York's winter and its summer; the day a book was created, in Singapore; the window's opening moment
    ck(`B.0.1: a book day is printed with the moment it begins in SGT ("${pfCal.bookDayFrom("2026-11-23")}"; in New York's summer "${pfCal.bookDayFrom("2027-06-15")}"; the same in a pending line); a book made at 04:30 SGT on Sun 22 Nov is "${pfView.createdWords(pfCal.createdDay("2026-11-21T20:30:00Z"))}" on its strip, its first valuation day (its SINCE) "${pfCal.wdmy(pfCal.valuationDay(new Date("2026-11-21T20:30:00Z")))}" in New York; B.0.2: the window opens "${pfCal.windowOpens(2026)}"`, pfCal.bookDayFrom("2026-11-23") === "Mon 23 Nov 2026, 06:00 SGT" && pfCal.bookDayFrom("2027-06-15") === "Tue 15 Jun 2027, 05:00 SGT" && pfCal.bookDayFrom("2027-03-14") === "Sun 14 Mar 2027, 06:00 SGT" && pfCal.bookDayFrom("2027-03-15") === "Mon 15 Mar 2027, 05:00 SGT" && pfCal.createdDay("2026-11-21T20:30:00Z") === "2026-11-22" && pfCal.valuationDay(new Date("2026-11-21T20:30:00Z")) === "2026-11-21" && pfCal.windowOpens(2026) === "Tue 1 Dec 2026, 06:00 SGT" && pfCal.DAY_ENDS === "a day ends 17:00 New York" && pfView.createdWords("2026-11-22") === "created 22 Nov 2026" && pfCal.wdmy("2026-11-21") === "Sat 21 Nov 2026");
    // ---- the routes over a store ----
    const calls: string[] = [];
    const spy = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(`${String(k)}(${a.length})`); return Promise.reject(new Error("the store was reached")); } }) as PfStore;
    let factsAsked = 0;
    const off: PfDeps = { on: false, store: spy, now: () => at("2026-11-21T09:00:00Z"), facts: () => { factsAsked++; return Promise.reject(new Error("the facts were asked for")); } };
    const refused: string[] = [];
    for (const a of PF_ACTIONS) for (const m of ["GET", "POST"]) { const r = await pfRoute(off, a, "a@x.test", m, () => "00000000-0000-4000-8000-000000000001", { id: "00000000-0000-4000-8000-000000000001", name: "x", start: "ar-ls-jp", requestId: "request-0001", values: {}, body: "a note", version: 1 }); refused.push(`${r.status}|${(r.body as { error: string }).error}`); }
    ck(`with the server's switch off every one of the ${PF_ACTIONS.length} routes refuses, GET and POST alike, with "${pfWords.NOT_YET}" and reaches neither the store nor the facts: nothing is read and nothing is written`, refused.length === 2 * PF_ACTIONS.length && refused.every((x) => x === `404|${pfWords.NOT_YET}`) && calls.length === 0 && factsAsked === 0, { refused: [...new Set(refused)], calls });
    // the two switches are turned together, in one pull request (README.md): this reads them as they are, so the pull
    // request that turns both on passes (DC-2 of the second review of P-1: it asserted both off)
    const pageSwitch = /^export const PAPER_ON_LIVE_SITE = (true|false);/m.exec(readText(new URL("../web/src/lib/paper.ts", import.meta.url), "utf8"))?.[1];
    const apiSrc = readText(new URL("../supabase/functions/api/index.ts", import.meta.url), "utf8");
    const pfDoor = /if \(isPfAction\(action\)\) \{([\s\S]*?)\n    \}/.exec(apiSrc)?.[1] ?? "";
    ck(`the two switches are the same (${PAPER_ON_SERVER ? "both on" : "both off"} in this commit): PAPER_ON_SERVER in the server's file and PAPER_ON_LIVE_SITE in the page's; the API decides per account (the switch, or the preview list) before the routes, hands them that decision, and reads no body for an account it does not admit`, String(PAPER_ON_SERVER) === pageSwitch && new RegExp(`export const PAPER_ON_SERVER = ${PAPER_ON_SERVER};`).test(readText(new URL("../supabase/functions/_shared/pf/switch.ts", import.meta.url), "utf8"))
      && /const open = paperOpen\(PAPER_ON_SERVER, previewList\(Deno\.env\.get\("PF_PREVIEW_EMAILS"\)\), account\.email\);/.test(pfDoor) && /const body = open && req\.method === "POST" \?/.test(pfDoor) && /pfRoute\(\{ on: open,/.test(pfDoor)
      && pfDoor.indexOf("const open") < pfDoor.indexOf("req.json") && pfDoor.indexOf("req.json") < pfDoor.indexOf("pfRoute(") && (apiSrc.match(/req\.json\(/g) ?? []).length >= 1, { pfDoor: pfDoor.slice(0, 400) });
    // ---- the preview (slice 9, 23 Nov 2026: the owner's "Yeah just turn on for me for now and you can keep refining
    // them"): the paper book for the accounts whose sign-in email is in the server's secret PF_PREVIEW_EMAILS ----
    {
      const L = (raw: string | null | undefined) => [...previewList(raw)].join("|");
      ck(`the preview list: absent, empty, blank or commas alone is nobody; one address; several, comma-separated; each trimmed and in lower case (${JSON.stringify(L("  Owner@Example.TEST ,second@x.test,, "))})`, L(undefined) === "" && L(null) === "" && L("") === "" && L("   ") === "" && L(" , ,") === ""
        && L("owner@example.test") === "owner@example.test" && L("a@x.test,b@x.test") === "a@x.test|b@x.test" && L("  Owner@Example.TEST ,second@x.test,, ") === "owner@example.test|second@x.test");
      const one = previewList("owner@example.test"), several = previewList(" Owner@Example.test , second@x.test ");
      ck("an account is in the list by its sign-in email, trimmed and without regard to case; any other account, an account whose email only contains or is contained in a listed one, an empty email and no account are not", inPreview(one, "owner@example.test") && inPreview(one, " OWNER@example.TEST ") && inPreview(several, "second@x.test") && inPreview(several, "owner@EXAMPLE.test")
        && !inPreview(one, "other@example.test") && !inPreview(one, "owner@example.test.evil") && !inPreview(one, "wner@example.test") && !inPreview(one, "") && !inPreview(one, "   ") && !inPreview(one, null) && !inPreview(one, undefined)
        && !inPreview(previewList(undefined), "owner@example.test") && !inPreview(previewList(""), "owner@example.test") && !inPreview(previewList(" , "), "") && !inPreview(previewList("*"), "owner@example.test"));
      ck("the routes admit an account while the switch is on, or while it is in the list; with the switch off and the list absent or empty, nobody (as before the preview); a request with no account, never", !paperOpen(false, previewList(undefined), "owner@example.test") && !paperOpen(false, previewList(""), "owner@example.test")
        && paperOpen(false, one, "Owner@Example.test") && !paperOpen(false, one, "other@example.test") && !paperOpen(false, one, null) && !paperOpen(false, one, "")
        && paperOpen(true, previewList(undefined), "anyone@x.test") && !paperOpen(true, one, null) && !paperOpen(true, one, " "));
      ck("the page is told `paperPreview` true only for an account in the list while the switch is off: false for every other account, for no account, and for everyone once the switch is on (the page then draws the book by its own switch)", previewFor(false, one, "owner@example.test") && !previewFor(false, one, "other@example.test") && !previewFor(false, one, null) && !previewFor(false, previewList(""), "owner@example.test") && !previewFor(true, one, "owner@example.test") && !previewFor(true, one, "other@example.test"));
      // every route, for an account the API does not admit: the decision is the one api/index.ts makes, with the switch
      // as it is in this commit and a list that holds another account
      const listed = previewList("owner@example.test"), notListed = "other@example.test";
      const seen: string[] = []; let asked = 0;
      const spy2 = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { seen.push(`${String(k)}(${a.length})`); return Promise.reject(new Error("the store was reached")); } }) as PfStore;
      const deps = (who: string | null): PfDeps => ({ on: paperOpen(PAPER_ON_SERVER, listed, who), store: spy2, now: () => at("2026-11-23T12:30:00Z"), facts: () => { asked++; return Promise.reject(new Error("the facts were asked for")); }, quotes: () => { asked++; return Promise.reject(new Error("a quote was asked for")); } });
      const answers: string[] = [];
      for (const who of [notListed, "", null]) for (const a of PF_ACTIONS) for (const m of ["GET", "POST"]) { const r = await pfRoute(deps(who), a, who ?? "", m, () => "00000000-0000-4000-8000-000000000001", { id: "00000000-0000-4000-8000-000000000001", name: "x", start: "ar-ls-jp", requestId: "request-0001", values: {}, body: "a note", version: 1 }); answers.push(`${r.status}|${(r.body as { error: string }).error}`); }
      ck(`an account outside the list (and an empty or no account), with the switch ${PAPER_ON_SERVER ? "on" : "off"}: every one of the ${PF_ACTIONS.length} routes, GET and POST, answers as before the preview, 404 "${pfWords.NOT_YET}", and reaches neither the store, nor the facts, nor a quote (pf_ticket's, P-2.1)`, PAPER_ON_SERVER || (answers.length === 3 * PF_ACTIONS.length * 2 && answers.every((x) => x === `404|${pfWords.NOT_YET}`) && seen.length === 0 && asked === 0), { answers: [...new Set(answers)], seen, asked });
      // and the account in it is admitted: its list is read from the store (the stand-in store here)
      let st2: PfMemState = pfEmpty();
      const mem2 = pfMem({ load: () => st2, save: (x) => { st2 = x; }, now: () => at("2026-11-23T12:30:00Z"), newId: () => "00000000-0000-4000-8000-000000000009" });
      const admitted = await pfRoute({ on: paperOpen(PAPER_ON_SERVER, listed, " Owner@Example.TEST "), store: mem2, now: () => at("2026-11-23T12:30:00Z"), facts: () => Promise.reject(new Error("not asked")) }, "pf_list", "owner@example.test", "GET", () => null, {});
      ck(`the account in the list is admitted: pf_list answers ${admitted.status} with its (empty) list`, admitted.status === 200 && (admitted.body as { rows: unknown[] }).rows.length === 0, admitted);
      // what the old page reads of `me` is unchanged (rule S: the page users have open reads email, role and mustChange),
      // the new field is the preview's word, and the API reads the list from the server's secret for each request
      const meLine = /if \(action === "me"\) return json\(req, \{([^}]*)\}\);/.exec(apiSrc)?.[1] ?? "";
      ck("the API's `me` keeps its three fields as before (email, role, mustChange) and adds `paperPreview`, the preview's word for this account alone, read from PF_PREVIEW_EMAILS at each request", /^ email: account\.email, role: account\.role, mustChange: account\.must_change, paperPreview: previewFor\(PAPER_ON_SERVER, previewList\(Deno\.env\.get\("PF_PREVIEW_EMAILS"\)\), account\.email\) $/.test(meLine) && !/PF_PREVIEW_EMAILS/.test(apiSrc.split("Deno.serve(")[0]), { meLine });
      // deploy-server hands the repository's secret to the server in the step that stores the others, and to that step
      // alone; it prints names, never a value; without the repository's secret it takes the list off the server
      const wf2 = readText(new URL("../.github/workflows/deploy-server.yml", import.meta.url), "utf8"), stepsOf = wf2.split(/\n(?=\s{6}- name: )/), keysStep = stepsOf.find((x) => /- name: Email sender and data keys/.test(x)) ?? "";
      ck("deploy-server stores PF_PREVIEW_EMAILS with the other optional secrets (set only when the repository has it), gives it to that step alone, never prints its value, and removes it from the server once the repository's secret is gone", /for n in [^;]*\bPF_PREVIEW_EMAILS\b[^;]*; do/.test(keysStep) && /\n\s+env:\n\s+PF_PREVIEW_EMAILS: \$\{\{ secrets\.PF_PREVIEW_EMAILS \}\}\n/.test(keysStep)
        && (wf2.match(/secrets\.PF_PREVIEW_EMAILS/g) ?? []).length === 1 && !/echo[^\n]*\$\{?(PF_PREVIEW_EMAILS|v|args)\b/.test(keysStep) && /if \[ -z "\$PF_PREVIEW_EMAILS" \] && grep -q "PF_PREVIEW_EMAILS" \/tmp\/secrets\.out; then\n\s+supabase secrets unset PF_PREVIEW_EMAILS --project-ref "\$REF" --yes > \/dev\/null/.test(keysStep), { keysStep: keysStep.slice(0, 300) });
      // no address in what is committed for it: the list is the secret's alone
      const files = ["../supabase/functions/_shared/pf/switch.ts", "../supabase/functions/api/index.ts", "../web/src/lib/paper.ts", "../.github/workflows/deploy-server.yml"].map((f) => readText(new URL(f, import.meta.url), "utf8"));
      ck("no email address is written in the preview's files (the switch, the API, the page's switch, deploy-server): the list is the repository secret's alone", files.every((t) => !/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(t)));
    }
    {
      let state: PfMemState = pfEmpty(), clock = at("2026-11-21T09:00:00Z"), n = 0;
      const store = pfMem({ load: () => state, save: (s2) => { state = s2; }, now: () => clock, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
      const on: PfDeps = { on: true, store, now: () => clock, facts: () => Promise.resolve({ rates: { USD: effr, JPY: tona }, usdjpy: { rate: 158.4, d: "2026-11-20", source: "Yahoo Finance, unofficial" }, holidays: hol }) };
      const A = "a@x.test", B = "b@x.test";
      const call = async (who: string, action: string, body?: Record<string, unknown>, q: Record<string, string> = {}) => { const r = await pfRoute(on, action, who, body ? "POST" : "GET", (k) => q[k] ?? null, body ?? {}); return { status: r.status, body: r.body as Record<string, unknown> & { error?: string; id?: string } }; };
      const form = { requestId: "request-0001", start: "ar-ls-jp", name: "Tokyo L/S", values: pfForm.defaultRaw("ar-ls-jp", "USD") };
      const before = await call(A, "pf_create", form), noBook = (await call(A, "pf_list")).body as unknown as { rows: unknown[]; open: number; cap: number };
      ck(`the statement first: a create before the account has agreed is refused with 409 "${before.body.error}", hands back the statement's words and stores nothing; a write by GET is refused`, before.status === 409 && before.body.error === pfWords.NEEDS_STATEMENT && (before.body.consent as { text: string; agreedAt: string | null }).text === pfStatement.STATEMENT_TEXT && (before.body.consent as { agreedAt: string | null }).agreedAt === null && noBook.rows.length === 0 && noBook.cap === 5 && state.books.length === 0
        && (await pfRoute(on, "pf_create", A, "GET", () => null, {})).status === 405 && (await call(A, "consent_agree", { version: 7 })).status === 400);
      const agreed = await call(A, "consent_agree", { version: 1 }), first = await call(A, "pf_create", form), again = await call(A, "pf_create", form), id = String(first.body.id);
      ck("agreed once (version 1, with its time), the same form creates the book, and a second press of that form is the first one's answer: one book, never two", agreed.status === 200 && agreed.body.agreedAt === clock.toISOString() && first.status === 200 && /^[0-9a-f-]{36}$/.test(id) && again.status === 200 && again.body.id === id && state.books.length === 1, { first, again });
      const bad = await call(A, "pf_create", { ...form, requestId: "request-0002", name: "Second", values: { ...form.values, nav: "5m", cut1: "9" } }), dup = await call(A, "pf_create", { ...form, requestId: "request-0003" }), rr = await call(A, "pf_create", { ...form, requestId: "request-0004", start: "rr-eq", name: "RR" });
      ck(`the server refuses what the form refuses, with the fields and their sentences ("${bad.body.error}": ${(bad.body.refusals as Array<{ key: string; text: string }> | undefined)?.map((r) => `${r.key} ${r.text}`).join("; ")}), a name already in use ("${(dup.body.refusals as Array<{ text: string }> | undefined)?.[0]?.text}"), and a start that is not offered ("${rr.body.error}"); none of them stores a row`, bad.status === 400 && bad.body.error === "2 settings out of range" && (bad.body.refusals as Array<{ key: string }>).map((r) => r.key).sort().join() === "cut1,nav"
        && dup.status === 400 && (dup.body.refusals as Array<{ key: string; text: string }>)[0].key === "name" && (dup.body.refusals as Array<{ text: string }>)[0].text === pfWords.NAME_TAKEN && rr.status === 400 && rr.body.error === "this start is not offered yet" && state.books.length === 1);
      const got = await call(A, "pf_get", undefined, { id }), book = got.body.book as PfBook, other = await call(B, "pf_get", undefined, { id }), otherList = (await call(B, "pf_list")).body as unknown as { rows: unknown[] };
      ck(`the book as stored: ${book?.settings.length} settings, each with its class and whose it is; the next session is ${String(got.body.nextSession)}; a second account gets "${other.body.error}" for the same address and an empty list, and can change, annotate or delete nothing in it`, got.status === 200 && book.name === "Tokyo L/S" && book.settings.length === 40 && book.settings.filter((r) => r.key !== "name").every((r) => r.origin === "creation" && ["fixed", "limit", "assumption", "window"].includes(r.cls) && /^default \(/.test(r.basis)) && got.body.nextSession === "2026-11-23" && got.body.valuationDay === "2026-11-21" && got.body.today === "2026-11-21"
        && other.status === 404 && other.body.error === pfWords.NO_SUCH && otherList.rows.length === 0 && (await call(B, "pf_setting_set", { id, key: "one_long", value: "8", reason: "tighter into results season" })).status === 404 && (await call(B, "pf_note_add", { id, body: "a note" })).status !== 200 && (await call(B, "pf_delete", { id, name: "Tokyo L/S" })).status === 404 && (await call(B, "pf_rename", { id, name: "Mine" })).status === 404 && state.books.length === 1 && state.books[0].notes.length === 0
        && (await call(A, "pf_get", undefined, { id: "not-an-id" })).status === 404, { other, n: book?.settings.length });
      const noReason = await call(A, "pf_setting_set", { id, key: "one_long", value: "8", reason: "" }), same = await call(A, "pf_setting_set", { id, key: "one_long", value: "10", reason: "tighter into results season" }), out = await call(A, "pf_setting_set", { id, key: "one_long", value: "30", reason: "tighter into results season" }),
        fixed = await call(A, "pf_setting_set", { id, key: "cut1", value: "3", reason: "tighter into results season" }), target = await call(A, "pf_setting_set", { id, key: "target_x", value: "6", reason: "tighter into results season" }), varLow = await call(A, "pf_setting_set", { id, key: "var", value: "0.7", reason: "tighter into results season" });
      ck(`a change asks for its reason ("${noReason.body.error}"), refuses the value in force ("${same.body.error}"), a value out of range ("${out.body.error}"), a fixed setting ("${fixed.body.error}"), a target outside its window ("${target.body.error}") and a VaR limit under what the target volatility implies`, noReason.status === 400 && noReason.body.error === pfWords.REASON_SHORT && same.body.error === pfForm.SAME_VALUE && out.body.error === "between 3% and 25%" && fixed.body.error === pfWords.FIXED_SETTING && target.body.error === pfWords.TOGETHER
        && varLow.status === 400 && /above your 0\.70% VaR limit/.test(String(varLow.body.error)) && state.books[0].settings.length === 40, { noReason, same, out, fixed, target, varLow });
      clock = at("2026-11-21T09:05:00Z");
      const change = await call(A, "pf_setting_set", { id, key: "one_long", value: "8", reason: "tighter into results season" }), after = (await call(A, "pf_get", undefined, { id })).body.book as PfBook, nowRows = pfView.settingsNow(after, "2026-11-21"), row = nowRows.find((r) => r.key === "one_long")!, hist = pfView.historyOf(after, "limit", "2026-11-21"), act = pfView.activityOf(after);
      ck(`saved, the change is a new row, in force from the next session (${String(change.body.effective)}): the value in force stays 10% with "8% from Mon 23 Nov 2026" pending; HISTORY's first line reads ${hist[0]?.from} → ${hist[0]?.to}, "${hist[0]?.by}", pending, with the reason whole; ACTIVITY gains "${act[0]?.text}"`, change.status === 200 && change.body.effective === "2026-11-23" && after.settings.length === 41 && row.value === 10 && row.by === "PM A" && !row.changed && row.pending?.value === 8 && row.pending.from === "2026-11-23"
        && hist[0].key === "one_long" && hist[0].from === "10%" && hist[0].to === "8%" && hist[0].by === "set by the account" && hist[0].state === "pending" && hist[0].reason === "tighter into results season" && hist.find((h) => h.key === "one_long" && h.origin === "creation")?.by === "default (PM advice: A)" && hist.find((h) => h.origin === "creation")?.reason === null
        && act[0].kind === "SETTING" && act[0].text === "One name, long 10% → 8% · in force from Mon 23 Nov 2026, 06:00 SGT · \"tighter into results season\"" && act[act.length - 1].kind === "CREATED" && act[act.length - 1].text === "starting NAV 100,000,000 USD", { row, h: hist[0], a: act[0] });
      { const later = pfView.settingsNow(after, "2026-11-23").find((r) => r.key === "one_long")!;
        const second = await call(A, "pf_setting_set", { id, key: "one_long", value: "7", reason: "tighter still, the same evening" }), b2 = (await call(A, "pf_get", undefined, { id })).body.book as PfBook, h2 = pfView.historyOf(b2, "limit", "2026-11-21").filter((h) => h.key === "one_long");
        ck(`from that session the row reads 8%, "you", since 23 Nov 2026; a second change before the first is in force replaces the pending one from the same date, and both stay in HISTORY (${h2.map((h) => `${h.to}${h.state ? ` ${h.state}` : ""}`).join(" · ")})`, later.value === 8 && later.by === "you" && later.changed && later.since === "2026-11-23" && later.pending === null && second.status === 200 && h2.length === 3 && h2[0].to === "7%" && h2[0].state === "pending" && h2[1].to === "8%" && h2[1].state === "replaced before it was in force"
          && pfView.settingsNow(b2, "2026-11-23").find((r) => r.key === "one_long")!.value === 7 && pfView.settingsNow(b2, "2026-11-21").find((r) => r.key === "one_long")!.pending?.value === 7, h2); }
      { const shut = await call(A, "pf_targets_set", { id, x: "6.0", vol: "5.5" });
        clock = at("2026-12-15T02:00:00Z");
        const high = await call(A, "pf_targets_set", { id, x: "6.0", vol: "7.0" }), open = await call(A, "pf_targets_set", { id, x: "6.0", vol: "5.5" }), b3 = (await call(A, "pf_get", undefined, { id })).body.book as PfBook, t = pfView.targetsNow(b3, "2026-12-14");
        ck(`the targets: outside their window a re-set is refused ("${shut.body.error}"); on 15 Dec a pair is stored as pending for ${String(open.body.forYear)} ("${t.pending ? pfView.targetsWords(t.pending.x, t.pending.vol) : ""}") while cash + 5.0% · 5.0% stays in force; a volatility the VaR limit refuses is refused there too`, shut.status === 400 && shut.body.error === pfWords.WINDOW_CLOSED && high.status === 400 && /implies a 99% one-day VaR of 1\.03%/.test(String(high.body.error)) && open.status === 200 && open.body.forYear === 2027 && t.x === 5 && t.vol === 5 && t.pending?.x === 6 && t.pending.vol === 5.5 && t.pending.forYear === 2027 && t.window.open
          && pfView.targetsWords(6, 5.5) === "cash + 6.0% · 5.5%" && pfView.targetsNow({ ...b3, resets: [{ year: 2027, kind: "made", d: "2027-01-04" }] }, "2027-01-05").x === 6 && pfView.targetsNow({ ...b3, resets: [{ year: 2027, kind: "made", d: "2027-01-04" }] }, "2027-01-05").since === "2027-01-04" && pfView.targetsNow({ ...b3, resets: [{ year: 2027, kind: "withheld", d: "2027-01-04" }] }, "2027-01-05").lapsed === 2027 && pfView.targetsNow({ ...b3, resets: [{ year: 2027, kind: "withheld", d: "2027-01-04" }] }, "2027-01-05").x === 5, { shut, high, open, t });
        clock = at("2026-11-21T09:00:00Z"); }
      { const long = await call(A, "pf_note_add", { id, body: "x".repeat(2121) }), n1 = await call(A, "pf_note_add", { id, body: "Trim autos into results.\nReview the hedge after the print." }), b4 = (await call(A, "pf_get", undefined, { id })).body.book as PfBook, noteId = b4.notes[0]?.id;
        const gone = await call(A, "pf_note_remove", { id, note: noteId }), b5 = (await call(A, "pf_get", undefined, { id })).body.book as PfBook, twice = await call(A, "pf_note_remove", { id, note: noteId });
        ck(`notes: one of 2,121 characters is refused ("${long.body.error}") and nothing of it is kept; a note is stored whole with its line breaks; removed, its text is gone for good and a line with the time stays (ACTIVITY: ${pfView.activityOf(b5).filter((a) => a.kind === "NOTE").map((a) => a.text).join(", ")})`, long.status === 400 && long.body.error === "2,000 characters at most · 121 over" && n1.status === 200 && b4.notes.length === 1 && b4.notes[0].body === "Trim autos into results.\nReview the hedge after the print."
          && gone.status === 200 && b5.notes.length === 1 && b5.notes[0].body === null && b5.notes[0].removedAt !== null && !JSON.stringify(state).includes("Trim autos") && twice.status === 400 && twice.body.error === pfWords.NO_NOTE && pfView.activityOf(b5).filter((a) => a.kind === "NOTE").map((a) => a.text).sort().join() === "added,removed", { long, n: b4.notes.length }); }
      { const ren = await call(A, "pf_rename", { id, name: "Tokyo long/short" }), wrong = await call(A, "pf_delete", { id, name: "tokyo long/short" }), stillThere = state.books.length, right = await call(A, "pf_delete", { id, name: "Tokyo long/short" }), gone = await call(A, "pf_get", undefined, { id });
        ck(`a renaming asks for no reason and is a line of ACTIVITY; delete only after the exact name: "tokyo long/short" for "Tokyo long/short" is refused ("${wrong.body.error}") and removes nothing; the exact name removes the book and everything in it, and its address then says "${gone.body.error}"; the account's agreement stays`, ren.status === 200 && wrong.status === 400 && wrong.body.error === pfWords.NOT_ITS_NAME && stillThere === 1 && right.status === 200 && state.books.length === 0 && gone.status === 404 && gone.body.error === pfWords.NO_SUCH && ((await call(A, "consent")).body.agreedAt as string | null) !== null, { ren, wrong, right }); }
      { for (let i = 0; i < 5; i++) await call(A, "pf_create", { ...form, requestId: `request-cap-${i}`, name: `Book ${i + 1}` });
        const sixth = await call(A, "pf_create", { ...form, requestId: "request-cap-6", name: "Book 6" }), f = (await call(A, "pf_form")).body as unknown as { open: number; cap: number; names: string[]; today: string; nextSession: string; rates: { USD: { rate: number } | null } };
        ck(`the cap: with five open books a sixth is refused with the cap's sentence, and the form's facts say ${f.open} of ${f.cap}, the names in use, today in Singapore and the next session`, sixth.status === 400 && sixth.body.error === pfPresets.CAP_LINE && state.books.length === 5 && f.open === 5 && f.cap === 5 && f.names.length === 5 && f.today === "2026-11-21" && f.nextSession === "2026-11-23" && f.rates.USD?.rate === 3.88, { sixth, f }); }
    }
    // ---- the statement, word for word ----
    {
      // supabase/README.md's quote of the owner's record is held to the migration's seed by sim/readme.test.ts since the
      // check of fix part 4 (23 Nov 2026): this file stops both deploys, and no sentence of a README may (the deploy trap)
      const sql = readText(new URL("../supabase/migrations/20261121000001_pf_store.sql", import.meta.url), "utf8");
      const seeded = /insert into consent_statements[^;]*?values\s*\(\s*1\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/i.exec(sql);
      const record = `${pfStatement.STATEMENT_TEXT} ☐ ${pfStatement.STATEMENT_LABEL}`;
      ck(`the statement is version 1, the owner's wording (b) (${[...pfStatement.STATEMENT_TEXT].length} characters), the same character for character in the engine's file and in the migration's seed, with "☐ I agree" after it (supabase/README.md's quote of the owner's record: sim/readme.test.ts)`, pfStatement.STATEMENT_VERSION === 1 && pfStatement.STATEMENT_LABEL === "I agree" && pfStatement.STATEMENT_RECORD === record && !!seeded && seeded[1].replace(/''/g, "'") === pfStatement.STATEMENT_TEXT && seeded[2] === pfStatement.STATEMENT_LABEL
        && pfStatement.STATEMENT_TEXT === "Private notes, levels and paper portfolios are kept for your account only. Do not enter non-public or confidential information, in notes or in positions: nothing material and non-public about a company or a market, and nothing confidential of your firm or its clients.", { seeded: seeded?.[1] });
      // the owner's record itself is not a file of the repository; where OWNER_DECISIONS names it (the engineer's run), it is compared too
      const own = process.env.OWNER_DECISIONS;
      if (own) { const row = readText(own, "utf8").split("\n").find((l) => l.startsWith("| P2 |")) ?? "", said = /"(Private notes, levels[^"]*)"/.exec(row)?.[1] ?? null; ck("and the same as row P2 of the owner's decisions (the file OWNER_DECISIONS names)", said === record, { said }); }
      else console.log("    · the owner's decisions are not a file of the repository: set OWNER_DECISIONS to its path to compare row P2 with the engine's words as well (the quote in supabase/README.md is compared by sim/readme.test.ts)");
      ck("under a note, always, the statement's gist; a refused create says why", pfStatement.NOTE_GIST === "Notes are for your own reasoning. Do not enter non-public or confidential information." && pfStatement.NOT_AGREED === "Not created: the statement was not agreed." && pfStatement.STATEMENT_TITLE.portfolio === "Before your first paper portfolio" && pfStatement.STATEMENT_TITLE.note === "Before your first note");
    }
    // ---- the page's copy of the engine, and what may never name a private table ----
    {
      const dir = new URL("../supabase/functions/_shared/pf/", import.meta.url), { files, copies, differs, extra } = pageCopy("pf", ["switch.ts"]);
      ck(`the page's copy of the engine (web/src/lib/pf/, ${copies.length} files) is the server's files (supabase/functions/_shared/pf/) under one line that says so: the form on screen and the server refuse by the same rules. The server's switch is not copied`, files.length === 12 && copies.join() === files.join() && differs.length === 0, { differs, extra });
      // What may never reach a job's log: a job's log is public (the plan's C-1). The database refuses every table of
      // the store to any role a job could hold, so a job that named one would only fail; what the service key a job
      // carries CAN do is call the store's functions, which answer for any account. Both are refused here: a table's
      // name in anything a workflow, a job or a function runs, and a store function's name anywhere but the store's
      // own two places on the server (pf_selftest apart: it returns counts). The functions' and the tables' names are
      // read from every migration, so one a later step adds in a file of its own is covered without a change here
      // (PV-4, PC-3, 22 Nov 2026; the review of part 2a, DC-2: they were read from the P-1 file alone).
      const migDir = new URL("../supabase/migrations/", import.meta.url);
      const storeNames = (sqls: string[]): { fns: string[]; tables: string[] } => ({
        fns: [...new Set(sqls.flatMap((q) => [...q.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(pf_[a-z0-9_]+)\s*\(/gi)].map((m) => m[1].toLowerCase())))].filter((f) => f !== "pf_selftest").sort(),
        tables: [...new Set(["consent_statements", "account_consents", ...sqls.flatMap((q) => [...q.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(pf_[a-z0-9_]+)/gi)].map((m) => m[1].toLowerCase()))])].sort(),
      });
      const migs = listDir(migDir).filter((f) => f.endsWith(".sql")).map((f) => readText(new URL(f, migDir), "utf8"));
      const { fns: STORE_FNS, tables: TABLES } = storeNames(migs);
      // What runs, comments set aside by the file's own grammar (the review of part 2a, DC-1: a "/*" inside a string,
      // the Accept header "*/*" or a path "jobs/data/*.json", opened a "comment" to the next "*/", and 22 spans of real
      // code were never searched): TypeScript's printer drops a script's comments and keeps its strings; a workflow, a
      // shell script or a jq file drops only the lines whose first character is "#"; SQL the lines that open with "--".
      const ts = createRequire(new URL("../jobs/package.json", import.meta.url))("typescript") as typeof import("typescript");
      const printer = ts.createPrinter({ removeComments: true });
      const run = (text: string, name = "x.ts"): string => {
        if (/\.(ts|tsx|cjs|mjs|js)$/.test(name)) { try { return printer.printFile(ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, /\.tsx$/.test(name) ? ts.ScriptKind.TSX : /\.(cjs|mjs|js)$/.test(name) ? ts.ScriptKind.JS : ts.ScriptKind.TS)); } catch { return text; } }
        if (/\.(yml|yaml|sh|jq)$/.test(name)) return text.replace(/^\s*#.*$/gm, "");
        if (/\.sql$/.test(name)) return text.replace(/^\s*--.*$/gm, "");
        return text;
      };
      const tablesIn = (text: string, name = "x.ts"): string[] => { const r = run(text, name); return TABLES.filter((t) => r.includes(t)); };
      const fnsIn = (text: string, name = "x.ts"): string[] => { const r = run(text, name); return STORE_FNS.filter((f) => new RegExp(`(^|[^A-Za-z0-9_])${f}([^A-Za-z0-9_]|$)`).test(r)); };
      const named: string[] = [], called: string[] = [], REPO = new URL("../", import.meta.url);
      const scan = (u: URL, fns: boolean) => { for (const f of listDir(u, { withFileTypes: true })) { if (f.name === "node_modules") continue; const at2 = new URL(f.name + (f.isDirectory() ? "/" : ""), u), rel = decodeURIComponent(at2.href.slice(REPO.href.length));   // from the repository's root, wherever it is checked out
        if (f.isDirectory()) scan(at2, fns && rel !== "supabase/functions/_shared/pf/");
        else if (/\.(ts|tsx|cjs|mjs|js|yml|yaml|json|sql|sh|jq)$/.test(f.name) && f.name !== "package-lock.json") { const text = readText(at2, "utf8"); for (const t of tablesIn(text, f.name)) named.push(`${rel}: ${t}`); if (fns && rel !== "supabase/functions/_shared/pfstore.ts") for (const x of fnsIn(text, f.name)) called.push(`${rel}: ${x}`); } } };
      for (const d of ["../.github/workflows/", "../jobs/", "../supabase/functions/"]) scan(new URL(d, import.meta.url), true);
      ck(`no workflow, no job and no function names a private table in anything it runs (${TABLES.join(", ")}; comments set aside): the API reaches them only through the database's own functions, which answer for one account, and the live check through pf_selftest, which returns counts`, named.length === 0 && /rpc\("pf_selftest"\)/.test(readText(new URL("../jobs/lib/pfwalls.ts", import.meta.url), "utf8")) && /pf_selftest \$\{t\.ok === true \? "ok" : "FAILED"\}/.test(readText(new URL("../jobs/lib/pfwalls.ts", import.meta.url), "utf8")) && /pfWalls\(sb\)/.test(readText(new URL("../jobs/live_check.ts", import.meta.url), "utf8")), named);
      ck(`and none calls a function of the store, which would answer for any account (${STORE_FNS.length} names read from the migration: ${STORE_FNS.join(", ")}): only the server's store file and the routes' own folder name them`, STORE_FNS.length >= 12 && ["pf_list", "pf_get", "pf_consent", "pf_note_add", "pf_delete"].every((f) => STORE_FNS.includes(f)) && !STORE_FNS.includes("pf_selftest") && called.length === 0, called);
      // the guard itself, tried on planted lines: each must be caught, and what is allowed must pass
      const planted = [
        'for (const a of accounts) console.log(await sb.rpc("pf_get", { p_account: a.email, p_id: id }));',
        "const { data } = await sb.rpc('pf_list', { p_account: email });",
        'run: curl -s "$SUPABASE_URL/rest/v1/rpc/pf_get" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -d "{\\"p_account\\":\\"$A\\"}"',
        "await db.rpc(`pf_note_add`, { p_account, p_id, p_body });",
        'const rows = await sb.from("pf_notes").select("*");',
      ], allowed = ['const r = await sb.rpc("pf_selftest");', "run: npx tsx probes/pf_jpx.ts && npx tsx probes/pf_bench.ts   # pf_holidays, pf_rates, pf_sec, pf_yahoo_hist", "// a comment may say pf_get", "const consent = await agree();   // the word alone"];
      ck(`the guard tried on ${planted.length} planted lines (a job printing pf_get for every account, a workflow asking /rest/v1/rpc/pf_get, a table read) catches each, and passes the live check's own call and the probes' names`, planted.every((x) => fnsIn(x, x.startsWith("run:") ? "x.yml" : "x.ts").length + tablesIn(x, x.startsWith("run:") ? "x.yml" : "x.ts").length > 0) && allowed.every((x) => fnsIn(x, x.startsWith("run:") ? "x.yml" : "x.ts").length + tablesIn(x, x.startsWith("run:") ? "x.yml" : "x.ts").length === 0), { missed: planted.filter((x) => fnsIn(x).length + tablesIn(x).length === 0), wrong: allowed.filter((x) => fnsIn(x).length + tablesIn(x).length > 0) });
      // DC-1: code after a string that holds "/*", and a workflow line that opens with "--", are searched like any code;
      // DC-2: a function or a table a later migration adds in a file of its own is named too
      const hidden = ['const h = { accept: "*/*" };\nfor (const a of accounts) console.log(await sb.rpc("pf_get", { p_account: a }));\n/* the end */', 'const files = "jobs/data/*.json";\nconst rows = await sb.from("pf_notes").select("*");\n// */'];
      const flagLine = "          --use-api --project-ref $REF\n          curl -s $SUPABASE_URL/rest/v1/rpc/pf_list -H x";
      const later = storeNames([...migs, "create or replace function public.pf_order_add(p_account text) returns void as $$ select 1 $$ language sql;\ncreate table if not exists pf_orders (id text);"]);
      ck(`DC-1, DC-2: the guard reads what runs by each file's own grammar: a store call after a string that holds "/*" (an Accept header "*/*", a path "jobs/data/*.json") is caught, so is a workflow's call on a line after one that opens with "--"; and a function or a table a later migration adds in a file of its own is among the names (${later.fns.includes("pf_order_add") && later.tables.includes("pf_orders") ? "pf_order_add and pf_orders" : "missed"}), read from all ${migs.length} migrations`, hidden.every((x) => fnsIn(x, "x.ts").length + tablesIn(x, "x.ts").length > 0) && fnsIn(flagLine, "x.yml").includes("pf_list") && later.fns.includes("pf_order_add") && later.tables.includes("pf_orders") && STORE_FNS.length >= 12 && TABLES.includes("pf_portfolios"), { hidden: hidden.map((x) => [fnsIn(x, "x.ts"), tablesIn(x, "x.ts")]), later });
      // DC-4 of the review of part 2a: PV-5's fix held by a check. The walls' look (jobs/lib/pfwalls.ts, which the live
      // check's part "pf" prints and acts on) run against stand-in answers; and deploy-server's last step runs it with
      // nothing that would let a red verdict pass.
      {
        const answers = (xs: Array<{ data?: unknown; error?: string }>) => { let i = 0; return { rpc: () => Promise.resolve(((x) => ({ data: x.data ?? null, error: x.error ? { message: x.error } : null }))(xs[Math.min(i++, xs.length - 1)])) }; };
        const OK = { ok: true, rls: 6, tables: 6, openGrants: 0, serviceRoleGrants: 0, sequenceGrants: 0, openFunctions: 0, rowsSeen: 0, statements: 1, functions: 13, definerOwner: 13, policies: 6, rowsThroughPolicies: 0 };
        const w = {
          ok: await pfWalls.pfWalls(answers([{ data: OK }]), 0),
          down: await pfWalls.pfWalls(answers([{ data: { ...OK, ok: false, openGrants: 2 } }]), 0),
          error: await pfWalls.pfWalls(answers([{ error: "permission denied for function pf_selftest" }]), 0),
          late: await pfWalls.pfWalls(answers([{ error: "Could not find the function public.pf_selftest without parameters in the schema cache" }, { error: "TypeError: fetch failed" }, { data: OK }]), 0),
          never: await pfWalls.pfWalls(answers([{ error: "fetch failed" }]), 0),
        };
        const wf = readText(new URL("../.github/workflows/deploy-server.yml", import.meta.url), "utf8"), steps = wf.split(/\n(?=\s{6}- name: )/), names = steps.map((x) => /- name: (.*)/.exec(x)?.[1]?.trim() ?? "");
        const walls = steps.find((x) => /- name: The paper portfolio's walls/.test(x)) ?? "", iW = names.indexOf("The paper portfolio's walls");
        ck(`DC-4: the walls' look says ok only when the database says so: a wall down, a look refused, and a look that never gets through (six tries) are each a failure, which ends the live check's run red; a function the API finds late, or one request that fails, is asked again (${Object.entries(w).map(([k, v]) => `${k} ${v.ok ? "ok" : "failure"}`).join(", ")}); and deploy-server's walls step is its last, after Functions, runs the part "pf" with no continue-on-error and no "|| true"`, w.ok.ok && !w.down.ok && !w.error.ok && w.late.ok && !w.never.ok && /second wall is in force/.test(w.ok.lines.join(" ")) && /could not be run/.test(w.never.lines[0]) && iW === names.length - 1 && iW > names.indexOf("Functions") && names.indexOf("Functions") > 0 && /LIVE_CHECK_ONLY: pf\b/.test(walls) && !/continue-on-error/.test(walls) && !/\|\|\s*true/.test(walls) && /exitCode = 1/.test(readText(new URL("../jobs/live_check.ts", import.meta.url), "utf8").split('part("pf"')[1] ?? ""), { w: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.ok])), names: names.slice(-4) });
      }
      // No log line: a console call anywhere in the API's file, the routes' folder or the store's file would put a
      // request's body, an account or a book's answer into the function's log. None has one, so the rule is the whole
      // file, not a pattern that looks for a word inside the call (RT-10). The page's own files hold none either.
      const logs = (text: string): boolean => /\bconsole\s*(\.|\[)/.test(text);
      const quiet: Array<[string, URL]> = [["supabase/functions/api/index.ts", new URL("../supabase/functions/api/index.ts", import.meta.url)], ["supabase/functions/_shared/pfstore.ts", new URL("../supabase/functions/_shared/pfstore.ts", import.meta.url)], ["web/src/lib/pf.ts", new URL("../web/src/lib/pf.ts", import.meta.url)], ["web/src/views/Portfolio.tsx", new URL("../web/src/views/Portfolio.tsx", import.meta.url)],
        ...listDir(dir).filter((f) => f.endsWith(".ts")).map((f): [string, URL] => [`supabase/functions/_shared/pf/${f}`, new URL(f, dir)]), ...listDir(new URL("../web/src/components/pf/", import.meta.url)).filter((f) => /\.tsx?$/.test(f)).map((f): [string, URL] => [`web/src/components/pf/${f}`, new URL(f, new URL("../web/src/components/pf/", import.meta.url))])];
      const loud = quiet.filter(([, u]) => logs(readText(u, "utf8"))).map(([n]) => n);
      ck(`no file of the paper portfolio writes a log line: none of ${quiet.length} files calls console (the API's whole file, every file of the routes' folder, the store's file, the page's calls and its screens); the rule catches a call whatever it prints`, quiet.length >= 20 && loud.length === 0
        && ["console.log(body)", "console.error(account.email, r.body)", 'console.log("refused", action, JSON.stringify(body))', "console.error(e instanceof Error ? e.message : String(e))", "console.log(String(e), body.note)", 'console["log"](r)'].every(logs) && !logs("Nothing here logs: a refusal goes back to the page that asked, in words it shows."), loud);
    }
    // ---- the tab's pages, and the words that are live this round ----
    ck("a page of the tab opens at its top: a book from the list, Settings from Overview, the form's next step; a section of Settings places itself, and the tab itself does what tabs do", pfOpensAtTop({ view: "portfolio", sub: "all" }, { view: "portfolio", sub: "b1" }) && pfOpensAtTop({ view: "portfolio", sub: "b1" }, { view: "portfolio", sub: "b1/settings" }) && !pfOpensAtTop({ view: "portfolio", sub: "b1/settings" }, { view: "portfolio", sub: "b1/settings/limits" })
      && !pfOpensAtTop({ view: "portfolio", sub: "b1/settings/limits" }, { view: "portfolio", sub: "b1/settings/delete" }) && pfOpensAtTop({ view: "portfolio", sub: "new/ar-ls-jp" }, { view: "portfolio", sub: "new/ar-ls-jp/review" }) && !pfOpensAtTop({ view: "market", sub: "" }, { view: "portfolio", sub: "" }) && pfOpensAtTop({ view: "market", sub: "" }, { view: "portfolio", sub: "new" }) && portfolioPage("b1/settings/limits") === "b1/settings" && portfolioPage("b1") === "b1"
      && opensAtTop({ view: "market", sub: "" }, { view: "asset", sub: "NVDA" }) && !opensAtTop({ view: "market", sub: "" }, { view: "news", sub: "" }));
    // the "personal use" paragraph as README.md's "Data sources" holds it, and the two switches as both READMEs name them,
    // are held by sim/readme.test.ts since the check of fix part 4 (23 Nov 2026): no sentence of a README stops a deploy
    ck(`"personal use" (the owner's decision P4): the paragraph's words ("${PERSONAL_USE_TEXT.slice(0, 60)}…") and the publishers it credits, what is read today beside it, and the tab's word "${PORTFOLIO_WORD}"`, PERSONAL_USE === "personal use" && PERSONAL_USE_TEXT === "Files from JPX, Nikkei, JSF and fund issuers are used on the owner's statement that this Monitor's use is personal and non-commercial (20 Nov 2026). Each is credited where it is used."
      && /^Read today: /.test(PERSONAL_USE_READ) && Object.keys(MEMBERS_SOURCE).sort().join() === "NK225,TOPIX" && /^members: JPX, /.test(MEMBERS_SOURCE.TOPIX.line) && /Nikkei Inc\./.test(MEMBERS_SOURCE.NK225.line) && PORTFOLIO_WORD === "Portfolio");
  }

  console.log("\n[AG] fixes after the checks of round 3b (21 Nov 2026): which closes the table's last session takes, a table read long after its answer, the week's first hours, a results date that is past");
  {
    // ---- CK-5, LS-5: the server's own choice of the two closes (sigma.ts tableLastSession and prevCloses, which table.ts
    // calls; before, these lines were in table.ts, which no check can load) ----
    const D = 86400, t0 = Date.parse("2026-06-01T00:00:00Z") / 1000, days: string[] = [];
    for (let k = 0; days.length < 80; k++) { const d = new Date((t0 + k * D) * 1000); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10)); }
    const walk = days.map((d, k) => ({ d, close: Math.round((100 + Math.sin(k * 1.7) * 3 + Math.cos(k * 0.6) * 2 + k * 0.05) * 1000) / 1000 })), n = walk.length;
    const c0 = walk[n - 1], c1 = walk[n - 2], c2 = walk[n - 3], s = sigmaStats(walk, "price"), st = { sd63x: s.sdx, n63x: s.nx, from63x: s.fromx, to63x: s.tox };
    const want = lastSessionOf(walk, "price")!;
    const own = tableLastSession({ last_d: c0.d, last_close: c0.close, d1_d: c1.d, d1: c1.close }, undefined, [], st, "price", false);
    ck(`a row that is its own last close (a closed market): the anchors' own two closes, ${c1.d} and ${c0.d}, and the figure the series gives (${want.z?.toFixed(3)}σ)`, !!own && own.d === c0.d && own.from === c1.d && own.z !== null && Math.abs(own.z - want.z!) < 1e-12 && own.wTo === c1.d && own.chg === want.chg, own);
    // a quote newer than the last close: the SQL hands the last close back as the previous one; the close before it is read apart
    const stuckA = { last_d: c0.d, last_close: c0.close, d1_d: c0.d, d1: c0.close };
    const rowsOf = (sym: string, list: typeof walk) => list.map((x) => ({ symbol: sym, ...x }));
    const mixed = [...rowsOf("S", walk), ...rowsOf("T", walk.slice(0, n - 5)), ...rowsOf("U", [c0])], lastOf = new Map([["S", c0.d], ["T", walk[n - 6].d], ["U", c0.d]]);
    const prev = prevCloses(mixed, lastOf), shuffled = prevCloses([...mixed].sort((a, b) => (a.close * 7919) % 13 - (b.close * 7919) % 13), lastOf);
    ck(`the close before the last, from rows in any order (a paged read): ${prev.get("S")?.d} for a series whose last is ${c0.d}; each symbol by its own last close; none for a symbol with nothing before it; a close on or after the last never`, prev.get("S")?.d === c1.d && prev.get("S")!.close === c1.close && prev.get("T")?.d === walk[n - 7].d && !prev.has("U") && shuffled.get("S")?.d === c1.d && shuffled.get("T")?.d === walk[n - 7].d && shuffled.size === 2 && prevCloses(mixed, new Map()).size === 0, [...prev]);
    const stuck = tableLastSession(stuckA, prev.get("S"), [], st, "price", false);
    ck("a row whose quote is the newer view (a currency after 17:00 New York): the last session is the same one, from the close read apart", JSON.stringify(stuck) === JSON.stringify(own) && stuck !== null);
    const cut = tableLastSession(stuckA, c2, [], st, "price", false);
    ck("that close missing (the read failed): no last session; an older close in its place (an answer cut short): its change with its true dates and no σ, never a figure of another session", tableLastSession(stuckA, undefined, [], st, "price", false) === null && tableLastSession(stuckA, null, [], st, "price", false) === null && !!cut && cut.from === c2.d && cut.z === null && cut.sd === null && cut.chg !== null);
    // a roll between the two closes
    const roll = { d: c0.d, from_contract: "CLZ26.NYM", to_contract: "CLF27.NYM", prev_close: Math.round(c1.close * 1.01 * 1000) / 1000 };
    const fut = tableLastSession({ last_d: c0.d, last_close: c0.close, d1_d: c1.d, d1: c1.close }, undefined, [{ ...roll, d: c1.d, to_contract: "CLZ26.NYM" }, roll], st, "price", true)!;
    const notFut = tableLastSession({ last_d: c0.d, last_close: c0.close, d1_d: c1.d, d1: c1.close }, undefined, [roll], st, "price", false)!;
    const before = tableLastSession({ last_d: c0.d, last_close: c0.close, d1_d: c1.d, d1: c1.close }, undefined, [{ ...roll, d: c1.d }], st, "price", true)!;
    ck(`a future's change of contract after the earlier close and not after the newest: the session within the new contract (from its own close before, ${roll.prev_close}; the step ${fut.roll?.step?.toFixed(2)}% left out); a roll on the earlier close's day is not between them; another instrument has none`, fut.base === roll.prev_close && fut.roll?.to === "CLF27.NYM" && Math.abs(fut.roll.step! - 1) < 0.01 && Math.abs(fut.chg! - (c0.close / roll.prev_close - 1) * 100) < 1e-12 && fut.z !== null && notFut.roll === null && notFut.base === c1.close && before.roll === null, { fut, before });
    const ywalk = walk.map((x) => ({ d: x.d, close: Math.round((4 + (x.close - 100) / 40) * 1000) / 1000 })), ys = sigmaStats(ywalk, "yield"), y0 = ywalk[n - 1], y1 = ywalk[n - 2];
    const yl = tableLastSession({ last_d: y0.d, last_close: y0.close, d1_d: y1.d, d1: y1.close }, undefined, [], { sd63x: ys.sdx, n63x: ys.nx, from63x: ys.fromx, to63x: ys.tox }, "yield", false)!;
    ck("a yield's in points of its level; no anchors, or a newest close alone: none", Math.abs(yl.chg! - (y0.close - y1.close)) < 1e-12 && yl.z !== null && tableLastSession(null, undefined, [], st, "price", false) === null && tableLastSession({ last_d: c0.d, last_close: c0.close, d1_d: null, d1: null }, undefined, [], st, "price", false) === null && tableLastSession({ last_d: null, last_close: null }, c1, [], st, "price", false) === null);
    // the paged read itself (paging.ts selectAll, which the read of those closes now goes through): more than one page
    await (async () => {
      const all = Array.from({ length: 2345 }, (_, k) => ({ k })), asked: Array<[number, number]> = [];
      const got = await selectAll<{ k: number }>(() => ({ range: (a: number, b: number) => { asked.push([a, b]); return Promise.resolve({ data: all.slice(a, Math.min(b + 1, a + 1000)), error: null }); } }));
      ck(`a read of ${all.length} rows through answers of 1,000 at most comes back whole, in ${asked.length} requests`, got.length === 2345 && got[2344].k === 2344 && asked.length === 3 && asked[1][0] === 1000);
    })();

    // ---- H-3: a table read long after its answer (lib/movers.ts stillLive, staleDay) ----
    const row = (o: Partial<TableRow>): TableRow => ({ symbol: "USDJPY=X", name: "USD/JPY", cls: "Currency", market: "FX", currency: "JPY", decimals: 3, group: "fx", order: 1, last: 158.4, lastAt: "2026-11-20T13:15:00Z", live: true, source: "yahoo", closes: { d1: 157.9 }, closeDates: { d1: "2026-11-19" }, pct: { d1: 0.3 }, marketTab: true, z1d: 0.5, sd1d: 0.58, zFrom: "2026-08-24", zTo: "2026-11-19", zN: 63,
      ls: { d: "2026-11-19", from: "2026-11-18", close: 157.9, base: 157.2, chg: 0.45, z: 0.8, sd: 0.56, n: 63, wFrom: "2026-08-21", wTo: "2026-11-18", roll: null }, ...o } as TableRow);
    const at = (iso: string) => new Date(iso);
    ck(`the server's word "live" holds on the page while the row's print is recent: its feed's delay, ${LIVE_PRINT_MIN} minutes and ${LIVE_SLACK_MIN} more for the page's refresh (USD/JPY: 18 minutes; Tokyo's 20-minute feed: 38)`, stillLive(row({}), at("2026-11-20T13:16:00Z")) && stillLive(row({}), at("2026-11-20T13:33:00Z")) && !stillLive(row({}), at("2026-11-20T13:33:01Z")) && stillLive(row({ market: "TSE" }), at("2026-11-20T13:53:00Z")) && !stillLive(row({ market: "TSE" }), at("2026-11-20T13:53:01Z")) && !stillLive(row({ live: false }), at("2026-11-20T13:16:00Z")) && stillLive(row({ lastAt: null }), at("2026-11-21T01:00:00Z")));
    const kept = at("2026-11-21T01:00:00Z");   // the table kept on Fri 20 Nov 21:16 SGT, read on Sat 21 Nov 09:00 SGT with no connection
    ck(`the table kept on Friday evening and read on Saturday morning: USD/JPY, live then, carries its day (${staleDay(row({}), kept)}) as the closed rows beside it do, on its cell, in its tooltip ("…${todayTip(row({}), kept).split(" · ").pop()}") and on a phone's pill`, staleDay(row({}), kept) === "2026-11-20" && cellDay(row({}), "today", kept) === "2026-11-20" && todayTip(row({}), kept).endsWith(" · the move of 20 Nov 2026") && staleDay(row({}), at("2026-11-20T13:16:00Z")) === null);
    ck("a row that is live now carries none, also a minute after midnight in Singapore with a print of two minutes before", staleDay(row({ lastAt: "2026-11-20T15:59:00Z" }), at("2026-11-20T16:01:00Z")) === null && staleDay(row({ lastAt: "2026-11-20T15:59:00Z" }), at("2026-11-20T16:30:00Z")) === "2026-11-20");

    // ---- LS-3: the week's first hours (lib/movers.ts youngDay) ----
    const NY = "America/New_York", bellOf = (ymd: string) => web.zonedMs(NY, ymd, 17 * 60);
    const sun = bellOf("2026-11-22"), fri = bellOf("2026-11-20"), sat = bellOf("2026-11-21"), mon = bellOf("2026-11-23");
    ck(`the bell a day begins at: the last 17:00 New York at or before now (Sunday 22 Nov 2026's is ${new Date(sun).toISOString().slice(0, 16)}Z; a minute before it, Saturday's still)`, lastBell(new Date(sun)).ymd === "2026-11-22" && lastBell(new Date(sun)).ms === sun && lastBell(new Date(sun - 60e3)).ymd === "2026-11-21" && lastBell(new Date(mon + 5 * 3600e3)).ymd === "2026-11-23" && new Date(sun).toISOString() === "2026-11-22T22:00:00.000Z");
    const fx = row({ closeDates: { d1: "2026-11-20" }, lastAt: "2026-11-23T00:05:00Z", ls: { ...row({}).ls!, d: "2026-11-20", from: "2026-11-19" } }), es = row({ symbol: "ES=F", name: "S&P 500 future", cls: "Futures", market: "CME", closeDates: { d1: "2026-11-20" }, lastAt: "2026-11-22T23:08:00Z", ls: { ...row({}).ls!, d: "2026-11-20", from: "2026-11-19" } });
    ck("Monday morning in Singapore (the week opened at Sunday's bell, and the day before is Friday's): a currency whose 1D runs from Friday's close is young from its first print (08:00 SGT) until 09:00 SGT in New York's winter, and its cell shows Friday's session; a future the same from Globex's opening", youngDay(fx, at("2026-11-23T00:10:00Z")) && showsLast(fx, at("2026-11-23T00:10:00Z")) && youngDay(fx, at("2026-11-23T00:59:00Z")) && !youngDay(fx, at("2026-11-23T01:00:00Z")) && youngDay(es, at("2026-11-22T23:10:00Z")) && showsLast(es, at("2026-11-22T23:10:00Z")) && lastWords(fx) === "last session +0.8σ");
    ck("not where the 1D still runs from Thursday's close; not after Friday's bell nor Saturday's, when no day begins; and Tuesday to Friday as before", !youngDay(row({ closeDates: { d1: "2026-11-19" } }), at("2026-11-23T00:10:00Z")) && !youngDay(row({ closeDates: { d1: "2026-11-20" } }), new Date(fri + 30 * 60e3)) && !youngDay(row({ closeDates: { d1: "2026-11-20" } }), new Date(sat + 30 * 60e3)) && !youngDay(row({ closeDates: { d1: "2026-11-21" } }), new Date(sat + 30 * 60e3)) && youngDay(row({ closeDates: { d1: "2026-11-23" } }), new Date(mon + 70 * 60e3)) && !youngDay(row({ closeDates: { d1: "2026-11-20" } }), new Date(mon + 70 * 60e3)));
    const sunSummer = bellOf("2026-07-19");
    ck(`in New York's summer Sunday's bell is ${new Date(sunSummer).toISOString().slice(11, 16)} UTC: a future is young from Globex's opening until 08:00 SGT; a currency's first print comes at 08:00 SGT, when the three hours are over`, new Date(sunSummer).toISOString() === "2026-07-19T21:00:00.000Z" && youngDay(row({ market: "CME", closeDates: { d1: "2026-07-17" } }), at("2026-07-19T22:30:00Z")) && !youngDay(row({ market: "CME", closeDates: { d1: "2026-07-17" } }), at("2026-07-20T00:00:00Z")) && !youngDay(row({ closeDates: { d1: "2026-07-17" } }), at("2026-07-20T00:00:00Z")));

    // ---- RM-3: a results date that is past (lib/results.ts resultsAhead) ----
    const now0 = Date.parse("2026-11-21T21:00:00Z"), h = 3600e3;
    ck("a results date is still a next one while it is ahead or no more than a day old: 23 hours ago yes, 25 hours ago no (Friday's date at the weekend); a plain date by its own midnight; none for no date or one that cannot be read", RESULTS_KEPT_MS === 24 * h && resultsAhead(new Date(now0 + 5 * 24 * h).toISOString(), now0) && resultsAhead(new Date(now0 - 23 * h).toISOString(), now0) && !resultsAhead(new Date(now0 - 25 * h).toISOString(), now0) && !resultsAhead("2026-11-20T21:00:00Z", Date.parse("2026-11-21T21:00:00Z")) && resultsAhead("2026-11-21", now0) && !resultsAhead("2026-11-20", now0) && !resultsAhead(null, now0) && !resultsAhead("", now0) && !resultsAhead("soon", now0));
  }

  console.log("\n[AH] the probes' gates and what a probe prints, run offline: no request leaves the machine (fixes after the checks of round 3b, 21 Nov 2026)");
  {
    const quiet = async <T>(fn: () => Promise<T> | T): Promise<T> => { const log = console.log; console.log = () => undefined; try { return await fn(); } finally { console.log = log; } };
    // a stand-in for fetch: every address asked is recorded and answered from `site`; anything else is a 404
    type Ans = { status?: number; type?: string; body?: string; location?: string };
    const withSite = async <T>(site: Record<string, Ans>, fn: (asked: Array<{ url: string; method: string }>) => Promise<T>): Promise<T> => {
      const real = globalThis.fetch, asked: Array<{ url: string; method: string }> = [];
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => { const url = String(input); asked.push({ url, method: String(init?.method ?? "GET").toUpperCase() }); const a = site[url] ?? { status: 404, body: "not found" }; const st = a.status ?? 200; return new Response(st >= 300 && st < 400 ? null : a.body ?? "", { status: st, headers: { "content-type": a.type ?? "text/html", ...(a.location ? { location: a.location } : {}) } }); }) as typeof fetch;
      try { return await quiet(() => fn(asked)); } finally { globalThis.fetch = real; probe.restoreHolds(); }
    };
    const doc = (title: string, body: string) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

    // ---- PR-1: which line of a site's terms holds its data files ----
    const UK = 'As a user, you may not sell, copy, publish, distribute, transfer, modify, display, reproduce, and/or create any derivative works from the information or software on this website. You may not redeliver any of the pages, text, images, or content of this website using "framing" or similar technology. You acknowledge that you have no right to use the content of this website in any other manner.';
    const UK_PERSONAL = "This website is for your personal and internal use and is not to be used for any commercial purposes (whether or not for profit) unless and to the extent you are a financial adviser seeking information about iShares products for your clients.";
    const JPX_LINE = "当サイトに掲載されている情報について、有料・無料を問わずJPXからの許諾を得ている場合を除き、商用目的によるデータ収集のほか如何なる用途に関わらず二次利用及び再配信はできません。";
    const NOMURA = "著作権法により、電子的方法または機械的方法を問わず、いかなる目的であれ、無断で複製、引用、転載または転送等を行うことはできません。";
    const CBOE = "No data, values, or other content contained in this document (including without limitation, index values or information, ratings, credit-related analyses and data, research, valuations, strategies, methodologies, and models) or any part thereof may be modified, reverse-engineered, reproduced, or distributed in any form or by any means, or stored in a database or retrieval system, without the prior written permission of Cboe.";
    const kind = (l: string) => probe.termsBar(l)?.kind ?? null;
    ck("the lines the logs of 20 and 21 Nov 2026 hold: iShares UK's ban on copying and reproducing is a bar (it was \"none matched\", and the probe went on to that site's product data); JPX's, Nomura's and Cboe's lines, which the owner's answer turned on, are bars as before; iShares UK's line on personal and internal use is none", kind(UK) === "re-use" && kind(JPX_LINE) === "re-use" && kind(NOMURA) !== null && kind(CBOE) === "re-use" && kind(UK_PERSONAL) === null, [kind(UK), kind(JPX_LINE), kind(NOMURA), kind(CBOE), kind(UK_PERSONAL)]);
    ck("a ban that names no purpose it is limited to is a bar, in English or Japanese, also \"regardless of purpose\" and \"without leave\": the reviewers' sample sentences", kind("You may not copy, store, reproduce or redistribute the data on this site.") === "re-use" && kind("Secondary use and redistribution of the information on this site are prohibited regardless of purpose.") === "re-use" && kind("当サイトの内容を無断で複製、転載、再配信することを禁じます。") === "re-use" && kind("Reproduction of the content of this site is prohibited.") === "re-use" && kind("As a user, you may not copy or reproduce the information on this website for any purpose.") === "re-use");
    ck("a ban limited to commercial use, or one that leaves personal use free, is not a bar; one that says \"for commercial or any other purpose\" still is", kind("You may not copy or reproduce the data on this site for commercial purposes.") === null && kind("You may not copy or reproduce the content of this site other than for your own personal, non-commercial use.") === null && kind("You may not copy or reproduce the data on this site for commercial purposes or for any purpose whatever the purpose.") === "re-use");
    ck("automated reading forbidden is a bar whatever the purpose; a clause that only declines liability for automated systems forbids nothing (it was called a bar); an advertisement that names robotics is none", kind("You agree not to use any robot, spider, scraper or other automated means to access the site.") === "automated" && kind("Please refrain from automated retrieval that places a heavy load on this website.") === "automated" && kind("We shall not be liable for any loss arising from your use of automated trading systems connected to this service.") === null && kind("BlackRock shall not be liable for any errors of automated data feeds.") === null && kind("Invest in the companies that build automation and robotics.") === null);
    const tUk = await quiet(() => probe.printTerms(doc("Terms and conditions", `<p>${UK_PERSONAL}</p><p>${UK}</p>`))), tFree = await quiet(() => probe.printTerms(doc("Terms of use", "<p>You may not copy or reproduce the content of this site other than for your own personal, non-commercial use.</p>")));
    ck("a terms page with iShares UK's two sentences gives one bar, so the caller leaves that site's files unread; a page whose only ban leaves personal use free gives none", tUk.bars.length === 1 && tUk.bars[0] === UK && tUk.subjects >= 2 && tFree.bars.length === 0, { uk: tUk.bars.length, free: tFree.bars.length });

    // ---- PR-6: the holds read an address as the request will go, and every redirect is put to them ----
    const spellings = ["https://www.jpx.co.jp/english/", "https://www.jpx.co.jp./x", "https://WWW.JPX.CO.JP/x", "https:\\\\www.jpx.co.jp\\x", " https://www.jpx.co.jp/x", "https://www.jpx.co%2Ejp/x", "https://ｗｗｗ.ｊｐｘ.ｃｏ.ｊｐ/x", "https://www.jpx.co.jp:443/x", "https://user@www.jpx.co.jp/x", "http://jpx.co.jp", "https://cdn.cboe.com/api/global/us_indices/daily%5Fprices/VIX%5FHistory.csv", "https://cdn.cboe.com./api/global/us_indices/daily_prices/VIX_History.csv", "https://nextfunds.jp//monthly_holdings/x.csv", "https://www.nomura-am.co.jp/fund/monthly_holdings/1306.csv", "no address at all, but it names jpx.co.jp"];
    const free = ["https://example.com/jpx.co.jp/x", "https://www.cboe.com/us/equities/market_statistics/", "https://www.nomura-am.co.jp/fund/funddetail.php", "https://notjpx.co.jp.example.org/x", "https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X"];
    ck(`an address is held by where its request goes: ${spellings.length} spellings of held addresses (a dot after the host, escaped and full-width letters, backslashes, a port, a leading space, an escaped path) are all refused; an address that only names a held site in its path is not`, spellings.every((u) => probe.heldWhy(u) !== null) && free.every((u) => probe.heldWhy(u) === null), { passed: spellings.filter((u) => probe.heldWhy(u) === null), heldWrongly: free.filter((u) => probe.heldWhy(u) !== null) });
    const hop = await withSite({ "https://other.example/x": { status: 301, location: "https://www.jpx.co.jp/english/y.html" }, "https://www.jpx.co.jp/english/y.html": { body: doc("JPX", "<p>held</p>") }, "https://other.example/ok": { status: 302, location: "https://other.example/there" }, "https://other.example/there": { body: doc("There", "<p>fine</p>") } }, async (asked) => {
      const p = await probe.page("https://other.example/x"), l = await probe.look("https://other.example/x", { show: 0 }), b = await probe.bytes("https://other.example/x");
      const heldCalls = asked.length;
      const ok = await probe.page("https://other.example/ok");
      const only = await probe.page("https://other.example/ok", { only: (u) => u.startsWith("https://other.example/ok") });
      return { p, l, b, heldCalls, ok, only, asked: asked.map((a) => a.url) };
    });
    ck("a redirect is followed by hand, each hop put to the hold: an address elsewhere that answers 301 to jpx.co.jp is not followed by page(), look() or bytes() (the held address is never requested); a redirect to an address that is not held is followed and named; a probe that reads one site alone does not follow a redirect off it", hop.p.ok === false && hop.p.status === null && hop.l.error === "held" && hop.b.data === null && hop.heldCalls === 3 && !hop.asked.includes("https://www.jpx.co.jp/english/y.html") && hop.ok.ok && hop.ok.final === "https://other.example/there" && hop.only.ok === false && hop.asked.filter((u) => u === "https://other.example/there").length === 1, { asked: hop.asked, ok: [hop.ok.ok, hop.ok.final], only: hop.only.ok });
    // JPX's files that the owner's first answer rules out, the list of triggered stocks and the ETF list, by the
    // addresses the probe logs of 20 and 21 Nov 2026 hold (C/probes/*.log): held while the lift is on (PX-7)
    const RULED_OUT = ["https://www.jpx.co.jp/automation/markets/indices/topix/files/topixweight_j.csv", "https://www.jpx.co.jp/markets/statistics-equities/margin/tvdivq0000001rb8-att/Premium_Charges.xlsx", "https://www.jpx.co.jp/markets/statistics-equities/margin/05.html", "https://www.jpx.co.jp/markets/derivatives/settlement-price/tvdivq00000014l6-att/rb20261120.csv", "https://www.jpx.co.jp/markets/derivatives/settlement-price/index.html", "https://www.jpx.co.jp/listing/event-schedules/financial-announcement/tvdivq0000001ofb-att/kessan09_1106.xlsx", "https://www.jpx.co.jp/english/markets/equities/ss-reg/index.html"];
    const ETF_LIST = "https://www.jpx.co.jp/equities/products/etfs/issues/01.html";
    const lifted = await withSite({ "https://www.jpx.co.jp/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow:\n" }, "https://www.jpx.co.jp/english/equities/trading/domestic/01.html": { status: 302, location: RULED_OUT[0] } }, async (asked) => { const before = await probe.page("https://www.jpx.co.jp/robots.txt"); probe.liftJpxHold(); const after = await probe.page("https://www.jpx.co.jp/robots.txt"); const hop = await probe.page("https://www.jpx.co.jp/english/equities/trading/domestic/01.html"); const held = RULED_OUT.filter((u) => probe.heldWhy(u) !== null), etf = probe.heldWhy(ETF_LIST) !== null; probe.liftJpxHold({ etfList: true }); return { before: before.ok, after: after.ok, hop: hop.ok, n: asked.length, asked: asked.map((a) => a.url), held: held.length, etf, etfLifted: probe.heldWhy(ETF_LIST) === null, ruledStill: RULED_OUT.every((u) => probe.heldWhy(u) !== null), stillHeld: probe.heldWhy("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv") !== null }; });
    ck(`jpx.co.jp is refused to every probe until pf_jpx lifts the hold for its own run; then the files of the owner's first answer and the list of triggered stocks stay held (${lifted.held} of ${RULED_OUT.length} addresses, a redirect to one not followed), and so does JPX's ETF list until its own switch says so (PX-7: once lifted, nothing on jpx.co.jp was held); Cboe's files stay held; the reason printed names the owner's answer of 21 Nov 2026`, lifted.before === false && lifted.after === true && lifted.hop === false && lifted.n === 2 && !lifted.asked.includes(RULED_OUT[0]) && lifted.held === RULED_OUT.length && lifted.etf && lifted.etfLifted && lifted.ruledStill && lifted.stillHeld && probe.heldWhy("https://www.jpx.co.jp/") !== null && /released on 21 Nov 2026/.test(probe.heldWhy("https://www.jpx.co.jp/") ?? "") && !/until the owner answers/.test(probe.heldWhy("https://www.jpx.co.jp/") ?? ""), lifted);
    // RA-2 of the release audit of pull request #50 (23 Nov 2026): the owner's answer of 23 Nov 2026, 01:42 UTC, on NYSE's
    // threshold list is "Go without" (no job reads it), and it is held by path like Cboe's and Nomura's files: its page,
    // the page that one ended at on 21 Nov (/regulation/regulation-sho) and its download, however the address is
    // written and behind a redirect, are refused before any request; pf_borrow itself, run offline, asks none of them
    const NYSE_HELD = ["https://www.nyse.com/regulation/threshold-securities", "https://www.nyse.com/regulation/regulation-sho", "https://www.nyse.com/api/regulatory/threshold-securities/download?selectedDate=&market=", "https://www.nyse.com/api/regulatory/threshold-securities/download?selectedDate=2026-11-20&market=NYSE%20Arca", "https://WWW.NYSE.COM./regulation/threshold-securities", "https://www.nyse.com/regulation/%74hreshold-securities", "https://nyse.com//api/regulatory/threshold-securities/download", "https://www.nyse.com/regulation/Threshold_Securities.csv", "no address at all, but it names nyse.com's threshold-securities"];
    const NYSE_FREE = ["https://www.nyse.com/robots.txt", "https://www.nyse.com/trade/hours-calendars", "https://www.nasdaqtrader.com/dynamic/symdir/regsho/nasdaqth20261120.txt"];
    const nyse = await withSite({ "https://other.example/sho": { status: 302, location: NYSE_HELD[0] } }, async (asked) => {
      let answered = 0;
      for (const u of NYSE_HELD.slice(0, -1)) { const p = await probe.page(u), l = await probe.look(u, { show: 0 }), b = await probe.bytes(u); if (p.ok || p.status !== null || l.error !== "held" || b.data !== null || b.status !== null) answered++; }
      const direct = asked.length, hop = await probe.page("https://other.example/sho");
      return { answered, direct, hop: hop.ok, asked: asked.map((a) => a.url) };
    });
    const nyseWhy = probe.heldWhy(NYSE_HELD[0]) ?? "";
    const borrowRun = { out: "", asked: [] as string[] };
    {
      const real = globalThis.fetch, lines: string[] = [], log = console.log;
      // every robots.txt allows all, every other address is a 404: what pf_borrow would ask of nyse.com if nothing held it
      globalThis.fetch = (async (input: unknown) => { const u = String(input); borrowRun.asked.push(u); const rb = /\/robots\.txt$/.test(new URL(u).pathname); return new Response(rb ? "User-agent: *\nDisallow:\n" : "not found", { status: rb ? 200 : 404, headers: { "content-type": rb ? "text/plain" : "text/html" } }); }) as typeof fetch;
      (globalThis as { __probeOffline?: boolean }).__probeOffline = true;
      console.log = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
      try { await import("../jobs/probes/pf_borrow.ts"); }
      catch (e) { lines.push(`THE PROBE STOPPED: ${e instanceof Error ? e.message : String(e)}`); }
      finally { console.log = log; globalThis.fetch = real; delete (globalThis as { __probeOffline?: boolean }).__probeOffline; probe.restoreHolds(); }
      borrowRun.out = lines.join("\n");
    }
    const borrowNyse = borrowRun.asked.filter((u) => /nyse\.com/i.test(u));
    ck(`RA-2: NYSE's threshold list is held by path, as the owner's "Go without" of 23 Nov 2026 says: ${NYSE_HELD.length - 1} addresses of its page, the page it ended at and its download (a capital host with a dot after it, an escaped letter, a doubled slash, another file name) are refused by page(), look() and bytes() before any request (${nyse.direct} asked, ${nyse.answered} answered), a redirect to it is not followed, text that names it is held; NYSE's robots.txt, its hours page and Nasdaq's Reg SHO file are not held; pf_borrow run offline asks nyse.com only its robots.txt (${borrowNyse.length}: ${borrowNyse.join(", ")}) and prints the page as NOT ASKED (held)`,
      nyse.direct === 0 && nyse.answered === 0 && nyse.hop === false && nyse.asked.join() === "https://other.example/sho" && NYSE_HELD.every((u) => probe.heldWhy(u) !== null) && NYSE_FREE.every((u) => probe.heldWhy(u) === null) && /Go without/.test(nyseWhy) && /23 Nov 2026/.test(nyseWhy)
        && borrowNyse.length === 1 && borrowNyse[0] === "https://www.nyse.com/robots.txt" && /NOT ASKED \(held\)\s+https:\/\/www\.nyse\.com\/regulation\/threshold-securities/.test(borrowRun.out) && /requests made:/.test(borrowRun.out) && !/THE PROBE STOPPED/.test(borrowRun.out),
      { nyse, why: nyseWhy, borrowNyse, stopped: borrowRun.out.split("\n").filter((l) => /STOPPED|held/i.test(l)).slice(0, 6) });
    // V7-4 of the check of batch 7b (23 Nov 2026): after the held page, step 1 still printed "\"NYSE\" is asked, a
    // candidate" and put the download to the owner ("FOR THE OWNER"), who had answered "Go without" (23 Nov 2026, 01:42
    // UTC). Step 1 now ends with a line that says the list is held by that answer
    const step1 = borrowRun.out.slice(borrowRun.out.indexOf("== 1. NYSE"), borrowRun.out.indexOf("== 2. "));
    ck(`V7-4: pf_borrow's step 1, run offline, says NYSE's threshold list is held by the owner's answer of 23 Nov 2026 ("Go without") and prints no market as a candidate to ask and nothing FOR THE OWNER (${step1.split("\n").filter((l) => l.trim()).length} lines)`,
      borrowRun.out.indexOf("== 1. NYSE") >= 0 && borrowRun.out.indexOf("== 2. ") > borrowRun.out.indexOf("== 1. NYSE") && /held by the owner's answer of 23 Nov 2026, "Go without"/.test(step1) && !/candidate/i.test(step1) && !/FOR THE OWNER/.test(step1) && !/"NYSE" is asked|the download is NOT asked/.test(step1),
      { step1: step1.split("\n").filter((l) => l.trim()) });

    // ---- PR-7: robots.txt ----
    const rob = await withSite({ "https://a.example/robots.txt": { type: "text/html", body: "User-agent: *\nDisallow: /\nCrawl-delay: 5\n" }, "https://b.example/robots.txt": { type: "text/html", body: "<!doctype html><html><head><title>Welcome</title></head><body>Home</body></html>" }, "https://c.example/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /private/\n" } }, async () => ({ a: await probe.robots("https://a.example", ["/data.csv"]), b: await probe.robots("https://b.example", ["/data.csv"]), c: await probe.robots("https://c.example", ["/data.csv"]) }));
    ck("a robots.txt of directives served as text/html is still the site's rules (\"Disallow: /\" holds; by its type alone it was \"an HTML page\" and every path was open); an HTML page in the file's place is no file; a file read as before", rob.a.outcome === "read" && rob.a.allows("/data.csv") === false && rob.a.crawlDelay === "5" && rob.b.outcome === "none" && rob.c.outcome === "read" && rob.c.allows("/data.csv") && !rob.c.allows("/private/x"), { a: [rob.a.outcome, rob.a.rules], b: rob.b.outcome });
    ck("the pause before the next request keeps the file's Crawl-delay where it is longer than the probe's own pace (5 s for 1.5 s), up to thirty seconds", probe.gapFor(rob.a, 1500) === 5000 && probe.gapFor({ crawlDelay: "0.5" }, 1500) === 1500 && probe.gapFor({ crawlDelay: null }, 1500) === 1500 && probe.gapFor(null, 3000) === 3000 && probe.gapFor({ crawlDelay: "600" }, 1500) === 30000 && probe.gapFor({ crawlDelay: "soon" }, 1500) === 1500);

    // ---- PR-8: a page a "legal" link leads to is not the site's terms by being reached ----
    const FUND = doc("A fund", '<a href="https://funds.example/literature">Financial &amp; legal</a>');
    const LIB = (extra: string) => doc("Literature | Funds", `<p>Download our fund documents and reports from this library page.</p><p>Invest in the companies that build automation and robotics for tomorrow.</p>${extra}`);
    const TERMS = doc("Terms and conditions | Funds", `<p>This website is for your personal use only and may not be used for commercial purposes of any kind.</p><p>You may not copy or reproduce the content of this site other than for your own personal, non-commercial use.</p>`);
    const rt = await withSite({ "https://funds.example/literature": { body: LIB('<a href="/terms">Terms and conditions</a>') }, "https://funds.example/terms": { body: TERMS } }, async (asked) => ({ r: await probe.readTerms({ html: FUND, final: "https://funds.example/fund" }, { gapMs: 0 }), asked: asked.map((a) => a.url) }));
    const rtNone = await withSite({ "https://funds.example/literature": { body: LIB("") } }, async () => probe.readTerms({ html: FUND, final: "https://funds.example/fund" }, { gapMs: 0 }));
    const rtBar = await withSite({ "https://funds.example/literature": { body: LIB('<a href="/terms">Terms and conditions</a>') }, "https://funds.example/terms": { body: doc("Terms and conditions", `<p>${UK_PERSONAL}</p><p>${UK}</p>`) } }, async () => probe.readTerms({ html: FUND, final: "https://funds.example/fund" }, { gapMs: 0 }));
    ck("a library of documents with one stray line on a subject is not \"terms read\": the terms page it links is read too; with no such link the terms are not found (read: false), so a file that needs \"read and not barred\" stays shut; a bar on the terms page behind the hub is seen", rt.r.read && !rt.r.barred && rt.asked.join() === "https://funds.example/literature,https://funds.example/terms" && rtNone.read === false && rtBar.read && rtBar.barred && probe.isTermsPage(LIB(""), 1) === false && probe.isTermsPage(TERMS, 3) && !probe.isTermsPage(TERMS, 0) && probe.isTermsPage(TERMS, 0, 1) && !probe.isTermsPage(doc("Legal", "<p>x</p>"), 2), { rt, rtNone, rtBar });

    // ---- PR-5, PR-4, PR-3: what pf_jpx prints of a page, which links it follows, and its calendar test ----
    const LOGGED = ["Effective March 1, 2027, the methodology for determining applicable tick sizes will be changed from the current index classification-based approach (whether an issue is a TOPIX 500 constituent) to a liquidity-based approach.", "Auction trading period is divided into morning session and afternoon session. Morning session is from 9:00 am to 11:30 am, while afternoon session is from 12:30 pm to 3:30 pm. Orders are accepted from 8:00 am and 12:05 pm respectively.", "September 22, 2026, is a holiday in accordance with Rule 3, Paragraph 3 of Act on National Holidays.", "2026年9月22日（火）は、祝日法第3条第3項による休日です。"];
    const CLOCK = /\b\d{1,2}[:：]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?/i, DATED = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d\d\b|20\d\d年\s*\d{1,2}月\s*\d{1,2}日/i;
    const bits = [...jpxRead.valueBits(LOGGED, CLOCK), ...jpxRead.valueBits(LOGGED, DATED)];
    ck(`the four sentences of JPX's pages that the run of 21 Nov put in a public log are not printable (each is more than ${jpxRead.MAX_WORDS} words or, in Japanese, ends with a full stop), as lines or as a table's cells; what a page gives of them is its values alone, in order, joined only by the one short word between two of them (${bits.map((b) => `"${b}"`).join(", ")})`, LOGGED.every((l) => !jpxRead.sayable(l) && !jpxRead.figureCell(l) && /^\(text of \d+ (?:words|characters): not printed\)$/.test(jpxRead.cellOut(l))) && bits.join("|") === "9:00 am to 11:30 am|12:30 pm to 3:30 pm|8:00 am and 12:05 pm|March 1, 2027|September 22, 2026|2026年9月22日" && bits.every((b) => jpxRead.sayable(b)), bits);
    // PX-1: the pieces printed from one line, joined, carry no run of the line's own words outside its values: between
    // two values at most the one joining word, and none before the first or after the last
    const pageWords = (l: string, re: RegExp) => { const g = new RegExp(re.source, `${re.flags.replace("g", "")}g`); return l.replace(g, " \u0000 ").split(/\s+/).filter((w) => w && w !== "\u0000"); };
    const leftOver = (l: string, re: RegExp) => { const g = new RegExp(re.source, `${re.flags.replace("g", "")}g`); return jpxRead.valueBits([l], re).map((b) => b.replace(g, " ").split(/\s+/).filter(Boolean)); };
    const hoursLine = LOGGED[1], hoursLeft = leftOver(hoursLine, CLOCK), runOfPage = (l: string, re: RegExp) => { const w = pageWords(l, re), out = jpxRead.valueBits([l], re).join(" "); for (let i = 0; i + 2 <= w.length; i++) { const two = `${w[i]} ${w[i + 1]}`; if (out.includes(two)) return two; } return null; };
    ck(`PX-1: the hours paragraph's pieces, read together, carry none of its sentences: no two of its own words running outside the values (${JSON.stringify(runOfPage(hoursLine, CLOCK))}), and between two values at most one joining word (${hoursLeft.map((x) => x.join(" ") || "nothing").join("; ")})`, runOfPage(hoursLine, CLOCK) === null && hoursLeft.every((x) => x.length <= 1 && x.every((w) => /^(?:to|and|or|-|–|until)$/i.test(w))) && LOGGED.every((l) => runOfPage(l, CLOCK) === null && runOfPage(l, DATED) === null), { hoursLeft, bits });
    const SHORT_SENTENCES = ["Orders are accepted from 8:00 am.", "Short selling is prohibited", "Trading hours are as follows", "Click here for details.", "This applies to every issue", "休日です", "取引は9時からです", "Is the market open today"];
    ck(`PX-1: a whole short sentence is no table cell, heading or title piece either (${SHORT_SENTENCES.length} of them, the review's kind), while labels, figures, dates and "May 1, 2027" are`, SHORT_SENTENCES.every((t) => !jpxRead.sayable(t) && /not printed/.test(jpxRead.cellOut(t))) && ["Tick Size (yen)", "9:00 am - 11:30 am", "More than 3,000 yen up to 5,000 yen", "TOPIX500 Constituents (TOPIX100 and TOPIX Mid400 Constituents)", "Daily Price Limits", "May 1, 2027", "No. 3", "Note", "2026/11/23（月） 勤労感謝の日"].every((t) => jpxRead.sayable(t)), SHORT_SENTENCES.filter((t) => jpxRead.sayable(t)));
    ck("a label, a table cell, a title piece and a date are printable; a navigation label or a notice's title only as far as it is short; a Japanese clause with its subject marked (が) is held since PL-1 of the final review of pull request #50", jpxRead.sayable("Tick Size (yen)") && jpxRead.sayable("9:00 am - 11:30 am") && jpxRead.sayable("2026/11/23（月） 勤労感謝の日") && jpxRead.sayable("More than 3,000 yen up to 5,000 yen") && jpxRead.figureCell("3,000円超 5,000円以下") && !jpxRead.figureCell("1株の値段が3,000円以下") && jpxRead.sayable("TOPIX500構成銘柄以外の銘柄") && !jpxRead.sayable("Public Release of the Report From the Working Group on Tick Sizes for 2027 and its recommendations"));
    const TICK = "<h3>TOPIX500 Constituents</h3><table><tr><th>Price per share (yen)</th><th></th><th>Tick Size (yen)</th></tr><tr><td>up to</td><td>1,000</td><td>0.1</td></tr><tr><td>up to</td><td>3,000</td><td>0.5</td></tr><tr><td>over</td><td>50 million</td><td>100,000</td></tr><tr><td>Note</td><td>These tick sizes apply to every issue that is a constituent of the index on the day in question and not otherwise</td><td>1</td></tr></table>";
    const NOTICES = "<table><tr><td>2026/04/22</td><td>Public Release of the Report From the Working Group on Tick Sizes for 2027</td></tr><tr><td>2026/05/22</td><td>Revisions to the Trading Rules to Further Optimise Tick Sizes From March 1, 2027</td></tr></table>";
    const ft = jpxRead.figureTables(doc("Tick Size", TICK + NOTICES));
    ck("a table of figures is printed cell by cell under its heading, a cell of prose in it only counted; a table of dated notices is not a table of figures and is left out whole (three notice titles were printed, each cut at 40 characters)", ft.length === 1 && ft[0].heading === "TOPIX500 Constituents" && ft[0].rows[1].join("|") === "up to|1,000|0.1" && ft[0].held === 1 && /^\(text of \d\d words: not printed\)$/.test(ft[0].rows[4][1]) &&jpxRead.otherTables(doc("Tick Size", TICK + NOTICES)) === 1 && !JSON.stringify(ft).includes("Public Release"), ft);
    const links = [{ href: "https://elsewhere.example.org/notes/ssr.html", text: "Short selling" }, { href: "https://www.jpx.co.jp/english/equities/trading/regulations/02.html", text: "Short Selling Regulations" }];
    const src = readText(new URL("../jobs/probes/pf_jpx.ts", import.meta.url), "utf8");
    ck("a rule page is read only where a JPX page links it and it is on jpx.co.jp: a link by the words \"short selling\" to another site is not taken; and pf_jpx holds no address from memory (it asked JPX's daily list of triggered stocks from one)", jpxRead.linkedOnJpx(links.slice(0, 1), /short[- ]?sell/i) === null && jpxRead.linkedOnJpx(links, /short[- ]?sell/i)?.href === links[1].href && jpxRead.onJpx("https://www.jpx.co.jp./x") && !jpxRead.onJpx("https://example.com/jpx.co.jp/") && !jpxRead.onJpx("not an address") && !/ss-reg|shortCandidates/.test(src) && /NOT FOUND/.test(src) && /only: onJpx/.test(src));
    const J = "https://www.jpx.co.jp/english/markets", named = [{ href: `${J}/statistics-equities/short-selling/index.html`, text: "Short Selling Value" }, { href: `${J}/equities/ss-triggered/index.html`, text: "Short Selling Price Restriction: List of Triggered Stocks" }, { href: `${J}/equities/outstanding/index.html`, text: "Outstanding Short Selling Positions Reported" }, { href: "https://elsewhere.example.org/ssr.html", text: "Short Selling Regulations" }];
    const rule = { href: "https://www.jpx.co.jp/english/equities/trading/regulations/02.html", text: "Restrictions on Short Selling" };
    ck("and only where its name says short selling and a rule: a page of short-selling figures, the list of triggered stocks (which the run of 21 Nov read) and a report of positions are not taken, on jpx.co.jp or not, and their addresses are handed on for a person; a page named for the restriction is taken", jpxRead.shortRuleLink(named) === null && jpxRead.shortOtherLinks(named).length === 3 && jpxRead.shortOtherLinks(named).every((h) => jpxRead.onJpx(h)) && jpxRead.shortRuleLink([...named, rule])?.href === rule.href && jpxRead.shortRuleLink([{ ...rule, text: "Short Selling Regulations" }])?.href === rule.href && !jpxRead.shortOtherLinks([...named, rule]).includes(rule.href) && /shortRuleLink\(links\)/.test(src) && !/linkedOnJpx\([a-zA-Z]+, SHORT\)/.test(src), { taken: jpxRead.shortRuleLink(named), others: jpxRead.shortOtherLinks(named) });
    const EN = ["Update : Feb. 06, 2026", "Jan. 1 (Thu.) | New Year's Day |", "Nov. 3 (Tue.) |", "Nov. 23 (Mon.) |", "Dec. 31 (Thu.) |", "Jan. 1 (Fri.) |", "Jan. 11 (Mon.) |", "Feb. 30 (Mon.) |", LOGGED[2]];
    const JA = ["2026/02/06 更新", "2026/01/01（木） | 元日 |", "2026/11/03（火） | 文化の日 |", "2026/11/23（月） | 勤労感謝の日 |", "2026/12/31（木） 休業日 |", "2027/01/01（金） | 元日 |", "2027/01/02（土） | 休業日 |", "2027/01/11（月） | 成人の日 |", "2027/01/12（月） | 誤り |", LOGGED[3]];
    const en = jpxRead.calendarDays(EN), ja = jpxRead.calendarDays(JA);
    ck(`a holiday is a date the page gives with a weekday that fits it: the English page's "Jan. 1 (Thu.)" is 1 Jan 2026 and its "Jan. 1 (Fri.)" 1 Jan 2027 (the year is the one in which the date falls on that weekday); a date whose weekday fits neither year is not counted; a line that says when the page was updated is no holiday (English ${en.days.length}, Japanese ${ja.days.length})`, en.days.join() === "2026-01-01,2026-11-03,2026-11-23,2026-12-31,2027-01-01,2027-01-11" && en.odd === 1 && ja.days.join() === "2026-01-01,2026-09-22,2026-11-03,2026-11-23,2026-12-31,2027-01-01,2027-01-02,2027-01-11" && ja.odd === 1, { en, ja });
    const chk = jpxRead.calendarCheck(ja.days, ["2026-11-03", "2026-11-23", "2026-12-31", "2027-01-01", "2027-01-12"], "2026-11-01", "2027-01-31");
    ck("the Monitor's rows are set against the page's days by year, month and day, both ways: a row of the wrong day (12 Jan 2027 for the 11th) is NOT given by the page, where it was \"named\" by another line; the page's weekday holiday the Monitor lacks is listed; a weekend's is not", chk.named.join() === "2026-11-03,2026-11-23,2026-12-31,2027-01-01" && chk.notNamed.join() === "2027-01-12" && chk.lacking.join() === "2027-01-11", chk);

    // ---- PR-10: a distribution dated on a day without a session ----
    const TKZ = "Asia/Tokyo", tAt = (ymd: string) => Date.parse(`${ymd}T06:00:00Z`) / 1000, sess = ["2026-10-08", "2026-10-09", "2026-10-13", "2026-10-14"];
    const bars = { meta: {}, tz: TKZ, ts: sess.map(tAt), o: sess.map(() => 100), h: sess.map(() => 101), l: sess.map(() => 99), c: [100, 100, 100, 100], v: sess.map(() => 10), div: [{ t: tAt("2026-10-09"), amount: 1 }, { t: tAt("2026-10-11"), amount: 6.5 }, { t: tAt("2027-01-10"), amount: 9 }], split: [] } as unknown as yahooProbe.Bars;
    const rowsD = yahooProbe.daily(bars), tr = yahooProbe.totalReturns(rowsD).reduce((a, x) => a * (1 + x.r), 1) - 1, un = yahooProbe.unplaced(bars);
    ck(`a distribution Yahoo dates on a day without a session (Sunday 11 Oct 2026) is in no day's return, and the line that prints the total return says so (${yahooProbe.unplacedWords(bars).slice(2, 80)}…); one dated on a session is counted; one outside the bars' span is not called missing`, rowsD.length === 4 && rowsD[1].div === 1 && Math.abs(tr - 0.01) < 1e-12 && un.length === 1 && un[0].d === "2026-10-11" && un[0].amount === 6.5 && /NOT IN IT: 1 distribution Yahoo dates on a day without a session \(2026-10-11 6\.5/.test(yahooProbe.unplacedWords(bars)) && yahooProbe.unplacedWords({ ...bars, div: [bars.div[0]] } as yahooProbe.Bars) === "", { un, tr });
  }

  console.log("\n[AI] the probes after the review of fix part 1 (22 Nov 2026): pf_jpx itself, run offline with its fetch replaced (no request leaves the machine); the terms gate's floor and its misses");
  {
    const quiet = async <T>(fn: () => Promise<T> | T): Promise<T> => { const log = console.log; console.log = () => undefined; try { return await fn(); } finally { console.log = log; } };
    const doc = (title: string, body: string) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
    const kind = (l: string) => probe.termsBar(l)?.kind ?? null;

    // ---- PX-2: the old gate's alternatives as a floor; Cboe's line exactly as the log holds it ----
    const CBOE_LOGGED = "No data, values, or other content contained in this document (including without limitation, index values or information, ratings, credit-related analyses and data, research, valuations, strategies, methodologies, and models) or any part thereof may be modified, reverse-engineered, reproduced, or distributed in any form or by any means, or stored in a database or retrieval system, without the prior …";
    ck("PX-2: a bare \"do not\" or \"should not\" with a word of automated reading or re-use is a bar again (the old gate held it); Cboe's line exactly as pf_bench.log holds it (cut at \"without the prior …\") is a bar", kind("Do not access this website by automated means.") === "automated" && kind("Please do not attempt to scrape, crawl or otherwise harvest data from this website.") === "automated" && kind("Users should not copy or redistribute the data on this site.") === "re-use" && kind(CBOE_LOGGED) === "re-use", [kind("Do not access this website by automated means."), kind("Please do not attempt to scrape, crawl or otherwise harvest data from this website."), kind(CBOE_LOGGED)]);

    // ---- PX-3: the five kinds of ban that gave none ----
    const MISSED = {
      universal: ["You may not copy or redistribute the data for any commercial or non-commercial purpose.", "You may not reproduce the content for commercial or other purposes.", "You may not copy the data, whether for commercial purposes or not."],
      exceptions: ["Save as the publisher's own notices say, you may not copy or reproduce the content.", "This site is for your personal use only and you may not copy, reproduce or store any of its content.", "Unless the publisher's own licence says so, you may not copy the data."],
      liability: ["We shall not be liable for any errors in the data, and you may not copy or redistribute it.", "The publisher will not be responsible for any loss, but no part of this site may be reproduced."],
      words: ["No reproduction of the data is allowed.", "Neither the data nor any part of it may be copied.", "The data may be copied only with our written permission.", "当サイト掲載記事の無断転載を禁ず。", "禁無断転載", "当サイトの情報を複製することはできないものとします。", "掲載情報を転載してはならない。", "掲載情報の再配信はしないでください。", "掲載情報の二次利用は一切認めません。"],
    };
    const missedNow = Object.entries(MISSED).flatMap(([k, ls]) => ls.filter((l) => kind(l) === null).map((l) => `${k}: ${l}`));
    const FREE = ["You may not copy or reproduce the data on this site for commercial purposes.", "You may not copy or reproduce the content of this site other than for your own personal, non-commercial use.", "Copying is permitted for personal use only.", "We shall not be liable for any loss arising from your use of automated trading systems connected to this service."];
    const listPage = await quiet(() => probe.printTerms(doc("Terms of use", "<p>By using this site you agree to these terms.</p><p>You agree not to:</p><ul><li>use any robot, spider, scraper or other automated means to access this site;</li><li>copy, reproduce or redistribute any of its data;</li><li>frame any of its pages.</li></ul>")));
    ck(`PX-3: the review's five kinds of ban are bars now: a ban for "any commercial or non-commercial purpose" (universal, not limited), exception words that name no use ("save … own", "the publisher's own", "personal use only and you may not copy"), a ban after a liability clause in the same sentence, the missing forms ("No … is allowed", "Neither … may be", "only with our written permission", 禁ず, 禁無断転載, できないものとします, してはならない, しないでください, 一切認めません), and a ban written as a list (${listPage.bars.length} bar(s) from "You agree not to:" and its items); a ban limited to commercial use, one that leaves personal use free and a liability clause alone are still none`, missedNow.length === 0 && listPage.bars.length >= 1 && FREE.every((l) => kind(l) === null), { missedNow, free: FREE.map(kind), list: listPage.bars });

    // ---- PX-5: a page counts as the site's terms read only when it is named so AND carries what terms say ----
    const real = globalThis.fetch;
    const site = async <T>(pages: Record<string, string>, fn: (asked: string[]) => Promise<T>): Promise<T> => { const asked: string[] = []; globalThis.fetch = (async (input: unknown) => { const u = String(input); asked.push(u); const b = pages[u]; return new Response(b ?? "not found", { status: b ? 200 : 404, headers: { "content-type": "text/html" } }); }) as typeof fetch; try { return await quiet(() => fn(asked)); } finally { globalThis.fetch = real; probe.restoreHolds(); } };
    const FUND = doc("A fund", '<a href="https://funds.example/terms">Terms of Use</a> <a href="https://funds.example/legal">Legal</a>');
    const scripted = await site({ "https://funds.example/terms": doc("Terms of Use | Funds", "") }, () => probe.readTerms({ html: FUND, final: "https://funds.example/fund" }, { gapMs: 0 }));
    const stray = await site({ "https://funds.example/terms": doc("Literature | Funds", "<p>Request a copy of the prospectus and the annual report from this page.</p><p>Information for individual investors and for professional investors.</p>") }, () => probe.readTerms({ html: FUND, final: "https://funds.example/fund" }, { gapMs: 0 }));
    ck("PX-5: a page titled terms of use whose text is drawn by scripts (no line read) is not \"terms read\", nor a library with two stray lines on two subjects: both give read false, so a file that needs \"read and not barred\" stays shut", scripted.read === false && stray.read === false && probe.isTermsPage(doc("Terms of Use", ""), 0, 0) === false, { scripted, stray });

    // ---- CF-1 with PX-1, PX-6, PX-7, PX-8: pf_jpx.ts itself, run offline ----
    // Every address it asks is recorded and answered with a made-up page that carries what the run of 21 Nov 2026
    // printed from JPX's pages (C/probes/pf_jpx.log): the four sentences, the navigation labels, the link labels, the
    // notice table, the tick, limit and hour tables, the calendar lines of both pages. Nine ways the pages may be:
    //   A  as on 21 Nov: no JPX page links the short-selling rule by name; the tick tables' labels are not headings
    //   C  the tick-size page links "Short selling" on another site
    //   D  the index links, on jpx.co.jp, a page named "Short Selling Regulations"
    //   R  the trading-hours page answers with a redirect to another site
    //   E  the index links a page of short-selling figures and the list of triggered stocks
    //   F  the index links a page by JPX's own section name, "Short Selling Regulation- Information", whose own title
    //      says it is the list of triggered stocks (PX-6)
    //   G  the tick-size page answers with a redirect to TOPIX's weight file on jpx.co.jp (PX-7)
    //   N  short whole sentences with verbs the guard does not list where a table is printed from (PL-1 below)
    //   H  the index links "Closing Auction", whose page's own title names a list of issues (PL-3 below)
    const JPX = "https://www.jpx.co.jp";
    const SENTENCES = ["Effective March 1, 2027, the methodology for determining applicable tick sizes will be changed from the current index classification-based approach (whether an issue is a TOPIX 500 constituent) to a liquidity-based approach.", "Auction trading period is divided into morning session and afternoon session. Morning session is from 9:00 am to 11:30 am, while afternoon session is from 12:30 pm to 3:30 pm. Orders are accepted from 8:00 am and 12:05 pm respectively.", "September 22, 2026, is a holiday in accordance with Rule 3, Paragraph 3 of Act on National Holidays.", "2026年9月22日（火）は、祝日法第3条第3項による休日です。"];
    const NAV: Array<[string, string]> = [["Trading (Domestic Stocks)", "/english/equities/trading/index.html"], ["Trading Rules of Domestic Stocks", "/english/equities/trading/domestic/index.html"], ["ToSTNeT Market", "/english/equities/trading/tostnet/index.html"], ["Restrictions on Trading", "/english/equities/trading/regulations/index.html"], ["When-Issued Transaction", "/english/equities/trading/when-issued/index.html"], ["Margin Trading", "/english/equities/trading/margin/index.html"], ["Trading Hours", "/english/equities/trading/domestic/01.html"], ["Daily Price Limits", "/english/equities/trading/domestic/06.html"], ["Tick Size", "/english/equities/trading/domestic/07.html"], ["Strengthening the Functions of the Cash Equity Market", "/english/equities/improvements/market-structure/index.html"]];
    const page = (title: string, body: string) => `<html><head><title>${title}</title></head><body><ul>${NAV.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul>\n${body}</body></html>`;
    const tick = `<table><tr><th>Price per share (yen)</th><th></th><th>Tick Size (yen)</th></tr>${[["up to", "1,000", "0.1"], ["up to", "3,000", "0.5"], ["up to", "50,000", "50"], ["over", "50 million", "100,000"]].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>`;
    const NOTICES = `<table><tr><td>2026/04/22</td><td>Public Release of the Report From the Working Group on Tick Sizes for 2027</td></tr><tr><td>2026/05/22</td><td>Revisions to the Trading Rules to Further Optimise Tick Sizes From March 1, 2027</td></tr></table>`;
    const TRIGGERED = `<h1>Short Selling Price Restriction: List of Triggered Stocks</h1><table><tr><th>Code</th><th>Name</th><th>Date</th></tr><tr><td>1301</td><td>KYOKUYO</td><td>2026/11/20</td></tr><tr><td>7203</td><td>TOYOTA</td><td>2026/11/20</td></tr></table>`;
    const pageFor = (scen: string, url: string): { status: number; type: string; body: string; location?: string } => {
      const p = url.replace(JPX, ""), H = (title: string, body: string) => ({ status: 200, type: "text/html", body: page(title, body) });
      if (p === "/robots.txt") return { status: 200, type: "text/plain", body: "User-agent: *\nSitemap: https://www.jpx.co.jp/sitemap.xml\n" };
      if (p === "/english/equities/trading/domestic/index.html") return H("Overview | Trading Rules of Domestic Stocks | Japan Exchange Group", scen === "H" ? '<a href="/english/equities/trading/domestic/closing.html">Closing Auction</a>' : scen === "D" ? '<a href="/english/equities/trading/regulations/02.html">Short Selling Regulations</a>' : scen === "E" ? '<a href="/english/markets/statistics-equities/short-selling/index.html">Short Selling Value</a> <a href="/english/markets/equities/ss-triggered/index.html">Short Selling Price Restriction: List of Triggered Stocks</a>' : scen === "F" ? '<a href="/english/markets/equities/short-info/index.html">Short Selling Regulation- Information</a>' : "");
      if (p === "/english/equities/trading/domestic/07.html") return scen === "G" ? { status: 302, type: "text/html", body: "", location: `${JPX}/automation/markets/indices/topix/files/topixweight_j.csv` } : H("Tick Size | Trading Rules of Domestic Stocks | Japan Exchange Group", `<p>Update : Aug. 06, 2026</p><h3></h3><p class="lbl">TOPIX500 Constituents (TOPIX100 and TOPIX Mid400 Constituents)</p>${tick}<p class="lbl">Other issues</p>${tick}<p class="lbl">Tick Size Changes Effective March 1, 2027</p><p>${SENTENCES[0]}</p>${tick}${NOTICES}${scen === "C" ? '<a href="https://elsewhere.example.org/notes/ssr.html">Short selling</a>' : ""}`);
      if (p === "/english/equities/trading/domestic/06.html") return H("Daily Price Limits | Trading Rules of Domestic Stocks | Japan Exchange Group", "<table><tr><th>Base price (yen)</th><th></th><th>Daily price limit (yen)</th></tr><tr><td>Less than</td><td>100</td><td>30</td></tr><tr><td>Less than</td><td>50 million</td><td>7 million</td></tr></table>");
      if (p === "/english/equities/trading/domestic/01.html") return scen === "R" ? { status: 302, type: "text/html", body: "", location: "https://elsewhere.example.org/hours.html" } : H("Trading Hours | Trading Rules of Domestic Stocks | Japan Exchange Group", `<p>${SENTENCES[1]}</p><table><tr><th></th><th>Morning session</th><th>Afternoon session</th></tr><tr><td>Auction trading</td><td>9:00 am - 11:30 am</td><td>12:30 pm - 3:30 pm</td></tr><tr><td>Order acceptance</td><td>8:00 am - 11:30 am</td><td>12:05 pm - 3:30 pm</td></tr></table>`);
      if (p === "/english/equities/trading/regulations/02.html") return H("Short Selling Regulations | Japan Exchange Group", "<p>A short sale at a price at or below the latest execution price is prohibited once a stock has fallen 10% or more below the base price, for orders of more than 50 trading units, until the end of the next trading day.</p>");
      if (p === "/english/markets/equities/short-info/index.html") return H("List of Triggered Stocks | Japan Exchange Group", TRIGGERED);
      if (p === "/english/equities/trading/domestic/closing.html") return H("Closing Auction: List of Issues | Japan Exchange Group", '<table><tr><th>Code</th><th>Name</th><th>Closing auction from</th></tr><tr><td>1301</td><td>KYOKUYO</td><td>3:25 pm</td></tr><tr><td>7203</td><td>TOYOTA</td><td>3:25 pm</td></tr></table>');
      if (p === "/english/corporate/about-jpx/calendar/index.html") return H("Market Holidays | Japan Exchange Group", `<p>Update : Feb. 06, 2026</p><table>${[["Jan. 1 (Thu.)", "New Year's Day"], ["Nov. 3 (Tue.)", "Culture Day"], ["Nov. 23 (Mon.)", "Labor Thanksgiving Day"], ["Dec. 31 (Thu.)", "Market Holiday"], ["Jan. 1 (Fri.)", "New Year's Day"], ["Jan. 11 (Mon.)", "Coming of Age Day"]].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table><p>${SENTENCES[2]}</p>`);
      if (p === "/corporate/about-jpx/calendar/index.html") return H("営業時間・休業日一覧 | 日本取引所グループ", `<p>2026/02/06 更新</p><table>${[["2026/01/01（木）", "元日"], ["2026/11/03（火）", "文化の日"], ["2026/11/23（月）", "勤労感謝の日"], ["2026/12/31（木）", "休業日"], ["2027/01/01（金）", "元日"]].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table><p>${SENTENCES[3]}</p>`);
      if (url.startsWith("https://elsewhere.example.org/")) return { status: 200, type: "text/html", body: "<html><title>a page of another site</title><p>short sales at 10% below the base price, and trading from 9:00 am</p></html>" };
      return { status: 404, type: "text/html", body: "<html><title>Not Found</title></html>" };
    };
    const runs: Record<string, { out: string; asked: string[] }> = {};
    // PL-1 of the final review of pull request #50: N, short whole sentences with verbs the guard did not list, in each
    // place a table is printed from (the label line before it, a heading, a header cell, a first-column and a body cell)
    const SHORT_N = ["The afternoon session ends at 3:30 pm", "Trading resumes at 12:30 pm", "Limits widen on the next business day", "Orders placed after 3:30 pm expire", "Trading resumes after the lunch break", "Prices move in steps of one yen"];
    const nPage = (url: string, body: string): string => url.endsWith("/01.html") ? body.replace("<table>", `<p>${SHORT_N[0]}</p><table>`).replace("</table>", `<tr><td>Note</td><td>${SHORT_N[1]}</td><td>-</td></tr><tr><td>${SHORT_N[4]}</td><td>-</td><td>12:30 pm</td></tr></table>`)
      : url.endsWith("/06.html") ? body.replace("<table>", `<h3>${SHORT_N[2]}</h3><table>`) : url.endsWith("/07.html") ? body.replace("<th></th>", `<th>${SHORT_N[3]}</th>`).replace("<td>over</td>", `<td>${SHORT_N[5]}</td>`) : body;
    for (const scen of ["A", "C", "D", "R", "E", "F", "G", "N", "H"]) {
      const asked: string[] = [], lines: string[] = [], log = console.log;
      globalThis.fetch = (async (input: unknown) => { const u = String(input); asked.push(u); const a = pageFor(scen, u), body = scen === "N" ? nPage(u, a.body) : a.body; return new Response(a.status >= 300 && a.status < 400 ? null : body, { status: a.status, headers: { "content-type": a.type, ...(a.location ? { location: a.location } : {}) } }); }) as typeof fetch;
      (globalThis as { __probeOffline?: boolean }).__probeOffline = true;
      (globalThis as { __pfJpxRun?: string }).__pfJpxRun = "all";   // every part the owner released: the run these nine ways were written for (since L-1 the file's default is "compare", [AO])
      console.log = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
      try { if (scen === "A") await import("../jobs/probes/pf_jpx.ts"); else await import(`../jobs/probes/pf_jpx.ts?scen=${scen}`); }
      catch (e) { lines.push(`THE PROBE STOPPED: ${e instanceof Error ? e.message : String(e)}`); }
      finally { console.log = log; globalThis.fetch = real; delete (globalThis as { __probeOffline?: boolean }).__probeOffline; delete (globalThis as { __pfJpxRun?: string }).__pfJpxRun; probe.restoreHolds(); }
      runs[scen] = { out: lines.join("\n"), asked };
    }
    const all = Object.values(runs), offSite = all.flatMap((r) => r.asked.filter((u) => !jpxRead.onJpx(u)));
    const TELLTALE = ["Morning session is", "afternoon session is", "session is from", "Orders are accepted", "respectively", "methodology", "will be changed", "in accordance with", "祝日法", "による休日", "Auction trading period"];
    const leaked = all.flatMap((r) => TELLTALE.filter((t) => r.out.includes(t)));
    const labels = NAV.map(([t]) => t).filter((t) => !/^(?:Trading Hours|Tick Size|Daily Price Limits|Trading Rules of Domestic Stocks)$/.test(t) && all.some((r) => r.out.includes(t)));
    const notices = ["Public Release of the Report", "Revisions to the Trading Rules"].filter((t) => all.some((r) => r.out.includes(t)));
    ck(`CF-1: pf_jpx.ts itself, run offline in nine ways (${Object.entries(runs).map(([k, r]) => `${k} ${r.asked.length} requests`).join(", ")}): every address it asks is on jpx.co.jp (${offSite.length} off it); no sentence of its pages in its output (the review's telltales: ${leaked.length}), no navigation or link label (${labels.length}), no notice title (${notices.length}); the probe did not stop`, offSite.length === 0 && leaked.length === 0 && labels.length === 0 && notices.length === 0 && all.every((r) => !/THE PROBE STOPPED/.test(r.out) && /requests made:/.test(r.out)), { offSite, leaked, labels, notices, stopped: Object.entries(runs).filter(([, r]) => /THE PROBE STOPPED/.test(r.out)).map(([k, r]) => `${k}: ${r.out.split("\n").pop()}`) });
    const A = runs.A.out, hours = A.split("\n").filter((l) => /^  \| /.test(l)).map((l) => l.slice(4));   // the lines of printValues
    ck(`PX-1 through the probe: the hours page's values, one run each, nothing around them (${hours.filter((h) => /\d:\d\d/.test(h)).map((h) => `"${h}"`).join(", ")})`, hours.includes("9:00 am to 11:30 am") && hours.includes("12:30 pm to 3:30 pm") && hours.includes("8:00 am and 12:05 pm") && !hours.some((h) => /\b(?:is|from|while|session|Orders)\b/.test(h)), hours);
    ck(`PX-8: on the tick-size page whose tables carry their labels as text and not as headings, each table is printed under its label (${[...A.matchAll(/table \d+ · under "([^"]+)"/g)].map((m) => `"${m[1]}"`).join(", ")})`, /table 1 · under "TOPIX500 Constituents \(TOPIX100 and TOPIX Mid400 Constituents\)"/.test(A) && /table 2 · under "Other issues"/.test(A) && /table 3 · under "Tick Size Changes Effective March 1, 2027"/.test(A), A.split("\n").filter((l) => /^\s*table \d/.test(l)));
    const reg = `${JPX}/english/equities/trading/regulations/02.html`;
    ck("the rule page is read where a JPX page links it by a name that says short selling and a rule (D: its values \"10%\" and \"50 trading units\" printed, nothing of its sentence); not where the link is to another site (C) or names figures or the list of triggered stocks (E): NOT FOUND, no address from memory", runs.D.asked.includes(reg) && /\| 10%/.test(runs.D.out) && /\| 50 trading units/.test(runs.D.out) && !/is prohibited|latest execution price/.test(runs.D.out) && !runs.C.asked.some((u) => /elsewhere/.test(u)) && /NOT FOUND/.test(runs.C.out) && /NOT FOUND/.test(runs.E.out) && !runs.E.asked.some((u) => /ss-triggered|short-selling\/index/.test(u)), { D: runs.D.asked, E: runs.E.asked });
    ck("PX-6: a page taken by JPX's own section name (\"Short Selling Regulation- Information\") whose own title says it is the list of triggered stocks is not printed: no code, no name of a stock in the log", runs.F.asked.some((u) => /short-info/.test(u)) && /nothing of it is printed/.test(runs.F.out) && !/1301|KYOKUYO|TOYOTA/.test(runs.F.out), runs.F.out.split("\n").filter((l) => /short|1301|KYOKUYO/i.test(l)));
    const nOut = runs.N.out, nLeaked = SHORT_N.filter((t) => nOut.includes(t) || nOut.includes(t.slice(0, 24)));
    ck(`PL-1: short whole sentences with verbs the guard did not list, in every place a table is printed from (the label line before it, a heading, a header cell, a first-column and a body cell), are not printed (N: ${nLeaked.length} of ${SHORT_N.length} in the output, "${(nOut.match(/^ {2}table \d[^\n]*$/m) ?? [""])[0].trim()}"), while the tables' figures and labels are ("Auction trading | 9:00 am - 11:30 am", "Less than | 100")`, nLeaked.length === 0 && /Auction trading \| 9:00 am - 11:30 am/.test(nOut) && /Less than \| 100/.test(nOut) && /THE PROBE STOPPED/.test(nOut) === false, { nLeaked, lines: nOut.split("\n").filter((l) => /resumes|ends at|widen|expire|lunch|steps/.test(l)) });
    const SENT_GUARD = ["Trading resumes after the lunch break", "The closing auction starts at 3:25 pm", "Prices move in steps of one yen", "Limits widen on the next business day", "TSE sets a daily price range", "Orders placed after 3:30 pm expire", "Short sales need a price above the last trade", "This rule took effect on March 1, 2027", "JPX publishes the list every business day", "We recommend checking the latest notices", "Please refer to the rules for details", "Click the link below", "Afternoon session ends at 3:30 pm", "The afternoon session ends at 3:30 p.m.", "Investors note the change from March 2027", "Trading resumes at 12:30 pm", "The market closes at 3:30 pm", "Tick sizes change on March 1, 2027", "Lunch ends 12:30", "Trading starts 9:00", "取引は9時に始まる", "注文は8時から受け付ける", "制限値幅は翌日に拡大する", "前場は11時30分に終わる", "呼値の単位が変わる", "取引は9時から始まる"];
    const LABEL_GUARD = ["Tick Size (yen)", "Price per share (yen)", "Previous Day's Closing Price/Special Quote (yen)", "Daily Price Limits (yen)", "Morning Session", "Afternoon Session", "Auction trading", "Order acceptance", "up to", "over", "Less than", "50 million or more", "&plusmn;30", "Other issues", "TOPIX500 Constituents (TOPIX100 and TOPIX Mid400 Constituents)", "Tick Size Changes Effective March 1, 2027", "Nov. 23 (Mon.)", "2026/11/23（月）", "勤労感謝の日", "9:00 am - 11:30 am", "8:00 am and 12:05 pm", "50 trading units", "9時00分から11時30分"];
    const sentOut = SENT_GUARD.filter((t) => jpxRead.sayable(t) || !/not printed/.test(jpxRead.cellOut(t))), labelLost = LABEL_GUARD.filter((t) => !jpxRead.sayable(t) && !jpxRead.figureCell(t));
    ck(`PL-1: ${SENT_GUARD.length} short whole sentences (the review's and its verifier's, English and Japanese, with any verb) are no table cell, label or heading (${sentOut.length} printable), and ${LABEL_GUARD.length} of JPX's labels, figures, dates and clock times are (${labelLost.length} held)`, sentOut.length === 0 && labelLost.length === 0, { sentOut, labelLost });
    ck("PL-3: a page taken by its link's name whose own title names a list (H: the closing auction's link leads to one) is asked, and nothing of it but its address, status and title is printed: no code, no name", runs.H.asked.some((u) => /closing\.html/.test(u)) && /nothing of it is printed/.test(runs.H.out) && !/1301|KYOKUYO|TOYOTA/.test(runs.H.out), runs.H.out.split("\n").filter((l) => /closing|1301|KYOKUYO/i.test(l)));
    // PL-2 of the final review of pull request #50: the gate read an unlimited ban as "none" where commercial use was
    // one of the banned acts, and knew no ban written as "Nothing … may be", "must never" or "requires our consent"
    const UNLIMITED = ["Any copying, redistribution or commercial use of the content of this website is prohibited.", "Reproduction, redistribution and commercial use of the data are not permitted.", "You may not copy, reproduce, redistribute or make commercial use of any data on this site.", "Copying, republishing or commercial exploitation of any material on this site is strictly prohibited.", "Users shall not reproduce, store, transmit or commercially exploit any content of this site.", "The data are for information only; copying, redistribution and any commercial use are prohibited.", "You may not copy or redistribute the data, and you may not use it for commercial purposes.", "No content may be copied, and commercial use of the data is forbidden.", "Nothing on this website may be copied or redistributed.", "None of the material on this site may be reproduced or stored in a retrieval system.", "You must never copy, reproduce or republish the data on this site.", "Users may never reproduce the content of this site.", "The reproduction of the data requires our prior written consent.", "Copying any part of this site requires the express permission of the publisher.", "Any redistribution of the information is subject to our prior written approval.", "The content may only be reproduced with the prior written permission of the publisher.", "None of the content may be republished without our permission.", "You may not copy the data, and may not use it for commercial purposes.", "Users may not reproduce or redistribute any data, nor use them for commercial gain.", "You must not store the data and must not use it for commercial purposes.", "Republication of the data requires the prior written permission of the exchange.", "Publication of the data in any medium requires our consent.", "当サイトのコンテンツの転載には事前の許可が必要です。"];
    const STILL_FREE = ["You may not copy or reproduce the data on this site for commercial purposes.", "You may not reproduce the content except for your own personal, non-commercial use.", "Commercial use of the data is prohibited.", "You may print or download extracts for your personal use only; any other copying is prohibited.", "商用目的での転載を禁止します。", "We shall not be liable for any loss arising from the use of the data.", "You may not copy the data for commercial purposes, and may not redistribute it for commercial purposes either.", "You may not copy the data for commercial purposes, nor redistribute it for commercial gain."];
    const notBar = UNLIMITED.filter((l) => kind(l) === null), wrongBar = STILL_FREE.filter((l) => kind(l) !== null);
    ck(`PL-2: ${UNLIMITED.length} unlimited bans are bars (commercial use named as one of the banned acts, two bans in one sentence, with or without a subject of its own for the second since the check of fix part 3, "Nothing … may be", "must never", "requires … consent", "may only be … with … permission", "without our permission", 許可が必要, "publication" and "republication": ${notBar.length} read as none), and ${STILL_FREE.length} lines that limit a ban or leave a use free are still none (${wrongBar.length} read as bars)`, notBar.length === 0 && wrongBar.length === 0, { notBar, wrongBar });
    // the check of fix part 4 (fix4-verify-5420, N-1 and PL-2's rest; 23 Nov 2026). Both ways:
    //   false bars: "publication" read as an act of re-use made a document's own disclaimers bars, and a grant of personal
    //   use followed by "but must not otherwise copy it" was read clause by clause as an unlimited ban; both read none
    //   again, as at dfd0970 ("publication" is re-use only when it is done to a site's data, "publication of the data";
    //   a second ban that says "otherwise" or "any other" after a grant is read with that grant);
    //   misses: an unlimited ban after a semicolon, after a noun for its subject, or in Japanese after 「し、」 read none
    //   at all three commits, and a list after a lead-in that bans freed every item when one named a purpose
    const NOT_BARS = ["This publication does not constitute investment advice.", "The information in this publication should not be relied upon as a forecast.", "Any opinions expressed in this publication may not reflect the views of the issuer.", "This publication does not constitute an offer or a solicitation of an offer to buy shares.", "The publication date of this factsheet does not change the fund's dealing days.", "Past performance shown in this publication is not a reliable indicator and cannot be guaranteed.", "You may store the data for your personal, non-commercial use, but must not otherwise copy it.", "You may download and print one copy for your personal use, but may not otherwise reproduce the material."];
    const MISSES = ["You may not copy the data for commercial purposes; you may not redistribute it.", "You may not copy the data for commercial purposes, and the data may not be redistributed.", "You may not copy the data for commercial purposes, and redistribution is also prohibited.", "You may not copy the data; nor may you use it for commercial purposes.", "You may download extracts for your personal use only, and redistribution of the data is prohibited.", "商用目的での転載を禁止し、また再配布も禁止します。"];
    const SAME_KIND = ["You may not copy the data for commercial purposes; redistribution is prohibited.", "You may not copy the data for commercial purposes, and redistribution of the data is not permitted.", "You may not copy the content for commercial purposes, but the content must not be redistributed in any case.", "Users may copy the data for internal use, while redistribution requires our prior written consent.", "You agree not to: use the data for any commercial purpose; redistribute the data; frame or mirror any part of this site."];
    const STILL_LIMITED = ["You may print pages for your personal use; you may not otherwise reproduce them.", "当サイトの情報は個人的な利用に限り複製を許可し、商用目的での利用を禁止します。", "You agree not to: use the data for any commercial purpose; resell the data for profit.", "The publication of this information does not constitute an offer."];
    const falseBars = NOT_BARS.filter((l) => kind(l) !== null), missed = [...MISSES, ...SAME_KIND].filter((l) => kind(l) === null), wrongLimited = STILL_LIMITED.filter((l) => kind(l) !== null);
    ck(`the gate both ways: ${NOT_BARS.length} lines that bar nothing of a site's data (six disclaimers that call the document a publication, two grants of personal use with "but must not otherwise copy it") are none (${falseBars.length} read as bars), and ${MISSES.length + SAME_KIND.length} unlimited bans after a semicolon, a noun for a subject, 「し、」 or a list's lead-in are bars (${missed.length} read as none); ${STILL_LIMITED.length} limited ones stay none`, falseBars.length === 0 && missed.length === 0 && wrongLimited.length === 0, { falseBars, missed, wrongLimited });
    // R-1 of the check of fix part 5 (fix5-verify-5420, 23 Nov 2026): the rule above freed every clause that said
    // "otherwise" or "any other" after a grant, also where the words name another object or party, so that an unlimited
    // ban read none ("…, but you may not distribute it to any other party."). Only an "otherwise" or "any other" that
    // refers back to the grant frees its clause now; the rest are bars again, as at dfd0970
    const OTHER_ELSEWHERE = ["You may print the pages for your personal use, and you must not copy them to any other website.", "You may use the data for personal use, but you may not distribute it to any other party.", "You may copy the data for personal use, but you may not redistribute it unless otherwise agreed in writing.", "You may use the data for internal purposes, but unless otherwise agreed in writing you may not redistribute it.", "You may download the data for your personal use, and you may not redistribute it to any other person.", "You may download the data for your personal use; you may not redistribute it to any other person.", "You may print pages for personal use, but you must not store the data in any other system or redistribute it.", "You may store the data for your personal use, but except as otherwise permitted you may not redistribute it.", "You may use the data for personal use, but you may not copy, redistribute or otherwise exploit it."];
    const BACK_TO_GRANT = ["You may download one copy for private study, but you must not otherwise reproduce it.", "You may use this content for your own personal use; any other copying or redistribution is prohibited.", "You may print one copy for your own internal use, but any other reproduction is prohibited.", "You may print pages for your personal use; you may not otherwise reproduce them.", "You may store the data for your personal, non-commercial use, but must not otherwise copy it.", "You may download and print one copy for your personal use, but may not otherwise reproduce the material.", "You may copy the data for your personal use; otherwise, you may not copy or redistribute it.", "You may print one copy for your personal use, but you may not reproduce it in any other form."];
    const freed = OTHER_ELSEWHERE.filter((l) => kind(l) === null), heldBack = BACK_TO_GRANT.filter((l) => kind(l) !== null);
    ck(`R-1: "otherwise" and "any other" free a second ban only where they refer back to the grant of personal, private or internal use in the same sentence: ${OTHER_ELSEWHERE.length} unlimited bans whose "otherwise" or "any other" names another object or party ("to any other party", "in any other system", "unless otherwise agreed", "except as otherwise permitted", "or otherwise exploit it") are bars (${freed.length} read as none), and ${BACK_TO_GRANT.length} that refer back ("must not otherwise reproduce it", "any other copying is prohibited", "; otherwise, you may not", "in any other form") are none (${heldBack.length} read as bars)`, freed.length === 0 && heldBack.length === 0, { freed, heldBack });
    // R-2 of the same check: 「し、」 parted one ban whose acts are joined by 〜し、 (複製し、または再配布することを禁止します,
    // a ban limited to commercial use, became a bar), and 「、また」 took "、または" ("or") and an act's "、また" for a
    // second ban. A ban verb before 「し、」 or 「、また」 still parts two bans
    const ONE_BAN_JA = ["商用目的で、本データを複製し、または再配布することを禁止します。", "私的使用を除き、複製し、または転載することを禁止します。", "当社の許可なく、営利目的で本データを複製し、販売し、または配布することを禁止します。", "私的使用の範囲内で複製することができますが、商用目的で転載し、または再配布することはできません。", "個人的な利用を除き、複製、また転載を禁止します。", "営利を目的として、当サイトの情報を複製し、または転載することはご遠慮ください。"];
    const TWO_BANS_JA = ["商用目的での転載を禁止し、また再配布も禁止します。", "商用目的での転載を禁止し、再配布も禁止します。", "商用目的での転載はできませんし、再配布もできません。", "個人的な利用の範囲を超えた複製を禁止し、また、第三者への再配布も禁止します。"];
    const oneBanBars = ONE_BAN_JA.filter((l) => kind(l) !== null), twoBansNone = TWO_BANS_JA.filter((l) => kind(l) === null);
    ck(`R-2: ${ONE_BAN_JA.length} single Japanese bans limited to commercial use or leaving private use free, whose acts are joined by 〜し、, "、または" or an act's "、また" (the review's example: 商用目的で、本データを複製し、または再配布することを禁止します。), are none (${oneBanBars.length} read as bars); ${TWO_BANS_JA.length} sentences of two bans parted after a ban verb (禁止し、, できませんし、) are bars (${twoBansNone.length} read as none)`, oneBanBars.length === 0 && twoBansNone.length === 0, { oneBanBars, twoBansNone });
    // what the README and lib.ts say the gate still reads as none, each kind they name (R-3 of the same check: the account
    // left four kinds out): a limit after a plain "or" inside one ban (the check of fix part 3), a purpose named for the
    // acts of a list joined by "and", a ban named only by "as is", "nor" with no comma; a second ban worded in a way the
    // clause split does not know (two adverbs, "shall be prohibited", "is never permitted", "a separate licence"); a
    // Japanese join other than 「し、」 or 「、また」 after a ban verb (禁止されており、, 禁止、, 禁止するとともに、); and a
    // "publication" named by "this", "these", "such", by a name, or "in any form"
    const STILL_NONE = ["You may not copy or redistribute the data or use it for commercial purposes.", "Copying and redistribution of the data, and their use for commercial purposes, are prohibited.", "Copying the data for commercial purposes is prohibited, as is its redistribution.", "You may not copy the data nor use it for commercial purposes.",
      "You may not copy the data for commercial purposes, and redistribution is also strictly prohibited.", "You may not copy the data for commercial purposes, and any redistribution shall be prohibited.", "You may not copy the data for commercial purposes, but redistribution of the content is never permitted.", "You may not copy the data for commercial purposes, and redistribution requires a separate licence.",
      "商用目的での転載は禁止されており、再配布も禁止されています。", "商用目的の転載は禁止、再配布も禁止します。", "商用目的での転載を禁止するとともに、再配布も禁止します。",
      "Publication of this content is prohibited without our prior written consent.", "Any publication of these figures requires our prior written consent.", "Publication of such data without our consent is prohibited.", "Publication in any form is prohibited without our consent.", "Publication of the Nikkei Stock Average requires a licence from Nikkei Inc."];
    ck(`PL-2 and R-3: what the README and lib.ts say the gate still reads as none is none, each kind they name (${STILL_NONE.length} lines): a limit named after a plain "or" inside one ban, a purpose named once for acts joined by "and", a ban named only by "as is", "nor" without a comma, a second ban worded in a way the clause split does not know, a Japanese join other than 「し、」 or 「、また」 after a ban verb, a "publication" named by "this", "these", "such", a name or "in any form"`, STILL_NONE.every((l) => kind(l) === null), STILL_NONE.map(kind));
    ck("a redirect off jpx.co.jp is not followed (R: nothing asked elsewhere); PX-7: a redirect from a released page to TOPIX's weight file on jpx.co.jp is not followed either (G), while the lift is on", !runs.R.asked.some((u) => /elsewhere/.test(u)) && /NOT ASKED \(held\)/.test(runs.R.out) && !runs.G.asked.some((u) => /topixweight/.test(u)) && /NOT ASKED \(held\)[^\n]*topixweight/.test(runs.G.out), { R: runs.R.asked.slice(-3), G: runs.G.asked });
  }

  console.log("\n[AH] fixes after the second review of P-1 (22 Nov 2026): the summary's figures, the Reference a book keeps, a change against what will be in force, the targets' window and lines, a name as it is stored, a changed form's request id, the holiday rows' reach, the defaults pinned");
  {
    const AR: PfStart[] = ["ar-ls-jp", "ar-ls-gl", "ar-macro"];
    const checked = (s: PfStart, edits: Record<string, string> = {}) => pfForm.checkForm(s, "A book", { ...pfForm.defaultRaw(s, edits.base === "JPY" ? "JPY" : "USD"), ...edits }, []);
    // ---- EN-1, EN-2: the summary card writes a dash for a field that does not read, and a limit as its row does ----
    const sums: Array<{ s: string; k: string; typed: string; lines: string[] }> = [];
    for (const s of AR) for (const k of s === "ar-macro" ? ["adj_gross", "var", "floor"] : ["gross", "net", "beta_net", "one_long", "one_short", "floor"]) for (const typed of ["", "abc", "1.03", "9999"]) sums.push({ s, k, typed, lines: pfPresets.STARTS[s].summary(checked(s, { [k]: typed }).values) });
    const badSum = sums.filter((x) => x.lines.some((l) => /undefined|NaN/.test(l)) || !x.lines.join(" ").includes("–"));
    ck(`EN-1: the summary card never prints "undefined%" or "NaN%": each of the ${sums.length} cases of a field left empty, not a number, off its step or out of range reads a dash in its place ("${sums.find((x) => x.k === "gross" && x.typed === "")?.lines[0]}"; "${sums.find((x) => x.k === "var" && x.typed === "1.03")?.lines[0]}")`, sums.length === 60 && badSum.length === 0 && sums.find((x) => x.s === "ar-ls-jp" && x.k === "gross" && x.typed === "")?.lines[0] === "Gross ≤ – · net ±20% · β ±10%", badSum.slice(0, 3));
    const vline = (v: string) => pfPresets.STARTS["ar-macro"].summary(checked("ar-macro", { var: v }).values)[0];
    ck(`EN-2: the macro summary writes the VaR limit as its row does: 1.05 "${vline("1.05")}", 1.15, 0.35, 2.95 and the default 1.0 each as typed, never rounded to one decimal`, vline("1.05") === "Adjusted gross ≤ 600% · VaR ≤ 1.05% · floor 10%" && vline("1.15").includes("VaR ≤ 1.15%") && vline("0.35").includes("VaR ≤ 0.35%") && vline("2.95").includes("VaR ≤ 2.95%") && vline("1.0").includes("VaR ≤ 1.0%"), [vline("1.05"), vline("0.35")]);
    // ---- EN-5: the Reference a book keeps ----
    const refOf = (s: PfStart, edits: Record<string, string> = {}) => pfForm.buildCreate(s, "A book", checked(s, edits), { requestId: "request-0001", startedOn: "2026-11-23", usdjpy: null }).book.reference;
    ck(`EN-5: a book keeps the Reference it has, on its base and with its blend: macro 70/30 "${refOf("ar-macro", { blend: "70" })}", Japan on yen "${refOf("ar-ls-jp", { base: "JPY" })}", Japan on dollars "${refOf("ar-ls-jp")}", Global "${refOf("ar-ls-gl", { base: "JPY" })}", macro by default "${refOf("ar-macro")}"`, refOf("ar-macro", { blend: "70" }) === "70/30 blend" && refOf("ar-macro", { blend: "10" }) === "10/90 blend" && refOf("ar-ls-jp", { base: "JPY" }) === "MSCI Japan" && refOf("ar-ls-jp") === "MSCI Japan, hedged" && refOf("ar-ls-gl", { base: "JPY" }) === "MSCI ACWI" && refOf("ar-macro") === "60/40 blend");
    // ---- EN-11, EN-12: the VaR advice the field takes, the scale line on the ratio itself ----
    const advice: string[] = [];
    for (const s of AR) { const fv = pfPresets.fieldOf(s, "var")!, step = pfTargets.varStep(s), lims: number[] = []; for (let x = fv.num!.lo; x <= fv.num!.hi + 1e-9; x += step) lims.push(Math.round(x * 1e6) / 1e6);
      for (let vol = 2; vol <= 8 + 1e-9; vol += 0.5) for (const lim of lims) { const t = pfTargets.varTie(vol, lim, step); if (t.state !== "refused") continue; const need = /at least ([\d.]+)%$/.exec(t.line)?.[1] ?? "", p = pfForm.parseNum(fv, need); if (!p.ok || pfTargets.varTie(vol, p.v, step).state === "refused") advice.push(`${s} ${vol}/${lim}: ${need}`); } }
    ck(`EN-11: the VaR limit a refusal asks for is one the VaR field takes and that clears the tie, on every refused pair of the three forms (7.0% at 1.0%: "…${pfTargets.varTie(7, 1, 0.1).line.slice(-30)}"; macro: "…${pfTargets.varTie(7, 1, 0.05).line.slice(-30)}")`, advice.length === 0 && /at least 1\.1%$/.test(pfTargets.varTie(7, 1, pfTargets.varStep("ar-ls-jp")).line) && /at least 1\.05%$/.test(pfTargets.varTie(7, 1, pfTargets.varStep("ar-macro")).line) && /at least 1\.03%$/.test(pfTargets.varTie(7, 1).line), advice.slice(0, 4));
    const lv = (c: number, v: number) => pfTargets.ladderInVols(c, v);
    ck(`EN-12: the scale line is decided on the ratio itself and the ratio is written as it is: 6% at 8% "${lv(6, 8).line}" with the line; 3 at 4, 4 at 5.5 too; 4 at 5 is 0.8 σ* and has none`, lv(6, 8).scale && /= 0\.75 target volatilities \(0\.75 σ\*\)$/.test(lv(6, 8).line) && lv(3, 4).scale && lv(4, 5.5).scale && /0\.73 σ\*/.test(lv(4, 5.5).line) && !lv(4, 5).scale && /= 0\.8 target volatilities \(0\.8 σ\*\)$/.test(lv(4, 5).line) && lv(4, 8).scale && /0\.5 σ\*/.test(lv(4, 8).line));
    // ---- EG-1 (the review of part 2a): every invisible character, by Unicode's classes, not a list of a few ----
    const BLANKS = ["\u3164", "\u115f", "\u1160", "\uffa0", "\u2800", "\u206f", "\u206a", "\u034f", "\u17b4", "\u{e0041}", "\u0600", "\ufff9", "\ufe0f", "\ufe00", "\u2065", "\u{e0100}", "\u{1bca0}", "\u{1d173}"];
    ck(`EG-1: a name of one Hangul filler, or a name with a deprecated format character (U+206F), a blank Braille pattern or a tag beside the letters, is refused like one with U+200B (${BLANKS.length} characters; "Tokyo L/S" itself, an accent, kana and kanji are not)`, BLANKS.every((c) => pfForm.nameRefusal(c, []) !== null && pfForm.nameRefusal(`Tokyo L/S${c}`, []) !== null) && pfForm.nameRefusal("Tokyo L/S", []) === null && pfForm.nameRefusal("Équité Japon", []) === null && pfForm.nameRefusal("東京ロング・ショート", []) === null, BLANKS.filter((c) => pfForm.nameRefusal(`Tokyo L/S${c}`, []) === null).map((c) => c.codePointAt(0)!.toString(16)));
    // ---- DC-12, SF-4 (22 Nov 2026): a table's file is named by the day in Singapore; a paper book's by its name ----
    { const at = new Date("2026-11-21T22:35:00Z"), books = [{ id: "a", name: "Tokyo L/S", createdAt: "2026-10-01T01:12:00Z" }, { id: "b", name: "Tokyo L-S", createdAt: "2026-11-21T22:30:00Z" }, { id: "c", name: "tokyo  l s", createdAt: "2026-11-21T22:31:00Z" }, { id: "d", name: "東京 L/S", createdAt: "2026-11-21T22:32:00Z" }];
      const words = ["Tokyo L/S", "東京ロング・ショート", "Équité Japon", "…", "A".repeat(39) + " B", "ｔｏｋｙｏ"].map(fileWord);
      ck(`DC-12: at 06:35 SGT on 22 Nov (the UTC day the 21st) a file is "${csvFile("markets", at)}"; a book's word: ${words.map((w) => `"${w}"`).join(", ")}; the same word for books made later: ${books.map((b) => bookWord(b, books)).join(", ")}`,
        sgDay(at) === "2026-11-22" && csvFile("markets", at) === "orrery-markets-2026-11-22.csv" && words.join("|") === `tokyo-l-s|東京ロング-ショート|équité-japon|book|${"a".repeat(39)}|tokyo` && books.map((b) => bookWord(b, books)).join("|") === "tokyo-l-s|tokyo-l-s-2|tokyo-l-s-3|東京-l-s", { words, books: books.map((b) => bookWord(b, books)) }); }
    // ---- RT-5: a name as it is stored ----
    ck(`RT-5: a name is stored as it is drawn: runs of white space (a no-break, a full-width space, a tab) one space, composed letters, ends trimmed; one with a character that draws nothing or turns the text round is refused ("${pfForm.nameRefusal("a\u200bb", [])}")`, pfForm.cleanName("  Tokyo  \u00a0L/S\t") === "Tokyo L/S" && pfForm.cleanName("Tokyo\u3000L/S") === "Tokyo L/S" && pfForm.cleanName("Cafe\u0301") === "Caf\u00e9" && pfForm.nameRefusal("Tokyo\u00a0L/S", ["Tokyo L/S"]) === pfWords.NAME_TAKEN && pfForm.nameRefusal("Tokyo  L/S", ["Tokyo L/S"]) === pfWords.NAME_TAKEN
      && [["\u200b", "200B"], ["a\u200bb", "200B"], ["a\u202eb", "202E"], ["a\u0000b", "0000"], ["a\u2066b", "2066"], ["a\ufeffb", "FEFF"], ["Tokyo\ufe0f", "FE0F"]].every(([x, u]) => pfForm.nameRefusal(x, []) === `a name cannot hold invisible characters (here U+${u})`) && pfForm.nameRefusal("\ufeff", []) !== null && pfForm.nameRefusal("日本株 ロング・ショート", []) === null);
    // ---- EN-9 (the PMs' answers of 22 Nov 2026): a change is in force from the session that opens next ----
    { const hol9 = { TSE: ["2026-11-23"], NYSE: ["2026-11-26"] }, eqV = pfCal.venuesOf("ar-ls-jp"), cd = (iso: string, v: ReturnType<typeof pfCal.venuesOf>) => pfCal.changeDays(at(iso), hol9, v);
      const a1 = cd("2026-11-23T23:30:00Z", eqV), m1 = cd("2026-11-23T23:30:00Z", pfCal.venuesOf("ar-macro")), a2 = cd("2026-11-24T02:00:00Z", eqV), a3 = cd("2026-11-23T02:00:00Z", eqV), a4 = cd("2026-11-28T02:00:00Z", eqV), jpOnly = cd("2026-11-23T02:00:00Z", pfCal.venuesOf("ar-ls-jp", 0));
      ck(`EN-9: at Tue 24 Nov 07:30 SGT an equity book's change is "${pfCal.inForceWords(a1.effective, a1.opens)}" (the store told ${a1.traded} was the last day traded) and the macro book's "${pfCal.inForceWords(m1.effective, m1.opens)}"; at 10:00 SGT with Tokyo open, Wed 25 Nov; on Tokyo's holiday at 10:00 SGT "${pfCal.inForceWords(a3.effective, a3.opens)}"; on a Saturday, Mon 30 Nov; a Japan book with no names outside Tokyo, on Tokyo's holiday, that day (no market of it trades)`,
        a1.today && a1.effective === "2026-11-24" && a1.traded === "2026-11-23" && a1.opens?.venue === "TSE" && pfCal.inForceWords(a1.effective, a1.opens) === "In force for Tue 24 Nov 2026's sessions (Tokyo opens 08:00 SGT)"
        && !m1.today && m1.effective === "2026-11-25" && m1.traded === "2026-11-24" && pfCal.inForceWords(m1.effective, null) === "In force from Wed 25 Nov 2026, 06:00 SGT"
        && !a2.today && a2.effective === "2026-11-25" && a3.today && a3.effective === "2026-11-23" && a3.opens?.venue === "NYSE" && pfCal.inForceWords(a3.effective, a3.opens) === "In force for Mon 23 Nov 2026's sessions (New York opens 22:30 SGT)"
        && !a4.today && a4.effective === "2026-11-30" && pfCal.venuesOf("ar-ls-gl").join() === "TSE,NYSE" && pfCal.venuesOf("ar-macro").length === 0 && jpOnly.effective === "2026-11-24" && !jpOnly.today
        && pfCal.nextSessionDay(at("2026-11-23T23:30:00Z"), hol9) === "2026-11-25" && pfCal.sessionOpens("NYSE", "2027-06-15", {}) === "2027-06-15T13:30:00.000Z" && pfCal.sessionOpens("TSE", "2026-11-23", hol9) === null, { a1, m1, a2, a3, a4, jpOnly }); }
    // ---- the targets' window opens with the book day of 1 Dec (PM A's answer of 22 Nov 2026) ----
    { const tw = (iso: string) => pfCal.targetWindow(pfCal.valuationDay(at(iso)), "yearly", [], "2026-11-21");
      ck(`the targets' window opens with the book day of 1 Dec, at the strike of 30 Nov (17:00 New York, 06:00 SGT): shut at 16:59 New York (${tw("2026-11-30T21:59:00Z").open}), open at 17:00 for ${tw("2026-11-30T22:00:00Z").forYear}; in January while no reset is on record, open; "${tw("2026-11-30T21:59:00Z").next}"`,
        !tw("2026-11-30T21:59:00Z").open && tw("2026-11-30T22:00:00Z").open && tw("2026-11-30T22:00:00Z").forYear === 2027 && tw("2026-12-31T22:30:00Z").forYear === 2027 && tw("2026-11-30T21:59:00Z").next === "next window: from Tue 1 Dec 2026, 06:00 SGT, to the first NAV of 2027"); }
    // ---- R-50, PM B's answer of 22 Nov 2026: from 450 notes a line says how many are left ----
    ck(`R-50: no line under 450 notes (${pfWords.notesLeftLine(449)}); from 450 "${pfWords.notesLeftLine(450)}", then "${pfWords.notesLeftLine(499)}" and "${pfWords.notesLeftLine(500)}"`, pfWords.notesLeftLine(449) === null && pfWords.notesLeftLine(450) === "50 notes left: every note is kept" && pfWords.notesLeftLine(499) === "1 note left: every note is kept" && pfWords.notesLeftLine(500) === "0 notes left: every note is kept" && pfWords.NOTES_MAX === 500);
    // ---- EN-10, EN-14: the targets' window in a book's first January, and the lines that end ----
    const w = pfCal.targetWindow;
    ck("EN-10: a book started in a January has no window that January (no reset in its first year): it opens on 1 December for the next year; a book of an earlier year keeps its January window", !w("2027-01-15", "yearly", [], "2027-01-12").open && w("2027-01-15", "yearly", [], "2026-11-21").open && w("2027-01-15", "yearly", [], "2026-11-21").forYear === 2027 && w("2027-12-01", "yearly", [], "2027-01-12").forYear === 2028 && w("2027-01-15", "guarded", []).open);
    {
      const base = { id: "00000000-0000-4000-8000-000000000001", name: "x", kind: "AR", start: "ar-ls-jp", base: "USD", startingNav: 1e10, fx: null, targetX: 5, targetVol: 5, reference: "MSCI Japan, hedged", blend: null, ladderBase: "yearly", ladder: { cut1: 4, cap1: 50, cut2: 2, cap2: 30, out: 2, cooling: 20, deadline: 1 }, houseMultiple: 1, valuation: "17:00 New York", status: "open", createdAt: "2026-11-21T09:00:00Z", startedOn: "2026-11-21", notes: [] } as unknown as PfBook;
      const pair = (year: number, x: number, vol: number, id: number) => [{ id, key: "target_x", value: x, cls: "window", basis: "set by the account", reason: null, at: "2026-12-15T02:00:00Z", effectiveFrom: null, forYear: year, origin: "change" }, { id: id + 1, key: "target_vol", value: vol, cls: "window", basis: "set by the account", reason: null, at: "2026-12-15T02:00:00Z", effectiveFrom: null, forYear: year, origin: "change" }];
      const stale = pfView.targetsNow({ ...base, settings: pair(2027, 7, 4, 1), resets: [] } as unknown as PfBook, "2028-06-01");
      const later = pfView.targetsNow({ ...base, settings: pair(2027, 7, 4, 1), resets: [{ year: 2027, kind: "withheld", d: "2027-01-04" }, { year: 2028, kind: "made", d: "2028-01-03" }] } as unknown as PfBook, "2028-02-01");
      const held = pfView.targetsNow({ ...base, settings: pair(2027, 7, 4, 1), resets: [{ year: 2027, kind: "withheld", d: "2027-01-04" }] } as unknown as PfBook, "2027-02-01");
      ck(`EN-10, EN-14: a pair whose year ended with no January line is not "pending" for good (in June 2028: pending ${JSON.stringify(stale.pending)}, lapsed ${stale.lapsed}); a lapsed pair's line ends once a later year's reset is made (Feb 2028: lapsed ${later.lapsed}); it stands in the year it lapsed (${held.lapsed})`, stale.pending === null && stale.lapsed === 2027 && later.lapsed === null && held.lapsed === 2027 && held.x === 5);
      // ---- EN-4: "changed from the defaults" ----
      const row = (id: number, value: number, origin: string, eff: string, basis: string) => ({ id, key: "one_long", value, cls: "limit", basis, reason: origin === "change" ? "a reason long enough" : null, at: "2026-11-17T01:00:00Z", effectiveFrom: eff, forYear: null, origin });
      const back = { ...base, settings: [row(1, 10, "creation", "2026-11-17", "default (PM advice: A)"), row(2, 8, "change", "2026-11-18", "set by the account"), { ...row(3, 10, "change", "2026-11-20", "set by the account"), at: "2026-11-19T01:00:00Z" }], resets: [] } as unknown as PfBook;
      const r1 = pfView.settingsNow(back, "2026-11-24").find((r) => r.key === "one_long")!;
      ck(`EN-4: a limit changed and set back to its default is not "changed from the defaults" (changed ${r1.changed}), though the account did set it (by "${r1.by}", own ${r1.own}); one that differs is`, !r1.changed && r1.own && r1.by === "you" && r1.value === 10 && pfView.settingsNow(back, "2026-11-19").find((r) => r.key === "one_long")!.changed);
    }
    // ---- EN-9 through the route: at Tue 24 Nov 07:30 SGT a Japan book's change is in force for that day's sessions, at
    // once, and the store's own guard (never in a day traded in) takes it; the macro book's waits for the next day ----
    {
      let state: PfMemState = pfEmpty(), n = 0;
      const clock = at("2026-11-23T23:30:00Z"), hol9 = { TSE: ["2026-11-23"], NYSE: ["2026-11-26"], through: "2027-12-31" };
      const deps: PfDeps = { on: true, store: pfMem({ load: () => state, save: (s2) => { state = s2; }, now: () => clock, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` }), now: () => clock, facts: () => Promise.resolve({ rates: { USD: null, JPY: null }, usdjpy: null, holidays: hol9 }) };
      const call = async (action: string, body?: Record<string, unknown>, q: Record<string, string> = {}) => { const r = await pfRoute(deps, action, "a@x.test", body ? "POST" : "GET", (k) => q[k] ?? null, body ?? {}); return { status: r.status, body: r.body as Record<string, unknown> & { error?: string; id?: string } }; };
      await call("consent_agree", { version: 1 });
      const make = async (start: PfStart, name: string, req: string) => String((await call("pf_create", { requestId: req, start, name, values: pfForm.defaultRaw(start, "USD") })).body.id);
      const jp = await make("ar-ls-jp", "Tokyo", "request-0901"), mac = await make("ar-macro", "Macro", "request-0902");
      const gJ = (await call("pf_get", undefined, { id: jp })).body as Record<string, unknown>, gM = (await call("pf_get", undefined, { id: mac })).body as Record<string, unknown>;
      const sJ = await call("pf_setting_set", { id: jp, key: "one_long", value: "8", reason: "before the Tokyo open, trimmed" }), sM = await call("pf_setting_set", { id: mac, key: "one_long", value: "4", reason: "before the Tokyo open, trimmed" });
      const bJ = (await call("pf_get", undefined, { id: jp })).body.book as PfBook, rJ = pfView.settingsNow(bJ, "2026-11-24").find((r) => r.key === "one_long")!, aJ = pfView.activityOf(bJ).find((r) => r.kind === "SETTING");
      ck(`EN-9 through the route: at Tue 24 Nov 07:30 SGT pf_get gives a Japan book ${String(gJ.nextSession)} with "${JSON.stringify(gJ.nextOpens)}" and a macro book ${String(gM.nextSession)}; a Japan book's change is stored for ${String(sJ.body.effective)} and in force at once (${rJ.value}%, pending ${rJ.pending === null ? "none" : "one"}; ACTIVITY "${aJ?.text}"); the macro book's for ${String(sM.body.effective)}`,
        gJ.nextSession === "2026-11-24" && (gJ.nextOpens as { venue?: string } | null)?.venue === "TSE" && gM.nextSession === "2026-11-25" && gM.nextOpens === null && sJ.status === 200 && sJ.body.effective === "2026-11-24" && rJ.value === 8 && rJ.pending === null && rJ.since === "2026-11-24"
        && /in force for Tue 24 Nov 2026's sessions/.test(aJ?.text ?? "") && sM.status === 200 && sM.body.effective === "2026-11-25", { gJ: { n: gJ.nextSession, o: gJ.nextOpens }, sJ, sM, rJ, aJ });
    }
    // ---- A-37's count (jobs/lib/marks.ts, the live check's part "marks"): the four shapes of Yahoo's answer ----
    { const rows = [{ at: "2026-12-01T21:00:00Z", est: true, pulled: "2026-11-23T14:05:00Z" }, { at: "2026-12-01T21:00:00Z", est: false, pulled: "2026-11-23T14:05:00Z" }, { at: "2026-12-01T21:00:00Z", est: null, pulled: "2026-11-23T14:05:00Z" }, { at: null, est: null, pulled: "2026-11-23T14:05:00Z" }, { at: "2026-12-01T21:00:00Z", est: false, pulled: "2026-11-21T14:05:00Z" }];
      const c = marks.countShapes(rows, marks.MARKS_SINCE), none = marks.countShapes([{ at: 1, est: null }, { at: 2, est: null }, { at: null, est: null }]);
      ck(`A-37's count: four shapes per list, rows pulled before the migration of 22 Nov counted apart ("${marks.marksLine("SPX", c, marks.MARKS_SINCE).trim()}"); a list where no date carries a flag says the flag does not come back ("${marks.marksLine("X", none).trim().slice(-70)}")`,
        c.flagTrue === 1 && c.flagFalse === 1 && c.noFlag === 1 && c.noDate === 1 && c.before === 1 && c.total === 5 && marks.shapeOf(null, true) === "noDate" && marks.shapeOf(0, null) === "noFlag" && /flag comes back on 2 of 3 dates$/.test(marks.marksLine("SPX", c, marks.MARKS_SINCE)) && /NO DATE CARRIES A FLAG/.test(marks.marksLine("X", none))
        && /await part\("marks"/.test(readText(new URL("../jobs/live_check.ts", import.meta.url), "utf8")) && /fields=[^"`]*isEarningsDateEstimate/.test(readText(new URL("../supabase/functions/_shared/yahoo.ts", import.meta.url), "utf8"))); }
    // ---- through the routes over a store: a change against what will be in force (RT-2, RT-3, EN-6, EN-7, EN-8),
    // a changed form's request id (RT-4), a name as typed (RT-5), the holiday rows' reach (EN-15) ----
    {
      let state: PfMemState = pfEmpty(), clock = at("2026-11-21T09:00:00Z"), n = 0, holidays: { TSE: string[]; NYSE: string[]; through?: string | null } = { TSE: ["2026-11-23"], NYSE: ["2026-11-26", "2026-12-25", "2027-01-01"], through: "2027-12-31" };
      const store = pfMem({ load: () => state, save: (s2) => { state = s2; }, now: () => clock, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
      const deps: PfDeps = { on: true, store, now: () => clock, facts: () => Promise.resolve({ rates: { USD: null, JPY: null }, usdjpy: null, holidays }) };
      const A = "a@x.test";
      const call = async (action: string, body?: Record<string, unknown>, q: Record<string, string> = {}) => { const r = await pfRoute(deps, action, A, body ? "POST" : "GET", (k) => q[k] ?? null, body ?? {}); return { status: r.status, body: r.body as Record<string, unknown> & { error?: string; id?: string; made?: { id: string; name: string } } }; };
      await call("consent_agree", { version: 1 });
      const form = (name: string, req: string, extra: Record<string, string> = {}) => ({ requestId: req, start: "ar-ls-jp", name, values: { ...pfForm.defaultRaw("ar-ls-jp", "USD"), ...extra } });
      const id = String((await call("pf_create", form("Tokyo  L/S", "request-0001"))).body.id);
      const get = async () => (await call("pf_get", undefined, { id })).body.book as PfBook;
      ck(`RT-5: through the route the name is stored as it is drawn ("${(await get()).name}")`, (await get()).name === "Tokyo L/S");
      // RT-4
      const changed = await call("pf_create", form("Second", "request-0001", { nav: "5bn" })), same = await call("pf_create", form("Tokyo L/S", "request-0001"));
      ck(`RT-4: the same request id with a changed form makes nothing and names the book it made: ${changed.status} "${changed.body.error}"; the unchanged form is the first press's answer; one book`, changed.status === 400 && changed.body.made?.id === id && changed.body.made?.name === "Tokyo L/S" && changed.body.error === pfWords.madeBefore("Tokyo L/S") && same.status === 200 && same.body.id === id && state.books.length === 1, { changed, same });
      const set = (key: string, value: string) => call("pf_setting_set", { id, key, value, reason: "a reason that is long enough" });
      // RT-3, EN-8: a slip of the hand taken back, the pending value refused again; a choice too
      const slip = await set("one_long", "25"), again = await set("one_long", "25"), backTo = await set("one_long", "10");
      const b1 = await get(), now1 = pfView.settingsNow(b1, "2026-11-23").find((r) => r.key === "one_long")!, today1 = pfView.settingsNow(b1, "2026-11-21").find((r) => r.key === "one_long")!, h1 = pfView.historyOf(b1, "limit", "2026-11-21").filter((h) => h.key === "one_long");
      const yes = await set("jp_resident", "yes"), no = await set("jp_resident", "no");
      ck(`RT-3, EN-8: a change pending can be taken back to the value in force (25 pending, then 10: ${backTo.status}; on its day 10 is in force, and 25 reads "${h1.find((h) => h.to === "25%")?.state}"); the pending value typed again is refused ("${again.body.error}"); a choice set by a slip (Japan-resident yes) is taken back too (${no.status})`, slip.status === 200 && again.status === 400 && again.body.error === pfForm.SAME_PENDING && backTo.status === 200 && now1.value === 10 && today1.value === 10 && today1.pending === null && h1.find((h) => h.to === "25%")?.state === "replaced before it was in force" && yes.status === 200 && no.status === 200 && (await set("jp_resident", "no")).body.error === pfForm.SAME_VALUE, { slip, again, backTo, h1 });
      // EG-3 and the PMs' answers on R-53 (22 Nov 2026): the take-back is recorded as one, and the value in force keeps
      // its own BY and SINCE before and after the day the pending one would have come into force
      { const tb = h1.find((h) => h.state === "taken back"), act = pfView.activityOf(b1).find((r) => r.kind === "SETTING" && /taken back/.test(r.text)), later = pfView.settingsNow(b1, "2026-11-30").find((r) => r.key === "one_long")!;
        ck(`a take-back in HISTORY reads FROM the pending value TO the value in force ("${tb?.from} → ${tb?.to}", "${tb?.note}"), puts nothing in force, and ACTIVITY says the same ("${act?.text}"); on its day and after, the value in force is still "${today1.by}" since ${today1.since} (now "${later.by}" since ${later.since})`,
          !!tb && tb.from === "25%" && tb.to === "10%" && tb.inForceFrom === null && tb.note === "back to the value in force: the pending 25% taken back before it was in force" && !!act && /One name, long 25% → 10% · back to the value in force: the pending 25% taken back before it was in force · "a reason that is long enough"/.test(act.text)
          && today1.by === "PM A" && now1.by === "PM A" && later.by === "PM A" && later.since === today1.since && later.since === b1.startedOn && !later.own && later.pending === null, { tb, act, today1, now1, later }); }
      // RT-2, EN-7: the band and the amber line, checked against what will be in force
      const amberUp = await set("amber", "150"), bandWide = await set("band", "40"), amberBack = await set("amber", "120");
      ck(`RT-2, EN-7: with amber 150% pending, a band of ±40 is taken (it ends at 140%, below the pending line: ${bandWide.status}); taking amber back to 120% then is refused, as the pair would break the guard ("${amberBack.body.error}")`, amberUp.status === 200 && bandWide.status === 200 && amberBack.status === 400 && amberBack.body.error === "amber above 120% would fall inside the band, which ends at 140%", { amberUp, bandWide, amberBack });
      // EN-6, RT-2: the VaR limit against the targets after a January re-set, and against a pair entered for next year
      clock = at("2026-12-15T02:00:00Z");
      const pairHigh = await call("pf_targets_set", { id, x: "6.5", vol: "6.5" }), lowerVar = await set("var", "0.8");
      ck(`EN-6: with next year's pair (6.5% volatility, a normal VaR of 0.95%) entered, lowering the VaR limit to 0.8% is refused ("${String(lowerVar.body.error).slice(0, 60)}…")`, pairHigh.status === 200 && lowerVar.status === 400 && /^Target volatility 6\.5% implies a 99% one-day VaR of 0\.95%/.test(String(lowerVar.body.error)), { pairHigh, lowerVar });
      state.books[0].resets.push({ year: 2027, kind: "made", d: "2027-01-04" });   // the January line, as the daily NAV (P-3) will write it
      clock = at("2027-01-12T15:00:00Z");
      const lowered = await set("var", "0.8"), list = (await call("pf_list")).body as unknown as { rows: PfBook[] }, lt = pfView.rowTargets(list.rows[0], "2027-01-12");
      ck(`EN-6: after the re-set is in force (cash + 6.5% · 6.5% since 4 Jan 2027) the VaR limit is checked against it ("${String(lowered.body.error).slice(0, 40)}…"), and the list prints the targets in force ("${pfView.targetsWords(lt.x, lt.vol)}"); an older server's row without the re-sets keeps the targets of creation`, lowered.status === 400 && /^Target volatility 6\.5%/.test(String(lowered.body.error)) && lt.x === 6.5 && lt.vol === 6.5 && pfView.rowTargets({ ...list.rows[0], resets: undefined, retargets: undefined }, "2027-01-12").vol === 5, { lowered, lt });
      // EN-15: the holiday rows' reach
      holidays = { ...holidays, through: null };
      const unread = await set("one_short", "4");
      holidays = { ...holidays, through: "2027-12-31" }; clock = at("2028-11-22T17:00:00Z");
      const past = await set("one_short", "4");
      clock = at("2027-06-01T15:00:00Z");
      const inside = await set("one_short", "4");
      ck(`EN-15: a change is not dated past the holiday rows ("${past.body.error}") nor with none read ("${unread.body.error}"); inside them it is (${String(inside.body.effective)})`, past.status === 400 && past.body.error === pfWords.calendarPast("2028") && unread.status === 400 && unread.body.error === pfWords.CALENDAR_UNREAD && inside.status === 200 && inside.body.effective === "2027-06-02" && pfCal.calendarGap("2027-12-31", { through: "2027-12-31" }) === null && pfCal.calendarGap("2028-01-03", {}) === null, { past, unread, inside });
      // what the database could not store, or a write that names no book, refused in words before it is sent
      const noId = await call("pf_note_add", { body: "a note" }), half = await call("pf_note_remove", { id, note: 1.5 }), ver = await call("consent_agree", { version: "one" }), nul = await call("pf_note_add", { id, body: "a\u0000b" });
      const big = "x".repeat(32 * 1024 * 1024), t0 = Date.now(), bigNo = pfForm.noteRefusal(big), ms = Date.now() - t0;
      ck(`what the database would fail on is refused in words first: a write that names no book ("${noId.body.error}"), a note's number that is not whole ("${half.body.error}"), a statement's version that is not a number, a note holding U+0000 ("${nul.body.error}"); a note of 32 MB is refused in ${ms} ms without being copied, and "😀" counts as one character`, noId.status === 404 && noId.body.error === pfWords.NO_SUCH && half.status === 400 && half.body.error === pfWords.NO_NOTE && ver.status === 400 && ver.body.error === pfWords.OLD_VERSION && nul.status === 400 && nul.body.error === pfForm.NO_NUL && pfForm.reasonRefusal("a reason \u0000 that is long") === pfForm.NO_NUL
        && /^2,000 characters at most · 33,552,432 over$/.test(bigNo ?? "") && ms < 2000 && pfForm.noteLeft("😀") === 1999, { noId, half, ver, nul, bigNo, ms });
      // the caps, in the stand-in store as in the database (sim/sql/pf.test.cjs tries the database's)
      for (let k = state.books[0].notes.length; k < pfWords.NOTES_MAX; k++) await call("pf_note_add", { id, body: "n" });
      const full = await call("pf_note_add", { id, body: "one more" });
      ck(`SQ-4, RT-7: the stand-in store refuses the 501st note in the database's words ("${full.body.error}") and drops none`, full.status === 400 && full.body.error === pfWords.NOTES_FULL && state.books[0].notes.length === 500);
    }
    // ---- EN-13: the defaults, ranges and steps pinned as the build note writes them (D/p1-design.md §4.3–§4.5,
    // compared value by value by the second review of P-1), the 99% point, New York's clock in summer ----
    const PINNED: Record<string, string> = {
      "ar-ls-jp": "target_x:5/0/15/0.5 target_vol:5/2/8/0.5 band:20/5/50/5 amber:120/100/150/5 foreign:20/0/50/0.1 one_long:10/3/25/0.1 one_short:5/1/10/0.1 sector_gross:50/20/150/0.1 sector_net:20/5/50/0.1 ccy_each:10/0/50/0.1 gross:200/100/300/1 net:20/5/100/0.1 beta_net:10/5/50/0.1 var:1/0.5/3/0.1 exit_long:5/1/20/1 exit_short:3/1/20/1 cut1:4/2/8/0.5 cap1:50/25/75/5 cut2:2/1/4/0.5 cap2:30/10/50/5 out:2/1/4/0.5 cooling:20/0/60/1 deadline:1/1/3/1 floor:20/5/50/0.1 house_multiple:1/1/2/0.1 stress_mult:1.5/1/3/0.1 cash_spread:-0.25/-1/0/0.01 debit_spread:0.4/0/1.5/0.01 rebate_spread:-0.25/-1/0/0.01 borrow_gc_us:0.3/0.1/1/0.01 borrow_gc_jp:0.5/0.1/1/0.01 borrow_warm:2/1/5/0.1 borrow_htb:10/5/30/0.1 comm_us:2/0/10/0.1 comm_jp:5/0/20/0.1 impact:0.5/0.25/1/0.01 base:USD ladder_base:guarded funding:pb jp_resident:no",
      "ar-ls-gl": "target_x:5/0/15/0.5 target_vol:5/2/8/0.5 band:20/5/50/5 amber:120/100/150/5 one_long:10/3/25/0.1 one_short:5/1/10/0.1 sector_gross:50/20/150/0.1 sector_net:20/5/50/0.1 region_net:15/5/50/0.1 region_max:75/50/100/0.1 ccy_each:10/0/50/0.1 ccy_all:20/0/100/0.1 gross:200/100/400/1 net:20/5/100/0.1 beta_net:10/5/50/0.1 var:1/0.5/3/0.1 exit_long:5/1/20/1 exit_short:3/1/20/1 cut1:4/2/8/0.5 cap1:50/25/75/5 cut2:2/1/4/0.5 cap2:30/10/50/5 out:2/1/4/0.5 cooling:20/0/60/1 deadline:1/1/3/1 floor:20/5/50/0.1 house_multiple:1/1/2/0.1 stress_mult:1.5/1/3/0.1 cash_spread:-0.25/-1/0/0.01 debit_spread:0.4/0/1.5/0.01 rebate_spread:-0.25/-1/0/0.01 borrow_gc_us:0.3/0.1/1/0.01 borrow_gc_jp:0.5/0.1/1/0.01 borrow_warm:2/1/5/0.1 borrow_htb:10/5/30/0.1 comm_us:2/0/10/0.1 comm_jp:5/0/20/0.1 impact:0.5/0.25/1/0.01 base:USD ladder_base:guarded funding:pb jp_resident:no",
      "ar-macro": "target_x:5/0/15/0.5 target_vol:5/2/8/0.5 band:20/5/50/5 amber:120/100/150/5 adj_gross:600/300/1000/1 one_long:5/1/20/0.1 one_short:3/0.5/10/0.1 exit_one:5/1/20/1 sector_net:15/5/50/0.1 sector_gross:100/25/300/0.1 eq_gross:300/50/600/0.1 eq_net:30/0/100/0.1 var:1/0.25/3/0.05 stress:8/4/12/0.1 dv01_each:0.05/0.01/0.2/0.01 dv01_all:0.1/0.02/0.4/0.01 fx_each:50/10/200/0.1 fx_all:150/30/400/0.1 cmdty_each:20/5/100/0.1 cmdty_all:60/10/200/0.1 vega:0.2/0.05/1/0.01 cut1:4/2/8/0.5 cap1:50/25/75/5 cut2:2/1/4/0.5 cap2:30/10/50/5 out:2/1/4/0.5 cooling:20/0/60/1 deadline:1/1/3/1 floor:10/0/50/0.1 house_multiple:1/1/2/0.1 fut_multiple:1/1/2/0.1 fxcoll_g10:3/1/10/0.1 fxcoll_other:7.5/3/20/0.1 stress_mult:1.5/1/3/0.1 cash_spread:-0.25/-1/0/0.01 debit_spread:0.4/0/1.5/0.01 rebate_spread:-0.25/-1/0/0.01 borrow_gc_us:0.3/0.1/1/0.01 borrow_gc_jp:0.5/0.1/1/0.01 borrow_warm:2/1/5/0.1 borrow_htb:10/5/30/0.1 comm_us:2/0/10/0.1 comm_jp:5/0/20/0.1 impact:0.5/0.25/1/0.01 base:USD blend:60 ladder_base:guarded",
    };
    const now = Object.fromEntries(AR.map((s) => [s, [...pfPresets.STARTS[s].fields.filter((f) => f.num).map((f) => `${f.key}:${f.num!.def}/${f.num!.lo}/${f.num!.hi}/${f.num!.step ?? Math.pow(10, -f.num!.dp)}`), ...pfPresets.STARTS[s].fields.filter((f) => f.choices).map((f) => `${f.key}:${f.choices!.def}`)].join(" ")]));
    const differ = AR.flatMap((s) => { const a = PINNED[s].split(" "), b = now[s].split(" "); return [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x)).map((x) => `now ${x}`)].map((x) => `${s} ${x}`); });
    ck(`EN-13: every typed row's default, range and step, and every choice's default, of the three starts (${AR.map((s) => PINNED[s].split(" ").length).join(", ")} rows) are the ones written here from the build note: a change to any of them fails this line`, differ.length === 0, differ.slice(0, 6));
    ck("EN-13: the starting NAV's ranges and defaults, and the 99% point (2.326 ÷ √252 per unit of volatility: 5% gives 0.732621%)", JSON.stringify(pfMoney.NAV_RANGE) === '{"USD":{"lo":10000000,"hi":1000000000,"def":100000000,"refuse":"between USD 10m and USD 1bn","range":"USD 10m–1bn"},"JPY":{"lo":1000000000,"hi":100000000000,"def":10000000000,"refuse":"between JPY 1bn and JPY 100bn","range":"JPY 1bn–100bn"}}' && pfTargets.normalVar(5).toFixed(6) === "0.732621");
    const vd = (iso: string) => pfCal.valuationDay(at(iso));
    ck("EN-13: the valuation day turns at 17:00 New York in summer time as in winter, and on the four days the clocks change in 2026 and 2027", vd("2026-07-15T20:59:00Z") === "2026-07-15" && vd("2026-07-15T21:00:00Z") === "2026-07-16" && vd("2026-03-08T20:59:00Z") === "2026-03-08" && vd("2026-03-08T21:00:00Z") === "2026-03-09" && vd("2026-11-01T21:59:00Z") === "2026-11-01" && vd("2026-11-01T22:00:00Z") === "2026-11-02"
      && vd("2027-03-14T20:59:00Z") === "2027-03-14" && vd("2027-03-14T21:00:00Z") === "2027-03-15" && vd("2027-11-07T21:59:00Z") === "2027-11-07" && vd("2027-11-07T22:00:00Z") === "2027-11-08" && vd("2026-11-20T21:59:00Z") === "2026-11-20" && vd("2026-11-20T22:00:00Z") === "2026-11-21");
  }

  // Last, so that a file a require loads part-way through the run is in Node's list too.
  console.log("\n[AJ] the market table itself, run against a stand-in database that cuts every answer at 1,000 rows, as PostgREST does (FH-3, CF-3 of the review of fix part 1: nothing ran table.ts's read or its wiring)");
  {
    // The stand-in: the query builder as far as tablecore.ts uses it (select, eq, in, gte, lte, order, range, rpc),
    // every answer cut at `cap` rows, every request logged. 120 instruments of New York whose newest booked close
    // (Fri 20 Nov 2026) is also the anchors' "previous close" (the `stuck` rows: a quote that is no new session), so
    // the table reads their earlier closes from prices_daily: 11 sessions each in its 14-day window, 1,320 rows, which
    // one request would cut at 1,000, the newest dates the ones left out (LS-5).
    type Row = Record<string, unknown>;
    // `scramble`: rows equal on every ordered column come in a fresh order in each request, as a database without a
    // tie-break gives them (SV-1 of the final review of pull request #50: dropping the read's .order("symbol") passed)
    const mkDb = (tables: Record<string, Row[]>, rpcs: Record<string, Row[]>, cap = 1000, scramble = 0) => {
      const log: Array<{ table: string; matched: number; returned: number; ranged: boolean; ord: string }> = [];
      let seed = scramble;
      const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      class Q {
        f: Array<(r: Row) => boolean> = []; ord: Array<[string, number]> = []; rng: [number, number] | null = null;
        constructor(readonly table: string) {}
        select() { return this; }
        eq(c: string, v: unknown) { this.f.push((r) => r[c] === v); return this; }
        in(c: string, vs: unknown[]) { const set = new Set(vs); this.f.push((r) => set.has(r[c])); return this; }
        gte(c: string, v: string) { this.f.push((r) => String(r[c]) >= v); return this; }
        lte(c: string, v: string) { this.f.push((r) => String(r[c]) <= v); return this; }
        order(c: string, o?: { ascending?: boolean }) { this.ord.push([c, o?.ascending === false ? -1 : 1]); return this; }
        range(a: number, b: number) { this.rng = [a, b]; return this; }
        then(res: (v: { data: Row[]; error: null }) => void) {
          const tie = new Map<Row, number>();
          let rows = (tables[this.table] ?? []).filter((r) => this.f.every((p) => p(r)));
          if (scramble) for (const r of rows) tie.set(r, rand());
          rows = [...rows].sort((x, y) => { for (const [c, sgn] of this.ord) { const a = x[c] as string | number, b = y[c] as string | number; if (a < b) return -sgn; if (a > b) return sgn; } return scramble ? tie.get(x)! - tie.get(y)! : 0; });
          const matched = rows.length;
          rows = this.rng ? rows.slice(this.rng[0], Math.min(this.rng[1] + 1, this.rng[0] + cap)) : rows.slice(0, cap);
          log.push({ table: this.table, matched, returned: rows.length, ranged: !!this.rng, ord: this.ord.map(([c, s]) => `${c}${s < 0 ? " desc" : ""}`).join(",") });
          res({ data: rows, error: null });
        }
      }
      return { db: { from: (t: string) => new Q(t), rpc: (fn: string) => Promise.resolve({ data: rpcs[fn] ?? [], error: null }) }, log };
    };
    const SESS: string[] = [];
    for (let t = Date.parse("2026-08-03T00:00:00Z"); t <= Date.parse("2026-11-20T00:00:00Z"); t += 86400e3) { const d = new Date(t); if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) SESS.push(d.toISOString().slice(0, 10)); }
    const N = 120, close = (k: number, d: string) => 100 + k + SESS.indexOf(d) * 0.01;
    const inst = Array.from({ length: N }, (_, k) => ({ ord: k + 1, symbol: `^T${String(k).padStart(3, "0")}`, name: `Stand-in index ${k}`, cls: "Equities", grp: "equity", market: "NYSE", tz: "America/New_York", currency: "USD", decimals: 2, proxy_for: null, provider: "yahoo", provider_symbol: null, notes: null, active: true, market_tab: true, chart: true }));
    const prices = inst.flatMap((i, k) => SESS.map((d) => ({ symbol: i.symbol, d, close: close(k, d) })));
    const last = "2026-11-20", before = "2026-11-19";
    const anchors = inst.map((i, k) => ({ symbol: i.symbol, ref_d: last, last_d: last, last_close: close(k, last), d1: close(k, last), d1_d: last }));
    const stats = inst.map((i) => ({ symbol: i.symbol, mean21: null, sd21: null, hi252: null, lo252: null, mean200: null, sd63: 1, n63: 63, from63: SESS[SESS.length - 64], to63: last, sd63x: 1, n63x: 63, from63x: SESS[SESS.length - 65], to63x: before }));
    const { db: sdb, log } = mkDb({ instruments: inst, quotes_latest: [], sessions_cal: [], fut_contracts: [], fut_rolls: [], prices_daily: prices }, { fn_table_anchors: anchors, fn_table_stats: stats });
    const t = await tableCore.computeTableWith(sdb, new Date("2026-11-22T06:00:00Z"));
    const kOf = (sym: string) => Number(sym.slice(2));
    const reads = log.filter((x) => x.table === "prices_daily"), wrong = t.rows.filter((r) => r.closeDates.d1 !== before || r.closes.d1 !== close(kOf(r.symbol), before) || r.ls?.d !== last || r.ls?.from !== before || r.ls?.z == null);
    ck(`computeTable against an answer cut at 1,000 rows: the earlier closes of ${N} rows (${reads[0]?.matched ?? 0} rows in their window) are read page by page (${reads.length} requests, each at most 1,000 rows), and every row's 1D is set against the session before its last close (${before}) and its last session runs ${before} to ${last} with its σ (${wrong.length} rows wrong)`, t.rows.length === N && reads.length >= 2 && reads.every((x) => x.ranged && x.returned <= 1000) && (reads[0]?.matched ?? 0) > 1000 && wrong.length === 0, { reads, wrong: wrong.slice(0, 3).map((r) => ({ s: r.symbol, d1: r.closeDates.d1, ls: r.ls && [r.ls.from, r.ls.d, r.ls.z] })) });

    // SV-1 of the final review of pull request #50: the check above holds New York's rows only, stuck with no quote (a
    // state the database does not give), so it guarded the paged read and the stuck filter and nothing else of a row: a
    // yield's units, the futures' rolls (B-27, and B-32's last session across a roll) and which σ window a row uses all
    // passed when broken. Here New York is open (Mon 23 Nov 2026, 15:00 UTC) and each quote is the newer view, which is
    // how fn_table_anchors makes a row "stuck": 105 stand-in indices; a yield read in New York's hours; an official
    // yield with no quote; three futures (a roll today with the new contract's own close, one without it, and one
    // between the last two closes); and a row whose closes went unbooked for eight sessions. Every figure is worked out
    // by hand from the stand-in's numbers. The stand-in gives rows with equal keys in a fresh order in each request, and
    // the read's first page ends inside 19 Nov's rows, which every row's last session needs.
    {
      const NOW = new Date("2026-11-23T15:00:00Z"), QT = "2026-11-23T14:59:00Z", TODAY = "2026-11-23", win = SESS.filter((d) => d >= "2026-11-06");
      const NB = 105, bc = (k: number, d: string) => 100 + k + SESS.indexOf(d) * 0.01;
      const base = { cls: "Equities", grp: "equity", market: "NYSE", tz: "America/New_York", currency: "USD", decimals: 2, proxy_for: null, provider: "yahoo", provider_symbol: null, notes: null, active: true, market_tab: true, chart: true };
      const ins: Row[] = [], px: Row[] = [], anc: Row[] = [], qs: Row[] = [], sts: Row[] = [];
      // a row: its instrument, its closes in the read's window, its quote (none for an official yield) and its σ windows
      // (sd63 to the newest close, sd63x to the one before), and the anchors as the database gives them
      const add = (i: Row, closes: Record<string, number>, quote: number | null, st: Row, a: Row) => {
        ins.push({ ...base, ord: ins.length + 1, ...i });
        for (const [d, c] of Object.entries(closes)) px.push({ symbol: i.symbol, d, close: c });
        if (quote != null) qs.push({ symbol: i.symbol, price: quote, prev_close: null, market_time: QT, fetched_at: QT });
        sts.push({ symbol: i.symbol, mean21: null, sd21: null, hi252: null, lo252: null, mean200: null, n63: 63, from63: "2026-08-20", to63: last, n63x: 63, from63x: "2026-08-19", to63x: before, ...st });
        anc.push({ symbol: i.symbol, ref_d: last, last_d: last, ...a });
      };
      const flat = (v: number, over: Record<string, number>) => Object.fromEntries(win.map((d) => [d, over[d] ?? v]));
      for (let k = 0; k < NB; k++) add({ symbol: `^N${String(k).padStart(3, "0")}`, name: `Stand-in index ${k}` }, Object.fromEntries(win.map((d) => [d, bc(k, d)])), bc(k, last) + 1, { sd63: 0.8, sd63x: 1.25 }, { last_close: bc(k, last), d1: bc(k, last), d1_d: last });
      add({ symbol: "^TNX", name: "UST 10Y yield", cls: "Fixed income", grp: "rates" }, flat(4.0, { [before]: 4.1, [last]: 4.2 }), 4.25, { sd63: 0.05, sd63x: 0.04 }, { last_close: 4.2, d1: 4.2, d1_d: last });
      add({ symbol: "JGB10Y", name: "JGB 10Y yield", cls: "Fixed income", grp: "rates", market: "TSE", tz: "Asia/Tokyo", provider: "mof" }, flat(1.7, { [before]: 1.75, [last]: 1.8 }), null, { sd63: 0.05, sd63x: 0.025 }, { last_close: 1.8, d1: 1.75, d1_d: before });
      add({ symbol: "CL=F", name: "WTI crude", cls: "Commodities", grp: "cmdty", market: "CME" }, flat(71, { [before]: 71.5, [last]: 72 }), 70.7, { sd63: 0.5, sd63x: 0.6, mean21: 71, sd21: 1 }, { last_close: 72, d1: 72, d1_d: last });
      add({ symbol: "ES=F", name: "S&P 500 future", cls: "Futures", grp: "equity", market: "CME" }, flat(5980, { [before]: 5990, [last]: 6000 }), 6010, { sd63: 2, sd63x: 1, mean21: 6000, sd21: 10 }, { last_close: 6000, d1: 6000, d1_d: last });
      add({ symbol: "ZN=F", name: "10Y T-Note future", cls: "Fixed income", grp: "rates", market: "CME" }, flat(113.2, { [before]: 113, [last]: 112 }), 112.1, { sd63: 0.3, sd63x: 0.45 }, { last_close: 112, d1: 112, d1_d: last });
      add({ symbol: "^GAP", name: "Stand-in index with a gap" }, { "2026-11-06": 50, "2026-11-09": 50.5, [last]: 51 }, 51.2, { sd63: 1, sd63x: 1.2, to63x: "2026-11-09", from63x: "2026-08-07" }, { last_close: 51, d1: 51, d1_d: last });
      const rolls = [{ symbol: "CL=F", d: TODAY, from_contract: "CLZ26.NYM", to_contract: "CLF27.NYM", prev_close: 70 }, { symbol: "ES=F", d: TODAY, from_contract: "ESZ26.CME", to_contract: "ESH27.CME", prev_close: null }, { symbol: "ZN=F", d: last, from_contract: "ZNZ26.CBT", to_contract: "ZNH27.CBT", prev_close: 111 }];
      const contracts = [{ symbol: "CL=F", d: last, contract: "CLZ26.NYM" }, { symbol: "CL=F", d: TODAY, contract: "CLF27.NYM" }, { symbol: "ES=F", d: TODAY, contract: "ESH27.CME" }, { symbol: "ZN=F", d: last, contract: "ZNH27.CBT" }];
      const { db: ndb, log: nlog } = mkDb({ instruments: ins, quotes_latest: qs, sessions_cal: [], fut_contracts: contracts, fut_rolls: rolls, prices_daily: px }, { fn_table_anchors: anc, fn_table_stats: sts }, 1000, 20261123);
      const nt = await tableCore.computeTableWith(ndb, NOW);
      const R = new Map(nt.rows.map((r) => [r.symbol, r])), near = (a: number | null | undefined, b: number | null) => (a == null || b == null ? a == null && b == null : Math.abs(a - b) < 1e-9);
      const pct = (a: number, b: number) => (a / b - 1) * 100;
      // where the read's first page ends: inside the rows of 19 Nov, which every row's last session needs
      const inWin = px.filter((r) => String(r.d) >= "2026-11-06").sort((x, y) => (x.d as string).localeCompare(y.d as string) || (x.symbol as string).localeCompare(y.symbol as string));
      const nreads = nlog.filter((x) => x.table === "prices_daily");
      const bulkWrong = [...Array(NB).keys()].filter((k) => { const r = R.get(`^N${String(k).padStart(3, "0")}`), c0 = bc(k, last), c1 = bc(k, before), d1 = pct(c0 + 1, c0), ch = pct(c0, c1);
        return !r || !near(r.last, c0 + 1) || !near(r.closes.d1, c0) || r.closeDates.d1 !== last || !near(r.pct.d1, d1) || !near(r.z1d, d1 / 0.8) || !near(r.sd1d, 0.8) || r.zTo !== last || r.ls?.from !== before || r.ls?.d !== last || !near(r.ls?.base, c1) || !near(r.ls?.chg, ch) || !near(r.ls?.z, ch / 1.25) || r.ls?.roll !== null || r.contract !== null; });
      ck(`SV-1: New York open, every quote the newer view: the earlier closes of ${NB + 5} rows (${nreads[0]?.matched ?? 0} rows, the first page ending inside ${inWin[999]?.d}'s rows) are read in ${nreads.length} requests ordered by "${nreads[0]?.ord}" (equal keys come in a fresh order each time), and each of the ${NB} indices has its 1D from its last close in σ of the 63 changes to that close (sd63, 0.8), and its last session ${before} to ${last} with its own two closes in σ of the 63 changes before it (sd63x, 1.25) (${bulkWrong.length} rows wrong)`,
        inWin[999]?.d === before && nreads.length >= 2 && nreads.every((x) => x.ranged && x.returned <= 1000 && x.ord === "d,symbol") && bulkWrong.length === 0, { reads: nreads, bulkWrong: bulkWrong.slice(0, 4).map((k) => { const r = R.get(`^N${String(k).padStart(3, "0")}`); return r && { s: r.symbol, z1d: r.z1d, sd: r.sd1d, ls: r.ls && [r.ls.from, r.ls.base, r.ls.chg, r.ls.z] }; }) });
      const tnx = R.get("^TNX"), jgb = R.get("JGB10Y");
      ck(`SV-1: a yield is measured in points: UST 10Y quoted at 4.25 over its close of 4.20 is +0.05 in 1D (z ${tnx?.z1d?.toFixed(3)} = 0.05 over sd63 0.05) and its last session 4.10 to 4.20 is +0.10 (z ${tnx?.ls?.z?.toFixed(3)} = 0.10 over sd63x 0.04); JGB 10Y with no quote shows its last close, its 1D from the close before in σ of the 63 changes before that close (z ${jgb?.z1d?.toFixed(3)} = 0.05 over sd63x 0.025)`,
        !!tnx && near(tnx.last, 4.25) && near(tnx.chg.d1, 0.05) && near(tnx.z1d, 1) && near(tnx.sd1d, 0.05) && tnx.zTo === last && near(tnx.ls?.base, 4.1) && near(tnx.ls?.chg, 0.1) && near(tnx.ls?.z, 2.5)
        && !!jgb && near(jgb.last, 1.8) && jgb.lastAt === `${last}T00:00:00Z` && near(jgb.closes.d1, 1.75) && jgb.closeDates.d1 === before && near(jgb.chg.d1, 0.05) && near(jgb.z1d, 2) && near(jgb.sd1d, 0.025) && jgb.zTo === before && jgb.ls?.from === before && near(jgb.ls?.chg, 0.05) && near(jgb.ls?.z, 2), { tnx: tnx && { z1d: tnx.z1d, chg: tnx.chg.d1, ls: tnx.ls }, jgb: jgb && { z1d: jgb.z1d, sd: jgb.sd1d, zTo: jgb.zTo, ls: jgb.ls } });
      const cl = R.get("CL=F"), es = R.get("ES=F"), zn = R.get("ZN=F"), gap = R.get("^GAP");
      ck(`SV-1: a future rolling today with the new contract's own close (WTI: 70.7 over 70.0, ${cl?.pct.d1?.toFixed(4)}%, step ${cl?.roll?.step?.toFixed(4)}%, z ${cl?.z1d?.toFixed(3)}, σ vs 1M avg ${cl?.z1m?.toFixed(3)} on the new contract's level); one rolling today without it (S&P 500 future: its 1D across the change of contract, no step, no σ); the contract each names, as last recorded`,
        !!cl && near(cl.closes.d1, 70) && cl.closeDates.d1 === last && near(cl.pct.d1, pct(70.7, 70)) && cl.roll?.d === TODAY && cl.roll?.from === "CLZ26.NYM" && cl.roll?.to === "CLF27.NYM" && near(cl.roll?.step ?? null, pct(70, 72)) && near(cl.z1d, pct(70.7, 70) / 0.5) && near(cl.z1m, 1.72) && cl.contract === "CLF27.NYM" && near(cl.ls?.base, 71.5) && near(cl.ls?.chg, pct(72, 71.5)) && cl.ls?.roll === null
        && !!es && near(es.closes.d1, 6000) && near(es.pct.d1, pct(6010, 6000)) && es.roll?.step === null && es.roll?.to === "ESH27.CME" && es.z1d === null && es.z1m === null && es.contract === "ESH27.CME" && near(es.ls?.z, pct(6000, 5990) / 1), { cl, es: es && { roll: es.roll, z1d: es.z1d, pct: es.pct.d1 } });
      ck(`SV-1: a future whose roll lies between its last two closes (10Y T-Note future, a price though in the rates group): its last session is counted within the new contract, from that contract's own close of 111 (${zn?.ls?.chg?.toFixed(4)}%, step ${zn?.ls?.roll?.step?.toFixed(4)}%, z ${zn?.ls?.z?.toFixed(3)}), and its day crosses no roll; a row whose closes went unbooked for eight sessions finds its close of 9 Nov in the read's 14 days (last session ${gap?.ls?.from} to ${gap?.ls?.d})`,
        !!zn && zn.roll === null && near(zn.pct.d1, pct(112.1, 112)) && near(zn.z1d, pct(112.1, 112) / 0.3) && zn.ls?.from === before && near(zn.ls?.base, 111) && near(zn.ls?.chg, pct(112, 111)) && zn.ls?.roll?.to === "ZNH27.CBT" && zn.ls?.roll?.from === "ZNZ26.CBT" && near(zn.ls?.roll?.step ?? null, pct(111, 113)) && near(zn.ls?.z, pct(112, 111) / 0.45) && zn.contract === "ZNH27.CBT"
        && !!gap && gap.ls?.from === "2026-11-09" && near(gap.ls?.base, 50.5) && near(gap.ls?.z, pct(51, 50.5) / 1.2) && near(gap.z1d, pct(51.2, 51) / 1) && nt.asOf === NOW.toISOString(), { zn: zn && { roll: zn.roll, ls: zn.ls }, gap: gap?.ls });
    }
  }

  console.log("\n[AM] the browser jobs print the widths their suites measured, passed or failed (slice 10, 23 Nov 2026: V8-2 of the check of slice 8)");
  {
    // GitHub runs the browser checks in both letter placements (deploy-web.yml, web/e2e/placement.cjs). Whether a leg
    // draws what the engineer's machine draws in the same placement shows in the widths portfolio, letter-placement and
    // header measure, which they write to web/e2e/.out; GitHub keeps that folder only when a job fails. So each of the
    // four browser jobs runs web/e2e/widths.cjs after its run, and the same command over a local run prints the same
    // block. Here the script runs as a job runs it, over records written as web/e2e/run.cjs writes them, in folders of
    // its own: nothing of the repository's own web/e2e/.out is read.
    const script = fileURLToPath(new URL("../web/e2e/widths.cjs", import.meta.url));
    const wf = readText(new URL("../.github/workflows/deploy-web.yml", import.meta.url), "utf8");
    let source = "";
    try { source = readText(script, "utf8"); } catch { /* no script: the checks below say so */ }
    const tmp = mkdtempSync(joinPath(tmpdir(), "orrery-widths-"));
    const INSTALLED = ["--font-render-hinting=none", "--disable-lcd-text"];
    const folder = (name: string, run: unknown, logs: Record<string, string>) => {
      const d = joinPath(tmp, name); mkdirSync(d);
      if (run !== null) writeFileSync(joinPath(d, "run.json"), JSON.stringify(run));
      for (const [f, text] of Object.entries(logs)) writeFileSync(joinPath(d, f), text);
      return d;
    };
    const print = (d: string, job?: string) => {
      const env: NodeJS.ProcessEnv = { ...process.env }; delete env.GITHUB_JOB; if (job) env.GITHUB_JOB = job;
      const r = spawnSync(process.execPath, [script, d], { env, encoding: "utf8", timeout: 30e3 });
      return { status: r.status, lines: (r.stdout || "").replace(/\n$/, "").split("\n"), err: (r.stderr || "").slice(0, 300) };
    };
    // an address and a token, put together here so that no such string stands in the repository
    const ADDRESS = ["a.person", "example.com"].join("@"), TOKEN = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxIn0", "c2lnbmVk"].join(".");
    try {
      // 1. test-2-installed: header failed its first try and passed its second; letter-placement passed; header-sizes,
      // which it does not watch, ran beside them
      const two = folder("part2", { placement: "installed", switches: INSTALLED, preloads: [], part: "2",
        suites: [{ name: "header-sizes", part: 2 }, { name: "header", part: 2 }, { name: "letter-placement", part: 2 }],
        done: { "header-sizes": { ok: true, checks: 1, tries: 1, log: "header-sizes.log" }, header: { ok: true, checks: 4, tries: 2, log: "header.try2.log" }, "letter-placement": { ok: true, checks: 2, tries: 1, log: "letter-placement.log" } } }, {
        "header.log": "  ✗ 1179x800: (c) the line's holder 480.1 px  -> {}\n",
        "header.try2.log": `\n[(a) a label of 12 px]\n  ✓ 1179x800, seven tabs: (a) one row, 22.7 px tall\n  ✓ 1179x800, seven tabs: (e) the menu: 07:10:08 SGT, nothing cut\n  ✓ 1179x800: (c) the line's holder 486.5 px, read by ${ADDRESS} with ${TOKEN}\n  ✓ a 13-px line\n196 s\n`,
        "header-sizes.log": "  ✓ 1440x900 L: one row, 33.3 px tall\n",
        "letter-placement.log": "  ✓ with no preload a 13-px line measures 240 px in DejaVuSansMono.ttf\n  ✓ E2E_PLACEMENT unset or github: no switch added\n",
      });
      const a = print(two, "test-2-installed");
      const wantA = ["letter-placement | ✓ with no preload a 13-px line measures 240 px in DejaVuSansMono.ttf", "header | ✓ 1179x800, seven tabs: (a) one row, 22.7 px tall",
        "header | ✓ 1179x800: (c) the line's holder 486.5 px, read by [an address] with [a token]", "header | ✓ a 13-px line"];
      ck(`a job's block: its first line names the job, its letter placement and part, and what the suites it watches did ("${a.lines[0]}"); then every check line with a px figure of letter-placement and of header, in that order, from the try that decided each (header's second), an address and a token masked; nothing of a suite it does not watch, no line without px, no label`,
        a.status === 0 && a.lines.length === 5 && /^\[widths\] test-2-installed \(GitHub\) · E2E_PLACEMENT=installed \(--font-render-hinting=none --disable-lcd-text\) · part 2: letter-placement ✓ 2 checks, header ✓ 4 checks, second try$/.test(a.lines[0])
        && JSON.stringify(a.lines.slice(1)) === JSON.stringify(wantA) && !a.lines.some((l) => /480\.1|33\.3|@|eyJ/.test(l)), a);
      // 2. a local run of part 1 GitHub's way with portfolio's 100 lines: at most 80 lines, the last saying how many more
      const many = Array.from({ length: 100 }, (_, i) => `  ✓ C${i}: the header is ${80 + i / 10} px tall`).join("\n");
      const one = folder("part1", { placement: "github", switches: [], preloads: ["github-like-browser.cjs"], part: "1",
        suites: [{ name: "portfolio", part: 1 }, { name: "portfolio-fixes", part: 1 }], done: { portfolio: { ok: false, checks: 99, tries: 2, log: "portfolio.try2.log" } } }, { "portfolio.try2.log": `${many}\n  ✗ C100: the form is 1101 px wide  -> {"w":1101}\n` });
      const b = print(one);
      ck(`a block is at most 80 lines, the 80th saying how many more lines with px figures the log holds; a run on this machine says so and names another preload it loaded ("${b.lines[0]}")`,
        b.status === 0 && b.lines.length === 80 && /^\[widths\] this machine · E2E_PLACEMENT=github \(the browser's own\), also loaded: github-like-browser\.cjs · part 1: portfolio ✗ 99 checks, second try$/.test(b.lines[0])
        && b.lines[1] === "portfolio | ✓ C0: the header is 80 px tall" && b.lines[78] === "portfolio | ✓ C77: the header is 87.7 px tall" && /^… 23 more lines with px figures/.test(b.lines[79]), { status: b.status, n: b.lines.length, first: b.lines.slice(0, 2), last: b.lines.slice(-2) });
      // 3. a local run of all suites that stopped before header ended, and a folder with no run recorded
      const all = folder("all", { placement: "installed", switches: INSTALLED, preloads: [], part: "",
        suites: [{ name: "header", part: 2 }, { name: "portfolio", part: 1 }], done: { portfolio: { ok: true, checks: 1, tries: 1, log: "portfolio.log" } } }, { "portfolio.log": "  ✓ C1: the header is 80.6 px tall\n", "header.log": "  ✓ 1179x800: one row, 22.7 px tall\n" });
      const c = print(all), d = print(folder("none", null, {}));
      ck(`a run of both parts prints a block per part, part 1 first, and a watched suite with no finished try says so (no line of an unfinished log); a folder with no run recorded prints one line; the script exits with 0 every time: it prints, it checks nothing`,
        c.status === 0 && c.lines.length === 4 && /· part 1: portfolio ✓ 1 check$/.test(c.lines[0]) && c.lines[1] === "portfolio | ✓ C1: the header is 80.6 px tall" && /· part 2: header not finished$/.test(c.lines[2]) && c.lines[3] === "header | no finished try in this run"
        && d.status === 0 && d.lines.length === 1 && /^\[widths\] no run of e2e\/run\.cjs is recorded/.test(d.lines[0]), { c, d });
    } catch (e) { ck(`the script ran over its folders (${(e as Error).message})`, false); }
    rmSync(tmp, { recursive: true, force: true });
    ck("web/e2e/widths.cjs needs nothing but Node's own modules, so that a job prints its widths even when its install failed", source !== "" && [...source.matchAll(/require\("([^"]+)"\)/g)].every((m) => builtinModules.includes(m[1].replace(/^node:/, ""))), [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]));
    // 4. deploy-web.yml: each of the four browser jobs prints the block right after its run, passed or failed, and a
    // failure of the print never stops a publish
    const jobs = [...wf.matchAll(/^  ([\w-]+):\n((?:(?: {4}.*)?\n)+)/gm)].map((m) => ({ name: m[1], steps: m[2].split(/\n(?=      - )/).map((s) => Object.fromEntries([...s.matchAll(/^ {6}(?:- | {2})([\w-]+): (.+)$/gm)].map((x) => [x[1], x[2].trim()]))) }));
    const legs = jobs.map((j) => { const i = j.steps.findIndex((s) => /^node e2e\/run\.cjs --part=[12]$/.test(s.run ?? "")); return { name: j.name, run: j.steps[i]?.run, after: i >= 0 ? j.steps[i + 1] : undefined }; }).filter((j) => j.run);
    const printed = legs.filter((j) => j.after?.if === "always()" && j.after?.run === "node e2e/widths.cjs" && j.after?.["working-directory"] === "web" && j.after?.["continue-on-error"] === "true");
    ck(`deploy-web.yml: each of the four browser jobs (${legs.map((j) => j.name).join(", ")}) runs node e2e/widths.cjs in web/ in the step right after its run, with if: always() and continue-on-error (${printed.length} of ${legs.length})`,
      legs.length === 4 && printed.length === 4 && JSON.stringify(legs.map((j) => j.name)) === JSON.stringify(["test", "test-2", "test-installed", "test-2-installed"]), legs);
  }

  console.log("\n[AN] P-2.1, the order ticket (23 Nov 2026): an order sized as the plan's §2.1 says, its sizing price with its time, age and source, and a route that places nothing");
  {
    const S = pfSize, Z = { position: 0, usdjpy: null, kind: "AR" as const, capital: 100e6 };
    const tk = (x: Partial<pfSize.SizeIn> & Pick<pfSize.SizeIn, "side" | "by" | "value" | "lot" | "price" | "ccy" | "base">): pfSize.SizeOut => S.sizeOrder({ ...Z, ...x });
    const t1 = tk({ side: "buy", by: "shares", value: 1050, lot: 100, price: 2987, ccy: "JPY", base: "USD", usdjpy: 150 });
    ck("C-12: 1,050 shares of a Tokyo name are 1,000 (the 100-share lot, always down), 50 not placed", t1.ok && t1.qty === 1000 && t1.leftShares === 50 && t1.after === 1000 && t1.placedLocal === 2987000, t1);
    const t2 = tk({ side: "buy", by: "base", value: 1e6, lot: 1, price: 187.3, ccy: "USD", base: "USD" });
    ck("C-12: USD 1,000,000 of a US name at 187.30 is 5,339 shares (1,000,000 ÷ 187.30 = 5,339.03), USD 999,994.70 placed and USD 5.30 not placed", t2.ok && t2.qty === 5339 && t2.placedLocal === 999994.7 && t2.leftLocal === 5.3 && t2.leftShares === null, t2);
    const t3 = tk({ side: "buy", by: "pct", value: 2, lot: 100, price: 2987, ccy: "JPY", base: "USD", usdjpy: 150 });
    ck("P-A08: 2% of capital (USD 100m) in 7203.T at JPY 2,987 and USD/JPY 150.000: USD 2,000,000 = JPY 300,000,000 → 100,435.2 → 100,400 shares, JPY 105,200 not placed", t3.ok && t3.askedBase === 2e6 && t3.askedLocal === 3e8 && t3.qty === 100400 && t3.leftLocal === 105200, t3);
    const t4 = tk({ side: "buy", by: "bps", value: 50, lot: 100, price: 2987, ccy: "JPY", base: "JPY", kind: "RR", capital: 10e9 });
    const t4b = tk({ side: "short", by: "bps", value: 25, lot: 1, price: 187.3, ccy: "USD", base: "USD" });
    ck("P-A08: 50 bp of an RR book's NAV of JPY 10bn places JPY 50,000,000 (16,700 shares at 2,987, JPY 117,100 not placed); 25 bp of an AR book's capital of USD 100m is USD 250,000 (a short of 1,334 shares at 187.30)", t4.ok && t4.askedBase === 50e6 && t4.askedLocal === 50e6 && t4.qty === 16700 && t4.leftLocal === 117100
      && t4b.ok && t4b.askedBase === 250000 && t4b.qty === 1334 && t4b.after === -1334, { t4, t4b });
    const t5 = tk({ side: "buy", by: "active", value: 100, lot: 100, price: 2987, ccy: "JPY", base: "JPY", kind: "RR", capital: 10e9, weight: 2.5, bench: 2.0 });
    const t6 = tk({ side: "buy", by: "weight", value: 3, lot: 100, price: 2987, ccy: "JPY", base: "JPY", kind: "RR", capital: 10e9, weight: 2.5 });
    const t6s = tk({ side: "buy", by: "weight", value: 2, lot: 100, price: 2987, ccy: "JPY", base: "JPY", kind: "RR", capital: 10e9, weight: 2.5 });
    const t6a = tk({ side: "buy", by: "weight", value: 3, lot: 100, price: 2987, ccy: "JPY", base: "JPY", weight: 2.5 });
    ck(`P-A08: an RR book to an active weight of +100 bp, in a name with a benchmark weight of 2.0% held at 2.5%, buys JPY 50,000,000, to 3.0%; to a weight of 3.0% the same; to 2.0% is a sale, not a buy ("${!t6s.ok ? t6s.text : ""}"); an AR book has no weight to size to ("${!t6a.ok ? t6a.text : ""}")`, t5.ok && t5.askedBase === 50e6 && t6.ok && t6.askedBase === 50e6 && !t6s.ok && !t6a.ok, { t5, t6, t6s, t6a });
    // P21-1 (the check of P-2.1): a share count that is not whole was sized down and its remainder printed rounded ("10.5"
    // of NVDA read "1 shares not placed"); a share is not split, so the count is refused in words, here and on the server
    const f1 = tk({ side: "buy", by: "shares", value: 10.5, lot: 1, price: 187.3, ccy: "USD", base: "USD" }), f2 = tk({ side: "buy", by: "shares", value: 1050.5, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    const f3 = tk({ side: "short", by: "shares", value: 0.5, lot: 1, price: 187.3, ccy: "USD", base: "USD" }), f4 = tk({ side: "buy", by: "shares", value: 1050, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    ck(`a share count that is not whole is refused in words, not rounded: 10.5 of a US name ("${!f1.ok ? f1.text : ""}"), 1,050.5 of a Tokyo one ("${!f2.ok ? f2.text : ""}"), a short of 0.5; 1,050 is sized (1,000, 50 not placed)`,
      !f1.ok && f1.text === "Shares are whole numbers: 10.5 is not one." && !f2.ok && f2.text === "Shares are whole numbers: 1050.5 is not one." && !f3.ok && f3.text === "Shares are whole numbers: 0.5 is not one." && f4.ok && f4.qty === 1000 && f4.leftShares === 50, { f1, f2, f3, f4 });
    // P21-2: an RR book to a weight or an active weight (§2.1: A_b = (w* − w) × NAV, w* = w_bench + a*) at or below the
    // weight held: an underweight, a move to the benchmark and a weight of 0% are sales, an equal weight is nothing to do,
    // and a weight below 0% would be a short, which a long-only book does not hold. NAV JPY 10bn, a name at JPY 2,500.
    const RR = { kind: "RR" as const, capital: 10e9, lot: 100, price: 2500, ccy: "JPY" as const, base: "JPY" as const };
    const w1 = tk({ ...RR, side: "sell", by: "active", value: -50, position: 120000, weight: 3, bench: 3 }), w2 = tk({ ...RR, side: "sell", by: "active", value: 0, position: 120000, weight: 3, bench: 2.5 });
    const w3 = tk({ ...RR, side: "buy", by: "active", value: 0, position: 80000, weight: 2, bench: 2.5 }), w4 = tk({ ...RR, side: "sell", by: "weight", value: 0, position: 120000, weight: 3 });
    ck(`P21-2: an RR book sizes an underweight (−50 bp on a benchmark weight of 3.00%, held at 3.00%: JPY ${w1.ok ? w1.askedBase : "–"}, a sale of ${w1.ok ? w1.qty : "–"}), a move to the benchmark from above (a sale of ${w2.ok ? w2.qty : "–"}) and from below (a buy of ${w3.ok ? w3.qty : "–"}), and a weight of 0% (a sale of ${w4.ok ? w4.qty : "–"}, the whole 120,000)`,
      w1.ok && w1.askedBase === 50e6 && w1.qty === 20000 && w1.after === 100000 && w1.leftLocal === 0 && w2.ok && w2.qty === 20000 && w2.after === 100000 && w3.ok && w3.qty === 20000 && w3.after === 100000 && w4.ok && w4.askedBase === 300e6 && w4.qty === 120000 && w4.after === 0, { w1, w2, w3, w4 });
    const q1 = tk({ ...RR, side: "buy", by: "weight", value: 2.5, position: 100000, weight: 2.5 }), q2 = tk({ ...RR, side: "sell", by: "weight", value: 2.5, position: 100000, weight: 2.5 }), q3 = tk({ ...RR, side: "buy", by: "active", value: 0, position: 100000, weight: 2.5, bench: 2.5 });
    const q4 = tk({ ...RR, side: "buy", by: "active", value: -50, weight: 0, bench: 0.5 }), q5 = tk({ ...RR, side: "buy", by: "active", value: 10, position: 12000, weight: 0.3, bench: 0.2 });
    const m1 = tk({ ...RR, side: "buy", by: "active", value: -50, position: 120000, weight: 3, bench: 3 }), m2 = tk({ ...RR, side: "sell", by: "weight", value: 3, position: 80000, weight: 2 });
    const z1 = tk({ ...RR, side: "sell", by: "active", value: -50, position: 12000, weight: 0.3, bench: 0.3 }), z2 = tk({ ...RR, side: "sell", by: "weight", value: -1, position: 12000, weight: 0.3 }), z3 = tk({ ...RR, side: "buy", by: "weight", value: Number.NaN, weight: 0.3 });
    const nothing = "The name is held at 2.50%, the weight asked: nothing to do.", short = "would be a short: a relative-return book holds none, so 0% is its lowest weight.";
    ck(`P21-2: a weight equal to the one held is nothing to do, whichever the side ("${!q1.ok ? q1.text : ""}"), also by an active weight, out of the book at −(its benchmark weight), and at a figure's last bit (0.2% + 10 bp is 0.30000000000000004%); a side the other way says which it is ("${!m1.ok ? m1.text : ""}" · "${!m2.ok ? m2.text : ""}"); below 0% is refused ("${!z1.ok ? z1.text : ""}"); no figure, "${!z3.ok ? z3.text : ""}"`,
      !q1.ok && q1.text === nothing && !q2.ok && q2.text === nothing && !q3.ok && q3.text === nothing && !q4.ok && q4.text === "The name is held at 0.00%, the weight asked: nothing to do." && !q5.ok && q5.text === "The name is held at 0.30%, the weight asked: nothing to do."
      && !m1.ok && m1.text === "To 2.50% from 3.00% is a sale, not a buy." && !m2.ok && m2.text === "To 3.00% from 2.00% is a purchase, not a sale."
      && !z1.ok && z1.text === `A weight below 0% (the benchmark's 0.30% less 50 bp) ${short}` && !z2.ok && z2.text === `A weight below 0% ${short}` && !z3.ok && z3.text === "Enter a figure."
      && [q1, q2, q3, q4, q5].every((x) => !x.ok && !/purchase|sale/.test(x.text)), { q1, q2, q3, q4, q5, m1, m2, z1, z2, z3 });
    const c1 = tk({ side: "sell", by: "close", value: null, position: 1000, lot: 100, price: 2987, ccy: "JPY", base: "JPY" }), c2 = tk({ side: "cover", by: "close", value: null, position: -1300, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    const r1 = tk({ side: "sell", by: "reduce", value: 25, position: 1000, lot: 100, price: 2987, ccy: "JPY", base: "JPY" }), r2 = tk({ side: "sell", by: "reduce", value: 33, position: 1000, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    const r3 = tk({ side: "sell", by: "reduce", value: 50, position: 101, lot: 1, price: 187.3, ccy: "USD", base: "USD" }), r4 = tk({ side: "cover", by: "reduce", value: 29, position: -100, lot: 1, price: 187.3, ccy: "USD", base: "USD" });
    const c0 = tk({ side: "sell", by: "close", value: null, position: 0, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    ck(`Close is the whole position (a long of 1,000 sold, a short of 1,300 covered, both to zero); Reduce by x% is floor(x × |q| ÷ lot) lots: 25% of 1,000 Tokyo shares is 200, 33% is 300, 50% of 101 US shares is 50, 29% of a 100-share US short is 29; nothing to close is said ("${!c0.ok ? c0.text : ""}")`,
      c1.ok && c1.qty === 1000 && c1.after === 0 && c2.ok && c2.qty === 1300 && c2.after === 0 && r1.ok && r1.qty === 200 && r1.after === 800 && r2.ok && r2.qty === 300 && r3.ok && r3.qty === 50 && r3.after === 51 && r4.ok && r4.qty === 29 && r4.after === -71 && !c0.ok, { c1, c2, r1, r2, r3, r4, c0 });
    const x1 = tk({ side: "sell", by: "shares", value: 1500, position: 1000, lot: 100, price: 2987, ccy: "JPY", base: "JPY" }), x2 = tk({ side: "cover", by: "shares", value: 800, position: -500, lot: 1, price: 187.3, ccy: "USD", base: "USD" });
    ck(`P-A08: an order may not cross zero: selling 1,500 of a 1,000-share long is refused, with close and reverse as two orders, sell 1,000 then short 500 ("${!x1.ok ? x1.text : ""}"); covering 800 of a 500-share short likewise`, !x1.ok && x1.reverse?.close === 1000 && x1.reverse?.open === 500 && !x2.ok && x2.reverse?.close === 500 && x2.reverse?.open === 300, { x1, x2 });
    const sd = (p: number) => S.sidesFor(p).join(",");
    const s1 = tk({ side: "sell", by: "shares", value: 100, lot: 100, price: 2987, ccy: "JPY", base: "JPY" }), s2 = tk({ side: "short", by: "shares", value: 100, position: 1000, lot: 100, price: 2987, ccy: "JPY", base: "JPY" }), s3 = tk({ side: "buy", by: "shares", value: 100, position: -500, lot: 100, price: 2987, ccy: "JPY", base: "JPY" }), s4 = tk({ side: "cover", by: "shares", value: 100, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    ck(`the sides a position allows: none held, Buy and Short (${sd(0)}); a long, Buy and Sell (${sd(1000)}); a short, Short and Cover (${sd(-500)}); any other is refused in words ("${!s1.ok ? s1.text : ""}" · "${!s2.ok ? s2.text : ""}" · "${!s3.ok ? s3.text : ""}" · "${!s4.ok ? s4.text : ""}")`, sd(0) === "buy,short" && sd(1000) === "buy,sell" && sd(-500) === "short,cover" && !s1.ok && !s2.ok && !s3.ok && !s4.ok);
    const n1 = tk({ side: "buy", by: "base", value: 1e6, lot: 1, price: null, ccy: "USD", base: "USD" }), n2 = tk({ side: "buy", by: "shares", value: 250, lot: 1, price: null, ccy: "USD", base: "USD" }), n3 = tk({ side: "buy", by: "pct", value: 2, lot: 100, price: 2987, ccy: "JPY", base: "USD", usdjpy: null }), n4 = tk({ side: "buy", by: "local", value: 3e8, lot: 100, price: 2987, ccy: "JPY", base: "USD", usdjpy: null });
    const n5 = tk({ side: "buy", by: "base", value: 0, lot: 1, price: 187.3, ccy: "USD", base: "USD" }), n6 = tk({ side: "buy", by: "shares", value: Number.NaN, lot: 1, price: 187.3, ccy: "USD", base: "USD" }), n7 = tk({ side: "buy", by: "base", value: 1000, lot: 100, price: 2987, ccy: "JPY", base: "USD", usdjpy: 150 });
    ck(`nothing invented: with no usable price an amount is not sized ("${!n1.ok ? n1.text : ""}") but shares are, with no money beside them ("–"); a dollar amount of a yen name with no USD/JPY rate is not sized ("${!n3.ok ? n3.text : ""}"), an amount in the name's own currency needs none (C-12); zero or not a number is refused; less than a lot places nothing and leaves the whole amount (USD 1,000 = JPY 150,000 < one lot of JPY 298,700)`,
      !n1.ok && n2.ok && n2.qty === 250 && n2.placedLocal === null && n2.leftLocal === null && !n3.ok && n4.ok && n4.qty === 100400 && n4.leftLocal === 105200 && !n5.ok && !n6.ok && n7.ok && n7.qty === 0 && n7.leftLocal === 150000, { n1, n2, n3, n4, n7 });
    const j1 = tk({ side: "buy", by: "base", value: 15e6, lot: 1, price: 187.3, ccy: "USD", base: "JPY", usdjpy: 150 });
    ck("a yen book buying a US name by an amount in yen: JPY 15,000,000 at USD/JPY 150.000 is USD 100,000, 533 shares at 187.30, USD 169.10 not placed", j1.ok && j1.askedLocal === 100000 && j1.qty === 533 && j1.leftLocal === 169.1, j1);
    // what can be sized in this version, from the quote the Monitor reads
    const Q = (symbol: string, quoteType: string | null, currency: string | null, price: number | null = 100): pfSize.TicketQuote => ({ symbol, name: symbol, price, at: "2026-11-24T01:10:00Z", currency, exchange: null, quoteType, source: "Yahoo Finance, unofficial" });
    const tr = (s: string, q: pfSize.TicketQuote | null) => S.tradable(s, q);
    const ok7203 = tr("7203.T", Q("7203.T", "EQUITY", "JPY")), okSpy = tr("SPY", Q("SPY", "ETF", "USD")), okBrk = tr("BRK-B", Q("BRK-B", "EQUITY", "USD")), ok1306 = tr("1306.T", Q("1306.T", "ETF", "JPY"));
    const noFut = tr("ESZ26.CME", Q("ESZ26.CME", "FUTURE", "USD")), noIdx = tr("^N225", Q("^N225", "INDEX", "JPY")), noFx = tr("USDJPY=X", Q("USDJPY=X", "CURRENCY", "JPY")), noHk = tr("0005.HK", Q("0005.HK", "EQUITY", "HKD")), noQ = tr("NOPE", null), noCcy = tr("7203.T", Q("7203.T", "EQUITY", "USD"));
    ck(`US and Tokyo stocks and ETFs are sized (Tokyo in lots of 100, US names of 1); a future, an index, a currency, a name listed elsewhere, a symbol with no quote and a quote in another currency are each refused in words ("${[noFut, noIdx, noFx, noHk, noQ, noCcy].map((x) => (!x.ok ? x.text : "")).join("\" · \"")}")`,
      ok7203.ok && ok7203.venue === "TSE" && ok7203.lot === 100 && ok7203.ccy === "JPY" && okSpy.ok && okSpy.venue === "NYSE" && okSpy.lot === 1 && okBrk.ok && ok1306.ok && ok1306.lot === 100 && [noFut, noIdx, noFx, noHk, noQ, noCcy].every((x) => !x.ok && x.text.length > 20));
    // the sizing price: the latest print, with its time, its age and its source; too old to size on, it says so
    const hol = { TSE: ["2026-11-23"], NYSE: ["2026-11-26"], through: "2027-12-31", early: { NYSE: { "2026-11-27": 780 } } };
    const ag = (v: "TSE" | "NYSE", print: string, now: string) => S.printAge(v, print, at(now), hol);
    const a1 = ag("TSE", "2026-11-20T06:30:00Z", "2026-11-23T14:20:00Z"), a2 = ag("TSE", "2026-11-19T06:30:00Z", "2026-11-23T14:20:00Z");
    ck(`Tokyo shut for Labour Thanksgiving Day (Mon 23 Nov, 23:20 JST): Friday's 15:30 close sizes, ${a1.ageMin} minutes (${S.ageWords(a1.ageMin)}) old; Thursday's print is too old ("${a2.why}")`, !a1.tooOld && a1.ageMin === 4790 && S.ageWords(a1.ageMin) === "3 days" && a2.tooOld && !!a2.why, { a1, a2 });
    const b1 = ag("NYSE", "2026-11-20T21:00:00Z", "2026-11-23T14:50:00Z"), b2 = ag("NYSE", "2026-11-23T15:10:00Z", "2026-11-23T15:30:00Z"), b3 = ag("NYSE", "2026-11-20T21:00:00Z", "2026-11-23T15:30:00Z");
    ck(`New York open: in its first 30 minutes Friday's close still sizes; an hour in, a print 20 minutes old sizes and Friday's close is too old ("${b3.why}")`, !b1.tooOld && !b2.tooOld && b2.ageMin === 20 && b3.tooOld, { b1, b2, b3 });
    const d1 = ag("TSE", "2026-11-20T06:30:00Z", "2026-11-24T00:30:00Z"), d2 = ag("TSE", "2026-11-24T00:50:00Z", "2026-11-24T01:30:00Z"), d3 = ag("TSE", "2026-11-24T00:30:00Z", "2026-11-24T01:30:00Z");
    const d4 = ag("TSE", "2026-11-24T02:30:00Z", "2026-11-24T03:00:00Z"), d5 = ag("TSE", "2026-11-20T06:30:00Z", "2026-11-24T03:00:00Z"), d6 = ag("TSE", "2026-11-24T02:30:00Z", "2026-11-24T03:40:00Z");
    ck("Tokyo (its feed 20 minutes late): at 09:30 JST Friday's close still sizes; at 10:30 a print 40 minutes old sizes and one 60 minutes old is too old; in the lunch break the morning's 11:30 print sizes and Friday's does not; at 12:40 the 11:30 print still sizes", !d1.tooOld && !d2.tooOld && d3.tooOld && !d4.tooOld && d5.tooOld && !d6.tooOld, { d1, d2, d3, d4, d5, d6 });
    const e1 = ag("NYSE", "2026-11-27T18:00:00Z", "2026-11-27T19:00:00Z"), e2 = S.printAge("NYSE", "2026-11-27T18:00:00Z", at("2026-11-27T19:00:00Z"), { ...hol, early: undefined });
    ck("New York's half day (Fri 27 Nov, closed at 13:00 ET): at 14:00 ET the 13:00 print sizes; without the early close on record it would read as an hour old in session, too old", !e1.tooOld && e2.tooOld, { e1, e2 });
    ck(`the age in words: 20 min; 1 h 35 min; a whole hour with no "0 min" (${[60, 540, 61, 2879].map((x) => S.ageWords(x)).join(" · ")}); 3 days`, S.ageWords(20) === "20 min" && S.ageWords(95) === "1 h 35 min" && S.ageWords(60) === "1 h" && S.ageWords(540) === "9 h" && S.ageWords(61) === "1 h 1 min" && S.ageWords(2879) === "47 h 59 min" && S.ageWords(4790) === "3 days" && S.ageWords(0) === "0 min");
    // the route: sizes on the server's own quote, places and stores nothing, refuses in words
    let state: PfMemState = pfEmpty(), n = 0;
    const clock = at("2026-11-24T01:30:00Z");
    const store = pfMem({ load: () => state, save: (s2) => { state = s2; }, now: () => clock, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
    const quotes: Record<string, pfSize.TicketQuote> = { "7203.T": { ...Q("7203.T", "EQUITY", "JPY", 2987), name: "Toyota Motor", exchange: "Tokyo" }, "USDJPY=X": { ...Q("USDJPY=X", "CURRENCY", "JPY", 150), at: "2026-11-24T01:29:00Z" }, "9984.T": { ...Q("9984.T", "EQUITY", "JPY", 18000), at: "2026-11-20T01:12:00Z" }, "ESZ26.CME": Q("ESZ26.CME", "FUTURE", "USD", 6000) };
    const asked: string[][] = [];
    const deps: PfDeps = { on: true, store, now: () => clock, facts: () => Promise.resolve({ rates: { USD: null, JPY: null }, usdjpy: { rate: 158.4, d: "2026-11-20", source: "Yahoo Finance, unofficial" }, holidays: hol }), quotes: (syms) => { asked.push(syms); return Promise.resolve(Object.fromEntries(syms.map((s) => [s, quotes[s] ?? null]))); } };
    const call = async (who: string, action: string, body?: Record<string, unknown>, q: Record<string, string> = {}) => { const r = await pfRoute(deps, action, who, body ? "POST" : "GET", (k) => q[k] ?? null, body ?? {}); return { status: r.status, body: r.body as Record<string, unknown> & { error?: string; id?: string } }; };
    await call("a@x.test", "consent_agree", { version: 1 });
    const made = await call("a@x.test", "pf_create", { requestId: "request-0101", start: "ar-ls-gl", name: "Global L/S", values: pfForm.defaultRaw("ar-ls-gl", "USD") }), id = String(made.body.id);
    const kept = JSON.stringify(state);
    type TicketBody = { sized: pfSize.SizeOut | null; print: { price: number; at: string; source: string; ageMin: number; tooOld: boolean } | null; fx: { rate: number; at: string; source: string } | null; refusal: string | null; instrument: { venue: string; lot: number; ccy: string } | null; position: number; sides: string[]; note: string; book: { capital: number; base: string; kind: string } };
    const tkt = await call("a@x.test", "pf_ticket", undefined, { id, s: "7203.T", side: "buy", by: "pct", v: "2" }), tb = tkt.body as unknown as TicketBody;
    ck(`pf_ticket sizes on the server's quote: 2% of the book's capital in 7203.T is ${tb.sized?.ok ? tb.sized.qty : "–"} shares, JPY ${tb.sized?.ok ? tb.sized.leftLocal : "–"} not placed, at the print of ${tb.print?.at} (${tb.print?.ageMin} min old, ${tb.print?.source}) and USD/JPY ${tb.fx?.rate} of ${tb.fx?.at}; Tokyo ${(tb.instrument as { market?: string } | null)?.market}; it names no position (${tb.position}), the sides Buy and Short, and says placing comes next ("${tb.note}")`,
      tkt.status === 200 && tb.sized?.ok === true && tb.sized.qty === 100400 && tb.sized.leftLocal === 105200 && tb.print?.price === 2987 && tb.print.ageMin === 20 && !tb.print.tooOld && tb.print.source === "Yahoo Finance, unofficial" && tb.fx?.rate === 150 && tb.instrument?.lot === 100 && (tb.instrument as { market?: string }).market === "open" && tb.position === 0 && tb.sides.join() === "buy,short" && tb.note === pfWords.TICKET_NOTE && tb.book.capital === 100e6 && asked.some((a) => a.includes("7203.T") && a.includes("USDJPY=X")), tkt.body);
    ck("pf_ticket places and stores nothing: the store is as it was before the ticket, and its rows name no order", JSON.stringify(state) === kept && !/order/i.test(kept));
    const old = (await call("a@x.test", "pf_ticket", undefined, { id, s: "9984.T", side: "buy", by: "base", v: "1000000" })).body as unknown as TicketBody, oldShares = (await call("a@x.test", "pf_ticket", undefined, { id, s: "9984.T", side: "buy", by: "shares", v: "1050" })).body as unknown as TicketBody;
    const fut = (await call("a@x.test", "pf_ticket", undefined, { id, s: "ESZ26.CME" })).body as unknown as TicketBody, none = (await call("a@x.test", "pf_ticket", undefined, { id, s: "NOPE" })).body as unknown as TicketBody;
    const bare = (await call("a@x.test", "pf_ticket", undefined, { id, s: "7203.T" })).body as unknown as TicketBody;
    ck(`a print too old to size on says so and sizes no amount ("${old.sized && !old.sized.ok ? old.sized.text : ""}"), while shares still size, with no money beside them; a future and a symbol with no quote are refused in words; asked with no size, the ticket gives the price and sizes nothing`, old.print?.tooOld === true && old.sized?.ok === false && oldShares.sized?.ok === true && oldShares.sized.qty === 1000 && oldShares.sized.placedLocal === null
      && !!fut.refusal && fut.sized === null && !!none.refusal && none.print === null && bare.sized === null && bare.print?.price === 2987, { old: old.sized, fut: fut.refusal, none: none.refusal });
    const frac = (await call("a@x.test", "pf_ticket", undefined, { id, s: "7203.T", side: "buy", by: "shares", v: "1050.5" })).body as unknown as TicketBody, whole = (await call("a@x.test", "pf_ticket", undefined, { id, s: "7203.T", side: "buy", by: "shares", v: "1,050" })).body as unknown as TicketBody;
    ck(`P21-1: the server refuses a share count that is not whole too ("${frac.sized && !frac.sized.ok ? frac.sized.text : ""}"), and sizes 1,050 (${whole.sized?.ok ? whole.sized.qty : "–"}, ${whole.sized?.ok ? whole.sized.leftShares : "–"} not placed)`,
      frac.sized?.ok === false && frac.sized.text === "Shares are whole numbers: 1050.5 is not one." && frac.print?.price === 2987 && whole.sized?.ok === true && whole.sized.qty === 1000 && whole.sized.leftShares === 50, { frac: frac.sized, whole: whole.sized });
    const odd = (await call("a@x.test", "pf_ticket", undefined, { id, s: "7203.T", side: "buy", by: "everything", v: "2" })).body as unknown as TicketBody, oddSide = S.sizeOrder({ ...Z, side: "hold" as pfSize.Side, by: "shares", value: 100, lot: 100, price: 2987, ccy: "JPY", base: "JPY" });
    ck(`a way of sizing or a side the engine does not know sizes nothing: the route answers the price alone, and the engine says so ("${!oddSide.ok ? oddSide.text : ""}")`, odd.sized === null && odd.print?.price === 2987 && !oddSide.ok, { odd: odd.sized, oddSide });
    const otherAcct = await call("b@x.test", "pf_ticket", undefined, { id, s: "7203.T" }), badSym = await call("a@x.test", "pf_ticket", undefined, { id, s: "  " }), noId = await call("a@x.test", "pf_ticket", undefined, { s: "7203.T" });
    const noQuotes = await pfRoute({ ...deps, quotes: undefined }, "pf_ticket", "a@x.test", "GET", (k) => ({ id, s: "7203.T" } as Record<string, string>)[k] ?? null, {});
    ck(`another account's book is no such portfolio (${otherAcct.status}), a symbol that is not one is refused (${badSym.status} "${badSym.body.error}"), no book named is no such portfolio (${noId.status}); a server with no quote reader says so (${noQuotes.status})`, otherAcct.status === 404 && otherAcct.body.error === pfWords.NO_SUCH && badSym.status === 400 && noId.status === 404 && noQuotes.status === 503);
  }

  console.log("\n[AO] Tokyo's daily price limits (the limit chip, slice L-1, 24 Nov 2026): JPX's 34 bands and every edge, the worked bases, a print's state and each reason for no chip, the page's copy, pf_jpx's compare mode");
  {
    // The rule of C/limit-chip-plan.md §1, one pure file (supabase/functions/_shared/rules/pricelimit.ts) that the page
    // gets a copy of. Every figure is from a read: the table as pf_jpx printed JPX's page on 21 Nov 2026 (the 34 lines
    // below, as C/probes/pf_jpx.log l.93-126 holds them), JPX's own example (a close of 1,000 yen: limits 700 and 1,300),
    // A's and D's worked bases, and the normal sides of JPX's notices of broadened limits (C/limit-chip-source.md §1.3).
    // Misses are allowed, a false chip is not: each case below that cannot be known gives no chip, with its reason.
    const LOGGED = ["Less than | 100 | &plusmn;30", "Less than | 200 | 50", "Less than | 500 | 80", "Less than | 700 | 100", "Less than | 1,000 | 150", "Less than | 1,500 | 300", "Less than | 2,000 | 400", "Less than | 3,000 | 500", "Less than | 5,000 | 700", "Less than | 7,000 | 1,000", "Less than | 10,000 | 1,500", "Less than | 15,000 | 3,000", "Less than | 20,000 | 4,000", "Less than | 30,000 | 5,000", "Less than | 50,000 | 7,000", "Less than | 70,000 | 10,000", "Less than | 100,000 | 15,000",
      "Less than | 150,000 | 30,000", "Less than | 200,000 | 40,000", "Less than | 300,000 | 50,000", "Less than | 500,000 | 70,000", "Less than | 700,000 | 100,000", "Less than | 1 million | 150,000", "Less than | 1.5 million | 300,000", "Less than | 2 million | 400,000", "Less than | 3 million | 500,000", "Less than | 5 million | 700,000", "Less than | 7 million | 1 million", "Less than | 10 million | 1.5 million", "Less than | 15 million | 3 million", "Less than | 20 million | 4 million", "Less than | 30 million | 5 million", "Less than | 50 million | 7 million", "50 million or more |  | 10 million"];
    const cells = (l: string) => l.split("|").map((c) => c.trim()), read = pl.readLimitTable(LOGGED.map(cells)), T = pl.LIMIT_TABLE;
    ck(`the module's table is the probe's 34 printed rows, read by its own parser (${read.length} read, ${T.length} held, ${pl.compareLimitTable(read).length} rows differ): "less than X" with its width, the last "50 million or more" ±10 million, with its source (${pl.LIMIT_SOURCE})`, read.length === 34 && T.length === 34 && pl.compareLimitTable(read).length === 0 && T[0].below === 100 && T[0].width === 30 && T[33].below === null && T[33].width === 10_000_000 && pl.LIMIT_SOURCE === "JPX daily price limits, read 21 Nov 2026 (page of 20 Nov) · personal use" && pl.LIMIT_PAGE === "https://www.jpx.co.jp/english/equities/trading/domestic/06.html", read.slice(0, 3));
    const changed = LOGGED.map((l, i) => (i === 12 ? "Less than | 20,000 | 4,500" : l)), dropped = LOGGED.filter((_, i) => i !== 19);
    const diffs = pl.compareLimitTable(pl.readLimitTable(changed.map(cells))), short = pl.compareLimitTable(pl.readLimitTable(dropped.map(cells)));
    ck(`a page that differs is named row by row, values only: a width changed (${diffs.join("; ")}), a row gone (${short.slice(0, 2).join("; ")})`, diffs.length === 1 && /row 13/.test(diffs[0]) && /20,000/.test(diffs[0]) && /4,500/.test(diffs[0]) && /4,000/.test(diffs[0]) && short.length >= 1 && /33/.test(short[0]) && /34/.test(short[0]), { diffs, short });
    const once = T.map((b, i) => (b.confirmed ? 0 : i + 1)).filter((n) => n > 0);
    ck(`17 bands rest on the probe's one read and give no chip until a second read agrees (P-L1): rows ${once.join(", ")}`, JSON.stringify(once) === JSON.stringify([13, 14, 16, 18, 19, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]), once);
    // each bound, the width just under it and at it, written out from the log, not from the module
    const EDGES: Array<[number, number, number]> = [[100, 30, 50], [200, 50, 80], [500, 80, 100], [700, 100, 150], [1_000, 150, 300], [1_500, 300, 400], [2_000, 400, 500], [3_000, 500, 700], [5_000, 700, 1_000], [7_000, 1_000, 1_500], [10_000, 1_500, 3_000], [15_000, 3_000, 4_000], [20_000, 4_000, 5_000], [30_000, 5_000, 7_000], [50_000, 7_000, 10_000], [70_000, 10_000, 15_000], [100_000, 15_000, 30_000],
      [150_000, 30_000, 40_000], [200_000, 40_000, 50_000], [300_000, 50_000, 70_000], [500_000, 70_000, 100_000], [700_000, 100_000, 150_000], [1e6, 150_000, 300_000], [1.5e6, 300_000, 400_000], [2e6, 400_000, 500_000], [3e6, 500_000, 700_000], [5e6, 700_000, 1e6], [7e6, 1e6, 1.5e6], [10e6, 1.5e6, 3e6], [15e6, 3e6, 4e6], [20e6, 4e6, 5e6], [30e6, 5e6, 7e6], [50e6, 7e6, 10e6]];
    const edgeMiss = EDGES.filter(([x, lo, hi]) => pl.limitBand(x - 0.1)?.width !== lo || pl.limitBand(x)?.width !== hi || (x >= 1_000 && pl.limitBand(x - 1)?.width !== lo)).map(([x]) => x);
    ck(`every band's edge, ${EDGES.length} bounds: just under a bound the band below, at it the next ("less than" is strict: 99.9 -> ±30 and 100 -> ±50, 999.9 -> ±150 and 1,000 -> ±300, … 49,999,999 -> ±7 million and 50,000,000 -> ±10 million); ${edgeMiss.length} wrong; no band for a base of 0 or less`, EDGES.length === 33 && edgeMiss.length === 0 && pl.limitBand(0) === null && pl.limitBand(-5) === null && pl.limitBand(Number.NaN) === null, edgeMiss);
    const near = (a: number | null | undefined, b: number | null) => (a == null || b === null ? a == null && b === null : Math.abs(a - b) < 1e-6);
    const WORKED: Array<[number, number, number | null, string]> = [[1_000, 1_300, 700, "JPX's example"], [3_456, 4_156, 2_756, "A"], [99, 129, 69, "A"], [100, 150, 50, "A"], [4_999, 5_699, 4_299, "A"], [5_000, 6_000, 4_000, "A"], [587.3, 687.3, 487.3, "A"], [2_987, 3_487, 2_487, "D"]];
    const SIDES: Array<[number, "upper" | "lower", number, string]> = [[7_310, "lower", 5_810, "3131, 20261112-01"], [3_835, "lower", 3_135, "6989, 20261112-01"], [526, "lower", 426, "20261116-01"], [518, "lower", 418, "20261119-01"], [372, "upper", 452, "20261109-01"], [117, "lower", 67, "May 2026"]];
    const wrong = [...WORKED.filter(([b, u, l]) => !near(pl.limitsOf(b)?.upper, u) || !near(pl.limitsOf(b)?.lower, l)).map(([b, , , who]) => `${b} (${who})`), ...SIDES.filter(([b, side, v]) => !near(pl.limitsOf(b)?.[side], v)).map(([b, , , n]) => `${b} (${n})`)];
    ck(`the worked bases give their limits with plain arithmetic, base ± width: JPX's 1,000 -> 700 and 1,300; A's 3,456 -> 2,756–4,156, 99 -> 69–129, 100 -> 50–150, 4,999 -> 4,299–5,699, 5,000 -> 4,000–6,000, 587.3 -> 487.3–687.3; D's 2,987 -> 2,487–3,487; the notices' normal sides 7,310 -> 5,810, 3,835 -> 3,135, 526 -> 426, 518 -> 418, 372 -> 452, 117 -> 67 (${wrong.length} wrong)`, wrong.length === 0, wrong);
    ck(`a base of 30 yen or less has no lower limit the Monitor knows (30 − 30 is 0 yen): 30 -> upper 60, lower none; 31 -> 1–61; 12 -> upper 42, lower none`, near(pl.limitsOf(30)?.upper, 60) && pl.limitsOf(30)?.lower === null && near(pl.limitsOf(31)?.lower, 1) && near(pl.limitsOf(12)?.upper, 42) && pl.limitsOf(12)?.lower === null, [pl.limitsOf(30), pl.limitsOf(31)]);

    // A print of Tue 24 Nov 2026, 10:12 JST (01:12 UTC), read at 10:40 JST; its base is the close of Fri 20 Nov (Mon 23 Nov
    // is a holiday). The lists and holidays are the test's own: 9990.T is the local copy's stand-in name, in neither list
    const MEMBERS: ReadonlySet<string> = new Set(["7203.T", "6758.T", "9984.T"]), HOL: ReadonlySet<string> = new Set(["2026-03-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-11-03", "2026-11-23", "2026-12-31", "2027-01-01"]);
    const input = (o: Partial<pl.LimitInput> = {}): pl.LimitInput => ({ symbol: "7203.T", members: MEMBERS, price: 4_156, at: "2026-11-24T01:12:00Z", high: 4_156, low: 3_400, base: 3_456, baseDay: "2026-11-20", quotePrev: 3_456, prevVolume: 18_200_000, prevLastAt: "2026-11-20T06:30:00Z", run: 0, holidays: HOL, now: new Date("2026-11-24T01:40:00Z"), ...o });
    const st = (o: Partial<pl.LimitInput> = {}) => pl.limitState(input(o));
    const up = st(), down = st({ price: 2_756, high: 3_500, low: 2_756 }), in1 = st({ price: 4_155, high: 4_155 }), in01 = st({ price: 4_155.9, high: 4_155.9 }), inDn = st({ price: 2_757, high: 3_500, low: 2_757 });
    ck(`a last trade at the upper limit is LIMIT UP, at the lower LIMIT DOWN, and one tick inside either is none (base 3,456 ± 700 = ${up.lower}–${up.upper}: ${up.side}, ${down.side}; 4,155 ${in1.side}, 4,155.9 ${in01.side}, 2,757 ${inDn.side}); the state carries the base, its session, the print's session and time`,
      up.side === "up" && up.why === null && up.upper === 4_156 && up.lower === 2_756 && up.width === 700 && up.base === 3_456 && up.baseDay === "2026-11-20" && up.day === "2026-11-24" && up.at === "2026-11-24T01:12:00Z" && up.price === 4_156 && up.closed === false
      && down.side === "down" && down.why === null && [in1, in01, inDn].every((x) => x.side === null && x.why === null && x.upper === 4_156), { up, down, in1 });
    const noisy = st({ symbol: "6758.T", base: 306.2, quotePrev: 306.20001220703125, price: 386.20001220703125, high: 386.20001220703125, low: 300 }), noisyBase = st({ base: 386.20001220703125, quotePrev: 386.2, price: 466.2, high: 466.2, low: 390 });
    ck(`Yahoo's float noise is no difference (1306.T's close printed as 386.20001220703125): a last of 386.20001220703125 is the upper limit 386.2 of a base of 306.2 (${noisy.side}), and a base so printed gives its limit to 466.2 (${noisyBase.side}); equal means within ${pl.EQUAL_YEN} yen, half the finest tick`, noisy.side === "up" && noisy.why === null && noisyBase.side === "up" && pl.EQUAL_YEN === 0.05, { noisy, noisyBase });
    const grid = (p: number) => st({ base: 2_999, quotePrev: 2_999, price: p, high: p, low: 2_900 }), g3500 = grid(3_500), g3495 = grid(3_495), g3499 = grid(3_499);
    ck(`a limit between ticks is a miss, never a false chip: 2,999 + 500 = 3,499 (no read says how JPX sets a limit off the tick grid): a last of 3,500 is beyond the computed limit (${g3500.why}), 3,495 is none (${g3495.side}, ${g3495.why}); only 3,499 itself is LIMIT UP (${g3499.side})`, g3500.side === null && g3500.why === "beyond" && g3495.side === null && g3495.why === null && g3499.side === "up", { g3500, g3495 });
    const b30 = (p: number) => st({ base: 30, quotePrev: 30, price: p, high: Math.max(p, 30), low: Math.min(p, 30) }), b30up = b30(60), b30lo = b30(1);
    ck(`a base of 30 yen never gives LIMIT DOWN (a last of 1 yen: ${b30lo.side}, ${b30lo.why}; lower ${b30lo.lower}) and gives LIMIT UP at 60 (${b30up.side})`, b30up.side === "up" && b30up.lower === null && b30lo.side === null && b30lo.why === null);

    // each reason for no chip, on its own case; each case is at the upper limit unless it says otherwise
    const NOT_PLACED = ["NVDA", "1306.T", "1321.T", "8951.T", "9990.T", "7203", "7203.t"].map((s) => [s, st({ symbol: s })] as const);
    ck(`not-placed: a name that is not a .T member of the Monitor's Nikkei 225 or TOPIX lists gets no chip at its limit (a US name; the ETFs 1306.T, TOPIX's proxy, and 1321.T; the REIT 8951.T; a .T name outside both lists; a code without its .T): ${NOT_PLACED.map(([s, x]) => `${s} ${x.why}`).join(", ")}`, NOT_PLACED.every(([, x]) => x.side === null && x.why === "not-placed"), NOT_PLACED);
    const noPrint = [st({ price: null }), st({ price: 0 }), st({ at: null }), st({ at: "not a time" }), st({ at: "2026-11-23T01:12:00Z", baseDay: "2026-11-20" }), st({ at: "2026-11-22T01:12:00Z" })];
    ck(`no-print: no last price, a price of 0, no time, a time that is none, a print dated on a holiday (Mon 23 Nov) or a Sunday: ${noPrint.map((x) => x.why).join(", ")}`, noPrint.every((x) => x.side === null && x.why === "no-print"), noPrint.map((x) => x.why));
    const noBase = [st({ base: null }), st({ base: 0 }), st({ baseDay: "2026-11-19" }), st({ baseDay: null }), st({ at: "2026-11-25T01:12:00Z", now: new Date("2026-11-25T01:40:00Z") })];
    ck(`no-base: no booked close, a close of 0, a booked close of an older session than the one before the print's (19 Nov: the stats job did not book 20 Nov), none dated, a print of 25 Nov on 20 Nov's close: ${noBase.map((x) => x.why).join(", ")}`, noBase.every((x) => x.side === null && x.why === "no-base"), noBase.map((x) => x.why));
    const doubt = { split: st({ quotePrev: 1_728 }), off05: st({ quotePrev: 3_456.05 }), auction: st({ prevLastAt: "2026-11-20T05:52:00Z" }), older: st({ prevLastAt: "2026-11-19T06:30:00Z" }), unknownAt: st({ prevLastAt: null }), noTrade: st({ prevVolume: 0 }), unknownVol: st({ prevVolume: null }) };
    const fine = { off04: st({ quotePrev: 3_456.04 }), noQuote: st({ quotePrev: undefined }), atBell: st({ prevLastAt: "2026-11-20T06:30:00Z" }) };
    ck(`base-in-doubt: Yahoo's previous close against the booked one (a 1:2 split Yahoo adjusts, 1,728 against 3,456; 0.05 yen off), the previous session's last trade before the 15:30 closing auction (14:52 JST) or on an earlier day or not known, its volume 0 (no trade: the base is then JPX's special quote) or not known: ${Object.entries(doubt).map(([k, x]) => `${k} ${x.why}`).join(", ")}; within 0.05, no previous close to set against, a last trade at 15:30 JST: ${Object.entries(fine).map(([k, x]) => `${k} ${x.side}`).join(", ")}`,
      Object.values(doubt).every((x) => x.side === null && x.why === "base-in-doubt") && Object.values(fine).every((x) => x.side === "up" && x.why === null), { doubt, fine });
    const unadjusted = st({ price: 1_750, high: 1_800, low: 1_700 });
    ck(`a split that Yahoo's previous close does not show either: the last, near half the base, is beyond the computed limits (${unadjusted.why}), so no chip`, unadjusted.side === null && unadjusted.why === "beyond");
    const onDay = (day: string, baseDay: string, hol: ReadonlySet<string> = HOL) => st({ at: `${day}T01:12:00Z`, baseDay, prevLastAt: `${baseDay}T06:30:00Z`, now: new Date(`${day}T01:40:00Z`), holidays: hol });
    const noDec31 = new Set([...HOL].filter((d) => d !== "2026-12-31"));
    const EX: Array<[string, string, string | null, string]> = [["2026-11-27", "2026-11-26", "ex-day", "Fri 27 Nov"], ["2026-11-26", "2026-11-25", null, "Thu 26 Nov"], ["2026-11-30", "2026-11-27", null, "Mon 30 Nov"], ["2026-12-29", "2026-12-28", "ex-day", "Tue 29 Dec (Thu 31 Dec is a market holiday)"], ["2026-12-30", "2026-12-29", null, "Wed 30 Dec"], ["2026-03-30", "2026-03-27", "ex-day", "Mon 30 Mar (7203.T's dividend went ex)"], ["2026-09-29", "2026-09-28", "ex-day", "Tue 29 Sep (7203.T's)"]];
    const exGot = EX.map(([d, b, want, name]) => { const x = onDay(d, b); return { name, ok: x.why === want && (want ? x.side === null : x.side === "up"), why: x.why }; }), shifted = onDay("2026-12-30", "2026-12-29", noDec31);
    ck(`ex-day: the TSE's second-to-last business day of a month, where month-end record dates put dividends and splits ex and JPX's base takes the forecast dividend off: ${exGot.map((x) => `${x.name} ${x.why ?? "chip"}`).join("; ")}; the holiday rows decide it (without 31 Dec, Wed 30 Dec would be: ${shifted.why})`, exGot.every((x) => x.ok) && shifted.why === "ex-day", exGot);
    ck(`the TSE's sessions from the holiday rows: the session before Tue 24 Nov is Fri 20 Nov, before Mon 4 Jan 2027 Wed 30 Dec 2026; a print's session is its date in Tokyo (${pl.tseDay("2026-11-23T15:30:00Z")} for 00:30 JST on 24 Nov)`, pl.prevSession("2026-11-24", HOL) === "2026-11-20" && pl.prevSession("2027-01-04", HOL) === "2026-12-30" && pl.tseDay("2026-11-23T15:30:00Z") === "2026-11-24" && pl.tseDay("2026-11-24T14:59:00Z") === "2026-11-24" && pl.exDay("2026-11-27", HOL) && !pl.exDay("2026-11-30", HOL));
    const s = (closes: Array<number | null>, vols: Array<number | null> = []) => pl.limitRun(closes.map((close, i) => ({ close, volume: vols[i] ?? null })));
    const RUNS: Array<[string, number, (n: number) => boolean]> = [["no limit close", s([1_000, 1_000, 1_000]), (n) => n === 0], ["one limit close (1,000 -> 1,300)", s([1_000, 1_000, 1_300]), (n) => n === 1], ["two in a row (-> 1,300 -> 1,600)", s([1_000, 1_000, 1_300, 1_600]), (n) => n === 2], ["down, the second beyond its own limit (-> 700 -> 400)", s([1_000, 1_000, 700, 400]), (n) => n === 2],
      ["a limit close then a session without a trade", s([1_000, 1_000, 1_300, 1_300], [5e5, 5e5, 5e5, 0]), (n) => n === 2], ["a close beyond its normal limit (1,000 -> 2,200: broadened already)", s([1_000, 1_000, 1_000, 2_200]), (n) => n >= 2], ["a limit close whose session before the series does not reach", s([1_000, 1_300]), (n) => n >= 2], ["no close before it", s([1_300]), (n) => n >= 2], ["a session not booked", s([1_000, null, 1_300]), (n) => n >= 2], ["an ordinary close after a short series", s([1_000, 1_100]), (n) => n === 0]];
    ck(`limitRun: the sessions in a row, ending with the last, that closed at or beyond their own limit or had no trade; one the series cannot tell counts as one: ${RUNS.map(([n, v]) => `${n} ${v}`).join("; ")}`, RUNS.every(([, v, ok]) => ok(v)), RUNS.map(([n, v]) => [n, v]));
    const runs = { two: st({ run: 2 }), downTwo: st({ run: -2 }), unknown: st({ run: null }), one: st({ run: 1 }) };
    ck(`run: two sessions in a row before the print's at their limit or without a trade, or not known, and the limit may be broadened, which the Monitor does not draw: no chip (${runs.two.why}, ${runs.downTwo.why}, ${runs.unknown.why}); a single limit day is no run (${runs.one.side})`, runs.two.why === "run" && runs.downTwo.why === "run" && runs.unknown.why === "run" && runs.two.side === null && runs.one.side === "up" && runs.one.why === null);
    const beyond = { high: st({ high: 4_200 }), low: st({ low: 2_700 }), last: st({ price: 4_160, high: 4_160 }), broadened: st({ base: 7_310, quotePrev: 7_310, price: 13_310, high: 13_310, low: 7_310 }) };
    ck(`beyond: the last, the day's high or its low outside the computed limits means the Monitor's base or width is not JPX's that day: no chip (${Object.entries(beyond).map(([k, x]) => `${k} ${x.why}`).join(", ")}; 13,310 is the broadened upper limit of JPX's notice 20261112-01 for a base of 7,310, against a computed 8,810)`, Object.values(beyond).every((x) => x.side === null && x.why === "beyond") && beyond.broadened.upper === 8_810, beyond);
    const once17 = st({ base: 17_000, quotePrev: 17_000, price: 21_000, high: 21_000, low: 16_000 }), twice = st({ base: 12_000, quotePrev: 12_000, price: 15_000, high: 15_000, low: 11_000 }), twice40 = st({ base: 40_000, quotePrev: 40_000, price: 47_000, high: 47_000, low: 39_000 });
    ck(`unconfirmed: a base in a band read once (17,000, ±4,000) gives no chip (${once17.why}); bands read twice do (12,000 -> 15,000 ${twice.side}; 40,000 -> 47,000 ${twice40.side})`, once17.side === null && once17.why === "unconfirmed" && twice.side === "up" && twice40.side === "up");
    const perBand = T.map((b, k) => { const lo = k === 0 ? 50 : (T[k - 1].below as number), x = st({ base: lo, quotePrev: lo, price: lo + b.width, high: lo + b.width, low: lo }); return { row: k + 1, read: b.confirmed ? "twice" : "once", side: x.side, why: x.why, ok: b.confirmed ? x.side === "up" && x.why === null : x.side === null && x.why === "unconfirmed" }; });
    ck(`each of the 34 bands at its lowest base, the last at its upper limit: the ${perBand.filter((r) => r.read === "twice").length} read twice give LIMIT UP, the ${perBand.filter((r) => r.read === "once").length} read once none ("unconfirmed"); ${perBand.filter((r) => !r.ok).length} otherwise`, perBand.length === 34 && perBand.every((r) => r.ok), perBand.filter((r) => !r.ok));
    const fri = { at: "2026-11-20T06:30:00Z", baseDay: "2026-11-19", prevLastAt: "2026-11-19T06:30:00Z" };
    const monday = st({ ...fri, now: new Date("2026-11-23T23:50:00Z") }), live = st({ ...fri, at: "2026-11-20T04:00:00Z", now: new Date("2026-11-20T05:00:00Z") }), midday = st({ at: "2026-11-24T02:30:00Z", now: new Date("2026-11-24T03:00:00Z") }), bell = st({ now: new Date("2026-11-24T06:30:00Z") });
    ck(`closed: a 20 Nov print read on Tue 24 Nov before Tokyo's first print (Mon 23 Nov a holiday) keeps its chip as "closed at" 20 Nov (${monday.side}, closed ${monday.closed}, ${monday.day}); in its own session it is not closed (${live.closed}); the 11:30 print keeps its chip in the midday break, not closed (${midday.side}, ${midday.closed}); from 15:30 JST it is (${bell.closed})`, monday.side === "up" && monday.closed && monday.day === "2026-11-20" && !live.closed && live.side === "up" && midday.side === "up" && !midday.closed && bell.closed && bell.side === "up", { monday, midday });
    const src = readText(new URL("../supabase/functions/_shared/rules/pricelimit.ts", import.meta.url), "utf8");
    ck("the rule's file is pure: it imports nothing and reads no clock, network or store (the moment, the lists and the holidays are handed in)", !/^\s*(?:import|export\s[^\n]*\sfrom)\s/m.test(src) && !/new Date\(\s*\)|Date\.now\(|fetch\(|Deno\.|process\./.test(src));
    const cp = pageCopy("rules", ["limitrow.ts"]);
    ck(`the page's copy of the rules (web/src/lib/rules/, ${cp.copies.length} file) is the server's files (supabase/functions/_shared/rules/) under one line that says so, as the paper engine's is: the stand-in rows and the server reach the same state (limitrow.ts, since L-2, is the server's alone)`, cp.files.join() === "pricelimit.ts" && cp.copies.join() === cp.files.join() && cp.differs.length === 0, cp);

    // pf_jpx's compare mode (P-L1, and the weekly re-read once L-1 merges): JPX's robots.txt and the daily price limits
    // page, nothing else, run offline with its fetch replaced. The page carries the table as JPX printed it on 21 Nov,
    // and a table of one row of prose before it, as JPX's has (its words here are the test's own)
    const PROSE = "A line of prose stands here as on the page, with its references (1) and (2) only.";
    const realFetch = globalThis.fetch;
    const compareRun = async (tag: string, rows: string[]): Promise<{ out: string; asked: string[] }> => {
      const html = `<html><head><title>Daily Price Limits | Trading Rules of Domestic Stocks | Japan Exchange Group</title></head><body><table><tr><td>${PROSE}</td><td></td></tr></table><table><tr><th>Previous Day's Closing Price/Special Quote (yen)</th><th>Daily Price Limits (yen)</th></tr>${rows.map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
      const asked: string[] = [], lines: string[] = [], log = console.log;
      globalThis.fetch = (async (input: unknown) => { const u = String(input), p = u.replace("https://www.jpx.co.jp", ""); asked.push(u); const body = p === "/robots.txt" ? "User-agent: *\nDisallow:\n" : p === "/english/equities/trading/domestic/06.html" ? html : null; return new Response(body ?? "not found", { status: body ? 200 : 404, headers: { "content-type": p === "/robots.txt" ? "text/plain" : "text/html" } }); }) as typeof fetch;
      (globalThis as { __probeOffline?: boolean }).__probeOffline = true;
      console.log = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
      try { await import(`../jobs/probes/pf_jpx.ts?compare=${tag}`); } catch (e) { lines.push(`THE PROBE STOPPED: ${e instanceof Error ? e.message : String(e)}`); }
      finally { console.log = log; globalThis.fetch = realFetch; delete (globalThis as { __probeOffline?: boolean }).__probeOffline; probe.restoreHolds(); }
      return { out: lines.join("\n"), asked };
    };
    const same = await compareRun("same", LOGGED), moved = await compareRun("moved", changed), gone = await compareRun("gone", dropped);
    const LIMITS_PAGE = "https://www.jpx.co.jp/english/equities/trading/domestic/06.html", allAsked = [same, moved, gone].flatMap((r) => r.asked);
    ck(`pf_jpx's compare mode (the file's default since L-1) asks JPX's robots.txt and the daily price limits page only (${same.asked.length} requests: ${same.asked.map((u) => u.replace("https://www.jpx.co.jp", "")).join(", ")}), prints the table's head in full and "same" when the page's 34 rows are the module's, with the one-read rows this read confirms`,
      JSON.stringify(same.asked) === JSON.stringify(["https://www.jpx.co.jp/robots.txt", LIMITS_PAGE]) && allAsked.every((u) => jpxRead.onJpx(u)) && /Previous Day's Closing Price\/Special Quote \(yen\) \| Daily Price Limits \(yen\)/.test(same.out) && /\bsame\b/.test(same.out) && /13, 14, 16, 18, 19, 21, 22, 24/.test(same.out) && /requests made:/.test(same.out) && !/THE PROBE STOPPED|DIFFERS/.test(same.out), same.out.split("\n").slice(-12));
    ck("and where the page differs, each row that differs, values only (a width changed: row 13, 4,500 on the page against the Monitor's 4,000; a row gone: 33 rows against 34); the prose of the page's other table is not printed, only its size and figures", /DIFFERS/.test(moved.out) && /row 13[^\n]*20,000[^\n]*4,500[^\n]*4,000/.test(moved.out) && !/\bsame\b/.test(moved.out) && /DIFFERS/.test(gone.out) && /33[^\n]*34/.test(gone.out) && ![same, moved, gone].some((r) => r.out.includes("A line of prose") || r.out.includes("stands here")) && /\(1\) and \(2\)|\(1\)/.test(same.out), { moved: moved.out.split("\n").filter((l) => /DIFFERS|row 13/.test(l)), gone: gone.out.split("\n").filter((l) => /DIFFERS|33/.test(l)) });
  }

  console.log("\n[AP] the limit chip's inputs on the server (slice L-2, 24 Nov 2026): what the jobs keep with each quote and close, a row's print as the rule's input, the field a row carries only at a limit, and a database without the new columns read and written as before");
  {
    // C/limit-chip-plan.md, L-2 (supabase/functions/_shared/rules/limitrow.ts, the server's alone). The lists and holidays
    // are the test's own, as in [AO]; every price is set by the table's own arithmetic (base ± width), no real stock's.
    const HOL: ReadonlySet<string> = new Set(["2026-03-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-11-03", "2026-11-23", "2026-12-31", "2027-01-01"]);
    const MEMBERS: ReadonlySet<string> = new Set(["7203.T", "6758.T", "9984.T"]), NOW = new Date("2026-11-24T01:40:00Z");
    const ctx = (now: Date = NOW): lr.LimitCtx => ({ members: MEMBERS, holidays: HOL, now });
    const tokyo = (iso: string) => pl.tseDay(iso), ny = (iso: string) => srv.localDate("America/New_York", Date.parse(iso) / 1000);
    // 7203.T at Fri 20 Nov's close as the statistics job booked it (base 3,456; the close before, 3,400, inside its limits) and
    // the quote of Tue 24 Nov 10:12 JST at 3,456 + 700 (Mon 23 Nov is a holiday): the first quote of the session moved
    // Friday's closing quote (18.2m shares at 15:30 JST) into prev_*
    const FRI = { symbol: "7203.T", d: "2026-11-20", close: 3_456, prev: 3_400, lim_run: 0, lim_d: "2026-11-19", q_price: 3_456, q_prev: 3_400, q_time: "2026-11-20T06:30:00Z", q_high: 3_470, q_low: 3_390, volume: 18_200_000, prev_vol: 15_000_000, prev_qt: "2026-11-19T06:30:00Z", prev2_vol: 14_000_000 };
    const TUE = { q_price: 4_156, q_prev: 3_456, q_time: "2026-11-24T01:12:00Z", q_high: 4_156, q_low: 3_500, volume: 5_000_000 };
    const shifted = lr.shiftPrev(FRI, TUE.q_time, tokyo), ROW: lr.LimitStat = { ...FRI, ...TUE, ...shifted };
    const again = lr.shiftPrev(ROW, "2026-11-24T01:32:00Z", tokyo), first = lr.shiftPrev({ q_time: "2026-11-20T06:30:00Z", volume: 18_200_000 }, TUE.q_time, tokyo), none = lr.shiftPrev(FRI, null, tokyo);
    ck(`the prev_* shift: the first quote of a later session moves the stored quote's volume and time into prev_vol and prev_qt and the volume before into prev2_vol (${JSON.stringify(shifted)}); a later quote of the same session leaves them (${JSON.stringify(again)}); a row stored before the columns starts them (${JSON.stringify(first)}); a quote with no time changes nothing`,
      shifted.prev_vol === 18_200_000 && shifted.prev_qt === "2026-11-20T06:30:00Z" && shifted.prev2_vol === 15_000_000 && JSON.stringify(again) === JSON.stringify(shifted) && first.prev_vol === 18_200_000 && first.prev_qt === "2026-11-20T06:30:00Z" && first.prev2_vol === null && JSON.stringify(none) === JSON.stringify({ prev_vol: 15_000_000, prev2_vol: 14_000_000, prev_qt: "2026-11-19T06:30:00Z" }));
    const nyStored = { q_time: "2026-11-23T20:59:00Z", volume: 9e6, prev_vol: 8e6, prev_qt: "2026-11-20T21:00:00Z", prev2_vol: 7e6 }, nyLate = lr.shiftPrev(nyStored, "2026-11-24T01:30:00Z", ny), nyNext = lr.shiftPrev(nyStored, "2026-11-24T14:31:00Z", ny);
    ck(`a session is the exchange's own date: a New York print at 20:30 there on Mon 23 Nov (01:30 UTC on the 24th) is still that session (prev_qt stays ${nyLate.prev_qt}), the next morning's moves it (${nyNext.prev_qt})`, nyLate.prev_qt === "2026-11-20T21:00:00Z" && nyNext.prev_qt === "2026-11-23T20:59:00Z" && nyNext.prev_vol === 9e6);
    // a session the quotes missed: Thursday's closing quote is the stored one when Tuesday's comes in (no quote of Friday kept)
    const THU = { ...FRI, q_time: "2026-11-19T06:30:00Z", volume: 15_000_000, prev_qt: "2026-11-18T06:30:00Z", prev_vol: 12_000_000 }, gap = lr.shiftPrev(THU, TUE.q_time, tokyo);
    const gapState = lr.rowLimitState({ ...FRI, ...TUE, ...gap }, "7203.T", lr.quotePrint({ ...FRI, ...TUE, ...gap }), ctx());
    ck(`a missing session: Thursday's quote meets Tuesday's (Friday's was never kept), so prev_qt is Thursday's (${gap.prev_qt}) and Friday's volume and last trade are not known: the print at its limit gets no chip (${gapState.why})`, gap.prev_qt === "2026-11-19T06:30:00Z" && gap.prev_vol === 15_000_000 && gapState.side === null && gapState.why === "base-in-doubt", gapState);

    // lim_run: the run up to the session before the booked close's (what that close's own limit rests on), from the
    // closes the statistics job holds, set on the TSE's sessions
    const C = (pairs: Array<[string, number]>) => pairs.map(([d, v]) => ({ d: `2026-11-${d}`, v }));
    const RUN: Array<[string, number | null, number | null]> = [
      ["up: 1,000 -> 1,300 -> 1,600, two limit-up closes before Friday's", lr.limRunOf(C([["16", 1_000], ["17", 1_000], ["18", 1_300], ["19", 1_600], ["20", 1_650]]), HOL), 2],
      ["down: 1,000 -> 700 -> 550", lr.limRunOf(C([["16", 1_000], ["17", 1_000], ["18", 700], ["19", 550], ["20", 560]]), HOL), -2],
      ["broken: a limit close, an ordinary one, a limit close", lr.limRunOf(C([["16", 1_000], ["17", 1_300], ["18", 1_350], ["19", 1_650], ["20", 1_700]]), HOL), 1],
      ["none", lr.limRunOf(C([["16", 1_000], ["17", 1_010], ["18", 1_020], ["19", 1_030], ["20", 1_040]]), HOL), 0],
      ["a no-trade day: no close for Thu 19 Nov in the series, a limit close before it (Tuesday's booking)", lr.limRunOf(C([["16", 1_000], ["17", 1_000], ["18", 1_300], ["20", 1_300], ["24", 1_320]]), HOL), 3],
      ["a no-trade day the quotes saw (Yahoo carried the close; no quote printed on 19 or 20 Nov)", lr.limRunOf(C([["16", 1_000], ["17", 1_000], ["18", 1_300], ["19", 1_300], ["20", 1_300], ["24", 1_320]]), HOL, new Set(["2026-11-19", "2026-11-20"])), 3],
      ["the same without the quotes' record", lr.limRunOf(C([["16", 1_000], ["17", 1_000], ["18", 1_300], ["19", 1_300], ["20", 1_300], ["24", 1_320]]), HOL), 0],
      ["a close beyond its normal limit (broadened) marked as untraded is never fewer", lr.limRunOf(C([["17", 1_000], ["18", 1_000], ["19", 2_200], ["20", 2_250]]), HOL, new Set(["2026-11-19"])), 2],
      ["the close before the booked one is not the session before it (Thu 19 Nov missing right before Friday's)", lr.limRunOf(C([["16", 1_000], ["17", 1_000], ["18", 1_300], ["20", 1_300]]), HOL), null],
      ["a booked close on a holiday (Mon 23 Nov)", lr.limRunOf(C([["19", 1_000], ["20", 1_000], ["23", 1_000]]), HOL), null],
    ];
    ck(`lim_run from a closes series, signed (+ up, − down): ${RUN.map(([n, got, want]) => `${n}: ${got}${got === want ? "" : ` (want ${want})`}`).join("; ")}`, RUN.every(([, got, want]) => got === want), RUN.filter(([, g, w]) => g !== w));
    const un = lr.untradedOf({ q_time: "2026-11-24T01:12:00Z", volume: 5e6, prev_qt: "2026-11-18T06:30:00Z", prev_vol: 2e6, prev2_vol: 0 }, HOL), un0 = lr.untradedOf({ q_time: "2026-11-24T01:12:00Z", volume: 0, prev_qt: "2026-11-20T06:30:00Z", prev_vol: 0, prev2_vol: 3e6 }, HOL);
    ck(`the sessions the quotes saw without a trade, which may only lengthen a run: between the last trade kept and the quote's session (19 and 20 Nov; the 23rd is a holiday), and where a kept volume is 0 (${[...un].sort().join(", ")}; ${[...un0].sort().join(", ")})`, [...un].sort().join() === "2026-11-17,2026-11-19,2026-11-20" && [...un0].sort().join() === "2026-11-20,2026-11-24");
    const SERIES: Array<Array<number | null>> = [[1_000, 1_000, 1_300], [1_000, 1_300, 1_600], [1_000, 1_000, 1_000, 2_200], [1_000, 1_300, 1_350], [1_000, null, 1_300], [1_000, 1_000, 700, 400], [1_000, 1_300, 1_600, 1_900], [1_000, 1_100, 1_400]];
    const through = SERIES.map((xs) => { const whole = pl.limitRun(xs.map((close) => ({ close }))), before = pl.limitRun(xs.slice(0, -1).map((close) => ({ close }))), ext = lr.runThrough(before, xs[xs.length - 1], xs[xs.length - 2]); return { xs, whole, ext, ok: ext !== null && (Math.abs(ext) < 2) === (whole < 2) }; });
    ck(`a print of the session after the booked close: the run up to that close from the run before it and the close itself agrees with limitRun on the whole series wherever it decides (under 2 or not): ${through.map((t) => `${t.xs.join("→")} ${t.whole}/${t.ext}`).join("; ")}; an unknown run stays unknown (${lr.runThrough(null, 1_300, 1_000)})`, through.every((t) => t.ok) && lr.runThrough(null, 1_300, 1_000) === null, through.filter((t) => !t.ok));

    // a row's print as the rule's input: every reason for no chip of L-1, on its own case
    const st = (s: lr.LimitStat, p: lr.LimitPrint = lr.quotePrint(s), c: lr.LimitCtx = ctx()) => lr.rowLimitState(s, s.symbol, p, c);
    const up = st(ROW);
    ck(`the row's quote of Tue 24 Nov at 4,156 is LIMIT UP on Friday's booked close: base ${up.base} of ${up.baseDay}, ±${up.width}, limits ${up.lower}–${up.upper}, at ${up.at}, not closed`, up.side === "up" && up.why === null && up.base === 3_456 && up.baseDay === "2026-11-20" && up.width === 700 && up.upper === 4_156 && up.lower === 2_756 && up.at === "2026-11-24T01:12:00Z" && !up.closed, up);
    const WHY: Array<[string, lr.LimitStat, lr.LimitPrint | null, string]> = [
      ["not-placed: an ETF's row (1306.T)", { ...ROW, symbol: "1306.T" }, null, "not-placed"],
      ["no-print: no quote price", { ...ROW, q_price: null }, null, "no-print"],
      ["no-print: Friday's booked close shown while the stored quote is Tuesday's (the close's own trade time is not held)", ROW, lr.closePrint(ROW), "no-print"],
      ["no-base: the booked close is Thursday's (the job did not book Friday)", { ...ROW, d: "2026-11-19", close: 3_400, prev: 3_350 }, null, "no-base"],
      ["no-base: a booked close whose base the booking could not place (lim_run not known)", { ...ROW, d: "2026-11-24", close: 4_156, prev: 3_456, lim_run: null }, null, "no-base"],
      ["unconfirmed: a base of 17,000 (a band read once)", { ...ROW, close: 17_000, prev: 16_900, q_prev: 17_000, q_price: 21_000, q_high: 21_000, q_low: 16_500 }, null, "unconfirmed"],
      ["base-in-doubt: Yahoo's previous close 1,728 against the booked 3,456 (a split)", { ...ROW, q_prev: 1_728 }, null, "base-in-doubt"],
      ["base-in-doubt: Friday's last trade at 14:52 JST, before the closing auction", { ...ROW, prev_qt: "2026-11-20T05:52:00Z" }, null, "base-in-doubt"],
      ["base-in-doubt: Friday's volume 0", { ...ROW, prev_vol: 0 }, null, "base-in-doubt"],
      ["ex-day: a print on Fri 27 Nov, the month's second-to-last session", { ...ROW, d: "2026-11-26", q_time: "2026-11-27T01:12:00Z", prev_qt: "2026-11-26T06:30:00Z" }, null, "ex-day"],
      ["run: one limit close before Friday's and Friday's at its own limit (2,956 -> 3,456)", { ...ROW, prev: 2_956, lim_run: 1 }, null, "run"],
      ["run: the run before Friday's not known", { ...ROW, lim_run: null }, null, "run"],
      ["beyond: the day's high 4,200 above the computed upper limit", { ...ROW, q_high: 4_200 }, null, "beyond"],
    ];
    const whyGot = WHY.map(([n, s, p, want]) => { const x = st(s, p ?? lr.quotePrint(s), n.startsWith("ex-day") ? ctx(new Date("2026-11-27T01:40:00Z")) : ctx()); return { n, want, why: x.why, ok: x.side === null && x.why === want }; });
    ck(`each reason for no chip from a stats row: ${whyGot.map((x) => `${x.n} -> ${x.why}`).join("; ")}`, whyGot.every((x) => x.ok), whyGot.filter((x) => !x.ok));
    const broken = st({ ...ROW, lim_run: 2 }), booked = { ...ROW, d: "2026-11-24", close: 4_156, prev: 3_456, lim_run: 0, lim_d: "2026-11-20", q_time: "2026-11-24T06:30:00Z", volume: 9_000_000 }, closed = st(booked, lr.closePrint(booked), ctx(new Date("2026-11-24T08:00:00Z")));
    ck(`a run before Friday's broken by Friday's own ordinary close gives the chip again (${broken.side}); Tuesday's booked close at its limit is "closed at" Tuesday, on Friday's close as its base (${closed.side}, closed ${closed.closed}, base ${closed.base} of ${closed.baseDay})`, broken.side === "up" && closed.side === "up" && closed.closed && closed.base === 3_456 && closed.baseDay === "2026-11-20" && closed.day === "2026-11-24", { broken, closed });
    const page = st(FRI, { price: 4_156, at: "2026-11-24T01:12:00Z", high: 4_156, low: 3_500, quotePrev: 3_456 });
    ck(`the stock page's own quote, read before the flow job kept Tuesday's: the same base and limits as the lists' row (${page.lower}–${page.upper} against ${up.lower}–${up.upper}), and the chip (${page.side})`, page.side === "up" && page.upper === up.upper && page.lower === up.lower && page.base === up.base && page.baseDay === up.baseDay, page);

    // F2-1 of the L-2 check (check/L2/verify.md §8): lim_run did not say which session it was worked out for. Code from
    // before it (live after a revert, or GitHub's jobs at a reverted main) books new closes and leaves lim_run as it was,
    // and once L-2 was deployed again a read stood on that stale run. Now the booking keeps lim_d beside it, the last
    // session the run covers (the session before the booked close's), and a reader takes the run only where lim_d is the
    // session before the row's booked close (runBefore); otherwise the run is not known, as a null lim_run is: no chip,
    // "run" for a print of a later session, "no-base" for the booked session's own print (whose base, the close before the
    // booked one, only the run's booking places on the session before; no-base comes before run in the rule's order).
    // The verifier's case (check/L2/scripts/stale.ts): L-2 books Thu 19 Nov (the run before it 0: Wed 18 inside its
    // limits); the old code books Fri 20 at 3,000, the limit on Thursday's 2,500, itself the limit on Wednesday's 2,000;
    // Tuesday's print at 3,700 is the limit on Friday's close; the true run is 2, so the limit may be broadened
    const CL = [{ d: "2026-11-17", v: 1_990 }, { d: "2026-11-18", v: 2_000 }, { d: "2026-11-19", v: 2_500 }, { d: "2026-11-20", v: 3_000 }];
    const thuBooked = { lim_run: lr.limRunOf(CL.slice(0, 3), HOL), lim_d: "2026-11-18" };   // L-2's booking of Thursday: the run, and its last session
    const STALE: lr.LimitStat = { symbol: "6758.T", d: "2026-11-20", close: 3_000, prev: 2_500, ...thuBooked, q_price: 3_700, q_prev: 3_000, q_time: "2026-11-24T01:00:00Z", q_high: 3_700, q_low: 3_050, volume: 1e6, prev_vol: 2e6, prev2_vol: 2e6, prev_qt: "2026-11-20T06:30:00Z" };
    const stale = st(STALE), staleOwn = st({ ...STALE, q_price: 3_000, q_prev: 2_500, q_high: 3_000, q_low: 2_510, q_time: "2026-11-20T06:30:00Z", prev_qt: "2026-11-19T06:30:00Z" }, undefined, ctx(new Date("2026-11-20T07:00:00Z")));
    ck(`F2-1: a run left by an earlier booking is not known: L-2 booked Thu 19 Nov (lim_run ${thuBooked.lim_run}, its last session ${thuBooked.lim_d}), code without the run then booked Fri 20 at 3,000 (the limit on Thursday's 2,500, itself the limit on Wednesday's 2,000); Tuesday's print at 3,700, Friday's upper limit, gets no chip (${stale.side}, ${stale.why}), nor does Friday's own print after its close (${staleOwn.side}, ${staleOwn.why})`,
      stale.side === null && stale.why === "run" && staleOwn.side === null && staleOwn.why === "no-base", { stale, staleOwn });
    const runCl = lr.runCols(CL, HOL), fresh = st({ ...STALE, ...runCl }), CL2 = [{ d: "2026-11-18", v: 2_000 }, { d: "2026-11-19", v: 2_010 }, { d: "2026-11-20", v: 2_510 }];
    const okRow = { ...STALE, close: 2_510, prev: 2_010, ...lr.runCols(CL2, HOL), q_price: 3_010, q_prev: 2_510, q_high: 3_010, q_low: 2_600 }, ok = st(okRow);
    const noRun = lr.runCols(C([["16", 1_000], ["17", 1_000], ["18", 1_300], ["20", 1_300]]), HOL), RB: Array<[string, number | null, number | null]> = [
      ["Friday's close, the run to Thu 19", lr.runBefore({ d: "2026-11-20", lim_run: 1, lim_d: "2026-11-19" }, HOL), 1],
      ["Friday's close, a run to Wed 18 (Thursday's booking)", lr.runBefore({ d: "2026-11-20", lim_run: 0, lim_d: "2026-11-18" }, HOL), null],
      ["Tuesday's close, the run to Fri 20 over Monday's holiday", lr.runBefore({ d: "2026-11-24", lim_run: -1, lim_d: "2026-11-20" }, HOL), -1],
      ["Tuesday's close, a run to the holiday", lr.runBefore({ d: "2026-11-24", lim_run: 0, lim_d: "2026-11-23" }, HOL), null],
      ["no lim_d", lr.runBefore({ d: "2026-11-20", lim_run: 0, lim_d: null }, HOL), null],
      ["no lim_run", lr.runBefore({ d: "2026-11-20", lim_run: null, lim_d: "2026-11-19" }, HOL), null],
    ];
    const ist = readText(new URL("../supabase/functions/_shared/istats.ts", import.meta.url), "utf8");
    ck(`F2-1: the booking keeps the run with its last session (${JSON.stringify(runCl)}; none where the run is not known: ${JSON.stringify(noRun)}), so re-booked Friday's print at 3,700 gets no chip for its run of 2 (${fresh.why}) and a run booked for its own close still gives one (${ok.side}: Thursday inside, Friday's 2,510 at its limit); the reader takes lim_run only for the session before the booked close's: ${RB.map(([n, got, want]) => `${n}: ${got}${got === want ? "" : ` (want ${want})`}`).join("; ")}; the statistics job writes lim_run only with lim_d`,
      runCl.lim_run === 1 && runCl.lim_d === "2026-11-19" && noRun.lim_run === null && noRun.lim_d === null && fresh.side === null && fresh.why === "run" && ok.side === "up" && ok.why === null && RB.every(([, got, want]) => got === want)
        && /Object\.assign\(r, hol \? runCols\(/.test(ist) && !/r\.lim_run =/.test(ist) && lr.LIMIT_COLS.includes("lim_d" as never), { runCl, noRun, fresh, ok, RB: RB.filter(([, g, w]) => g !== w) });

    // what a row carries: `lim` only at a limit, in its compact form; the stock page `limits` for a placed name
    const row0 = { symbol: "7203.T", close: 4_156, pct1d: 20.25 }, withUp = lr.withLim(row0, up) as typeof row0 & { lim?: Record<string, unknown> };
    const inside = st({ ...ROW, q_price: 4_100, q_high: 4_100 }), plain = [lr.withLim(row0, inside), lr.withLim(row0, st(ROW, lr.closePrint(ROW))), lr.withLim(row0, null)];
    ck(`the API's field: a row at its limit carries lim ${JSON.stringify(withUp.lim)} (side, price, base, width, at, closed: nothing else), its other fields as before; a row off its limit, or with no chip, is the very same object, with no lim`,
      JSON.stringify(Object.keys(withUp.lim ?? {})) === JSON.stringify(["side", "price", "base", "width", "at", "closed"]) && withUp.lim?.side === "up" && withUp.lim?.price === 4_156 && withUp.lim?.base === 3_456 && withUp.lim?.width === 700 && withUp.lim?.at === "2026-11-24T01:12:00.000Z" && withUp.lim?.closed === false && withUp.close === 4_156 && withUp.pct1d === 20.25 && plain.every((x) => x === row0 && !("lim" in x)), withUp);
    const spUp = lr.stockLimitFields(up) as { limits?: Record<string, unknown>; lim?: unknown }, spIn = lr.stockLimitFields(inside) as typeof spUp, spWhy = lr.stockLimitFields(st({ ...ROW, close: 17_000, prev: 16_900, q_prev: 17_000, q_price: 21_000, q_high: 21_000, q_low: 16_500 })) as typeof spUp, spUs = lr.stockLimitFields(st({ ...ROW, symbol: "NVDA" }));
    ck(`the stock page: a placed name gets limits (upper, lower, base, its date, width, why) every day and lim at its limit (${JSON.stringify(spUp.limits)}); off it, limits alone; a band read once, limits with its reason; a name not placed (NVDA), neither field: ${JSON.stringify(spUs)}`,
      JSON.stringify(Object.keys(spUp.limits ?? {})) === JSON.stringify(["upper", "lower", "base", "baseDay", "width", "why"]) && spUp.limits?.upper === 4_156 && spUp.limits?.baseDay === "2026-11-20" && !!spUp.lim && !!spIn.limits && spIn.limits.why === null && !("lim" in spIn) && spWhy.limits?.why === "unconfirmed" && !("lim" in spWhy) && JSON.stringify(spUs) === "{}" && JSON.stringify(lr.stockLimitFields(null)) === "{}");
    // WATCHLIST, rebased on W-1 (0673409): a member's row is W-1's (watchRowFromStat on newestStats' row of the name: at its
    // newest print while its market trades, else at its booked close; the name and sector of the first of its lists in
    // NAME_ORDER; the figures of the newest row), and it carries `lim` only while the print it shows is at its limit,
    // worked out on that same row for that print (watchRowWithLim): the Nikkei 225's and TOPIX's rows of one name are read
    // at their own minutes, and the chip follows the row whose figures the watchlist shows
    const jp = (iso: string) => srv.localDate("Asia/Tokyo", Date.parse(iso) / 1000);
    const WL = { name: "TOYOTA MOTOR CORP.", sector: "Consumer Discretionary", pct1d: 1.6, pct1w: 3.1, pct1m: -4.2, pct3m: 7.5, pct12m: 17.7, dma50: 3_300, dma200: 3_000, hi52: 4_200, lo52: 2_500, mcap: 4.5e13, earnings_at: null, earnings_est: null };
    const nk = { ...WL, ...ROW, idx: "NK225" }, tp = { ...WL, ...ROW, idx: "TOPIX", name: "トヨタ自動車", sector: "輸送用機器", q_price: 4_100, q_high: 4_100, q_time: "2026-11-24T01:03:00Z" };
    type WRow = ReturnType<typeof watchRowFromStat> & { lim?: lr.Lim };
    const wl = (rows: Array<typeof nk>, c: lr.LimitCtx | null = ctx()) => { const s = newestStats(rows).get("7203.T")!; return { s, w: watchRowWithLim(s, "JPY", jp, c) as WRow, plain: watchRowFromStat(s, "JPY", jp) }; };
    const figs = (x: WRow) => { const { lim: _lim, ...rest } = x; return JSON.stringify(rest); };
    const nkNew = [wl([tp, nk]), wl([nk, tp])], tpNew = [wl([{ ...tp, q_price: 4_156, q_high: 4_156, q_time: "2026-11-24T01:23:00Z" }, { ...nk, q_price: 4_100, q_high: 4_100 }]), wl([{ ...nk, q_price: 4_100, q_high: 4_100 }, { ...tp, q_price: 4_156, q_high: 4_156, q_time: "2026-11-24T01:23:00Z" }])];
    const offNew = [wl([{ ...tp, q_time: "2026-11-24T01:23:00Z" }, nk]), wl([nk, { ...tp, q_time: "2026-11-24T01:23:00Z" }])];
    ck(`WATCHLIST (W-1 with L-2): a member's row is W-1's row of the name's newest row, at its print, with the Nikkei 225's name and sector (${nkNew.map(({ s, w }) => `${s.idx} ${w.last} at ${w.asOf} ${w.name}`).join("; ")}), and carries lim at that print (${JSON.stringify(nkNew[0].w.lim)}); with TOPIX's quote the newer, the chip is TOPIX's print's (${tpNew.map(({ s, w }) => `${s.idx} ${w.lim?.at}`).join(", ")}); with TOPIX's newer quote under the limit there is none, though the Nikkei 225's older one is at it; in either order of the rows`,
      [...nkNew, ...tpNew].every(({ w, plain }) => figs(w) === JSON.stringify(plain) && w.asOfKind === "print" && w.name === "TOYOTA MOTOR CORP." && w.sector === "Consumer Discretionary" && w.lim?.side === "up" && w.lim.price === w.last && w.lim.at === new Date(w.asOf as string).toISOString() && w.lim.base === 3_456 && w.lim.width === 700)
        && nkNew.every(({ s, w }) => s.idx === "NK225" && w.asOf === "2026-11-24T01:12:00Z") && tpNew.every(({ s, w }) => s.idx === "TOPIX" && w.asOf === "2026-11-24T01:23:00Z")
        && offNew.every(({ s, w, plain }) => s.idx === "TOPIX" && w.last === 4_100 && !("lim" in w) && JSON.stringify(w) === JSON.stringify(plain)), { nkNew, tpNew, offNew });
    const tueBooked = { ...nk, d: "2026-11-24", close: 4_156, prev: 3_456, lim_run: 0, lim_d: "2026-11-20", q_price: 4_156, q_prev: 3_456, q_time: "2026-11-24T06:30:00Z", q_high: 4_156, q_low: 3_500, volume: 9_000_000 };
    const atClose = wl([tueBooked], ctx(new Date("2026-11-24T08:00:00Z"))), noCols = wl([tp, nk], null), us = watchRowWithLim({ ...nk, idx: "SP500", symbol: "NVDA" }, "USD", jp, ctx()) as WRow;
    ck(`and at its booked close (Tuesday booked at its limit, read after 15:30 JST: ${atClose.w.asOfKind} of ${atClose.w.asOf}) the chip is that close's (${JSON.stringify(atClose.w.lim)}); a database without the chip's columns, or a row of a list outside Tokyo's, gives W-1's row as it is, with no lim`,
      atClose.w.asOfKind === "close" && atClose.w.asOf === "2026-11-24" && figs(atClose.w) === JSON.stringify(atClose.plain) && atClose.w.lim?.side === "up" && atClose.w.lim.closed && atClose.w.lim.price === 4_156 && atClose.w.lim.base === 3_456
        && !("lim" in noCols.w) && JSON.stringify(noCols.w) === JSON.stringify(noCols.plain) && !("lim" in us), { atClose: atClose.w, noCols: noCols.w });
    // N-1 of the L-2 check: lim.at was one instant in two spellings, the stored quote's time as the database hands it back
    // on the lists ("…+00:00", live PostgREST's form of a timestamptz) and toISOString()'s on the stock page ("….000Z").
    // It is now toISOString()'s everywhere, the form in which the server writes every instant it makes (the quote's time
    // when a job stores it, the stock page's asOf): EQUITIES' row, WATCHLIST's and the stock page's say the same string
    const pgAt = "2026-11-24T01:12:00+00:00", sec = Date.parse(pgAt) / 1000, stockSrc = readText(new URL("../supabase/functions/_shared/stock.ts", import.meta.url), "utf8");
    const eqLim = (lr.withLim({}, st({ ...ROW, q_time: pgAt })) as { lim?: lr.Lim }).lim, wlLim = (watchRowWithLim(newestStats([{ ...nk, q_time: pgAt }]).get("7203.T")!, "JPY", jp, ctx()) as WRow).lim;
    const pageLim = (lr.stockLimitFields(lr.rowLimitState(FRI, "7203.T", lr.pagePrint({ price: 4_156, time: sec, high: 4_156, low: 3_500, prevClose: 3_456 }), ctx())) as { lim?: lr.Lim }).lim;
    ck(`N-1: one instant, one string: lim.at on EQUITIES' row ${eqLim?.at} and on WATCHLIST's ${wlLim?.at} (both from the stored quote's time as the database returns it, ${pgAt}) and on the stock page ${pageLim?.at} (its own quote's time, ${sec} s), toISOString()'s form; the stock page makes its print with pagePrint`,
      !!eqLim && !!wlLim && !!pageLim && eqLim.at === "2026-11-24T01:12:00.000Z" && wlLim.at === eqLim.at && pageLim.at === eqLim.at && /rowLimitState\(lf\.stat, symbol, pagePrint\(q\), /.test(stockSrc), { eqLim, wlLim, pageLim });
    const hi = { ...ROW, q_high: 4_200 }, later = { ...ROW, q_high: 4_210, q_time: "2026-11-24T01:32:00Z" }, nextDay = { ...ROW, q_high: 4_210, q_time: "2026-11-25T01:12:00Z", d: "2026-11-24", close: 3_456, prev: 3_400, lim_d: "2026-11-20", prev_qt: "2026-11-24T06:30:00Z" };
    const beyondSt = st(hi), line = lr.beyondNote("7203.T", up, beyondSt, lr.quotePrint(hi)), twice = lr.beyondNote("7203.T", beyondSt, st(later), lr.quotePrint(later)), next = lr.beyondNote("7203.T", beyondSt, st(nextDay, undefined, ctx(new Date("2026-11-25T01:40:00Z"))), lr.quotePrint(nextDay));
    ck(`the beyond log line, values only, once per name and day: "${line}"; the same day again: ${twice}; the next day's: ${next ? "a line" : "none"}`, !!line && /7203\.T/.test(line) && /2026-11-24/.test(line) && /4,200/.test(line) && /2,756.4,156/.test(line) && /3,456/.test(line) && twice === null && !!next && lr.beyondNote("7203.T", null, up, lr.quotePrint(ROW)) === null);

    // a database from before migration 20261124000001: reads fall back to the columns it has, writes carry none of the new
    const COLS = "symbol,d,close,prev,q_price,q_prev,q_time,volume", NEW = lr.LIMIT_COLS.join(","), DB_ROWS = [{ symbol: "7203.T", d: "2026-11-20", close: 3_456, prev: 3_400, q_price: 4_156, q_prev: 3_456, q_time: "2026-11-24T01:12:00Z", volume: 5e6, q_high: 4_156, q_low: 3_500, prev_vol: 18.2e6, prev2_vol: 15e6, prev_qt: "2026-11-20T06:30:00Z", lim_run: 0, lim_d: "2026-11-19" }];
    const standIn = (has: string[]) => (cols: string) => ({ range: async (a: number, b: number) => { const want = cols.split(","), lack = want.find((c) => !has.includes(c)); return lack ? { data: null, error: { code: "42703", message: `column constituent_stats.${lack} does not exist` } } : { data: DB_ROWS.slice(a, b + 1).map((r) => Object.fromEntries(want.map((c) => [c, (r as Record<string, unknown>)[c]]))), error: null }; } });
    let old: { rows: Array<Record<string, unknown>>; set: number } | null = null, now2: typeof old = null, other: string | null = null;
    try {
      old = await selectCols<Record<string, unknown>>(standIn(COLS.split(",")), [`${COLS},${NEW}`, COLS]);
      now2 = await selectCols<Record<string, unknown>>(standIn([...COLS.split(","), ...lr.LIMIT_COLS]), [`${COLS},${NEW}`, COLS]);
      await selectCols(standIn(COLS.split(",")), [`${COLS},${NEW}`, COLS], (e) => lr.lacksLimitCols(String(e))).catch((e) => { other = String(e); });
      await selectCols(() => ({ range: async () => ({ data: null, error: { message: "fetch failed" } }) }), [`${COLS},${NEW}`, COLS], (e) => lr.lacksLimitCols(String(e))).catch((e) => { other = String(e); });
    } catch (e) { other = `threw: ${String(e)}`; }
    const oldRow = old?.rows[0] ?? {}, oldLim = old ? lr.rowLimitState(oldRow as unknown as lr.LimitStat, "7203.T", lr.quotePrint(oldRow as unknown as lr.LimitStat), ctx()) : null;
    ck(`a database without the new columns: the read asks for them, is told "column … does not exist", and reads the columns it has (set ${old?.set}: ${Object.keys(oldRow).join(",")}), the very rows of the query before L-2; with them it reads them (set ${now2?.set}); a job's read falls back only on that answer, never on another (${other})`,
      old?.set === 1 && JSON.stringify(Object.keys(oldRow)) === JSON.stringify(COLS.split(",")) && now2?.set === 0 && now2.rows[0].lim_run === 0 && now2.rows[0].prev_qt === "2026-11-20T06:30:00Z" && /fetch failed/.test(other ?? "") && oldLim !== null && lr.withLim(oldRow, oldLim) === oldRow, { old, other });
    const written = { idx: "NK225", symbol: "7203.T", name: "Toyota", d: "2026-11-20", close: 3_456, volume: 5e6, q_price: 4_156, q_prev: 3_456, q_time: "2026-11-24T01:12:00Z", q_high: 4_156, q_low: 3_500, prev_vol: 18.2e6, prev2_vol: 15e6, prev_qt: "2026-11-20T06:30:00Z", lim_run: 0, lim_d: "2026-11-19" };
    ck(`and a job writes such a database's rows key for key as before (${Object.keys(lr.withoutLimitCols({ ...written })).join(",")}); the answers that say a column is missing are told from others: ${["column constituent_stats.q_high does not exist", "Could not find the 'prev_qt' column of 'constituent_stats' in the schema cache", "column constituent_stats.lim_d does not exist", "column constituent_stats.q_price does not exist", "fetch failed"].map((m) => lr.lacksLimitCols(m)).join(", ")}`,
      JSON.stringify(Object.keys(lr.withoutLimitCols({ ...written }))) === JSON.stringify(["idx", "symbol", "name", "d", "close", "volume", "q_price", "q_prev", "q_time"]) && lr.lacksLimitCols("column constituent_stats.q_high does not exist") && lr.lacksLimitCols("Could not find the 'prev_qt' column of 'constituent_stats' in the schema cache") && lr.lacksLimitCols("column constituent_stats.lim_d does not exist") && !lr.lacksLimitCols("column constituent_stats.q_price does not exist") && !lr.lacksLimitCols("fetch failed"));
    const lsrc = readText(new URL("../supabase/functions/_shared/rules/limitrow.ts", import.meta.url), "utf8");
    ck("limitrow.ts is pure (it imports only the rule, and reads no clock, network or store) and the server's alone: the page's folder has no copy of it", /^import [^\n]* from "\.\/pricelimit\.ts";$/m.test(lsrc) && (lsrc.match(/^\s*import\s/gm) ?? []).length === 1 && !/new Date\(\s*\)|Date\.now\(|fetch\(|Deno\.|process\./.test(lsrc) && !listDir(new URL("../web/src/lib/rules/", import.meta.url)).includes("limitrow.ts"));
  }

  // [AK], what the READMEs say, is in sim/readme.test.ts since 23 Nov 2026: this file stops a deploy of the server or the
  // site when it fails, and since the check of fix part 4 it reads neither README, so no sentence of either can stop a
  // deploy (the check of fix part 3 found, by experiment, that a README change alone ran no check and would then stop the
  // next deploy; [AL] holds
  // logic-tests' paths to every file this file does read). logic-tests runs both files.

  const reached: string[] = [];   // every file of the repository's own that this file imports, directly or through another ([AB]), for [AL]
  console.log("\n[AB] this file reaches nothing that GitHub's logic job lacks: only jobs/ is installed there (the failed check of pull request #48, 21 Nov 2026)");
  {
    // GitHub runs this file after `npm ci` in jobs/ and nowhere else (.github/workflows/logic-tests.yml, and the logic
    // checks of deploy-server.yml, which stop a deploy of the server). A file of the page that imports one of the
    // page's packages (web/node_modules: React, uPlot) cannot be loaded there, while on a machine that has
    // web/node_modules it loads without a word. web/src/lib/nav.ts imports "react"; this file read one rule from it,
    // passed on the engineer's machine and on the reviewer's, and stopped on GitHub with "Cannot find module 'react'".
    // So this file looks twice at what it reaches, and fails on any machine before GitHub is asked:
    //   1. The imports as they are written, followed from this file through every file they lead to: `import … from`,
    //      `export … from`, and import("…") or require("…") of a plain string, read with TypeScript's own parser (a
    //      package of jobs/). `import type` loads nothing and is not followed. A name that is not a file is a package.
    //      Node looks for a package in node_modules beside the importing file and in the folders above it, so on
    //      GitHub only a file of jobs/ finds one, and only one that jobs/package-lock.json installs. Node's own
    //      modules (node:fs) are on every machine. An address with a scheme (npm:, jsr:, https:) is the server's way
    //      under Deno and loads in no machine's Node: a run that reached one would stop here as well, so it is not
    //      this check's business.
    //   2. What this run really loaded. Node keeps, for every file loaded through require, the files it loaded in
    //      turn, and tsx runs this file and its imports through require. Walked from this file down: every file of
    //      the repository's own must be one the first look followed, so that the first look is known to miss nothing
    //      that loads; and none may have loaded a file from web/node_modules or from anywhere else on this machine
    //      (it has a folder of packages installed for every project). A file loaded by import() is not in Node's
    //      list; the first look follows it.
    // A rule of the page that this file checks belongs in a module that imports no package (lib/pagetop.ts holds
    // lib/nav.ts's rule), and a type from a module that does is imported with `import type`.
    const slash = (f: string) => f.replace(/\\/g, "/");
    const root = slash(fileURLToPath(new URL("../", import.meta.url))), me = slash(fileURLToPath(import.meta.url));
    const rel = (f: string) => (slash(f).startsWith(root) ? slash(f).slice(root.length) : slash(f));
    const locked = new Set(Object.keys((JSON.parse(readText(new URL("../jobs/package-lock.json", import.meta.url), "utf8")) as { packages?: Record<string, unknown> }).packages ?? {}));
    const where = (f: string): "own" | "jobs" | "elsewhere" => {
      const r = rel(f);
      if (r === slash(f)) return "elsewhere";                                           // not in the repository at all
      if (!/(^|\/)node_modules\//.test(r)) return "own";
      const pkg = /^jobs\/((?:node_modules\/(?:@[^/]+\/)?[^/]+\/)+)/.exec(r)?.[1].slice(0, -1);   // jobs/node_modules/zod/lib/x.js -> node_modules/zod, as the lock names it
      return pkg !== undefined && locked.has(pkg) ? "jobs" : "elsewhere";
    };

    // 1. the imports as they are written
    type TsNode = import("typescript").Node;
    const ts = createRequire(new URL("../jobs/package.json", import.meta.url))("typescript") as typeof import("typescript");
    const importsOf = (file: string): Array<{ spec: string; line: number }> => {
      const sf = ts.createSourceFile(file, readText(file, "utf8"), ts.ScriptTarget.Latest), out: Array<{ spec: string; line: number }> = [];
      const add = (lit: TsNode | undefined) => { if (lit && ts.isStringLiteralLike(lit)) out.push({ spec: lit.text, line: sf.getLineAndCharacterOfPosition(lit.end).line + 1 }); };
      const visit = (n: TsNode): void => {
        if (ts.isImportDeclaration(n)) { if (!n.importClause?.isTypeOnly) add(n.moduleSpecifier); }
        else if (ts.isExportDeclaration(n)) { if (!n.isTypeOnly) add(n.moduleSpecifier); }
        else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) add(n.arguments[0]);
        ts.forEachChild(n, visit);
      };
      visit(sf);
      return out;
    };
    const isFile = (f: string) => fileStat(f, { throwIfNoEntry: false })?.isFile() === true;
    const fileOf = (from: string, spec: string) => { const p = slash(resolvePath(dirname(from), spec)); return [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`, `${p}/index.tsx`].find(isFile) ?? null; };
    const written = new Map<string, string | null>(), named: string[] = [];              // each file followed, and the file that led to it first
    const way = (f: string): string => { const from = written.get(f); return from ? `${way(from)} > ${rel(f)}` : rel(f); };
    const follow = (file: string, from: string | null) => {
      if (written.has(file)) return;
      written.set(file, from);
      if (!/\.[cm]?[jt]sx?$/.test(file)) return;                                         // a .json imports nothing
      for (const { spec, line } of importsOf(file)) {
        const at = `${rel(file)}:${line} imports "${spec}" (the way there: ${way(file)})`;
        if (/^\.{0,2}\//.test(spec)) {                                                   // a file: followed
          const to = fileOf(file, spec);
          if (to !== null && where(to) === "own") follow(to, file); else named.push(`${at}, ${to === null ? "which leads to no file" : "which is not a file of the repository's own"}`);
        } else if (spec.startsWith("node:") || builtinModules.includes(spec) || /^[a-z][a-z\d+.-]*:/i.test(spec)) continue;   // Node's own, or Deno's
        else if (!(rel(file).startsWith("jobs/") && locked.has(`node_modules/${spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/")}`))) named.push(at);
      }
    };
    follow(me, null);
    ck(`the imports written in this file and in each file they lead to (${written.size} files) name no package that GitHub's logic job lacks: none of the page's, and one that jobs/package-lock.json installs only from a file of jobs/`, written.has(`${root}web/src/lib/sessions.ts`) && written.has(`${root}supabase/functions/_shared/sessions.ts`) && named.length === 0, named);

    // 2. what this run really loaded
    const self = typeof module === "object" && module !== null && Array.isArray(module.children) ? module : null;
    const loaded: string[] = [], lacking: string[] = [], seen = new Set<NodeJS.Module>();
    let fromJobs = 0;
    const walk = (m: NodeJS.Module) => {
      if (seen.has(m)) return;
      seen.add(m); loaded.push(slash(m.filename));
      for (const c of m.children) {
        const w = where(c.filename);
        if (w === "own") walk(c); else if (w === "jobs") fromJobs++; else lacking.push(`${rel(m.filename)} loads ${rel(c.filename)}`);
      }
    };
    if (self) walk(self);
    const missed = loaded.filter((f) => !written.has(f)).map(rel);
    const noList = "this file was not loaded through require, so Node kept no list of what it loaded: the second look has to be written anew for the way the file is run now";
    ck(`what this run really loaded can be listed (${loaded.length} files of the repository's own, this one first), and following the imports as written missed none of them`, loaded[0] === me && loaded.includes(`${root}web/src/lib/sessions.ts`) && missed.length === 0, self ? missed : noList);
    ck(`none of those files loaded one from web/node_modules or from anywhere else on this machine (${fromJobs} from jobs/node_modules, of packages that jobs/package-lock.json installs)`, self !== null && lacking.length === 0, self ? lacking : noList);
    reached.push(...written.keys(), ...loaded);
  }

  console.log("\n[AL] logic-tests runs, on a pull request and on a push to main, on a change to any file this file imports or reads (the deploy trap: the check of fix part 4, 23 Nov 2026)");
  {
    // This file stops a deploy of the server (deploy-server's logic checks) and of the site (deploy-web's test). A file it
    // imports or reads that changes alone, where no workflow of a pull request runs this file, would merge with no check
    // and stop the next deploy: experiments with jobs/lib/marks.ts, jobs/live_check.ts and deploy-server.yml showed it
    // (the checks of fix parts 3 and 4; no deploy stopped so), and before 23 Nov 2026 a sentence of the README could. The list is the code's, not a hand's: the files the imports lead to ([AB]'s two looks);
    // every address this file and those files build as new URL("…", import.meta.url) (a template's fixed part, or one
    // that ends with "/", is a folder); and every file and folder this run read (readText and listDir record each). A
    // folder counts with every file under it and with one that may be added there. Each must match a path of
    // logic-tests.yml, for a pull request and for a push to main, by GitHub's rule (* any characters but /, ** any).
    type TsNode = import("typescript").Node;
    const ts = createRequire(new URL("../jobs/package.json", import.meta.url))("typescript") as typeof import("typescript");
    const slash = (f: string) => f.replace(/\\/g, "/"), root = slash(fileURLToPath(new URL("../", import.meta.url)));
    const inRepo = (f: string) => slash(f).startsWith(root) && !/(^|\/)node_modules(\/|$)/.test(slash(f).slice(root.length));
    const rel = (f: string) => slash(f).slice(root.length).replace(/\/$/, "");
    const files = new Set<string>(), folders = new Set<string>();
    const isDir = (f: string) => fileStat(f, { throwIfNoEntry: false })?.isDirectory() === true;
    const add = (abs: string, folder = false) => { if (!inRepo(abs)) return; if (folder || isDir(abs)) folders.add(rel(abs)); else files.add(rel(abs)); };
    for (const f of reached) add(f);
    // every new URL("…", import.meta.url) in this file and the files it imports
    const urlsOf = (file: string): Array<{ at: string; folder: boolean }> => {
      const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest), out: Array<{ at: string; folder: boolean }> = [];
      const meta = (n: TsNode | undefined) => !!n && ts.isPropertyAccessExpression(n) && n.name.text === "url" && ts.isMetaProperty(n.expression);
      const visit = (n: TsNode): void => {
        if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "URL" && n.arguments?.length === 2 && meta(n.arguments[1])) {
          const a = n.arguments[0];
          if (ts.isStringLiteralLike(a)) out.push({ at: resolvePath(dirname(file), a.text), folder: a.text.endsWith("/") });
          else if (ts.isTemplateExpression(a)) out.push({ at: resolvePath(dirname(file), a.head.text.replace(/[^/]*$/, "")), folder: true });
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
      return out;
    };
    let built = 0;
    for (const f of reached.filter((x) => /\.[cm]?[jt]sx?$/.test(x) && inRepo(x))) for (const u of urlsOf(f)) { built++; add(u.at, u.folder); }
    for (const r of readsSeen) add(r);
    // the workflow's paths, for a push to main and for a pull request
    const wf = readText(new URL("../.github/workflows/logic-tests.yml", import.meta.url), "utf8");
    const pathsOf = (ev: string): string[] | null => { const m = new RegExp(`\\n  ${ev}:\\n(?:    .*\\n)*?    paths: \\[([^\\]]*)\\]`).exec(wf); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null; };
    const push = pathsOf("push"), pr = pathsOf("pull_request");
    const globRe = (g: string) => new RegExp(`^${g.split("**").map((x) => x.split("*").map((y) => y.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*")}$`);
    const covers = (ps: string[] | null, f: string) => !!ps && ps.some((g) => !g.startsWith("!") && globRe(g).test(f));
    // a folder address that is not in the checkout (made at run time, or a typo) is named and fails this check; its walk
    // crashed the whole file with ENOENT (R-6 of the check of fix part 5)
    const absent: string[] = [];
    const under = (dir: string): string[] => { const out: string[] = []; if (!isDir(resolvePath(root, dir))) { absent.push(dir); return out; } const walk = (d: string) => { for (const e of readdirSync(resolvePath(root, d), { withFileTypes: true })) { if (e.name === "node_modules") continue; const x = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) walk(x); else out.push(x); } }; walk(dir); return out; };
    const checked = [...files, ...[...folders].flatMap((d) => [...under(d), `${d}/a-file-added-later.ts`, `${d}/a-folder-added-later/a-file.ts`])];
    const missed = [...new Set(checked.filter((f) => !covers(push, f) || !covers(pr, f)))].sort();
    const must = ["jobs/lib/marks.ts", "jobs/lib/pfwalls.ts", "jobs/live_check.ts", "jobs/package-lock.json", ".github/workflows/deploy-server.yml", "web/src/components/Help.tsx", "web/src/lib/sessions.ts", "supabase/functions/_shared/sessions.ts", "jobs/probes/lib.ts", "jobs/probes/pf_borrow.ts"];
    const walkNamesAbsent = (() => { const n = absent.length, got = under("a-folder-that-is-not-in-the-checkout"); const named = got.length === 0 && absent.length === n + 1 && absent[n] === "a-folder-that-is-not-in-the-checkout"; absent.length = n; return named; })();
    ck(`logic-tests' paths (${push?.length ?? 0} for a push to main, ${pr?.length ?? 0} for a pull request) cover every file this file imports or reads, as the code says (${files.size} files, ${folders.size} folders, ${built} addresses built with import.meta.url, ${readsSeen.size} read in this run; ${checked.length} paths in all, ${missed.length} not covered; ${absent.length} folder addresses not in the checkout${absent.length ? `: ${absent.join(", ")}` : ""}), among them ${must.join(", ")}; and no README is read here (its checks are sim/readme.test.ts's)`,
      !!push && !!pr && missed.length === 0 && absent.length === 0 && must.every((f) => files.has(f) || [...folders].some((d) => f.startsWith(`${d}/`))) && !files.has("README.md") && !files.has("supabase/README.md"), { missed: missed.slice(0, 40), absent, push, pr });
    ck("R-6: a folder address that is not in the checkout is named by this section and fails it, instead of stopping the whole file", walkNamesAbsent);
  }

  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})();
