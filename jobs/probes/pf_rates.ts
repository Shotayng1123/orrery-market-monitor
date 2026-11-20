// The paper portfolio's probe of rates and fixings (P-0: C/portfolio-plan.md §3.1 item 2), for P-3 (two cash balances
// per currency), P-7a (factor history from 1 Jan 2013), P-8a (cash in each G10 currency), P-8b (NDF fixings) and P-15
// (cash Treasuries in repo). Official sources, no key; read-only, nothing written.
// Already read, so not asked again: SOFR and EFFR (us_liquidity.log l.9, l.18), €STR (ecb_boj_liquidity.log l.10),
// TONA as the BoJ's STRDCLUCON (boj_api.log l.106–110), the BIS policy rates (bis_policy_more.log).
// It prints:
//   1. SONIA, the Bank of England's IADB series IUDSOIA (the database the server reads for Bank Rate);
//   2. the ECB's euro reference rates (EXR) for USD, JPY, GBP and CHF: an official cross-check of the 17:00 New York FX
//      mark, set in the European afternoon (a check, not the mark: §3);
//   3. the New York Fed's TGCR and BGCR (the general-collateral rates beside SOFR), and the rate fields of the
//      overnight reverse repo results, which the probe of 19 Nov printed as amounts only (us_liquidity.log l.31–35);
//   4. JSDA's Tokyo Repo Rate: its page, format and terms, status only (it is not used: §2.19);
//   5. BCB's PTAX (USD/BRL) and FBIL's USD/INR reference rate (with the RBI's archive of it): NDF fixings for P-8b;
//   6. FedInvest's end-of-day prices of Treasury securities (TreasuryDirect, the Bureau of the Fiscal Service), for
//      P-13 and P-15: the form, then one day's prices;
//   7. JPX's settlement prices for OSE's futures (P-5, under the owner's P4 "personal use"): the page, the file's form
//      and whether it carries a daily volume;
//   8. the Treasury's par curve for 2013 and MOF's whole JGB file (the server reads it for its backfill, jgbcme_all.csv):
//      do they reach 1 Jan 2013 (BP-4)?
// Requests: at most 19, 1 s apart, to bankofengland.co.uk (1), data-api.ecb.europa.eu (1), markets.newyorkfed.org (3),
// jsda.or.jp (4), olinda.bcb.gov.br (1), fbil.org.in (1), rbi.org.in (1), treasurydirect.gov (2), jpx.co.jp (3),
// home.treasury.gov (1), mof.go.jp (1).
// Runtime: deno (JPX's file may be a zip or a workbook, opened with the packages the server uses; under node it is
// only measured).
//   Actions > source-probe > Run workflow: probe = pf_rates, runtime = deno
import { bytes, head, linksOf, look, masked, page, pause, printLines, requestsMade, robots, rowText, textLines, titleOf, unzipped, workbook } from "./lib.ts";

const GAP = 1000, MAX = 19;
const t0 = Date.now(), now = new Date();
const J = (t: string): unknown => { try { return JSON.parse(t); } catch { return null; } };
const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ago = (days: number) => new Date(now.getTime() - days * 86400e3);
/** The last weekday before today (a US holiday is not known here). */
const lastBusiness = (() => { const d = ago(1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1); return d; })();
console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`);

head("1. SONIA: the Bank of England's IADB series IUDSOIA, this month and last");
{
  const from = ago(40);
  const r = await look(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${String(from.getUTCDate()).padStart(2, "0")}/${mon[from.getUTCMonth()]}/${from.getUTCFullYear()}&Dateto=now&SeriesCodes=IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`, { show: 0, timeoutMs: 60000 });
  const ls = r.text.split(/\r?\n/).filter((l) => l.trim());
  if (r.ok) console.log(`  ${ls.length} lines; header ${ls[0] ?? "–"}; the last five: ${ls.slice(-5).join(" · ")}`);
  await pause(GAP);
}

