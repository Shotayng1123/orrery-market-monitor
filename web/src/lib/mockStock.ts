// Dev-only: a made-up stock page for the mock feed (`VITE_DEV_MOCK=1`), in the shape the server's `stock` action
// sends. Nothing here is a real figure. A Tokyo symbol gets ten years, guidance and twelve quarters with every
// line (as EDINET DB gives a JP GAAP filer); any other symbol gets four years and five quarters with the lines
// Yahoo has, so the page is seen both full and sparse.
import type { Fin, FinLayout, FinLine, FinPeriod, FinSet, MoveRow, RatioId, StockPage } from "./stock";

function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const seedOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const two = (n: number) => String(n % 100).padStart(2, "0");
const pct = (a: number | null, b: number | null) => (a == null || b == null || !(b > 0) ? null : (a / b) * 100);

function ratios(set: FinSet, back: number): Partial<Record<RatioId, Array<number | null>>> {
  const L = (id: FinLine) => set.lines[id] ?? set.periods.map(() => null);
  const rev = L("revenue");
  return {
    salesYoy: rev.map((v, i) => (i - back < 0 || set.periods[i].kind === "FC" && back !== 1 || v == null || rev[i - back] == null ? null : (v / (rev[i - back] as number) - 1) * 100)),
    gpm: rev.map((v, i) => pct(L("gross")[i], v)), opm: rev.map((v, i) => pct(L("op")[i], v)), npm: rev.map((v, i) => pct(L("ni")[i], v)),
    payout: rev.map((_, i) => pct(L("dps")[i], L("eps")[i])), roe: rev.map((_, i) => (set.periods[i].kind === "FY" ? pct(L("ni")[i], L("equity")[i]) : null)), equityRatio: rev.map((_, i) => pct(L("equity")[i], L("assets")[i])),
  };
}

/** Made-up big moves placed on real days of the mock chart, one in each state the search for a reason can be in. */
function mockMoves(pts: Array<{ t: number; v: number }>): MoveRow[] {
  const n = pts.length - 1, day = (i: number) => new Date(pts[i].t * 1000).toISOString().slice(0, 10), d = (s: string) => { const x = new Date(s + "T00:00:00Z"); return `${x.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][x.getUTCMonth()]}`; };
  if (n < 200) return [];
  const mk = (kind: MoveRow["kind"], i: number, back: number, pct: number, status: MoveRow["status"], cause: string | null, sources: MoveRow["sources"] = []): MoveRow => {
    const from = day(i - back), to = day(i), p = `${pct > 0 ? "+" : "\u2212"}${Math.abs(pct).toFixed(1)}%`;
    const text = kind === "d1" ? `${p} on the day` : kind === "w1" ? `${p} in five sessions (from ${d(from)})` : pct < 0 ? `${p} from the high of ${d(from)} to the low of ${d(to)}` : `${p} from the low of ${d(from)} to the high of ${d(to)}`;
    return { kind, dir: pct >= 0 ? 1 : -1, pct, from, to, fromPx: pts[i - back].v, toPx: pts[i].v, t: pts[i].t, text, status, cause, sources };
  };
  return [
    mk("d1", n - 9, 1, 6.4, "found", "Mock: second-quarter operating profit came in 18% above the company's own guidance and the full-year outlook was raised.", [{ title: "Mock Motor raises full-year outlook (mock source)", url: "https://example.com/news/mock-motor-outlook" }, { title: "Earnings release (mock source)", url: "https://example.org/ir/mock-motor-2q" }]),
    mk("d1", n - 47, 1, -7.9, "found", "Mock: a recall of 1.2m vehicles was announced before the open.", [{ title: "Mock Motor recalls 1.2m vehicles (mock source)", url: "https://example.com/news/mock-motor-recall" }]),
    mk("w1", n - 47, 5, -11.3, "not_found", null),
    mk("m1", n - 110, 17, -22.6, "queued", null),
    mk("m1", n - 78, 19, 24.1, "found", "Mock: the stock recovered with the wider market after the central bank left rates unchanged.", [{ title: "Markets wrap (mock source)", url: "https://example.com/markets/wrap" }]),
    mk("d1", n - 171, 1, -5.2, "old", null),
  ].sort((a, b) => b.t - a.t);
}

