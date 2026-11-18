import { useState, type ReactNode } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import type { SigmaWindow } from "../components/SigmaChart";
import { money } from "../components/CompanyCard";
import { FinTable } from "../components/FinTable";
import { Star } from "../components/Star";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";
import type { MarketId } from "../lib/sessions";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp } from "../lib/time";
import { finSections, fmtCount, fmtPc, fmtX, type Fin, type StockPage } from "../lib/stock";
import { AssetViewLegacy } from "./AssetLegacy";

export const marketOf = (symbol: string): MarketId => (/\.T$/.test(symbol) ? "TSE" : /\.KS$/.test(symbol) ? "KRX" : /\.HK$/.test(symbol) ? "HKEX" : /\.SS$|\.SZ$/.test(symbol) ? "SSE" : /\.L$/.test(symbol) ? "LSE" : /\.SI$/.test(symbol) ? "SGX" : "NYSE");
export const decimalsOf = (price: number | null): number => (price != null && price >= 1000 ? 0 : 2);
/** The row the chart tile wants, made from the stock's quote. */
export const chartRow = (d: StockPage): TableRow => ({ symbol: d.symbol, name: d.name, cls: "Equities", market: marketOf(d.symbol), currency: d.currency ?? "", decimals: decimalsOf(d.price), group: "equity", order: 0, last: d.price, lastAt: d.asOf, live: false, closes: { d1: d.prevClose }, closeDates: {}, pct: { d1: d.pct } });

/** What the short figure is, in a few words, by its source. */
export function shortLine(d: StockPage): { label: string; value: string; title: string } {
  const s = d.short;
  if (!s) return { label: "Short interest", value: "–", title: "No short data reported for this name" };
  if (s.kind === "jpx") return { label: "Short interest (reported)", value: `${(s.ratio * 100).toFixed(2)}%${s.daysToCover != null ? ` · ${s.daysToCover.toFixed(1)}d` : ""}`, title: `Sum of the short positions of 0.5% of shares or more reported to the exchange, as of ${s.d}; smaller positions are not disclosed. Days = those shares over the 60-session average volume.` };
  if (s.kind === "interest") return { label: "Short interest", value: s.shares == null ? "–" : `${fmtCount(s.shares)}${s.pctFloat != null ? ` · ${s.pctFloat.toFixed(1)}% of float` : ""}`, title: `Shares sold short as of ${s.d ?? "–"} (exchange-reported, twice a month; via Yahoo Finance)` };
  return { label: "Short volume share", value: `${(s.ratio * 100).toFixed(0)}%`, title: `FINRA: the share of the day's reported volume that was sold short, ${s.d}. This is not short interest.` };
}

export function GuidanceLine({ f }: { f: Fin }) {
  const g = f.guidance;
  if (!g) return null;
  const fc = f.annual.periods.find((p) => p.kind === "FC");
  const parts = (["revenue", "op", "ordinary", "ni"] as const).filter((k) => g.progress[k] != null).map((k) => `${{ revenue: "revenue", op: "operating profit", ordinary: "ordinary profit", ni: "net income" }[k]} ${fmtPc(g.progress[k])}`);
  return (
    <div className="finguide">
      <b>Company guidance{fc ? ` · ${fc.label}` : ""}</b>{g.disclosed ? ` · disclosed ${g.disclosed}` : ""}
      {parts.length > 0 && g.ytdMonths != null && <> · after {g.ytdMonths} months of the year: {parts.join(", ")} of the full-year figure</>}
    </div>
  );
}

function KV({ k, children, title, cls }: { k: ReactNode; children: ReactNode; title?: string; cls?: string }) {
  return <tr title={title}><td className="l">{k}</td><td className={`num${cls ? ` ${cls}` : ""}`}>{children}</td></tr>;
}

/** Single-asset page (#asset/SYMBOL; Shota, 18 Nov 2026): the chart with its σ corridors and volume, the key
 *  figures a portfolio manager checks first, the price change over each horizon against the benchmark, short
 *  interest, and the statements for ten years with guidance, or the last twelve single quarters. */
