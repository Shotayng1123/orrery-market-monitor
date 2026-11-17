import { Fragment, useState } from "react";
import { Empty } from "../components/Panel";
import { Pick, type PickOption } from "../components/Pick";
import { Star } from "../components/Star";
import { openAsset } from "../components/CompanyCard";
import { Move, Screen, Section } from "../components/PhoneKit";
import { useApi } from "../lib/useApi";
import { setWatched, useWatch } from "../lib/watch";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtClock, fmtStamp, SGT } from "../lib/time";
import { dayLabel, dayOf } from "./News";
import { day, decode, type Feed, type WatchRow } from "./Watchlist";

/** WATCHLIST for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026): the user's own names as lines with one
 *  change (the period is picked at the top), then their earnings dates, alerts, headlines and research mentions. */
type Key = "pct1d" | "pct1w" | "pct1m" | "pct3m" | "pct12m";
const KEYS: PickOption<Key>[] = [{ value: "pct1d", label: "1D" }, { value: "pct1w", label: "1W" }, { value: "pct1m", label: "1M" }, { value: "pct3m", label: "3M" }, { value: "pct12m", label: "12M" }];

export function WatchlistPhone({ tick }: { tick: number }) {
  const w = useWatch();
  const list = useApi<{ rows: WatchRow[] }>("watch_list", { v: w.version }, tick);
  const feed = useApi<Feed>("watch_feed", { v: w.version }, Math.floor(tick / 5));
  const [k, setK] = useState<Key>("pct1d");
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const rows = list.data?.rows ?? [];
  const alerts = feed.data?.alerts ?? [], news = feed.data?.news ?? [], research = feed.data?.research ?? [];
  const submit = async () => {
    const s = add.trim();
    if (!s) return;
    const err = await setWatched(/^[a-z]{1,5}$/.test(s) ? s.toUpperCase() : s, true);
    setMsg(err); if (!err) setAdd("");
  };
  const ahead = rows.filter((r) => r.earningsAt && Date.parse(r.earningsAt) > Date.now() - 86400e3).sort((a, b) => a.earningsAt!.localeCompare(b.earningsAt!));
  const name = (s: string) => rows.find((r) => r.symbol === s)?.name ?? s;
  return (
    <Screen title="Watchlist" sub={list.data ? `${rows.length} name${rows.length === 1 ? "" : "s"}` : list.error ? <span className="warn">{list.error}</span> : "loading…"} right={<Pick label="Change" value={k} options={KEYS} onChange={setK} />}>
      <form className="mp-add" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input className="mp-find" type="text" placeholder="Add a symbol: NVDA, 7203.T, ^N225" value={add} autoCapitalize="characters" autoCorrect="off" onChange={(e) => { setAdd(e.target.value); setMsg(null); }} />
        <button type="submit" className="mp-act">Add</button>
      </form>
      {msg && <p className="mp-note warn">{msg}</p>}
      <Section title="My names" aux="stocks at the last close">
        {rows.length ? rows.map((r) => (
          <div className="mp-row tap starred" key={r.symbol} role="button" tabIndex={0} title={`${r.name} (${r.symbol})${r.asOf ? ` · as of ${r.asOf.length > 10 ? fmtStamp(r.asOf) : r.asOf}` : ""}`} onClick={() => openAsset(r.symbol)}>
            <Star symbol={r.symbol} name={r.name} />
            <span className="mp-nm"><span className="n">{r.name}</span><span className="mp-st">{r.symbol} · {r.sector ?? r.kind}</span></span>
            <span className="mp-px">{fmtNum(r.last, r.last != null && r.last >= 1000 ? 0 : r.isYield ? 3 : 2)}</span>
            <Move v={r[k]}>{fmtPct(r[k], 1)}</Move>
          </div>
        )) : <Empty title={w.ready && list.data ? "Your watchlist is empty" : "Loading your watchlist"}>{list.error ?? (w.ready && list.data ? "Press the star beside a name on its page, in the screener or in the earnings calendar, or type a symbol above." : "")}</Empty>}
      </Section>
      <Section title="Earnings ahead" aux="times in SGT">
        {ahead.length ? ahead.map((r, i, arr) => (
          <Fragment key={r.symbol}>
            {(i === 0 || dayOf(r.earningsAt!) !== dayOf(arr[i - 1].earningsAt!)) && <div className="ev-day">{dayLabel(r.earningsAt!)}</div>}
            <div className="ev-row tap" role="button" tabIndex={0} onClick={() => openAsset(r.symbol)}>
              <span className="ev-t">{fmtClock(new Date(r.earningsAt!), SGT)}</span>
              <span className="ev-m"><span className="ev-n">{r.name}</span><span className="ev-s">{r.symbol} · {r.sector ?? r.kind}</span></span>
              <span className="ev-a sm">{r.earningsEst ? "est." : "confirmed"}</span>
            </div>
          </Fragment>
        )) : <Empty title="No dates ahead">{rows.length ? "None of your names has an earnings date in the feed." : "Add names to see their earnings dates."}</Empty>}
      </Section>
      <Section title="Alerts on my names" aux={feed.data ? `${alerts.length} recent` : ""}>
        {alerts.length ? alerts.map((a) => {
          const body = <><span className="nw-meta"><span>{fmtStamp(a.at)}</span>{a.pct != null && <b className={signCls(a.pct)}>{fmtPct(a.pct, 1)}</b>}</span><span className="nw-title">{a.msg}</span></>;
          return a.url ? <a className="nw-row" key={a.id} href={a.url} target="_blank" rel="noreferrer">{body}</a> : <div className="nw-row" key={a.id} role="button" tabIndex={0} onClick={() => openAsset(a.symbol)}>{body}</div>;
        }) : <Empty title="No alerts">{feed.error ?? "Moves beyond ±7%, buybacks, guidance changes and large deals on your names appear here."}</Empty>}
      </Section>
      <Section title="Headlines on my names" aux={feed.data ? `${news.length} in the feed` : ""}>
        {news.length ? news.slice(0, 30).map((it) => (
          <a className="nw-row" key={it.id} href={it.url} target="_blank" rel="noreferrer">
            <span className="nw-meta"><b>{it.source}</b><span>{fmtStamp(it.publishedAt)}</span></span>
            <span className="nw-title">{decode(it.title)}</span>
            <span className="nw-tk">{it.tickers.filter((t) => w.has(t.s)).map((t) => <button type="button" key={t.s} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAsset(t.s); }}>{t.n}</button>)}</span>
          </a>
        )) : <Empty title="No headlines">{feed.error ?? "Headlines that name one of your companies appear here."}</Empty>}
      </Section>
      <Section title="In research" aux="pieces that mention my names">
        {research.length ? research.map((r) => (
          <button type="button" className="rs-row" key={r.key} onClick={() => { location.hash = `research/${encodeURIComponent(r.key)}`; }}>
            <span className="meta"><span>{day(r.d)}</span><span>{r.symbols.map(name).join(" · ")}</span></span>
            <span className="t">{r.title}</span>
          </button>
        )) : <Empty title="No mentions">{feed.error ?? "Daily notes and weekly reports that mention your names appear here."}</Empty>}
      </Section>
    </Screen>
  );
}
