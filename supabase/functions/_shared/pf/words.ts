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
// What a portfolio may hold (the second review of P-1, SQ-4 and RT-7). Every row is kept, so a full history refuses the
// next entry in these words; nothing is ever dropped to make room. pf_get returns a portfolio whole, so these bound
// one answer too. The numbers are the engineer's, for the PMs to accept (C/portfolio-plan.md §0.7).
export const NOTES_MAX = 500, CHANGES_MAX = 500, RENAMES_MAX = 50, RESETS_MAX = 20;
export const NOTES_FULL = "this portfolio holds 500 notes, the most one may hold: every note is kept (a removed one keeps its line), so no further note can be saved";
export const CHANGES_FULL = "this portfolio's history holds 500 changes of its limits and assumptions, the most one may hold: every change is kept, so no further change can be saved";
export const RENAMES_FULL = "this portfolio has been renamed 50 times, the most one may be: every name is kept in its history, so it keeps the name it has";
export const resetsFull = (year: number): string => `the targets for ${year} have been entered 20 times, the most a year may hold: every entry is kept, and the last one stands`;
/** A create whose request id has made a book already, with other settings than these (RT-4): nothing new is made. */
export const madeBefore = (name: string): string => `an earlier press of this form created "${name}", with other settings: nothing new was created`;
/** A change whose session cannot be named: the holiday rows end before it, or could not be read (EN-15). */
export const calendarPast = (year: string): string => `the holiday calendar is not held for ${year}, so the session a change is in force from cannot be named`;
export const CALENDAR_UNREAD = "the holiday calendar could not be read, so the session a change is in force from cannot be named";
/** The status a store's refusal travels with: a portfolio that is not the account's is not found; a missing
 *  agreement asks for the statement; the rest are the asker's to put right. */
export const refusalStatus = (message: string): number => (message === NO_SUCH ? 404 : message === NEEDS_STATEMENT ? 409 : 400);
