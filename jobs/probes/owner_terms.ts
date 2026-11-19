// Facts for the owner's decisions on two free keys, read from the publishers' own pages (19 Nov 2026). Round 1's
// researchers could not open these pages from the development machine, so what they found came only from search
// summaries and is marked unverified:
//   - EDINET API (金融庁): free once registered? what registration asks for (email, phone, multi-factor)? what the
//     terms allow (credit, edited content, scraping, heavy access)? Read: the EDINET FAQ and terms of use pages.
//   - BLS Public Data API, version 2: queries a day, series and years per query, what registering needs, renewal.
//     Read: the BLS developers pages, the FAQ and the registration page.
// The SEC's pages are not read here: www.sec.gov refuses automated readers that declare no contact (round 1, 403),
// and which contact to declare is the owner's decision.
// It prints the matching lines of each page, the page's own dates and the links that lead to terms or keys. It
// fetches each page once, a second apart, and writes nothing anywhere.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = owner_terms, runtime = node
import { head, masked, UA } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The page as text, decoded with the charset its header or its <meta> names (EDINET's older pages may be Shift_JIS). */
async function page(url: string): Promise<{ ok: boolean; html: string; url: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
    const buf = new Uint8Array(await r.arrayBuffer()), type = r.headers.get("content-type") ?? "";
    const head8 = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    const cs = (type.match(/charset=([\w-]+)/i)?.[1] ?? head8.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
    let html: string;
    try { html = new TextDecoder(cs).decode(buf); } catch { html = new TextDecoder("utf-8").decode(buf); }
    const lm = r.headers.get("last-modified");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${type || "no type"}  charset ${cs}  ${buf.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${r.url !== url ? `  (ended at ${masked(r.url)})` : ""}${lm ? `  last-modified ${lm}` : ""}`);
    return { ok: r.ok, html, url: r.url || url };
  } catch (e) {
    console.log(`FAILED  ${Date.now() - t0} ms  ${masked(url)}\n  ${masked(e instanceof Error ? `${e.name}: ${e.message}${(e as { cause?: unknown }).cause ? ` (${String((e as { cause?: unknown }).cause)})` : ""}` : String(e))}`);
    return { ok: false, html: "", url };
  }
}

const decode = (s: string) => s
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

/** The page's visible text, one block per line. */
function lines(html: string): string[] {
  const body = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(t[dh])>/gi, " | ")
    .replace(/<(br|hr)\b[^>]*>|<\/(p|li|tr|h[1-6]|div|dt|dd|section|article|caption|summary|details|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decode(body).split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 1);
}

/** Prints the page's title, its own dates, the lines that match `want` and the links that match `links`. */
async function read(url: string, want: RegExp, links: RegExp | null, max = 50): Promise<void> {
  head(url);
  const p = await page(url);
  if (!p.ok) return;
  const title = decode(p.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const ls = lines(p.html);
  console.log(`  title: ${title || "–"}; ${ls.length} lines of text`);
  const dated = ls.filter((l) => /(令和|平成)\s*[0-9０-９元]+\s*年|\b(19|20)\d\d\s*年\s*\d+\s*月|last (modified|updated)|updated|改訂|更新|effective/i.test(l)).slice(0, 8);
  for (const l of dated) console.log(`  date line: ${l.slice(0, 300)}`);
  const seen = new Set<string>();
  let n = 0;
  for (const l of ls) {
    if (!want.test(l) || seen.has(l)) continue;
    seen.add(l);
    if (++n > max) { console.log(`  … more matching lines not printed (limit ${max})`); break; }
    console.log(`  | ${l.slice(0, 420)}${l.length > 420 ? " …" : ""}`);
  }
  if (!n) console.log("  no line matched");
  if (links) {
    const found = new Map<string, string>();
    for (const m of p.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      let abs: string;
      try { abs = new URL(decode(m[1]), p.url).toString(); } catch { continue; }
      if ((links.test(text) || links.test(abs)) && !found.has(abs)) found.set(abs, text);
    }
    console.log(`  links that lead to terms, keys or the API (${found.size}):`);
    for (const [abs, text] of [...found].slice(0, 30)) console.log(`    ${text.slice(0, 80) || "(no text)"} -> ${masked(abs)}`);
  }
  await pause(1000);
}

head("EDINET (金融庁): the FAQ and the terms of use");
const EDINET_FAQ = "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0090_001.html";
const EDINET_TERMS = "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html";
const EDINET_WANT = /API|ＡＰＩ|無料|有料|多要素|二要素|認証|電話番号|SMS|ＳＭＳ|音声|メールアドレス|上限|制限|大量|間隔|商用|二次利用|公共データ利用規約|PDL|出典|編集|加工|スクレイピング|禁止|停止|負荷/;
await read(EDINET_FAQ, EDINET_WANT, /API|ＡＰＩ|仕様書|利用規約|キー|ESE\d+|\.pdf/i, 70);
await read(EDINET_TERMS, EDINET_WANT, /API|ＡＰＩ|仕様書|利用規約|公共データ|PDL|\.pdf/i, 50);

head("BLS (U.S. Bureau of Labor Statistics): the developers pages, the FAQ and the registration page");
const BLS_WANT = /quer(y|ies)|daily|per day|series|years|regist|key|renew|expir|request|second|version|limit|terms|signature|organi[sz]ation|e-?mail|captcha|agree/i;
await read("https://www.bls.gov/developers/", BLS_WANT, /terms|faq|regist|signature|version|getting started|key/i, 30);
await read("https://www.bls.gov/developers/api_faqs.htm", BLS_WANT, /terms|regist|signature|key/i, 60);
await read("https://data.bls.gov/registrationEngine/", BLS_WANT, /terms|agree|privacy|regist|key/i, 30);
