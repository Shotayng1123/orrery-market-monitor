// Reading a company's statements out of what each source sends, into the one shape of fin.ts (Shota, 18 Nov
// 2026). No network and no database here: each function takes the source's JSON as it arrived. Checked in
// sim/logic.test.ts with made-up responses in the sources' shapes.
//
// A figure is copied or left out; it is never estimated. The only arithmetic is what a source's own definition
// calls for: a quarter as the difference of two year-to-date figures (fin.ts singleQuarters), and capex shown as
// the cash paid out (a positive number) where a source reports it as a negative flow.
import { fyLabel, LAYOUT_FOREIGN, LAYOUT_JP, pickUnit, progress, qEndLabel, qLabel, quarterEnd, ratiosOf, type Fin, type FinLayout, type FinLine, type FinPeriod, type FinSet } from "./fin.ts";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const emptySet = (): FinSet => ({ periods: [], lines: {} });

/** Puts the unit and the ratios on two finished sets. */
export function finish(source: Fin["source"], currency: string | null, annual: FinSet, quarterly: FinSet, guidance: Fin["guidance"], notes: string[], asOf: string | null): Fin {
  return { source, currency, unit: pickUnit(annual.periods.length ? annual : quarterly), annual, quarterly, ratios: { annual: ratiosOf(annual), quarterly: ratiosOf(quarterly) }, guidance, asOf, notes };
}

/** A set from rows keyed by period: `rows` maps a period's end date to its lines. Periods come out oldest first;
 *  a line is present in the set only if some period has it. */
function setOf(rows: Map<string, Partial<Record<FinLine, number | null>>>, period: (end: string) => FinPeriod, keep: number): FinSet {
  const ends = [...rows.keys()].sort().slice(-keep);
  const lines: FinSet["lines"] = {};
  for (const [i, end] of ends.entries()) for (const [id, v] of Object.entries(rows.get(end)!) as Array<[FinLine, number | null]>) {
    if (v == null) continue;
    (lines[id] ??= ends.map(() => null))[i] = v;
  }
  return { periods: ends.map(period), lines };
}

// ---- Yahoo Finance: the fundamentals time series ----
// A request names the series wanted, each as annual<Name> or quarterly<Name>; the answer is
//   { timeseries: { result: [ { meta: { type: ["annualTotalRevenue"] }, annualTotalRevenue: [ { asOfDate: "2025-09-30", reportedValue: { raw: 1 } }, ... ] }, ... ] } }
// A series Yahoo does not have for a company is simply absent. Quarterly figures are single quarters. Yahoo
// answers at most four years and five quarters, whatever dates are asked for.
// Every name below is in the list of series the yfinance library asks Yahoo for (yfinance 1.8.0,
// const.py fundamentals_keys), which is also where the request's shape and the four-year limit were checked.
// Ten of them were already read by this page before 18 Nov 2026. What cannot be checked without Yahoo itself is
// which of them a given company has; a series that does not arrive leaves its line out, it cannot put a wrong
// figure on the page.
//   - Debt is borrowings without lease obligations (Yahoo keeps the totals with leases in separate series).
//   - Yahoo gives cash paid out as negative numbers; capex, buybacks and dividends paid are stored as the
//     amounts paid (positive).
//   - TotalUnusualItems is Yahoo's own classification, before tax, and is already inside the other lines.
export const YAHOO_FIN: Array<[string, FinLine]> = [
  ["TotalRevenue", "revenue"], ["CostOfRevenue", "cogs"], ["GrossProfit", "gross"], ["ResearchAndDevelopment", "rd"], ["SellingGeneralAndAdministration", "sga"], ["OperatingIncome", "op"],
  ["NetNonOperatingInterestIncomeExpense", "interestNet"], ["OtherIncomeExpense", "otherNonOp"], ["PretaxIncome", "pretax"], ["TaxProvision", "tax"], ["NetIncome", "ni"],
  ["DilutedEPS", "eps"], ["DividendPerShare", "dps"], ["DilutedAverageShares", "dilutedShares"], ["TotalUnusualItems", "unusual"],
  ["CashAndCashEquivalents", "cash"], ["CashCashEquivalentsAndShortTermInvestments", "cashSti"], ["CurrentDebt", "stDebt"], ["LongTermDebt", "ltDebt"], ["TotalAssets", "assets"], ["TotalLiabilitiesNetMinorityInterest", "liabilities"], ["StockholdersEquity", "equity"], ["OrdinarySharesNumber", "shares"],
  ["OperatingCashFlow", "ocf"], ["InvestingCashFlow", "icf"], ["FinancingCashFlow", "fincf"], ["CapitalExpenditure", "capex"], ["RepurchaseOfCapitalStock", "buyback"], ["CashDividendsPaid", "divPaid"], ["StockBasedCompensation", "sbc"],
];
const PAID_OUT: ReadonlySet<FinLine> = new Set<FinLine>(["capex", "buyback", "divPaid"]);
/** The `type=` lists to ask for, one request each: the yearly series and the quarterly ones. Two requests keep
 *  each address under about 2 kB (yfinance splits at sixty names for the same reason: long addresses get dropped
 *  on some network paths). */
