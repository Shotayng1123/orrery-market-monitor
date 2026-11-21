import { Empty } from "../components/Panel";
import { ChartPanel, CHART_PERIODS, type ChartPeriod } from "../components/ChartPanel";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick } from "../components/Pick";
import { Flash } from "../components/Flash";
import { openAsset } from "../components/CompanyCard";
import { Move, Screen } from "../components/PhoneKit";
import { useApi, DEV_MOCK } from "../lib/useApi";
import { fmtPct, fmtSigma, fmtStampSafe, isYield, signCls } from "./shared";
import { PERIODS, type PeriodKey, type TableRow } from "../lib/types";
import { marketOf } from "../lib/sessions";
import { rowSession, rowStateWords, staleInSession, stateWord } from "../lib/opens";
import { shortName } from "../lib/short";
import { cellBp, cellPct, CurvePanel, levelOf, RANGE_52W, RANGE_52W_TIP, rollTip, SIGMA_1D_TIP, SIGMA_1M, SIGMA_1M_TIP } from "./Market";
import { asOfCell, fmtDate, isOfficialRow, rowAsOf, rowAsOfTitle } from "../lib/time";
import { classLabel, delayed, LAST_SESSION, MOVERS_SIGMA, PERIOD, SIGMA_1D, TAB, TODAY, VS_200D } from "../lib/labels";
import { cellDay, columnTip, commonWindow, dayWords, hasLastSession, lastLine, lastTip, moveParts, moversInSigma, rowDayTip, showsLast, sigmaOf, SIGMA_LINE, SIGMA_QUIET, staleDay, STRIP_N, todayTip, type SigmaMode } from "../lib/movers";
import { pageHash } from "../lib/indices";
import { Sig } from "../components/Sig";
import { InstallLine } from "../components/InstallHint";
import { useInstall } from "../lib/install";
import { NAV_WAIT, useEntryState } from "../lib/nav";

/** MARKET for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026). The same rows and figures as the desktop table,
 *  laid out for a phone instead of shrunk to fit one: a list by asset class with the name, the last level and one
 *  change (over the period picked at the top) at reading size, on rows a finger can hit. A tap opens the row: its
 *  chart, every period, the 1M σ, the 52-week position and the distance to the 200-day average, and a way to its page. */
/** The table's own figure for each period. The tabs offer 1D to 36M (lib/periods.ts CHART_PERIODS); a period the
 *  table keeps no figure for (5Y, 10Y: a stock's page only) would show a dash. */
const KEY: Partial<Record<ChartPeriod, PeriodKey>> = { "1D": "d1", "1W": "w1", "1M": "m1", "3M": "m3", "12M": "m12", "36M": "m36" };

/** The move over a period as the table shows it: a % for prices, the difference in yield (bp) for rates. */
const move = (r: TableRow, k: PeriodKey | undefined): number | null => {
  if (!k) return null;
  if (!isYield(r)) return r.pct[k] ?? null;
  const c = r.closes[k];
  return c != null && r.last != null ? r.last - c : null;
};
const fmtMove = (r: TableRow, v: number | null) => (isYield(r) ? cellBp(v) : cellPct(v));
/** The colour of a move: none when it is a zero at the precision shown (a grey "0.00%", never a red one). */
const moveCls = (r: TableRow, v: number | null) => (isYield(r) ? signCls(v == null ? null : v * 100, 1) : signCls(v, 2));
const level = (r: TableRow) => levelOf(r, r.last);   // the instrument's decimals, "%" after a yield, as on every screen

/** What a line's figure is as of, where the Monitor calls its market neither open nor closed: "Last print 05:00",
 *  "Last print 20 Nov 05:00", "Last close 19 Nov". */
const lastWords = (r: TableRow): string => { const a = rowAsOf(r); return !a ? "as of –" : a.kind === "print" ? `Last print ${asOfCell(a)}` : `Last close ${a.date}`; };
/** A line's state under its name: Live or Delayed ~20m; Closed with when its market next opens, in SGT ("opens 22:30
 *  SGT"; the owner's request of 20 Nov 2026, lib/opens.ts), and in place of Closed why it is shut where the Monitor
 *  knows: "Holiday", "Midday break", "Closed early" (the designer's D-65: a phone has no tooltip to say it). Where the
 *  row is not live while its market's timetable has a session: "Delayed ~20m" with when the session's first print is
 *  due, in its first minutes on a delayed feed; after them what the figure is as of, in amber ("Last print 08:40": the
 *  price is old while its market trades; it read "No new print", which hid the time of the price beside it: D-66),
 *  with since when the market is open, or with the timetable's session where the Monitor does not hold the market's
 *  holidays. "Published" with its date for an official yield, which has no session. For an instrument read in New
 *  York's hours that are not its market's (the dollar index, the Cboe yields, VIX), and for a market the session
 *  table does not keep: what the figure is as of ("Last print 05:00"), in the line's usual colour, with when it is
 *  next read. The line beside the state goes under it, whole, where the two do not fit on one line. */
