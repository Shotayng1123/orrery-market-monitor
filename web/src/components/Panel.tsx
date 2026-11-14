import type { ReactNode } from "react";

/** Numbered panel: `01 TITLE …aux` head, scrolling body. Span is the 12-column grid width in the scrolling
 *  layout; `k` names the panel kind and `ts` its column span for the one-screen layout's placement rules. */
export function Panel({ no, title, aux, span = 12, children, id, k, ts }: { no: string; title: string; aux?: ReactNode; span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; children: ReactNode; id?: string; k?: string; ts?: number }) {
  return (
    <div className={`panel c${span}`} id={id} data-no={no} data-k={k} data-ts={ts}>
      <div className="phead"><span className="no">{no}</span><span className="t">{title}</span>{aux !== undefined && <span className="aux">{aux}</span>}</div>
      <div className="pbody">{children}</div>
    </div>
  );
}

/** Empty state with a reason, never a blank tile. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children && <><br />{children}</>}</div>;
}
