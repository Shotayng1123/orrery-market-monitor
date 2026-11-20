import { Fragment, useMemo, useRef, useState } from "react";
import { Empty } from "./Panel";
import { Star } from "./Star";
import { Pick, type PickOption } from "./Pick";
import { hideCard, money, openAsset, showCard } from "./CompanyCard";
import { useApi } from "../lib/useApi";
import { useRowCap } from "../lib/useRowCap";
import { MKT_CAP } from "../lib/labels";
import { byResultsDay, calendarFlag, MARKS_NOTE, RESULTS_NOTE, resultsDay, resultsDayLabel, resultsStatusShort, resultsTip } from "../lib/results";

/** A row of the earnings route. `estimate` is Yahoo's flag; a page reads null (the source does not say) as a dash. */
export interface EarningsRow { symbol: string; name: string; sector: string | null; indices: string[]; mcapUsd: number | null; at: string; estimate: boolean | null }
/** The earnings route's answer. `estimateAsGiven` (since 20 Nov 2026): `estimate` is Yahoo's flag as Yahoo gives it, null
 *  where it gives none; a server from before sent false for a missing flag too (lib/results.ts calendarFlag). */
export interface EarningsAnswer { rows: EarningsRow[]; source: string; estimateAsGiven?: boolean }
/** The rows with the flag a page may show: a false from a server before 20 Nov 2026 is not a confirmation (F4). */
export const earningsRows = (a: EarningsAnswer | null | undefined): EarningsRow[] => (a?.rows ?? []).map((r) => ({ ...r, estimate: calendarFlag(r.estimate, a?.estimateAsGiven) }));
export const REGION = (r: EarningsRow): "US" | "Japan" | "Asia" => (r.indices.some((i) => i === "SP500" || i === "NDX") ? "US" : r.indices.some((i) => i === "NK225" || i === "TOPIX") ? "Japan" : "Asia");
export const REGIONS = ["All", "US", "Japan", "Asia"] as const;
export const SIZES: PickOption<"big" | "all">[] = [{ value: "big", label: "USD 10bn+" }, { value: "all", label: "All" }];
/** The calendar's rows under the day bars of their own markets' days (A-30): a US company's 17 Nov stays 17 Nov,
 *  although its moment is the 18th in Singapore. Each row keeps its `day`. */
export const calendarDays = (rows: readonly EarningsRow[]) => byResultsDay(rows, (r) => r.at, (r) => r.symbol, (r) => r.indices);
/** Whether a company's results day is behind us: a day before today in its own market (greyed, as past events are). */
export const resultsPast = (r: EarningsRow & { day: string }, now = Date.now()): boolean => r.day < (resultsDay(new Date(now).toISOString(), r.symbol, r.indices) ?? "");

/** The results calendar: index constituents reporting over the next three weeks, under a bar for each day, the day in
 *  the company's own market as the quote feed gives it, and no time of day (the source does not state the company's
 *  release time). "est." has not been confirmed by the company. */
export function EarningsCalendar({ tick }: { tick: number }) {
  const e = useApi<EarningsAnswer>("earnings", { days: 21 }, Math.floor(tick / 30));
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All");
  const [big, setBig] = useState(true);
  const rows = useMemo(() => calendarDays(earningsRows(e.data).filter((r) => (region === "All" || REGION(r) === region) && (!big || (r.mcapUsd ?? 0) >= 1e10))), [e.data, region, big]);
  const box = useRef<HTMLDivElement>(null);
  useRowCap(box, 10, "tr.ecrow", "tr.cls", [rows.length > 0]);   // phone: ten companies at a time, the rest by scrolling inside the panel
  return (
    <>
      <div className="chips ernchips">
        <Pick label="Region" value={region} options={REGIONS} onChange={setRegion} />
        <Pick label={MKT_CAP} value={big ? "big" : "all"} options={SIZES} onChange={(v) => setBig(v === "big")} />
        <span className="mut" style={{ marginLeft: 4 }} id="ern-note" title="Each company's day in its own market (Tokyo, New York …), as the source gives it. No time of day: the source gives a time with the date but does not say that it is the company's release time.">{rows.length} companies · {RESULTS_NOTE} · {MARKS_NOTE}</span>
      </div>
      {rows.length ? (
        <div className="calwrap" ref={box}><table className="mini calT ernT">
          <colgroup><col className="tm" /><col className="st" /><col /><col className="ix" /><col className="mc" /></colgroup>
          <thead><tr><th className="l" title="conf. = the date is confirmed, est. = estimated, as Yahoo marks it; a Tokyo company's date is est. until the Monitor reads JPX's own results calendar (決算発表予定日)">Date</th><th /><th className="l">Company</th><th className="l">Sector</th><th>{MKT_CAP}</th></tr></thead>
          <tbody>{rows.map((r, i, arr) => (
            <Fragment key={r.symbol}>
              {(i === 0 || r.day !== arr[i - 1].day) && <tr className="cls"><td colSpan={5}>{resultsDayLabel(r.day)}</td></tr>}
              <tr className={`ecrow${resultsPast(r) ? " past" : ""}`} title={resultsTip(r.symbol, r.estimate, r.indices)}>
                <td className="l mut">{resultsStatusShort(r.estimate, r.symbol, r.indices)}</td>
                <td className="l"><Star symbol={r.symbol} name={r.name} /></td>
                <td className="l ev" title={`${r.name} (${r.symbol}) · ${r.indices.join(", ")}`}><span className="lnk" onMouseEnter={(ev) => showCard(r.symbol, ev)} onMouseLeave={hideCard} onClick={() => openAsset(r.symbol)}>{r.name}</span> <span className="mut">{r.symbol}</span></td>
                <td className="l mut">{r.sector ?? ""}</td>
                <td className="num">{r.mcapUsd == null ? "–" : `$${money(r.mcapUsd)}`}</td>
              </tr>
            </Fragment>
          ))}</tbody>
        </table></div>
      ) : <Empty title={e.data ? "No companies match" : "Loading results dates"}>{e.error ?? (e.data ? "Widen the region or size filter." : "")}</Empty>}
    </>
  );
}
