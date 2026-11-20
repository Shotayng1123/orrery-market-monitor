import { Fragment } from "react";
import { fmtClock, SGT } from "../lib/time";
import { openAsset } from "./CompanyCard";

/** A headline as the routes send it: NEWS (`news`) gives its category, a watchlist's feed (`watch_feed`) does not. */
export interface Headline { id: number; publishedAt: string; source: string; title: string; url: string; category?: string | null; tickers?: Array<{ s: string; n: string }> | null }

/** Some feeds send headlines with HTML entities left in ("Anthropic&#x2019;s"); shown as the characters they stand for. */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (t: string): string => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&(lt|gt|quot|apos|nbsp);/g, (_m, n: string) => NAMED[n]);
const valid = (t: string) => !Number.isNaN(Date.parse(t));
const dayKey = (t: string) => (valid(t) ? new Date(t).toLocaleDateString("en-CA", { timeZone: SGT }) : "");
const dayBar = (t: string) => (valid(t) ? new Date(t).toLocaleDateString("en-GB", { timeZone: SGT, weekday: "long", day: "numeric", month: "short" }) : "Date not given");

/** Headlines on a computer (the designer's D-09 and D-47, 19 Nov 2026): under a bar for each day ("THURSDAY 19 NOV"),
 *  a row of the time alone ("23:22"; the panel's head says the times are SGT), then the category and the headline,
 *  which wraps to three lines at most (the whole of it on hover), and under it, muted, the publisher and the
 *  companies it names. A row used to spend its width on the date, "SGT", chips and publisher and cut the headline
 *  to about forty characters. `named` keeps only some of the companies (a watchlist shows those on it). */
export function HeadlineList({ rows, named, free = false }: { rows: Headline[]; named?: (symbol: string) => boolean; free?: boolean /* no box of its own: the page grows (WATCHLIST, D-48) */ }) {
  return (
    <div className={`nwlist${free ? " free" : ""}`}>
      {rows.map((it, i) => {
        const title = decodeEntities(it.title), chips = (it.tickers ?? []).filter((t) => !named || named(t.s)).slice(0, 3);
        return (
          <Fragment key={it.id}>
            {(i === 0 || dayKey(it.publishedAt) !== dayKey(rows[i - 1].publishedAt)) && <div className="nwday">{dayBar(it.publishedAt)}</div>}
            <div className="nwrow">
              <span className="nwt">{valid(it.publishedAt) ? fmtClock(new Date(it.publishedAt), SGT) : "–"}</span>
              <div className="nwb">
                <div className="nwh" title={title}>{it.category && <span className="nwc cat">{it.category}</span>}<a href={it.url} target="_blank" rel="noreferrer">{title}</a></div>
                <div className="nwm"><span className="nwsrc">{it.source}</span>{chips.length > 0 && <span className="nwtk">{chips.map((t) => <span key={t.s} className="tk" title={`Open ${t.n} (${t.s})`} onClick={() => openAsset(t.s)}>{t.n}</span>)}</span>}</div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
