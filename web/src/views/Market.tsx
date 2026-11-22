import { Fragment, useState, type ReactNode } from "react";
import { Empty, Panel } from "../components/Panel";
import { ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import { TileGrid } from "../components/TileGrid";
import type { SigmaWindow } from "../components/SigmaChart";
import { CurveChart, spread } from "../components/CurveChart";
import { useApi, DEV_MOCK } from "../lib/useApi";
import { fmtPct, fmtChg, fmtLevel, fmtSigma, fmtStampSafe, isYield, signCls } from "./shared";
import { cellBp, cellPct } from "../lib/fmt";
import { pageHash } from "../lib/indices";
import { openAsset } from "../components/CompanyCard";
import { fmtDate, fmtDayMon, rowAsOfTitle } from "../lib/time";
import { classLabel, delayed, dottedLine, FX, LAST_SESSION, MOVERS_SIGMA, RANGE_52W as RANGE_WORD, RATES, SIGMA_1D, SIGMA_1M as SIGMA_WORD, TODAY, VS_200D } from "../lib/labels";
import { cellDay, columnTip, commonWindow, dayWords, hasLastSession, lastTip, moveParts, moversInSigma, rowDayTip, showsLast, sigmaOf, SIGMA_LINE, SIGMA_QUIET, sortBySigma, staleDay, STRIP_N, todayTip, type SigmaMode, stillLive } from "../lib/movers";
import { useEntryState } from "../lib/nav";
import { codeOf, monthOf } from "../lib/futures";
import { Flash } from "../components/Flash";
import { PERIODS, type Curve, type TableRow } from "../lib/types";
import { marketOf } from "../lib/sessions";
import { panelRowOf, rowStateWords } from "../lib/opens";
import { ClosedNow } from "../components/ClosedNow";
import { filterCurve } from "../lib/curveTenors";
import { shortName } from "../lib/short";
import { Sig } from "../components/Sig";

/** The words of the table's statistics, the same on every screen that shows them (the designer's D-11, 19 Nov 2026;
 *  the glossary, lib/labels.ts): "σ vs 1M avg" (upper-cased, a σ would read as the sum sign Σ, so the glyph keeps its
 *  case) and "52W range" in %. */
export const SIGMA_1M = SIGMA_WORD, RANGE_52W = RANGE_WORD;
export const SIGMA_1M_TIP = "Distance of the last print from its 21-session average, in standard deviations of those 21 closes (the 1M corridor on the charts)";
export const RANGE_52W_TIP = "Where the last print sits in its 52-week range: 0% is the low, 100% the high";

/** "MOVERS IN σ": a title upper-cased in code, with the σ kept lower case (upper-cased it is Σ, the sum sign: D-11). */
export const upperSigma = (s: string): string => s.replace(/[^σ]+/g, (x) => x.toUpperCase());
/** A future's day across a change of contract (B-27): what the ROLL mark beside its name says. */
export const rollTip = (r: TableRow): string => !r.roll ? "" : `A change of contract on ${fmtDate(r.roll.d)}: Yahoo's front-month series moved ${r.roll.from ? `from ${monthOf(r.roll.from)} (${codeOf(r.roll.from)}) ` : ""}to ${monthOf(r.roll.to)} (${codeOf(r.roll.to)}). ${r.roll.step != null ? `The 1D is the change within ${monthOf(r.roll.to)}; the change of contract (${r.roll.step >= 0 ? "+" : ""}${r.roll.step.toFixed(2)}%) is not a move and is left out of the 1D, its σ and the alerts.` : "The source does not give the new contract's close before it: the 1D is the series' own, across the change of contract, and has no σ."}`;
/** The marks beside a name in the table, in their order: a change of contract today, a stand-in instrument, a delayed
 *  or a live feed. One list for the screen and for the panel's CSV, where they are a column of their own. */
function marksOf(r: TableRow): Array<{ cls: string; text: string; tip?: string }> {
  const m = marketOf(r.market), out: Array<{ cls: string; text: string; tip?: string }> = [];
  if (r.roll) out.push({ cls: "roll", text: "ROLL", tip: rollTip(r) });
  if (r.proxyFor) out.push({ cls: "proxy", text: "PROXY", tip: `${r.name} stands in for ${r.proxyFor}: its prices are Yahoo Finance's; the index's own value is not read` });
  // a row the answer called live, held past the feed's delay and a few minutes (a kept copy, refreshes that fail), is
  // no longer live: its day stands after its name instead (SF-3 of the review of fix part 1: "USD/JPY LIVE 20 Nov")
  const live = stillLive(r);
  if (live && m && m.delayMin > 0) out.push({ cls: "delay", text: delayed(m.delayMin, true), tip: `${m.name} feed is delayed about ${m.delayMin} minutes` });
  if (live && m && m.delayMin === 0) out.push({ cls: "live", text: "LIVE" });
  return out;
}
/** `nocsv`: the marks are not part of the name in the panel's CSV (components/Panel.tsx); the name cell names them there. */
function Badges({ r }: { r: TableRow }) {
  return <>{marksOf(r).map((b) => <span key={b.cls} className={`badge ${b.cls} nocsv`} title={b.tip}>{b.text}</span>)}</>;
}
/** The two columns the name cell adds to the panel's CSV: its marks, and the day its figures are of where that is not
 *  today in Singapore (what stands after the name on screen). */
export const NAME_CSV_HEADS = ["Marks", "Figures of (blank: today in SGT)"];
/** The same, for an answer that carries no days (a server of before 21 Nov 2026): no blank can be said to be today's
 *  (SF-4 of the review of fix part 1). The file's name carries the day in Singapore (components/Panel.tsx). */
export const nameCsvHeads = (days: boolean): string[] => (days ? NAME_CSV_HEADS : ["Marks", "Figures of (not known: this answer carries no days)"]);

/** A level as every screen writes it: the instrument's own decimals (the instruments table), "%" after a yield
 *  (the designer's D-05 and D-44, I-5): USD/JPY "158.400", the Nikkei "57,000.00", UST 2Y "4.510%". The table used
 *  to cut a level to one decimal from 100 and to two from 10, so USD/JPY read 158.4 here and 158.400 on RATES & FX. */
export const levelOf = (r: Pick<TableRow, "decimals" | "group" | "symbol">, v: number | null | undefined): string => fmtLevel(v, r.decimals, isYield(r));

/** Table cells are narrow: moves of 100% or 100bp and more drop one decimal so the figure is never cut off
 *  (the base level stays in the cell's tooltip). Written once in lib/fmt.ts, for an instrument's page too. */
export { cellBp, cellPct };

/** One table (Shota): the level only as of now, every window as a % change (bp for a yield), the day's change in σ
 *  right after 1D (I-6), then σ vs 1M avg, the 52W range in % and the distance to the 200-day average. The asset class
 *  is the section bar, not a column. 1D IN σ's header sorts by |σ| within each bar (the designer's I-6 note: the strip
 *  above gives the ranking across classes); a second click puts the table's own order back. */
function MarketsTable({ rows }: { rows: TableRow[] }) {
  const [bySigma, setBySigma] = useState(false);
  const ordered = [...rows].sort((a, b) => a.order - b.order);
  return <OneTable rows={bySigma ? sortBySigma(ordered) : ordered} bySigma={bySigma} onSigma={() => setBySigma(!bySigma)} />;
}
export const SIGMA_1D_TIP = "Today's change over the σ of the instrument's own daily changes in the 63 sessions before it (bp for yields, % for the rest). Each row's tooltip also gives its last completed session. Click to sort by its size within each bar; click again for the table's order";
function OneTable({ rows, bySigma, onSigma }: { rows: TableRow[]; bySigma: boolean; onSigma: () => void }) {
  const groups = new Map<string, TableRow[]>();
  for (const r of rows) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  return (
    <table className="mkt">
      <colgroup><col className="nm" /><col className="lv" />{PERIODS.map((p) => <Col key={p.key} d1={p.key === "d1"} />)}<col className="n" /><col className="n" /><col className="n" /></colgroup>
      <thead>
        <tr>
          <th className="l" data-csv={JSON.stringify(nameCsvHeads(rows.some((r) => r.ls !== undefined)))}>Name</th><th>Last</th>
          {PERIODS.map((p) => (
            <Head key={p.key} d1={p.key === "d1"} bySigma={bySigma} onSigma={onSigma}>
              <th className={p.key === "d1" ? "grp" : ""} title={`Change from the close at the start of the ${p.label} window to the last print (bp for yields)`}>{p.label}</th>
            </Head>
          ))}
          <th className="grp wrap" title={SIGMA_1M_TIP}><Sig>{SIGMA_1M}</Sig></th><th className="wrap" title={RANGE_52W_TIP}>{RANGE_52W}</th><th title="Last print against the 200-day average (% for prices, bp for yields)">{VS_200D}</th>
        </tr>
      </thead>
      <tbody>{[...groups.entries()].map(([cls, rs]) => <GroupRows key={cls} cls={cls} rs={rs} />)}</tbody>
    </table>
  );
}
/** The 1D column, then 1D IN σ beside it: the day's change and its size in σ read together. */
const Col = ({ d1 }: { d1: boolean }) => (d1 ? <><col className="n" /><col className="n z" /></> : <col className="n" />);
function Head({ d1, bySigma, onSigma, children }: { d1: boolean; bySigma: boolean; onSigma: () => void; children: ReactNode }) {
  if (!d1) return <>{children}</>;
  return <>{children}<th className={`wrap sortable${bySigma ? " on" : ""}`} id="mk-zsort" title={SIGMA_1D_TIP} aria-sort={bySigma ? "descending" : "none"} onClick={onSigma}><Sig>{SIGMA_1D}</Sig>{bySigma ? " ▼" : ""}</th></>;
}

// Conditional shading, as in a spreadsheet: the level cells of a row are shaded on a red-to-green scale between
// the row's lowest and highest level (last print included), so the eye sees where today sits in three years;
// the change cells are shaded by sign and size (full tint at ±10%, or ±50bp for yields).
const UP_RGB = "63,208,126", DN_RGB = "255,77,66";
function levelShade(v: number | null | undefined, lo: number, hi: number): string | undefined {
  if (v == null || !(hi > lo)) return undefined;
  const x = (v - lo) / (hi - lo);                       // 0 = lowest level of the row, 1 = highest
  const a = Math.abs(x - 0.5) * 2 * 0.32;               // transparent in the middle, tinted at the ends
  return `rgba(${x >= 0.5 ? UP_RGB : DN_RGB},${a.toFixed(3)})`;
}
/** A change cell's tint: full at ±`full` (±10% for a price, ±0.5 points = ±50bp for a yield). WATCHLIST shades a
 *  yield's cells with it too, so the two read alike. */
export function changeShade(v: number | null | undefined, full: number): string | undefined {
  if (v == null || v === 0) return undefined;
  const a = Math.min(1, Math.abs(v) / full) * 0.38;
  return `rgba(${v > 0 ? UP_RGB : DN_RGB},${a.toFixed(3)})`;
}

function GroupRows({ cls, rs }: { cls: string; rs: TableRow[] }) {
  return (
    <>
      <tr className="cls"><td colSpan={6 + PERIODS.length}><span>{classLabel(cls)}</span></td></tr>
      {rs.map((r) => {
        const isRate = isYield(r);
        // B-32: a row whose last figure is not from today in Singapore carries its day after the name and its badges
        // ("Nikkei 225 20 Nov": its LAST, 1D and 1D in σ are that day's); a live row carries none. Not a badge: no box
        const day = staleDay(r);
        // every row opens its instrument's page (the designer's D-15, B-23): the name a teal link, the row a pointer.
        // Its tooltip says whether its market is open, and when a closed one next opens, in SGT (lib/opens.ts)
        return (
          <tr key={r.symbol} className={`click${stillLive(r) ? " live" : ""}`} title={`${r.symbol} · ${rowAsOfTitle(r)}${rowStateWords(r)} · open its page`} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) openAsset(r.symbol); }}>
            <td className="l" title={`${r.name} (${r.symbol})`} data-csv={JSON.stringify([marksOf(r).map((b) => b.text).join(" "), day ? fmtDate(day) : ""])}><a className="lnk" href={`#${pageHash(r.symbol)}`}>{shortName(r.symbol, r.name)}</a><Badges r={r} />{day && <span className="asday nocsv" title={rowDayTip(day)}>{dayWords(day)}</span>}</td>
            <td className="num"><Flash value={r.last}><b>{levelOf(r, r.last)}</b></Flash></td>
            {PERIODS.map((p) => {
              const c = r.closes[p.key];
              const v = isRate ? (c != null && r.last != null ? r.last - c : null) : r.pct[p.key];
              const cell = <td key={p.key} className={`num ${signCls(isRate && v != null ? v * 100 : v, isRate ? 1 : 2)}${p.key === "d1" ? " grp" : ""}`} style={{ background: changeShade(v, isRate ? 0.5 : 10) }} title={c != null ? `from ${levelOf(r, c)} on ${fmtDate(r.closeDates[p.key])}${p.key === "d1" && r.roll?.step != null ? ` (${monthOf(r.roll.to)}'s own close: ${rollTip(r)})` : ""}` : ""}>{isRate ? cellBp(v) : cellPct(v)}</td>;
              // 1D IN σ right after 1D: "+2.7σ", shaded full at ±4σ (the designer's I-6 note). A roll day's mark is beside
              // the name; in the one-screen layout an R after this figure instead (the stylesheet's, so the cell's text
              // stays the figure), as the narrow name cell would put the DELAYED badge behind an ellipsis (the reviewer's S3)
              return p.key === "d1" ? <Fragment key={p.key}>{cell}<td className={`num z ${signCls(r.z1d, 1)}${r.roll ? " rolled" : ""}`} style={{ background: changeShade(r.z1d ?? null, 4) }} title={columnTip(r)}>{fmtSigma(r.z1d)}</td></Fragment> : cell;
            })}
            <td className={`num grp ${signCls(r.z1m, 1)}`} style={{ background: changeShade(r.z1m ?? null, 3) }}>{fmtSigma(r.z1m)}</td>
            <td className="num" style={{ background: r.pos52 == null ? undefined : levelShade(r.pos52, 0, 100) }}>{r.pos52 == null ? "–" : `${Math.round(r.pos52)}%`}</td>
            <td className={`num ${signCls(isRate && r.vs200 != null ? r.vs200 * 100 : r.vs200, 1)}`} style={{ background: changeShade(r.vs200 ?? null, isRate ? 0.75 : 15) }}>{r.vs200 == null ? "–" : isRate ? cellBp(r.vs200) : fmtPct(r.vs200, 1)}</td>
          </tr>
        );
      })}
    </>
  );
}

