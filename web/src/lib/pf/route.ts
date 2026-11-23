// COPY of supabase/functions/_shared/pf/route.ts: edit that file, then run `node tools/sync-pf.cjs` from web/.
// The paper portfolio's routes (P-1), over a store: the server hands in the database's functions
// (_shared/pfstore.ts), the local copy a list kept in the browser (./memstore.ts). One set of rules for both.
//
// Every route is for the signed-in account and can name no other. With the switch off (./switch.ts) every route
// refuses before it reads or writes anything. Nothing here logs: a portfolio's name, a note, a setting or an account
// never reaches a log line; a refusal goes back to the page that asked, in words it shows.
import type { Base, BookFull, CashRate, FormFacts, NewBook, NewSetting, PfStore } from "./types.ts";
import { StoreRefusal } from "./types.ts";
import { calendarGap, changeDays, nextSessionDay, nyDate, sgDate, targetWindow, valuationDay, venueNow, venuesOf, type Holidays } from "./calendar.ts";
import { CALENDAR_UNREAD, calendarPast, FIXED_TARGETS, madeBefore, NEEDS_STATEMENT, NO_NOTE, NO_SUCH, NOT_YET, OLD_VERSION, TICKET_NOTE, WINDOW_CLOSED } from "./words.ts";
import { buildCreate, checkChange, checkForm, checkTargets, cleanName, nameRefusal, noteRefusal, outOfRange, reasonRefusal, type Raw } from "./form.ts";
import { CAP_LINE, isStart, OPEN_CAP, STARTS } from "./presets.ts";
import { changeBasis, settingsNow, valuesAhead, valuesNow } from "./view.ts";
import { printAge, SIDES, SIZE_BYS, sidesFor, sizeOrder, tradable, VENUE_CCY, venueOfSymbol, type Side, type SizeBy, type TicketQuote } from "./size.ts";
import { fromMinor } from "./money.ts";

export const PF_ACTIONS = ["pf_form", "pf_list", "pf_get", "pf_create", "pf_rename", "pf_setting_set", "pf_targets_set", "pf_note_add", "pf_note_remove", "pf_delete", "consent", "consent_agree", "pf_ticket"] as const;
export const isPfAction = (a: string): boolean => (PF_ACTIONS as readonly string[]).includes(a);
const WRITES = new Set<string>(["pf_create", "pf_rename", "pf_setting_set", "pf_targets_set", "pf_note_add", "pf_note_remove", "pf_delete", "consent_agree"]);
/** The writes to one portfolio: each names it by its id, and one that names none is refused as no such portfolio. */
const OF_A_BOOK = new Set<string>(["pf_rename", "pf_setting_set", "pf_targets_set", "pf_note_add", "pf_note_remove", "pf_delete"]);

export interface PfFacts { rates: Record<Base, CashRate | null>; usdjpy: { rate: number; d: string; source: string } | null; holidays: Holidays }
export interface PfDeps {
  /** the server's switch: off, every route refuses and nothing is read or written */
  on: boolean;
  store: PfStore;
  now: () => Date;
  /** what the server holds besides the books: the overnight rates once they are stored, the USD/JPY close, the holidays */
  facts: () => Promise<PfFacts>;
  /** the latest prints of these symbols, as the server reads them (Yahoo Finance's quote); null for one it has none of.
   *  Asked only by the ticket (P-2.1), only for an account the routes admit */
  quotes?: (symbols: string[]) => Promise<Record<string, TicketQuote | null>>;
}
export interface PfAnswer { status: number; body: unknown }
const ok = (body: unknown): PfAnswer => ({ status: 200, body });
const no = (status: number, error: string, more: Record<string, unknown> = {}): PfAnswer => ({ status, body: { error, ...more } });
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
/** The session a change of a book is in force from (EN-9): by its start's rule, with the Japan start's limit on names
 *  listed outside Tokyo as it stands today. */
const changeDaysOf = (book: BookFull, now: Date, hol: Holidays) => changeDays(now, hol, venuesOf(book.start, valuesNow(settingsNow(book, valuationDay(now))).foreign));
/** A portfolio's own id, as the store makes them; anything else names no portfolio. */
const isId = (v: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Whether a stored book is what this create asks for (RT-4): the same name and every value fixed or set at creation.
 *  The USD equivalent of a yen book is left out: it follows the day's close, which may have moved between presses. */
function sameCreate(had: BookFull, book: NewBook, settings: NewSetting[]): boolean {
  const a: Record<string, unknown> = { name: had.name, start: had.start, base: had.base, nav: had.startingNav, x: had.targetX, vol: had.targetVol, blend: had.blend, lb: had.ladderBase, ladder: had.ladder, hm: had.houseMultiple };
  const b: Record<string, unknown> = { name: book.name, start: book.start, base: book.base, nav: book.startingNav, x: book.targetX, vol: book.targetVol, blend: book.blend, lb: book.ladderBase, ladder: book.ladder, hm: book.houseMultiple };
  // (an object's keys in one order: the database hands a JSON object back with its keys in an order of its own)
  const canon = (v: unknown): string => (v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null));
  if (Object.keys(a).some((k) => canon(a[k]) !== canon(b[k]))) return false;
  const first = new Map(had.settings.filter((r) => r.origin === "creation").map((r) => [r.key, r.value]));
  return settings.every((x) => first.has(x.key) && first.get(x.key) === x.value);
}

