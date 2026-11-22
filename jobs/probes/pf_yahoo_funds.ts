// The paper portfolio's probe of Yahoo Finance for FUNDS (P-0b: C/portfolio-plan.md §3.1b item 9, and the parts of
// items 2 and 3 that are Yahoo's and need no open market). Yahoo Finance is unofficial. Read-only, no key, nothing
// written; the session cookie and crumb are never printed. By Yahoo's search, quote, quoteSummary and chart only.
// It prints:
//   1. V-19 (B): government bond funds that carry non-US duration, for the Global macro and Fixed-income books, which
//      cannot trade JGB, Bund or Gilt futures (none is on Yahoo: C/probes/yahoo_futures.log l.467–479). Six searches
//      (Japan's government bonds, gilts, Bunds, euro government bonds), then one quote of what they find with 2251.T
//      and 612A.T (the two the search of 20 Nov showed) and six candidates named from the engineer's memory, not the
//      PMs' (2561.T, 2510.T, IGLT.L, VGOV.L, IS0L.DE, EXX6.DE: one that does not answer is the finding). For each
//      fund that answers, up to ten: its name, exchange, currency, fee and assets as the quote gives them; a year of
//      daily bars: sessions, sessions with no volume, the 60-session average volume and value, the distributions; and
//      for Tokyo's funds what Yahoo's profile says the fund follows (its index, if the text names one);
//   2. V-14 (B): three candidates for the Global Aggregate's daily line, each against AGGU.L, the exact-index fund,
//      on weekly total returns over 156 weeks: BNDW; AGG with IAGG; AGG with BNDX. The pairs' weight is the dollar
//      share AGGU.L's own holdings file gives, which pf_bench reads: here the tracking error is printed for a share
//      of 30% to 60% in steps of five points, and for the share that fits best (E, fitted, not the file's figure), so
//      that the row for the file's share can be read off. B's line: within 0.50% a year;
//   3. V-7 (A): EWJ's distributions of the last three years as Yahoo's events give them, by date, with each calendar
//      year's sum and the quote's two yield fields (0.8% and 3.83% on 20 Nov), to set beside iShares' own
//      distribution table, which pf_bench reads;
//   4. C-39 (A): 2559.T, whose year's total return read −88.44% on 20 Nov with no split among its events: its five
//      largest one-day changes in two years, with the closes and volumes around the largest, and its split events.
// Requests: at most 30, all to Yahoo, 1.2 s apart: the session (2), six searches (6), one quote (1), up to four
// profiles (4), up to ten funds' bars (10), five funds' bars for the weekly returns (5), EWJ's (1) and 2559.T's (1).
// A 429 is asked again once after 5 s, three times at most in a run (so at most 33); after three 429s in a row
// nothing more is asked.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = pf_yahoo_funds, runtime = node
import { head, masked, pause, requestsMade, yahooSession } from "./lib.ts";
import { GAP, chart, daily, dayIn, f, iso, median, num, pct, quotes, sd, str, totalReturns, unplacedWords, yget, type Day, type J } from "./yahoo_lib.ts";

const MAX = 30;
const t0 = Date.now(), nowS = Math.floor(t0 / 1000);
console.log(`run at ${new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC`);
head("Yahoo Finance: a session (cookie and crumb), as the server gets one");
const s = await yahooSession();
await pause(GAP);

