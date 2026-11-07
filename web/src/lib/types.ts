// Wire types of the Monitor API (Supabase Edge Function `api`). Kept in one place so the server and the
// views agree; the server mirrors these shapes.
import type { MarketId } from "./sessions";

export type AssetClass = "Equities" | "Volatility" | "Futures" | "Currency" | "Fixed income" | "Commodities";
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
  lastAt: string | null;   // ISO, source time of the last print
  live: boolean;           // the market is open and the print is fresh
  closes: Partial<Record<PeriodKey, number | null>>;   // absolute close at each period's start
  closeDates: Partial<Record<PeriodKey, string | null>>;
  pct: Partial<Record<PeriodKey, number | null>>;      // % change from that close to `last`
}

export interface SeriesPoint { t: number; v: number }   // epoch seconds, value
export interface Series { symbol: string; res: "1m" | "5m" | "1h" | "1d"; points: SeriesPoint[]; asOf: string | null }

/** An excessive move: a single stock beyond ±7% or an index beyond ±3% against the previous close. */
export interface Alert { id: number; at: string; d: string; symbol: string; name: string; kind: "stock" | "index"; pct: number; price: number | null; market: string; msg: string }

export interface CurvePoint { tenor: string; years: number; yield: number }
export interface Curve { country: "US" | "JP"; date: string; points: CurvePoint[]; source: string }

export interface Health {
  ok: boolean;
  at: string;
  tick: { lastAt: string | null; ageMin: number | null; ok: boolean; note: string | null };
  daily: { lastAt: string | null; ok: boolean; note: string | null };
  sources: Array<{ name: string; lastOk: string | null; lastError: string | null }>;
  holidays: Partial<Record<MarketId, string[]>>;
  holidaysVerified: boolean;
}

export interface NewsItem { id: number; publishedAt: string; source: string; title: string; url: string; category: string; tickers: string[] }
export interface EconEvent { id: number; at: string; country: string; title: string; impact: "High" | "Medium" | "Low" | "Holiday"; forecast: string | null; previous: string | null; actual: string | null }
export interface Note { id: number; d: string; title: string; generatedAt: string; sections: Array<{ heading: string; md: string }>; sources: Array<{ n: number; title: string; url: string }>; model: string }
export interface Report { id: number; kind: string; title: string; publishedAt: string; summary: string; md: string }
