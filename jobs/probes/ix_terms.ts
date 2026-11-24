// The index candidates' terms (IDX-0e, 24 Nov 2026), read before any list of SOX or TAIEX is built (C's index-pages
// plan, §2.1). A probe for the source-probe workflow (probe = ix_terms, runtime = deno), whose log is public.
//
// Why a file of its own: the index lists' probe (ix_lists) followed the links of the pages it read whose words named
// terms, and their redirects, and printed titles, clauses and addresses of those pages; its reviews of 24 Nov 2026
// (check/IDX0/d-adversary-leaks.md, d-adversary-log.md) found data asked and a page's text, tokens and contacts
// printed, both ways. So this probe asks a fixed list and nothing else, and prints nothing a page or a server wrote.
// It imports nothing: the helpers of lib.ts print what they read. Its one dynamic import is the PDF reader below.
//
// (1) The requests: the 13 addresses of FIXED, all https, in that order; each host's robots.txt first. A page is asked
//     only when its host's robots.txt answered 200 as text (not an HTML page) and allows the page's own path (the group
//     for this probe's own name, else the one for every reader; the longest rule wins, an Allow on a tie). Requests to one host are 3 s
//     apart, or the robots.txt's crawl-delay where it is longer; one over 30 s holds the host's pages. Every request is
//     a GET with redirect "manual": a redirect is not followed, and the log says only that the answer redirected, to
//     the same host or another, and whether the target's path is the asked path give or take a trailing slash. No link
//     of a page is read or followed, and no address is built: each one asked is written out in FIXED. At most 14
//     requests (BUDGET): an address that answered 429 is asked once more, after 10 s, only when the site asked for no
//     longer wait (a Retry-After of 10 s or less, or none) and the budget still keeps a place for every address of
//     FIXED after it. The User-Agent names a research probe and nothing else.
// (2) The reading: a page is NOT READ unless it answered 200 with the type expected (HTML, the PDF, JSON) and carries
//     200 characters of text or more. An HTML page's text is its visible text: scripts, styles, templates and comments
//     left out; the alt and title attributes and <noscript> read; entities decoded, letters as NFKC gives them, soft
//     hyphens and zero-width characters taken out, and a word split by an inline tag read glued as well as spaced. A
//     PDF's text is unpdf's, under Deno, as lib.ts's pdfPages reads one (none under Node: NOT READ). A page HOLDS when
//     a word of the automated-reading list or of the re-use list stands anywhere on it and a limiting word stands
//     anywhere on it too; else it PASSES; but a page whose words that would hold it stand in a script's data (a JSON
//     script or a template, which a script draws) is NOT READ. The lists are the strict gate's of IDX-0c (lib.ts on its
//     branch: STRICT_AUTO, STRICT_REUSE, STRICT_LIMIT, and "publish" or "publication" only in a sentence that names a
//     ban, STRICT_PUBLISH beside STRICT_BAN), with the words its reviews found it lacked (check/IDX0/c-terms.md CT-4,
//     check/IDX0/c-adversary.md B-2). data.gov.tw: whether the page's title or a heading names the licence. swagger.json:
//     JSON only, and of it only whether info.license is there, whether its url is exactly the licence's, and how many
//     operations name exactly that url as their own licence.
// (3) The log: the addresses of FIXED, status numbers, the type as html, pdf, json, text or other, counts of bytes and
//     characters, yes or no, and the words of the probe's own lists that matched (each once, with its count): never a
//     title, a sentence, a link, an address from a page or a header, a header's value, a cookie or a server's date
//     (last-modified only as yes or no), nor an error's message. Every line goes through say(), which prints a string
//     only when it is one of the probe's own (an address of FIXED, a word of its lists, a fixed phrase) and writes
//     "(withheld)" for any other. Then a verdict per candidate, HOLD, PASS or NOT READ, with its words, and the
//     requests made out of 14.

/** The product token this probe reads its own robots.txt groups by. */
export const TOKEN = "terms-research-probe";
/** The User-Agent: a research probe, with no name of a person, no contact and no project. */
export const UA = `${TOKEN}/1.0 (a research probe: reads published terms and licence pages only, and no data)`;
/** The most requests one run makes. */
export const BUDGET = 14;
const GAP_MS = 3_000, RETRY_MS = 10_000, CRAWL_MAX_S = 30, TIMEOUT_MS = 30_000, PDF_MS = 60_000, SHORT = 200;

