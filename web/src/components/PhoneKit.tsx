import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { signCls } from "../lib/fmt";
import { Pick } from "./Pick";

/** The building blocks of the phone layout (preview, lib/phone.ts; Shota, 17 Nov 2026), shared by every tab so they
 *  read as one app: a screen whose title stays at the top, sections as cards, the coloured change, small statistics. */
export function Screen({ title, sub, right, children, subBelow = false }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; subBelow?: boolean }) {
  // subBelow: the line under the title runs the full width, below the title and its drop-down, for a line too long
  // to sit beside the drop-down (EQUITIES while a market is open)
  return (
    <div className="mp">
      <header className={`mp-head${subBelow ? " below" : ""}`}>
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

/** The change as a tinted pill: green up, red down, grey flat or unknown. `w` is the window the figure covers ("1D",
 *  "12M"), or the measure a list is sorted by ("MKT CAP"), on a line of its own under the figure: a pill never shows
 *  a figure without saying what it is (the designer's D-02, 19 Nov 2026). */
export function Move({ v, children, w, small = false, cls }: { v: number | null | undefined; children: ReactNode; w: ReactNode; small?: boolean; cls?: string /* the colour, where the figure's own precision decides it (a "0.0%" is grey) */ }) {
  return <span className={`mp-chg ${cls ?? signCls(v)}${small ? " sm" : ""}`}><span className="fig">{children}</span><span className="w">{w}</span></span>;
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

/** "Go to" for a long screen: a drop-down of the screen's sections that scrolls to the one picked, under the pinned
 *  title. The list is read from the page, so it always matches what is shown; `dep` changes when the sections do. */
export function JumpPick({ dep }: { dep?: string }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setNames([...document.querySelectorAll<HTMLElement>(".mp .mp-sec > h2 > span:first-child")].map((e) => e.textContent ?? "").filter(Boolean));
    read();
    const t = setTimeout(read, 600);   // sections that wait for data appear a moment later
    return () => clearTimeout(t);
  }, [dep]);
  const go = (name: string) => {
    const h2 = [...document.querySelectorAll<HTMLElement>(".mp .mp-sec > h2")].find((e) => e.querySelector("span")?.textContent === name);
    if (!h2) return;
    const head = document.querySelector<HTMLElement>(".mp-head")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: h2.getBoundingClientRect().top + window.scrollY - head - 8 });
  };
  if (names.length < 3) return null;
  return <Pick label="Go to" value="" options={[{ value: "", label: "Section" }, ...names.map((n) => ({ value: n }))]} onChange={go} title="Jump to a section of this screen" />;
}
