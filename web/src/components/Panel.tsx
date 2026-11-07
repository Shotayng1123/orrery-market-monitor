import type { ReactNode } from "react";

/** Numbered panel: `01 TITLE …aux` head, scrolling body. Span is the 12-column grid width. */
export function Panel({ no, title, aux, span = 12, children, id }: { no: string; title: string; aux?: ReactNode; span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; children: ReactNode; id?: string }) {
  return (
    <div className={`panel c${span}`} id={id}>
      <div className="phead"><span className="no">{no}</span><span className="t">{title}</span>{aux !== undefined && <span className="aux">{aux}</span>}</div>
      <div className="pbody">{children}</div>
    </div>
  );
}

/** Empty state with a reason, never a blank tile. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children && <><br />{children}</>}</div>;
}
