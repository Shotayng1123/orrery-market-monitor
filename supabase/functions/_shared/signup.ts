// Creating an account by email (Shota, 18 Nov 2026): the rules, with no database and no network in this file
// so they can be checked on their own (sim/logic.test.ts).
//   1  the person gives an email address; the Monitor emails it a 6-digit code
//   2  they enter the code and choose a password; the account is active and they are signed in
// The manager's approval is no longer part of it: receiving the code is what proves the address is theirs.
//
// A 6-digit code is short, so it is fenced in: valid for 15 minutes, void after 5 wrong tries, and only the
// newest code for an address counts. Sending is limited too (per address, per network address, and in total per
// day), so the form cannot be used to mail strangers or to use up the sender's daily allowance. The limits are
// the numbers below; they are applied inside the database (email_code_issue and email_code_check in
// supabase/migrations/20261118000003_signup_by_email.sql), one request at a time, so a burst cannot slip past.
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
    case "gap": return { status: 429, error: `A code was sent a moment ago. A new one can be sent in ${Math.max(1, waitSec)} s.`, waitSec: Math.max(1, waitSec) };
    case "email_hour": return { status: 429, error: `Too many codes were sent to this address. Try again in ${Math.max(1, Math.ceil(waitSec / 60))} min.`, waitSec: Math.max(1, waitSec) };
    case "ip_hour": return { status: 429, error: "Too many accounts were asked for from this network in the last hour. Try again later." };
    case "day": return { status: 429, error: "The Monitor has sent as many codes as it sends in a day. Try again tomorrow." };
    default: return { status: 500, error: "The code could not be prepared" };
  }
}

/** The words for a try at the code that did not pass (email_code_check decides; this names its answer). */
export function checkRefusal(status: string, triesLeft: number): string | null {
  switch (status) {
    case "ok": return null;
    case "wrong": return triesLeft > 0 ? `That code is not right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.` : "That code is not right, and it can no longer be used. Send a new code.";
    case "none": return "No code is waiting for this address. Send a new code.";
    case "expired": return "This code has expired. Send a new code.";
    case "spent": return "Too many wrong tries. Send a new code.";
    default: return "The code could not be checked";
  }
}

/** The email that carries the code. Plain words only: no links to press, so it cannot be mistaken for phishing. */
export function codeMail(code: string): { subject: string; text: string; html: string } {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const text = [
    `Your Orrery Monitor code is ${spaced}`,
    "",
    `Enter it on the page where you are creating your account. It is valid for ${CODE_TTL_MIN} minutes.`,
    "",
    "If you did not ask for this, ignore this email: no account is created without the code.",
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">`
    + `<p style="margin:0 0 10px">Your Orrery Monitor code is</p>`
    + `<p style="margin:0 0 14px;font-size:30px;font-weight:700;letter-spacing:4px;font-family:Menlo,Consolas,monospace">${spaced}</p>`
    + `<p style="margin:0 0 10px">Enter it on the page where you are creating your account. It is valid for ${CODE_TTL_MIN} minutes.</p>`
    + `<p style="margin:0;color:#666;font-size:13px">If you did not ask for this, ignore this email: no account is created without the code.</p></div>`;
  return { subject: `${spaced} is your Orrery Monitor code`, text, html };
}
