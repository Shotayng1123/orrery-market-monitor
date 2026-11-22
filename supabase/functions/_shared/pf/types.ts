// The paper portfolio (P-1, 21 Nov 2026): the shapes its engine, its store and its page share.
//
// Everything under _shared/pf/ is pure TypeScript: no database, no clock of its own, no network, no package. The
// server's API uses it through _shared/pfstore.ts; the page has a copy under web/src/lib/pf/ (web/tools/sync-pf.cjs
// writes it, sim/logic.test.ts fails when the two differ), so the form on screen and the server refuse with the same
// rules and the same words. A file here imports only its neighbours, each by its full name ("./x.ts").

/** The five starts. Three are absolute return (AR) and are created from P-1; the two relative-return (RR) starts are
 *  named here and offered once their benchmark limits are built (P-4b, P-4c). */
export type StartId = "ar-ls-jp" | "ar-ls-gl" | "ar-macro" | "rr-eq" | "rr-fi";
export type Kind = "AR" | "RR";
export type Base = "USD" | "JPY";
/** The ladder's base, fixed at creation: the yearly reset that is not made after a losing year (the default: the
 *  owner's answer of 20 Nov 2026), the yearly reset, or the high since the start. */
export type LadderBase = "guarded" | "yearly" | "start";
/** What may happen to a setting after creation. */
export type After = "fixed" | "limit" | "assumption" | "window";
export type SectionId = "kind" | "targets" | "trade" | "limits" | "ladder" | "cash" | "costs";

/** Whose a default is: the tag a row shows ("PM A", "Owner", "C · R-32"), the basis the store keeps and HISTORY
 *  prints ("default (PM advice: A)"), and the card behind the tag. */
export interface Who { tag: string; basis: string; card: string }

/** One row of the NEW PORTFOLIO form, of Settings and of the settings history. A row with `num` is typed; one with
 *  `choices` is picked; one with neither is a fixed line of text. */
export interface Field {
  key: string;
  section: SectionId;
  label: string;
  after: After;
  who: Who;
  why: string;
  /** The range as the form prints it: "3–25%", "fixed", or "–" where no PM has given one (then no input either). */
  range: string;
  /** An assumption carries the amber A after its name. */
  mark?: "A";
  /** A typed number: its default, its bounds, the decimals a value may carry (or the step it must sit on), the words
   *  of its refusal, what stands before and after the input, and how a stored value is written out. */
  num?: { def: number; lo: number; hi: number; step?: number; dp: number; refuse: string; pre?: string; unit: string; show: string;
    /** the decimals a value is always written with ("5.0", "1.00"); `signed`: a spread, written with its sign */
    fix?: number; signed?: boolean };
  /** A choice: the values and their words; `def` is preselected. */
  choices?: { def: string; options: Array<{ value: string; label: string; line?: string; off?: string }> };
  /** A fixed line: its words (a function of the base currency where they differ). */
  text?: string;
  /** Only on a dollar base (the funding of Tokyo names). */
  usdOnly?: boolean;
  /** The group of an assumption in Settings: Financing · Borrow · Margin · Costs. */
  group?: "Financing" | "Borrow" | "Margin" | "Costs";
}

export interface StartDef {
  id: StartId;
  kind: Kind;
  name: string;        // "Equity long/short · Japan"
  short: string;       // "Equity L/S · Japan"
  offered: boolean;
  /** PF-1's card: its lines on a computer, its one line on a phone, and whose advice. */
  card: { lines: string[]; phone: string; advice: string };
  /** While a start is not offered: its muted line on PF-1 (the long one on a computer, the short one on a phone). */
  notYet?: { line: string; phone: string };
  reference: { short: string; byBase: Record<Base, { label: string; note: string }>; proxy: string; state: string } | null;
  fields: Field[];
  /** What the start can trade, in three lists with fixed words (BP-5; V-13). `bold`: how many of the first lines of
   *  `cannot` are printed bold as a whole (the macro start's three on duration outside the US). */
  trade: { can: string[]; cannot: string[]; bold?: number };
  /** The first limits of the summary card. */
  summary: (v: Record<string, number | string>) => string[];
}

