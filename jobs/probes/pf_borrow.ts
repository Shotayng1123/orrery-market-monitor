// The paper portfolio's probe of borrow and short-side sources, the second run (P-0b: C/portfolio-plan.md §3.1b item
// 4): only what the run of 20 Nov 2026 did not read (C/probes/pf_borrow.log). Read then and not asked again: Nasdaq
// Trader's Reg SHO file, Interactive Brokers' margin-rate and short-sale-cost pages. Dropped by the owner's answer of
// 21 Nov 2026: JPX's 品貸料 workbook and its margin balances by name. Read-only, no key, nothing written.
//   1. NYSE's threshold-securities download, asked with a date and a market (with neither it answered 500, l.22): the
//      page's own choices of market are read first, then NYSE's terms by the page's own link (they may stand on its
//      group's site); the date is the last weekday. The download is asked only if the terms were read and do not bar it.
//   2. Interactive Brokers' short-securities availability page, once (the first run read it twice, l.94 and l.124):
//      the links and addresses on it that name its lists of shortable stocks by country (on the web, or by FTP), its
//      table of countries, and whether it states a login. THIS PROBE SENDS NO LOGIN AND NEVER PRINTS ONE: job logs are
//      public (a line that names a login is counted, not printed; an address is printed without the user and password
//      it may carry). Then the broker's terms by its site's own link. Then, only if a list is served on the web with
//      no login, robots.txt allows it and the terms do not bar automated reading: one country's list (status, header,
//      rows, the time it was made). The FTP server's greeting is read only for a host one of its pages names, only
//      under the same two conditions, and then with no USER and no PASS (OQ-2: a file behind the broker's published
//      login waits for the owner's secret).
//   3. JSF (日本証券金融), which sets Tokyo's lending fees (品貸料) and suspensions (申込停止): its home page's menu in
//      full (on 20 Nov no link's text named lending, l.164), its terms, the pages its menu gives on 貸借取引, and
//      the data site those pages name, if they name one: that site's robots.txt, home, terms and one page; one file
//      only if its terms do not bar it. (A's candidate, not checked: JSF publishes them on a data site of its own.)
// A site's robots.txt and terms are read before any data file of it. A site whose terms bar automated reading, or any
// re-use whatever the purpose, keeps its files unread here: that finding goes to the owner (as JPX's, Nomura's and
// Cboe's did on 21 Nov).
// Requests: at most 24, 1.5 s apart: nyse.com (6), interactivebrokers.com (5, and one FTP greeting only if a page
// names a host), jsf.co.jp (6), and JSF's data site if its pages name one (6); a site's terms take a second request
// where its first "legal" page is only a hub. A robots.txt that answers 429 is asked once more after the wait it
// names (60 s at most), so 28 at the very most.
// Runtime: deno (the FTP greeting uses node:net, which Deno provides; node runs it too).
//   Actions > source-probe > Run workflow: probe = pf_borrow, runtime = deno
import { connect } from "node:net";
import { bytes, counted, head, linksOf, look, masked, page, pause, printLines, readTerms, requestsMade, robots, siteOf, textLines, titleOf, type Page } from "./lib.ts";