export function AssetView({ symbol, tick }: { symbol: string; tick: number }) {
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [view, setView] = useState<"annual" | "quarterly">("annual");
  const a = useApi<StockPage>(symbol ? "stock" : null, { symbol }, Math.floor(tick / 5));   // the figures every five minutes; the chart refreshes each minute
  if (a.error === "unknown action") return <AssetViewLegacy symbol={symbol} tick={tick} />;   // a server from before this page
  const d = a.data && a.data.symbol ? a.data : null;
  if (!symbol) return <Panel no="01" title="ASSET" span={12}><Empty title="No symbol">Use the search box at the top right.</Empty></Panel>;
  if (!d) return <Panel no="01" title={symbol.toUpperCase()} span={12}>{a.error ? <Empty title="Not found">{a.error}</Empty> : <Empty title="Loading">{symbol}</Empty>}</Panel>;
  const row = chartRow(d), dec = row.decimals, ccy = d.currency;
  const f = d.fin, sh = shortLine(d), s = d.short;
  const fs = f ? finSections(f, view) : null;
  const bms = d.benchmarks, title = bms.map((b) => b.name).join(" AND ");
  const pp = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace("-", "\u2212")}`);
  return (
    <>
      <div className="c12"><PeriodBar period={period} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} /></div>
      <Panel no="01" title={d.name.toUpperCase()} span={8} aux={<><Star symbol={d.symbol} name={d.name} /> {d.symbol}{d.exchange ? ` · ${d.exchange}` : ""}{d.sector ? ` · ${d.sector}` : ""}{d.industry ? ` · ${d.industry}` : ""}{d.indices.length ? ` · ${d.indices.join(", ")}` : ""} · Yahoo Finance</>}>
        <div className="bigwrap"><ChartPanel row={row} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes volume /></div>
      </Panel>
      <Panel no="02" title="KEY DATA" span={4} aux={d.asOf ? `as of ${fmtStamp(d.asOf)}` : ""}>
        <div className="krow">
          <span><span className="k">Last</span><span className="v">{fmtNum(d.price, dec)}</span></span>
          <span><span className="k">Day</span><span className={`v ${signCls(d.pct)}`}>{fmtPct(d.pct, 2)}</span></span>
          <span><span className="k">Market cap</span><span className="v" id="st-mcap">{money(d.mcap, ccy)}</span></span>
        </div>
        <table className="secT kvT" id="st-key"><tbody>
          <KV k="Previous close · open">{fmtNum(d.prevClose, dec)} · {fmtNum(d.open, dec)}</KV>
          <KV k="Day's range">{fmtNum(d.low, dec)} – {fmtNum(d.high, dec)}</KV>
          <KV k="Shares outstanding" title={[d.shares.source, d.shares.asOf ? `as of ${d.shares.asOf}` : null, d.shares.treasury != null ? `of which treasury shares ${fmtCount(d.shares.treasury)}` : null].filter(Boolean).join(" · ")}>{fmtCount(d.shares.outstanding)}</KV>
          <KV k="Diluted shares" title={d.shares.dilutedNote ?? undefined}>{fmtCount(d.shares.diluted)}</KV>
          <KV k="ADTV, 60 sessions" title="Average daily volume over the 60 sessions before the latest, and the same in value (volume times each day's close)">{fmtCount(d.turnover.d60.shares)} · {money(d.turnover.d60.value, ccy)}</KV>
          <KV k="ADTV, 20 sessions">{fmtCount(d.turnover.d20.shares)} · {money(d.turnover.d20.value, ccy)}</KV>
          <KV k="Volume today / 60-session ADTV">{d.volume == null ? "–" : fmtCount(d.volume)}{d.volume != null && d.turnover.d60.shares ? ` · ${Math.round((d.volume / d.turnover.d60.shares) * 100)}%` : ""}</KV>
          <KV k={sh.label} title={sh.title}>{sh.value}</KV>
          <KV k="52-week range" title={`Low ${d.range.loDate ?? "–"}, high ${d.range.hiDate ?? "–"}`}>
            <span className="rng"><span>{fmtNum(d.range.lo, dec)}</span><span className="bar">{d.range.pos != null && <i style={{ left: `${d.range.pos}%` }} />}</span><span>{fmtNum(d.range.hi, dec)}</span></span>
          </KV>
          <KV k="From 52-week high / low">{<><span className={signCls(d.range.fromHi)}>{fmtPc(d.range.fromHi, true)}</span> / <span className={signCls(d.range.fromLo)}>{fmtPc(d.range.fromLo, true)}</span></>}</KV>
          <KV k="Volatility, 1M / 3M / 12M" title="Standard deviation of daily log returns over 21, 63 and 252 sessions, as a yearly figure">{fmtPc(d.vol.m1, false, 0)} / {fmtPc(d.vol.m3, false, 0)} / {fmtPc(d.vol.m12, false, 0)}</KV>
          {bms.map((b, k) => <KV key={b.symbol} k={`Beta vs ${b.name}, 12M`} title={`From daily returns over the last ${d.beta[k]?.days ?? 0} sessions on which both traded; correlation ${d.beta[k]?.corr == null ? "–" : d.beta[k].corr!.toFixed(2)}`}>{d.beta[k]?.beta == null ? "–" : d.beta[k].beta!.toFixed(2)}</KV>)}
          <KV k="Largest fall, 12M" title={d.drawdown.from ? `From the close of ${d.drawdown.from} to that of ${d.drawdown.to}` : undefined} cls={signCls(d.drawdown.pct)}>{fmtPc(d.drawdown.pct)}</KV>
          <KV k="P/E, last year / guidance" title={d.val.basis ?? undefined}>{fmtX(d.val.pe)} / {fmtX(d.val.peGuide)}</KV>
          <KV k="P/B" title={d.val.basis ?? undefined}>{fmtX(d.val.pb, 2)}</KV>
          <KV k="Dividend yield, last year / guidance" title={d.val.basis ?? undefined}>{fmtPc(d.val.yield, false, 2)} / {fmtPc(d.val.yieldGuide, false, 2)}</KV>
          <KV k="Next earnings" title={d.earningsEst ? "Estimated by Yahoo Finance; not confirmed by the company" : undefined}>{d.earningsAt ? `${fmtStamp(d.earningsAt)}${d.earningsEst ? " (est.)" : ""}` : "–"}</KV>
        </tbody></table>
      </Panel>
      <Panel no="03" title={`PERFORMANCE VS ${title.toUpperCase()}`} span={8} aux="price change, dividends not included">
        <table className="secT perfT" id="st-perf">
          <thead><tr><th className="l" />{d.perf.map((r) => <th key={r.h} title={r.from ? `from the close of ${r.from}` : undefined}>{r.h}</th>)}</tr></thead>
          <tbody>
            <tr data-r="then"><td className="l mut">Price then</td>{d.perf.map((r) => <td key={r.h} className="num mut">{fmtNum(r.base, dec)}</td>)}</tr>
            <tr data-r="stock"><td className="l">{d.symbol}</td>{d.perf.map((r) => <td key={r.h} className={`num ${signCls(r.stock)}`}>{fmtPc(r.stock, true)}</td>)}</tr>
            {bms.map((b, k) => <tr key={b.symbol} data-r="bench"><td className="l" title={b.note ?? undefined}>{b.name}{b.note && <span className="badge proxy">PROXY</span>}</td>{d.perf.map((r) => <td key={r.h} className={`num ${signCls(r.bench[k])}`}>{fmtPc(r.bench[k], true)}</td>)}</tr>)}
            {bms.map((b, k) => <tr key={b.symbol} data-r="rel" className={k === 0 ? "tot" : "tot2"}><td className="l">Against {b.name}, pp</td>{d.perf.map((r) => <td key={r.h} className={`num ${signCls(r.rel[k])}`}>{pp(r.rel[k])}</td>)}</tr>)}
          </tbody>
        </table>
        <div className="mut finnote">Each column is the price now against the last close on or before the same day that many months ago; a benchmark is measured between the same two dates. A column is empty where the history does not reach that far.</div>
        {bms.filter((b) => b.note).map((b) => <div key={b.symbol} className="mut finnote">{b.note}</div>)}
      </Panel>
      <Panel no="04" title="SHORT INTEREST" span={4} aux={s ? (s.kind === "jpx" ? "JPX short-position reports" : s.kind === "interest" ? "exchange-reported · Yahoo Finance" : "FINRA") : ""}>
        {!s ? <Empty title="No short data">None reported for this name.</Empty> : s.kind === "jpx" ? (
          <table className="secT" id="st-short"><tbody>
            <tr><td className="l"><b>Reported positions (0.5% and above) · {s.d}</b></td><td className="num"><b>{(s.ratio * 100).toFixed(2)}%</b></td></tr>
            <tr><td className="l mut">Shares · days of 60-session volume</td><td className="num">{fmtCount(s.shares)} · {s.daysToCover == null ? "–" : s.daysToCover.toFixed(1)}</td></tr>
            {s.holders.slice(0, 8).map((h) => <tr key={h.holder}><td className="l mut">{h.holder}<span className="mut"> · {h.d}</span></td><td className="num">{(h.ratio * 100).toFixed(2)}%</td></tr>)}
          </tbody></table>
        ) : s.kind === "interest" ? (
          <table className="secT" id="st-short"><tbody>
            <KV k={`Shares short · ${s.d ?? "–"}`}>{fmtCount(s.shares)}</KV>
            <KV k="Per cent of float">{fmtPc(s.pctFloat)}</KV>
            <KV k="Per cent of shares outstanding">{fmtPc(s.pctOut)}</KV>
            <KV k="Days to cover" title="Shares short over the average daily volume, as reported">{s.daysToCover == null ? "–" : s.daysToCover.toFixed(1)}</KV>
            <KV k={`A month earlier${s.priorDate ? ` · ${s.priorDate}` : ""}`}>{fmtCount(s.prior)}</KV>
            {s.finra && <KV k={`FINRA short-volume share · ${s.finra.d}`} title="The share of the day's reported volume that was sold short; not short interest">{(s.finra.ratio * 100).toFixed(0)}%</KV>}
          </tbody></table>
        ) : (
          <table className="secT" id="st-short"><tbody><KV k={`FINRA short-volume share · ${s.d}`} title="The share of the day's reported volume that was sold short; not short interest">{(s.ratio * 100).toFixed(0)}%</KV></tbody></table>
        )}
      </Panel>
      <Panel no="05" title="FINANCIALS" span={12} aux={f ? <>{f.source === "edinetdb" ? "EDINET DB (有価証券報告書 · 決算短信)" : "Yahoo Finance fundamentals"}{f.asOf ? ` · fetched ${f.asOf}` : ""}</> : ""}>
        {f && fs ? (
          <>
            <div className="finhead">
              <span className="chips" id="st-view">
                <span className={`chip-sm${view === "annual" ? " on" : ""}`} onClick={() => setView("annual")}>ANNUAL{f.annual.periods.length ? ` · ${f.annual.periods.filter((p) => p.kind === "FY").length}Y` : ""}</span>
                <span className={`chip-sm${view === "quarterly" ? " on" : ""}`} onClick={() => setView("quarterly")}>QUARTERLY{f.quarterly.periods.length ? ` · ${f.quarterly.periods.length}Q` : ""}</span>
              </span>
              {view === "annual" ? <GuidanceLine f={f} /> : <div className="finguide">Single quarters (three months each), not year to date.</div>}
            </div>
            {fs.periods.length ? <FinTable periods={fs.periods} sections={fs.sections} unit={f.unit} currency={f.currency} /> : <Empty title={view === "annual" ? "No annual statements" : "No quarterly statements"}>{d.finNote ?? "The source has none for this name."}</Empty>}
            {f.notes.map((n) => <div key={n} className="mut finnote">{n}</div>)}
          </>
        ) : <Empty title="No statements">{d.finNote ?? "Statements are available for equities only."}</Empty>}
      </Panel>
    </>
  );
}
