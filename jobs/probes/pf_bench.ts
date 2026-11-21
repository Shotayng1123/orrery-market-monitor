// The paper portfolio's probe of the benchmarks' free mirrors (P-0: C/portfolio-plan.md §3.1 item 5, "pf_bench"), for
// P-3 (`ref_funds`: each tracker's fee, index and addresses), P-4b (members and weights), P-4c (the bond funds' profile)
// and P-11 (Cboe's volatility indices). The owner's P4 of 20 Nov 2026 ("go with d. say personal use"): JPX's, Nikkei's,
// JSF's and the fund issuers' files are used now, credited, on the owner's statement that the Monitor's use is personal.
// So each site's robots.txt and terms are printed for the record only; what would go beyond the two extracts the owner
// saw (a robots.txt that disallows the path to every reader, terms that forbid automated reading or personal use too,
// a login) is marked for the owner. Read-only, no key, nothing written. Every fund page, file and address is a
// candidate (the PMs named the funds from memory: odp4p8 check 25) unless a log in C/probes/ shows it.
// It prints:
//   1. iShares (US): the product list, for the fee and the page of every iShares fund on the PMs' lists; EWJ's and
//      ACWI's pages, holdings files and fund-data files (NAV history, distributions); AGG's page and holdings (the
//      columns a bond fund's file carries); the pages of HEWJ, EEM, EPP, IVV and the MSCI Europe fund (fee, index,
//      tracking difference); then the UK site's London Global Aggregate fund, USD-hedged class: page and holdings;
//   2. State Street: SPY's daily holdings workbook and its page; Vanguard: BNDW (fee, stated index: "near index"?);
//      Nomura NEXT FUNDS: 1306.T and 1321.T; Xtrackers: DBJP; MAXIS: 2559.T;
//   3. JPX: the TOPIX weight file, TOPIX's page and its total-return file, the list of listed ETFs (a fund on MSCI
//      Japan itself? 2559's index), the header of the workbook the server reads (is 33業種区分 there?), its terms;
//   4. Nikkei: the Nikkei 225 total return's page (for the record) and its licence page;
//   5. Cboe: the VIX, VIX6M and VXN history files (the address of the VIX3M and VIX9D files read on 20 Nov,
//      index_files.log l.52–60) and its historical-data page with its terms;
//   6. MSCI's end-of-day index page: status only (B; not used: the owner said to mirror);
//   7. each issuer's robots.txt and terms.
// Requests: at most 57, 1 s apart; ishares.com takes 19 of them, jpx.co.jp 9, cboe.com 7.
// Runtime: deno (workbooks are opened with the package the server uses; under node they are only measured).
//   Actions > source-probe > Run workflow: probe = pf_bench, runtime = deno
import { bytes, cellText, head, linksOf, look, masked, page, pause, printLines, requestsMade, robots, rowText, textLines, titleOf, workbook, type Page } from "./lib.ts";

const GAP = 1000, MAX = 57;
const t0 = Date.now();
const TERMS_LINK = /terms|legal|disclaimer|website use|conditions of use|利用規約|ご利用|サイトポリシー|免責/i;
const TERMS_WANT = /automat|robot|scrap|crawl|spider|commercial|personal|non-commercial|reproduc|redistribut|copy|download|frame|data|商用|営利|個人|二次利用|転載|複製|自動|クローラ|禁止/i;
const GATE = /(prohibit|not permitted|may not|must not|forbid)[^.]{0,80}(automat|robot|scrap|crawl|spider|personal|non-commercial)|(automat|robot|scrap|crawl|spider)[^.]{0,80}(prohibit|not permitted|may not|forbid)|自動[^。]{0,40}(禁止|できません)|個人[^。]{0,40}(禁止|できません)/i;
const terms = new Map<string, { text: string; href: string }>();
const keepTerms = (p: Page, site: string) => { if (terms.has(site) || !p.ok) return; const l = linksOf(p.html, p.final).find((x) => TERMS_LINK.test(x.text) && new URL(x.href).host.split(".").slice(-2).join(".") === new URL(p.final).host.split(".").slice(-2).join(".")); if (l) terms.set(site, l); };
const fundLines = /expense ratio|management fee|net expense|gross expense|total expense|benchmark index|underlying index|^index\b|benchmark \||fees as of|inception|distribution frequency|number of holdings|nav as of|信託報酬|対象指標|連動対象|ベンチマーク|基準価額|分配|純資産|tracking/i;

