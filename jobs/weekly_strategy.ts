// Weekly Strategy — Emma's Friday report, due on the RESEARCH tab at 15:00 SGT (.github/workflows/weekly-strategy.yml).
//   1. buildWeeklyPack(): the week's figures from the Monitor's own data (table with 1W changes and technical
//      readings, sector and single-stock moves, calendar actuals, the week ahead, headlines).
//   2. Claude (web search) writes the report in markdown from the pack and the pages it fetches.
//   3. The draft is split by code into title, standfirst, body and sources; name tags are checked against the
//      Monitor's symbols; the report is stored in `reports` (kind "Weekly").
// Shota's brief (15 Nov 2026) is in STRATEGY_RULES: the review is short, the weight is on next week's strategy,
// and the brief's questions are underlying questions for a continuous argument, never headings.
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Flags: --dry (print, don't store), --if-missing (skip when this week's report is already stored).
import Anthropic from "@anthropic-ai/sdk";
import { db, selectAll, SGT, ymdIn } from "./lib/db.js";
import { buildWeeklyPack, type WeeklyPack } from "./lib/pack.js";

const MODEL = "claude-opus-5-5";
const DRY = process.argv.includes("--dry"), IF_MISSING = process.argv.includes("--if-missing");

const STRATEGY_RULES = `You are Emma, a professional financial researcher at Orrery Research. Every Friday afternoon (Singapore time) you write the Weekly Strategy for portfolio managers in Singapore and Tokyo. You write in the first person: "I" for your own views. British English. The tone is a good sell-side strategist's weekly: confident, plain, argued, never a list of data.

What the reader wants: help thinking about next week. The tables on the Monitor already show every level and change, so the review of the week is brief and causal, and most of the length goes to what to do next. The report must read as one continuous argument with a natural flow. The questions below are the thinking behind the report. Never turn them into headings and never answer them one by one.

Underlying questions for the review:
- Macro: which headlines moved markets this week, how markets actually reacted (rotation across assets, rotation across sectors, or everything sold together), and why. Is each one structural, a one-off, short-lived, a change of regime, or a possible crash trigger? Did a well-known investor say something that mattered, and what do you make of it?
- Equities: the US and Japan, at index and at sector level. Which headlines, earnings and large moves mattered, which names moved most and why, and whether that affects other names. How the VIX moved and why.
- Rates: developed and emerging markets separately. How the news changed rates, how good or bad that is, and whether it eases or worsens the outlook for equities.

Underlying questions for next week's strategy (the main part):
- Are this week's headlines fundamentally positive or negative, or did prices overshoot in either direction?
- Is a change of regime possible?
- Has something similar happened before, and how did it play out?
- How will markets open on Monday, up or down, and will the week be volatile or calm?
- On fundamental and technical grounds (the pack carries the 1-month sigma position, the 52-week position and the distance to the 200-day average), which asset classes, sectors and names would you add or trim, and why?
- Which hedges would you recommend?

Method: go deep before you write (Shota, 15 Nov 2026: "ask why to the conclusion you got, at least five times").
The value of this report is the depth of its reasoning, not its coverage. A first conclusion is where the work starts. Before writing, take each of the two or three conclusions the report will rest on and question it at least five times, searching as you go:
- Why is that so? And why is that? Keep going until you reach the mechanism: who is paying, who is lending, who decides, what has to stay true.
- What does the conclusion assume, and is the assumption sound? Example of the standard expected: "Nvidia's chief executive resigning is a one-off" is a first answer. Is it? If a known worry in the industry is circular financing (the supplier funding its own customers), how much of that ran on this one person's judgement? Is there a succession plan and a bench that can carry it, or was the company dependent on him? If the support weakens, who is hit first, and does the supposed beneficiary sell to the same customers? Follow it until the answer changes what you would own.
- Do the week's separate stories connect? Look for the common cause behind two headlines (for example a financing story and a rates story that are both about the cost of the same investment boom).
- What is the strongest argument against your view? State it fairly and say why you still hold your view, or change it.
- What observable event next week would confirm or refute it? Name it, and say what you would do in each case.
Then write the result as an argument, not as questions and answers. If the digging changed your first view, say so in the report: the reader should see where the obvious reading is wrong. Give the depth to the few things that matter and a sentence to the rest. End the strategy section with a short paragraph beginning **What would change my mind**.

Hard rules:
1. Every figure must come from the NUMBERS PACK or from a page you fetched with web_search in this conversation. Never compute, estimate or recall figures. Use figures sparingly: the ones that carry the argument.
2. Cite every externally sourced fact inline as [n]. Pack figures need no citation.
3. Your judgements are written in the first person, so the reader can tell view from fact. Do not state a view as a fact.
4. Historical comparisons: give figures only if you fetched them. Otherwise describe the episode in words and say it is from memory.
5. If you could not find something (for example a quote from a well-known investor, or a confirmed date), say so in a clause. Do not invent it.
6. Name tags: the first time a section mentions an index, a stock, a currency pair, a yield or a commodity that has a symbol, write it as [[SYMBOL|name as it reads in the sentence]], for example [[AMD|AMD]], [[^SOX|the SOX]], [[8035.T|Tokyo Electron]], [[USDJPY=X|USD/JPY]]. Use the symbol exactly as in the pack; for a company not in the pack use its exchange ticker (US ticker, or the Tokyo code followed by .T) only when you are certain of it, otherwise no tag.
7. The week reviewed runs from weekStart (Monday) to today, dateSgt. The US figures run to Thursday's close, Asia's to today's close or latest print.
8. Search for the reason behind every large single-stock move you mention.

Length: 1,600 to 2,200 words (five to ten minutes of reading).

Output format, exactly:
TITLE: <a punchy headline: one sentence of 10 to 15 words that states your stance. No "Weekly Strategy" prefix, no colon or semicolon, no figures. Example: "The AI trade lost its banker in the same week its funding got more expensive">
SUMMARY: <two or three sentences: the week and your stance>

<the report in markdown>

## Sources
[1] title - URL
[2] title - URL

Shape of the report (headings in your own words, about this week; these are the only H2 headings besides Sources):
- First line: **Emma · Orrery Research · Weekly Strategy · week of <dates>**
- Two opening paragraphs without a heading: what happened in one breath, then your stance for next week.
- ---
- ## <the week's macro story in a phrase>: flowing paragraphs.
- ## Equities: <the point in a phrase>
- ## Rates: <the point in a phrase>
- ---
- ## Next week: how I would position. Prose that moves from the central question, through precedent and how you expect the week to trade, to the positions. Close it with four short paragraphs that begin **I would add**, **I would trim**, **I would leave alone** and **For hedges**.
- ## The calendar, briefly: one bullet per day, only the events that matter.
- A last line in italics: figures are from the Orrery Monitor's data as of the pack's timestamp; first-person views are your judgement; research commentary for professional readers, not investment advice.`;

