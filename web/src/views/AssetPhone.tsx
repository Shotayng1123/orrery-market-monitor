import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Empty } from "../components/Panel";
import { ChartPanel, CHART_PERIODS, type ChartPeriod } from "../components/ChartPanel";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick, type PickOption } from "../components/Pick";
import { Star } from "../components/Star";
import { money } from "../components/CompanyCard";
import { Section, Stat } from "../components/PhoneKit";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp } from "../lib/time";
import { marketOf, StatementTable, type AssetFull } from "./Asset";

/** A stock's own page for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026): the price and its change over the
 *  period picked, the chart, the quote and liquidity figures, short data and the statements. */
const WINDOWS: PickOption<SigmaWindow>[] = [{ value: "m1", label: "1M" }, { value: "m12", label: "12M" }, { value: "m36", label: "36M" }];
/** A table wider than the card scrolls sideways inside it, and opens at its right end: the latest periods. */
function Wide({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, []);
  return <div className="mp-xs" ref={box}>{children}</div>;
}
const back = () => { if (history.length > 1) history.back(); else location.hash = "market"; };

export function AssetPhone({ symbol, tick }: { symbol: string; tick: number }) {
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const a = useApi<AssetFull>(symbol ? "asset" : null, { symbol, lite: 1 }, Math.floor(tick / 5));
  const d = a.data && a.data.symbol ? a.data : null;
  const backBtn = <button type="button" className="mp-back" onClick={back}>&#8249; Back</button>;
  if (!d) return (
    <div className="mp"><header className="mp-head doc">{backBtn}</header>
      <div className="mp-card gap">{!symbol ? <Empty title="No symbol">Use the search button at the top.</Empty> : a.error ? <Empty title="Not found">{a.error}</Empty> : <Empty title="Loading">{symbol}</Empty>}</div>
    </div>
  );
  const dec = d.price != null && d.price >= 1000 ? 0 : 2;
  const row: TableRow = { symbol: d.symbol, name: d.name, cls: "Equities", market: marketOf(d.symbol), currency: d.currency ?? "", decimals: dec, group: "equity", order: 0, last: d.price, lastAt: d.asOf, live: false, closes: { d1: d.prevClose }, closeDates: {}, pct: { d1: d.pct } };
  const st = d.statements, f = st?.forecast;
  return (
    <div className="mp">
      <header className="mp-head doc">{backBtn}<Star symbol={d.symbol} name={d.name} /></header>
      <div className="mp-doc asset">
        <div className="meta"><span>{d.symbol}</span>{d.exchange && <span>{d.exchange}</span>}{d.sector && <span>{d.sector}</span>}{d.currency && <span>{d.currency}</span>}</div>
        <h1>{d.name}</h1>
      </div>
      <div className="mp-picks">
        <Pick label="Period" value={period} options={CHART_PERIODS} onChange={setPeriod} />
        <Pick label="σ window" value={sigmaWindow} options={WINDOWS} onChange={setSigmaWindow} />
      </div>
      <div className="mp-card pad mp-hero"><ChartPanel row={row} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes /></div>
      <Section title="Quote" aux={d.asOf ? `as of ${fmtStamp(d.asOf)}` : ""} card={false}>
        <div className="mp-card pad">
          <div className="mp-grid in">
            <Stat k="Day" cls={signCls(d.pct)}>{fmtPct(d.pct, 2)}</Stat>
            <Stat k="Previous close">{fmtNum(d.prevClose, dec)}</Stat>
            <Stat k="Market cap">{money(d.mcap, d.currency)}</Stat>
          </div>
          <table className="mp-t left kv"><tbody>
            <tr><td>Volume</td><td>{d.volume == null ? "–" : fmtNum(d.volume, 0)}</td></tr>
            <tr><td>Average daily volume, 3 months</td><td>{d.adv3m == null ? "–" : fmtNum(d.adv3m, 0)}</td></tr>
            <tr><td>Average daily volume, 10 days</td><td>{d.adv10d == null ? "–" : fmtNum(d.adv10d, 0)}</td></tr>
            <tr><td>Volume against the 3-month average</td><td>{d.volume != null && d.adv3m ? `${Math.round((d.volume / d.adv3m) * 100)}%` : "–"}</td></tr>
            <tr><td>Turnover (day)</td><td>{d.volume != null && d.price != null ? money(d.volume * d.price, d.currency) : "–"}</td></tr>
          </tbody></table>
        </div>
      </Section>
      <Section title="Short data" card={false}>
        <div className="mp-card pad">
          {d.short ? (
            <table className="mp-t left kv"><tbody>
              {d.short.kind === "finra"
                ? <tr><td>FINRA short-volume share · {d.short.d}</td><td>{(d.short.ratio * 100).toFixed(0)}%</td></tr>
                : <><tr><td><b>Reported short positions (≥0.5%) · {d.short.d}</b></td><td><b>{(d.short.ratio * 100).toFixed(2)}%</b></td></tr>{d.short.holders.slice(0, 8).map((h) => <tr key={h.holder}><td>{h.holder} · {h.d}</td><td>{(h.ratio * 100).toFixed(2)}%</td></tr>)}</>}
            </tbody></table>
          ) : <Empty title="No short data">None reported for this name.</Empty>}
        </div>
      </Section>
      <Section title="Statements" aux={st?.source ? (st.source === "edinetdb" ? "EDINET DB" : "Yahoo Finance") : ""} card={false}>
        <div className="mp-card pad mp-legacy">
          {st && (st.annual.length || st.quarterly.length) ? (
            <>
              <Wide><StatementTable rows={st.annual} title="Annual" ccy={st.currency} /></Wide>
              {f && <>
                <div className="minih">Company guidance · FY ending {f.fiscalYearEnd ?? "–"}{f.disclosed ? ` · disclosed ${f.disclosed}` : ""}</div>
                <table className="secT"><tbody>
                  <tr><td className="l">Revenue</td><td className="num">{money(f.revenue)}</td></tr><tr><td className="l">Operating income</td><td className="num">{money(f.op)}</td></tr>
                  <tr><td className="l">Net income</td><td className="num">{money(f.ni)}</td></tr><tr><td className="l">EPS / DPS</td><td className="num">{f.eps == null ? "–" : fmtNum(f.eps, 2)} / {f.dps == null ? "–" : fmtNum(f.dps, 2)}</td></tr>
                </tbody></table>
              </>}
              <Wide><StatementTable rows={st.quarterly} title={st.source === "edinetdb" ? "Quarterly (決算短信, year to date)" : "Quarterly"} ccy={st.currency} /></Wide>
              <p className="mp-note in">Latest periods first in view; swipe a table sideways for the earlier ones.</p>
            </>
          ) : <Empty title="No statements">{st?.note ?? "Statements are available for equities only."}</Empty>}
        </div>
      </Section>
    </div>
  );
}
