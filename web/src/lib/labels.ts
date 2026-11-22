// One word per idea (the designer's glossary, plan review §3.1; D-17; I-5, 20 Nov 2026). Every label here is
// written once and used by both layouts, so a later panel never brings in a second word for the same thing. The
// computer upper-cases headers and panel titles (its style sheet, or `.toUpperCase()` for a panel's title); the phone
// writes them as given, in sentence case.

/** The tabs: MARKETS · NEWS · RESEARCH · EQUITIES · RATES & FX · WATCHLIST. The phone's bottom bar has room for
 *  "Rates" only. */
export const TAB = { market: "Markets", news: "News", research: "Research", equities: "Equities", rates: "Rates & FX", watch: "Watchlist" } as const;
export const TAB_BAR = { ...TAB, rates: "Rates" } as const;

/** The seventh tab, drawn only where the paper book is on (lib/paper.ts), and its words (the designer's glossary of
 *  21 Nov 2026): PAPER marks what is not real money; an absolute-return book has a Target return and a Target
 *  volatility, never an "Objective", and the market it is compared with is its Reference; a relative-return book has a
 *  Benchmark. "Risk used" is a volatility over the target volatility; the "sizing figure" the ex-ante volatility a book
 *  is sized by. */
export const PORTFOLIO = "Portfolio", PAPER_WORD = "PAPER", ONLY_YOU = "only you";
export const TARGET_RETURN = "Target return", TARGET_VOLATILITY = "Target volatility", REFERENCE = "Reference", BENCHMARK = "Benchmark", RISK_USED = "Risk used", SIZING_FIGURE = "Sizing figure";
/** PAPER's and "only you"'s tooltips. */
export const PAPER_TIP = "Paper portfolio: no real orders, no broker, no money. Fills are simulated from the market's own prints after each order.";
export const ONLY_YOU_TIP = "Visible to your account only";

// ---- "personal use" (the owner's decision P4 of 20 Nov 2026: "go with d. say personal use") ----
// Every source line that names a JPX, Nikkei, JSF or fund issuer's file ends with these two words; Help's "Data
// sources" and the README carry the paragraph, word for word (sim/logic.test.ts compares the README with it).
export const PERSONAL_USE = "personal use";
export const PERSONAL_USE_TEXT = "Files from JPX, Nikkei, JSF and fund issuers are used on the owner's statement that this Monitor's use is personal and non-commercial (20 Nov 2026). Each is credited where it is used.";
/** The publishers whose files carry "personal use" where a line names them in passing (LV-4 of round 3b: JPX's
 *  holiday calendar): "JPX's calendar (personal use)". */
export const PERSONAL_USE_PUBLISHERS: ReadonlySet<string> = new Set(["JPX", "Nikkei", "JSF"]);
/** What is read today, said beside the paragraph so that it claims no file the Monitor does not read. */
export const PERSONAL_USE_READ = "Read today: JPX's list of TSE-listed issues (TOPIX's members and their sectors), its short-selling ratio, short-position reports and margin balances, and Tokyo's holidays from its calendar; Nikkei's file of the Nikkei 225's members and weights. No JSF or fund issuer's file is read yet.";
/** What the owner's answer of 21 Nov 2026 rules out: named so that no screen is read as using them. */
export const NOT_USED_TEXT = "Not used, by the owner's decision of 21 Nov 2026: JPX's TOPIX weight file, its lending-fee file (品貸料), its margin balances by name, Osaka's settlement and volume pages and its results-date workbook (決算発表予定日); Nomura's holdings files; Cboe's VIX-family files.";
/** The file behind an index's member list where it is JPX's or Nikkei's: the line a computer shows, the line a phone
 *  shows, and the publisher and file in full for the phone's card. Other lists (Wikipedia's, Nasdaq's) are not theirs. */
export const MEMBERS_SOURCE: Record<string, { line: string; short: string; full: string }> = {
  TOPIX: { line: "members: JPX, list of TSE-listed issues (東証上場銘柄一覧)", short: "members: JPX", full: "TOPIX's members and their sectors: JPX, list of TSE-listed issues (東証上場銘柄一覧)." },
  NK225: { line: "members and weights: Nikkei Inc., Nikkei 225 weights file", short: "members: Nikkei", full: "The Nikkei 225's members and weights: Nikkei Inc., its weights file." },
};
/** SHORT INTEREST's JPX files in full, for the phone's card. */
export const JPX_SHORT_FILES = "JPX: the short-selling ratio (空売り集計), the short-position reports (空売り残高報告) and the margin balances (信用取引現在高).";
export const JPX_REPORTS_FILE = "JPX: the short-position reports (空売り残高報告) of holders of 0.5% and more.";
/** The window of every change shown, the picker on every tab (it was CHANGE on three phone tabs). */
export const PERIOD = "Period";
/** The window of the σ corridors. */
export const SIGMA_WINDOW = "σ window";
/** The last level against its 21-session mean, in σ. */
export const SIGMA_1M = "σ vs 1M avg";
/** Today's change over the σ of daily changes (63 sessions): a column, the strip on MARKETS and an alert's kind, for
 *  I-6 to use from the start ("1D σ" would read as the one-day standard deviation). */
export const SIGMA_1D = "1D in σ", MOVERS_SIGMA = "Movers in σ", SIGMA_MOVE = "σ move";
/** The two readings of MOVERS IN σ (B-32; the designer's note of 21 Nov 2026): the change since the last booked close,
 *  and each instrument's newest completed day. Chips on a computer (upper-cased), a toggle on a phone; a cell writes
 *  "last session" in lower case. */