function ChartGroup({ no, k, title, rows, period, tick, sigmaWindow, show, children }: { no: string; k: string; title: string; rows: TableRow[]; period: ChartPeriod; tick: number; sigmaWindow: SigmaWindow; show: number; children?: React.ReactNode }) {
  return (
    <Panel no={no} k={k} title={title} span={12} aux={`${rows.length} panels · ${period}`}>
      {children}
      {rows.length ? <TileGrid n={rows.length} rows={show} group="market">{rows.map((r) => <ChartPanel key={r.symbol} row={r} period={period} tick={tick} sigmaWindow={sigmaWindow} link />)}</TileGrid> : <Empty title="No instruments in this group yet" />}
    </Panel>
  );
}

export function CurvePanel({ period, tick }: { period: ChartPeriod; tick: number }) {
  const ago = period === "1D" || period === "1W" ? "1M" : period;
  const us = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: "US", ago }, Math.floor(tick / 30));   // curves are daily
  const jp = useApi<{ current: Curve | null; ghost: Curve | null }>("curve", { country: "JP", ago }, Math.floor(tick / 30));
  const one = (label: string, raw: { current: Curve | null; ghost: Curve | null } | null, err: string | null) => {
    const d = raw ? { current: filterCurve(raw.current, "std"), ghost: filterCurve(raw.ghost, "std") } : null;
    return (
    <div className="mtile cp">
      <div className="lb"><span className="lbtxt">{label}</span><span className="asof">{d?.current ? `${fmtDate(d.current.date)} · ${dottedLine(fmtDate(d.ghost?.date), ago)}` : ""}</span></div>
      {d?.current ? (
        <>
          <CurveChart current={d.current} ghost={d.ghost} />
          <div className="rdout mut crv">
            2s10s {fmtChg(spread(d.current, 2, 10), 0)}bp · 10s30s {fmtChg(spread(d.current, 10, 30), 0)}bp
            {d.ghost && <> · vs {ago} ago: 2s10s {fmtChg((spread(d.current, 2, 10) ?? 0) - (spread(d.ghost, 2, 10) ?? 0), 0)}bp</>} · {d.current.source}
          </div>
        </>
      ) : <div className="empty" style={{ minHeight: 190 }}>{err ?? "no curve yet"}</div>}
    </div>
    );
  };
  return <div className="cgrid two">{one("US TREASURY CURVE", us.data, us.error)}{one("JGB CURVE", jp.data, jp.error)}</div>;
}

