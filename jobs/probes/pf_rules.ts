// The paper portfolio's probe of the rule texts the PMs gave from memory (P-0: C/portfolio-plan.md §3.1 item 3,
// "pf_rules"): none of the rows built on them is built before its text is read. It prints each page's title, its
// dates and the lines (or a PDF's passages) that carry the rule, for the record; read-only, no key, nothing written.
// In the order of the increments that need them:
//   P-2, P-3 (the first usable version): NYSE's holidays and early closes; the Fed's holidays (with SIFMA's
//     recommendation for the bond market: the settlement holidays X-10 needs; DTC's own notice has no address known
//     here); the BoJ's holidays; JPX's pages on tick sizes, daily price limits, trading hours (the order period before
//     the 15:30 closing auction: X-5) and short selling; FINRA's Trading Activity Fee and Rule 4210 (with its
//     government-securities rates); from the Federal Register, the SEC's newest Section 31 fee-rate order and its
//     rules and orders on minimum pricing increments (the half-cent tick of Rule 612 and when it applies), with Rules
//     201 and 612 themselves from the eCFR; the IRS's and the NTA's withholding pages (BP-42);
//   P-5, P-11, P-13: CME's specifications, roll dates, price limits, fees, performance bonds and Treasury conversion
//     factors (BP-24 to BP-29; stopped after two refusals, as CME's site may refuse automated readers); the NFA's
//     assessment fee (BP-26); JPX's special quotation; the option multipliers of SPX, NDX and OSE's Nikkei 225 options
//     (BP-46);
//   P-6, P-7a, P-4b: the GIPS 2020 provision on annualising (R-23); Basel's 1996 back-testing framework (BP-34);
//     Morningstar's definition of capture ratios (§2.12); MSCI's market classification (C-17) and index calculation
//     methodology (net dividends, withholding, ex-dates); Articles 7 and 8 of Regulation (EU) No 231/2013 (AIFMD's
//     gross and commitment methods).
// Every address is a candidate where no log shows it; a refusal or a 404 is the finding.
// Requests: at most 41, 1 s apart, to 17 sites; a site that refuses twice (an HTTP error or no answer) is not asked
// again (FINRA's refusals of 20 Nov count as one already).
// Runtime: deno (PDFs are read with unpdf, as edinet_spec_pdf.ts reads one; under node they are only measured).
//   Actions > source-probe > Run workflow: probe = pf_rules, runtime = deno
import { bytes, head, linksOf, look, masked, page, pause, pdfPages, printLines, printPassages, requestsMade, textLines, titleOf } from "./lib.ts";

const GAP = 1000, MAX = 41;
const t0 = Date.now();
// FINRA's site answered 403 to GitHub's machines twice on 20 Nov (stock_dates_crowding.log l.71, l.74): one refusal is
// counted already, so its rule pages are asked once and, if refused again, no more.
const refused = new Map<string, number>([["www.finra.org", 1]]);
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const skip = (u: string) => (refused.get(hostOf(u)) ?? 0) >= 2;
const note = (u: string, ok: boolean) => { if (!ok) refused.set(hostOf(u), (refused.get(hostOf(u)) ?? 0) + 1); };
const DATED = /(19|20)\d\d|last (modified|updated|reviewed)|updated|effective|改訂|更新/i;

