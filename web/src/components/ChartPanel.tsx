import { useEffect, useRef, useState } from "react";
import { DN, FLAT, fmtVol, SigmaChart, UP, type ChartMark, type SigmaWindow } from "./SigmaChart";
import { useApi, DEV_MOCK } from "../lib/useApi";
import type { Series, TableRow } from "../lib/types";
import { fmtChg, fmtLevel, fmtPct, fmtSigma, isYield, signCls } from "../lib/fmt";
import { fmtDate, fmtStamp, SGT, tileStamp } from "../lib/time";
import { delayed } from "../lib/labels";
import { marketOf } from "../lib/sessions";
import { pageLine, rowSession, staleInSession } from "../lib/opens";
import { pageHash } from "../lib/indices";
import { Flash } from "./Flash";
import { LONG_PERIODS, PERIOD_DAYS, type ChartPeriod } from "../lib/periods";

export { ASSET_PERIODS, CHART_PERIODS, type ChartPeriod } from "../lib/periods";
/** The table's own change for a period, where it keeps one (5Y and 10Y it does not: read from the chart's history). */
const PERIOD_KEY: Partial<Record<ChartPeriod, keyof TableRow["pct"]>> = { "1D": "d1", "1W": "w1", "1M": "m1", "3M": "m3", "12M": "m12", "36M": "m36" };
/** Bar frequency by period (Shota): 1D one-minute bars, 1W and 1M hourly bars, 3M and longer daily closes.
 *  The σ corridors are rolling statistics of daily closes, so they are drawn on the daily charts only. */
export const INTRADAY = new Set<ChartPeriod>(["1D", "1W", "1M"]);
const DAY = 86400;

/** The visible window for 1D is the latest session: walk back from the last bar while the gap stays under 3 h. */
function sessionWindow(points: Array<{ t: number }>): number {
  if (points.length < 2) return DAY;
  let i = points.length - 1;
  while (i > 0 && points[i].t - points[i - 1].t < 3 * 3600) i--;
  return Math.max(30 * 60, points[points.length - 1].t - points[i].t + 5 * 60);
}

/** One instrument in the Analytics tile grammar: the name on its own line (wrapping to two lines, never cut), the
 *  price under it with the badges and the session stamp at its right (they go under the price when the tile is
 *  narrow), the period change, then the chart. `shape` sets the tile proportions. The badges and the stamp used to
 *  share the name's line and cut it to a few letters ("Nikkei 2…": the designer's D-08, 19 Nov 2026). */
const WIN_LABEL: Record<SigmaWindow, string> = { m1: "1M", m12: "12M", m36: "36M" };
/** `focus`: a mark to open on the chart (its day, `t`), each new `n` once: a big move tapped in the phone's list
 *  (A-25). `link`: the title opens the instrument's own page, in the teal of everything that opens something (the
 *  designer's D-15 and B-23: the tiles of MARKETS and RATES & FX). */
