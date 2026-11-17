import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { useApi } from "../lib/useApi";
import type { EconEvent, NewsItem } from "../lib/types";
import { fmtClock, SGT } from "../lib/time";
import { zoomNow } from "../lib/prefs";
import { fmtStampSafe } from "./shared";
import { EarningsCalendar } from "../components/Earnings";
import { openAsset } from "../components/CompanyCard";
import { Pick, type PickOption } from "../components/Pick";
import { useRowCap } from "../lib/useRowCap";

export const NEWS_CATEGORIES = ["All", "US Equities", "JP Equities", "Asia Equities", "DM Rates", "EM Rates", "Currency", "Macro", "Commodities"] as const;
export const CAL_MODES: PickOption<"macro" | "earnings">[] = [{ value: "macro", label: "Macro" }, { value: "earnings", label: "Earnings" }];
export const IMPACTS: PickOption<"high" | "hm" | "all">[] = [{ value: "high", label: "High" }, { value: "hm", label: "High + Medium" }, { value: "all", label: "All" }];
export const SCOPES: PickOption<"major" | "all">[] = [{ value: "major", label: "Major" }, { value: "all", label: "All" }];
export const dayOf = (t: string) => new Date(t).toLocaleDateString("en-CA", { timeZone: SGT });
export const dayLabel = (t: string) => new Date(t).toLocaleDateString("en-GB", { timeZone: SGT, weekday: "long", day: "numeric", month: "short" });
export const MAJOR = new Set(["US", "JP", "EUR", "DE", "FR", "UK", "CN", "HK", "KR", "TW", "AU", "CA", "CH", "IN", "SG"]);   // major markets only (Shota); everything else behind the All chip

/** Some feeds send headlines with HTML entities left in ("Anthropic&#x2019;s"); shown as the characters they stand for. */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (t: string): string => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&(lt|gt|quot|apos|nbsp);/g, (_m, n: string) => NAMED[n]);

