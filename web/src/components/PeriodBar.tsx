import { CHART_PERIODS, type ChartPeriod } from "./ChartPanel";

/** The shared period selector with the σ-band controls and legend, used by every tab that draws charts. */
export function PeriodBar({ period, onPeriod, twoSigma, onTwoSigma, extra }: { period: ChartPeriod; onPeriod: (p: ChartPeriod) => void; twoSigma: boolean; onTwoSigma: (v: boolean) => void; extra?: React.ReactNode }) {
  return (
    <div className="chips" style={{ margin: "0 0 6px" }}>
      <span className="lbl">Period</span>
      {CHART_PERIODS.map((p) => <span key={p} className={`chip-sm${p === period ? " on" : ""}`} onClick={() => onPeriod(p)}>{p}</span>)}
      <span className="lbl" style={{ marginLeft: 14 }}>Bands</span>
      <span className="chip-sm on" title="Rolling mean ± 1σ over 21 / 252 / 756 trading days">±1σ</span>
      <span className={`chip-sm${twoSigma ? " on" : ""}`} onClick={() => onTwoSigma(!twoSigma)} title="Also draw ±2σ (fainter)">±2σ</span>
      <span className="legend" style={{ padding: 0, marginLeft: 14 }} title="Rolling mean and ±σ over 21 / 252 / 756 trading days; line style = window">
        <span><span className="sw s1" />±1σ</span>
        <span><span className="sw s2" />±2σ</span>
        <span><span className="sw mean" />mean</span>
        <span className="mut" style={{ marginLeft: 6 }}>1M ──  12M ╌╌  36M ····</span>
      </span>
      {extra}
    </div>
  );
}