/** One page or PDF: its title and dates, then the lines (or passages) that match `want`. Returns the page's links. */
async function read(what: string, url: string, want: RegExp, max = 25): Promise<Array<{ href: string; text: string }>> {
  head(what);
  if (skip(url)) { console.log(`  not asked: ${hostOf(url)} refused twice already (${url})`); return []; }
  if (/\.pdf(\?|$)/i.test(url)) {
    const b = await bytes(url, { timeoutMs: 90000 });
    note(url, b.ok);
    await pause(GAP);
    if (!b.data) return [];
    const pages = await pdfPages(b.data);
    if (pages) { console.log(`  ${pages.length} pages; page 1: ${pages[0]?.slice(0, 300) ?? "–"}`); printPassages(pages, want, max); }
    return [];
  }
  const p = await page(url, { timeoutMs: 45000 });
  note(url, p.ok);
  await pause(GAP);
  if (!p.ok) return [];
  const ls = textLines(p.html);
  console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text${ls.length < 15 ? " (few: the page may be built by scripts)" : ""}`);
  for (const l of ls.filter((x) => DATED.test(x) && x.length < 160 && /updated|modified|effective|as of|revised|改訂|更新|reviewed/i.test(x)).slice(0, 3)) console.log(`  date line: ${l}`);
  printLines(ls, want, max);
  return linksOf(p.html, p.final);
}
/** The Federal Register's search (the SEC's documents only), newest first; then the newest document's text. */
async function register(what: string, term: string, want: RegExp): Promise<void> {
  head(what);
  const r = await look(`https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${encodeURIComponent(term)}&conditions[agencies][]=securities-and-exchange-commission&order=newest&per_page=8&fields[]=title&fields[]=publication_date&fields[]=type&fields[]=document_number&fields[]=html_url&fields[]=raw_text_url&fields[]=dates&fields[]=effective_on`, { headers: { accept: "application/json" }, show: 0 });
  note(r.url, r.ok);
  await pause(GAP);
  let docs: Array<Record<string, unknown>> = [];
  try { docs = (JSON.parse(r.text) as { results?: Array<Record<string, unknown>> }).results ?? []; } catch { /* below */ }
  for (const d of docs) console.log(`  ${d.publication_date} · ${d.type} · ${d.document_number} · "${String(d.title ?? "").slice(0, 160)}"${d.dates ? ` · dates: ${String(d.dates).slice(0, 300)}` : ""}${d.effective_on ? ` · effective ${d.effective_on}` : ""} · ${d.html_url ?? ""}`);
  if (!docs.length) { console.log("  no document found"); return; }
  const raw = String(docs[0].raw_text_url ?? "");
  if (!raw) return;
  const t = await page(raw, { headers: { accept: "text/plain,*/*" }, timeoutMs: 60000 });
  note(raw, t.ok);
  await pause(GAP);
  if (t.ok) printPassages([t.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")], want, 6);
}

console.log(`run at ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);

// ---- P-2, P-3: calendars ----
await read("NYSE: holidays and early closes (P-2's sessions_cal.early_close)", "https://www.nyse.com/markets/hours-calendars", /20(26|27|28)|holiday|early|1:00 p\.m\.|half|Thanksgiving|Christmas|Independence/i, 40);
await read("The Federal Reserve: its holidays (the settlement holidays for US securities and USD, X-10)", "https://www.federalreserve.gov/aboutthefed/k8.htm", /20(26|27)|Columbus|Veterans|Indigenous|Juneteenth|holiday/i, 30);
await read("SIFMA: holiday recommendations for the US bond market (early closes and full closes)", "https://www.sifma.org/resources/general/holiday-schedule/", /20(26|27)|Columbus|Veterans|early close|2:00 p\.m\.|full close|recommend/i, 30);
console.log("\n  DTC's own holiday notice: no address known here, so not asked; the Fed's list and SIFMA's recommendation stand in until it is found");
await read("The Bank of Japan: its holidays", "https://www.boj.or.jp/en/about/outline/holi.htm", /20(26|27)|holiday|closed|December 31|January [1-3]|Saturday|Sunday/i, 20);

// ---- P-2: JPX's trading rules ----
{
  const links = await read("JPX: the domestic equity trading pages (index)", "https://www.jpx.co.jp/english/equities/trading/domestic/index.html", /tick|price limit|trading hours|closing auction|short sell|session/i, 15);
  const wanted = links.filter((l) => /jpx\.co\.jp/.test(l.href) && /tick size|price limit|trading hours|closing auction|short sell|trading session/i.test(l.text)).slice(0, 4);
  console.log(`  pages followed: ${wanted.map((l) => `${l.text.slice(0, 40)} -> ${masked(l.href)}`).join(" · ") || "none found"}`);
  for (const l of wanted) await read(`JPX: ${l.text.slice(0, 60)}`, l.href, /tick|yen|price limit|limit|15:2\d|15:30|closing auction|pre-closing|lunch|11:30|12:30|session|10%|short|50 (trading )?units|uptick|price restriction/i, 30);
}