export const yahooFinTypes = (): string[] => (["annual", "quarterly"] as const).map((scope) => YAHOO_FIN.map(([n]) => `${scope}${n}`).join(","));

/** Reads Yahoo's answers (one, or the list of them when the request was split) into the statements. */
export function yahooFin(json: unknown, currency: string | null, asOf: string | null): Fin {
  const result = (Array.isArray(json) ? json : [json]).flatMap((j) => { const r = (j as { timeseries?: { result?: unknown } } | null)?.timeseries?.result; return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : []; });
  const want = new Map(YAHOO_FIN);
  const rows = { annual: new Map<string, Partial<Record<FinLine, number | null>>>(), quarterly: new Map<string, Partial<Record<FinLine, number | null>>>() };
  for (const r of result) {
    const type = ((r?.meta as { type?: unknown[] } | undefined)?.type ?? [])[0];
    if (typeof type !== "string") continue;
    const scope = type.startsWith("annual") ? "annual" : type.startsWith("quarterly") ? "quarterly" : null;
    const line = scope ? want.get(type.slice(scope.length)) : undefined;
    if (!scope || !line) continue;
    for (const v of (Array.isArray(r[type]) ? r[type] : []) as Array<{ asOfDate?: unknown; reportedValue?: { raw?: unknown } } | null>) {
      const end = typeof v?.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.asOfDate) ? v.asOfDate : null, x = num(v?.reportedValue?.raw);
      if (!end || x == null) continue;
      const row = rows[scope].get(end) ?? {};
      row[line] = PAID_OUT.has(line) ? Math.abs(x) : x;
      rows[scope].set(end, row);
    }
  }
  const P = (kind: "FY" | "Q") => (end: string): FinPeriod => ({ key: `${kind}:${end}`, end, label: kind === "FY" ? fyLabel(end) : qEndLabel(end), kind, months: kind === "FY" ? 12 : 3, std: null, doc: null, url: null, note: null });
  const annual = setOf(rows.annual, P("FY"), 10), quarterly = setOf(rows.quarterly, P("Q"), 12);
  const notes = ["Yahoo Finance fundamentals, as reported. It carries about four years and five quarters and no company guidance. The lines are those of a company reporting under US GAAP or IFRS; one the company does not report is left out. Debt is borrowings without lease obligations. Unusual items are the data provider's own classification, before tax, and are already inside the lines above them."];
  return { ...finish("yahoo", currency, annual.periods.length ? annual : emptySet(), quarterly.periods.length ? quarterly : emptySet(), null, notes, asOf), layout: LAYOUT_FOREIGN };
}

