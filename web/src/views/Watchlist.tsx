import { useState } from "react";
import { Empty, Panel } from "../components/Panel";
import { Star } from "../components/Star";
import { hideCard, money, openAsset, showCard } from "../components/CompanyCard";
import { useApi } from "../lib/useApi";
import { setWatched, useWatch } from "../lib/watch";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { fmtClock, fmtStamp, SGT } from "../lib/time";

export interface WatchRow { symbol: string; name: string; kind: string; sector: string | null; ccy: string | null; last: number | null; asOf: string | null; pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null; vs50: number | null; vs200: number | null; pos52: number | null; mcap: number | null; earningsAt: string | null; earningsEst: boolean | null; isYield: boolean }
export interface Feed {
  alerts: Array<{ id: number; at: string; symbol: string; name: string; kind: string; pct: number | null; msg: string; url: string | null }>;
  news: Array<{ id: number; publishedAt: string; source: string; title: string; url: string; tickers: Array<{ s: string; n: string }> }>;
  research: Array<{ key: string; d: string; kind: string; title: string; symbols: string[] }>;
}
const UP = "63,208,126", DN = "255,77,66";
const shade = (v: number | null, full: number) => (v == null || v === 0 ? undefined : `rgba(${v > 0 ? UP : DN},${(Math.min(1, Math.abs(v) / full) * 0.5).toFixed(3)})`);
export const day = (t: string) => new Date(t).toLocaleDateString("en-GB", { timeZone: SGT, weekday: "short", day: "numeric", month: "short" });
export const decode = (t: string) => t.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));

/** WATCHLIST: the user's own names in one place: their figures, the earnings dates ahead, and what has happened
 *  around them (alerts, headlines that name them, research that mentions them). Names are added with the star
 *  on any stock's page, in the earnings calendar and the screener, or by typing a symbol here. */
