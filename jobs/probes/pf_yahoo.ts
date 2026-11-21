// The paper portfolio's probe of Yahoo Finance IN SESSION (P-0b: C/portfolio-plan.md §3.1b item 2 with the PMs'
// additions of 21 Nov 2026). The run of 20 Nov 2026 was at 12:38 UTC, before New York's open and after Tokyo's close
// (C/probes/pf_yahoo.log): its bids, asks and option bids were not in-session. This one is run twice:
//   once in New York's session, 14:30 to 21:00 UTC (not in its first or last quarter of an hour);
//   once in Tokyo's, at about 09:30 JST = 00:30 UTC (the first bars are read then: see 4), or 03:30 to 06:30 UTC.
// It finds by itself which of the two is open (the quotes' marketState) and says so in its first lines. With neither
// open it prints the results-date fields and stops: an out-of-session quote is what the log of 20 Nov already holds.
// Yahoo Finance is unofficial; the owner said yes on 20 Nov 2026 to its bid and ask and its US option chains, each
// "used only after its probe shows it is there and current" (OD-P5). Read-only, no key, nothing written; the session
// cookie and crumb are never printed. FX never takes Yahoo's bid and ask (C-37): USDJPY=X is read for its last price
// only, to put a yen turnover in dollars.
//
// It prints:
//   1. the v7 quote read 12 times, 15 s apart (one request each time, every symbol in it): every reading of the open
//      market's four names (NVDA, AAPL, SPY and QQQ in New York; 7203.T, 1306.T, 6758.T and 1321.T in Tokyo): bid ×
//      size, ask × size, the spread, the last price and its age, the mid against the last price; and for every
//      symbol (those eight, the trackers and bond funds of §2.20, ES=F and the front month of each of P-5's 18 roots)
//      a summary: readings with a usable quote, the spread's minimum, median and maximum, ask − bid in price, the mid
//      against the last price, the quote's age (the reading's time less regularMarketTime) beside the delay Yahoo
//      declares (V-2, V-5; A-40), and on how many readings A's four tests of a quote pass (X-19a);
//   2. for the open market's four names: the median quoted spread beside its tier (V-1: A's fallback by size; the
//      tier of the 60-session average volume at the last complete close, in dollars): more than twice or less than
//      half goes back to A; the larger of that tier and one tick, the smallest ask − bid seen standing for the tick
//      (the tick table is JPX's, held in pf_jpx); and Abdi and Ranaldo's estimate beside it (X-19; not used for a
//      fill since V-1);
//   3. today's one-minute bars of the open market's names: the newest bar's age beside the declared delay (V-5);
//   4. Tokyo only: today's first bars of 7203.T and 1306.T in full, read at the start of the run and again at its
//      end, to see whether bars 09:00 to 09:04 exist before they are merged into a bar stamped 09:05 (V-3, V-4);
//   5. New York only: the option chains of SPY, ^SPX, QQQ and NVDA, the nearest expiry and the first one 25 days or
//      more ahead: how many contracts carry a bid, an ask and an implied volatility, the three strikes nearest the
//      money on each side, and the implied volatility at the money (OD-P5 (c); P-11);
//   6. Yahoo's results-date fields as it sends them (earningsTimestamp, earningsTimestampStart, earningsTimestampEnd,
//      isEarningsDateEstimate and any other field named "earnings…") for 7203.T, 6758.T, NVDA and AAPL, each moment
//      in UTC, JST and New York's time (A-37: no log holds them).
// What needs no session is read by pf_yahoo_hist (complete sessions) and pf_yahoo_funds (funds), not here.
//
// Requests: at most 31, all to Yahoo, 1.2 s apart: the session (2), the =F quote that names each front month (1), the
// quote 12 times (12), four names' daily bars (4), then in New York four names' one-minute bars (4) and eight chains
// (8), or in Tokyo two names' one-minute bars read twice (4): 31 in New York, 23 in Tokyo, 4 with neither market open.
// A 429 is asked again once after 5 s, three times at most in a run (so at most 34); after three 429s in a row nothing
// more is asked.
// The run takes about four minutes.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = pf_yahoo, runtime = node
import { head, pause, requestsMade, yahooSession } from "./lib.ts";
import { GAP, abdiRanaldo, chart, daily, dayIn, f, hmIn, iso, median, minutesByDay, num, quotes, spreadBp, str, tierBp, yget, yahooStopped, type Day, type J } from "./yahoo_lib.ts";

