import { useState } from "react";
import { Empty } from "../components/Panel";
import { CHART_PERIODS, type ChartPeriod } from "../components/ChartPanel";
import { CurveChart, shortTenor, spread } from "../components/CurveChart";
import { PolicyChart, type PolicyStep } from "../components/PolicyChart";
import { Pick } from "../components/Pick";
import { JumpPick, Screen, Section, Stat } from "../components/PhoneKit";
import { useApi } from "../lib/useApi";
import type { Curve, TableRow } from "../lib/types";
import { filterCurve } from "../lib/curveTenors";
import { fmtChg, fmtStampSafe, signCls } from "./shared";
import { InstrumentRow } from "./MarketPhone";
import { CURVE_ORDER, type PolicyRow } from "./RatesFx";

/** RATES & CURRENCY for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026): the pairs and the yields as lines
 *  that open to their charts, one yield curve at a time (picked from a list) with its spreads and tenors, and the
 *  policy rates as a chart and a line per central bank. */
const CURVE_NAMES: Record<string, string> = { US: "US Treasury", JP: "JGB", DE: "Germany Bund", EA: "Euro area AAA", EB: "Euro area, all ratings", GB: "UK Gilt", CA: "Canada", USB: "US T-bills" };

function CurveCard({ code, ago, tick }: { code: string; ago: ChartPeriod; tick: number }) {
  const bills = code === "USB";
  const a = ago === "1D" || ago === "1W" ? "1M" : ago;
  const d = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: bills ? "US" : code, ago: a }, Math.floor(tick / 30));
  const c = filterCurve(d.data?.current ?? null, bills ? "bills" : "std"), g = filterCurve(d.data?.ghost ?? null, bills ? "bills" : "std");
  if (!c) return <Empty title="No curve yet">{d.error ?? "Loads once the curves job has run."}</Empty>;
  const s210 = spread(c, 2, 10), s1030 = spread(c, 10, 30);
  return (
    <>
      <div className="mp-cap plain">{c.date} · dotted line: {g?.date ?? "–"} ({a} ago) · {c.source}</div>
      <div className="mp-chart"><CurveChart current={c} ghost={g} height={210} /></div>
      {!bills && (
        <div className="mp-grid in mp-in">
          <Stat k="2s10s" cls={signCls(s210)}>{fmtChg(s210, 0)}bp</Stat>
          <Stat k="10s30s" cls={signCls(s1030)}>{fmtChg(s1030, 0)}bp</Stat>
          <Stat k={`2s10s vs ${a} ago`}>{g ? `${fmtChg((s210 ?? 0) - (spread(g, 2, 10) ?? 0), 0)}bp` : "–"}</Stat>
        </div>
      )}
      <div className="mp-in"><table className="mp-t">
        <thead><tr><th>Tenor</th><th>Today</th><th>{a} ago</th><th>Change</th></tr></thead>
        <tbody>{c.points.map((p) => { const gv = g?.points.find((q) => q.tenor === p.tenor)?.yield ?? null, ch = p.yield != null && gv != null ? p.yield - gv : null; return <tr key={p.tenor}><td>{shortTenor(p.tenor)}</td><td>{p.yield == null ? "–" : p.yield.toFixed(3)}</td><td className="mut">{gv == null ? "–" : gv.toFixed(3)}</td><td className={signCls(ch)}>{ch == null ? "–" : fmtChg(ch, 1, true)}</td></tr>; })}</tbody>
      </table></div>
    </>
  );
}

export function RatesPhone({ tick }: { tick: number }) {
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  const [open, setOpen] = useState<string | null>(null);
  const [curve, setCurve] = useState("US");
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const list = useApi<{ rows: Array<{ country: string }> }>("curves", undefined, Math.floor(tick / 30));
  const pol = useApi<{ rows: PolicyRow[] }>("policy", undefined, Math.floor(tick / 30));
  const hist = useApi<{ rows: PolicyStep[]; sources: Record<string, string> }>("policy_history", undefined, Math.floor(tick / 30));
  const all = table.data?.rows ?? [];
  const fx = all.filter((r) => r.group === "fx").sort((a, b) => a.order - b.order), rates = all.filter((r) => r.group === "rates").sort((a, b) => a.order - b.order);
  const have = new Set((list.data?.rows ?? []).map((r) => r.country));
  const codes = [...CURVE_ORDER.filter((c) => have.has(c) || c === "US" || c === "JP"), "USB"];
  const banks = pol.data?.rows ?? [], steps = hist.data?.rows ?? [];
  const lines = (rows: TableRow[], none: string) => rows.length
    ? rows.map((r) => <InstrumentRow key={r.symbol} r={r} period={period} tick={tick} open={open === r.symbol} onToggle={() => setOpen(open === r.symbol ? null : r.symbol)} />)
    : <Empty title="Awaiting the data feed">{table.error ?? none}</Empty>;
  return (
    <Screen title="Rates & FX" sub={table.data ? <>as of {fmtStampSafe(table.data.asOf)}</> : table.error ? <span className="warn">{table.error}</span> : "loading…"}
      right={<Pick label="Change" value={period} options={CHART_PERIODS} onChange={setPeriod} title="The change shown on every line (bp for yields); the curve is compared with the same period ago, or one month for 1D and 1W" />}>
      <div className="mp-picks top"><JumpPick dep={`${fx.length}|${rates.length}`} /></div>
      <Section title="Currency" aux={`${fx.length} pairs`}>{lines(fx, "Pairs load with the market table.")}</Section>
      <Section title="Yields" aux={`${rates.length} instruments`}>{lines(rates, "Yields load with the market table.")}</Section>
      <Section title="Yield curve" aux={<Pick label="Curve" value={codes.includes(curve) ? curve : "US"} options={codes.map((c) => ({ value: c, label: CURVE_NAMES[c] ?? c }))} onChange={setCurve} />}>
        <CurveCard key={curve} code={codes.includes(curve) ? curve : "US"} ago={period} tick={tick} />
      </Section>
      <Section title="Policy rates" card={false}>
        <div className="mp-card pad mp-legacy">{steps.length ? <PolicyChart steps={steps} height={230} /> : <Empty title="No rate history yet">{hist.error ?? "Loads once the policy jobs have run."}</Empty>}</div>
        {steps.length > 0 && <p className="mp-note">Thirty years, a step on each change date. Tap a bank to hide or show its line.</p>}
        <div className="mp-card gap">
          {banks.length ? banks.map((r) => {
            const body = <>
              <span className="a"><span className="n"><b>{r.bank}</b> {r.name}</span><span className="s">{r.rateLabel}</span><span className="s">As of {r.asOf ?? "–"}</span><span className="s">Last change {r.lastChange ?? "–"}</span>{r.nextMeeting && <span className="s">Next meeting {r.nextMeeting}</span>}{r.sourceUrl && <span className="s src">Source: {new URL(r.sourceUrl).hostname}{r.sourceNote ? ` · ${r.sourceNote}` : ""} &#8250;</span>}</span>
              <span className="v">{r.rate == null ? "–" : r.bank === "FED" ? `${(r.rate - 0.25).toFixed(2)}–${r.rate.toFixed(2)}%` : `${r.rate.toFixed(2)}%`}</span>
            </>;
            return r.sourceUrl ? <a className="pl-row" key={r.bank} href={r.sourceUrl} target="_blank" rel="noreferrer">{body}</a> : <div className="pl-row" key={r.bank}>{body}</div>;
          }) : <Empty title="No policy rates loaded">{pol.error ?? "Loads once the policy jobs have run."}</Empty>}
        </div>
      </Section>
    </Screen>
  );
}