// ---- EDINET DB (Cabocia): 有価証券報告書 by year, single quarters, and 決算短信 ----
// Three answers (edinet.ts asks for them), read here as they arrive. Their shapes were taken from the provider's
// own answers and field notes on 19 Nov 2026 (JST): a JP GAAP filer, an IFRS filer with a December year, and a
// JP GAAP filer with loans and bonds.
//   annual      { data: [ { fiscalYear: 2026, revenue, costOfSales, grossProfit, sga, operatingIncome,
//                 nonOperatingIncome, nonOperatingExpenses, ordinaryIncome, extraordinaryIncome, extraordinaryLoss,
//                 profitBeforeTax, netIncome, eps, adjustedEps, dividendPerShare, adjustedDividendPerShare, bps,
//                 adjustedBps, splitAdjustmentFactor, payoutRatio (a fraction), cash, totalAssets, totalLiabilities,
//                 netAssets, shortTermLoans, longTermLoans, bondsPayable, currentPortionBondsPayable (JP GAAP),
//                 ibdCurrent, ibdNoncurrent (IFRS), cfOperating, cfInvesting, cfFinancing, purchaseOfPpe,
//                 purchaseOfIntangibleAssets, purchaseOfPpeAndIntangibleAssets (cash paid, negative),
//                 sharesIssued, sharesIssuedFiscalYearEnd, accountingStandard: "JP" | "IFRS" | "USGAAP", docID,
//                 edinetFilingUrl, ev, marketCap, ... } ], latest_shares_snapshot: { sharesOutstanding,
//                 treasuryShares, sharesOutstandingExcludingTreasury, sharesMeasurementDate, ... } }
//                 Amounts in yen. fiscalYear is the year the fiscal year ends in. A field that does not apply
//                 or was not reported is simply absent.
//   standalone  { data: [ { fiscalYear, quarter: 1..4, revenue, costOfSales, grossProfit, sga, operatingIncome,
//                 nonOperatingIncome, ordinaryIncome, profitBeforeTax, netIncome, eps, totalAssets, netAssets,
//                 cash, derivationMethod, sourceType, ... } ] }   single quarters, in yen; the provider makes
//                 the later quarters by difference and leaves empty what it could not check.
//   earnings    { earnings: [ { disclosureDate, fiscalYearEnd, quarter: 1..4, isConsolidated, isCorrection,
//                 revenue, operatingIncome, ordinaryIncome, netIncome (year to date, millions of yen), eps,
//                 totalAssets, netAssets, cfOperating, cfInvesting, cfFinancing, bps, dividendPerShare (full-year
//                 rows), forecast<X> and effectiveForecast<X> for Revenue, OperatingIncome, OrdinaryIncome,
//                 NetIncome, Eps, DividendPerShare, forecastShareBasis, adjustedForecastEps, pdfUrl, ... } ] }
//                 newest first. A forecast in a row of quarters one to three is for the year in progress; in a
//                 full-year row it is for the next year.
// The REST interface sends the same fields in snake_case (fiscal_year, operating_income); keys are therefore
// compared without case and underscores, and the list of rows is looked for under the usual wrapper names.
export interface EdinetRaw { annual: unknown; standalone: unknown; earnings: unknown }
type Row = Record<string, unknown>;
const canon = (o: unknown): Row => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o as Row).map(([k, v]) => [k.replace(/_/g, "").toLowerCase(), v])) : {});
const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const dateOf = (v: unknown): string | null => { const m = typeof v === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(v) : null; if (m) return m[1]; const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
/** The rows of an answer, wherever its wrapper keeps them. */
function rowsIn(j: unknown, depth = 0): Row[] {
  if (Array.isArray(j)) return j.filter((x) => x && typeof x === "object" && !Array.isArray(x)).map(canon);
  if (!j || typeof j !== "object" || depth > 2) return [];
  const o = j as Row;
  for (const k of ["data", "earnings", "financials", "companies", "rows"]) { const inner = rowsIn(o[k], depth + 1); if (inner.length) return inner; }
  return [];
}
const lastDay = (y: number, m: number): string => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);   // m = 1..12
const stdOf = (v: unknown): string | null => { const s = typeof v === "string" ? v.toUpperCase().replace(/[^A-Z]/g, "") : ""; return s.startsWith("JP") ? "JP" : s === "IFRS" ? "IFRS" : s.startsWith("US") ? "USGAAP" : null; };

