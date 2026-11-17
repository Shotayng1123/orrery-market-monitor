import type { ReactNode } from "react";
import type { ViewId } from "./Topbar";

/** The tabs as a bar along the bottom of the screen, where a thumb reaches them (phone preview, lib/phone.ts).
 *  Six short labels with an icon each; the active one in coral. A stock's own page lights none of them. */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const svg = (body: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true" {...P}>{body}</svg>;
const ITEMS: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
  { id: "market", label: "Market", icon: svg(<><path d="M3 20h18" /><path d="M4 15l5-5 4 3 7-8" /></>) },
  { id: "news", label: "News", icon: svg(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>) },
  { id: "research", label: "Research", icon: svg(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>) },
  { id: "equities", label: "Equities", icon: svg(<><path d="M5 20V11M12 20V5M19 20v-6" /></>) },
  { id: "rates", label: "Rates", icon: svg(<><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /><path d="M18 6L6 18" /></>) },
  { id: "watch", label: "Watchlist", icon: svg(<path d="M12 4l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />) },
];

export function PhoneNav({ view, onNav }: { view: ViewId; onNav: (v: ViewId) => void }) {
  return (
    <nav id="pnav" aria-label="Tabs">
      {ITEMS.map((i) => (
        <a key={i.id} href={`#${i.id}`} className={i.id === view ? "on" : undefined} aria-current={i.id === view ? "page" : undefined}
          onClick={(e) => { e.preventDefault(); onNav(i.id); window.scrollTo(0, 0); }}>
          {i.icon}<span>{i.label}</span>
        </a>
      ))}
    </nav>
  );
}
