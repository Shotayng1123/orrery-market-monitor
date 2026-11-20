// Alerts as push notifications (Shota, 18 Nov 2026). Every alert, whichever job raised it, is offered once to the
// subscribed devices by the tick, within a minute of being written. Off until the server holds a VAPID key pair
// (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY; supabase/README.md).
import { db, selectAll } from "./db.ts";
import { notesFor, prefsFromBody, PUSH_LINES, PUSH_SCOPES, sigmaReaches, type AlertLite, type Note, type PushScope } from "./pushrules.ts";
import { pushEndpointOk, sendPush, type KeyPair } from "./webpush.ts";

const SITE = "https://shotayng1123.github.io/orrery-market-monitor/";
export function vapid(): { key: KeyPair; subject: string } | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY"), privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  return publicKey && privateKey ? { key: { publicKey, privateKey }, subject: Deno.env.get("VAPID_SUBJECT") ?? SITE } : null;
}

interface Sub { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; scope: PushScope; fails: number; kinds: string[] | null; sigma_line: number | null }
const RECENT_MS = 2 * 3600e3;    // an alert is timed at the minute its move began, which a delayed feed shows up to half an hour late; older rows are back-fills
const MAX_ALERTS = 40, MAX_SENDS = 120, DROP_AFTER = 20;

/** Sends the alerts not yet offered. Returns a note for the job log ("" when there was nothing to do). */
export async function pushNewAlerts(now: Date): Promise<string> {
  const v = vapid();
  if (!v) return "";
  const COLS = "id,at,symbol,name,kind,pct,msg,sigma,note,pushed_sigma";
  const recent = new Date(now.getTime() - RECENT_MS).toISOString();
  const { data: al, error } = await db.from("alerts").select(COLS).is("pushed_at", null).gte("at", recent).order("at").limit(MAX_ALERTS);
  if (error) throw new Error("push: " + error.message);
  // a σ move already offered that has since grown past a device's line (2.5 or 3σ) is offered again, to those devices
  const { data: gr, error: ge } = await db.from("alerts").select(COLS).eq("kind", "sigma").not("pushed_at", "is", null).gte("upd", recent).order("upd").limit(MAX_ALERTS);
  if (ge) throw new Error("push: " + ge.message);
  type Row = AlertLite & { pushed_sigma: number | null };
  const lite = (r: Row): AlertLite => ({ ...r, pushedSigma: r.pushed_sigma });
  const fresh = ((al ?? []) as Row[]).map(lite);
  const grown = ((gr ?? []) as Row[]).filter((r) => PUSH_LINES.some((l) => sigmaReaches(l, r.sigma, r.pushed_sigma))).map(lite);
  const alerts = [...fresh, ...grown];
  if (!alerts.length) return "";
  // marked first: an alert is offered once (a σ move once per line it crosses), also when a send fails or this run is cut short
  if (fresh.length) { const { error: me } = await db.from("alerts").update({ pushed_at: now.toISOString() }).in("id", fresh.map((a) => a.id)); if (me) throw new Error("push: " + me.message); }
  for (const a of alerts) if (a.kind === "sigma") { const { error: se } = await db.from("alerts").update({ pushed_sigma: Math.abs(a.sigma ?? 0) }).eq("id", a.id); if (se) throw new Error("push: " + se.message); }
  const subs = await selectAll<Sub>(() => db.from("push_subs").select("id,user_id,endpoint,p256dh,auth,scope,fails,kinds,sigma_line").order("id"));
  if (!subs.length) return `, push: ${alerts.length} alerts, no devices`;
  const mineUsers = [...new Set(subs.filter((s) => s.scope === "mine").map((s) => s.user_id))];
  const watch = new Map<string, Set<string>>();
  if (mineUsers.length) for (const w of await selectAll<{ user_id: string; symbol: string }>(() => db.from("watchlists").select("user_id,symbol").in("user_id", mineUsers).order("symbol"))) { if (!watch.has(w.user_id)) watch.set(w.user_id, new Set()); watch.get(w.user_id)!.add(w.symbol); }
  const jobs: Array<{ sub: Sub; note: Note }> = [];
  for (const s of subs) for (const note of notesFor(alerts, { scope: s.scope, kinds: s.kinds, sigmaLine: s.sigma_line }, watch.get(s.user_id) ?? new Set())) jobs.push({ sub: s, note });
  let sent = 0, failed = 0; const ok = new Set<number>(), gone = new Set<number>(), bad = new Map<number, number>();
  const work = jobs.slice(0, MAX_SENDS);
  await Promise.all(Array.from({ length: Math.min(6, work.length) }, async () => {
    for (let j = work.shift(); j; j = work.shift()) {
      if (gone.has(j.sub.id)) continue;
      try {
        const r = await sendPush(j.sub, j.note, v.key, v.subject);
        if (r.gone) gone.add(j.sub.id); else if (r.status >= 200 && r.status < 300) { sent++; ok.add(j.sub.id); } else { failed++; bad.set(j.sub.id, r.status); }
      } catch { failed++; bad.set(j.sub.id, 0); }
    }
  }));
  if (gone.size) await db.from("push_subs").delete().in("id", [...gone]);
  const fine = [...ok].filter((id) => !bad.has(id));
  if (fine.length) await db.from("push_subs").update({ last_ok: now.toISOString(), fails: 0 }).in("id", fine);
  for (const [id] of bad) { const s = subs.find((x) => x.id === id)!; if (s.fails + 1 >= DROP_AFTER) await db.from("push_subs").delete().eq("id", id); else await db.from("push_subs").update({ fails: s.fails + 1 }).eq("id", id); }
  return `, push: ${alerts.length} alerts, ${sent} sent${failed ? `, ${failed} failed` : ""}${gone.size ? `, ${gone.size} devices gone` : ""}${jobs.length > MAX_SENDS ? `, ${jobs.length - MAX_SENDS} over the limit` : ""}`;
}