type Kind = "robots" | "html" | "pdf" | "json";
export interface Fixed { readonly url: string; readonly host: string; readonly path: string; readonly kind: Kind }
const F = (url: string, kind: Kind): Fixed => { const u = new URL(url); return { url, host: u.host, path: u.pathname, kind }; };
/** Every address this probe asks, in its order, and nothing else. */
export const FIXED: readonly Fixed[] = [
  F("https://www.nasdaq.com/robots.txt", "robots"), F("https://www.nasdaq.com/legal", "html"),
  F("https://indexes.nasdaqomx.com/robots.txt", "robots"), F("https://indexes.nasdaqomx.com/Home/Disclaimer", "html"),
  F("https://www.nasdaqtrader.com/robots.txt", "robots"), F("https://www.nasdaqtrader.com/content/technicalsupport/dataproducts/indexdatapolicy.pdf", "pdf"),
  F("https://www.invesco.com/robots.txt", "robots"), F("https://www.invesco.com/us/en/resources/terms-of-use.html", "html"),
  F("https://data.gov.tw/robots.txt", "robots"), F("https://data.gov.tw/license", "html"), F("https://data.gov.tw/en/license", "html"),
  F("https://openapi.twse.com.tw/robots.txt", "robots"), F("https://openapi.twse.com.tw/v1/swagger.json", "json"),
];
const ASKS: ReadonlySet<string> = new Set(FIXED.map((f) => f.url));
/** The licence's two addresses, which swagger.json's fields are compared with (and which FIXED asks as pages). */
const OGDL_URLS: ReadonlySet<string> = new Set(["https://data.gov.tw/license", "https://data.gov.tw/en/license"]);
/** What the licence's title or a heading must name, by page. */
const OGDL_NAME: Readonly<Record<string, string>> = { "https://data.gov.tw/license": "政府資料開放授權條款", "https://data.gov.tw/en/license": "Open Government Data License" };
const CANDIDATES: ReadonlyArray<{ name: string; pages: string[] }> = [
  { name: "SOX via Nasdaq (nasdaq.com/legal + GIW disclaimer + index data policy)", pages: ["https://www.nasdaq.com/legal", "https://indexes.nasdaqomx.com/Home/Disclaimer", "https://www.nasdaqtrader.com/content/technicalsupport/dataproducts/indexdatapolicy.pdf"] },
  { name: "SOX via Invesco (terms of use)", pages: ["https://www.invesco.com/us/en/resources/terms-of-use.html"] },
  { name: "TAIEX via TWSE Open Data (data.gov.tw licence + swagger licence fields)", pages: ["https://data.gov.tw/license", "https://data.gov.tw/en/license", "https://openapi.twse.com.tw/v1/swagger.json"] },
];
const ACCEPT: Readonly<Record<Kind, string>> = { robots: "text/plain,*/*;q=0.1", html: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", pdf: "application/pdf,*/*;q=0.1", json: "application/json,*/*;q=0.1" };
/** The most bytes read of an answer, by kind. */
const CAP: Readonly<Record<Kind, number>> = { robots: 512 * 1024, html: 4 * 1024 * 1024, pdf: 20 * 1024 * 1024, json: 8 * 1024 * 1024 };

// ---- the lists (each entry a word of the probe's own, the only thing of it the log prints, and its pattern) ----
export interface Entry { readonly w: string; readonly re: RegExp }
const E = (w: string, re: RegExp): Entry => ({ w, re });
/** Words that name automated reading: STRICT_AUTO of IDX-0c, entry by entry, then the reviews' words. */
export const AUTO: readonly Entry[] = [
  E("robot", /\brobots?\b/i), E("spider", /\bspiders?\b/i), E("scrap*", /\bscrap\w*/i), E("crawl*", /\bcrawl\w*/i), E("bot", /\bbots?\b/i),
  E("automated means", /\bautomat(?:ed|ic|ically|ion)\b(?:[\s,-]+[\w-]+){0,3}?[\s,-]+(?:means|access\w*|tools?|quer(?:y|ies)|systems?|programs?|scripts?|software|devices?|process(?:es)?|methods?|requests?|retrieval|downloads?|downloading|collection|gathering|extraction|reading|agents?|technolog(?:y|ies)|data)\b/i),
  E("data mining", /\bdata[- ]?mining\b/i), E("harvest*", /\bharvest\w*/i),
  E("systematic retrieval", /\bsystematic(?:ally)?\s+(?:[\w-]+\s+){0,2}?(?:retriev\w*|download\w*|collect\w*|extract\w*|gather\w*|access\w*|cop(?:y|ies|ying))/i),
  E("bulk download", /\bbulk[- ](?:download\w*|retriev\w*|extract\w*|access\w*|collect\w*)/i),
  E("only through a browser", /\b(?:only|solely|exclusively)\s+(?:through|by|via|using|with|in)\s+(?:a |an |the )?(?:[\w-]+\s+){0,2}?(?:web\s+)?browsers?\b/i),
  E("other than a browser", /\bother than\b[^.;:]{0,60}?\bbrowsers?\b/i), E("non-browser", /\bnon-?browser\b/i), E("machine", /\bmachines?\b/i),
  E("programmatic*", /\bprogrammatic\w*/i), E("data gathering", /\bdata[- ]?gathering\b/i),
  E("自動", /自動/), E("自动", /自动/), E("爬蟲", /爬蟲/), E("爬虫", /爬虫/), E("ロボット", /ロボット/), E("スクレイピング", /スクレイピング/), E("クローラ", /クローラ/),
  E("クローリング", /クローリング/), E("クロール", /(?<!ス)クロール/), E("機械的", /機械的/), E("大量", /大量(?!保有)/), E("程式", /程式/), E("程序", /程序/), E("抓取", /抓取/),
  // c-adversary.md B-2 (the words beyond those IDX-0c's lib.ts took in)
  E("software access", /\b(?:software|programs?|scripts?)\b[^.;:]{0,40}?\b(?:access\w*|download\w*|extract\w*)/i), E("TDM", /\bTDM\b/),
  E("プログラム", /プログラム/), E("ツール", /ツール/), E("一括", /一括/), E("取得", /取得/), E("automatisiert*", /\bautomatisiert\w*/i),
];
/** Words that name a re-use of the site's content: STRICT_REUSE of IDX-0c, entry by entry, then the reviews' words. */
export const REUSE: readonly Entry[] = [
  E("copy", /\bcop(?:y|ies|ied|ying)\b/i), E("reproduc*", /\breproduc\w*/i), E("distribut*", /\b(?:re-?)?distribut\w*/i), E("republish*", /\bre-?publi(?:sh|cation)\w*/i),
  E("transmi*", /\b(?:re-?)?transmi\w*/i), E("broadcast*", /\bbroadcast\w*/i), E("resell*", /\bre-?sell\w*/i), E("resale", /\bresale\b/i),
  E("commercial use", /\b(?:non-?)?commercial(?:ly)?\s+(?:use|uses|usage|purposes?|exploit\w*|gain|re-?use)\b/i), E("derivative*", /\bderivative\w*/i),
  E("re-use", /\bre-?us(?:e|es|ed|ing)\b/i), E("secondary use", /\bsecondary use\b/i),
  E("複製", /複製/), E("複写", /複写/), E("転載", /転載/), E("轉載", /轉載/), E("转载", /转载/), E("再配布", /再配布/), E("再配信", /再配信/), E("二次利用", /二次利用/),
  E("商用", /商用/), E("営利", /営利/), E("転用", /転用/), E("重製", /重製/), E("商業", /商業/), E("复制", /复制/),
  // c-terms.md CT-4: the clauses its table found passing both readers (modify, adapt or translate; AI training)
  E("modif*", /\bmodif(?:y|ies|ied|ying|ication|ications)\b/i), E("adapt*", /\badapt(?:s|ed|ing|ation|ations)?\b/i), E("translat*", /\btranslat\w*/i),
  E("works based on", /\bworks? based on\b/i), E("AI training", /\b(?:train\w*|fine-?tun\w*)\b[^.;:]{0,60}?\b(?:AI|artificial intelligence|machine[- ]learning|(?:language )?models?)\b/i),
  E("artificial intelligence", /\bartificial intelligence\b/i),
  // c-adversary.md B-2
  E("download*", /\bdownload\w*/i), E("extract*", /\bextract\w*/i), E("disseminat*", /\b(?:re-?)?disseminat\w*/i),
  E("requires a licence", /\brequire[sd]?\b[^.;:]{0,30}?\blicen[cs]e\b/i), E("無断利用", /無断(?:で)?(?:使用|利用)/), E("Vervielfältigung", /\bvervielfältig\w*/i), E("réutilisation", /\br[ée]utilis\w*/i),
];
/** Words that limit: STRICT_LIMIT of IDX-0c, entry by entry, then the reviews' words. */
export const LIMIT: readonly Entry[] = [
  E("not", /\bnot\b/i), E("never", /\bnever\b/i), E("no", /\bno\b/i), E("prohibit*", /\bprohibit\w*/i), E("forbid*", /\bforbid\w*/i), E("restrict*", /\brestrict\w*/i),
  E("only", /\bonly\b/i), E("solely", /\bsolely\b/i), E("exclusively", /\bexclusively\b/i), E("without", /\bwithout\b/i), E("consent*", /\bconsent\w*/i),
  E("permission*", /\bpermission\w*/i), E("licence*", /\blicen[cs]\w*/i), E("breach*", /\bbreach\w*/i), E("violat*", /\bviolat\w*/i), E("unauthorised", /\bunauthori[sz]ed\b/i),
  E("prior written", /\bprior written\b/i), E("refrain*", /\brefrain\w*/i), E("n't", /n['’]t\b/i),
  E("禁止", /禁止/), E("不得", /不得/), E("禁じ", /禁じ/), E("禁ず", /禁ず/), E("嚴禁", /嚴禁/), E("严禁", /严禁/), E("請勿", /請勿/), E("请勿", /请勿/), E("無断", /無断/),
  E("お断り", /お断り/), E("ご遠慮", /ご遠慮/), E("お控え", /お控え/), E("不可", /不可/), E("許諾", /許諾/), E("許可", /許可/), E("承諾", /承諾/), E("限り", /限り/), E("未經", /未經/), E("未经", /未经/),
  // c-adversary.md B-2 (l01, l02)
  E("untersagt", /\buntersagt\b/i), E("verboten", /\bverboten\b/i), E("interdit*", /\binterdit\w*/i),
];
/** "publish" and "publication" (not republish or republication, which REUSE holds): a re-use only in a sentence that
 *  also names a ban or a permission, as IDX-0c's strict gate reads them (STRICT_PUBLISH beside STRICT_BAN). */
const PUBLISH_WORD = "publish*";
const PUBLISH = /\bpublish\w*|\bpublications?\b/gi;
const BAN = /\b(?:prohibit\w*|forbid\w*|restrict\w*|without|consent\w*|permission\w*|licen[cs]\w*|breach\w*|violat\w*|unauthori[sz]ed|prior written|refrain\w*)\b|禁止|不得|禁じ|禁ず|嚴禁|严禁|請勿|请勿|無断|お断り|ご遠慮|お控え|不可|許諾|許可|承諾|未經|未经/i;
const LABELS: ReadonlySet<string> = new Set([...AUTO, ...REUSE, ...LIMIT].map((e) => e.w).concat(PUBLISH_WORD));
const glob = (re: RegExp): RegExp => new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
const AUTO_G = AUTO.map((e) => ({ w: e.w, g: glob(e.re) })), REUSE_G = REUSE.map((e) => ({ w: e.w, g: glob(e.re) })), LIMIT_G = LIMIT.map((e) => ({ w: e.w, g: glob(e.re) }));

export interface Words { auto: Record<string, number>; reuse: Record<string, number>; limit: Record<string, number> }
const none = (): Words => ({ auto: {}, reuse: {}, limit: {} });
const tally = (texts: string[], list: ReadonlyArray<{ w: string; g: RegExp }>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of list) { let n = 0; for (const t of texts) n = Math.max(n, [...t.matchAll(e.g)].length); if (n > 0) out[e.w] = n; }
  return out;
};
const sentences = (t: string): string[] => t.split(/(?<=[.!?。！？])\s+|\n+/);
/** The words of the three lists a text names, counted (each form of the text read, the most matches kept). */
export function wordsIn(texts: string[]): Words {
  const w: Words = { auto: tally(texts, AUTO_G), reuse: tally(texts, REUSE_G), limit: tally(texts, LIMIT_G) };
  const published = Math.max(0, ...texts.map((t) => sentences(t).filter((x) => BAN.test(x)).reduce((n, x) => n + [...x.matchAll(PUBLISH)].length, 0)));
  if (published > 0) w.reuse[PUBLISH_WORD] = published;
  return w;
}
const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);
const holds = (w: Words): boolean => sum(w.auto) + sum(w.reuse) > 0 && sum(w.limit) > 0;
const merged = (a: Words, b: Words): Words => {
  const m = (x: Record<string, number>, y: Record<string, number>): Record<string, number> => { const o = { ...x }; for (const [k, v] of Object.entries(y)) o[k] = (o[k] ?? 0) + v; return o; };
  return { auto: m(a.auto, b.auto), reuse: m(a.reuse, b.reuse), limit: m(a.limit, b.limit) };
};

// ---- a page's text ----
const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "­", ensp: " ", emsp: " ", thinsp: " ", zwsp: "", zwj: "", zwnj: "", lrm: "", rlm: "", mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•", copy: "©", reg: "®", trade: "™" };
const decode = (s: string): string => s.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,31}));/gi, (m: string, d?: string, x?: string, n?: string) => {
  if (n !== undefined) return NAMED[n.toLowerCase()] ?? m;
  const c = d !== undefined ? Number(d) : parseInt(x ?? "", 16);
  return c > 0 && c <= 0x10ffff && (c < 0xd800 || c > 0xdfff) ? String.fromCodePoint(c) : " ";
});
const INVISIBLE = /[­​-‍⁠﻿]/g;
const clean = (s: string): string => s.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
const cleanLines = (s: string): string => s.normalize("NFKC").replace(INVISIBLE, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l !== "").join("\n");
const untag = (s: string): string => s.replace(/<[^>]*>/g, " ");
const chars = (s: string): number => [...s].length;
/** Inline elements, which a browser draws with no space of their own ("scr<b>aping</b>" is one word on the screen). */
const INLINE: ReadonlySet<string> = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "font", "i", "kbd", "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "wbr"]);
/** A script that holds data a script draws (a JSON script, a template), not code. */
const DATA_SCRIPT = /\btype\s*=\s*["']?(?:application\/(?:ld\+)?json|text\/(?:template|x-template|html|ng-template|x-handlebars-template|x-jsrender|x-tmpl|x-kendo-template|x-underscore-template))\b/i;
const jsonStrings = (src: string): string => {
  const out: string[] = [];
  const walk = (v: unknown): void => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v !== null && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk); };
  try { walk(JSON.parse(src)); return out.join("\n"); } catch { return src; }
};
export type Verdict = "HOLD" | "PASS" | "NOT READ";
export interface HtmlRead { verdict: Verdict; why: "short" | "scripted" | null; chars: number; words: Words; title: string; headings: string[] }
/** An HTML page read as (2) says: its verdict, its count of characters, the words of the lists on it, and its title
 *  and headings (compared with the licence's name; never printed). */
