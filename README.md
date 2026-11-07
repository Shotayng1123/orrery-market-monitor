# Orrery Monitor

Real-time market numbers, flow and trending data for professional investors. Information only: no trading, no portfolios. It shares the look and the logo of Orrery Analytics and nothing else: its own backend, its own data sources, its own code.

- Live site: GitHub Pages from this repository (`web/` built by `.github/workflows/deploy-web.yml`).
- Backend: a dedicated Supabase project (`supabase/`): Postgres, pg_cron, Edge Functions `tick` (1-minute quotes), `daily` (history, curves, calendar, news) and `api` (everything the page reads, behind the sign-in).
- Batch jobs: `jobs/` run by GitHub Actions (history backfill, constituents, the Morning Notes written with the Claude API).

## Rules that shape the code

- Every number has a source and an as-of time; delayed feeds carry a badge; estimates are marked (E).
- Nothing is read from Orrery Analytics.
- Default time zone: Singapore. The page refreshes every 60 s while any tracked market is open.
- Sigma bands: rolling mean ± 1σ over 21 / 252 / 756 trading days (1M / 12M / 36M), ±2σ on toggle.

## Layout

```
web/        Vite + React + TypeScript. src/styles/tokens.css is the design system (ported from Analytics v9.30).
            src/lib: time (SGT), sessions (exchange hours), api (bearer client), stats (rolling σ), prefs.
            src/views: Market, News, Research, Equities (index toggle), RatesFx (Forex / Curve / TBD).
supabase/   migrations/ and functions/ (tick, daily, api), cron.sql.
jobs/       TypeScript scripts for GitHub Actions.
```

## Local development

```bash
cd web
npm ci
VITE_API_URL=https://<project-ref>.supabase.co/functions/v1/api npm run dev
# layout preview without a backend (dev server only):
VITE_DEV_BYPASS=1 npm run dev
npm run build          # typecheck + production build into web/dist
```

## Deploy

1. Repository Settings › Pages › Source: **GitHub Actions**.
2. Repository variable `VITE_API_URL` = the Monitor API URL.
3. Push to `main` (or run the `deploy-web` workflow). The site is served at `https://shotayng1123.github.io/orrery-market-monitor/`.

Backend deployment steps are in `supabase/README.md`.

## Data sources (v1)

| Data | Source |
|---|---|
| Quotes, intraday bars, daily history | Yahoo Finance chart and spark endpoints (unofficial; delays declared per exchange) |
| US yield curve | US Treasury daily par yield curve CSV |
| JGB yield curve | Japan MOF `jgbcme.csv` |
| Policy rates and macro series | FRED (`fredgraph.csv`) and central-bank pages |
| Economic calendar | ForexFactory weekly JSON (forecast and previous) |
| News | RSS: WSJ Markets, CNBC, Nikkei Asia, Yahoo Finance per ticker |
| Constituents | Wikipedia lists (S&P 500, Nikkei 225), checked monthly |

TOPIX has no Yahoo ticker: the `1306.T` ETF stands in for the live level (badge PROXY) and the official JPX close is used for daily figures.

## Morning Notes

`jobs/morning_note.ts` runs each weekday at 07:00 SGT (`.github/workflows/morning-note.yml`, cron 23:00 UTC Sun–Thu; also by hand with a date and a dry-run option). It first builds a numbers pack from the Monitor's own data (market table, daily history for technicals, today's calendar, recent headlines) plus Yahoo daily closes for the S&P 500 and Nikkei 225 constituents (lists: Wikipedia and Nikkei's constituent CSV, cached in `jobs/data/`) and the US sector ETFs. Claude (`claude-opus-5-5`, web search) drafts the note strictly from that pack, citing every external claim; a second call structures it; a check refuses any number that is not in the draft. The note, its sources and the pack are stored in `notes` and shown on the NEWS tab; the review tables on the right come from the same pack. GitHub secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
