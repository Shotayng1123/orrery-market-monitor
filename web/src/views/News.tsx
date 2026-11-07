import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { useApi } from "../lib/useApi";
import type { EconEvent, NewsItem, Note } from "../lib/types";
import { fmtStampSafe } from "./shared";

export const NEWS_CATEGORIES = ["All", "US Equities", "JP Equities", "Asia Equities", "DM Rates", "EM Rates", "Currency", "Macro", "Commodities"] as const;

export function NewsView({ tick }: { tick: number }) {
  const note = useApi<{ note: Note | null }>("note", undefined, tick);
  const cal = useApi<{ rows: EconEvent[] }>("calendar", undefined, tick);
  const [cat, setCat] = useState<(typeof NEWS_CATEGORIES)[number]>("All");
  const news = useApi<{ rows: NewsItem[] }>("news", { category: cat === "All" ? undefined : cat, n: 120 }, tick);
  const n = note.data?.note ?? null;
  return (
    <>
      <Panel no="01" title="MORNING NOTES" span={7} aux={n ? <>{n.d} · generated {fmtStampSafe(n.generatedAt)} · {n.model}</> : note.error ? <span className="warn">{note.error}</span> : ""}>
        {n ? (
          <div className="brnar">
            <p><b>{n.title}</b></p>
            {n.sections.map((s) => <div key={s.heading}><h4>{s.heading}</h4><p style={{ whiteSpace: "pre-wrap" }}>{s.md}</p></div>)}
            {n.sources.length > 0 && <div className="src">Sources: {n.sources.map((s) => <span key={s.n}>[{s.n}] <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> </span>)}</div>}
          </div>
        ) : (
          <Empty title="No morning note yet">The note is written each weekday around 07:00 SGT: the overnight US session, movers above 5% with their reasons, the Japan outlook and the day&apos;s strategy. Every number comes from the Monitor&apos;s own data and every claim links to its source.</Empty>
        )}
      </Panel>
      <Panel no="02" title="OVERNIGHT & REVIEWS" span={5}>
        <div className="minih">US overnight · sector breakdown and movers</div>
        <Empty title="Awaiting data">Index moves, sector ETFs and the top and bottom S&amp;P 500 movers, with a one-line read such as &quot;broad sell-off, centred on Tech&quot;.</Empty>
        <div className="minih" style={{ marginTop: 10 }}>Japan · yesterday</div>
        <Empty title="Awaiting data">Nikkei 225, TOPIX, TOPIX-17 sectors and the Nikkei 225 movers.</Empty>
        <div className="minih" style={{ marginTop: 10 }}>Other macro</div>
        <Empty title="Awaiting data">Rates, FX, commodities and volatility since the Tokyo close.</Empty>
      </Panel>
      <Panel no="03" title="ECONOMIC CALENDAR" span={12} aux={cal.data ? "times in SGT · forecast and previous from the calendar feed; actuals follow in a later version" : cal.error ? <span className="warn">{cal.error}</span> : ""}>
        {cal.data?.rows.length ? (
          <table className="mini">
            <thead><tr><th className="l">When (SGT)</th><th className="l">Ccy</th><th className="l">Event</th><th className="l">Impact</th><th>Forecast</th><th>Previous</th><th>Actual</th></tr></thead>
            <tbody>{cal.data.rows.map((e) => (
              <tr key={e.id} className="ecrow"><td className="l num">{fmtStampSafe(e.at)}</td><td className="l">{e.country}</td><td className="l">{e.title}</td><td className="l"><span className={`imp ${e.impact[0].toLowerCase()}`} /> {e.impact}</td><td>{e.forecast ?? "–"}</td><td>{e.previous ?? "–"}</td><td>{e.actual ?? "–"}</td></tr>
            ))}</tbody>
          </table>
        ) : <Empty title="No calendar loaded">{cal.error ?? "The week&apos;s releases appear here once the calendar sync has run."}</Empty>}
      </Panel>
      <Panel no="04" title="NEWS" span={12} aux={<span className="chips" style={{ margin: 0 }}>{NEWS_CATEGORIES.map((c) => <span key={c} className={`chip-sm${c === cat ? " on" : ""}`} onClick={() => setCat(c)}>{c}</span>)}</span>}>
        {news.data?.rows.length ? news.data.rows.map((it) => (
          <div className="nwrow" key={it.id}>
            <span className="nwt">{fmtStampSafe(it.publishedAt)}</span>
            <span className="nwc cat">{it.category}</span>
            <span className="nwh"><a href={it.url} target="_blank" rel="noreferrer">{it.title}</a></span>
            <span className="nwsrc">{it.source}</span>
          </div>
        )) : <Empty title="No headlines">{news.error ?? "Headlines from WSJ Markets, CNBC, Nikkei Asia and ticker feeds, tagged by category, appear here once the news job runs."}</Empty>}
      </Panel>
    </>
  );
}
