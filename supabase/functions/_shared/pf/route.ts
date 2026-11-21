// The paper portfolio's routes (P-1), over a store: the server hands in the database's functions
// (_shared/pfstore.ts), the local copy a list kept in the browser (./memstore.ts). One set of rules for both.
//
// Every route is for the signed-in account and can name no other. With the switch off (./switch.ts) every route
// refuses before it reads or writes anything. Nothing here logs: a portfolio's name, a note, a setting or an account
// never reaches a log line; a refusal goes back to the page that asked, in words it shows.
import type { Base, CashRate, FormFacts, PfStore } from "./types.ts";
import { StoreRefusal } from "./types.ts";
import { nextSessionDay, nyDate, sgDate, targetWindow, valuationDay, type Holidays } from "./calendar.ts";
import { FIXED_TARGETS, NEEDS_STATEMENT, NO_SUCH, NOT_YET, WINDOW_CLOSED } from "./words.ts";
import { buildCreate, checkChange, checkForm, checkTargets, nameRefusal, noteRefusal, outOfRange, reasonRefusal, type Raw } from "./form.ts";
import { CAP_LINE, isStart, OPEN_CAP, STARTS } from "./presets.ts";
import { settingsNow, valuesNow } from "./view.ts";

export const PF_ACTIONS = ["pf_form", "pf_list", "pf_get", "pf_create", "pf_rename", "pf_setting_set", "pf_targets_set", "pf_note_add", "pf_note_remove", "pf_delete", "consent", "consent_agree"] as const;
export const isPfAction = (a: string): boolean => (PF_ACTIONS as readonly string[]).includes(a);
const WRITES = new Set<string>(["pf_create", "pf_rename", "pf_setting_set", "pf_targets_set", "pf_note_add", "pf_note_remove", "pf_delete", "consent_agree"]);

export interface PfFacts { rates: Record<Base, CashRate | null>; usdjpy: { rate: number; d: string; source: string } | null; holidays: Holidays }
export interface PfDeps {
  /** the server's switch: off, every route refuses and nothing is read or written */
  on: boolean;
  store: PfStore;
  now: () => Date;
  /** what the server holds besides the books: the overnight rates once they are stored, the USD/JPY close, the holidays */
  facts: () => Promise<PfFacts>;
}
export interface PfAnswer { status: number; body: unknown }
const ok = (body: unknown): PfAnswer => ({ status: 200, body });
const no = (status: number, error: string, more: Record<string, unknown> = {}): PfAnswer => ({ status, body: { error, ...more } });
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
/** A portfolio's own id, as the store makes them; anything else names no portfolio. */
const isId = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

