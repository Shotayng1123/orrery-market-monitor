import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Alerts } from "./Alerts";
import { Help } from "./Help";
import { Search } from "./Search";
import { Pick } from "./Pick";
import { setPhoneV2 } from "../lib/phone";
import { allStatuses, haveHolidays, type MarketId } from "../lib/sessions";
import { fmtClock, fmtStamp, SGT, TZ_ABBR } from "../lib/time";
import { SIZES, type Prefs, type SizeKey } from "../lib/prefs";

export type ViewId = "market" | "news" | "research" | "equities" | "rates" | "watch" | "asset";
export const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "market", label: "MARKET" }, { id: "news", label: "NEWS" }, { id: "research", label: "RESEARCH" }, { id: "equities", label: "EQUITIES" }, { id: "rates", label: "RATES & CURRENCY" }, { id: "watch", label: "WATCHLIST" },
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
  pv2?: boolean;                  // the phone preview is on: slim header, the rest opens as a menu, tabs move to the bottom bar
  canPreview?: boolean;           // show the switch into the phone preview (a manager on a phone)
}

export function Topbar(p: TopbarProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const statuses = allStatuses(now).filter((s) => CHIP_MARKETS.includes(s.market.id));
  const hol = haveHolidays() ? "" : " (holiday calendar not loaded yet)";
  // phone preview: search, clocks, data status and the account sit in a menu under the header
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [p.view, p.pv2]);
  const ico = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div id="topbar" className={p.pv2 && menu ? "open" : undefined}>
      <span className="brand"><Logo />Orrery Monitor</span>
      {p.pv2 && (
        <span id="pv2-btns">
          <button type="button" aria-label="Search stocks, bonds, currencies" onClick={() => { setMenu(true); setTimeout(() => document.querySelector<HTMLInputElement>("#search input")?.focus(), 30); }}>{ico("M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.6-4.6")}</button>
          <button type="button" aria-label={menu ? "Close the menu" : "Menu: search, clocks, data status, account"} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{ico(menu ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16")}</button>
        </span>
      )}
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
        <Help />
        {p.canPreview && !p.pv2 && <span id="pv2-on" className="chip-sm" title="Preview of a layout made for phones. Only this browser changes; switch back from its menu" onClick={() => setPhoneV2(true)}>NEW LAYOUT</span>}
        {p.pv2 && <span id="pv2-off" className="chip-sm" title="Back to the layout used before the phone preview" onClick={() => setPhoneV2(false)}>CLASSIC LAYOUT</span>}
        <Pick<SizeKey> id="sz-ctl" label="Text size" value={p.prefs.size} options={SIZES.map((s) => s.k)} onChange={(k) => p.onPrefs({ ...p.prefs, size: k })} title="Text size. AUTO scales the text and layout to this window; S, M, L and XL fix the size" />
        <span id="cmp-ctl" className={`chip-sm${p.prefs.compact ? " on" : ""}`} title="Terminal layout: one screen per tab, sized to the window" onClick={() => p.onPrefs({ ...p.prefs, compact: !p.prefs.compact })}>COMPACT</span>
        <span id="fs-ctl" className="chip-sm" title="Full screen: no browser tabs or address bar, header hidden (Esc or the corner strip to leave; keys 1 to 6 switch tabs)" onClick={() => p.onFull(true)}>&#9974; FULL</span>
        {p.userId && <span className="chip" id="userchip" title={`Signed in as ${p.userId}. Click for your account: change password, sign out`} onClick={p.onSignOut}>{p.userId.split("@")[0].slice(0, 14).toUpperCase()}<span className="so"> · ACCOUNT</span></span>}
      </span>
    </div>
  );
}
