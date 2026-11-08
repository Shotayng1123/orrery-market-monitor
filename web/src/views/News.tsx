import { Fragment, useMemo, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { Md } from "../components/Md";
import { useApi } from "../lib/useApi";
import type { EconEvent, NewsItem, Note } from "../lib/types";
import { SGT } from "../lib/time";
import { fmtNum, fmtPct, fmtStampSafe, signCls } from "./shared";

export const NEWS_CATEGORIES = ["All", "US Equities", "JP Equities", "Asia Equities", "DM Rates", "EM Rates", "Currency", "Macro", "Commodities"] as const;
const dayOf = (t: string) => new Date(t).toLocaleDateString("en-CA", { timeZone: SGT });
const dayLabel = (t: string) => new Date(t).toLocaleDateString("en-GB", { timeZone: SGT, weekday: "long", day: "numeric", month: "short" });
const MAJOR = new Set(["US", "JP", "EUR", "DE", "FR", "UK", "CN", "HK", "KR", "TW", "AU", "CA", "CH", "IN", "SG"]);   // major markets only (Shota); everything else behind the All chip

interface Move { symbol: string; name: string; last: number; prev: number; pct: number; sector?: string }
interface SectorMove { sector: string; pct: number; n: number; weighted: boolean }
interface Breadth { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number }
interface WeeklyPack {
  kind: "weekly"; weekStart: string; weekEnd: string;
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; w1Pct: number | null; w1Chg: number | null; unit: "pct" | "bp" }>;
  us: { sectors: SectorMove[]; top: Move[]; bottom: Move[]; breadth: { n: number; up: number; down: number } | null };
  jp: { sectors: SectorMove[]; top: Move[]; bottom: Move[]; breadth: { n: number; up: number; down: number } | null };
  actuals: Array<{ atSgt: string; country: string; title: string; actual: string | null; forecast: string | null; previous: string | null; better: boolean | null }>;
  weekAhead: Array<{ atSgt: string; country: string; title: string; forecast: string | null; previous: string | null }>;
}
interface Pack {
  kind?: "daily";
  us: { indices: Move[]; sectorsEtf: Move[]; sectorsConstituents: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: Breadth | null; source: string };
  jp: { indices: Move[]; sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: Breadth | null; impliedOpenPct: number | null; impliedNote: string; source: string };
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; d1Pct: number | null; d1Chg: number | null; unit: "pct" | "bp" }>;
}

