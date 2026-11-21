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

/** Fetches `url` and prints one line: status, content type, size, time; then the first `show` characters of the
 *  answer. A failure to connect is printed too, with its message: that is often the finding. */
export async function look(url: string, init: RequestInit & { show?: number; timeoutMs?: number } = {}): Promise<Look> {
  const t0 = Date.now(), show = init.show ?? 600, shown = masked(url);
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

// ---- added for the paper portfolio's probes (P-0, 20 Nov 2026); read-only like the rest ----

/** Waits `ms` milliseconds: the pace between two requests. */
export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface Page { url: string; final: string; ok: boolean; status: number | null; type: string; bytes: number; html: string; lastModified: string | null }

/** Fetches a page and decodes it with the charset its header or its <meta> names (Japanese sites may send
 *  Shift_JIS). Prints one line like look()'s, with the address it ended at and its last-modified date, and nothing of
 *  the answer itself: the caller prints only the lines it picks. */
export async function page(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Page> {
  const t0 = Date.now();
  made++;
  try {
    const r = await fetch(url, { redirect: "follow", ...init, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*", ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(init.timeoutMs ?? 30000) });
    const buf = new Uint8Array(await r.arrayBuffer()), type = r.headers.get("content-type") ?? "";
    const sniff = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    const cs = (type.match(/charset=["']?([\w-]+)/i)?.[1] ?? sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
    let html: string;
    try { html = new TextDecoder(cs).decode(buf); } catch { html = new TextDecoder("utf-8").decode(buf); }
    const final = r.url || url, lm = r.headers.get("last-modified");
    console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${type || "no type"}  ${buf.length} bytes  ${Date.now() - t0} ms  ${masked(url)}${final !== url ? `  (ended at ${masked(final)})` : ""}${lm ? `  last-modified ${lm}` : ""}`);
    return { url, final, ok: r.ok, status: r.status, type, bytes: buf.length, html, lastModified: lm };
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
    .replace(/<(br|hr)\b[^>]*>|<\/(p|li|tr|h[1-6]|div|dt|dd|section|article|caption|summary|details|table|ul|ol|option)>/gi, "\n")
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

/** Reads a site's robots.txt and prints, for the group that applies to every reader ("User-agent: *"), whether each
 *  of `paths` is allowed (the longest matching rule wins; "Allow" wins a tie), and any Crawl-delay. One request. */
export async function robots(origin: string, paths: string[]): Promise<void> {
  const r = await page(`${origin.replace(/\/$/, "")}/robots.txt`, { headers: { accept: "text/plain,*/*" }, timeoutMs: 20000 });
  if (!r.ok) { console.log("  no robots.txt read: nothing is disallowed by it"); return; }
  const rules: Array<{ allow: boolean; path: string }> = [];
  let mine = false, inAgents = false, delay: string | null = null;
  for (const raw of r.html.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!inAgents) mine = false; inAgents = true; if (v === "*") mine = true; continue; }
    inAgents = false;
    if (!mine) continue;
    if (k === "disallow" || k === "allow") { if (v) rules.push({ allow: k === "allow", path: v }); }
    else if (k === "crawl-delay") delay = v;
  }
  console.log(`  for every reader ("User-agent: *"): ${rules.length} rules${delay ? `, crawl-delay ${delay}` : ""}${rules.length ? `; first ${Math.min(8, rules.length)}: ${rules.slice(0, 8).map((x) => `${x.allow ? "Allow" : "Disallow"}: ${x.path}`).join(" · ")}` : ""}`);
  const re = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  for (const p of paths) {
    const hits = rules.filter((x) => re(x.path).test(p)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
    console.log(`  ${p}: ${hits.length && !hits[0].allow ? `DISALLOWED by "Disallow: ${hits[0].path}"` : `allowed${hits.length ? ` (by "Allow: ${hits[0].path}")` : ""}`}`);
  }
}

/** Fetches a file as bytes; one line printed like look()'s (its size, type and last-modified), nothing of the file. */
export async function bytes(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ ok: boolean; status: number | null; type: string; data: Uint8Array | null; final: string }> {
  const t0 = Date.now();
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
/** Prints up to `max` passages of `pages` around each match of `want`, 200 characters on each side, with the page. */
export function printPassages(pages: string[], want: RegExp, max = 6): void {
  const re = new RegExp(want.source, want.flags.includes("g") ? want.flags : want.flags + "g");
  let n = 0;
  pages.forEach((t, i) => {
    for (const m of t.matchAll(re)) {
      if (n >= max) return;
      const at = m.index ?? 0;
      console.log(`  p.${i + 1}: …${masked(t.slice(Math.max(0, at - 200), at + m[0].length + 200))}…`);
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
