import type { ReactNode } from "react";
import type { ViewId } from "./Topbar";
import { PORTFOLIO, TAB_BAR } from "../lib/labels";
import { PAPER } from "../lib/paper";

/** The tabs as a bar along the bottom of the screen, where a thumb reaches them (phone preview, lib/phone.ts).
 *  Six short labels with an icon each; the active one in coral. A stock's own page lights none of them. Where the
 *  paper book is on (lib/paper.ts) "Portfolio" is the seventh, at the right end: one tap from anywhere. Its icon is a
 *  circle with one quarter drawn apart (the designer's note of 21 Nov 2026). */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const svg = (body: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>{body}</svg>;
const ITEMS: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
  { id: "market", label: TAB_BAR.market, icon: svg(<><path d="M3 20h18" /><path d="M4 15l5-5 4 3 7-8" /></>) },
  { id: "news", label: TAB_BAR.news, icon: svg(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>) },
  { id: "research", label: TAB_BAR.research, icon: svg(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>) },
  { id: "equities", label: TAB_BAR.equities, icon: svg(<><path d="M5 20V11M12 20V5M19 20v-6" /></>) },
  { id: "rates", label: TAB_BAR.rates, icon: svg(<><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /><path d="M18 6L6 18" /></>) },
  { id: "watch", label: TAB_BAR.watch, icon: svg(<path d="M12 4l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />) },
  ...(__PAPER_BUILD__ && PAPER ? [{ id: "portfolio" as const, label: PORTFOLIO, icon: svg(<><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M14.5 2.6a9 9 0 0 1 6.9 6.9h-6.9z" /></>) }] : []),
];

export function PhoneNav({ view, onNav }: { view: ViewId; onNav: (v: ViewId) => void }) {
  return (
    <nav id="pnav" aria-label="Tabs" className={ITEMS.length > 6 ? "n7" : undefined}>
      {ITEMS.map((i) => (
        <a key={i.id} href={`#${i.id}`} aria-label={PAPER ? i.label : undefined} className={i.id === view ? "on" : undefined} aria-current={i.id === view ? "page" : undefined}
          onClick={(e) => { e.preventDefault(); onNav(i.id); window.scrollTo(0, 0); }}>
          {i.icon}<span>{i.label}</span>
        </a>
      ))}
    </nav>
  );
}