async function get(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Page> { const p = await page(url, init); await pause(GAP); return p; }
/** A fund's page: title, the fee, index and performance lines, its data-file links; it notes the issuer's terms link. */
async function fundPage(what: string, url: string, site: string): Promise<Page> {
  head(what);
  const p = await get(url, { timeoutMs: 45000 });
  if (!p.ok) return p;
  const ls = textLines(p.html);
  console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text${ls.length < 15 ? " (few: the page may be built by scripts)" : ""}`);
  printLines(ls, fundLines, 18);
  const files = linksOf(p.html, p.final).filter((l) => /\.ajax\?|fileType=|\.(csv|xlsx?|pdf)(\?|$)|holdings|download/i.test(l.href) && !/javascript:/i.test(l.href));
  console.log(`  ${files.length} data or document links${files.length ? `; first eight: ${files.slice(0, 8).map((l) => `${l.text.slice(0, 30) || "(no text)"} -> ${masked(l.href)}`).join(" · ")}` : ""}`);
  keepTerms(p, site);
  return p;
}
/** A CSV file as text (iShares' holdings): its leading lines, header, row count and first rows. */
async function csvFile(what: string, url: string, decoder = "utf-8"): Promise<void> {
  const b = await bytes(url, { timeoutMs: 90000 });
  await pause(GAP);
  if (!b.data) return;
  const ls = new TextDecoder(decoder).decode(b.data).split(/\r?\n/).filter((l) => l.trim());
  const hi = ls.findIndex((l) => /^"?(Ticker|Name|Issuer Ticker|日付|コード|銘柄)/i.test(l) && l.split(",").length > 4);
  console.log(`  ${what}: ${ls.length} lines; before the header: ${ls.slice(0, Math.max(0, Math.min(hi, 10))).map((l) => l.slice(0, 90)).join(" · ") || "–"}`);
  if (hi >= 0) {
    const rows = ls.slice(hi + 1).filter((l) => l.split(",").length > 4);
    const ac = ls[hi].split(",").findIndex((c) => /asset class/i.test(c));
    console.log(`  header: ${ls[hi].slice(0, 400)}`);
    console.log(`  ${rows.length} rows${ac >= 0 ? `; by asset class: ${[...rows.reduce((m, l) => { const k = (l.match(/("([^"]*)"|[^,]*)(,|$)/g) ?? [])[ac]?.replace(/^"|",?$|,$/g, "") ?? "?"; m.set(k, (m.get(k) ?? 0) + 1); return m; }, new Map<string, number>())].map(([k, n]) => `${k} ${n}`).join(", ")}` : ""}; first three: ${rows.slice(0, 3).map((l) => l.slice(0, 200)).join(" · ")}`);
  } else console.log(`  no header line found; first five lines: ${ls.slice(0, 5).map((l) => l.slice(0, 120)).join(" · ")}`);
}
/** A workbook: each sheet's rows, its first rows and, for a sheet named like `newest`, its last rows. */
async function bookFile(what: string, url: string, newest = /histor|distribut/i, find: RegExp | null = null): Promise<unknown[][] | null> {
  const b = await bytes(url, { timeoutMs: 90000 });
  await pause(GAP);
  if (!b.data) return null;
  const wb = await workbook(b.data);
  if (!wb) return null;
  console.log(`  ${what}: ${wb.length} sheets: ${wb.map((s) => `${s.name} (${s.rows.length} rows)`).join(", ")}`);
  for (const s of wb.slice(0, 6)) {
    console.log(`   "${s.name}": ${s.rows.slice(0, 3).map((r) => rowText(r, 200)).join(" · ")}`);
    if (newest.test(s.name)) console.log(`     its last three rows: ${s.rows.slice(-3).map((r) => rowText(r, 200)).join(" · ")}`);
    if (find) for (const r of s.rows.filter((r) => r.some((c) => find.test(cellText(c)))).slice(0, 8)) console.log(`     row matching ${find}: ${rowText(r, 260)}`);
  }
  return wb[0]?.rows ?? null;
}

console.log(`run at ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);

// ---- 1. iShares, US ----
const ISH = "https://www.ishares.com";
const WANT = ["EWJ", "HEWJ", "ACWI", "IVV", "EEM", "EPP", "IEUR", "AGG", "SHY", "IEI", "IEF", "TLH", "TLT", "LQD", "MBB", "IAGG", "IGOV", "HYG", "EMB", "TIP", "FLOT", "1475"];
const pageOf = new Map<string, string>([   // candidates, used only if the product list does not answer
  ["EWJ", `${ISH}/us/products/239665/ishares-msci-japan-etf`], ["ACWI", `${ISH}/us/products/239600/ishares-msci-acwi-etf`],
  ["AGG", `${ISH}/us/products/239458/ishares-core-total-us-bond-market-etf`], ["IVV", `${ISH}/us/products/239726/ishares-core-sp-500-etf`],
  ["EEM", `${ISH}/us/products/239637/ishares-msci-emerging-markets-etf`],
]);
head("1. iShares (US): the product list, for each fund's fee and page");
{
  const r = await look(`${ISH}/us/product-screener/product-screener-v3.1.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/ishares-product-screener-backend-config&siteEntryPassthrough=true`, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 });
  await pause(GAP);
  let j: unknown = null;
  try { j = JSON.parse(r.text); } catch { /* below */ }
  const items = j && typeof j === "object" ? Object.values(j as Record<string, unknown>).filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];
  console.log(`  ${items.length} products${items[0] ? `; a product's fields: ${Object.keys(items[0]).slice(0, 60).join(", ")}` : ""}`);
  const tick = (o: Record<string, unknown>) => String(o.localExchangeTicker ?? Object.entries(o).find(([k]) => /ticker/i.test(k))?.[1] ?? "");
  const show = (v: unknown) => (v && typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v));
  for (const t of WANT) {
    const o = items.find((x) => tick(x).toUpperCase() === t);
    if (!o) { console.log(`  ${t}: not in the list`); continue; }
    const url = Object.values(o).find((v) => typeof v === "string" && /\/products\/\d+/.test(v)) as string | undefined;
    if (url) pageOf.set(t, new URL(url, ISH).toString());
    console.log(`  ${t}: ${o.fundName ?? o.name ?? "–"} · ${Object.entries(o).filter(([k]) => /fee|expense|ter\b/i.test(k)).map(([k, v]) => `${k} ${show(v)}`).join(", ") || "no fee field"} · ${url ?? "no page address"}`);
  }
}
for (const t of ["EWJ", "ACWI"]) {
  const url = pageOf.get(t);
  if (!url) { console.log(`\n  ${t}: no page address`); continue; }
  const p = await fundPage(`iShares: ${t}'s page (fee, index, tracking difference, files)`, url, "ishares.com");
  if (!p.ok) continue;
  const links = linksOf(p.html, p.final);
  const h = links.find((l) => /fileType=csv/i.test(l.href) && /holding/i.test(l.href)), f = links.find((l) => /fileType=xls/i.test(l.href) && /_fund|dataType=fund/i.test(l.href));
  if (h) await csvFile(`${t}'s holdings file`, h.href); else console.log(`  ${t}: no holdings file linked`);
  if (f) await bookFile(`${t}'s fund-data file (NAV history, distributions)`, f.href); else console.log(`  ${t}: no fund-data file linked`);
}
{
  const url = pageOf.get("AGG");
  if (url) {
    const p = await fundPage("iShares: AGG's page and holdings (the columns of a bond fund's file)", url, "ishares.com");
    const h = p.ok ? linksOf(p.html, p.final).find((l) => /fileType=csv/i.test(l.href) && /holding/i.test(l.href)) : undefined;
    if (h) await csvFile("AGG's holdings file", h.href);
  }
}
for (const t of ["HEWJ", "EEM", "EPP", "IVV", "IEUR"]) {
  const url = pageOf.get(t);
  if (url) await fundPage(`iShares: ${t}'s page (fee, index, tracking difference)`, url, "ishares.com");
  else console.log(`\n  ${t}: no page address (not in the product list)`);
}
head("1b. iShares (UK): the London Global Aggregate fund, its USD-hedged class");
{
  const r = await look(`${ISH}/uk/individual/en/product-screener/product-screener-v3.1.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/uk/product-screener/ishares-product-screener-backend-config&siteEntryPassthrough=true`, { headers: { accept: "application/json" }, show: 0, timeoutMs: 60000 });
  await pause(GAP);
  let j: unknown = null;
  try { j = JSON.parse(r.text); } catch { /* below */ }
  const items = j && typeof j === "object" ? Object.values(j as Record<string, unknown>).filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];
  const hits = items.filter((o) => /global aggregate/i.test(String(o.fundName ?? "")) && /usd hedged/i.test(JSON.stringify(o).slice(0, 4000)));
  console.log(`  ${items.length} products; Global Aggregate with a USD-hedged class: ${hits.slice(0, 4).map((o) => `${o.fundName ?? "–"} (${o.localExchangeTicker ?? "–"})`).join(" · ") || "none found"}`);
  const url = hits.map((o) => Object.values(o).find((v) => typeof v === "string" && /\/products\/\d+/.test(v)) as string | undefined).find(Boolean);
  if (url) {
    const u = new URL(url, ISH); u.searchParams.set("switchLocale", "y"); u.searchParams.set("siteEntryPassthrough", "true");
    const p = await fundPage("iShares (UK): the London Global Aggregate fund's page", u.toString(), "ishares.com");
    const h = p.ok ? linksOf(p.html, p.final).find((l) => /fileType=csv/i.test(l.href) && /holding/i.test(l.href)) : undefined;
    if (h) await csvFile("the London fund's holdings file", h.href); else console.log("  no holdings file linked");
  } else console.log("  no page address: the fund's profile file waits for its address");
}

