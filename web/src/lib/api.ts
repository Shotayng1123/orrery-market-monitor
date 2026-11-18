// Monitor API client. One Edge Function, one query parameter `action`, bearer token on every call.
import { keepClear } from "./keep";
import { netFail, netOk } from "./net";
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
  void keepClear();   // the data kept for opening without a connection belongs to the account that signed out
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
  let r: Response;
  try { r = await fetch(url(action, params), { ...init, headers }); }
  catch { netFail(); throw new ApiError(0, "No connection to the Monitor's server"); }
  netOk();
  if (r.status === 401) { clearToken(); window.dispatchEvent(new Event("om:unauth")); throw new ApiError(401, "Signed out"); }
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { throw new ApiError(r.status, `Bad response (${r.status})`); }
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
  return body as T;
}

type Result = { ok: true } | { ok: false; error: string };
async function post(action: string, body: unknown, auth = false): Promise<{ status: number; j: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = auth ? getToken() : null;
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(url(action), { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
const failed = (status: number, j: Record<string, unknown>, what: string): string => (typeof j.error === "string" ? j.error : status === 429 ? "Too many attempts; wait ten minutes" : `${what} failed (${status})`);

/** Sign in with the account's email and its own password. */
export async function login(email: string, password: string, remember: boolean): Promise<Result> {
  if (!apiConfigured) return { ok: false, error: "The Monitor API is not configured yet (VITE_API_URL)." };
  try {
    const { status, j } = await post("login", { email, password, remember });
    if (status !== 200 || typeof j.token !== "string") return { ok: false, error: failed(status, j, "Sign-in") };
    setToken(j.token, remember);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

/** How a new account is opened on this server: with a code sent by email, or (no email sender set up, or a
 *  server from before 18 Nov 2026, which answers this question with "unauthorised") by the manager's approval. */
export interface AuthInfo { signup: "email" | "approval"; codeMin: number; resendSec: number }
const BY_APPROVAL: AuthInfo = { signup: "approval", codeMin: 15, resendSec: 60 };
export async function authInfo(): Promise<AuthInfo> {
  if (!apiConfigured) return BY_APPROVAL;
  try {
    const r = await fetch(url("auth_info"), { headers: { accept: "application/json" } });
    if (!r.ok) return BY_APPROVAL;
    const j = (await r.json()) as Partial<AuthInfo>;
    const n = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
    return { signup: j.signup === "email" ? "email" : "approval", codeMin: n(j.codeMin, 15), resendSec: n(j.resendSec, 60) };
  } catch { return BY_APPROVAL; }
}

/** Create an account the older way (email + password); it can sign in once the manager has approved it. */
export async function signup(email: string, password: string): Promise<Result> {
  if (!apiConfigured) return { ok: false, error: "The Monitor API is not configured yet (VITE_API_URL)." };
  try {
    const { status, j } = await post("signup", { email, password });
    return status === 200 ? { ok: true } : { ok: false, error: failed(status, j, "Sign-up") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

/** A new account, step 1: ask for a 6-digit code to be emailed to the address. `sentAgo` is set when the server
 *  did not send because it had sent one moments ago: that code is still the one to enter. */
export async function signupStart(email: string): Promise<{ ok: true; sentAgo?: number } | { ok: false; error: string }> {
  if (!apiConfigured) return { ok: false, error: "The Monitor API is not configured yet (VITE_API_URL)." };
  try {
    const { status, j } = await post("signup_start", { email });
    if (status === 200) return { ok: true };
    if (status === 429 && j.why === "gap" && typeof j.waitSec === "number" && typeof j.resendSec === "number") return { ok: true, sentAgo: Math.max(0, j.resendSec - j.waitSec) };
    return { ok: false, error: failed(status, j, "Sending the code") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

/** A new account, step 2: the code from the email and the person's password. On success they are signed in. */
export async function signupFinish(email: string, code: string, password: string, remember: boolean): Promise<Result> {
  try {
    const { status, j } = await post("signup_finish", { email, code, password, remember });
    if (status !== 200 || typeof j.token !== "string") return { ok: false, error: failed(status, j, "Creating the account") };
    setToken(j.token, remember);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

/** Replace the signed-in person's password. Older sessions end; this browser gets a fresh token. */
export async function changePassword(current: string, next: string): Promise<Result> {
  try {
    let remember = false;
    try { remember = localStorage.getItem(KEY) != null; } catch { /* ignore */ }
    const { status, j } = await post("change_password", { current, next, remember }, true);
    if (status !== 200 || typeof j.token !== "string") return { ok: false, error: failed(status, j, "Password change") };
    setToken(j.token, remember);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

export interface Me { email: string; role: "manager" | "user"; mustChange: boolean }
export interface AccountRow { email: string; role: "manager" | "user"; status: "pending" | "active" | "disabled"; mustChange: boolean; createdAt: string; lastSeen: string | null; logins: number; watch: number; verifiedAt?: string | null }
/** The manager's list. `signup` and `mail` are missing from a server older than 18 Nov 2026. */
export interface AdminUsers { rows: AccountRow[]; signup?: "email" | "approval"; mail?: { ready: boolean; from: string | null; via: string | null; problem: string | null } }

/** Manager only: approve, enable, disable, or reset a password (the reply carries the temporary password once). */
export async function adminSet(email: string, op: "approve" | "enable" | "disable" | "reset"): Promise<{ ok: true; tempPassword?: string } | { ok: false; error: string }> {
  try {
    const { status, j } = await post("admin_set", { email, op }, true);
    if (status !== 200) return { ok: false, error: failed(status, j, "Change") };
    return { ok: true, tempPassword: typeof j.tempPassword === "string" ? j.tempPassword : undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

/** Manager only: send one email to the manager's own address through the sender the server has, to see it work. */
export async function mailTest(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  try {
    const { status, j } = await post("mail_test", {}, true);
    if (status !== 200) return { ok: false, error: failed(status, j, "The test email") };
    return { ok: true, to: typeof j.to === "string" ? j.to : "your address" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}
