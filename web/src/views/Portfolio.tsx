// PORTFOLIO (P-1, 21 Nov 2026): the paper portfolio's tab, on both layouts.
//   #portfolio                 the book last opened on this device; with none remembered, the list; with no book, the starts
//   #portfolio/all             the account's books
//   #portfolio/new[/<start>]   NEW PAPER PORTFOLIO (on a phone also …/review and …/edit/<section>)
//   #portfolio/<id>            a book's Overview;  #portfolio/<id>/settings[/<section>]  its Settings
//   #portfolio/<id>/ticket[?s=<symbol>&side=buy]  the order ticket (P-2.1), beside Overview on a computer, in its place on a phone
// Any other view of a book is not built and opens Overview; an id that is not the account's says so.
// This file and everything it draws are loaded only where the page draws the paper book (lib/paper.ts): the switch
// on, or a preview for this account, whose every screen then opens with the preview line (components/pf/Preview.tsx).
// For anyone else the published page never asks for this file.
import type { ReactNode } from "react";
import { Panel } from "../components/Panel";
import { Screen, Section } from "../components/PhoneKit";
import { Book } from "../components/pf/Book";
import { NewPortfolio } from "../components/pf/NewPortfolio";
import { Flash, href, lastBook, Muted, PaperMark } from "../components/pf/shared";
import { PreviewLine } from "../components/pf/Preview";
import { serverWords, useRead, type ListAnswer, type Read } from "../lib/pf";
import { fmtFull, fromMinor } from "../lib/pf/money.ts";
import { AR_STARTS, CAP_LINE, RR_STARTS, STARTS } from "../lib/pf/presets.ts";
import { BASE_NAME } from "../lib/pf/targets.ts";
import { dmy, sgDate, valuationDay } from "../lib/pf/calendar.ts";
import { rowTargets, targetsWords } from "../lib/pf/view.ts";
import type { BookRow } from "../lib/pf/types.ts";
import { ONLY_YOU, PORTFOLIO } from "../lib/labels";
import { setPhoneV2 } from "../lib/phone";
import { fmtStamp } from "../lib/time";

/** The targets in force, after a January re-set (EN-6): the list's row carries the re-sets; an older answer does not. */
// the targets' window and a January re-set follow the book day (valuationDay: PM A's answer of 22 Nov 2026)
const targetsOf = (r: BookRow): string => { const t = rowTargets(r, valuationDay(new Date())); return targetsWords(t.x, t.vol); };

const INTRO = "Run a paper portfolio from today. Orders fill only on the market's own prints after they are placed, with spreads, fees and a 20% cap on volume. No real orders, no broker, no money. Only your account sees it.";
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
// a phone's list row names the SGT day the book was made, "created 1 Oct 2026", as the computer's CREATED and the
// book's own head ("since" is a book day only: the designer's B.0.1, revision 2; until 22 Nov 2026 the row read "since"
// the book's first New York day, the day before from 00:00 to 06:00 SGT)
const createdDay = (r: BookRow): string => dmy(sgDate(new Date(r.createdAt)));
const readError = (list: Read<ListAnswer>): ReactNode => (list.error && list.keptAt == null
  ? <p className="pf-err" id="pf-read-error">Your paper portfolios could not be read: {serverWords(list.error)}. Nothing in them has changed. <button type="button" className="pf-link" onClick={list.reload}>RETRY</button></p> : null);
const keptLine = (list: Read<ListAnswer>): ReactNode => (list.keptAt != null ? <p className="pf-mut pf-kept" id="pf-kept">Offline: what this device last read, as of {fmtStamp(new Date(list.keptAt))}.</p> : null);

/** With no book: what a paper portfolio is, the three starts that are offered, and the two that are not yet. The two
 *  are text: no border, no pointer, nothing that takes a tap or the focus. */