export async function pfRoute(deps: PfDeps, action: string, account: string, method: string, query: (k: string) => string | null, body: Record<string, unknown>): Promise<PfAnswer> {
  if (!deps.on) return no(404, NOT_YET);
  if (!isPfAction(action)) return no(400, "unknown action");
  if (WRITES.has(action) && method !== "POST") return no(405, "POST required");
  const { store } = deps, now = deps.now();
  try {
    if (action.startsWith("pf_") && "id" in body && !isId(str(body.id))) return no(404, NO_SUCH);
    switch (action) {
      case "consent": return ok(await store.consent(account));
      case "consent_agree": return ok(await store.consentAgree(account, Number(body.version)));
      case "pf_list": {
        const rows = await store.list(account);
        return ok({ rows, cap: OPEN_CAP, open: rows.filter((r) => r.status === "open").length });
      }
      case "pf_form": {
        const [f, rows, consent] = await Promise.all([deps.facts(), store.list(account), store.consent(account)]);
        const open = rows.filter((r) => r.status === "open");
        const facts: FormFacts = { today: sgDate(now), nextSession: nextSessionDay(now, f.holidays), valuationDay: valuationDay(now), nyDate: nyDate(now), rates: f.rates, usdjpy: f.usdjpy, cap: OPEN_CAP, open: open.length, names: open.map((r) => r.name), consent };
        return ok(facts);
      }
      case "pf_get": {
        const id = str(query("id"));
        if (!isId(id)) return no(404, NO_SUCH);
        const [book, f, consent] = await Promise.all([store.get(account, id), deps.facts(), store.consent(account)]);
        if (!book) return no(404, NO_SUCH);
        return ok({ book, today: sgDate(now), valuationDay: valuationDay(now), nextSession: nextSessionDay(now, f.holidays), nyDate: nyDate(now), rates: f.rates, consent });
      }
      case "pf_create": {
        const start = str(body.start), name = str(body.name), requestId = str(body.requestId);
        if (!isStart(start) || !STARTS[start].offered) return no(400, "this start is not offered yet");
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return no(400, "the form sent no request id");
        const raw: Raw = {};
        for (const [k, v] of Object.entries((body.values ?? {}) as Record<string, unknown>)) raw[k] = str(v);
        const [consent, rows, f, before] = await Promise.all([store.consent(account), store.list(account), deps.facts(), store.findRequest(account, requestId)]);
        if (before) return ok({ id: before });   // a second press of the same form is the first one's answer, never a second book
        if (!consent.agreedAt) return no(409, NEEDS_STATEMENT, { consent });
        const open = rows.filter((r) => r.status === "open");
        if (open.length >= OPEN_CAP) return no(400, CAP_LINE);
        const c = checkForm(start, name, raw, open.map((r) => r.name));
        if (c.refusals.length) return no(400, outOfRange(c.refusals.length), { refusals: c.refusals });
        const made = buildCreate(start, name, c, { requestId, startedOn: valuationDay(now), usdjpy: f.usdjpy });
        return ok(await store.create(account, made.book, made.settings));
      }
      case "pf_rename": {
        const id = str(body.id), name = str(body.name), rows = await store.list(account), book = rows.find((r) => r.id === id);
        if (!book) return no(404, NO_SUCH);
        const t = nameRefusal(name, rows.filter((r) => r.status === "open" && r.id !== id).map((r) => r.name));
        if (t) return no(400, t);
        if (name.trim() === book.name) return no(400, "this is its name already");
        await store.rename(account, id, name.trim(), valuationDay(now));
        return ok({ ok: true });
      }
      case "pf_setting_set": {
        const id = str(body.id), key = str(body.key), [book, f] = await Promise.all([store.get(account, id), deps.facts()]);
        if (!book) return no(404, NO_SUCH);
        const day = valuationDay(now), p = checkChange(book, key, str(body.value), valuesNow(settingsNow(book, day)));
        if (!p.ok) return no(400, p.text);
        const r = reasonRefusal(str(body.reason));
        if (r) return no(400, r);
        const effective = nextSessionDay(now, f.holidays);
        await store.settingSet(account, id, { key, value: p.v, reason: str(body.reason).trim(), effective, today: day });
        return ok({ ok: true, effective });
      }
      case "pf_targets_set": {
        const id = str(body.id), book = await store.get(account, id);
        if (!book) return no(404, NO_SUCH);
        const ny = nyDate(now), w = targetWindow(ny, book.ladderBase, book.resets);
        if (w.fixed) return no(400, FIXED_TARGETS);
        if (!w.open) return no(400, WINDOW_CLOSED);
        const lim = valuesNow(settingsNow(book, valuationDay(now))).var, c = checkTargets(book.start, str(body.x), str(body.vol), typeof lim === "number" ? lim : null);
        if (!c.ok) return no(400, c.refusals[0].text, { refusals: c.refusals });
        return ok({ ok: true, ...(await store.targetsSet(account, id, { x: c.x, vol: c.vol, nyDate: ny })) });
      }
      case "pf_note_add": {
        const text = str(body.body), t = noteRefusal(text);
        if (t) return no(400, t);
        await store.noteAdd(account, str(body.id), text);
        return ok({ ok: true });
      }
      case "pf_note_remove": await store.noteRemove(account, str(body.id), Number(body.note)); return ok({ ok: true });
      case "pf_delete": await store.remove(account, str(body.id), str(body.name)); return ok({ ok: true });
      default: return no(400, "unknown action");
    }
  } catch (e) {
    if (e instanceof StoreRefusal) return no(e.status, e.message);
    return no(500, e instanceof Error ? e.message : String(e));
  }
}
