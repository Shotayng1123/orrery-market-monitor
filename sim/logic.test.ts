// Logic checks that need no browser and no database: exchange sessions (web and server copies must agree),
// rolling sigma bands, exchange-local dating of Yahoo bars.  Run:  cd jobs && npx tsx ../sim/logic.test.ts
import * as web from "../web/src/lib/sessions.ts";
import * as srv from "../supabase/functions/_shared/sessions.ts";
import { rollingBands, pct } from "../web/src/lib/stats.ts";
import { fxClosesFromDaily, fxClosesFromHourly, fxDay, suspectBars } from "../supabase/functions/_shared/fx.ts";
import { AFTER_CLOSE_MIN, quoteMove, scanDue, sessionMove, stockMarket } from "../supabase/functions/_shared/moves.ts";
import { b64u, encryptPush, pushEndpointOk, unb64u, vapidHeader } from "../supabase/functions/_shared/webpush.ts";
import { alertNote, moveMark, notesFor, stampSgt, wanted, type AlertLite } from "../supabase/functions/_shared/pushrules.ts";
import { CODE_MAX_TRIES, CODE_TTL_MIN, checkRefusal, cleanCode, codeHash, codeMail, newCode, noticeMail, sendRefusal, verifyLink } from "../supabase/functions/_shared/signup.ts";
import { readVerify } from "../web/src/lib/verify.ts";
import { SmtpError, appPassword, buildMessage, dotStuff, parseFrom, smtpTalk, type Wire } from "../supabase/functions/_shared/smtp.ts";
import { mailReady, mailSetup, resendRequest } from "../supabase/functions/_shared/mail.ts";
import { avgTurnover, barOnOrBefore, betaCorr, maxDrawdown, monthsBack, perfRows, range52w, realisedVol, type Bar } from "../supabase/functions/_shared/stockstats.ts";
import { fyLabel, pickUnit, progress, qEndLabel, qLabel, quarterEnd, ratiosOf, singleQuarters, valuation, type FinPeriod, type FinSet } from "../supabase/functions/_shared/fin.ts";
import { legacyStatements, yahooFin, yahooFinTypes } from "../supabase/functions/_shared/finsrc.ts";
import { keyStatsOf } from "../supabase/functions/_shared/yahoo.ts";
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
      ser("annualNetIncomeCommonStockholders", [[A[0], 99.8e9], [A[1], 97e9], [A[2], 93.7e9], [A[3], 112e9]]),
      ser("annualDilutedEPS", [[A[0], 6.11], [A[1], 6.13], [A[2], 6.08], [A[3], 7.46]]),
      ser("annualDilutedAverageShares", [[A[3], 15.0e9]]),
      ser("annualCapitalExpenditure", [[A[2], -9.4e9], [A[3], -12.7e9]]),
      ser("annualOperatingCashFlow", [[A[2], 118e9], [A[3], 111e9]]),
      ser("annualTotalAssets", [[A[3], 359e9]]), ser("annualStockholdersEquity", [[A[3], 74e9]]), ser("annualCurrentDebt", [[A[3], 20e9]]), ser("annualLongTermDebt", [[A[3], 78e9]]), ser("annualCashAndCashEquivalents", [[A[3], 36e9]]),
      ser("annualOrdinarySharesNumber", [[A[3], 14.8e9]]),
      ser("annualSomethingNew", [[A[3], 1]]),
      ser("quarterlyTotalRevenue", Q.map((d, i) => [d, 90e9 + i * 5e9] as [string, number])),
      ser("quarterlyOperatingIncome", [[Q[0], 28e9], [Q[1], null], [Q[2], 30e9], [Q[4], 33e9]]),
      { meta: { type: ["quarterlyNetIncomeCommonStockholders"] }, quarterlyNetIncomeCommonStockholders: [{ asOfDate: Q[4], reportedValue: { raw: "n/a" } }, { asOfDate: "not a date", reportedValue: { raw: 5 } }, { reportedValue: { raw: 5 } }] },
      { meta: {}, nothing: [] }, null,
    ] } };
    const f = yahooFin(json, "USD", "2026-11-18");
    ck("the request names every line once for years and once for quarters", yahooFinTypes().split(",").length === 40 && yahooFinTypes().includes("annualTotalRevenue") && yahooFinTypes().includes("quarterlyCapitalExpenditure") && new Set(yahooFinTypes().split(",")).size === 40);
    ck("years come out oldest first, named by the month and year they end in; quarters by their last month", f.annual.periods.map((p) => p.label).join() === "FY9/22,FY9/23,FY9/24,FY9/25" && f.quarterly.periods.map((p) => p.label).join() === "Sep 25,Dec 25,Mar 26,Jun 26,Sep 26" && f.annual.periods.every((p) => p.kind === "FY" && p.months === 12) && f.quarterly.periods.every((p) => p.kind === "Q" && p.months === 3));
    ck("each figure lands on its line and its period, exactly as sent", f.annual.lines.revenue!.join() === "394000000000,383000000000,391000000000,416000000000" && f.annual.lines.eps!.join() === "6.11,6.13,6.08,7.46" && f.annual.lines.ni![3] === 112e9 && f.annual.lines.cogs![0] === 224e9);
    ck("a line reported for some periods only is empty (not zero) in the others", f.annual.lines.ocf!.join() === ",,118000000000,111000000000" && f.annual.lines.assets!.slice(0, 3).every((v) => v === null) && f.annual.lines.assets![3] === 359e9 && f.quarterly.lines.op!.join() === "28000000000,,30000000000,,33000000000");
    ck("capex is shown as the cash paid out, a positive number", f.annual.lines.capex![2] === 9.4e9 && f.annual.lines.capex![3] === 12.7e9);
    ck("lines Yahoo does not have stay absent: no ordinary profit, no extraordinary items, no dividend per share, no guidance", f.annual.lines.ordinary === undefined && f.annual.lines.extraInc === undefined && f.annual.lines.dps === undefined && f.guidance === null && f.annual.periods.every((p) => p.kind !== "FC"));
    ck("a series this page does not know, a value that is not a number, a date that is not a date and an empty entry are all skipped", f.quarterly.lines.ni === undefined && !Object.keys(f.annual.lines).includes("SomethingNew") && f.quarterly.periods.length === 5);
    ck("the unit comes from the revenue (bn here), and the ratios are worked out from the lines", f.unit.label === "bn" && f.source === "yahoo" && f.currency === "USD" && near(f.ratios.annual.salesYoy![3], (416 / 391 - 1) * 100) && near(f.ratios.annual.gpm![3], 195 / 416 * 100) && near(f.ratios.annual.opm![0], 119 / 394 * 100) && f.ratios.annual.payout!.every((x) => x === null) && near(f.ratios.quarterly.salesYoy![4], (110 / 90 - 1) * 100) && f.ratios.quarterly.salesYoy![3] === null, f.ratios);
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

  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
  process.exit(fail ? 1 : 0);
})();
