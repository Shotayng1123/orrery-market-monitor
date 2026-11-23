// The server's switch for the paper portfolio, and its preview.
//
// P-1 to P-4a go live together: a paper book whose limits and ladder are not yet enforced would start a record under
// rules that change midway. Until P-4a is accepted this stays false, and every portfolio route of the API refuses
// ("Paper portfolios are not available yet.") before it reads or writes anything; the tables are deployed, empty.
// To turn the paper book on: set this to true here, and PAPER_ON_LIVE_SITE to true in web/src/lib/paper.ts, in the
// same pull request (README.md, "The paper portfolio's two switches"; supabase/README.md, "The paper portfolio").
export const PAPER_ON_SERVER = false;

// The preview (the owner, 23 Nov 2026: "Yeah just turn on for me for now and you can keep refining them"): while the
// switch is off, the paper book is open to the accounts whose sign-in email is in the server's secret
// PF_PREVIEW_EMAILS, and to no other. The list is kept only in the repository secret of that name, which deploy-server
// stores on the server (README.md, "The paper portfolio's two switches"); no address is written anywhere else. One or
// more addresses, comma-separated, each compared trimmed and without regard to case. Absent or empty: nobody.
// This file imports nothing: the logic checks read it with only jobs/ installed.

/** The preview list as the server's secret holds it: each address trimmed and in lower case; empty pieces dropped. */
export function previewList(raw: string | null | undefined): ReadonlySet<string> {
  return new Set(String(raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0));
}

/** Whether this signed-in account is in the preview list. No account, or an empty email, is in no list. */
export function inPreview(list: ReadonlySet<string>, email: string | null | undefined): boolean {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  return e.length > 0 && list.has(e);
}

/** Whether the portfolio routes admit this account: the switch on, or the account in the preview list. A request
 *  with no account is admitted by neither (the API refuses it before, unsigned). */
export function paperOpen(on: boolean, list: ReadonlySet<string>, email: string | null | undefined): boolean {
  const signed = typeof email === "string" && email.trim().length > 0;
  return signed && (on || inPreview(list, email));
}

/** What the API's `me` tells the signed-in page (`paperPreview`): true only for an account in the preview list while
 *  the switch is off. The page then draws the paper book, marked as a preview. Once the switch is on this is false for
 *  everyone, and the page draws the book by its own switch. It says nothing of any other account. */
export const previewFor = (on: boolean, list: ReadonlySet<string>, email: string | null | undefined): boolean => !on && inPreview(list, email);
