// A stock's own page: the shape the server sends (action `stock`; built in supabase/functions/_shared/stock.ts
// from fin.ts and stockstats.ts) and how its figures are written. Everything here is display: no figure is
// worked out on the page except the two sums named in finSections (net cash, free cash flow).
import { fmtNum } from "./fmt";
import { partsIn, SGT } from "./time";

export interface PerfRow { h: string; from: string | null; base: number | null; stock: number | null; bench: Array<number | null>; rel: Array<number | null> }
export interface Benchmark { symbol: string; name: string; note: string | null }
export type FinLine = "revenue" | "cogs" | "gross" | "sga" | "op" | "nonOpInc" | "nonOpExp" | "ordinary" | "extraInc" | "extraLoss" | "pretax" | "ni" | "eps" | "dps"
  | "cash" | "stDebt" | "ltDebt" | "assets" | "liabilities" | "equity" | "ocf" | "icf" | "fincf" | "capex" | "shares" | "dilutedShares" | "bps" | "payoutReported"
  | "rd" | "interestNet" | "otherNonOp" | "tax" | "unusual" | "cashSti" | "buyback" | "divPaid" | "sbc";   // lines of a company outside Japan
export type RatioId = "salesYoy" | "gpm" | "opm" | "npm" | "payout" | "roe" | "equityRatio";
/** Which rows a company's table has (the server decides, supabase/functions/_shared/fin.ts): a Japanese company
 *  keeps the lines of Japanese statements, a company elsewhere gets those of US GAAP and IFRS statements. A row
 *  in `optional` is shown only when some period has a figure. `netCash` and `fcf` are the two sums made here. */
export type FinRowId = FinLine | "netCash" | "fcf";
export interface FinLayout { is: FinRowId[]; bs: FinRowId[]; cf: FinRowId[]; optional: Array<FinRowId | RatioId>; labels?: Partial<Record<FinRowId, string>>; titles?: Partial<Record<FinRowId | RatioId, string>> }
/** A column of the statements. `url` is the address of the document behind it as the source gives it (a year's
 *  有価証券報告書 on EDINET, with `doc` its document ID; the 決算短信 PDF of the guidance, of a quarter or of a year
 *  known only from it), or null; `filed` the date that document was filed or disclosed, where the source says (a
 *  server from before 20 Nov 2026 sends none, nor a quarter's address). */
export interface FinPeriod { key: string; end: string; label: string; kind: "FY" | "Q" | "FC"; months: number; std: string | null; doc: string | null; url: string | null; note: string | null; filed?: string | null }
export interface FinSet { periods: FinPeriod[]; lines: Partial<Record<FinLine, Array<number | null>>> }
export interface FinUnit { div: number; label: string; dp: number }
export interface Fin {
  source: "edinetdb" | "yahoo"; currency: string | null; unit: FinUnit;
  annual: FinSet; quarterly: FinSet;
  ratios: { annual: Partial<Record<RatioId, Array<number | null>>>; quarterly: Partial<Record<RatioId, Array<number | null>>> };
  guidance: { end: string; disclosed: string | null; quarter: number | null; progress: Partial<Record<"revenue" | "op" | "ordinary" | "ni", number | null>>; ytdMonths: number | null } | null;
  asOf: string | null; notes: string[];
  layout?: FinLayout;
}
export type ShortData =
  | { kind: "finra"; d: string; ratio: number }
  | { kind: "jpx"; d: string; ratio: number; shares: number | null; daysToCover: number | null; holders: Array<{ holder: string; ratio: number; d: string }> }
  | { kind: "interest"; d: string | null; shares: number | null; pctFloat: number | null; pctOut: number | null; daysToCover: number | null; prior: number | null; priorDate: string | null; finra: { d: string; ratio: number } | null };
