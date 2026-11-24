// SOX's members from Nasdaq's own list (IDX-0e2, 24 Nov 2026). A probe for the source-probe workflow (probe = ix_sox,
// runtime = deno), whose log is public. Released by the owner on 24 Nov 2026, after ix_terms' run 45384712261 held
// nasdaq.com/legal: the Nasdaq-100 "Keep it, as personal use" and SOX "Nasdaq, as personal use" (the cards of that day;
// Invesco's holdings are not used). Before a SOX list is built (IDX-1), it asks whether Nasdaq's list endpoint, which
// the Monitor reads for the Nasdaq-100 every day (the server's constituents job), has a SOX list type that parses the
// same way.
//
// (1) The requests: api.nasdaq.com's robots.txt first, read by ix_terms' rules (RFC 9309 §2.3.1: a 2xx is the file,
//     read when it is text and not an HTML page; a 3xx is followed only to this same address, at most 5 times, each
//     while the budget keeps a place for every address still to come; a 4xx but 429 means no file, so every path is
//     allowed; a 429, a 5xx, no answer and an unreadable file mean complete disallow). The probe names no product of its
//     own (it sends the Monitor's User-Agent), so a path is asked only when the group for every reader ("*") allows it
//     and so does each group for a product that User-Agent names (Mozilla, AppleWebKit, Chrome, Safari) where the file
//     has one, or, by the owner's release (OWNER_RELEASED_DESPITE_ROBOTS, IDX-0e3), when the file was read and
//     disallows it; a robots.txt that could not be read, or that asks for more than 30 s between requests, still holds
//     both. Then, where allowed or released, exactly the two list addresses of FIXED: the Nasdaq-100's, which fetchNasdaq100
//     reads (supabase/functions/_shared/constituents.ts), as the control, and SOX's, each with the headers that function
//     sends (its own over those of fetchText in _shared/http.ts), 3 s apart, or the Crawl-delay where it is longer (one
//     over 30 s holds both). Every request is a GET with redirect "manual": no redirect of a list is followed, and no
//     address is built. At most 4 requests (BUDGET): an address that answered 429 is asked once more after 10 s, where
//     the site asks for no longer wait, and a robots.txt that redirected to itself is asked again after 10 s, each only
//     while the budget keeps a place for every address still to come.
// (2) The reading: a list's answer (any 2xx, as fetchText takes it) is read as JSON, as fetchNasdaq100 reads one: whether
//     it has the shape that function parses (data.data.rows, one row or more, each an object with symbol and companyName
//     as text, marketCap as text or a number, and sector, where given, as text or null), how many rows, how many rows
//     carry each of the four columns it reads, and how many other keys the rows carry (counted, never named). Of SOX's
//     list also: its member symbols that have a ticker's form (TICKER, after trimming as fetchNasdaq100 trims; any other
//     value is counted, not printed), and how many rows have a weight-like field (a key that names a weight) and how
//     many of those hold a number.
// (3) The log: the addresses of FIXED, status numbers, the type as html, pdf, json, text or other, bytes, yes or no,
//     counts, the names of the four columns fetchNasdaq100 reads, and SOX's symbols of a ticker's form. Every line goes
//     through say(), which prints a string only when it is one of the probe's own and writes "(withheld)" for any other;
//     a symbol is printed only through tickers(), which takes a value only in a ticker's form. Never a header's value, a
//     cookie, a server's date, a company's name, a sector, a cap, another column's name or value, an address from an
//     answer, or an error's message.
import { capped, REDIRECTS_MAX, robotsAllows, robotsEnd, robotsFate, robotsRules, ROBOTS_SAYS, typeOf, whereTo, type Fixed, type TypeClass } from "./ix_terms.ts";

const F = (url: string, kind: "robots" | "json"): Fixed => { const u = new URL(url); return { url, host: u.host, path: u.pathname, kind }; };
/** Every address this probe asks, in its order, and nothing else. */
export const FIXED: readonly Fixed[] = [
  F("https://api.nasdaq.com/robots.txt", "robots"),
  F("https://api.nasdaq.com/api/quote/list-type/nasdaq100", "json"),
  F("https://api.nasdaq.com/api/quote/list-type/sox", "json"),
];
/** The owner's release of 24 Nov 2026, about 13:30 UTC ("Keep both as personal use"; owner-decisions, "Nasdaq's lists
 *  after robots.txt"), given after this probe's run 45402581634 read api.nasdaq.com's robots.txt (200) with a group for
 *  every reader that disallows both list addresses: the two list addresses of FIXED, and no other address of any probe
 *  or job, are asked although a robots.txt that was read disallows them. robots.txt is still asked first and its line
 *  printed as before; a robots.txt that could not be read (a 5xx, a 429, no answer, a redirect elsewhere, an HTML page
 *  in its place) or that asks for more than 30 s between requests still holds both. false: as before the release. */
