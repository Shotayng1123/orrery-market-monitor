// The paper portfolio's store on the server (P-1): the database's functions pf_*(p_account, …), and nothing else.
// The tables behind them are out of this role's reach (supabase/migrations/20261121000001_pf_store.sql): the API can
// only call the functions, each of which names the account in every statement. This file is the one place that
// names them; api/index.ts names no table of the portfolio (sim/logic.test.ts checks it). Nothing here logs.
import type { BookFull, BookRow, ConsentState, PfStore } from "./pf/types.ts";
import { StoreRefusal } from "./pf/types.ts";
import { refusalStatus } from "./pf/words.ts";

/** The database client's call of a function, as far as this file uses it (supabase-js's `rpc`, or a stand-in). */
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

export function sqlStore(rpc: Rpc): PfStore {
  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await rpc(fn, args);
    // P0001 is a refusal the function raised in the page's own words; anything else is the server's fault
    if (error) { if (error.code === "P0001") throw new StoreRefusal(error.message, refusalStatus(error.message)); throw new Error(error.message); }
    return data as T;
  }
  return {
    consent: (account) => call<ConsentState>("pf_consent", { p_account: account }),
    consentAgree: (account, version) => call<ConsentState>("pf_consent_agree", { p_account: account, p_version: version }),
    list: (account) => call<BookRow[]>("pf_list", { p_account: account }),
    findRequest: (account, requestId) => call<string | null>("pf_request", { p_account: account, p_request: requestId }),
    create: (account, book, settings) => call<{ id: string }>("pf_create", { p_account: account, p_book: book, p_settings: settings }),
    get: (account, id) => call<BookFull | null>("pf_get", { p_account: account, p_id: id }),
    rename: async (account, id, name, today) => { await call<null>("pf_rename", { p_account: account, p_id: id, p_name: name, p_today: today }); },
    settingSet: async (account, id, s) => { await call<null>("pf_setting_set", { p_account: account, p_id: id, p_key: s.key, p_value: s.value, p_reason: s.reason, p_effective: s.effective, p_today: s.today }); },
    targetsSet: (account, id, t) => call<{ forYear: number }>("pf_targets_set", { p_account: account, p_id: id, p_x: t.x, p_vol: t.vol, p_today: t.day }),
    noteAdd: async (account, id, body) => { await call<null>("pf_note_add", { p_account: account, p_id: id, p_body: body }); },
    noteRemove: async (account, id, note) => { await call<null>("pf_note_remove", { p_account: account, p_id: id, p_note: note }); },
    remove: async (account, id, name) => { await call<null>("pf_delete", { p_account: account, p_id: id, p_name: name }); },
  };
}
