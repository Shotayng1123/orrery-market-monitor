// HTTP helpers shared by the Edge Functions: CORS for the Pages origin, JSON responses, cron auth, fetch.
export const ALLOWED_ORIGINS = ["https://shotayng1123.github.io", "http://127.0.0.1:5173", "http://localhost:5173"];

export function corsHeaders(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-report-secret",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders(req), ...extra } });
}

/** pg_cron (via monitor_call) sends x-cron-secret; a service-role bearer is accepted for manual runs. */
export function isCron(req: Request): boolean {
  const s = Deno.env.get("CRON_SECRET") ?? "";
  const h = req.headers.get("x-cron-secret") ?? "";
  if (s && h && timingSafeEqual(s, h)) return true;
  const auth = req.headers.get("authorization") ?? "";
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return !!svc && auth === `Bearer ${svc}`;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let r = 0;
  for (let i = 0; i < ea.length; i++) r |= ea[i] ^ eb[i];
  return r === 0;
}

export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 30000): Promise<string> {
  const r = await fetch(url, { ...init, headers: { "user-agent": BROWSER_UA, accept: "*/*", ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 120)}`);
  return await r.text();
}

export async function fetchJson<T>(url: string, timeoutMs = 30000): Promise<T> {
  const t = await fetchText(url, { headers: { accept: "application/json" } }, timeoutMs);
  return JSON.parse(t) as T;
}

export const clientIp = (req: Request): string => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