function MovesTable({ rows, title }: { rows: Move[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT"><tbody>{rows.map((m) => <tr key={m.symbol}><td className="l">{m.name}</td><td className="num">{fmtNum(m.last, m.last >= 100 ? 1 : 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}</tbody></table>
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

/** The weekly tables that belong to the Sunday wrap-up. */
function WeeklyTables({ pack }: { pack: WeeklyPack }) {
  const eq = pack.table.filter((r) => ["Equities", "Volatility", "Futures"].includes(r.cls) && r.w1Pct != null);
  const rates = pack.table.filter((r) => r.unit === "bp" && r.w1Chg != null), fx = pack.table.filter((r) => ["Currency", "Crypto", "Commodities"].includes(r.cls) && r.w1Pct != null);
  const wk = (r: WeeklyPack["table"][number]) => r.unit === "bp" ? (r.w1Chg == null ? "–" : `${r.w1Chg > 0 ? "+" : ""}${(r.w1Chg * 100).toFixed(0)}bp`) : fmtPct(r.w1Pct);
  const sign = (r: WeeklyPack["table"][number]) => signCls(r.unit === "bp" ? r.w1Chg : r.w1Pct);
  return (
    <>
      <div className="minih">Week {pack.weekStart} to {pack.weekEnd} · equity indices</div>
      <table className="secT"><tbody>{eq.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, r.last != null && r.last >= 1000 ? 0 : 2)}</td><td className={`num ${sign(r)}`}>{wk(r)}</td></tr>)}</tbody></table>
      <div className="msg2" style={{ marginTop: 8 }}>
        <div><SectorsTable rows={pack.us.sectors} title="S&P 500 sectors · week" /></div>
        <div><SectorsTable rows={pack.jp.sectors} title="Nikkei 225 sectors · week (weight-averaged)" /></div>
      </div>
      <div className="msg2" style={{ marginTop: 8 }}>
        <div><MovesTable rows={[...pack.us.top.slice(0, 5), ...pack.us.bottom.slice(0, 5)]} title="S&P 500 top 5 / bottom 5 · week" /></div>
        <div><MovesTable rows={[...pack.jp.top.slice(0, 5), ...pack.jp.bottom.slice(0, 5)]} title="Nikkei 225 top 5 / bottom 5 · week" /></div>
      </div>
      <div className="msg2" style={{ marginTop: 8 }}>
        <div><div className="minih">Yields · week</div><table className="secT"><tbody>{rates.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, 3)}</td><td className={`num ${sign(r)}`}>{wk(r)}</td></tr>)}</tbody></table></div>
        <div><div className="minih">Currencies, commodities, crypto · week</div><table className="secT"><tbody>{fx.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, r.last != null && r.last >= 1000 ? 0 : 2)}</td><td className={`num ${sign(r)}`}>{wk(r)}</td></tr>)}</tbody></table></div>
      </div>
      {pack.actuals.length > 0 && (
        <>
          <div className="minih" style={{ marginTop: 8 }}>High-impact releases of the week · actual vs consensus</div>
          <table className="secT"><tbody>{pack.actuals.map((e, i) => <tr key={i}><td className="l mut">{e.atSgt}</td><td className="l">{e.country}</td><td className="l">{e.title}</td><td className={`num ${e.better === true ? "up" : e.better === false ? "dn" : ""}`}><b>{e.actual ?? "–"}</b></td><td className="num mut">{e.forecast ?? "–"}</td><td className="num mut">{e.previous ?? "–"}</td></tr>)}</tbody></table>
        </>
      )}
    </>
  );
}

