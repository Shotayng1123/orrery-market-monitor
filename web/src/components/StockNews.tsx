import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** The fewest rows NEWS starts with beside the left column (the reviewer's R2B-02): enough to see what is newest. */
export const NEWS_MIN = 3;
/** The most height the shorter column's last panel takes up so that both columns end together: about one row. */
const EVEN_MAX = 96;
const endOf = (col: Element): number => Math.max(...[...col.children].map((x) => x.getBoundingClientRect().bottom));

/** The list and its filter; `phone` draws the phone's rows (`.nw-row`) and toggles. `matched` (an instrument's page):
 *  the words its headlines were matched by, which its empty list names; `name` what the list is about.
 *  `fit` (a stock's page on a computer, two columns: the designer's I-3 check, "no empty block over 40 px between
 *  panels in either column", and the reviewer's R2B-02): the list starts with as many rows as sit beside the left
 *  column, at least NEWS_MIN and at most fifteen, then SHOW n MORE as before; `onEven` tells the page whether the
 *  shorter column's last panel should take the few pixels left (less than a row) so that both end together, which the
 *  page says with `even`. One column (text XL, a narrow window), the one-screen layout and the phone start with
 *  fifteen. The rows are measured again when the page's width, the web fonts or the rows change. */
export function StockNews({ symbol, feed, phone = false, matched, name, fit = false, even = false, onEven }: { symbol: string; feed: StockFeed; phone?: boolean; matched?: string[]; name?: string; fit?: boolean; even?: boolean; onEven?: (even: boolean) => void }) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [added, setAdded] = useState(0);                       // the rows SHOW n MORE has added
  const fitting = fit && !phone;
  // the rows the list starts with beside the left column (null: fifteen), and where the measuring stands
  const [first, setFirst] = useState<number | null>(null);
  const [step, setStep] = useState<"measure" | "check" | "done">(fitting ? "measure" : "done");
  // each new measuring has its own number, so that one asked for while another is under way is never lost in it
  const [epoch, setEpoch] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const shown = (fitting && first != null ? first : FEED_STEP) + added;
  const rows = feedRows(feed, filter), more = Math.min(FEED_STEP, rows.length - shown);
  const restart = () => { setFirst(null); setStep("measure"); setEpoch((e) => e + 1); };
  // another filter is another list: it is fitted again; SHOW n MORE lets the column run on, so nothing is stretched
  const choose = (f: FeedFilter) => { setFilter(f); setAdded(0); if (fitting) restart(); };
  const showMore = () => { setAdded((x) => x + FEED_STEP); onEven?.(false); };
  const remeasure = useRef(() => {});
  remeasure.current = () => { if (fitting && added === 0) restart(); };
  // a new answer with other rows (every five minutes): measure again, unless the reader has asked for more
  const sig = `${feed.news.length}|${feed.alerts.length}|${feed.news[0]?.id ?? ""}|${feed.alerts[0]?.id ?? ""}`, lastSig = useRef(sig);
  useEffect(() => { if (lastSig.current !== sig) { lastSig.current = sig; remeasure.current(); } }, [sig]);
  // the page's width (a window resized, the text size changed) and the web fonts move where the columns end
  useEffect(() => {
    if (!fitting) return;
    const grid = box.current?.closest("#grid") ?? box.current?.parentElement;
    if (!grid) return;
    let w = -1, live = true;
    const ro = new ResizeObserver(() => { const x = Math.round(grid.getBoundingClientRect().width); if (x !== w) { if (w >= 0) remeasure.current(); w = x; } });
    ro.observe(grid);
    // the one-screen layout switched on or off (lib/prefs.ts applyPrefs sets the page's classes): one column or two
    const mo = new MutationObserver(() => remeasure.current());
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    document.fonts?.ready.then(() => { if (live) remeasure.current(); });
    return () => { live = false; ro.disconnect(); mo.disconnect(); };
  }, [fitting]);
  useLayoutEffect(() => {
    if (!fitting || step === "done") return;
    if (even) { onEven?.(false); return; }   // the columns are measured as they stand, the shorter not stretched
    const el = box.current, right = el?.closest(".pcol") ?? null, cols = right?.parentElement ?? null;
    const left = cols ? [...cols.children].find((c) => c !== right && c.classList.contains("pcol")) ?? null : null;
    if (!el || !right || !cols || !left || getComputedStyle(cols).display === "contents") { setFirst(null); setStep("done"); return; }   // one column: fifteen
    const leftEnd = endOf(left), rightEnd = endOf(right);
    if (step === "measure") {
      // the most rows whose column ends where the left one does or above it; what follows the list (SHOW n MORE, the
      // panel's foot, SHORT INTEREST) moves up with its last row
      const bottoms = [...el.querySelectorAll(".snrow")].map((r) => r.getBoundingClientRect().bottom);
      if (!bottoms.length) { setStep("done"); onEven?.(Math.abs(rightEnd - leftEnd) <= EVEN_MAX); return; }   // nothing to fit: only the last pixels
      const rest = rightEnd - bottoms[bottoms.length - 1];
      let n = bottoms.length;
      while (n > NEWS_MIN && bottoms[n - 1] + rest > leftEnd + 1) n--;
      setFirst(n); setStep("check");
      return;
    }
    // check: a SHOW n MORE line that was not there before can push the column down again; then one row fewer
    if (rightEnd > leftEnd + 1 && first != null && first > NEWS_MIN) { setFirst(first - 1); return; }
    setStep("done");
    onEven?.(Math.abs(rightEnd - leftEnd) <= EVEN_MAX);
  }, [fitting, step, first, even, onEven, epoch]);
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
      {more > 0 && <button type="button" className="mp-more" id="st-news-more" onClick={() => setAdded((n) => n + FEED_STEP)}>Show {more} more of {rows.length}</button>}
      {failed}
    </>
  );
  return (
    <div className="snbox" ref={box} data-fit={fitting ? `${step} ${first ?? FEED_STEP}` : undefined}>
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
      {more > 0 && <ShowMore n={more} shown={shown} total={rows.length} onMore={showMore} id="st-news-more" />}
      {failed}
    </div>
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