/** A big move of the stock (supabase/functions/_shared/bigmoves.ts). Since 19 Nov 2026: a day of 10% or more
 *  (d1), a new peak (pk) or a bottom (bt) of its closes, or a smaller peak (p2) or bottom (b2); before that a day
 *  of 5% or more, five sessions of 10% or more (w1), or a fall or rise of 20% or more within a month (m1).
 *  `text` says it in words; `dir` is its colour: the day's move, and for a peak down, for a bottom up. `status`
 *  is where the search for its reason stands: found (with `cause` and `sources`), not_found (searched, nothing
 *  reliable), queued (being looked up), failed (the look-up itself failed three times), old (older than the
 *  twelve months reasons are looked up for), off (this server does not look reasons up). */
export interface MoveRow { kind: "d1" | "w1" | "m1" | "pk" | "bt" | "p2" | "b2"; dir: 1 | -1; pct: number; from: string; to: string; fromPx: number; toPx: number; t: number; text: string; status: "found" | "not_found" | "queued" | "failed" | "old" | "off"; cause: string | null; sources: Array<{ title: string; url: string }> }
export type MoveRule = "classic" | "swings";
export interface MoveSizes { day: number; large: number; small: number }
/** A smaller peak or bottom: drawn as a smaller circle and a smaller dot. */
export const isSmallMove = (m: { kind: MoveRow["kind"] }): boolean => m.kind === "p2" || m.kind === "b2";
/** The rule a stock's marks follow, in the words of the page: the short parts for the panel's header and one
 *  sentence for the phone. The sizes come from the server with the rows; the defaults are those of 19 Nov 2026.
 *  A server from before that day sends no rule: its marks follow the first one. */
export function moveRule(rule?: MoveRule, z: MoveSizes = { day: 10, large: 15, small: 10 }): { parts: string[]; note: string } {
  return rule === "swings"
    ? { parts: [`${z.day}% in a day`, "peaks red, bottoms green", `large circles: turns of ${z.large}%, a peak only when a 12-month high`, `small circles: turns of ${z.small}%`], note: `A day of ${z.day}% or more, and the peaks (red) and bottoms (green) of the closes. Large circles are turns of ${z.large}% or more, a peak only when it was a 12-month high; small circles are turns of ${z.small}%. Each is marked once the price has turned that far from it.` }
    : { parts: ["5% in a day", "10% in five sessions", "20% from high to low, or low to high, within a month"], note: "A day of 5% or more, five sessions of 10% or more, or 20% from a high to a low (or a low to a high) within a month." };
}
export const whyText = (m: MoveRow): string => (m.status === "found" && m.cause ? m.cause : m.status === "not_found" ? "No reliable report of the reason was found." : m.status === "queued" ? "The reason is being looked up; it appears here when found." : m.status === "failed" ? "The look-up for this move failed; no reason is shown." : m.status === "old" ? "Not looked up: reasons are searched for moves of the last twelve months." : "Reasons are not looked up on this server yet.");
/** The moves as marks for the chart: one per day (the moves that end the same day share a circle, coloured by the
 *  largest; a small circle when they are all smaller peaks or bottoms). Each item carries the move in its three
 *  parts (moveParts) for the chart's card, beside the server's sentence. */
