// What a push notification says and who gets it (Shota, 18 Nov 2026). No database here (sim/logic.test.ts).
// Since 20 Nov 2026 (I-6, B-03 with B's correction) a device also chooses which kinds of alert reach it, and its σ line
// for the new σ moves: 2, 2.5 (the default) or 3σ. A device that has not chosen keeps exactly what it received before.
/** `sigma` and `note` for a σ alert; `pushedSigma` the |σ| at which it was last offered to devices (none yet: null). */
export interface AlertLite { id: number; at: string; symbol: string; name: string; kind: string; pct: number | null; msg: string; sigma?: number | null; note?: string | null; pushedSigma?: number | null }
/** A subscription's choice: every alert, or only alerts on the names of its account's watchlist. */
export type PushScope = "all" | "mine";
export const PUSH_SCOPES: PushScope[] = ["all", "mine"];
export interface Note { title: string; body: string; hash: string; tag: string }
/** Every kind of alert, and the kinds a device receives until it chooses: what it received before 20 Nov 2026. */
export const ALERT_KINDS: readonly string[] = ["stock", "index", "buyback", "revision", "mna", "sigma"];
export const DEFAULT_KINDS: readonly string[] = ["stock", "index", "buyback", "revision", "mna"];
export const PUSH_LINES: readonly number[] = [2, 2.5, 3], PUSH_LINE = 2.5;
/** A device's choices: which alerts (scope), which kinds (null: DEFAULT_KINDS) and the σ line. */
export interface PushPrefs { scope: PushScope; kinds: readonly string[] | null; sigmaLine: number | null }
const prefsOf = (p: PushScope | PushPrefs): PushPrefs => (typeof p === "string" ? { scope: p, kinds: null, sigmaLine: null } : p);
/** Whether a σ alert has crossed a device's line since it was last offered (it grows through the day: a device at 3σ
 *  hears of it when it passes 3σ, also if it was first raised at 2.2σ). */
export function sigmaReaches(line: number, sigma: number | null | undefined, pushedSigma: number | null | undefined): boolean {
  const s = Math.abs(sigma ?? 0), before = pushedSigma ?? 0;
  return s >= line - 1e-9 && before < line - 1e-9;
}

/** The kinds and the σ line a page sent, checked; `undefined` for what it did not send (a page from before 20 Nov 2026
 *  sends neither, and a device's stored choice is then kept). */
export function prefsFromBody(b: { kinds?: unknown; sigmaLine?: unknown }): { kinds?: string[]; sigmaLine?: number; error?: string } {
  const out: { kinds?: string[]; sigmaLine?: number; error?: string } = {};
  if (b.kinds !== undefined) {
    if (!Array.isArray(b.kinds) || b.kinds.length > ALERT_KINDS.length || b.kinds.some((k) => typeof k !== "string" || !ALERT_KINDS.includes(k))) return { error: "bad kinds" };
    out.kinds = [...new Set(b.kinds as string[])];
  }
  if (b.sigmaLine !== undefined) {
    const v = Number(b.sigmaLine);
    if (!PUSH_LINES.includes(v)) return { error: "bad σ line" };
    out.sigmaLine = v;
  }
  return out;
}

const LABEL: Record<string, string> = { stock: "Stock move", index: "Index move", buyback: "Buyback", revision: "Guidance", mna: "M&A", sigma: "σ move" };
const sgt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hourCycle: "h23", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "18 Nov 10:05 SGT", as the page writes its times (web/src/lib/time.ts fmtStamp; the designer's D-16, 20 Nov 2026:
 *  it was "11/18 10:05 SGT", a day and month a reader in Japan or Singapore can read the wrong way round). */
export function stampSgt(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of sgt.formatToParts(new Date(iso))) if (x.type !== "literal") p[x.type] = x.value;
  return `${Number(p.day)} ${MON[Number(p.month) - 1]} ${p.hour}:${p.minute} SGT`;
}
/** Alerts raised from headlines about no listed company carry a made-up symbol ("news:123"): no page to open. */
const hasPage = (symbol: string): boolean => !!symbol && !symbol.startsWith("news:");

/** Green for a rise, red for a fall, as on the page (Shota, 18 Nov 2026). A phone draws a notification's text in
 *  its own colour and a web app cannot change that, so the colour is carried by a round mark in front of the
 *  line. Headline alerts (a buyback, a guidance change, an acquisition) have no direction and get no mark. */
export const moveMark = (a: AlertLite): string => {
  const v = a.kind === "sigma" ? a.sigma : a.kind === "stock" || a.kind === "index" ? a.pct : null;
  return v ? (v > 0 ? "\u{1F7E2} " : "\u{1F534} ") : "";
};

/** One alert as a notification: the alert's own line as the title (with its mark), its kind and time under it; a
 *  tap opens the stock's page (a move, or a headline about a company), or NEWS for a headline about none. */
export function alertNote(a: AlertLite): Note {
  const move = a.kind === "stock" || a.kind === "index" || a.kind === "sigma";
  // a σ move says its window and source under its line (B-03: "the alert shows the σ and the source of the price")
  return { title: moveMark(a) + a.msg, body: `${LABEL[a.kind] ?? "Alert"} · ${a.kind === "sigma" && a.note ? `${a.note} · ` : ""}${stampSgt(a.at)}`, hash: hasPage(a.symbol) ? `#asset/${encodeURIComponent(a.symbol)}` : move ? "#market" : "#news", tag: `alert-${a.id}${a.kind === "sigma" && a.pushedSigma ? `-${Math.round(Math.abs(a.sigma ?? 0) * 10)}` : ""}` };
}
/** Whether an alert reaches a device: one of the kinds it receives, past its σ line for a σ move, and on its
 *  account's watchlist if it asked for those only. A scope alone is a device that has not chosen its kinds. */
export const wanted = (p: PushScope | PushPrefs, watch: ReadonlySet<string>, a: AlertLite): boolean => {
  const q = prefsOf(p);
  if (!(q.kinds ?? DEFAULT_KINDS).includes(a.kind)) return false;
  if (a.kind === "sigma" && !sigmaReaches(q.sigmaLine ?? PUSH_LINE, a.sigma, a.pushedSigma)) return false;
  return q.scope === "all" || watch.has(a.symbol);
};

export const MAX_SINGLE = 4;
/** The notifications one subscription gets for a batch of new alerts: one each, or a single summary when there
 *  are more than four at once (a market-wide sell-off should not make a phone buzz thirty times). */
export function notesFor(alerts: AlertLite[], prefs: PushScope | PushPrefs, watch: ReadonlySet<string>): Note[] {
  const mine = alerts.filter((a) => wanted(prefs, watch, a));
  if (mine.length <= MAX_SINGLE) return mine.map(alertNote);
  const newest = [...mine].sort((x, y) => y.at.localeCompare(x.at));
  return [{ title: `${mine.length} new alerts`, body: `${newest.slice(0, 3).map((a) => moveMark(a) + a.msg).join(" · ")} and ${mine.length - 3} more`, hash: "#market", tag: `alerts-${newest[0].id}` }];
}