/** The latest stored overnight rate of a base currency, with its date and source; null until one is read. */
export interface CashRate { name: string; rate: number; d: string; source: string; standIn: boolean }
/** What the form needs from the server besides the presets. */
export interface FormFacts {
  today: string;            // the date in Singapore, for a default name
  nextSession: string;      // the day a change made now is in force from
  valuationDay: string;     // the valuation day now (it ends at 17:00 New York)
  nyDate: string;           // the date in New York, for the targets' window
  rates: Record<Base, CashRate | null>;
  usdjpy: { rate: number; d: string; source: string } | null;
  cap: number;
  open: number;
  names: string[];          // the account's open books, for the name's refusal
  consent: ConsentState;
}
export interface ConsentState { version: number; text: string; label: string; agreedAt: string | null }

/** A portfolio as the store keeps it. Money in whole minor units (USD cents, JPY yen). */
export interface BookRow {
  id: string; name: string; kind: Kind; start: StartId; base: Base;
  startingNav: number;      // minor units
  fx: { usd: number; rate: number; d: string; source: string } | null;   // a yen base: its USD equivalent as shown at creation
  targetX: number; targetVol: number;
  reference: string; blend: number | null;
  ladderBase: LadderBase;
  ladder: Ladder;
  houseMultiple: number;
  valuation: string;
  status: "open" | "stopped" | "closed";
  createdAt: string; startedOn: string;
  /** in the list (pf_list): the targets' re-sets and the January lines, so the list can say the targets in force
   *  (EN-6). An answer of a server from before 22 Nov 2026 has neither: the targets of creation stand. */
  resets?: ResetRow[]; retargets?: SettingRow[];
}
export interface Ladder { cut1: number; cap1: number; cut2: number; cap2: number; out: number; cooling: number; deadline: number }
export interface SettingRow {
  id: number; key: string; value: number | string; cls: After | "name"; basis: string; reason: string | null;
  at: string; effectiveFrom: string | null; forYear: number | null; origin: "creation" | "change";
}
export interface NoteRow { id: number; at: string; body: string | null; removedAt: string | null }
/** A January line of the ladder: the reset made, held (a cut in force) or withheld (a losing year, guarded base). */
export interface ResetRow { year: number; kind: "made" | "held" | "withheld"; d: string }
export interface BookFull extends BookRow { settings: SettingRow[]; notes: NoteRow[]; resets: ResetRow[] }

/** What a create asks the store to write. */
export interface NewBook {
  requestId: string; name: string; kind: Kind; start: StartId; base: Base; startingNav: number; fx: BookRow["fx"];
  targetX: number; targetVol: number; reference: string; blend: number | null; ladderBase: LadderBase; ladder: Ladder;
  houseMultiple: number; valuation: string; startedOn: string;
}
export interface NewSetting { key: string; value: number | string; cls: After; basis: string }

/** A refusal of the form: the field and its sentence. */
export interface Refusal { key: string; text: string }

/** The store behind the routes: the database's functions on the server (_shared/pfstore.ts), a list kept in the
 *  browser in the local copy (./memstore.ts). Each call is for one account and can reach no other's rows. A refusal
 *  is thrown as a StoreRefusal, with the words the page shows. */
export interface PfStore {
  consent(account: string): Promise<ConsentState>;
  consentAgree(account: string, version: number): Promise<ConsentState>;
  list(account: string): Promise<BookRow[]>;
  /** the portfolio a form's request id has already made, if any: a second press creates nothing twice */
  findRequest(account: string, requestId: string): Promise<string | null>;
  create(account: string, book: NewBook, settings: NewSetting[]): Promise<{ id: string }>;
  get(account: string, id: string): Promise<BookFull | null>;
  rename(account: string, id: string, name: string, today: string): Promise<void>;
  settingSet(account: string, id: string, s: { key: string; value: number | string; reason: string; effective: string; today: string }): Promise<void>;
  targetsSet(account: string, id: string, t: { x: number; vol: number; nyDate: string }): Promise<{ forYear: number }>;
  noteAdd(account: string, id: string, body: string): Promise<void>;
  noteRemove(account: string, id: string, note: number): Promise<void>;
  remove(account: string, id: string, name: string): Promise<void>;
}
export class StoreRefusal extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
