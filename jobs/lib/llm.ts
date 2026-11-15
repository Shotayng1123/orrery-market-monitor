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
const PRICE: Record<string, [number, number]> = { "claude-fable-5-2": [8, 40], "claude-opus-5-5": [4, 20] };

export const newClient = (): Anthropic => new Anthropic({ timeout: 50 * 60 * 1000, maxRetries: 2 });   // a turn at xhigh can run for many minutes

export interface Turn { text: string; model: string; inputTokens: number; outputTokens: number; searches: number; costUsd: number; pages: Array<{ title: string; url: string }> }

type Msg = { role: "user" | "assistant"; content: unknown };

async function runOnce(client: Anthropic, model: string, effort: string, system: string, user: string, maxSearches: number): Promise<Turn> {
  const messages: Msg[] = [{ role: "user", content: user }];
  const out: Turn = { text: "", model, inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0, pages: [] };
  for (let i = 0; i <= MAX_RESUMES; i++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: maxSearches > 0 ? [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }] : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error(`refused: ${JSON.stringify((msg as { stop_details?: unknown }).stop_details ?? null)}`);
    out.model = msg.model;
    out.inputTokens += msg.usage.input_tokens;
    out.outputTokens += msg.usage.output_tokens;
    out.searches += (msg.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
    for (const b of msg.content as Array<{ type: string; text?: string; content?: unknown }>) {
      if (b.type === "text" && b.text) out.text += b.text;
      else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content as Array<{ type: string; title?: string; url?: string }>) if (r.type === "web_search_result" && r.url) out.pages.push({ title: r.title ?? r.url, url: r.url });
    }
    if (msg.stop_reason !== "pause_turn") {
      if (msg.stop_reason === "max_tokens") console.warn("the turn stopped at max_tokens: the text may be cut short");
      break;
    }
    messages.push({ role: "assistant", content: msg.content });   // the server resumes the paused turn from here
  }
  const [pi, po] = PRICE[model] ?? PRICE[MODEL];
  out.costUsd = (out.inputTokens * pi + out.outputTokens * po) / 1e6 + out.searches * 0.01;
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
