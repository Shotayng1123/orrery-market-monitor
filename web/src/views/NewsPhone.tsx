import { Fragment, useMemo, useRef, useState } from "react";
import { Empty } from "../components/Panel";
import { Pick } from "../components/Pick";
import { Star } from "../components/Star";
import { money, openAsset } from "../components/CompanyCard";
import { calendarDays, REGION, REGIONS, resultsPast, SIZES, type EarningsRow } from "../components/Earnings";
import { RESULTS_NOTE, resultsDayLabel, resultsStatusShort } from "../lib/results";
import { Screen, Section, usePlaceAtNext } from "../components/PhoneKit";
import { useApi } from "../lib/useApi";
import { useRowCap } from "../lib/useRowCap";
import type { EconEvent, NewsItem } from "../lib/types";
import { fmtClock, fmtWhen, SGT } from "../lib/time";
import { categoryLabel, CURRENCY, HEADLINES, MKT_CAP, RESULTS_CALENDAR, TAB } from "../lib/labels";
import { fmtStampSafe } from "./shared";
import { CAL_MODES, calendarRows, CATEGORY_OPTIONS, dayLabel, dayOf, decodeEntities, IMPACTS, NEWS_CATEGORIES, SCOPES } from "./News";

/** NEWS for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026): the calendar and the headlines of the desktop tab
 *  as lists at reading size. The calendar is a box of ten lines that scrolls inside itself and opens at the next
 *  event (Shota, 16 Nov), high-impact events only to start with; the headlines come thirty at a time. */
const SHOWN = 10, PAGE = 30;

