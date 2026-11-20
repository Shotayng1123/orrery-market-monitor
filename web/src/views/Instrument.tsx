import { Fragment, useState, type ReactNode } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick } from "../components/Pick";
import { Star } from "../components/Star";
import { StockNews } from "../components/StockNews";
import { ScreenChips, screensOf, type ScreenSection } from "../components/ScreenChips";
import { useApi } from "../lib/useApi";
import { termMode } from "../lib/prefs";
import type { EconEvent, TableRow } from "../lib/types";
import { fmtLevel, fmtSigma, signCls } from "../lib/fmt";
import { fmtClock, fmtDate, fmtStamp, SGT } from "../lib/time";
import { EVENTS, LARGEST_FALL, LARGEST_RISE, LEVEL_THEN, NEWS, NEXT_MEETING, RANGE_52W, REALISED_VOL, SIGMA_1M, VS_200D, WORKED } from "../lib/labels";
import { asOfWords, calSource, ccyWords, contractLine, distCls, distText, impactOk, lastAndDay, lastRollLine, matchedWords, moveCls, moveText, noEvents, perfNote, periodsOf, rollMarks, rollsOutLine, SERIES_LINE, sourceNote, volLine, volTip, workedLine, workedOut, type ImpactPick, type InstrumentInfo, type InstrumentPage, type KeyLine } from "../lib/instrument";
import { dayLabel, dayOf, IMPACTS } from "./News";
import { SIGMA_1M_TIP } from "./Market";

/** The chart tile's row: MARKETS' own, refreshed every minute, for a Monitor instrument (so its last print and its
 *  day agree with MARKETS to the minute); the page's answer otherwise. */
export function useLiveRow(d: InstrumentPage, tick: number): TableRow {
  const t = useApi<{ rows: TableRow[] }>(d.instrument.monitor ? "table" : null, undefined, tick);
  return t.data?.rows.find((r) => r.symbol === d.symbol) ?? d.instrument.row;
}
function KV({ k, children, title, cls }: { k: ReactNode; children: ReactNode; title?: string; cls?: string }) {
  return <tr title={title}><td className="l">{k}</td><td className={`num${cls ? ` ${cls}` : ""}`}>{children}</td></tr>;
}
/** A KEY DATA label, with the designer's † after it where the Monitor works the figure out itself (the reviewer's
 *  R2B-05): the line under the panel says from what and over which dates. Both layouts. */
export function keyLabel(i: Pick<InstrumentInfo, "monitor">, text: string, line: KeyLine): ReactNode {
  return workedOut(i, line) ? <>{text}{"\u00a0"}<span className="wk" title="Worked out by the Monitor: the line under the panel says from what">{WORKED}</span></> : text;
}

/** The calendar of the instrument's currencies, in the NEWS calendar's style: a bar for each day, past events dimmed,
 *  the actual coloured when it beat or missed the consensus. */
function EventTable({ rows }: { rows: EconEvent[] }) {
  const now = Date.now();
  return (
    <table className="mini calT inev" id="in-events">
      <colgroup><col className="tm" /><col className="cy" /><col /><col className="nv" /><col className="nv" /><col className="nv" /></colgroup>
      <thead><tr><th className="l">SGT</th><th className="l">Ccy</th><th className="l">Event</th><th>Actual</th><th title="Consensus">Cons.</th><th title="Previous">Prev.</th></tr></thead>
      <tbody>{rows.map((e, i, arr) => (
        <Fragment key={e.id}>
          {(i === 0 || dayOf(e.at) !== dayOf(arr[i - 1].at)) && <tr className="cls"><td colSpan={6}>{dayLabel(e.at)}</td></tr>}
          <tr className={`ecrow${Date.parse(e.at) < now ? " past" : ""}`} title={`${fmtStamp(e.at)} · ${e.impact} impact`}>
            <td className="l num">{fmtClock(new Date(e.at), SGT)}</td><td className="l">{e.currency ?? e.country}</td>
            <td className="l ev"><span className={`imp ${e.impact[0].toLowerCase()}`} aria-label={`${e.impact} impact`} />{e.title}{e.kind === "speech" ? <span className="mut"> · speech</span> : e.kind === "report" ? <span className="mut"> · report</span> : null}</td>
            <td className={e.better === true ? "up" : e.better === false ? "dn" : ""}><b>{e.actual ?? (Date.parse(e.at) < now ? "–" : "")}</b></td>
            <td>{e.forecast ?? "–"}</td><td className="mut">{e.previous ?? "–"}</td>
          </tr>
        </Fragment>
      ))}</tbody>
    </table>
  );
}
/** An instrument's page in the one-screen layout (the designer's §4.7, its two compact screens with the panels that exist
 *  today): Overview (the chart, KEY DATA, PERFORMANCE, EVENTS) and News (NEWS; DRIVERS and STRESS join it with I-12). */