/** The EDINET code of the company with securities code `sec` ("7203") among the companies a search returned.
 *  The search matches part of a code as well (asked for 9020 it also returns 6902, whose code is stored as
 *  "69020"), so only an exact match counts: the code itself or the code followed by the check digit 0. */
export function edinetCodeOf(companies: unknown, sec: string): string {
  const want = sec.trim().toUpperCase();
  for (const c of rowsIn(companies)) {
    const code = String(c.seccode ?? "").trim().toUpperCase();
    if (want && (code === want || code === `${want}0`) && typeof c.edinetcode === "string" && c.edinetcode) return c.edinetcode;
  }
  return "";
}

/** The 決算短信 rows that count: for each period (fiscal year end, quarter) the newest disclosure, consolidated
 *  before non-consolidated. Newest period first. */
function releases(raw: unknown): Row[] {
  const best = new Map<string, Row>();
  for (const r of rowsIn(raw)) {
    const fy = dateOf(r.fiscalyearend), q = numOf(r.quarter), d = dateOf(r.disclosuredate);
    if (!fy || q == null || q < 1 || q > 4 || !d) continue;
    const row = { ...r, fiscalyearend: fy, quarter: q, disclosuredate: d }, key = `${fy}|${q}`, old = best.get(key);
    const rank = (x: Row) => `${x.isconsolidated === false ? 0 : 1}|${x.disclosuredate as string}`;
    if (!old || rank(row) > rank(old)) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => `${b.fiscalyearend}|${b.quarter}`.localeCompare(`${a.fiscalyearend}|${a.quarter}`));
}

/** Whether an answer can have changed: `earnings` once the next 決算短信 is due (70 days after the newest one),
 *  `annual` while a full-year 決算短信 is out for a year the annual answer does not have yet. */
export function edinetWaiting(raw: EdinetRaw, now: number): { earnings: boolean; annual: boolean } {
  const rel = releases(raw.earnings);
  const newest = rel.reduce((a, r) => ((r.disclosuredate as string) > a ? (r.disclosuredate as string) : a), "");
  const years = rowsIn(raw.annual).filter((r) => numOf(r.quarter) == null).map((r) => numOf(r.fiscalyear)).filter((y): y is number => y != null);
  const lastAnnual = years.length ? Math.max(...years) : null;
  const fullYear = rel.find((r) => r.quarter === 4);
  return {
    earnings: newest !== "" && now - Date.parse(newest) >= 70 * 86400e3,
    annual: fullYear != null && (lastAnnual == null || Number((fullYear.fiscalyearend as string).slice(0, 4)) > lastAnnual),
  };
}

/** A company's statements from EDINET DB's three answers, or null when the annual answer has no rows (the
 *  company is not in it). */
