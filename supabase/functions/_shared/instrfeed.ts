// What belongs to an instrument's own page besides its figures (I-4, 20 Nov 2026; B-04 (b) and the designer's I-4
// note): the calendar of its currencies and the headlines that name it. Pure: stock.ts reads the rows, this file
// says which ones; sim/logic.test.ts checks it.
//
// The headlines are matched by rules, as the news job sorts them into categories (daily/index.ts RULES): whole words,
// any case. For USD/JPY the words are "yen", "JPY", "BoJ" and "Bank of Japan" (B-04), and the page says which words
// it used. A word that is also an everyday English word ("won", "real", "try", "pound") is left out, or kept only in
// a phrase ("Korean won").

/** The words that name a currency, its central bank and its market. */
const CCY_WORDS: Record<string, string[]> = {
  USD: ["dollar", "greenback", "USD", "Fed", "Federal Reserve", "FOMC"],
  JPY: ["yen", "JPY", "BoJ", "Bank of Japan"],
  EUR: ["euro", "EUR", "ECB", "European Central Bank"],
  GBP: ["sterling", "British pound", "GBP", "Bank of England", "BoE"],
  AUD: ["Australian dollar", "Aussie dollar", "AUD", "RBA", "Reserve Bank of Australia"],
  NZD: ["New Zealand dollar", "NZD", "RBNZ", "Reserve Bank of New Zealand"],
  CAD: ["Canadian dollar", "loonie", "CAD", "Bank of Canada"],
  CHF: ["Swiss franc", "CHF", "SNB", "Swiss National Bank"],
  CNY: ["yuan", "renminbi", "CNY", "CNH", "PBoC"],
  HKD: ["Hong Kong dollar", "HKD", "HKMA"],
  KRW: ["Korean won", "KRW", "Bank of Korea"],
  TWD: ["Taiwan dollar", "TWD"],
  SGD: ["Singapore dollar", "SGD", "Monetary Authority of Singapore"],
  INR: ["rupee", "INR", "Reserve Bank of India"],
  MXN: ["Mexican peso", "MXN", "Banxico"],
  BRL: ["Brazilian real", "BRL"],
  ZAR: ["South African rand", "ZAR"],
  TRY: ["Turkish lira", "lira"],
};

/** Instruments with words of their own: yields by their market and central bank, commodities by name, indices and
 *  index futures by the index, coins by name. */