// ---- 1. government bond funds with non-US duration ----
head("1. V-19: searches for government bond funds that carry non-US duration");
type Hit = { symbol: string; name: string; type: string; exch: string };
const found = new Map<string, Hit>();
for (const term of ["Japan Government Bond ETF", "JGB ETF", "UK Gilts UCITS ETF", "Germany Government Bond UCITS ETF", "Bund ETF", "Euro Government Bond UCITS ETF"]) {
  const j = await yget(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=10&newsCount=0&listsCount=0`);
  const hits: Hit[] = ((j?.quotes as J[] | undefined) ?? []).map((x) => ({ symbol: String(x.symbol ?? ""), name: String(x.longname ?? x.shortname ?? ""), type: String(x.quoteType ?? ""), exch: String(x.exchDisp ?? x.exchange ?? "") })).filter((x) => x.symbol);
  console.log(`  "${term}": ${hits.length ? hits.map((x) => `${x.symbol} (${x.name}; ${x.type}; ${x.exch})`).join(" · ") : "nothing"}`);
  for (const h of hits) if (/ETF/i.test(h.type) && /\.(T|L|DE|F)$/i.test(h.symbol) && !found.has(h.symbol)) found.set(h.symbol, h);
}
const LOGGED = ["2251.T", "612A.T"], MINE = ["2561.T", "2510.T", "IGLT.L", "VGOV.L", "IS0L.DE", "EXX6.DE"];
const FUNDS = [...new Set([...LOGGED, ...found.keys(), ...MINE])];
console.log(`  funds listed in Tokyo, London or Germany among the results: ${[...found.keys()].join(" ") || "none"}; with the two of 20 Nov's search (${LOGGED.join(", ")}) and the engineer's six candidates (${MINE.join(", ")}): ${FUNDS.length} to quote`);
const TE_SET = ["BNDW", "AGG", "IAGG", "BNDX", "AGGU.L"];
const ALLQ = [...new Set([...FUNDS, ...TE_SET, "EWJ", "2559.T"])];
let qs = new Map<string, J>();
if (s) {
  head(`1a. One quote of ${ALLQ.length} symbols`);
  qs = await quotes(ALLQ, s);
  console.log(`  ${qs.size} of ${ALLQ.length} answered; not: ${ALLQ.filter((x) => !qs.has(x)).join(" ") || "none"}`);
} else console.log("  no session: no quote is asked; the candidates are read by their charts alone");
const isGov = (q: J | undefined, h: Hit | undefined) => /gov|gilt|bund|treasur|sovereign|jgb|国債|bond|債券/i.test(`${q?.longName ?? ""} ${q?.shortName ?? ""} ${h?.name ?? ""}`);
const answered = FUNDS.filter((x) => (s ? qs.has(x) : true));
// Tokyo's first, then London's, then Germany's; a fund whose name says nothing of bonds goes last
const rank = (x: string) => (isGov(qs.get(x), found.get(x)) ? 0 : 10) + (/\.T$/.test(x) ? 0 : /\.L$/.test(x) ? 1 : 2);
const toRead = [...answered].sort((a, b) => rank(a) - rank(b)).slice(0, 10);
for (const sym of FUNDS) {
  const q = qs.get(sym);
  console.log(`  ${sym}: ${q ? `"${q.longName ?? q.shortName ?? "–"}" · ${q.quoteType ?? "–"} · ${q.fullExchangeName ?? q.exchange ?? "–"} · ${q.currency ?? "–"} · state ${q.marketState ?? "–"} · last ${q.regularMarketPrice ?? "–"} at ${iso(num(q.regularMarketTime))} · volume ${q.regularMarketVolume ?? "–"}, average 10d ${q.averageDailyVolume10Day ?? "–"}, 3m ${q.averageDailyVolume3Month ?? "–"} · bid ${q.bid ?? "–"}, ask ${q.ask ?? "–"}${["netExpenseRatio", "netAssets", "dividendYield", "trailingAnnualDividendYield", "ytdReturn"].filter((k) => q[k] != null).map((k) => ` · ${k} ${q[k]}`).join("")}` : s ? "no quote (no such symbol on Yahoo, or not answered)" : "not quoted"}`);
}
if (s) {
  head("1b. Tokyo's funds: what Yahoo's profile says each follows (quoteSummary: summaryProfile, fundProfile)");
  for (const sym of toRead.filter((x) => /\.T$/.test(x)).slice(0, 4)) {
    const j = await yget(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=summaryProfile,fundProfile&crumb=${encodeURIComponent(s.crumb)}`, { cookie: s.cookie });
    const res = ((j?.quoteSummary as { result?: J[] } | undefined)?.result ?? [])[0];
    if (!res) { console.log(`  ${sym}: no profile`); continue; }
    const sp = (res.summaryProfile ?? {}) as J, fp = (res.fundProfile ?? {}) as J, text = str(sp.longBusinessSummary) ?? "";
    const idx = text.match(/[^.。]*(index|指数|インデックス|連動)[^.。]*[.。]?/i)?.[0]?.trim();
    console.log(`  ${sym}: family ${fp.family ?? "–"}; category ${fp.categoryName ?? "–"}; legal type ${fp.legalType ?? "–"}; the sentence that names an index: ${idx ? JSON.stringify(masked(idx.slice(0, 400))) : "none in the profile's text"}${text ? `; the text's first 300 characters: ${JSON.stringify(masked(text.slice(0, 300)))}` : "; no text"}`);
  }
}
head(`1c. A year of daily bars for ${toRead.length} funds: sessions, volume, distributions`);
for (const sym of toRead) {
  const b = await chart(sym, "range=1y&interval=1d&events=div%7Csplit");
  if (!b) { console.log(`  ${sym}: no chart`); continue; }
  const rows = daily(b), last60 = rows.slice(-60), vols = last60.map((r) => r.v ?? 0), px = rows[rows.length - 1]?.c ?? null;
  const av = vols.length ? vols.reduce((a, x) => a + x, 0) / vols.length : null;
  const tr = totalReturns(rows), r = tr.length ? tr.reduce((a, x) => a * (1 + x.r), 1) - 1 : null;
  console.log(`  ${sym}: "${b.meta.longName ?? b.meta.shortName ?? "–"}" · ${b.meta.fullExchangeName ?? b.meta.exchangeName ?? "–"} · ${b.meta.currency ?? "–"} · ${b.tz} · ${rows.length} daily bars ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"}, ${rows.filter((x) => !x.v).length} with no volume · newest close ${px ?? "–"} · average volume over the last ${last60.length} sessions ${f(av, 0)} a day (${av != null && px != null ? `${f(av * px / 1e6, 2)}m ${b.meta.currency ?? ""} a day` : "–"}), ${vols.filter((v) => v === 0).length} of them with none · ${b.div.length} distributions in the year${b.div.length ? `: ${b.div.map((x) => `${dayIn(b.tz, x.t)} ${x.amount}`).join(", ")}` : " (an accumulating class pays none)"} · ${b.split.length} splits · total return over the range ${pct(r)} (E)${unplacedWords(b)}`);
}

