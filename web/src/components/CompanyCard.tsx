import { useEffect, useRef, useState } from "react";
import { useApi } from "../lib/useApi";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp } from "../lib/time";

// Company overview card shown on hover (heat map tiles, names in tables). One card layer lives in the app;
// anything can ask for it with showCard(symbol, event) / hideCard(). The card loads the asset summary once
// per symbol and keeps it for the session.

export interface AssetLite {
  symbol: string; name: string; exchange: string | null; currency: string | null; quoteType: string | null;
  price: number | null; prevClose: number | null; pct: number | null; mcap: number | null; volume: number | null; adv3m: number | null; asOf: string | null;
  home: { symbol: string; name: string }; rel: Array<{ t: number; v: number }>;
  statements: Statements | null;
  short: { kind: "finra"; d: string; ratio: number } | { kind: "jpx"; d: string; ratio: number; holders: Array<{ holder: string; ratio: number; d: string }> } | null;
}
export interface StatementRow { period: string; label: string; revenue: number | null; op: number | null; ni: number | null; eps: number | null; assets?: number | null; equity?: number | null; cfo?: number | null; cfi?: number | null; cff?: number | null; fcf?: number | null }
export interface Statements { source: "edinetdb" | "yahoo" | null; currency: string | null; unit: string; annual: StatementRow[]; quarterly: StatementRow[]; forecast: { fiscalYearEnd: string | null; disclosed: string | null; revenue: number | null; op: number | null; ni: number | null; eps: number | null; dps: number | null } | null; note: string | null; asOf: string | null }

let pending: number | null = null;
export function showCard(symbol: string, e: { clientX: number; clientY: number }, delay = 220) {
  if (pending) clearTimeout(pending);
  const x = e.clientX, y = e.clientY;
  pending = window.setTimeout(() => { pending = null; window.dispatchEvent(new CustomEvent("om:card", { detail: { symbol, x, y } })); }, delay);
}
export function hideCard() {
  if (pending) { clearTimeout(pending); pending = null; }
  window.dispatchEvent(new CustomEvent("om:card:hide"));
}
export const openAsset = (symbol: string) => { hideCard(); location.hash = `asset/${encodeURIComponent(symbol)}`; };

/** Compact money: 1.23tn / 456bn / 7.8m. */
export const money = (v: number | null | undefined, ccy?: string | null) => {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v), s = a >= 1e12 ? `${(v / 1e12).toFixed(2)}tn` : a >= 1e9 ? `${(v / 1e9).toFixed(a >= 1e11 ? 0 : 1)}bn` : a >= 1e6 ? `${(v / 1e6).toFixed(0)}m` : fmtNum(v, 0);
  return ccy ? `${s} ${ccy}` : s;
};

function RelLine({ pts, width = 250, height = 60 }: { pts: Array<{ t: number; v: number }>; width?: number; height?: number }) {
  if (pts.length < 2) return <div className="mut" style={{ fontSize: 10 }}>relative line unavailable</div>;
  const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * width, y = (v: number) => height - ((v - lo) / span) * (height - 6) - 3;
  const last = vs[vs.length - 1];
  const base = y(100);
  return (
    <svg width={width} height={height} className="relline">
      {base >= 0 && base <= height && <line x1={0} x2={width} y1={base} y2={base} stroke="#3a3b40" strokeDasharray="3 3" />}
      <polyline fill="none" stroke={last >= 100 ? "#3fd07e" : "#ff4d42"} strokeWidth={1.2} points={pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} />
    </svg>
  );
}

