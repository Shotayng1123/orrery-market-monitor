// Personal accounts: email + the person's own password (Shota, 16 Nov 2026; by emailed code since 18 Nov 2026).
//   sign-up   the person gives an email address and is sent a 6-digit code (signupStart); the code and a password
//             of their own open the account and sign them in (signupFinish). No approval by the manager.
//             On a server with no email sender set up (mail.ts) the older rule still holds: sign-up creates a
//             pending account and the manager approves it.
//   sign-in   issues the HMAC token (see auth.ts) for an active account
//   change    the signed-in person replaces their password
//   manager   lists accounts, switches one off (and on again), and resets a password to a temporary one that
//             must be replaced at the next sign-in ("forgot my password" still goes through the manager)
// The manager is the email in the MONITOR_MANAGER_EMAIL secret. That account is created at the manager's first
// sign-in with the old shared password (MONITOR_PASSWORD), which then has to be changed: nobody can claim the
// manager's email by signing up first.
import { db } from "./db.ts";
import { signToken, type TokenPayload } from "./auth.ts";
import { clientIp, json, timingSafeEqual } from "./http.ts";
import { mailReady, mailSetup, sendMail } from "./mail.ts";
import { CODE_MAX_TRIES, CODE_TTL_MIN, PER_DAY_ALL, PER_EMAIL_HOUR, PER_IP_HOUR, RESEND_GAP_SEC, checkRefusal, cleanCode, codeHash, codeMail, newCode, sendRefusal } from "./signup.ts";

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

export interface Account { email: string; pw_hash: string; pw_salt: string; pw_iter: number; role: "manager" | "user"; status: "pending" | "active" | "disabled"; must_change: boolean; tokens_after: string; created_at: string; last_seen: string | null; logins: number; verified_at?: string | null }

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

/** What the sign-in screen has to know before anyone is signed in: how a new account is opened here. */
export function authInfo(req: Request): Response {
  return json(req, { signup: mailReady() ? "email" : "approval", codeMin: CODE_TTL_MIN, resendSec: RESEND_GAP_SEC });
}

const TAKEN = "This email already has an account. Sign in instead; a forgotten password is reset by the manager.";
const OFF = "This account is switched off. Contact the manager.";
/** Why this address cannot open a new account, or null when it can (no account yet, or one still unverified). */
async function taken(email: string): Promise<{ status: number; error: string } | null> {
  const a = await getAccount(email);
  if (a?.status === "disabled") return { status: 403, error: OFF };
  if (a?.status === "active" || (!a && email === managerEmail())) return { status: 409, error: TAKEN };
  return null;
}
const codeSecret = (): string => { const s = Deno.env.get("MONITOR_TOKEN_SECRET") ?? ""; if (s.length < 16) throw new Error("MONITOR_TOKEN_SECRET is not set"); return s; };

/** Step 1 of a new account: email the address a 6-digit code. */
export async function signupStart(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  if (!mailReady()) return json(req, { error: "Accounts by email are not set up on the server yet" }, 503);
  const ip = clientIp(req);
  if (await tooMany(ip)) return json(req, { error: "Too many attempts; wait ten minutes" }, 429);
  const b = (await req.json().catch(() => ({}))) as { email?: string };
  const email = cleanEmail(b.email);
  if (!email) return json(req, { error: "Enter a valid email address" }, 400);
  const no = await taken(email);
  if (no) { await db.from("login_attempts").insert({ ip, ok: false }); return json(req, { error: no.error }, no.status); }   // asking which addresses have accounts is rationed like wrong passwords
  const code = newCode();
  const { data, error } = await db.rpc("email_code_issue", { p_email: email, p_hash: await codeHash(codeSecret(), email, code), p_ip: ip, p_ttl_min: CODE_TTL_MIN, p_gap_sec: RESEND_GAP_SEC, p_per_email_hour: PER_EMAIL_HOUR, p_per_ip_hour: PER_IP_HOUR, p_per_day: PER_DAY_ALL });
  if (error) return json(req, { error: error.message }, 500);
  const r = ((data ?? []) as Array<{ status: string; wait_sec: number }>)[0];
  const refused = sendRefusal(r?.status ?? "", r?.wait_sec ?? 0);
  if (refused) return json(req, { error: refused.error, why: r?.status ?? "", resendSec: RESEND_GAP_SEC, ...(refused.waitSec ? { waitSec: refused.waitSec } : {}) }, refused.status);
  try { await sendMail({ to: email, ...codeMail(code) }); } catch (e) {
    console.error("sign-up email not sent:", e instanceof Error ? e.message : String(e));
    await db.rpc("email_code_void", { p_email: email });
    return json(req, { error: "The email could not be sent. Try again in a minute; if it keeps failing, tell the manager." }, 502);
  }
  return json(req, { ok: true, email, codeMin: CODE_TTL_MIN, resendSec: RESEND_GAP_SEC });
}