export function readHtml(html: string): HtmlRead {
  const data: string[] = [];
  const h = html.replace(/<!--[\s\S]*?(?:-->|$)/g, " ").replace(/<(script|style|template)\b([^>]*)>([\s\S]*?)(?:<\/\1\s*>|$)/gi, (_m: string, tag: string, attrs: string, inner: string) => {
    if (tag.toLowerCase() === "template" || (tag.toLowerCase() === "script" && DATA_SCRIPT.test(attrs))) data.push(inner);
    return " ";
  });
  const attrs: string[] = [];
  for (const t of h.matchAll(/<[a-z][^>]*>/gi)) for (const a of t[0].matchAll(/\s(?:alt|title)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) attrs.push(clean(decode(a[1] ?? a[2] ?? a[3] ?? "")));
  const title = clean(decode(untag(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(h)?.[1] ?? "")));
  const headings = [...h.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((m) => clean(decode(untag(m[2]))));
  const drawn = (inline: string): string => cleanLines(decode(untag(h.replace(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi, (_m: string, tag: string) => (INLINE.has(tag.toLowerCase()) ? inline : "\n")))));
  const glued = drawn(""), spaced = drawn(" "), extra = attrs.filter((a) => a !== "").join("\n");
  const n = chars(`${glued} ${extra}`.replace(/\s+/g, " ").trim());
  const words = wordsIn([`${spaced}\n${extra}`, `${glued}\n${extra}`]);
  if (n < SHORT) return { verdict: "NOT READ", why: "short", chars: n, words: none(), title, headings };
  if (holds(words)) return { verdict: "HOLD", why: null, chars: n, words, title, headings };
  const drawnData = data.map((d) => cleanLines(decode(untag(jsonStrings(d))))).join("\n");
  if (drawnData !== "" && holds(wordsIn([`${spaced}\n${extra}\n${drawnData}`]))) return { verdict: "NOT READ", why: "scripted", chars: n, words: none(), title, headings };
  return { verdict: "PASS", why: null, chars: n, words, title, headings };
}

// ---- robots.txt (RFC 9309, as far as this probe needs it) ----
export interface Robots { own: boolean; rules: Array<{ allow: boolean; path: string }>; delay: number | null }
/** The rules that apply to this probe: the groups for its own name, else those for every reader ("*"). */
export function robotsRules(txt: string): Robots {
  type G = { agents: string[]; rules: Array<{ allow: boolean; path: string }>; delay: number | null };
  const groups: G[] = [];
  let cur: G | null = null, agentLine = false;
  for (const raw of txt.split(/\r\n|\r|\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(raw.replace(/#.*$/, ""));
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2];
    if (key === "user-agent") {
      if (cur === null || !agentLine) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase().split("/")[0].trim()); agentLine = true; continue;
    }
    agentLine = false;
    if (cur === null) continue;
    if (key === "allow" || key === "disallow") cur.rules.push({ allow: key === "allow", path: val });
    else if (key === "crawl-delay") { const d = Number(val); if (Number.isFinite(d) && d >= 0) cur.delay = Math.max(cur.delay ?? 0, d); }
  }
  const own = groups.filter((g) => g.agents.includes(TOKEN)), use = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  return { own: own.length > 0, rules: use.flatMap((g) => g.rules), delay: use.reduce<number | null>((d, g) => (g.delay === null ? d : Math.max(d ?? 0, g.delay)), null) };
}
const matches = (pattern: string, path: string): boolean => {
  const end = pattern.endsWith("$"), body = end ? pattern.slice(0, -1) : pattern;
  return new RegExp(`^${body.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${end ? "$" : ""}`).test(path);
};
/** Whether the rules allow a path: the longest matching rule decides, an Allow on a tie; no rule, allowed. */
export function robotsAllows(rules: Robots["rules"], path: string): boolean {
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (r.path === "" || !matches(r.path, path)) continue;
    if (best === null || r.path.length > best.len || (r.path.length === best.len && r.allow)) best = { allow: r.allow, len: r.path.length };
  }
  return best === null ? true : best.allow;
}

// ---- the answers ----
type TypeClass = "html" | "pdf" | "json" | "text" | "other";
const typeOf = (ct: string | null): TypeClass => {
  const t = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (t === "text/html" || t === "application/xhtml+xml") return "html";
  if (t === "application/pdf") return "pdf";
  if (t === "application/json" || t === "text/json" || /^application\/[\w.+-]+\+json$/.test(t)) return "json";
  return t.startsWith("text/") ? "text" : "other";
};
type Got =
  | { kind: "budget" }
  | { kind: "none" }
  | { kind: "redirect"; status: number; target: boolean; sameHost: boolean; samePath: boolean }
  | { kind: "status"; status: number; retryAfter: string | null; again?: "wait" | "budget" }
  | { kind: "ok"; type: TypeClass; contentType: string; lastModified: boolean; n: number; over: boolean; bytes: Uint8Array };
const drop = async (r: Response): Promise<void> => { try { await r.body?.cancel(); } catch { /* already gone */ } };
const capped = async (r: Response, cap: number): Promise<{ n: number; over: boolean; bytes: Uint8Array }> => {
  const reader = r.body?.getReader();
  if (reader === undefined) return { n: 0, over: false, bytes: new Uint8Array(0) };
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > cap) { try { await reader.cancel(); } catch { /* already gone */ } return { n, over: true, bytes: new Uint8Array(0) }; }
    parts.push(value);
  }
  const bytes = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.byteLength; }
  return { n, over: false, bytes };
};
const whereTo = (location: string | null, f: Fixed): { target: boolean; sameHost: boolean; samePath: boolean } => {
  let t: URL | null = null;
  try { t = location === null ? null : new URL(location, f.url); } catch { t = null; }
  if (t === null) return { target: false, sameHost: false, samePath: false };
  const trim = (p: string): string => (p.length > 1 ? p.replace(/\/$/, "") : p);
  return { target: true, sameHost: t.host.toLowerCase() === f.host, samePath: trim(t.pathname) === trim(f.path) };
};
const textOf = (b: Uint8Array, contentType: string): string => {
  const head = new TextDecoder("latin1").decode(b.subarray(0, 4096));
  const cs = (/charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType)?.[1] ?? /<meta\b[^>]*charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] ?? "utf-8").toLowerCase();
  try { return new TextDecoder(cs).decode(b); } catch { return new TextDecoder("utf-8").decode(b); }
};
const METHODS: ReadonlySet<string> = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const urlOf = (v: unknown): string | null => (typeof v === "string" ? v : typeof obj(v)?.url === "string" ? (obj(v)?.url as string) : null);
/** Of an OpenAPI description, only: whether info.license is there, whether its url is exactly the licence's, and how
 *  many operations name exactly that url as their own licence (a field of the operation whose name says licence). */
