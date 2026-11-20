import { Fragment, useState, type ReactNode } from "react";
import { Empty } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick, type PickOption } from "../components/Pick";
import { Star } from "../components/Star";
import { JumpPick, Section, Stat } from "../components/PhoneKit";
import { StockNews } from "../components/StockNews";
import type { EconEvent } from "../lib/types";
import { fmtLevel, fmtSigma, signCls } from "../lib/fmt";
import { fmtClock, fmtDate, fmtStamp, SGT } from "../lib/time";
import { EVENTS, LARGEST_FALL, LARGEST_RISE, LEVEL_THEN, NEWS, NEXT_MEETING, PERIOD, RANGE_52W, REALISED_VOL, SIGMA_1M, SIGMA_WINDOW, VS_200D } from "../lib/labels";
import { asOfWords, calSource, ccyWords, distCls, distText, impactOk, lastAndDay, matchedWords, moveCls, moveText, noEvents, pctlText, periodsOf, sourceNote, volLine, volTip, type ImpactPick, type InstrumentPage } from "../lib/instrument";
import { useLiveRow } from "./Instrument";
import { dayLabel, dayOf, IMPACTS } from "./News";

/** A currency's, a yield's, a commodity's, a future's or an index's page on a phone (I-4, 20 Nov 2026; the designer's
 *  I-4 note and §4.7): the stock page's frame (Back, the star), the symbol, its class and source over its name; a
 *  first block of six figures (the day, the 52W range, σ vs 1M avg, realised volatility over 3M with its percentile,
 *  vs 200D and the next meeting, which stays a dash until the Monitor keeps the banks' calendars); then the picks,
 *  the chart and Key data, Performance, Events and News. A yield's changes are in bp. */
const WINDOWS: PickOption<SigmaWindow>[] = [{ value: "m1", label: "1M" }, { value: "m12", label: "12M" }, { value: "m36", label: "36M" }];
const back = () => { if (history.length > 1) history.back(); else location.hash = "market"; };
const KV = ({ k, children, sub }: { k: ReactNode; children: ReactNode; sub?: ReactNode }) => <tr><td>{k}{sub != null && <small>{sub}</small>}</td><td>{children}</td></tr>;