export const TODAY = "Today", LAST_SESSION = "Last session";
/** Where the last level sits in its 52-week range, cells in "%". */
export const RANGE_52W = "52W range";
/** The distance from the moving averages (% for prices, bp for yields). */
export const VS_50D = "vs 50D", VS_200D = "vs 200D";
/** The instruments that move an index or a pair. */
export const DRIVERS = "Drivers";
/** Realised volatility over 1M, 3M and 12M (a stock's page and an instrument's: one word for both, I-4), and the
 *  largest rise and fall of the last twelve months. */
export const REALISED_VOL = "Realised vol", LARGEST_RISE = "Largest rise, 12M", LARGEST_FALL = "Largest fall, 12M";
/** The designer's mark for a figure the Monitor works out from sourced figures (§3.2): after the label, never the
 *  figure, with one line under the panel saying from what and over which dates (the reviewer's R2B-05). */
export const WORKED = "\u2020";
/** An instrument's page (I-4): its calendar, the level each change is measured from, its central banks' next
 *  meeting (filled once the Monitor keeps the banks' calendars, I-7), the calendar's currency picker on NEWS. */
export const EVENTS = "Events", LEVEL_THEN = "Level then", NEXT_MEETING = "Next meeting", CURRENCY = "Currency";
/** The asset classes as the table's bars and the kinds name them: a currency is FX, a yield is Rates. */
export const FX = "FX", RATES = "Rates";
const CLASS: Record<string, string> = { Currency: FX, "Fixed income": RATES };
/** A class or a kind as sent by the server ("Currency", "Fixed income", "Equities" …), in the glossary's word. */
export const classLabel = (cls: string | null | undefined): string => (cls ? CLASS[cls] ?? cls : "");
/** A headline's category in the glossary's word: the server's "Currency" is FX. */
export const categoryLabel = (c: string | null | undefined): string => (c === "Currency" ? FX : c ?? "");
/** The chart panels of FX and of the yields on RATES & FX (the yields' panel on MARKETS is RATES). */
export const FX_CHARTS = "FX charts", YIELD_CHARTS = "Yield charts";
/** The publishers' items (NEWS tab, phone section) and, on a name's page, its headlines and alerts together; "News &
 *  filings" once I-20 adds the filings, not before. */
export const HEADLINES = "Headlines", NEWS = "News", NEWS_FILINGS = "News & filings";
/** A company's reports. */
export const RESULTS = "Results", NEXT_RESULTS = "Next results", RESULTS_AHEAD = "Results ahead", RESULTS_CALENDAR = "Results calendar";
/** Market capitalisation. */
export const MKT_CAP = "Mkt cap";
/** Value traded, and its averages. */
export const TURNOVER = "Turnover";
export const avgVolume = (days: number): string => `Avg daily volume (${days}d)`;
export const avgTurnover = (days: number): string => `Avg daily turnover (${days}d)`;
/** A feed's delay: "DELAYED ~10m" on the computer, "Delayed ~10m" on the phone. */
export const delayed = (min: number, upper = false): string => `${upper ? "DELAYED" : "Delayed"} ~${min}m`;
/** The earlier curve on a curve chart: "dotted line: 19 Nov 2025 (12M ago)". */
export const dottedLine = (date: string, ago: string): string => `dotted line: ${date} (${ago} ago)`;
/** Central banks in running text (upper case only where the style sheet upper-cases). */
const BANKS: Record<string, string> = { FED: "Fed", ECB: "ECB", BOJ: "BoJ", BOE: "BoE", RBA: "RBA", BOK: "BoK", PBOC: "PBoC", SNB: "SNB", BOC: "BoC", RBNZ: "RBNZ", HKMA: "HKMA", MAS: "MAS" };
export const bankName = (code: string): string => BANKS[code.toUpperCase()] ?? code;

/** The index lists by the names the Monitor uses for them. */
const INDEX_NAMES: Record<string, string> = { NK225: "Nikkei 225", TOPIX: "TOPIX", SP500: "S&P 500", NDX: "Nasdaq 100", KOSPI200: "KOSPI 200", HSI: "Hang Seng", SSE180: "SSE 180" };
export const indexName = (code: string): string => INDEX_NAMES[code] ?? code;
/** What a listed name is, by where it is listed: "Tokyo stock", "US stock" … (the designer's I-2 (e) words). */
export function stockKind(symbol: string): string {
  const s = symbol.toUpperCase();
  return /\.T$/.test(s) ? "Tokyo stock" : /\.(KS|KQ)$/.test(s) ? "Seoul stock" : /\.HK$/.test(s) ? "Hong Kong stock" : /\.(SS|SZ)$/.test(s) ? "China stock" : /\.L$/.test(s) ? "London stock" : /\.SI$/.test(s) ? "Singapore stock" : /^[A-Z][A-Z.-]{0,5}$/.test(s) ? "US stock" : "Stock";
}
/** A search hit's second line after its symbol, from the server's `kind` and `note` ("Equity", "NK225 · Transportation";
 *  "Currency", "Monitor instrument"): "Tokyo stock · Nikkei 225 · Transportation", "FX". */
export function hitLine(h: { symbol: string; kind: string; note: string }): string {
  const parts = (h.note ?? "").split(" · ").map((x) => x.trim()).filter((x) => x && x !== "Monitor instrument");
  const stock = /^(equity|stock)$/i.test(h.kind ?? "");
  const head = stock ? stockKind(h.symbol) : classLabel(h.kind);
  const rest = parts.map((x, i) => (i === 0 && stock && INDEX_NAMES[x] ? INDEX_NAMES[x] : x));
  return [head, ...rest].filter(Boolean).join(" · ");
}
