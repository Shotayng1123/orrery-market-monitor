// What pf_jpx prints of a JPX page, and which links it may follow: the rules, pure, so that they can be checked without
// a request (sim/logic.test.ts). Written after the checks of round 3b (21 Nov 2026: PR-3, PR-4, PR-5).
//
// The owner's record: a probe of JPX prints the values the plan needs (numbers, dates, clock times, each page's own
// title and date, and the row and column labels a number needs to be read), not the pages' text. The first pf_jpx
// printed every line that held a match, cut at 220 characters: four sentences of JPX's prose, two navigation labels,
// seventeen link labels and three notice titles went into a public job log. So nothing here returns a line of a page.
// What a page gives is one of:
//   - its values (`valueBits`): the matches of one line in order, joined only by the one short word that stands
//     between two of them ("9:00 am to 11:30 am"); never the words around them. (Until 22 Nov 2026 each value came with
//     two words on each side, and on JPX's trading-hours page the pieces of one paragraph touched and overlapped, so
//     consecutive lines gave back its sentences: PX-1 of the review of fix part 1);
//   - the cells of a table of figures (`figureTables`: a table most of whose cells are figures; a cell of prose in it
//     is counted, not printed; a table of notices or of text is not a table of figures and is left out whole);
//   - a date the page gives for a market holiday (`calendarDays`: the date itself, from a line that carries its weekday).
// `sayable` is the last guard: pf_jpx passes every piece of a page it prints through it.
import { addressOf, decoded, firstHeading, tablesOf, textLines, titleOf } from "./lib.ts";

/** The most words a printed piece of a page may have (a run of values, a table cell, a label). */
export const MAX_WORDS = 9;
const words = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);
const CJK = /[぀-ヿ㐀-鿿]/;
/** The characters of a piece written without spaces between words (Japanese), its figures and marks aside. */
const jaLength = (t: string): number => t.replace(/[\s\d\/（）().,:：|%％-]/g, "").length;
/** A piece that reads as a sentence, however short: it ends with a full stop, a question or an exclamation mark after
 *  a word (not an abbreviation such as "a.m." or "No."), it holds two sentences, or it says something with a verb of
 *  being, of the modal kind or of what is done ("Orders are accepted from 8:00 am", "Short selling is prohibited");
 *  in Japanese, one that ends as a sentence does (です, ます, ません …). A label, a figure or a date says nothing of
 *  the kind ("Tick Size (yen)", "More than 3,000 yen up to 5,000 yen", "2026/11/23（月） 勤労感謝の日"). */
