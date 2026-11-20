// Wire types of the Monitor API (Supabase Edge Function `api`). Kept in one place so the server and the
// views agree; the server mirrors these shapes.
import type { MarketId } from "./sessions";

export type AssetClass = "Equities" | "Volatility" | "Futures" | "Currency" | "Crypto" | "Fixed income" | "Commodities";
export type PeriodKey = "d1" | "w1" | "m1" | "m3" | "m12" | "m36";
export const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "d1", label: "1D" }, { key: "w1", label: "1W" }, { key: "m1", label: "1M" }, { key: "m3", label: "3M" }, { key: "m12", label: "12M" }, { key: "m36", label: "36M" },
];

export interface Instrument {
  symbol: string;          // provider symbol, e.g. ^N225
  name: string;            // display name
  cls: AssetClass;
  market: MarketId;        // session used for OPEN / delay
  currency: string;
  decimals: number;
  proxyFor?: string;       // e.g. "TOPIX" when the symbol is an ETF standing in for the index
  group: "equity" | "rates" | "fx" | "cmdty";
  order: number;
}

export interface TableRow extends Instrument {
  last: number | null;
  lastAt: string | null;   // ISO, source time of the last print; "<date>T00:00:00Z" for a booked close or an official yield (a date, no time of day)
  source?: string | null;  // the instruments table's provider: "yahoo", or "treasury", "mof", "curve" for a yield an official publisher puts out once a day (lib/time.ts rowSource)
  live: boolean;           // the market is open and the print is fresh
  closes: Partial<Record<PeriodKey, number | null>>;   // absolute close at each period's start
  closeDates: Partial<Record<PeriodKey, string | null>>;
  pct: Partial<Record<PeriodKey, number | null>>;      // % change from that close to `last`
  marketTab?: boolean;   // row in the MARKET table (minors live on RATES & CURRENCY only)
  chart?: boolean;       // tile in the chart groups
  z1m?: number | null;   // (last − 21-day mean) / 21-day sd
  pos52?: number | null; // position in the 52-week range, 0–100
  vs200?: number | null; // % above the 200-day average (yield points for rates)
}

export interface SeriesPoint { t: number; v: number; q?: number | null }   // epoch seconds, value; q = volume of the bar, where the feed has it (stocks)
export interface Series { symbol: string; res: "1m" | "5m" | "15m" | "1h" | "1d"; points: SeriesPoint[]; asOf: string | null }

/** An excessive move: a single stock beyond its line (±5% for a large company, ±7% otherwise) or an index beyond ±3%, against the previous close. */
export interface Alert { id: number; at: string; upd?: string; d: string; symbol: string; name: string; kind: "stock" | "index" | "buyback" | "revision" | "mna"; pct: number | null; price: number | null; market: string; msg: string; url?: string | null }

export interface CurvePoint { tenor: string; years: number; yield: number }
export interface Curve { country: string; date: string; points: CurvePoint[]; source: string }

export interface Health {
  ok: boolean;
  at: string;
  tick: { lastAt: string | null; ageMin: number | null; ok: boolean; note: string | null };
  daily: { lastAt: string | null; ok: boolean; note: string | null };
  /** Whether prices are arriving: among the markets open now, the most recent print and how far behind it is
   *  (absent from a server older than 19 Nov 2026). */
  feed?: { expected: boolean; ok: boolean; newest: string | null; symbol: string | null; lateMin: number | null };
  /** Set while prices are written by the second path (the relay on GitHub) because the server's own answers
   *  from the source have stopped: since when, and how far behind the server's own answers are now. */
  relay?: { since: string | null; ownLateMin: number | null } | null;
  sources: Array<{ name: string; lastOk: string | null; lastError: string | null }>;
  holidays: Partial<Record<MarketId, string[]>>;
  holidaysVerified: boolean;
}

export interface NewsItem { id: number; publishedAt: string; source: string; title: string; url: string; category: string; tickers: Array<{ s: string; n: string }> }
export interface EconEvent { id: number; at: string; country: string; currency?: string | null; title: string; impact: "High" | "Medium" | "Low" | "Holiday"; forecast: string | null; previous: string | null; actual: string | null; better?: boolean | null; kind?: string | null; source?: string }
export interface Note { id: number; d: string; title: string; generatedAt: string; sections: Array<{ heading: string; md: string }>; sources: Array<{ n: number; title: string; url: string }>; model: string; kind?: "daily" | "weekly" }
export interface Report { id: number; kind: string; title: string; publishedAt: string; summary: string; md: string; meta?: { author?: string; week?: string; sources?: Array<{ n: number; title: string; url: string }> } | null }
