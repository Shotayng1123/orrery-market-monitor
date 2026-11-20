import { useMemo, useState } from "react";
import { Empty } from "../components/Panel";
import { CHART_PERIODS, type ChartPeriod } from "../components/ChartPanel";
import type { SigmaWindow } from "../components/SigmaChart";
import { Pick, type PickOption } from "../components/Pick";
import { Star } from "../components/Star";
import { Bars } from "../components/Bars";
import { money, openAsset } from "../components/CompanyCard";
import { JumpPick, Move, Screen, Section, Stat } from "../components/PhoneKit";
import { useApi } from "../lib/useApi";
import type { TableRow } from "../lib/types";
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { mergeClasses } from "../lib/classes";
import { fmtStamp } from "../lib/time";
import { InstrumentRow } from "./MarketPhone";
import { CCY, HeatMap, INDICES, JpShortPanel, PAST_MEMBERS, PERIODS, pos52, shortName, signed, vs, type BreadthRow, type IndexStats, type SectorRow, type StatRow } from "./Equities";
import { RANGE_52W } from "./Market";

/** EQUITIES for a phone (preview, lib/phone.ts; Shota, 17 Nov 2026). The same index statistics as the desktop tab,
 *  laid out as cards down one column: the index with its chart, the related markets beside it, breadth, the day's
 *  flow and the performance by sector, short interest, the movers, the heat map and a screener of the names. */
const WINDOWS: PickOption<SigmaWindow>[] = [{ value: "m1", label: "1M" }, { value: "m12", label: "12M" }, { value: "m36", label: "36M" }];
// sectors carry no figure beyond 12M: 12M stands in, and the pill says 12M (the tab offers no 5Y or 10Y: a stock's page only)
const SECTOR_KEY: Record<ChartPeriod, keyof SectorRow> = { "1D": "pct1d", "1W": "pct1w", "1M": "pct1m", "3M": "pct3m", "12M": "pct12m", "36M": "pct12m", "5Y": "pct12m", "10Y": "pct12m" };
const pc = (num: number, den: number) => (den ? `${Math.round((num / den) * 100)}%` : "–");
const PAGE = 30;

function Breadth({ s, hist }: { s: IndexStats; hist: BreadthRow[] }) {
  const b = s.breadth!;
  const rows = PERIODS.map(([label, key, days]) => {
    const vals = s.rows.map((r) => r[key] ?? null).filter((v): v is number => v != null).sort((a, c) => a - c);
    const target = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
    return { label, n: vals.length, up: vals.filter((v) => v > 0).length, down: vals.filter((v) => v < 0).length, median: vals.length ? vals[Math.floor(vals.length / 2)] : null,
      mean: vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null, then: label === "1D" ? hist[hist.length - 1] ?? null : [...hist].reverse().find((h) => h.d <= target) ?? null };
  });
  return (
    <>
      <div className="mp-grid in">
        <Stat k="Advancers today">{b.adv}<small> / {b.dec} down</small></Stat>
        <Stat k="Above 50-day">{pc(b.above50, b.n)}</Stat>
        <Stat k="Above 200-day">{pc(b.above200, b.n)}</Stat>
        <Stat k="52w highs / lows">{b.newHi} / {b.newLo}</Stat>
        <Stat k="Up ≥ 2%">{b.over2}</Stat>
        <Stat k="Down ≥ 2%">{b.under2}</Stat>
      </div>
      <div className="mp-sub">Moves of the names over each window</div>
      <table className="mp-t">
        <thead><tr><th>Window</th><th>Up</th><th>Down</th><th>Median</th><th>Average</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.label}><td>{c.label}</td><td className="up">{pc(c.up, c.n)}</td><td className="dn">{pc(c.down, c.n)}</td><td className={signCls(c.median)}>{fmtPct(c.median, 1)}</td><td className={signCls(c.mean)}>{fmtPct(c.mean, 1)}</td></tr>)}</tbody>
      </table>
      <div className="mp-sub">Where breadth stood at the start of each window</div>
      <table className="mp-t">
        <thead><tr><th>Window</th><th>Above 50d</th><th>Above 200d</th><th>Highs / lows</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.label} title={c.then ? `session ${c.then.d}` : undefined}><td>{c.label}</td><td>{c.then ? pc(c.then.above50, c.then.n) : "–"}</td><td>{c.then ? pc(c.then.above200, c.then.n) : "–"}</td><td>{c.then ? `${c.then.new_hi} / ${c.then.new_lo}` : "–"}</td></tr>)}</tbody>
      </table>
      <p className="mp-note in" id="br-members">{PAST_MEMBERS(b.n, false)}</p>
    </>
  );
}