export type InstrumentScreen = "overview" | "news";
/** A currency's, a yield's, a commodity's, a future's or an index's own page on a computer (I-4, 20 Nov 2026; B-04, the
 *  designer's §4.7 and I-4 note): the stock page's two-column frame with the panels an instrument has. Left: the chart
 *  and PERFORMANCE (DRIVERS and STRESS join with I-12); right: KEY DATA, EVENTS (the banks' next meetings join with
 *  I-7) and NEWS. No stock-only line: no market cap, shares, valuation, results, short interest, big moves or
 *  statements. A yield's changes, distances and volatility are in bp. Panels are numbered in reading order. */
export function InstrumentView({ d, tick }: { d: InstrumentPage; tick: number }) {
  const i = d.instrument, u = i.units;
  const periods = periodsOf(i);
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [imp, setImp] = useState<ImpactPick>("high");
  const [screen, setScreen] = useState<InstrumentScreen>("overview");   // the one-screen layout's screen on view
  const row = useLiveRow(d, tick), { last, day } = lastAndDay(row, u);
  const dec = row.decimals, lvl = (v: number | null | undefined) => fmtLevel(v, dec, u === "yield");
  const ev = i.events, events = (ev?.rows ?? []).filter((e) => impactOk(e, imp));
  const feed = d.feed ?? null, vol = volLine(i.vol, u), r52 = i.range52;
  // the one-screen layout shows one screen's panels at a time (a page with one screen's worth shows them together);
  // the scrolling page every panel
  const sections: Array<ScreenSection<InstrumentScreen>> = [{ k: "key", label: "Key data", screen: "overview" }, { k: "perf", label: "Performance", screen: "overview" }, ...(ev ? [{ k: "events", label: "Events", screen: "overview" as const }] : []), ...(feed ? [{ k: "news", label: "News", screen: "news" as const }] : [])];
  const scrs = screensOf(sections), term = termMode() && scrs.length > 1, scr: InstrumentScreen = scrs.includes(screen) ? screen : "overview";
  const on = (k: string) => !term || (k === "chart" ? "overview" : sections.find((x) => x.k === k)?.screen) === scr;
  const left = ["chart", "perf"], right = ["key", ...(ev ? ["events"] : []), ...(feed ? ["news"] : [])], order: string[] = [];
  for (let k = 0; k < Math.max(left.length, right.length); k++) { if (left[k]) order.push(left[k]); if (right[k]) order.push(right[k]); }
  const no = (k: string) => String(order.indexOf(k) + 1).padStart(2, "0");
  const asOf = i.asOfKind === "print" && row.lastAt ? fmtStamp(row.lastAt) : asOfWords(i);
  const p = period && periods.includes(period) ? period : "12M";
  const fut = i.futures, marks = fut ? rollMarks(fut) : undefined;   // B-27: a future's rolls, marked on its daily chart
  return (
    <>
      <div className="c12"><PeriodBar periods={periods} period={p} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} extra={term ? <ScreenChips sections={sections} screen={scr} onScreen={setScreen} /> : undefined} /></div>
      <div className="pcols" data-page="instrument" data-screen={term ? scr : undefined}>
        <div className="pcol w8">
          {on("chart") && <Panel no={no("chart")} k="in-chart" title={d.name.toUpperCase()} span={8} aux={<><Star symbol={d.symbol} name={d.name} /> {d.symbol} · {i.kind} · {i.source}{i.official ? " · published once a day" : ""}</>}>
            <div className="bigwrap"><ChartPanel row={row} period={p} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes marks={marks} /></div>
          </Panel>}
          {on("perf") && <Panel no={no("perf")} k="in-perf" title="PERFORMANCE" span={8} aux={u === "yield" ? "change in bp" : "price change"}>
            <table className="secT perfT inperf" id="in-perf">
              <thead><tr><th className="l" />{i.perf.map((r) => <th key={r.h} title={r.from ? `from the close of ${fmtDate(r.from)}` : "no close that far back"}>{r.h}</th>)}</tr></thead>
              <tbody>
                <tr data-r="then"><td className="l mut">{LEVEL_THEN}</td>{i.perf.map((r) => <td key={r.h} className="num mut">{lvl(r.base)}</td>)}</tr>
                <tr data-r="chg"><td className="l">Change</td>{i.perf.map((r) => <td key={r.h} className={`num ${moveCls(r.chg, u)}`}>{moveText(r.chg, u)}</td>)}</tr>
              </tbody>
            </table>
            <div className="mut finnote">Each column is the last level against the last close on or before the start of the window{u === "yield" ? "; a yield's change is the change of its level, in bp" : ""}. {perfNote(i)}</div>
          </Panel>}
        </div>
        <div className="pcol w4">
          {on("key") && <Panel no={no("key")} k="in-key" title="KEY DATA" span={4} aux={i.asOfKind === "published" ? asOf : `as of ${asOf}`}>
            <div className="krow">
              <span><span className="k">Last</span><span className="v" id="in-last">{lvl(last)}</span></span>
              <span><span className="k">Day</span><span className={`v ${moveCls(day, u)}`} id="in-day">{moveText(day, u)}</span></span>
            </div>
            <div className="kvwrap">
              <table className="secT kvT" id="in-key"><tbody>
                <KV k="Day's range" title={i.official ? "A yield published once a day has no prices within the day" : i.session?.at ? `${i.source}: the session's low and high, as of ${fmtStamp(i.session.at)}` : "No session figures from the source"}>{i.session && i.session.low != null && i.session.high != null ? `${lvl(i.session.low)} – ${lvl(i.session.high)}` : "–"}</KV>
                <KV k="Previous close" title={row.roll?.step != null ? `the new contract's own close of ${fmtDate(i.prev.date)}: today is a change of contract` : i.prev.date ? `the close of ${fmtDate(i.prev.date)}` : undefined}>{lvl(i.prev.level)}</KV>
                {fut && <KV k="Contract" title={`The named contract the last price is from, as ${fut.source}${fut.seenAt ? `, read ${fmtStamp(fut.seenAt)}` : ""}`}><span id="in-contract">{contractLine(fut)}</span></KV>}
                {fut && <KV k="Last change of contract" title={fut.lastRoll ? `${fut.lastRoll.fromMonth ?? "a contract no longer listed"} to ${fut.lastRoll.toMonth}; ${fut.lastRoll.source}` : "No roll in the Monitor's record"}><span id="in-roll">{lastRollLine(fut)}</span></KV>}
                <KV k={keyLabel(i, RANGE_52W, "range52")} title={`The lowest and highest of the last 252 closes: low ${fmtDate(r52.loDate)}, high ${fmtDate(r52.hiDate)}; ${r52.pos == null ? "–" : `${Math.round(r52.pos)}%`} of the way up, as on MARKETS`}>
                  <span className="rng"><span>{lvl(r52.lo)}</span><span className="bar">{r52.pos != null && <i style={{ left: `${Math.max(0, Math.min(100, r52.pos))}%` }} />}</span><span>{lvl(r52.hi)}</span></span>
                </KV>
                <KV k={keyLabel(i, "From 52W high / low", "fromHiLo")} title={u === "yield" ? "The last level against the 52-week high and low, in bp" : undefined}><span className={distCls(r52.fromHi, u)}>{distText(r52.fromHi, u)}</span> / <span className={distCls(r52.fromLo, u)}>{distText(r52.fromLo, u)}</span></KV>
                <KV k={keyLabel(i, SIGMA_1M, "z1m")} title={SIGMA_1M_TIP} cls={signCls(i.z1m, 1)}>{fmtSigma(i.z1m)}</KV>
                <KV k={keyLabel(i, VS_200D, "vs200")} title={`The last level against its 200-day average (${u === "yield" ? "bp" : "%"})`} cls={distCls(i.vs200, u)}>{distText(i.vs200, u)}</KV>
                <KV k={keyLabel(i, `${REALISED_VOL}, 1M / 3M / 12M`, "vol")} title={volTip(u)}><span className="vl1">{vol.main}</span><small className="vl2" id="in-volsub">{vol.sub}</small></KV>
                <KV k={keyLabel(i, LARGEST_RISE, "rise")} title={i.rise ? `From the low of ${fmtDate(i.rise.from)} to the high of ${fmtDate(i.rise.to)}` : "No rise in the last twelve months"}>{i.rise ? <><span className={distCls(i.rise.chg, u)}>{distText(i.rise.chg, u)}</span><span className="mut"> · {fmtDate(i.rise.to)}</span></> : "–"}</KV>
                <KV k={keyLabel(i, LARGEST_FALL, "fall")} title={i.fall ? `From the high of ${fmtDate(i.fall.from)} to the low of ${fmtDate(i.fall.to)}` : "No fall in the last twelve months"}>{i.fall ? <><span className={distCls(i.fall.chg, u)}>{distText(i.fall.chg, u)}</span><span className="mut"> · {fmtDate(i.fall.to)}</span></> : "–"}</KV>
                <KV k="Source · as of" title={sourceNote(i)}><span id="in-src">{i.source} · {asOf}</span><small className="vl2">{WORKED} worked out by the Monitor</small></KV>
              </tbody></table>
            </div>
            <div className="mut finnote" id="in-worked">{workedLine(i)}</div>
            {fut && <div className="mut finnote" id="in-rolls">{SERIES_LINE} {rollsOutLine(i)}</div>}
          </Panel>}
          {ev && on("events") && (
            <Panel no={no("events")} k="in-events" title={EVENTS.toUpperCase()} span={4} aux={<span className="chips" style={{ margin: 0 }}><Pick label="Impact" value={imp} options={IMPACTS} onChange={setImp} /><span className="mut">{ccyWords(ev.ccys)} · times in SGT{calSource(ev.rows) ? ` · ${calSource(ev.rows)}` : ""}</span></span>}>
              {/* the banks' next meetings come first here once the Monitor keeps their calendars (I-7); until then a dash
                  that says so, as the phone's first block does (B-04 (b), B's verdict of 20 Nov 2026) */}
              <div className="evmeet" id="in-meet" title="The central banks' meeting dates are not kept by the Monitor yet: a dash until they are, never a guessed date"><span className="k">{NEXT_MEETING}</span>{" "}<b>–</b>{" "}<span className="mut">not kept yet: the central banks' next meetings join here when the Monitor keeps their calendars</span></div>
              {events.length ? <EventTable rows={events} /> : <Empty title={ev.error ? "The calendar could not be read" : noEvents(ev.ccys, imp)}>{ev.error ?? null}</Empty>}
            </Panel>
          )}
          {feed && on("news") && (
            <Panel no={no("news")} k="in-news" title={NEWS.toUpperCase()} span={4} aux={i.matched.length ? `matched by: ${matchedWords(i.matched)} · ${feed.days} days · times in SGT` : `${feed.days} days · times in SGT`}>
              <StockNews key={d.symbol} symbol={d.symbol} feed={feed} matched={i.matched} name={d.name} />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
