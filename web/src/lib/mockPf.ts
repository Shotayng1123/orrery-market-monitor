// Dev-only: the paper portfolios of the local copy (P-1, 21 Nov 2026). Never in a production build (lib/pf.ts reaches
// this file only where VITE_DEV_MOCK=1, and the paper book's screens are not in a build with the switch off).
// The API's own routes (lib/pf/route.ts) run here in the page, against a list kept in this browser's storage
// (`om_mock_pf`) in place of the database: the same rules and the same words as the server's
// (sim/sql/pf.test.cjs compares the two stores). Everything in it is a stand-in: no portfolio here is anyone's.
//   om_mock_pf                     the list (three stand-in books to start: the designer's hard cases)
//   ?mock=empty in the address     no book, and an account that has not agreed to the statement (kept in memory only)
//   ?mock=cap in the address       five open books: the most an account may hold (kept in memory only)
//   om_mock_pf_account = "2"       a second account, which sees none of them
//   om_mock_pf_refuse = "1"        every write is refused by the stand-in server ("stand-in failure");
//                      "offline"   … fails as without a connection; "signedout" … as with an expired sign-in
//   om_mock_pf_delay = "400"       every write is answered after that many milliseconds (a slow connection)
//   om_mock_pf_off = "1"           the stand-in server's paper switch is off: every route answers "not available yet"
// The page's clock (om_mock_now, lib/mockclock.ts) is this store's clock: 2026-12-15T02:00:00Z opens the targets' window.
import { pfRoute, type PfAnswer } from "./pf/route.ts";
import { emptyState, memStore, type MemState } from "./pf/memstore.ts";
import { buildCreate, checkForm, defaultRaw, type Raw } from "./pf/form.ts";
import { changeDays, valuationDay, venuesOf } from "./pf/calendar.ts";
import { STATEMENT_VERSION } from "./pf/statement.ts";
import type { PfStore, StartId } from "./pf/types.ts";
import { bookedDays, mockHolidays } from "./mock";

const KEY = "om_mock_pf", FIRST = "preview@mock.local", SECOND = "second@mock.local";
const pref = (k: string): string => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const mode = (): string => { try { return new URLSearchParams(location.search).get("mock") ?? ""; } catch { return ""; } };
const inMemory = (): boolean => mode() === "empty" || mode() === "cap";
const account = (): string => (pref("om_mock_pf_account") === "2" ? SECOND : FIRST);

let memory: MemState | null = null;
function load(): MemState {
  if (inMemory()) return (memory ??= emptyState());
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as MemState | null; if (v && Array.isArray(v.books) && v.consents) return v; } catch { /* nothing kept, or storage blocked */ }
  return (memory ??= emptyState());
}
function save(s: MemState): void {
  memory = s;
  if (inMemory()) return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept in memory for this page */ }
}
const newId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

// The stand-in facts: the overnight rates as the probes of 19 and 20 Nov 2026 read them (EFFR from the New York Fed,
// TONA from the Bank of Japan), which the live server will store with the daily NAV; the stand-in feed's USD/JPY.
const fxDay = (): string => bookedDays("FX", Date.now(), 1)?.[0] ?? valuationDay(new Date());
const FX_RATE = 158.4, FX_SOURCE = "Yahoo Finance, unofficial";
const facts = () => Promise.resolve({
  rates: { USD: { name: "EFFR", rate: 3.88, d: "2026-11-18", source: "New York Fed", standIn: false }, JPY: { name: "TONA", rate: 1.227, d: "2026-11-18", source: "Bank of Japan", standIn: false } },
  // the holiday rows reach as the Monitor's do (supabase/functions/_shared/sessions.ts HOLIDAY_SOURCES, "through")
  usdjpy: { rate: FX_RATE, d: fxDay(), source: FX_SOURCE }, holidays: { ...mockHolidays(), through: "2027-12-31" },
});

