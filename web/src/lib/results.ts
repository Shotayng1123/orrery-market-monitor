// A company's next results date as its source gives it (A's A-30, first step; 20 Nov 2026).
//
// Yahoo Finance gives the next results as a moment, not a date: in the source probe of 19 Nov 2026
// (calendarEvents), Toyota's was 06:30 UTC on 4 Feb 2027, 15:30 in Tokyo, which is the exchange's close, and
// NVIDIA's 21:00 UTC on 17 Nov 2026, 16:00 in New York, the close there. Nothing in the source says that such a
// time is the company's announced release time, so no screen writes one (A's rule: a time of day only where the
// source states the company's). What is left is the day, and it is the day in the company's own market: NVIDIA's
// 17 Nov in New York is 05:00 on the 18th in Singapore, and "18 Nov" would be a day the company never named.
// Tokyo's dates from JPX's 決算発表予定日, with "confirmed", come later (I-26); a plain date ("2027-02-04") is
// already read as written.
import { fmtDate, partsIn } from "./time";

/** The time zone of the market a symbol is listed on, by its Yahoo suffix; a name without one is a US listing,
 *  unless the index lists it comes from say otherwise (the results calendar's rows name them). */
const SUFFIX_TZ: Array<[RegExp, string]> = [
  [/\.T$/, "Asia/Tokyo"], [/\.(KS|KQ)$/, "Asia/Seoul"], [/\.HK$/, "Asia/Hong_Kong"], [/\.(SS|SZ)$/, "Asia/Shanghai"],
  [/\.(TW|TWO)$/, "Asia/Taipei"], [/\.(NS|BO)$/, "Asia/Kolkata"], [/\.SI$/, "Asia/Singapore"], [/\.AX$/, "Australia/Sydney"],
  [/\.L$/, "Europe/London"], [/\.(DE|F)$/, "Europe/Berlin"], [/\.PA$/, "Europe/Paris"], [/\.AS$/, "Europe/Amsterdam"],
  [/\.SW$/, "Europe/Zurich"], [/\.MI$/, "Europe/Rome"], [/\.MC$/, "Europe/Madrid"], [/\.(TO|V)$/, "America/Toronto"],
  [/\.SA$/, "America/Sao_Paulo"], [/\.MX$/, "America/Mexico_City"],
];
/** The lists the server keeps index members for (constituent_stats.idx), by their market. */
const INDEX_TZ: Record<string, string> = { NK225: "Asia/Tokyo", TOPIX: "Asia/Tokyo", SP500: "America/New_York", NDX: "America/New_York", KOSPI200: "Asia/Seoul", HSI: "Asia/Hong_Kong", SSE180: "Asia/Shanghai" };
const CITY: Record<string, string> = {
  "Asia/Tokyo": "Tokyo", "Asia/Seoul": "Seoul", "Asia/Hong_Kong": "Hong Kong", "Asia/Shanghai": "Shanghai", "Asia/Taipei": "Taipei",
  "Asia/Kolkata": "Mumbai", "Asia/Singapore": "Singapore", "Australia/Sydney": "Sydney", "Europe/London": "London", "Europe/Berlin": "Frankfurt",
  "Europe/Paris": "Paris", "Europe/Amsterdam": "Amsterdam", "Europe/Zurich": "Zurich", "Europe/Rome": "Milan", "Europe/Madrid": "Madrid",
  "America/Toronto": "Toronto", "America/Sao_Paulo": "São Paulo", "America/Mexico_City": "Mexico City", "America/New_York": "New York",
};
export const RESULTS_SOURCE = "Yahoo Finance";

/** The time zone of the market `symbol` is listed on ("Asia/Tokyo" for 7203.T, "America/New_York" for NVDA). */
export function listingTz(symbol: string, indices?: readonly string[] | null): string {
  const s = symbol.trim().toUpperCase();
  for (const [re, tz] of SUFFIX_TZ) if (re.test(s)) return tz;
  if (!s.includes(".")) for (const i of indices ?? []) if (INDEX_TZ[i]) return INDEX_TZ[i];
  return "America/New_York";
}
/** The city of that market, for the words around a date: "Tokyo", "New York". */
export const listingCity = (symbol: string, indices?: readonly string[] | null): string => CITY[listingTz(symbol, indices)] ?? "its market";

/** The day of a results date in the company's own market ("2027-02-04"); a plain date is its own; null for none. */
export function resultsDay(at: string | null | undefined, symbol: string, indices?: readonly string[] | null): string | null {
  if (at == null || at.trim() === "") return null;
  const plain = /^(\d{4}-\d{2}-\d{2})$/.exec(at.trim());
  if (plain) return plain[1];
  const t = Date.parse(at);
  return Number.isFinite(t) ? partsIn(listingTz(symbol, indices), new Date(t)).ymd : null;
}
/** "4 Feb 2027": the date alone, a date of the data (lib/time.ts); "–" for none. Never a time of day. */
export const fmtResultsDate = (at: string | null | undefined, symbol: string, indices?: readonly string[] | null): string => fmtDate(resultsDay(at, symbol, indices));

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A list's day bar for a day ("2027-02-04" → "Thursday 4 Feb"), as the calendars write theirs. */
export function resultsDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const wd = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${WD[wd]} ${Number(m[3])} ${MON[Number(m[2]) - 1]}`;
}

/** Rows with a results date in the order of their days (each in its own market), then of their moments: a list
 *  under day bars never shows a day twice. Rows without a date are left out. */
export function byResultsDay<T>(rows: readonly T[], at: (r: T) => string | null | undefined, symbol: (r: T) => string, indices?: (r: T) => readonly string[] | null | undefined): Array<T & { day: string }> {
  const out: Array<T & { day: string }> = [];
  for (const r of rows) { const day = resultsDay(at(r), symbol(r), indices?.(r)); if (day) out.push({ ...r, day }); }
  const t = (r: T) => { const x = Date.parse(at(r) ?? ""); return Number.isFinite(x) ? x : 0; };
  return out.sort((a, b) => a.day.localeCompare(b.day) || t(a) - t(b));
}

/** Yahoo's flag, in the designer's words: "est." (estimated, not confirmed by the company), "confirmed", or null
 *  where the source does not say. */
export const resultsStatus = (est: boolean | null | undefined): "est." | "confirmed" | null => (est === true ? "est." : est === false ? "confirmed" : null);
/** The same for a narrow column: "est.", "conf." or a dash. */
export const resultsStatusShort = (est: boolean | null | undefined): string => (est === true ? "est." : est === false ? "conf." : "–");
/** What follows the date in KEY DATA: "est. (Yahoo Finance)", "confirmed (Yahoo Finance)", or the source alone. */
export const resultsWords = (est: boolean | null | undefined, source = RESULTS_SOURCE): string => { const s = resultsStatus(est); return s ? `${s} (${source})` : source; };
/** The tooltip of a results date: whose day it is, from whom, and why it has no time of day. */
export function resultsTip(symbol: string, est: boolean | null | undefined, indices?: readonly string[] | null, source = RESULTS_SOURCE): string {
  const status = est === true ? "; estimated by Yahoo, not confirmed by the company" : est === false ? "; confirmed, as Yahoo marks it" : "";
  return `The next results as ${source} gives them: the day in ${listingCity(symbol, indices)}, where the company is listed${status}. No time of day: the source gives a time with the date but does not say that it is the company's release time.`;
}
/** One line for a list of results dates: whose days they are and why there is no time. */
export const RESULTS_NOTE = `${RESULTS_SOURCE} · each company's day in its own market · no time of day: the source states no release time`;