interface Source { n: number; title: string; url: string }

/** Splits the draft into its parts. Tolerant: a missing SUMMARY or Sources section does not stop the report. */
function parseDraft(draft: string): { title: string; summary: string; md: string; sources: Source[] } {
  let text = draft.replace(/\r/g, "").trim();
  const t = text.match(/^\s*TITLE:\s*(.+)$/m), s = text.match(/^\s*SUMMARY:\s*([\s\S]*?)(?=\n\s*\n)/m);
  const title = (t?.[1] ?? "Weekly Strategy").trim().replace(/^\*+|\*+$/g, "");
  const summary = (s?.[1] ?? "").replace(/\s+/g, " ").trim();
  if (t) text = text.replace(t[0], "");
  if (s) text = text.replace(s[0], "");
  const cutAt = text.search(/^#{1,3}\s*Sources\s*$/im);
  const body = (cutAt >= 0 ? text.slice(0, cutAt) : text).trim();
  const sources: Source[] = [];
  if (cutAt >= 0) for (const line of text.slice(cutAt).split("\n")) {
    const m = line.match(/^\s*\[(\d{1,3})\]\s*(.*?)\s*[-–—]?\s*(https?:\/\/\S+)\s*$/);
    if (m) sources.push({ n: Number(m[1]), title: m[2].replace(/[-–—:\s]+$/, "").trim() || m[3], url: m[3] });
  }
  return { title, summary, md: body, sources };
}

async function knownSymbols(sb: ReturnType<typeof db>, pack: WeeklyPack): Promise<Set<string>> {
  const out = new Set<string>(pack.table.map((r) => r.symbol));
  for (const side of [pack.us, pack.jp]) for (const list of [side.top, side.bottom, side.big]) for (const m of list) out.add(m.symbol);
  const { data: inst } = await sb.from("instruments").select("symbol");
  for (const r of inst ?? []) out.add(r.symbol as string);
  for (const r of await selectAll<{ symbol: string }>(() => sb.from("constituents").select("symbol").order("symbol"))) out.add(r.symbol);
  return out;
}

async function main() {
  const sb = db();
  const date = ymdIn(SGT);
  const pack = await buildWeeklyPack(sb);
  console.log(`Weekly Strategy for the week of ${pack.weekStart} (written ${date} SGT): ${pack.table.length} table rows, US ${pack.us.breadth?.n ?? 0} names, JP ${pack.jp.breadth?.n ?? 0} names, ${pack.actuals.length} actuals, ${pack.weekAhead.length} ahead, ${pack.headlines.length} headlines`);

  if (IF_MISSING && !DRY) {
    const { data: have } = await sb.from("reports").select("id,title").eq("kind", "Weekly").eq("meta->>week", pack.weekStart).limit(1);
    if (have?.length) { console.log(`already stored for this week (report ${have[0].id}): nothing to do.`); return; }
  }

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 24000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high" },
    system: [{ type: "text", text: STRATEGY_RULES, cache_control: { type: "ephemeral" } }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 45 }],   // the method asks for several rounds of "why" per conclusion, each needing its own searches
    messages: [{ role: "user", content: `NUMBERS PACK (JSON):\n${JSON.stringify({ ...pack, headlines: pack.headlines.slice(0, 80) })}\n\nWrite this week's Weekly Strategy.` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`draft refused: ${JSON.stringify(msg.stop_details)}`);
  let draft = "";
  for (const b of msg.content) if (b.type === "text") draft += b.text;
  // the model may think aloud before the report: the report starts at its TITLE line
  const start = draft.search(/^\s*TITLE:/m);
  if (start > 0) draft = draft.slice(start);
  if (draft.trim().length < 3000) throw new Error(`draft too short (${draft.trim().length} characters)`);

  const rep = parseDraft(draft);
  const known = await knownSymbols(sb, pack);
  let kept = 0, dropped = 0;
  rep.md = rep.md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, sym: string, text: string) => { if (known.has(sym.trim())) { kept++; return `[[${sym.trim()}|${text}]]`; } dropped++; return text; });
  // a citation whose source did not make it into the list is removed, so no marker points at nothing
  const have = new Set(rep.sources.map((x) => x.n));
  let orphan = 0;
  rep.md = rep.md.replace(/\[(\d{1,3})\]/g, (m0, n: string) => (have.has(Number(n)) ? m0 : (orphan++, "")));
  const cited = new Set([...rep.md.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])));
  const sources = rep.sources.filter((x) => cited.has(x.n));
  const words = rep.md.split(/\s+/).length;
  const u = msg.usage;
  const cost = (u.input_tokens * 4 + u.output_tokens * 20) / 1e6 + (u.server_tool_use?.web_search_requests ?? 0) * 0.01;
  console.log(`title: ${rep.title}\nwords ${words}, sources ${sources.length}, name tags ${kept} kept / ${dropped} dropped, ${orphan} citations without a source removed, cost ≈ $${cost.toFixed(2)} (served by ${msg.model})`);
  if (words < 900) throw new Error(`report too short (${words} words)`);
  if (DRY) { console.log(`\nSUMMARY: ${rep.summary}\n\n${rep.md}\n\n${sources.map((x) => `[${x.n}] ${x.title} - ${x.url}`).join("\n")}`); return; }

  const { data, error } = await sb.from("reports").insert({ kind: "Weekly", title: rep.title, summary: rep.summary || null, md: rep.md, meta: { author: "Emma", week: pack.weekStart, written: date, sources, model: msg.model, cost_usd: cost } }).select("id").single();
  if (error) throw new Error(error.message);
  console.log(`stored as report ${data.id}.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exit(1); });
