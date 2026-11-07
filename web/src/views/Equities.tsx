import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";

export const INDICES = [
  { id: "topix", label: "TOPIX", symbol: "1306.T", support: ["^N225", "NKD=F", "USDJPY=X", "JGB10Y"] },
  { id: "nk225", label: "NIKKEI 225", symbol: "^N225", support: ["NKD=F", "1306.T", "USDJPY=X", "^SOX"] },
  { id: "spx", label: "S&P 500", symbol: "^GSPC", support: ["ES=F", "^VIX", "^TNX", "DX-Y.NYB"] },
  { id: "ixic", label: "NASDAQ COMP", symbol: "^IXIC", support: ["NQ=F", "^SOX", "^VIX", "^TNX"] },
  { id: "kospi", label: "KOSPI", symbol: "^KS11", support: ["KRW=X", "^SOX", "^TWII", "^GSPC"] },
  { id: "hsi", label: "HANG SENG", symbol: "^HSI", support: ["000001.SS", "CNH=X", "^GSPC", "^TNX"] },
  { id: "sse", label: "SHANGHAI COMP", symbol: "000001.SS", support: ["^HSI", "CNH=X", "HG=F", "^GSPC"] },
] as const;
export type IndexId = (typeof INDICES)[number]["id"];

export function EquitiesView({ sub, onSub, tick }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const ix = INDICES.find((i) => i.id === sub) ?? INDICES[1];
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [twoSigma, setTwoSigma] = useState(false);
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const rows = table.data?.rows ?? [];
  const main = rows.find((r) => r.symbol === ix.symbol);
  const support = ix.support.map((s) => rows.find((r) => r.symbol === s)).filter((r): r is TableRow => !!r);
  const toggle = (
    <div className="chips">
      <span className="lbl">Index</span>
      {INDICES.map((i) => <span key={i.id} className={`chip-sm${i.id === ix.id ? " on" : ""}`} onClick={() => onSub(i.id)}>{i.label}</span>)}
    </div>
  );
  const draft = <span className="badge est" title="Layout draft; Shota will refine these panels later">DRAFT</span>;
  return (
    <>
      <div className="c12">{toggle}<PeriodBar period={period} onPeriod={setPeriod} twoSigma={twoSigma} onTwoSigma={setTwoSigma} /></div>
      <Panel no="01" title={ix.label} span={8} aux={<>{ix.symbol}{main?.proxyFor && <span className="badge proxy" title="1306.T ETF stands in for the index intraday; official JPX close for daily figures">PROXY</span>}</>}>
        {main ? <ChartPanel row={main} period={period} tick={tick} twoSigma={twoSigma} height={340} /> : <Empty title="Awaiting the data feed">{table.error ?? "The index chart loads with the market table."}</Empty>}
      </Panel>
      <Panel no="02" title="SUPPORTING" span={4} aux={`${support.length} panels`}>
        {support.length ? <div className="cgrid one">{support.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} twoSigma={twoSigma} height={120} />)}</div> : <Empty title="Supporting charts">Futures, FX, rates and volatility that drive this index.</Empty>}
      </Panel>
      <Panel no="03" title="MARKET BREADTH" span={4} aux={draft}><Empty title="Breadth">Advance/decline, % of constituents above the 50- and 200-day averages, new highs and lows. From the daily constituents job.</Empty></Panel>
      <Panel no="04" title="SHORT INTEREST" span={4} aux={draft}><Empty title="Short interest">JPX short-selling ratio for Japan; FINRA short interest for US names. Sources to be wired.</Empty></Panel>
      <Panel no="05" title="SECTOR PERFORMANCE" span={4} aux={draft}><Empty title="Sectors">1D to 12M by sector, from sector ETFs or constituents.</Empty></Panel>
      <Panel no="06" title="MOVERS" span={6} aux={draft}><Empty title="Movers">Top and bottom constituents by 1D %, with turnover.</Empty></Panel>
      <Panel no="07" title="HEAT MAP" span={6} aux={draft}><Empty title="Heat map">Constituents by sector, coloured by 1D %.</Empty></Panel>
      <Panel no="08" title="SCREENER" span={12} aux={draft}><Empty title="Screener">Constituent table with filters on return, distance to averages, σ position and turnover.</Empty></Panel>
    </>
  );
}