function NoBook({ phone, state }: { phone: boolean; state: ReactNode | null }) {
  if (phone) return (
    <Screen title={PORTFOLIO} slim>
      <Section title="Paper portfolios" aux={<PaperMark phone />} pad><p className="pfp-intro" id="pf-intro">{INTRO}</p></Section>
      {state ?? (
        <>
          <div className="pfp-group">ABSOLUTE RETURN · against its own targets</div>
          <div className="mp-card" id="pf-cards">
            {AR_STARTS.map((s) => <a className="pfp-startlink" key={s} href={href(`new/${s}`)} data-start={s}><span className="tx"><span className="n">{STARTS[s].name}</span><span className="l">{STARTS[s].card.phone}</span></span><span className="go" aria-hidden="true">&#8250;</span></a>)}
          </div>
          <div className="pfp-group">RELATIVE RETURN · against a benchmark</div>
          <div className="pfp-pad" id="pf-notyet">{RR_STARTS.map((s) => <Muted key={s} cls="notyet">{STARTS[s].notYet?.phone}</Muted>)}</div>
        </>
      )}
    </Screen>
  );
  return (
    <div className="pf">
      <Panel no="01" title="PAPER PORTFOLIOS" k="pf-none" csv={false} aux={<PaperMark />}>
        <p className="pf-intro" id="pf-intro">{INTRO}</p>
        {state ?? (
          <>
            <div className="pf-grouphd">ABSOLUTE RETURN · judged on risk-adjusted return against its own targets</div>
            <div className="pf-cards" id="pf-cards">
              {AR_STARTS.map((s) => (
                <a className="pf-card" key={s} href={href(`new/${s}`)} data-start={s}>
                  <span className="t">{STARTS[s].name}</span>
                  {STARTS[s].card.lines.map((l) => <span className="l" key={l}>{l}</span>)}
                  <span className="by">{STARTS[s].card.advice}</span>
                </a>
              ))}
            </div>
            <div className="pf-grouphd">RELATIVE RETURN · judged against a benchmark</div>
            <div id="pf-notyet">{RR_STARTS.map((s) => <Muted key={s} cls="notyet">{STARTS[s].notYet?.line}</Muted>)}</div>
          </>
        )}
      </Panel>
    </div>
  );
}

/** The account's books. No NAV, DAY, SINCE START, AGAINST or STATE column: they come with the NAV, and an empty column
 *  is not drawn before. */
function List({ list, phone }: { list: Read<ListAnswer>; phone: boolean }) {
  const d = list.data!, rows = d.rows, atCap = d.open >= d.cap;
  if (phone) return (
    <Screen title={PORTFOLIO} slim>
      {keptLine(list)}
      <Section title="Paper portfolios" aux={`${d.open} open · ${ONLY_YOU}`}>
        <div id="pf-list">
          {rows.map((r) => (
            <a className="pfp-book-row" key={r.id} href={href(r.id)} data-book={r.id}>
              <span className="tx"><span className="n">{r.name}</span><span className="l">{STARTS[r.start].short} · {r.base} · {fmtFull(fromMinor(r.base, r.startingNav))}</span><span className="l">{targetsOf(r)} · created {createdDay(r)}</span></span>
              <span className="go" aria-hidden="true">&#8250;</span>
            </a>
          ))}
        </div>
      </Section>
      <div className="pfp-pad pfp-new">{atCap ? <p className="pf-capline" id="pf-cap">{CAP_LINE}</p> : <a className="pf-go big" id="pf-new" href={href("new")} role="button">+ New paper portfolio</a>}</div>
    </Screen>
  );
  return (
    <div className="pf">
      <Panel no="01" title="PAPER PORTFOLIOS" k="pf-list" after={<span className="pf-after">· {d.open} open · {ONLY_YOU}</span>} aux={atCap ? undefined : <a className="pf-go" id="pf-new" href={href("new")} role="button">+ NEW PAPER PORTFOLIO</a>}>
        {keptLine(list)}
        {atCap && <p className="pf-capline" id="pf-cap">{CAP_LINE}</p>}
        <table className="secT pf-list" id="pf-list"><thead><tr><th className="l">Name</th><th className="l">Start</th><th className="l">Base</th><th>Starting NAV</th><th className="l">Targets</th><th className="l c-ladder">Ladder base</th><th className="l c-created">Created</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} data-book={r.id}><td className="l wrap nm"><a href={href(r.id)}>{r.name}</a></td><td className="l">{STARTS[r.start].short}</td><td className="l">{r.base}</td><td className="num">{fmtFull(fromMinor(r.base, r.startingNav))}</td><td className="l">{targetsOf(r)}</td><td className="l wrap c-ladder">{lower(BASE_NAME[r.ladderBase])}</td><td className="l nb c-created">{createdDay(r)}</td></tr>
          ))}</tbody></table>
      </Panel>
    </div>
  );
}

/** `#portfolio` and `#portfolio/all`. */
function Home({ all, phone, tick }: { all: boolean; phone: boolean; tick: number }) {
  const list = useRead<ListAnswer>("pf_list", {}, Math.floor(tick / 5));
  if (!list.data) return <NoBook phone={phone} state={readError(list) ?? <Muted>loading…</Muted>} />;
  const rows = list.data.rows;
  if (!rows.length) return <NoBook phone={phone} state={null} />;
  const last = all ? null : lastBook();
  if (last && rows.some((r) => r.id === last)) return <Book id={last} view="overview" section="" phone={phone} tick={tick} />;
  return <List list={list} phone={phone} />;
}

/** `#portfolio/<id>/ticket[?s=7203.T&side=buy]`: the order ticket over Overview, filled in (P-2.1). */
function ticketOf(second: string): { s: string; side: string } | null {
  const [v, q = ""] = second.split("?");
  if (v !== "ticket") return null;
  const p = new URLSearchParams(q);
  return { s: (p.get("s") ?? "").slice(0, 20), side: p.get("side") ?? "" };
}

export default function PortfolioView({ sub, tick, phone, classic }: { sub: string; tick: number; phone: boolean; classic: boolean }) {
  // the earlier phone layout shows the computer's tabs, this one among them: its page is one line
  if (classic) return <><PreviewLine phone /><div className="pf"><p className="pf-classic" id="pf-classic">Paper portfolios are made for the phone layout · <button type="button" className="pf-link" onClick={() => setPhoneV2(true)}>NEW LAYOUT &#8250;</button></p></div></>;
  const [head = "", second = "", third = ""] = sub.split("/");
  const page = head === "new" ? <NewPortfolio sub={sub} phone={phone} tick={tick} />
    : head === "" || head === "all" ? <Home all={head === "all"} phone={phone} tick={tick} />
      : <Book key={head} id={head} view={second === "settings" ? "settings" : "overview"} section={second === "settings" ? third : ""} phone={phone} tick={tick} ticket={ticketOf(second)} />;
  return <><PreviewLine phone={phone} />{page}<Flash /></>;
}
