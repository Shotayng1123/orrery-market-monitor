// The economic calendar's picks on NEWS, both layouts (Shota's Impact and Countries; B-12's Currency, I-4, 20 Nov 2026).
// Pure, so sim/logic.test.ts checks the rule: "Filtering by JPY shows only Japan's events".
import type { EconEvent } from "./types";

export const MAJOR = new Set(["US", "JP", "EUR", "DE", "FR", "UK", "CN", "HK", "KR", "TW", "AU", "CA", "CH", "IN", "SG"]);   // major markets only (Shota); everything else behind the All chip
/** The currency an event belongs to: FXStreet sends it; a ForexFactory row carries its currency code as its country. */
export const eventCcy = (e: Pick<EconEvent, "currency" | "country">): string => e.currency ?? e.country;
/** The order of the Currency picker (B-12, I-4): the majors first, as B listed them, then the rest by name. */
export const CCY_ORDER = ["USD", "EUR", "JPY", "GBP", "CNY", "AUD", "CAD", "CHF", "NZD", "KRW", "HKD", "SGD", "TWD", "INR"];
/** The Currency picker's choices: All, then the currencies of the events the Countries pick leaves (so a currency on
 *  offer always has events, whatever the impact). A currency no longer on offer reads as All. */
export function currencyOptions(rows: Array<Pick<EconEvent, "currency" | "country">>): string[] {
  const have = new Set(rows.map(eventCcy).filter(Boolean));
  return ["All", ...CCY_ORDER.filter((c) => have.has(c)), ...[...have].filter((c) => !CCY_ORDER.includes(c)).sort()];
}
/** The calendar's rows for the picks: impact, countries, and the currency (B-12: "Filtering by JPY shows only Japan's
 *  events"). Returns the rows and the currency in force (All when the one picked is not on offer). */
export function calendarRows(rows: EconEvent[], imp: "high" | "hm" | "all", scope: "major" | "all", ccyPick: string): { events: EconEvent[]; ccy: string; ccys: string[] } {
  const inScope = rows.filter((e) => scope === "all" || MAJOR.has(e.country));
  const ccys = currencyOptions(inScope), ccy = ccys.includes(ccyPick) ? ccyPick : "All";
  return { events: inScope.filter((e) => (imp === "all" || e.impact === "High" || (imp === "hm" && e.impact === "Medium")) && (ccy === "All" || eventCcy(e) === ccy)), ccy, ccys };
}