// ---- 2. V-14: the Global Aggregate's daily line ----
head("2. V-14: BNDW, AGG with IAGG, and AGG with BNDX against AGGU.L, weekly total returns over 156 weeks");
const series = new Map<string, Day[]>(), money = new Map<string, string>();
for (const sym of TE_SET) {
  const b = await chart(sym, "range=5y&interval=1d&events=div%7Csplit");
  if (!b) { console.log(`  ${sym}: no chart`); continue; }
  const rows = daily(b); series.set(sym, rows); money.set(sym, String(b.meta.currency ?? "–"));
  console.log(`  ${sym}: "${b.meta.longName ?? b.meta.shortName ?? "–"}" · ${b.meta.currency ?? "–"} · ${rows.length} daily bars ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"} · ${b.div.length} distributions over the range`);
}
{
  /** A total-return index by date (1 on the first date), from raw closes and distributions on their ex-dates. */
  const idx = (rows: Day[]) => { const m = new Map<string, number>(); let v = 1; rows.forEach((r, i) => { if (i) v *= (r.c + r.div) / rows[i - 1].c; m.set(r.d, v); }); return m; };
  const week = (d: string) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + (5 - t.getUTCDay() + 7) % 7); return t.toISOString().slice(0, 10); };
  const ref = series.get("AGGU.L");
  const need = (xs: string[]) => xs.every((x) => series.has(x));
  if (new Set(money.values()).size > 1) console.log(`  FLAG: the series are not all in one currency (${[...money].map(([k, v]) => `${k} ${v}`).join(", ")}): a tracking error between two currencies' prices measures the exchange rate, not the funds`);
  if (!ref) console.log("  AGGU.L without a series: nothing is worked out");
  else {
    const I = new Map([...series].map(([k, v]) => [k, idx(v)]));
    /** Weekly returns of each of `syms` at the last date of each Friday week on which all of them and AGGU.L have a bar. */
    const weekly = (syms: string[], weeks: number) => {
      const all = ["AGGU.L", ...syms], common = [...(I.get("AGGU.L") as Map<string, number>).keys()].filter((d) => all.every((x) => I.get(x)?.has(d))).sort();
      const last = new Map<string, string>(); for (const d of common) last.set(week(d), d);
      const ds = [...last.values()].sort().slice(-(weeks + 1));
      const ret = (x: string) => ds.slice(1).map((d, i) => (I.get(x) as Map<string, number>).get(d)! / (I.get(x) as Map<string, number>).get(ds[i])! - 1);
      return { from: ds[0], to: ds[ds.length - 1], n: Math.max(0, ds.length - 1), r: new Map(all.map((x) => [x, ret(x)])) };
    };
    const stats = (a: number[], b: number[]) => { const d = a.map((x, i) => x - b[i]), te = sd(d), mean = d.length ? d.reduce((x, y) => x + y, 0) / d.length : null; return { te: te == null ? null : te * Math.sqrt(52) * 100, gap: mean == null ? null : mean * 52 * 100 }; };
    const line = (what: string, a: number[], b: number[]) => { const x = stats(a, b); return `${what}: tracking error ${f(x.te)}% a year, mean difference ${f(x.gap)} points a year${x.te != null ? (x.te <= 0.5 ? " · WITHIN B's 0.50%" : " · not within 0.50%") : ""}`; };
    if (need(["BNDW"])) { const w = weekly(["BNDW"], 156); console.log(`  BNDW against AGGU.L, ${w.n} weeks (${w.from} to ${w.to}): ${line("BNDW", w.r.get("BNDW")!, w.r.get("AGGU.L")!)}`); }
    for (const other of ["IAGG", "BNDX"]) {
      if (!need(["AGG", other])) { console.log(`  AGG with ${other}: a series is missing`); continue; }
      const w = weekly(["AGG", other], 156), a = w.r.get("AGG")!, o = w.r.get(other)!, r = w.r.get("AGGU.L")!;
      console.log(`  AGG with ${other} against AGGU.L, ${w.n} weeks (${w.from} to ${w.to}), the pair rebalanced each week; by the dollar share given to AGG:`);
      for (let share = 30; share <= 60; share += 5) console.log(`    ${line(`${share}% AGG, ${100 - share}% ${other}`, a.map((x, i) => (share / 100) * x + (1 - share / 100) * o[i]), r)}`);
      let best = { share: 0, te: Infinity };
      for (let k = 0; k <= 100; k++) { const te = stats(a.map((x, i) => (k / 100) * x + (1 - k / 100) * o[i]), r).te; if (te != null && te < best.te) best = { share: k, te }; }
      console.log(`    the share that fits best (E; fitted on these weeks, not the dollar share of AGGU.L's holdings file): ${Number.isFinite(best.te) ? `${best.share}% AGG, tracking error ${best.te.toFixed(2)}% a year` : "–"}`);
    }
    console.log("  as B recalls them, AGGU.L closes at 16:30 in London and the US funds at 16:00 in New York: a week's last common date softens that, a day's does not");
  }
}