export function ChartPanel({ row, period, tick, sigmaWindow = "m12", shape = "wide", axes = false, volume = false, marks, chartHeight = 150, focus, link = false }: { row: TableRow; period: ChartPeriod; tick: number; sigmaWindow?: SigmaWindow; shape?: "wide" | "square" | "large"; axes?: boolean; volume?: boolean; marks?: ChartMark[]; chartHeight?: number /* the "wide" shape's chart, in px */; focus?: { t: number; n: number } | null; link?: boolean }) {
  // The tile's price and change come from the table row, refreshed every minute. The line itself is refetched
  // as often as its bars change: one-minute bars every minute, 15-minute and hourly bars every five minutes,
  // daily closes every quarter of an hour (a full history per tile per minute is megabytes of traffic an hour).
  // A tile asks for its history only once it is on or near the screen (audit of 15 Nov 2026: the MARKET tab opened
  // with 80 requests at once and needed eleven seconds before the last chart drew; most tiles are below the fold).
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const s = useApi<Series>(seen ? "series" : null, { symbol: row.symbol, range: period }, period === "1D" ? tick : INTRADAY.has(period) ? Math.floor(tick / 5) : Math.floor(tick / 15));
  const [rd, setRd] = useState<{ t: number; v: number; z: number | null; q?: number | null } | null>(null);
  const [pan, setPan] = useState(0);
  const k = PERIOD_KEY[period], known = k ? row.closes[k] : undefined;
  const isRate = isYield(row);
  const m = marketOf(row.market);
  const points = s.data?.points ?? [];
  const windowSec = period === "1D" ? sessionWindow(points) : PERIOD_DAYS[period] * DAY;
  const intraday = INTRADAY.has(period);
  // A daily history that starts inside the window (a young listing; a server from before 5Y and 10Y, which sends
  // five years for them): the change is then measured from the first close there is and says so, never as if it
  // covered the whole period.
  const shortFrom = !intraday && points.length > 1 && known == null && points[0].t > points[points.length - 1].t - windowSec + 10 * DAY ? fmtDate(points[0].t * 1000, "UTC") : null;
  // A searched stock has no stored period anchors: its change over the period is read from the chart's own
  // history (the last point at or before the start of the window against the last print).
  const anchor = (() => {
    if (known != null || !points.length || row.last == null) return known ?? null;
    const startT = points[points.length - 1].t - windowSec;
    let a: number | null = null;
    for (const p of points) { if (p.t <= startT) a = p.v; else break; }
    return a ?? (period === "1D" ? null : points[0].v);
  })();
  const chg = isRate ? (row.last != null && anchor != null ? row.last - anchor : null) : (k ? row.pct[k] : undefined) ?? (anchor != null && anchor !== 0 && row.last != null ? (row.last / anchor - 1) * 100 : null);
  const color = chg == null || chg === 0 ? FLAT : chg > 0 ? UP : DN;
  const z = (x: number | null) => fmtSigma(x, 2);
  const lvl = (v: number | null | undefined) => fmtLevel(v, row.decimals, isRate);   // the instrument's decimals; "%" after a yield
  // "LIVE 13:35 SGT", "CLOSED 19 Nov 13:35 SGT": a tile's panel does not say its times are in SGT, so the tile does
  // (R2B-06); "PUBLISHED 19 Nov 2026" for an official yield and "CLOSED 19 Nov 2026" for a booked close, which have a
  // date and no time of day (R2B-01: they read "19 Nov 08:00", midnight UTC in SGT). The tooltip names the source.
  // Beside CLOSED, when the instrument's market next opens, in SGT ("opens 22:30 SGT"; the owner's request of 20 Nov
  // 2026; lib/opens.ts). A large tile has room for it after the stamp. A small one puts it under the stamp, at the right
  // of the change's line, so the tile gains no line; where the two do not fit on that line it goes under, whole.
  // A page's own chart (the large tile) says why its market is shut before when it opens, and names a holiday the
  // opening passes over: "holiday · opens 24 Nov 08:00 SGT", "opens 24 Nov 08:00 SGT · 23 Nov: holiday" (the designer's
  // D-65: the reasons were in tooltips). A small tile keeps the opening alone until its head is rebuilt (I-9): the longer
  // line would take chart height there.
  // Where the row holds an old price while its market's timetable has a session, the stamp's word is amber (D-66).
  const ses = rowSession(row), stamp = tileStamp(row, new Date(), ses.now), stale = staleInSession(ses);
  const opens = ses.note ? <span className={`opens ${ses.note.kind}`} title={ses.note.tip}>{shape === "large" ? pageLine(ses.note) : ses.note.text}</span> : null;
  // the idle read-out under a daily chart: what is drawn, and on 5Y and 10Y that the big-move circles cover the last
  // three years only (the designer's I-3 note)
  const daily = `daily closes · σ corridors${volume ? " · volume" : ""}${LONG_PERIODS.has(period) && marks?.length ? " · circles: last three years" : ""}${shortFrom ? ` · history from ${shortFrom}` : ""}`;
  const panLabel = pan > 0 ? `← ${pan >= DAY ? `${Math.round(pan / DAY)}d` : `${Math.round(pan / 3600)}h`} back · double-click = latest` : "";
  return (
    <div ref={box} className={`mtile cp ${shape}${row.live ? " live" : ""}`}>
      <div className="lb">
        {link ? <a className="lbtxt lnk" href={`#${pageHash(row.symbol)}`} title={`${row.name} (${row.symbol}): open its page`}>{row.name}</a>
          : <span className="lbtxt" title={`${row.name} (${row.symbol})`}>{row.name}</span>}
      </div>
      <div className="vl">
        <span className="px"><Flash value={row.last}>{lvl(row.last)}</Flash></span>
        <span className="tags">
          {row.proxyFor && <span className="badge proxy" title={`${row.name} stands in for ${row.proxyFor}`}>PROXY</span>}
          {row.live && m && m.delayMin > 0 && <span className="badge delay" title={`${m.name} feed is delayed about ${m.delayMin} minutes`}>{delayed(m.delayMin, true)}</span>}
          {DEV_MOCK && <span className="badge est">MOCK</span>}
          <span className="asof" title={stamp.tip}><span className={`st${stamp.label === "LIVE" ? " live" : ""}${stale ? " stale" : ""}`}>{stamp.label}</span> {stamp.text}</span>
          {shape === "large" && opens}
        </span>
      </div>
      <div className={`ch ${signCls(chg, isRate ? 3 : 2)}`}><span className="chv">{isRate ? fmtChg(chg, 3, true) : fmtPct(chg)} <span className="mut">{shortFrom ? `since ${shortFrom}` : period}{anchor != null ? ` · from ${lvl(anchor)}` : ""}</span></span>{shape !== "large" && opens}</div>
      {points.length
        ? <SigmaChart points={points} windowSec={windowSec} intraday={intraday} decimals={row.decimals} pct={isRate} sigmaWindow={sigmaWindow} onReadout={setRd} onPan={setPan} color={color} fill={shape !== "wide"} height={shape === "wide" ? chartHeight : undefined} axes={axes} volume={volume} marks={marks} focus={focus} />
        : <div className="chartbox empty" style={shape === "wide" ? { height: chartHeight } : undefined}>{s.error ?? (s.loading || !seen ? "loading…" : "no history yet")}</div>}
      <div className="rdout mut" title="Click, hold and drag the chart to the right to go back in time, to the left to come forward; double-click returns to the latest">
        {rd ? <>{intraday ? <>{fmtStamp(rd.t * 1000, SGT)} · {lvl(rd.v)}</> : <>{fmtDate(rd.t * 1000, "UTC")} · {lvl(rd.v)} · {WIN_LABEL[sigmaWindow]} {z(rd.z)}</>}{volume && rd.q != null ? <> · vol {fmtVol(rd.q)}</> : null}</>
          : <span style={{ opacity: .6 }}>{panLabel || (period === "1D" ? "1-minute bars · drag to pan" : intraday ? (s.data?.res === "15m" ? "15-minute bars · drag to pan" : "hourly bars · drag to pan") : `${daily} · drag to pan`)}</span>}
      </div>
    </div>
  );
}
