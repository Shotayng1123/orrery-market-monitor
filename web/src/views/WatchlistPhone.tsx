import { useAddBox } from "../lib/candidates";
import { Fragment, useState } from "react";
import { Empty } from "../components/Panel";
import { Pick, type PickOption } from "../components/Pick";
import { Star } from "../components/Star";
import { openAsset } from "../components/CompanyCard";
import { Move, Screen, Section } from "../components/PhoneKit";
import { NotifyNudge } from "../components/Notify";
import { useApi } from "../lib/useApi";
import { useWatch } from "../lib/watch";
import { fmtPct, fmtSigma, signCls } from "../lib/fmt";
import { sigmaNoteLine } from "../lib/alertline";
import { asOfLine, asOfOf, asOfTitle, fmtDate, fmtWhen } from "../lib/time";
import { classLabel, hitLine, PERIOD, RESULTS_AHEAD, TAB } from "../lib/labels";
import { byResultsDay, MARKS_NOTE, RESULTS_NOTE, resultsDayLabel, resultsStatusShort } from "../lib/results";
import { cellBp } from "./Market";
import { ClosedNow } from "../components/ClosedNow";
import { closedWords, decode, lastOf, sourcesOf, useWatchMarkets, WINDOWS, WL_ALERTS_EMPTY, type Feed, type WatchRow } from "./Watchlist";
import { NAV_WAIT } from "../lib/nav";

/** WATCHLIST for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026): the user's own names as lines with one
 *  change (the period is picked at the top), then their results dates, alerts, headlines and research mentions.
 *  Each line says what it is as of under the name, and its change says its window (19 Nov 2026). */
type Key = (typeof WINDOWS)[number][0];
const KEYS: PickOption<Key>[] = WINDOWS.map(([value, , label]) => ({ value, label }));
/** The change a line shows: a yield's in bp (the change of its level), anything else's in per cent. */
const change = (r: WatchRow, k: Key): { v: number | null; text: string; cls: string } => {
  if (!r.isYield) return { v: r[k], text: fmtPct(r[k], 1), cls: signCls(r[k], 1) };
  const v = r[WINDOWS.find((x) => x[0] === k)![1]] ?? null;
  return { v, text: cellBp(v), cls: signCls(v == null ? null : v * 100, 1) };
};