const ABBREV = /(?:\b[a-z]\.|\b(?:no|nos|vol|approx|etc|inc|ltd|co|corp|jr|sr|st|vs|e\.g|i\.e)\.)$/i;
// lower case only, so that the month "May" is no verb; a sentence that opens with one is caught by VERB_FIRST
const VERB = /\b(?:is|are|was|were|be|been|being|will|shall|may|might|must|can|cannot|could|should|would|has|have|had|do|does|did|accepted|applies|apply|applied|prohibited|permitted|allowed|required|means|refers)\b/;
const VERB_FIRST = /^(?:Is|Are|Was|Were|Will|Shall|Must|Can|Cannot|Could|Should|Would|Do|Does|Did|Has|Have|Had)\b/;
const JA_END = /(?:です|ます|ません|でした|ました|である|となる|となります|ください|下さい)[）)」』]?$/;
export const sentenceLike = (s: string): boolean => {
  const t = s.trim();
  if (CJK.test(t) && JA_END.test(t.replace(/[\s.。]+$/, ""))) return true;
  if (/[.!?]$/.test(t) && /[A-Za-z]{2,}[.!?]$/.test(t) && !ABBREV.test(t)) return true;
  if (/[a-z]{2,}[.!?]\s+[A-Z]/.test(t)) return true;
  return VERB.test(t) || VERB_FIRST.test(t);
};
// ---- the closed list (PL-1 of the final review of pull request #50) ----
// sentenceLike knows a sentence only by its signs, and a short statement with any other verb passed it: "Trading
// resumes at 12:30 pm" as a cell, "The afternoon session ends at 3:30 pm" as the label before a table, 取引は9時に始まる.
// So a piece is printed only when it is made of figures, dates, clock times and the words of a closed list: the labels,
// units and joining words JPX's tables of figures carry (the logs of 20 and 21 Nov 2026 and the checks' pages). A piece
// without a figure must be one of the labels whole in English; in Japanese it may be the list's labels joined by の,
// から and まで ("構成銘柄以外の銘柄"); one with figures may hold, beside them, only words of the list. Anything else is
// counted, not printed. A new label JPX adds is held until it is put here. Many of the list's words can be read as
// verbs as well as nouns (changes, limits, limit, order, note, quote, issues, issue, shares, share, prices, price,
// groups, spread, rules, market and others): a piece made of the list's words and figures alone passes as it stands,
// whatever it says ("TOPIX changes from 2027", "Order 100 shares", "TOPIX groups issues from 2027", "Short selling
// rules 10% of prices"; the checks of fix parts 3 and 4); only a word outside the list, a verb among them, holds it.
const LABELS = new Set(["price per share (yen)", "tick size (yen)", "tick size", "tick sizes", "up to", "over", "less than", "more than", "or more", "or less", "previous day's closing price/special quote (yen)", "previous day's closing price", "special quote", "daily price limits (yen)", "daily price limits", "daily price limit (yen)", "daily price limit", "base price (yen)", "base price", "morning session", "afternoon session", "auction trading", "order acceptance", "note", "notes", "other issues", "topix500 constituents", "trading rules of domestic stocks", "trading hours", "trading unit", "date", "code", "name"]);
const LABEL_WORDS = new Set(("yen million billion thousand units unit shares share am pm a.m p.m % to and or up over under less than more from until till through per of no " +
  "price prices tick size sizes previous day's day days closing special quote daily limits limit base morning afternoon session sessions auction trading order acceptance note other issues issue " +
  "constituents constituent topix changes effective rules domestic stocks short selling market holiday holidays str spread-to-tick spread ratio class classes group groups category categories " +
  "jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december mon tue wed thu fri sat sun").split(" "));
// Japanese: the labels and units its tables and holiday rows carry; the particles の, から and まで between them
const JA_LABELS = ["勤労感謝の日", "建国記念の日", "スポーツの日", "みどりの日", "こどもの日", "成人の日", "春分の日", "秋分の日", "昭和の日", "文化の日", "敬老の日", "海の日", "山の日", "国民の休日", "振替休日", "天皇誕生日", "憲法記念日", "休業日", "元日", "祝日", "休日",
  "構成銘柄", "銘柄", "以外", "以上", "以下", "未満", "値段", "呼値", "値幅", "制限", "単元", "前場", "後場", "立会", "円", "超", "株", "年", "月", "日", "時", "分"];