function Status({ r }: { r: TableRow }) {
  const m = marketOf(r.market), ses = rowSession(r), pub = isOfficialRow(r) ? rowAsOf(r) : null, stale = staleInSession(ses);
  return (
    <span className="mp-st">
      {r.live ? (m && m.delayMin > 0 ? <span className="delay" title={`${m.name} feed is delayed about ${m.delayMin} minutes`}>{delayed(m.delayMin)}</span> : <span className="live">Live</span>)
        : pub ? <span className="pub" title={rowAsOfTitle(r)}>Published {fmtDate(pub.ymd)}</span>
        : <span className={`state${stale ? " stale" : ""}`} title={rowAsOfTitle(r)}>{stale ? lastWords(r) : stateWord(ses) ?? lastWords(r)}</span>}
      {ses.note && <span className={`opens ${ses.note.kind}`} title={ses.note.tip}>{ses.note.text}</span>}
      {r.roll && <span className="roll" title={rollTip(r)}>Roll</span>}
      {r.proxyFor && <span title={`${r.name} stands in for ${r.proxyFor}`}>via {r.symbol}</span>}
    </span>
  );
}

/** The height of a chart that heads a tab (the index on EQUITIES), in px: about a third of the screen, between
 *  240 and 340. Shota, 19 Nov 2026: at the 150px of a line opened in a list it was too small to read. Measured once,
 *  when the page loads: a phone's browser changes the window's height as its bars slide away, and a chart that
 *  followed it would be rebuilt in the middle of a scroll. */
const HEAD_CHART = Math.round(Math.min(340, Math.max(240, (typeof window === "undefined" ? 700 : window.innerHeight) * 0.34)));

function Detail({ r, period, tick, sigmaWindow, head = false }: { r: TableRow; period: ChartPeriod; tick: number; sigmaWindow?: SigmaWindow; head?: boolean }) {
  const rate = isYield(r);
  return (
    <div className="mp-det">
      <div className="mp-full">{r.name} · {r.symbol} · {rowAsOfTitle(r)}{rowStateWords(r)}</div>
      <ChartPanel row={r} period={period} tick={tick} sigmaWindow={sigmaWindow} axes chartHeight={head ? HEAD_CHART : undefined} />
      <div className="mp-grid">
        {PERIODS.map((p) => { const v = move(r, p.key); return <div key={p.key} className={p.label === period ? "cur" : undefined}><span className="k">{p.label}</span><span className={`v ${moveCls(r, v)}`}>{fmtMove(r, v)}</span></div>; })}
      </div>
      <div className="mp-grid two">
        {/* a phone has no tooltip: every row's last session is read here, under its 1D in σ (B-32) */}
        <div title={`${SIGMA_1D_TIP.split(". Click")[0]}. ${columnTip(r)}`}><span className="k">{SIGMA_1D}</span><span className={`v ${signCls(r.z1d, 1)}`}>{fmtSigma(r.z1d)}</span>{lastLine(r) && <span className="ls" title={lastTip(r)}>{lastLine(r)}</span>}</div>
        <div title={SIGMA_1M_TIP}><span className="k">{SIGMA_1M}</span><span className={`v ${signCls(r.z1m, 1)}`}>{fmtSigma(r.z1m)}</span></div>
        <div title={RANGE_52W_TIP}><span className="k">{RANGE_52W}</span><span className="v">{r.pos52 == null ? "–" : `${Math.round(r.pos52)}%`}</span>{r.pos52 != null && <span className="bar"><i style={{ left: `${Math.max(0, Math.min(100, r.pos52))}%` }} /></span>}</div>
        <div title="Last print against the 200-day average (% for prices, bp for yields)"><span className="k">{VS_200D}</span><span className={`v ${signCls(rate && r.vs200 != null ? r.vs200 * 100 : r.vs200, 1)}`}>{r.vs200 == null ? "–" : rate ? cellBp(r.vs200) : fmtPct(r.vs200, 1)}</span></div>
      </div>
      <button type="button" className="mp-more" onClick={() => openAsset(r.symbol)}>Open {shortName(r.symbol, r.name)}'s page &#8250;</button>
    </div>
  );
}

/** One instrument as a line: name and status, the last level, the change over `period`. The status runs under the name
 *  and the level together (`.mp-row.inst`), so "Closed" and when its market opens fit on one line. Opened, it shows the
 *  chart, every period and the statistics under the line. `fixed` keeps it open and makes the line a plain heading (the
 *  index at the top of EQUITIES). Shared by every phone tab that lists instruments from the market table. */