const MAX = 31, SAMPLES = 12, EVERY = 15000;
const NY = "America/New_York", TK = "Asia/Tokyo";
const US4 = ["NVDA", "AAPL", "SPY", "QQQ"], TK4 = ["7203.T", "1306.T", "6758.T", "1321.T"];
const OTHERS = ["IVV", "EWJ", "HEWJ", "ACWI", "MLRG", "EEM", "EPP", "IEUR", "BNDW", "AGG", "IAGG", "BNDX", "SHY", "IEF", "TLT", "LQD", "HYG", "8306.T", "9984.T", "1475.T", "2559.T", "AGGU.L"];
const ROOTS = ["ES", "NQ", "YM", "RTY", "NKD", "NIY", "ZT", "ZF", "ZN", "TN", "ZB", "UB", "CL", "BZ", "NG", "GC", "SI", "HG"];
const RESULTS = ["7203.T", "6758.T", "NVDA", "AAPL"];

const t0 = Date.now();
const sec = () => Math.floor(Date.now() / 1000);
const clock = (tz: string, t: number) => `${dayIn(tz, t)} ${hmIn(tz, t)}`;
const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);
/** A price or a width without a float's tail. */
const g = (x: number | null): string => (x == null || !Number.isFinite(x) ? "–" : String(Number(x.toPrecision(7))));
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC = ${clock(NY, t0 / 1000)} in New York = ${clock(TK, t0 / 1000)} in Tokyo`);

head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await yahooSession();
await pause(GAP);
if (!s) { console.log("  no session: nothing more is asked"); console.log(`\nrequests made: ${requestsMade()} (at most ${MAX})`); }

// ---- the front month of each of P-5's roots, as the =F quote names it ----
const fronts: string[] = [];
if (s) {
  head("The front month of each of P-5's 18 roots, as its =F quote names it (underlyingSymbol)");
  const fq = await quotes(ROOTS.map((r) => `${r}=F`), s);
  for (const r of ROOTS) { const u = str(fq.get(`${r}=F`)?.underlyingSymbol); if (u) fronts.push(u); }
  console.log(`  ${fq.size} of ${ROOTS.length} =F quotes answered; fronts: ${fronts.join(" ") || "none named"}${ROOTS.filter((r) => !str(fq.get(`${r}=F`)?.underlyingSymbol)).length ? `; no front named for ${ROOTS.filter((r) => !str(fq.get(`${r}=F`)?.underlyingSymbol)).join(" ")}` : ""}`);
}
const ALL = [...new Set([...US4, ...TK4, ...OTHERS, "ES=F", ...fronts, "USDJPY=X"])];

// ---- the quote, read SAMPLES times ----
interface Reading { at: number; q: J }
const readings = new Map<string, Reading[]>();
const take = async (): Promise<number> => {
  if (!s) return 0;
  const at = Date.now(), got = await quotes(ALL, s);
  for (const [sym, q] of got) (readings.get(sym) ?? readings.set(sym, []).get(sym)!).push({ at, q });
  return got.size;
};
const state = (sym: string) => String(readings.get(sym)?.[0]?.q.marketState ?? "–");
let usOpen = false, tkOpen = false;
if (s) {
  head(`1. The v7 quote of ${ALL.length} symbols, reading 1: which market is in its regular session`);
  const n = await take();
  usOpen = ["NVDA", "SPY"].some((x) => state(x) === "REGULAR"); tkOpen = state("7203.T") === "REGULAR";
  const jst = hmIn(TK, sec());
  console.log(`  ${n} of ${ALL.length} answered${ALL.filter((x) => !readings.has(x)).length ? `; not: ${ALL.filter((x) => !readings.has(x)).join(" ")}` : ""}`);
  console.log(`  marketState: NVDA ${state("NVDA")}, SPY ${state("SPY")}, 7203.T ${state("7203.T")}, 1306.T ${state("1306.T")}, ES=F ${state("ES=F")}, AGGU.L ${state("AGGU.L")}`);
  console.log(`  IN SESSION: ${usOpen ? "New York" : tkOpen ? `Tokyo${jst >= "11:30" && jst < "12:30" ? " by Yahoo's state, but it is the midday break there (11:30 to 12:30 JST): a quote read now is not a trading quote" : ""}` : "NEITHER New York nor Tokyo. This run's bids and asks would be out of session, which the log of 20 Nov 2026 already holds: only the results-date fields are printed. Run it in New York's 14:30–21:00 UTC or Tokyo's 00:00–02:30 or 03:30–06:30 UTC"}`);
}
const four = usOpen ? US4 : tkOpen ? TK4 : [];
const tz = usOpen ? NY : TK;

// ---- the four names' daily bars: X-3's 60-session turnover for the tier, and Abdi and Ranaldo's estimate ----
const days = new Map<string, Day[]>();
if (s && four.length) {
  head(`2a. ${four.join(", ")}: six months of daily bars (the 60-session average volume for A's tier; Abdi and Ranaldo's estimate)`);
  for (const sym of four) {
    const b = await chart(sym, "range=6mo&interval=1d");
    if (!b) { console.log(`  ${sym}: no chart`); continue; }
    // a session still open has no complete bar: today's is left out
    const rows = daily(b).filter((r) => r.d < dayIn(b.tz, sec()));
    days.set(sym, rows);
    console.log(`  ${sym}: ${rows.length} complete daily bars to ${rows[rows.length - 1]?.d ?? "–"} (${b.tz}; today's bar left out)`);
  }
}

