// Logic checks that need no browser and no database: exchange sessions (web and server copies must agree),
// rolling sigma bands, exchange-local dating of Yahoo bars.  Run:  cd jobs && npx tsx ../sim/logic.test.ts
import * as web from "../web/src/lib/sessions.ts";
import * as srv from "../supabase/functions/_shared/sessions.ts";
import { rollingBands, pct } from "../web/src/lib/stats.ts";
import { fxClosesFromDaily, fxClosesFromHourly, fxDay, suspectBars } from "../supabase/functions/_shared/fx.ts";

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

console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
process.exit(fail ? 1 : 0);
