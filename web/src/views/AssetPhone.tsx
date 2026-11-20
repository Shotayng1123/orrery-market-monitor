import { useState, type ReactNode } from "react";
import { Empty } from "../components/Panel";
import { ASSET_PERIODS, ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick, type PickOption } from "../components/Pick";
import { Star } from "../components/Star";
import { money } from "../components/CompanyCard";
import { FinTable } from "../components/FinTable";
import { JumpPick, Section, Stat } from "../components/PhoneKit";
import { StockNews } from "../components/StockNews";
import { useApi } from "../lib/useApi";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtStamp } from "../lib/time";
import { chartMarks, finSections, fmtCount, fmtPc, fmtX, isSmallMove, moveRule, NO_DOC, siteOf, whyText, type MoveRow, type StockPage } from "../lib/stock";
import { periodHolding } from "../lib/periods";
import { chartRow, GuidanceLine, MoveText, profileOf, shortLine } from "./Asset";
import { AssetPhoneLegacy } from "./AssetPhoneLegacy";

/** A stock's own page for a phone (Shota, 18 Nov 2026): the same content as the desktop page (views/Asset.tsx),
 *  laid out as cards. The performance table is turned on its side (a row per horizon) so its four figures fit the
 *  width; the statements scroll sideways under line names that stay put, opening at the latest periods and landing
 *  on whole columns ("‹ earlier years" in the names' header goes back a screen; components/FinTable.tsx).
 *  Since 20 Nov 2026 (I-3): News (the stock's headlines and alerts); a big move tapped in the list opens on the chart
 *  (A-25: PERIOD set to the shortest view that holds it, the page brought to the chart, its card open and its circle
 *  ringed); a tap on the chart puts its crosshair and read-out on the tapped day (D-42, components/SigmaChart.tsx). */
const WINDOWS: PickOption<SigmaWindow>[] = [{ value: "m1", label: "1M" }, { value: "m12", label: "12M" }, { value: "m36", label: "36M" }];
const VIEWS: PickOption<"annual" | "quarterly">[] = [{ value: "annual", label: "Annual" }, { value: "quarterly", label: "Quarterly" }];
const back = () => { if (history.length > 1) history.back(); else location.hash = "market"; };
const KV = ({ k, children, sub }: { k: ReactNode; children: ReactNode; sub?: ReactNode }) => <tr><td>{k}{sub != null && <small>{sub}</small>}</td><td>{children}</td></tr>;