function Flow({ s }: { s: IndexStats }) {
  const xs = s.sectors.filter((x) => x.turnover != null && x.turnover > 0);
  if (!xs.length) return <Empty title="Turnover not loaded yet">The flow job refreshes volume and market cap every ten minutes during the session.</Empty>;
  const total = xs.reduce((a, x) => a + (x.turnover ?? 0), 0);
  const avgOf = (x: SectorRow) => (x.flow && x.turnover ? x.turnover / x.flow : null);
  const totalAvg = xs.reduce((a, x) => a + (avgOf(x) ?? 0), 0);
  const rows = xs.map((x) => { const avg = avgOf(x), share = (x.turnover! / total) * 100; return { ...x, share, avgShare: avg != null && totalAvg ? (avg / totalAvg) * 100 : null }; }).sort((a, b) => b.turnover! - a.turnover!);
  const maxShare = Math.max(...rows.map((r) => r.share));
  const hasMf = rows.some((r) => r.mfNet != null), totMf = rows.reduce((a, r) => a + (r.mfNet ?? 0), 0);
  return (
    <>
      {rows.map((r) => (
        <div className="fl-row" key={r.sector}>
          <span className="a"><span className="n">{r.sector}</span><span className="s">{money(r.turnover)} · {r.share.toFixed(1)}% of turnover{r.avgShare != null ? ` (avg ${r.avgShare.toFixed(1)}%)` : ""}{r.flow != null ? ` · ${r.flow.toFixed(2)}× avg` : ""}</span><span className="bar"><i style={{ width: `${(r.share / maxShare) * 100}%` }} /></span></span>
          <span className="b">{hasMf && <span className={`v ${signCls(r.mfNet)}`} title="Net money flow: the day's turnover signed by the move from the previous close and scaled by the day's range"><small>net flow</small> {signed(r.mfNet)}</span>}<span className={`p ${signCls(r.pct1d)}`}><small>1D</small> {fmtPct(r.pct1d, 1)}</span></span>
        </div>
      ))}
      <div className="fl-row tot"><span className="a"><span className="n">Index</span><span className="s">{money(total)}{totalAvg ? ` · ${(total / totalAvg).toFixed(2)}× the three-month average` : ""}</span></span><span className="b">{hasMf && <span className={`v ${signCls(totMf)}`}><small>net flow</small> {signed(totMf)}</span>}</span></div>
    </>
  );
}

function NameRow({ r, value, tag, w, star = false }: { r: StatRow; value: number | null; tag: string; w: string; star?: boolean }) {
  return (
    <div className={`mp-row tap${star ? " starred" : ""}`} role="button" tabIndex={0} title={`${r.name} (${r.symbol})`} onClick={() => openAsset(r.symbol)}>
      {star && <Star symbol={r.symbol} name={r.name} />}
      <span className="mp-nm"><span className="n">{shortName(r.name)}</span><span className="mp-st one">{r.symbol} · {r.sector ?? "–"}</span></span>
      <span className="mp-px">{fmtNum(r.close, r.close >= 1000 ? 0 : 2)}</span>
      <Move v={value} w={w}>{tag}</Move>
    </div>
  );
}

