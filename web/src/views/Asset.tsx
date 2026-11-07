import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import type { SigmaWindow } from "../components/SigmaChart";
import { money, StatementSummary, type AssetLite, type StatementRow } from "../components/CompanyCard";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";
import type { MarketId } from "../lib/sessions";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp } from "../lib/time";

interface AssetFull extends AssetLite { adv10d: number | null; series: unknown }

const marketOf = (symbol: string): MarketId => (/\.T$/.test(symbol) ? "TSE" : /\.KS$/.test(symbol) ? "KRX" : /\.HK$/.test(symbol) ? "HKEX" : /\.SS$|\.SZ$/.test(symbol) ? "SSE" : /\.L$/.test(symbol) ? "LSE" : /\.SI$/.test(symbol) ? "SGX" : "NYSE");

function StatementTable({ rows, title, ccy }: { rows: StatementRow[]; title: string; ccy: string | null }) {
  if (!rows.length) return null;
  const has = (k: keyof StatementRow) => rows.some((r) => r[k] != null);
  return (
    <>
      <div className="minih" style={{ marginTop: 8 }}>{title}{ccy ? ` · ${ccy}` : ""}</div>
      <table className="secT">
        <thead><tr><th className="l">Line</th>{rows.map((r) => <th key={r.period}>{r.label.replace(/^FY /, "")}</th>)}</tr></thead>
        <tbody>
          <tr><td className="l">Revenue</td>{rows.map((r) => <td key={r.period} className="num">{money(r.revenue)}</td>)}</tr>
          <tr><td className="l">Operating income</td>{rows.map((r) => <td key={r.period} className="num">{money(r.op)}</td>)}</tr>
          <tr><td className="l">Net income</td>{rows.map((r) => <td key={r.period} className="num">{money(r.ni)}</td>)}</tr>
          <tr><td className="l">EPS</td>{rows.map((r) => <td key={r.period} className="num">{r.eps == null ? "–" : fmtNum(r.eps, 2)}</td>)}</tr>
          {has("assets") && <tr><td className="l">Total assets</td>{rows.map((r) => <td key={r.period} className="num">{money(r.assets)}</td>)}</tr>}
          {has("equity") && <tr><td className="l">Equity</td>{rows.map((r) => <td key={r.period} className="num">{money(r.equity)}</td>)}</tr>}
          {has("cfo") && <tr><td className="l">Operating cash flow</td>{rows.map((r) => <td key={r.period} className="num">{money(r.cfo)}</td>)}</tr>}
          {has("cfi") && <tr><td className="l">Investing cash flow</td>{rows.map((r) => <td key={r.period} className="num">{money(r.cfi)}</td>)}</tr>}
          {has("cff") && <tr><td className="l">Financing cash flow</td>{rows.map((r) => <td key={r.period} className="num">{money(r.cff)}</td>)}</tr>}
          {has("fcf") && <tr><td className="l">Free cash flow</td>{rows.map((r) => <td key={r.period} className="num">{money(r.fcf)}</td>)}</tr>}
        </tbody>
      </table>
    </>
  );
}

