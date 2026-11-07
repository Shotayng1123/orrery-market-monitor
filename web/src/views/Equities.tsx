import { useMemo, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import type { SigmaWindow } from "../components/SigmaChart";
import { Treemap, type TreeGroup } from "../components/Treemap";
import { hideCard, money, openAsset, showCard } from "../components/CompanyCard";
import { SectorDrawer } from "../components/SectorDrawer";
import { Bars } from "../components/Bars";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp } from "../lib/time";
import { mergeClasses } from "../lib/classes";

export const INDICES = [
  { id: "topix", label: "TOPIX", symbol: "1306.T", stats: "TOPIX", statsNote: "", support: ["^N225", "NKD=F", "USDJPY=X", "JGB10Y"] },
  { id: "nk225", label: "NIKKEI 225", symbol: "^N225", stats: "NK225", statsNote: "", support: ["NKD=F", "1306.T", "USDJPY=X", "^SOX"] },
  { id: "spx", label: "S&P 500", symbol: "^GSPC", stats: "SP500", statsNote: "", support: ["ES=F", "^VIX", "^TNX", "DX-Y.NYB"] },
  { id: "ixic", label: "NASDAQ COMP", symbol: "^IXIC", stats: "NDX", statsNote: "Nasdaq-100 names stand in for the Composite's ~3,000 constituents", support: ["NQ=F", "^SOX", "^VIX", "^TNX"] },
  { id: "kospi", label: "KOSPI", symbol: "^KS11", stats: "KOSPI200", statsNote: "KOSPI 200 names stand in for the ~800-name KOSPI", support: ["KRW=X", "^SOX", "^TWII", "^GSPC"] },
  { id: "hsi", label: "HANG SENG", symbol: "^HSI", stats: "HSI", statsNote: "", support: ["000001.SS", "CNH=X", "^GSPC", "^TNX"] },
  { id: "sse", label: "SHANGHAI COMP", symbol: "000001.SS", stats: "SSE180", statsNote: "SSE 180 names stand in for the ~2,200-name Composite", support: ["^HSI", "CNH=X", "HG=F", "^GSPC"] },
] as const;
export type IndexId = (typeof INDICES)[number]["id"];

interface StatRow {
  symbol: string; name: string; sector: string | null; weight: number | null; d: string; close: number; prev: number | null;
  pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct6m?: number | null; pct12m: number | null; pct36m?: number | null;
  industry?: string | null; dma50: number | null; dma200: number | null; hi52: number | null; lo52: number | null; shortRatio?: number | null; shortHolders?: number | null;
  mcap?: number | null; volume?: number | null; adv3m?: number | null; turnover?: number | null; adv_turnover?: number | null; mf_up?: number | null; mf_down?: number | null; mf_net?: number | null; mf_d?: string | null;
}
interface SectorRow { sector: string; n: number; weight: number | null; mcapShare?: number | null; pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null; above200: number; turnover?: number | null; turnoverShare?: number | null; flow?: number | null; mfUp?: number | null; mfDown?: number | null; mfNet?: number | null }
interface IndexStats {
  idx: string; asOf: string | null; quoteAt?: string | null; mfAt?: string | null; mfD?: string | null; rows: StatRow[];
  breadth: { n: number; adv: number; dec: number; above50: number; above200: number; newHi: number; newLo: number; over2: number; under2: number } | null;
  sectors: SectorRow[]; movers: { top: StatRow[]; bottom: StatRow[] };
  shorts: { d: string; avgRatio: number; top: Array<{ symbol: string; name: string; ratio: number }>; history?: Array<{ d: string; v: number | null }> } | null;
}
interface BreadthRow { d: string; n: number; adv: number; dec: number; above50: number; above200: number; new_hi: number; new_lo: number }
interface JpShorts {
  idx: string; market: Array<{ d: string; ratio: number | null; restricted: number | null; total: number | null }>; sectorsAsOf: string | null; sectors: Array<{ sector: string; ratio: number | null; total: number | null }>;
  positions: { asOf: string | null; names: number; covered: number; avgRatio: number | null; top: Array<{ symbol: string; name: string; sector: string | null; holders: number; ratio: number; d: string }>; history?: Array<{ d: string; v: number | null }>; namesHistory?: Array<{ d: string; v: number | null }> };
  margin: Array<{ d: string; sellShares: number | null; sellValue: number | null; buyShares: number | null; buyValue: number | null }>;
}

