// COPY of supabase/functions/_shared/pf/memstore.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// The paper portfolio's store without a database: a list in memory, kept wherever its caller says (the local copy
// keeps it in the browser, web/src/lib/mockPf.ts). It follows the database's rules one for one
// (supabase/migrations/20261121000001_pf_store.sql) and refuses with the same words: sim/sql/pf.test.cjs runs one
// scenario against both and compares the answers. Stand-in only: the server never loads this file.
import type { After, BookFull, BookRow, ConsentState, NewBook, NewSetting, PfStore, SettingRow } from "./types.ts";
import { StoreRefusal } from "./types.ts";
import { STATEMENT_LABEL, STATEMENT_TEXT, STATEMENT_VERSION } from "./statement.ts";
import { CAP_LINE, OPEN_CAP } from "./presets.ts";
import { targetWindow } from "./calendar.ts";
import { NOTE_MAX, REASON_MAX, REASON_MIN } from "./form.ts";
import { FIXED_SETTING, FIXED_TARGETS, NAME_TAKEN, NEEDS_STATEMENT, NEVER_BACK, NO_NOTE, NO_SUCH, NOT_ITS_NAME, NOTE_LONG, OLD_VERSION, REASON_LONG, REASON_SHORT, refusalStatus, TOGETHER, WINDOW_CLOSED } from "./words.ts";

export interface MemBook extends BookFull { account: string; requestId: string }
export interface MemState { seq: number; consents: Record<string, { version: number; agreedAt: string }>; books: MemBook[] }
export const emptyState = (): MemState => ({ seq: 0, consents: {}, books: [] });
export interface MemDeps { load: () => MemState; save: (s: MemState) => void; now: () => Date; newId: () => string }

const chars = (s: string): number => [...s].length;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const refuse = (message: string): StoreRefusal => new StoreRefusal(message, refusalStatus(message));
/** A book as the list carries it: no settings, notes or resets, and neither its account nor its request id. */
const pub = (b: MemBook): BookRow => ({ id: b.id, name: b.name, kind: b.kind, start: b.start, base: b.base, startingNav: b.startingNav, fx: b.fx, targetX: b.targetX, targetVol: b.targetVol, reference: b.reference, blend: b.blend,
  ladderBase: b.ladderBase, ladder: b.ladder, houseMultiple: b.houseMultiple, valuation: b.valuation, status: b.status, createdAt: b.createdAt, startedOn: b.startedOn });

