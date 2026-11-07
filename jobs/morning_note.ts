// Morning Notes — written each weekday around 07:00 SGT by GitHub Actions (.github/workflows/morning-note.yml).
//   1. buildPack(): every number the note may use, from the Monitor's own data and Yahoo constituent moves.
//   2. Claude (claude-opus-5-5, web search) drafts the note in markdown, strictly from the pack, citing URLs.
//   3. Claude structures the draft into sections + sources (no new numbers; checked against the draft).
//   4. The note is stored in `notes` with the pack and the token cost.
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Flags: --dry (print, don't store), --date YYYY-MM-DD.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, SGT, ymdIn } from "./lib/db.js";
import { buildPack, type Pack } from "./lib/pack.js";

const MODEL = "claude-opus-5-5";
const arg = (k: string, d = ""): string => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] ?? d : d; };
const DRY = process.argv.includes("--dry");

const RULES = `You write the Morning Notes of Orrery Monitor for professional investors (portfolio managers) in Singapore and Tokyo, before the Tokyo open. British English, terse, no filler, no greetings.

Hard rules:
1. Every number you state must come from the NUMBERS PACK provided, or from a web page you actually fetched with web_search in this conversation. Never compute, estimate or recall numbers. If a figure is not in the pack and not on a fetched page, do not state it.
2. Cite every externally sourced claim inline as [n] and list the URLs at the end under "Sources", one per line as "[n] title - URL". Pack figures need no citation.
3. Mark any judgement, interpretation or expectation with (E) at the end of the sentence. Facts carry no (E).
4. For each stock in the pack that moved 5% or more, search for the reason (earnings beat or miss with the reported figures, guidance, deal, downgrade). State what you found with a citation; if you find nothing reliable, say "reason not found".
5. Dates and times: the pack is as of the generatedAt timestamp; today is dateSgt (Singapore). Refer to sessions by their date.

Depth: this is read by portfolio managers before the open; aim for 800 to 1,200 words of dense content, no padding. Prefer precise figures from the pack over adjectives. Every paragraph should carry at least one number.

Structure (markdown, H2 headings exactly as written):
## Overnight: US
Every index in the pack with level and % (S&P 500, NASDAQ, SOX, Dow, Russell, VIX). Breadth with the counts (advancers / decliners, names beyond ±2% and ±5%). The sector picture: the three best and three worst SPDR sectors with their %, then the constituent-average sectors where they tell a different story. Finish with one explicit characterisation such as "broad sell-off, centred on Tech" or "narrow rally led by semis", and say what drove it only with a citation.
## Big movers and why
Every name that moved 5% or more: the move, then the reason found by search (earnings beat or miss with the figures and the guidance, deals, downgrades, regulatory news) with a citation; "reason not found" when nothing reliable was found. Then the top five and bottom five S&P 500 names with their % in one line each.
## Japan outlook and daily strategy
Yesterday's Tokyo session in detail: Nikkei 225 and TOPIX levels and %, breadth counts, the three strongest and weakest Nikkei sectors with %, the big movers with reasons if found. The read-across from the US session to Japan: which Japanese sectors are exposed to what moved overnight (semis to SOX, autos and exporters to USD/JPY, banks and insurers to JGB and UST yields, China-linked names to Hang Seng and CNH), each with the relevant overnight number. The implied open from the CME future, marked (E). Technicals from the pack for Nikkei 225, TOPIX, USD/JPY and UST 10Y: level against the 20-, 50- and 200-day averages and the 1M and 12M sigma positions, with the actual average levels as support and resistance. Then the strategy, every sentence marked (E): a base case and an alternative with what would confirm each, what to buy, trim or avoid at sector level with the reason, how to handle the open (fade or follow the gap, and why), positioning or flow only if sourced, and hedging: when volatility is rising name the instrument (Nikkei VI, Nikkei futures or puts, USD/JPY, JGB futures) and the reason.
## Other macro
Rates: UST 2Y, 10Y, 30Y levels and bp changes, the 2s10s read, JGB 10Y; policy expectations only with a citation. FX: USD/JPY, DXY, EUR/USD, USD/CNH, USD/KRW with % and what it means for exporters. Commodities: WTI, Brent, gold, copper, natural gas. Volatility: VIX level and change. Today's calendar: every High and Medium item with its time in SGT, the forecast and the previous value, and one line on why it matters to the Tokyo session.
## Sources`;

