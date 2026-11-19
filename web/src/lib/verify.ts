// The "Verify my email" button in the Monitor's email opens the page with `#verify=<6-digit code>.<address>`
// (the address in base64url; built by verifyLink in supabase/functions/_shared/signup.ts). Browsers keep the part
// after # to themselves: it is not sent to the server the page is loaded from.
export interface VerifyLink { email: string; code: string }

export function readVerify(hash: string): VerifyLink | null {
  const m = /^#verify=(\d{6})\.([A-Za-z0-9_-]{4,400})$/.exec(hash);
  if (!m) return null;
  try {
    const b = m[2].replace(/-/g, "+").replace(/_/g, "/");
    const email = atob(b.padEnd(Math.ceil(b.length / 4) * 4, "=")).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? { email, code: m[1] } : null;
  } catch { return null; }
}

/** Reads the button's link from the address bar and takes it out again, so the code is left neither in the
 *  address nor in the browser's history. Null when the page was not opened by the button. */
export function takeVerifyLink(): VerifyLink | null {
  try {
    const v = readVerify(location.hash);
    if (v) { byButton = true; history.replaceState(null, "", location.pathname + location.search); }
    return v;
  } catch { return null; }
}
let byButton = false;
/** Whether this page was opened by the email's button (known once takeVerifyLink has looked). */
export const openedByButton = (): boolean => byButton;
