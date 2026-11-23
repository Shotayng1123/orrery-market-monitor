import { useState, type ReactNode } from "react";
import { Empty, Panel, SrcParts } from "../components/Panel";
import { ASSET_PERIODS, ChartPanel, type ChartPeriod } from "../components/ChartPanel";
import { PeriodBar } from "../components/PeriodBar";
import type { SigmaWindow } from "../components/SigmaChart";
import { money } from "../components/CompanyCard";
import { FinTable } from "../components/FinTable";
import { Star } from "../components/Star";
import { StockNews } from "../components/StockNews";
import { ScreenChips, screensOf, type ScreenSection } from "../components/ScreenChips";
import { useApi } from "../lib/useApi";
import { termMode } from "../lib/prefs";
import type { TableRow } from "../lib/types";
import { pageLive } from "../lib/opens";
import { fmtNum, fmtPct, signCls, stockDecimals } from "../lib/fmt";
import { fmtDate, fmtStamp } from "../lib/time";
import { avgTurnover, avgVolume, LARGEST_FALL, MEMBERS_SOURCE, MKT_CAP, NEWS, NEXT_RESULTS, PERSONAL_USE, RANGE_52W, REALISED_VOL } from "../lib/labels";
import { PersonalUse } from "../components/PersonalUse";
import { chartMarks, finSections, fmtCount, fmtPc, fmtPp, fmtX, isSmallMove, moveParts, moveRule, noDocWhy, periodDoc, siteOf, whyText, type Fin, type MoveRow, type StockPage } from "../lib/stock";
import { fmtResultsDate, resultsTip, resultsWords } from "../lib/results";
import { AssetViewLegacy, stockMarketOf } from "./AssetLegacy";
import { InstrumentView } from "./Instrument";
import { isInstrumentPage } from "../lib/instrument";

/** The exchange whose hours a stock keeps, by its symbol (the server's rule, lib/sessions.ts stockMarket); "" for an
 *  exchange the Monitor keeps no session times for. Until 20 Nov 2026 every suffix it did not know read as New York. */
export { stockMarketOf };
/** A stock's decimals: the stocks' rule of every screen (lib/fmt.ts stockDecimals). */
export const decimalsOf = (price: number | null): number => stockDecimals(price);
/** The row the chart tile wants, made from the stock's quote. The stock route sends no `live`: the page reads it from
 *  the session table and the quote's own time (lib/opens.ts pageLive), so the tile says LIVE in the exchange's hours,
 *  and CLOSED with when it next opens outside them (until 20 Nov 2026 a stock's tile said CLOSED at every hour). */
export const chartRow = (d: StockPage): TableRow => { const market = stockMarketOf(d.symbol); return { symbol: d.symbol, name: d.name, cls: "Equities", market, currency: d.currency ?? "", decimals: decimalsOf(d.price), group: "equity", order: 0, last: d.price, lastAt: d.asOf, live: pageLive(market, d.asOf), closes: { d1: d.prevClose }, closeDates: {}, pct: { d1: d.pct } }; };

/** The credit for a Tokyo company's index memberships, which come from the index publishers' own files (Nikkei's weights
 *  file, JPX's list of TSE-listed issues: the owner's P4, "each credited"); the tooltip of the memberships where the page
 *  names them (WD-6 of the final review of pull request #50: the line credited Yahoo Finance alone). None for a
 *  membership from another list. */
export function membersCredit(indices: string[]): string | undefined {
  const named = indices.map((x) => MEMBERS_SOURCE[x]?.full).filter((x): x is string => !!x);
  return named.length ? `${named.join(" ")} Used for ${PERSONAL_USE} (Help: Data sources · ${PERSONAL_USE}).` : undefined;
}
/** The same credit drawn after the memberships, by publisher, "NK225, TOPIX (Nikkei, JPX · personal use)": a tooltip is
 *  read on hover only, and on a touch screen not at all, where the line read as Yahoo Finance's (WD-6, the check of fix
 *  part 3). "personal use" opens Help's paragraph, as on every line that names those files. Nothing for a membership
 *  from another list (the S&P 500's and the Nasdaq-100's are not theirs). */
