// Sending an email from the Monitor (today: the code that checks a new account's address). Two ways, chosen by
// which secrets the functions have (supabase/README.md, "Accounts by email"):
//   RESEND_API_KEY + MAIL_FROM     Resend's web API. The sender address must be on a domain verified at Resend.
//   SMTP_USER + SMTP_PASS          a mailbox's own server over port 465 (default smtp.gmail.com: the Gmail address
//                                  and an app password). MAIL_FROM is optional (default: SMTP_USER).
// With neither, mailSetup() is null and the Monitor keeps the older rule: a new account waits for the manager.
import { parseFrom, smtpSend, type Address } from "./smtp.ts";

export interface Mail { to: string; subject: string; text: string; html?: string }
export type MailSetup =
  | { kind: "resend"; from: Address; key: string }
  | { kind: "smtp"; from: Address; host: string; port: number; user: string; pass: string };

type Env = (name: string) => string | undefined;
const denoEnv: Env = (name) => Deno.env.get(name);

/** How mail is sent, read from the secrets; null when none is set up. Throws when the set-up is half done or
 *  cannot work, with words the manager can act on (shown by "send a test email"). */
export function mailSetup(env: Env = denoEnv): MailSetup | null {
  const v = (k: string) => (env(k) ?? "").trim();
  const key = v("RESEND_API_KEY"), user = v("SMTP_USER"), pass = env("SMTP_PASS") ?? "";
  if (!key && !user && !pass.trim()) return null;
  const fromText = v("MAIL_FROM") || (key ? "" : user);
  const from = parseFrom(fromText);
  if (!from) throw new Error(fromText ? "MAIL_FROM is not an email address (use name@example.com or Name <name@example.com>)" : "MAIL_FROM is not set: the address the Monitor's emails come from");
  if (!from.name) from.name = "Orrery Monitor";
  if (key) return { kind: "resend", from, key };
  if (!user || !pass.trim()) throw new Error("SMTP_USER and SMTP_PASS must both be set");
  const host = v("SMTP_HOST") || "smtp.gmail.com", port = Number(v("SMTP_PORT") || "465");
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("SMTP_HOST is not a host name");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is not a port number");
  if (port === 25 || port === 587) throw new Error(`SMTP_PORT ${port} cannot be used: Supabase does not let a function reach ports 25 and 587. Use the server's encrypted port, 465.`);
  return { kind: "smtp", from, host, port, user, pass };
}

/** True when an email can be sent (a half-done set-up counts as not ready). */
export function mailReady(env: Env = denoEnv): boolean { try { return mailSetup(env) != null; } catch { return false; } }

/** The request to Resend for one message (https://resend.com/docs/api-reference/emails/send-email). */
export function resendRequest(s: { from: Address; key: string }, m: Mail): { url: string; init: RequestInit } {
  return { url: "https://api.resend.com/emails", init: { method: "POST", headers: { authorization: `Bearer ${s.key}`, "content-type": "application/json" }, body: JSON.stringify({ from: `${s.from.name} <${s.from.email}>`, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }) } };
}

/** Sends one message; resolves with the sender's answer, throws with its refusal. */
export async function sendMail(m: Mail, env: Env = denoEnv): Promise<string> {
  const s = mailSetup(env);
  if (!s) throw new Error("no email sender is set up on the server");
  if (s.kind === "smtp") return await smtpSend(s, { from: s.from, ...m });
  const { url, init } = resendRequest(s, m);
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const text = (await r.text()).slice(0, 400);
  if (!r.ok) throw new Error(`Resend refused the message: ${r.status} ${text}`);
  return text;
}
