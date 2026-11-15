// News alerts (Shota, 15 Nov 2026): buybacks, earnings-guidance revisions and M&A, raised from the headlines the
// news job collects, next to the excessive-move alerts.
//   buyback, revision: only for companies worth USD 5bn or more (index constituents with a known market cap)
//   M&A:               only when the headline states a deal size of USD 1bn or more
// Limits, by design: the source is the tier-one headline feeds, so an announcement no feed writes about raises
// nothing, and a deal reported without a figure is not alerted (its size cannot be checked). One alert per
// company (or story), day and kind; an alert is written once and never re-stamped.
import { db, selectAll } from "./db.ts";

export type NewsKind = "buyback" | "revision" | "mna";
export const MIN_MCAP_USD = 5e9, MIN_DEAL_USD = 1e9;
const LABEL: Record<NewsKind, string> = { buyback: "Buyback", revision: "Guidance", mna: "M&A" };

const BUYBACK = /\b(buy-?backs?|share repurchases?|stock repurchases?|repurchase (program(me)?|plan)|(to|will|plans to) (buy back|repurchase)|buying back)\b/i;
const REVISION = /\b(rais(es?|ed|ing)|lift(s|ed|ing)?|hik(es?|ed|ing)|boost(s|ed|ing)?|upgrad(es?|ed|ing)|cut(s|ting)?|lower(s|ed|ing)?|slash(es|ed|ing)?|trim(s|med|ming)?|downgrad(es?|ed|ing)|withdr(aws?|ew|awn)|revis(es?|ed|ing))\b[^.;:]{0,60}\b(forecasts?|guidance|outlook|profit (targets?|estimates?|view)|sales (targets?|view)|earnings (targets?|view))\b|\bprofit warning\b|\bwarns? on profit\b/i;
const MNA = /\b(acquir(e|es|ed|ing)|acquisition|takeover|buyout|merger|to merge|merg(es?|ing) with|(agree(s|d)?|set|plans?|poised|in talks|nears? (a )?deal|close to (a )?deal|offers?|bids?) to (buy|acquire|purchase)|bid for|offer for|take[- ]private|tak(e|es|ing) .{1,40} private|deal for|to sell .{1,60} (unit|business|arm|stake|division))\b/i;

export interface Company { symbol: string; name: string; short: string; mcapUsd: number | null; idxs: string[] }
export interface Fx { JPY: number; KRW: number; HKD: number; CNY: number; EURUSD: number; GBPUSD: number }

