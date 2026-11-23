// The order ticket (P-2.1, 23 Nov 2026): what an order typed in comes to, before anything is placed (the designer's
// PF-5, its first rows). Name, side and size; under them the quantity in whole lots, the part not placed, and the price
// it is sized on with its time, its age and its source. It places nothing: the line at its foot says placing comes next.
// On a computer a 460-px panel at the right of the book, beside Overview, under the preview line; on a phone a page of
// the book. The server reads the price (pf_ticket, asked when the name is looked up and again each minute); the size is
// worked out here with the server's own rules (lib/pf/size.ts, the same file), so it follows every key at once.
import { useEffect, useState, type ReactNode } from "react";
import { Panel } from "../Panel";
import { Section } from "../PhoneKit";
import { href } from "./shared";
import { failureWords, noTicketRoute, pfTicket, type TicketAnswer } from "../../lib/pf";
import { ageWords, SIDE_WORD, SIDES, sizeOrder, toUnit, type Side, type SizeBy } from "../../lib/pf/size.ts";
import { parseAmount } from "../../lib/pf/money.ts";
import { timeSgt } from "../../lib/pf/calendar.ts";
import { TICKET_NOT_ON_SERVER, TICKET_NOTE } from "../../lib/pf/words.ts";
import type { BookFull } from "../../lib/pf/types.ts";
import { STARTS } from "../../lib/pf/presets.ts";

const grp = (n: number, dp = 0): string => { const [i, f] = Math.abs(n).toFixed(dp).split("."); return `${n < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? `.${f}` : ""}`; };
/** Money as a sentence writes it: yen whole, dollars with their cents when there are any. */
const money = (ccy: string, n: number): string => `${ccy} ${grp(n, ccy === "USD" && Math.round(n * 100) % 100 !== 0 ? 2 : 0)}`;
const priceWords = (ccy: string, p: number): string => grp(p, ccy === "JPY" ? 1 : 2);
const VENUE: Record<string, string> = { TSE: "Tokyo", NYSE: "New York" };
const MARKET: Record<string, string> = { open: "open", break: "lunch break", closed: "closed", holiday: "holiday" };