const UST = ["Treasury", "Treasuries", "Fed", "Federal Reserve", "FOMC"];
const JGB = ["JGB", "JGBs", "Japanese government bond", "Japanese government bonds", "BoJ", "Bank of Japan"];
const BUND = ["Bund", "Bunds", "German bond", "German bonds", "ECB", "European Central Bank"];
const OIL = ["oil", "crude", "Brent", "WTI", "OPEC"];
const SPX = ["S&P 500", "Wall Street"], NDQ = ["Nasdaq"], NIKKEI = ["Nikkei"], DOW = ["Dow Jones", "Dow"];
const SYMBOL_WORDS: Record<string, string[]> = {
  "^TNX": UST, "^FVX": UST, "^TYX": UST, "^IRX": UST, UST2Y: UST, UST3M: UST, "ZN=F": UST,
  JGB2Y: JGB, JGB10Y: JGB, JGB30Y: JGB,
  DE2Y: BUND, DE10Y: BUND,
  EA10Y: ["euro zone bond", "euro zone bonds", "euro area", "ECB", "European Central Bank"],
  GB10Y: ["gilt", "gilts", "Bank of England", "BoE"],
  CA10Y: ["Canadian bond", "Canadian bonds", "Bank of Canada"],
  "GC=F": ["gold", "bullion"], "SI=F": ["silver"], "HG=F": ["copper"], "PL=F": ["platinum"], "TIO=F": ["iron ore"], "ALI=F": ["aluminium", "aluminum"],
  "CL=F": OIL, "BZ=F": OIL, "NG=F": ["natural gas", "LNG"],
  "^GSPC": SPX, "ES=F": SPX, "^IXIC": NDQ, "^NDX": NDQ, "NQ=F": NDQ, "^N225": NIKKEI, "NKD=F": NIKKEI, "^DJI": DOW, "YM=F": DOW,
  "^RUT": ["Russell 2000"], "RTY=F": ["Russell 2000"], "^SOX": ["semiconductor", "semiconductors", "chipmaker", "chipmakers"],
  "^STOXX50E": ["Euro Stoxx", "Stoxx 50", "European stocks", "European shares"], "^STOXX": ["Stoxx 600", "European stocks", "European shares"],
  "^GDAXI": ["DAX", "German stocks"], "^FTSE": ["FTSE"], "^FCHI": ["CAC 40"], "^SSMI": ["SMI", "Swiss stocks"],
  "^HSI": ["Hang Seng"], "^HSCE": ["Hang Seng China"], "^KS11": ["Kospi"], "^KQ11": ["Kosdaq"], "^TWII": ["Taiex"],
  "000001.SS": ["Shanghai Composite", "China stocks"], "000300.SS": ["CSI 300"], "399001.SZ": ["Shenzhen"],
  "^NSEI": ["Nifty", "Sensex"], "^STI": ["Straits Times Index"], "^AXJO": ["ASX 200"], "^BVSP": ["Bovespa"], "^MXX": ["Mexican stocks"],
  "^VIX": ["VIX", "fear gauge"], "^VXN": ["VXN"],
  "BTC-USD": ["bitcoin", "crypto", "cryptocurrency"], "ETH-USD": ["ether", "ethereum"],
};

/** The calendar's currency for a currency the feeds quote under another code: the offshore yuan is China's. */
const CAL_CCY: Record<string, string> = { CNH: "CNY" };

/** The two currencies of a pair, from its name ("USD/JPY") or its symbol ("USDJPY=X"; "JPY=X" is the dollar against
 *  it); null for anything that is not a pair. The dollar index is the dollar's. */
export function pairOf(symbol: string, name?: string | null): [string, string] | null {
  const n = /^([A-Z]{3})\/([A-Z]{3})$/.exec((name ?? "").trim());
  if (n) return [n[1], n[2]];
  const s = /^([A-Z]{3})([A-Z]{3})=X$/.exec(symbol);
  if (s) return [s[1], s[2]];
  const u = /^([A-Z]{3})=X$/.exec(symbol);
  return u ? ["USD", u[1]] : null;
}
const DOLLAR_INDEX = /^DX-Y\.NYB$|^DX=F$/;

/** An index future's index's currency, its home: the calendar that moves the index. The CME's Nikkei 225 future is
 *  quoted in dollars, yet Japan's events are the ones that move the Nikkei (B-04 (b), B's verdict of 20 Nov 2026);
 *  the yen-quoted one and the US index futures are quoted at home. */
const INDEX_FUTURE_HOME: Record<string, string> = { "NKD=F": "JPY", "NIY=F": "JPY", "ES=F": "USD", "NQ=F": "USD", "YM=F": "USD", "RTY=F": "USD" };

/** The currencies whose calendar an instrument's page shows (B-04's EVENTS; the designer: "EVENTS · USD AND JPY"):
 *  a pair's two; the dollar index's dollar; an index future's, its index's currency first, then the currency it is
 *  quoted in where that differs (the Nikkei 225 future on the CME: JPY and USD); otherwise the currency the
 *  instrument is quoted in (gold and oil in dollars, the Euro Stoxx 50 in euros, a JGB yield in yen). In the
 *  calendar's own codes (CNH is CNY). */