function MacroList({ events, listKey }: { events: EconEvent[]; listKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  useRowCap(box, SHOWN, ".ev-row", ".ev-day", [events.length > 0]);
  usePlaceAtNext(box, `${listKey}|${events.length > 0}`);
  const now = Date.now();
  const nextIdx = events.findIndex((e) => Date.parse(e.at) > now);
  return (
    <div className="mp-scroll" ref={box}><div>
      {events.map((e, i, arr) => {
        const past = Date.parse(e.at) < now;
        return (
          <Fragment key={e.id}>
            {(i === 0 || dayOf(e.at) !== dayOf(arr[i - 1].at)) && <div className="ev-day">{dayLabel(e.at)}</div>}
            <div className={`ev-row${past ? " past" : ""}${i === nextIdx ? " next" : ""}`} title={fmtStampSafe(e.at)}>
              <span className="ev-t">{fmtClock(new Date(e.at), SGT)}<small>{e.currency ?? e.country}</small></span>
              <span className="ev-m">
                <span className="ev-n"><i className={`imp ${e.impact[0].toLowerCase()}`} title={`${e.impact} impact`} />{e.title}{e.kind === "speech" ? " · speech" : e.kind === "report" ? " · report" : ""}</span>
                <span className="ev-s">Consensus {e.forecast ?? "–"} · Previous {e.previous ?? "–"}</span>
              </span>
              <span className={`ev-a ${e.better === true ? "up" : e.better === false ? "dn" : ""}`}>{e.actual ?? (past ? "–" : "")}</span>
            </div>
          </Fragment>
        );
      })}
    </div></div>
  );
}

/** The results calendar's lines: under the bar of each company's own market's day, its date's mark (conf. or est.)
 *  where the time used to be, as the source gives no release time (A-30). */
function EarningsList({ rows }: { rows: EarningsRow[] }) {
  const box = useRef<HTMLDivElement>(null);
  useRowCap(box, SHOWN, ".ev-row", ".ev-day", [rows.length > 0]);
  const days = useMemo(() => calendarDays(rows), [rows]);
  return (
    <div className="mp-scroll" ref={box}><div>
      {days.map((r, i, arr) => (
        <Fragment key={r.symbol}>
          {(i === 0 || r.day !== arr[i - 1].day) && <div className="ev-day">{resultsDayLabel(r.day)}</div>}
          <div className={`ev-row tap${resultsPast(r) ? " past" : ""}`} role="button" tabIndex={0} title={`${r.name} (${r.symbol}) · ${r.indices.join(", ")}`} onClick={() => openAsset(r.symbol)}>
            <span className="ev-t">{resultsStatusShort(r.estimate)}<small>{r.symbol}</small></span>
            <span className="ev-m">
              <span className="ev-n">{r.name}</span>
              <span className="ev-s">{r.sector ?? "–"}</span>
            </span>
            <span className="ev-a sm">{r.mcapUsd == null ? "–" : `$${money(r.mcapUsd)}`}</span>
            <Star symbol={r.symbol} name={r.name} />
          </div>
        </Fragment>
      ))}
    </div></div>
  );
}

export function NewsPhone({ tick }: { tick: number }) {
  const [calMode, setCalMode] = useState<"macro" | "earnings">("macro");
  const [imp, setImp] = useState<"high" | "hm" | "all">("high");
  const [scope, setScope] = useState<"major" | "all">("major");
  const [ccyPick, setCcy] = useState("All");
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All");
  const [big, setBig] = useState(true);
  const [cat, setCat] = useState<(typeof NEWS_CATEGORIES)[number]>("All");
  const [shown, setShown] = useState(PAGE);
  const cal = useApi<{ rows: EconEvent[] }>("calendar", undefined, Math.floor(tick / 5));   // the calendar syncs hourly, the headlines every ten minutes
  const ern = useApi<{ rows: EarningsRow[]; source: string }>(calMode === "earnings" ? "earnings" : null, { days: 21 }, Math.floor(tick / 30));
  const news = useApi<{ rows: NewsItem[] }>("news", { category: cat === "All" ? undefined : cat, n: 150 }, Math.floor(tick / 5));
  const { events, ccy, ccys } = useMemo(() => calendarRows(cal.data?.rows ?? [], imp, scope, ccyPick), [cal.data, imp, scope, ccyPick]);
  const companies = useMemo(() => (ern.data?.rows ?? []).filter((r) => (region === "All" || REGION(r) === region) && (!big || (r.mcapUsd ?? 0) >= 1e10)), [ern.data, region, big]);
  const upcoming = events.some((e) => Date.parse(e.at) > Date.now());
  const heads = news.data?.rows ?? [];
  const macro = calMode === "macro";
  return (
    <Screen title={TAB.news} sub="times in SGT">
      <Section title={macro ? "Economic calendar" : RESULTS_CALENDAR} card={false}>
        <div className="mp-picks">
          <Pick label="Type" value={calMode} options={CAL_MODES} onChange={setCalMode} />
          {macro ? <>
            <Pick label="Impact" value={imp} options={IMPACTS} onChange={setImp} />
            <Pick label="Countries" value={scope} options={SCOPES} onChange={setScope} />
            <Pick label={CURRENCY} id="cal-ccy" value={ccy} options={ccys} onChange={setCcy} title="Only the events of one currency (JPY: Japan's)" />
          </> : <>
            <Pick label="Region" value={region} options={REGIONS} onChange={setRegion} />
            <Pick label={MKT_CAP} value={big ? "big" : "all"} options={SIZES} onChange={(v) => setBig(v === "big")} />
          </>}
        </div>
        <div className="mp-card">
          {macro
            ? (events.length ? <MacroList events={events} listKey={`${imp}|${scope}|${ccy}`} /> : <Empty title="No calendar loaded">{cal.error ?? "The calendar sync runs every hour."}</Empty>)
            : (companies.length ? <EarningsList rows={companies} /> : <Empty title={ern.data ? "No companies match" : "Loading results dates"}>{ern.error ?? (ern.data ? "Widen the region or the market cap." : "")}</Empty>)}
        </div>
        <p className="mp-note">
          {macro
            ? <>{events.length} events{cal.data?.rows[0]?.source === "fxstreet" ? " · FXStreet" : cal.data?.rows.length ? " · ForexFactory" : ""}{cal.data && !upcoming ? " · no upcoming events in the feed yet" : ""} · scroll inside the box for more</>
            : <span id="ern-note">{companies.length} companies over three weeks · {RESULTS_NOTE} · conf. or est., as the source marks the date</span>}
        </p>
      </Section>
      <Section title={HEADLINES} aux={<Pick label="Category" value={cat} options={CATEGORY_OPTIONS} onChange={(c) => { setCat(c); setShown(PAGE); }} />} card={false}>
        {heads.length ? (
          <>
            <div className="mp-card">
              {heads.slice(0, shown).map((it) => (
                <a className="nw-row" key={it.id} href={it.url} target="_blank" rel="noreferrer">
                  <span className="nw-meta"><b>{it.source}</b><span>{fmtWhen(it.publishedAt)}</span>{cat === "All" && <span className="nw-cat">{categoryLabel(it.category)}</span>}</span>
                  <span className="nw-title">{decodeEntities(it.title)}</span>
                  {it.tickers?.length > 0 && (
                    <span className="nw-tk">{it.tickers.slice(0, 3).map((t) => <button type="button" key={t.s} title={`Open ${t.n} (${t.s})`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAsset(t.s); }}>{t.n}</button>)}</span>
                  )}
                </a>
              ))}
            </div>
            {heads.length > shown && <button type="button" className="mp-more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, heads.length - shown)} more of {heads.length}</button>}
          </>
        ) : <div className="mp-card"><Empty title="No headlines">{news.error ?? "The news job runs every ten minutes."}</Empty></div>}
      </Section>
    </Screen>
  );
}
