// Helpers for the probes (jobs/probes/*.ts, run by the source-probe workflow on GitHub's machines). A probe only
// reads: it fetches, prints what came back, and never writes anywhere. Runs under Node (tsx) and Deno alike.
// The repository is public, so a probe's log is public: look() never prints the value of a query parameter that
// carries a session crumb, a key or a token (masked() below), wherever the address appears in what it prints.

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export interface Look { url: string; ok: boolean; status: number | null; type: string | null; bytes: number; ms: number; text: string; error: string | null }

/** Query parameters whose values are never printed (matched without regard to case). */
const SECRET_PARAMS = ["crumb", "key", "apikey", "api_key", "api-key", "token", "access_token", "auth", "appid", "app_id",
  "client_id", "client_secret", "secret", "password", "sig", "signature", "subscription-key", "registrationkey"];
const SECRET_RE = new RegExp(`([?&](?:${SECRET_PARAMS.map((p) => p.replace(/[-_]/g, "[-_]")).join("|")})=)[^&#\\s"'<>\\\\]*`, "gi");

/** `s` (an address, a header, an error message or a piece of an answer) with the value of every such query
 *  parameter replaced by "***", and so is the user and password an address may carry before its host
 *  (ftp://user:pass@host). Everything else is left exactly as it was. */
export const masked = (s: string): string => s.replace(SECRET_RE, "$1***").replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\/\s@"'<>]+@/gi, "$1***@");

let made = 0;
/** How many requests look(), page() and the probes' own counted requests (counted()) have made so far: each probe
 *  prints it at the end beside the most its header says it makes. */
export const requestsMade = (): number => made;
/** Counts one request a probe makes by other means than look() or page() (a raw TCP greeting, say). */
export const counted = (): void => { made++; };