head("2. The ECB's euro reference rates (EXR): USD, JPY, GBP, CHF, the last three days");
{
  const r = await look("https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY+GBP+CHF.EUR.SP00.A?format=csvdata&lastNObservations=3", { headers: { accept: "text/csv" }, show: 0, timeoutMs: 60000 });
  const ls = r.text.split(/\r?\n/).filter((l) => l.trim()), h = (ls[0] ?? "").split(",");
  const iC = h.indexOf("CURRENCY"), iT = h.indexOf("TIME_PERIOD"), iV = h.indexOf("OBS_VALUE");
  if (r.ok) console.log(`  ${ls.length - 1} rows: ${ls.slice(1).map((l) => { const c = l.split(","); return `${c[iC]} ${c[iT]} ${c[iV]}`; }).join(" · ")}`);
  await pause(GAP);
}

head("3. The New York Fed: TGCR and BGCR, the last five publications; the overnight reverse repo's rate fields");
for (const rate of ["tgcr", "bgcr"]) {
  const r = await look(`https://markets.newyorkfed.org/api/rates/secured/${rate}/last/5.json`, { headers: { accept: "application/json" }, show: 0 });
  const rows = ((J(r.text) as { refRates?: Array<Record<string, unknown>> } | null)?.refRates ?? []);
  for (const x of rows) console.log(`  ${rate.toUpperCase()} ${x.effectiveDate}: ${x.percentRate}% (1st ${x.percentPercentile1 ?? "–"}, 99th ${x.percentPercentile99 ?? "–"}), volume ${x.volumeInBillions ?? "–"}bn`);
  if (rows[0]) console.log(`  fields: ${Object.keys(rows[0]).join(", ")}`);
  await pause(GAP);
}
{
  const r = await look("https://markets.newyorkfed.org/api/rp/reverserepo/all/results/last/2.json", { headers: { accept: "application/json" }, show: 0 });
  const ops = ((J(r.text) as { repo?: { operations?: Array<Record<string, unknown>> } } | null)?.repo?.operations ?? []);
  for (const o of ops) {
    const d = ((o.details as Array<Record<string, unknown>> | undefined) ?? []);
    console.log(`  ${o.operationDate} ${o.operationType} ${o.term ?? ""}: ${d.length} detail rows; ${d.map((x) => Object.entries(x).filter(([k]) => !/^amt|Amt/.test(k)).map(([k, v]) => `${k} ${v}`).join(", ")).join(" | ")}`);
  }
  await pause(GAP);
}