// ---- 3. V-7: EWJ's distributions as Yahoo's events give them ----
head("3. V-7: EWJ's distributions of the last three years, Yahoo's events (to set beside iShares' own table in pf_bench's log)");
{
  const b = await chart("EWJ", "range=5y&interval=1d&events=div%7Csplit");
  if (!b) console.log("  no chart");
  else {
    const rows = daily(b), px = rows[rows.length - 1]?.c ?? null, since = nowS - 3 * 365.25 * 86400;
    const three = b.div.filter((x) => x.t >= since);
    console.log(`  ${three.length} distributions since ${iso(since).slice(0, 10)} (by ex-date, in ${b.tz}): ${three.map((x) => `${dayIn(b.tz, x.t)} ${x.amount}`).join(", ") || "none"}`);
    const byYear = new Map<string, number>(); for (const x of b.div) { const y = dayIn(b.tz, x.t).slice(0, 4); byYear.set(y, (byYear.get(y) ?? 0) + x.amount); }
    console.log(`  by calendar year: ${[...byYear].sort().map(([y, v]) => `${y} ${v.toFixed(4)}`).join(", ") || "–"}`);
    const year = b.div.filter((x) => x.t >= nowS - 365 * 86400).reduce((a, x) => a + x.amount, 0);
    const q = qs.get("EWJ");
    console.log(`  the last 365 days: ${year.toFixed(4)}${px ? `, ${(year / px * 100).toFixed(2)}% of the newest close ${px}` : ""}; the quote's fields: trailingAnnualDividendYield ${q?.trailingAnnualDividendYield ?? "–"}, dividendYield ${q?.dividendYield ?? "–"}, trailingAnnualDividendRate ${q?.trailingAnnualDividendRate ?? "–"}`);
  }
}

