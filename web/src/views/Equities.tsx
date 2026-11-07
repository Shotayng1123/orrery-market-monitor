import { useMemo, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";

export const INDICES = [
  { id: "topix", label: "TOPIX", symbol: "1306.T", stats: "NK225", statsNote: "TOPIX constituent data is not sourced yet; the Nikkei 225 names stand in", support: ["^N225", "NKD=F", "USDJPY=X", "JGB10Y"] },
  { id: "nk225", label: "NIKKEI 225", symbol: "^N225", stats: "NK225", statsNote: "", support: ["NKD=F", "1306.T", "USDJPY=X", "^SOX"] },
  { id: "spx", label: "S&P 500", symbol: "^GSPC", stats: "SP500", statsNote: "", support: ["ES=F", "^VIX", "^TNX", "DX-Y.NYB"] },
  { id: "ixic", label: "NASDAQ COMP", symbol: "^IXIC", stats: "NDX", statsNote: "Nasdaq-100 names stand in for the Composite's ~3,000 constituents", support: ["NQ=F", "^SOX", "^VIX", "^TNX"] },
  { id: "kospi", label: "KOSPI", symbol: "^KS11", stats: null, statsNote: "KOSPI constituent data is not sourced yet", support: ["KRW=X", "^SOX", "^TWII", "^GSPC"] },
  { id: "hsi", label: "HANG SENG", symbol: "^HSI", stats: null, statsNote: "Hang Seng constituent data is not sourced yet", support: ["000001.SS", "CNH=X", "^GSPC", "^TNX"] },
  { id: "sse", label: "SHANGHAI COMP", symbol: "000001.SS", stats: null, statsNote: "Shanghai Composite constituent data is not sourced yet", support: ["^HSI", "CNH=X", "HG=F", "^GSPC"] },
] as const;
export type IndexId = (typeof INDICES)[number]["id"];

interface StatRow { symbol: string; name: string; sector: string | null; weight: number | null; d: string; close: number; prev: number | null; pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null; dma50: number | null; dma200: number | null; hi52: number | null; lo52: number | null; shortRatio?: number | null }
interface SectorRow { sector: string; n: number; weight: number | null; pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null; above200: number }
interface IndexStats {
  idx: string; asOf: string | null; rows: StatRow[];
  breadth: { n: number; adv: number; dec: number; above50: number; above200: number; newHi: number; newLo: number; over2: number; under2: number } | null;
  sectors: SectorRow[]; movers: { top: StatRow[]; bottom: StatRow[] };
  shorts: { d: string; avgRatio: number; top: Array<{ symbol: string; name: string; ratio: number }> } | null;
}

const UP_RGB = "63,208,126", DN_RGB = "255,77,66";
const shade = (v: number | null | undefined, full = 6) => (v == null || v === 0 ? undefined : `rgba(${v > 0 ? UP_RGB : DN_RGB},${(Math.min(1, Math.abs(v) / full) * 0.55).toFixed(3)})`);
const pos52 = (r: StatRow) => (r.hi52 != null && r.lo52 != null && r.hi52 > r.lo52 ? ((r.close - r.lo52) / (r.hi52 - r.lo52)) * 100 : null);
const vs = (close: number, dma: number | null) => (dma == null || dma === 0 ? null : (close / dma - 1) * 100);

function Bar({ num, den, color }: { num: number; den: number; color: string }) {
  const w = den ? Math.round((num / den) * 100) : 0;
  return <span className="bbar" title={`${num} of ${den}`}><span style={{ width: `${w}%`, background: color }} /></span>;
}

function Breadth({ s }: { s: IndexStats }) {
  const b = s.breadth!;
  const row = (k: string, num: number, color: string) => <tr><td className="l">{k}</td><td className="num">{num}</td><td className="num mut">{b.n ? `${Math.round((num / b.n) * 100)}%` : "–"}</td><td style={{ width: "40%" }}><Bar num={num} den={b.n} color={color} /></td></tr>;
  return (
    <table className="secT"><tbody>
      {row("Advancers (1D)", b.adv, "var(--up)")}{row("Decliners (1D)", b.dec, "var(--dn)")}
      {row("Up 2% or more", b.over2, "var(--up)")}{row("Down 2% or more", b.under2, "var(--dn)")}
      {row("Above 50-day average", b.above50, "var(--cyan)")}{row("Above 200-day average", b.above200, "var(--cyan)")}
      {row("At 52-week high", b.newHi, "var(--up)")}{row("At 52-week low", b.newLo, "var(--dn)")}
    </tbody></table>
  );
}

function Sectors({ s }: { s: IndexStats }) {
  return (
    <table className="secT">
      <thead><tr><th className="l">Sector</th><th>N</th>{s.sectors.some((x) => x.weight != null) && <th>Wt %</th>}<th>1D</th><th>1W</th><th>1M</th><th>3M</th><th>12M</th><th>&gt;200d</th></tr></thead>
      <tbody>{s.sectors.map((x) => <tr key={x.sector}><td className="l">{x.sector}</td><td className="num mut">{x.n}</td>{s.sectors.some((y) => y.weight != null) && <td className="num mut">{x.weight == null ? "–" : x.weight.toFixed(1)}</td>}
        {([x.pct1d, x.pct1w, x.pct1m, x.pct3m, x.pct12m] as Array<number | null>).map((v, i) => <td key={i} className={`num ${signCls(v)}`} style={{ background: shade(v, i === 0 ? 4 : i < 3 ? 8 : 25) }}>{fmtPct(v, 1)}</td>)}
        <td className="num mut">{x.n ? `${Math.round((x.above200 / x.n) * 100)}%` : "–"}</td></tr>)}</tbody>
    </table>
  );
}

function Movers({ rows, title }: { rows: StatRow[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT"><tbody>{rows.map((r) => <tr key={r.symbol}><td className="l">{r.name}<span className="mut"> {r.symbol}</span></td><td className="l mut">{r.sector ?? ""}</td><td className="num">{fmtNum(r.close, r.close >= 1000 ? 0 : 2)}</td><td className={`num ${signCls(r.pct1d)}`}>{fmtPct(r.pct1d, 1)}</td><td className={`num ${signCls(r.pct1w)}`}>{fmtPct(r.pct1w, 1)}</td></tr>)}</tbody></table>
    </>
  );
}

function HeatMap({ s }: { s: IndexStats }) {
  const weighted = s.rows.some((r) => r.weight != null);
  const groups = new Map<string, StatRow[]>();
  for (const r of s.rows) { const k = r.sector ?? "Other"; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="heat">
      {ordered.map(([sector, rs]) => (
        <div className="hsec" key={sector}>
          <div className="hname">{sector} <span className="mut">{rs.length}</span></div>
          <div className="htiles">{[...rs].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || b.close - a.close).map((r) => {
            const w = weighted ? Math.max(40, Math.min(160, 40 + (r.weight ?? 0) * 45)) : 52;
            return <span key={r.symbol} className="htile" style={{ width: w, background: shade(r.pct1d, 5) ?? "#15161a" }} title={`${r.name} (${r.symbol}) ${fmtPct(r.pct1d, 2)} · ${fmtNum(r.close, 2)}${r.weight != null ? ` · weight ${r.weight.toFixed(2)}%` : ""}`}><b>{r.symbol.replace(/\.T$/, "")}</b><i className={signCls(r.pct1d)}>{fmtPct(r.pct1d, 1)}</i></span>;
          })}</div>
        </div>
      ))}
    </div>
  );
}

type SortKey = "symbol" | "name" | "sector" | "close" | "pct1d" | "pct1w" | "pct1m" | "pct3m" | "pct12m" | "vs50" | "vs200" | "pos52" | "shortRatio";
function Screener({ s }: { s: IndexStats }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [above200, setAbove200] = useState(false);
  const [nearHi, setNearHi] = useState(false);
  const [nearLo, setNearLo] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "pct1d", dir: -1 });
  const sectors = useMemo(() => ["All", ...[...new Set(s.rows.map((r) => r.sector ?? "Other"))].sort()], [s.rows]);
  const hasShort = s.rows.some((r) => r.shortRatio != null);
  const val = (r: StatRow, k: SortKey): number | string | null => k === "vs50" ? vs(r.close, r.dma50) : k === "vs200" ? vs(r.close, r.dma200) : k === "pos52" ? pos52(r) : k === "shortRatio" ? (r.shortRatio == null ? null : r.shortRatio * 100) : (r[k] as number | string | null);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const f = s.rows.filter((r) => (sector === "All" || (r.sector ?? "Other") === sector) && (!qq || r.symbol.toLowerCase().includes(qq) || r.name.toLowerCase().includes(qq)) && (!above200 || (r.dma200 != null && r.close > r.dma200)) && (!nearHi || (r.hi52 != null && r.close >= r.hi52 * 0.97)) && (!nearLo || (r.lo52 != null && r.close <= r.lo52 * 1.03)));
    return f.sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir; });
  }, [s.rows, q, sector, above200, nearHi, nearLo, sort]);
  const th = (k: SortKey, label: string, left = false) => <th className={`sortable${left ? " l" : ""}`} onClick={() => setSort((p) => ({ k, dir: p.k === k ? (p.dir === 1 ? -1 : 1) : -1 }))}>{label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>;
  const cell = (v: number | null, full = 6, d = 1) => <td className={`num ${signCls(v)}`} style={{ background: shade(v, full) }}>{fmtPct(v, d)}</td>;
  return (
    <>
      <div className="searchrow">
        <input type="text" placeholder="symbol or name" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
        <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ width: 220 }}>{sectors.map((x) => <option key={x}>{x}</option>)}</select>
        <span className={`chip-sm${above200 ? " on" : ""}`} onClick={() => setAbove200(!above200)}>above 200d</span>
        <span className={`chip-sm${nearHi ? " on" : ""}`} onClick={() => setNearHi(!nearHi)}>within 3% of 52w high</span>
        <span className={`chip-sm${nearLo ? " on" : ""}`} onClick={() => setNearLo(!nearLo)}>within 3% of 52w low</span>
        <span className="cnt">{rows.length} of {s.rows.length}</span>
      </div>
      <div style={{ maxHeight: 520, overflow: "auto" }}>
        <table className="secT">
          <thead><tr>{th("symbol", "Symbol", true)}{th("name", "Name", true)}{th("sector", "Sector", true)}{th("close", "Last")}{th("pct1d", "1D")}{th("pct1w", "1W")}{th("pct1m", "1M")}{th("pct3m", "3M")}{th("pct12m", "12M")}{th("vs50", "vs 50d")}{th("vs200", "vs 200d")}{th("pos52", "52w pos")}{hasShort && th("shortRatio", "Short vol %")}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.symbol}><td className="l"><b>{r.symbol}</b></td><td className="l">{r.name}</td><td className="l mut">{r.sector ?? ""}</td><td className="num">{fmtNum(r.close, r.close >= 1000 ? 0 : 2)}</td>{cell(r.pct1d, 4)}{cell(r.pct1w, 8)}{cell(r.pct1m, 12)}{cell(r.pct3m, 20)}{cell(r.pct12m, 50)}{cell(vs(r.close, r.dma50), 10)}{cell(vs(r.close, r.dma200), 20)}<td className="num mut">{pos52(r) == null ? "–" : `${Math.round(pos52(r)!)}%`}</td>{hasShort && <td className="num mut">{r.shortRatio == null ? "–" : `${(r.shortRatio * 100).toFixed(0)}%`}</td>}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