type SortKey = "pct1d" | "pct1w" | "pct1m" | "pct3m" | "pct12m" | "vs200" | "pos52" | "mcap" | "turnover" | "mf_net";
const SORTS: PickOption<SortKey>[] = [{ value: "pct1d", label: "1D %" }, { value: "pct1w", label: "1W %" }, { value: "pct1m", label: "1M %" }, { value: "pct3m", label: "3M %" }, { value: "pct12m", label: "12M %" }, { value: "vs200", label: "vs 200-day" }, { value: "pos52", label: RANGE_52W }, { value: "mcap", label: "Market cap" }, { value: "turnover", label: "Turnover" }, { value: "mf_net", label: "Net flow" }];
/** What the figure on a screener line is: its window for a change, else the measure the list is sorted by. */
const SORT_W: Record<SortKey, string> = { pct1d: "1D", pct1w: "1W", pct1m: "1M", pct3m: "3M", pct12m: "12M", vs200: "VS 200D", pos52: "52W RANGE", mcap: "MKT CAP", turnover: "TURNOVER", mf_net: "NET FLOW" };
function Screener({ s }: { s: IndexStats }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [above200, setAbove200] = useState(false);
  const [nearHi, setNearHi] = useState(false);
  const [nearLo, setNearLo] = useState(false);
  const [sort, setSort] = useState<SortKey>("pct1d");
  const [desc, setDesc] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const sectors = useMemo(() => ["All", ...[...new Set(s.rows.map((r) => r.sector ?? "Other"))].sort()], [s.rows]);
  const val = (r: StatRow): number | null => (sort === "vs200" ? vs(r.close, r.dma200) : sort === "pos52" ? pos52(r) : (r[sort] ?? null));
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return s.rows.filter((r) => (sector === "All" || (r.sector ?? "Other") === sector) && (!qq || r.symbol.toLowerCase().includes(qq) || r.name.toLowerCase().includes(qq)) && (!above200 || (r.dma200 != null && r.close > r.dma200)) && (!nearHi || (r.hi52 != null && r.close >= r.hi52 * 0.97)) && (!nearLo || (r.lo52 != null && r.close <= r.lo52 * 1.03)))
      .sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x - y) * (desc ? -1 : 1); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.rows, q, sector, above200, nearHi, nearLo, sort, desc]);
  const tag = (r: StatRow) => { const v = val(r); return v == null ? "–" : sort === "mcap" || sort === "turnover" ? money(v) : sort === "mf_net" ? signed(v) : sort === "pos52" ? `${Math.round(v)}%` : fmtPct(v, 1); };
  const tone = (r: StatRow) => (sort === "mcap" || sort === "turnover" || sort === "pos52" ? null : val(r));
  const tog = (on: boolean, set: (b: boolean) => void, label: string) => <button type="button" className={`mp-tog${on ? " on" : ""}`} aria-pressed={on} onClick={() => { set(!on); setShown(PAGE); }}>{label}</button>;
  return (
    <>
      <input className="mp-find" type="text" placeholder="Symbol or name" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
      <div className="mp-picks">
        <Pick label="Sector" value={sector} options={sectors} onChange={(v) => { setSector(v); setShown(PAGE); }} />
        <Pick label="Sort by" value={sort} options={SORTS} onChange={setSort} />
        <Pick label="Order" value={desc ? "d" : "a"} options={[{ value: "d", label: "High to low" }, { value: "a", label: "Low to high" }]} onChange={(v) => setDesc(v === "d")} />
      </div>
      <div className="mp-picks">{tog(above200, setAbove200, "Above 200-day")}{tog(nearHi, setNearHi, "Near 52w high")}{tog(nearLo, setNearLo, "Near 52w low")}</div>
      <p className="mp-note first">{rows.length} of {s.rows.length} names</p>
      <div className="mp-card">
        {rows.length ? rows.slice(0, shown).map((r) => <NameRow key={r.symbol} r={r} value={tone(r)} tag={tag(r)} w={SORT_W[sort]} star />) : <Empty title="No names match">Loosen the filters.</Empty>}
      </div>
      {rows.length > shown && <button type="button" className="mp-more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more of {rows.length}</button>}
    </>
  );
}

