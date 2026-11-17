// Personal accounts: email + the person's own password (Shota, 16 Nov 2026).
//   sign-up   creates a pending account; the manager approves it
//   sign-in   issues the HMAC token (see auth.ts) for an active account
//   change    the signed-in person replaces their password
//   manager   lists accounts, approves, disables, enables, and resets a password to a temporary one that must be
//             replaced at the next sign-in ("forgot my password" goes through the manager; no email is sent)
// The manager is the email in the MONITOR_MANAGER_EMAIL secret. That account is created at the manager's first
// sign-in with the old shared password (MONITOR_PASSWORD), which then has to be changed: nobody can claim the
// manager's email by signing up first.
import { db } from "./db.ts";
import { signToken, type TokenPayload } from "./auth.ts";
import { clientIp, json, timingSafeEqual } from "./http.ts";

const ITER = 150_000;
const enc = new TextEncoder();
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));

async function hashPw(pw: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, key, 256)));
}
async function newHash(pw: string): Promise<{ pw_hash: string; pw_salt: string; pw_iter: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { pw_hash: await hashPw(pw, salt, ITER), pw_salt: hex(salt), pw_iter: ITER };
}

export interface Account { email: string; pw_hash: string; pw_salt: string; pw_iter: number; role: "manager" | "user"; status: "pending" | "active" | "disabled"; must_change: boolean; tokens_after: string; created_at: string; last_seen: string | null; logins: number }

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const cleanEmail = (v: unknown): string | null => { const s = String(v ?? "").trim().toLowerCase(); return s.length <= 254 && EMAIL.test(s) ? s : null; };
const pwProblem = (pw: string): string | null => (pw.length < 8 ? "Password: at least 8 characters" : pw.length > 128 ? "Password: at most 128 characters" : null);
const managerEmail = (): string => (Deno.env.get("MONITOR_MANAGER_EMAIL") ?? "").trim().toLowerCase();

async function getAccount(email: string): Promise<Account | null> {
  const { data } = await db.from("accounts").select("*").eq("email", email).maybeSingle();
  return (data as Account | null) ?? null;
}

// A short cache so the per-request account check costs one query a minute per person, not one per panel.
const seen = new Map<string, { at: number; a: Account | null }>();
const forget = (email: string) => seen.delete(email);

/** The account behind a verified token, or null when the token no longer stands (no such account, not active,
 *  or issued before the last password change, reset or disable). */
export async function accountFor(p: TokenPayload): Promise<Account | null> {
  const hit = seen.get(p.id);
  let a = hit && Date.now() - hit.at < 60_000 ? hit.a : undefined;
  if (a === undefined) { a = await getAccount(p.id); seen.set(p.id, { at: Date.now(), a }); }
  if (!a || a.status !== "active") return null;
  if (p.iat < Math.floor(new Date(a.tokens_after).getTime() / 1000)) return null;
  return a;
}

/** Ten failed attempts from one address in ten minutes close the door for that address. */
async function tooMany(ip: string): Promise<boolean> {
  const { count } = await db.from("login_attempts").select("*", { count: "exact", head: true }).eq("ip", ip).eq("ok", false).gte("at", new Date(Date.now() - 10 * 60e3).toISOString());
  return (count ?? 0) >= 10;
}
const ttlOf = (remember: boolean) => (remember ? 30 * 86400 : 12 * 3600);

export async function signup(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const ip = clientIp(req);
  if (await tooMany(ip)) return json(req, { error: "Too many attempts; wait ten minutes" }, 429);
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = cleanEmail(b.email);
  if (!email) return json(req, { error: "Enter a valid email address" }, 400);
  const pw = String(b.password ?? "");
  const bad = pwProblem(pw);
  if (bad) return json(req, { error: bad }, 400);
  await db.from("login_attempts").insert({ ip, ok: false });   // sign-ups count against the same limit
  if (email === managerEmail() || (await getAccount(email))) return json(req, { error: "An account with this email already exists. Sign in, or ask the manager to reset the password." }, 409);
  const { error } = await db.from("accounts").insert({ email, ...(await newHash(pw)), role: "user", status: "pending" });
  if (error) return json(req, { error: error.message }, 500);
  return json(req, { ok: true, pending: true });
}

