// What a push notification says and who gets it (Shota, 18 Nov 2026). No database here (sim/logic.test.ts).
export interface AlertLite { id: number; at: string; symbol: string; name: string; kind: string; pct: number | null; msg: string }
/** A subscription's choice: every alert, or only alerts on the names of its account's watchlist. */
export type PushScope = "all" | "mine";
export const PUSH_SCOPES: PushScope[] = ["all", "mine"];
export interface Note { title: string; body: string; hash: string; tag: string }

const LABEL: Record<string, string> = { stock: "Stock move", index: "Index move", buyback: "Buyback", revision: "Guidance", mna: "M&A" };
const sgt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hourCycle: "h23", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
/** "11/18 10:05 SGT", as the page writes its times. */
export function stampSgt(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of sgt.formatToParts(new Date(iso))) if (x.type !== "literal") p[x.type] = x.value;
  return `${p.month}/${p.day} ${p.hour}:${p.minute} SGT`;
}
/** Alerts raised from headlines about no listed company carry a made-up symbol ("news:123"): no page to open. */
const hasPage = (symbol: string): boolean => !!symbol && !symbol.startsWith("news:");

/** One alert as a notification: the alert's own line as the title, its kind and time under it; a tap opens the
 *  stock's page (a move, or a headline about a company), or NEWS for a headline about none. */
export function alertNote(a: AlertLite): Note {
  const move = a.kind === "stock" || a.kind === "index";
  return { title: a.msg, body: `${LABEL[a.kind] ?? "Alert"} · ${stampSgt(a.at)}`, hash: hasPage(a.symbol) ? `#asset/${encodeURIComponent(a.symbol)}` : move ? "#market" : "#news", tag: `alert-${a.id}` };
}
export const wanted = (scope: PushScope, watch: ReadonlySet<string>, a: AlertLite): boolean => scope === "all" || watch.has(a.symbol);

export const MAX_SINGLE = 4;
/** The notifications one subscription gets for a batch of new alerts: one each, or a single summary when there
 *  are more than four at once (a market-wide sell-off should not make a phone buzz thirty times). */
export function notesFor(alerts: AlertLite[], scope: PushScope, watch: ReadonlySet<string>): Note[] {
  const mine = alerts.filter((a) => wanted(scope, watch, a));
  if (mine.length <= MAX_SINGLE) return mine.map(alertNote);
  const newest = [...mine].sort((x, y) => y.at.localeCompare(x.at));
  return [{ title: `${mine.length} new alerts`, body: `${newest.slice(0, 3).map((a) => a.msg).join(" · ")} and ${mine.length - 3} more`, hash: "#market", tag: `alerts-${newest[0].id}` }];
}
