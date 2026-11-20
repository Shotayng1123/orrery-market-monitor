import { useState } from "react";
import { Empty } from "./Panel";
import { decodeEntities } from "./Headlines";
import { FEED_STEP, feedRows, type FeedFilter, type FeedRow, type StockFeed } from "../lib/stock";
import { fmtWhen } from "../lib/time";

/** NEWS on a stock's page (I-3, 20 Nov 2026; the designer's I-3 note): the Monitor's own headlines that name the
 *  stock and its own alerts on it, newest first, with All · Headlines · Alerts (filings join with I-20). Each row:
 *  the time (SGT, said in the head: "23:22" today, "19 Nov 23:22" before; lib/time.ts fmtWhen), whether it is a
 *  headline or an alert, where it came from; under it the headline
 *  or the alert, wrapping. Fifteen rows, then "SHOW 15 MORE": never a box that scrolls inside the page. */
const FILTERS: Array<[FeedFilter, string]> = [["all", "All"], ["headlines", "Headlines"], ["alerts", "Alerts"]];
const KIND: Record<FeedRow["kind"], string> = { headline: "Headline", alert: "Alert" };

function emptyText(symbol: string, filter: FeedFilter, days: number): string {
  return filter === "headlines" ? `No headlines name ${symbol} in the last ${days} days.` : filter === "alerts" ? `No alerts on ${symbol} in the last ${days} days.` : `No headlines or alerts name ${symbol} in the last ${days} days.`;
}
/** An instrument's headlines are matched by words (I-4): its empty list says which, or that it has none to match by. */
function emptyMatched(name: string, words: string[], filter: FeedFilter, days: number): string {
  const said = words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}` : words[0];
  const heads = words.length ? `no headline matched ${said}` : "the Monitor has no words to match headlines to it by";
  if (filter === "alerts") return `No alerts on ${name} in the last ${days} days.`;
  if (filter === "headlines") return words.length ? `No headline in the last ${days} days matched ${said}.` : `The Monitor has no words to match headlines to ${name} by.`;
  return `In the last ${days} days ${heads}, and there was no alert on ${name}.`;
}

/** The list and its filter; `phone` draws the phone's rows (`.nw-row`) and toggles. `matched` (an instrument's page):
 *  the words its headlines were matched by, which its empty list names; `name` what the list is about. */
export function StockNews({ symbol, feed, phone = false, matched, name }: { symbol: string; feed: StockFeed; phone?: boolean; matched?: string[]; name?: string }) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [shown, setShown] = useState(FEED_STEP);
  const rows = feedRows(feed, filter), more = Math.min(FEED_STEP, rows.length - shown);
  const choose = (f: FeedFilter) => { setFilter(f); setShown(FEED_STEP); };
  const failed = feed.error ? <p className={phone ? "mp-note warn" : "finnote warn"}>Not everything could be read: {feed.error}.</p> : null;
  const none = matched ? emptyMatched(name ?? symbol, matched, filter, feed.days) : emptyText(symbol, filter, feed.days);
  if (phone) return (
    <>
      <div className="mp-picks" id="st-news-f">{FILTERS.map(([f, label]) => <button type="button" key={f} className={`mp-tog${filter === f ? " on" : ""}`} aria-pressed={filter === f} onClick={() => choose(f)}>{label}</button>)}</div>
      <div className="mp-card" id="st-news">
        {rows.length ? rows.slice(0, shown).map((r) => {
          const body = <><span className="nw-meta"><span className="nb">{fmtWhen(r.at)}</span><b className={`snk ${r.kind}`}>{KIND[r.kind]}</b><span className="src">{r.source}</span></span><span className="nw-title">{decodeEntities(r.title)}</span></>;
          return r.url ? <a className="nw-row" key={r.key} data-kind={r.kind} href={r.url} target="_blank" rel="noreferrer">{body}</a> : <div className="nw-row plain" key={r.key} data-kind={r.kind}>{body}</div>;
        }) : <Empty title={none} />}
      </div>
      {more > 0 && <button type="button" className="mp-more" id="st-news-more" onClick={() => setShown((n) => n + FEED_STEP)}>Show {more} more of {rows.length}</button>}
      {failed}
    </>
  );
  return (
    <>
      <span className="chips" id="st-news-f">{FILTERS.map(([f, label]) => <span key={f} role="button" tabIndex={0} className={`chip-sm${filter === f ? " on" : ""}`} onClick={() => choose(f)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(f); } }}>{label.toUpperCase()}</span>)}</span>
      {rows.length ? (
        <div className="snlist" id="st-news">
          {rows.slice(0, shown).map((r) => (
            <div className={`snrow ${r.kind}`} key={r.key} data-kind={r.kind}>
              <div className="snm"><span className="nb">{fmtWhen(r.at)}</span> · <span className={`snk ${r.kind}`}>{KIND[r.kind]}</span> · <span className="src">{r.source}</span></div>
              <div className="snt">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{decodeEntities(r.title)}</a> : decodeEntities(r.title)}</div>
            </div>
          ))}
        </div>
      ) : <Empty title={none} />}
      {more > 0 && <ShowMore n={more} shown={shown} total={rows.length} onMore={() => setShown((x) => x + FEED_STEP)} id="st-news-more" />}
      {failed}
    </>
  );
}

/** "SHOW n MORE" under a list that shows part of its rows (the designer's I-3 note and D-48): the page grows, nothing
 *  scrolls inside it. */
export function ShowMore({ n, shown, total, onMore, id }: { n: number; shown: number; total: number; onMore: () => void; id?: string }) {
  return (
    <div className="showmore" id={id}>
      <span className="chip-sm" role="button" tabIndex={0} onClick={onMore} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onMore(); } }}>SHOW {n} MORE</span>
      <span className="mut">{shown} of {total}</span>
    </div>
  );
}