// ---- 2. the other issuers ----
head("2. State Street: SPY's daily holdings workbook and its page");
await bookFile("SPY's holdings", "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx", /holdings/i);
await fundPage("State Street: SPY's page (fee, index, NAV history, distributions)", "https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy", "ssga.com");
head("2b. Vanguard: BNDW (fee; its stated index, before the 'near index' label is used)");
{
  const r = await look("https://investor.vanguard.com/investment-products/etfs/profile/api/BNDW/profile", { headers: { accept: "application/json" }, show: 0, timeoutMs: 45000 });
  await pause(GAP);
  let j: unknown = null;
  try { j = JSON.parse(r.text); } catch { /* below */ }
  const flat: string[] = [];
  const walk = (o: unknown, path: string) => { if (flat.length > 400 || o == null) return; if (typeof o === "object") { for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k); } else flat.push(`${path}=${String(o).slice(0, 100)}`); };
  walk(j, "");
  console.log(`  ${flat.length} fields; those on the fee, the index and the NAV: ${flat.filter((x) => /expense|fee|benchmark|index|nav|inception|yield|duration/i.test(x)).slice(0, 20).join(" · ") || "none"}`);
}
await fundPage("Vanguard: BNDW's page", "https://investor.vanguard.com/investment-products/etfs/profile/bndw", "vanguard.com");
await fundPage("Nomura (NEXT FUNDS): 1306.T, the TOPIX fund (fee, index, holdings and NAV files)", "https://nextfunds.jp/lineup/1306/", "nextfunds.jp");
await fundPage("Nomura (NEXT FUNDS): 1321.T, the Nikkei 225 fund", "https://nextfunds.jp/lineup/1321/", "nextfunds.jp");
await fundPage("Xtrackers (DWS): DBJP, MSCI Japan hedged to USD", "https://etf.dws.com/en-us/DBJP-xtrackers-msci-japan-hedged-equity-etf/", "dws.com");
await fundPage("MAXIS (Mitsubishi UFJ Asset Management): 2559.T, MSCI ACWI in yen", "https://maxis.mukam.jp/etf/2559/", "mukam.jp");