// ---- today's one-minute bars: the newest bar's age; Tokyo's first bars ----
const firstBars = async (sym: string, when: string): Promise<void> => {
  const b = await chart(sym, "range=1d&interval=1m");
  if (!b) { console.log(`  ${sym} (${when}): no chart`); return; }
  const today = dayIn(b.tz, sec()), bars = (minutesByDay(b).get(today) ?? []);
  const newest = bars[bars.length - 1], declared = readings.get(sym)?.[0]?.q.exchangeDataDelayedBy;
  console.log(`  ${sym} (${when}, read at ${hmIn(b.tz, sec())} local): ${bars.length} one-minute bars today with a price; the newest ${newest ? `${newest.hm}, ${((sec() - newest.t) / 60).toFixed(1)} min before this reading` : "–"}; declared delay ${declared ?? "–"} min`);
  for (const x of bars.slice(0, b.tz === TK ? 10 : 3)) console.log(`    ${x.hm}  open ${g(x.o)} high ${g(x.h)} low ${g(x.l)} close ${g(x.c)} volume ${x.v}`);
  if (b.tz === TK) { const early = bars.filter((x) => x.hm < "09:05"); console.log(`    bars stamped 09:00 to 09:04: ${early.length ? `${early.length} (${early.map((x) => `${x.hm} volume ${x.v}`).join(", ")})` : "none"}; the first bar is stamped ${bars[0]?.hm ?? "–"}`); }
};
if (s && four.length) {
  head(usOpen ? "3. Today's one-minute bars: the newest bar's age beside the declared delay (V-5); the first three bars" : "3 and 4. Tokyo: today's one-minute bars of 7203.T and 1306.T, the first reading: the first ten bars in full (V-3, V-4), the newest bar's age (V-5)");
  for (const sym of usOpen ? US4 : ["7203.T", "1306.T"]) await firstBars(sym, "first reading");
}

// ---- readings 2 to SAMPLES ----
if (s && four.length) {
  head(`1 (continued). Readings 2 to ${SAMPLES}, ${EVERY / 1000} s apart`);
  for (let k = 2; k <= SAMPLES && !yahooStopped(); k++) {
    await pause(Math.max(0, EVERY - GAP));
    const n = await take();
    console.log(`  reading ${k} at ${hms(Date.now())} UTC: ${n} symbols`);
  }
}

