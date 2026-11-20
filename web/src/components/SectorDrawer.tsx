import { useEffect, useMemo, useState } from "react";
import { fmtNum, fmtPct, signCls, stockDecimals } from "../lib/fmt";
import { MKT_CAP } from "../lib/labels";
import { hideCard, money, openAsset, showCard } from "./CompanyCard";

export interface DrawerRow { symbol: string; name: string; sector: string | null; industry?: string | null; close: number; pct1d: number | null; pct1w: number | null; pct1m: number | null; pct3m: number | null; pct12m: number | null; mcap?: number | null; turnover?: number | null; adv_turnover?: number | null; mf_net?: number | null; shortRatio?: number | null; dma200?: number | null }
type Key = "name" | "industry" | "close" | "pct1d" | "pct1w" | "pct1m" | "pct3m" | "pct12m" | "mcap" | "turnover" | "flow" | "mf_net" | "shortRatio";
const UP_RGB = "63,208,126", DN_RGB = "255,77,66";
/** A signed amount: "+1.2bn", "−340m"; no sign on one that rounds to zero. */
const signedMoney = (v: number | null | undefined): string => { if (v == null) return "–"; const m = money(Math.abs(v)); return `${/[1-9]/.test(m) ? (v > 0 ? "+" : "−") : ""}${m}`; };
const shade = (v: number | null | undefined, full = 6) => (v == null || v === 0 ? undefined : `rgba(${v > 0 ? UP_RGB : DN_RGB},${(Math.min(1, Math.abs(v) / full) * 0.55).toFixed(3)})`);

/** Overlay listing one sector's companies with the overview columns; hover a name for the card, click to open it.
 *  The short column says which short figure it is: reported positions in Tokyo, FINRA's short-volume share in the
 *  US (the designer's D-46: "SHORT" meant two things). */
export function SectorDrawer({ title, sector, rows, ccy, jp, onClose }: { title: string; sector: string; rows: DrawerRow[]; ccy: string; jp: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "mcap", dir: -1 });
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  const val = (r: DrawerRow, k: Key): number | string | null => k === "flow" ? (r.turnover != null && r.adv_turnover ? r.turnover / r.adv_turnover : null) : k === "shortRatio" ? (r.shortRatio ?? null) : k === "industry" ? (r.industry ?? null) : (r[k] as number | string | null);
  const list = useMemo(() => [...rows].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir; }), [rows, sort]);
  const th = (k: Key, label: string, left = false) => <th className={`sortable${left ? " l" : ""}`} onClick={() => setSort((p) => ({ k, dir: p.k === k ? (p.dir === 1 ? -1 : 1) : -1 }))}>{label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>;
  const cell = (v: number | null, full = 6) => <td className={`num ${signCls(v, 1)}`} style={{ background: shade(v, full) }}>{fmtPct(v, 1)}</td>;
  const hasM = rows.some((r) => r.mcap != null), hasT = rows.some((r) => r.turnover != null), hasF = rows.some((r) => r.mf_net != null), hasS = rows.some((r) => r.shortRatio != null);
  const totM = rows.reduce((a, r) => a + (r.mcap ?? 0), 0), totT = rows.reduce((a, r) => a + (r.turnover ?? 0), 0), totF = rows.reduce((a, r) => a + (r.mf_net ?? 0), 0);
  return (
    <div className="drawer-bg" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="phead"><span className="pno">{title}</span><span className="ptitle">{sector}</span><span className="paux">{rows.length} names{hasM ? ` · ${MKT_CAP.toLowerCase()} ${money(totM, ccy)}` : ""}{hasT ? ` · turnover ${money(totT, ccy)}` : ""}{hasF ? ` · net flow ${signedMoney(totF)}` : ""}</span><span className="chip-sm" onClick={onClose}>CLOSE  ESC</span></div>
        <div className="drawer-body">
          <table className="secT">
            <thead><tr>{th("name", "Name", true)}{th("industry", "Industry", true)}{th("close", "Last")}{th("pct1d", "1D")}{th("pct1w", "1W")}{th("pct1m", "1M")}{th("pct3m", "3M")}{th("pct12m", "12M")}{hasM && th("mcap", MKT_CAP)}{hasT && th("turnover", "Turnover")}{hasT && th("flow", "Day / avg")}{hasF && th("mf_net", "Net flow")}{hasS && th("shortRatio", jp ? "Short pos %" : "Short vol %")}</tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.symbol}>
                  <td className="l"><span className="lnk" title={r.symbol} onMouseEnter={(e) => showCard(r.symbol, e)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.name}</span></td>
                  <td className="l mut nm">{r.industry ?? ""}</td>
                  <td className="num">{fmtNum(r.close, stockDecimals(r.close))}</td>
                  {cell(r.pct1d, 4)}{cell(r.pct1w, 8)}{cell(r.pct1m, 12)}{cell(r.pct3m, 20)}{cell(r.pct12m, 50)}
                  {hasM && <td className="num mut">{money(r.mcap)}</td>}
                  {hasT && <td className="num mut">{money(r.turnover)}</td>}
                  {hasT && <td className="num">{r.turnover != null && r.adv_turnover ? `${(r.turnover / r.adv_turnover).toFixed(2)}×` : "–"}</td>}
                  {hasF && <td className={`num ${signCls(r.mf_net, 0)}`}>{signedMoney(r.mf_net)}</td>}
                  {hasS && <td className="num mut">{r.shortRatio == null ? "–" : `${(r.shortRatio * 100).toFixed(r.shortRatio < 0.2 ? 2 : 0)}%`}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