export function AssetPhone({ symbol, tick }: { symbol: string; tick: number }) {
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [view, setView] = useState<"annual" | "quarterly">("annual");
  const [focus, setFocus] = useState<{ t: number; n: number } | null>(null);
  const a = useApi<StockPage>(symbol ? "stock" : null, { symbol }, Math.floor(tick / 5));
  if (a.error === "unknown action") return <AssetPhoneLegacy symbol={symbol} tick={tick} />;   // a server from before this page
  const d = a.data && a.data.symbol ? a.data : null;
  const backBtn = <button type="button" className="mp-back" onClick={back}>&#8249; Back</button>;
  if (!d) return (
    <div className="mp"><header className="mp-head doc">{backBtn}</header>
      <div className="mp-card gap">{!symbol ? <Empty title="No symbol">Use the search button at the top.</Empty> : a.error ? <Empty title="Not found">{a.error}</Empty> : <Empty title="Loading">{symbol}</Empty>}</div>
    </div>
  );
  const row = chartRow(d), dec = row.decimals, ccy = d.currency;
  const f = d.fin, s = d.short, sh = shortLine(d), bms = d.benchmarks;
  const pp = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace("-", "\u2212")}`);
  const fs = f ? finSections(f, view) : null;
  const marks = d.moves.eligible ? chartMarks(d.moves.rows) : undefined;
  const prof = profileOf(f), feed = d.feed ?? null;   // a server from before 20 Nov 2026 sends no feed: no News section then
  // A-25: the move opens on the chart. The chart is brought up under the pinned head first; then PERIOD and the card.
  const onChart = (m: MoveRow) => {
    const hero = document.querySelector<HTMLElement>(".mp-hero"), head = document.querySelector<HTMLElement>(".mp-head")?.getBoundingClientRect().height ?? 0;
    if (hero) window.scrollTo({ top: hero.getBoundingClientRect().top + window.scrollY - head - 8 });
    setPeriod(periodHolding(m.t, Date.now() / 1000));
    setFocus((x) => ({ t: m.t, n: (x?.n ?? 0) + 1 }));
  };
  return (
    <div className="mp">
      <header className="mp-head doc">{backBtn}<Star symbol={d.symbol} name={d.name} /></header>
      <div className="mp-doc asset">
        <div className="meta"><span>{d.symbol}</span>{d.exchange && <span>{d.exchange}</span>}{d.sector && <span>{d.sector}</span>}{ccy && <span>{ccy}</span>}</div>
        <h1>{d.name}</h1>
      </div>
      <div className="mp-picks">
        <Pick label="Period" value={period} options={ASSET_PERIODS} onChange={setPeriod} />
        <Pick label="σ window" value={sigmaWindow} options={WINDOWS} onChange={setSigmaWindow} />
        <JumpPick dep={`${d.symbol}|${d.moves.eligible}|${!!f}|${!!feed}`} />
      </div>
      <div className="mp-card pad mp-hero"><ChartPanel row={row} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes volume marks={marks} focus={focus} /></div>
      {d.moves.eligible && d.moves.rows.length > 0 ? <p className="mp-note">Circles on the daily charts (3M to 10Y) are the big moves of the last three years: tap one for the reason, or a move in the list under Big moves. A tap anywhere else on a chart reads that day.</p>
        : <p className="mp-note">A tap on the chart reads that day: date, level and σ under it.</p>}

      <Section title="Key data" aux={d.asOf ? `as of ${fmtStamp(d.asOf)}` : ""} card={false}>
        <div className="mp-card pad" id="st-key">
          <div className="mp-grid in">
            <Stat k="Day" cls={signCls(d.pct)}>{fmtPct(d.pct, 2)}</Stat>
            <Stat k="Market cap">{money(d.mcap, ccy)}</Stat>
            <Stat k="P/E, guidance" title={d.val.basis ?? undefined}>{fmtX(d.val.peGuide)}</Stat>
            <Stat k="52-week low">{fmtNum(d.range.lo, dec)}<span className="bar">{d.range.pos != null && <i style={{ left: `${d.range.pos}%` }} />}</span></Stat>
            <Stat k="52-week high">{fmtNum(d.range.hi, dec)}</Stat>
            <Stat k="From the high" cls={signCls(d.range.fromHi)}>{fmtPc(d.range.fromHi, true)}</Stat>
          </div>
          <table className="mp-t left kv"><tbody>
            <KV k="Shares outstanding" sub={[d.shares.source, d.shares.asOf].filter(Boolean).join(" · ") || undefined}>{fmtCount(d.shares.outstanding)}</KV>
            <KV k="Diluted shares" sub={d.shares.dilutedNote ?? undefined}>{fmtCount(d.shares.diluted)}</KV>
            <KV k="Average daily volume, 60 sessions">{fmtCount(d.turnover.d60.shares)}</KV>
            <KV k="Average daily value traded, 60 sessions">{money(d.turnover.d60.value, ccy)}</KV>
            <KV k="Volume today" sub={d.volume != null && d.turnover.d60.shares ? `${Math.round((d.volume / d.turnover.d60.shares) * 100)}% of the 60-session average` : undefined}>{fmtCount(d.volume)}</KV>
            <KV k={sh.label} sub={s?.kind === "jpx" ? `positions of 0.5% and above · ${s.d}` : s?.kind === "finra" ? "not short interest" : undefined}>{sh.value}</KV>
            <KV k="Volatility, 1M / 3M / 12M" sub="yearly figure from daily returns">{fmtPc(d.vol.m1, false, 0)} / {fmtPc(d.vol.m3, false, 0)} / {fmtPc(d.vol.m12, false, 0)}</KV>
            {bms.map((b, k) => <KV key={b.symbol} k={`Beta vs ${b.name}, 12M`}>{d.beta[k]?.beta == null ? "–" : d.beta[k].beta!.toFixed(2)}</KV>)}
            <KV k="Largest fall, 12M" sub={d.drawdown.from ? `${d.drawdown.from} to ${d.drawdown.to}` : undefined}><span className={signCls(d.drawdown.pct)}>{fmtPc(d.drawdown.pct)}</span></KV>
            <KV k="P/E, last year">{fmtX(d.val.pe)}</KV>
            <KV k="P/B">{fmtX(d.val.pb, 2)}</KV>
            <KV k="Dividend yield, last year / guidance">{fmtPc(d.val.yield, false, 2)} / {fmtPc(d.val.yieldGuide, false, 2)}</KV>
            <KV k="Next earnings" sub={d.earningsEst ? "estimated, not confirmed by the company" : undefined}>{d.earningsAt ? fmtStamp(d.earningsAt) : "–"}</KV>
            {prof && <KV k="Fiscal year end · standard" sub={`有価証券報告書 ${prof.label} · EDINET DB`}>{prof.month} · {prof.std}</KV>}
            {prof && <KV k="Annual report" sub={prof.doc ? undefined : NO_DOC}>{prof.doc ? <a href={prof.doc.href} target="_blank" rel="noreferrer" id="st-yuho" title={prof.doc.tip}>有報 {prof.label} ↗</a> : `有報 ${prof.label}`}</KV>}
          </tbody></table>
        </div>
      </Section>

      <Section title="Performance" aux={bms.length ? `vs ${bms.map((b) => b.name).join(", ")}` : ""} card={false}>
        <div className="mp-card pad">
          <table className="mp-t perf" id="st-perf">
            <thead><tr><th /><th>Price then</th><th>{d.symbol}</th>{bms.map((b) => <th key={b.symbol}>vs {b.name}</th>)}</tr></thead>
            <tbody>{d.perf.map((r) => (
              <tr key={r.h}><td>{r.h}</td><td className="mut">{fmtNum(r.base, dec)}</td><td className={signCls(r.stock)}>{fmtPc(r.stock, true)}</td>{bms.map((b, k) => <td key={b.symbol} className={signCls(r.rel[k])}>{pp(r.rel[k])}</td>)}</tr>
            ))}</tbody>
          </table>
          {bms.length > 0 && <>
            <p className="mp-note in">"vs" is the stock's change less the index's, in percentage points (plus = the stock did better).</p>
            <table className="mp-t perf idx" id="st-bench">
              <thead><tr><th />{bms.map((b) => <th key={b.symbol}>{b.name}</th>)}</tr></thead>
              <tbody>{d.perf.map((r) => <tr key={r.h}><td>{r.h}</td>{bms.map((b, k) => <td key={b.symbol} className={signCls(r.bench[k])}>{fmtPc(r.bench[k], true)}</td>)}</tr>)}</tbody>
            </table>
          </>}
          <p className="mp-note in">Price changes, dividends not included. Each row is the price now against the last close on or before the same day that long ago; an index is measured between the same two dates.</p>
          {bms.filter((b) => b.note).map((b) => <p key={b.symbol} className="mp-note in">{b.note}</p>)}
        </div>
      </Section>

      {feed && (
        <Section title="News" aux="headlines, alerts" card={false}>
          <StockNews key={d.symbol} symbol={d.symbol} feed={feed} phone />
          <p className="mp-note">Headlines from the publishers' feeds the Monitor reads (as on News) that name {d.symbol}, and the Monitor's own alerts on it, over the last {feed.days} days. Times in SGT.</p>
        </Section>
      )}

      {d.moves.eligible && (
        <Section title="Big moves" aux="and why" card={false}>
          <div className="mp-card pad" id="st-moves">
            {d.moves.rows.length ? (
              // a short box with its own scrolling (Shota, 19 Nov 2026): the whole list pushed the statements a long way down.
              // Each move is a row to tap: it opens on the chart (A-25); its sources stay links of their own.
              <ul className="mp-moves" id="st-movebox" tabIndex={0} aria-label="Big moves, newest first">{d.moves.rows.map((m) => (
                <li key={`${m.kind}${m.to}`} data-kind={m.kind} data-status={m.status} role="button" tabIndex={0} title="Open on the chart"
                  onClick={() => onChart(m)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onChart(m); } }}>
                  <div className="h"><span className={`dot ${m.dir > 0 ? "up" : "dn"}${isSmallMove(m) ? " sm" : ""}`} /><MoveText m={m} /></div>
                  <div className="dl"><span className="d">{m.to}</span><span className="go">On the chart ›</span></div>
                  <div className="w">{whyText(m)}</div>
                  {m.sources.length > 0 && <div className="s">{m.sources.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{siteOf(x.url)}</a>)}</div>}
                </li>
              ))}</ul>
            ) : <Empty title="No big moves">None in the last three years by these measures.</Empty>}
            <p className="mp-note in">{d.moves.rows.length > 3 ? `${d.moves.rows.length} moves in three years, newest first: scroll inside the box for earlier ones. ` : ""}{moveRule(d.moves.rule, d.moves.sizes).note}</p>
          </div>
        </Section>
      )}

      <Section title="Short interest" aux={s ? (s.kind === "jpx" ? "JPX reports" : s.kind === "interest" ? "exchange-reported" : "FINRA") : ""} card={false}>
        <div className="mp-card pad" id="st-short">
          {!s ? <Empty title="No short data">None reported for this name.</Empty> : s.kind === "jpx" ? (
            <table className="mp-t left kv"><tbody>
              <KV k={<b>Reported positions (0.5% and above)</b>} sub={s.d}><b>{(s.ratio * 100).toFixed(2)}%</b></KV>
              <KV k="Shares" sub={s.daysToCover != null ? `${s.daysToCover.toFixed(1)} days of 60-session volume` : undefined}>{fmtCount(s.shares)}</KV>
              {s.holders.slice(0, 8).map((h) => <KV key={h.holder} k={h.holder} sub={h.d}>{(h.ratio * 100).toFixed(2)}%</KV>)}
            </tbody></table>
          ) : s.kind === "interest" ? (
            <table className="mp-t left kv"><tbody>
              <KV k="Shares short" sub={s.d ?? undefined}>{fmtCount(s.shares)}</KV>
              <KV k="Per cent of float">{fmtPc(s.pctFloat)}</KV>
              <KV k="Per cent of shares outstanding">{fmtPc(s.pctOut)}</KV>
              <KV k="Days to cover">{s.daysToCover == null ? "–" : s.daysToCover.toFixed(1)}</KV>
              <KV k="A month earlier" sub={s.priorDate ?? undefined}>{fmtCount(s.prior)}</KV>
              {s.finra && <KV k="FINRA short-volume share" sub={`${s.finra.d} · not short interest`}>{(s.finra.ratio * 100).toFixed(0)}%</KV>}
            </tbody></table>
          ) : (
            <table className="mp-t left kv"><tbody><KV k="FINRA short-volume share" sub={`${s.d} · the share of the day's volume sold short, not short interest`}>{(s.ratio * 100).toFixed(0)}%</KV></tbody></table>
          )}
        </div>
      </Section>

      <Section title="Financials" aux={f ? (f.source === "edinetdb" ? "EDINET DB" : "Yahoo Finance") : ""} card={false}>
        {f && fs ? (
          <>
            <div className="mp-picks"><Pick label="Periods" id="st-view" value={view} options={VIEWS} onChange={setView} /></div>
            <div className="mp-card pad fin-card">
              {view === "annual" ? <GuidanceLine f={f} /> : <div className="finguide">Single quarters (three months each), not year to date.</div>}
              {fs.periods.length ? <FinTable periods={fs.periods} sections={fs.sections} unit={f.unit} currency={f.currency} /> : <Empty title={view === "annual" ? "No annual statements" : "No quarterly statements"}>{d.finNote ?? "The source has none for this name."}</Empty>}
            </div>
            {f.asOf && <p className="mp-note">Fetched {f.asOf}.</p>}
            {f.notes.map((n) => <p key={n} className="mp-note">{n}</p>)}
          </>
        ) : <div className="mp-card pad"><Empty title="No statements">{d.finNote ?? "Statements are available for equities only."}</Empty></div>}
      </Section>
    </div>
  );
}
