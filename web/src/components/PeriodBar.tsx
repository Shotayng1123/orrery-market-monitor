import { CHART_PERIODS, type ChartPeriod } from "./ChartPanel";
import type { SigmaWindow } from "./SigmaChart";

const WINDOWS: Array<{ k: SigmaWindow; label: string; days: number }> = [{ k: "m1", label: "1M", days: 21 }, { k: "m12", label: "12M", days: 252 }, { k: "m36", label: "36M", days: 756 }];

/** The shared period selector with the σ-window selector and legend, used by every tab that draws charts. */
export function PeriodBar({ period, onPeriod, sigmaWindow, onSigmaWindow, extra }: { period: ChartPeriod; onPeriod: (p: ChartPeriod) => void; sigmaWindow: SigmaWindow; onSigmaWindow: (w: SigmaWindow) => void; extra?: React.ReactNode }) {
  return (
    <div className="chips" style={{ margin: "0 0 6px" }}>
      <span className="lbl">Period</span>
      {CHART_PERIODS.map((p) => <span key={p} className={`chip-sm${p === period ? " on" : ""}`} onClick={() => onPeriod(p)}>{p}</span>)}
      <span className="lbl" style={{ marginLeft: 14 }}>σ window</span>
      {WINDOWS.map((w) => <span key={w.k} className={`chip-sm${w.k === sigmaWindow ? " on" : ""}`} onClick={() => onSigmaWindow(w.k)} title={`rolling ${w.days} trading days`}>{w.label}</span>)}
      <span className="legend" style={{ padding: 0, marginLeft: 14 }} title="Rolling mean, ±1σ and ±2σ of daily closes over the selected window">
        <span><span className="sw mean" />mean</span>
        <span><span className="sw s1" />±1σ</span>
        <span><span className="sw s2" />±2σ</span>
      </span>
      {extra}
    </div>
  );
}