export function Ticket({ book, phone, init }: { book: BookFull; phone: boolean; init: { s: string; side: string } }) {
  const [typed, setTyped] = useState(init.s), [sym, setSym] = useState(init.s.trim().toUpperCase());
  const [side, setSide] = useState<Side>((SIDES as string[]).includes(init.side) ? (init.side as Side) : "buy");
  const [by, setBy] = useState<SizeBy>("pct"), [value, setValue] = useState("");
  const [got, setA] = useState<TicketAnswer | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [minute, setMinute] = useState(0);
  useEffect(() => { const t = setInterval(() => setMinute((m) => m + 1), 60e3); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!sym) { setA(null); setErr(null); return; }
    let alive = true;
    setBusy(true);
    pfTicket(book.id, sym).then((r) => { if (alive) { setA(r); setErr(null); setSide((x) => (r.sides.includes(x) ? x : r.sides[0])); } })
      .catch((e: unknown) => { if (alive) { setErr(noTicketRoute(e) ? TICKET_NOT_ON_SERVER : failureWords(e, { offline: "Offline: the ticket's price needs the server.", signedOut: "Signed out: sign in again.", refused: (w) => `The price could not be read: ${w}.` })); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, sym, minute]);
  const look = () => setSym(typed.trim().toUpperCase());
  // the answer of the name now looked up only; none while a read fails
  const a = got && got.symbol === sym && !err ? got : null;
  const inst = a?.instrument ?? null, print = a?.print ?? null, cap = book.kind === "AR" ? "capital" : "NAV";
  const ways: Array<[SizeBy, string, string]> = [["pct", `% of ${cap}`, "%"], ["bps", `bp of ${cap}`, "bp"], ["base", `Amount in ${book.base}`, book.base]];
  if (inst && inst.ccy !== book.base) ways.push(["local", `Amount in ${inst.ccy}`, inst.ccy]);
  ways.push(["shares", "Shares", "shares"]);
  const unit = ways.find((w) => w[0] === by)?.[2] ?? "";
  // an amount reads as the creation form reads one ("1m", "1.5bn", "1,000,000"), or as a plain figure; the rest as a figure
  const num = (by === "base" || by === "local" ? parseAmount(value) : null) ?? Number(value.replace(/,/g, ""));
  const sized = inst && print && value.trim() !== "" ? sizeOrder({ side, by, value: num, position: a!.position, lot: inst.lot, price: print.tooOld ? null : print.price, ccy: inst.ccy, base: book.base, usdjpy: a!.fx?.rate ?? null, kind: book.kind, capital: a!.book.capital }) : null;
  // the print's age now: the server's figure at its read, plus the minutes since (the read is asked again each minute)
  const age = print && a ? print.ageMin + Math.max(0, Math.round((Date.now() - Date.parse(a.asked)) / 60e3)) : null;

  const nameLine: ReactNode = err ? <p className="pf-err" id="pf-t-error">{err}</p>
    : a?.refusal ? <p className="pf-err" id="pf-t-refusal">{a.refusal}</p>
      : inst && a ? (
        <div className="pf-t-lines" id="pf-t-name">
          <div><b>{inst.name ?? a.symbol}</b> · {VENUE[inst.venue]}{inst.market ? ` · ${MARKET[inst.market]}` : ""} · lot {grp(inst.lot)} {inst.lot === 1 ? "share" : "shares"}</div>
          <div id="pf-t-print">{print ? <>last {priceWords(inst.ccy, print.price)} {inst.ccy} · {timeSgt(print.at)} SGT · {ageWords(age ?? print.ageMin)} old · {print.source}</> : <>last price: – (none read)</>}</div>
          {print?.tooOld && <div className="warn" id="pf-t-old">{print.why}</div>}
          <div className="m">position: none (no order has been placed)</div>
        </div>
      ) : sym && busy ? <p className="pf-mut">reading the price…</p> : <p className="pf-mut">Type a symbol: a Tokyo name ends in .T (7203.T); a US one has none (NVDA).</p>;

  const result: ReactNode = !sized ? null : !sized.ok ? <p className="pf-err" id="pf-t-why">{sized.text}</p> : (
    <div className="pf-t-lines" id="pf-t-result">
      {sized.askedBase != null && inst && <div className="m" id="pf-t-conv">= {money(book.base, sized.askedBase)}{inst.ccy !== book.base && sized.askedLocal != null && a?.fx ? <> = {money(inst.ccy, sized.askedLocal)} at USD/JPY {a.fx.rate.toFixed(3)} ({timeSgt(a.fx.at)} SGT · {a.fx.source})</> : null}</div>}
      <div className="q" id="pf-t-qty">→ {SIDE_WORD[side]} {grp(sized.qty)} {sized.qty === 1 ? "share" : "shares"}{inst && inst.lot > 1 ? ` (${grp(inst.lot)}-share lots)` : ""}</div>
      <div id="pf-t-left">{sized.leftShares != null ? `${grp(sized.leftShares)} ${sized.leftShares === 1 ? "share" : "shares"} not placed` : sized.leftLocal != null && inst ? `${money(inst.ccy, toUnit(inst.ccy, sized.leftLocal))} not placed` : "not placed: –"}
        {" · "}{sized.placedLocal != null && inst ? `${money(inst.ccy, sized.placedLocal)} at ${priceWords(inst.ccy, print!.price)}` : "value: – (no price to value it on)"}</div>
      {sized.qty === 0 && inst && <div className="warn">Less than one lot: nothing would be placed.</div>}
    </div>
  );

  const form = (
    <div className={`pf-ticket-form${phone ? " ph" : ""}`} data-asked={a?.symbol ?? ""}>
      <label className="pf-t-row"><span className="k">Name</span>
        <span className="pf-t-name"><input id="pf-t-symbol" value={typed} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="7203.T or NVDA" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); look(); } }} onBlur={look} />
          <button type="button" className="pf-go" id="pf-t-look" onClick={look}>{phone ? "Look up" : "LOOK UP"}</button></span>
      </label>
      {nameLine}
      <div className="pf-t-row"><span className="k">Side</span>
        <span className="pf-t-sides" id="pf-t-sides" role="group" aria-label="Side">{SIDES.map((x) => {
          const can = !a || a.sides.includes(x);
          return <button key={x} type="button" data-side={x} className={x === side ? "on" : undefined} aria-pressed={x === side} disabled={!can} title={can ? undefined : x === "sell" ? "No position to sell" : "No short to cover"} onClick={() => setSide(x)}>{SIDE_WORD[x]}</button>;
        })}</span>
      </div>
      <div className="pf-t-row"><span className="k">Size</span>
        <span className="pf-t-size"><select id="pf-t-by" aria-label="Size by" value={by} onChange={(e) => setBy(e.target.value as SizeBy)}>{ways.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input id="pf-t-value" inputMode="decimal" aria-label="Size" value={value} onChange={(e) => setValue(e.target.value)} /><span className="u">{unit}</span></span>
      </div>
      {result}
      <p className={phone ? "mp-note pf-t-note" : "pf-mut pf-t-note"} id="pf-t-note">{a?.note ?? TICKET_NOTE}</p>
    </div>
  );
  const title = `${book.name} (${book.kind} · ${book.base})`;
  if (phone) return <Section title="Paper order" aux={STARTS[book.start].short} pad><div id="pf-ticket" className="pfp-ticket">{form}</div></Section>;
  return (
    <aside className="pf-ticket" id="pf-ticket" aria-label="Paper order" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); location.hash = href(book.id); } }}>
      <Panel no="" title={`PAPER ORDER · ${title}`} k="pf-ticket" csv={false} aux={<a className="pf-link" id="pf-t-close" href={href(book.id)} aria-label="Close the ticket">&#10005;</a>}>{form}</Panel>
    </aside>
  );
}