// ---- 4. C-39: 2559.T ----
head("4. C-39: 2559.T, its largest one-day changes in two years, the closes and volumes around the largest, its split events");
{
  const b = await chart("2559.T", "range=2y&interval=1d&events=div%7Csplit");
  if (!b) console.log("  no chart");
  else {
    const rows = daily(b);
    console.log(`  ${rows.length} daily bars ${rows[0]?.d ?? "–"} to ${rows[rows.length - 1]?.d ?? "–"}; ${b.split.length} split events${b.split.length ? `: ${b.split.map((x) => `${dayIn(b.tz, x.t)} ${x.num}:${x.den}`).join(", ")}` : ""}; ${b.div.length} distributions${b.div.length ? `: ${b.div.map((x) => `${dayIn(b.tz, x.t)} ${x.amount}`).join(", ")}` : ""}`);
    const moves = rows.slice(1).map((r, i) => ({ i: i + 1, d: r.d, ratio: r.c / rows[i].c })).sort((x, y) => Math.abs(Math.log(y.ratio)) - Math.abs(Math.log(x.ratio))).slice(0, 5);
    for (const m of moves) console.log(`  ${m.d}: close ${rows[m.i - 1].c} (${rows[m.i - 1].d}, volume ${rows[m.i - 1].v ?? "–"}) then ${rows[m.i].c} (volume ${rows[m.i].v ?? "–"}): ${pct(m.ratio - 1)}, a ratio of ${m.ratio.toFixed(4)}${rows[m.i - 1].v && rows[m.i].v ? `; volume ${((rows[m.i].v as number) / (rows[m.i - 1].v as number)).toFixed(2)} times the day before's` : ""}`);
    const top = moves[0];
    if (top) {
      console.log(`  around the largest (${top.d}): ${rows.slice(Math.max(0, top.i - 5), top.i + 6).map((r) => `${r.d} close ${r.c} volume ${r.v ?? "–"}`).join("; ")}`);
      const near = [2, 3, 4, 5, 10, 20].map((k) => ({ k, off: Math.abs(top.ratio * k - 1) })).concat([2, 3, 4, 5, 10, 20].map((k) => ({ k: 1 / k, off: Math.abs(top.ratio / k - 1) }))).sort((x, y) => x.off - y.off)[0];
      const isSplitDay = b.split.some((x) => dayIn(b.tz, x.t) === top.d);
      console.log(`  the largest change has the size of ${near.off < 0.05 ? `a ${near.k >= 1 ? `${near.k}-for-1 split` : `1-for-${Math.round(1 / near.k)} consolidation`} (within ${(near.off * 100).toFixed(1)}%)` : "no round split"}; a split event on that date among Yahoo's events: ${isSplitDay ? "yes" : "NO"}`);
      const tr = totalReturns(rows).slice(-252), all = tr.reduce((a, x) => a * (1 + x.r), 1) - 1, without = tr.filter((x) => x.d !== top.d).reduce((a, x) => a * (1 + x.r), 1) - 1;
      console.log(`  total return over the last ${tr.length} sessions (E): ${pct(all)}; with that one day left out: ${pct(without)}${tr.some((x) => x.d === top.d) ? "" : " (the day is not within them)"}${unplacedWords(b)}`);
    }
    const med = median(rows.slice(-60).map((r) => r.v ?? 0));
    console.log(`  median daily volume over the last 60 sessions: ${med ?? "–"}`);
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX} planned, and at most 3 asked again after a 429); ${Math.round((Date.now() - t0) / 1000)} s`);