export function EquitiesView({ sub, onSub, tick }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const ix = INDICES.find((i) => i.id === sub) ?? INDICES[1];
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [twoSigma, setTwoSigma] = useState(false);
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const st = useApi<IndexStats>(ix.stats ? "index_stats" : null, { idx: ix.stats ?? undefined }, tick);
  const rows = table.data?.rows ?? [];
  const main = rows.find((r) => r.symbol === ix.symbol);
  const support = ix.support.map((s) => rows.find((r) => r.symbol === s)).filter((r): r is TableRow => !!r).slice(0, 4);
  const s = st.data && st.data.rows.length ? st.data : null;
  const toggle = (
    <div className="chips">
      <span className="lbl">Index</span>
      {INDICES.map((i) => <span key={i.id} className={`chip-sm${i.id === ix.id ? " on" : ""}`} onClick={() => onSub(i.id)}>{i.label}</span>)}
    </div>
  );
  const statsAux = s ? <>{s.idx} constituents · closes of {s.asOf}{ix.statsNote && <span className="badge proxy" title={ix.statsNote}>STAND-IN</span>}</> : "";
  const noStats = <Empty title={ix.stats ? "Statistics not computed yet" : "Constituent data not sourced"}>{ix.stats ? (st.error ?? "The daily statistics job runs after each close.") : ix.statsNote}</Empty>;
  return (
    <>
      <div className="c12">{toggle}<PeriodBar period={period} onPeriod={setPeriod} twoSigma={twoSigma} onTwoSigma={setTwoSigma} /></div>
      <Panel no="01" title={ix.label} span={8} aux={<>{ix.symbol}{main?.proxyFor && <span className="badge proxy" title="1306.T ETF stands in for the index intraday; official JPX close for daily figures">PROXY</span>}</>}>
        {main ? <div className="bigwrap"><ChartPanel row={main} period={period} tick={tick} twoSigma={twoSigma} shape="large" axes /></div> : <Empty title="Awaiting the data feed">{table.error ?? "The index chart loads with the market table."}</Empty>}
      </Panel>
      <Panel no="02" title="SUPPORTING" span={4} aux={`${support.length} of 4`}>
        {support.length ? <div className="sqgrid">{support.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} shape="square" />)}</div> : <Empty title="Supporting charts">Futures, FX, rates and volatility that drive this index.</Empty>}
      </Panel>
      <Panel no="03" title="MARKET BREADTH" span={4} aux={statsAux}>{s ? <Breadth s={s} /> : noStats}</Panel>
      <Panel no="04" title="SHORT INTEREST" span={4} aux={s?.shorts ? <>FINRA consolidated short-sale volume · {s.shorts.d}</> : ""}>
        {s?.shorts ? (
          <>
            <div className="krow"><span><span className="k">Avg short-volume share</span><span className="v">{(s.shorts.avgRatio * 100).toFixed(1)}%</span></span><span><span className="k">Names</span><span className="v">{s.rows.filter((r) => r.shortRatio != null).length}</span></span></div>
            <div className="minih">Highest short-volume share</div>
            <table className="secT"><tbody>{s.shorts.top.map((x) => <tr key={x.symbol}><td className="l">{x.name}<span className="mut"> {x.symbol}</span></td><td className="num">{(x.ratio * 100).toFixed(0)}%</td></tr>)}</tbody></table>
            <div className="hint2">Share of the day&apos;s volume reported as short sales (FINRA Reg SHO daily files), not open short interest.</div>
          </>
        ) : <Empty title={ix.stats === "NK225" ? "Japan short data not wired yet" : "No short-volume data"}>{ix.stats === "NK225" ? "JPX publishes daily short-selling ratios as PDF; parsing is planned." : s ? "The FINRA job runs after the US close." : ix.statsNote || "Needs constituent data."}</Empty>}
      </Panel>
      <Panel no="05" title="SECTOR PERFORMANCE" span={4} aux={statsAux}>{s ? <Sectors s={s} /> : noStats}</Panel>
      <Panel no="06" title="MOVERS" span={6} aux={statsAux}>{s ? <div className="msg2"><div><Movers rows={s.movers.top} title="Top 15 · 1D" /></div><div><Movers rows={s.movers.bottom} title="Bottom 15 · 1D" /></div></div> : noStats}</Panel>
      <Panel no="07" title="HEAT MAP" span={6} aux={s ? <>{statsAux} · colour = 1D %{s.rows.some((r) => r.weight != null) ? ", size = index weight" : ""}</> : ""}>{s ? <HeatMap s={s} /> : noStats}</Panel>
      <Panel no="08" title="SCREENER" span={12} aux={statsAux}>{s ? <Screener s={s} /> : noStats}</Panel>
    </>
  );
}
