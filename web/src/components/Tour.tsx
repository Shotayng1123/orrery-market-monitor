import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The 1-minute tour (slice 11, 23 Nov 2026; the designer's work order D/tour-storyboard.md §5.3): PLAY under Help's
// first row plays the film over the Monitor. The film, its still and the tour's own page are files of the site
// (public/tour/), never part of the app's code, and nothing of them is asked for until PLAY is pressed. The player
// closes on CLOSE, Esc, a click outside the film and, in the phone layout, Back, and the film stops with it. Esc and
// Back close the player only: Help stays open under it (Help closes on Esc from its own window listener; this one
// listens first and keeps the key). A reader who has asked for less motion starts the film with its own controls.
const KEY = "omTour";   // the player's own history entry in the phone layout, above the one Help takes (Sheet.tsx backEntry)
const onEntry = (): boolean => { try { const s = history.state as Record<string, unknown> | null; return !!s && typeof s === "object" && s[KEY] === true; } catch { return false; } };
const BASE = import.meta.env.BASE_URL;

export function TourPlay() {
  const [on, setOn] = useState(false);
  const opener = useRef<HTMLButtonElement>(null), film = useRef<HTMLVideoElement>(null);
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const close = () => {
    film.current?.pause(); setOn(false);
    if (onEntry()) { try { history.back(); } catch { /* no history */ } }   // the player's entry is left; Help's stays
    opener.current?.focus({ preventScroll: true });
  };
  const open = () => {
    // in the phone layout Back closes the player first: it takes an entry of its own, marked, above Help's
    if (document.body.classList.contains("pv2") && !onEntry()) {
      try { const s = history.state as Record<string, unknown> | null; history.pushState({ ...(s && typeof s === "object" ? s : {}), [KEY]: true }, ""); } catch { /* no history: Back closes Help with it */ }
    }
    setOn(true);
  };
  useEffect(() => {
    if (!on) return;
    film.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopPropagation(); e.preventDefault(); close(); };
    const pop = () => { if (!onEntry()) { film.current?.pause(); setOn(false); } };   // Back has left the player's entry
    window.addEventListener("keydown", key, true); window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("popstate", pop); };
  }, [on]);
  return (
    <>
      <span className="tourgo"><button ref={opener} type="button" className="chip-sm tourplay" onClick={open}>PLAY</button></span>
      {on && createPortal(
        <div className="tourwrap" onClick={(e) => { e.stopPropagation(); close(); }}>
          <div className="tourbox" role="dialog" aria-modal="true" aria-label="The 1-minute tour" onClick={(e) => e.stopPropagation()}>
            <div className="tourhead"><b>THE 1-MINUTE TOUR</b><button type="button" className="chip-sm tourclose" onClick={close}>CLOSE</button></div>
            <video ref={film} src={`${BASE}tour/orrery-tour.mp4`} poster={`${BASE}tour/poster.jpg`} controls playsInline muted autoPlay={!still} preload="metadata"
              aria-label="The 1-minute tour of Orrery Monitor, tab by tab: what each tab shows and what you can set; a video with captions and no sound" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