/** The overnight and previous-session tables that belong to one day's note (its data pack). */
function Overnight({ pack }: { pack: Pack }) {
  const macro = pack.table.filter((r) => ["Fixed income", "Currency", "Commodities", "Volatility"].includes(r.cls));
  return (
    <>
      <div className="minih">US overnight · indices</div>
      <table className="secT"><tbody>{pack.us.indices.map((m) => <tr key={m.symbol}><td className="l">{m.name}</td><td className="num">{fmtNum(m.last, 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}</tbody></table>
      {pack.us.breadth && <div className="mut" style={{ fontSize: 10.5, margin: "2px 0 6px" }}>{breadthLine(pack.us.breadth)}</div>}
      <div className="msg2">
        <div><SectorsTable rows={pack.us.sectorsEtf.map((m) => ({ sector: m.name, pct: m.pct, n: 0, weighted: true }))} title="US sectors (SPDR ETFs)" /></div>
        <div><MovesTable rows={[...pack.us.top.slice(0, 5), ...pack.us.bottom.slice(0, 5)]} title="S&P 500 top 5 / bottom 5" /></div>
      </div>
      <div className="minih" style={{ marginTop: 10 }}>Japan · previous session</div>
      <table className="secT"><tbody>{pack.jp.indices.map((m) => <tr key={m.symbol}><td className="l">{m.name}</td><td className="num">{fmtNum(m.last, 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}
        {pack.jp.impliedOpenPct != null && <tr><td className="l" title={pack.jp.impliedNote}>Implied open (CME future vs cash) <span className="e">(E)</span></td><td /><td className={`num ${signCls(pack.jp.impliedOpenPct)}`}>{fmtPct(pack.jp.impliedOpenPct)}</td></tr>}
      </tbody></table>
      {pack.jp.breadth && <div className="mut" style={{ fontSize: 10.5, margin: "2px 0 6px" }}>{breadthLine(pack.jp.breadth)}</div>}
      <div className="msg2">
        <div><SectorsTable rows={pack.jp.sectors} title="Nikkei 225 sectors (weight-averaged)" /></div>
        <div><MovesTable rows={[...pack.jp.top.slice(0, 5), ...pack.jp.bottom.slice(0, 5)]} title="Nikkei 225 top 5 / bottom 5" /></div>
      </div>
      {macro.length > 0 && (
        <>
          <div className="minih" style={{ marginTop: 10 }}>Other macro · 1D</div>
          <table className="secT"><tbody>{macro.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, r.unit === "bp" ? 3 : 2)}</td><td className={`num ${signCls(r.unit === "bp" ? r.d1Chg : r.d1Pct)}`}>{r.unit === "bp" ? (r.d1Chg == null ? "–" : `${r.d1Chg > 0 ? "+" : ""}${(r.d1Chg * 100).toFixed(0)}bp`) : fmtPct(r.d1Pct)}</td></tr>)}</tbody></table>
        </>
      )}
      <div className="mut" style={{ fontSize: 10, marginTop: 6 }}>{pack.us.source} · {pack.jp.source}</div>
    </>
  );
}

export function NewsView({ tick }: { tick: number }) {
  const list = useApi<{ rows: Array<{ id: number; d: string; title: string; generatedAt: string; kind?: string }> }>("notes", undefined, Math.floor(tick / 10));
  const [day, setDay] = useState<string | null>(null);
  const note = useApi<{ note: (Note & { pack?: Pack | WeeklyPack }) | null }>("note", { d: day ?? undefined }, tick);
  const cal = useApi<{ rows: EconEvent[] }>("calendar", undefined, tick);
  const [cat, setCat] = useState<(typeof NEWS_CATEGORIES)[number]>("All");
  const [imp, setImp] = useState<"high" | "hm" | "all">("hm");
  const [scope, setScope] = useState<"major" | "all">("major");
  const news = useApi<{ rows: NewsItem[] }>("news", { category: cat === "All" ? undefined : cat, n: 150 }, tick);
  const n = note.data?.note ?? null;
  const pack = n?.pack;
  const events = useMemo(() => (cal.data?.rows ?? []).filter((e) => (imp === "all" || e.impact === "High" || (imp === "hm" && e.impact === "Medium")) && (scope === "all" || MAJOR.has(e.country))), [cal.data, imp, scope]);
  const upcoming = events.some((e) => Date.parse(e.at) > Date.now());
  const chip = (on: boolean, label: string, f: () => void, key?: string) => <span key={key ?? label} className={`chip-sm${on ? " on" : ""}`} onClick={f}>{label}</span>;
  return (
    <>
      <Panel no="01" title={n?.kind === "weekly" ? "WEEKLY WRAP-UP" : "MORNING NOTES"} span={12} aux={<span className="chips" style={{ margin: 0 }}>{(list.data?.rows ?? []).slice(0, 10).map((r) => chip((day ?? list.data?.rows[0]?.d) === r.d, r.kind === "weekly" ? `${r.d.slice(5)} W` : r.d.slice(5), () => setDay(r.d), r.d))}{n && <span className="mut" style={{ marginLeft: 8 }}>generated {fmtStampSafe(n.generatedAt)} · {n.model}</span>}</span>}>
        {n ? (
          <div className="msg2 notegrid">
            <div className="brnar">
              <p><b>{n.title}</b></p>
              {n.sections.map((s) => <div key={s.heading}><h4>{s.heading}</h4><Md text={s.md} sources={n.sources} /></div>)}
              {n.sources.length > 0 && <div className="src">Sources: {n.sources.map((s) => <span key={s.n}>[{s.n}] <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · </span>)}</div>}
            </div>
            <div>{pack ? (pack.kind === "weekly" ? <WeeklyTables pack={pack} /> : <Overnight pack={pack} />) : <Empty title="No data pack with this note" />}</div>
          </div>
        ) : (
          <Empty title="No morning note yet">{note.error ?? "The note is written every day around 07:00 SGT: the overnight US session, movers above 5% and their reasons, the Japan outlook and the day's strategy; on Sundays the weekly wrap-up."}</Empty>
        )}
      </Panel>
      <Panel no="02" title="ECONOMIC CALENDAR" span={6} aux={<span className="chips" style={{ margin: 0 }}><span className="lbl">Impact</span>{chip(imp === "high", "High", () => setImp("high"))}{chip(imp === "hm", "High + Medium", () => setImp("hm"))}{chip(imp === "all", "All", () => setImp("all"))}<span className="lbl" style={{ marginLeft: 10 }}>Countries</span>{chip(scope === "major", "Major", () => setScope("major"))}{chip(scope === "all", "All", () => setScope("all"))}<span className="mut" style={{ marginLeft: 10 }}>times in SGT{cal.data?.rows[0]?.source === "fxstreet" ? " · FXStreet" : cal.data?.rows.length ? " · ForexFactory" : ""}{cal.data && !upcoming ? " · no upcoming events in the feed yet" : ""}</span></span>}>
        {events.length ? (
          <table className="mini calT">
            <thead><tr><th className="l">When (SGT)</th><th className="l">Ccy</th><th className="l">Event</th><th className="l" title="Impact: red high, amber medium, grey low" aria-label="Impact"></th><th>Actual</th><th>Consensus</th><th>Previous</th></tr></thead>
            <tbody>{events.map((e, i, arr) => (
              <Fragment key={e.id}>
                {(i === 0 || dayOf(e.at) !== dayOf(arr[i - 1].at)) && <tr className="cls"><td colSpan={7}>{dayLabel(e.at)}</td></tr>}
                <tr className={`ecrow${Date.parse(e.at) < Date.now() ? " past" : ""}`}>
                  <td className="l num">{fmtStampSafe(e.at)}</td><td className="l">{e.currency ?? e.country}</td>
                  <td className="l">{e.title}{e.kind === "speech" ? <span className="mut"> · speech</span> : e.kind === "report" ? <span className="mut"> · report</span> : null}</td>
                  <td className="l" title={e.impact}><span className={`imp ${e.impact[0].toLowerCase()}`} /></td>
                  <td className={e.better === true ? "up" : e.better === false ? "dn" : ""}><b>{e.actual ?? (Date.parse(e.at) < Date.now() ? "–" : "")}</b></td>
                  <td>{e.forecast ?? "–"}</td><td className="mut">{e.previous ?? "–"}</td>
                </tr>
              </Fragment>
            ))}</tbody>
          </table>
        ) : <Empty title="No calendar loaded">{cal.error ?? "The calendar sync runs every hour."}</Empty>}
      </Panel>
      <Panel no="03" title="NEWS" span={6} aux={<span className="chips eq" style={{ margin: 0 }}>{NEWS_CATEGORIES.map((c) => <span key={c} className={`chip-sm${c === cat ? " on" : ""}`} onClick={() => setCat(c)}>{c}</span>)}</span>}>
        {news.data?.rows.length ? <div className="nwlist">{news.data.rows.map((it) => (
          <div className="nwrow" key={it.id}>
            <span className="nwt">{fmtStampSafe(it.publishedAt)}</span>
            <span className="nwc cat">{it.category}</span>
            <span className="nwh"><a href={it.url} target="_blank" rel="noreferrer">{it.title}</a></span>
            <span className="nwsrc">{it.source}</span>
          </div>
        ))}</div> : <Empty title="No headlines">{news.error ?? "The news job runs every ten minutes."}</Empty>}
      </Panel>
    </>
  );
}
