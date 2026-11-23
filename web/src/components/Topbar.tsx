import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Alerts } from "./Alerts";
import { Help } from "./Help";
import { Search } from "./Search";
import { Pick } from "./Pick";
import { setPhoneV2 } from "../lib/phone";
import { askInstallHint, useInstall } from "../lib/install";
import { openNotify } from "../lib/push";
import { allStatuses, haveHolidays, type MarketId } from "../lib/sessions";
import { marketSession } from "../lib/opens";
import { fmtClock, fmtWhen, SGT, TZ_ABBR } from "../lib/time";
import { PORTFOLIO, TAB } from "../lib/labels";
import { paperShown, usePaper } from "../lib/paper";
import { SIZES, termWhy, type Prefs, type SizeKey } from "../lib/prefs";

export type ViewId = "market" | "news" | "research" | "equities" | "rates" | "watch" | "asset" | "portfolio";
/** The tabs, in the glossary's words (lib/labels.ts): MARKETS · NEWS · RESEARCH · EQUITIES · RATES & FX · WATCHLIST,
 *  and PORTFOLIO as the seventh where the paper book is drawn (lib/paper.ts: on, or a preview for this account). Keys
 *  1 to 6, or 1 to 7, follow this list. */
const SIX: Array<{ id: ViewId; label: string }> = (["market", "news", "research", "equities", "rates", "watch"] as const).map((id) => ({ id, label: TAB[id].toUpperCase() }));
const SEVEN: Array<{ id: ViewId; label: string }> = [...SIX, { id: "portfolio", label: PORTFOLIO.toUpperCase() }];
export const tabsFor = (shown: boolean): Array<{ id: ViewId; label: string }> => (shown ? SEVEN : SIX);
/** The tabs as the page draws them now (read at the moment: an address, a key). */
export const views = (): Array<{ id: ViewId; label: string }> => tabsFor(paperShown());
const CHIP_MARKETS: MarketId[] = ["TSE", "HKEX", "SSE", "KRX", "SGX", "LSE", "NYSE"];

export interface TopbarProps {
  view: ViewId;
  tick: number;                   // refresh counter; the alert line reloads with it
  onNav: (v: ViewId) => void;
  userId: string | null;
  onSignOut: () => void;
  updatedAt: Date | null;
  nextAt: { current: number | null };   // when the next refresh is due (epoch ms); read every second with the clock
  polling: boolean;               // false when the refresh loop is off (signed out, or no API configured)
  hit: boolean;                   // a payload just landed (green flash)
  health: "ok" | "warn" | "bad" | "unk";
  healthTitle: string;
  onRefresh: () => void;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  onFull: (f: boolean) => void;
  pv2?: boolean;                  // the phone layout is on: slim header, the rest opens as a menu, tabs move to the bottom bar
  canPreview?: boolean;           // show the switch to the phone layout (a phone that was put back on the classic layout)
  term?: boolean;                 // the one-screen layout is drawn (lib/prefs.ts applyPrefs)
}

const MENU_LABEL = "Menu: Tokyo and New York time, text size, compact, full screen, account";
const COMPACT_OFF = {
  small: "COMPACT is on. One screen per tab needs a layout 1,310 × 560 px: a window of at least 1,179 × 540 at AUTO, 1,114 × 540 at S, 1,310 × 560 at M, 1,507 × 644 at L, 1,769 × 756 at XL. This window scrolls. Click to turn COMPACT off.",
  refused: "COMPACT is on. This browser draws the one-screen header wider than this window holds, so the window scrolls. Another window size or text size tries again. Click to turn COMPACT off.",
} as const;