const CCY: Record<string, string> = { SP500: "USD", NDX: "USD", NK225: "JPY", TOPIX: "JPY", KOSPI200: "KRW", HSI: "HKD", SSE180: "CNY" };
const UP_RGB = "63,208,126", DN_RGB = "255,77,66";
const shade = (v: number | null | undefined, full = 6) => (v == null || v === 0 ? undefined : `rgba(${v > 0 ? UP_RGB : DN_RGB},${(Math.min(1, Math.abs(v) / full) * 0.55).toFixed(3)})`);
const flowShade = (v: number | null | undefined, full = 3) => (v == null || v === 0 ? undefined : v > 0 ? `rgba(31,209,193,${(Math.min(1, v / full) * 0.5).toFixed(3)})` : `rgba(138,135,126,${(Math.min(1, -v / full) * 0.4).toFixed(3)})`);
const pos52 = (r: StatRow) => (r.hi52 != null && r.lo52 != null && r.hi52 > r.lo52 ? ((r.close - r.lo52) / (r.hi52 - r.lo52)) * 100 : null);
const vs = (close: number, dma: number | null) => (dma == null || dma === 0 ? null : (close / dma - 1) * 100);
/** A tile-sized company name: drops legal suffixes and keeps the first words. */
const shortName = (n: string) => n.replace(/[,.]?\s*(Corporation|Corp\.?|Co\.,? Ltd\.?|Co\.?|Company|Holdings?|Hldgs\.?|Group|Inc\.?|Incorporated|Ltd\.?|Limited|plc|PLC|AG|SE|NV|N\.V\.|S\.A\.|SA|KK|K\.K\.|株式会社|ホールディングス)\s*$/i, "").replace(/[,.]?\s*(Corporation|Corp\.?|Co\.,? Ltd\.?|Holdings?|Inc\.?|Ltd\.?|Limited)\s*$/i, "").trim().slice(0, 18);
const signed = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${money(Math.abs(v))}`);

const Name = ({ r }: { r: { symbol: string; name: string }; sub?: boolean }) => <span className="lnk" title={r.symbol} onMouseEnter={(e) => showCard(r.symbol, e)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.name}</span>;

// ---- market breadth as a table by period ----
const PERIODS = [["1D", "pct1d", 1], ["1W", "pct1w", 7], ["1M", "pct1m", 31], ["3M", "pct3m", 92], ["6M", "pct6m", 183], ["12M", "pct12m", 366], ["36M", "pct36m", 1096]] as const;
function BreadthTable({ s, hist }: { s: IndexStats; hist: BreadthRow[] }) {
  const b = s.breadth!;
  const cols = PERIODS.map(([label, key, days]) => {
    const vals = s.rows.map((r) => r[key] ?? null).filter((v): v is number => v != null).sort((a, c) => a - c);
    const up = vals.filter((v) => v > 0).length, down = vals.filter((v) => v < 0).length;
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    const mean = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
    const target = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
    const then = label === "1D" ? hist[hist.length - 1] ?? null : [...hist].reverse().find((h) => h.d <= target) ?? null;
    return { label, n: vals.length, up, down, median, mean, then };
  });
  const pc = (num: number, den: number) => (den ? `${Math.round((num / den) * 100)}%` : "–");
  return (
    <>
      <div className="krow">
        <span><span className="k">Advancers today</span><span className="v">{b.adv}<span className="mut" style={{ fontSize: 11, fontWeight: 400 }}> / {b.dec} down</span></span></span>
        <span><span className="k">Above 50d</span><span className="v">{pc(b.above50, b.n)}</span></span>
        <span><span className="k">Above 200d</span><span className="v">{pc(b.above200, b.n)}</span></span>
        <span><span className="k">52w highs / lows</span><span className="v">{b.newHi} / {b.newLo}</span></span>
        <span><span className="k">Up / down ≥ 2%</span><span className="v">{b.over2} / {b.under2}</span></span>
      </div>
      <table className="secT brT">
        <thead><tr><th className="l">Window</th>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
        <tbody>
          <tr><td className="l">Names up</td>{cols.map((c) => <td key={c.label} className="num up" style={{ background: shade((c.up / (c.n || 1)) * 100 - 50, 50) }}>{pc(c.up, c.n)}</td>)}</tr>
          <tr><td className="l">Names down</td>{cols.map((c) => <td key={c.label} className="num dn">{pc(c.down, c.n)}</td>)}</tr>
          <tr><td className="l">Median move</td>{cols.map((c) => <td key={c.label} className={`num ${signCls(c.median)}`}>{fmtPct(c.median, 1)}</td>)}</tr>
          <tr><td className="l">Average move</td>{cols.map((c) => <td key={c.label} className={`num ${signCls(c.mean)}`}>{fmtPct(c.mean, 1)}</td>)}</tr>
          <tr className="sep"><td className="l" title="Share of names above their 50-day average at the start of the window (1D = latest session)">Above 50d, window start</td>{cols.map((c) => <td key={c.label} className="num">{c.then ? pc(c.then.above50, c.then.n) : "–"}</td>)}</tr>
          <tr><td className="l" title="Share of names above their 200-day average at the start of the window">Above 200d, window start</td>{cols.map((c) => <td key={c.label} className="num">{c.then ? pc(c.then.above200, c.then.n) : "–"}</td>)}</tr>
          <tr><td className="l">52w highs / lows, window start</td>{cols.map((c) => <td key={c.label} className="num mut">{c.then ? `${c.then.new_hi} / ${c.then.new_lo}` : "–"}</td>)}</tr>
          <tr><td className="l mut">Session</td>{cols.map((c) => <td key={c.label} className="num mut" style={{ fontSize: 9.5 }}>{c.then?.d ?? "–"}</td>)}</tr>
        </tbody>
      </table>
    </>
  );
}

// ---- flow by sector: turnover against the three-month pattern, plus the day's net money flow ----
function SectorFlow({ s, onSector }: { s: IndexStats; onSector: (sector: string) => void }) {
  const xs = s.sectors.filter((x) => x.turnover != null && x.turnover > 0);
  if (!xs.length) return <Empty title="Turnover not loaded yet">The flow job refreshes volume and market cap every ten minutes during the session.</Empty>;
  const total = xs.reduce((a, x) => a + (x.turnover ?? 0), 0);
  const avgOf = (x: SectorRow) => (x.flow && x.turnover ? x.turnover / x.flow : null);
  const totalAvg = xs.reduce((a, x) => a + (avgOf(x) ?? 0), 0);
  const rows = [...xs].map((x) => { const avg = avgOf(x); const share = (x.turnover! / total) * 100; const avgShare = avg != null && totalAvg ? (avg / totalAvg) * 100 : null; return { ...x, share, avgShare, dShare: avgShare == null ? null : share - avgShare }; }).sort((a, b) => b.turnover! - a.turnover!);
  const maxShare = Math.max(...rows.map((r) => r.share));
  const hasMf = rows.some((r) => r.mfNet != null);
  const totMf = rows.reduce((a, r) => a + (r.mfNet ?? 0), 0);
  const maxMf = Math.max(1, ...rows.map((r) => Math.abs(r.mfNet ?? 0)));
  return (
    <table className="secT flowT">
      <thead><tr><th className="l">Sector</th><th>Turnover</th><th className="l" style={{ width: "16%" }}>Share</th><th>Share %</th><th>Avg %</th><th>Δ pp</th><th>Day / avg</th>{hasMf && <th title="Net money flow: turnover on up-ticks minus turnover on down-ticks, one-minute bars">Net flow</th>}{hasMf && <th className="l" style={{ width: "14%" }} />}<th>1D %</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.sector}>
            <td className="l"><span className="lnk" onClick={() => onSector(r.sector)}>{r.sector}</span></td>
            <td className="num">{money(r.turnover)}</td>
            <td><span className="bbar" title={`${r.share.toFixed(1)}% of the day's turnover${r.avgShare != null ? ` · ${r.avgShare.toFixed(1)}% on average` : ""}`}><span style={{ width: `${(r.share / maxShare) * 100}%`, background: "var(--cyan)" }} />{r.avgShare != null && <i className="mark" style={{ left: `${Math.min(100, (r.avgShare / maxShare) * 100)}%` }} />}</span></td>
            <td className="num">{r.share.toFixed(1)}</td>
            <td className="num mut">{r.avgShare == null ? "–" : r.avgShare.toFixed(1)}</td>
            <td className="num" style={{ background: flowShade(r.dShare) }}>{r.dShare == null ? "–" : `${r.dShare > 0 ? "+" : ""}${r.dShare.toFixed(1)}`}</td>
            <td className="num" style={{ background: flowShade(r.flow == null ? null : (r.flow - 1) * 3, 3) }}>{r.flow == null ? "–" : `${r.flow.toFixed(2)}×`}</td>
            {hasMf && <td className={`num ${signCls(r.mfNet)}`}>{signed(r.mfNet)}</td>}
            {hasMf && <td><span className="mfbar"><span className="mid" />{r.mfNet != null && <span className={r.mfNet >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(r.mfNet) / maxMf) * 50}%` }} />}</span></td>}
            <td className={`num ${signCls(r.pct1d)}`} style={{ background: shade(r.pct1d, 4) }}>{fmtPct(r.pct1d, 1)}</td>
          </tr>
        ))}
        <tr className="tot"><td className="l">Index</td><td className="num">{money(total)}</td><td /><td className="num">100</td><td className="num mut">100</td><td /><td className="num">{totalAvg ? `${(total / totalAvg).toFixed(2)}×` : "–"}</td>{hasMf && <td className={`num ${signCls(totMf)}`}>{signed(totMf)}</td>}{hasMf && <td />}<td /></tr>
      </tbody>
    </table>
  );
}

function Sectors({ s, onSector }: { s: IndexStats; onSector: (sector: string) => void }) {
  const hasW = s.sectors.some((x) => x.weight != null), hasM = s.sectors.some((x) => x.mcapShare != null);
  return (
    <table className="secT">
      <thead><tr><th className="l">Sector</th><th>N</th>{hasW && <th>Wt %</th>}{hasM && <th>Mcap %</th>}<th>1D</th><th>1W</th><th>1M</th><th>3M</th><th>12M</th><th>&gt;200d</th></tr></thead>
      <tbody>{s.sectors.map((x) => <tr key={x.sector}><td className="l"><span className="lnk" onClick={() => onSector(x.sector)}>{x.sector}</span></td><td className="num mut">{x.n}</td>{hasW && <td className="num mut">{x.weight == null ? "–" : x.weight.toFixed(1)}</td>}{hasM && <td className="num mut">{x.mcapShare == null ? "–" : x.mcapShare.toFixed(1)}</td>}
        {([x.pct1d, x.pct1w, x.pct1m, x.pct3m, x.pct12m] as Array<number | null>).map((v, i) => <td key={i} className={`num ${signCls(v)}`} style={{ background: shade(v, i === 0 ? 4 : i < 3 ? 8 : 25) }}>{fmtPct(v, 1)}</td>)}
        <td className="num mut">{x.n ? `${Math.round((x.above200 / x.n) * 100)}%` : "–"}</td></tr>)}</tbody>
    </table>
  );
}

function Movers({ rows, title }: { rows: StatRow[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT mvT"><colgroup><col style={{ width: "40%" }} /><col style={{ width: "26%" }} /><col style={{ width: "13%" }} /><col style={{ width: "10.5%" }} /><col style={{ width: "10.5%" }} /></colgroup><tbody>{rows.map((r) => <tr key={r.symbol}><td className="l nm" title={`${r.name} (${r.symbol})`}><Name r={r} /></td><td className="l mut nm" title={r.sector ?? ""}>{r.sector ?? ""}</td><td className="num">{fmtNum(r.close, r.close >= 1000 ? 0 : 2)}</td><td className={`num ${signCls(r.pct1d)}`}>{fmtPct(r.pct1d, 1)}</td><td className={`num ${signCls(r.pct1w)}`}>{fmtPct(r.pct1w, 1)}</td></tr>)}</tbody></table>
    </>
  );
}

/** Market-cap-weighted treemap: names grouped by sector, no gaps, solid white text. Hover = company card, click = asset page. */
function HeatMap({ s, rows }: { s: IndexStats; rows: StatRow[] }) {
  const groups = useMemo<TreeGroup[]>(() => {
    const hasM = rows.some((r) => r.mcap != null && r.mcap > 0), hasW = rows.some((r) => r.weight != null && r.weight > 0);
    const minM = hasM ? Math.min(...rows.filter((r) => r.mcap != null && r.mcap > 0).map((r) => r.mcap!)) : 1;
    const size = (r: StatRow) => (hasM ? (r.mcap && r.mcap > 0 ? r.mcap : minM) : hasW ? (r.weight && r.weight > 0 ? r.weight : 0.01) : 1);
    const by = new Map<string, StatRow[]>();
    for (const r of rows) { const k = r.sector ?? "Other"; by.set(k, [...(by.get(k) ?? []), r]); }
    return [...by.entries()].map(([sector, rs]) => ({ id: sector, label: sector, leaves: rs.map((r) => ({ id: r.symbol, label: shortName(r.name), name: shortName(r.name), value: size(r), pct: r.pct1d, title: r.name })) }));
  }, [rows, s.idx]);
  return <Treemap groups={groups} height={Math.max(640, Math.min(900, Math.round(window.innerWidth * 0.42)))} onEnter={(id, e) => showCard(id, e)} onLeave={hideCard} onClick={openAsset} />;
}

// ---- Japan short selling (JPX) ----
function JpShortPanel({ idx }: { idx: string }) {
  const j = useApi<JpShorts>("jp_shorts", { idx }, 0);
  const d = j.data;
  if (!d) return <Empty title="Loading JPX short data">{j.error ?? ""}</Empty>;
  const last = d.market[d.market.length - 1] ?? null;
  const avg = (n: number) => { const xs = d.market.slice(-n).map((m) => m.ratio).filter((v): v is number => v != null); return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null; };
  const mg0 = d.margin[0], mg1 = d.margin[1];
  const wow = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? `${a - b > 0 ? "+" : ""}${(((a - b) / b) * 100).toFixed(1)}%` : "–");
  return (
    <>
      <div className="krow">
        <span><span className="k">Short selling share · {last?.d ?? "–"}</span><span className="v">{last?.ratio == null ? "–" : `${last.ratio.toFixed(1)}%`}</span></span>
        <span><span className="k">5-day / 20-day avg</span><span className="v" style={{ fontSize: 13 }}>{avg(5)?.toFixed(1) ?? "–"}% / {avg(20)?.toFixed(1) ?? "–"}%</span></span>
        <span><span className="k">Reported positions ≥0.5% · {d.positions.asOf ?? "–"}</span><span className="v" style={{ fontSize: 13 }}>{d.positions.names} of {d.positions.covered} names</span></span>
      </div>
      <div className="msg2">
        <div>
          <div className="minih">Short selling share of trading value, daily (JPX market total)</div>
          <Bars data={d.market.map((m) => ({ d: m.d, v: m.ratio }))} fmt={(v) => `${v.toFixed(1)}%`} baseline={avg(20)} />
        </div>
        <div>
          <div className="minih">Reported short positions, index average (sum of holders ≥0.5%)</div>
          <Bars data={(d.positions.history ?? []).map((h) => ({ d: h.d, v: h.v == null ? null : h.v * 100 }))} fmt={(v) => `${v.toFixed(2)}%`} color="#ff6f61" />
        </div>
      </div>
      <div className="msg2">
        <div>
          <div className="minih">Largest reported short positions (sum of holders ≥0.5%)</div>
          <table className="secT"><tbody>{d.positions.top.slice(0, 12).map((p) => <tr key={p.symbol}><td className="l nm"><Name r={p} /></td><td className="l mut nm">{p.sector ?? ""}</td><td className="num mut">{p.holders}</td><td className="num">{(p.ratio * 100).toFixed(2)}%</td></tr>)}</tbody></table>
        </div>
        <div>
          <div className="minih">Short selling share by sector · {d.sectorsAsOf ?? "–"}</div>
          <table className="secT"><tbody>{[...d.sectors.slice(0, 6), ...d.sectors.slice(-4)].map((x, i) => <tr key={x.sector + i}><td className="l">{x.sector}</td><td className="num mut">{money(x.total == null ? null : x.total * 1e6)}</td><td className="num" style={{ background: shade((x.ratio ?? 0) - (last?.ratio ?? 0), 15) }}>{x.ratio == null ? "–" : `${x.ratio.toFixed(1)}%`}</td></tr>)}</tbody></table>
          {mg0 && (
            <>
              <div className="minih" style={{ marginTop: 8 }}>Margin balances, market total · week to {mg0.d}</div>
              <table className="secT"><tbody>
                <tr><td className="l">Shares sold short (売残)</td><td className="num">{money((mg0.sellValue ?? 0) * 1e6)} JPY</td><td className={`num ${signCls(mg0.sellValue != null && mg1?.sellValue ? mg0.sellValue - mg1.sellValue : null)}`}>{wow(mg0.sellValue, mg1?.sellValue)}</td></tr>
                <tr><td className="l">Bought on margin (買残)</td><td className="num">{money((mg0.buyValue ?? 0) * 1e6)} JPY</td><td className={`num ${signCls(mg0.buyValue != null && mg1?.buyValue ? mg0.buyValue - mg1.buyValue : null)}`}>{wow(mg0.buyValue, mg1?.buyValue)}</td></tr>
                <tr><td className="l">Buy / sell ratio (倍率)</td><td className="num">{mg0.buyShares && mg0.sellShares ? (mg0.buyShares / mg0.sellShares).toFixed(2) : "–"}×</td><td className="num mut">{mg1?.buyShares && mg1.sellShares ? `${(mg1.buyShares / mg1.sellShares).toFixed(2)}× prior` : ""}</td></tr>
              </tbody></table>
            </>
          )}
        </div>
      </div>
    </>
  );
}

type SortKey = "symbol" | "name" | "sector" | "close" | "pct1d" | "pct1w" | "pct1m" | "pct3m" | "pct12m" | "vs50" | "vs200" | "pos52" | "shortRatio" | "mcap" | "turnover" | "volRel" | "mf_net";
function Screener({ s }: { s: IndexStats }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [above200, setAbove200] = useState(false);
  const [nearHi, setNearHi] = useState(false);
  const [nearLo, setNearLo] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "pct1d", dir: -1 });
  const sectors = useMemo(() => ["All", ...[...new Set(s.rows.map((r) => r.sector ?? "Other"))].sort()], [s.rows]);
  const hasShort = s.rows.some((r) => r.shortRatio != null), hasM = s.rows.some((r) => r.mcap != null), hasT = s.rows.some((r) => r.turnover != null), hasF = s.rows.some((r) => r.mf_net != null);
  const jp = s.idx === "NK225" || s.idx === "TOPIX";
  const volRel = (r: StatRow) => (r.volume != null && r.adv3m ? (r.volume / r.adv3m) * 100 : null);
  const val = (r: StatRow, k: SortKey): number | string | null => k === "vs50" ? vs(r.close, r.dma50) : k === "vs200" ? vs(r.close, r.dma200) : k === "pos52" ? pos52(r) : k === "shortRatio" ? (r.shortRatio == null ? null : r.shortRatio * 100) : k === "volRel" ? volRel(r) : k === "mcap" || k === "turnover" || k === "mf_net" ? (r[k] ?? null) : (r[k] as number | string | null);
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
          <thead><tr>{th("symbol", "Symbol", true)}{th("name", "Name", true)}{th("sector", "Sector", true)}{th("close", "Last")}{th("pct1d", "1D")}{th("pct1w", "1W")}{th("pct1m", "1M")}{th("pct3m", "3M")}{th("pct12m", "12M")}{th("vs50", "vs 50d")}{th("vs200", "vs 200d")}{th("pos52", "52w pos")}{hasM && th("mcap", "Mcap")}{hasT && th("turnover", "Turnover")}{hasT && th("volRel", "Vol / 3M avg")}{hasF && th("mf_net", "Net flow")}{hasShort && th("shortRatio", jp ? "Short pos %" : "Short vol %")}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.symbol}><td className="l"><b className="lnk" onMouseEnter={(e) => showCard(r.symbol, e)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.symbol}</b></td><td className="l nm"><Name r={r} /></td><td className="l mut" title={r.industry ?? ""}>{r.sector ?? ""}{r.industry ? <span className="mut"> · {r.industry}</span> : null}</td><td className="num">{fmtNum(r.close, r.close >= 1000 ? 0 : 2)}</td>{cell(r.pct1d, 4)}{cell(r.pct1w, 8)}{cell(r.pct1m, 12)}{cell(r.pct3m, 20)}{cell(r.pct12m, 50)}{cell(vs(r.close, r.dma50), 10)}{cell(vs(r.close, r.dma200), 20)}<td className="num mut">{pos52(r) == null ? "–" : `${Math.round(pos52(r)!)}%`}</td>{hasM && <td className="num mut">{money(r.mcap)}</td>}{hasT && <td className="num mut">{money(r.turnover)}</td>}{hasT && <td className="num" style={{ background: flowShade(volRel(r) == null ? null : (volRel(r)! - 100) / 50, 3) }}>{volRel(r) == null ? "–" : `${Math.round(volRel(r)!)}%`}</td>}{hasF && <td className={`num ${signCls(r.mf_net)}`}>{signed(r.mf_net)}</td>}{hasShort && <td className="num mut">{r.shortRatio == null ? "–" : `${(r.shortRatio * 100).toFixed(jp ? 2 : 0)}%`}</td>}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

export function EquitiesView({ sub, onSub, tick }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const ix = INDICES.find((i) => i.id === sub) ?? INDICES[1];
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [drawer, setDrawer] = useState<string | null>(null);
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const st = useApi<IndexStats>("index_stats", { idx: ix.stats }, tick);
  const bh = useApi<{ rows: BreadthRow[] }>("breadth_history", { idx: ix.stats, days: 1100 }, Math.floor(tick / 30));   // daily data: refetch every half hour
  const rows = table.data?.rows ?? [];
  const main = rows.find((r) => r.symbol === ix.symbol);
  const support = ix.support.map((s) => rows.find((r) => r.symbol === s)).filter((r): r is TableRow => !!r).slice(0, 4);
  const s = st.data && st.data.rows.length ? st.data : null;
  const ccy = CCY[ix.stats] ?? "";
  const jp = ix.stats === "NK225" || ix.stats === "TOPIX", us = ix.stats === "SP500" || ix.stats === "NDX";
  const toggle = (
    <div className="chips">
      <span className="lbl">Index</span>
      {INDICES.map((i) => <span key={i.id} className={`chip-sm${i.id === ix.id ? " on" : ""}`} onClick={() => onSub(i.id)}>{i.label}</span>)}
    </div>
  );
  const standIn = ix.statsNote ? <span className="badge proxy" title={ix.statsNote}>STAND-IN</span> : null;
  const statsAux = s ? <>{s.idx} constituents · closes of {s.asOf}{standIn}</> : "";
  const noStats = <Empty title="Statistics not computed yet">{st.error ?? "The daily statistics job runs after each close."}</Empty>;
  const hasMcap = !!s?.rows.some((r) => r.mcap != null);
  const merged = useMemo(() => (s ? mergeClasses(s.rows) : []), [s]);
  const movers = useMemo(() => { const xs = merged.filter((r) => r.pct1d != null).sort((a, b) => b.pct1d! - a.pct1d!); return { top: xs.slice(0, 15), bottom: xs.slice(-15).reverse() }; }, [merged]);
  const drawerRows = s && drawer ? merged.filter((r) => (r.sector ?? "Other") === drawer) : [];
  return (
    <>
      <div className="c12">{toggle}<PeriodBar period={period} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} /></div>
      <Panel no="01" title={ix.label} span={8} aux={<>{ix.symbol}{main?.proxyFor && <span className="badge proxy" title="1306.T ETF stands in for the index intraday; official JPX close for daily figures">PROXY</span>}</>}>
        {main ? <div className="bigwrap"><ChartPanel row={main} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes /></div> : <Empty title="Awaiting the data feed">{table.error ?? "The index chart loads with the market table."}</Empty>}
      </Panel>
      <Panel no="02" title="SUPPORTING" span={4} aux={`${support.length} of 4`}>
        {support.length ? <div className="sqgrid">{support.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="square" />)}</div> : <Empty title="Supporting charts">Futures, FX, rates and volatility that drive this index.</Empty>}
      </Panel>
      <Panel no="03" title="MARKET BREADTH" span={6} aux={statsAux}>{s ? <BreadthTable s={s} hist={bh.data?.rows ?? []} /> : noStats}</Panel>
      <Panel no="04" title="FLOW BY SECTOR" span={6} aux={s ? <>{s.idx} · {ccy}{s.quoteAt ? ` · turnover ${fmtStamp(s.quoteAt)}` : ""}{s.mfD ? ` · net flow ${s.mfD}` : ""}{standIn}</> : ""}>{s ? <SectorFlow s={s} onSector={setDrawer} /> : noStats}</Panel>
      <Panel no="05" title="SECTOR PERFORMANCE" span={6} aux={<>{statsAux} · <span title={ix.stats === "SP500" ? "Official GICS sectors from the S&P 500 constituent list" : "GICS sector names; classification from Yahoo Finance (official GICS where the name is in the S&P 500)"}>GICS sectors</span></>}>{s ? <Sectors s={s} onSector={setDrawer} /> : noStats}</Panel>
      <Panel no="06" title="SHORT INTEREST" span={6} aux={jp ? "JPX 空売り集計 · 空売り残高報告 · 信用取引現在高" : s?.shorts ? <>FINRA consolidated short-sale volume · {s.shorts.d}</> : ""}>
        {jp ? <JpShortPanel idx={ix.stats} /> : s?.shorts ? (
          <>
            <div className="krow"><span><span className="k">Avg short-volume share</span><span className="v">{(s.shorts.avgRatio * 100).toFixed(1)}%</span></span><span><span className="k">Names</span><span className="v">{s.rows.filter((r) => r.shortRatio != null).length}</span></span></div>
            <div className="msg2">
              <div>
                <div className="minih">Average short-volume share, daily</div>
                <Bars data={(s.shorts.history ?? []).map((h) => ({ d: h.d, v: h.v == null ? null : h.v * 100 }))} fmt={(v) => `${v.toFixed(1)}%`} />
              </div>
              <div>
                <div className="minih">Highest short-volume share</div>
                <table className="secT"><tbody>{s.shorts.top.slice(0, 10).map((x) => <tr key={x.symbol}><td className="l"><Name r={x} /></td><td className="num">{(x.ratio * 100).toFixed(0)}%</td></tr>)}</tbody></table>
              </div>
            </div>
          </>
        ) : <Empty title={us ? "No short-volume data" : "No short data for this market"}>{us ? "The FINRA job runs after the US close." : "Public per-name short data is not available for this exchange."}</Empty>}
      </Panel>
      <Panel no="08" title="MOVERS" span={12} aux={statsAux}>{s ? <div className="msg2"><div><Movers rows={movers.top} title="Top 15 · 1D" /></div><div><Movers rows={movers.bottom} title="Bottom 15 · 1D" /></div></div> : noStats}</Panel>
      <Panel no="07" title="HEAT MAP" span={12} aux={s ? <>{statsAux} · GICS sectors · colour = 1D % · size = {hasMcap ? "market cap" : s.rows.some((r) => r.weight != null) ? "index weight" : "equal"}</> : ""}>{s ? <HeatMap s={s} rows={merged} /> : noStats}</Panel>
      <Panel no="09" title="SCREENER" span={12} aux={statsAux}>{s ? <Screener s={s} /> : noStats}</Panel>
      {drawer && s && <SectorDrawer title={ix.label} sector={drawer} rows={drawerRows} ccy={ccy} onClose={() => setDrawer(null)} />}
    </>
  );
}