/** Single-asset page (#asset/SYMBOL): chart in the tile grammar, quote and liquidity, short data, statements. */
export function AssetView({ symbol, tick }: { symbol: string; tick: number }) {
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const a = useApi<AssetFull>(symbol ? "asset" : null, { symbol, lite: 1 }, Math.floor(tick / 5));   // quote and statements every five minutes; the chart refreshes each minute
  const d = a.data;
  if (!symbol) return <Panel no="01" title="ASSET" span={12}><Empty title="No symbol">Use the search box at the top right.</Empty></Panel>;
  if (!d) return <Panel no="01" title={symbol.toUpperCase()} span={12}>{a.error ? <Empty title="Not found">{a.error}</Empty> : <Empty title="Loading">{symbol}</Empty>}</Panel>;
  const row: TableRow = { symbol: d.symbol, name: d.name, cls: "Equities", market: marketOf(d.symbol), currency: d.currency ?? "", decimals: d.price != null && d.price >= 1000 ? 0 : 2, group: "equity", order: 0, last: d.price, lastAt: d.asOf, live: false, closes: { d1: d.prevClose }, closeDates: {}, pct: { d1: d.pct } };
  const st = d.statements;
  const f = st?.forecast;
  return (
    <>
      <div className="c12"><PeriodBar period={period} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} /></div>
      <Panel no="01" title={d.name.toUpperCase()} span={8} aux={<>{d.symbol}{d.exchange ? ` · ${d.exchange}` : ""}{d.sector ? ` · ${d.sector}` : ""}{d.industry ? ` · ${d.industry}` : ""} · Yahoo Finance</>}>
        <div className="bigwrap"><ChartPanel row={row} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes /></div>
      </Panel>
      <Panel no="02" title="QUOTE" span={4} aux={d.asOf ? `as of ${fmtStamp(d.asOf)}` : ""}>
        <div className="krow">
          <span><span className="k">Last</span><span className="v">{fmtNum(d.price, row.decimals)}</span></span>
          <span><span className="k">Day</span><span className={`v ${signCls(d.pct)}`}>{fmtPct(d.pct, 2)}</span></span>
          <span><span className="k">Market cap</span><span className="v">{money(d.mcap, d.currency)}</span></span>
        </div>
        <table className="secT"><tbody>
          <tr><td className="l">Previous close</td><td className="num">{fmtNum(d.prevClose, row.decimals)}</td></tr>
          <tr><td className="l">Volume</td><td className="num">{d.volume == null ? "–" : fmtNum(d.volume, 0)}</td></tr>
          <tr><td className="l">ADTV 3M</td><td className="num">{d.adv3m == null ? "–" : fmtNum(d.adv3m, 0)}</td></tr>
          <tr><td className="l">ADTV 10D</td><td className="num">{d.adv10d == null ? "–" : fmtNum(d.adv10d, 0)}</td></tr>
          <tr><td className="l">Volume / ADTV 3M</td><td className="num">{d.volume != null && d.adv3m ? `${Math.round((d.volume / d.adv3m) * 100)}%` : "–"}</td></tr>
          <tr><td className="l">Turnover (day)</td><td className="num">{d.volume != null && d.price != null ? money(d.volume * d.price, d.currency) : "–"}</td></tr>
        </tbody></table>
        <div className="minih" style={{ marginTop: 8 }}>Short data</div>
        {d.short ? d.short.kind === "finra" ? (
          <table className="secT"><tbody><tr><td className="l">FINRA short-volume share · {d.short.d}</td><td className="num">{(d.short.ratio * 100).toFixed(0)}%</td></tr></tbody></table>
        ) : (
          <table className="secT"><tbody>
            <tr><td className="l"><b>Reported short positions (≥0.5%) · {d.short.d}</b></td><td className="num"><b>{(d.short.ratio * 100).toFixed(2)}%</b></td></tr>
            {d.short.holders.slice(0, 8).map((h) => <tr key={h.holder}><td className="l mut">{h.holder}<span className="mut"> · {h.d}</span></td><td className="num">{(h.ratio * 100).toFixed(2)}%</td></tr>)}
          </tbody></table>
        ) : <div className="mut" style={{ fontSize: 10.5 }}>none for this market</div>}
      </Panel>
      <Panel no="03" title="STATEMENTS" span={12} aux={st?.source ? <>{st.source === "edinetdb" ? "EDINET DB (有価証券報告書 · 決算短信)" : "Yahoo Finance fundamentals"}{st.asOf ? ` · fetched ${st.asOf}` : ""}</> : ""}>
        {st && (st.annual.length || st.quarterly.length) ? (
          <div className="msg2">
            <div>
              <StatementTable rows={st.annual} title="Annual" ccy={st.currency} />
              {f && (
                <>
                  <div className="minih" style={{ marginTop: 8 }}>Company guidance · FY ending {f.fiscalYearEnd ?? "–"}{f.disclosed ? ` · disclosed ${f.disclosed}` : ""}</div>
                  <table className="secT"><tbody>
                    <tr><td className="l">Revenue</td><td className="num">{money(f.revenue)}</td><td className="l">Operating income</td><td className="num">{money(f.op)}</td></tr>
                    <tr><td className="l">Net income</td><td className="num">{money(f.ni)}</td><td className="l">EPS / DPS</td><td className="num">{f.eps == null ? "–" : fmtNum(f.eps, 2)} / {f.dps == null ? "–" : fmtNum(f.dps, 2)}</td></tr>
                  </tbody></table>
                </>
              )}
            </div>
            <div><StatementTable rows={st.quarterly} title={st.source === "edinetdb" ? "Quarterly (決算短信, year to date)" : "Quarterly"} ccy={st.currency} /></div>
          </div>
        ) : <Empty title="No statements">{st?.note ?? "Statements are available for equities only."}</Empty>}
        <div style={{ display: "none" }}><StatementSummary st={st} ccy={d.currency} /></div>
      </Panel>
    </>
  );
}
