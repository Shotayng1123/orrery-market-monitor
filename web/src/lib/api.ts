// Monitor API client. One Edge Function, one query parameter `action`, bearer token on every call.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
export const apiConfigured = BASE.length > 0;

const KEY = "om_token";
export function getToken(): string | null {
  try { return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY); } catch { return null; }
}
export function setToken(token: string, remember: boolean): void {
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, token);
    (remember ? sessionStorage : localStorage).removeItem(KEY);
  } catch { /* storage blocked: the session still works in memory via the caller */ }
}
export function clearToken(): void {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
/** The ID inside the token (the payload is readable; the signature is what the server checks). */
export function tokenId(token: string | null): string | null {
  if (!token) return null;
  try { const body = token.split(".")[0]; return (JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { id?: string }).id ?? null; } catch { return null; }
}

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

type Params = Record<string, string | number | boolean | undefined>;
function url(action: string, params?: Params): string {
  const q = new URLSearchParams({ action });
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) q.set(k, String(v));
  return `${BASE}?${q.toString()}`;
}

export async function api<T>(action: string, params?: Params, init?: RequestInit): Promise<T> {
  if (!apiConfigured) throw new ApiError(0, "The Monitor API is not configured (VITE_API_URL).");
  const token = getToken();
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const r = await fetch(url(action, params), { ...init, headers });
  if (r.status === 401) { clearToken(); window.dispatchEvent(new Event("om:unauth")); throw new ApiError(401, "Signed out"); }
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { throw new ApiError(r.status, `Bad response (${r.status})`); }
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
  return body as T;
}

export async function login(id: string, password: string, remember: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!apiConfigured) return { ok: false, error: "The Monitor API is not configured yet (VITE_API_URL)." };
  try {
    const r = await fetch(url("login"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, password, remember }) });
    const j = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!r.ok || !j.token) return { ok: false, error: j.error ?? (r.status === 429 ? "Too many attempts, wait a minute" : `Sign-in failed (${r.status})`) };
    setToken(j.token, remember);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