/** Step 2: the code from the email and a password. The account is active at once and the reply signs it in. */
export async function signupFinish(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  const ip = clientIp(req);
  if (await tooMany(ip)) return json(req, { error: "Too many attempts; wait ten minutes" }, 429);
  const b = (await req.json().catch(() => ({}))) as { email?: string; code?: string; password?: string; remember?: boolean };
  const email = cleanEmail(b.email);
  if (!email) return json(req, { error: "Enter a valid email address" }, 400);
  const code = cleanCode(b.code);
  if (!code) return json(req, { error: "Enter the 6-digit code from the email" }, 400);
  const pw = String(b.password ?? "");
  const bad = pwProblem(pw);
  if (bad) return json(req, { error: bad }, 400);
  const no = await taken(email);
  if (no) return json(req, { error: no.error }, no.status);
  const { data, error: e1 } = await db.rpc("email_code_check", { p_email: email, p_hash: await codeHash(codeSecret(), email, code), p_max_tries: CODE_MAX_TRIES });
  if (e1) return json(req, { error: e1.message }, 500);
  const r = ((data ?? []) as Array<{ status: string; tries_left: number }>)[0];
  const refused = checkRefusal(r?.status ?? "", r?.tries_left ?? 0);
  if (refused) { await db.from("login_attempts").insert({ ip, ok: false }); return json(req, { error: refused }, 400); }
  // the address is theirs: open the account (an older sign-up still waiting for approval is taken over by its owner)
  const at = new Date().toISOString(), remember = b.remember === true;
  const { error } = await db.from("accounts").upsert({ email, ...(await newHash(pw)), role: "user", status: "active", must_change: false, tokens_after: at, verified_at: at, last_seen: at, logins: 1 }, { onConflict: "email" });
  if (error) return json(req, { error: error.message }, 500);
  forget(email);
  const token = await signToken(email, ttlOf(remember));
  await db.from("login_attempts").insert({ ip, ok: true });
  await db.from("users").upsert({ id: email, last_seen: at, logins: 1, remember }, { onConflict: "id" });
  return json(req, { token, id: email, role: "user", mustChange: false, expiresIn: ttlOf(remember) });
}

/** The older sign-up (email + password, then the manager approves): only where no email sender is set up. */
export async function signup(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  if (mailReady()) return json(req, { error: "Accounts are now opened with a code sent by email. Reload the page and create the account again." }, 400);
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
  if (a.status === "pending") return json(req, { error: mailReady() ? "This email address has not been confirmed yet. Choose CREATE ACCOUNT to get a code by email." : "Your account is waiting for the manager's approval" }, 403);
  if (a.status === "disabled") return json(req, { error: OFF }, 403);
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
  const { data, error } = await db.from("accounts").select("*").order("created_at");
  if (error) return json(req, { error: error.message }, 500);
  const { data: w } = await db.from("watchlists").select("user_id");
  const n = new Map<string, number>();
  for (const r of (w ?? []) as Array<{ user_id: string }>) n.set(r.user_id, (n.get(r.user_id) ?? 0) + 1);
  let mail: { ready: boolean; from: string | null; via: string | null; problem: string | null };
  try { const m = mailSetup(); mail = { ready: !!m, from: m?.from.email ?? null, via: m ? (m.kind === "resend" ? "Resend" : m.host) : null, problem: null }; }
  catch (e) { mail = { ready: false, from: null, via: null, problem: e instanceof Error ? e.message : String(e) }; }
  return json(req, { signup: mail.ready ? "email" : "approval", mail, rows: ((data ?? []) as Account[]).map((r) => ({ email: r.email, role: r.role, status: r.status, mustChange: r.must_change, createdAt: r.created_at, lastSeen: r.last_seen, logins: r.logins, verifiedAt: r.verified_at ?? null, watch: n.get(r.email) ?? 0 })) });
}

/** Manager only: one email to the manager's own address through the sender that is set up, so a mistake in the
 *  set-up shows here (with the mail server's own words) and not as people who cannot create an account. */
export async function mailTest(req: Request, me: Account): Promise<Response> {
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  try {
    if (!mailSetup()) return json(req, { error: "No email sender is set up on the server (supabase/README.md, Accounts by email)" }, 503);
    const answer = await sendMail({ to: me.email, subject: "Orrery Monitor: test email", text: "This is the test email you asked the Orrery Monitor to send.\n\nIt arrived, so the Monitor can email a code to someone who creates an account." });
    return json(req, { ok: true, to: me.email, answer: answer.slice(0, 200) });
  } catch (e) { return json(req, { error: e instanceof Error ? e.message : String(e) }, 502); }
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
  // a switched-off account gets no more alerts on its phone; its watchlist stays for when it is switched on again
  if (b.op === "disable") await db.from("push_subs").delete().eq("user_id", target.email);
  return json(req, { ok: true, email: target.email, ...(temp ? { tempPassword: temp } : {}) });
}