/** The strip's two readings as two joined chips right after its title (B-32; the designer's note of 21 Nov 2026):
 *  TODAY, the change since the last booked close, and LAST SESSION, each instrument's newest completed day. The current
 *  one is filled; Left and Right move between them. Drawn only where the server sends the last session. */
function SigmaPick({ mode, onMode }: { mode: SigmaMode; onMode: (m: SigmaMode) => void }) {
  const TIP: Record<SigmaMode, string> = {
    today: "The change since each instrument's last booked close, over the σ of the 63 daily changes before it",
    last: "Each instrument's newest completed day: the change between its last two booked closes, over the σ of the 63 daily changes before it. A currency's and a future's day ends at 17:00 New York",
  };
  const go = (to: SigmaMode, from: HTMLElement) => { onMode(to); from.parentElement?.querySelector<HTMLElement>(`[data-mode="${to}"]`)?.focus(); };
  return (
    <span className="sgpick" id="mk-sgpick" role="group" aria-label="Which move each cell shows">
      {(["today", "last"] as const).map((k) => (
        <button type="button" key={k} data-mode={k} className={`chip-sm${mode === k ? " on" : ""}`} aria-pressed={mode === k} title={TIP[k]} onClick={() => onMode(k)}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); go("today", e.currentTarget); } else if (e.key === "ArrowRight") { e.preventDefault(); go("last", e.currentTarget); } }}>
          {(k === "today" ? TODAY : LAST_SESSION).toUpperCase()}
        </button>
      ))}
    </span>
  );
}

