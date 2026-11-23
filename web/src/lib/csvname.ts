// A downloaded table's file name (round 3b, 22 Nov 2026: SF-4 and DC-12 of the reviews). Pure: the logic checks run it.
// "orrery-<name>-<YYYY-MM-DD>.csv", the day the day in Singapore, as every date on screen; a paper book's files are
// "orrery-paper-<book>-<panel>[-history]-<day>.csv", <book> its name as a file name may hold it.

/** The day in Singapore of a moment: "2026-11-22" from 2026-11-21T22:35Z. */
export function sgDay(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d), g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
/** A file's name for a table: "orrery-markets-2026-11-22.csv". */
export const csvFile = (name: string, d: Date = new Date()): string => `orrery-${name}-${sgDay(d)}.csv`;
/** A name as a file name: NFKC, lower case, letters and figures of any script kept, every other run one hyphen, none at
 *  either end, at most 40 characters; "book" where nothing is left. "Tokyo L/S" is "tokyo-l-s", "東京ロング・ショート"
 *  "東京ロング-ショート", "Équité Japon" "équité-japon". */
export function fileWord(name: string): string {
  const t = name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return [...t].slice(0, 40).join("").replace(/-+$/, "") || "book";
}
/** A paper book's word among the account's open books: its fileWord, and where an earlier-made book gives the same,
 *  "-2", "-3" … in the order the books were made. */
export function bookWord(book: { id: string; name: string; createdAt: string }, books: ReadonlyArray<{ id: string; name: string; createdAt: string }>): string {
  const w = fileWord(book.name), same = books.filter((b) => fileWord(b.name) === w).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const i = same.findIndex((b) => b.id === book.id);
  return i > 0 ? `${w}-${i + 1}` : w;
}