export function InstrumentRow({ r, period, tick, open, onToggle, fixed = false, sigmaWindow }: { r: TableRow; period: ChartPeriod; tick: number; open: boolean; onToggle?: () => void; fixed?: boolean; sigmaWindow?: SigmaWindow }) {
  const v = move(r, KEY[period]);
  // while PERIOD is 1D the pill names the row's day in place of "1D" where its move is not today's (B-32: "-0.53%" over
  // "20 Nov" for the Nikkei 225 on a Tuesday morning after a Monday holiday); for any other period it keeps its period
  const day = period === "1D" ? staleDay(r) : null;
  const line = <><span className="mp-nm"><span className="n">{shortName(r.symbol, r.name)}</span><Status r={r} /></span><span className="mp-px"><Flash value={r.last}>{level(r)}</Flash></span><Move v={v} cls={moveCls(r, v)} w={day ? <span className="day" title={rowDayTip(day)}>{dayWords(day)}</span> : period}>{fmtMove(r, v)}</Move></>;
  return (
    <div className={`mp-item${open || fixed ? " open" : ""}`}>
      {fixed ? <div className="mp-row inst fixed">{line}</div> : <button type="button" className="mp-row inst" aria-expanded={open} onClick={onToggle}>{line}</button>}
      {(open || fixed) && <Detail r={r} period={period} tick={tick} sigmaWindow={sigmaWindow} head={fixed} />}
    </div>
  );
}

const NOTE_FRESH_MS = 36 * 3600e3;

/** Movers in σ on a phone (the designer's I-6 note; B-32 and the first screen of 21 Nov 2026): the first section, one
 *  row of cards of 144 x 76 px that moves sideways and stops on a card, the third card cut at the edge so the row reads
 *  as "more to the right"; each card opens its page. Its head is 44 px: the title over the screen's as-of, and at the
 *  right the choice Today | Last session (drawn where the server sends the last session). A card's second line is the σ
 *  with, at its right, the day of a move that is not today's; its third the change, or "last session -2.2σ" while a
 *  currency's or a future's day is under three hours old. What the figure is and where it is worked out from is a note
 *  under the lists (the designer's verdict on D-14: with the note above them no list row reached a phone's first screen). */
