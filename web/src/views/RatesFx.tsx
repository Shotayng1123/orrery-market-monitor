import { Empty, Panel } from "../components/Panel";

export const RATES_SUBS = [
  { id: "fx", label: "FOREX" },
  { id: "curve", label: "CURVE" },
  { id: "tbd", label: "TBD" },
] as const;

export function RatesFxView({ sub, onSub }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const cur = RATES_SUBS.find((s) => s.id === sub) ?? RATES_SUBS[0];
  const toggle = (
    <div className="chips">
      <span className="lbl">View</span>
      {RATES_SUBS.map((s) => <span key={s.id} className={`chip-sm${s.id === cur.id ? " on" : ""}`} onClick={() => onSub(s.id)}>{s.label}</span>)}
    </div>
  );
  return (
    <>
      <div className="c12">{toggle}</div>
      {cur.id === "fx" && (
        <>
          <Panel no="01" title="MAJORS" span={8}><Empty title="FX panels">USD/JPY, EUR/USD, GBP/USD, AUD/USD, USD/CNH, USD/KRW, USD/SGD, EUR/JPY and DXY: level, change and σ bands, refreshed every minute.</Empty></Panel>
          <Panel no="02" title="CROSSES & TABLE" span={4}><Empty title="Cross table">Period returns per pair, as in the MARKET table.</Empty></Panel>
        </>
      )}
      {cur.id === "curve" && (
        <>
          <Panel no="01" title="US TREASURY CURVE" span={6} aux="treasury.gov daily par yields"><Empty title="Curve">Today&apos;s curve with a translucent curve from the selected period ago; 2s10s and 10s30s spreads.</Empty></Panel>
          <Panel no="02" title="JGB CURVE" span={6} aux="MOF daily reference yields"><Empty title="Curve">Same layout for Japan, 1Y to 40Y.</Empty></Panel>
          <Panel no="03" title="POLICY RATES" span={12}><Empty title="Central banks">Fed, BoJ, ECB, BoE, RBA, BoK, PBoC LPR, HKMA and MAS with the last change and the next meeting date, each linked to its source.</Empty></Panel>
        </>
      )}
      {cur.id === "tbd" && <Panel no="01" title="TBD" span={12}><Empty title="Reserved">Further rates and currency functions, to be defined.</Empty></Panel>}
    </>
  );
}
