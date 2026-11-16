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