export function MembersBy({ indices }: { indices: string[] }) {
  const who = indices.map((x) => MEMBERS_SOURCE[x]?.short.replace(/^members: /, "")).filter((x): x is string => !!x);
  return who.length ? <span id="st-members-by" title={membersCredit(indices)}> ({who.join(", ")} · <PersonalUse />)</span> : null;
}
/** What the short figure is, in a few words, by its source. */
export function shortLine(d: StockPage): { label: string; value: string; title: string } {
  const s = d.short;
  if (!s) return { label: "Short interest", value: "–", title: "No short data reported for this name" };
  if (s.kind === "jpx") return { label: "Short interest (reported)", value: `${(s.ratio * 100).toFixed(2)}%${s.daysToCover != null ? ` · ${s.daysToCover.toFixed(1)}d` : ""}`, title: `Sum of the short positions of 0.5% of shares or more reported to the exchange, as of ${fmtDate(s.d)}; smaller positions are not disclosed. Days = those shares over the average daily volume (60d).` };
  if (s.kind === "interest") return { label: "Short interest", value: s.shares == null ? "–" : `${fmtCount(s.shares)}${s.pctFloat != null ? ` · ${s.pctFloat.toFixed(1)}% of float` : ""}`, title: `Shares sold short as of ${fmtDate(s.d)} (exchange-reported, twice a month; via Yahoo Finance)` };
  return { label: "Short volume share", value: `${(s.ratio * 100).toFixed(0)}%`, title: `FINRA: the share of the day's reported volume that was sold short, ${fmtDate(s.d)}. This is not short interest.` };
}

export function GuidanceLine({ f }: { f: Fin }) {
  const g = f.guidance;
  if (!g) return null;
  const fc = f.annual.periods.find((p) => p.kind === "FC");
  const parts = (["revenue", "op", "ordinary", "ni"] as const).filter((k) => g.progress[k] != null).map((k) => `${{ revenue: "revenue", op: "operating profit", ordinary: "ordinary profit", ni: "net income" }[k]} ${fmtPc(g.progress[k])}`);
  return (
    <div className="finguide">
      <b>Company guidance{fc ? ` · ${fc.label}` : ""}</b>{g.disclosed ? ` · disclosed ${fmtDate(g.disclosed)}` : ""}
      {parts.length > 0 && g.ytdMonths != null && <> · after {g.ytdMonths} months of the year: {parts.join(", ")} of the full-year figure</>}
    </div>
  );
}

