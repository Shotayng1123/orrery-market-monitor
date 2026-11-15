// Morning Notes — written every day around 07:00 SGT by GitHub Actions (.github/workflows/morning-note.yml):
// Monday to Saturday the daily note (Saturday covers Friday's US session), Sunday the weekly wrap-up.
//   1. buildPack(): every number the note may use, from the Monitor's own data and Yahoo constituent moves.
//   2. Claude (claude-opus-5-5, web search) drafts the note in markdown, strictly from the pack, citing URLs.
//   3. Claude structures the draft into sections + sources (no new numbers; checked against the draft).
//   4. The note is stored in `notes` with the pack and the token cost.
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Flags: --dry (print, don't store), --date YYYY-MM-DD.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, selectAll, SGT, ymdIn } from "./lib/db.js";
import { buildPack, buildWeeklyPack, type Pack, type WeeklyPack } from "./lib/pack.js";

const MODEL = "claude-opus-5-5";
const arg = (k: string, d = ""): string => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] ?? d : d; };
const DRY = process.argv.includes("--dry"), IF_MISSING = process.argv.includes("--if-missing");

const TAG_RULE = `Name tags: the first time a paragraph mentions an index, a stock, a currency pair, a yield or a commodity that has a symbol, write it as [[SYMBOL|Name as it reads in the sentence]], for example [[AMD|AMD]], [[^SOX|the SOX]], [[8035.T|Tokyo Electron]], [[USDJPY=X|USD/JPY]]. Use the symbol exactly as it appears in the pack; for a company that is not in the pack use its exchange ticker (US ticker, or the four-character Tokyo code followed by .T) only when you are certain of it, otherwise write the name without a tag. The page turns each tag into a link to that instrument's page.`;

const RULES = `You write the Morning Notes of Orrery Monitor for professional investors (portfolio managers) in Singapore and Tokyo, before the Tokyo open. British English, terse, no filler, no greetings.

What the reader wants (Shota, 15 Nov 2026): the news and events behind the moves, not the moves themselves. A table of every index, yield, currency and commodity with its change sits right beside your text, so repeating those figures wastes the reader's time. Your job is the why: which headline, result, policy step or scandal moved what, and who gains or loses from it, in short sentences. The model to follow: "[[AMD|AMD]] rallied as the main beneficiary of the Nvidia accounting probe [3]" - one cause, one effect, one citation.

Hard rules:
1. Do not state the level or the % / bp change of any index, yield, currency pair, commodity or volatility index: the tables show them. Say the direction in words (fell, rallied, steepened, weakened) and spend the sentence on the cause.
2. Numbers are for the news itself: reported earnings and guidance figures, data prints against consensus, deal sizes, policy rates decided, and the % move of a single stock when you explain it. Every such number must come from the NUMBERS PACK or from a web page you actually fetched with web_search in this conversation. Never compute, estimate or recall numbers.
3. Cite every externally sourced claim inline as [n] and list the URLs at the end under "Sources", one per line as "[n] title - URL".
4. Mark any judgement, interpretation or expectation with (E) at the end of the sentence. Facts carry no (E).
5. For each stock in the pack that moved 5% or more, search for the reason. State what you found with a citation; if you find nothing reliable, say "reason not found". Look for the second-order names too: who benefits or suffers from the same news (a rival, a supplier, a customer, the Japanese peers).
6. Dates and times: the pack is as of the generatedAt timestamp; today is dateSgt (Singapore). Refer to sessions by their date.
7. If dateSgt is a Saturday there is no Tokyo session today or tomorrow: write the Japan section as the read-across for Monday's open, and say so. If dateSgt is a Monday, cover weekend news that matters for the open, with citations.
8. ${TAG_RULE}

Length and style: 350 to 600 words in all. Short sentences, one cause and one effect each. Bullets ("- ") rather than long paragraphs. No sentence that only restates a move.

Structure (markdown, H2 headings exactly as written):
## What moved markets
Three to six bullets, the most important first. Each: the event or headline, then what it moved and in which direction (sectors and names rather than index figures), with a citation. End with one line that characterises the session ("broad risk-off led by semis after ...") (E).
## Stocks: movers and why
One bullet per name that moved 5% or more: the tagged name, its move, the reason found (with the reported figures when it is earnings or guidance) and a citation; then the related names moved by the same news. "reason not found" when nothing reliable was found.
## Japan: read-across and strategy
Which of the overnight events matter for Tokyo and for which sectors and names (semis, autos and exporters, banks and insurers, China-linked names), each tied to its cause. What drove yesterday's Tokyo session, by news. Then the strategy, every sentence marked (E): the base case and what would change it, what to favour or avoid at sector level and why, how to treat the open, and a hedge when the news flow calls for one. At most two price levels in this section, and only when a level is itself the trigger.
## Macro and today's events
Rates, currencies and commodities: only the reasons (central bank decisions and speeches, data surprises against consensus, politics, supply news), each with a citation. Then today's High and Medium calendar items that can move the Tokyo session: time in SGT, what is expected, and why it matters, one line each.
## Sources`;

