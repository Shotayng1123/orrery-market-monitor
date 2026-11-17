import { useLayoutEffect, type ReactNode, type RefObject } from "react";
import { signCls } from "../lib/fmt";

/** The building blocks of the phone layout (preview, lib/phone.ts; Shota, 17 Nov 2026), shared by every tab so they
 *  read as one app: a screen whose title stays at the top, sections as cards, the coloured change, small statistics. */
export function Screen({ title, sub, right, children }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mp">
      <header className="mp-head">
        <div className="mp-ttl"><h1>{title}</h1>{sub != null && <div className="mp-asof">{sub}</div>}</div>
        {right}
      </header>
      {children}
    </div>
  );
}

/** A titled block. `card` wraps the content in the rounded card; without it the caller lays out its own. */
export function Section({ title, aux, children, card = true, pad = false }: { title: ReactNode; aux?: ReactNode; children: ReactNode; card?: boolean; pad?: boolean }) {
  return (
    <section className="mp-sec">
      <h2><span>{title}</span>{aux != null && <span className="aux">{aux}</span>}</h2>
      {card ? <div className={`mp-card${pad ? " pad" : ""}`}>{children}</div> : children}
    </section>
  );
}

/** The change as a tinted pill: green up, red down, grey flat or unknown. */
export function Move({ v, children, small = false }: { v: number | null | undefined; children: ReactNode; small?: boolean }) {
  return <span className={`mp-chg ${signCls(v)}${small ? " sm" : ""}`}>{children}</span>;
}

/** One cell of a statistics grid (`.mp-grid`): a small label over a figure. */
export function Stat({ k, children, cls = "", title, cur = false }: { k: ReactNode; children: ReactNode; cls?: string; title?: string; cur?: boolean }) {
  return <div title={title} className={cur ? "cur" : undefined}><span className="k">{k}</span><span className={`v ${cls}`.trim()}>{children}</span></div>;
}

/** Puts a scrolling list (`.mp-scroll`) at its `.next` line, with the two lines before it still in view, and does
 *  so again if the lines change height before the reader has scrolled (a web font landing moves everything below).
 *  `key` changes when the list is a different one (another filter, the data arriving). */
export function usePlaceAtNext(box: RefObject<HTMLElement | null>, key: string): void {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let given = -1;
    const place = () => {
      const next = el.querySelector<HTMLElement>(".next");
      if (!next) return;
      let top = next;
      for (let i = 0; i < 2 && top.previousElementSibling; i++) top = top.previousElementSibling as HTMLElement;
      el.scrollTop = Math.max(0, top.offsetTop);   // the box is the positioned parent, so offsets are measured from its top
      given = el.scrollTop;
    };
    place();
    const inner = el.firstElementChild;
    const ro = inner && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (Math.abs(el.scrollTop - given) < 2) place(); }) : null;
    if (ro && inner) ro.observe(inner);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