export async function login(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const ip = clientIp(req);
  if (await tooMany(ip)) return json(req, { error: "Too many attempts; wait ten minutes" }, 429);
  const b = (await req.json().catch(() => ({}))) as { email?: string; id?: string; password?: string; remember?: boolean };
  const email = cleanEmail(b.email ?? b.id);
  const pw = String(b.password ?? "");
  const fail = async () => { await db.from("login_attempts").insert({ ip, ok: false }); return json(req, { error: "Wrong email or password" }, 401); };
  if (!email || !pw) return await fail();
  let a = await getAccount(email);
  if (!a && email === managerEmail()) {
    // the manager's first sign-in: the old shared password proves who it is, and has to be replaced straight away
    const shared = Deno.env.get("MONITOR_PASSWORD") ?? "";
    if (!shared || !timingSafeEqual(shared, pw)) return await fail();
    const { error } = await db.from("accounts").insert({ email, ...(await newHash(pw)), role: "manager", status: "active", must_change: true });
    if (error) return json(req, { error: error.message }, 500);
    a = await getAccount(email);
  }
  if (!a || !timingSafeEqual(await hashPw(pw, unhex(a.pw_salt), a.pw_iter), a.pw_hash)) return await fail();
  if (a.status === "pending") return json(req, { error: "Your account is waiting for the manager's approval" }, 403);
  if (a.status === "disabled") return json(req, { error: "This account is switched off. Contact the manager." }, 403);
  const remember = b.remember === true;
  const token = await signToken(email, ttlOf(remember));
  await db.from("login_attempts").insert({ ip, ok: true });
  await db.from("accounts").update({ last_seen: new Date().toISOString(), logins: a.logins + 1 }).eq("email", email);
  const { data: u } = await db.from("users").select("logins").eq("id", email).maybeSingle();
  await db.from("users").upsert({ id: email, last_seen: new Date().toISOString(), logins: (u?.logins ?? 0) + 1, remember }, { onConflict: "id" });
  return json(req, { token, id: email, role: a.role, mustChange: a.must_change, expiresIn: ttlOf(remember) });
}

/** The signed-in person replaces their password; every older session of theirs ends, and a fresh token comes back. */
export async function changePassword(req: Request, a: Account): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const ip = clientIp(req);
  if (await tooMany(ip)) return json(req, { error: "Too many attempts; wait ten minutes" }, 429);
  const b = (await req.json().catch(() => ({}))) as { current?: string; next?: string; remember?: boolean };
  const cur = String(b.current ?? ""), next = String(b.next ?? "");
  if (!timingSafeEqual(await hashPw(cur, unhex(a.pw_salt), a.pw_iter), a.pw_hash)) { await db.from("login_attempts").insert({ ip, ok: false }); return json(req, { error: "Current password is wrong" }, 401); }
  const bad = pwProblem(next);
  if (bad) return json(req, { error: bad }, 400);
  if (next === cur) return json(req, { error: "The new password must differ from the current one" }, 400);
  const at = new Date();
  const { error } = await db.from("accounts").update({ ...(await newHash(next)), must_change: false, tokens_after: at.toISOString() }).eq("email", a.email);
  if (error) return json(req, { error: error.message }, 500);
  forget(a.email);
  const remember = b.remember === true;
  return json(req, { ok: true, token: await signToken(a.email, ttlOf(remember)), expiresIn: ttlOf(remember) });
}

export async function adminUsers(req: Request): Promise<Response> {
  const { data, error } = await db.from("accounts").select("email,role,status,must_change,created_at,last_seen,logins").order("created_at");
  if (error) return json(req, { error: error.message }, 500);
  const { data: w } = await db.from("watchlists").select("user_id");
  const n = new Map<string, number>();
  for (const r of (w ?? []) as Array<{ user_id: string }>) n.set(r.user_id, (n.get(r.user_id) ?? 0) + 1);
  return json(req, { rows: (data ?? []).map((r) => ({ email: r.email, role: r.role, status: r.status, mustChange: r.must_change, createdAt: r.created_at, lastSeen: r.last_seen, logins: r.logins, watch: n.get(r.email) ?? 0 })) });
}

// A temporary password the manager can read out: no look-alike characters (0/O, 1/l/I).
const TEMP_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const tempPassword = (): string => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => TEMP_CHARS[x % TEMP_CHARS.length]).join("");

export async function adminSet(req: Request, me: Account): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const b = (await req.json().catch(() => ({}))) as { email?: string; op?: string };
  const email = cleanEmail(b.email);
  const target = email ? await getAccount(email) : null;
  if (!target) return json(req, { error: "No such account" }, 404);
  const now = new Date().toISOString();
  let patch: Record<string, unknown>, temp: string | undefined;
  switch (b.op) {
    case "approve": case "enable": patch = { status: "active" }; break;
    case "disable":
      if (target.email === me.email) return json(req, { error: "You cannot switch off your own account" }, 400);
      patch = { status: "disabled", tokens_after: now }; break;
    case "reset":
      temp = tempPassword();
      patch = { ...(await newHash(temp)), must_change: true, tokens_after: now }; break;
    default: return json(req, { error: "op: approve, enable, disable or reset" }, 400);
  }
  const { error } = await db.from("accounts").update(patch).eq("email", target.email);
  if (error) return json(req, { error: error.message }, 500);
  forget(target.email);
  return json(req, { ok: true, email: target.email, ...(temp ? { tempPassword: temp } : {}) });
}