/** The rows of a company outside Japan, as the server sends them (LAYOUT_FOREIGN in supabase/functions/_shared/fin.ts). */
const FOREIGN: FinLayout = {
  is: ["revenue", "cogs", "gross", "rd", "sga", "op", "interestNet", "otherNonOp", "pretax", "tax", "ni", "eps", "dps", "unusual"],
  bs: ["cash", "cashSti", "stDebt", "ltDebt", "netCash", "assets", "liabilities", "equity"],
  cf: ["ocf", "icf", "fincf", "capex", "fcf", "buyback", "divPaid", "sbc"],
  optional: ["cogs", "gross", "rd", "sga", "op", "interestNet", "otherNonOp", "tax", "dps", "unusual", "cashSti", "stDebt", "ltDebt", "netCash", "capex", "fcf", "buyback", "divPaid", "sbc", "gpm", "opm", "payout"],
  labels: { cogs: "Cost of revenue", op: "Operating income", pretax: "Pretax income", eps: "EPS (diluted)", cash: "Cash and equivalents", equity: "Shareholders' equity" },
  titles: {
    ni: "Net income as the source gives it", equity: "Stockholders' equity, without minority interests",
    netCash: "Cash and short-term investments (cash and equivalents where the company gives no such total) less short-term and long-term debt (worked out on this page); negative = net debt",
    payout: "Dividend per share over earnings per share; where no dividend per share is given, dividends paid over net income",
  },
};

