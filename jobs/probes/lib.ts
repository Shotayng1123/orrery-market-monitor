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
 *  parameter replaced by "***". Everything else is left exactly as it was. */
export const masked = (s: string): string => s.replace(SECRET_RE, "$1***");

/** Fetches `url` and prints one line: status, content type, size, time; then the first `show` characters of the
 *  answer. A failure to connect is printed too, with its message: that is often the finding. */
export async function look(url: string, init: RequestInit & { show?: number; timeoutMs?: number } = {}): Promise<Look> {
  const t0 = Date.now(), show = init.show ?? 600, shown = masked(url);
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
