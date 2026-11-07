import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { Md } from "../components/Md";
import { useApi } from "../lib/useApi";
import type { EconEvent, NewsItem, Note } from "../lib/types";
import { fmtNum, fmtPct, fmtStampSafe, signCls } from "./shared";

export const NEWS_CATEGORIES = ["All", "US Equities", "JP Equities", "Asia Equities", "DM Rates", "EM Rates", "Currency", "Macro", "Commodities"] as const;

interface Move { symbol: string; name: string; last: number; prev: number; pct: number; sector?: string }
interface SectorMove { sector: string; pct: number; n: number; weighted: boolean }
interface Breadth { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number }
interface Pack {
  us: { indices: Move[]; sectorsEtf: Move[]; sectorsConstituents: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: Breadth | null; source: string };
  jp: { indices: Move[]; sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: Breadth | null; impliedOpenPct: number | null; impliedNote: string; source: string };
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; d1Pct: number | null; d1Chg: number | null; unit: "pct" | "bp" }>;
}

function MovesTable({ rows, title }: { rows: Move[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT"><tbody>{rows.map((m) => <tr key={m.symbol}><td className="l">{m.name}<span className="mut"> {m.symbol}</span></td><td className="num">{fmtNum(m.last, m.last >= 100 ? 1 : 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}</tbody></table>
    </>
  );
}
function SectorsTable({ rows, title }: { rows: SectorMove[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT"><tbody>{rows.map((s) => <tr key={s.sector}><td className="l">{s.sector}{s.n > 0 && <span className="mut"> {s.n}</span>}</td><td className={`num ${signCls(s.pct)}`}>{fmtPct(s.pct)}</td></tr>)}</tbody></table>
    </>
  );
}
const breadthLine = (b: Breadth | null) => (b ? `${b.up} up / ${b.down} down of ${b.n} · ≥+2% ${b.over2} · ≤−2% ${b.under2} · ≥+5% ${b.over5} · ≤−5% ${b.under5}` : "");

export function NewsView({ tick }: { tick: number }) {
  const note = useApi<{ note: (Note & { pack?: Pack }) | null }>("note", undefined, tick);
  const cal = useApi<{ rows: EconEvent[] }>("calendar", undefined, tick);
  const [cat, setCat] = useState<(typeof NEWS_CATEGORIES)[number]>("All");
  const news = useApi<{ rows: NewsItem[] }>("news", { category: cat === "All" ? undefined : cat, n: 120 }, tick);
  const n = note.data?.note ?? null;
  const pack = n?.pack;
  const macro = pack?.table.filter((r) => ["Fixed income", "Currency", "Commodities", "Volatility"].includes(r.cls)) ?? [];
  return (
    <>
      <Panel no="01" title="MORNING NOTES" span={7} aux={n ? <>{n.d} · generated {fmtStampSafe(n.generatedAt)} · {n.model}</> : note.error ? <span className="warn">{note.error}</span> : ""}>
        {n ? (
          <div className="brnar">
            <p><b>{n.title}</b></p>
            {n.sections.map((s) => <div key={s.heading}><h4>{s.heading}</h4><Md text={s.md} sources={n.sources} /></div>)}
            {n.sources.length > 0 && <div className="src">Sources: {n.sources.map((s) => <span key={s.n}>[{s.n}] <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · </span>)}</div>}
          </div>
        ) : (
          <Empty title="No morning note yet">The note is written each weekday around 07:00 SGT: the overnight US session, movers above 5% with their reasons, the Japan outlook and the day&apos;s strategy. Every number comes from the Monitor&apos;s own data and every claim links to its source.</Empty>
        )}
      </Panel>
      <Panel no="02" title="OVERNIGHT & REVIEWS" span={5} aux={pack ? "from the note's data pack" : ""}>
        {pack ? (
          <>
            <div className="minih">US overnight · indices</div>
            <table className="secT"><tbody>{pack.us.indices.map((m) => <tr key={m.symbol}><td className="l">{m.name}</td><td className="num">{fmtNum(m.last, 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}</tbody></table>
            <div className="hint2" style={{ marginTop: 2 }}>{breadthLine(pack.us.breadth)}</div>
            <div className="msg2" style={{ marginTop: 8 }}>
              <div><SectorsTable rows={pack.us.sectorsEtf.map((m) => ({ sector: m.name, pct: m.pct, n: 0, weighted: true }))} title="US sectors (SPDR ETFs)" /></div>
              <div><MovesTable rows={[...pack.us.top.slice(0, 5), ...pack.us.bottom.slice(0, 5)]} title="S&P 500 top 5 / bottom 5" /></div>
            </div>
            <div className="minih" style={{ marginTop: 10 }}>Japan · previous session</div>
            <table className="secT"><tbody>{pack.jp.indices.map((m) => <tr key={m.symbol}><td className="l">{m.name}</td><td className="num">{fmtNum(m.last, 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}
              {pack.jp.impliedOpenPct != null && <tr><td className="l" title={pack.jp.impliedNote}>Implied open (CME future vs cash) <span className="e">(E)</span></td><td /><td className={`num ${signCls(pack.jp.impliedOpenPct)}`}>{fmtPct(pack.jp.impliedOpenPct)}</td></tr>}
            </tbody></table>
            <div className="hint2" style={{ marginTop: 2 }}>{breadthLine(pack.jp.breadth)}</div>
            <div className="msg2" style={{ marginTop: 8 }}>
              <div><SectorsTable rows={pack.jp.sectors} title="Nikkei 225 sectors (weight-averaged)" /></div>
              <div><MovesTable rows={[...pack.jp.top.slice(0, 5), ...pack.jp.bottom.slice(0, 5)]} title="Nikkei 225 top 5 / bottom 5" /></div>
            </div>
            <div className="minih" style={{ marginTop: 10 }}>Other macro · 1D</div>
            <table className="secT"><tbody>{macro.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, r.unit === "bp" ? 3 : 2)}</td><td className={`num ${signCls(r.unit === "bp" ? r.d1Chg : r.d1Pct)}`}>{r.unit === "bp" ? (r.d1Chg == null ? "–" : `${r.d1Chg > 0 ? "+" : ""}${(r.d1Chg * 100).toFixed(1)}bp`) : fmtPct(r.d1Pct)}</td></tr>)}</tbody></table>
            <div className="hint2">{pack.us.source} · {pack.jp.source}</div>
          </>
        ) : (
          <>
            <div className="minih">US overnight · sector breakdown and movers</div>
            <Empty title="Awaiting the first note">Index moves, sector ETFs and the top and bottom S&amp;P 500 movers, with a one-line read such as &quot;broad sell-off, centred on Tech&quot;.</Empty>
            <div className="minih" style={{ marginTop: 10 }}>Japan · yesterday</div>
            <Empty title="Awaiting the first note">Nikkei 225, TOPIX, sector moves and the Nikkei 225 movers.</Empty>
          </>
        )}
      </Panel>
      <Panel no="03" title="ECONOMIC CALENDAR" span={12} aux={cal.data ? "times in SGT · forecast and previous from the calendar feed; actuals follow in a later version" : cal.error ? <span className="warn">{cal.error}</span> : ""}>
        {cal.data?.rows.length ? (
          <table className="mini">
            <thead><tr><th className="l">When (SGT)</th><th className="l">Ccy</th><th className="l">Event</th><th className="l">Impact</th><th>Forecast</th><th>Previous</th><th>Actual</th></tr></thead>
            <tbody>{cal.data.rows.map((e) => (
              <tr key={e.id} className="ecrow"><td className="l num">{fmtStampSafe(e.at)}</td><td className="l">{e.country}</td><td className="l">{e.title}</td><td className="l"><span className={`imp ${e.impact[0].toLowerCase()}`} /> {e.impact}</td><td>{e.forecast ?? "–"}</td><td>{e.previous ?? "–"}</td><td>{e.actual ?? "–"}</td></tr>
            ))}</tbody>
          </table>
        ) : <Empty title="No calendar loaded">{cal.error ?? "The week's releases appear here once the calendar sync has run."}</Empty>}
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