export function mockStock(symbol: string, last?: number, pts: Array<{ t: number; v: number }> = []): StockPage {
  const r = rng(seedOf(symbol)), jp = /\.T$/.test(symbol), now = new Date();
  const drawn = jp ? Math.round(1500 + r() * 4000) : Math.round((60 + r() * 380) * 100) / 100, dayPct = (r() - 0.5) * 5;
  const price = last ?? drawn;
  const scale = jp ? 2.4e12 * (0.5 + r()) : 3.2e11 * (0.5 + r());   // yearly revenue
  const sharesOut = Math.round((scale * 0.07 * 16) / price);   // sized so the mock earnings give a P/E in the teens
  const P = (end: string, label: string, kind: FinPeriod["kind"], months: number, std: string | null): FinPeriod => ({ key: `${kind}:${end}`, end, label, kind, months, std, doc: null, url: null, note: null });

  // ---- annual
  const years = jp ? 10 : 4, lastFy = jp ? 2026 : 2025, fyM = jp ? 3 : 12;
  const aP: FinPeriod[] = Array.from({ length: years }, (_, i) => { const y = lastFy - (years - 1 - i); return P(`${y}-${String(fyM).padStart(2, "0")}-${fyM === 3 ? 31 : 31}`, `FY${fyM}/${two(y)}`, "FY", 12, jp ? "JP" : null); });
  const g = (i: number, base: number, drift: number, noise: number) => base * (1 + drift) ** i * (1 + (r() - 0.5) * noise);
  const rev = aP.map((_, i) => g(i, scale * 0.62, 0.055, 0.08));
  const cogs = rev.map((v) => v * (0.71 + (r() - 0.5) * 0.03)), gross = rev.map((v, i) => v - cogs[i]);
  const sga = rev.map((v) => v * (0.17 + (r() - 0.5) * 0.02)), op = gross.map((v, i) => v - sga[i]);
  const noi = rev.map((v) => v * 0.012), noe = rev.map((v) => v * 0.006), ord = op.map((v, i) => v + noi[i] - noe[i]);
  const exi = rev.map(() => (r() < 0.3 ? scale * 0.004 : 0)), exl = rev.map((_, i) => (i === 3 ? scale * 0.03 : r() < 0.4 ? scale * 0.003 : 0));
  const pre = ord.map((v, i) => v + exi[i] - exl[i]), ni = pre.map((v) => v * 0.7);
  const eps = ni.map((v) => v / sharesOut), dps = eps.map((v, i) => Math.max(10, Math.round((v * (0.28 + i * 0.008)) / 5) * 5));
  const assets = rev.map((v) => v * 1.25), equity = assets.map((v, i) => v * (0.42 + i * 0.008)), liab = assets.map((v, i) => v - equity[i]);
  const cash = assets.map((v) => v * 0.14), st = assets.map((v) => v * 0.07), lt = assets.map((v) => v * 0.16);
  const ocf = ni.map((v, i) => v + rev[i] * 0.05), capex = rev.map((v) => v * 0.055), icf = capex.map((v) => -v * 1.15), fincf = ocf.map((v, i) => -(v + icf[i]) * 0.8);
  const annual: FinSet = { periods: [...aP], lines: jp
    ? { revenue: rev, cogs, gross, sga, op, nonOpInc: noi, nonOpExp: noe, ordinary: ord, extraInc: exi, extraLoss: exl, pretax: pre, ni, eps, dps, cash, stDebt: st, ltDebt: lt, assets, liabilities: liab, equity, ocf, icf, fincf, capex }
    // a company outside Japan: R&D beside SG&A, interest and other income down to pretax income, tax, and what it paid out
    : { revenue: rev, cogs, gross, rd: sga.map((v) => v * 0.35), sga: sga.map((v) => v * 0.65), op, interestNet: rev.map((v) => -v * 0.004), otherNonOp: pre.map((v, i) => v - op[i] + rev[i] * 0.004), pretax: pre, tax: pre.map((v) => v * 0.3), ni,
        eps, dps: eps.map((v) => Math.round(v * 22) / 100), unusual: exi.map((v, i) => v - exl[i]), cash, cashSti: cash.map((v) => v * 1.8), stDebt: st, ltDebt: lt, assets, liabilities: liab, equity,
        ocf, icf, fincf, capex, buyback: ni.map((v) => v * 0.5), divPaid: ni.map((v) => v * 0.22), sbc: rev.map((v) => v * 0.02) } };
  if (jp) {   // the company's guidance for the year in progress: six lines only
    annual.periods.push(P("2027-03-31", "FY3/27", "FC", 12, "JP"));
    const add = (id: FinLine, v: number | null) => { (annual.lines[id] as Array<number | null>).push(v); };
    for (const id of Object.keys(annual.lines) as FinLine[]) if (!["revenue", "op", "ordinary", "ni", "eps", "dps"].includes(id)) add(id, null);
    add("revenue", rev[9] * 1.06); add("op", op[9] * 1.09); add("ordinary", ord[9] * 1.08); add("ni", ni[9] * 1.1); add("eps", eps[9] * 1.1); add("dps", dps[9] + 10);
  }

  // ---- quarterly: single quarters
  const nq = jp ? 12 : 5, lastQ = jp ? new Date(Date.UTC(2026, 8, 30)) : new Date(Date.UTC(2026, 8, 30));
  const qP: FinPeriod[] = Array.from({ length: nq }, (_, i) => {
    const d = new Date(Date.UTC(lastQ.getUTCFullYear(), lastQ.getUTCMonth() + 1 - 3 * (nq - 1 - i), 0)), end = iso(d);
    if (!jp) return P(end, `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${two(d.getUTCFullYear())}`, "Q", 3, null);
    const fyEnd = d.getUTCMonth() <= 2 ? d.getUTCFullYear() : d.getUTCFullYear() + 1, q = ((d.getUTCMonth() + 10) % 12) / 3 || 4;   // Jun 1Q, Sep 2Q, Dec 3Q, Mar 4Q
    return P(end, `${q}Q 3/${two(fyEnd)}`, "Q", 3, "JP");
  });
  const season = [0.92, 1.0, 1.02, 1.06];
  const qRev = qP.map((_, i) => (scale / 4) * (1 + 0.055 / 4) ** (i - nq) * season[i % 4] * (1 + (r() - 0.5) * 0.05));
  const qCogs = qRev.map((v) => v * (0.71 + (r() - 0.5) * 0.03)), qGross = qRev.map((v, i) => v - qCogs[i]), qSga = qRev.map((v) => v * 0.17), qOp = qGross.map((v, i) => v - qSga[i]);
  const qOrd = qOp.map((v, i) => v + qRev[i] * 0.006), qNi = qOrd.map((v) => v * 0.7);
  const quarterly: FinSet = { periods: qP, lines: jp
    ? { revenue: qRev, cogs: qCogs.map((v, i) => (i >= nq - 4 ? null : v)), gross: qGross.map((v, i) => (i >= nq - 4 ? null : v)), sga: qSga.map((v, i) => (i >= nq - 4 ? null : v)), op: qOp, ordinary: qOrd, ni: qNi, eps: qNi.map((v) => v / sharesOut), ocf: qNi.map((v, i) => (i % 2 ? v * 1.4 : null)) }
    : { revenue: qRev, cogs: qCogs, gross: qGross, rd: qSga.map((v) => v * 0.35), sga: qSga.map((v) => v * 0.65), op: qOp, interestNet: qRev.map((v) => -v * 0.004), otherNonOp: qRev.map((v) => v * 0.01), pretax: qOrd, tax: qOrd.map((v) => v * 0.3), ni: qNi, eps: qNi.map((v) => v / sharesOut),
        cash: qRev.map((v) => v * 0.7), cashSti: qRev.map((v) => v * 1.26), stDebt: qRev.map((v) => v * 0.35), ltDebt: qRev.map((v) => v * 0.8), assets: qRev.map((v) => v * 5), liabilities: qRev.map((v) => v * 2.8), equity: qRev.map((v) => v * 2.2),
        ocf: qNi.map((v, i) => v + qRev[i] * 0.05), icf: qRev.map((v) => -v * 0.063), fincf: qNi.map((v) => -v * 0.8), capex: qRev.map((v) => v * 0.055), buyback: qNi.map((v) => v * 0.5), divPaid: qNi.map((v) => v * 0.22) } };

  const unit = scale >= 1e11 ? { div: 1e9, label: "bn", dp: 1 } : { div: 1e6, label: "m", dp: 0 };
  const fin: Fin = { source: jp ? "edinetdb" : "yahoo", currency: jp ? "JPY" : "USD", unit, annual, quarterly,
    ratios: { annual: ratios(annual, 1), quarterly: ratios(quarterly, 4) },
    guidance: jp ? { end: "2027-03-31", disclosed: "2026-11-05", quarter: 2, progress: { revenue: 48.7, op: 52.1, ordinary: 51.4, ni: 55.0 }, ytdMonths: 6 } : null,
    asOf: iso(now), notes: jp ? ["Mock data. Cost of sales, gross profit and SG&A are not in the quarterly earnings releases the latest four quarters come from."] : ["Mock data. Yahoo Finance carries four years and five quarters and no company guidance. The lines are those of a company reporting under US GAAP or IFRS; one the company does not report is left out."],
    layout: jp ? undefined : FOREIGN };

  // a Tokyo name is set against two benchmarks (the second a little behind the first), any other against one
  const mk = (h: string, s: number | null, b: number | null) => { const bench = jp ? [b, b == null ? null : b * 0.86] : [b]; return { h, from: s == null ? null : iso(new Date(now.getTime() - 86400e3 * ({ "1D": 1, "1M": 31, "3M": 92, "6M": 183, "12M": 365, "36M": 1096, "60M": 1826 }[h] ?? 1))), base: s == null ? null : price / (1 + s / 100), stock: s, bench, rel: bench.map((x) => (s == null || x == null ? null : s - x)) }; };
  const perf = [mk("1D", dayPct, 0.4), mk("1M", (r() - 0.4) * 14, 2.1), mk("3M", (r() - 0.4) * 24, 5.6), mk("6M", (r() - 0.4) * 36, 9.8), mk("12M", (r() - 0.35) * 60, 18.2), mk("36M", (r() - 0.3) * 120, 61.5), jp ? mk("60M", (r() - 0.25) * 180, 88.3) : mk("60M", null, null)];
  const hi = price * 1.22, lo = price * 0.71;
  return {
    symbol, name: jp ? "Mock Motor Corp" : "Mock Inc.", exchange: jp ? "Tokyo" : "NasdaqGS", currency: jp ? "JPY" : "USD", quoteType: "EQUITY",
    sector: jp ? "Consumer Discretionary" : "Information Technology", industry: jp ? "Auto Manufacturers" : "Consumer Electronics", indices: jp ? ["NK225", "TOPIX"] : ["SP500", "NDX"],
    price, prevClose: price / (1 + dayPct / 100), pct: dayPct, asOf: now.toISOString(), open: price * 0.995, high: price * 1.012, low: price * 0.988, volume: 2.4e7, mcap: price * sharesOut,
    benchmarks: jp ? [{ symbol: "^N225", name: "Nikkei 225", note: null }, { symbol: "1306.T", name: "TOPIX", note: "TOPIX is read from the 1306.T exchange-traded fund that tracks it (the feed has no TOPIX series). The fund pays out the dividends it has collected once a year, so over a period that starts or ends near that payout its change differs a little from the index's." }] : [{ symbol: "^GSPC", name: "S&P 500", note: null }],
    perf, range: { hi, hiDate: iso(new Date(now.getTime() - 96 * 86400e3)), lo, loDate: iso(new Date(now.getTime() - 221 * 86400e3)), fromHi: (price / hi - 1) * 100, fromLo: (price / lo - 1) * 100, pos: ((price - lo) / (hi - lo)) * 100 },
    vol: { m1: 24.3, m3: 27.9, m12: 31.2 }, beta: jp ? [{ beta: 1.12, corr: 0.71, days: 252 }, { beta: 1.21, corr: 0.74, days: 252 }] : [{ beta: 1.12, corr: 0.71, days: 252 }], drawdown: { pct: -22.4, from: iso(new Date(now.getTime() - 96 * 86400e3)), to: iso(new Date(now.getTime() - 41 * 86400e3)) },
    turnover: { d20: { shares: 2.2e7, value: 2.2e7 * price }, d60: { shares: 2.0e7, value: 2.0e7 * price } },
    shares: { outstanding: sharesOut, diluted: jp ? null : sharesOut * 1.012, dilutedNote: jp ? "The filings give no diluted share count for this company" : "Weighted average diluted shares, latest fiscal year (Yahoo Finance)", treasury: jp ? sharesOut * 0.04 : null, float: null, asOf: "2026-09-30", source: jp ? "EDINET DB" : "Yahoo Finance" },
    short: jp ? { kind: "jpx", d: iso(now), ratio: 0.0123, shares: sharesOut * 0.0123, daysToCover: (sharesOut * 0.0123) / 2.0e7, holders: [{ holder: "Mock Capital LLP", ratio: 0.0071, d: iso(now) }, { holder: "Mock Asset Management", ratio: 0.0052, d: iso(now) }] }
      : { kind: "interest", d: "2026-10-30", shares: 2.1e7, pctFloat: 1.4, pctOut: 1.4, daysToCover: 1.1, prior: 1.9e7, priorDate: "2026-09-30", finra: { d: iso(now), ratio: 0.47 } },
    moves: { eligible: !/^9999/.test(symbol), rows: /^9999/.test(symbol) ? [] : mockMoves(pts) },
    earningsAt: new Date(now.getTime() + 12 * 86400e3).toISOString(), earningsEst: !jp,
    val: { pe: price / eps[years - 1], peGuide: jp ? price / (eps[years - 1] * 1.1) : null, pb: price / (equity[years - 1] / sharesOut), yield: ((annual.lines.dps as number[])[years - 1] / price) * 100, yieldGuide: jp ? ((dps[years - 1] + 10) / price) * 100 : null, basis: "On the latest fiscal year's EPS, book value and DPS, and the company's guidance" },
    fin, finNote: null,
  };
}