export function chartMarks(rows: MoveRow[]): Array<{ t: number; dir: 1 | -1; small: boolean; title: string; items: Array<{ text: string; why: string; pct: number; word: string | null; fig: string; rest: string }> }> {
  const by = new Map<string, MoveRow[]>();
  for (const r of rows) by.set(r.to, [...(by.get(r.to) ?? []), r]);
  return [...by.entries()].map(([to, rs]) => ({ t: rs[0].t, dir: [...rs].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0].dir, small: rs.every(isSmallMove), title: to, items: rs.map((r) => ({ text: r.text, why: whyText(r), pct: r.pct, ...moveParts(r) })) }));
}
/** The site a source is on, for a short link label: "reuters.com". */
export const siteOf = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number): string => String(n).padStart(2, "0");
/** A date of the data as the page writes it (the designer's §3.2): "2026-11-05" -> "5 Nov 2026"; "–" for none. */
export const fmtDay = (ymd: string | null | undefined): string => { const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) : null; return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : "–"; };
const dayMon = (ymd: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}` : ymd; };
/** A time as the NEWS rows write it, in Singapore time (the panel's head says so): "19 Nov 23:22"; "–" for none. */
export function fmtDayTime(t: string | null | undefined): string {
  const d = t ? new Date(t) : null;
  if (!d || Number.isNaN(d.getTime())) return "–";
  const p = partsIn(SGT, d);
  return `${p.d} ${MON[p.mo - 1]} ${p2(p.h)}:${p2(p.m)}`;
}

/** A big move in three parts, read from its fields (the designer's D-27 and the PMs' answer to Q3, 20 Nov 2026):
 *  the turn as a word (none for a day's move), the figure, and the rest of the sentence. On the page the figure
 *  takes the colour of its sign, as every figure on the Monitor does, and the turn's colour stays on the circle
 *  and the dot: a green "−24.1%" read as a rise. The server's own sentence (`text`) is the same words in one. */
export function moveParts(m: Pick<MoveRow, "kind" | "pct" | "from" | "to">): { word: string | null; fig: string; rest: string } {
  const fig = `${m.pct > 0 ? "+" : "\u2212"}${Math.abs(m.pct).toFixed(1)}%`;
  switch (m.kind) {
    case "d1": return { word: null, fig, rest: "on the day" };
    case "pk": return { word: "New high", fig, rest: `from the low of ${dayMon(m.from)}` };
    case "bt": return { word: "Bottom", fig, rest: `from the high of ${dayMon(m.from)}` };
    case "p2": return { word: "Smaller peak", fig, rest: `from the low of ${dayMon(m.from)}` };
    case "b2": return { word: "Smaller bottom", fig, rest: `from the high of ${dayMon(m.from)}` };
    case "w1": return { word: null, fig, rest: `in five sessions (from ${dayMon(m.from)})` };
    default: return { word: null, fig, rest: m.pct < 0 ? `from the high of ${dayMon(m.from)} to the low of ${dayMon(m.to)}` : `from the low of ${dayMon(m.from)} to the high of ${dayMon(m.to)}` };
  }
}

/** What a statements column says when it opens no document (the designer's I-3 note). */
export const NO_DOC = "no document address from the source";
/** The document a statements column opens (A-01 with A's rules of 19 Nov 2026), or null. Only the address the source
 *  gave for that column, and only one a browser can open (http or https): never a made-up address, never a search
 *  page in the document's place. A year from the 有価証券報告書 opens that filing, its document ID in the tip (so it
 *  can be found on EDINET whatever the page behind the address shows); the guidance column, a quarter and a year
 *  known only from its 決算短信 open that 決算短信 PDF. */
export function periodDoc(p: Pick<FinPeriod, "kind" | "label" | "doc" | "url" | "filed">): { href: string; tip: string } | null {
  const href = typeof p.url === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(p.url.trim()) ? p.url.trim() : null;
  if (!href) return null;
  const host = (() => { try { return new URL(href).hostname.toLowerCase(); } catch { return ""; } })();
  if (p.kind === "FY" && p.doc) return { href, tip: `Open the 有価証券報告書 for ${p.label} ${/(^|\.)edinet-fsa\.go\.jp$/.test(host) ? "on EDINET" : `on ${host}`} (document ${p.doc}${p.filed ? `, filed ${fmtDay(p.filed)}` : ""}) \u2197` };
  const when = p.filed ? `, disclosed ${fmtDay(p.filed)}` : "";
  return { href, tip: p.kind === "FC" ? `Open the 決算短信 PDF${when} \u2197` : `Open the 決算短信 PDF for ${p.label}${when} \u2197` };
}

/** The NEWS panel of a stock's page (I-3, 20 Nov 2026): the Monitor's own headlines that name the stock and its own
 *  alerts on it, over the last `days` days (supabase/functions/_shared/stock.ts, feedFor). A server from before
 *  sends no `feed`, and then the page shows no NEWS panel. `error` says which table could not be read. */
export interface StockFeed {
  days: number;
  news: Array<{ id: number; publishedAt: string; source: string; title: string; url: string; category: string | null }>;
  alerts: Array<{ id: number; at: string; kind: string; pct: number | null; market: string; msg: string; url: string | null }>;
  error?: string;
}
export type FeedFilter = "all" | "headlines" | "alerts";
/** One row of the panel: line 1 the time, the kind and where it came from; line 2 the headline or the alert. */
export interface FeedRow { key: string; at: string; kind: "headline" | "alert"; source: string; title: string; url: string | null }
const ALERT_KIND: Record<string, string> = { stock: "move", index: "index move", buyback: "buyback", revision: "guidance", mna: "M&A" };
/** The panel's rows for a filter, newest first: a headline with its publisher, an alert with what it is and where it
 *  was read (the exchange for a move, the publisher for a headline's alert). */
export function feedRows(feed: StockFeed | null | undefined, filter: FeedFilter = "all"): FeedRow[] {
  if (!feed) return [];
  const news: FeedRow[] = filter === "alerts" ? [] : (feed.news ?? []).map((n) => ({ key: `h${n.id}`, at: n.publishedAt, kind: "headline", source: n.source, title: n.title, url: n.url || null }));
  const alerts: FeedRow[] = filter === "headlines" ? [] : (feed.alerts ?? []).map((a) => ({ key: `a${a.id}`, at: a.at, kind: "alert", source: [ALERT_KIND[a.kind] ?? a.kind, a.market].filter(Boolean).join(", "), title: a.msg, url: a.url || null }));
  const t = (s: string): number => { const v = Date.parse(s); return Number.isFinite(v) ? v : -Infinity; };
  return [...news, ...alerts].sort((x, y) => t(y.at) - t(x.at) || x.key.localeCompare(y.key));
}
/** How many rows a list shows at first and adds with each "SHOW n MORE" (the designer's I-3 note and D-48). */
export const FEED_STEP = 15;

export interface StockPage {
  symbol: string; name: string; exchange: string | null; currency: string | null; quoteType: string | null;
  sector: string | null; industry: string | null; indices: string[];
  price: number | null; prevClose: number | null; pct: number | null; asOf: string | null;
  open: number | null; high: number | null; low: number | null; volume: number | null; mcap: number | null;
  benchmarks: Benchmark[];   // what the stock is set against, in order; `perf[].bench`, `perf[].rel` and `beta` follow this order
  perf: PerfRow[];
  range: { hi: number | null; hiDate: string | null; lo: number | null; loDate: string | null; fromHi: number | null; fromLo: number | null; pos: number | null };
  vol: { m1: number | null; m3: number | null; m12: number | null };
  beta: Array<{ beta: number | null; corr: number | null; days: number }>;
  drawdown: { pct: number | null; from: string | null; to: string | null };
  turnover: { d20: { shares: number | null; value: number | null }; d60: { shares: number | null; value: number | null } };
  shares: { outstanding: number | null; diluted: number | null; dilutedNote: string | null; treasury: number | null; float: number | null; asOf: string | null; source: string | null };
  short: ShortData | null;
  moves: { eligible: boolean; rule?: MoveRule; sizes?: MoveSizes; rows: MoveRow[] };   // eligible: 1tn yen / 10bn US dollars and above
  earningsAt: string | null; earningsEst: boolean | null;
  val: { pe: number | null; peGuide: number | null; pb: number | null; yield: number | null; yieldGuide: number | null; basis: string | null };
  fin: Fin | null; finNote: string | null;
  feed?: StockFeed;   // since 20 Nov 2026
}

const MINUS = "−";
const neg = (s: string): string => s.replace(/^-/, MINUS);
/** A statement figure in the company's unit: 45,095.3 (bn), 3,210 (m). Null is a dash, never a zero. */
export const fmtUnit = (v: number | null | undefined, u: FinUnit): string => (v == null || !Number.isFinite(v) ? "–" : neg(fmtNum(v / u.div, u.dp)));
/** A per-share figure: two decimals below 1,000, one above. */
export const fmtPs = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? "–" : neg(fmtNum(v, Math.abs(v) >= 1000 ? 1 : 2)));
/** A ratio in per cent with one decimal; `sign` puts a plus on a rise. */
export const fmtPc = (v: number | null | undefined, sign = false, dp = 1): string => (v == null || !Number.isFinite(v) ? "–" : `${sign && v > 0 ? "+" : ""}${neg(v.toFixed(dp))}%`);
/** A ratio as a bare number for a table whose header already says per cent: 27.9, +7.9, −0.2. */
export const fmtRatio = (v: number | null | undefined, sign = false): string => (v == null || !Number.isFinite(v) ? "–" : `${sign && v > 0 ? "+" : ""}${neg(v.toFixed(1))}`);
/** A multiple: 15.2x. */
export const fmtX = (v: number | null | undefined, dp = 1): string => (v == null || !Number.isFinite(v) ? "–" : `${v.toFixed(dp)}x`);
/** A count of shares: 1.23bn, 456.7m, 89.1k. */
export const fmtCount = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}bn` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : fmtNum(v, 0));

