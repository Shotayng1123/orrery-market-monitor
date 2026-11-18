// Why a stock made a big move (Shota, 18 Nov 2026): the question put to the model and the reading of its answer.
// No network and no database here; the job that asks is jobs/move_causes.ts. Checked in sim/logic.test.ts.
//
// The rule the page depends on: a reason is shown only when a report the search actually returned supports it.
// So the model must name the pages it relied on, and a page it names that the search did not return is thrown
// away; an answer left with no page is "not found", whatever it says.
export interface MoveCtx { symbol: string; name: string; exchange: string | null; sector: string | null; currency: string | null; kind: "d1" | "w1" | "m1"; from: string; to: string; pct: number; fromPx: number; toPx: number; text: string; bench: string | null; benchPct: number | null }
/** `why` is set on an answer that is not found: which of the three ways it came to that (for the job's log). */
export interface CauseAnswer { found: boolean; cause: string | null; sources: Array<{ title: string; url: string }>; why?: "none reported" | "no sentence" | "no returned page cited" }

export const CAUSE_SYSTEM = `You find the reported reason for one specific move in one stock, for a portfolio manager who will act on it.

Search the web for reports dated within the move's dates or the day after, then answer.

Rules:
1. State a reason only if a dated report you found (news agency or newspaper, the company's own release, an exchange or regulatory filing, a broker action reported by the press) gives it for this stock and these dates. Typical reasons: results or guidance, a deal, a rating or target change, an index change, a regulatory or legal event, a product or safety event, a move in the whole sector or market with a named trigger.
2. If the stock only moved with its market (compare the benchmark's change given below), say so and name the market's reported trigger, if a report gives one.
3. Never infer a reason from the price alone, from what usually moves this stock, or from memory. If you find no report that explains this move, the answer is that none was found. That answer is useful; a guess is harmful.
4. Figures in the reason (earnings numbers, deal sizes) must be the ones in the report.
5. Among the reports your searches returned, rest the reason on the most authoritative and name it first: the company's own release or filing, an exchange or a regulator, a news agency, an established newspaper or broadcaster (Reuters, Bloomberg, Nikkei, the Financial Times, The Wall Street Journal, CNBC and their like). Name a site that rewrites other outlets' reports, a stock-commentary blog, a price-alert page or a crypto news site only when none of the better kind reports the same thing. Do not search again only to find a better-known outlet for a reason you have already found reported.

End your reply with one JSON object and nothing after it:
{"found": true or false, "cause": "one sentence of at most 220 characters, plain text, starting with what happened" or null, "sources": ["the URL of each report you relied on, at most 3"]}
When found is false, cause is null and sources is [].`;

const dayWords = (d: string): string => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** The question for one move. */
export function causeQuestion(c: MoveCtx): string {
  const px = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(2));
  const span = c.kind === "d1" ? `on ${dayWords(c.to)} (previous close ${dayWords(c.from)})` : `between the close of ${dayWords(c.from)} and the close of ${dayWords(c.to)}`;
  return [
    `Stock: ${c.name} (${c.symbol}${c.exchange ? `, ${c.exchange}` : ""}${c.sector ? `, ${c.sector}` : ""})`,
    `Move: ${c.text.replace("−", "-")} ${span}; close ${px(c.fromPx)} to ${px(c.toPx)}${c.currency ? ` ${c.currency}` : ""}.`,
    c.bench && c.benchPct != null ? `Over the same dates the ${c.bench} changed ${c.benchPct >= 0 ? "+" : ""}${c.benchPct.toFixed(1)}%.` : "The benchmark's change over these dates is not available.",
    "What is the reported reason for this move?",
  ].join("\n");
}

const hostKey = (u: string): string | null => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}` : null; } catch { return null; } };

/** Reads the model's reply. `pages` are the pages its searches returned (title and URL), the only ones that may
 *  be cited. Throws when the reply has no JSON object to read (the job tries that move again later). */
export function readCause(reply: string, pages: Array<{ title: string; url: string }>): CauseAnswer {
  const end = reply.lastIndexOf("}");
  let obj: Record<string, unknown> | null = null;
  // the last JSON object in the reply: walk back from the last closing brace to the opening brace that parses
  for (let start = reply.lastIndexOf("{", end); start >= 0 && end > start; start = reply.lastIndexOf("{", start - 1)) {
    try { const v = JSON.parse(reply.slice(start, end + 1)) as unknown; if (v && typeof v === "object" && !Array.isArray(v) && "found" in (v as object)) { obj = v as Record<string, unknown>; break; } } catch { /* a brace inside the text: keep walking back */ }
    if (start === 0) break;
  }
  if (!obj) throw new Error("the reply has no answer object");
  const none = (why: NonNullable<CauseAnswer["why"]>): CauseAnswer => ({ found: false, cause: null, sources: [], why });
  if (obj.found !== true) return none("none reported");
  const cause = typeof obj.cause === "string" ? obj.cause.replace(/\s+/g, " ").replace(/[*_`#]/g, "").trim() : "";
  if (cause.length < 12) return none("no sentence");
  const known = new Map<string, { title: string; url: string }>();
  for (const p of pages) { const k = hostKey(p.url); if (k && !known.has(k)) known.set(k, p); }
  const sources: CauseAnswer["sources"] = [];
  for (const u of Array.isArray(obj.sources) ? obj.sources : []) {
    const k = typeof u === "string" ? hostKey(u) : null, hit = k ? known.get(k) : undefined;
    if (hit && !sources.some((s) => s.url === hit.url)) sources.push({ title: hit.title.replace(/\s+/g, " ").trim().slice(0, 160), url: hit.url });
    if (sources.length === 3) break;
  }
  if (!sources.length) return none("no returned page cited");   // a reason with no report behind it is not shown
  return { found: true, cause: cause.length > 260 ? cause.slice(0, 257).replace(/\s+\S*$/, "") + "…" : cause, sources };
}
