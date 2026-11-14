import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Alerts } from "./Alerts";
import { Search } from "./Search";
import { allStatuses, haveHolidays, type MarketId } from "../lib/sessions";
import { fmtClock, fmtStamp, SGT, TZ_ABBR } from "../lib/time";
import { SIZES, type Prefs, type SizeKey } from "../lib/prefs";

export type ViewId = "market" | "news" | "research" | "equities" | "rates" | "asset";
export const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "market", label: "MARKET" }, { id: "news", label: "NEWS" }, { id: "research", label: "RESEARCH" }, { id: "equities", label: "EQUITIES" }, { id: "rates", label: "RATES & CURRENCY" },
];
const CHIP_MARKETS: MarketId[] = ["TSE", "HKEX", "SSE", "KRX", "SGX", "LSE", "NYSE"];

export interface TopbarProps {
  view: ViewId;
  tick: number;                   // refresh counter; the alert line reloads with it
  onNav: (v: ViewId) => void;
  userId: string | null;
  onSignOut: () => void;
  updatedAt: Date | null;
  nextIn: number | null;          // seconds to the next refresh, null when polling is off
  hit: boolean;                   // a payload just landed (green flash)
  health: "ok" | "warn" | "bad" | "unk";
  healthTitle: string;
  onRefresh: () => void;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  onFull: (f: boolean) => void;
}

export function Topbar(p: TopbarProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const statuses = allStatuses(now).filter((s) => CHIP_MARKETS.includes(s.market.id));
  const hol = haveHolidays() ? "" : " (holiday calendar not loaded yet)";
  return (
    <div id="topbar">
      <span className="brand"><Logo />Orrery Monitor</span>
      <nav id="nav">
        {VIEWS.map((v) => <a key={v.id} href={`#${v.id}`} className={v.id === p.view ? "on" : ""} onClick={(e) => { e.preventDefault(); p.onNav(v.id); }}>{v.label}</a>)}
      </nav>
      <Alerts tick={p.tick} />
      <Search />
      <span className="bmq">
        <span id="mktstat" title={`Regular sessions, each in its exchange's local time${hol}`}>
          {statuses.map((s) => (
            <span key={s.market.id} className={`mk ${s.state.toLowerCase()}`} title={`${s.market.name} ${s.state} at ${s.local} ${TZ_ABBR[s.market.tz] ?? ""}`}>
              {s.market.id}<span className="lt">{s.state === "OPEN" ? s.local : s.state === "BREAK" ? "BRK" : s.state === "HOLIDAY" ? "HOL" : "–"}</span>
            </span>
          ))}
        </span>
        <span id="clock" title="Singapore time (default), Tokyo, New York"><b>{fmtClock(now, SGT, true)}</b> SGT · {fmtClock(now, "Asia/Tokyo")} JST · {fmtClock(now, "America/New_York")} ET</span>
        <span id="upd" className="mut" title="When the last payload landed">{p.updatedAt ? `UPD ${fmtStamp(p.updatedAt)}` : ""}</span>
        <span id="nxt" className={`chip-sm${p.hit ? " hit" : p.nextIn == null ? " stale" : ""}`} title="Time to the next automatic refresh. Click to refresh now" onClick={p.onRefresh}>
          &#8635; {p.nextIn == null ? "–:––" : `${Math.floor(p.nextIn / 60)}:${String(p.nextIn % 60).padStart(2, "0")}`}
        </span>
        <span id="hlth" className={`chip-sm hl hl-${p.health}`} title={p.healthTitle}>DATA {p.health === "ok" ? "OK" : p.health === "warn" ? "!" : p.health === "bad" ? "✕" : "?"}</span>
        <span id="sz-ctl">{SIZES.map((s) => <span key={s.k} className={`chip-sm${p.prefs.size === s.k ? " on" : ""}`} title={s.k === "AUTO" ? "Text and layout scale to this window automatically" : `Fixed text size ${s.k}`} onClick={() => p.onPrefs({ ...p.prefs, size: s.k as SizeKey })}>{s.k}</span>)}</span>
        <span id="cmp-ctl" className={`chip-sm${p.prefs.compact ? " on" : ""}`} title="Terminal layout: one screen per tab, sized to the window" onClick={() => p.onPrefs({ ...p.prefs, compact: !p.prefs.compact })}>COMPACT</span>
        <span id="fs-ctl" className="chip-sm" title="Fullscreen: hides the header (Esc or click the corner strip to leave; keys 1 to 5 switch tabs)" onClick={() => p.onFull(true)}>&#9974; FULL</span>
        {p.userId && <span className="chip" id="userchip" title="Signed in. Click to sign out" onClick={p.onSignOut}>{p.userId.toUpperCase()}<span className="so"> · SIGN OUT</span></span>}
      </span>
    </div>
  );
}