export function edinetFin(raw: EdinetRaw, asOf: string | null): Fin | null {
  const years = rowsIn(raw.annual).filter((r) => numOf(r.fiscalyear) != null && numOf(r.quarter) == null).sort((a, b) => (numOf(a.fiscalyear) as number) - (numOf(b.fiscalyear) as number)).slice(-10);
  if (!years.length) return null;
  const rel = releases(raw.earnings);
  const top = canon(raw.annual), snap = canon(top.latestsharessnapshot ?? canon(top.data).latestsharessnapshot);

  // the last day of the fiscal year that ends in `y`: said by a 決算短信 or by the year's own row where either
  // has it, otherwise the same month as the nearest year that does
  const known = new Map<number, string>();
  for (const r of rel) known.set(Number((r.fiscalyearend as string).slice(0, 4)), r.fiscalyearend as string);
  for (const r of years) { const d = dateOf(r.treasurysharesasofdate), y = numOf(r.fiscalyear) as number; if (d && Number(d.slice(0, 4)) === y && !known.has(y)) known.set(y, d); }
  { const d = dateOf(snap.fiscalyearend); if (d && !known.has(Number(d.slice(0, 4)))) known.set(Number(d.slice(0, 4)), d); }
  const months = [...known.entries()].sort((a, b) => a[0] - b[0]);
  const fyEnd = (y: number): string | null => {
    if (known.has(y)) return known.get(y)!;
    if (!months.length) return null;
    const near = months.reduce((a, b) => (Math.abs(b[0] - y) < Math.abs(a[0] - y) ? b : a));
    return lastDay(y, Number(near[1].slice(5, 7)));
  };
  const notes: string[] = [];

  // ---- by year
  const aRows = new Map<string, Partial<Record<FinLine, number | null>>>(), aMeta = new Map<string, FinPeriod>();
  let debtUnsure = false, splitAdj = false;
  for (const r of years) {
    const y = numOf(r.fiscalyear) as number, end = fyEnd(y) ?? `${y}-12-31`, std = stdOf(r.accountingstandard);
    const n = (k: string): number | null => numOf(r[k]);
    const factor = n("splitadjustmentfactor"), same = factor == null || Math.abs(factor - 1) < 1e-9;
    // per share: the provider's figures adjusted for later splits, so that years compare and match today's price
    const perShare = (adj: string, rawKey: string): number | null => n(adj) ?? (same ? n(rawKey) : null);
    if (!same) splitAdj = true;
    // debt without leases: JP GAAP = loans and bonds; IFRS = the interest-bearing debt lines. Checked against the
    // provider's own enterprise value (market cap + debt - cash) where it gives one: detail that does not add up
    // to that total is left out rather than shown short.
    const stParts = [n("shorttermloans"), n("currentportionbondspayable"), n("ibdcurrent")], ltParts = [n("longtermloans"), n("bondspayable"), n("ibdnoncurrent")];
    const sum = (xs: Array<number | null>): number | null => (xs.some((x) => x != null) ? xs.reduce((a: number, x) => a + (x ?? 0), 0) : null);
    let st = sum(stParts), lt = sum(ltParts);
    const ev = n("ev"), mcap = n("marketcap"), cash = n("cash");
    if (ev != null && mcap != null && cash != null) {
      const total = ev - mcap + cash, mine = (st ?? 0) + (lt ?? 0), tol = Math.max(2e6, Math.abs(total) * 0.005);
      if (Math.abs(total - mine) > tol) { st = null; lt = null; debtUnsure = true; }
      else if (st == null && lt == null) { st = 0; lt = 0; }           // the provider's total says there is none
      else { st ??= 0; lt ??= 0; }
    }
    const both = n("purchaseofppeandintangibleassets"), ppe = n("purchaseofppe"), intan = n("purchaseofintangibleassets");
    const capex = both != null ? Math.abs(both) : ppe != null ? Math.abs(ppe) + Math.abs(intan ?? 0) : null;
    const ni = n("netincome"), dil = n("dilutedeps"), pay = n("payoutratio");
    aRows.set(end, {
      revenue: n("revenue"), cogs: n("costofsales"), gross: n("grossprofit"), sga: n("sga"), op: n("operatingincome"),
      nonOpInc: n("nonoperatingincome"), nonOpExp: n("nonoperatingexpenses"), ordinary: n("ordinaryincome"), extraInc: n("extraordinaryincome"), extraLoss: n("extraordinaryloss"),
      pretax: n("profitbeforetax"), ni, eps: perShare("adjustedeps", "eps"), dps: perShare("adjusteddividendpershare", "dividendpershare"), bps: perShare("adjustedbps", "bps"),
      payoutReported: pay == null ? null : pay * 100,
      cash, stDebt: st, ltDebt: lt, assets: n("totalassets"), liabilities: n("totalliabilities"), equity: n("netassets"),
      ocf: n("cfoperating"), icf: n("cfinvesting"), fincf: n("cffinancing"), capex,
      shares: n("sharesissuedfiscalyearend") ?? n("sharesissued"),
      // the diluted share count a diluted EPS implies, only where both figures are large enough to imply one and no later split changed the basis
      dilutedShares: same && ni != null && dil != null && Math.abs(ni) >= 1e8 && dil >= 1 && ni > 0 ? ni / dil : null,
    });
    aMeta.set(end, { key: `FY:${end}`, end, label: fyEnd(y) ? fyLabel(end) : `FY${y}`, kind: "FY", months: 12, std, doc: typeof r.docid === "string" ? r.docid : null, url: typeof r.edinetfilingurl === "string" ? r.edinetfilingurl : null, note: null });
  }
  // a full year the 決算短信 has reported but the 有価証券報告書 has not yet: its headline lines, in millions there
  const M = 1e6, mm = (v: unknown): number | null => { const x = numOf(v); return x == null ? null : x * M; };
  const fullYear = rel.find((r) => r.quarter === 4);
  if (fullYear && !aRows.has(fullYear.fiscalyearend as string) && (fullYear.fiscalyearend as string) > [...aRows.keys()].sort().slice(-1)[0]) {
    const r = fullYear, end = r.fiscalyearend as string;
    aRows.set(end, { revenue: mm(r.revenue), op: mm(r.operatingincome), ordinary: mm(r.ordinaryincome), ni: mm(r.netincome), eps: numOf(r.eps), dps: numOf(r.dividendpershare), bps: numOf(r.bps), assets: mm(r.totalassets), equity: mm(r.netassets), ocf: mm(r.cfoperating), icf: mm(r.cfinvesting), fincf: mm(r.cffinancing) });
    aMeta.set(end, { key: `FY:${end}`, end, label: fyLabel(end), kind: "FY", months: 12, std: stdOf(r.accountingstandard), doc: null, url: typeof r.pdfurl === "string" ? r.pdfurl : null, note: `From the 決算短信 of ${r.disclosuredate}; the 有価証券報告書 is not in yet` });
    notes.push(`${fyLabel(end)} is from the 決算短信 (${r.disclosuredate}): the lines a 決算短信 does not carry are empty until the 有価証券報告書 is filed.`);
  }
  const annual = setOf(aRows, (end) => aMeta.get(end)!, 10);

  // ---- the company's guidance: the newest 決算短信's forecast, with later revision notices where the provider has read them
  const latest = rel[0] ?? null;
  let guidance: Fin["guidance"] = null;
  if (latest) {
    const q = latest.quarter as number, fy = latest.fiscalyearend as string;
    const gEnd = q === 4 ? lastDay(Number(fy.slice(0, 4)) + 1, Number(fy.slice(5, 7))) : fy;
    // a line a revision notice has touched is taken as the notice left it (empty when it gave a range or withdrew the forecast)
    const fc = (name: string): number | null => (`effectiveforecast${name}source` in latest ? numOf(latest[`effectiveforecast${name}`]) : numOf(latest[`forecast${name}`]));
    const basis = typeof latest.forecastsharebasis === "string" ? latest.forecastsharebasis : null;
    // per share: when a split is pending the provider says which share count the forecast is on; one it could not determine is not shown
    const fcShare = (name: string): number | null => (basis === "indeterminate" ? null : basis === "pre_split" ? numOf(latest[`adjustedforecast${name}`]) : fc(name));
    const g = { revenue: fc("revenue"), op: fc("operatingincome"), ordinary: fc("ordinaryincome"), ni: fc("netincome"), eps: fcShare("eps"), dps: fcShare("dividendpershare") };
    if (Object.values(g).some((v) => v != null) && !annual.periods.some((p) => p.end >= gEnd)) {
      const col = annual.periods.length;
      annual.periods.push({ key: `FC:${gEnd}`, end: gEnd, label: fyLabel(gEnd), kind: "FC", months: 12, std: stdOf(latest.accountingstandard), doc: null, url: typeof latest.pdfurl === "string" ? latest.pdfurl : null, note: "Company guidance" });
      for (const line of Object.values(annual.lines)) line!.push(null);
      const put = (id: FinLine, v: number | null) => { if (v == null) return; (annual.lines[id] ??= annual.periods.map(() => null))[col] = v; };
      put("revenue", g.revenue == null ? null : g.revenue * M); put("op", g.op == null ? null : g.op * M); put("ordinary", g.ordinary == null ? null : g.ordinary * M); put("ni", g.ni == null ? null : g.ni * M); put("eps", g.eps); put("dps", g.dps);
      const asOfDates = ["revenue", "operatingincome", "ordinaryincome", "netincome", "eps", "dividendpershare"].map((x) => dateOf(latest[`effectiveforecast${x}asofdate`])).filter((d): d is string => d != null);
      const disclosed = asOfDates.reduce((a, d) => (d > a ? d : a), latest.disclosuredate as string);
      const ytd = (k: string, f: number | null) => progress(numOf(latest[k]), f, q);
      guidance = { end: gEnd, disclosed, quarter: q, progress: q < 4 ? { revenue: ytd("revenue", g.revenue), op: ytd("operatingincome", g.op), ordinary: ytd("ordinaryincome", g.ordinary), ni: ytd("netincome", g.ni) } : {}, ytdMonths: q < 4 ? q * 3 : null };
    }
  }

  // ---- single quarters, as the provider derives them
  const qRows = new Map<string, Partial<Record<FinLine, number | null>>>(), qMeta = new Map<string, FinPeriod>();
  for (const r of rowsIn(raw.standalone)) {
    const y = numOf(r.fiscalyear), q = numOf(r.quarter), fy = y == null ? null : fyEnd(y);
    if (y == null || q == null || q < 1 || q > 4 || !fy) continue;
    const end = quarterEnd(fy, q), n = (k: string): number | null => numOf(r[k]);
    const both = n("purchaseofppeandintangibleassets"), ppe = n("purchaseofppe"), intan = n("purchaseofintangibleassets");
    qRows.set(end, {
      revenue: n("revenue"), cogs: n("costofsales"), gross: n("grossprofit"), sga: n("sga"), op: n("operatingincome"), nonOpInc: n("nonoperatingincome"), nonOpExp: n("nonoperatingexpenses"), ordinary: n("ordinaryincome"),
      extraInc: n("extraordinaryincome"), extraLoss: n("extraordinaryloss"), pretax: n("profitbeforetax"), ni: n("netincome"), eps: n("eps"),
      cash: n("cash"), assets: n("totalassets"), liabilities: n("totalliabilities"), equity: n("netassets"),
      ocf: n("cfoperating"), icf: n("cfinvesting"), fincf: n("cffinancing"), capex: both != null ? Math.abs(both) : ppe != null ? Math.abs(ppe) + Math.abs(intan ?? 0) : null,
    });
    qMeta.set(end, { key: `Q:${end}`, end, label: qLabel(fy, q), kind: "Q", months: 3, std: stdOf(r.accountingstandard), doc: null, url: null, note: null });
  }
  const quarterly = setOf(qRows, (end) => qMeta.get(end)!, 12);

  notes.unshift("EDINET DB (Cabocia). Years are from the 有価証券報告書; the company's guidance and its progress are from the latest 決算短信. Quarters are single quarters as EDINET DB derives them: the first as reported, each later one as the difference of two year-to-date figures; what it could not check against the filings it leaves empty, and so does this table.");
  if (splitAdj) notes.push("EPS, DPS and book value per share are EDINET DB's figures adjusted for later share splits, so years compare with each other and with today's price.");
  const ifrs = annual.periods.some((p) => p.kind === "FY" && p.std != null && p.std !== "JP");
  notes.push(ifrs ? "Debt is loans and bonds under Japanese accounting and the interest-bearing debt lines of the balance sheet under IFRS, as EDINET DB reads them. Lines that exist only under Japanese accounting (ordinary profit, extraordinary items) are empty for years reported under IFRS or US GAAP." : "Debt is loans and bonds (short-term loans and bonds due within a year; long-term loans and bonds); lease obligations are not included.");
  if (debtUnsure) notes.push("Where the debt lines are empty, the detail EDINET DB gives did not add up to its own total of interest-bearing debt, so no figure is shown.");

  const fin = finish("edinetdb", "JPY", annual, quarterly, guidance, notes, asOf);
  const layout: FinLayout = ifrs ? { ...LAYOUT_JP, titles: { stDebt: "Interest-bearing debt due within a year, as EDINET DB reads it from the balance sheet", ltDebt: "Interest-bearing debt due after a year, as EDINET DB reads it from the balance sheet" } } : LAYOUT_JP;
  // share counts as of the latest 決算短信 (after any split the provider has confirmed)
  const applied = snap.splitadjustmentstatus === "applied";
  const out = numOf(applied ? snap.sharesoutstandingsplitadjusted : snap.sharesoutstanding), tre = numOf(applied ? snap.treasurysharessplitadjusted : snap.treasuryshares);
  const sharesNow = out != null ? { outstanding: out, treasury: tre, asOf: dateOf(snap.sharesmeasurementdate) ?? dateOf(snap.disclosuredate) } : null;
  return { ...fin, layout, ...(sharesNow ? { sharesNow } : {}) };
}

