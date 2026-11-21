// COPY of supabase/functions/_shared/pf/words.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// The paper portfolio's refusals that the store itself makes (P-1), in the words the page shows. The database raises
// the same sentences (supabase/migrations/20261121000001_pf_store.sql); sim/sql/pf.test.cjs compares the two.
export const NOT_YET = "Paper portfolios are not available yet.";
export const NO_SUCH = "No such paper portfolio in your account.";
export const NEEDS_STATEMENT = "the statement is not agreed";
export const OLD_VERSION = "this is not the statement's current version";
export const NAME_TAKEN = "you already have an open portfolio with this name";
export const NOT_ITS_NAME = "that is not this portfolio's name";
export const FIXED_SETTING = "this setting is fixed at creation";
export const TOGETHER = "the targets are re-set together, in their window";
export const FIXED_TARGETS = "the targets are fixed under \"since the start\"";
export const WINDOW_CLOSED = "the targets can be re-set from 1 Dec to the January reset";
export const NEVER_BACK = "a change is in force from the next session, never backwards";
export const REASON_SHORT = "give a reason of at least 10 characters: it is kept in the history";
export const REASON_LONG = "500 characters at most";
export const NOTE_LONG = "2,000 characters at most";
export const NO_NOTE = "no such note";
/** The status a store's refusal travels with: a portfolio that is not the account's is not found; a missing
 *  agreement asks for the statement; the rest are the asker's to put right. */
export const refusalStatus = (message: string): number => (message === NO_SUCH ? 404 : message === NEEDS_STATEMENT ? 409 : 400);
