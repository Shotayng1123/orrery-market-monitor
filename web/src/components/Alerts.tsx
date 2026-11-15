import { useEffect, useRef, useState } from "react";
import { useApi } from "../lib/useApi";
import type { Alert } from "../lib/types";
import { fmtStamp } from "../lib/time";
import { fmtPct, signCls } from "../lib/fmt";

const SEEN_KEY = "om_alert_seen";
const NEW_FOR_MS = 30 * 60e3;   // an alert nobody has opened stays lit for half an hour after it was raised
const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0; } catch { return 0; } };

/** Excessive-move alerts: the latest one as a single line next to the tabs, refreshed with every load;
 *  click for the last twenty. Thresholds: a single stock beyond ±7% intraday, an index beyond ±3%.
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
  return (
    <div id="alerts" ref={box}>
      <span className={`alrt${latest ? (lit ? " new" : fresh ? " fresh" : "") : " none"}`} onClick={toggle} title="Excessive moves: single stock beyond ±7% intraday, index beyond ±3%. Click for the last twenty">
        <span className="k">{lit ? "NEW ALERT" : "ALERT"}</span>
        {latest ? <><span className={signCls(latest.pct)}>{latest.msg}</span><span className="t">{fmtStamp(latest.at).replace(" SGT", "")}</span></> : <span className="mut">{a.error ? "unavailable" : "no excessive moves"}</span>}
      </span>
      {open && (
        <div className="aldrop">
          <div className="minih">Last {rows.length} alerts · stock ±7% intraday · index ±3%</div>
          {rows.length ? (
            <table className="secT"><tbody>{rows.map((r) => <tr key={r.id}><td className="l mut num">{fmtStamp(r.at)}</td><td className="l">{r.msg}</td><td className="l mut">{r.kind === "index" ? "index" : r.market}</td><td className={`num ${signCls(r.pct)}`}>{fmtPct(r.pct, 1)}</td></tr>)}</tbody></table>
          ) : <div className="empty">No excessive moves recorded yet.</div>}
        </div>
      )}
    </div>
  );
}