// ---- 3. JPX ----
const JPX = "https://www.jpx.co.jp";
head("3. JPX: the TOPIX weight file (candidate address)");
await csvFile("topixweight_j.csv", `${JPX}/automation/markets/indices/topix/files/topixweight_j.csv`, "shift_jis");
{
  const p = await fundPage("JPX: TOPIX's page (its close and total-return files)", `${JPX}/markets/indices/topix/index.html`, "jpx.co.jp");
  const f = p.ok ? linksOf(p.html, p.final).filter((l) => /\.(csv|xlsx?)(\?|$)/i.test(l.href)) : [];
  console.log(`  ${f.length} data files${f.length ? `: ${f.slice(0, 8).map((l) => `${l.text.slice(0, 30)} -> ${masked(l.href)}`).join(" · ")}` : ""}`);
  const tr = f.find((l) => /配当|total|tr\b|トータル/i.test(l.text + l.href)) ?? f[0];
  if (tr) { if (/\.csv/i.test(tr.href)) await csvFile(tr.text || "the file", tr.href, "shift_jis"); else await bookFile(tr.text || "the file", tr.href); }
}
{
  const p = await fundPage("JPX: the list of listed ETFs (a fund on MSCI Japan itself; 2559's index)", `${JPX}/equities/products/etfs/issues/01.html`, "jpx.co.jp");
  const x = p.ok ? linksOf(p.html, p.final).find((l) => /\.xlsx?(\?|$)/i.test(l.href)) : undefined;
  if (x) await bookFile("the ETF list", x.href, /^$/, /MSCI|2559|1306|1321|1475/);
  else console.log("  no workbook linked");
}
{
  head("JPX: the listed-issue workbook the server reads (misc/01.html, data_j.xls): its header row");
  const p = await get(`${JPX}/markets/statistics-equities/misc/01.html`);
  const href = p.ok ? p.html.match(/href="([^"]*data_j\.xlsx?)"/)?.[1] : undefined;
  if (href) {
    const rows = await bookFile("data_j", new URL(href, p.final).toString(), /^$/);
    const h = (rows?.[0] ?? []).map(cellText);
    console.log(`  header: ${h.join(" | ") || "–"}; 33業種区分 ${h.includes("33業種区分") ? "IS there" : "is NOT there"}; 33業種コード ${h.includes("33業種コード") ? "is there" : "is not there"}`);
  } else console.log("  the workbook's link was not found");
}
{
  head("JPX: its terms of use and robots.txt (for the record; the owner's P4)");
  const p = await get(`${JPX}/term-of-use/index.html`);
  if (p.ok) { console.log(`  title: ${titleOf(p.html) || "–"}`); printLines(textLines(p.html), TERMS_WANT, 20); const g = textLines(p.html).filter((l) => GATE.test(l)); console.log(`  lines on automated reading or personal use, to be read against the owner's P4 (its two extracts restrict commercial use only): ${g.length ? g.slice(0, 4).join(" · ") : "none found"}`); }
  await robots(JPX, ["/automation/markets/indices/topix/files/", "/markets/indices/topix/", "/equities/products/etfs/issues/", "/markets/statistics-equities/misc/"]);
  await pause(GAP);
}