export interface FinRow { id: string; label: string; values: Array<number | null>; fmt: "money" | "ps" | "pct" | "growth"; strong?: boolean; title?: string }
export interface FinSection { id: string; title: string; rows: FinRow[] }
const LABEL: Record<string, string> = {
  revenue: "Revenue", cogs: "Cost of sales", gross: "Gross profit", sga: "SG&A", op: "Operating profit", nonOpInc: "Non-operating income", nonOpExp: "Non-operating expenses",
  ordinary: "Ordinary profit", extraInc: "Extraordinary income", extraLoss: "Extraordinary losses", pretax: "Profit before tax", ni: "Net income", eps: "EPS", dps: "DPS",
  cash: "Cash and deposits", stDebt: "Short-term debt", ltDebt: "Long-term debt", netCash: "Net cash", assets: "Total assets", liabilities: "Total liabilities", equity: "Equity",
  ocf: "Operating cash flow", icf: "Investing cash flow", fincf: "Financing cash flow", capex: "Capex", fcf: "Free cash flow",
  rd: "R&D", interestNet: "Net interest income (expense)", otherNonOp: "Other income (expense)", tax: "Income tax", unusual: "Unusual items (memo)",
  cashSti: "Cash and short-term investments", buyback: "Share buybacks", divPaid: "Dividends paid", sbc: "Stock-based compensation",
  salesYoy: "Sales growth, y/y", gpm: "Gross margin", opm: "Operating margin", npm: "Net margin", payout: "Payout ratio", roe: "ROE", equityRatio: "Equity ratio",
};
const TITLE: Record<string, string> = {
  stDebt: "Borrowings and bonds due within a year; lease obligations are not included",
  ltDebt: "Borrowings and bonds due after a year; lease obligations are not included",
  netCash: "Cash and deposits less short-term and long-term debt (worked out on this page); negative = net debt",
  capex: "Cash paid for property, plant and equipment and intangible assets",
  fcf: "Operating cash flow less capex (worked out on this page)",
  salesYoy: "Revenue against the period that ended twelve months earlier", payout: "Dividend per share over earnings per share", roe: "Net income over equity at the year's end",
  ni: "Attributable to owners of the parent", equity: "Net assets (JP GAAP) or total equity",
  rd: "Research and development expense",
  interestNet: "Interest income less interest expense outside operations; negative = net expense",
  otherNonOp: "Other non-operating income less expenses, including gains and losses on investments and disposals",
  tax: "Income tax expense for the period",
  unusual: "What the data provider classes as unusual (restructuring, impairments, gains and losses on disposals), before tax. Already inside the lines above; shown for reference",
  cashSti: "Cash, cash equivalents and short-term investments",
  buyback: "Cash paid to buy back the company's own shares", divPaid: "Cash dividends paid",
  sbc: "Stock-based compensation expense: a cost paid in shares, not cash, and added back in operating cash flow",
};
const STRONG = new Set(["revenue", "gross", "op", "ordinary", "ni", "assets", "equity", "ocf"]);
/** The rows of a Japanese company's table (the same list as LAYOUT_JP on the server), used when the statements
 *  carry no layout of their own. */
