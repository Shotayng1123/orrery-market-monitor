// The paper portfolio's probe of borrow and short-side sources (P-0: C/portfolio-plan.md §3.1 item 6, "pf_borrow"),
// for P-3 (the warm tier's signals), P-9a (US hard to borrow, locates, recalls) and P-9b (Tokyo's lending fees and
// stops). Read-only, no key, nothing written.
//
// Interactive Brokers' shortable-stock file (the owner's P5 of 20 Nov 2026: used only after a probe has read the file
// and its terms; OQ-2: if it needs the login the broker publishes, the owner adds that login as a GitHub secret later,
// and until then the assumed borrow tiers apply). As A recalls it, the file sits on an FTP server with a login the
// broker publishes for everyone. THIS PROBE SENDS NO LOGIN AND NEVER PRINTS ONE: job logs are public. It reads the
// broker's pages that describe the file and its margin rates, and prints the FTP host they name and only whether they
// state a user name or a password, never either value (a line that names a login is counted, not printed). It then
// opens the FTP server's port 21, reads its greeting (the first reply, sent before any login), answers QUIT and
// closes. FTP serves no file before USER and PASS, so a login is needed whatever the greeting says; the greeting shows
// whether the server answers GitHub's machines. The file's header, rows, countries and update time stay unread until
// the owner's secret is in place and a second, separate change reads them.
// The broker's published margin-rate page (A §2.4, B §2.4): the benchmark named for USD and JPY and the tier rows. Its
// robots.txt and terms, for the record (the owner's P4 gate: a robots.txt or terms that forbid automated reading or
// personal use, or a login, come back to the owner).
//
// Also: the Reg SHO threshold lists of Nasdaq Trader and NYSE (official); JSF's lending data (品貸料, 申込停止: address
// not known, looked for from its home page) and its terms; JPX's 品貸料 page and margin balances by name (margin/02.html
// and margin/01.html: listed, not opened, in stock_dates_crowding.log l.39–40) with their newest files.
// Requests: at most 22, 1.5 s apart: nasdaqtrader.com (3), nyse.com (2), interactivebrokers.com (7), the FTP greeting
// (1 connection, no login), jsf.co.jp (5), jpx.co.jp (4).
// Runtime: deno (JPX's workbooks are opened with the package the server uses; the FTP greeting uses node:net, which
// Deno provides; under node the workbooks are only measured).
//   Actions > source-probe > Run workflow: probe = pf_borrow, runtime = deno
import { connect } from "node:net";
import { bytes, cellText, counted, head, linksOf, look, masked, page, pause, printLines, requestsMade, robots, rowText, textLines, titleOf, workbook, type Page } from "./lib.ts";

const GAP = 1500, MAX = 22;
const t0 = Date.now(), now = new Date();
/** Words of a login: a line or a greeting that carries one is never printed. */
const LOGIN = /user ?name|username|user id|userid|\buser\b|login|log in|log-in|password|passwd|\bpwd\b|credential|anonymous|guest|ログイン|パスワード|ユーザー/i;
const TERMS_WANT = /automat|robot|scrap|crawl|spider|commercial|personal|non-commercial|reproduc|redistribut|copy|download|data|商用|営利|個人|二次利用|転載|複製|自動|クローラ|禁止/i;
const GATE = /(prohibit|not permitted|may not|must not|forbid)[^.]{0,80}(automat|robot|scrap|crawl|spider|personal|non-commercial)|(automat|robot|scrap|crawl|spider)[^.]{0,80}(prohibit|not permitted|may not|forbid)|自動[^。]{0,40}(禁止|できません)|個人[^。]{0,40}(禁止|できません)/i;
async function get(url: string): Promise<Page> { const p = await page(url, { timeoutMs: 45000 }); await pause(GAP); return p; }
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
const weekdaysBack = (n: number): Date[] => { const out: Date[] = []; const d = new Date(now.getTime()); while (out.length < n) { d.setUTCDate(d.getUTCDate() - 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(new Date(d.getTime())); } return out; };
console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`);

// ---- 1. Reg SHO threshold lists ----
head("1. Reg SHO threshold lists: Nasdaq Trader's daily file (the last two weekdays) and NYSE's");
for (const d of weekdaysBack(2)) {
  const r = await look(`https://www.nasdaqtrader.com/dynamic/symdir/regsho/nasdaqth${ymd(d)}.txt`, { show: 0 });
  await pause(GAP);
  if (r.ok) { const ls = r.text.split(/\r?\n/).filter((l) => l.trim()); console.log(`  ${ymd(d)}: ${ls.length} lines; header ${ls[0] ?? "–"}; first rows ${ls.slice(1, 4).join(" · ")}; last line ${ls[ls.length - 1] ?? "–"}`); break; }
}
await robots("https://www.nasdaqtrader.com", ["/dynamic/symdir/regsho/"]);
await pause(GAP);
{
  const p = await get("https://www.nyse.com/regulation/threshold-securities");
  if (p.ok) {
    console.log(`  NYSE: title ${titleOf(p.html) || "–"}`);
    const ls = linksOf(p.html, p.final).filter((l) => /threshold/i.test(l.href + l.text) && /download|\.txt|\.csv|api|file/i.test(l.href + l.text));
    console.log(`  data links: ${ls.slice(0, 6).map((l) => `${l.text.slice(0, 30)} -> ${masked(l.href)}`).join(" · ") || "none found in the page's HTML"}`);
    if (ls[0]) { const r = await look(ls[0].href, { show: 0 }); await pause(GAP); if (r.ok) { const x = r.text.split(/\r?\n/).filter((l) => l.trim()); console.log(`  ${r.type ?? "no type"}, ${x.length} lines; first three ${x.slice(0, 3).map((l) => masked(l.slice(0, 160))).join(" · ")}`); } }
  }
}

