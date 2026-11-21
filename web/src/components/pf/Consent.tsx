// The statement an account agrees to before its first paper portfolio or its first note (P-1): version 1, the owner's
// wording, printed as the server gives it and never reworded here. Asked once per account. CONTINUE cannot be pressed
// until the box is ticked; NOT NOW stores nothing. A modal of 480 px on a computer, the bottom sheet on a phone; a
// click outside does nothing: an agreement is not dismissed by accident.
import { useEffect, useRef, useState } from "react";
import { Sheet } from "../Sheet";
import { consentAgree, serverWords } from "../../lib/pf";
import { STATEMENT_TITLE } from "../../lib/pf/statement.ts";
import type { ConsentState } from "../../lib/pf/types.ts";

export function Consent({ consent, what, phone, onAgreed, onNotNow }: { consent: ConsentState; what: keyof typeof STATEMENT_TITLE; phone: boolean; onAgreed: (c: ConsentState) => void; onNotNow: () => void }) {
  const [ticked, setTicked] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null), tick = useRef<HTMLInputElement>(null);
  const agree = () => {
    if (!ticked || busy) return;
    setBusy(true); setErr(null);
    consentAgree(consent.version).then(onAgreed).catch((e: unknown) => { setBusy(false); setErr(`Not saved: ${serverWords(e)}. Nothing was created.`); });
  };
  // a computer's card: focus opens on the box and stays inside; Esc is NOT NOW
  useEffect(() => {
    if (phone) return;
    tick.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onNotNow(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>("input,button:not([disabled])")], first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || !box.current.contains(at))) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (at === last || !box.current.contains(at))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);
  const body = (
    <>
      <p className="pf-statement" id="pf-statement">{consent.text}</p>
      <label className="pf-agree"><input ref={tick} type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} /><span className="bx" aria-hidden="true" /><span>{consent.label}</span></label>
      {err && <p className="pf-no" role="alert">{err}</p>}
    </>
  );
  const title = STATEMENT_TITLE[what];
  if (phone) return (
    <Sheet title={title} onClose={onNotNow} modal id="pf-consent">
      {body}
      <button type="button" className="pf-go big" id="pf-continue" disabled={!ticked || busy} title={ticked ? undefined : "Tick the box to continue"} aria-label={ticked ? "Continue" : "Continue: tick the box to continue"} onClick={agree}>{busy ? "Saving…" : "Continue"}</button>
      <button type="button" className="pf-textbtn" id="pf-notnow" onClick={onNotNow}>Not now</button>
    </Sheet>
  );
  return (
    <div className="modal-bg">
      <div className="modal pf-consent" id="pf-consent" ref={box} role="dialog" aria-modal="true" aria-labelledby="pf-consent-t" aria-describedby="pf-statement">
        <h3 id="pf-consent-t">{title}</h3>
        {body}
        <div className="pf-btns">
          <button type="button" className="pf-btn" id="pf-notnow" onClick={onNotNow}>NOT NOW</button>
          <button type="button" className="pf-go" id="pf-continue" disabled={!ticked || busy} title={ticked ? undefined : "Tick the box to continue"} aria-label={ticked ? "Continue" : "Continue: tick the box to continue"} onClick={agree}>{busy ? "SAVING…" : "CONTINUE"}</button>
        </div>
      </div>
    </div>
  );
}
