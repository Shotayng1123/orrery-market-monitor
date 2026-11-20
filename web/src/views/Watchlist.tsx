import { zoomNow } from "../lib/prefs";
import { useAddBox } from "../lib/candidates";
import { Fragment, useEffect, useRef, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { HeadlineList } from "../components/Headlines";
import { ShowMore } from "../components/StockNews";
import { Star } from "../components/Star";
import { hideCard, money, openAsset, showCard } from "../components/CompanyCard";
import { useApi } from "../lib/useApi";
import { useWatch } from "../lib/watch";
import { fallbackDecimals, fmtLevel, fmtPct, signCls } from "../lib/fmt";
import { asOfCell, asOfOf, asOfTitle, fmtDate, fmtDayTime, fmtWhen, type AsOfKind } from "../lib/time";
import { classLabel, hitLine, MKT_CAP, NEXT_RESULTS, RESULTS_AHEAD, VS_200D, VS_50D } from "../lib/labels";
import { cellBp, changeShade, RANGE_52W, RANGE_52W_TIP } from "./Market";

/** A row of the watch_list route. Since 19 Nov 2026 a market instrument's row also carries the change of its level
 *  over each window (`chg1d` …, points for a yield: the page prints them in bp, as MARKETS does) and a yield's
 *  distance from its 200-day average (`vs200chg`); a yield's per-cent fields are null. Every row says what it is as
 *  of (`asOfKind`) and whose figures they are (`source`). An older server sends none of these: a yield then shows
 *  dashes, never a per cent of its level, and the as-of is read from the form of `asOf` (lib/time.ts `asOfOf`). */
export interface WatchRow {
  symbol: string; name: string; kind: string; sector: string | null; ccy: string | null; last: number | null; asOf: string | null;
  pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null;
  vs50: number | null; vs200: number | null; pos52: number | null; mcap: number | null; earningsAt: string | null; earningsEst: boolean | null; isYield: boolean;
  chg1d?: number | null; chg1w?: number | null; chg1m?: number | null; chg3m?: number | null; chg12m?: number | null; vs200chg?: number | null;
  asOfKind?: AsOfKind | null; source?: string | null;
  /** The instrument's own decimals (the instruments table), for a market instrument; since 20 Nov 2026. A stock and an
   *  older server's rows have none: the page's rule for them (lib/fmt.ts). */
  decimals?: number | null;
}
/** The windows of a watchlist row: its per-cent field for a price, its level field for a yield, its label. */
export const WINDOWS = [["pct1d", "chg1d", "1D"], ["pct1w", "chg1w", "1W"], ["pct1m", "chg1m", "1M"], ["pct3m", "chg3m", "3M"], ["pct12m", "chg12m", "12M"]] as const;
/** A row's level as every screen prints it (the designer's D-05): a market instrument with its own decimals, as on
 *  MARKETS ("158.400", "4.859%"); a stock by the stocks' rule; without decimals from the server (one older than
 *  20 Nov 2026) the same rules the instruments table follows (lib/fmt.ts fallbackDecimals). */
export const lastOf = (r: WatchRow) => fmtLevel(r.last, r.decimals ?? fallbackDecimals(r.last, r.isYield ? "yield" : r.kind === "Currency" ? "fx" : "other"), r.isYield);
/** The sources of the rows on screen, for the panel's head: "Yahoo Finance; yields: US Treasury, Japan MOF". */
export function sourcesOf(rows: WatchRow[]): string {
  const all = [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))];
  const market = all.filter((s) => s === "Yahoo Finance"), official = all.filter((s) => s !== "Yahoo Finance");
  return [...market, ...(official.length ? [`yields: ${official.join(", ")}`] : [])].join("; ");
}
export interface Feed {
  alerts: Array<{ id: number; at: string; symbol: string; name: string; kind: string; pct: number | null; msg: string; url: string | null }>;
  news: Array<{ id: number; publishedAt: string; source: string; title: string; url: string; tickers: Array<{ s: string; n: string }> }>;
  research: Array<{ key: string; d: string; kind: string; title: string; symbols: string[] }>;
}
const UP = "63,208,126", DN = "255,77,66";
const shade = (v: number | null, full: number) => (v == null || v === 0 ? undefined : `rgba(${v > 0 ? UP : DN},${(Math.min(1, Math.abs(v) / full) * 0.5).toFixed(3)})`);
export const decode = (t: string) => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));

