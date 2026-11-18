// The model calls shared by the Morning Notes and the Weekly Strategy.
//   write():  one long turn with web search (the model reasons, searches and writes).
//   review(): a second turn in which the same model reads the draft as the demanding reader and returns the
//             complete revised piece (Shota, 15 Nov 2026: "review pass", the role he played by hand on the trial).
// Model: Claude Fable 5.2 at effort xhigh (Shota's choice). Thinking is always on for this model, so no thinking
// parameter is sent. A long search turn can come back with stop_reason "pause_turn"; it is resumed by sending the
// assistant content back. If the account cannot use the model (for example a retention setting it requires),
// the call is repeated once on Claude Opus 5.5 so the piece still arrives, and the log says so.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-fable-5-2";
export const EFFORT = "xhigh" as const;
const FALLBACK_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 64000;          // room to think and act across many searches at xhigh
const MAX_RESUMES = 6;
// USD per million tokens (input, output), for the cost line in the log
const PRICE: Record<string, [number, number]> = { "claude-fable-5-2": [8, 40], "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };
// What a token read from the prompt cache costs, as a fraction of the input price (0.1 where not listed). A token
// written to the cache costs 1.25 times the input price (five-minute cache). Neither is part of usage.input_tokens.
const CACHE_READ: Record<string, number> = { "claude-fable-5-2": 0.025, "claude-opus-5-5": 0.05, "claude-sonnet-5-5": 0.05 };

export const newClient = (): Anthropic => new Anthropic({ timeout: 50 * 60 * 1000, maxRetries: 2 });   // a turn at xhigh can run for many minutes

export interface Turn { text: string; model: string; inputTokens: number; outputTokens: number; searches: number; costUsd: number; pages: Array<{ title: string; url: string }>;
  /** One entry per search that came back as an error instead of results: the error's code (too_many_requests,
   *  unavailable, max_uses_exceeded, ...). */
  searchErrors: string[];
  /** What the turn did, one short line per step (each search asked, each set of results, each piece of text and
   *  of code), for a log that has to explain an answer. */
  trace: string[] }

type Msg = { role: "user" | "assistant"; content: unknown };

/** `direct`: the model asks each search itself and reads the results as they come (the basic search tool).
 *  Without it the newer tool is used, with which the model may write a small program that runs the searches and
 *  prints what it wants to keep; a program that fails after its searches ran has used them up and shown the
 *  model nothing (see `ask`). */
async function runOnce(client: Anthropic, model: string, effort: string, system: string, user: string, maxSearches: number, direct = false): Promise<Turn> {
  const messages: Msg[] = [{ role: "user", content: user }];
  const out: Turn = { text: "", model, inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0, pages: [], searchErrors: [], trace: [] };
  let cacheWrite = 0, cacheRead = 0;
  for (let i = 0; i <= MAX_RESUMES; i++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      // the Morning Note's long instructions are cached (its review turn reads them again); a look-up asks once
      system: [direct ? { type: "text", text: system } : { type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: maxSearches > 0 ? [{ type: direct ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: maxSearches }] : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error(`refused: ${JSON.stringify((msg as { stop_details?: unknown }).stop_details ?? null)}`);
    out.model = msg.model;
    out.inputTokens += msg.usage.input_tokens;
    out.outputTokens += msg.usage.output_tokens;
    cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
    cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    out.searches += (msg.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
    for (const b of msg.content as Array<{ type: string; text?: string; content?: unknown; name?: string; input?: unknown }>) {
      const clip = (v: unknown, n: number): string => { const t = (typeof v === "string" ? v : JSON.stringify(v ?? null)).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
      if (b.type === "text" && b.text) out.trace.push(`text: ${clip(b.text, 700)}`);
      else if (b.type === "server_tool_use") out.trace.push(`${b.name ?? "tool"}: ${clip(b.input, 500)}`);
      else if (b.type === "web_search_tool_result") out.trace.push(Array.isArray(b.content) ? `results: ${(b.content as Array<{ title?: string; url?: string; page_age?: string | null }>).map((r) => `${clip(r.title ?? "", 70)} <${r.url ?? ""}>${r.page_age ? ` (${r.page_age})` : ""}`).join(" | ")}` : `results: error ${clip(b.content, 120)}`);
      else if (b.type !== "thinking" && b.type !== "redacted_thinking") out.trace.push(`${b.type}: ${clip(b.content ?? b.input ?? "", 300)}`);
      if (b.type === "text" && b.text) out.text += b.text;
      else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) { for (const r of b.content as Array<{ type: string; title?: string; url?: string }>) if (r.type === "web_search_result" && r.url) out.pages.push({ title: r.title ?? r.url, url: r.url }); }
      // a search that failed carries an error object where its results would be (the SDK's BetaWebSearchToolResultError)
      else if (b.type === "web_search_tool_result") out.searchErrors.push(String((b.content as { error_code?: unknown } | null)?.error_code ?? "unknown"));
    }
    if (msg.stop_reason !== "pause_turn") {
      if (msg.stop_reason === "max_tokens") console.warn("the turn stopped at max_tokens: the text may be cut short");
      break;
    }
    messages.push({ role: "assistant", content: msg.content });   // the server resumes the paused turn from here
  }
  const [pi, po] = PRICE[model] ?? PRICE[MODEL];
  out.costUsd = (out.inputTokens * pi + cacheWrite * pi * 1.25 + cacheRead * pi * (CACHE_READ[model] ?? 0.1) + out.outputTokens * po) / 1e6 + out.searches * 0.01;
  if (cacheWrite || cacheRead) out.trace.push(`cache: ${cacheWrite} tokens written, ${cacheRead} read`);
  return out;
}

/** One turn on the chosen model; once more on the fallback model if the account cannot use the first. */
async function run(client: Anthropic, system: string, user: string, maxSearches: number): Promise<Turn> {
  try {
    return await runOnce(client, MODEL, EFFORT, system, user, maxSearches);
  } catch (e) {
    const status = (e as { status?: number }).status;
    const text = e instanceof Error ? e.message : String(e);
    if (status === 400 || status === 403 || status === 404) {
      console.warn(`${MODEL} was not accepted (${status}: ${text.slice(0, 200)}); writing with ${FALLBACK_MODEL} instead`);
      return runOnce(client, FALLBACK_MODEL, "high", system, user, maxSearches);
    }
    throw e;
  }
}

export const write = (client: Anthropic, system: string, user: string, maxSearches: number): Promise<Turn> => run(client, system, user, maxSearches);

/** One short look-up on a named model at a named effort, with web search (the reasons for big moves,
 *  jobs/move_causes.ts). No second model is tried: a look-up that fails is simply tried again later.
 *
 *  The searches are direct. With the newer search tool the first real run (18 Nov 2026) stored twelve of fifteen
 *  moves as "no report found", two of them moves a dry run had just found dated reports for. The trace of a later
 *  run showed why: the model wrote a program that ran three of its four searches and then failed before printing
 *  any result; its corrected program met "Server tool use limit exceeded". The searches had returned 36 pages,
 *  the reports among them, and the model had read none of them. */
export const ask = (client: Anthropic, o: { model: string; effort: string; system: string; user: string; maxSearches: number }): Promise<Turn> => runOnce(client, o.model, o.effort, o.system, o.user, o.maxSearches, true);

const REVIEW = `You are now the reader this piece is written for: a portfolio manager who has asked for depth and will not accept a first answer. Read the DRAFT below against the instructions you were given and against the NUMBERS PACK, then return the finished piece.

Go through it as that reader would:
1. Depth. For each conclusion the piece rests on, ask why, and why again, at least five times. Where the draft stops at the obvious reading (a one-off, a rotation, "priced in", "risk-off"), keep going until you reach the mechanism: who pays, who lends, who decides, what has to stay true. Search for what you need. If the digging changes the conclusion, change the piece and say what the obvious reading gets wrong.
2. Connections. Do two of the stories share a cause? If so the piece should say it once, clearly.
3. The other side. Is the strongest argument against the view stated fairly? Does the piece say what would change it and what to watch?
4. Figures and sources. Every figure must be in the pack or on a page fetched in this conversation; every external fact needs its [n] and a matching line under Sources. Remove or correct anything that does not meet that. Keep the source numbers consistent after your changes.
5. The brief. Check the length, the title rule, the tags, the structure and the plain, argued style. No questions-and-answers layout. No sentence that only restates a move the tables already show.
6. Usefulness. Would this reader act differently after reading it? Cut what does not help them; expand the part that does.

Return only the complete final piece in exactly the required output format, from its first line to the last source. No commentary before or after, no list of changes. If the draft already meets the standard on a point, leave that part as it is.`;

/** The review pass. Returns the revised piece, or null when the review did not produce a usable one (the caller
 *  then keeps the draft: a late or failed review must never cost the reader the piece). */
export async function review(client: Anthropic, system: string, packUser: string, draft: string, maxSearches: number, minChars: number): Promise<Turn | null> {
  try {
    const t = await run(client, system, `${packUser}\n\n---\n${REVIEW}\n\nDRAFT:\n${draft}`, maxSearches);
    if (t.text.trim().length < minChars) { console.warn(`review returned ${t.text.trim().length} characters (under ${minChars}): keeping the draft`); return null; }
    return t;
  } catch (e) {
    console.warn(`review failed (${e instanceof Error ? e.message.slice(0, 200) : e}): keeping the draft`);
    return null;
  }
}