const LAYOUT_JP: FinLayout = {
  is: ["revenue", "cogs", "gross", "sga", "op", "nonOpInc", "nonOpExp", "ordinary", "extraInc", "extraLoss", "pretax", "ni", "eps", "dps"],
  bs: ["cash", "stDebt", "ltDebt", "netCash", "assets", "liabilities", "equity"], cf: ["ocf", "icf", "fincf", "capex", "fcf"],
  optional: ["nonOpInc", "nonOpExp", "ordinary", "extraInc", "extraLoss", "pretax"],
};

/** The tables of the FINANCIALS panel for one view, section by section, each row a list of values column for
 *  column. Which rows there are is the statements' own layout. Two rows are sums made here from reported lines,
 *  and are empty wherever a part is missing:
 *    net cash = cash (with short-term investments where the company reports that total) - short-term debt - long-term debt
 *    free cash flow = operating cash flow - capex */
export function finSections(f: Fin, view: "annual" | "quarterly"): { periods: FinPeriod[]; sections: FinSection[] } {
  const set = f[view], n = set.periods.length, rat = f.ratios[view], lay = f.layout ?? LAYOUT_JP;
  const optional = new Set<string>(lay.optional);
  const L = (id: FinLine): Array<number | null> => set.lines[id] ?? Array.from({ length: n }, () => null);
  const row = (id: FinRowId | RatioId, values: Array<number | null>, fmt: FinRow["fmt"] = "money"): FinRow => ({ id, label: (lay.labels as Record<string, string> | undefined)?.[id] ?? LABEL[id] ?? id, values, fmt, strong: STRONG.has(id) || (id === "pretax" && !lay.is.includes("ordinary")), title: lay.titles?.[id] ?? TITLE[id] });
  const all = (...xs: Array<number | null>): boolean => xs.every((x) => x != null);
  const cash = L("cash"), sti = L("cashSti"), st = L("stDebt"), lt = L("ltDebt"), ocf = L("ocf"), capex = L("capex");
  const netCash = cash.map((c, i) => { const liquid = sti[i] ?? c; return all(liquid, st[i], lt[i]) ? (liquid as number) - (st[i] as number) - (lt[i] as number) : null; });
  const fcf = ocf.map((o, i) => (all(o, capex[i]) ? (o as number) - (capex[i] as number) : null));
  const shown = (r: FinRow): boolean => !optional.has(r.id) || r.values.some((v) => v != null);
  const rows = (ids: FinRowId[]): FinRow[] => ids.map((id) => row(id, id === "netCash" ? netCash : id === "fcf" ? fcf : L(id), id === "eps" || id === "dps" ? "ps" : "money")).filter(shown);
  const R = (id: RatioId): Array<number | null> => rat[id] ?? Array.from({ length: n }, () => null);
  const ratios = [row("salesYoy", R("salesYoy"), "growth"), row("gpm", R("gpm"), "pct"), row("opm", R("opm"), "pct"), row("npm", R("npm"), "pct"), row("payout", R("payout"), "pct"), ...(view === "annual" ? [row("roe", R("roe"), "pct")] : []), row("equityRatio", R("equityRatio"), "pct")].filter(shown);
  return { periods: set.periods, sections: [
    { id: "is", title: "Income statement", rows: rows(lay.is) },
    { id: "ratios", title: "Ratios, %", rows: ratios },
    { id: "bs", title: "Balance sheet", rows: rows(lay.bs) },
    { id: "cf", title: "Cash flow", rows: rows(lay.cf) },
  ].filter((sec) => sec.rows.length > 0) };
}
