// The tables that belong to a note: the overnight and previous-session tables of a daily note (its data pack)
// and the weekly tables of a wrap-up. Shown above the note's text on the RESEARCH tab.
import { fmtNum, fmtPct, signCls } from "../lib/fmt";
import { shortName } from "../lib/short";

interface Move { symbol: string; name: string; last: number; prev: number; pct: number; sector?: string }
interface SectorMove { sector: string; pct: number; n: number; weighted: boolean }
interface Breadth { n: number; up: number; down: number; over2: number; under2: number; over5: number; under5: number }
export interface WeeklyPack {
  kind: "weekly"; weekStart: string; weekEnd: string;
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; w1Pct: number | null; w1Chg: number | null; unit: "pct" | "bp" }>;
  us: { sectors: SectorMove[]; top: Move[]; bottom: Move[]; breadth: { n: number; up: number; down: number } | null };
  jp: { sectors: SectorMove[]; top: Move[]; bottom: Move[]; breadth: { n: number; up: number; down: number } | null };
  actuals: Array<{ atSgt: string; country: string; title: string; actual: string | null; forecast: string | null; previous: string | null; better: boolean | null }>;
  weekAhead: Array<{ atSgt: string; country: string; title: string; forecast: string | null; previous: string | null }>;
}
export interface Pack {
  kind?: "daily";
  us: { indices: Move[]; sectorsEtf: Move[]; sectorsConstituents: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: Breadth | null; source: string };
  jp: { indices: Move[]; sectors: SectorMove[]; top: Move[]; bottom: Move[]; big: Move[]; breadth: Breadth | null; impliedOpenPct: number | null; impliedNote: string; source: string };
  table: Array<{ symbol: string; name: string; cls: string; last: number | null; d1Pct: number | null; d1Chg: number | null; unit: "pct" | "bp" }>;
  /** A market whose prices stopped arriving before its close: the figures below are then not closing levels
   *  (jobs/lib/pack.ts; absent from notes written before 19 Nov 2026). */
  warnings?: string[];
}

function MovesTable({ rows, title }: { rows: Move[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT"><tbody>{rows.map((m) => <tr key={m.symbol}><td className="l">{m.name}</td><td className="num">{fmtNum(m.last, m.last >= 100 ? 1 : 2)}</td><td className={`num ${signCls(m.pct)}`}>{fmtPct(m.pct)}</td></tr>)}</tbody></table>
    </>
  );
}
function SectorsTable({ rows, title }: { rows: SectorMove[]; title: string }) {
  return (
    <>
      <div className="minih">{title}</div>
      <table className="secT"><tbody>{rows.map((s) => <tr key={s.sector}><td className="l">{s.sector}{s.n > 0 && <span className="mut"> {s.n}</span>}</td><td className={`num ${signCls(s.pct)}`}>{fmtPct(s.pct)}</td></tr>)}</tbody></table>
    </>
  );
}
const breadthLine = (b: Breadth | null) => (b ? `${b.up} up / ${b.down} down of ${b.n} · ≥+2% ${b.over2} · ≤−2% ${b.under2} · ≥+5% ${b.over5} · ≤−5% ${b.under5}` : "");

/** The weekly tables that belong to the Sunday wrap-up. */
export function WeeklyTables({ pack }: { pack: WeeklyPack }) {
  const eq = pack.table.filter((r) => ["Equities", "Volatility", "Futures"].includes(r.cls) && r.w1Pct != null);
  const rates = pack.table.filter((r) => r.unit === "bp" && r.w1Chg != null), fx = pack.table.filter((r) => ["Currency", "Crypto", "Commodities"].includes(r.cls) && r.w1Pct != null);
  const wk = (r: WeeklyPack["table"][number]) => r.unit === "bp" ? (r.w1Chg == null ? "–" : `${r.w1Chg > 0 ? "+" : ""}${(r.w1Chg * 100).toFixed(0)}bp`) : fmtPct(r.w1Pct);
  const sign = (r: WeeklyPack["table"][number]) => signCls(r.unit === "bp" ? r.w1Chg : r.w1Pct);
  return (
    <>
      <div className="minih">Week {pack.weekStart} to {pack.weekEnd} · equity indices</div>
      <table className="secT"><tbody>{eq.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, r.last != null && r.last >= 1000 ? 0 : 2)}</td><td className={`num ${sign(r)}`}>{wk(r)}</td></tr>)}</tbody></table>
      <div className="msg2" style={{ marginTop: 8 }}>
        <div><SectorsTable rows={pack.us.sectors} title="S&P 500 sectors · week" /></div>
        <div><SectorsTable rows={pack.jp.sectors} title="Nikkei 225 sectors · week (weight-averaged)" /></div>
      </div>
      <div className="msg2" style={{ marginTop: 8 }}>
        <div><MovesTable rows={[...pack.us.top.slice(0, 5), ...pack.us.bottom.slice(0, 5)]} title="S&P 500 top 5 / bottom 5 · week" /></div>
        <div><MovesTable rows={[...pack.jp.top.slice(0, 5), ...pack.jp.bottom.slice(0, 5)]} title="Nikkei 225 top 5 / bottom 5 · week" /></div>
      </div>
      <div className="msg2" style={{ marginTop: 8 }}>
        <div><div className="minih">Yields · week</div><table className="secT"><tbody>{rates.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, 3)}</td><td className={`num ${sign(r)}`}>{wk(r)}</td></tr>)}</tbody></table></div>
        <div><div className="minih">Currencies, commodities, crypto · week</div><table className="secT"><tbody>{fx.map((r) => <tr key={r.symbol}><td className="l">{r.name}</td><td className="num">{fmtNum(r.last, r.last != null && r.last >= 1000 ? 0 : 2)}</td><td className={`num ${sign(r)}`}>{wk(r)}</td></tr>)}</tbody></table></div>
      </div>
      {pack.actuals.length > 0 && (
        <>
          <div className="minih" style={{ marginTop: 8 }}>High-impact releases of the week · actual vs consensus</div>
          <table className="secT"><tbody>{pack.actuals.map((e, i) => <tr key={i}><td className="l mut">{e.atSgt}</td><td className="l">{e.country}</td><td className="l">{e.title}</td><td className={`num ${e.better === true ? "up" : e.better === false ? "dn" : ""}`}><b>{e.actual ?? "–"}</b></td><td className="num mut">{e.forecast ?? "–"}</td><td className="num mut">{e.previous ?? "–"}</td></tr>)}</tbody></table>
        </>
      )}
    </>
  );
}