const NoteSchema = z.object({
  title: z.string().describe("One-line headline, max 110 characters, like a newspaper market headline"),
  sections: z.array(z.object({ heading: z.string(), md: z.string() })).describe("The four content sections in order: Overnight: US; Big movers and why; Japan outlook and daily strategy; Other macro. Markdown bodies copied from the draft verbatim except for formatting."),
  sources: z.array(z.object({ n: z.number().int(), title: z.string(), url: z.string() })),
});

const numbersIn = (s: string): Set<string> => new Set((s.match(/-?\d[\d,]*\.?\d*\s?(%|bp|pts?)?/g) ?? []).map((x) => x.replace(/[\s,]/g, "")));

async function main() {
  const sb = db();
  const client = new Anthropic();
  const date = arg("date") || ymdIn(SGT);
  console.log(`Morning Notes for ${date} (SGT)`);
  const pack: Pack = await buildPack(sb);
  console.log(`pack: ${pack.table.length} table rows, US ${pack.us.breadth?.n ?? 0} names, JP ${pack.jp.breadth?.n ?? 0} names, ${pack.calendar.length} events, ${pack.headlines.length} headlines${pack.notes.length ? "; notes: " + pack.notes.join("; ") : ""}`);

  // --- 1. draft with web search ---
  const packJson = JSON.stringify({ ...pack, headlines: pack.headlines.slice(0, 30) });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 24000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high" },
    system: [{ type: "text", text: RULES, cache_control: { type: "ephemeral" } }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 18 }],
    messages: [{ role: "user", content: `NUMBERS PACK (JSON):\n${packJson}\n\nWrite today's Morning Notes.` }],
  });
  const draftMsg = await stream.finalMessage();
  if (draftMsg.stop_reason === "refusal") throw new Error(`draft refused: ${JSON.stringify(draftMsg.stop_details)}`);
  let draft = "";
  const seen: Array<{ title: string; url: string }> = [];
  for (const b of draftMsg.content) {
    if (b.type === "text") draft += b.text;
    else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") seen.push({ title: r.title, url: r.url });
  }
  if (!draft.trim()) throw new Error("empty draft");
  const u1 = draftMsg.usage;
  console.log(`draft: ${draft.length} chars, ${seen.length} pages fetched, in ${u1.input_tokens} out ${u1.output_tokens} (served by ${draftMsg.model})`);

  // --- 2. structure, without changing numbers ---
  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(NoteSchema) },
    messages: [{ role: "user", content: `Split this draft into the schema. Copy each section's markdown verbatim (keep the [n] markers and the (E) marks; do not add, remove or round any number). Build the sources list from the draft's Sources section.\n\nDRAFT:\n${draft}` }],
  });
  const note = parsed.parsed_output;
  if (!note) throw new Error("structuring failed");
  const u2 = parsed.usage;

  // --- 3. integrity: every number in the structured note must appear in the draft ---
  const draftNums = numbersIn(draft);
  const extra = [...numbersIn(note.sections.map((s) => s.md).join("\n"))].filter((n) => !draftNums.has(n) && /\d/.test(n) && n.replace(/\D/g, "").length > 1);
  if (extra.length) throw new Error(`structured note contains numbers absent from the draft: ${extra.slice(0, 10).join(", ")}`);

  const cost = (u1.input_tokens * 4 + u1.output_tokens * 20 + u2.input_tokens * 4 + u2.output_tokens * 20) / 1e6 + (u1.server_tool_use?.web_search_requests ?? 0) * 0.01;
  console.log(`title: ${note.title}\nsections: ${note.sections.map((s) => s.heading).join(" | ")}\nsources: ${note.sources.length}\ncost ≈ $${cost.toFixed(3)}`);
  if (DRY) { console.log("\n" + note.sections.map((s) => `## ${s.heading}\n${s.md}`).join("\n\n")); return; }

  const { error } = await sb.from("notes").upsert({ d: date, title: note.title, generated_at: new Date().toISOString(), model: draftMsg.model, sections: note.sections, sources: note.sources, pack, cost_usd: cost }, { onConflict: "d" });
  if (error) throw new Error(error.message);
  console.log("stored.");
}

main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exit(1); });