export async function pfRoute(deps: PfDeps, action: string, account: string, method: string, query: (k: string) => string | null, body: Record<string, unknown>): Promise<PfAnswer> {
  if (!deps.on) return no(404, NOT_YET);
  if (!isPfAction(action)) return no(400, "unknown action");
  if (WRITES.has(action) && method !== "POST") return no(405, "POST required");
  const { store } = deps, now = deps.now();
  try {
    // a write that names no portfolio, or a number that is not a whole one, is refused in words as the stand-in store
    // refuses it, never sent to the database to fail there (the second review's question 9)
    if ((action.startsWith("pf_") && "id" in body && !isId(str(body.id))) || (OF_A_BOOK.has(action) && !isId(str(body.id)))) return no(404, NO_SUCH);
    if (action === "pf_note_remove" && !(Number.isInteger(Number(body.note)) && Number(body.note) >= 1 && Number(body.note) <= 2147483647)) return no(400, NO_NOTE);
    if (action === "consent_agree" && !Number.isInteger(Number(body.version))) return no(400, OLD_VERSION);
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
        // the day a change made now is in force from, by the book's own start (EN-9); `nextOpens`, when it is the day
        // running: the session that opens it, for the form's "In force for Tue 24 Nov 2026's sessions (Tokyo opens 08:00
        // SGT)". A page of before 22 Nov 2026 reads `nextSession` alone.
        const cd = changeDaysOf(book, now, f.holidays);
        return ok({ book, today: sgDate(now), valuationDay: valuationDay(now), nextSession: cd.effective, nextOpens: cd.opens, nyDate: nyDate(now), rates: f.rates, consent });
      }
      case "pf_create": {
        const start = str(body.start), name = str(body.name), requestId = str(body.requestId);
        if (!isStart(start) || !STARTS[start].offered) return no(400, "this start is not offered yet");
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return no(400, "the form sent no request id");
        const raw: Raw = {};
        for (const [k, v] of Object.entries((body.values ?? {}) as Record<string, unknown>)) raw[k] = str(v);
        const [consent, rows, f, before] = await Promise.all([store.consent(account), store.list(account), deps.facts(), store.findRequest(account, requestId)]);
        if (before) {
          // A second press of the same form is the first one's answer, never a second book. A form that has changed since
          // that press (its answer lost on the way) is not the same press: nothing is made, and the page is told which
          // book the request id made, so that it never announces one that was not created (RT-4).
          const had = await store.get(account, before);
          if (!had) return no(404, NO_SUCH);
          const others = rows.filter((r) => r.status === "open" && r.id !== before).map((r) => r.name), c0 = checkForm(start, name, raw, others);
          const again = c0.refusals.length ? null : buildCreate(start, name, c0, { requestId, startedOn: had.startedOn, usdjpy: f.usdjpy });
          return again && sameCreate(had, again.book, again.settings) ? ok({ id: before }) : no(400, madeBefore(had.name), { made: { id: had.id, name: had.name } });
        }
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
        if (cleanName(name) === book.name) return no(400, "this is its name already");
        await store.rename(account, id, cleanName(name), valuationDay(now));
        return ok({ ok: true });
      }
      case "pf_setting_set": {
        const id = str(body.id), key = str(body.key), [book, f] = await Promise.all([store.get(account, id), deps.facts()]);
        if (!book) return no(404, NO_SUCH);
        // against what will be in force with it: the changes already saved, and the targets after a January re-set
        const day = valuationDay(now), p = checkChange(book, key, str(body.value), changeBasis(book, day, day));
        if (!p.ok) return no(400, p.text);
        const r = reasonRefusal(str(body.reason));
        if (r) return no(400, r);
        // in force from the session that opens next (EN-9); the store's own guard is told the last book day the book's
        // markets have traded in: a change is never in force in one of those, never backwards
        const { effective, traded } = changeDaysOf(book, now, f.holidays), gap = calendarGap(effective, f.holidays);
        if (gap) return no(400, "unread" in gap ? CALENDAR_UNREAD : calendarPast(gap.past));
        await store.settingSet(account, id, { key, value: p.v, reason: str(body.reason).trim(), effective, today: traded });
        return ok({ ok: true, effective });
      }
      case "pf_targets_set": {
        const id = str(body.id), book = await store.get(account, id);
        if (!book) return no(404, NO_SUCH);
        // the window opens with the book day of 1 Dec (PM A's answer of 22 Nov 2026): it is judged by the book day now
        const day = valuationDay(now), w = targetWindow(day, book.ladderBase, book.resets, book.startedOn);
        if (w.fixed) return no(400, FIXED_TARGETS);
        if (!w.open) return no(400, WINDOW_CLOSED);
        // the VaR limit the pair will stand beside: a lowering that waits for its session included (RT-2)
        const lim = valuesAhead(settingsNow(book, day)).var, c = checkTargets(book.start, str(body.x), str(body.vol), typeof lim === "number" ? lim : null);
        if (!c.ok) return no(400, c.refusals[0].text, { refusals: c.refusals });
        return ok({ ok: true, ...(await store.targetsSet(account, id, { x: c.x, vol: c.vol, day })) });
      }
      case "pf_note_add": {
        const text = str(body.body), t = noteRefusal(text);
        if (t) return no(400, t);
        await store.noteAdd(account, str(body.id), text);
        return ok({ ok: true });
      }
      case "pf_note_remove": await store.noteRemove(account, str(body.id), Number(body.note)); return ok({ ok: true });
      case "pf_delete": await store.remove(account, str(body.id), cleanName(str(body.name))); return ok({ ok: true });
      case "pf_ticket": {
        // the ticket (P-2.1): what an order would come to, on the latest print, before anything is placed. It reads the
        // book and the quotes and writes nothing: no order, no row, no log line
        const id = str(query("id")), symbol = str(query("s")).trim().toUpperCase();
        if (!isId(id)) return no(404, NO_SUCH);
        if (!/^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/.test(symbol)) return no(400, "type a symbol, for example 7203.T or NVDA");
        if (!deps.quotes) return no(503, "the ticket's prices cannot be read on this server");
        const book = await store.get(account, id);
        if (!book) return no(404, NO_SUCH);
        const f = await deps.facts(), capital = fromMinor(book.base, book.startingNav), position = 0;   // no order exists before P-2.2
        const answer = { book: { id: book.id, name: book.name, base: book.base, kind: book.kind, start: book.start, capital }, symbol, position, sides: sidesFor(position), note: TICKET_NOTE, asked: now.toISOString() };
        // one read for the name and, where its currency is not the book's, USD/JPY (the server's one request to Yahoo)
        const v0 = venueOfSymbol(symbol), read = await deps.quotes(v0 && VENUE_CCY[v0] !== book.base ? [symbol, "USDJPY=X"] : [symbol]);
        const q = read[symbol] ?? null, t = tradable(symbol, q);
        if (!t.ok) return ok({ ...answer, instrument: null, refusal: t.text, print: null, fx: null, sized: null });
        const fxq = t.ccy !== book.base ? read["USDJPY=X"] ?? null : null;
        const fx = fxq && typeof fxq.price === "number" && fxq.price > 0 && fxq.at ? { rate: fxq.price, at: fxq.at, source: fxq.source } : null;
        const age = q!.at && typeof q!.price === "number" && q!.price > 0 ? printAge(t.venue, q!.at, now, f.holidays) : null;
        const print = age ? { price: q!.price!, at: q!.at!, source: q!.source, ageMin: age.ageMin, tooOld: age.tooOld, why: age.why } : null;
        const side = str(query("side")) as Side, by = str(query("by")) as SizeBy, v = str(query("v"));
        const sized = SIDES.includes(side) && SIZE_BYS.includes(by) && v.trim() !== "" ? sizeOrder({ side, by, value: Number(v.replace(/,/g, "")), position, lot: t.lot, price: print && !print.tooOld ? print.price : null, ccy: t.ccy, base: book.base, usdjpy: fx?.rate ?? null, kind: book.kind, capital }) : null;
        // the market now, by the Monitor's session table and holidays: "open", "break" (Tokyo's lunch), "closed", "holiday"
        const market = venueNow(t.venue, now, f.holidays).state;
        return ok({ ...answer, instrument: { name: q!.name, exchange: q!.exchange, venue: t.venue, ccy: t.ccy, lot: t.lot, market }, refusal: null, print, fx, sized });
      }
      default: return no(400, "unknown action");
    }
  } catch (e) {
    if (e instanceof StoreRefusal) return no(e.status, e.message);
    return no(500, e instanceof Error ? e.message : String(e));
  }
}