/** MOVERS IN σ (I-6; B-06 (a), the designer's I-6 note): the ten largest moves in σ, any class, one row of ten cells
 *  (two rows of five under 1,100 CSS px), each a link to its page: the name, "+2.7σ" in its sign's colour, the change
 *  and the level under it. At the alert line (2.5σ) a cell gets an amber border; under 1.5σ it is lettered muted. The
 *  closes each figure is worked out from are on the cell's tooltip; the line under the strip names the window most of
 *  them share.
 *  B-32 (21 Nov 2026): two readings, TODAY and LAST SESSION, chosen right after the title; the day of a move that is not
 *  today's at the right of its σ, and under Last session every session's date with its change and its close; under
 *  Today, "last session -2.2σ" in place of the change and the level while a currency's or a CME future's day is under
 *  three hours old (lib/movers.ts). In the one-screen layout a cell takes two lines: the name and the σ, then the day
 *  and the change. */
function SigmaStrip({ rows, loading, asOf, mode, onMode }: { rows: TableRow[]; loading: boolean; asOf: string | null; mode: SigmaMode; onMode: (m: SigmaMode) => void }) {
  const pick = hasLastSession(rows), m: SigmaMode = pick ? mode : "today", now = new Date();
  const top = moversInSigma(rows, STRIP_N, m), win = commonWindow(top, m);
  // what the cells show changes with the choice; a yield's cell now names its day, so the head no longer says when an
  // official yield's day counts. A server from before the last session keeps the head it had
  const what = m === "last" ? "each instrument's last completed day ÷ σ of the 63 daily changes before it" : pick ? "the day's change ÷ σ of its daily changes, 63 sessions" : "today's change ÷ σ of daily changes, 63 sessions · official-curve yields once their day is booked";
  // the head names when its figures are as of, as the phone's does (the designer's §3.3; the reviewer's S1)
  return (
    <Panel no="01" k="sigma" title={upperSigma(MOVERS_SIGMA)} after={pick ? <SigmaPick mode={m} onMode={onMode} /> : undefined} aux={<>{what}{asOf ? <> · <span id="mk-sigma-asof">as of {fmtStampSafe(asOf)}</span></> : null}{DEV_MOCK && <span className="badge est">MOCK</span>}</>}>
      {top.length ? (
        <>
          <div className="sgstrip" id="mk-sigma" data-mode={m} data-ls={pick ? "" : undefined}>
            {top.map((r) => {
              const z = sigmaOf(r, m)!, day = cellDay(r, m, now), young = m === "today" && showsLast(r, now), p = moveParts(r, m);
              return (
                <a key={r.symbol} className={`sgcell${Math.abs(z) >= SIGMA_LINE ? " hot" : ""}${Math.abs(z) < SIGMA_QUIET ? " quiet" : ""}`} href={`#${pageHash(r.symbol)}`} title={`${r.name} (${r.symbol}) · ${m === "last" ? lastTip(r) : todayTip(r, now)}`}>
                  <span className="nm">{shortName(r.symbol, r.name)}</span>
                  <span className="zl"><span className={`z ${signCls(z, 1)}`}>{fmtSigma(z)}</span>{day && <span className="day" title={fmtDate(day)}>{dayWords(day)}</span>}</span>
                  {young
                    ? <span className="mv"><span className="ls" title={`${r.name} (${r.symbol}) · ${lastTip(r)}`}>{LAST_SESSION.toLowerCase()} <span className="f">{fmtSigma(r.ls?.z)}</span></span></span>
                    : <span className="mv">{day && <span className="d2">{dayWords(day)} · </span>}<span className="cg">{p.chg}</span><span className="lv"> · {p.lvl}</span></span>}
                </a>
              );
            })}
          </div>
          {/* one line (the designer's D-69): what a future's changes of contract do to its σ is on each future's tooltip,
              on its page and in Help */}
          <div className="mut finnote sgnote" id="mk-sigma-note">{"\u2020"} worked out here from the Monitor's daily closes{win ? `, mostly ${win.from.slice(0, 4) === win.to.slice(0, 4) ? fmtDayMon(win.from) : fmtDate(win.from)} – ${fmtDate(win.to)}` : ""} · each cell's own window on its tooltip</div>
        </>
      ) : loading ? <div className="empty sgempty">loading…</div> : <Empty title={rows.length ? "No moves in σ yet" : "Awaiting the data feed"}>{rows.length ? "The server sends each instrument's σ of daily changes with the table once its update is deployed." : null}</Empty>}
    </Panel>
  );
}