/** One big move in the list under the chart: when, what, why, and where the reason was read. */
export function MoveWhy({ m }: { m: MoveRow }) {
  return <>{whyText(m)}{m.sources.length > 0 && <span className="mut">{m.sources.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer" title={x.title}>{siteOf(x.url)}</a>)}</span>}</>;
}

/** A big move in words (the designer's D-27, 20 Nov 2026): the turn as a small muted word (none for a day's move),
 *  the figure in the colour of its sign, as every figure on the Monitor, and the rest muted. The dot and the circle
 *  keep the turn's colour, a peak red and a bottom green. */
export function MoveText({ m }: { m: MoveRow }) {
  const p = moveParts(m);
  return <span className="mvx">{p.word && <><span className="mvw">{p.word}</span> </>}<span className={`mvf ${signCls(m.pct, 1)}`}>{p.fig}</span> <span className="mvr">{p.rest}</span></span>;
}

const STD: Record<string, string> = { JP: "Japanese GAAP", IFRS: "IFRS", USGAAP: "US GAAP" };
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** A Tokyo company's fiscal year end, accounting standard and latest annual report, from the statements the page
 *  already holds (A-27's Japan part, shown now: the latest fiscal year from the 有価証券報告書 in EDINET DB's answer).
 *  Null for statements from elsewhere. */
export function profileOf(f: Fin | null): { label: string; month: string; std: string; doc: ReturnType<typeof periodDoc>; none: string } | null {
  if (!f || f.source !== "edinetdb") return null;
  const fy = [...f.annual.periods].reverse().find((p) => p.kind === "FY" && p.doc);
  if (!fy) return null;
  return { label: fy.label, month: MONTH[Number(fy.end.slice(5, 7)) - 1] ?? "–", std: (fy.std && STD[fy.std]) ?? "–", doc: periodDoc(fy), none: noDocWhy(fy) };
}

function KV({ k, children, title, cls }: { k: ReactNode; children: ReactNode; title?: string; cls?: string }) {
  return <tr title={title}><td className="l">{k}</td><td className={`num${cls ? ` ${cls}` : ""}`}>{children}</td></tr>;
}

/** A stock's page in the one-screen layout (the designer's §4.6, its compact screens with the panels that exist today):
 *  Overview (the chart, KEY DATA, PERFORMANCE), News (NEWS, BIG MOVES, SHORT INTEREST; RESULTS joins with I-14) and
 *  Financials, switched by GO TO (components/ScreenChips.tsx). */
export type StockScreen = "overview" | "news" | "fin";
/** Single-asset page (#asset/SYMBOL; Shota, 18 Nov 2026): the chart with its σ corridors and volume, the key
 *  figures a portfolio manager checks first, the price change over each horizon against the benchmark, the stock's
 *  headlines and alerts, its big moves, short interest, and the statements for ten years with guidance, or the last
 *  twelve single quarters. Since 20 Nov 2026 on the two-column page (the designer's §3.4 and §4.6): the chart,
 *  PERFORMANCE and BIG MOVES on the left, KEY DATA, NEWS and SHORT INTEREST on the right, each column stacking on its
 *  own; FINANCIALS across. Panels are numbered in reading order, row by row; under 1,100 CSS px of layout they follow
 *  each other in that order. The one-screen layout shows them a screen at a time, placed by their kind (`k`). */
export function AssetView({ symbol, tick }: { symbol: string; tick: number }) {
  const [screen, setScreen] = useState<StockScreen>("overview");   // the one-screen layout's screen on view
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [view, setView] = useState<"annual" | "quarterly">("annual");
  const [even, setEven] = useState(false);   // the two columns end together: NEWS says so once it has fitted (StockNews `fit`)
  const a = useApi<StockPage>(symbol ? "stock" : null, { symbol }, Math.floor(tick / 5));   // the figures every five minutes; the chart refreshes each minute
  if (a.error === "unknown action") return <AssetViewLegacy symbol={symbol} tick={tick} />;   // a server from before this page
  const d = a.data && a.data.symbol && a.data.symbol.toUpperCase() === symbol.toUpperCase() ? a.data : null;   // the answer for this address only: another name's, kept while this one loads or fails, is not shown under it
  if (!symbol) return <Panel no="01" title="ASSET" span={12}><Empty title="No symbol">Use the search box at the top right.</Empty></Panel>;
  if (!d) return <Panel no="01" title={symbol.toUpperCase()} span={12}>{a.error && !a.loading ? <Empty title="Not found">{a.error}</Empty> : <Empty title="Loading">{symbol}</Empty>}</Panel>;
  // a currency, a yield, a commodity, a future or an index: its own page (I-4, 20 Nov 2026); a server from before that
  // day sends a stock's answer for every name, and the page then shows it as it always did
  if (isInstrumentPage(d)) return <InstrumentView key={d.symbol} d={d} tick={tick} />;
  const row = chartRow(d), dec = row.decimals, ccy = d.currency;
  const f = d.fin, sh = shortLine(d), s = d.short, prof = profileOf(f);
  const fs = f ? finSections(f, view) : null;
  const marks = d.moves.eligible ? chartMarks(d.moves.rows) : undefined;
  const rule = moveRule(d.moves.rule, d.moves.sizes);
  const bms = d.benchmarks, title = bms.map((b) => b.name).join(" AND ");
  const pp = fmtPp;   // a difference of two percentages, in points: +1.3, −0.6, 0.0
  const feed = d.feed ?? null;   // a server from before 20 Nov 2026 sends none: no NEWS panel then
  // panel numbers in reading order: row by row across the two columns, then FINANCIALS
  const left = ["chart", "perf", ...(d.moves.eligible ? ["moves"] : [])], right = ["key", ...(feed ? ["news"] : []), "short"], order: string[] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) { if (left[i]) order.push(left[i]); if (right[i]) order.push(right[i]); }
  order.push("fin");
  const no = (k: string) => String(order.indexOf(k) + 1).padStart(2, "0");
  // the one-screen layout shows one screen's panels at a time; the scrolling page every panel
  const sections: Array<ScreenSection<StockScreen>> = [{ k: "key", label: "Key data", screen: "overview" }, { k: "perf", label: "Performance", screen: "overview" }, ...(feed ? [{ k: "news", label: "News", screen: "news" as const }] : []), ...(d.moves.eligible ? [{ k: "moves", label: "Big moves", screen: "news" as const }] : []), { k: "short", label: "Short interest", screen: "news" }, { k: "fin", label: "Financials", screen: "fin" }];
  const term = termMode(), scr: StockScreen = screensOf(sections).includes(screen) ? screen : "overview";
  const on = (k: string) => !term || (k === "chart" ? "overview" : sections.find((x) => x.k === k)?.screen) === scr;
  return (
    <>
      <div className="c12"><PeriodBar periods={ASSET_PERIODS} period={period} onPeriod={setPeriod} sigmaWindow={sigmaWindow} onSigmaWindow={setSigmaWindow} extra={term ? <ScreenChips sections={sections} screen={scr} onScreen={setScreen} /> : undefined} /></div>
      <div className="pcols" data-even={even && feed ? "" : undefined} data-page="stock" data-screen={term ? scr : undefined}>
        <div className="pcol w8">
          {on("chart") && <Panel no={no("chart")} k="st-chart" title={d.name.toUpperCase()} span={8} aux={<><Star symbol={d.symbol} name={d.name} /> {d.symbol}{d.exchange ? ` · ${d.exchange}` : ""}{d.sector ? ` · ${d.sector}` : ""}{d.industry ? ` · ${d.industry}` : ""}{d.indices.length ? <> · <span id="st-members" title={membersCredit(d.indices)}>{d.indices.join(", ")}</span><MembersBy indices={d.indices} /></> : ""} · Yahoo Finance</>}>
            <div className="bigwrap"><ChartPanel row={row} period={period} tick={tick} sigmaWindow={sigmaWindow} shape="large" axes volume marks={marks} /></div>
          </Panel>}
          {on("perf") && <Panel no={no("perf")} k="st-perf" title={bms.length ? `PERFORMANCE VS ${title.toUpperCase()}` : "PERFORMANCE"} span={8} aux="price change, dividends not included">
            <table className="secT perfT" id="st-perf">
              <thead><tr><th className="l" />{d.perf.map((r) => <th key={r.h} title={r.from ? `from the close of ${fmtDate(r.from)}` : undefined}>{r.h}</th>)}</tr></thead>
              <tbody>
                <tr data-r="then"><td className="l mut">Price then</td>{d.perf.map((r) => <td key={r.h} className="num mut">{fmtNum(r.base, dec)}</td>)}</tr>
                <tr data-r="stock"><td className="l">{d.symbol}</td>{d.perf.map((r) => <td key={r.h} className={`num ${signCls(r.stock, 1)}`}>{fmtPc(r.stock, true)}</td>)}</tr>
                {bms.map((b, k) => <tr key={b.symbol} data-r="bench"><td className="l" title={b.note ?? undefined}>{b.name}{b.note && <span className="badge proxy">PROXY</span>}</td>{d.perf.map((r) => <td key={r.h} className={`num ${signCls(r.bench[k], 1)}`}>{fmtPc(r.bench[k], true)}</td>)}</tr>)}
                {bms.map((b, k) => <tr key={b.symbol} data-r="rel" className={k === 0 ? "tot" : "tot2"}><td className="l">Against {b.name}, pp</td>{d.perf.map((r) => <td key={r.h} className={`num ${signCls(r.rel[k], 1)}`}>{pp(r.rel[k])}</td>)}</tr>)}
              </tbody>
            </table>
            <div className="mut finnote">Each column is the price now against the last close on or before the same day that many months ago; a benchmark is measured between the same two dates. A column is empty where the history does not reach that far.</div>
            {bms.filter((b) => b.note).map((b) => <div key={b.symbol} className="mut finnote">{b.note}</div>)}
          </Panel>}
          {d.moves.eligible && on("moves") && (
            <Panel no={no("moves")} k="st-moves" title="BIG MOVES AND WHY" span={8} aux={`${d.moves.rows.length} in three years, newest first`}>
              {d.moves.rows.length ? (
                // a short box with its own scrolling (Shota, 19 Nov 2026): the whole list pushed FINANCIALS a long way down
                <div className="mvbox" id="st-movebox" tabIndex={0} aria-label="Big moves, newest first">
                <table className="secT mvT" id="st-moves">
                  <thead><tr><th className="l">Ended</th><th className="l">Move</th><th className="l">Why</th></tr></thead>
                  <tbody>{d.moves.rows.map((m) => (
                    <tr key={`${m.kind}${m.to}`} data-kind={m.kind} data-status={m.status}>
                      <td className="l d"><span className={`dot ${m.dir > 0 ? "up" : "dn"}${isSmallMove(m) ? " sm" : ""}`} /><span className="nb">{fmtDate(m.to)}</span></td>
                      <td className="l m"><MoveText m={m} /></td>
                      <td className="l w"><MoveWhy m={m} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              ) : <Empty title="No big moves">None in the last three years by these measures.</Empty>}
              {/* the rule under the table, not in the head (the designer's D-39) */}
              <div className="mut finnote" id="st-moverule">{[...rule.parts, "circles on the daily charts (3M to 10Y) for the last three years"].join(" · ")}</div>
            </Panel>
          )}
        </div>
        <div className="pcol w4">
          {on("key") && <Panel no={no("key")} k="st-key" title="KEY DATA" span={4} aux={d.asOf ? `as of ${fmtStamp(d.asOf)}` : ""}>
            <div className="krow">
              <span><span className="k">Last</span><span className="v">{fmtNum(d.price, dec)}</span></span>
              <span><span className="k">Day</span><span className={`v ${signCls(d.pct, 2)}`}>{fmtPct(d.pct, 2)}</span></span>
              <span><span className="k">{MKT_CAP}</span><span className="v" id="st-mcap">{money(d.mcap, ccy)}</span></span>
            </div>
            <div className="kvwrap">
            <table className="secT kvT" id="st-key"><tbody>
              <KV k="Previous close · open">{fmtNum(d.prevClose, dec)} · {fmtNum(d.open, dec)}</KV>
              <KV k="Day's range">{fmtNum(d.low, dec)} – {fmtNum(d.high, dec)}</KV>
              <KV k="Shares outstanding" title={[d.shares.source, d.shares.asOf ? `as of ${fmtDate(d.shares.asOf)}` : null, d.shares.treasury != null ? `of which treasury shares ${fmtCount(d.shares.treasury)}` : null].filter(Boolean).join(" · ")}>{fmtCount(d.shares.outstanding)}</KV>
              <KV k="Diluted shares" title={d.shares.dilutedNote ?? undefined}>{fmtCount(d.shares.diluted)}</KV>
              <KV k={avgVolume(60)} title="Average daily volume over the 60 sessions before the latest">{fmtCount(d.turnover.d60.shares)}</KV>
              <KV k={avgTurnover(60)} title="Average daily value traded over the same 60 sessions: each day's volume times its close">{money(d.turnover.d60.value, ccy)}</KV>
              <KV k={avgVolume(20)}>{fmtCount(d.turnover.d20.shares)}</KV>
              <KV k={avgTurnover(20)}>{money(d.turnover.d20.value, ccy)}</KV>
              <KV k="Volume today" title={`Today's volume, and against the ${avgVolume(60).toLowerCase()}`}>{d.volume == null ? "–" : fmtCount(d.volume)}{d.volume != null && d.turnover.d60.shares ? ` · ${Math.round((d.volume / d.turnover.d60.shares) * 100)}% of avg (60d)` : ""}</KV>
              <KV k={sh.label} title={sh.title}>{sh.value}</KV>
              <KV k={RANGE_52W} title={`Low ${fmtDate(d.range.loDate)}, high ${fmtDate(d.range.hiDate)}`}>
                <span className="rng"><span>{fmtNum(d.range.lo, dec)}</span><span className="bar">{d.range.pos != null && <i style={{ left: `${d.range.pos}%` }} />}</span><span>{fmtNum(d.range.hi, dec)}</span></span>
              </KV>
              <KV k="From 52W high / low">{<><span className={signCls(d.range.fromHi, 1)}>{fmtPc(d.range.fromHi, true)}</span> / <span className={signCls(d.range.fromLo, 1)}>{fmtPc(d.range.fromLo, true)}</span></>}</KV>
              <KV k={`${REALISED_VOL}, 1M / 3M / 12M`} title="Standard deviation of daily log returns over 21, 63 and 252 sessions, as a yearly figure">{fmtPc(d.vol.m1, false, 0)} / {fmtPc(d.vol.m3, false, 0)} / {fmtPc(d.vol.m12, false, 0)}</KV>
              {bms.map((b, k) => <KV key={b.symbol} k={`Beta vs ${b.name}, 12M`} title={`From daily returns over the last ${d.beta[k]?.days ?? 0} sessions on which both traded; correlation ${d.beta[k]?.corr == null ? "–" : d.beta[k].corr!.toFixed(2)}`}>{d.beta[k]?.beta == null ? "–" : d.beta[k].beta!.toFixed(2)}</KV>)}
              <KV k={LARGEST_FALL} title={d.drawdown.from ? `From the close of ${fmtDate(d.drawdown.from)} to that of ${fmtDate(d.drawdown.to)}` : undefined} cls={signCls(d.drawdown.pct, 1)}>{fmtPc(d.drawdown.pct)}</KV>
              <KV k="P/E, last year / guidance" title={d.val.basis ?? undefined}>{fmtX(d.val.pe)} / {fmtX(d.val.peGuide)}</KV>
              <KV k="P/B" title={d.val.basis ?? undefined}>{fmtX(d.val.pb, 2)}</KV>
              <KV k="Dividend yield, last year / guidance" title={d.val.basis ?? undefined}>{fmtPc(d.val.yield, false, 2)} / {fmtPc(d.val.yieldGuide, false, 2)}</KV>
              {/* A-30: the day as the source gives it, in the company's own market, and no time of day (lib/results.ts) */}
              <KV k={NEXT_RESULTS} title={d.earningsAt ? resultsTip(d.symbol, d.earningsEst) : undefined}>{d.earningsAt ? <><span className="vl1" id="st-results">{fmtResultsDate(d.earningsAt, d.symbol)}</span><small className="vl2" id="st-results-src">{resultsWords(d.earningsEst, d.symbol)}</small></> : "–"}</KV>
              {prof && <KV k="Fiscal year end · standard" title={`From the 有価証券報告書 for ${prof.label} (EDINET DB)`}>{prof.month} · {prof.std}</KV>}
              {prof && <KV k="Annual report" title={prof.doc?.tip ?? prof.none}>{prof.doc ? <a href={prof.doc.href} target="_blank" rel="noreferrer" id="st-yuho">有報 {prof.label} ↗</a> : `有報 ${prof.label}`}</KV>}
            </tbody></table>
            </div>
          </Panel>}
          {feed && on("news") && (
            <Panel no={no("news")} k="st-news" title={NEWS.toUpperCase()} span={4} aux={`headlines and alerts naming ${d.symbol} · ${feed.days} days · times in SGT`}>
              <StockNews key={d.symbol} symbol={d.symbol} feed={feed} fit even={even} onEven={setEven} />
            </Panel>
          )}
          {on("short") && <Panel no={no("short")} k="st-short" title="SHORT INTEREST" span={4} auxShort={s?.kind === "jpx" ? <SrcParts parts={["JPX", <PersonalUse key="pu" />]} /> : undefined} aux={s ? (s.kind === "jpx" ? <span id="st-short-src">JPX short-position reports · <PersonalUse /></span> : s.kind === "interest" ? "exchange-reported · Yahoo Finance" : "FINRA") : ""}>
            {!s ? <Empty title="No short data">None reported for this name.</Empty> : s.kind === "jpx" ? (
              <table className="secT" id="st-short"><tbody>
                <tr><td className="l"><b>Reported positions (0.5% and above) · <span className="nb">{fmtDate(s.d)}</span></b></td><td className="num"><b>{(s.ratio * 100).toFixed(2)}%</b></td></tr>
                <tr><td className="l mut">Shares · days of avg daily volume (60d)</td><td className="num">{fmtCount(s.shares)} · {s.daysToCover == null ? "–" : s.daysToCover.toFixed(1)}</td></tr>
                {s.holders.slice(0, 8).map((h) => <tr key={h.holder}><td className="l mut">{h.holder}<span className="mut nb"> · {fmtDate(h.d)}</span></td><td className="num">{(h.ratio * 100).toFixed(2)}%</td></tr>)}
              </tbody></table>
            ) : s.kind === "interest" ? (
              <table className="secT" id="st-short"><tbody>
                <KV k={`Shares short · ${fmtDate(s.d)}`}>{fmtCount(s.shares)}</KV>
                <KV k="Per cent of float">{fmtPc(s.pctFloat)}</KV>
                <KV k="Per cent of shares outstanding">{fmtPc(s.pctOut)}</KV>
                <KV k="Days to cover" title="Shares short over the average daily volume, as reported">{s.daysToCover == null ? "–" : s.daysToCover.toFixed(1)}</KV>
                <KV k={`A month earlier${s.priorDate ? ` · ${fmtDate(s.priorDate)}` : ""}`}>{fmtCount(s.prior)}</KV>
                {s.finra && <KV k={`FINRA short-volume share · ${fmtDate(s.finra.d)}`} title="The share of the day's reported volume that was sold short; not short interest">{(s.finra.ratio * 100).toFixed(0)}%</KV>}
              </tbody></table>
            ) : (
              <table className="secT" id="st-short"><tbody><KV k={`FINRA short-volume share · ${fmtDate(s.d)}`} title="The share of the day's reported volume that was sold short; not short interest">{(s.ratio * 100).toFixed(0)}%</KV></tbody></table>
            )}
          </Panel>}
        </div>
      </div>
      {on("fin") && <Panel no={no("fin")} k="st-fin" title="FINANCIALS" span={12} aux={f ? <>{f.source === "edinetdb" ? "EDINET DB (有価証券報告書 · 決算短信)" : "Yahoo Finance fundamentals"}{f.asOf ? ` · fetched ${fmtDate(f.asOf)}` : ""}</> : ""}>
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
      </Panel>}
    </>
  );
}