export function WatchlistView({ tick }: { tick: number }) {
  const w = useWatch();
  const list = useApi<{ rows: WatchRow[] }>("watch_list", { v: w.version }, tick);
  const feed = useApi<Feed>("watch_feed", { v: w.version }, Math.floor(tick / 5));
  const [add, setAdd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const rows = list.data?.rows ?? [];
  const cell = (v: number | null, full: number, bp = false) => <td className={`num ${signCls(v)}`} style={{ background: shade(v, full) }}>{bp ? (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`) : fmtPct(v, 1)}</td>;
  const submit = async () => {
    const s = add.trim();
    if (!s) return;
    const err = await setWatched(/^[a-z]{1,5}$/.test(s) ? s.toUpperCase() : s, true);
    setMsg(err); if (!err) setAdd("");
  };
  const ahead = rows.filter((r) => r.earningsAt && Date.parse(r.earningsAt) > Date.now() - 86400e3).sort((a, b) => a.earningsAt!.localeCompare(b.earningsAt!));
  const name = (s: string) => rows.find((r) => r.symbol === s)?.name ?? s;
  const how = "Press the star beside a name on its own page, in the screener or in the earnings calendar, or type a symbol above (NVDA, 7203.T, ^N225, USDJPY=X).";
  return (
    <>
      <Panel no="01" title="MY NAMES" span={8} k="wl" aux={<>{rows.length} name{rows.length === 1 ? "" : "s"} · stocks at the last close, market instruments at the last print</>}>
        <div className="searchrow">
          <input type="text" placeholder="add a symbol: NVDA, 7203.T, ^N225" value={add} onChange={(e) => { setAdd(e.target.value); setMsg(null); }} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} style={{ width: 240 }} />
          <span className="chip-sm" onClick={() => void submit()}>ADD</span>
          {msg && <span className="warn">{msg}</span>}
        </div>
        {rows.length ? (
          <table className="secT wlT">
            <thead><tr><th /><th className="l">Name</th><th className="l">Sector / kind</th><th>Last</th><th>1D</th><th>1W</th><th>1M</th><th>3M</th><th>12M</th><th>vs 50d</th><th>vs 200d</th><th>52w</th><th>Mkt cap</th><th className="l">Earnings</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.symbol}>
                <td className="l"><Star symbol={r.symbol} name={r.name} /></td>
                <td className="l nm" title={`${r.name} (${r.symbol})`}><span className="lnk" onMouseEnter={(e) => showCard(r.symbol, e)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.name}</span> <span className="mut">{r.symbol}</span></td>
                <td className="l mut">{r.sector ?? r.kind}</td>
                <td className="num" title={r.asOf ? `as of ${r.asOf.length > 10 ? fmtStamp(r.asOf) : r.asOf}` : ""}><b>{fmtNum(r.last, r.last != null && r.last >= 1000 ? 0 : r.isYield ? 3 : 2)}</b></td>
                {cell(r.pct1d, 4)}{cell(r.pct1w, 8)}{cell(r.pct1m, 12)}{cell(r.pct3m, 20)}{cell(r.pct12m, 50)}{cell(r.vs50, 10)}{cell(r.vs200, 20)}
                <td className="num mut">{r.pos52 == null ? "–" : Math.round(r.pos52)}</td>
                <td className="num mut">{r.mcap == null ? "–" : money(r.mcap, r.ccy)}</td>
                <td className="l mut">{r.earningsAt ? `${day(r.earningsAt)}${r.earningsEst ? " est." : ""}` : "–"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty title={w.ready && list.data ? "Your watchlist is empty" : "Loading your watchlist"}>{list.error ?? (w.ready && list.data ? how : "")}</Empty>}
      </Panel>
      <Panel no="02" title="EARNINGS AHEAD" span={4} k="wl-earn" aux="my names · SGT">
        {ahead.length ? (
          <table className="secT"><tbody>{ahead.map((r) => <tr key={r.symbol}><td className="l mut num">{day(r.earningsAt!)} {fmtClock(new Date(r.earningsAt!), SGT)}</td><td className="l"><span className="lnk" onClick={() => openAsset(r.symbol)}>{r.name}</span></td><td className="l mut">{r.earningsEst ? "est." : "confirmed"}</td></tr>)}</tbody></table>
        ) : <Empty title="No dates ahead">{rows.length ? "None of your names has an earnings date in the feed." : "Add names to see their earnings dates."}</Empty>}
      </Panel>
      <Panel no="03" title="ALERTS ON MY NAMES" span={4} k="wl-alerts" aux={feed.data ? `${feed.data.alerts.length} recent` : ""}>
        {feed.data?.alerts.length ? (
          <table className="secT"><tbody>{feed.data.alerts.map((a) => <tr key={a.id}><td className="l mut num">{fmtStamp(a.at).replace(" SGT", "")}</td><td className="l">{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.msg}</a> : <span className="lnk" onClick={() => openAsset(a.symbol)}>{a.msg}</span>}</td><td className={`num ${signCls(a.pct)}`}>{a.pct == null ? "" : fmtPct(a.pct, 1)}</td></tr>)}</tbody></table>
        ) : <Empty title="No alerts">{feed.error ?? "Moves beyond ±7%, buybacks, guidance changes and large deals on your names appear here."}</Empty>}
      </Panel>
      <Panel no="04" title="HEADLINES ON MY NAMES" span={8} k="wl-news" aux={feed.data ? `${feed.data.news.length} in the feed` : ""}>
        {feed.data?.news.length ? <div className="nwlist">{feed.data.news.map((it) => (
          <div className="nwrow" key={it.id}>
            <span className="nwt">{fmtStamp(it.publishedAt).replace(" SGT", "")}</span>
            <span className="nwh"><a href={it.url} target="_blank" rel="noreferrer">{decode(it.title)}</a></span>
            <span className="nwtk">{it.tickers.filter((t) => w.has(t.s)).map((t) => <span key={t.s} className="tk" onClick={() => openAsset(t.s)}>{t.n}</span>)}</span>
            <span className="nwsrc">{it.source}</span>
          </div>
        ))}</div> : <Empty title="No headlines">{feed.error ?? "Headlines that name one of your companies appear here."}</Empty>}
      </Panel>
      <Panel no="05" title="IN RESEARCH" span={4} k="wl-research" aux="pieces that mention my names">
        {feed.data?.research.length ? (
          <table className="secT"><tbody>{feed.data.research.map((r) => <tr key={r.key}><td className="l mut num">{day(r.d)}</td><td className="l"><span className="lnk" onClick={() => { location.hash = `research/${encodeURIComponent(r.key)}`; }}>{r.title}</span><div className="mut" style={{ fontSize: 10 }}>{r.symbols.map(name).join(" · ")}</div></td></tr>)}</tbody></table>
        ) : <Empty title="No mentions">{feed.error ?? "Daily notes and weekly reports that mention your names appear here."}</Empty>}
      </Panel>
    </>
  );
}