const SUFFIX = /[,.]?\s+(&\s+)?(Corporation|Corp\.?|Company|Co\.,? Ltd\.?|Co\.?|Holdings?|Hldgs\.?|Group|Inc\.?|Incorporated|Ltd\.?|Limited|plc|PLC|AG|SE|N\.?V\.?|S\.?A\.?|K\.?K\.?|Class [A-C]|\(Class [A-C]\)|Financial Group,?)\s*$/i;
/** The name a headline would use: legal suffixes dropped ("Toyota Motor Corporation" -> "Toyota Motor"). */
export function shortName(n: string): string { let s = n.trim(); for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, "").trim(); return s; }
// single words that are also ordinary English: never matched on their own
const AMBIGUOUS = new Set(["Target", "Visa", "Block", "Ball", "Match", "Arch", "Best", "Global", "General", "First", "United", "American", "National", "International", "Western", "Southern", "Public", "Progressive", "News", "Fair", "Fast", "Realty", "Principal", "Globe", "Mosaic", "Nasdaq", "Mars", "Strategy", "World", "Will", "Gold", "Open", "Life", "Money", "Trust", "Green", "Link", "Prime", "Vision", "Focus", "Core", "Wave", "Create", "Value", "Next", "Hope", "Sharp", "Disco", "Lion", "Coach", "Snap", "Unity", "Square", "Nice", "Shell", "Power", "Future", "Change", "Vector", "Rise", "Signal", "Relief", "Alpha", "Delta", "Omega", "Sigma", "Cover", "Base", "Sprout", "Mark", "Smith", "Welcia", "Kura", "Ichigo", "Aeon"]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Companies named in a headline: whole-word, case-sensitive match on the short name (at least four letters). */
export function companiesIn(title: string, companies: Company[]): Company[] {
  const out: Company[] = [];
  for (const c of companies) {
    // a name stored in capitals ("NVIDIA") is written "Nvidia" in the press
    const form = /^[A-Z]{5,}$/.test(c.short) && !title.includes(c.short) ? c.short[0] + c.short.slice(1).toLowerCase() : c.short;
    if (c.short.length < 4 || AMBIGUOUS.has(c.short) || !title.includes(form)) continue;
    if (!c.short.includes(" ") && (c.mcapUsd ?? 0) < MIN_MCAP_USD) continue;   // a one-word name of a small company is too often an ordinary word ("Will", "World")
    if (new RegExp(`(^|[^A-Za-z0-9])${esc(form)}($|[^A-Za-z0-9])`).test(title) && !out.some((o) => o.short === c.short)) out.push(c);
  }
  out.sort((a, b) => b.short.length - a.short.length);
  // "Sumitomo Mitsui" in a headline is one bank, not also Sumitomo and Mitsui: a name that only occurs inside a
  // longer matched name is dropped
  return out.filter((c) => {
    const longer = out.filter((o) => o !== c && o.short.includes(c.short));
    if (!longer.length) return true;
    let rest = title;
    for (const o of longer) rest = rest.split(o.short).join(" ");
    return rest.includes(c.short);
  });
}

/** The largest amount of a billion or more stated in a headline, in USD ("$3.2bn", "¥400bn", "€2.5 billion",
 *  "1 trillion yen"). No currency sign means dollars. Returns null when no such figure is given. */
export function dealSizeUsd(title: string, fx: Fx): number | null {
  let best: number | null = null;
  const re = /(US\$|HK\$|A\$|S\$|C\$|\$|€|£|¥)?\s?(\d{1,3}(?:[.,]\d{1,3})?)\s?(bn|billion|tn|trillion)\b\s?(yen|euros?|pounds?|dollars?|yuan|won)?/gi;
  for (const m of title.matchAll(re)) {
    const n = Number(m[2].replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const amount = n * (/^t/i.test(m[3]) ? 1e12 : 1e9);
    const sign = (m[1] ?? "").toUpperCase(), word = (m[4] ?? "").toLowerCase();
    let usd: number | null = amount;
    if (sign === "¥" || word === "yen") usd = amount / fx.JPY;
    else if (sign === "€" || word.startsWith("euro")) usd = amount * fx.EURUSD;
    else if (sign === "£" || word.startsWith("pound")) usd = amount * fx.GBPUSD;
    else if (sign === "HK$") usd = amount / fx.HKD;
    else if (word === "yuan") usd = amount / fx.CNY;
    else if (word === "won") usd = amount / fx.KRW;
    else if (sign === "A$" || sign === "S$" || sign === "C$") usd = null;   // no rate at hand: not converted, not alerted
    if (usd != null && (best == null || usd > best)) best = usd;
  }
  return best;
}

// First words that many unrelated companies share, or that are ordinary words: never used as a company's short form.
const GENERIC_FIRST = new Set(["First", "United", "American", "General", "National", "International", "Western", "Southern", "Northern", "Eastern", "Central", "Pacific", "Atlantic", "Global", "Public", "Bank", "China", "Japan", "Tokyo", "Nippon", "Korea", "Hong", "Shanghai", "Mitsubishi", "Mitsui", "Sumitomo", "Hyundai", "Daiwa", "Royal", "Texas", "Dollar", "Capital", "Digital", "Old", "New", "Fair", "Best", "Sharp", "Disco", "Lion", "Link", "Coach", "Snap", "Unity", "Square", "Nice", "Shell", "Target", "Block", "Match", "Universal", "Simon", "Martin", "Charles", "Morgan", "Wells", "Kansas", "Monster", "Edison", "Marathon", "Advanced", "Applied", "Analog", "Automatic", "Consolidated", "Constellation", "Dominion", "Emerson", "Federal", "Fifth", "Host", "Jack", "Live", "Mid-America", "Motorola", "Occidental", "Regions", "Republic", "Southwest", "State", "Take-Two", "Union", "Waste", "West", "Zimmer", "East", "Central", "Kyushu", "Kansai", "Chubu", "Tohoku", "Chugoku", "Shikoku", "Hokkaido", "Osaka", "Keio", "Great", "Hang", "Bank", "Ping", "Industrial", "Agricultural", "Postal", "Citic", "CITIC", "Orient", "Sino", "Want", "Power", "Sun", "Swire", "Standard", "Trip.com", "Washington", "Beijing", "Shenzhen", "London", "Singapore", "India", "Europe", "America", "Asia", "Africa", "Arab", "Gulf", "Trade", "Trump", "Wall", "Street", "Treasury", "House", "Senate", "Congress", "White", "Black", "Blue", "Green", "Silver", "Golden", "Energy", "Health", "Total", "Super", "Micro", "Sales", "Stock", "Stocks", "Shares", "Bonds", "Dollar", "Rates", "Prices", "Markets", "Market", "Investors", "Traders", "After", "Before", "While", "Where", "These", "There", "Their", "Which", "Could", "Would", "Should", "Might", "About", "Under", "Above", "Still", "Again", "Every", "Other", "Early", "Later", "Weeks", "Years", "Month", "Today", "Analysts", "Chief", "Chair", "President", "Minister", "Governor", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "August", "September", "October", "November", "December", "Dover", "Garmin", "Paycom", "Copart", "Equinix", "Entergy"].filter((w) => !["Dover", "Garmin", "Paycom", "Copart", "Equinix", "Entergy"].includes(w)));

/** Symbols of the companies a headline names, for the chips beside it (up to four). On top of the strict match
 *  used for alerts, a headline is allowed to call a large company by the first word of its name ("Toyota" for
 *  Toyota Motor) when that word is distinctive: at least five letters, not a generic or shared word, and the
 *  largest company carrying it is worth USD 10bn or more. */
const ALIAS_INDICES = new Set(["SP500", "NDX", "NK225", "KOSPI200"]);
let aliasCache: { src: Company[]; map: Map<string, Company> } | null = null;
export function tagHeadline(rawTitle: string, companies: Company[]): string[] {
  const title = rawTitle.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));
  if (!aliasCache || aliasCache.src !== companies) {
    const map = new Map<string, Company>();
    for (const c of companies) {   // companies arrive largest first, so the first holder of a word is the largest
      const w = c.short.split(/[\s,&]+/)[0].replace(/\.com$/i, "");
      if (w.length < 5 || !/^[A-Z]/.test(w) || GENERIC_FIRST.has(w) || AMBIGUOUS.has(w) || (c.mcapUsd ?? 0) < 1e10 || map.has(w)) continue;
      if (!c.idxs.some((x) => ALIAS_INDICES.has(x))) continue;   // only the indices whose members the press calls by one word
      map.set(w, c);
    }
    aliasCache = { src: companies, map };
  }
  const out: string[] = companiesIn(title, companies).map((c) => c.symbol);
  for (const w of new Set(title.match(/[A-Z][A-Za-z0-9.-]{4,}/g) ?? [])) { const c = aliasCache.map.get(w.replace(/[.'’]s?$/, "")); if (c && !out.includes(c.symbol)) out.push(c.symbol); }
  return out.slice(0, 4);
}

export interface NewsAlert { kind: NewsKind; symbol: string; name: string; msg: string; usd?: number }
/** What one headline raises: at most one alert per kind. */
export function classifyHeadline(id: number, rawTitle: string, companies: Company[], fx: Fx): NewsAlert[] {
  const out: NewsAlert[] = [];
  // some feeds leave HTML entities in their headlines
  const title = rawTitle.replace(/&amp;/g, "&").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));
  const isBuyback = BUYBACK.test(title), isRevision = REVISION.test(title), isMna = MNA.test(title);
  if (!isBuyback && !isRevision && !isMna) return out;
  const named = companiesIn(title, companies);
  const big = named.filter((c) => (c.mcapUsd ?? 0) >= MIN_MCAP_USD);
  const msg = (k: NewsKind) => `${LABEL[k]}: ${title}`.slice(0, 180);
  for (const c of big.slice(0, 3)) {
    if (isBuyback) out.push({ kind: "buyback", symbol: c.symbol, name: c.name, msg: msg("buyback") });
    if (isRevision) out.push({ kind: "revision", symbol: c.symbol, name: c.name, msg: msg("revision") });
  }
  if (isMna) {
    const usd = dealSizeUsd(title, fx);
    if (usd != null && usd >= MIN_DEAL_USD) out.push({ kind: "mna", symbol: named[0]?.symbol ?? `news:${id}`, name: named[0]?.name ?? "M&A", msg: msg("mna"), usd });
  }
  return out;
}

export const CCY: Record<string, keyof Fx | "USD"> = { SP500: "USD", NDX: "USD", NK225: "JPY", TOPIX: "JPY", KOSPI200: "KRW", HSI: "HKD", SSE180: "CNY" };
let cache: { at: number; companies: Company[]; fx: Fx } | null = null;
/** Index constituents with their market cap in USD, and the exchange rates used. Refreshed every six hours. */
export async function loadUniverse(): Promise<{ companies: Company[]; fx: Fx }> {
  if (cache && Date.now() - cache.at < 6 * 3600e3) return cache;
  const { data: q } = await db.from("quotes_latest").select("symbol,price").in("symbol", ["USDJPY=X", "KRW=X", "HKD=X", "CNY=X", "EURUSD=X", "GBPUSD=X"]);
  const px = new Map(((q ?? []) as Array<{ symbol: string; price: number }>).map((r) => [r.symbol, r.price]));
  const need = (s: string) => { const v = px.get(s); if (!v || !(v > 0)) throw new Error(`news alerts: no quote for ${s}`); return v; };
  const fx: Fx = { JPY: need("USDJPY=X"), KRW: need("KRW=X"), HKD: need("HKD=X"), CNY: need("CNY=X"), EURUSD: need("EURUSD=X"), GBPUSD: need("GBPUSD=X") };
  const rows = await selectAll<{ idx: string; symbol: string; name: string; mcap: number | null }>(() => db.from("constituent_stats").select("idx,symbol,name,mcap").order("symbol"));
  const by = new Map<string, Company>();
  for (const r of rows) {
    const ccy = CCY[r.idx];
    const mcapUsd = r.mcap == null || !ccy ? null : ccy === "USD" ? r.mcap : r.mcap / fx[ccy];
    const prev = by.get(r.symbol);
    if (!prev) by.set(r.symbol, { symbol: r.symbol, name: r.name, short: shortName(r.name), mcapUsd, idxs: [r.idx] });
    else { prev.idxs.push(r.idx); if ((mcapUsd ?? 0) > (prev.mcapUsd ?? 0)) prev.mcapUsd = mcapUsd; }
  }
  cache = { at: Date.now(), companies: [...by.values()].sort((a, b) => (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0)), fx };
  return cache;
}

/** Scans the headlines of the last `hours` and writes the alerts they raise. `dry` returns them without writing. */
export async function scanNewsAlerts(now: Date = new Date(), hours = 3, dry = false): Promise<{ scanned: number; raised: Array<NewsAlert & { d: string; url: string; source: string; at: string }> }> {
  const { companies, fx } = await loadUniverse();
  const since = new Date(now.getTime() - hours * 3600e3).toISOString();
  const items = await selectAll<{ id: number; title: string; url: string; source: string; published_at: string }>(() => db.from("news_items").select("id,title,url,source,published_at").gte("published_at", since).order("published_at"));
  const raised: Array<NewsAlert & { d: string; url: string; source: string; at: string }> = [];
  for (const it of items) for (const a of classifyHeadline(it.id, it.title, companies, fx)) raised.push({ ...a, d: it.published_at.slice(0, 10), url: it.url, source: it.source, at: it.published_at });
  if (!dry && raised.length) {
    const seen = new Set<string>();
    const rows = raised.filter((a) => { const k = `${a.symbol}|${a.d}|${a.kind}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((a) => ({ d: a.d, symbol: a.symbol, name: a.name, kind: a.kind, pct: null, price: a.usd ?? null, market: a.source, msg: a.msg, url: a.url }));
    // written once: a story already alerted keeps its first time (the page lights up only for new rows)
    const { error } = await db.from("alerts").upsert(rows, { onConflict: "symbol,d,kind", ignoreDuplicates: true });
    if (error) throw new Error("news alerts: " + error.message);
  }
  return { scanned: items.length, raised };
}
