// Creating an account by email (Shota, 18 Nov 2026): the rules, with no database and no network in this file
// so they can be checked on their own (sim/logic.test.ts).
//   1  the person gives an email address; the Monitor sends it an email with a "Verify my email" button
//   2  the button opens the Monitor with the address confirmed; they choose a password and are signed in
// The button carries a 6-digit code, which the email also shows: on a phone the button opens the browser, so
// someone using the Home Screen app types the code there instead. The manager's approval is no longer part of
// it: receiving the email is what proves the address is theirs.
//
// A 6-digit code is short, so it is fenced in: valid for 15 minutes, void after 5 wrong tries, and only the
// newest code for an address counts. Sending is limited too (per address, per network address, and in total per
// day), so the form cannot be used to mail strangers or to use up the sender's daily allowance. The limits are
// the numbers below; they are applied inside the database (email_code_issue and email_code_check in
// supabase/migrations/20261118000003_signup_by_email.sql), one request at a time, so a burst cannot slip past.
//
// Nobody but the manager may learn whose address has an account. So asking for an email is answered the same
// way for every address; one that already has an account is sent a note saying so (noticeMail) instead of a button.
export const CODE_TTL_MIN = 15;
export const CODE_MAX_TRIES = 5;
export const RESEND_GAP_SEC = 60;      // between two codes to one address
export const PER_EMAIL_HOUR = 5;       // codes to one address in an hour
export const PER_IP_HOUR = 10;         // addresses one network address may ask for in an hour
export const PER_DAY_ALL = 200;        // addresses in a day, everyone together

const enc = new TextEncoder();
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Six digits, every value equally likely (a plain remainder of a random number would favour the low codes).
 *  `next` gives a random whole number from 0 to 2^32 - 1. */
export function newCode(next: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  const LIMIT = 4_294_000_000;   // the largest multiple of 1,000,000 that 32 bits can reach; numbers above it are drawn again
  for (;;) { const n = next(); if (n < LIMIT) return String(n % 1_000_000).padStart(6, "0"); }
}

/** What is stored instead of the code: an HMAC with the server's secret, tied to the address it was sent to. */
export async function codeHash(secret: string, email: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`signup|${email}|${code}`))));
}

/** The code as typed: spaces and dashes dropped (people copy "123 456"); null unless six digits remain. */
export const cleanCode = (v: unknown): string | null => { const s = String(v ?? "").replace(/[\s-]/g, ""); return /^\d{6}$/.test(s) ? s : null; };

export interface Refusal { status: number; error: string; waitSec?: number }
export type IssueStatus = "ok" | "gap" | "email_hour" | "ip_hour" | "day";
export type CheckStatus = "ok" | "wrong" | "none" | "expired" | "spent";

/** The words for a code that was not sent (the database function email_code_issue decides; this names its answer). */
export function sendRefusal(status: string, waitSec: number): Refusal | null {
  switch (status) {
    case "ok": return null;
    case "gap": return { status: 429, error: `An email was sent a moment ago. A new one can be sent in ${Math.max(1, waitSec)} s.`, waitSec: Math.max(1, waitSec) };
    case "email_hour": return { status: 429, error: `Too many emails were sent to this address. Try again in ${Math.max(1, Math.ceil(waitSec / 60))} min.`, waitSec: Math.max(1, waitSec) };
    case "ip_hour": return { status: 429, error: "Too many accounts were asked for from this network in the last hour. Try again later." };
    case "day": return { status: 429, error: "The Monitor has sent as many emails as it sends in a day. Try again tomorrow." };
    default: return { status: 500, error: "The email could not be prepared" };
  }
}

/** The words for a try at the code that did not pass (email_code_check decides; this names its answer). */
export function checkRefusal(status: string, triesLeft: number): string | null {
  switch (status) {
    case "ok": return null;
    case "wrong": return triesLeft > 0 ? `That code is not right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.` : "That code is not right, and it can no longer be used. Send a new email.";
    case "none": return "Nothing is waiting to be verified for this address. Send a new email.";
    case "expired": return "This email is older than its 15 minutes. Send a new email.";
    case "spent": return "Too many wrong tries. Send a new email.";
    default: return "The code could not be checked";
  }
}

/** What the button in the email opens: the Monitor's page with the code and the address after the #, a part of
 *  an address that browsers keep to themselves (it is not sent to the server the page comes from). The web reads
 *  it in web/src/lib/verify.ts. */
export function verifyLink(site: string, email: string, code: string): string {
  return `${site}#verify=${code}.${btoa(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FRAME = (inner: string): string => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:480px">${inner}</div>`;

/** The email with the button. One link only, to the Monitor's own page; the code is the same key for where a
 *  button is no use (the Home Screen app). */
export function codeMail(code: string, link: string): { subject: string; text: string; html: string } {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const text = [
    "Verify your email address to finish creating your Orrery Monitor account. Open this link and choose your password:",
    "",
    link,
    "",
    `Using the Orrery Monitor from your phone's Home Screen? Enter this code there instead: ${spaced}`,
    "",
    `The link and the code are valid for ${CODE_TTL_MIN} minutes.`,
    "If you did not ask for an account, ignore this email: none is created unless the link or the code is used.",
  ].join("\n");
  const html = FRAME(
    `<p style="margin:0 0 16px">Verify your email address to finish creating your Orrery Monitor account.</p>`
    + `<p style="margin:0 0 18px"><a href="${esc(link)}" style="display:inline-block;background:#ff6f61;color:#141005;font-weight:700;font-size:16px;text-decoration:none;padding:13px 26px;border-radius:8px">Verify my email</a></p>`
    + `<p style="margin:0 0 6px">Using the Orrery Monitor from your phone's Home Screen? Enter this code there instead:</p>`
    + `<p style="margin:0 0 16px;font-size:26px;font-weight:700;letter-spacing:4px;font-family:Menlo,Consolas,monospace">${spaced}</p>`
    + `<p style="margin:0;color:#666;font-size:13px">The button and the code are valid for ${CODE_TTL_MIN} minutes. If you did not ask for an account, ignore this email: none is created unless the button or the code is used.</p>`);
  return { subject: "Verify your email for Orrery Monitor", text, html };
}

/** The email to an address that asked for a new account but cannot have one: it has one already ("have"), or its
 *  account was switched off by the manager ("off"). The page shows the asker nothing of this; only the mailbox's
 *  owner reads it. */
export function noticeMail(kind: "have" | "off", site: string): { subject: string; text: string; html: string } {
  const first = "Someone, probably you, asked to create an Orrery Monitor account with this email address.";
  const then = kind === "have"
    ? "The address already has an account, so nothing was created. Open the Monitor and sign in with your password; if you have forgotten it, ask the Monitor's manager to reset it."
    : "The account for this address has been switched off, so nothing was created. Please contact the Monitor's manager.";
  const last = "If it was not you, there is nothing to do: nobody was let in.";
  const text = [first, "", then, ...(kind === "have" ? ["", site] : []), "", last].join("\n");
  const html = FRAME(`<p style="margin:0 0 12px">${first}</p><p style="margin:0 0 12px">${then}</p>`
    + (kind === "have" ? `<p style="margin:0 0 12px"><a href="${esc(site)}">${esc(site)}</a></p>` : "")
    + `<p style="margin:0;color:#666;font-size:13px">${last}</p>`);
  return { subject: "Your Orrery Monitor account", text, html };
}