const isFig = (w: string): boolean => /\d/.test(w) || /^[-–—~〜～&±/|%％:：]+$/.test(w) || w === "&plusmn;";
/** Whether a piece holds nothing but figures, dates, clock times and the closed list's labels and words (above). */
export const labelOnly = (s: string): boolean => {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return true;
  const latin = t.replace(/[぀-ヿ㐀-鿿（）]/g, " ").split(/[\s/|]+/).map((w) => w.toLowerCase().replace(/^[(\["“'‘]+|[)\]"”'’,.:;\-–]+$/g, "")).filter(Boolean);
  const latinOk = latin.every((w) => isFig(w) || LABEL_WORDS.has(w) || LABEL_WORDS.has(w.replace(/\.$/, "")));
  if (CJK.test(t)) {
    let r = t.replace(/[（(][日月火水木金土][）)]/g, " ").replace(/[A-Za-z0-9.,:：/%％()（）\-–~〜～・、|\s]+/g, " ");
    for (const tok of JA_LABELS) r = r.split(tok).join(" ");
    return latinOk && r.replace(/から|まで|の/g, " ").trim() === "";
  }
  if (!/\d/.test(t)) return LABELS.has(t.toLowerCase().replace(/[.:]$/, ""));
  return latinOk;
};
/** Whether a piece of a page may be printed: no more than MAX_WORDS words and 90 characters, nothing that reads as a
 *  sentence (sentenceLike), however short (PX-1: a table cell, a heading or a title piece of up to nine words could
 *  carry a whole sentence); where it is written without spaces between words (Japanese), no more than 28 characters
 *  and no full stop (。): "2026年9月22日（火）は、…休日です。" is 21 characters, and went into the log; and nothing
 *  but figures, dates, clock times and the closed list's labels and words (labelOnly, PL-1). */
export const sayable = (s: string): boolean => { const t = s.trim(); return words(t).length <= MAX_WORDS && t.length <= 90 && !sentenceLike(t) && !(CJK.test(t) && (t.includes("。") || jaLength(t) > 28)) && labelOnly(t); };

/** Whether an address is on jpx.co.jp: the host itself or one under it, as a request reads the address (lib.ts). */
export const onJpx = (url: string): boolean => { const a = addressOf(url); return !!a && (a.host === "jpx.co.jp" || a.host.endsWith(".jpx.co.jp")); };
/** The first link whose text matches `want` AND whose address is on jpx.co.jp. A rule page is read only when a JPX
 *  page links it: no address is tried from memory (the first pf_jpx tried one for the short-selling rule and read
 *  JPX's daily list of triggered stocks, which is not a rule page), and a link to another site is never followed.
 *  `also`: the text must match this too; `never`: a text that matches this is passed over. */
export const linkedOnJpx = (links: Array<{ href: string; text: string }>, want: RegExp, also: RegExp | null = null, never: RegExp | null = null): { href: string; text: string } | null =>
  links.find((l) => want.test(l.text) && (!also || also.test(l.text)) && !(never && never.test(l.text)) && onJpx(l.href)) ?? null;
/** The short-selling RULE page among a page's links: its text names short selling and a rule (regulation, restriction,
 *  rule, price), and is not a page of figures or of names (value, ratio, statistics, data, a list, triggered stocks,
 *  balances, a daily, weekly or monthly report): those are not what the owner released, and the list of triggered
 *  stocks is what the first run read by mistake. */
export const SHORT_SELLING = /short[- ]?sell/i, RULE_WORD = /regulat|restrict|rule|price/i, NOT_A_RULE = /value|ratio|statistic|data|list|trigger|balance|report|daily|weekly|monthly|outstanding/i;
export const shortRuleLink = (links: Array<{ href: string; text: string }>): { href: string; text: string } | null => linkedOnJpx(links, SHORT_SELLING, RULE_WORD, NOT_A_RULE);
/** Whether a page taken by its link's name is, by its own title or first heading, a page of figures, names or a
 *  report and not a rule page: nothing of it is printed then. JPX's section "Short Selling Regulation- Information"
 *  passes the link's test, and the page behind it is the daily list of triggered stocks (PX-6 of the review of fix
 *  part 1). */
export const notRulePage = (html: string): boolean => [titleOf(html), firstHeading(html)].some((t) => NOT_A_RULE.test(t));
/** The addresses of the links that name short selling on jpx.co.jp and were not taken as the rule page (addresses
 *  only: a person reads them and gives the rule page's address). */
export const shortOtherLinks = (links: Array<{ href: string; text: string }>): string[] => { const taken = shortRuleLink(links)?.href; return [...new Set(links.filter((l) => SHORT_SELLING.test(l.text) && onJpx(l.href) && l.href !== taken).map((l) => l.href))]; };

/** The one short word that may stand between two values a page gives ("9:00 am to 11:30 am", "8:00 am and 12:05
 *  pm", 9:00～11:30): a word that joins a range or a pair, nothing that says what the values are about. */
const JOIN = /^(?:to|and|or|until|till|through|thru|-|–|—|~|〜|～|&|\/|から|まで|及び|および|・|、)$/i;
/** The values a page's text gives: in each line (each table cell of it, each Japanese sentence), the matches of
 *  `want` in order, one piece per run of values that only a joining word (JOIN) or nothing stands between: "9:00 am to
 *  11:30 am". No word around the values is printed, so no two pieces can carry the page's words between them, and the
 *  pieces of a paragraph cannot be read back into its sentences (PX-1). Each piece once, at most `max`. */
export function valueBits(lines: string[], want: RegExp, max = 30): string[] {
  const re = new RegExp(want.source, want.flags.includes("g") ? want.flags : `${want.flags}g`), out: string[] = [], seen = new Set<string>();
  // a clock time's "pm" takes the sentence's full stop with it ("3:30 pm."): it is the sentence's, not the value's
  const push = (bit: string) => { const b = bit.replace(/\s+/g, " ").trim().replace(/(\d\s*[ap]m)\.$/i, "$1"); if (!b || seen.has(b)) return; seen.add(b); if (out.length < max) out.push(b); };
  for (const line of lines) {
    let run = "", prevEnd = -1;
    for (const m of line.matchAll(re)) {
      const val = m[0].trim();
      if (!val) continue;
      const at = m.index ?? 0;
      if (prevEnd >= 0) {
        const gap = line.slice(prevEnd, at), g = gap.trim();
        // a cell's edge (" | "), a sentence's end, or more than one word between two values: the run ends there
        const joins = !/[|。]/.test(gap) && !/[.!?;]\s/.test(gap) && (g === "" || g === "," || (words(g).length === 1 && JOIN.test(g)));
        // in Japanese the joining word stands with no space ("9時00分から11時30分")
        if (joins) run += g === "" ? ` ${val}` : g === "," ? `, ${val}` : CJK.test(g) || /^[〜～~]$/.test(g) ? `${g}${val}` : ` ${g} ${val}`; else { push(run); run = val; }
      } else run = val;
      prevEnd = at + m[0].length;
    }
    if (run) push(run);
  }
  return out;
}

const digitsOf = (c: string): number => (c.match(/[\d.,:%]/g) ?? []).length;
/** A cell that is a figure: it holds a digit, and it is short (three words at most; in Japanese, which has no spaces
 *  between words, twelve characters beside its figures) or at least three of its ten characters are digits and their
 *  marks ("More than 3,000 yen up to 5,000 yen" is; a notice's title with a year in it is not). A sentence (it ends
 *  with 。, or reads as one: sentenceLike) is none, whatever figures it holds. */
export const figureCell = (c: string): boolean => /\d/.test(c) && !(CJK.test(c) && c.includes("。")) && !sentenceLike(c) && labelOnly(c) && ((words(c).length <= 3 && (!CJK.test(c) || jaLength(c) <= 12)) || digitsOf(c) / Math.max(1, c.replace(/\s/g, "").length) >= 0.3);
/** A cell as it may be printed: a figure or a label (cut at 40 characters); a cell of prose is not printed, only said
 *  to be there. */
export const cellOut = (c: string): string => (c === "" ? "" : figureCell(c) || sayable(c) ? (c.length > 40 ? `${c.slice(0, 40)}…` : c) : CJK.test(c) && words(c).length <= 3 ? `(text of ${c.length} characters: not printed)` : `(text of ${words(c).length} words: not printed)`);
const HELD_CELL = /^\(text of \d+ (?:words|characters): not printed\)$/;
/** A page's tables of figures: those in which at least six in ten of the filled cells below the first row and right of
 *  the first column are figures. A table of dated notices (a date and a title a row) or of text is none. Each with
 *  the heading before it where that is a label, and its rows as they may be printed. */
export function figureTables(html: string, want: RegExp | null = null): Array<{ heading: string; rows: string[][]; held: number }> {
  const out: Array<{ heading: string; rows: string[][]; held: number }> = [];
  for (const t of tablesOf(html)) {
    const body = t.rows.slice(1).flatMap((r) => r.slice(1)).filter((c) => c !== "");
    const figures = body.filter(figureCell).length;
    if (!body.length || figures / body.length < 0.6) continue;
    if (want && !want.test(`${t.heading} ${t.rows.slice(0, 3).flat().join(" ")}`)) continue;
    const rows = t.rows.map((r) => r.map(cellOut));
    out.push({ heading: sayable(t.heading) ? t.heading : "", rows, held: rows.flat().filter((c) => HELD_CELL.test(c)).length });
  }
  return out;
}
/** How many of a page's tables are not tables of figures (left out whole). */
export const otherTables = (html: string): number => tablesOf(html).length - figureTables(html).length;

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], WD_EN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], WD_JA = "日月火水木金土";
const iso = (y: number, m: number, d: number): string | null => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null; };
const weekdayOf = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();
/** The market holidays a calendar page gives, as dates. A day counts only where the page gives it with its weekday
 *  and the two agree: "2026/11/23（月）", which carries its year; or "Nov. 23 (Mon.)", which carries none, and is the
 *  one year among `years` in which that date falls on that weekday (two years running never share one). The first
 *  pf_jpx looked for the month and the day alone, so a row of the wrong year, or a slip of a day in one year, was
 *  "named" by the other year's line (PR-3). A line that says when the page was updated is no holiday. `odd`: dated
 *  pieces whose weekday did not fit. */
export function calendarDays(lines: string[], years: number[] = [2026, 2027]): { days: string[]; odd: number } {
  const days = new Set<string>();
  let odd = 0;
  for (const l of lines) {
    if (/更新|update|updated|last modified/i.test(l)) continue;
    for (const m of l.matchAll(/(20\d\d)\s*[\/年.]\s*(\d{1,2})\s*[\/月.]\s*(\d{1,2})\s*日?\s*[（(]\s*([日月火水木金土])/g)) {
      const d = iso(Number(m[1]), Number(m[2]), Number(m[3]));
      if (d && weekdayOf(d) === WD_JA.indexOf(m[4])) days.add(d); else odd++;
    }
    for (const m of l.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:,\s*(20\d\d)\s*)?[（(]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s*[)）]/gi)) {
      const mo = MON.indexOf(m[1].toLowerCase()) + 1, wd = WD_EN.indexOf(m[4].toLowerCase());
      const fits = (m[3] ? [Number(m[3])] : years).map((y) => iso(y, mo, Number(m[2]))).filter((d): d is string => !!d && weekdayOf(d) === wd);
      if (fits.length === 1) days.add(fits[0]); else odd++;
    }
  }
  return { days: [...days].sort(), odd };
}
/** The Monitor's rows set against the page's days, both ways, between two dates (inclusive): the rows the page gives,
 *  the rows it does not, and the page's weekday holidays the Monitor has no row for (a weekend's is no session
 *  either way). */
export function calendarCheck(pageDays: string[], mine: string[], from: string, to: string): { named: string[]; notNamed: string[]; lacking: string[] } {
  const page = new Set(pageDays), rows = mine.filter((d) => d >= from && d <= to), have = new Set(mine);
  const weekday = (d: string) => { const w = weekdayOf(d); return w >= 1 && w <= 5; };
  return { named: rows.filter((d) => page.has(d)), notNamed: rows.filter((d) => !page.has(d)), lacking: pageDays.filter((d) => d >= from && d <= to && weekday(d) && !have.has(d)) };
}

/** A page's text lines and its title, for pf_jpx (the helper's own readers, re-exported so the probe has one import). */
export { decoded, textLines };