export function licenceFields(spec: unknown): { present: boolean; exact: boolean; ops: number } {
  const info = obj(obj(spec)?.info), lic = info === null ? undefined : info.license;
  const exact = OGDL_URLS.has(urlOf(lic) ?? "");
  let ops = 0;
  for (const item of Object.values(obj(obj(spec)?.paths) ?? {})) for (const [method, op] of Object.entries(obj(item) ?? {})) {
    const o = obj(op);
    if (!METHODS.has(method.toLowerCase()) || o === null) continue;
    const key = Object.keys(o).find((k) => /licen[cs]e|授權/i.test(k));
    if (key !== undefined && OGDL_URLS.has(urlOf(o[key]) ?? "")) ops++;
  }
  return { present: lic !== undefined && lic !== null, exact, ops };
}

// ---- the log: say() prints the probe's own strings, numbers and yes or no, and nothing else ----
type Safe = { readonly safe: string };
const SAID: ReadonlySet<string> = new Set([
  UA, ...FIXED.map((f) => f.url), ...FIXED.map((f) => f.host), ...LABELS, ...Object.values(OGDL_NAME), ...CANDIDATES.map((c) => c.name),
  "html", "pdf", "json", "text", "other", "the same host", "another host", "HOLD", "PASS", "NOT READ", "robots.txt read: no", "10 s", "its crawl-delay",
]);
const listed = (r: Record<string, number>): Safe => ({ safe: Object.entries(r).map(([w, n]) => `${LABELS.has(w) ? w : "(withheld)"} (${Math.round(n)})`).join(", ") || "none" });
const wordsLine = (w: Words): Safe => ({ safe: `automated reading: ${listed(w.auto).safe}; re-use: ${listed(w.reuse).safe}; limiting: ${listed(w.limit).safe}` });
type Say = (parts: TemplateStringsArray, ...vals: Array<string | number | boolean | Safe>) => void;
const sayer = (print: (line: string) => void): Say => (parts, ...vals) => {
  let s = parts[0];
  vals.forEach((v, k) => {
    s += typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v)) : "–") : typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "string" ? (SAID.has(v) ? v : "(withheld)") : v.safe;
    s += parts[k + 1];
  });
  print(s);
};