function EventList({ rows }: { rows: EconEvent[] }) {
  const now = Date.now();
  return (
    <div className="mp-card" id="in-events">
      {rows.map((e, i, arr) => {
        const past = Date.parse(e.at) < now;
        return (
          <Fragment key={e.id}>
            {(i === 0 || dayOf(e.at) !== dayOf(arr[i - 1].at)) && <div className="ev-day">{dayLabel(e.at)}</div>}
            <div className={`ev-row${past ? " past" : ""}`} title={fmtStamp(e.at)}>
              <span className="ev-t">{fmtClock(new Date(e.at), SGT)}<small>{e.currency ?? e.country}</small></span>
              <span className="ev-m">
                <span className="ev-n wrap"><i className={`imp ${e.impact[0].toLowerCase()}`} title={`${e.impact} impact`} />{e.title}{e.kind === "speech" ? " · speech" : e.kind === "report" ? " · report" : ""}</span>
                <span className="ev-s">Consensus {e.forecast ?? "–"} · Previous {e.previous ?? "–"}</span>
              </span>
              <span className={`ev-a ${e.better === true ? "up" : e.better === false ? "dn" : ""}`}>{e.actual ?? (past ? "–" : "")}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export function InstrumentPhone({ d, tick }: { d: InstrumentPage; tick: number }) {
  const i = d.instrument, u = i.units, periods = periodsOf(i);
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [imp, setImp] = useState<ImpactPick>("high");
  const row = useLiveRow(d, tick), { last, day } = lastAndDay(row, u);
  const dec = row.decimals, lvl = (v: number | null | undefined) => fmtLevel(v, dec, u === "yield");
  const ev = i.events, events = (ev?.rows ?? []).filter((e) => impactOk(e, imp));
  const feed = d.feed ?? null, vol = volLine(i.vol, u), r52 = i.range52, v3 = i.vol.m3;
  const asOf = i.asOfKind === "print" && row.lastAt ? fmtStamp(row.lastAt) : asOfWords(i);
  const p = periods.includes(period) ? period : "12M";
  return (
    <div className="mp">
      <header className="mp-head doc"><button type="button" className="mp-back" onClick={back}>&#8249; Back</button><Star symbol={d.symbol} name={d.name} /></header>
      <div className="mp-doc asset"><div className="meta"><span>{d.symbol}</span><span>{i.kind}</span><span>{i.source}</span></div><h1>{d.name}</h1></div>
      <div className="mp-card pad mp-first" id="in-first">
        <div className="mp-grid in">
          <Stat k="Day" cls={moveCls(day, u)}>{moveText(day, u)}</Stat>
          <Stat k={RANGE_52W} title={`Low ${lvl(r52.lo)} on ${fmtDate(r52.loDate)}, high ${lvl(r52.hi)} on ${fmtDate(r52.hiDate)}`}>{r52.pos == null ? "–" : `${Math.round(r52.pos)}%`}<span className="bar">{r52.pos != null && <i style={{ left: `${Math.max(0, Math.min(100, r52.pos))}%` }} />}</span></Stat>
          <Stat k={SIGMA_1M} cls={signCls(i.z1m, 1)}>{fmtSigma(i.z1m)}</Stat>
          <Stat k={`${REALISED_VOL} 3M`} title={volTip(u)}>{u === "yield" ? (v3.day == null ? "–" : `${(v3.day * 100).toFixed(1)}bp`) : v3.ann == null ? "–" : `${v3.ann.toFixed(1)}%`}<small>{u === "yield" ? "a day" : "a year"} · 3Y pctl {pctlText(v3.pctl)}</small></Stat>
          <Stat k={VS_200D} cls={distCls(i.vs200, u)}>{distText(i.vs200, u)}</Stat>
          <Stat k={NEXT_MEETING} title="The central banks' meeting dates are not kept by the Monitor yet: a dash until they are, never a guessed date">–<small>not kept yet</small></Stat>
        </div>
      </div>
      <div className="mp-picks">
        <Pick label={PERIOD} value={p} options={periods} onChange={setPeriod} />
        <Pick label={SIGMA_WINDOW} value={sigmaWindow} options={WINDOWS} onChange={setSigmaWindow} />
        <JumpPick dep={`${d.symbol}|${!!ev}|${!!feed}`} />
      </div>
      <div className="mp-card pad mp-hero"><ChartPanel row={row} period={p} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes /></div>
      <p className="mp-note">A tap on the chart reads that day: date, level and σ under it.{i.official ? ` ${i.source} publishes this yield once a day: daily charts only.` : ""}</p>

      <Section title="Key data" aux={i.asOfKind === "published" ? asOf : `as of ${asOf}`} card={false}>
        <div className="mp-card pad" id="in-key">
          <table className="mp-t left kv"><tbody>
            <KV k="Last" sub={asOf}>{lvl(last)}</KV>
            <KV k="Day's range" sub={i.official ? "published once a day: none" : undefined}>{i.session && i.session.low != null && i.session.high != null ? `${lvl(i.session.low)} – ${lvl(i.session.high)}` : "–"}</KV>
            <KV k="Previous close" sub={i.prev.date ? fmtDate(i.prev.date) : undefined}>{lvl(i.prev.level)}</KV>
            <KV k={RANGE_52W} sub={`${fmtDate(r52.loDate)} · ${fmtDate(r52.hiDate)}`}>{lvl(r52.lo)} – {lvl(r52.hi)}</KV>
            <KV k="From 52W high / low"><span className={distCls(r52.fromHi, u)}>{distText(r52.fromHi, u)}</span> / <span className={distCls(r52.fromLo, u)}>{distText(r52.fromLo, u)}</span></KV>
            <KV k={SIGMA_1M}><span className={signCls(i.z1m, 1)}>{fmtSigma(i.z1m)}</span></KV>
            <KV k={VS_200D}><span className={distCls(i.vs200, u)}>{distText(i.vs200, u)}</span></KV>
            <KV k={`${REALISED_VOL}, 1M / 3M / 12M`} sub={vol.sub}>{vol.main}</KV>
            <KV k={LARGEST_RISE} sub={i.rise ? `${fmtDate(i.rise.from)} to ${fmtDate(i.rise.to)}` : undefined}>{i.rise ? <span className={distCls(i.rise.chg, u)}>{distText(i.rise.chg, u)}</span> : "–"}</KV>
            <KV k={LARGEST_FALL} sub={i.fall ? `${fmtDate(i.fall.from)} to ${fmtDate(i.fall.to)}` : undefined}>{i.fall ? <span className={distCls(i.fall.chg, u)}>{distText(i.fall.chg, u)}</span> : "–"}</KV>
          </tbody></table>
        </div>
        <p className="mp-note">{sourceNote(i)} A percentile needs three years of readings: "–" where the history is shorter.</p>
      </Section>

      <Section title="Performance" aux={u === "yield" ? "change in bp" : "price change"} card={false}>
        <div className="mp-card pad">
          <table className="mp-t perf" id="in-perf">
            <thead><tr><th /><th>{LEVEL_THEN}</th><th>Change</th></tr></thead>
            <tbody>{i.perf.map((r) => <tr key={r.h}><td>{r.h}</td><td className="mut">{lvl(r.base)}</td><td className={moveCls(r.chg, u)}>{moveText(r.chg, u)}</td></tr>)}</tbody>
          </table>
          <p className="mp-note in">Each row is the last level against the last close on or before the start of the window{u === "yield" ? "; a yield's change is the change of its level, in bp" : ""}.</p>
        </div>
      </Section>

      {ev && (
        <Section title={EVENTS} aux={ccyWords(ev.ccys)} card={false}>
          <div className="mp-picks" id="in-imp">{IMPACTS.map((o) => <button type="button" key={o.value} className={`mp-tog${imp === o.value ? " on" : ""}`} aria-pressed={imp === o.value} onClick={() => setImp(o.value)}>{o.label}</button>)}</div>
          {events.length ? <EventList rows={events} /> : <div className="mp-card"><Empty title={ev.error ? "The calendar could not be read" : noEvents(ev.ccys, imp)}>{ev.error ?? null}</Empty></div>}
          <p className="mp-note">{ccyWords(ev.ccys)} events from five days back to eight days ahead{calSource(ev.rows) ? ` · ${calSource(ev.rows)}` : ""} · times in SGT. The central banks' next meetings join here when the Monitor keeps their calendars.</p>
        </Section>
      )}

      {feed && (
        <Section title={NEWS} aux="headlines, alerts" card={false}>
          <StockNews key={d.symbol} symbol={d.symbol} feed={feed} phone matched={i.matched} name={d.name} />
          <p className="mp-note">{i.matched.length ? `Headlines of the last ${feed.days} days matched by ${matchedWords(i.matched)} (whole words, any case), and the Monitor's own alerts on ${d.name}.` : `The Monitor's own alerts on ${d.name} over the last ${feed.days} days; it has no words to match headlines to it by.`} Times in SGT.</p>
        </Section>
      )}
    </div>
  );
}