// ---- 4. Nikkei ----
await fundPage("Nikkei: the Nikkei 225 Total Return's page (for the record: not a long-only benchmark now)", "https://indexes.nikkei.co.jp/nkave/index/profile?idx=nk225tr", "nikkei.co.jp");
{
  head("Nikkei: its licence page and robots.txt");
  const p = await get("https://indexes.nikkei.co.jp/nkave/license");
  if (p.ok) { console.log(`  title: ${titleOf(p.html) || "–"}`); printLines(textLines(p.html), /ライセンス|license|契約|ウェブサイト|website|アプリ|app|個人|personal|商用|commercial|表示|display/i, 15); }
  await robots("https://indexes.nikkei.co.jp", ["/nkave/index/profile", "/nkave/archives/data"]);
  await pause(GAP);
}

// ---- 5. Cboe ----
head("5. Cboe: the VIX, VIX6M and VXN daily history files");
for (const f of ["VIX_History.csv", "VIX6M_History.csv", "VXN_History.csv"]) {
  const r = await look(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${f}`, { show: 0, timeoutMs: 60000 });
  await pause(GAP);
  if (r.ok) { const ls = r.text.split(/\r?\n/).filter((l) => l.trim()); console.log(`  ${f}: ${ls.length} lines; header ${ls[0] ?? "–"}; first ${ls[1] ?? "–"}; newest ${ls[ls.length - 1] ?? "–"}`); }
}
{
  const p = await fundPage("Cboe: its historical data page (where the files are offered) and its terms link", "https://www.cboe.com/tradable_products/vix/vix_historical_data/", "cboe.com");
  if (p.ok) printLines(textLines(p.html), /terms|use|license|historical|download/i, 8);
  await robots("https://cdn.cboe.com", ["/api/global/us_indices/daily_prices/"]);
  await pause(GAP);
}

// ---- 6. MSCI ----
await fundPage("6. MSCI: the end-of-day index data page (status only; not used: the owner said to mirror)", "https://www.msci.com/end-of-day-data-search", "msci.com");

// ---- 7. the issuers' terms and robots ----
head("7. Each issuer's terms (the page its own pages link) and robots.txt, for the record");
for (const [site, origin, paths] of [
  ["ishares.com", ISH, ["/us/products/", "/uk/individual/en/products/", "/us/product-screener/"]],
  ["ssga.com", "https://www.ssga.com", ["/us/en/intermediary/etfs/", "/us/en/intermediary/library-content/products/fund-data/"]],
  ["vanguard.com", "https://investor.vanguard.com", ["/investment-products/etfs/profile/"]],
  ["nextfunds.jp", "https://nextfunds.jp", ["/lineup/"]],
  ["dws.com", "https://etf.dws.com", ["/en-us/"]],
  ["mukam.jp", "https://maxis.mukam.jp", ["/etf/"]],
  ["cboe.com", "https://www.cboe.com", ["/tradable_products/vix/vix_historical_data/"]],
] as Array<[string, string, string[]]>) {
  console.log(`\n-- ${site}`);
  const t = terms.get(site);
  if (t) {
    console.log(`  terms: ${t.text.slice(0, 60)} -> ${masked(t.href)}`);
    const p = await get(t.href);
    if (p.ok) { printLines(textLines(p.html), TERMS_WANT, 15); const g = textLines(p.html).filter((l) => GATE.test(l)); console.log(`  lines on automated reading or personal use, to be read against the owner's P4 (its two extracts restrict commercial use only): ${g.length ? g.slice(0, 4).map((l) => l.slice(0, 300)).join(" · ") : "none found"}`); }
  } else console.log("  no terms link was found on the pages read");
  await robots(origin, paths);
  await pause(GAP);
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
