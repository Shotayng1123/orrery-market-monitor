import { useEffect, useRef, useState } from "react";
import { useApi } from "../lib/useApi";
import type { Alert } from "../lib/types";
import { fmtStamp } from "../lib/time";
import { fmtPct, signCls } from "../lib/fmt";

/** Excessive-move alerts: the latest one as a single line next to the tabs, refreshed with every load;
 *  click for the last twenty. Thresholds: a single stock beyond ±7% intraday, an index beyond ±3%. */
export function Alerts({ tick }: { tick: number }) {
  const a = useApi<{ rows: Alert[] }>("alerts", { n: 20 }, tick);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const rows = a.data?.rows ?? [];
  const latest = rows[0];
  const fresh = latest ? Date.now() - Date.parse(latest.at) < 15 * 60e3 : false;
  return (
    <div id="alerts" ref={box}>
      <span className={`alrt${latest ? (fresh ? " fresh" : "") : " none"}`} onClick={() => setOpen(!open)} title="Excessive moves: single stock beyond ±7% intraday, index beyond ±3%. Click for the last twenty">
        <span className="k">ALERT</span>
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