/** WATCHLIST: the user's own names in one place: their figures, the earnings dates ahead, and what has happened
 *  around them (alerts, headlines that name them, research that mentions them). Names are added with the star
 *  on any stock's page, in the earnings calendar and the screener, or by typing a symbol here. */
/** How many alerts and headlines WATCHLIST shows before "SHOW n MORE" (D-48: at the feed's own lengths, 40 alerts
 *  and 60 headlines, the results dates fell two screens down). */
export const WL_ALERTS = 10, WL_NEWS = 15;
export function WatchlistView({ tick }: { tick: number }) {
  const w = useWatch();
  const [shownA, setShownA] = useState(WL_ALERTS), [shownN, setShownN] = useState(WL_NEWS);
  const list = useApi<{ rows: WatchRow[] }>("watch_list", { v: w.version }, tick);
  const feed = useApi<Feed>("watch_feed", { v: w.version }, Math.floor(tick / 5));
  const box = useAddBox(w.has);
  const [open, setOpen] = useState(false);
  // The candidates hang under the box but must not be cut by the panel, which clips what leaves it: they are
  // placed on the page itself, at the box's own position (divided by the page's zoom, as the company card is).
  const inp = useRef<HTMLInputElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const showList = open && (box.hits.length > 0 || box.busy);
  useEffect(() => {
    if (!showList) { setAt(null); return; }
    const place = () => { const el = inp.current; if (!el) return; const r = el.getBoundingClientRect(), z = zoomNow(); setAt({ left: r.left / z, top: r.bottom / z + 3 }); };
    place();
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [showList]);
  const rows = list.data?.rows ?? [];
  // an answer without one of its lists (an older server, a stand-in feed) shows that panel empty: it must not blank the page
  const alerts = feed.data?.alerts ?? [], news = feed.data?.news ?? [], research = feed.data?.research ?? [];
  const cell = (v: number | null | undefined, full: number) => <td className={`num ${signCls(v, 1)}`} style={{ background: shade(v ?? null, full) }}>{fmtPct(v, 1)}</td>;
  // a yield's changes in bp with MARKETS' own figures and tints (full at 50bp; 75bp from the 200-day average)
  const bp = (v: number | null | undefined, full: number) => <td className={`num ${signCls(v == null ? null : v * 100, 1)}`} style={{ background: changeShade(v ?? null, full) }}>{cellBp(v)}</td>;
  const ahead = rows.filter((r) => r.earningsAt && Date.parse(r.earningsAt) > Date.now() - 86400e3).sort((a, b) => a.earningsAt!.localeCompare(b.earningsAt!));
  const name = (s: string) => rows.find((r) => r.symbol === s)?.name ?? s;
  const how = "Press the star beside a name on its own page, in the screener or in the results calendar, or type part of a name or of a symbol above (toyota, nvid, 7203, ^N225) and choose from the list.";
  const sources = sourcesOf(rows);
  return (
    <>
      <Panel no="01" title="MY NAMES" span={12} k="wl" aux={<>{rows.length} name{rows.length === 1 ? "" : "s"}{sources ? ` · ${sources}` : ""} · times in SGT</>}>
        <div className="searchrow">
          <span className="addbox">
            <input type="text" id="wl-add" ref={inp} aria-label="add a name to the watchlist" placeholder="add a name or a symbol: toyota, NVDA, 7203" value={box.text} autoComplete="off" style={{ width: 330 }}
              onChange={(e) => { box.setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); box.setSel(Math.min(box.hits.length - 1, box.sel + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); box.setSel(Math.max(-1, box.sel - 1)); }
                else if (e.key === "Enter") void box.submit();
                else if (e.key === "Escape") setOpen(false);
              }} />
            {showList && (
              <div className="sres cands" id="wl-cands" style={at ? { left: at.left, top: at.top } : { visibility: "hidden" }}>
                {box.busy && !box.hits.length && <div className="sitem mut">searching …</div>}
                {box.hits.map((h, i) => (
                  <div key={h.symbol} className={`sitem${i === box.sel ? " on" : ""}${w.has(h.symbol) ? " have" : ""}`} title={w.has(h.symbol) ? "Already in your list" : `Add ${h.name} (${h.symbol})`} onMouseEnter={() => box.setSel(i)} onMouseDown={(e) => { e.preventDefault(); void box.addHit(h); }}>
                    <b>{h.symbol}</b><span className="nm">{h.name}</span><span className="mut">{hitLine(h)}</span><span className="act">{w.has(h.symbol) ? "in your list" : "+ add"}</span>
                  </div>
                ))}
              </div>
            )}
          </span>
          <span className="chip-sm" onClick={() => void box.submit()}>ADD</span>
          {box.msg && <span id="wl-msg" className={box.msg.kind === "err" ? "warn" : "mut"}>{box.msg.text}</span>}
        </div>
        {rows.length ? (
          <table className="secT wlT">
            <thead><tr><th /><th className="l">Name</th><th className="l">Sector / kind</th><th>Last</th><th className="l asof" title="What the row's figures are as of, in SGT: the date of a close or of an official yield's publication, the time of today's last print">As of</th><th>1D</th><th>1W</th><th>1M</th><th>3M</th><th>12M</th><th title="% for prices, bp for yields">{VS_50D}</th><th title="% for prices, bp for yields">{VS_200D}</th><th title={RANGE_52W_TIP}>{RANGE_52W}</th><th>{MKT_CAP}</th><th className="l" title="The company's next results date, in SGT; est. = estimated, not confirmed by the company">{NEXT_RESULTS}</th></tr></thead>
            <tbody>{rows.map((r) => {
              const a = asOfOf(r.asOf, r.asOfKind);
              return (
                <tr key={r.symbol}>
                  <td className="l"><Star symbol={r.symbol} name={r.name} /></td>
                  <td className="l nm" title={`${r.name} (${r.symbol})`}><span className="lnk" onMouseEnter={(e) => showCard(r.symbol, e)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.name}</span> <span className="mut">{r.symbol}</span></td>
                  <td className="l mut">{r.sector ?? classLabel(r.kind)}</td>
                  <td className="num"><b>{lastOf(r)}</b></td>
                  <td className="l mut asof" title={asOfTitle(a, r.source)}>{asOfCell(a)}</td>
                  {r.isYield
                    ? <>{WINDOWS.map(([, c]) => <Fragment key={c}>{bp(r[c], 0.5)}</Fragment>)}{bp(null, 0.5)}{bp(r.vs200chg, 0.75)}</>
                    : <>{cell(r.pct1d, 4)}{cell(r.pct1w, 8)}{cell(r.pct1m, 12)}{cell(r.pct3m, 20)}{cell(r.pct12m, 50)}{cell(r.vs50, 10)}{cell(r.vs200, 20)}</>}
                  <td className="num mut">{r.pos52 == null ? "–" : `${Math.round(r.pos52)}%`}</td>
                  <td className="num mut">{r.mcap == null ? "–" : money(r.mcap, r.ccy)}</td>
                  <td className="l mut">{r.earningsAt ? `${fmtDate(r.earningsAt)}${r.earningsEst ? " est." : ""}` : "–"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <Empty title={w.ready && list.data ? "Your watchlist is empty" : "Loading your watchlist"}>{list.error ?? (w.ready && list.data ? how : "")}</Empty>}
      </Panel>
      {/* MY NAMES takes the full width (it gained the AS OF column); below it the two-column page (the designer's
          §3.4 and §4.5): results ahead over alerts on the left, headlines over research on the right, each column
          stacking on its own, so a short panel leaves no hole beside a tall one (D-25: about 270 px stood empty
          under ALERTS). Results ahead come first and the long lists are cut at ten and fifteen rows with "SHOW n MORE",
          never a box that scrolls inside the page (D-48: with the feed's 40 alerts the results dates fell to y 1,792).
          Under 1,100 CSS px of layout, and in the one-screen layout, the panels follow each other. */}
      <div className="pcols">
        <div className="pcol w4">
          <Panel no="02" title={RESULTS_AHEAD.toUpperCase()} span={4} k="wl-earn" aux="my names · times in SGT">
            {ahead.length ? (
              <table className="secT"><tbody>{ahead.map((r) => <tr key={r.symbol}><td className="l mut num">{fmtDayTime(r.earningsAt)}</td><td className="l wrap"><span className="lnk" onClick={() => openAsset(r.symbol)}>{r.name}</span></td><td className="l mut">{r.earningsEst ? "est." : "confirmed"}</td></tr>)}</tbody></table>
            ) : <Empty title="No dates ahead">{rows.length ? "None of your names has a results date in the feed." : "Add names to see their results dates."}</Empty>}
          </Panel>
          <Panel no="04" title="ALERTS ON MY NAMES" span={4} k="wl-alerts" aux={feed.data ? `${alerts.length} recent · times in SGT` : ""}>
            {alerts.length ? (
              <table className="secT wlal"><tbody>{alerts.slice(0, shownA).map((a) => <tr key={a.id}><td className="l mut num">{fmtWhen(a.at)}</td><td className="l wrap">{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.msg}</a> : <span className="lnk" onClick={() => openAsset(a.symbol)}>{a.msg}</span>}</td><td className={`num ${signCls(a.pct, 1)}`}>{a.pct == null ? "" : fmtPct(a.pct, 1)}</td></tr>)}</tbody></table>
            ) : <Empty title="No alerts">{feed.error ?? "Moves beyond ±5% (large companies) or ±7%, buybacks, guidance changes and large deals on your names appear here."}</Empty>}
            {alerts.length > shownA && <ShowMore id="wl-alerts-more" n={Math.min(WL_ALERTS, alerts.length - shownA)} shown={shownA} total={alerts.length} onMore={() => setShownA((n) => n + WL_ALERTS)} />}
          </Panel>
        </div>
        <div className="pcol w8">
          <Panel no="03" title="HEADLINES ON MY NAMES" span={8} k="wl-news" aux={feed.data ? `${news.length} in the feed · times in SGT` : ""}>
            {news.length ? <HeadlineList rows={news.slice(0, shownN)} named={w.has} free /> : <Empty title="No headlines">{feed.error ?? "Headlines that name one of your companies appear here."}</Empty>}
            {news.length > shownN && <ShowMore id="wl-news-more" n={Math.min(WL_NEWS, news.length - shownN)} shown={shownN} total={news.length} onMore={() => setShownN((n) => n + WL_NEWS)} />}
          </Panel>
          <Panel no="05" title="IN RESEARCH" span={8} k="wl-research" aux="pieces that mention my names">
            {research.length ? (
              <table className="secT"><tbody>{research.map((r) => <tr key={r.key}><td className="l mut num">{fmtDate(r.d)}</td><td className="l wrap"><span className="lnk" onClick={() => { location.hash = `research/${encodeURIComponent(r.key)}`; }}>{r.title}</span><div className="mut" style={{ fontSize: 10 }}>{r.symbols.map(name).join(" · ")}</div></td></tr>)}</tbody></table>
            ) : <Empty title="No mentions">{feed.error ?? "Daily notes and weekly reports that mention your names appear here."}</Empty>}
          </Panel>
        </div>
      </div>
    </>
  );
}
