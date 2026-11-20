// A watchlist row read from the market table, with its figures as MARKETS shows them (19 Nov 2026; the designer's
// findings D-01 and D-24). A yield's change is the change of its level, which the page prints in basis points as
// MARKETS does, never a per cent of the level; and every row says what its figures are as of, and whose they are.
// Pure: the `api` function's watch_list route uses it, and sim/logic.test.ts checks it.

/** What a row's figures are as of: a booked daily close, a print with its time, or an official publisher's daily
 *  figure (a yield read from a stored curve). */
export type AsOfKind = "close" | "print" | "published";

/** The market table's row (`computeTable`, table.ts), as far as a watchlist row needs it. `source` is the
 *  instrument's provider ("yahoo", "treasury", "mof", "curve"). */
export interface TableLike {
  symbol: string; name: string; cls: string; group: string; currency: string; source?: string | null;
  last: number | null; lastAt: string | null;
  pct: Partial<Record<string, number | null>>; chg?: Partial<Record<string, number | null>>;
  pos52?: number | null; vs200?: number | null;
}

export interface WatchTableRow {
  symbol: string; name: string; kind: string; sector: null; ccy: string; last: number | null;
  asOf: string | null; asOfKind: AsOfKind | null; source: string;
  pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null;
  chg1d: number | null; chg1w: number | null; chg1m: number | null; chg3m: number | null; chg12m: number | null;
  vs50: null; vs200: number | null; vs200chg: number | null; pos52: number | null;
  mcap: null; earningsAt: null; earningsEst: null; isYield: boolean;
}

/** A yield is compared in points, which MARKETS prints in bp; a bond future in the rates group is a price (table.ts). */
export const isYieldRow = (t: { group: string; symbol: string }): boolean => t.group === "rates" && !t.symbol.endsWith("=F");

// who publishes a yield read from a stored curve (instruments.provider "curve", provider_symbol "<country>:<years>")
const CURVE_SOURCES: Array<[RegExp, string]> = [[/^UST/, "US Treasury"], [/^JGB/, "Japan MOF"], [/^DE\d/, "Bundesbank"], [/^GB\d/, "Bank of England"], [/^EA\d/, "ECB"], [/^CA\d/, "Bank of Canada"]];
const official = (provider: string | null | undefined): boolean => provider === "treasury" || provider === "mof" || provider === "curve";

/** The publisher of a market-table row's figures, by name. */
export function sourceName(provider: string | null | undefined, symbol: string): string {
  if (provider === "treasury") return "US Treasury";
  if (provider === "mof") return "Japan MOF";
  if (provider === "curve") return CURVE_SOURCES.find(([re]) => re.test(symbol))?.[1] ?? "official yield curve";
  return "Yahoo Finance";
}

/** computeTable stamps a booked daily close "<date>T00:00:00Z" and a print with its quote's own time, which the
 *  database hands back as "…+00:00" (table.ts): the date of a booked close, or null for a print. */
export const closeDay = (lastAt: string | null | undefined): string | null => (lastAt && /^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(lastAt) ? lastAt.slice(0, 10) : null);

/** The Cboe's Treasury yield indices as Yahoo quotes them, the yield itself in per cent: ^IRX the 13-week bill, ^FVX
 *  five years, ^TNX ten, ^TYX thirty. The market table carries ^FVX, ^TNX and ^TYX; ^IRX reaches a watchlist only
 *  through search, as a plain quote. */
export const CBOE_YIELDS: readonly string[] = ["^IRX", "^FVX", "^TNX", "^TYX"];
/** Whether a quote outside the market table is a yield, not a price (the reviewer's R2A-06, 19 Nov 2026): one of the
 *  Cboe's yield indices, or an index Yahoo names as a Treasury yield or bill. A fund that holds bills is a price. */
export const isYieldQuote = (symbol: string, name: string | null | undefined, quoteType: string | null | undefined): boolean =>
  CBOE_YIELDS.includes(symbol) || (quoteType === "INDEX" && /\btreasury (?:yield|bill)/i.test(name ?? ""));

/** What a plain quote gives (yahoo.ts QuoteRow, as far as a watchlist row needs it). */
export interface QuoteLike {
  name: string | null; quoteType: string | null; currency: string | null; price: number | null; prevClose: number | null;
  time: number | null; marketCap: number | null; earningsAt: number | null; earningsEst: boolean | null;
}
/** The watchlist's row for a name that is neither a market-table instrument nor an index member: a plain quote, with
 *  its 1D change only (a quote has no history). A yield moves in points like the table's yields (the page prints bp)
 *  and has no per-cent change; a price keeps its per-cent change as before. No quote: the row's name and dashes. */
export function watchRowFromQuote(symbol: string, listedName: string | null, q: QuoteLike | null | undefined) {
  const y = !!q && isYieldQuote(symbol, q.name, q.quoteType);
  const move = q?.price != null && q.prevClose != null ? q.price - q.prevClose : null;
  return {
    symbol, name: q?.name ?? listedName ?? symbol, kind: y ? "Fixed income" : q?.quoteType ?? "–", sector: null, ccy: q?.currency ?? null, last: q?.price ?? null,
    asOf: q?.time ? new Date(q.time * 1000).toISOString() : null, asOfKind: (q?.time ? "print" : null) as AsOfKind | null, source: q ? "Yahoo Finance" : null,
    pct1d: !y && q?.price != null && q.prevClose ? (q.price / q.prevClose - 1) * 100 : null, pct1w: null, pct1m: null, pct3m: null, pct12m: null,
    chg1d: y ? move : null, chg1w: null, chg1m: null, chg3m: null, chg12m: null, vs200chg: null,
    vs50: null, vs200: null, pos52: null, mcap: y ? null : q?.marketCap ?? null,
    earningsAt: !y && q?.earningsAt ? new Date(q.earningsAt * 1000).toISOString() : null, earningsEst: y ? null : q?.earningsEst ?? null, isYield: y,
  };
}

/** The watchlist's row for a market-table instrument. The as-of is a date for a close or a published figure and the
 *  print's own time otherwise. A page older than 19 Nov 2026 reads only the fields it knows: it shows a yield's
 *  changes as dashes (they are no longer sent as a per cent), and everything else as before. */
export function watchRowFromTable(t: TableLike): WatchTableRow {
  const y = isYieldRow(t), c = t.chg ?? {}, day = closeDay(t.lastAt);
  const kind: AsOfKind = official(t.source) ? "published" : day ? "close" : "print";
  const pc = (k: string) => (y ? null : t.pct[k] ?? null);
  return {
    symbol: t.symbol, name: t.name, kind: t.cls, sector: null, ccy: t.currency, last: t.last,
    asOf: t.lastAt == null ? null : kind === "print" ? t.lastAt : day ?? t.lastAt.slice(0, 10), asOfKind: t.lastAt == null ? null : kind,
    source: sourceName(t.source, t.symbol),
    pct1d: pc("d1"), pct1w: pc("w1"), pct1m: pc("m1"), pct3m: pc("m3"), pct12m: pc("m12"),
    chg1d: c.d1 ?? null, chg1w: c.w1 ?? null, chg1m: c.m1 ?? null, chg3m: c.m3 ?? null, chg12m: c.m12 ?? null,
    vs50: null,                                   // the table keeps no 50-day average
    vs200: y ? null : t.vs200 ?? null,            // a price: per cent from its 200-day average
    vs200chg: y ? t.vs200 ?? null : null,         // a yield: points from its 200-day average (bp on the page)
    pos52: t.pos52 ?? null, mcap: null, earningsAt: null, earningsEst: null, isYield: y,
  };
}