const WEEKLY_RULES = `You write the Sunday Weekly Wrap-up of Orrery Monitor for professional investors (portfolio managers) in Singapore and Tokyo. British English, terse, no filler, no greetings.

Hard rules:
1. Every number you state must come from the NUMBERS PACK provided, or from a web page you actually fetched with web_search in this conversation. Never compute, estimate or recall numbers. If a figure is not in the pack and not on a fetched page, do not state it.
2. Cite every externally sourced claim inline as [n] and list the URLs at the end under "Sources", one per line as "[n] title - URL". Pack figures need no citation.
3. Mark any judgement, interpretation or expectation with (E) at the end of the sentence. Facts carry no (E).
4. For every stock in the pack's weekly top and bottom lists, and every name that moved 10% or more on the week, search for the reason (earnings, guidance, deals, downgrades, regulation, index changes) and state it with a citation; "reason not found" when nothing reliable was found.
5. Explain the why behind rates and currencies: central bank decisions and speeches, data surprises (use the pack's calendar actuals against consensus), politics. Each explanation needs a citation or an (E).
6. Dates: the week reviewed runs from weekStart to weekEnd (Singapore dates); today is dateSgt.
7. ${TAG_RULE}

Depth: 1,200 to 1,800 words of dense content; every paragraph carries numbers from the pack.

Structure (markdown, H2 headings exactly as written):
## Week in review: equities
Weekly % for every equity index in the pack (US, Japan, Asia, Europe, EM), then the S&P 500 and Nikkei 225 sector moves (best and worst three each, with %), breadth (names up / down), and the one-paragraph read of what drove the week (E where it is a judgement).
## Single-stock movers and why
The top and bottom weekly movers of the S&P 500 and the Nikkei 225 with their %, each followed by the reason found (earnings figures, guidance, deals, downgrades) with a citation.
## Rates and currencies: what happened and why
Weekly bp changes for every yield in the pack (UST 3M to 30Y, JGB 2Y/10Y/30Y, Bund, Gilt, euro area, Canada), the curve read (2s10s), policy decisions and speeches of the week with citations, then FX: USD/JPY, DXY, EUR/USD, GBP/USD, AUD/USD, USD/CNY, USD/KRW and others with % and the drivers. Commodities and crypto weekly moves with drivers.
## Macro and politics: review and insight
The week's High-impact releases (actual vs consensus vs previous from the pack, better or worse), political and geopolitical events that moved markets (for example an election, a tariff decision, a central bank surprise) with what happened, the market reaction and the insight for positioning (E).
## Week ahead
Every High-impact event in the pack's week ahead with consensus and previous, central bank meetings, earnings dates found by search, and what would change the picture (E).
## Sources`;

const NoteSchema = z.object({
  title: z.string().describe("One-line headline, max 110 characters, like a newspaper market headline"),
  sections: z.array(z.object({ heading: z.string(), md: z.string() })).describe("The content sections in the order of the draft (the H2 headings of the draft, Sources excluded). Markdown bodies copied from the draft verbatim except for formatting."),
  sources: z.array(z.object({ n: z.number().int(), title: z.string(), url: z.string() })),
});

/** Every symbol a name tag may point at: the Monitor's instruments, the pack's rows and all index constituents. */
async function knownSymbols(sb: ReturnType<typeof db>, pack: Pack | WeeklyPack): Promise<string[]> {
  const out: string[] = pack.table.map((r) => r.symbol);
  for (const side of [pack.us, pack.jp]) for (const list of [side.top, side.bottom, side.big]) for (const m of list) out.push(m.symbol);
  const { data: inst } = await sb.from("instruments").select("symbol");
  for (const r of inst ?? []) out.push(r.symbol as string);
  out.push(...(await selectAll<{ symbol: string }>(() => sb.from("constituents").select("symbol").order("symbol"))).map((r) => r.symbol));
  return out;
}

const numbersIn = (s: string): Set<string> => new Set((s.match(/-?\d[\d,]*\.?\d*\s?(%|bp|pts?)?/g) ?? []).map((x) => x.replace(/[\s,]/g, "")));