export function Topbar(p: TopbarProps) {
  const VIEWS = tabsFor(usePaper() !== "off");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  // seconds to the next refresh, from the clock this bar already keeps; null when the loop is off or not yet timed
  const nextIn = p.polling && p.nextAt.current != null ? Math.max(0, Math.round((p.nextAt.current - now.getTime()) / 1000)) : null;
  const statuses = allStatuses(now).filter((s) => CHIP_MARKETS.includes(s.market.id));
  const hol = haveHolidays() ? "" : " (holiday calendar not loaded yet)";
  // phone preview: search, clocks, data status and the account sit in a menu under the header
  const [menu, setMenu] = useState(false);
  const inst = useInstall();
  useEffect(() => { setMenu(false); }, [p.view, p.pv2]);
  // The one-screen layout's menu (≡, the row's last item): Tokyo's and New York's time, text size, COMPACT, FULL and
  // the account, in a list under it (the designer's notes of 22 Nov 2026, A.2 point 3, revision 1). Outside that layout
  // the span that holds them is not a box and the row is as before. It closes on a second press, on Escape (the focus
  // back on the button), on a press outside it (the focus where that press put it), once one of its items is used, and
  // when the view, the phone layout or the layout changes. The focus leaving it by the keyboard counts as a press
  // outside: "/" puts it in the search box, whose results list the open menu would otherwise lie over (the second
  // checker of the rule, 22 Nov 2026).
  const [more, setMore] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null), moreBox = useRef<HTMLSpanElement>(null);
  useEffect(() => { setMore(false); }, [p.view, p.pv2, p.term]);
  useEffect(() => {
    if (!more) return;
    const off = (e: Event) => { const t = e.target as Node; if (moreBox.current?.contains(t) || moreBtn.current?.contains(t)) return; setMore(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMore(false); moreBtn.current?.focus(); } };
    document.addEventListener("mousedown", off); document.addEventListener("focusin", off); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("focusin", off); document.removeEventListener("keydown", key); };
  }, [more]);
  const used = () => setMore(false);
  const clocks = `${fmtClock(now, SGT, true)} SGT · ${fmtClock(now, "Asia/Tokyo")} JST · ${fmtClock(now, "America/New_York")} ET`;
  const sgt = fmtClock(now, SGT, true);
  const cmpWhy = p.term ? "" : termWhy(p.prefs, !!p.pv2);   // COMPACT on, its one-screen layout not drawn here: why
  const ico = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div id="topbar" className={[p.pv2 && menu ? "open" : "", VIEWS.length > 6 ? "t7" : "", more && p.term ? "more" : ""].filter(Boolean).join(" ") || undefined}>
      <span className="brand" title="Orrery Monitor"><Logo /><span className="bw">Orrery Monitor</span></span>
      {p.pv2 && (
        <span id="pv2-btns">
          <button type="button" aria-label="Search stocks, bonds, currencies" onClick={() => { setMenu(true); setTimeout(() => document.querySelector<HTMLInputElement>("#search input")?.focus(), 30); }}>{ico("M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.6-4.6")}</button>
          <button type="button" aria-label={menu ? "Close the menu" : "Menu: search, clocks, data status, account"} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{ico(menu ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16")}</button>
        </span>
      )}
      <nav id="nav">
        {VIEWS.map((v) => <a key={v.id} href={`#${v.id}`} className={v.id === p.view ? "on" : ""} onClick={(e) => { e.preventDefault(); p.onNav(v.id); }}>{v.label}</a>)}
      </nav>
      <Alerts tick={p.tick} phone={!!p.pv2} />
      <Search />
      <span className="bmq">
        <span id="mktstat" title={`Regular sessions, each in its exchange's local time${hol}`}>
          {statuses.map((s) => {
            // a market that is shut says when it next opens, in SGT (lib/opens.ts; the owner's request of 20 Nov 2026)
            const opens = s.state === "OPEN" ? null : marketSession(s.market.id, now).note;
            return (
              <span key={s.market.id} className={`mk ${s.state.toLowerCase()}`} title={`${s.market.name} ${s.state} at ${s.local} ${TZ_ABBR[s.market.tz] ?? ""}${opens ? ` · ${opens.text}` : ""}`}>
                {s.market.id}<span className="lt">{s.state === "OPEN" ? s.local : s.state === "BREAK" ? "BRK" : s.state === "HOLIDAY" ? "HOL" : "–"}</span>
              </span>
            );
          })}
        </span>
        {/* in the one-screen layout "07:10 SGT": the seconds and the other two clocks are in the tooltip and the menu */}
        <span id="clock" title={p.term ? `${clocks} · Singapore time (default), Tokyo, New York` : "Singapore time (default), Tokyo, New York"}><b>{sgt.slice(0, 5)}<span className="ss">{sgt.slice(5)}</span></b> SGT<span className="zz"> · {fmtClock(now, "Asia/Tokyo")} JST · {fmtClock(now, "America/New_York")} ET</span></span>
        <span id="upd" className="mut" title="When the last payload landed, Singapore time">{p.updatedAt ? `UPD ${fmtWhen(p.updatedAt)} SGT` : ""}</span>
        <span id="nxt" className={`chip-sm${p.hit ? " hit" : nextIn == null ? " stale" : ""}`} title="Time to the next automatic refresh. Click to refresh now" onClick={p.onRefresh}>
          &#8635; {nextIn == null ? "–:––" : `${Math.floor(nextIn / 60)}:${String(nextIn % 60).padStart(2, "0")}`}
        </span>
        <span id="hlth" className={`chip-sm hl hl-${p.health}`} title={p.healthTitle}>DATA {p.health === "ok" ? "OK" : p.health === "warn" ? "!" : p.health === "bad" ? "✕" : "?"}</span>
        <Help />
        {p.pv2 && <span id="ntf-ctl" className="chip-sm" title="Alerts as notifications on this phone" onClick={() => { setMenu(false); openNotify(); }}>NOTIFICATIONS</span>}
        {p.pv2 && !inst.installed && <span id="a2hs" className="chip-sm" title="How to put the Monitor on this phone's home screen, where it opens full screen like an app" onClick={() => { setMenu(false); askInstallHint(); }}>ADD TO HOME SCREEN</span>}
        {p.pv2 && <span id="pv2-off" className="chip-sm" title="Back to the earlier layout, on this browser only; NEW LAYOUT in its header returns" onClick={() => setPhoneV2(false)}>CLASSIC LAYOUT</span>}
        {/* drawn in the one-screen layout only: elsewhere the row is as before (and a phone's own menu button stays the
            only one in its header) */}
        {p.term && !p.pv2 && <button id="more-btn" ref={moreBtn} type="button" aria-label={MENU_LABEL} aria-expanded={more} aria-controls="more" title="Tokyo and New York time · text size · COMPACT · FULL · account" onClick={() => setMore((m) => !m)}>{ico("M4 7h16M4 12h16M4 17h16")}</button>}
        <span id="more" ref={moreBox}>
          <span className="mclock">{clocks}</span>
          {p.canPreview && !p.pv2 && <span id="pv2-on" className="chip-sm" title="The layout made for phones. Only this browser changes; switch back from its menu" onClick={() => { used(); setPhoneV2(true); }}>NEW LAYOUT</span>}
          <Pick<SizeKey> id="sz-ctl" label="Text size" value={p.prefs.size} options={SIZES.map((s) => s.k)} onChange={(k) => { used(); p.onPrefs({ ...p.prefs, size: k }); }} title="Text size. AUTO scales the text and layout to this window; S, M, L and XL fix the size" />
          <span id="cmp-ctl" className={`chip-sm${p.prefs.compact ? " on" : ""}${cmpWhy ? " off" : ""}`} title={cmpWhy ? COMPACT_OFF[cmpWhy] : "Terminal layout: one screen per tab, sized to the window"} onClick={() => { used(); p.onPrefs({ ...p.prefs, compact: !p.prefs.compact }); }}>COMPACT</span>
          <span id="fs-ctl" className="chip-sm" title={`Full screen: no browser tabs or address bar, header hidden (Esc or the corner strip to leave; keys 1 to ${VIEWS.length} switch tabs)`} onClick={() => { used(); p.onFull(true); }}>&#9974; FULL</span>
          {p.userId && <span className="chip" id="userchip" title={`Signed in as ${p.userId}. Click for your account: change password, sign out`} onClick={() => { used(); p.onSignOut(); }}>{p.userId.split("@")[0].slice(0, 14).toUpperCase()}<span className="so"> · ACCOUNT</span></span>}
        </span>
      </span>
    </div>
  );
}
