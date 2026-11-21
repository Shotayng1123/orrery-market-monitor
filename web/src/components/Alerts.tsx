import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { zoomNow } from "../lib/prefs";
import { useApi } from "../lib/useApi";
import type { Alert } from "../lib/types";
import { fmtStamp, fmtWhen } from "../lib/time";
import type { ReactNode } from "react";
import { fmtPct, fmtSigma, signCls } from "../lib/fmt";
import { openAsset } from "./CompanyCard";
import { openNotify } from "../lib/push";
import { alertFigWord, alertHeadline, sigmaNoteLine } from "../lib/alertline";
import { Sig } from "./Sig";

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
/** `phone`: the phone layout is on. Its list is rows, not a table (the designer's D-63, 21 Nov 2026). */
export function Alerts({ tick, phone = false }: { tick: number; phone?: boolean }) {
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
  // On a computer the list hangs from the alert line's left edge. Where the line stands near the window's right edge
  // (text size XL or L, a narrow window) the list is moved left until it is inside the window: it reached past the
  // edge there, with its figures out of sight (the designer's D-63). Layout is in zoomed CSS px, the window in
  // visual px (lib/prefs.ts), as for WATCHLIST's candidates.
  const drop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = drop.current;
    if (!open || !el || phone) return;
    const place = () => { el.style.left = "0px"; const r = el.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8); if (over > 0) el.style.left = `${-Math.max(0, Math.min(over, r.left - 8)) / zoomNow()}px`; };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, phone, rows.length]);
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
  // in the tooltip and the list (`.msg` is kept in the page for both layouts and shown by neither).
  const word = latest ? alertFigWord(latest) : null, orphan = !!latest && isNews(latest) && !hasPage(latest);
  // A phone's line is one line of 40 px (the designer's D-14 and note (b) of 21 Nov 2026): the same parts, without the
  // word after the figure and without a publisher (the stylesheet's: tokens.css, body.pv2), and with no line at all
  // when there is no alert (a new server, or none raised yet): "no excessive moves" took the height of a list row.
  // While the answer is on its way the line says so, and "unavailable" when it does not come.
  if (phone && a.data && !rows.length) return null;
  return (
    <div id="alerts" ref={box}>
      <span className={`alrt${latest ? (lit ? " new" : fresh ? " fresh" : "") : " none"}`} onClick={toggle} title={latest ? `${latest.msg}${isNews(latest) && latest.market ? ` (${latest.market})` : ""}${isSigma(latest) && latest.note ? ` · ${latest.note}` : ""} · ${fmtStamp(latest.at)}\n\n${RULES}` : RULES}>
        <span className="k">{lit ? "NEW ALERT" : "ALERT"}</span>
        {latest ? <>
          <span className={`msg ${signCls(isSigma(latest) ? latest.sigma : latest.pct, 1)}`}>{latest.msg}</span>
          <span className="one">
            {(isNews(latest) || isSigma(latest)) && <span className="kd"><Sig>{KIND_LABEL[latest.kind]}</Sig></span>}
            <span className="nm">{orphan ? alertHeadline(latest.msg) : latest.name}</span>
            {isSigma(latest) && latest.sigma != null && <span className={`fig ${signCls(latest.sigma, 1)}`}>{fmtSigma(latest.sigma)}</span>}
            {!isNews(latest) && !isSigma(latest) && latest.pct != null && <span className={`fig ${signCls(latest.pct, 1)}`}>{fmtPct(latest.pct, 1)}</span>}
            {!isNews(latest) && !isSigma(latest) && latest.pct != null && word && <span className="q">{word}</span>}
            {orphan && latest.market && <span className="src">via {latest.market}</span>}
          </span>
          <span className="t">{fmtWhen(latest.at)}</span>
        </> : <span className="mut">{phone ? (a.error ? "· unavailable" : "· loading…") : a.error ? "unavailable" : "no excessive moves"}</span>}
      </span>
      {/* The list (the designer's D-63, 21 Nov 2026; B-34). It was a table whose cells did not wrap in a box that scrolled
          sideways: on a phone every message was cut at the box's edge and a σ move's source was off the screen; on a
          computer the kind and the figure lay outside the box once the messages had the feed's length.
          A phone: the rows of WATCHLIST's "Alerts on my names": the time and, at the right, the figure in its sign's
          colour; the message, wrapping; for a σ move its kind, window and source under it. A tap opens the page (the
          article for a news alert, whose company keeps its own button). The rules are a note under the list.
          A computer: the message wraps; the time, the kind and the figure never leave the box.
          The head says once that the times are in SGT. */}
      {open && (phone ? (
        <div className="aldrop ph">
          <div className="minih"><Sig>{`Last ${rows.length} alerts · times in SGT`}</Sig><span className="lnk alntf" title="Get these alerts as notifications on this device" onClick={() => { setOpen(false); openNotify(); }}>Notifications…</span></div>
          {rows.length ? rows.map((r) => {
            const sg = isSigma(r), v = sg ? r.sigma ?? null : isNews(r) ? null : r.pct;
            const body: ReactNode = <>
              <span className="nw-meta"><span className="al-t">{fmtWhen(r.at)}</span>{v != null && <b className={`al-fig ${signCls(v, 1)}`}>{sg ? fmtSigma(v) : fmtPct(v, 1)}</b>}</span>
              <span className="nw-title al-msg">{r.msg}</span>
              {sg && <span className="nw-note al-note">{sigmaNoteLine(r)}</span>}
            </>;
            const go = () => { setOpen(false); openAsset(r.symbol); };
            if (isNews(r) && r.url) return <a className="nw-row" key={r.id} data-kind={r.kind} href={r.url} target="_blank" rel="noreferrer" title="Open the article">{body}{hasPage(r) && <span className="nw-tk"><button type="button" title={`Open ${r.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(); }}>{r.name}</button></span>}</a>;
            return hasPage(r) ? <div className="nw-row" key={r.id} data-kind={r.kind} role="button" tabIndex={0} title={`Open ${r.name}`} onClick={go}>{body}</div> : <div className="nw-row plain" key={r.id} data-kind={r.kind}>{body}</div>;
          }) : <div className="empty">No excessive moves recorded yet.</div>}
          <p className="mp-note alrules">Stock moves beyond ±5% intraday (large companies) or ±7%, index moves beyond ±3%, σ moves from 2.5σ (a currency, yield, commodity, volatility index, future or coin against its own daily changes over 63 sessions), buybacks and guidance changes (USD 5bn+ companies), M&A (USD 1bn+).</p>
        </div>
      ) : (
        <div className="aldrop" ref={drop}>
          {/* the head is upper-cased (.minih): every σ in it stays σ, never the sum sign Σ (the designer's D-11) */}
          <div className="minih"><Sig>{`Last ${rows.length} alerts · times in SGT · stock ±5% intraday (large companies) or ±7% · index ±3% · σ moves from 2.5σ · buybacks and guidance (USD 5bn+ companies) · M&A (USD 1bn+)`}</Sig><span className="lnk alntf" title="Get these alerts as notifications on this device" onClick={() => { setOpen(false); openNotify(); }}>Notifications…</span></div>
          {rows.length ? (
            <table className="secT"><tbody>{rows.map((r) => <tr key={r.id} data-kind={r.kind} title={fmtStamp(r.at)}><td className="l mut num al-t">{fmtWhen(r.at)}</td><td className="l al-msg">{isNews(r) && r.url ? <><a href={r.url} target="_blank" rel="noreferrer" title="Open the article">{r.msg}</a>{hasPage(r) && <span className="lnk alpg" title={`Open ${r.name}`} onClick={() => { setOpen(false); openAsset(r.symbol); }}> ›</span>}</> : hasPage(r) ? <span className="lnk" title={`Open ${r.name}`} onClick={() => { setOpen(false); openAsset(r.symbol); }}>{r.msg}</span> : r.msg}{isSigma(r) && r.note && <small className="alnote">{r.note}</small>}</td><td className="l mut al-kind">{isNews(r) || isSigma(r) ? KIND_LABEL[r.kind] : r.kind === "index" ? "index" : r.market}</td><td className={`num al-fig ${signCls(isSigma(r) ? r.sigma : r.pct, 1)}`}>{isNews(r) ? "" : isSigma(r) ? fmtSigma(r.sigma) : r.pct == null ? "" : fmtPct(r.pct, 1)}</td></tr>)}</tbody></table>
          ) : <div className="empty">No excessive moves recorded yet.</div>}
        </div>
      ))}
    </div>
  );
}
