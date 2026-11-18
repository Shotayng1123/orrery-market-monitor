import { useEffect, useState } from "react";

/** A phone, upright or on its side: a window at most 720px wide (the stylesheet's phone layout), or a short touch
 *  screen (a phone turned sideways is wider than that but under 540px tall). Tablets and narrow desktop windows are
 *  not phones. */
export const PHONE = "(max-width:720px), (max-height:540px) and (pointer:coarse)";

/** True on a phone (see PHONE); follows rotation and window resizes. */
export function usePhone(): boolean {
  const [m, setM] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}

/* ----- the phone layout (Shota, 17 Nov 2026; the default on a phone since 18 Nov) -----
   A phone opens in the layout made for phones. CLASSIC LAYOUT in its menu goes back to the earlier layout for this
   browser, and NEW LAYOUT in the classic header returns; `?phone=old` and `?phone=new` in the address do the same
   (the parameter is then removed). The choice is kept per browser. It was opt-in for its first day, which left the
   app added to an iPhone's home screen on the earlier layout: that app keeps its own storage, apart from Safari's,
   and opens the plain address, so a choice made in Safari never reached it. */
const V2_KEY = "om_phone_v2", V2_EVENT = "om:phonev2";
let unsaved: boolean | null = null;   // the choice for this visit when the browser will not store it
(() => {
  let u: URL, v: string | null;
  try { u = new URL(location.href); v = u.searchParams.get("phone"); } catch { return; }
  if (v !== "new" && v !== "old") return;
  try { localStorage.setItem(V2_KEY, v === "new" ? "1" : "0"); } catch { unsaved = v === "new"; }
  try { u.searchParams.delete("phone"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch { /* the parameter stays in the address */ }
})();
/** The layout chosen for phones in this browser: the new one unless CLASSIC LAYOUT was picked here. */
export const phoneV2Stored = (): boolean => { if (unsaved != null) return unsaved; try { return localStorage.getItem(V2_KEY) !== "0"; } catch { return true; } };
export function setPhoneV2(on: boolean): void {
  try { localStorage.setItem(V2_KEY, on ? "1" : "0"); unsaved = null; } catch { unsaved = on; }
  window.dispatchEvent(new Event(V2_EVENT));
}
/** True when this is a phone and the phone layout is in use; follows the switch and rotation. */
export function usePhoneV2(): boolean {
  const phone = usePhone();
  const [on, setOn] = useState(phoneV2Stored);
  useEffect(() => { const f = () => setOn(phoneV2Stored()); window.addEventListener(V2_EVENT, f); return () => window.removeEventListener(V2_EVENT, f); }, []);
  return phone && on;
}