export function EquitiesPhone({ sub, onSub, tick }: { sub: string; onSub: (s: string) => void; tick: number }) {
  const ix = INDICES.find((i) => i.id === sub) ?? INDICES[1];
  const [period, setPeriod] = useState<ChartPeriod>("12M");
  const [sigmaWindow, setSigmaWindow] = useState<SigmaWindow>("m12");
  const [open, setOpen] = useState<string | null>(null);
  const table = useApi<{ rows: TableRow[]; asOf: string }>("table", undefined, tick);
  const st = useApi<IndexStats>("index_stats", { idx: ix.stats }, Math.floor(tick / 5));
  const bh = useApi<{ rows: BreadthRow[] }>("breadth_history", { idx: ix.stats, days: 1100 }, Math.floor(tick / 30));
  const rows = table.data?.rows ?? [];
  const main = rows.find((r) => r.symbol === ix.symbol);
  const support = ix.support.map((x) => rows.find((r) => r.symbol === x)).filter((r): r is TableRow => !!r).slice(0, 4);
  const s = st.data && st.data.rows.length ? st.data : null;
  const ccy = CCY[ix.stats] ?? "";
  const jp = ix.stats === "NK225" || ix.stats === "TOPIX", us = ix.stats === "SP500" || ix.stats === "NDX";
  const merged = useMemo(() => (s ? mergeClasses(s.rows) : []), [s]);
  const movers = useMemo(() => { const xs = merged.filter((r) => r.pct1d != null).sort((a, b) => b.pct1d! - a.pct1d!); return { top: xs.slice(0, 10), bottom: xs.slice(-10).reverse() }; }, [merged]);
  const noStats = <div className="mp-card"><Empty title="Statistics not computed yet">{st.error ?? "The daily statistics job runs after each close."}</Empty></div>;
  const sk = SECTOR_KEY[period], sLabel = sk === "pct12m" ? "12M" : period;
  // while the market is open the 1D figures are today's moves so far (Shota, 19 Nov 2026: the S&P 500 was open and
  // the movers were still the day before's)
  const of = s ? (s.live ? <><span className="badge live" id="eq-live" title={`Today's moves so far. Longer periods are measured to the close of ${s.asOf ?? "–"}.`}>INTRADAY</span>{s.idx} names · 1D at {fmtStamp(s.live.asOf)}</> : `${s.idx} names · closes of ${s.asOf ?? "–"}`) : "";
  return (
    <Screen title="Equities" subBelow sub={<>{of || "loading…"}{ix.statsNote && <span className="badge proxy" title={ix.statsNote}>STAND-IN</span>}</>}
      right={<Pick label="Index" value={ix.id} options={INDICES.map((i) => ({ value: i.id, label: i.label }))} onChange={(v) => { setOpen(null); onSub(v); }} />}>
      <div className="mp-picks top">
        <Pick label="Period" value={period} options={CHART_PERIODS} onChange={setPeriod} />
        <Pick label="σ window" value={sigmaWindow} options={WINDOWS} onChange={setSigmaWindow} title="Rolling window for the mean and σ bands on the daily charts, in trading days: 1M = 21, 12M = 252, 36M = 756" />
        <JumpPick dep={`${ix.id}|${!!s}`} />
      </div>
      <Section title={ix.label} aux={ix.symbol}>
        {main ? <InstrumentRow r={main} period={period} tick={tick} open fixed sigmaWindow={sigmaWindow} /> : <Empty title="Awaiting the data feed">{table.error ?? "The index chart loads with the market table."}</Empty>}
      </Section>
      <Section title="Drivers" aux={`${support.length} of 4`}>
        {support.length ? support.map((r) => <InstrumentRow key={r.symbol} r={r} period={period} tick={tick} sigmaWindow={sigmaWindow} open={open === r.symbol} onToggle={() => setOpen(open === r.symbol ? null : r.symbol)} />) : <Empty title="Drivers">Four related markets shown beside the index (an index future, other indices, a currency, a yield, the VIX or copper) load with the market table.</Empty>}
      </Section>
      <Section title="Market breadth" card={false}>{s ? <div className="mp-card pad">{s.breadth ? <Breadth s={s} hist={bh.data?.rows ?? []} /> : <Empty title="No breadth yet" />}</div> : noStats}</Section>
      <Section title="Flow by sector · 1D" aux={s ? ccy : ""} card={false}>{s ? <div className="mp-card"><Flow s={s} /></div> : noStats}</Section>
      <Section title={`Sector performance · ${sLabel}`} aux="cap-weighted" card={false}>
        {s ? <div className="mp-card">{[...s.sectors].sort((a, b) => ((b[sk] as number | null) ?? -Infinity) - ((a[sk] as number | null) ?? -Infinity)).map((x) => (
          <div className="mp-row plain" key={x.sector}>
            <span className="mp-nm"><span className="n">{x.sector}</span><span className="mp-st one">{x.n} names · {x.n ? `${Math.round((x.above200 / x.n) * 100)}%` : "–"} above their 200-day</span></span>
            <span />
            <Move v={x[sk] as number | null} w={sLabel}>{fmtPct(x[sk] as number | null, 1)}</Move>
          </div>
        ))}</div> : noStats}
      </Section>
      <Section title="Short interest" aux={jp ? "JPX" : s?.shorts ? `FINRA · ${s.shorts.d}` : ""} card={false}>
        <div className="mp-card pad mp-legacy">
          {jp ? <JpShortPanel idx={ix.stats} /> : s?.shorts ? (
            <>
              <div className="mp-grid in two"><Stat k="Average short-volume share">{(s.shorts.avgRatio * 100).toFixed(1)}%</Stat><Stat k="Names">{s.rows.filter((r) => r.shortRatio != null).length}</Stat></div>
              <div className="mp-sub">Average short-volume share, daily · 12 months</div>
              <Bars data={(s.shorts.history ?? []).map((h) => ({ d: h.d, v: h.v == null ? null : h.v * 100 }))} fmt={(v) => `${v.toFixed(1)}%`} height={120} />
              <div className="mp-sub">Highest short-volume share</div>
              <table className="mp-t left"><thead><tr><th>Name</th><th>Short vol %</th></tr></thead><tbody>{s.shorts.top.slice(0, 10).map((x) => <tr key={x.symbol} onClick={() => openAsset(x.symbol)}><td>{x.name}</td><td>{(x.ratio * 100).toFixed(0)}%</td></tr>)}</tbody></table>
            </>
          ) : <Empty title={us ? "No short-volume data" : "No short data for this market"}>{us ? "The FINRA job runs after the US close." : "Public per-name short data is not available for this exchange."}</Empty>}
        </div>
      </Section>
      <Section title="Movers · 1D" card={false}>
        {s ? <>
          <div className="mp-card"><div className="mp-cap">Top 10</div>{movers.top.map((r) => <NameRow key={r.symbol} r={r} value={r.pct1d} tag={fmtPct(r.pct1d, 1)} w="1D" />)}</div>
          <div className="mp-card gap"><div className="mp-cap">Bottom 10</div>{movers.bottom.map((r) => <NameRow key={r.symbol} r={r} value={r.pct1d} tag={fmtPct(r.pct1d, 1)} w="1D" />)}</div>
        </> : noStats}
      </Section>
      <Section title="Heat map" aux="colour = 1D %" card={false}>{s ? <div className="mp-card hmap"><HeatMap s={s} rows={merged} height={470} /></div> : noStats}</Section>
      <Section title="Screener" card={false}>{s ? <Screener s={s} /> : noStats}</Section>
    </Screen>
  );
}
