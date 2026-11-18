// Reading a company's statements out of what each source sends, into the one shape of fin.ts (Shota, 18 Nov
// 2026). No network and no database here: each function takes the source's JSON as it arrived. Checked in
// sim/logic.test.ts with made-up responses in the sources' shapes.
//
// A figure is copied or left out; it is never estimated. The only arithmetic is what a source's own definition
// calls for: a quarter as the difference of two year-to-date figures (fin.ts singleQuarters), and capex shown as
// the cash paid out (a positive number) where a source reports it as a negative flow.
import { fyLabel, pickUnit, qEndLabel, ratiosOf, type Fin, type FinLine, type FinPeriod, type FinSet } from "./fin.ts";

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
// One request names the series wanted, each as annual<Name> or quarterly<Name>; the answer is
//   { timeseries: { result: [ { meta: { type: ["annualTotalRevenue"] }, annualTotalRevenue: [ { asOfDate: "2025-09-30", reportedValue: { raw: 1 } }, ... ] }, ... ] } }
// A series Yahoo does not have for a company is simply absent. Quarterly figures are single quarters.
// Debt here is borrowings without lease obligations (Yahoo keeps those in separate series).
export const YAHOO_FIN: Array<[string, FinLine]> = [
  ["TotalRevenue", "revenue"], ["CostOfRevenue", "cogs"], ["GrossProfit", "gross"], ["SellingGeneralAndAdministration", "sga"], ["OperatingIncome", "op"],
  ["PretaxIncome", "pretax"], ["NetIncomeCommonStockholders", "ni"], ["DilutedEPS", "eps"], ["DilutedAverageShares", "dilutedShares"],
  ["CashAndCashEquivalents", "cash"], ["CurrentDebt", "stDebt"], ["LongTermDebt", "ltDebt"], ["TotalAssets", "assets"], ["TotalLiabilitiesNetMinorityInterest", "liabilities"], ["StockholdersEquity", "equity"], ["OrdinarySharesNumber", "shares"],
  ["OperatingCashFlow", "ocf"], ["InvestingCashFlow", "icf"], ["FinancingCashFlow", "fincf"], ["CapitalExpenditure", "capex"],
];
/** The `type=` list for the request: every series, yearly and quarterly. */
export const yahooFinTypes = (): string => YAHOO_FIN.flatMap(([n]) => [`annual${n}`, `quarterly${n}`]).join(",");

export function yahooFin(json: unknown, currency: string | null, asOf: string | null): Fin {
  const result = ((json as { timeseries?: { result?: unknown } } | null)?.timeseries?.result ?? []) as Array<Record<string, unknown>>;
  const want = new Map(YAHOO_FIN);
  const rows = { annual: new Map<string, Partial<Record<FinLine, number | null>>>(), quarterly: new Map<string, Partial<Record<FinLine, number | null>>>() };
  for (const r of Array.isArray(result) ? result : []) {
    const type = ((r?.meta as { type?: unknown[] } | undefined)?.type ?? [])[0];
    if (typeof type !== "string") continue;
    const scope = type.startsWith("annual") ? "annual" : type.startsWith("quarterly") ? "quarterly" : null;
    const line = scope ? want.get(type.slice(scope.length)) : undefined;
    if (!scope || !line) continue;
    for (const v of (Array.isArray(r[type]) ? r[type] : []) as Array<{ asOfDate?: unknown; reportedValue?: { raw?: unknown } } | null>) {
      const end = typeof v?.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.asOfDate) ? v.asOfDate : null, x = num(v?.reportedValue?.raw);
      if (!end || x == null) continue;
      const row = rows[scope].get(end) ?? {};
      row[line] = line === "capex" ? Math.abs(x) : x;   // Yahoo reports the outflow as a negative number
      rows[scope].set(end, row);
    }
  }
  const P = (kind: "FY" | "Q") => (end: string): FinPeriod => ({ key: `${kind}:${end}`, end, label: kind === "FY" ? fyLabel(end) : qEndLabel(end), kind, months: kind === "FY" ? 12 : 3, std: null, doc: null, url: null, note: null });
  const annual = setOf(rows.annual, P("FY"), 10), quarterly = setOf(rows.quarterly, P("Q"), 12);
  const notes = ["Yahoo Finance fundamentals, as reported. It carries about four years and five quarters, no dividend per share, no company guidance, and none of the lines that exist only under Japanese accounting (ordinary profit, extraordinary items). Debt is borrowings without lease obligations."];
  return finish("yahoo", currency, annual.periods.length ? annual : emptySet(), quarterly.periods.length ? quarterly : emptySet(), null, notes, asOf);
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