// The major names of the daily note's first table (Shota, 16 Nov 2026): the full list lives on the MARKET tab.
const MAJOR: Array<[string, string[]]> = [
  ["Equities", ["^GSPC", "^IXIC", "^SOX", "^N225"]],
  ["Volatility", ["^VIX"]],
  ["Currency", ["USDJPY=X", "EURUSD=X", "GBPUSD=X"]],
  ["Rates · US and Japan", ["UST2Y", "^TNX", "^TYX", "JGB2Y", "JGB10Y", "JGB30Y"]],
  ["Commodities", ["GC=F", "CL=F"]],
];

/** The tables that belong to one day's note (its data pack): the major markets first, then the US and the Japan
 *  blocks (sectors and the largest movers), each under a section bar. */
export function Overnight({ pack }: { pack: Pack }) {
  const by = new Map(pack.table.map((r) => [r.symbol, r]));
  const chg = (r: Pack["table"][number]) => r.unit === "bp" ? (r.d1Chg == null ? "–" : `${r.d1Chg > 0 ? "+" : ""}${(r.d1Chg * 100).toFixed(0)}bp`) : fmtPct(r.d1Pct);
  return (
    <>
      {(pack.warnings ?? []).map((w) => <div key={w} className="nwarn" role="note">{w}</div>)}
      <div className="nsec">Markets · 1D</div>
      <table className="secT nmaj"><tbody>
        {MAJOR.map(([cls, syms]) => {
          const rs = syms.map((x) => by.get(x)).filter((r): r is Pack["table"][number] => !!r && r.last != null);
          if (!rs.length) return null;
          return [
            <tr key={cls} className="ncls"><td colSpan={3}>{cls}</td></tr>,
            ...rs.map((r) => <tr key={r.symbol}><td className="l" title={r.name}>{shortName(r.symbol, r.name)}</td><td className="num">{fmtNum(r.last, r.unit === "bp" ? 3 : r.cls === "Currency" && r.last != null && r.last < 10 ? 4 : r.last != null && r.last >= 1000 ? 1 : 2)}</td><td className={`num ${signCls(r.unit === "bp" ? r.d1Chg : r.d1Pct)}`}>{chg(r)}</td></tr>),
          ];
        })}
      </tbody></table>

      <div className="nsec">US overnight · sectors and movers</div>
      {pack.us.breadth && <div className="mut" style={{ fontSize: 10.5, margin: "2px 0 6px" }}>S&P 500: {breadthLine(pack.us.breadth)}</div>}
      <div className="msg2">
        <div><SectorsTable rows={pack.us.sectorsEtf.map((m) => ({ sector: m.name, pct: m.pct, n: 0, weighted: true }))} title="US sectors (SPDR ETFs)" /></div>
        <div><MovesTable rows={[...pack.us.top.slice(0, 5), ...pack.us.bottom.slice(0, 5)]} title="S&P 500 top 5 / bottom 5" /></div>
      </div>

      <div className="nsec">Japan previous day · sectors and movers</div>
      {pack.jp.breadth && <div className="mut" style={{ fontSize: 10.5, margin: "2px 0 6px" }}>Nikkei 225: {breadthLine(pack.jp.breadth)}{pack.jp.impliedOpenPct != null && <span title={pack.jp.impliedNote}> · implied open (CME future vs cash) <b className={signCls(pack.jp.impliedOpenPct)}>{fmtPct(pack.jp.impliedOpenPct)}</b> <span className="e">(E)</span></span>}</div>}
      <div className="msg2">
        <div><SectorsTable rows={pack.jp.sectors} title="Nikkei 225 sectors (weight-averaged)" /></div>
        <div><MovesTable rows={[...pack.jp.top.slice(0, 5), ...pack.jp.bottom.slice(0, 5)]} title="Nikkei 225 top 5 / bottom 5" /></div>
      </div>
      <div className="mut" style={{ fontSize: 10, marginTop: 6 }}>{pack.us.source} · {pack.jp.source}</div>
    </>
  );
}