export function eventCurrencies(symbol: string, name: string | null | undefined, currency: string | null | undefined): string[] {
  const pair = DOLLAR_INDEX.test(symbol) ? ["USD"] : pairOf(symbol, name), home = INDEX_FUTURE_HOME[symbol];
  const list = pair ?? (home ? [home, ...(currency ? [currency] : [])] : currency ? [currency] : []);
  return [...new Set(list.map((c) => CAL_CCY[c] ?? c).filter((c) => /^[A-Z]{3}$/.test(c)))];
}

/** The words an instrument's headlines are matched by (shown on the page as "matched by: …"): its own where it has
 *  them; a pair's: those of each currency but the dollar (the dollar's would bring every Fed headline to every pair);
 *  the dollar index's: the dollar's. Otherwise none: the page then says it has no rule for this instrument. */
export function newsWords(symbol: string, name?: string | null): string[] {
  const own = SYMBOL_WORDS[symbol];
  if (own) return [...own];
  if (DOLLAR_INDEX.test(symbol)) return [...CCY_WORDS.USD];
  const pair = pairOf(symbol, name);
  if (!pair) return [];
  const legs = pair.filter((c) => c !== "USD").map((c) => CAL_CCY[c] ?? c);
  const words = (legs.length ? legs : ["USD"]).flatMap((c) => CCY_WORDS[c] ?? [c]);
  return [...new Set(words)];
}

/** A word as a regular expression's text: letters, digits, spaces, "&", "'" and "-" only (the lists above), the
 *  rest escaped. */
const reText = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The browser-side rule: a headline matches when one of the words stands in it as a whole word, any case. */
export function wordsRegex(words: string[]): RegExp | null {
  return words.length ? new RegExp(`(?:^|[^A-Za-z0-9_])(?:${words.map(reText).join("|")})(?![A-Za-z0-9_])`, "i") : null;
}
/** The same rule for the database (PostgreSQL's ~*, through PostgREST's `imatch`): word edges written as [[:<:]] and
 *  [[:>:]], which need no backslash in a query string. The page applies wordsRegex to what comes back as well. */
export function wordsPg(words: string[]): string | null {
  return words.length ? `[[:<:]](${words.map((w) => reText(w).toLowerCase()).join("|")})[[:>:]]` : null;
}
/** The headlines that match, newest first, at most `n`. */
export function matchHeadlines<T extends { title: string; publishedAt: string }>(rows: T[], words: string[], n = 60): T[] {
  const re = wordsRegex(words);
  if (!re) return [];
  const t = (x: string) => { const v = Date.parse(x); return Number.isFinite(v) ? v : -Infinity; };
  return rows.filter((r) => re.test(r.title.replace(/&#x2019;|&#8217;|’/g, "'"))).sort((a, b) => t(b.publishedAt) - t(a.publishedAt)).slice(0, n);
}

/** An economic event as the calendar route sends it. A FXStreet row has the currency; a ForexFactory row has its
 *  currency code in `country` and none in `currency`. */
export interface EventRow { id: number | string; at: string; country: string; currency?: string | null; title: string; impact: string; forecast: string | null; previous: string | null; actual: string | null; better?: boolean | null; kind?: string | null; source?: string }
/** The currency an event belongs to. */
export const eventCcy = (e: { currency?: string | null; country: string }): string => e.currency ?? e.country;
/** The events of the currencies, in time order, between `from` and `to` (ISO). */
export function eventsFor<T extends EventRow>(rows: T[], ccys: string[], from: string, to: string): T[] {
  const want = new Set(ccys), a = Date.parse(from), z = Date.parse(to);
  return rows.filter((e) => want.has(eventCcy(e)) && Date.parse(e.at) >= a && Date.parse(e.at) <= z).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
}
/** How far the page's calendar reaches: five days back and eight ahead, as the calendar on NEWS. */
export const EVENTS_BACK_DAYS = 5, EVENTS_AHEAD_DAYS = 8;
/** How far back an instrument's headlines and alerts are read. */
export const INSTR_FEED_DAYS = 30;
