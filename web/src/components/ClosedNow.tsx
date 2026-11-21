import { Fragment } from "react";
import { closedLine, type PanelRow } from "../lib/opens";

/** "Closed now: New York opens 22:30 SGT · Hong Kong and Shanghai open 23 Nov 09:30 SGT, scheduled · Tokyo (holiday)
 *  opens 24 Nov 08:00 SGT · next read 22:30 SGT: VIX, DXY, UST 10Y" (the designer's D-62, 21 Nov 2026; A-41, B-35; the
 *  owner's request of 20 Nov 2026: when a closed market opens, on screen without a hover). The first line of a panel's
 *  body, above its table: the markets of the panel's own rows that are shut, the soonest to open first, and the rows the
 *  Monitor only reads in New York's hours while New York is shut (lib/opens.ts closedLine). A note line that may wrap
 *  and is never cut; each entry's tooltip gives the market's hours and whose calendar. Nothing when none is shut. */
export function ClosedNow({ rows, id, phone = false }: { rows: PanelRow[]; id: string; phone?: boolean }) {
  const c = closedLine(rows);
  if (!c) return null;
  const body = (
    <>
      Closed now:{" "}
      {/* the dot that follows an entry stays on the entry's line: on a computer an entry wraps as a whole (tokens.css) */}
      {c.entries.map((e, i) => { const more = i < c.entries.length - 1 || !!c.read; return <Fragment key={e.label}><span className="e" title={e.tip}><b>{e.label}</b>{e.rest}{more && " ·"}</span>{more && " "}</Fragment>; })}
      {c.read && <span className="e rd" title={c.read.tip}>{c.read.lead}<b>{c.read.names.join(", ")}</b></span>}
    </>
  );
  return phone ? <p className="mp-note closednow" id={id}>{body}</p> : <div className="finnote closednow" id={id}>{body}</div>;
}
