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

/* ----- phone preview (Shota, 17 Nov 2026): a phone-first layout that is opt-in while it is being judged -----
   Off unless asked for. `?phone=new` in the address turns it on for this browser, `?phone=old` off; the parameter is
   then removed from the address. The header also has a switch (shown to managers on a phone, and to anyone who has
   the preview on), because an app added to an iPhone's home screen keeps its own storage, apart from Safari's. */
const V2_KEY = "om_phone_v2", V2_EVENT = "om:phonev2";
(() => {
  try {
    const u = new URL(location.href), v = u.searchParams.get("phone");
    if (v !== "new" && v !== "old") return;
    localStorage.setItem(V2_KEY, v === "new" ? "1" : "0");
    u.searchParams.delete("phone");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  } catch { /* storage or history blocked: stay on the current layout */ }
})();
export const phoneV2Stored = (): boolean => { try { return localStorage.getItem(V2_KEY) === "1"; } catch { return false; } };
export function setPhoneV2(on: boolean): void {
  try { localStorage.setItem(V2_KEY, on ? "1" : "0"); } catch { /* not kept; the layout still switches for this visit only if storage works */ }
  window.dispatchEvent(new Event(V2_EVENT));
}
/** True when the phone preview is on and this is a phone; follows the switch and rotation. */
export function usePhoneV2(): boolean {
  const phone = usePhone();
  const [on, setOn] = useState(phoneV2Stored);
  useEffect(() => { const f = () => setOn(phoneV2Stored()); window.addEventListener(V2_EVENT, f); return () => window.removeEventListener(V2_EVENT, f); }, []);
  return phone && on;
}
