// NEW PORTFOLIO and CHANGE (P-1): what is typed, read by one set of rules. The page uses them as the form is filled;
// the server uses the same functions before anything is stored, and trusts nothing the page worked out.
//
// A value out of its range is refused in the range's own units ("between 3% and 25%"); a value off its step is
// refused, never rounded ("in steps of 0.5"); what is not a number is "enter a number"; an empty field "enter a
// value". Nothing is corrected silently. A warning (the amber line of the VaR tie) never stops a create.
import type { Base, BookRow, Field, Ladder, LadderBase, NewBook, NewSetting, Refusal, StartId } from "./types.ts";
import { AMOUNT_EXAMPLE, fmtFull, fmtShort, NAV_RANGE, parseAmount, toMinor } from "./money.ts";
import { BY_ACCOUNT, fieldOf, referenceLabel, STARTS } from "./presets.ts";
import { capitalRefusal, varStep, varTie, type TieState } from "./targets.ts";
import { dmy } from "./calendar.ts";
import { FIXED_SETTING, REASON_SHORT, TOGETHER } from "./words.ts";

export type Values = Record<string, number | string>;
/** The form as typed: every field's text, and the choices. */
export type Raw = Record<string, string>;

// ---- a number as written ----
/** "5.0", "10", "0.30": a value with the decimals its row always shows, and no more than it has. */
export function numText(v: number, fix = 0): string {
  const s = String(Math.round(v * 1e6) / 1e6), d = s.includes(".") ? s.split(".")[1].length : 0;
  return d >= fix ? s : v.toFixed(fix);
}
/** What an input holds for a value: "5.0", "-0.25", "+0.40". */
export function inputText(f: Field, v: number): string {
  const t = numText(v, f.num?.fix ?? 0);
  return f.num?.signed && v > 0 ? `+${t}` : t;
}
/** A stored value as a row writes it: "≤ 200% of capital", "the overnight rate − 0.25%", "1 session". */
export function showValue(f: Field, v: number | string): string {
  if (f.choices) return f.choices.options.find((o) => o.value === String(v))?.label ?? String(v);
  if (!f.num || typeof v !== "number") return String(v);
  const t = numText(Math.abs(v), f.num.fix ?? 0), signed = `${v < 0 ? "−" : "+"} ${t}`;
  const out = f.num.show.replace("{s}", signed).replace("{v}", v < 0 ? `−${t}` : t);
  return v === 1 ? out.replace("1 sessions", "1 session").replace("1 final NAVs", "1 final NAV") : out;
}
const stepWords = (step: number): string => `in steps of ${numText(step)}`;
export type Parsed = { ok: true; v: number } | { ok: false; text: string };
/** A typed number against its row: its range, and its step (or the decimals its range is written with). */
export function parseNum(f: Field, raw: string): Parsed {
  const n = f.num;
  if (!n) return { ok: false, text: "enter a value" };
  const s = raw.trim().replace(/−/g, "-").replace(/%$/, "").trim();
  if (!s) return { ok: false, text: "enter a value" };
  if (!/^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s) && !/^[+-]?\.\d+$/.test(s)) return { ok: false, text: "enter a number" };
  const v = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(v)) return { ok: false, text: "enter a number" };
  const step = n.step ?? Math.pow(10, -n.dp), k = v / step;
  if (Math.abs(k - Math.round(k)) > 1e-6) return { ok: false, text: stepWords(step) };
  if (v < n.lo - 1e-9 || v > n.hi + 1e-9) return { ok: false, text: n.refuse };
  return { ok: true, v: Math.round(v * 1e6) / 1e6 };
}
/** The starting NAV as typed, in whole units of the base currency. */
export function parseNav(base: Base, raw: string): Parsed {
  if (!raw.trim()) return { ok: false, text: "enter a value" };
  const v = parseAmount(raw), r = NAV_RANGE[base];
  if (v == null) return { ok: false, text: AMOUNT_EXAMPLE };
  return v < r.lo || v > r.hi ? { ok: false, text: r.refuse } : { ok: true, v };
}

// ---- names, reasons, notes ----
export const NAME_MAX = 60, REASON_MIN = 10, REASON_MAX = 500, NOTE_MAX = 2000;
/** Characters (code points), counted without copying the text: a request of many megabytes is refused at once (the
 *  second review of P-1: a 32 MB note took 290 MB of memory to be refused while it was spread into an array). */
