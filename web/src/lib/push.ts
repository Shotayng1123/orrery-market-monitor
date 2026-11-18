import { api } from "./api";
import { isInstalled } from "./install";

/** Alerts as notifications on this device (Shota, 18 Nov 2026). The browser holds a push subscription for the
 *  Monitor's service worker (public/sw.js); the server keeps its address with the account and the choice of
 *  which alerts to send (supabase/functions/_shared/push.ts). On an iPhone this exists only in the app added to
 *  the Home Screen (iOS 16.4 and later), not in a Safari tab. */
export type PushScope = "all" | "mine";
export const PUSH_SCOPES: Array<{ value: PushScope; label: string }> = [{ value: "all", label: "All alerts" }, { value: "mine", label: "My watchlist only" }];
/** `why` says what stands in the way when notifications cannot be offered here. */
export interface PushInfo { can: boolean; why: "" | "ios-browser" | "browser" | "worker" | "server"; blocked: boolean; on: boolean; scope: PushScope | null }

const post = <T,>(action: string, body: unknown): Promise<T> => api<T>(action, undefined, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reg = async (): Promise<ServiceWorkerRegistration | null> => ("serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) ?? null : null);
const keyBytes = (b64u: string): Uint8Array<ArrayBuffer> => { const p = b64u.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4)); const o = new Uint8Array(new ArrayBuffer(bin.length)); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
const wire = (s: PushSubscription, scope: PushScope) => { const j = s.toJSON(); return { endpoint: s.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", scope }; };

export async function pushInfo(): Promise<PushInfo> {
  const none = (why: PushInfo["why"]): PushInfo => ({ can: false, why, blocked: false, on: false, scope: null });
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return none(/iPhone|iPad|iPod/.test(navigator.userAgent) && !isInstalled() ? "ios-browser" : "browser");
  const r = await reg();
  if (!r) return none("worker");
  const { key } = await api<{ key: string | null }>("push_key");
  if (!key) return none("server");
  const blocked = Notification.permission === "denied";
  const sub = await r.pushManager.getSubscription();
  if (!sub) return { can: true, why: "", blocked, on: false, scope: null };
  const st = await post<{ on: boolean; scope: PushScope | null }>("push_state", { endpoint: sub.endpoint });
  return { can: true, why: "", blocked, on: st.on, scope: st.scope };
}

/** Asks the browser's permission (this must follow a tap), subscribes this device and stores the choice. */
export async function pushOn(scope: PushScope): Promise<void> {
  const r = await reg();
  if (!r) throw new Error("Not available on this page yet: reload once and try again");
  const { key } = await api<{ key: string | null }>("push_key");
  if (!key) throw new Error("Notifications are not set up on the server yet");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications from the Monitor are blocked in this browser's settings. Allow them there, then turn them on here");
  const opts = { userVisibleOnly: true, applicationServerKey: keyBytes(key) };
  let sub = await r.pushManager.getSubscription();
  if (!sub) {
    try { sub = await r.pushManager.subscribe(opts); }
    catch (e) { throw new Error(e instanceof Error && e.message ? `The browser could not subscribe: ${e.message}` : "The browser could not subscribe"); }
  }
  try { await post("push_sub", wire(sub, scope)); }
  catch (e) { await sub.unsubscribe().catch(() => undefined); throw e; }   // not stored: do not leave a subscription nobody sends to
}
/** Changes which alerts this device gets. */
export async function pushScope(scope: PushScope): Promise<void> {
  const sub = await (await reg())?.pushManager.getSubscription();
  if (!sub) throw new Error("Notifications are not on for this device");
  await post("push_sub", wire(sub, scope));
}
export async function pushOff(): Promise<void> {
  const sub = await (await reg())?.pushManager.getSubscription();
  if (!sub) return;
  await post("push_unsub", { endpoint: sub.endpoint }).catch(() => undefined);   // the server also drops addresses the push service reports gone
  await sub.unsubscribe().catch(() => undefined);
}
/** One notification to this device, to see that they arrive. */
export async function pushTest(): Promise<void> {
  const sub = await (await reg())?.pushManager.getSubscription();
  if (!sub) throw new Error("Notifications are not on for this device");
  await post("push_test", { endpoint: sub.endpoint });
}

/** Opens the notifications window from anywhere (the menu, the alert list). */
export const NOTIFY_EVENT = "om:notify";
export const openNotify = (): void => { window.dispatchEvent(new Event(NOTIFY_EVENT)); };
