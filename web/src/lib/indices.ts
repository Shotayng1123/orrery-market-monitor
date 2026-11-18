// The indices the EQUITIES tab has a page for: the index itself with its sectors, breadth, movers and names.
// `symbol` is the row of the market table the index is read from (TOPIX and the Shanghai Composite have no series
// of their own in the feed, so a fund and the exchange's code stand in); `stats` names the list of constituents.
export const INDICES = [
  { id: "topix", label: "TOPIX", symbol: "1306.T", stats: "TOPIX", statsNote: "", support: ["^N225", "NKD=F", "USDJPY=X", "JGB10Y"] },
  { id: "nk225", label: "NIKKEI 225", symbol: "^N225", stats: "NK225", statsNote: "", support: ["NKD=F", "1306.T", "USDJPY=X", "^SOX"] },
  { id: "spx", label: "S&P 500", symbol: "^GSPC", stats: "SP500", statsNote: "", support: ["ES=F", "^VIX", "^TNX", "DX-Y.NYB"] },
  { id: "ixic", label: "NASDAQ COMP", symbol: "^IXIC", stats: "NDX", statsNote: "Nasdaq-100 names stand in for the Composite's ~3,000 constituents", support: ["NQ=F", "^SOX", "^VIX", "^TNX"] },
  { id: "kospi", label: "KOSPI", symbol: "^KS11", stats: "KOSPI200", statsNote: "KOSPI 200 names stand in for the ~800-name KOSPI", support: ["KRW=X", "^SOX", "^TWII", "^GSPC"] },
  { id: "hsi", label: "HANG SENG", symbol: "^HSI", stats: "HSI", statsNote: "", support: ["000001.SS", "CNH=X", "^GSPC", "^TNX"] },
  { id: "sse", label: "SHANGHAI COMP", symbol: "000001.SS", stats: "SSE180", statsNote: "SSE 180 names stand in for the ~2,200-name Composite", support: ["^HSI", "CNH=X", "HG=F", "^GSPC"] },
] as const;
export type IndexId = (typeof INDICES)[number]["id"];

/** Where a symbol's own page is (the part of the address after #). An index of the list above has its page on the
 *  EQUITIES tab; everything else (a stock, a currency, a future, an index without constituents here) has the
 *  single-name page. One rule for every link, so the same name never opens two different pages. */
export function pageHash(symbol: string): string {
  const ix = INDICES.find((i) => i.symbol === symbol);
  return ix ? `equities/${ix.id}` : `asset/${encodeURIComponent(symbol)}`;
}