// ---- the stand-in books (the designer's hard cases, D/p1-design.md §8) ----
const LONG_NAME = "Global long/short on a yen base, every region through an ETF";   // 60 characters: the most a name may hold
const REASON_140 = "Short side trimmed ahead of the half-year results: three of the five names report inside two weeks, and their borrow turned warm this month.";   // 140 characters
const NOTE_1900 = ("Autos into results: the three names report inside one week, and the book is long two of them at the limit. What would change the view: a guidance cut at either, or a yen move past the level the hedges were sized at. ").repeat(12).slice(0, 1900).trimEnd().padEnd(1900, ".");
async function seed(cap: boolean): Promise<void> {
  let t = Date.parse("2026-10-01T01:12:00Z"), k = 0, n = 0;
  // the stand-in books' ids are fixed (…0001 Tokyo L/S, …0002 the long name, …0003 Macro; …0004 and …0005 at the cap),
  // so a check can name a book's address; a book made in the page gets an id of its own
  const st = memStore({ load, save, now: () => new Date(t), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
  const make = async (start: StartId, name: string, at: string, edits: Raw = {}): Promise<string> => {
    t = Date.parse(at);
    const raw = { ...defaultRaw(start, edits.base === "JPY" ? "JPY" : "USD"), ...edits }, c = checkForm(start, name, raw, []);
    const b = buildCreate(start, name, c, { requestId: `stand-in-${String(++k).padStart(4, "0")}`, startedOn: valuationDay(new Date(t)), usdjpy: { rate: FX_RATE, d: "2026-10-09", source: FX_SOURCE } });
    return (await st.create(FIRST, b.book, b.settings)).id;
  };
  await st.consentAgree(FIRST, STATEMENT_VERSION);
  const tokyo = await make("ar-ls-jp", "Tokyo L/S", "2026-10-01T01:12:00Z");
  // two changes: one in force, with a long reason; one made two hours ago, pending until the next session
  t = Date.parse("2026-11-12T02:02:00Z");
  await st.settingSet(FIRST, tokyo, { key: "one_short", value: 4, reason: REASON_140, effective: "2026-11-13", today: "2026-11-12" });
  const now = Date.now();
  t = now - 2 * 3600e3;
  // by the route's own rule for a Japan book (EN-9): a change made before Tokyo opens is in force for that day's sessions
  const cd = changeDays(new Date(t), mockHolidays(t), venuesOf("ar-ls-jp"));
  await st.settingSet(FIRST, tokyo, { key: "sector_net", value: 15, reason: "Narrower sector bets while the results season runs.", effective: cd.effective, today: cd.traded });
  // four notes: a long one, one with line breaks, one in Japanese, one removed
  const note = async (at: string, body: string): Promise<void> => { t = Date.parse(at); await st.noteAdd(FIRST, tokyo, body); };
  await note("2026-10-06T02:40:00Z", "A first note, written by mistake.");
  await note("2026-11-05T08:15:00Z", NOTE_1900);
  await note("2026-11-17T01:05:00Z", "決算前に自動車の比率を下げる。\n円高が進めばヘッジを見直す。");
  await note("2026-11-19T09:20:00Z", "Trim autos into results; add on weakness.\nReview the hedge ratio after the print.\n\nNo change to the short book.");
  const first = (await st.get(FIRST, tokyo))?.notes.find((n) => n.body === "A first note, written by mistake.");
  t = Date.parse("2026-10-06T02:44:00Z");
  if (first) await st.noteRemove(FIRST, tokyo, first.id);
  await make("ar-ls-gl", LONG_NAME, "2026-10-12T03:30:00Z", { base: "JPY", ladder_base: "start", target_x: "3.0", target_vol: "6.0", region_max: "80" });
  await make("ar-macro", "Macro", "2026-11-02T00:45:00Z", { blend: "70", ladder_base: "yearly" });
  if (cap) { await make("ar-ls-jp", "Japan value", "2026-11-09T02:00:00Z"); await make("ar-macro", "Rates and FX", "2026-11-16T02:00:00Z"); }
}
let ready: Promise<void> | null = null;
/** The list as this browser has it; made once, with its stand-in books, where there is none. */
function prepared(): Promise<void> {
  ready ??= (async () => {
    if (mode() === "empty") return;                               // no book, and no agreement
    if (mode() === "cap") { await seed(true); return; }
    let kept = false; try { kept = localStorage.getItem(KEY) != null; } catch { kept = memory != null; }
    if (!kept) await seed(false);
  })();
  return ready;
}

export async function mockPf(action: string, method: string, query: Record<string, string>, body: Record<string, unknown>): Promise<PfAnswer> {
  await prepared();
  const refuse = pref("om_mock_pf_refuse"), delay = Number(pref("om_mock_pf_delay")) || 0;
  if (method === "POST" && delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
  if (method === "POST" && refuse) return refuse === "offline" ? { status: 0, body: { error: "No connection to the Monitor's server" } } : refuse === "signedout" ? { status: 401, body: { error: "Signed out" } } : { status: 500, body: { error: "stand-in failure" } };
  const store: PfStore = memStore({ load, save, now: () => new Date(), newId });
  return pfRoute({ on: pref("om_mock_pf_off") !== "1", store, now: () => new Date(), facts }, action, account(), method, (k) => query[k] ?? null, body);
}