const chars = (s: string): number => { let n = s.length; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { n--; i++; } } } return n; };
/** "Equity L/S · Japan · 21 Nov 2026": the start's short name and today's date in Singapore. */
export const defaultName = (start: StartId, today: string): string => `${STARTS[start].short} · ${dmy(today)}`;
/** A name as it is stored and shown (RT-5): composed letters (NFC), every run of white space (a tab, a no-break or a
 *  full-width space among them) one ordinary space, and no space at either end. What the screens draw is then what
 *  is stored, and a name can be typed again as it is seen. */
export const cleanName = (name: string): string => name.normalize("NFC").replace(/[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ").trim();
/** Characters that draw nothing or turn the text round: control characters, zero-width ones, direction marks. */
const UNSEEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;
export const NAME_UNSEEN = "a name holds only characters that show: no control, zero-width or direction characters";
/** A portfolio's name: 1 to 60 characters, every one of them seen, and not the name of another open book of the
 *  account (both compared as stored: cleanName). */
export function nameRefusal(name: string, others: string[]): string | null {
  const n = cleanName(name);
  if (UNSEEN.test(n)) return NAME_UNSEEN;
  if (!n) return "give the portfolio a name";
  if (chars(n) > NAME_MAX) return `${NAME_MAX} characters at most · ${chars(n) - NAME_MAX} over`;
  return others.some((o) => cleanName(o) === n) ? "you already have an open portfolio with this name" : null;
}
/** U+0000 cannot be stored in the database's text: refused in words on both sides, never a server error. */
export const NO_NUL = "this text holds the character U+0000, which cannot be stored";
/** The reason of a change: 10 to 500 characters, kept in the history. */
export function reasonRefusal(reason: string): string | null {
  if (reason.includes("\u0000")) return NO_NUL;
  const n = chars(reason.trim());
  if (n < REASON_MIN) return REASON_SHORT;
  return n > REASON_MAX ? `${REASON_MAX} characters at most · ${n - REASON_MAX} over` : null;
}
/** A note: at most 2,000 characters; nothing is cut silently. */
export function noteRefusal(body: string): string | null {
  if (body.includes("\u0000")) return NO_NUL;
  const n = chars(body);
  if (!body.trim()) return "write the note first";
  return n > NOTE_MAX ? `${fmtFull(NOTE_MAX)} characters at most · ${fmtFull(n - NOTE_MAX)} over` : null;
}
export const noteLeft = (body: string): number => NOTE_MAX - chars(body);

// ---- the form ----
/** A start's defaults on a base currency, as the form opens: each typed row's text and each choice. */
export function defaultRaw(start: StartId, base: Base): Raw {
  const raw: Raw = { base, nav: fmtFull(NAV_RANGE[base].def) };
  for (const f of STARTS[start].fields) {
    if (f.key === "base" || (f.usdOnly && base !== "USD")) continue;
    if (f.num) raw[f.key] = inputText(f, f.num.def);
    else if (f.choices) raw[f.key] = f.choices.def;
  }
  return raw;
}
const baseOf = (raw: Raw): Base => (raw.base === "JPY" ? "JPY" : "USD");
/** The rows a start stores on a base currency: every typed row and every choice but the base itself. */
const stored = (start: StartId, base: Base): Field[] => STARTS[start].fields.filter((f) => f.key !== "base" && (f.num || f.choices) && (!f.usdOnly || base === "USD"));

export interface Checked {
  base: Base;
  nav: number | null;
  values: Values;                 // every row that reads: its number or its choice
  refusals: Refusal[];            // one per refused field, in the form's order; CREATE counts them
  warnings: Refusal[];            // amber: they never count
  tie: { state: TieState; line: string } | null;
  changed: string[];              // the keys whose value is not the start's default
}
/** The amber line may not sit inside the band around the target (the designer's guard, Q-P2). */
export const amberRefusal = (amber: number, band: number): string | null => (amber >= 100 + band ? null : `amber above ${amber}% would fall inside the band, which ends at ${100 + band}%`);
/** The band's top may not pass the amber line either: the same guard, from the band's side. */
export const bandRefusal = (band: number, amber: number): string | null => (100 + band <= amber ? null : `a band of ±${band} points would end at ${100 + band}%, above the amber line at ${amber}%`);

export function checkForm(start: StartId, name: string, raw: Raw, others: string[]): Checked {
  const base = baseOf(raw), def = defaultRaw(start, base), values: Values = {}, refusals: Refusal[] = [], warnings: Refusal[] = [], changed: string[] = [];
  const nm = nameRefusal(name, others);
  if (nm) refusals.push({ key: "name", text: nm });
  if (base !== "USD") changed.push("base");
  const nav = parseNav(base, raw.nav ?? "");
  if (!nav.ok) refusals.push({ key: "nav", text: nav.text });
  else if (nav.v !== NAV_RANGE[base].def) changed.push("nav");
  for (const f of stored(start, base)) {
    const typed = raw[f.key] ?? def[f.key] ?? "";
    if (f.num) {
      const p = parseNum(f, typed);
      if (!p.ok) { refusals.push({ key: f.key, text: p.text }); continue; }
      values[f.key] = p.v;
      if (p.v !== f.num.def) changed.push(f.key);
    } else if (f.choices) {
      const opt = f.choices.options.find((o) => o.value === typed && !o.off);
      if (!opt) { refusals.push({ key: f.key, text: "choose one of the values offered" }); continue; }
      values[f.key] = opt.value;
      if (opt.value !== f.choices.def) changed.push(f.key);
    }
  }
  const n = (k: string): number | null => (typeof values[k] === "number" ? (values[k] as number) : null);
  // capital after the second cut below the first (C-24): under the second field
  const cap1 = n("cap1"), cap2 = n("cap2");
  if (cap1 != null && cap2 != null) { const t = capitalRefusal(cap1, cap2); if (t) refusals.push({ key: "cap2", text: t }); }
  const amber = n("amber"), band = n("band");
  if (amber != null && band != null) { const t = amberRefusal(amber, band); if (t) refusals.push({ key: "amber", text: t }); }
  // the target volatility against the VaR limit (R-31): one refusal, under the target; the same line under the limit
  let tie: Checked["tie"] = null;
  const vol = n("target_vol"), lim = n("var");
  if (vol != null && lim != null) {
    const t = varTie(vol, lim, varStep(start));
    tie = { state: t.state, line: t.line };
    if (t.state === "refused") refusals.push({ key: "target_vol", text: t.line });
    else if (t.state === "warned") warnings.push({ key: "target_vol", text: t.line });
  }
  return { base, nav: nav.ok ? nav.v : null, values, refusals, warnings, tie, changed };
}
/** "0 settings out of range", "2 settings out of range": what CREATE counts. */
export const outOfRange = (n: number): string => `${n} setting${n === 1 ? "" : "s"} out of range`;

/** A yen base's starting NAV in dollars, at the stored USD/JPY close: what the form prints under the amount. */
export function usdLine(nav: number, fx: { rate: number; d: string; source: string } | null): { usd: number | null; line: string } {
  if (!fx || !(fx.rate > 0)) return { usd: null, line: "= its USD equivalent is shown once a USD/JPY close is stored" };
  const usd = nav / fx.rate;
  return { usd, line: `= ${fmtShort("USD", usd)} at ${fx.rate.toFixed(3)}, the 17:00 New York close of ${dmy(fx.d)} (${fx.source})` };
}

/** A checked form as the store's rows: the portfolio, and one setting per typed row and choice, each with whose it is
 *  ("set by the account" where it is not the start's default). */
export function buildCreate(start: StartId, name: string, c: Checked, ctx: { requestId: string; startedOn: string; usdjpy: { rate: number; d: string; source: string } | null }): { book: NewBook; settings: NewSetting[] } {
  const def = STARTS[start], v = c.values, base = c.base, nav = c.nav ?? NAV_RANGE[base].def, blend = typeof v.blend === "string" ? Number(v.blend) : null;
  const num = (k: string): number => v[k] as number;
  const ladder: Ladder = { cut1: num("cut1"), cap1: num("cap1"), cut2: num("cut2"), cap2: num("cap2"), out: num("out"), cooling: num("cooling"), deadline: num("deadline") };
  const fx = base === "JPY" ? usdLine(nav, ctx.usdjpy) : null;
  const book: NewBook = {
    requestId: ctx.requestId, name: cleanName(name), kind: def.kind, start, base, startingNav: toMinor(base, nav),
    fx: fx && fx.usd != null && ctx.usdjpy ? { usd: Math.round(fx.usd), rate: ctx.usdjpy.rate, d: ctx.usdjpy.d, source: ctx.usdjpy.source } : null,
    // the Reference the book will have, on its base and with its blend (EN-5): never the start's default label
    targetX: num("target_x"), targetVol: num("target_vol"), reference: referenceLabel(start, base, blend)?.short ?? "", blend,
    ladderBase: v.ladder_base as LadderBase, ladder, houseMultiple: num("house_multiple"), valuation: "17:00 New York", startedOn: ctx.startedOn,
  };
  const settings: NewSetting[] = stored(start, base).map((f) => {
    const isDefault = f.num ? v[f.key] === f.num.def : v[f.key] === f.choices?.def;
    return { key: f.key, value: v[f.key], cls: f.after, basis: isDefault ? f.who.basis : BY_ACCOUNT.basis };
  });
  return { book, settings };
}

// ---- CHANGE: one setting, after creation ----
export const SAME_VALUE = "this is the value in force";
export const SAME_PENDING = "this is the value already pending";
/** What a change is checked against (RT-2, RT-3, EN-6, EN-7): the values in force today (`now`); the values that will
 *  be in force once the changes already saved are (`ahead`: each setting's pending value where one waits, else its
 *  value in force); and the target volatilities the VaR limit has to cover (the pair in force, after a January
 *  re-set, and a pair entered for next year). Without `ahead` and `vols`, what is in force today. */
export interface ChangeBasis { now: Values; ahead?: Values; vols?: number[] }
/** A new value for one limit or assumption, against its row and what will be in force with it. A change waits for the
 *  next session; while one waits, the value in force is a change of its own (it replaces the one pending), and the
 *  pending value typed again is refused. A setting tied to another is checked against the other's value as it will
 *  stand: the pending one where one waits. */
export function checkChange(book: Pick<BookRow, "start" | "base">, key: string, typed: string, basis: Values | ChangeBasis): Parsed | { ok: true; v: string } {
  const b: ChangeBasis = "now" in basis && typeof basis.now === "object" && basis.now !== null ? (basis as ChangeBasis) : { now: basis as Values };
  const now = b.now, ahead = b.ahead ?? now, waiting = ahead[key] !== undefined && ahead[key] !== now[key];
  const same = (v: number | string): string | null => (v === ahead[key] ? (waiting ? SAME_PENDING : SAME_VALUE) : null);
  const f = fieldOf(book.start, key);
  if (f?.after === "window") return { ok: false, text: TOGETHER };   // a target is re-set with its pair, in its window
  if (!f || (f.after !== "limit" && f.after !== "assumption")) return { ok: false, text: FIXED_SETTING };
  if (f.choices) {
    const opt = f.choices.options.find((o) => o.value === typed && !o.off);
    if (!opt) return { ok: false, text: "choose one of the values offered" };
    const t = same(opt.value);
    return t ? { ok: false, text: t } : { ok: true, v: opt.value };
  }
  if (!f.num) return { ok: false, text: FIXED_SETTING };   // a row no PM has given a range: no CHANGE
  const p = parseNum(f, typed);
  if (!p.ok) return p;
  const t0 = same(p.v);
  if (t0) return { ok: false, text: t0 };
  const n = (k: string): number | null => (typeof ahead[k] === "number" ? (ahead[k] as number) : null);
  if (key === "var") {
    const vols = (b.vols ?? [n("target_vol")]).filter((x): x is number => typeof x === "number");
    if (vols.length) { const t = varTie(Math.max(...vols), p.v, varStep(book.start)); if (t.state === "refused") return { ok: false, text: t.line }; }
  }
  if (key === "amber") { const band = n("band"); if (band != null) { const t = amberRefusal(p.v, band); if (t) return { ok: false, text: t }; } }
  if (key === "band") { const amber = n("amber"); if (amber != null) { const t = bandRefusal(p.v, amber); if (t) return { ok: false, text: t }; } }
  return p;
}
/** Next year's targets, typed in the window: each in its range and on its step, and the pair against the VaR limit. */
export function checkTargets(start: StartId, xTyped: string, volTyped: string, varLimit: number | null): { ok: true; x: number; vol: number; tie: { state: TieState; line: string } | null } | { ok: false; refusals: Refusal[] } {
  const fx = fieldOf(start, "target_x"), fv = fieldOf(start, "target_vol"), refusals: Refusal[] = [];
  const x = fx ? parseNum(fx, xTyped) : { ok: false as const, text: FIXED_SETTING }, vol = fv ? parseNum(fv, volTyped) : { ok: false as const, text: FIXED_SETTING };
  if (!x.ok) refusals.push({ key: "target_x", text: x.text });
  if (!vol.ok) refusals.push({ key: "target_vol", text: vol.text });
  let tie: { state: TieState; line: string } | null = null;
  if (vol.ok && varLimit != null) { const t = varTie(vol.v, varLimit, varStep(start)); tie = { state: t.state, line: t.line }; if (t.state === "refused") refusals.push({ key: "target_vol", text: t.line }); }
  return x.ok && vol.ok && refusals.length === 0 ? { ok: true, x: x.v, vol: vol.v, tie } : { ok: false, refusals };
}