// ---- the shorter shape the hover card (and the page before 18 Nov 2026) reads ----
export interface LegacyRow { period: string; label: string; revenue: number | null; op: number | null; ni: number | null; eps: number | null; assets?: number | null; equity?: number | null; cfo?: number | null; cfi?: number | null; cff?: number | null; fcf?: number | null }
export interface LegacyStatements { source: "edinetdb" | "yahoo" | null; currency: string | null; unit: string; annual: LegacyRow[]; quarterly: LegacyRow[]; forecast: { fiscalYearEnd: string | null; disclosed: string | null; revenue: number | null; op: number | null; ni: number | null; eps: number | null; dps: number | null } | null; note: string | null; asOf: string | null }
/** The last five years, the last six quarters and the guidance of a company's statements, in the card's shape.
 *  So a card can be drawn from statements the page has already fetched, without asking the source again. */
export function legacyStatements(f: Fin): LegacyStatements {
  const at = (set: FinSet, id: FinLine, i: number): number | null => set.lines[id]?.[i] ?? null;
  const rows = (set: FinSet, kind: "FY" | "Q", keep: number, label: (p: FinPeriod) => string): LegacyRow[] =>
    set.periods.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === kind).slice(-keep).map(({ p, i }) => ({ period: p.end, label: label(p), revenue: at(set, "revenue", i), op: at(set, "op", i), ni: at(set, "ni", i), eps: at(set, "eps", i), assets: at(set, "assets", i), equity: at(set, "equity", i), cfo: at(set, "ocf", i), cfi: at(set, "icf", i), cff: at(set, "fincf", i), fcf: null }));
  const g = f.annual.periods.findIndex((p) => p.kind === "FC");
  return {
    source: f.source, currency: f.currency, unit: "1",
    annual: rows(f.annual, "FY", 5, (p) => `FY ${p.end.slice(0, 7)}`), quarterly: rows(f.quarterly, "Q", 6, (p) => p.label),
    forecast: g < 0 ? null : { fiscalYearEnd: f.annual.periods[g].end, disclosed: f.guidance?.disclosed ?? null, revenue: at(f.annual, "revenue", g), op: at(f.annual, "op", g), ni: at(f.annual, "ni", g), eps: at(f.annual, "eps", g), dps: at(f.annual, "dps", g) },
    note: f.notes[0] ?? null, asOf: f.asOf,
  };
}