export function MarketView({ tick }: { tick: number }) {
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  // the strip's reading stays with this visit (Back returns to it); a fresh visit of MARKETS starts on TODAY
  const [sgMode, setSgMode] = useEntryState<SigmaMode>("sigma", "today");
  const all = table.data?.rows ?? [];
  const rows = all.filter((r) => r.marketTab !== false);   // the curated table; every instrument keeps a chart below
  // one screen, or a phone: charts for the table set only (on a phone every instrument's chart made a page twenty thousand pixels long)
  const compact = typeof document !== "undefined" && (document.body.classList.contains("term") || window.innerWidth <= 720);
  const by = (g: string) => (compact ? rows : all).filter((r) => r.group === g && r.chart !== false).sort((a, b) => a.order - b.order);
  const selector = <PeriodBar period={period} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} />;
  return (
    <>
      <SigmaStrip rows={rows} loading={!table.data && !table.error} asOf={table.data?.asOf ?? null} mode={sgMode} onMode={setSgMode} />
      <Panel no="02" k="mkt" title="MARKETS" aux={table.data ? <>as of {fmtStampSafe(table.data.asOf)} · Yahoo Finance, US Treasury, MOF{DEV_MOCK && <span className="badge est">MOCK</span>}</> : table.error ? <span className="warn">{table.error}</span> : "loading…"}>
        {/* which of the table's markets are shut, and when each opens, on screen without a hover (the designer's D-62) */}
        {rows.length > 0 && <ClosedNow id="mk-opens" rows={rows.map(panelRowOf)} />}
        {rows.length ? <div className="mktbox"><MarketsTable rows={rows} /></div> : <Empty title="Awaiting the data feed">{table.error ?? "The market table fills once the Monitor backend is deployed and its first daily history run has completed."}</Empty>}
      </Panel>
      <div className="c12">{selector}</div>
      <ChartGroup no="03" k="mk-eq" title="EQUITIES" show={2} rows={by("equity")} period={period} tick={tick} sigmaWindow={sigmaWindow} />
      <ChartGroup no="04" k="mk-rates" title={RATES.toUpperCase()} show={2} rows={by("rates")} period={period} tick={tick} sigmaWindow={sigmaWindow}>
        <div className="mkt-curves">
          <div className="minih">Yield curves · today vs {period === "1D" || period === "1W" ? "1M" : period} ago</div>
          <CurvePanel period={period} tick={tick} />
          <div className="minih" style={{ marginTop: 8 }}>Yields</div>
        </div>
      </ChartGroup>
      <ChartGroup no="05" k="mk-fx" title={FX.toUpperCase()} show={1} rows={by("fx")} period={period} tick={tick} sigmaWindow={sigmaWindow} />
      <ChartGroup no="06" k="mk-cmdty" title="COMMODITIES" show={1} rows={by("cmdty")} period={period} tick={tick} sigmaWindow={sigmaWindow} />
    </>
  );
}