// ---- P-2: US fees and rules ----
await read("FINRA: the Trading Activity Fee (per share sold, with its per-trade maximum)", "https://www.finra.org/rules-guidance/guidance/trading-activity-fee", /per share|maximum|TAF|\$0\.|effective|covered sale/i, 20);
await read("FINRA Rule 4210: margin, with its rates for government securities (a later T-bill sweep)", "https://www.finra.org/rules-guidance/rulebooks/finra-rules/4210", /government|exempted securit|Treasury|percent|maintenance|non-convertible|year(s)? to maturity/i, 25);
await register("The Federal Register: the SEC's newest Section 31 fee-rate orders (the rate in force on a trade date)", "\"Annual Adjustments to Transaction Fee Rates\"", /per million|\$\d+\.\d+ per|effective|fee rate applicable/i);
await register("The Federal Register: the SEC's rules and orders on minimum pricing increments (Rule 612's half-cent tick: when it applies)", "\"minimum pricing increment\"", /compliance date|half-penny|\$0\.005|612|tick size/i);
await read("eCFR: 17 CFR 242.201, the short-sale price test (Rule 201)", "https://www.ecfr.gov/current/title-17/section-242.201", /10 percent|ten percent|circuit breaker|national best bid|remainder of the day|following day|short sale/i, 15);
await read("eCFR: 17 CFR 242.612, minimum pricing increments (Rule 612)", "https://www.ecfr.gov/current/title-17/section-242.612", /\$0\.01|\$0\.005|\$1\.00|time-weighted|tick|increment|less than/i, 15);

// ---- P-3: withholding (BP-42) ----
await read("The IRS: withholding on dividends paid to foreign persons", "https://www.irs.gov/individuals/international-taxpayers/nra-withholding", /30%|30 percent|dividend|treaty|withhold/i, 15);
await read("The IRS: tax treaty tables (Japan's dividend rate)", "https://www.irs.gov/individuals/international-taxpayers/tax-treaty-tables", /Japan|dividend|Table 1|rate/i, 15);
{
  const links = await read("The NTA: withholding tax (listed dividends, 15.315% / 20.315%)", "https://www.nta.go.jp/english/taxes/withholding/index.htm", /15\.315|20\.315|dividend|listed|non-resident|investment trust|withholding/i, 20);
  const it = links.find((l) => /nta\.go\.jp/.test(l.href) && /investment trust|dividend/i.test(l.text));
  if (it) await read(`The NTA: ${it.text.slice(0, 60)} (BP-42: dividends received by a Japanese investment trust)`, it.href, /investment trust|dividend|withhold|15\.315|20\.315|exempt/i, 20);
  else console.log("  no NTA page on investment trusts' dividends linked there");
}