// ---- the summary of the readings ----
const usdJpy = num(readings.get("USDJPY=X")?.[0]?.q.regularMarketPrice);
/** The 60-session average volume from complete daily bars (X-3; a session whose volume repeats the one before is
 *  left out, C-36), or the quote's three-month figure where no bars were read. */
const adtv = (sym: string): { shares: number | null; from: string } => {
  const rows = days.get(sym)?.slice(-60) ?? [];
  const vols = rows.map((r, i) => (r.v != null && r.v > 0 && !(i > 0 && rows[i - 1].v === r.v) ? r.v : null)).filter((v): v is number => v != null);
  if (vols.length >= 20) return { shares: vols.reduce((a, b) => a + b, 0) / vols.length, from: `${vols.length} complete sessions' daily bars` };
  return { shares: num(readings.get(sym)?.[0]?.q.averageDailyVolume3Month), from: "the quote's three-month average" };
};
/** A's tier for a name (V-1): its average volume × its last complete close (the quote's last price where no daily
 *  bars were read), in dollars at USDJPY's last price for a yen name. */
const tierOf = (sym: string): { bp: number; usd: number; from: string } | null => {
  const q = readings.get(sym)?.[0]?.q, rows = days.get(sym), close = rows?.length ? rows[rows.length - 1].c : null, px = close ?? num(q?.regularMarketPrice), a = adtv(sym), cur = String(q?.currency ?? "");
  if (px == null || a.shares == null) return null;
  const fx = cur === "USD" ? 1 : cur === "JPY" && usdJpy ? 1 / usdJpy : null;
  if (fx == null) return null;
  const usd = a.shares * px * fx;
  return { bp: tierBp(usd), usd, from: `${a.from}, at ${close != null ? `the last complete close ${g(close)}` : "the quote's last price"}${cur === "JPY" ? ` and USDJPY ${g(usdJpy)}` : ""}` };
};
if (s && four.length) {
  head("1 (summary). Every symbol over the readings: a usable quote is a bid above zero and an ask above the bid");
  console.log("  A's four tests of a quote (X-19a): (1) the exchange is in its regular session; (2) bid > 0 and ask > bid; (3) bid − (ask − bid) ≤ last ≤ ask + (ask − bid); (4) the spread is at most 20 times the name's tier. Here (1) is Yahoo's marketState REGULAR, and (4) is worked out for stocks and funds in USD or JPY only");
  for (const sym of ALL.filter((x) => x !== "USDJPY=X")) {
    const rs = readings.get(sym) ?? [];
    if (!rs.length) { console.log(`  ${sym}: no quote`); continue; }
    if (!rs.some((r) => String(r.q.marketState) === "REGULAR")) { console.log(`  ${sym}: state ${rs[0].q.marketState ?? "–"} on every reading: its market is not in session, so its quote is not summarized (last ${rs[0].q.regularMarketPrice ?? "–"} at ${iso(num(rs[0].q.regularMarketTime))}; declared delay ${rs[0].q.exchangeDataDelayedBy ?? "–"} min)`); continue; }
    const q0 = rs[0].q, tier = /=F$|\.(CME|CBT|NYM|CMX)$/.test(sym) ? null : tierOf(sym);
    const sp: number[] = [], width: number[] = [], off: number[] = [], age: number[] = [], sizes: string[] = [];
    let t1 = 0, t2 = 0, t3 = 0, t4 = 0, all4 = 0;
    const distinct = new Set<string>();
    for (const r of rs) {
      const b = num(r.q.bid), a = num(r.q.ask), last = num(r.q.regularMarketPrice), tm = num(r.q.regularMarketTime), bp = spreadBp(r.q);
      distinct.add(`${b}/${a}`);
      if (tm != null) age.push(r.at / 1000 - tm);
      const ok1 = String(r.q.marketState) === "REGULAR", ok2 = bp != null;
      const ok3 = ok2 && last != null && (b as number) - ((a as number) - (b as number)) <= last && last <= (a as number) + ((a as number) - (b as number));
      const ok4 = ok2 && tier != null && (bp as number) <= 20 * tier.bp;
      if (ok1) t1++; if (ok2) t2++; if (ok3) t3++; if (ok4) t4++; if (ok1 && ok2 && ok3 && (tier == null || ok4)) all4++;
      if (bp != null) { sp.push(bp); width.push((a as number) - (b as number)); if (last) off.push((((a as number) + (b as number)) / 2 / last - 1) * 1e4); sizes.push(`${r.q.bidSize ?? "–"}×${r.q.askSize ?? "–"}`); }
    }
    const worst = off.length ? off.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0) : null;
    console.log(`  ${sym}: "${q0.shortName ?? q0.longName ?? "–"}" · ${q0.fullExchangeName ?? q0.exchange ?? "–"} · ${q0.currency ?? "–"} · state ${q0.marketState ?? "–"} · declared delay ${q0.exchangeDataDelayedBy ?? "–"} min${q0.quoteSourceName ? ` (${q0.quoteSourceName})` : ""} · last ${q0.regularMarketPrice ?? "–"} at ${iso(num(q0.regularMarketTime))}`);
    console.log(`    usable on ${sp.length} of ${rs.length} readings; ${distinct.size} different bid/ask pairs; spread bp min ${f(sp.length ? Math.min(...sp) : null)} median ${f(median(sp))} max ${f(sp.length ? Math.max(...sp) : null)}; ask − bid median ${g(median(width))}; sizes (bid×ask) ${[...new Set(sizes)].slice(0, 4).join(", ") || "–"}; mid against last: median ${f(median(off), 1)} bp, widest ${f(worst, 1)} bp; the quote's age: median ${f(median(age) == null ? null : (median(age) as number) / 60, 1)} min (${f(age.length ? Math.min(...age) / 60 : null, 1)} to ${f(age.length ? Math.max(...age) / 60 : null, 1)})`);
    console.log(`    A's tests pass on: (1) ${t1}, (2) ${t2}, (3) ${t3}${tier ? `, (4) ${t4}` : ""} of ${rs.length} readings; ${tier ? "all four" : "(1) to (3)"} on ${all4}${tier ? ` · tier ${tier.bp} bp (average value traded USD ${(tier.usd / 1e6).toFixed(1)}m a day, from ${tier.from})` : ""}`);
  }

  head(`2. ${four.join(", ")}: every reading; the median quoted spread beside A's tier (V-1) and beside Abdi and Ranaldo's estimate (X-19)`);
  for (const sym of four) {
    const rs = readings.get(sym) ?? [];
    console.log(`\n-- ${sym}`);
    for (const r of rs) {
      const bp = spreadBp(r.q), tm = num(r.q.regularMarketTime), last = num(r.q.regularMarketPrice);
      console.log(`  ${hms(r.at)} UTC  bid ${g(num(r.q.bid))} × ${r.q.bidSize ?? "–"}, ask ${g(num(r.q.ask))} × ${r.q.askSize ?? "–"}${bp != null ? ` (${bp.toFixed(2)} bp)` : " (not usable)"} · last ${r.q.regularMarketPrice ?? "–"} at ${tm != null ? hmIn(tz, tm) : "–"} local, ${tm != null ? ((r.at / 1000 - tm) / 60).toFixed(1) : "–"} min old${bp != null && last ? ` · the mid ${((((num(r.q.ask) as number) + (num(r.q.bid) as number)) / 2 / last - 1) * 1e4).toFixed(1)} bp from the last` : ""} · state ${r.q.marketState ?? "–"}`);
    }
    const sp = rs.map((r) => (String(r.q.marketState) === "REGULAR" ? spreadBp(r.q) : null)).filter((x): x is number => x != null), med = median(sp), tier = tierOf(sym);
    const widths = rs.filter((r) => String(r.q.marketState) === "REGULAR" && spreadBp(r.q) != null).map((r) => (num(r.q.ask) as number) - (num(r.q.bid) as number)), least = widths.length ? Math.min(...widths) : null, px = num(rs[0]?.q.regularMarketPrice);
    console.log(`  the smallest ask − bid seen: ${g(least)}${least != null && px ? ` (${(least / px * 1e4).toFixed(2)} bp of the last price): one tick is no more than that` : ""}`);
    const est = days.has(sym) ? abdiRanaldo(days.get(sym) as Day[]) : { bp: null, sessions: 0, to: null };
    console.log(`  median quoted spread over ${sp.length} in-session readings: ${f(med)} bp; A's tier ${tier ? `${tier.bp} bp (USD ${(tier.usd / 1e6).toFixed(1)}m a day, from ${tier.from})` : "–"}${med != null && tier ? `: the tier is ${(tier.bp / med).toFixed(2)} times the median: ${tier.bp > 2 * med ? "MORE THAN TWICE IT: back to A (V-1)" : tier.bp < med / 2 ? "LESS THAN HALF OF IT: back to A (V-1)" : "within half to twice"}` : ""}`);
    // V-1's fallback is the larger of one tick and the tier; the tick table is JPX's (pf_jpx, held), so the smallest ask − bid seen stands for one tick here
    const tickBp = least != null && px ? (least / px) * 1e4 : null, fallback = tier && tickBp != null ? Math.max(tier.bp, tickBp) : null;
    if (fallback != null && med) console.log(`  A's fallback spread (V-1: the larger of one tick and the tier), the smallest ask − bid seen standing for one tick: ${fallback.toFixed(2)} bp, ${(fallback / med).toFixed(2)} times the median quoted spread`);
    console.log(`  Abdi–Ranaldo over the ${est.sessions} sessions to ${est.to ?? "–"} (E): ${f(est.bp)} bp${est.bp != null && med ? `, ${(est.bp / med).toFixed(1)} times the median quoted spread${est.bp > 2 * med ? ": ABOVE TWICE IT" : ""}` : ""} (not used for a fill since V-1)`);
  }
}

