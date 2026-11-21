// The paper portfolio's calls to the server (P-1, 21 Nov 2026), and their stand-in in the local copy.
// Every call is for the signed-in account; the server can answer for no other. In the dev server's mock feed
// (VITE_DEV_MOCK=1) the same routes run in the page against a list kept in this browser (lib/mockPf.ts): the same
// rules and the same words, so the local copy shows what the live Monitor will.
// What is read (the list, a book, the form's facts) is kept on this device for a week, as every screen's last answer
// is (lib/keep.ts), and emptied at sign-out: without a connection the page shows it with its time.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getToken, tokenId } from "./api";
import { keepGet, keepKey, keepSet } from "./keep";
import type { BookFull, BookRow, CashRate, ConsentState, FormFacts, Refusal, Base } from "./pf/types.ts";

/** A refusal or a failure, with what the page needs to say it: 0 no connection, 401 signed out, 404 no such
 *  portfolio, 409 the statement is asked first, 400 the server's words (and the fields it refuses). */
export class PfError extends Error {
  status: number; refusals: Refusal[] | null; consent: ConsentState | null;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    const b = (body ?? {}) as { refusals?: Refusal[]; consent?: ConsentState };
    this.status = status; this.refusals = Array.isArray(b.refusals) ? b.refusals : null; this.consent = b.consent ?? null;
  }
}
type Query = Record<string, string>;
// The local copy's stand-in store (lib/mockPf.ts) is asked for on demand behind a condition a build folds to false
// (as lib/useApi.ts's DEV_MOCK, written out here: a build does not fold a constant of another file), so no build
// carries that file or any of its stand-in rows, with the page's switch on or off.
const MOCK = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === "1";
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
export const pfDelete = (id: string, name: string): Promise<unknown> => call("pf_delete", undefined, { id, name });
export const consentAgree = (version: number): Promise<ConsentState> => call("consent_agree", undefined, { version });

/** The server's words as part of a sentence of the page's: without the full stop they may end in. */
export const serverWords = (e: unknown): string => (e instanceof Error ? e.message : String(e)).trim().replace(/\.+$/, "");
/** What a failed write says, in the page's words: offline, signed out, or the server's own sentence. */
export function failureWords(e: unknown, what: { offline: string; signedOut: string; refused: (words: string) => string }): string {
  const s = e instanceof PfError ? e.status : -1;
  return s === 0 ? what.offline : s === 401 ? what.signedOut : what.refused(serverWords(e));
}

export interface Read<T> { data: T | null; error: PfError | null; loading: boolean; keptAt: number | null; reload: () => void }
/** One of the three reads, asked when the screen opens, again whenever `tick` changes and after `reload()`. The last
 *  answer stays on screen while the next is on its way; without a connection, what this device last read. */
export function useRead<T>(action: "pf_list" | "pf_form" | "pf_get", query: Query | null, tick: number): Read<T> {
  const [s, set] = useState<{ data: T | null; error: PfError | null; loading: boolean; keptAt: number | null }>({ data: null, error: null, loading: query != null, keptAt: null });
  const [again, setAgain] = useState(0), key = query ? JSON.stringify(query) : null, last = useRef<string | null>(null);
  useEffect(() => {
    if (key == null) return;
    let alive = true;
    const kk = MOCK ? null : keepKey(tokenId(getToken()), action, JSON.parse(key) as Query);
    if (last.current !== `${action}|${key}`) { last.current = `${action}|${key}`; set({ data: null, error: null, loading: true, keptAt: null }); }   // another book: not the last one's rows
    call<T>(action, JSON.parse(key) as Query)
      .then((d) => { if (alive) set({ data: d, error: null, loading: false, keptAt: null }); if (kk) keepSet(kk, d); })
      .catch(async (e: unknown) => {
        const err = e instanceof PfError ? e : new PfError(0, String(e));
        const kept = kk && err.status === 0 ? await keepGet<T>(kk) : null;
        if (alive) set((x) => (kept ? { data: kept.data, error: err, loading: false, keptAt: kept.at } : { data: err.status === 404 ? null : x.data, error: err, loading: false, keptAt: x.keptAt }));
      });
    return () => { alive = false; };
  }, [action, key, tick, again]);
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  return { ...s, reload };
}
