// A verification email that is on its way is remembered on this device (the address and the time only, never the
// code or a password): on a phone the person leaves for the mail app, and the page may be started afresh when
// they return. The sign-in screen reads it to come back to the right step (auth/Gate.tsx), and the opening reads
// it to stay out of the way of someone who is in the middle of creating their account (components/Opening.tsx).
const PEND = "om_signup";
export interface Pending { email: string; at: number; codeMin: number; resendSec: number }

/** The email that is out, while its button and code are still valid (15 minutes unless the server said otherwise). */
export function readPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PEND) ?? "null") as Pending | null;
    return p && typeof p.email === "string" && typeof p.at === "number" && Date.now() - p.at < (p.codeMin || 15) * 60e3 ? p : null;
  } catch { return null; }
}
export function keepPending(p: Pending | null): void { try { if (p) localStorage.setItem(PEND, JSON.stringify(p)); else localStorage.removeItem(PEND); } catch { /* storage blocked: the step still works until the page is closed */ } }