// ---- 2. Interactive Brokers: pages, margin rates, terms ----
head("2. Interactive Brokers: the pages on its shortable-stock file and its margin rates (no login is sent or printed)");
const IB = "https://www.interactivebrokers.com";
await robots(IB, ["/en/trading/margin-rates.php", "/en/pricing/short-sale-cost.php", "/en/trading/short-sale-cost.php"]);
await pause(GAP);
const ftpHosts = new Set<string>(), loginOn: string[] = [], pagesRead: Page[] = [];
const FTP_HOST = /\bftp[0-9]*\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
const NEVER_IB = new RegExp(`${LOGIN.source}|ftp|[a-z]+://[^/\\s@]+@`, "i");
/** On a terms page: a line on FTP or a password, or an address carrying a user, is never printed. */
const NEVER_TERMS = /password|passwd|\bpwd\b|ftp|[a-z]+:\/\/[^\/\s@]+@/i;
/** Reads one of the broker's pages: the lines on borrowing (a line naming a login is counted, never printed), the FTP
 *  hosts it names (a host, never a user or a password), and whether it states a login. */
async function ibPage(url: string, want: RegExp): Promise<Page> {
  const p = await get(url);
  if (!p.ok) return p;
  pagesRead.push(p);
  const ls = textLines(p.html);
  console.log(`  title: ${titleOf(p.html) || "–"}; ${ls.length} lines of text${ls.length < 15 ? " (few: the page may be built by scripts)" : ""}`);
  printLines(ls, want, 25, NEVER_IB);   // a line on FTP or naming a login is counted, never printed: hosts and flags below
  const plain = p.html.replace(/ftp:\/\/[^@\s"'<>]+@/gi, "ftp://");   // a host is printed, never the user:password@ before it
  const hosts = [...new Set([...plain.matchAll(FTP_HOST)].map((m) => m[0].toLowerCase()))];
  for (const h of hosts) ftpHosts.add(h);
  // the lines on FTP, and the three lines on either side of each: where a page would give the server's login
  const at = ls.map((l, i) => (/ftp/i.test(l) ? i : -1)).filter((i) => i >= 0);
  const near = at.length ? ls.filter((_, i) => at.some((k) => Math.abs(i - k) <= 3)) : [];
  const states = { user: near.some((l) => /user ?name|username|user id|userid|login|log in|\buser\b/i.test(l)) || /ftp:\/\/[^\s"'<>@\/]+@/i.test(p.html), pass: near.some((l) => /password|passwd|\bpwd\b/i.test(l)) };
  if (hosts.length || at.length) console.log(`  FTP: hosts named ${hosts.join(", ") || "none"}; ${at.length} line(s) on FTP; within three lines of them, a user name stated: ${states.user ? "yes" : "no"}; a password stated: ${states.pass ? "yes" : "no"} (neither value printed)`);
  if (states.user || states.pass) loginOn.push(p.final);
  return p;
}
const SHORT_WANT = /short|borrow|stock loan|lending|availab|rebate|fee rate|indicative|shortable|ftp|file|updated|every|minutes|country|countries/i;
{
  head("Interactive Brokers: the margin-rate page (the benchmark for USD and JPY, the tier rows)");
  await ibPage(`${IB}/en/trading/margin-rates.php`, /USD|JPY|benchmark|BM \+|BM\+|Fed Funds|TONA|TORF|MUTAN|tier|0 ≤|≤|>|blended|rate charged|IBKR Pro|IBKR Lite/i);
  head("Interactive Brokers: the short-sale cost page (candidate addresses)");
  let sp = await ibPage(`${IB}/en/pricing/short-sale-cost.php`, SHORT_WANT);
  if (!sp.ok) sp = await ibPage(`${IB}/en/trading/short-sale-cost.php`, SHORT_WANT);
  const more = pagesRead.flatMap((p) => linksOf(p.html, p.final)).filter((l) => /^https?:\/\/[^\/@]*interactivebrokers\.com\//i.test(l.href) && /shortable|short stock|stock borrow|stock loan|securities lending|availability|slb/i.test(l.text + " " + l.href) && !pagesRead.some((p) => p.final === l.href));
  const seen = new Set<string>(), follow = more.filter((l) => !seen.has(l.href) && seen.add(l.href)).slice(0, 2);
  console.log(`\n  pages on borrowing linked from those: ${follow.map((l) => `${l.text.slice(0, 40)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
  for (const l of follow) { head(`Interactive Brokers: ${l.text.slice(0, 60) || l.href}`); await ibPage(l.href, SHORT_WANT); }
  const https = pagesRead.flatMap((p) => linksOf(p.html, p.final)).find((l) => /^https:/i.test(l.href) && /\/(usa|japan|[a-z]+)\.txt(\?|$)/i.test(l.href) && !LOGIN.test(l.href));
  if (https) console.log(`  a web address for the file is linked: ${masked(https.href)} (not read here: it is read with the file's own run)`);
  const t = pagesRead.flatMap((p) => linksOf(p.html, p.final)).find((l) => /^https?:\/\/[^\/@]*interactivebrokers\.com\//i.test(l.href) && /terms|legal|disclaimer|website use/i.test(l.text) && !/privacy/i.test(l.text));
  head("Interactive Brokers: its website terms (for the record; the owner's P4 gate)");
  if (t) {
    console.log(`  ${t.text.slice(0, 60)} -> ${masked(t.href)}`);
    const p = await get(t.href);
    if (p.ok) { printLines(textLines(p.html), TERMS_WANT, 20, NEVER_TERMS); const g = textLines(p.html).filter((l) => GATE.test(l) && !NEVER_TERMS.test(l)); console.log(`  lines on automated reading or personal use, to be read against the owner's P4 (its two extracts restrict commercial use only): ${g.length ? g.slice(0, 4).map((l) => masked(l.slice(0, 300))).join(" · ") : "none found"}`); }
  } else console.log("  no terms link was found on the pages read");
}

// ---- 3. the FTP greeting, with no login ----
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
head("3. Interactive Brokers' FTP server: its greeting only (no USER, no PASS is sent)");
{
  const named = [...ftpHosts].filter((h) => /interactivebrokers\.com$/i.test(h));
  const host = named[0] ?? "ftp3.interactivebrokers.com";
  console.log(`  host: ${host} (${named.length ? "named on the broker's pages" : "a candidate: no page read named one"})`);
  const g = await ftpGreeting(host);
  if (g.error && !g.lines.length) console.log(`  no greeting: ${g.error}`);
  for (const l of g.lines.slice(0, 8)) console.log(`  greeting: ${LOGIN.test(l) ? `${l.slice(0, 3)} (a line that names a login: not printed)` : l.slice(0, 200)}`);
  if (g.quit) console.log(`  after QUIT: ${LOGIN.test(g.quit) ? `${g.quit.slice(0, 3)} (not printed)` : g.quit.slice(0, 120)}`);
  const code = g.lines.find((l) => /^\d{3} /.test(l))?.slice(0, 3) ?? null;
  console.log(`  FINDING: ${code === "220" ? "the server answers GitHub's machines (220, ready for a user)" : code ? `the server answered ${code}` : "the server did not greet"}; a login is needed: yes (FTP serves no file before USER and PASS; none was sent); the broker states the login on: ${loginOn.length ? loginOn.join(", ") : "none of the pages read"}. The file's header, rows, countries and update time stay unread until the owner adds the login as a GitHub secret (OQ-2 (a)).`);
}

// ---- 4. JSF's lending data ----
head("4. JSF (日本証券金融): its lending data (品貸料, 申込停止), looked for from its home page; its terms");
{
  const home = await get("https://www.jsf.co.jp/");
  if (home.ok) {
    console.log(`  title: ${titleOf(home.html) || "–"}`);
    const ls = linksOf(home.html, home.final).filter((l) => /jsf\.co\.jp/.test(l.href) && /品貸|貸借|申込停止|銘柄別|残高|lending|loan/i.test(l.text));
    console.log(`  links on lending: ${ls.slice(0, 10).map((l) => `${l.text.slice(0, 30)} -> ${masked(l.href)}`).join(" · ") || "none"}`);
    for (const l of ls.slice(0, 2)) {
      head(`JSF: ${l.text.slice(0, 60)}`);
      const p = await get(l.href);
      if (!p.ok) continue;
      console.log(`  title: ${titleOf(p.html) || "–"}`);
      printLines(textLines(p.html), /品貸料|申込停止|貸借|銘柄|公表|時点|毎営業日|更新/, 12);
      const f = linksOf(p.html, p.final).filter((x) => /\.(csv|xlsx?|pdf|zip)(\?|$)/i.test(x.href));
      console.log(`  ${f.length} file links${f.length ? `; first five: ${f.slice(0, 5).map((x) => `${x.text.slice(0, 25)} -> ${masked(x.href)}`).join(" · ")}` : ""}`);
    }
    const t = linksOf(home.html, home.final).find((l) => /利用規約|ご利用にあたって|免責|サイトポリシー|terms/i.test(l.text));
    if (t) { console.log(`  terms: ${t.text} -> ${masked(t.href)}`); const p = await get(t.href); if (p.ok) { printLines(textLines(p.html), TERMS_WANT, 15); const g = textLines(p.html).filter((x) => GATE.test(x)); console.log(`  lines on automated reading or personal use, to be read against the owner's P4 (its two extracts restrict commercial use only): ${g.length ? g.slice(0, 3).join(" · ") : "none found"}`); } }
    else console.log("  no terms link on the home page");
  }
  await robots("https://www.jsf.co.jp", ["/"]);
  await pause(GAP);
}

// ---- 5. JPX: 品貸料 and margin balances by name ----
for (const [n, what] of [["02", "品貸料 (lending fees on margin trading)"], ["01", "銘柄別信用取引残高 (margin balances by name)"]] as Array<[string, string]>) {
  head(`5. JPX margin/${n}.html: ${what}, and its newest file`);
  const p = await get(`https://www.jpx.co.jp/markets/statistics-equities/margin/${n}.html`);
  if (!p.ok) continue;
  console.log(`  title: ${titleOf(p.html) || "–"}`);
  printLines(textLines(p.html), /品貸|残高|公表|毎週|毎日|日々|更新|時点/, 8);
  const f = linksOf(p.html, p.final).filter((l) => /\.(xlsx?|csv|pdf|zip)(\?|$)/i.test(l.href));
  console.log(`  ${f.length} files; first six: ${f.slice(0, 6).map((l) => `${l.text.slice(0, 25) || "(no text)"} -> ${masked(l.href)}`).join(" · ") || "–"}`);
  const x = f.find((l) => /\.(xlsx?|csv)(\?|$)/i.test(l.href));
  if (!x) continue;
  const b = await bytes(x.href);
  await pause(GAP);
  if (!b.data) continue;
  if (/\.csv(\?|$)/i.test(x.href)) { const ls = new TextDecoder("shift_jis").decode(b.data).split(/\r?\n/).filter((l) => l.trim()); console.log(`  ${ls.length} lines; first four ${ls.slice(0, 4).join(" · ")}; a line with 7203: ${ls.find((l) => /\b7203\b/.test(l)) ?? "none"}`); continue; }
  const wb = await workbook(b.data);
  if (wb) for (const s of wb.slice(0, 2)) { console.log(`  sheet "${s.name}": ${s.rows.length} rows; first four ${s.rows.slice(0, 4).map((r) => rowText(r, 200)).join(" · ")}`); const t = s.rows.find((r) => r.some((c) => /^7203/.test(cellText(c)))); if (t) console.log(`    the row of 7203: ${rowText(t, 260)}`); }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}, the FTP greeting counted as one); ${Math.round((Date.now() - t0) / 1000)} s`);
