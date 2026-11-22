// The paper portfolio's calls to the server (P-1, 21 Nov 2026), and their stand-in in the local copy.
// Every call is for the signed-in account; the server can answer for no other. In the dev server's mock feed
// (VITE_DEV_MOCK=1) the same routes run in the page against a list kept in this browser (lib/mockPf.ts): the same
// rules and the same words, so the local copy shows what the live Monitor will.
// What is read (the list, a book, the form's facts) stands in for a lost connection, shown with its time. Where the
// sign-in is to be remembered on this browser it is kept on the device for a week, as every screen's last answer is
// (lib/keep.ts), and emptied at sign-out. Where it is not (the box on the sign-in screen unticked: a shared computer),
// nothing of a book is written to the device: the last answers are held in memory and go with the tab. An answer that
// arrives after its sign-in has ended is not kept at all, and a book that is deleted, or that the server no longer
// finds in the account, takes its kept answer with it.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getToken, onSignInEnd, remembered, tokenId } from "./api";
import { keepDel, keepGet, keepKey, keepSet, type Kept } from "./keep";
import type { BookFull, BookRow, CashRate, ConsentState, FormFacts, Refusal, Base } from "./pf/types.ts";
import { NOT_YET } from "./pf/words.ts";

/** A refusal or a failure, with what the page needs to say it: 0 no connection, 401 signed out, 404 no such
 *  portfolio, 409 the statement is asked first, 400 the server's words (and the fields it refuses). */
export class PfError extends Error {
  status: number; refusals: Refusal[] | null; consent: ConsentState | null;
  /** a create refused because an earlier press of the same form already made a book: that book */
  made: { id: string; name: string } | null;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    const b = (body ?? {}) as { refusals?: Refusal[]; consent?: ConsentState; made?: { id?: unknown; name?: unknown } };
    this.status = status; this.refusals = Array.isArray(b.refusals) ? b.refusals : null; this.consent = b.consent ?? null;
    this.made = b.made && typeof b.made.id === "string" && typeof b.made.name === "string" ? { id: b.made.id, name: b.made.name } : null;
  }
}
type Query = Record<string, string>;
// The local copy's stand-in store (lib/mockPf.ts) is asked for on demand behind a condition a build folds to false
// (as lib/useApi.ts's DEV_MOCK, written out here: a build does not fold a constant of another file), so no build
// carries that file or any of its stand-in rows, with the page's switch on or off.
const MOCK = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === "1";

/** The account this page is signed in as, as the device's own stores name it: the id inside the sign-in token (in the
 *  local copy, which of its two stand-in accounts the page is set to). Null without a sign-in. What a screen keeps for
 *  an account (a form's draft, a last answer) carries this, and is never handed to another. */
export function accountId(): string | null {
  if (MOCK) { let n = ""; try { n = localStorage.getItem("om_mock_pf_account") ?? ""; } catch { /* storage blocked */ } return `stand-in account ${n === "2" ? 2 : 1}`; }
  return tokenId(getToken());
}

// ---- the last answers, for a lost connection ----
// In memory for a sign-in that is not to be remembered; on the device (lib/keep.ts) for one that is.
const inTab = new Map<string, Kept<unknown>>();
onSignInEnd(() => inTab.clear());
function hold(key: string, data: unknown): void { if (remembered()) keepSet(key, data); else inTab.set(key, { at: Date.now(), data }); }
async function held<T>(key: string): Promise<Kept<T> | null> { return (inTab.get(key) as Kept<T> | undefined) ?? (remembered() ? await keepGet<T>(key) : null); }
function drop(key: string): void { inTab.delete(key); keepDel(key); }
/** A book is gone (deleted here, or no longer found in the account): its last answer goes from memory and from the
 *  device, and so do the list's and the form's, which name it. */
function forgetBook(id: string): void {
  const who = accountId();
  drop(keepKey(who, "pf_get", { id })); drop(keepKey(who, "pf_list", {})); drop(keepKey(who, "pf_form", {}));
}
async function call<T>(action: string, query?: Query, body?: Record<string, unknown>): Promise<T> {
  if (MOCK) {
    const { mockPf } = await import("./mockPf");
    const r = await mockPf(action, body ? "POST" : "GET", query ?? {}, body ?? {});
    if (r.status !== 200) throw new PfError(r.status, (r.body as { error?: string }).error ?? `HTTP ${r.status}`, r.body);
    return r.body as T;
  }
  try { return await api<T>(action, query, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); }
  catch (e) { if (e instanceof ApiError) throw new PfError(e.status, e.message, e.body); throw new PfError(0, e instanceof Error ? e.message : String(e)); }
}