export function memStore(deps: MemDeps): PfStore {
  const iso = (): string => deps.now().toISOString();
  const consentOf = (s: MemState, account: string): ConsentState => { const c = s.consents[account]; return { version: STATEMENT_VERSION, text: STATEMENT_TEXT, label: STATEMENT_LABEL, agreedAt: c && c.version === STATEMENT_VERSION ? c.agreedAt : null }; };
  const mine = (s: MemState, account: string, id: string): MemBook => { const b = s.books.find((x) => x.id === id && x.account === account); if (!b) throw refuse(NO_SUCH); return b; };
  const add = (s: MemState, b: MemBook, r: Omit<SettingRow, "id" | "at">): void => { b.settings.push({ ...r, id: ++s.seq, at: iso() }); };
  return {
    consent: (account) => Promise.resolve(consentOf(deps.load(), account)),
    consentAgree: (account, version) => {
      const s = deps.load();
      if (version !== STATEMENT_VERSION) return Promise.reject(refuse(OLD_VERSION));
      if (!s.consents[account] || s.consents[account].version !== version) { s.consents[account] = { version, agreedAt: iso() }; deps.save(s); }
      return Promise.resolve(consentOf(s, account));
    },
    list: (account) => Promise.resolve(deps.load().books.filter((b) => b.account === account).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((b) => copy(pub(b)))),
    findRequest: (account, requestId) => Promise.resolve(deps.load().books.find((b) => b.account === account && b.requestId === requestId)?.id ?? null),
    create: (account, book: NewBook, settings: NewSetting[]) => {
      try {
        const s = deps.load(), had = s.books.find((b) => b.account === account && b.requestId === book.requestId);
        if (had) return Promise.resolve({ id: had.id });
        if (!consentOf(s, account).agreedAt) throw refuse(NEEDS_STATEMENT);
        const open = s.books.filter((b) => b.account === account && b.status === "open");
        if (open.length >= OPEN_CAP) throw refuse(CAP_LINE);
        if (open.some((b) => b.name === book.name)) throw refuse(NAME_TAKEN);
        const at = iso(), { requestId, ...rest } = book;
        const b: MemBook = { ...rest, id: deps.newId(), account, requestId, status: "open", createdAt: at, settings: [], notes: [], resets: [] };
        add(s, b, { key: "name", value: book.name, cls: "name", basis: "set by the account", reason: null, effectiveFrom: book.startedOn, forYear: null, origin: "creation" });
        for (const x of settings) add(s, b, { key: x.key, value: x.value, cls: x.cls, basis: x.basis, reason: null, effectiveFrom: book.startedOn, forYear: null, origin: "creation" });
        s.books.push(b); deps.save(s);
        return Promise.resolve({ id: b.id });
      } catch (e) { return Promise.reject(e); }
    },
    get: (account, id) => {
      const b = deps.load().books.find((x) => x.id === id && x.account === account);
      const full: BookFull | null = b ? { ...pub(b), settings: [...b.settings].sort((x, y) => x.id - y.id), notes: [...b.notes].sort((x, y) => y.id - x.id), resets: [...b.resets] } : null;
      return Promise.resolve(copy(full));   // a copy: what the page holds never changes under it
    },
    rename: (account, id, name, today) => {
      try {
        const s = deps.load(), b = mine(s, account, id);
        if (s.books.some((x) => x.account === account && x.status === "open" && x.id !== id && x.name === name)) throw refuse(NAME_TAKEN);
        b.name = name;
        add(s, b, { key: "name", value: name, cls: "name", basis: "set by the account", reason: null, effectiveFrom: today, forYear: null, origin: "change" });
        deps.save(s);
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
    settingSet: (account, id, x) => {
      try {
        const s = deps.load(), b = mine(s, account, id);
        const cls: After | "name" | undefined = b.settings.find((r) => r.key === x.key && r.origin === "creation")?.cls;
        if (!cls || cls === "fixed" || cls === "name") throw refuse(FIXED_SETTING);
        if (cls === "window") throw refuse(TOGETHER);
        const n = chars(x.reason.trim());
        if (n < REASON_MIN) throw refuse(REASON_SHORT);
        if (n > REASON_MAX) throw refuse(REASON_LONG);
        if (!(x.effective > x.today)) throw refuse(NEVER_BACK);
        add(s, b, { key: x.key, value: x.value, cls, basis: "set by the account", reason: x.reason.trim(), effectiveFrom: x.effective, forYear: null, origin: "change" });
        deps.save(s);
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
    targetsSet: (account, id, t) => {
      try {
        const s = deps.load(), b = mine(s, account, id), w = targetWindow(t.nyDate, b.ladderBase, b.resets);
        if (w.fixed) throw refuse(FIXED_TARGETS);
        if (!w.open || w.forYear == null) throw refuse(WINDOW_CLOSED);
        // one moment for the pair: the two rows of a re-set belong together
        const at = iso();
        for (const [key, value] of [["target_x", t.x], ["target_vol", t.vol]] as const) b.settings.push({ id: ++s.seq, at, key, value, cls: "window", basis: "set by the account", reason: null, effectiveFrom: null, forYear: w.forYear, origin: "change" });
        deps.save(s);
        return Promise.resolve({ forYear: w.forYear });
      } catch (e) { return Promise.reject(e); }
    },
    noteAdd: (account, id, body) => {
      try {
        const s = deps.load(), b = mine(s, account, id);
        if (!consentOf(s, account).agreedAt) throw refuse(NEEDS_STATEMENT);
        if (chars(body) < 1 || chars(body) > NOTE_MAX) throw refuse(NOTE_LONG);
        b.notes.push({ id: ++s.seq, at: iso(), body, removedAt: null });
        deps.save(s);
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
    noteRemove: (account, id, note) => {
      try {
        const s = deps.load(), b = mine(s, account, id), n = b.notes.find((x) => x.id === note && x.removedAt == null);
        if (!n) throw refuse(NO_NOTE);
        n.body = null; n.removedAt = iso();   // the text goes for good; a line saying a note was removed stays
        deps.save(s);
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
    remove: (account, id, name) => {
      try {
        const s = deps.load(), b = mine(s, account, id);
        if (name !== b.name) throw refuse(NOT_ITS_NAME);
        s.books = s.books.filter((x) => x !== b);   // its settings, their history and its notes go with it; the agreement stays
        deps.save(s);
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
  };
}