function SigmaCards({ rows, asOf, mode, onMode }: { rows: TableRow[]; asOf: string | null; mode: SigmaMode; onMode: (m: SigmaMode) => void }) {
  const pick = hasLastSession(rows), m: SigmaMode = pick ? mode : "today";
  const top = moversInSigma(rows, STRIP_N, m);
  if (!top.length && !pick) return null;
  const now = new Date();
  return (
    <section className="mp-sec" id="mk-sigma">
      <h2>
        <span><Sig>{MOVERS_SIGMA}</Sig></span>{asOf && <span className="aux">as of {fmtStampSafe(asOf)}</span>}
        {pick && (
          <span className="mp-seg" id="mk-sgpick" role="group" aria-label="Which move each card shows">
            {(["today", "last"] as const).map((k) => <button type="button" key={k} data-mode={k} className={m === k ? "on" : undefined} aria-pressed={m === k} onClick={() => onMode(k)}>{k === "today" ? TODAY : LAST_SESSION}</button>)}
          </span>
        )}
      </h2>
      <div className="mp-sgrow" role="list">
        {top.map((r) => {
          const z = sigmaOf(r, m)!, day = cellDay(r, m, now), young = m === "today" && showsLast(r, now);
          return (
            <a key={r.symbol} role="listitem" className={`mp-sgcard${Math.abs(z) >= SIGMA_LINE ? " hot" : ""}${Math.abs(z) < SIGMA_QUIET ? " quiet" : ""}`} href={`#${pageHash(r.symbol)}`} title={m === "last" ? lastTip(r) : todayTip(r, now)}>
              <span className="nm">{shortName(r.symbol, r.name)}</span>
              <span className="zl"><span className={`z ${signCls(z, 1)}`}>{fmtSigma(z)}</span>{day && <span className="day">{dayWords(day)}</span>}</span>
              {young
                ? <span className="mv ls"><span className="w">{LAST_SESSION.toLowerCase()}</span><span className="f">{fmtSigma(r.ls?.z)}</span></span>
                : <span className="mv">{moveParts(r, m).chg}</span>}
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function MarketPhone({ tick }: { tick: number }) {
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  // The newest morning note, as one line above the list (19 Nov 2026): the table says what moved, the note says
  // why, and until now the second was two taps away with nothing on this screen to say it was there. Shown while
  // it is the news of the day (36 hours); an older one is not offered as today's.
  const notes = useApi<{ rows: Array<{ d: string; title: string; generatedAt: string; kind?: string }> }>("notes", { n: 5 }, Math.floor(tick / 10));
  const note = (notes.data?.rows ?? []).find((n) => (n.kind ?? "daily") !== "weekly" && !!n.title && Date.now() - Date.parse(n.generatedAt) < NOTE_FRESH_MS);
  // the open row, the period and the strip's reading stay with this visit of the list: Back from a page opened here
  // finds them as they were (B-28); a fresh visit starts on 1D and on Today
  const [period, setPeriod] = useEntryState<ChartPeriod>("period", "1D");
  const [open, setOpen] = useEntryState<string | null>("open", null);
  const [mode, setMode] = useEntryState<SigmaMode>("sigma", "today");
  const rows = (table.data?.rows ?? []).filter((r) => r.marketTab !== false).sort((a, b) => a.order - b.order);   // the curated table set
  const groups = new Map<string, TableRow[]>();
  for (const r of rows) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  const pick = hasLastSession(rows), m: SigmaMode = pick ? mode : "today";
  const movers = moversInSigma(rows, STRIP_N, m), strip = movers.length > 0 || pick, win = commonWindow(movers, m);   // the screen's as-of then moves into the strip's head
  const inst = useInstall(), install = !inst.installed && !inst.hidden;
  // The first screen (the designer's D-14 and note (b) of 21 Nov 2026): every block above the list has a fixed height on
  // one line, so no font can move the list: the title row 44 px (the as-of is in the strip's head), the strip's head 44,
  // the cards 76, the morning note and the install line 44 each in one block, the first class head 28. The first list
  // row then starts 386 px down with everything showing, and four whole rows stand above the tab bar on an iPhone SE.
  return (
    <Screen title={TAB.market} slim={strip}
      sub={<>{table.data ? (strip ? null : <>as of {fmtStampSafe(table.data.asOf)}</>) : table.error ? <span className="warn">{table.error}</span> : "loading…"}{DEV_MOCK && <span className="badge est">MOCK</span>}</>}
      right={<Pick label={PERIOD} value={period} options={CHART_PERIODS} onChange={setPeriod} title="The change shown on every line: from the close at the start of this period to the last print (bp for yields)" />}>
      <SigmaCards rows={rows} asOf={table.data?.asOf ?? null} mode={mode} onMode={setMode} />
      {/* the morning note's line stands above the list and comes from an answer of its own: until that answer has come,
          Back holds the list where it stood (lib/nav.ts; B-33's fault: the line arrived after the rows, and the browser
          kept the rows on screen by moving the page, 44 px from where it was left) */}
      {!notes.data && !notes.error && <span {...{ [NAV_WAIT]: "" }} hidden />}
      {(note || install) && (
        <div className="mp-lines" id="mk-lines">
          {note && (
            <a className="mp-line" id="mk-note" href={`#research/${encodeURIComponent(`note:${note.d}`)}`} title={note.title}>
              <span className="tx"><span className="k">Morning note · {fmtDate(note.d)}</span><span className="t">{note.title}</span></span>
              <span className="go" aria-hidden="true">&rsaquo;</span>
            </a>
          )}
          {install && <InstallLine />}
        </div>
      )}
      {rows.length ? [...groups.entries()].map(([cls, rs], i) => (
        <section key={cls} className={`mp-sec${i === 0 && strip ? " first" : ""}`}>
          <h2>{classLabel(cls)}</h2>
          <div className="mp-card">
            {rs.map((r) => {
              const isOpen = open === r.symbol;
              return <InstrumentRow key={r.symbol} r={r} period={period} tick={tick} open={isOpen} onToggle={() => setOpen(isOpen ? null : r.symbol)} />;
            })}
          </div>
        </section>
      )) : <Empty title="Awaiting the data feed">{table.error ?? "The market list fills once the first prices arrive."}</Empty>}
      {/* what Movers in σ measures, under the lists (it stood between the cards and the lists) */}
      {strip && <p className="mp-note" id="mk-sigma-note">Movers in σ: the day's change ÷ σ of its daily changes, 63 sessions.{pick ? " Last session: each instrument's newest completed day, between its last two booked closes." : ""} † Worked out by the Monitor from the daily closes{win ? `, mostly ${fmtDate(win.from)} – ${fmtDate(win.to)}` : ""}.</p>}
      {rows.length > 0 && (
        <section className="mp-sec">
          <h2>Yield curves</h2>
          <div className="mp-card pad"><CurvePanel period={period} tick={tick} /></div>
        </section>
      )}
      <p className="mp-src">Yahoo Finance, US Treasury, Japan MOF. Delayed and stand-in feeds are marked on their line.</p>
    </Screen>
  );
}