export function StatementSummary({ st, ccy }: { st: Statements | null; ccy: string | null }) {
  if (!st || (!st.annual.length && !st.forecast)) return <div className="mut" style={{ fontSize: 10.5 }}>{st?.note ?? "statements not loaded"}</div>;
  const rows = st.annual.slice(-3);
  const f = st.forecast;
  const cell = (v: number | null | undefined) => <td className="num">{money(v)}</td>;
  return (
    <table className="secT stm">
      <thead><tr><th className="l">{ccy ?? ""}</th>{rows.map((r) => <th key={r.period}>{r.label.replace(/^FY /, "")}</th>)}{f && <th title={`Company guidance for FY ending ${f.fiscalYearEnd ?? ""}, disclosed ${f.disclosed ?? ""}`}>Fcst{f.fiscalYearEnd ? ` ${f.fiscalYearEnd.slice(0, 7)}` : ""}</th>}</tr></thead>
      <tbody>
        <tr><td className="l">Revenue</td>{rows.map((r) => <td key={r.period} className="num">{money(r.revenue)}</td>)}{f && cell(f.revenue)}</tr>
        <tr><td className="l">Operating income</td>{rows.map((r) => <td key={r.period} className="num">{money(r.op)}</td>)}{f && cell(f.op)}</tr>
        <tr><td className="l">Net income</td>{rows.map((r) => <td key={r.period} className="num">{money(r.ni)}</td>)}{f && cell(f.ni)}</tr>
        <tr><td className="l">EPS</td>{rows.map((r) => <td key={r.period} className="num">{r.eps == null ? "–" : fmtNum(r.eps, 2)}</td>)}{f && <td className="num">{f.eps == null ? "–" : fmtNum(f.eps, 2)}</td>}</tr>
      </tbody>
    </table>
  );
}

const cache = new Map<string, AssetLite>();
function CardBody({ symbol }: { symbol: string }) {
  const have = cache.get(symbol) ?? null;
  const a = useApi<AssetLite>(have ? null : "asset", { symbol, lite: 1 }, 0);
  const d = have ?? a.data;
  useEffect(() => { if (a.data) cache.set(symbol, a.data); }, [a.data, symbol]);
  if (!d) return <div className="ccard-loading">{a.error ? <span className="dn">{a.error}</span> : `loading ${symbol} …`}</div>;
  return (
    <>
      <div className="ccard-h">
        <div><b>{d.name}</b><span className="mut"> {d.symbol}{d.exchange ? ` · ${d.exchange}` : ""}</span></div>
        <div className="ccard-px"><b>{fmtNum(d.price, d.price != null && d.price >= 1000 ? 0 : 2)}</b> <span className={signCls(d.pct)}>{fmtPct(d.pct, 2)}</span>{d.asOf && <span className="mut"> · {fmtStamp(d.asOf)}</span>}</div>
      </div>
      <div className="krow" style={{ padding: "2px 0 4px" }}>
        <span><span className="k">Market cap</span><span className="v" style={{ fontSize: 13 }}>{money(d.mcap, d.currency)}</span></span>
        <span><span className="k">Volume / ADTV</span><span className="v" style={{ fontSize: 13 }}>{d.volume != null && d.adv3m ? `${Math.round((d.volume / d.adv3m) * 100)}%` : "–"}</span></span>
        {d.short && <span><span className="k">{d.short.kind === "finra" ? "Short vol share" : "Short positions"}</span><span className="v" style={{ fontSize: 13 }}>{(d.short.ratio * 100).toFixed(d.short.kind === "finra" ? 0 : 2)}%</span></span>}
      </div>
      <div className="minih">12M vs {d.home.name} (rebased 100)</div>
      <RelLine pts={d.rel} />
      <div className="minih" style={{ marginTop: 6 }}>Statements{d.statements?.source ? ` · ${d.statements.source === "edinetdb" ? "EDINET DB" : "Yahoo"}` : ""}</div>
      <StatementSummary st={d.statements} ccy={d.currency} />
      <div className="mut" style={{ fontSize: 9.5, marginTop: 4 }}>click the name for the full page</div>
    </>
  );
}

/** Mount once. Shows the card near the pointer; hides on leave, scroll or Escape. */
export function CardLayer() {
  const [st, setSt] = useState<{ symbol: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = (e: Event) => setSt((e as CustomEvent<{ symbol: string; x: number; y: number }>).detail);
    const hide = () => setSt(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setSt(null); };
    window.addEventListener("om:card", show); window.addEventListener("om:card:hide", hide); window.addEventListener("scroll", hide, true); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("om:card", show); window.removeEventListener("om:card:hide", hide); window.removeEventListener("scroll", hide, true); window.removeEventListener("keydown", key); };
  }, []);
  if (!st) return null;
  const W = 300, H = 330;
  const left = Math.min(st.x + 16, window.innerWidth - W - 12), top = st.y + 16 + H > window.innerHeight ? Math.max(8, st.y - H - 10) : st.y + 16;
  return (
    <div ref={box} className="ccard" style={{ left, top, width: W }} onMouseEnter={() => { /* keep open while over the card */ }} onMouseLeave={hideCard} onClick={() => openAsset(st.symbol)}>
      <CardBody symbol={st.symbol} />
    </div>
  );
}