export function NewsView({ tick }: { tick: number }) {
  const cal = useApi<{ rows: EconEvent[] }>("calendar", undefined, Math.floor(tick / 5));   // the calendar syncs hourly, the headlines every ten minutes
  const [cat, setCat] = useState<(typeof NEWS_CATEGORIES)[number]>("All");
  const [imp, setImp] = useState<"high" | "hm" | "all">("high");   // high-impact events only to start with (Shota, 16 Nov); Medium and Low are one pick away
  const [scope, setScope] = useState<"major" | "all">("major");
  const [calMode, setCalMode] = useState<"macro" | "earnings">("macro");
  const news = useApi<{ rows: NewsItem[] }>("news", { category: cat === "All" ? undefined : cat, n: 150 }, Math.floor(tick / 5));
  const events = useMemo(() => (cal.data?.rows ?? []).filter((e) => (imp === "all" || e.impact === "High" || (imp === "hm" && e.impact === "Medium")) && (scope === "all" || MAJOR.has(e.country))), [cal.data, imp, scope]);
  const upcoming = events.some((e) => Date.parse(e.at) > Date.now());
  // The list starts five days back; open it at the next event (the last few results stay in view above it).
  const nextIdx = events.findIndex((e) => Date.parse(e.at) > Date.now());
  const nextRow = useRef<HTMLTableRowElement>(null), calBox = useRef<HTMLDivElement>(null), placed = useRef("");
  useRowCap(calBox, 10, "tr.ecrow", "tr.cls", [events.length > 0, calMode]);   // phone: ten events at a time, the rest by scrolling inside the panel
  useEffect(() => {
    const row = nextRow.current, box = calBox.current;
    const key = `${calMode}|${imp}|${scope}|${events.length}`;   // coming back from the earnings calendar places the list again
    if (!row || !box) { if (calMode !== "macro") placed.current = ""; return; }
    if (placed.current === key) return;
    placed.current = key;
    let scroller: HTMLElement | null = null, given = -1;   // where the list was put, to tell a reader's scroll from ours
    const place = () => {
      const sc = box.scrollHeight > box.clientHeight + 4 ? box : (box.closest(".pbody") as HTMLElement | null);
      if (!sc) return;
      // rectangles are in visual pixels, scroll offsets in the zoomed layout's pixels
      sc.scrollTop = Math.max(0, sc.scrollTop + (row.getBoundingClientRect().top - sc.getBoundingClientRect().top) / zoomNow() - 64);
      if (sc === box) {
        // the calendar's own box (the phone's ten-row box): start on a whole row under the column heads, not on a cut one
        const headBottom = box.querySelector("th")?.getBoundingClientRect().bottom ?? box.getBoundingClientRect().top;
        const first = [...box.querySelectorAll("tbody tr")].find((tr) => tr.getBoundingClientRect().bottom > headBottom + 1);
        if (first) sc.scrollTop = Math.max(0, sc.scrollTop + (first.getBoundingClientRect().top - headBottom) / zoomNow());
      }
      scroller = sc; given = sc.scrollTop;
    };
    place();
    // The rows change height when the web font lands, which moves everything below the many rows above the next
    // event: place the list again, unless the reader has scrolled it since.
    const table = box.querySelector("table");
    const ro = table && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (!scroller || Math.abs(scroller.scrollTop - given) < 2) place(); }) : null;
    if (ro && table) ro.observe(table);
    return () => ro?.disconnect();
  }, [events.length, imp, scope, nextIdx, calMode]);
  return (
    <>
      <Panel no="01" title={calMode === "macro" ? "ECONOMIC CALENDAR" : "EARNINGS CALENDAR"} span={6} aux={<span className="chips" style={{ margin: 0 }}><Pick label="Type" value={calMode} options={CAL_MODES} onChange={setCalMode} />{calMode === "macro" && <><Pick label="Impact" value={imp} options={IMPACTS} onChange={setImp} /><Pick label="Countries" value={scope} options={SCOPES} onChange={setScope} /><span className="mut" style={{ marginLeft: 4 }}>times in SGT{cal.data?.rows[0]?.source === "fxstreet" ? " · FXStreet" : cal.data?.rows.length ? " · ForexFactory" : ""}{cal.data && !upcoming ? " · no upcoming events in the feed yet" : ""}</span></>}</span>}>
        {calMode === "earnings" ? <EarningsCalendar tick={tick} /> : events.length ? (
          <div className="calwrap" ref={calBox}><table className="mini calT">
            <colgroup><col className="tm" /><col className="cy" /><col /><col className="dot" /><col className="nv" /><col className="nv" /><col className="nv" /></colgroup>
            <thead><tr><th className="l">SGT</th><th className="l">Ccy</th><th className="l">Event</th><th className="l" title="Impact: red high, amber medium, grey low" aria-label="Impact"></th><th>Actual</th><th>Consensus</th><th>Previous</th></tr></thead>
            <tbody>{events.map((e, i, arr) => (
              <Fragment key={e.id}>
                {(i === 0 || dayOf(e.at) !== dayOf(arr[i - 1].at)) && <tr className="cls"><td colSpan={7}>{dayLabel(e.at)}</td></tr>}
                <tr ref={i === nextIdx ? nextRow : undefined} className={`ecrow${Date.parse(e.at) < Date.now() ? " past" : ""}`}>
                  <td className="l num" title={fmtStampSafe(e.at)}>{fmtClock(new Date(e.at), SGT)}</td><td className="l">{e.currency ?? e.country}</td>
                  <td className="l ev" title={e.title}>{e.title}{e.kind === "speech" ? <span className="mut"> · speech</span> : e.kind === "report" ? <span className="mut"> · report</span> : null}</td>
                  <td className="l" title={e.impact}><span className={`imp ${e.impact[0].toLowerCase()}`} /></td>
                  <td className={e.better === true ? "up" : e.better === false ? "dn" : ""}><b>{e.actual ?? (Date.parse(e.at) < Date.now() ? "–" : "")}</b></td>
                  <td>{e.forecast ?? "–"}</td><td className="mut">{e.previous ?? "–"}</td>
                </tr>
              </Fragment>
            ))}</tbody>
          </table></div>
        ) : <Empty title="No calendar loaded">{cal.error ?? "The calendar sync runs every hour."}</Empty>}
      </Panel>
      <Panel no="02" title="NEWS" span={6} aux={<span className="chips" style={{ margin: 0 }}><Pick label="Category" value={cat} options={NEWS_CATEGORIES} onChange={setCat} /></span>}>
        {news.data?.rows.length ? <div className="nwlist">{news.data.rows.map((it) => (
          <div className="nwrow" key={it.id}>
            <span className="nwt">{fmtStampSafe(it.publishedAt)}</span>
            <span className="nwc cat">{it.category}</span>
            <span className="nwh"><a href={it.url} target="_blank" rel="noreferrer">{decodeEntities(it.title)}</a></span>
            {it.tickers?.length > 0 && <span className="nwtk">{it.tickers.slice(0, 3).map((t) => <span key={t.s} className="tk" title={`Open ${t.n} (${t.s})`} onClick={() => openAsset(t.s)}>{t.n}</span>)}</span>}
            <span className="nwsrc">{it.source}</span>
          </div>
        ))}</div> : <Empty title="No headlines">{news.error ?? "The news job runs every ten minutes."}</Empty>}
      </Panel>
    </>
  );
}
