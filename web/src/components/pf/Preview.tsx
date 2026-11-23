// The paper book's preview line (slice 9, 23 Nov 2026: the owner's "Yeah just turn on for me for now and you can keep
// refining them"). While the switches are off and the server says this account is in its preview list (lib/paper.ts),
// the first line of every screen of the tab says what this is: a preview only this account sees, whose rules are still
// being built, and whose books may be reset when they change. On a computer the whole sentence; on a phone one line,
// whose tap opens the same sentence in a sheet, as PAPER's mark does. Nothing of it is drawn in another state.
import { useState } from "react";
import { Sheet } from "../Sheet";
import { usePaper } from "../../lib/paper";

export const PREVIEW_WORD = "PREVIEW";
export const PREVIEW_TEXT = "Only your account sees the paper portfolio for now, while its rules are still being built: orders and fills, the daily NAV, and the limits and the ladder at work come next. A book made now may be reset when they change.";
export const PREVIEW_SHORT = "Only you · being built · may be reset";

export function PreviewLine({ phone }: { phone: boolean }) {
  const [open, setOpen] = useState(false);
  if (usePaper() !== "preview") return null;
  if (phone) return (
    <>
      <button type="button" className="pf-preview ph" id="pf-preview" aria-label={`${PREVIEW_WORD}: ${PREVIEW_SHORT}. What it means`} onClick={() => setOpen(true)}>
        <span className="pf-paper">{PREVIEW_WORD}</span><span className="tx">{PREVIEW_SHORT}</span><span className="go" aria-hidden="true">&#8250;</span>
      </button>
      {open && <Sheet title="Preview" onClose={() => setOpen(false)}><p className="pf-sheet-p">{PREVIEW_TEXT}</p></Sheet>}
    </>
  );
  return <p className="pf-preview" id="pf-preview"><span className="pf-paper">{PREVIEW_WORD}</span> {PREVIEW_TEXT}</p>;
}
