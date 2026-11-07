# Orrery Monitor backend (Supabase)

A dedicated Supabase project, separate from Orrery Analytics. Postgres holds the instrument master, daily and
intraday prices, yield curves, calendar, news, notes, reports and sign-ins; pg_cron drives three Edge Functions.

| Function | Trigger | Does |
|---|---|---|
| `tick` | every minute (pg_cron) | Yahoo spark quotes for open markets, 5-minute bars, rebuilds the market-table snapshot |
| `daily` | pg_cron, `?job=` | `history`, `curves` (US/JP), `calendar`, `news`, `fred`, `prune` |
| `api` | the page | `login`, `health`, `table`, `series`, `curve`, `calendar`, `news`, `note`, `reports`, `report`, `instruments`; `report_put` for the research desk |

## One-time setup (Shota)

1. Create the project at supabase.com (region: Singapore). Note the project ref, the anon key and the service-role key. Pro plan recommended for egress.
2. On this PC, in the repo root:
   ```bash
   npx supabase login            # opens the browser
   npx supabase link --project-ref <ref>
   npx supabase db push          # applies supabase/migrations (schema, seeds, fn_table_anchors)
   ```
3. Function secrets (never in git):
   ```bash
   npx supabase secrets set MONITOR_PASSWORD='<the shared password>' MONITOR_TOKEN_SECRET='<32+ random chars>' CRON_SECRET='<32+ random chars>' REPORT_SECRET='<32+ random chars>'
   npx supabase functions deploy tick daily api
   ```
4. In the SQL editor, store the two values pg_cron needs, then run `supabase/cron.sql`:
   ```sql
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_url');
   ```
5. History backfill (10 years of daily closes, both curves), from the repo root:
   ```bash
   cd jobs && npm ci
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role key> npm run backfill
   ```
6. First runs by hand (replace the secret):
   ```bash
   curl -H 'x-cron-secret: <CRON_SECRET>' 'https://<ref>.supabase.co/functions/v1/daily?job=history'
   curl -H 'x-cron-secret: <CRON_SECRET>' 'https://<ref>.supabase.co/functions/v1/daily?job=calendar'
   curl -H 'x-cron-secret: <CRON_SECRET>' 'https://<ref>.supabase.co/functions/v1/daily?job=news'
   curl -H 'x-cron-secret: <CRON_SECRET>' 'https://<ref>.supabase.co/functions/v1/daily?job=fred'
   curl -H 'x-cron-secret: <CRON_SECRET>' 'https://<ref>.supabase.co/functions/v1/tick'
   ```
7. GitHub: repository variable `VITE_API_URL = https://<ref>.supabase.co/functions/v1/api`; Pages source = GitHub Actions; secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` for the jobs.

## Verifying

- `api?action=health` (with a sign-in token) → `tick.ageMin` ≤ 3 during a session, `daily.ok` true, `sources` without errors.
- Spot-check the table against the exchange: Nikkei 225 close on JPX/Nikkei, S&P 500 on S&P DJI, USD/JPY on a bank page, UST 10Y on treasury.gov for the same date.
- Holidays: `sessions_cal` rows are `verified = false` until checked against each exchange's published calendar; the DATA chip says so.

## Notes

- Yahoo's chart and spark endpoints are unofficial. The code keeps nulls as gaps, never fills them, and rotates hosts on failure. If Yahoo breaks, `source_status.yahoo` records the error and the page shows stale stamps rather than wrong numbers.
- TOPIX has no Yahoo ticker. `1306.T` is the live proxy; the official JPX daily index close is a planned addition.
- `fn_table_anchors()` computes the 1D/1W/1M/3M/12M/36M anchors in SQL; the table is rebuilt once per minute, not per visitor.

## Added 2026-11-07 evening

- Chart frequencies: `tick` now stores one-minute bars (`bars_intraday`, three-day retention) from per-symbol chart calls (a few in parallel, spark as fallback); `daily?job=hourly` keeps `bars_hourly` (three months fetched, sixty days kept) for the 1W and 1M charts; 3M and longer use daily closes. `api?action=series` returns extra history behind each window so the page can pan.
- Alerts: `alerts` table and `api?action=alerts`. The tick records indices beyond ±3% every minute and, every fifth minute, constituents beyond ±7% intraday (spark, one request per 20 names) for the indices whose market is open. `daily?job=constituents` refreshes the S&P 500 (Wikipedia) and Nikkei 225 (Nikkei CSV) lists into `constituents`.
- Closing levels are held until the next session's first print: the quote is used only while its exchange-local date is newer than the last booked close.