const GAP = 1500, MAX = 24;
const t0 = Date.now(), now = new Date(t0);
/** Words of a login: a line or a greeting that carries one is never printed. */
const LOGIN = /user ?name|username|user id|userid|\buser\b|login|log in|log-in|password|passwd|\bpwd\b|credential|anonymous|guest|ログイン|パスワード|ユーザー/i;
/** On a terms page: a line on FTP or a password, or an address carrying a user, is never printed. */
const NEVER_TERMS = /password|passwd|\bpwd\b|ftp|[a-z]+:\/\/[^\/\s@]+@/i;
async function get(url: string): Promise<Page> { const p = await page(url, { timeoutMs: 45000 }); await pause(GAP); return p; }
const lastWeekday = (() => { const d = new Date(t0 - 86400e3); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1); return d; })();
console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`);

// ---- 1. NYSE's threshold list, with a date and a market ----
head("1. NYSE's Reg SHO threshold list: the page's choices of market, then the download with a date and a market");
{
  const NYSE = "https://www.nyse.com", api = "/api/regulatory/threshold-securities/download";
  const rb = await robots(NYSE, ["/regulation/threshold-securities", api]);
  await pause(GAP);
  if (!rb.allows("/regulation/threshold-securities")) console.log("  not asked: robots.txt holds the page");
  else {
    const p = await get(`${NYSE}/regulation/threshold-securities`);
    let markets: string[] = [], terms = { read: false, barred: false };
    if (p.ok) {
      const selects = [...p.html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].map((m) => ({ name: m[1].match(/\b(?:name|id)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "", options: [...m[2].matchAll(/<option\b[^>]*?(?:value\s*=\s*["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => ({ value: (o[1] ?? o[2]).trim(), text: o[2].replace(/<[^>]+>/g, "").trim() })) }));
      console.log(`  title: ${titleOf(p.html) || "–"}; ${selects.length} choice lists in the page's HTML${selects.length ? `: ${selects.map((s) => `${s.name || "(unnamed)"} = ${s.options.slice(0, 8).map((o) => `"${o.value}"${o.text && o.text !== o.value ? ` (${o.text})` : ""}`).join(", ")}`).join(" · ")}` : " (the choices are drawn by scripts)"}`);
      markets = (selects.find((s) => /market/i.test(s.name)) ?? selects.find((s) => s.options.some((o) => /NYSE/i.test(o.value + o.text))))?.options.map((o) => o.value).filter((v) => v && !/^(all|select)/i.test(v)) ?? [];
      // a market named in the page's own scripts, where no list is in its HTML
      if (!markets.length) markets = [...new Set([...p.html.matchAll(/["'](NYSE(?: (?:Arca|American|National|Chicago|Texas))?)["']/g)].map((m) => m[1]))].slice(0, 5);
      const dl = linksOf(p.html, p.final).filter((l) => /threshold/i.test(l.href) && /download|api/i.test(l.href));
      console.log(`  download links: ${dl.slice(0, 3).map((l) => `${l.text.slice(0, 20)} -> ${masked(l.href)}`).join(" · ") || "none in the page's HTML"}; markets found on the page: ${markets.join(", ") || "none"}`);
      console.log("  NYSE's terms, by the page's own link (no log holds them):");
      terms = await readTerms(p, { allows: (u) => rb.allows(u), gapMs: GAP, never: NEVER_TERMS });
    }
    const market = markets[0] ?? "NYSE", iso = lastWeekday.toISOString().slice(0, 10), us = `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
    if (!markets.length) console.log("  no market was found on the page: \"NYSE\" is asked, a candidate");
    if (!rb.allows(api)) console.log("  not asked: robots.txt holds the download's path");
    else if (terms.barred) console.log("  the download is NOT asked: NYSE's terms carry a line that bars automated reading or re-use (above): FOR THE OWNER");
    else if (!terms.read) console.log("  the download is NOT asked: NYSE's terms were not read (no link to them was found on the page, or their page did not answer), and a site's terms are read before its data file: FOR THE OWNER (a list the exchange publishes under Regulation SHO; its page offers the download)");
    else for (const date of [iso, us]) {
      const r = await look(`${NYSE}${api}?selectedDate=${encodeURIComponent(date)}&market=${encodeURIComponent(market)}`, { show: 0 });
      await pause(GAP);
      if (!r.ok) { console.log(`  with the date written ${date}: not served${r.text ? `: ${masked(JSON.stringify(r.text.slice(0, 160)))}` : ""}`); continue; }
      const ls = r.text.split(/\r?\n/).filter((l) => l.trim());
      console.log(`  with the date written ${date} and the market ${market}: ${r.type ?? "no type"}, ${ls.length} lines; the first three: ${ls.slice(0, 3).map((l) => masked(l.slice(0, 160))).join(" · ")}; the last: ${masked((ls[ls.length - 1] ?? "–").slice(0, 160))}`);
      break;
    }
  }
}

// ---- 2. Interactive Brokers: the availability page, its terms, a list on the web ----
const IB = "https://www.interactivebrokers.com", AVAIL = "/en/trading/short-securities-availability.php";
const ftpHosts = new Set<string>();
let loginStated = false, ibTermsRead = false, ibBarred = false;
head("2. Interactive Brokers: the short-securities availability page, once (no login is sent or printed)");
{
  const rb = await robots(IB, [AVAIL]);
  await pause(GAP);
  const p = rb.allows(AVAIL) ? await get(IB + AVAIL) : null;
  if (!p) console.log("  not asked: robots.txt holds the page");
  else if (p.ok) {
    const ls = textLines(p.html);
    console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text`);
    // its table of countries: the lines after the table's heading
    const at = ls.findIndex((l) => /^Country\b/i.test(l));
    if (at >= 0) { console.log("  the table of countries (40 lines at most; a line that names a login is not printed):"); for (const l of ls.slice(at, at + 40)) if (!LOGIN.test(l) && !/ftp/i.test(l)) console.log(`  | ${masked(l.slice(0, 200))}`); }
    else printLines(ls, /country|countries|shortable|listed for trading|download|prepared lists/i, 15, new RegExp(`${LOGIN.source}|ftp`, "i"));
    // every link that names the lists, a file or a download; the rest are counted
    const all = linksOf(p.html, p.final), about = all.filter((l) => /short|borrow|loan|availab|ftp|download|list|\.txt|\.csv|countr|slb|stock/i.test(`${l.text} ${l.href}`));
    console.log(`  ${all.length} links on the page; ${about.length} name lists, files, downloads or lending (60 at most printed; an address is printed without any user and password in it):`);
    for (const l of about.slice(0, 60)) console.log(`    ${LOGIN.test(l.text) ? "(a text that names a login: not printed)" : l.text.slice(0, 60) || "(no text)"} -> ${masked(l.href)}`);
    // addresses of lists in the page's scripts and attributes, not only in its links
    const plain = p.html.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\/\s@"'<>]+@/gi, "$1");
    const hosts = [...new Set([...plain.matchAll(/\bftp[0-9]*\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi)].map((m) => m[0].toLowerCase()))];
    for (const h of hosts) ftpHosts.add(h);
    const files = [...new Set([...plain.matchAll(/(?:https?:)?\/\/[^\s"'<>]+\.(?:txt|csv)\b|["'](\/[^\s"'<>]+\.(?:txt|csv))["']/gi)].map((m) => m[1] ?? m[0]))].slice(0, 12);
    console.log(`  in the page's source: FTP hosts named: ${hosts.join(", ") || "none"}; addresses ending .txt or .csv: ${files.map((x) => masked(x)).join(" · ") || "none"}`);
    const near = ls.filter((_, i) => ls.some((l, k) => /ftp/i.test(l) && Math.abs(i - k) <= 3));
    const user = near.some((l) => /user ?name|username|user id|userid|login|log in|\buser\b/i.test(l)) || /ftp:\/\/[^\s"'<>@\/]+@/i.test(p.html), pass = near.some((l) => /password|passwd|\bpwd\b/i.test(l));
    loginStated = user || pass;
    console.log(`  lines on FTP: ${ls.filter((l) => /ftp/i.test(l)).length}; within three lines of them, a user name stated: ${user ? "yes" : "no"}; a password stated: ${pass ? "yes" : "no"} (neither value printed)`);

    head("2b. Interactive Brokers: its terms, by its site's own link");
    const other = all.filter((l) => /interactivebrokers\.com/i.test(l.href) && /disclosure|legal|notice|agreement|terms/i.test(l.text) && l.text.length < 80);
    console.log(`  links that name terms, disclosures or legal notices: ${other.slice(0, 8).map((l) => `${l.text.slice(0, 40)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
    const t = await readTerms(p, { allows: (u) => rb.allows(u), gapMs: GAP, never: NEVER_TERMS });
    const barred = t.barred, termsRead = t.read;
    ibTermsRead = termsRead; ibBarred = barred;
    if (!termsRead) console.log("  the broker's terms were not read: its lists stay unread by this probe (the owner's condition of 20 Nov: used only after a probe has read the file and its terms)");

    head("2c. Interactive Brokers: one country's list, only if it is served on the web with no login");
    const web = [...about.map((l) => l.href), ...files.map((x) => { try { return new URL(x, p.final).toString(); } catch { return ""; } })].filter((h) => /^https:\/\/[^\/@]*interactivebrokers\.com\/[^?#]*\.(txt|csv)(\?|$)/i.test(h));
    const pick = web.find((h) => /usa/i.test(h)) ?? web[0];
    if (!pick) console.log("  no list is linked or named at a web address (https, .txt or .csv) on the page: none is read");
    else if (!termsRead) console.log(`  a web address is named (${masked(pick)}), but the broker's terms were not read: it is not read`);
    else if (barred) console.log(`  a web address is named (${masked(pick)}), but the terms above bar it: not read; for the owner`);
    else if (!rb.allows(pick)) console.log(`  a web address is named (${masked(pick)}), but robots.txt holds its path: not read`);
    else {
      const r = await look(pick, { show: 0, timeoutMs: 60000 });
      await pause(GAP);
      if (r.status === 401 || r.status === 403) console.log("  the list asks for a login or refuses: not read (a login is never sent)");
      else if (r.ok) {
        const rows = r.text.split(/\r?\n/).filter((l) => l.trim()), meta = rows.filter((l) => l.startsWith("#"));
        console.log(`  ${r.type ?? "no type"}; ${rows.length} lines, ${rows.length - meta.length} of them rows; its heading lines: ${meta.slice(0, 3).map((l) => masked(l.slice(0, 200))).join(" · ") || "none"}; the first two rows: ${rows.filter((l) => !l.startsWith("#")).slice(0, 2).map((l) => masked(l.slice(0, 200))).join(" · ")}`);
      }
    }
  }
}

// ---- the FTP greeting, with no login: only for a host a page named ----
/** Opens port 21, reads the greeting (the first complete reply), answers QUIT, closes. Sends no USER and no PASS. */
function ftpGreeting(host: string, timeoutMs = 15000): Promise<{ lines: string[]; quit: string | null; error: string | null }> {
  counted();
  return new Promise((resolve) => {
    const lines: string[] = [];
    let buf = "", quit: string | null = null, quitSent = false, done = false;
    const sock = connect({ host, port: 21 });
    const finish = (error: string | null) => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch { /* closed */ } resolve({ lines, quit, error }); };
    const timer = setTimeout(() => finish(lines.length ? null : `no greeting within ${timeoutMs / 1000} s`), timeoutMs);
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        if (!quitSent) { lines.push(line); if (/^\d{3} /.test(line)) { quitSent = true; sock.write("QUIT\r\n"); } }
        else { quit = line; if (/^\d{3} /.test(line)) finish(null); }
      }
    });
    sock.on("error", (e: Error) => finish(`${e.name}: ${e.message}`));
    sock.on("close", () => finish(lines.length ? null : "closed before any greeting"));
  });
}
head("2d. Interactive Brokers' FTP server: its greeting only, and only for a host its page names (no USER, no PASS is sent)");
{
  const named = [...ftpHosts].filter((h) => /interactivebrokers\.com$/i.test(h));
  if (!named.length) console.log("  the page names no FTP host of the broker's: no connection is made (the candidate host of 20 Nov gave no greeting in 15 s, and no page named it)");
  else if (!ibTermsRead || ibBarred) console.log(`  the page names ${named[0]}, but the broker's terms ${ibBarred ? "bar automated reading (above)" : "were not read"}: no connection is made; for the owner`);
  else {
    const g = await ftpGreeting(named[0]);
    console.log(`  host: ${named[0]} (named on the broker's page)`);
    if (g.error && !g.lines.length) console.log(`  no greeting: ${g.error}`);
    for (const l of g.lines.slice(0, 8)) console.log(`  greeting: ${LOGIN.test(l) ? `${l.slice(0, 3)} (a line that names a login: not printed)` : masked(l.slice(0, 200))}`);
    if (g.quit) console.log(`  after QUIT: ${LOGIN.test(g.quit) ? `${g.quit.slice(0, 3)} (not printed)` : masked(g.quit.slice(0, 120))}`);
    const code = g.lines.find((l) => /^\d{3} /.test(l))?.slice(0, 3) ?? null;
    console.log(`  FINDING: ${code === "220" ? "the server answers GitHub's machines (220, ready for a user)" : code ? `the server answered ${code}` : "the server did not greet"}; FTP serves no file before USER and PASS, and none was sent; the page states a login: ${loginStated ? "yes (never printed)" : "no"}. A file behind the broker's published login waits for the owner (OQ-2)`);
  }
}

// ---- 3. JSF ----
head("3. JSF (日本証券金融): its home page's menu, its terms, its pages on 貸借取引, and the data site they name");
{
  const JSF = "https://www.jsf.co.jp", LEND = /貸借|品貸|申込停止|taisyaku|逆日歩|貸株|融資.*残高|銘柄別/i;
  const site = siteOf;
  const rb = await robots(JSF, ["/", "/ja/index.html"]);
  await pause(GAP);
  const home = rb.allows("/") ? await get(`${JSF}/`) : null;
  if (!home) console.log("  not asked: robots.txt holds the home page");
  else if (home.ok) {
    const links = linksOf(home.html, home.final).filter((l) => l.text.length > 0 || /taisyaku/i.test(l.href));
    console.log(`  title: ${titleOf(home.html) || "–"}; ${links.length} links with a text; all of them (120 at most):`);
    for (const l of links.slice(0, 120)) console.log(`    ${l.text.slice(0, 40) || "(no text)"} -> ${masked(l.href)}`);
    const barred = (await readTerms(home, { allows: (u) => rb.allows(u), gapMs: GAP })).barred;
    const own = links.filter((l) => site(l.href) === site(JSF) && LEND.test(`${l.text} ${l.href}`) && l.href !== home.final);
    const seen = new Set<string>(), follow = own.filter((l) => !seen.has(l.href) && seen.add(l.href)).slice(0, 2);
    console.log(`  its own pages that name 貸借取引, 品貸料 or 申込停止: ${own.slice(0, 8).map((l) => `${l.text.slice(0, 30)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
    const pages: Page[] = [home];
    for (const l of follow) {
      if (!rb.allows(l.href)) { console.log(`  not asked: robots.txt holds ${masked(l.href)}`); continue; }
      head(`3b. JSF: ${l.text.slice(0, 60)}`);
      const p = await get(l.href);
      if (!p.ok) continue;
      pages.push(p);
      console.log(`  title: ${titleOf(p.html) || "–"}`);
      printLines(textLines(p.html), /品貸料|申込停止|貸借|銘柄|公表|時点|毎営業日|更新|逆日歩/, 12);
      const files = linksOf(p.html, p.final).filter((x) => /\.(csv|xlsx?|pdf|zip)(\?|$)/i.test(x.href));
      console.log(`  ${files.length} file links${files.length ? `; the first five (none is opened here): ${files.slice(0, 5).map((x) => `${x.text.slice(0, 25)} -> ${masked(x.href)}`).join(" · ")}` : ""}`);
    }
    // a data site of JSF's own, on another host, as JSF's pages name it
    const out = pages.flatMap((p) => linksOf(p.html, p.final)).filter((l) => /^https?:/i.test(l.href) && site(l.href) !== site(JSF) && (/taisyaku/i.test(l.href) || LEND.test(l.text)));
    const data = out[0];
    head("3c. The data site JSF's pages name for 貸借取引 (its robots.txt, home, terms and one page)");
    if (!data) console.log("  JSF's pages read here name no data site on another host: 品貸料 and 申込停止 stay without a source, and the paper book says a Tokyo short has no hard-to-borrow signal (V-11)");
    else {
      const origin = new URL(data.href).origin;
      console.log(`  named by JSF: ${data.text.slice(0, 40) || "(no text)"} -> ${masked(data.href)}`);
      const rb2 = await robots(origin, [new URL(data.href).pathname]);
      await pause(GAP);
      const dh = rb2.allows(data.href) ? await get(data.href) : null;
      if (!dh) console.log("  not asked: robots.txt holds it");
      else if (dh.ok) {
        const dl = linksOf(dh.html, dh.final);
        console.log(`  title: ${titleOf(dh.html) || "–"}; its links that name 品貸料, 申込停止 or 貸借: ${dl.filter((l) => LEND.test(l.text)).slice(0, 10).map((l) => `${l.text.slice(0, 30)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
        const t2 = await readTerms(dh, { allows: (u) => rb2.allows(u), gapMs: GAP });
        const barred2 = barred || t2.barred, read2 = t2.read;
        const pg = dl.find((l) => /品貸料/.test(l.text) && site(l.href) === site(origin)) ?? dl.find((l) => /申込停止|貸借/.test(l.text) && site(l.href) === site(origin));
        let files: Array<{ href: string; text: string }> = dl.filter((x) => /\.(csv|xlsx?|zip)(\?|$)/i.test(x.href));
        if (pg && rb2.allows(pg.href)) {
          const p = await get(pg.href);
          if (p.ok) { console.log(`  ${pg.text.slice(0, 40)}: title ${titleOf(p.html) || "–"}`); printLines(textLines(p.html), /品貸料|申込停止|貸借|公表|時点|毎営業日|更新|逆日歩|確報|速報/, 12); files = [...linksOf(p.html, p.final).filter((x) => /\.(csv|xlsx?|zip)(\?|$)/i.test(x.href)), ...files]; }
        }
        console.log(`  ${files.length} data files linked${files.length ? `; the first five: ${files.slice(0, 5).map((x) => `${x.text.slice(0, 25)} -> ${masked(x.href)}`).join(" · ")}` : ""}`);
        const f = files.find((x) => /\.csv(\?|$)/i.test(x.href));
        if (!f) console.log("  no CSV file is linked: none is opened");
        else if (!read2) console.log("  the data site's terms were not found or not read: no file is opened");
        else if (barred2) console.log("  the terms above bar automated reading or re-use: no file is opened; for the owner");
        else if (!rb2.allows(f.href)) console.log("  robots.txt holds the file's path: not opened");
        else {
          const b = await bytes(f.href);
          await pause(GAP);
          if (b.data) {
            let text: string; try { text = new TextDecoder("shift_jis").decode(b.data); } catch { text = new TextDecoder("utf-8").decode(b.data); }
            const rows = text.split(/\r?\n/).filter((l) => l.trim());
            console.log(`  one file, for its shape only: ${rows.length} lines; the first three: ${rows.slice(0, 3).map((l) => l.slice(0, 160)).join(" · ")}; a line with 7203: ${(rows.find((l) => /(^|,|")7203(,|"|$)/.test(l)) ?? "none").slice(0, 200)}`);
          }
        }
      }
    }
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}, an FTP greeting counted as one); ${Math.round((Date.now() - t0) / 1000)} s`);
