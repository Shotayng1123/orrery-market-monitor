// "personal use" at the end of a source line that names a JPX, Nikkei, JSF or fund issuer's file (the owner's decision
// P4 of 20 Nov 2026; the designer's §1.6). On a computer the two words are teal and open Help at its paragraph; on a
// phone the whole source line takes the tap and opens a card with the publisher, the file and the same paragraph.
import { useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";
import { PERSONAL_USE, PERSONAL_USE_TEXT } from "../lib/labels";

/** Asks Help to open at one of its rows (`detail`: the row's id). */
export const HELP_EVENT = "om:help";
export const HELP_PERSONAL_USE = "personal-use";

export function PersonalUse() {
  return <button type="button" className="puse" title={PERSONAL_USE_TEXT} onClick={() => window.dispatchEvent(new CustomEvent(HELP_EVENT, { detail: HELP_PERSONAL_USE }))}>{PERSONAL_USE}</button>;
}

/** `short`: what the line reads before "· personal use"; `full`: the publisher and the file, for the card. The dot keeps
 *  a space on each side (its own span, white-space kept): the button is a flex box, which dropped the space after a
 *  dot written as plain text ("JPX ·personal use", LV-2 of round 3b). */
export function SourceLine({ short, full }: { short: ReactNode; full: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="psrc" onClick={() => setOpen(true)}>{short}<span className="psep"> · </span><span className="pu">{PERSONAL_USE}</span></button>
      {open && <Sheet title="Source" onClose={() => setOpen(false)}><p className="psrc-p">{full}</p><p className="psrc-p" id="psrc-text">{PERSONAL_USE_TEXT}</p></Sheet>}
    </>
  );
}
