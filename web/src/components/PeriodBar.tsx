import { CHART_PERIODS, type ChartPeriod } from "./ChartPanel";
import type { SigmaWindow } from "./SigmaChart";
import { Pick } from "./Pick";

const WINDOWS: Array<{ k: SigmaWindow; label: string; days: number }> = [{ k: "m1", label: "1M", days: 21 }, { k: "m12", label: "12M", days: 252 }, { k: "m36", label: "36M", days: 756 }];

/** The shared period selector with the σ-window selector and legend, used by every tab that draws charts. A stock's
 *  page passes its longer list (5Y and 10Y, lib/periods.ts ASSET_PERIODS). */
export function PeriodBar({ period, onPeriod, sigmaWindow, onSigmaWindow, extra, periods = CHART_PERIODS }: { period: ChartPeriod; onPeriod: (p: ChartPeriod) => void; sigmaWindow: SigmaWindow; onSigmaWindow: (w: SigmaWindow) => void; extra?: React.ReactNode; periods?: ChartPeriod[] }) {
  return (
    <div className="chips" style={{ margin: "0 0 6px" }}>
      <Pick label="Period" value={period} options={periods} onChange={onPeriod} />
      <Pick label="σ window" value={sigmaWindow} options={WINDOWS.map((w) => ({ value: w.k, label: w.label }))} onChange={onSigmaWindow} title={`Rolling window for the mean and σ bands, in trading days: ${WINDOWS.map((w) => `${w.label} = ${w.days}`).join(", ")}`} />
      <span className="legend" style={{ padding: 0, marginLeft: 8 }} title="Rolling mean, ±1σ and ±2σ of daily closes over the selected window">
        <span><span className="sw mean" />mean</span>
        <span><span className="sw s1" />±1σ</span>
        <span><span className="sw s2" />±2σ</span>
      </span>
      {extra}
    </div>
  );
}