// ---- what no probe asks (21 Nov 2026) ----
// The owner's answer to the question on publishers' terms (21 Nov 2026, SGT): do without JPX's new files, Nomura's
// holdings files and Cboe's VIX-family files. And, asked the same day and not answered yet: whether that also covers
// the rest of JPX's site (its rule pages, its holiday calendar, its ETF list). Until the owner answers, no probe sends
// a request to jpx.co.jp. look(), page() and bytes() refuse these addresses themselves, so a probe written before
// the answer (index_files, stock_dates_crowding, japan_weekly_flows …) cannot ask them by being run again. The
// Monitor's own jobs, which read the JPX and Nikkei files it has always read, do not use this file.
const HOLDS: Array<{ name: string; re: RegExp; why: string }> = [
  { name: "jpx", re: /^https?:\/\/(?:[^\/?#]*@)?(?:[^\/?#@]*\.)?jpx\.co\.jp(?:[:\/?#]|$)/i, why: "jpx.co.jp: no probe asks it until the owner answers the question of 21 Nov 2026 (JPX's rule pages, holiday calendar and ETF list); pf_jpx holds every such read" },
  { name: "cboe-vix-files", re: /^https?:\/\/(?:[^\/?#]*@)?(?:[^\/?#@]*\.)?cboe\.com(?::\d+)?\/[^?#]*(?:daily_prices\/|_History\.csv|vixarchive)/i, why: "Cboe's VIX-family history files: the owner's answer of 21 Nov 2026 is to do without them (Yahoo's ^VIX family serves)" },
  { name: "nomura-holdings", re: /^https?:\/\/(?:[^\/?#]*@)?(?:[^\/?#@]*\.)?(?:nomura-am\.co\.jp(?::\d+)?\/fund\/monthly_holdings|nextfunds\.jp(?::\d+)?\/monthly_holdings)/i, why: "Nomura's holdings files: the owner's answer of 21 Nov 2026 is to do without them" },
];
const lifted = new Set<string>();
/** Why `url` is not asked, or null. */
export const heldWhy = (url: string): string | null => HOLDS.find((h) => !lifted.has(h.name) && h.re.test(url))?.why ?? null;
/** Lifts the hold on jpx.co.jp for this run. Only pf_jpx calls it, and only for the parts its own switches say the
 *  owner has released. */
export const liftJpxHold = (): void => { lifted.add("jpx"); };
const notAsked = (url: string, why: string): void => console.log(`NOT ASKED (held)  ${masked(url)}\n  ${why}`);

/** Fetches `url` and prints one line: status, content type, size, time; then the first `show` characters of the
 *  answer. A failure to connect is printed too, with its message: that is often the finding. */
export async function look(url: string, init: RequestInit & { show?: number; timeoutMs?: number } = {}): Promise<Look> {
  const t0 = Date.now(), show = init.show ?? 600, shown = masked(url);
  const hold = heldWhy(url);
  if (hold) { notAsked(url, hold); return { url, ok: false, status: null, type: null, bytes: 0, ms: 0, text: "", error: "held" }; }
  made++;
  try {
    const r = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "*/*", ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(init.timeoutMs ?? 30000) });
    const text = await r.text(), ms = Date.now() - t0, type = r.headers.get("content-type");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${type ?? "no type"}  ${text.length} chars  ${ms} ms  ${shown}`);
    const extra = ["retry-after", "x-ratelimit-remaining", "x-ratelimit-limit", "last-modified", "location"].map((h) => [h, r.headers.get(h)]).filter(([, v]) => v);
    if (extra.length) console.log(`  headers: ${masked(extra.map(([h, v]) => `${h}=${v}`).join("; "))}`);
    if (show > 0) console.log(`  first ${Math.min(show, text.length)} chars: ${masked(JSON.stringify(text.slice(0, show)))}`);
    return { url, ok: r.ok, status: r.status, type, bytes: text.length, ms, text, error: null };
  } catch (e) {
    const ms = Date.now() - t0, msg = masked(e instanceof Error ? `${e.name}: ${e.message}${(e as { cause?: unknown }).cause ? ` (${String((e as { cause?: unknown }).cause)})` : ""}` : String(e));
    console.log(`FAILED  ${ms} ms  ${shown}\n  ${msg}`);
    return { url, ok: false, status: null, type: null, bytes: 0, ms, text: "", error: msg };
  }
}

/** A heading in the probe's output. */
export const head = (t: string): void => console.log(`\n== ${t}`);

// ---- added for the paper portfolio's probes (P-0, 20 Nov 2026; P-0b, 21 Nov 2026: robots() says what it read and
// what it did not (C-38), a site's terms are read before its data files (termsLink, printTerms, readTerms), and a
// page's tables are read as rows (tablesOf)); read-only like the rest ----

/** Waits `ms` milliseconds: the pace between two requests. */
export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface Page { url: string; final: string; ok: boolean; status: number | null; type: string; bytes: number; html: string; lastModified: string | null; retryAfter?: string | null }

/** Fetches a page and decodes it with the charset its header or its <meta> names (Japanese sites may send
 *  Shift_JIS). Prints one line like look()'s, with the address it ended at and its last-modified date, and nothing of
 *  the answer itself: the caller prints only the lines it picks. */
export async function page(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Page> {
  const t0 = Date.now();
  const hold = heldWhy(url);
  if (hold) { notAsked(url, hold); return { url, final: url, ok: false, status: null, type: "", bytes: 0, html: "", lastModified: null }; }
  made++;
  try {
    const r = await fetch(url, { redirect: "follow", ...init, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*", ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(init.timeoutMs ?? 30000) });
    const buf = new Uint8Array(await r.arrayBuffer()), type = r.headers.get("content-type") ?? "";
    const sniff = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    const cs = (type.match(/charset=["']?([\w-]+)/i)?.[1] ?? sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
    let html: string;
    try { html = new TextDecoder(cs).decode(buf); } catch { html = new TextDecoder("utf-8").decode(buf); }
    const final = r.url || url, lm = r.headers.get("last-modified"), ra = r.headers.get("retry-after");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${type || "no type"}  ${buf.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${final !== url ? `  (ended at ${masked(final)})` : ""}${lm ? `  last-modified ${lm}` : ""}${ra ? `  retry-after ${masked(ra)}` : ""}`);
    return { url, final, ok: r.ok, status: r.status, type, bytes: buf.length, html, lastModified: lm, retryAfter: ra };
  } catch (e) {
    console.log(`FAILED  ${Date.now() - t0} ms  ${masked(url)}\n  ${masked(e instanceof Error ? `${e.name}: ${e.message}${(e as { cause?: unknown }).cause ? ` (${String((e as { cause?: unknown }).cause)})` : ""}` : String(e))}`);
    return { url, final: url, ok: false, status: null, type: "", bytes: 0, html: "", lastModified: null };
  }
}

/** HTML entities decoded (the common named ones and every numeric one; an impossible code point becomes a space). */
const cp = (c: number): string => (Number.isInteger(c) && c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : " ");
export const decoded = (s: string): string => s
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => cp(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => cp(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

/** A page's visible text, one block per line (scripts, styles and comments left out; table cells joined by " | "). */
export function textLines(html: string): string[] {
  const body = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(t[dh])>/gi, " | ")
    .replace(/<(br|hr)\b[^>]*>|<\/(p|li|tr|h[1-6]|div|dt|dd|section|article|caption|summary|details|table|ul|ol|option|title|head)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decoded(body).split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 1);
}

/** The page's <title>, decoded. */
export const titleOf = (html: string): string => decoded(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();

/** Every link of a page, absolute, with its visible text; the first of each address only. */
export function linksOf(html: string, base: string): Array<{ href: string; text: string }> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let abs: string;
    try { abs = new URL(decoded(m[1]), base).toString(); } catch { continue; }
    if (!out.has(abs)) out.set(abs, decoded(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
  }
  return [...out].map(([href, text]) => ({ href, text }));
}

/** Prints the lines that match `want`, each once, at most `max`, each cut at 400 characters. A line that matches
 *  `never` is not printed at all, only counted (a probe passes the words of a login there). */
export function printLines(ls: string[], want: RegExp, max = 30, never: RegExp | null = null): number {
  const seen = new Set<string>();
  let n = 0, held = 0;
  for (const l of ls) {
    if (!want.test(l) || seen.has(l)) continue;
    seen.add(l);
    if (never && never.test(l)) { held++; continue; }
    if (++n > max) { console.log(`  … more matching lines not printed (limit ${max})`); break; }
    console.log(`  | ${masked(l.slice(0, 400))}${l.length > 400 ? " …" : ""}`);
  }
  if (!n) console.log("  no line matched");
  if (held) console.log(`  ${held} matching line(s) that name a login or a password: not printed`);
  return n;
}

export interface Robots {
  origin: string;
  /** "read": a robots.txt came back and was parsed. "none": the site answered, but with no robots.txt (a 4xx, or an
   *  HTML page in the file's place): no rule was read, which is not the same as rules that allow. "unreachable": a
   *  5xx or no answer: every path is held. "busy": 429 twice: every path is held in this run. "held": an address no
   *  probe asks. */
  outcome: "read" | "none" | "unreachable" | "busy" | "held";
  status: number | null;
  rules: Array<{ allow: boolean; path: string }>;
  crawlDelay: string | null;
  /** May this run read `pathOrUrl`? False when a rule for every reader disallows it, and for every path when the
   *  file could not be reached (unreachable, busy, held). */
  allows(pathOrUrl: string): boolean;
}
const robotsRe = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
const pathOf = (pathOrUrl: string): string => { try { const u = new URL(pathOrUrl); return u.pathname + u.search; } catch { return pathOrUrl; } };

/** Reads a site's robots.txt (one request; a second only after a 429) and prints what came back: the status and
 *  type, then either the rules for every reader ("User-agent: *") with the verdict on each of `paths` (the longest
 *  matching rule wins; "Allow" wins a tie) and any Crawl-delay, or why no rule was read (C-38, P-0's lesson of
 *  20 Nov 2026):
 *    a 4xx, or an HTML page in the file's place  -> "no robots.txt read" (no rule exists to read; nothing is held);
 *    a 5xx, or no answer                        -> "unreachable: every path held";
 *    a 429                                      -> asked once more after the wait it names (30 s if it names none,
 *                                                  60 s at most); a second 429 holds every path in this run.
 *  It never prints "0 rules" for a file it did not read. The caller asks `allows()` before it reads a data file. */
export async function robots(origin: string, paths: string[] = []): Promise<Robots> {
  const base = origin.replace(/\/$/, ""), url = `${base}/robots.txt`;
  const none = (outcome: Robots["outcome"], status: number | null): Robots => ({ origin: base, outcome, status, rules: [], crawlDelay: null, allows: () => outcome === "none" });
  if (heldWhy(url)) { notAsked(url, heldWhy(url) as string); return none("held", null); }
  let r = await page(url, { headers: { accept: "text/plain,*/*" }, timeoutMs: 20000 });
  if (r.status === 429) {
    const named = Number(r.retryAfter), wait = Math.min(60, Number.isFinite(named) && named > 0 ? named : 30);
    console.log(`  robots.txt: HTTP 429 (too many requests): asked once more after ${wait} s`);
    await pause(wait * 1000);
    r = await page(url, { headers: { accept: "text/plain,*/*" }, timeoutMs: 20000 });
    if (r.status === 429) { console.log("  robots.txt not read: HTTP 429 twice. Every path of this site is held in this run; to be asked again later, at a slower pace"); for (const p of paths) console.log(`  ${p}: held (robots.txt not read)`); return none("busy", 429); }
  }
  if (r.status == null || r.status >= 500) {
    console.log(`  robots.txt unreachable (${r.status == null ? "no answer" : `HTTP ${r.status}`}): every path held`);
    for (const p of paths) console.log(`  ${p}: held (robots.txt unreachable)`);
    return none("unreachable", r.status);
  }
  const type = r.type || "no type", lead = r.html.slice(0, 600).trim();
  const elsewhere = (() => { try { return !/\/robots\.txt$/i.test(new URL(r.final).pathname); } catch { return false; } })();
  const html = /html/i.test(r.type) || /^<(!doctype|html|head|\?xml|body)/i.test(lead) || /<html[\s>]/i.test(lead);
  const directives = r.html.split(/\r?\n/).filter((l) => /^\s*(user-agent|disallow|allow|sitemap|crawl-delay|host)\s*:/i.test(l)).length;
  if (!r.ok) { console.log(`  no robots.txt read: HTTP ${r.status} (${type})${r.status === 401 || r.status === 403 ? ", a refusal: the site may refuse automated readers altogether" : ""}. No rule exists to read; that is not a file that allows`); for (const p of paths) console.log(`  ${p}: no rule read`); return none("none", r.status); }
  if (html || (elsewhere && !directives) || (r.html.trim() !== "" && !directives)) {
    console.log(`  no robots.txt read: HTTP ${r.status}, but ${html ? `an HTML page came back in its place (${type})` : "the answer holds no robots directive"}${elsewhere ? `, at ${masked(r.final)}` : ""}. No rule exists to read; that is not a file that allows`);
    for (const p of paths) console.log(`  ${p}: no rule read`);
    return none("none", r.status);
  }
  const rules: Array<{ allow: boolean; path: string }> = [], groups: string[] = [];
  let mine = false, inAgents = false, delay: string | null = null, star = false;
  for (const raw of r.html.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!inAgents) mine = false; inAgents = true; if (!groups.includes(v)) groups.push(v); if (v === "*") { mine = true; star = true; } continue; }
    inAgents = false;
    if (!mine) continue;
    if (k === "disallow" || k === "allow") { if (v) rules.push({ allow: k === "allow", path: v }); }
    else if (k === "crawl-delay") delay = v;
  }
  console.log(`  a robots.txt was read (${r.bytes} bytes, ${directives} directives; groups for: ${groups.slice(0, 8).join(", ") || "none"}${groups.length > 8 ? ` and ${groups.length - 8} more` : ""}). For every reader ("User-agent: *"): ${!star ? "it has no such group, so no rule applies to this reader" : rules.length ? `${rules.length} path rule${rules.length === 1 ? "" : "s"}; the first ${Math.min(8, rules.length)}: ${rules.slice(0, 8).map((x) => `${x.allow ? "Allow" : "Disallow"}: ${x.path}`).join(" · ")}` : "no Allow or Disallow path, so nothing is disallowed for it"}${delay ? `; crawl-delay ${delay}` : ""}`);
  const verdict = (p: string) => rules.filter((x) => robotsRe(x.path).test(p)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  for (const p of paths) { const hit = verdict(pathOf(p)); console.log(`  ${pathOf(p)}: ${hit && !hit.allow ? `DISALLOWED by "Disallow: ${hit.path}"` : `allowed${hit ? ` (by "Allow: ${hit.path}")` : ""}`}`); }
  return { origin: base, outcome: "read", status: r.status, rules, crawlDelay: delay, allows: (p) => { const hit = verdict(pathOf(p)); return !(hit && !hit.allow); } };
}

/** The site an address belongs to: its host's last two labels, or its last three where the last two are a public
 *  suffix of the kind "co.jp", "gov.au" or "org.uk" (a rule of thumb, enough to tell a site's own links from others'). */
export const siteOf = (url: string): string => {
  let host = "";
  try { host = new URL(url).host.toLowerCase().replace(/:\d+$/, ""); } catch { return ""; }
  const ls = host.split("."), two = ls.slice(-2).join(".");
  return /^(co|or|ne|go|ac|ad|ed|gr|lg|com|net|org|gov|edu|govt|mil)\.[a-z]{2}$/.test(two) ? ls.slice(-3).join(".") : two;
};

// ---- a site's terms, read before its data files (P-0b, 21 Nov 2026) ----

/** The words of a link to a site's terms; `termsLink()` prefers the first group. */
const TERMS_FIRST = /terms\s*(and|&)\s*conditions|terms of (use|service)|website terms|conditions of use|terms of website|利用規約|サイトのご利用|ご利用にあたって|ご利用上の注意|サイトポリシー|このサイトについて/i;
const TERMS_NEXT = /\bterms\b|legal|disclaimer|important information|copyright|免責|著作権/i;
const NOT_TERMS = /privacy|cookie|advertis|\bads?\b|プライバシー|個人情報|広告/i;
/** Sites whose terms a page may link without their being its own: a captcha's notice, a share button, a consent tool. */
const THIRD_PARTY = /(^|\.)(google|gstatic|recaptcha|hcaptcha|cloudflare|apple|microsoft|facebook|meta|twitter|x|linkedin|youtube|instagram|onetrust|cookielaw|trustarc|adobe|addthis|sharethis)\.(com|net|org)$/i;
const hostOf = (u: string): string => { try { return new URL(u).host.toLowerCase(); } catch { return ""; } };
/** The link to a site's terms among a page's links, with the candidates it chose from printed. A link to the same
 *  site comes first. Where the page links no terms on its own site, a link to another site is taken if its text says
 *  terms in full ("Terms of Use", "Terms and Conditions", 利用規約 …): an exchange's or a fund family's terms often
 *  stand on its group's site. Never a third party's. */
export function termsLink(html: string, base: string): { href: string; text: string } | null {
  const named = linksOf(html, base).filter((l) => /^https?:/i.test(l.href) && !NOT_TERMS.test(l.text) && (TERMS_FIRST.test(l.text) || TERMS_NEXT.test(l.text)) && l.text.length < 80);
  const own = named.filter((l) => siteOf(l.href) === siteOf(base));
  const away = own.length ? [] : named.filter((l) => TERMS_FIRST.test(l.text) && !THIRD_PARTY.test(hostOf(l.href)));
  const pick = own.find((l) => TERMS_FIRST.test(l.text)) ?? own[0] ?? away[0] ?? null;
  console.log(`  links that name terms on this page: ${[...own, ...away].slice(0, 6).map((l) => `${l.text.slice(0, 40)} -> ${masked(l.href)}`).join(" · ") || "none"}${pick ? `; taken: ${pick.text.slice(0, 40)}${own.includes(pick) ? "" : " (on another site: the page links no terms on its own)"}` : ""}`);
  return pick;
}
const TOPICS: Array<[string, RegExp]> = [
  ["personal or non-commercial use", /personal|non-?commercial|private use|own use|individual (use|investor)|個人|私的|非営利|非商用/i],
  ["automated reading", /automat|robot|scrap|crawl|spider|data ?mining|harvest|\bbots?\b|自動|機械的|クローラ|スクレイピング|ロボット/i],
  ["re-use, reproduction and redistribution", /reproduc|redistribut|republish|\bcopy\b|\bcopies\b|copied|retrieval system|database|\bframe\b|二次利用|再配信|転載|複製|引用|転送/i],
  ["commercial use and credit", /commercial|credit|attribut|出所|出典|商用|営利/i],
];
/** A line that bars automated reading, or any re-use whatever the purpose: what the owner's answer of 21 Nov 2026
 *  turned on (JPX's, Nomura's and Cboe's terms read so). A site whose terms carry one keeps its data files unread by
 *  a probe, and the finding goes to the owner. */
const BARS = new RegExp([
  "(prohibit|not permitted|may not|must not|shall not|forbid|do not|agree not to)[^.。]{0,120}(automat|robot|scrap|crawl|spider|data ?mining|harvest)",
  "(automat|robot|scrap|crawl|spider|data ?mining|harvest)[^.。]{0,120}(prohibit|not permitted|may not|must not|shall not|forbid)",
  "(自動|機械的|クローラ|スクレイピング|ロボット)[^。]{0,60}(禁止|できません|お断り|ご遠慮|禁じ)",
  "(いかなる目的|目的の如何|如何なる用途|用途に関わらず|用途にかかわらず)[^。]{0,80}(できません|禁止|禁じ)",
  "二次利用[^。]{0,40}(できません|禁止|禁じ)",
  "(reproduc|copied|copy|distribut|stored)[^.]{0,160}(in any form|by any means)[^.]{0,160}without (the )?(prior|express|written)",
  "(may not|must not|shall not|prohibit)[^.]{0,100}(reproduc|copy|distribut|store)[^.]{0,100}(any purpose|any form|any means)",
].join("|"), "i");
/** Prints a terms page for the record: its title, its date lines, then the lines on each subject, those that name
 *  personal or non-commercial use first and by name (each line once, cut at 500 characters; a line matching `never`,
 *  by default one that names a password, is counted, not printed). Returns the lines that bar automated reading or
 *  any re-use: with one, the caller leaves the site's data files unread. */
export function printTerms(html: string, opts: { never?: RegExp | null; max?: number; forRecord?: boolean } = {}): { personal: string[]; bars: string[]; lines: number } {
  const ls = textLines(html), seen = new Set<string>(), never = opts.never ?? /pass ?word|passwd|\bpwd\b|パスワード/i, max = opts.max ?? 8;
  console.log(`  title: ${titleOf(html) || "–"}; ${ls.length} lines of text${ls.length < 15 ? " (few: the page may be built by scripts)" : ""}`);
  for (const l of ls.filter((x) => x.length < 200 && /(last (updated|modified|revised)|effective( date| as of)?|updated|改定|改訂|制定|更新)[^.。]{0,40}((19|20)\d\d|令和|平成)/i.test(x)).slice(0, 3)) console.log(`  date line: ${masked(l)}`);
  const out: Record<string, string[]> = {};
  for (const [name, re] of TOPICS) {
    const hits = ls.filter((l) => re.test(l) && l.length > 25 && !(never && never.test(l)));
    out[name] = hits;
    const fresh = hits.filter((l) => !seen.has(l));
    console.log(`  lines that name ${name}: ${hits.length}${hits.length !== fresh.length ? ` (${hits.length - fresh.length} printed above)` : ""}`);
    for (const l of fresh.slice(0, max)) { seen.add(l); console.log(`  | ${masked(l.slice(0, 500))}${l.length > 500 ? " …" : ""}`); }
    if (fresh.length > max) console.log(`  … ${fresh.length - max} more not printed`);
  }
  const held = never ? ls.filter((l) => never.test(l) && TOPICS.some(([, re]) => re.test(l))).length : 0;
  if (held) console.log(`  ${held} matching line(s) that name a login or a password: not printed`);
  const bars = ls.filter((l) => BARS.test(l) && !(never && never.test(l)));
  console.log(`  lines that bar automated reading, or any re-use whatever the purpose: ${bars.length ? `${bars.length}: FOR THE OWNER; ${opts.forRecord ? "printed for the record: this is a feed the Monitor already reads, which the plan's gate does not stop" : "this site's data files are left unread by this probe"}` : "none matched (a person still reads the lines above before any job is built)"}`);
  for (const l of bars.slice(0, 4)) console.log(`  ! ${masked(l.slice(0, 500))}${l.length > 500 ? " …" : ""}`);
  return { personal: out["personal or non-commercial use"] ?? [], bars, lines: seen.size };
}

/** Reads a site's terms starting from one of its pages: the page's own terms link (termsLink), read and printed
 *  (printTerms). Where the page that link gives carries no line on use at all and itself links a page named terms (a
 *  "legal" hub does), that page is read too, once. Up to two requests, `gapMs` apart. `allows` (the site's
 *  robots.txt) is asked for a terms page on the same site; one that stands on another site (the group's) is read as
 *  the link gives it. Returns whether a terms page was read, and whether a line of it bars automated reading or any
 *  re-use. */
export async function readTerms(from: { html: string; final: string }, opts: { allows?: (url: string) => boolean; gapMs?: number; never?: RegExp | null; forRecord?: boolean } = {}): Promise<{ read: boolean; barred: boolean }> {
  const allows = opts.allows ?? (() => true);
  let t = termsLink(from.html, from.final), read = false, barred = false;
  if (!t) console.log("  no terms link was found on the page");
  for (let hop = 0; hop < 2 && t; hop++) {
    if (siteOf(t.href) === siteOf(from.final) && !allows(t.href)) { console.log("  not asked: robots.txt holds the terms page"); break; }
    const p = await page(t.href, { timeoutMs: 45000 });
    await pause(opts.gapMs ?? 1000);
    if (!p.ok) break;
    read = true;
    const res = printTerms(p.html, { ...(opts.never ? { never: opts.never } : {}), ...(opts.forRecord ? { forRecord: true } : {}) });
    if (res.bars.length) barred = true;
    if (res.lines > 0) break;
    const here = t.href, more = linksOf(p.html, p.final).filter((l) => /^https?:/i.test(l.href) && TERMS_FIRST.test(l.text) && !NOT_TERMS.test(l.text) && l.text.length < 80 && l.href !== here);
    const better = more.find((l) => siteOf(l.href) === siteOf(here)) ?? more.find((l) => !THIRD_PARTY.test(hostOf(l.href)));
    if (!better || hop === 1) { console.log("  that page carries no line on use: the site's terms proper were not found"); read = false; break; }
    console.log(`  that page carries no line on use; it links "${better.text.slice(0, 50)}" -> ${masked(better.href)}: read too`);
    t = better;
  }
  return { read, barred };
}

/** A page's tables: each with the heading that stands before it and its rows of cells (text only). */
export function tablesOf(html: string): Array<{ heading: string; rows: string[][] }> {
  const clean = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const cell = (x: string) => decoded(x.replace(/<br\b[^>]*>/gi, " / ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const out: Array<{ heading: string; rows: string[][] }> = [];
  for (const m of clean.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const before = clean.slice(Math.max(0, (m.index ?? 0) - 4000), m.index ?? 0);
    const hs = [...before.matchAll(/<(h[1-6]|caption)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    const cap = m[0].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1];
    const rows = [...m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cell(c[1]))).filter((r) => r.some((c) => c !== ""));
    out.push({ heading: cell(cap ?? hs[hs.length - 1]?.[2] ?? ""), rows });
  }
  return out;
}

/** Fetches a file as bytes; one line printed like look()'s (its size, type and last-modified), nothing of the file. */
export async function bytes(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ ok: boolean; status: number | null; type: string; data: Uint8Array | null; final: string }> {
  const t0 = Date.now();
  const hold = heldWhy(url);
  if (hold) { notAsked(url, hold); return { ok: false, status: null, type: "", data: null, final: url }; }
  made++;
  try {
    const r = await fetch(url, { redirect: "follow", ...init, headers: { "user-agent": UA, accept: "*/*", ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(init.timeoutMs ?? 60000) });
    const data = new Uint8Array(await r.arrayBuffer()), type = r.headers.get("content-type") ?? "", final = r.url || url, lm = r.headers.get("last-modified");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${type || "no type"}  ${data.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${final !== url ? `  (ended at ${masked(final)})` : ""}${lm ? `  last-modified ${lm}` : ""}`);
    return { ok: r.ok, status: r.status, type, data: r.ok ? data : null, final };
  } catch (e) {
    console.log(`FAILED  ${Date.now() - t0} ms  ${masked(url)}\n  ${masked(e instanceof Error ? `${e.name}: ${e.message}${(e as { cause?: unknown }).cause ? ` (${String((e as { cause?: unknown }).cause)})` : ""}` : String(e))}`);
    return { ok: false, status: null, type: "", data: null, final: url };
  }
}

/** A cell as one line of text; a row as its cells joined by " | " (the first 6 and last 3 of a long row). */
export const cellText = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
export const rowText = (r: unknown[], max = 240): string => { const cs = r.map(cellText); return (cs.length > 10 ? [...cs.slice(0, 6), "…", ...cs.slice(-3)] : cs).join(" | ").slice(0, max); };

type XlsxBook = { SheetNames: string[]; Sheets: Record<string, unknown> };
type XlsxMod = { read(d: Uint8Array, o: { type: "array" }): XlsxBook; utils: { sheet_to_json(ws: unknown, o: { header: 1; raw: boolean; defval: string }): unknown[][] } };
/** A workbook (xlsx, xls or an Excel 2003 XML sheet) as its sheets' non-empty rows. Deno only, with the package the
 *  server uses; elsewhere the import fails and null is returned with the reason printed. */
export async function workbook(b: Uint8Array): Promise<Array<{ name: string; rows: unknown[][] }> | null> {
  try {
    // @ts-ignore: a Deno npm: specifier, the package the server uses; under Node the import fails and is reported
    const X = (await import("npm:xlsx@0.18.5")) as unknown as XlsxMod;
    const wb = X.read(b, { type: "array" });
    return wb.SheetNames.map((name) => ({ name, rows: X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }).filter((r) => r.some((c) => cellText(c) !== "")) }));
  } catch (e) { console.log(`  (workbook not opened under this runtime: ${masked((e instanceof Error ? e.message : String(e)).slice(0, 120))})`); return null; }
}
/** A zip's files by name. Deno only (fflate from npm, as boe_curves_more.ts uses it); null elsewhere, reason printed. */
export async function unzipped(b: Uint8Array): Promise<Record<string, Uint8Array> | null> {
  try {
    // @ts-ignore: a Deno npm: specifier; under Node the import fails and is reported
    const { unzipSync } = (await import("npm:fflate@0.8.2")) as unknown as { unzipSync(d: Uint8Array): Record<string, Uint8Array> };
    return unzipSync(b);
  } catch (e) { console.log(`  (zip not opened under this runtime: ${masked((e instanceof Error ? e.message : String(e)).slice(0, 120))})`); return null; }
}
/** A PDF's text, page by page. Deno only (unpdf from npm, as edinet_spec_pdf.ts uses it); null elsewhere. */
export async function pdfPages(b: Uint8Array): Promise<string[] | null> {
  try {
    // @ts-ignore: a Deno npm: specifier; under Node the import fails and is reported
    const { extractText, getDocumentProxy } = (await import("npm:unpdf")) as unknown as { extractText(p: unknown, o: { mergePages: false }): Promise<{ text: string[] }>; getDocumentProxy(d: Uint8Array): Promise<unknown> };
    const { text } = await extractText(await getDocumentProxy(b), { mergePages: false });
    return text.map((t) => t.replace(/\s+/g, " ").trim());
  } catch (e) { console.log(`  (PDF not read under this runtime: ${masked((e instanceof Error ? e.message : String(e)).slice(0, 120))})`); return null; }
}
/** Prints up to `max` passages of `pages` around each match of `want`, 200 characters on each side, with the page.
 *  A match that lies inside the passage just printed is not printed again. */
export function printPassages(pages: string[], want: RegExp, max = 6): void {
  const re = new RegExp(want.source, want.flags.includes("g") ? want.flags : want.flags + "g");
  let n = 0;
  pages.forEach((t, i) => {
    let shownTo = -1;
    for (const m of t.matchAll(re)) {
      if (n >= max) return;
      const at = m.index ?? 0;
      if (at + m[0].length <= shownTo) continue;
      shownTo = at + m[0].length + 200;
      console.log(`  p.${i + 1}: …${masked(t.slice(Math.max(0, at - 200), shownTo))}…`);
      n++;
    }
  });
  if (!n) console.log(`  no passage matched ${want}`);
}

/** Yahoo Finance's session cookie and crumb, as the server gets them (supabase/functions/_shared/yahoo.ts): two
 *  requests. Prints only whether each was received, never either value. */
export async function yahooSession(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    made++;
    const r1 = await fetch("https://fc.yahoo.com", { headers: { "user-agent": UA, accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    const setc: string[] = (r1.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""];
    const cookie = setc.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
    console.log(`  fc.yahoo.com: HTTP ${r1.status}, session cookie ${cookie ? "received" : "not received"}`);
    await pause(800);
    made++;
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "user-agent": UA, accept: "*/*", cookie }, signal: AbortSignal.timeout(20000) });
    const crumb = (await r2.text()).trim();
    const ok = r2.ok && !!crumb && !crumb.includes("<");
    console.log(`  getcrumb: HTTP ${r2.status}, crumb ${ok ? "received" : "not received"}`);
    return ok ? { cookie, crumb } : null;
  } catch (e) { console.log(`  FAILED: ${masked(e instanceof Error ? e.message : String(e))}`); return null; }
}