export const OWNER_RELEASED_DESPITE_ROBOTS = true;
/** The most requests one run makes: the three, and one more. */
export const BUDGET = 4;
const GAP_MS = 3_000, RETRY_MS = 10_000, CRAWL_MAX_S = 30, TIMEOUT_MS = 30_000, ROBOTS_CAP = 512 * 1024, LIST_CAP = 4 * 1024 * 1024;
const HOST = FIXED[0].host, SOX_LIST = FIXED[2].url;
/** The Monitor's User-Agent: BROWSER_UA in supabase/functions/_shared/http.ts, which fetchText sends (the logic checks
 *  hold the two equal). */
export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** fetchNasdaq100's request headers: fetchText's own (that User-Agent, accept *\/*) with fetchNasdaq100's over them. */
const LIST_HEADERS: Readonly<Record<string, string>> = { "user-agent": UA, accept: "application/json", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" };
const ROBOTS_HEADERS: Readonly<Record<string, string>> = { "user-agent": UA, accept: "text/plain,*/*;q=0.1" };
/** The groups of robots.txt a path must pass: the one for every reader, and one for each product the User-Agent names. */
const TOKENS: readonly string[] = ["*", ...new Set([...UA.matchAll(/([A-Za-z][A-Za-z_-]*)\/\d/g)].map((m) => m[1].toLowerCase()))];
/** A public ticker's form: the only form of a member's symbol the log prints. */
export const TICKER = /^[A-Z][A-Z0-9.]{0,6}$/;
/** The columns fetchNasdaq100 reads of a row, in the order its type names them. */
export const COLS = ["symbol", "companyName", "marketCap", "sector"] as const;
type Col = typeof COLS[number];
/** A key that names a weight ("weight", "indexWeight", "wt", "wtPct" …). */
const WEIGHTISH = /weigh|^(?:index|idx)?_?wt(?:_?pct|_?percent|%)?$/i;

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numberish = (v: unknown): boolean => (typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && /\d/.test(v) && /^\s*[-+]?[\d,]*(?:\.\d+)?\s*%?\s*$/.test(v));
export interface ListRead { json: boolean; rows: number | null; shape: boolean; cols: Record<Col, number>; others: number; tickers: string[]; otherSymbols: number; weightRows: number; weightNumbers: number }
/** A list's answer read as (2) says (for the log and the logic checks; nothing of it is printed but its counts). */
export function readList(text: string): ListRead {
  const out: ListRead = { json: false, rows: null, shape: false, cols: { symbol: 0, companyName: 0, marketCap: 0, sector: 0 }, others: 0, tickers: [], otherSymbols: 0, weightRows: 0, weightNumbers: 0 };
  let j: unknown;
  try { j = JSON.parse(text); out.json = true; } catch { return out; }
  const rows = obj(obj(obj(j)?.data)?.data)?.rows;
  if (!Array.isArray(rows)) return out;
  out.rows = rows.length;
  const other = new Set<string>();
  let fits = rows.length > 0;
  for (const r of rows) {
    const o = obj(r);
    if (o === null) { fits = false; out.otherSymbols++; continue; }
    for (const c of COLS) if (Object.prototype.hasOwnProperty.call(o, c)) out.cols[c]++;
    for (const k of Object.keys(o)) if (!(COLS as readonly string[]).includes(k)) other.add(k);
    if (typeof o.symbol !== "string" || typeof o.companyName !== "string" || !(typeof o.marketCap === "string" || typeof o.marketCap === "number") || !(o.sector === undefined || o.sector === null || typeof o.sector === "string")) fits = false;
    const s = typeof o.symbol === "string" ? o.symbol.trim() : null;
    if (s !== null && TICKER.test(s)) out.tickers.push(s); else out.otherSymbols++;
    const wk = Object.keys(o).filter((k) => WEIGHTISH.test(k));
    if (wk.length > 0) { out.weightRows++; if (wk.some((k) => numberish(o[k]))) out.weightNumbers++; }
  }
  out.others = other.size; out.shape = fits;
  return out;
}

// ---- the log: say() prints the probe's own strings, numbers and yes or no; tickers() a symbol of a ticker's form ----
type Safe = { readonly safe: string };
const SAID: ReadonlySet<string> = new Set([UA, HOST, ...FIXED.map((f) => f.url), ...Object.values(ROBOTS_SAYS), "html", "pdf", "json", "text", "other", "the same host", "another host", "NOT READ", "10 s", "its crawl-delay"]);
const tickers = (list: string[]): Safe => ({ safe: list.filter((t) => TICKER.test(t)).join(", ") || "none" });
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
type Got =
  | { kind: "budget" }
  | { kind: "none" }
  | { kind: "redirect"; status: number; target: boolean; sameHost: boolean; samePath: boolean; self: boolean }
  | { kind: "status"; status: number; retryAfter: string | null; again?: "wait" | "budget" }
  | { kind: "ok"; status: number; type: TypeClass; n: number; over: boolean; bytes: Uint8Array };
export interface Io {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  print: (line: string) => void;
  wait: (ms: number) => Promise<void>;
}
export interface SoxRun { made: number; robots: "file" | "none" | "disallow"; lists: Record<string, ListRead | null> }
const drop = async (r: Response): Promise<void> => { try { await r.body?.cancel(); } catch { /* already gone */ } };

/** The probe: asks FIXED as (1) says, reads as (2) and prints as (3); returns what it found (for the logic checks). */
export async function ixSox(io: Io, released = OWNER_RELEASED_DESPITE_ROBOTS): Promise<SoxRun> {
  const run: SoxRun = { made: 0, robots: "disallow", lists: {} };
  for (const f of FIXED) if (f.kind === "json") run.lists[f.url] = null;
  const say = sayer(io.print);
  let before = false;

  const once = async (f: Fixed): Promise<Got> => {
    if (!FIXED.includes(f) || run.made >= BUDGET) return { kind: "budget" };
    run.made++;
    let r: Response;
    try { r = await io.fetch(f.url, { method: "GET", redirect: "manual", headers: { ...(f.kind === "robots" ? ROBOTS_HEADERS : LIST_HEADERS) }, signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch { return { kind: "none" }; }
    try {
      if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) { const to = whereTo(r.headers.get("location"), f); await drop(r); return { kind: "redirect", status: r.status, ...to }; }
      if (robotsFate(r.status) !== "file") { const retryAfter = r.headers.get("retry-after"); await drop(r); return { kind: "status", status: r.status, retryAfter }; }
      return { kind: "ok", status: r.status, type: typeOf(r.headers.get("content-type")), ...(await capped(r, f.kind === "robots" ? ROBOTS_CAP : LIST_CAP)) };
    } catch { return { kind: "none" }; }
  };
  /** Whether one request more for the address at k leaves a place for every address of FIXED after it. */
  const kept = (k: number): boolean => run.made + 1 + (FIXED.length - 1 - k) <= BUDGET;
  /** One address of FIXED, `gap` ms after the last request (all three are on one host); a 429 asked once more as (1) says. */
  const ask = async (k: number, gap: number): Promise<Got> => {
    const f = FIXED[k];
    if (before) await io.wait(gap);
    before = true;
    const g = await once(f);
    if (g.kind !== "status" || g.status !== 429) return g;
    const ra = g.retryAfter === null ? null : g.retryAfter.trim();
    if (ra !== null && !(/^\d{1,9}$/.test(ra) && Number(ra) <= RETRY_MS / 1000)) return { ...g, again: "wait" };
    if (!kept(k)) return { ...g, again: "budget" };
    const wait = Math.max(RETRY_MS, gap);
    say`GET ${f.url}: 429. Asked once more after ${wait === RETRY_MS ? "10 s" : "its crawl-delay"}.`;
    await io.wait(wait);
    return once(f);
  };
  /** The answer's part of a GET line, for anything but a 2xx that was read. */
  const answered = (f: Fixed, g: Got, end: string): void => {
    if (g.kind === "budget") say`${f.url}: not asked (the budget of 4 requests is spent). ${end}`;
    else if (g.kind === "none") say`GET ${f.url}: no answer (an error of the network or no answer within 30 s). ${end}`;
    else if (g.kind === "redirect") {
      if (!g.target) say`GET ${f.url}: ${g.status}, redirected (not followed), with no target address. ${end}`;
      else say`GET ${f.url}: ${g.status}, redirected (not followed) to ${g.sameHost ? "the same host" : "another host"}; the target's path is the asked path give or take a trailing slash: ${g.samePath}. ${end}`;
    } else if (g.kind === "status") {
      if (g.again === "wait") say`GET ${f.url}: 429. Not asked again: the site asks for a wait given as a date or longer than 10 s. ${end}`;
      else if (g.again === "budget") say`GET ${f.url}: 429. Not asked again: the budget of 4 has no place left (one is kept for every address still to come). ${end}`;
      else say`GET ${f.url}: ${g.status}. ${end}`;
    } else say`GET ${f.url}: ${g.status}, ${g.type}, over ${f.kind === "robots" ? ROBOTS_CAP : LIST_CAP} bytes (more than this probe reads). ${end}`;
  };

  try {
    say`== ix_sox (IDX-0e2, 24 Nov 2026): SOX's members from Nasdaq's own list, beside the Nasdaq-100's list as the Monitor asks for it`;
    say`Released by the owner on 24 Nov 2026: Nasdaq's lists are read for personal use (the Nasdaq-100 kept as the Monitor reads it; SOX from Nasdaq).`;
    if (released) say`api.nasdaq.com's robots.txt first, read by RFC 9309 §2.3.1 (a 4xx other than 429: no file, every path allowed; a 5xx or no answer: complete disallow) and, stricter than the RFC, a 429 as complete disallow too, for every reader and for each product of the User-Agent; then the two lists where it allows them and, by the owner's release of 24 Nov 2026 (below), where it was read and disallows them; neither when it was not read or asks for more than 30 s between requests; 3 s apart, with the headers the Monitor's fetchNasdaq100 sends. No redirect of a list is followed; no other address is asked.`;
    else say`api.nasdaq.com's robots.txt first, read by RFC 9309 §2.3.1 (a 4xx other than 429: no file, every path allowed; a 5xx or no answer: complete disallow) and, stricter than the RFC, a 429 as complete disallow too, for every reader and for each product of the User-Agent; then only the two lists it allows, 3 s apart, with the headers the Monitor's fetchNasdaq100 sends. No redirect of a list is followed; no other address is asked.`;
    say`At most 4 requests: an address that answered 429, or a robots.txt that redirected to itself, is asked once more, after 10 s, while the budget keeps a place for every address still to come.`;
    say`Printed: these addresses, status numbers, the type (html, pdf, json, text or other), bytes, yes or no, counts, the names of the four columns fetchNasdaq100 reads, and SOX's member symbols of a ticker's form. Nothing else of an answer.`;
    say`User-Agent: ${UA}`;
    say``;
    say`== ${HOST}`;
    const rf = FIXED[0];
    let rg = await ask(0, GAP_MS);
    for (let hop = 1; rg.kind === "redirect" && rg.self && hop <= REDIRECTS_MAX && kept(0); hop++) {
      say`GET ${rf.url}: ${rg.status}, redirected to this same address (https, this host, the path /robots.txt, no query): asked again after 10 s, redirect ${hop} of at most 5 followed`;
      rg = await ask(0, RETRY_MS);
    }
    let allows: ((path: string) => boolean) | null = null, delay = 0;
    if (rg.kind === "ok" && !rg.over && rg.type === "text") {
      const txt = new TextDecoder("utf-8").decode(rg.bytes);
      if (/^\s*<|<html[\s>]|<!doctype/i.test(txt.slice(0, 2048))) say`GET ${rf.url}: ${rg.status}, text, ${rg.n} bytes. robots.txt read: no (an HTML page in its place): complete disallow`;
      else {
        const groups = TOKENS.map((t) => robotsRules(txt, t));
        allows = (path) => groups.every((g) => robotsAllows(g.rules, path));
        delay = Math.max(0, ...groups.map((g) => g.delay ?? 0));
        run.robots = "file";
        say`GET ${rf.url}: ${rg.status}, text, ${rg.n} bytes. robots.txt read: yes; a group for every reader: ${groups[0].own}; a group for a product its User-Agent names: ${groups.slice(1).some((g) => g.own)}; a crawl-delay over 3 s: ${delay > 3}`;
      }
    } else if (rg.kind === "ok" && !rg.over) say`GET ${rf.url}: ${rg.status}, ${rg.type}, ${rg.n} bytes. robots.txt read: no (it is not text): complete disallow`;
    else if (rg.kind === "status" && robotsFate(rg.status) === "none") { allows = () => true; run.robots = "none"; say`GET ${rf.url}: ${rg.status}. ${ROBOTS_SAYS.none}`; }
    else answered(rf, rg, robotsEnd(rg));
    const slow = delay > CRAWL_MAX_S, gap = Math.max(GAP_MS, Math.round(delay * 1000));
    let overruled = false;
    const go = [1, 2].filter((k) => {
      const f = FIXED[k];
      if (allows === null) { say`  ${f.url}: not asked (this host's robots.txt was not read)`; return false; }
      if (run.robots === "none") { say`  ${f.url}: no robots.txt, so every path is allowed: yes`; return true; }
      if (slow) { say`  ${f.url}: not asked (robots.txt asks for more than 30 s between requests)`; return false; }
      if (!allows(f.path)) {
        if (!released) { say`  ${f.url}: not asked (robots.txt disallows it)`; return false; }
        say`  ${f.url}: robots.txt disallows it; asked by the owner's release`;
        overruled = true;
        return true;
      }
      say`  ${f.url}: robots.txt allows it: yes`;
      return true;
    });
    if (overruled) say`the owner released these two addresses despite robots.txt (24 Nov 2026, personal use)`;
    for (const k of go) {
      const f = FIXED[k], g = await ask(k, gap);
      if (g.kind !== "ok" || g.over) { answered(f, g, "NOT READ"); continue; }
      say`GET ${f.url}: ${g.status}, ${g.type}, ${g.n} bytes`;
      const rd = readList(new TextDecoder("utf-8").decode(g.bytes));
      run.lists[f.url] = rd;
      if (!rd.json) { say`  NOT JSON: the answer does not parse as JSON, so it has not the shape fetchNasdaq100 parses`; continue; }
      if (rd.rows === null) { say`  data.data.rows: no list there, so the answer has not the shape fetchNasdaq100 parses`; continue; }
      say`  data.data.rows: a list of ${rd.rows} rows; the shape fetchNasdaq100 parses: ${rd.shape}`;
      say`  the columns fetchNasdaq100 reads, by the rows that carry them: symbol ${rd.cols.symbol}, companyName ${rd.cols.companyName}, marketCap ${rd.cols.marketCap}, sector ${rd.cols.sector}; other keys: ${rd.others}`;
      if (f.url === SOX_LIST) {
        say`  member symbols of a ticker's form (${rd.tickers.length}): ${tickers(rd.tickers)}; other values: ${rd.otherSymbols}`;
        say`  a weight-like field (a key that names a weight): ${rd.weightRows > 0}, in ${rd.weightRows} rows (holding a number: ${rd.weightNumbers})`;
      }
    }
  } catch {
    say`the probe stopped on an error of its own (its message is not printed)`;
  }
  say`requests made: ${run.made} of ${BUDGET}`;
  return run;
}

/** The console's own writer, taken when the file loads. */
const writeLine: (line: string) => void = console.log.bind(console);
const defaultIo = (): Io => ({
  fetch: (url, init) => globalThis.fetch(url, init),
  print: (line) => { writeLine(line); },
  wait: (ms) => new Promise<void>((done) => { setTimeout(done, ms); }),
});
/** Run as the program (deno run probes/ix_sox.ts, or tsx), never when a file loads it (the logic checks). */
const asProgram = (): boolean => {
  const main = (import.meta as ImportMeta & { main?: boolean }).main;
  if (typeof main === "boolean") return main;
  const arg = (globalThis as { process?: { argv?: string[] } }).process?.argv?.[1];
  return typeof arg === "string" && arg !== "" && decodeURIComponent(import.meta.url).endsWith(`/${arg.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "")}`);
};
if (asProgram()) await ixSox(defaultIo());