export interface ListAnswer { rows: BookRow[]; cap: number; open: number }
export interface BookAnswer { book: BookFull; today: string; valuationDay: string; nextSession: string; nyDate: string; rates: Record<Base, CashRate | null>; consent: ConsentState }
export const pfList = (): Promise<ListAnswer> => call("pf_list");
export const pfForm = (): Promise<FormFacts> => call("pf_form");
export const pfGet = (id: string): Promise<BookAnswer> => call("pf_get", { id });
export const pfCreate = (b: { requestId: string; start: string; name: string; values: Record<string, string> }): Promise<{ id: string }> => call("pf_create", undefined, b);
export const pfRename = (id: string, name: string): Promise<unknown> => call("pf_rename", undefined, { id, name });
export const pfSettingSet = (id: string, key: string, value: string, reason: string): Promise<{ effective: string }> => call("pf_setting_set", undefined, { id, key, value, reason });
export const pfTargetsSet = (id: string, x: string, vol: string): Promise<{ forYear: number }> => call("pf_targets_set", undefined, { id, x, vol });
export const pfNoteAdd = (id: string, body: string): Promise<unknown> => call("pf_note_add", undefined, { id, body });
export const pfNoteRemove = (id: string, note: number): Promise<unknown> => call("pf_note_remove", undefined, { id, note });
export const pfDelete = (id: string, name: string): Promise<unknown> => call("pf_delete", undefined, { id, name }).then((r) => { forgetBook(id); return r; });
export const consentAgree = (version: number): Promise<ConsentState> => call("consent_agree", undefined, { version });

/** The server's words as part of a sentence of the page's: without the full stop they may end in. */
export const serverWords = (e: unknown): string => (e instanceof Error ? e.message : String(e)).trim().replace(/\.+$/, "");
/** A 404 that is the server's own sentence for its paper switch off ("Paper portfolios are not available yet."), not
 *  "no such portfolio in your account". */
export const switchedOff = (e: unknown): boolean => e instanceof PfError && e.status === 404 && serverWords(e) === NOT_YET.replace(/\.+$/, "");
/** What a failed write says, in the page's words: offline, signed out, or the server's own sentence. */
export function failureWords(e: unknown, what: { offline: string; signedOut: string; refused: (words: string) => string }): string {
  const s = e instanceof PfError ? e.status : -1;
  return s === 0 ? what.offline : s === 401 ? what.signedOut : what.refused(serverWords(e));
}

export interface Read<T> { data: T | null; error: PfError | null; loading: boolean; keptAt: number | null; reload: () => void }
/** One of the three reads, asked when the screen opens, again whenever `tick` changes and after `reload()`. The last
 *  answer stays on screen while the next is on its way; without a connection, what this device last read. */
export function useRead<T>(action: "pf_list" | "pf_form" | "pf_get", query: Query | null, tick: number | string): Read<T> {
  const [s, set] = useState<{ data: T | null; error: PfError | null; loading: boolean; keptAt: number | null }>({ data: null, error: null, loading: query != null, keptAt: null });
  const [again, setAgain] = useState(0), key = query ? JSON.stringify(query) : null, last = useRef<string | null>(null);
  useEffect(() => {
    if (key == null) return;
    let alive = true;
    // an answer is kept for the sign-in it was asked with: one that arrives after a sign-out is not written back
    const asked = getToken(), q = JSON.parse(key) as Query, kk = MOCK ? null : keepKey(tokenId(asked), action, q);
    if (last.current !== `${action}|${key}`) { last.current = `${action}|${key}`; set({ data: null, error: null, loading: true, keptAt: null }); }   // another book: not the last one's rows
    call<T>(action, q)
      .then((d) => { if (alive) set({ data: d, error: null, loading: false, keptAt: null }); if (kk && getToken() === asked) hold(kk, d); })
      .catch(async (e: unknown) => {
        const err = e instanceof PfError ? e : new PfError(0, String(e));
        // no longer a book of this account; not when the server's paper switch is off (its own sentence): the book and
        // what this device keeps of it stay (DC-3 of the second review of P-1)
        if (kk && err.status === 404 && action === "pf_get" && !switchedOff(err) && getToken() === asked && typeof q.id === "string") forgetBook(q.id);
        const kept = kk && err.status === 0 ? await held<T>(kk) : null;
        if (alive) set((x) => (kept ? { data: kept.data, error: err, loading: false, keptAt: kept.at } : { data: err.status === 404 ? null : x.data, error: err, loading: false, keptAt: x.keptAt }));
      });
    return () => { alive = false; };
  }, [action, key, tick, again]);
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  return { ...s, reload };
}
