// COPY of supabase/functions/_shared/pf/statement.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// The statement an account agrees to before its first paper portfolio or its first note, whichever comes first.
// Version 1 is the owner's wording, chosen on 20 Nov 2026 ("go with B": option (b)). It is placed, never reworded: a
// change of words is a version 2, asked again of every account. The database keeps the same text
// (supabase/migrations/20261121000001_pf_store.sql seeds consent_statements with it) and supabase/README.md quotes the
// owner's record; sim/logic.test.ts compares this file's words with the seed, and sim/readme.test.ts the README's
// quote with the seed, character for character. The box of the record ("☐") is the checkbox itself; its label is
// "I agree".
export const STATEMENT_VERSION = 1;
export const STATEMENT_TEXT = "Private notes, levels and paper portfolios are kept for your account only. Do not enter non-public or confidential information, in notes or in positions: nothing material and non-public about a company or a market, and nothing confidential of your firm or its clients.";
export const STATEMENT_LABEL = "I agree";
/** The owner's record of the wording, as one piece: the text, the box, its label. */
export const STATEMENT_RECORD = `${STATEMENT_TEXT} ☐ ${STATEMENT_LABEL}`;

/** The card's title: which first use asks. */
export const STATEMENT_TITLE = { portfolio: "Before your first paper portfolio", note: "Before your first note" } as const;
/** Under every note box and every reason: the statement's gist, not a second statement. */
export const NOTE_GIST = "Notes are for your own reasoning. Do not enter non-public or confidential information.";
/** What the page says when a create is left without the agreement. */
export const NOT_AGREED = "Not created: the statement was not agreed.";