async function main() {
  const sb = db();
  const client = new Anthropic();
  const date = arg("date") || ymdIn(SGT);
  const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay();   // 0 = Sunday in Singapore
  const kind: "daily" | "weekly" = arg("kind") === "weekly" || (arg("kind") !== "daily" && weekday === 0) ? "weekly" : "daily";
  console.log(`${kind === "weekly" ? "Weekly Wrap-up" : "Morning Notes"} for ${date} (SGT)`);
  if (IF_MISSING && !DRY) {
    const { data: have } = await sb.from("notes").select("id,generated_at").eq("d", date).limit(1);
    if (have?.length) { console.log(`already stored for ${date} (generated ${have[0].generated_at}): nothing to do.`); return; }
  }
  const pack: Pack | WeeklyPack = kind === "weekly" ? await buildWeeklyPack(sb) : await buildPack(sb);
  if (pack.kind === "weekly") console.log(`weekly pack: ${pack.table.length} table rows, US ${pack.us.breadth?.n ?? 0} names, JP ${pack.jp.breadth?.n ?? 0} names, ${pack.actuals.length} actuals, ${pack.weekAhead.length} ahead, ${pack.headlines.length} headlines${pack.notes.length ? "; notes: " + pack.notes.join("; ") : ""}`);
  else console.log(`pack: ${pack.table.length} table rows, US ${pack.us.breadth?.n ?? 0} names, JP ${pack.jp.breadth?.n ?? 0} names, ${pack.calendar.length} events, ${pack.headlines.length} headlines${pack.notes.length ? "; notes: " + pack.notes.join("; ") : ""}`);

  // --- 1. draft with web search ---
  const packJson = JSON.stringify({ ...pack, headlines: pack.headlines.slice(0, pack.kind === "weekly" ? 80 : 30) });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 24000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high" },
    system: [{ type: "text", text: pack.kind === "weekly" ? WEEKLY_RULES : RULES, cache_control: { type: "ephemeral" } }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: pack.kind === "weekly" ? 28 : 18 }],
    messages: [{ role: "user", content: `NUMBERS PACK (JSON):\n${packJson}\n\n${pack.kind === "weekly" ? "Write this week's Weekly Wrap-up." : "Write today's Morning Notes."}` }],
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
    messages: [{ role: "user", content: `Split this draft into the schema. Copy each section's markdown verbatim (keep the [n] markers, the (E) marks and the [[SYMBOL|name]] tags exactly as written; do not add, remove or round any number). Build the sources list from the draft's Sources section.\n\nDRAFT:\n${draft}` }],
  });
  const note = parsed.parsed_output;
  if (!note) throw new Error("structuring failed");
  const u2 = parsed.usage;

  // --- 3. integrity: every number in the structured note must appear in the draft ---
  const draftNums = numbersIn(draft);
  const extra = [...numbersIn(note.sections.map((s) => s.md).join("\n"))].filter((n) => !draftNums.has(n) && /\d/.test(n) && n.replace(/\D/g, "").length > 1);
  if (extra.length) throw new Error(`structured note contains numbers absent from the draft: ${extra.slice(0, 10).join(", ")}`);

  // --- 4. name tags: a tag is kept only when its symbol is one the Monitor knows (an instrument, a pack row or an
  // index constituent); anything else becomes plain text, so a mistaken ticker can never link to the wrong page.
  const known = new Set<string>(await knownSymbols(sb, pack));
  let kept = 0, dropped = 0;
  for (const sec of note.sections) sec.md = sec.md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, sym: string, text: string) => { if (known.has(sym.trim())) { kept++; return `[[${sym.trim()}|${text}]]`; } dropped++; return text; });
  console.log(`name tags: ${kept} kept, ${dropped} dropped (unknown symbol)`);

  const cost = (u1.input_tokens * 4 + u1.output_tokens * 20 + u2.input_tokens * 4 + u2.output_tokens * 20) / 1e6 + (u1.server_tool_use?.web_search_requests ?? 0) * 0.01;
  console.log(`title: ${note.title}\nsections: ${note.sections.map((s) => s.heading).join(" | ")}\nsources: ${note.sources.length}\ncost ≈ $${cost.toFixed(3)}`);
  if (DRY) { console.log("\n" + note.sections.map((s) => `## ${s.heading}\n${s.md}`).join("\n\n")); return; }

  const { error } = await sb.from("notes").upsert({ d: date, kind, title: note.title, generated_at: new Date().toISOString(), model: draftMsg.model, sections: note.sections, sources: note.sources, pack, cost_usd: cost }, { onConflict: "d" });
  if (error) throw new Error(error.message);
  console.log("stored.");
}

main().catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exit(1); });