// ---- the run ----
export interface Io {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  print: (line: string) => void;
  wait: (ms: number) => Promise<void>;
  pdfText: (bytes: Uint8Array) => Promise<string | null>;
}
export interface PageResult { url: string; verdict: Verdict | "READ"; words: Words; ogdl?: boolean; licence?: { present: boolean; exact: boolean; ops: number } }
export interface IxRun { made: number; pages: Record<string, PageResult>; candidates: Array<{ name: string; verdict: Verdict }> }

/** The probe: asks FIXED as (1) says, reads as (2) and prints as (3); returns what it found (for the logic checks). */
export async function ixTerms(io: Io): Promise<IxRun> {
  const run: IxRun = { made: 0, pages: {}, candidates: [] };
  for (const f of FIXED) if (f.kind !== "robots") run.pages[f.url] = { url: f.url, verdict: "NOT READ", words: none() };
  const say = sayer(io.print), seen = new Set<string>();

  const once = async (f: Fixed): Promise<Got> => {
    if (!ASKS.has(f.url) || run.made >= BUDGET) return { kind: "budget" };
    run.made++;
    let r: Response;
    try { r = await io.fetch(f.url, { method: "GET", redirect: "manual", headers: { "user-agent": UA, accept: ACCEPT[f.kind] }, signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch { return { kind: "none" }; }
    try {
      if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) { const to = whereTo(r.headers.get("location"), f); await drop(r); return { kind: "redirect", status: r.status, ...to }; }
      if (r.status !== 200) { const retryAfter = r.headers.get("retry-after"); await drop(r); return { kind: "status", status: r.status, retryAfter }; }
      const contentType = r.headers.get("content-type") ?? "", lastModified = r.headers.get("last-modified") !== null;
      return { kind: "ok", type: typeOf(contentType), contentType, lastModified, ...(await capped(r, CAP[f.kind])) };
    } catch { return { kind: "none" }; }
  };
  /** One address of FIXED: after its host's gap when the host was asked before; a 429 asked once more as (1) says. */
  const ask = async (k: number, gap: number): Promise<Got> => {
    const f = FIXED[k];
    if (seen.has(f.host)) await io.wait(gap);
    seen.add(f.host);
    const g = await once(f);
    if (g.kind !== "status" || g.status !== 429) return g;
    const ra = g.retryAfter === null ? null : g.retryAfter.trim();
    if (ra !== null && !(/^\d{1,9}$/.test(ra) && Number(ra) <= RETRY_MS / 1000)) return { ...g, again: "wait" };
    if (run.made + 1 + (FIXED.length - 1 - k) > BUDGET) return { ...g, again: "budget" };
    const wait = Math.max(RETRY_MS, gap);
    say`GET ${f.url}: 429. Asked once more after ${wait === RETRY_MS ? "10 s" : "its crawl-delay"}.`;
    await io.wait(wait);
    return once(f);
  };
  /** The answer's part of a GET line, for anything but a 200 that was read. */
  const answered = (f: Fixed, g: Got, end: "NOT READ" | "robots.txt read: no"): void => {
    if (g.kind === "budget") say`${f.url}: not asked (the budget of 14 requests is spent). ${end}`;
    else if (g.kind === "none") say`GET ${f.url}: no answer (an error of the network or no answer within 30 s). ${end}`;
    else if (g.kind === "redirect") {
      if (!g.target) say`GET ${f.url}: ${g.status}, redirected (not followed), with no target address. ${end}`;
      else say`GET ${f.url}: ${g.status}, redirected (not followed) to ${g.sameHost ? "the same host" : "another host"}; the target's path is the asked path give or take a trailing slash: ${g.samePath}. ${end}`;
    } else if (g.kind === "status") {
      if (g.again === "wait") say`GET ${f.url}: 429. Not asked again: the site asks for a longer wait than 10 s. ${end}`;
      else if (g.again === "budget") say`GET ${f.url}: 429. Not asked again: the budget of 14 keeps a place for every address still to come. ${end}`;
      else say`GET ${f.url}: ${g.status}. ${end}`;
    } else if (g.over) say`GET ${f.url}: 200, ${g.type}, over ${CAP[f.kind]} bytes (more than this probe reads). ${end}`;
    else say`GET ${f.url}: 200, ${g.type}, ${g.n} bytes. ${end}: ${f.kind} was expected`;
  };
  const printWords = (v: Verdict, w: Words): void => { say`  ${v}. ${wordsLine(w)}`; };

  try {
    say`== ix_terms (IDX-0e, 24 Nov 2026): the index candidates' terms, from the 13 fixed addresses of 6 hosts`;
    say`Each host's robots.txt first, then only the pages it allows, 3 s apart. No link of a page is read and no redirect is followed; no other address is asked.`;
    say`At most 14 requests: an address that answered 429 is asked once more, after 10 s, while the budget keeps a place for every address still to come.`;
    say`Printed: these addresses, status numbers, the type (html, pdf, json, text or other), counts, yes or no, and the words of the probe's own lists that matched, each once with its count.`;
    say`User-Agent: ${UA}`;
    for (let i = 0; i < FIXED.length;) {
      const robotsAt = i, host = FIXED[i].host, pages: number[] = [];
      for (i++; i < FIXED.length && FIXED[i].host === host; i++) pages.push(i);
      say``;
      say`== ${host}`;
      // robots.txt: read only as 200 text that is not an HTML page
      const rf = FIXED[robotsAt], rg = await ask(robotsAt, GAP_MS);
      let rules: Robots | null = null;
      if (rg.kind === "ok" && !rg.over && rg.type === "text") {
        const txt = new TextDecoder("utf-8").decode(rg.bytes);
        if (/^\s*<|<html[\s>]|<!doctype/i.test(txt.slice(0, 2048))) say`GET ${rf.url}: 200, text, ${rg.n} bytes. robots.txt read: no (an HTML page in its place)`;
        else { rules = robotsRules(txt); say`GET ${rf.url}: 200, text, ${rg.n} bytes. robots.txt read: yes; a group for this probe's own name: ${rules.own}; a crawl-delay over 3 s: ${(rules.delay ?? 0) > 3}`; }
      } else if (rg.kind === "ok" && !rg.over) say`GET ${rf.url}: 200, ${rg.type}, ${rg.n} bytes. robots.txt read: no (it is not text)`;
      else answered(rf, rg, "robots.txt read: no");
      const slow = rules !== null && (rules.delay ?? 0) > CRAWL_MAX_S, gap = rules === null ? GAP_MS : Math.max(GAP_MS, Math.round((rules.delay ?? 0) * 1000));
      const go = pages.filter((k) => {
        const f = FIXED[k];
        if (rules === null) { say`  ${f.url}: not asked (this host's robots.txt was not read)`; return false; }
        if (slow) { say`  ${f.url}: not asked (robots.txt asks for more than 30 s between requests)`; return false; }
        if (!robotsAllows(rules.rules, f.path)) { say`  ${f.url}: not asked (robots.txt disallows it)`; return false; }
        say`  ${f.url}: robots.txt allows it: yes`;
        return true;
      });
      for (const k of go) {
        const f = FIXED[k], g = await ask(k, gap), res = run.pages[f.url];
        if (g.kind !== "ok" || g.over || g.type !== f.kind) { answered(f, g, "NOT READ"); continue; }
        if (f.kind === "html") {
          const rd = readHtml(textOf(g.bytes, g.contentType));
          say`GET ${f.url}: 200, html, ${g.n} bytes, ${rd.chars} characters of text; last-modified given: ${g.lastModified}`;
          if (rd.why === "short") say`  NOT READ: ${rd.chars} characters of text, under 200`;
          else if (rd.why === "scripted") say`  NOT READ: words of the lists that would hold it stand in a script's data (the page may be built by scripts)`;
          else printWords(rd.verdict, rd.words);
          res.verdict = rd.verdict; res.words = rd.words;
          const name = OGDL_NAME[f.url];
          if (name !== undefined) { res.ogdl = [rd.title, ...rd.headings].some((t) => t.toLowerCase().includes(name.toLowerCase())); say`  the title or a heading names ${name}: ${res.ogdl}`; }
        } else if (f.kind === "pdf") {
          if (!new TextDecoder("latin1").decode(g.bytes.subarray(0, 1024)).includes("%PDF-")) { say`GET ${f.url}: 200, pdf, ${g.n} bytes; last-modified given: ${g.lastModified}`; say`  NOT READ: it does not begin as a PDF`; continue; }
          const text = await pdfWithin(io, g.bytes), t = text === null ? "" : clean(text.replace(/\n/g, " "));
          if (text === null) { say`GET ${f.url}: 200, pdf, ${g.n} bytes; last-modified given: ${g.lastModified}`; say`  NOT READ: the PDF's text could not be read under this runtime`; continue; }
          say`GET ${f.url}: 200, pdf, ${g.n} bytes, ${chars(t)} characters of text; last-modified given: ${g.lastModified}`;
          if (chars(t) < SHORT) { say`  NOT READ: ${chars(t)} characters of text, under 200`; continue; }
          const w = wordsIn([t]);
          res.verdict = holds(w) ? "HOLD" : "PASS"; res.words = w;
          printWords(res.verdict, w);
        } else {
          const text = new TextDecoder("utf-8").decode(g.bytes);
          say`GET ${f.url}: 200, json, ${g.n} bytes, ${chars(text)} characters of text; last-modified given: ${g.lastModified}`;
          if (chars(text) < SHORT) { say`  NOT READ: ${chars(text)} characters of text, under 200`; continue; }
          let spec: unknown;
          try { spec = JSON.parse(text); } catch { say`  NOT READ: it is not JSON`; continue; }
          res.licence = licenceFields(spec); res.verdict = "READ";
          say`  info.license: ${res.licence.present}; its url exactly https://data.gov.tw/license or https://data.gov.tw/en/license: ${res.licence.exact}; operations whose own licence url is exactly that: ${res.licence.ops}`;
          say`  READ (its licence fields only)`;
        }
      }
    }
    say``;
    say`== The candidates`;
    for (const c of CANDIDATES) {
      const ps = c.pages.map((u) => run.pages[u]), read = ps.filter((p) => p.verdict !== "NOT READ").length;
      const extra = c.pages.every((u) => OGDL_NAME[u] === undefined || run.pages[u].ogdl === true) && c.pages.every((u) => FIXED.find((f) => f.url === u)?.kind !== "json" || run.pages[u].licence?.exact === true);
      const verdict: Verdict = ps.some((p) => p.verdict === "HOLD") ? "HOLD" : read === ps.length && extra ? "PASS" : "NOT READ";
      run.candidates.push({ name: c.name, verdict });
      say`${c.name}: ${verdict}. ${read} of ${ps.length} pages read; ${wordsLine(ps.reduce((w, p) => merged(w, p.words), none()))}`;
    }
  } catch {
    say`the probe stopped on an error of its own (its message is not printed)`;
  }
  say`requests made: ${run.made} of ${BUDGET}`;
  return run;
}
const pdfWithin = async (io: Io, bytes: Uint8Array): Promise<string | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([io.pdfText(bytes).catch(() => null), new Promise<null>((done) => { timer = setTimeout(() => done(null), PDF_MS); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
};

/** A PDF's text by unpdf (from npm, under Deno, as lib.ts's pdfPages and edinet_spec_pdf.ts read one), or null: under
 *  Node the import fails. The console is silent while pdf.js reads, so that none of its warnings reaches the log. */
export async function pdfText(bytes: Uint8Array): Promise<string | null> {
  const keys = ["log", "info", "warn", "error", "debug"] as const, kept = keys.map((k) => console[k]);
  for (const k of keys) console[k] = () => undefined;
  try {
    // @ts-ignore: a Deno npm: specifier; under Node the import fails and the PDF is NOT READ
    const m = (await import("npm:unpdf")) as unknown as { getDocumentProxy(d: Uint8Array, o?: Record<string, unknown>): Promise<unknown>; extractText(p: unknown, o: { mergePages: false }): Promise<{ text: string[] }> };
    const { text } = await m.extractText(await m.getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 }), { mergePages: false });
    return text.join("\n");
  } catch { return null; } finally { keys.forEach((k, i) => { console[k] = kept[i]; }); }
}

/** The console's own writer, taken when the file loads: the log goes on while pdfText keeps the console silent, even
 *  past PDF_MS, when a PDF that pdf.js never finishes is given up as NOT READ. */
const writeLine: (line: string) => void = console.log.bind(console);
const defaultIo = (): Io => ({
  fetch: (url, init) => globalThis.fetch(url, init),
  print: (line) => { writeLine(line); },
  wait: (ms) => new Promise<void>((done) => { setTimeout(done, ms); }),
  pdfText,
});
/** Run as the program (deno run probes/ix_terms.ts, or tsx), never when a file loads it (the logic checks). */
const asProgram = (): boolean => {
  const main = (import.meta as ImportMeta & { main?: boolean }).main;
  if (typeof main === "boolean") return main;
  const arg = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1];
  return typeof arg === "string" && arg !== "" && decodeURIComponent(import.meta.url).endsWith(`/${arg.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "")}`);
};
if (asProgram()) await ixTerms(defaultIo());