// ---- P-5, P-11, P-13: futures and options rules ----
await read("CME: the E-mini S&P 500's specifications (tick, spread tick, hours, final settlement)", "https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.contractSpecs.html", /tick|minimum price|calendar spread|0\.05|termination|final settlement|special opening|trading hours|\$50/i, 25);
await read("CME: equity index roll dates", "https://www.cmegroup.com/trading/equity-index/rolldates.html", /roll|20(26|27)|December|March/i, 20);
await read("CME: daily price limits", "https://www.cmegroup.com/trading/price-limits.html", /limit|7%|13%|20%|equity|reset|percent/i, 20);
await read("CME: clearing fees", "https://www.cmegroup.com/company/clearing-fees.html", /fee|non-member|E-mini|Treasury|per contract|\$\d/i, 20);
await read("CME: 30-day fed funds futures' specifications (BP-24)", "https://www.cmegroup.com/markets/interest-rates/stirs/30-day-federal-fund.contractSpecs.html", /tick|price quotation|\$41\.67|termination|settlement|contract unit/i, 15);
await read("CME: three-month SOFR futures' specifications (BP-24)", "https://www.cmegroup.com/markets/interest-rates/stirs/three-month-sofr.contractSpecs.html", /tick|\$25|termination|settlement|contract unit|IMM/i, 15);
await read("CME: Treasury futures' conversion factors (P-13's cheapest to deliver): status and format", "https://www.cmegroup.com/trading/interest-rates/treasury-futures-conversion-factor-look-up-tables.html", /conversion factor|deliverable|xls|download/i, 12);
await read("CME: the E-mini S&P 500's margins page (performance bonds): status and format", "https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.margins.html", /margin|maintenance|initial|performance bond|\$\d/i, 12);
await read("The NFA: its assessment fee per contract and side (BP-26)", "https://www.nfa.futures.org/registration-membership/membership-and-dues/assessment-fee.html", /assessment fee|per (round-turn|side|contract)|\$0\.\d|cents/i, 12);
await read("JPX: the special quotation (SQ) of index futures and options", "https://www.jpx.co.jp/english/markets/derivatives/special-quotation/index.html", /SQ|special quotation|opening|second Friday|calculated/i, 15);
await read("Cboe: SPX options' specifications (multiplier, BP-46)", "https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/", /multiplier|\$100|contract size|settlement|exercise|expiration/i, 15);
await read("Cboe: NDX options' specifications (multiplier, BP-46)", "https://www.cboe.com/tradable_products/nasdaq_100/ndx_options/specifications/", /multiplier|\$100|contract size|settlement|exercise|expiration/i, 15);
await read("JPX: Nikkei 225 options' contract specifications (multiplier, BP-46)", "https://www.jpx.co.jp/english/derivatives/products/domestic/225options/01.html", /multiplier|1,000|trading unit|yen|contract/i, 15);

// ---- P-6, P-7a, P-4b: standards and methodologies ----
await read("CFA Institute: the GIPS 2020 standards for firms (R-23: annualising returns of less than a year)", "https://www.gipsstandards.org/wp-content/uploads/2021/03/2020_gips_standards_firms.pdf", /annuali[sz]/i, 6);
await read("The Basel Committee: the 1996 back-testing framework (BP-34: green, yellow, red zones)", "https://www.bis.org/publ/bcbs22.pdf", /green zone|yellow zone|red zone|250|exceptions/i, 6);
await read("Morningstar: the up- and down-capture ratios' definition (§2.12)", "https://www.morningstar.com/investing-definitions/upside-capture-ratio", /capture|upside|downside|geometric|month/i, 12);
await read("MSCI: market classification (C-17: the Global book's regions)", "https://www.msci.com/our-solutions/indexes/market-classification", /developed|emerging|frontier|Japan|classification|review/i, 15);
{
  const links = await read("MSCI: index methodology (the list of methodology documents)", "https://www.msci.com/indexes/index-resources/index-methodology", /calculation|methodology|withholding|dividend/i, 10);
  const calc = links.find((l) => /index calculation methodology|calculation methodology/i.test(l.text) || /calc.*method.*\.pdf/i.test(l.href));
  if (calc) await read(`MSCI: ${calc.text.slice(0, 60) || "the index calculation methodology"} (net dividends, withholding, ex-dates)`, calc.href, /net daily total return|withholding tax|ex-date|net dividends|reinvest/i, 6);
  else console.log("  no link to the index calculation methodology found there");
}
{
  head("EUR-Lex: Regulation (EU) No 231/2013, Articles 7 and 8 (AIFMD's gross and commitment methods)");
  const url = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32013R0231";
  const p = await page(url, { timeoutMs: 90000 });
  note(url, p.ok);
  await pause(GAP);
  if (p.ok) {
    const ls = textLines(p.html), a = ls.findIndex((l) => /^Article 7$/i.test(l)), b = ls.findIndex((l, i) => i > a && /^Article 9$/i.test(l));
    console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines; Article 7 at line ${a}, Article 9 at line ${b}`);
    for (const l of (a >= 0 ? ls.slice(a, b > a ? Math.min(b, a + 45) : a + 45) : [])) console.log(`  | ${l.slice(0, 400)}`);
  }
}

console.log(`\nsites that refused: ${[...refused].map(([h, n]) => `${h} (${n})`).join(", ") || "none"}`);
console.log(`requests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
