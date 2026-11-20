import type { KeyboardEvent } from "react";

/** A section of a page and the compact screen it sits on. */
export interface ScreenSection<S extends string> { k: string; label: string; screen: S }

/** The section bar's compact half (the designer's §3.4; first on a stock's and an instrument's page, 20 Nov 2026, whose
 *  compact screens of §4.6 and §4.7 need it before I-7 brings the whole bar to RATES & FX). In the one-screen layout a
 *  page with more panels than a screen holds is cut into screens: GO TO, at the right of the selector strip, has a
 *  chip for each section in page order, a click or Enter shows the screen that holds it, and the chips of the screen
 *  on view are lit. The scrolling page shows every panel and no bar. */
export function ScreenChips<S extends string>({ sections, screen, onScreen }: { sections: Array<ScreenSection<S>>; screen: S; onScreen: (s: S) => void }) {
  const key = (e: KeyboardEvent, s: S) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onScreen(s); } };
  return (
    <span className="chips scrbar" id="scrbar" role="group" aria-label="Go to a section">
      <span className="lbl">Go to</span>
      {sections.map((x) => (
        <span key={x.k} role="button" tabIndex={0} data-k={x.k} data-screen={x.screen} aria-pressed={x.screen === screen} className={`chip-sm${x.screen === screen ? " on" : ""}`} onClick={() => onScreen(x.screen)} onKeyDown={(e) => key(e, x.screen)}>{x.label.toUpperCase()}</span>
      ))}
    </span>
  );
}

/** The screens a page's sections fall on, in order, each once. */
export const screensOf = <S extends string>(sections: Array<ScreenSection<S>>): S[] => [...new Set(sections.map((x) => x.screen))];