head("4. JSDA's Tokyo Repo Rate (status, format and terms only; not used)");
{
  const base = "https://www.jsda.or.jp/shiryoshitsu/toukei/";
  const ix = await page(base);
  await pause(GAP);
  const repo = ix.ok ? linksOf(ix.html, ix.final).filter((l) => /レポ|repo/i.test(l.text + " " + l.href)) : [];
  console.log(`  links naming repo on the statistics index: ${repo.slice(0, 6).map((l) => `${l.text.slice(0, 40)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
  let terms = ix.ok ? linksOf(ix.html, ix.final).find((l) => /利用規約|ご利用にあたって|サイトのご利用|サイトポリシー|免責|著作権|terms of use|site policy/i.test(l.text)) : undefined;
  if (repo[0]) {
    const p = await page(repo[0].href);
    await pause(GAP);
    if (p.ok) {
      console.log(`  title: ${titleOf(p.html) || "–"}`);
      printLines(textLines(p.html), /レポ|Repo|公表|時点|毎営業日|T\/N|S\/N|1W|翌日物|レート/i, 12);
      const files = linksOf(p.html, p.final).filter((l) => /\.(csv|xlsx?|pdf|zip)(\?|$)/i.test(l.href));
      console.log(`  ${files.length} file links${files.length ? `; first five: ${files.slice(0, 5).map((l) => masked(l.href)).join(", ")}` : ""}`);
      terms = terms ?? linksOf(p.html, p.final).find((l) => /利用規約|ご利用にあたって|サイトのご利用|サイトポリシー|免責|著作権|terms of use|site policy/i.test(l.text));
    }
  }
  if (terms) {
    console.log(`  the terms page: ${terms.text} -> ${masked(terms.href)}`);
    const tp = await page(terms.href);
    await pause(GAP);
    if (tp.ok) printLines(textLines(tp.html), /転載|複製|二次利用|商用|営利|自動|クローラ|robot|出所|出典|引用|禁止/i, 15);
  } else console.log("  no terms link found on the pages read");
  await robots("https://www.jsda.or.jp", ["/shiryoshitsu/toukei/"]);
  await pause(GAP);
}

head("5. NDF fixings: BCB's PTAX (USD/BRL) for the last ten days; FBIL's USD/INR reference rate");
{
  const d = (x: Date) => `${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}-${x.getUTCFullYear()}`;
  const r = await look(`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${d(ago(10))}'&@dataFinalCotacao='${d(now)}'&$top=100&$format=json`, { headers: { accept: "application/json" }, show: 0 });
  const v = ((J(r.text) as { value?: Array<Record<string, unknown>> } | null)?.value ?? []);
  console.log(`  PTAX: ${v.length} days${v.length ? `; the last three: ${v.slice(-3).map((x) => `${x.dataHoraCotacao} buy ${x.cotacaoCompra} sell ${x.cotacaoVenda}`).join(" · ")}` : ""}`);
  await pause(GAP);
  const f = await page("https://www.fbil.org.in/");
  await pause(GAP);
  if (f.ok) { console.log(`  FBIL: title ${titleOf(f.html) || "–"}; ${textLines(f.html).length} lines of text (a page built by scripts shows few)`); printLines(textLines(f.html), /reference rate|USD|INR|rupee/i, 6); }
  const rbi = await page("https://www.rbi.org.in/Scripts/ReferenceRateArchive.aspx");
  await pause(GAP);
  if (rbi.ok) { console.log(`  RBI: title ${titleOf(rbi.html) || "–"}`); printLines(textLines(rbi.html), /US Dollar|USD|Reference Rate|FBIL/i, 8); }
}

head("6. FedInvest (TreasuryDirect): end-of-day prices of Treasury securities, the form and one day");
{
  const sel = await page("https://www.treasurydirect.gov/GA-FI/FedInvest/selectSecurityPriceDate");
  await pause(GAP);
  if (sel.ok) {
    const form = sel.html.match(/<form\b[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
    const fields = [...(form?.[2] ?? "").matchAll(/<(input|select)\b([^>]*)>/gi)].map((m) => ({ tag: m[1].toLowerCase(), name: m[2].match(/name=["']([^"']+)["']/i)?.[1] ?? "", type: m[2].match(/type=["']([^"']+)["']/i)?.[1] ?? "", value: m[2].match(/value=["']([^"']*)["']/i)?.[1] ?? "" })).filter((x) => x.name);
    console.log(`  title ${titleOf(sel.html) || "–"}; form action ${form?.[1] ?? "none"}; fields: ${fields.map((x) => `${x.name}${x.type ? ` (${x.type}${x.value ? ` "${x.value}"` : ""})` : ` (${x.tag})`}`).join(", ") || "none"}`);
    if (form) {
      const body = new URLSearchParams(), D = lastBusiness;
      for (const x of fields) {
        if (/month/i.test(x.name)) body.set(x.name, String(D.getUTCMonth() + 1));
        else if (/day/i.test(x.name)) body.set(x.name, String(D.getUTCDate()));
        else if (/year/i.test(x.name)) body.set(x.name, String(D.getUTCFullYear()));
        else if (x.type === "hidden") body.set(x.name, x.value);
      }
      const submit = fields.find((x) => x.type === "submit" && /csv/i.test(x.value)) ?? fields.find((x) => x.type === "submit");
      if (submit) body.set(submit.name, submit.value);
      console.log(`  asking for ${D.toISOString().slice(0, 10)} with ${[...body.keys()].join(", ")}`);
      const res = await page(new URL(form[1], sel.final).toString(), { method: "POST", body: body.toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
      await pause(GAP);
      if (res.ok) {
        const csv = /csv|text\/plain/i.test(res.type) || /^[A-Z0-9]{9},/m.test(res.html);
        const ls = csv ? res.html.split(/\r?\n/).filter((l) => l.trim()) : textLines(res.html).filter((l) => /\|/.test(l));
        console.log(`  ${csv ? "CSV" : "an HTML table"}: ${ls.length} lines; the first four: ${ls.slice(0, 4).join(" · ")}`);
      }
    }
  }
}

head("7. JPX: settlement prices of OSE's futures and options (P-5, personal use): the page and its newest file");
{
  let p = await page("https://www.jpx.co.jp/markets/derivatives/settlement-price/index.html");
  await pause(GAP);
  if (!p.ok) { p = await page("https://www.jpx.co.jp/english/markets/derivatives/settlement-price/index.html"); await pause(GAP); }
  if (p.ok) {
    console.log(`  title ${titleOf(p.html) || "–"}`);
    printLines(textLines(p.html), /清算値段|Settlement|公表|時点|取引高|出来高|Volume/i, 8);
    const files = linksOf(p.html, p.final).filter((l) => /\.(csv|zip|xlsx?)(\?|$)/i.test(l.href));
    console.log(`  ${files.length} data files${files.length ? `; first five: ${files.slice(0, 5).map((l) => `${l.text.slice(0, 30)} -> ${masked(l.href)}`).join(" · ")}` : ""}`);
    const pick = files.find((l) => /清算|settle|値段|price/i.test(l.text + " " + l.href)) ?? files[0];
    if (pick) {
      files.unshift(pick);   // the file read: a settlement file by its name if one is linked, else the first
      const b = await bytes(files[0].href);
      await pause(GAP);
      if (b.data) {
        let csvText: string | null = null;
        if (/\.zip(\?|$)/i.test(files[0].href)) {
          const z = await unzipped(b.data);
          if (z) { const [name, data] = Object.entries(z)[0] ?? ["", new Uint8Array()]; console.log(`  the zip holds ${Object.keys(z).length} files; the first ${name} (${data.length} bytes)`); csvText = new TextDecoder(/\.csv$/i.test(name) ? "shift_jis" : "utf-8").decode(data); }
        } else if (/\.csv(\?|$)/i.test(files[0].href)) csvText = new TextDecoder("shift_jis").decode(b.data);
        else { const wb = await workbook(b.data); if (wb) for (const sh of wb.slice(0, 2)) { console.log(`  sheet "${sh.name}": ${sh.rows.length} rows`); for (const r of sh.rows.slice(0, 4)) console.log(`    ${rowText(r)}`); } }
        if (csvText) {
          const ls = csvText.split(/\r?\n/).filter((l) => l.trim());
          console.log(`  ${ls.length} lines; the first four: ${ls.slice(0, 4).map((l) => l.slice(0, 200)).join(" · ")}`);
          console.log(`  a volume column (取引高, 出来高, Volume): ${ls.slice(0, 5).some((l) => /取引高|出来高|volume/i.test(l)) ? "yes" : "not in the first lines"}`);
        }
      }
    }
  }
}

head("8. Reach back to 2013 (BP-4): the Treasury's par curve for 2013; MOF's whole JGB file");
{
  const r = await look("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2013/all?type=daily_treasury_yield_curve&field_tdr_date_value=2013&page&_format=csv", { show: 0, timeoutMs: 60000 });
  const ls = r.text.trim().split(/\r?\n/);
  if (r.ok) console.log(`  2013: ${ls.length - 1} rows; columns ${ls[0]}; newest ${ls[1] ?? "–"}; oldest ${ls[ls.length - 1] ?? "–"}`);
  await pause(GAP);
  const m = await look("https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv", { show: 0, timeoutMs: 90000 });
  const ml = m.text.trim().split(/\r?\n/);
  if (m.ok) console.log(`  jgbcme_all.csv: ${ml.length} lines; the first three ${ml.slice(0, 3).join(" · ")}; the last ${ml[ml.length - 1] ?? "–"}; the first line of 2013: ${ml.find((l) => /^(2013|H25)[/.-]/.test(l)) ?? "none found"}`);
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
