import { Fragment, useMemo, useRef, useState } from "react";
import { Empty } from "./Panel";
import { Star } from "./Star";
import { Pick, type PickOption } from "./Pick";
import { hideCard, money, openAsset, showCard } from "./CompanyCard";
import { useApi } from "../lib/useApi";
import { fmtClock, SGT } from "../lib/time";
import { useRowCap } from "../lib/useRowCap";

export interface EarningsRow { symbol: string; name: string; sector: string | null; indices: string[]; mcapUsd: number | null; at: string; estimate: boolean }
export const REGION = (r: EarningsRow): "US" | "Japan" | "Asia" => (r.indices.some((i) => i === "SP500" || i === "NDX") ? "US" : r.indices.some((i) => i === "NK225" || i === "TOPIX") ? "Japan" : "Asia");
export const REGIONS = ["All", "US", "Japan", "Asia"] as const;
export const SIZES: PickOption<"big" | "all">[] = [{ value: "big", label: "USD 10bn+" }, { value: "all", label: "All" }];
const dayOf = (t: string) => new Date(t).toLocaleDateString("en-CA", { timeZone: SGT });
const dayLabel = (t: string) => new Date(t).toLocaleDateString("en-GB", { timeZone: SGT, weekday: "long", day: "numeric", month: "short" });

/** Earnings calendar: index constituents reporting over the next three weeks, by day (Singapore time).
 *  Dates come from the quote feed; one marked "est." has not been confirmed by the company. */
export function EarningsCalendar({ tick }: { tick: number }) {
  const e = useApi<{ rows: EarningsRow[]; source: string }>("earnings", { days: 21 }, Math.floor(tick / 30));
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All");
  const [big, setBig] = useState(true);
  const rows = useMemo(() => (e.data?.rows ?? []).filter((r) => (region === "All" || REGION(r) === region) && (!big || (r.mcapUsd ?? 0) >= 1e10)), [e.data, region, big]);
  const box = useRef<HTMLDivElement>(null);
  useRowCap(box, 10, "tr.ecrow", "tr.cls", [rows.length > 0]);   // phone: ten companies at a time, the rest by scrolling inside the panel
  return (
    <>
      <div className="chips ernchips">
        <Pick label="Region" value={region} options={REGIONS} onChange={setRegion} />
        <Pick label="Market cap" value={big ? "big" : "all"} options={SIZES} onChange={(v) => setBig(v === "big")} />
        <span className="mut" style={{ marginLeft: 4 }}>{rows.length} companies · times in SGT · est. = date not confirmed</span>
      </div>
      {rows.length ? (
        <div className="calwrap" ref={box}><table className="mini calT ernT">
          <colgroup><col className="tm" /><col className="st" /><col /><col className="ix" /><col className="mc" /></colgroup>
          <thead><tr><th className="l">SGT</th><th /><th className="l">Company</th><th className="l">Sector</th><th>Mkt cap</th></tr></thead>
          <tbody>{rows.map((r, i, arr) => (
            <Fragment key={r.symbol}>
              {(i === 0 || dayOf(r.at) !== dayOf(arr[i - 1].at)) && <tr className="cls"><td colSpan={5}>{dayLabel(r.at)}</td></tr>}
              <tr className={`ecrow${Date.parse(r.at) < Date.now() ? " past" : ""}`}>
                <td className="l num">{fmtClock(new Date(r.at), SGT)}{r.estimate && <span className="mut"> est.</span>}</td>
                <td className="l"><Star symbol={r.symbol} name={r.name} /></td>
                <td className="l ev" title={`${r.name} (${r.symbol}) · ${r.indices.join(", ")}`}><span className="lnk" onMouseEnter={(ev) => showCard(r.symbol, ev)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.name}</span> <span className="mut">{r.symbol}</span></td>
                <td className="l mut">{r.sector ?? ""}</td>
                <td className="num">{r.mcapUsd == null ? "–" : `$${money(r.mcapUsd)}`}</td>
              </tr>
            </Fragment>
          ))}</tbody>
        </table></div>
      ) : <Empty title={e.data ? "No companies match" : "Loading earnings dates"}>{e.error ?? (e.data ? "Widen the region or size filter." : "")}</Empty>}
    </>
  );
}
