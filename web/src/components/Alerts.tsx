import { useEffect, useRef, useState } from "react";
import { useApi } from "../lib/useApi";
import type { Alert } from "../lib/types";
import { fmtStamp, fmtWhen } from "../lib/time";
import { fmtPct, fmtSigma, signCls } from "../lib/fmt";
import { openAsset } from "./CompanyCard";
import { openNotify } from "../lib/push";
import { alertFigWord, alertHeadline } from "../lib/alertline";

const SEEN_KEY = "om_alert_seen";
const NEW_FOR_MS = 30 * 60e3;   // an alert nobody has opened stays lit for half an hour after it was raised
const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0; } catch { return 0; } };

const KIND_LABEL: Record<Alert["kind"], string> = { stock: "move", index: "index", buyback: "buyback", revision: "guidance", mna: "M&A", sigma: "σ move" };
const isNews = (r: Alert) => r.kind === "buyback" || r.kind === "revision" || r.kind === "mna";
/** A σ move (I-6): a currency, yield, commodity, volatility index, future or coin beyond 2.5σ of its daily changes. */
const isSigma = (r: Alert) => r.kind === "sigma";
const hasPage = (r: Alert) => !!r.symbol && !r.symbol.startsWith("news:");

/** Alerts: the latest one as a single line next to the tabs, refreshed with every load; click for the last
 *  twenty. Excessive moves (a single stock beyond ±5% intraday if it is a large company, ±7% otherwise; an index beyond ±3%) and news alerts: buybacks
 *  and guidance revisions at companies worth USD 5bn or more, M&A with a stated size of USD 1bn or more.
 *  A new alert lights the line up (bright, pulsing) until it is opened or half an hour has passed (Shota, 15 Nov). */
export function Alerts({ tick }: { tick: number }) {
  const a = useApi<{ rows: Alert[] }>("alerts", { n: 20 }, tick);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<number>(readSeen);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const rows = a.data?.rows ?? [];
  const latest = rows[0];
  const newest = rows.reduce((m, r) => Math.max(m, r.id), 0);
  const fresh = latest ? Date.now() - Date.parse(latest.upd ?? latest.at) < 15 * 60e3 : false;   // shown time = when the alert was first raised; freshness = last confirmation
  const isNew = (r: Alert) => r.id > seen && Date.now() - Date.parse(r.at) < NEW_FOR_MS;
  const lit = !!latest && isNew(latest);
  const toggle = () => {
    if (!open && newest > seen) { setSeen(newest); try { localStorage.setItem(SEEN_KEY, String(newest)); } catch { /* ignore */ } }
    setOpen(!open);
  };
  const RULES = "Excessive moves (stock beyond ±5% intraday for a large company, ±7% for the rest; index beyond ±3%), σ moves (a currency, yield, commodity, volatility index, future or coin beyond 2.5σ of its own daily changes over 63 sessions) and news: buybacks and guidance revisions at companies of USD 5bn+, M&A of USD 1bn+. Click for the last twenty";
  // On a computer the line is the label, the name, the figure and the time, and only the name is ever cut (the
  // designer's I-9 note; the layout guard found the time cut off on every screen, 19 Nov 2026). The figure says what
  // it is ("intraday", "at close", "1D": lib/alertline.ts), from the server's own words. A news alert shows its kind
  // and its company; one that names no company with a page here shows the first words of its headline in the name's
  // place and the publisher it came from, so a publisher never reads as a party to the news (R2A-05). The sentence is
  // in the tooltip and the list. The phone's header shows the whole message under the label (tokens.css, body.pv2),
  // so it keeps it as the second item.
  const word = latest ? alertFigWord(latest) : null, orphan = !!latest && isNews(latest) && !hasPage(latest);
  return (
    <div id="alerts" ref={box}>
      <span className={`alrt${latest ? (lit ? " new" : fresh ? " fresh" : "") : " none"}`} onClick={toggle} title={latest ? `${latest.msg}${isNews(latest) && latest.market ? ` (${latest.market})` : ""}${isSigma(latest) && latest.note ? ` · ${latest.note}` : ""} · ${fmtStamp(latest.at)}\n\n${RULES}` : RULES}>
        <span className="k">{lit ? "NEW ALERT" : "ALERT"}</span>
        {latest ? <>
          <span className={`msg ${signCls(isSigma(latest) ? latest.sigma : latest.pct, 1)}`}>{latest.msg}</span>
          <span className="one">
            {(isNews(latest) || isSigma(latest)) && <span className="kd">{KIND_LABEL[latest.kind]}</span>}
            <span className="nm">{orphan ? alertHeadline(latest.msg) : latest.name}</span>
            {isSigma(latest) && latest.sigma != null && <span className={`fig ${signCls(latest.sigma, 1)}`}>{fmtSigma(latest.sigma)}</span>}
            {!isNews(latest) && !isSigma(latest) && latest.pct != null && <span className={`fig ${signCls(latest.pct, 1)}`}>{fmtPct(latest.pct, 1)}</span>}
            {!isNews(latest) && !isSigma(latest) && latest.pct != null && word && <span className="q">{word}</span>}
            {orphan && latest.market && <span className="src">via {latest.market}</span>}
          </span>
          <span className="t">{fmtWhen(latest.at)}</span>
        </> : <span className="mut">{a.error ? "unavailable" : "no excessive moves"}</span>}
      </span>
      {open && (
        <div className="aldrop">
          <div className="minih">Last {rows.length} alerts · stock ±5% intraday (large companies) or ±7% · index ±3% · σ moves from 2.5σ · buybacks and guidance (USD 5bn+ companies) · M&A (USD 1bn+)<span className="lnk alntf" title="Get these alerts as notifications on this device" onClick={() => { setOpen(false); openNotify(); }}>Notifications…</span></div>
          {rows.length ? (
            <table className="secT"><tbody>{rows.map((r) => <tr key={r.id} data-kind={r.kind}><td className="l mut num">{fmtStamp(r.at)}</td><td className="l">{isNews(r) && r.url ? <><a href={r.url} target="_blank" rel="noreferrer" title="Open the article">{r.msg}</a>{hasPage(r) && <span className="lnk alpg" title={`Open ${r.name}`} onClick={() => { setOpen(false); openAsset(r.symbol); }}> ›</span>}</> : hasPage(r) ? <span className="lnk" title={`Open ${r.name}`} onClick={() => { setOpen(false); openAsset(r.symbol); }}>{r.msg}</span> : r.msg}{isSigma(r) && r.note && <small className="alnote">{r.note}</small>}</td><td className="l mut">{isNews(r) || isSigma(r) ? KIND_LABEL[r.kind] : r.kind === "index" ? "index" : r.market}</td><td className={`num ${signCls(isSigma(r) ? r.sigma : r.pct, 1)}`}>{isNews(r) ? "" : isSigma(r) ? fmtSigma(r.sigma) : r.pct == null ? "" : fmtPct(r.pct, 1)}</td></tr>)}</tbody></table>
          ) : <div className="empty">No excessive moves recorded yet.</div>}
        </div>
      )}
    </div>
  );
}