// ---- Tokyo: the first bars again ----
if (s && tkOpen) {
  head("4. Tokyo: the first bars of 7203.T and 1306.T, the second reading (are bars 09:00 to 09:04 still there, or merged?)");
  for (const sym of ["7203.T", "1306.T"]) await firstBars(sym, "second reading");
}

// ---- New York: the option chains ----
if (s && usOpen) {
  head("5. Option chains in session (OD-P5 (c); P-11): SPY, ^SPX, QQQ, NVDA; the nearest expiry and the first 25 days or more ahead");
  const show = (sym: string, res: J, label: string) => {
    const uq = (res.quote ?? {}) as J, spot = num(uq.regularMarketPrice);
    const o = ((res.options as J[] | undefined) ?? [])[0] ?? {};
    const calls = (o.calls as J[] | undefined) ?? [], puts = (o.puts as J[] | undefined) ?? [];
    const count = (xs: J[], k: string) => xs.filter((x) => (num(x[k]) ?? 0) > 0).length;
    console.log(`  ${sym}, ${label} ${iso(num(o.expirationDate)).slice(0, 10)}: underlying last ${spot ?? "–"} at ${iso(num(uq.regularMarketTime))} (${uq.marketState ?? "–"}); ${calls.length} calls, ${puts.length} puts`);
    for (const [side, xs] of [["calls", calls], ["puts", puts]] as Array<[string, J[]]>) {
      const two = xs.filter((x) => (num(x.bid) ?? 0) > 0 && (num(x.ask) ?? 0) > (num(x.bid) ?? 0));
      const near = spot == null ? [] : two.filter((x) => Math.abs((num(x.strike) ?? 0) / spot - 1) <= 0.02);
      const ivs = near.map((x) => num(x.impliedVolatility)).filter((x): x is number => x != null && x > 0.001);
      const rel = near.map((x) => (((num(x.ask) as number) - (num(x.bid) as number)) / (((num(x.ask) as number) + (num(x.bid) as number)) / 2)) * 100);
      console.log(`    ${side}: bid > 0 ${count(xs, "bid")}, ask > 0 ${count(xs, "ask")}, a bid and an ask above it ${two.length}, implied vol > 0 ${count(xs, "impliedVolatility")}, volume > 0 ${count(xs, "volume")}, open interest > 0 ${count(xs, "openInterest")}; within 2% of the money with a two-sided quote: ${near.length}, their implied vol median ${f(median(ivs), 4)} (${f(ivs.length ? Math.min(...ivs) : null, 4)} to ${f(ivs.length ? Math.max(...ivs) : null, 4)}), their spread median ${f(median(rel), 1)}% of the mid`);
      const three = spot == null ? xs.slice(0, 3) : [...xs].sort((a, b) => Math.abs((num(a.strike) ?? 0) - spot) - Math.abs((num(b.strike) ?? 0) - spot)).slice(0, 3);
      for (const x of three) console.log(`      ${x.contractSymbol ?? "–"}: strike ${x.strike ?? "–"}, bid ${x.bid ?? "–"}, ask ${x.ask ?? "–"}, last ${x.lastPrice ?? "–"} at ${iso(num(x.lastTradeDate))}, implied vol ${x.impliedVolatility ?? "–"}, volume ${x.volume ?? "–"}, open interest ${x.openInterest ?? "–"}`);
    }
  };
  for (const sym of ["SPY", "^SPX", "QQQ", "NVDA"]) {
    const base = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?crumb=${encodeURIComponent(s.crumb)}`;
    const res = ((((await yget(base, { cookie: s.cookie }))?.optionChain as { result?: J[] } | undefined)?.result) ?? [])[0];
    if (!res) { console.log(`  ${sym}: no chain`); continue; }
    const exps = (res.expirationDates as number[] | undefined) ?? [];
    console.log(`  ${sym}: ${exps.length} expiries (${exps.slice(0, 3).map((t) => iso(t).slice(0, 10)).join(", ")} … ${exps.length ? iso(exps[exps.length - 1]).slice(0, 10) : "–"}), ${((res.strikes as number[] | undefined) ?? []).length} strikes`);
    show(sym, res, "the nearest expiry");
    const later = exps.find((t) => t >= sec() + 25 * 86400);
    if (later == null) { console.log(`  ${sym}: no expiry 25 days or more ahead`); continue; }
    const res2 = ((((await yget(`${base}&date=${later}`, { cookie: s.cookie }))?.optionChain as { result?: J[] } | undefined)?.result) ?? [])[0];
    if (res2) show(sym, res2, "the first expiry 25 days or more ahead,"); else console.log(`  ${sym}: no chain for ${iso(later).slice(0, 10)}`);
  }
}

// ---- A-37: the results-date fields as Yahoo sends them ----
if (s) {
  head("6. Yahoo's results-date fields as sent (A-37): every field of the quote named \"earnings…\", each moment in UTC, JST and New York's time");
  for (const sym of RESULTS) {
    const q = readings.get(sym)?.[0]?.q;
    if (!q) { console.log(`  ${sym}: no quote`); continue; }
    const keys = Object.keys(q).filter((k) => /earnings/i.test(k)).sort();
    console.log(`  ${sym}: ${["earningsTimestamp", "earningsTimestampStart", "isEarningsDateEstimate"].map((k) => `${k} ${k in q ? JSON.stringify(q[k]) : "ABSENT"}`).join("; ")}`);
    for (const k of keys) { const v = q[k], t = num(v); console.log(`    ${k}: ${JSON.stringify(v)}${t != null && t > 1e9 && t < 4e9 ? ` = ${iso(t)} = ${clock(TK, t)} JST = ${clock(NY, t)} New York` : ""}`); }
    if (!keys.length) console.log("    no field named \"earnings…\" in this quote");
  }
}

if (s) console.log(`\nrequests made: ${requestsMade()} (at most ${MAX} planned, and at most 3 asked again after a 429); ${Math.round((Date.now() - t0) / 1000)} s`);
