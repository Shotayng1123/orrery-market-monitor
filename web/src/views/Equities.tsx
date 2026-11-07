import { Empty, Panel } from "../components/Panel";

export const INDICES = [
  { id: "topix", label: "TOPIX", symbol: "1306.T", proxy: true, note: "1306.T ETF stands in for the index intraday; official JPX close for daily figures" },
  { id: "nk225", label: "NIKKEI 225", symbol: "^N225" },
  { id: "spx", label: "S&P 500", symbol: "^GSPC" },
  { id: "ixic", label: "NASDAQ COMP", symbol: "^IXIC" },
  { id: "kospi", label: "KOSPI", symbol: "^KS11" },
  { id: "hsi", label: "HANG SENG", symbol: "^HSI" },
  { id: "sse", label: "SHANGHAI COMP", symbol: "000001.SS" },
] as const;
export type IndexId = (typeof INDICES)[number]["id"];

export function EquitiesView({ sub, onSub }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const ix = INDICES.find((i) => i.id === sub) ?? INDICES[1];
  const toggle = (
    <div className="chips">
      <span className="lbl">Index</span>
      {INDICES.map((i) => <span key={i.id} className={`chip-sm${i.id === ix.id ? " on" : ""}`} onClick={() => onSub(i.id)}>{i.label}</span>)}
    </div>
  );
  const draft = <span className="badge est" title="Shota will refine these panels later">DRAFT</span>;
  return (
    <>
      <div className="c12">{toggle}</div>
      <Panel no="01" title={ix.label} span={8} aux={<>{ix.symbol}{"proxy" in ix && ix.proxy && <span className="badge proxy" title={ix.note}>PROXY</span>}{draft}</>}>
        <Empty title="Index chart">Price with rolling 1M / 12M / 36M σ bands and the shared period selector, as on the MARKET tab.</Empty>
      </Panel>
      <Panel no="02" title="SUPPORTING" span={4} aux={draft}>
        <Empty title="Supporting charts">Futures basis, sector ETFs, breadth and volatility in small panels.</Empty>
      </Panel>
      <Panel no="03" title="MARKET BREADTH" span={4} aux={draft}><Empty title="Breadth">Advance/decline, % of constituents above the 50- and 200-day averages, new highs and lows.</Empty></Panel>
      <Panel no="04" title="SHORT INTEREST" span={4} aux={draft}><Empty title="Short interest">JPX short-selling ratio for Japan; FINRA short interest for US names. Sources to be wired.</Empty></Panel>
      <Panel no="05" title="SECTOR PERFORMANCE" span={4} aux={draft}><Empty title="Sectors">1D to 12M by sector, from sector ETFs or constituents.</Empty></Panel>
      <Panel no="06" title="MOVERS" span={6} aux={draft}><Empty title="Movers">Top and bottom constituents by 1D %, with turnover.</Empty></Panel>
      <Panel no="07" title="HEAT MAP" span={6} aux={draft}><Empty title="Heat map">Constituents by sector, coloured by 1D %.</Empty></Panel>
      <Panel no="08" title="SCREENER" span={12} aux={draft}><Empty title="Screener">Constituent table with filters on return, distance to averages, σ position and turnover.</Empty></Panel>
    </>
  );
}