// ---- the page's side: one device's subscription (api: push_key, push_state, push_sub, push_unsub, push_test) ----
const MAX_DEVICES = 10;
interface Body { endpoint?: unknown; p256dh?: unknown; auth?: unknown; scope?: unknown; kinds?: unknown; sigmaLine?: unknown }
const B64U = /^[A-Za-z0-9_-]+$/;

/** This device's subscription: on or off, which alerts, and since 20 Nov 2026 which kinds (null: the kinds it received
 *  before, every kind but the σ moves) and its σ line. A page from before reads `on` and `scope` only. */
export async function pushState(userId: string, b: Body): Promise<{ on: boolean; scope: PushScope | null; kinds: string[] | null; sigmaLine: number | null }> {
  const { data } = await db.from("push_subs").select("scope,kinds,sigma_line").eq("endpoint", String(b.endpoint ?? "")).eq("user_id", userId).maybeSingle();
  const r = data as { scope: PushScope; kinds: string[] | null; sigma_line: number | null } | null;
  return { on: !!r, scope: r?.scope ?? null, kinds: r?.kinds ?? null, sigmaLine: r?.sigma_line ?? null };
}

/** Stores (or re-points to this account, or changes the choice of) this device's subscription. */
export async function pushSubscribe(userId: string, b: Body, ua: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const endpoint = String(b.endpoint ?? ""), p256dh = String(b.p256dh ?? ""), auth = String(b.auth ?? ""), scope = String(b.scope ?? "all") as PushScope;
  if (!pushEndpointOk(endpoint)) return { status: 400, body: { error: "This browser's push service is not one the Monitor sends to" } };
  if (!B64U.test(p256dh) || !B64U.test(auth) || p256dh.length > 120 || auth.length > 40) return { status: 400, body: { error: "bad subscription keys" } };
  if (!PUSH_SCOPES.includes(scope)) return { status: 400, body: { error: "bad choice" } };
  const prefs = prefsFromBody(b);
  if (prefs.error) return { status: 400, body: { error: prefs.error } };
  const { data: mine } = await db.from("push_subs").select("endpoint").eq("user_id", userId);
  if ((mine ?? []).length >= MAX_DEVICES && !(mine ?? []).some((r) => r.endpoint === endpoint)) return { status: 400, body: { error: `Notifications can be on for up to ${MAX_DEVICES} devices per account` } };
  const { error } = await db.from("push_subs").upsert({ user_id: userId, endpoint, p256dh, auth, scope, ua: ua ? ua.slice(0, 200) : null, fails: 0, ...(prefs.kinds ? { kinds: prefs.kinds } : {}), ...(prefs.sigmaLine != null ? { sigma_line: prefs.sigmaLine } : {}) }, { onConflict: "endpoint" });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { on: true, scope, ...(prefs.kinds ? { kinds: prefs.kinds } : {}), ...(prefs.sigmaLine != null ? { sigmaLine: prefs.sigmaLine } : {}) } };
}
export async function pushUnsubscribe(userId: string, b: Body): Promise<{ on: boolean; scope: null; kinds: null; sigmaLine: null }> {
  await db.from("push_subs").delete().eq("endpoint", String(b.endpoint ?? "")).eq("user_id", userId);
  return { on: false, scope: null, kinds: null, sigmaLine: null };
}
/** A notification to this device only, so its owner sees that they arrive. */
export async function pushTest(userId: string, b: Body, now: Date): Promise<{ status: number; body: Record<string, unknown> }> {
  const v = vapid();
  if (!v) return { status: 503, body: { error: "Notifications are not set up on the server yet" } };
  const { data } = await db.from("push_subs").select("id,endpoint,p256dh,auth").eq("endpoint", String(b.endpoint ?? "")).eq("user_id", userId).maybeSingle();
  const s = data as { id: number; endpoint: string; p256dh: string; auth: string } | null;
  if (!s) return { status: 404, body: { error: "Notifications are not on for this device" } };
  try {
    const r = await sendPush(s, { title: "Orrery Monitor", body: "Notifications are on. Alerts will arrive like this.", hash: "#market", tag: "test" } satisfies Note, v.key, v.subject, 300);
    if (r.gone) { await db.from("push_subs").delete().eq("id", s.id); return { status: 410, body: { error: "This device's subscription has ended; turn notifications on again" } }; }
    if (r.status < 200 || r.status >= 300) return { status: 502, body: { error: `The push service answered ${r.status}` } };
    await db.from("push_subs").update({ last_ok: now.toISOString(), fails: 0 }).eq("id", s.id);
    return { status: 200, body: { ok: true } };
  } catch (e) { return { status: 502, body: { error: e instanceof Error ? e.message : String(e) } }; }
}