export function WatchlistPhone({ tick }: { tick: number }) {
  const w = useWatch();
  const list = useApi<{ rows: WatchRow[] }>("watch_list", { v: w.version }, tick);
  const feed = useApi<Feed>("watch_feed", { v: w.version }, Math.floor(tick / 5));
  const [k, setK] = useState<Key>("pct1d");
  const box = useAddBox(w.has);
  const rows = list.data?.rows ?? [], src = sourcesOf(rows);
  const market = useWatchMarkets(tick);   // each name's market, for the line of those that are shut and a row's tooltip
  const alerts = feed.data?.alerts ?? [], news = feed.data?.news ?? [], research = feed.data?.research ?? [];
  // each name's next results under the day bar of its own market's day, no time of day (A-30)
  const ahead = byResultsDay(rows.filter((r) => r.earningsAt && Date.parse(r.earningsAt) > Date.now() - 86400e3), (r) => r.earningsAt, (r) => r.symbol);
  const name = (s: string) => rows.find((r) => r.symbol === s)?.name ?? s;
  return (
    <Screen title={TAB.watch} sub={list.data ? `${rows.length} name${rows.length === 1 ? "" : "s"}${rows.length ? " · times in SGT" : ""}` : list.error ? <span className="warn">{list.error}</span> : "loading…"} right={<Pick label={PERIOD} value={k} options={KEYS} onChange={setK} />}>
      <form className="mp-add" onSubmit={(e) => { e.preventDefault(); void box.submit(); }}>
        <input className="mp-find" id="wl-add" type="text" aria-label="Add a name to the watchlist" placeholder="Add: toyota, NVDA, 7203" value={box.text} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} onChange={(e) => box.setText(e.target.value)} />
        <button type="submit" className="mp-act">Add</button>
      </form>
      {box.msg && <p id="wl-msg" className={`mp-note${box.msg.kind === "err" ? " warn" : ""}`}>{box.msg.text}</p>}
      {(box.hits.length > 0 || box.busy) && (
        <div className="mp-card mp-cands" id="wl-cands">
          {box.busy && !box.hits.length && <div className="mp-cand none">Searching…</div>}
          {box.hits.map((h) => (
            <button type="button" className={`mp-cand${w.has(h.symbol) ? " have" : ""}`} key={h.symbol} onClick={() => void box.addHit(h)}>
              <span className="w"><span className="n">{h.name}</span><span className="k"><b>{h.symbol}</b>{hitLine(h) ? ` · ${hitLine(h)}` : ""}</span></span>
              <span className="a">{w.has(h.symbol) ? "In your list" : "Add"}</span>
            </button>
          ))}
        </div>
      )}
      {/* until the names have come, Back holds the list where it stood (lib/nav.ts; B-33): the sections below are drawn
          first, and the names then arrive above them. The same until the market table has come: the line of the
          markets that are shut, above the names, is at its full length only then */}
      {(!w.ready || (!list.data && !list.error) || !market.ready) && <span {...{ [NAV_WAIT]: "" }} hidden />}
      <Section title="My names" aux="times in SGT" card={false}>
        {/* the markets of my names that are shut, each with when it opens: above the list (the designer's D-62) */}
        {rows.length > 0 && <ClosedNow id="wl-opens" rows={rows.map(market)} phone />}
        <div className="mp-card">
          {rows.length ? rows.map((r) => {
            const a = asOfOf(r.asOf, r.asOfKind), c = change(r, k);
            return (
              <div className="mp-row tap starred" key={r.symbol} role="button" tabIndex={0} title={`${r.name} (${r.symbol}) · ${asOfTitle(a, r.source)}${closedWords(market(r))}`} onClick={() => openAsset(r.symbol)}>
                <Star symbol={r.symbol} name={r.name} />
                <span className="mp-nm"><span className="n">{r.name}</span><span className="mp-st one">{r.symbol} · <span className="nb">{asOfLine(a)}</span></span></span>
                <span className="mp-px">{lastOf(r)}</span>
                <Move v={c.v} cls={c.cls} w={KEYS.find((x) => x.value === k)?.label}>{c.text}</Move>
              </div>
            );
          }) : <Empty title={w.ready && list.data ? "Your watchlist is empty" : "Loading your watchlist"}>{list.error ?? (w.ready && list.data ? "Press the star beside a name on its page, in the screener or in the results calendar, or type part of a name or of a symbol above and choose from the list." : "")}</Empty>}
        </div>
        {rows.length > 0 && <p className="mp-note" id="wl-src">{src ? `${/[,;]/.test(src) ? "Sources" : "Source"}: ${src}. ` : ""}A stock is at its last close, a market instrument at its last print; a yield's changes are in bp.</p>}
      </Section>
      <Section title={RESULTS_AHEAD} aux="Yahoo Finance · dates only" card={false}>
        <div className="mp-card">
          {ahead.length ? ahead.map((r, i, arr) => (
            <Fragment key={r.symbol}>
              {(i === 0 || r.day !== arr[i - 1].day) && <div className="ev-day">{resultsDayLabel(r.day)}</div>}
              <div className="ev-row tap" role="button" tabIndex={0} onClick={() => openAsset(r.symbol)}>
                <span className="ev-t">{resultsStatusShort(r.earningsEst, r.symbol)}</span>
                <span className="ev-m"><span className="ev-n">{r.name}</span><span className="ev-s">{r.symbol} · {r.sector ?? classLabel(r.kind)}</span></span>
              </div>
            </Fragment>
          )) : <Empty title="No dates ahead">{rows.length ? "None of your names has a results date in the feed." : "Add names to see their results dates."}</Empty>}
        </div>
        {ahead.length > 0 && <p className="mp-note" id="wl-results-note">{RESULTS_NOTE} · {MARKS_NOTE}.</p>}
      </Section>
      <Section title="Alerts on my names" aux={feed.data ? `${alerts.length} recent` : ""}>
        {rows.length > 0 && <NotifyNudge />}
        {alerts.length ? alerts.map((a) => {
          // a σ move: its σ beside the time (a yield's has no per cent), what it is and its window and source under it (F3)
          const sg = a.kind === "sigma", v = sg ? a.sigma ?? null : a.pct;
          const body = <><span className="nw-meta"><span>{fmtWhen(a.at)}</span>{v != null && <b className={signCls(v, 1)}>{sg ? fmtSigma(v) : fmtPct(v, 1)}</b>}</span><span className="nw-title">{a.msg}</span>{sg && <span className="nw-note">{sigmaNoteLine(a)}</span>}</>;
          return a.url ? <a className="nw-row" key={a.id} data-kind={a.kind} href={a.url} target="_blank" rel="noreferrer">{body}</a> : <div className="nw-row" key={a.id} data-kind={a.kind} role="button" tabIndex={0} onClick={() => openAsset(a.symbol)}>{body}</div>;
        }) : <Empty title="No alerts">{feed.error ?? WL_ALERTS_EMPTY}</Empty>}
      </Section>
      <Section title="Headlines on my names" aux={feed.data ? `${news.length} in the feed` : ""}>
        {news.length ? news.slice(0, 30).map((it) => (
          <a className="nw-row" key={it.id} href={it.url} target="_blank" rel="noreferrer">
            <span className="nw-meta"><b>{it.source}</b><span>{fmtWhen(it.publishedAt)}</span></span>
            <span className="nw-title">{decode(it.title)}</span>
            <span className="nw-tk">{it.tickers.filter((t) => w.has(t.s)).map((t) => <button type="button" key={t.s} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAsset(t.s); }}>{t.n}</button>)}</span>
          </a>
        )) : <Empty title="No headlines">{feed.error ?? "Headlines that name one of your companies appear here."}</Empty>}
      </Section>
      <Section title="In research" aux="pieces that mention my names">
        {research.length ? research.map((r) => (
          <button type="button" className="rs-row" key={r.key} onClick={() => { location.hash = `research/${encodeURIComponent(r.key)}`; }}>
            <span className="meta"><span>{fmtDate(r.d)}</span><span>{r.symbols.map(name).join(" · ")}</span></span>
            <span className="t">{r.title}</span>
          </button>
        )) : <Empty title="No mentions">{feed.error ?? "Daily notes and weekly reports that mention your names appear here."}</Empty>}
      </Section>
    </Screen>
  );
}
