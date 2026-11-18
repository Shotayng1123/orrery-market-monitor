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
4. In the SQL editor, install the schedules (this also stores the two values pg_cron needs in Vault; `supabase/cron.sql` holds the same line):
   ```sql
   select monitor_install_cron('<CRON_SECRET>', 'https://<ref>.supabase.co/functions/v1');
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
   curl -H 'x-cron-secret: <CRON_SECRET>' 'https://<ref>.supabase.co/functions/v1/tick'
   ```
   The Fed target range is not a `daily` job (the edge runtime cannot reach FRED): run the `fed-target` workflow in GitHub Actions.
7. GitHub: repository variable `VITE_API_URL = https://<ref>.supabase.co/functions/v1/api`; Pages source = GitHub Actions; secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` for the jobs.

## Deploying the server (since 2026-11-18: from GitHub)

The database changes and the three functions are deployed by the `deploy-server` workflow, the way `deploy-web` publishes
the site: a push to `main` that touches `supabase/` deploys it. Nobody needs the Supabase CLI or a key on their own
machine, so a change can come from any session. Deploying by hand (`npx supabase db push`, `npx supabase functions
deploy tick daily api`) still works, but then deploy only what is already on `main`, or the next automatic deploy
will put `main`'s code back.

Set up once, in the repository's Settings › Secrets and variables › Actions › Secrets:

| Secret | What it is | Where to get it |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | lets the workflow act on the Supabase project | Supabase dashboard › Account › Access Tokens › Generate new token |
| `SUPABASE_DB_PASSWORD` | the database password, for applying migrations | chosen when the project was created; Project Settings › Database can reset it |
| `NOTE_DISPATCH_TOKEN` (optional) | lets the database start the Morning Note on time | the GitHub token described under "The Morning Note on time" below |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are there already for the jobs. Until the first two exist the
workflow says "Not set up yet" and does nothing.

What a deploy does, in order: the logic checks (`sim/logic.test.ts`; a failure stops it); a list of what is waiting;
a guard; `supabase db push`; the notification key, made on the runner and stored on the server if the server has
none (never shown, never in git); `supabase functions deploy tick daily api`; and, if `NOTE_DISPATCH_TOKEN` is set,
storing it in the database with `monitor_set_github_token`.

The guard: a deploy applies every migration the database has no record of. That is only right when the record is
complete, so the deploy stops unless everything waiting is newer than everything applied. If it stops, run the
workflow by hand with **check** (Actions › deploy-server › Run workflow), which changes nothing and prints the
migrations in the repository beside those the database has recorded, what would be applied, the functions as
deployed and the names of their secrets.

## Push notifications (added 2026-11-18)

Alerts reach phones and browsers as notifications once the server has a signing key. Until then the page says
"Notifications are not set up on the server yet" and nothing is sent.

With the `deploy-server` workflow set up (above) none of these steps is needed: it applies the migration, makes the
key if the server has none, and deploys. By hand:

1. `npx supabase db push` (migration `20261118000001_push.sql`: the `push_subs` table and `alerts.pushed_at`).
2. The key pair, made once and never shown:
   ```bash
   node jobs/tools/gen_vapid.mjs                              # writes jobs/.env.vapid (git-ignored)
   npx supabase secrets set --env-file jobs/.env.vapid
   ```
   Keep the file. A different key ends every device's subscription without telling anyone.
3. `npx supabase functions deploy tick daily api`.

How it works: the tick offers every alert not yet marked (`alerts.pushed_at`) to the devices in `push_subs`, within a
minute of the alert being written, whichever job wrote it. A device set to "My watchlist only" gets alerts on its
account's watchlist names; more than four alerts at once arrive as one notification. A move carries a green (up) or
red (down) round mark in front of its line: a phone draws notification text in its own colour, so that is how the
colour gets there; headline alerts have no mark. Addresses the push service
reports gone are deleted. The encryption and signing are in `functions/_shared/webpush.ts`, checked against the
example of RFC 8291 in `sim/logic.test.ts`. On an iPhone, notifications exist only in the app added to the Home Screen
(iOS 16.4 or later).

## The Morning Note on time (added 2026-11-18)

GitHub starts this repository's scheduled workflows hours late (the note, due 07:00 SGT, finished 09:36 on 17 Nov and
08:30 on 18 Nov). The database's own scheduler is punctual, so it asks GitHub for the note at 22:15 UTC
(pg_cron job `monitor-morning-note`, which calls `monitor_dispatch('morning-note.yml')`). GitHub's own schedule stays
as the fallback. Until a token is stored, `monitor_dispatch` does nothing.

1. `npx supabase db push` (migration `20261118000002_note_on_time.sql`). This also adds one quote pull after the
   Tokyo and Seoul closes, for alerts on closing-auction moves.
2. A GitHub token that may start this repository's workflows. GitHub › Settings › Developer settings › Personal
   access tokens › Fine-grained tokens › Generate new token: *Repository access* = Only select repositories ›
   `orrery-market-monitor`; *Repository permissions* › **Actions: Read and write**. Note its expiry date: when it
   expires the note falls back to GitHub's schedule and arrives late again.
3. Store it: either as the repository secret `NOTE_DISPATCH_TOKEN`, which the next `deploy-server` run hands to the
   database, or in the SQL editor of the Supabase project (it goes nowhere else, and not into git):
   ```sql
   select monitor_set_github_token('<the token>');
   ```
4. Try it at a time of day when today's note is already there, so the run only checks and stops (about half a minute,
   nothing is written and the model is not called):
   ```sql
   select monitor_dispatch('morning-note.yml', '{"if_missing":"true"}'::jsonb);
   select * from monitor_dispatch_status();   -- a few seconds later: 204 = GitHub accepted the request
   ```
   A `morning-note` run then appears in the repository's Actions tab. 401 = the token is wrong or has expired;
   403 or 404 = it may not start workflows of this repository.

## Changing the shared sign-in password

The password exists only as the function secret `MONITOR_PASSWORD`; it is not in git or in the database, and
`npx supabase secrets list` shows a digest, not the value. A forgotten password cannot be read back, only replaced:

```bash
npx supabase secrets set MONITOR_PASSWORD='<new shared password>'
```

Browsers already signed in stay signed in (tokens are signed with `MONITOR_TOKEN_SECRET`, not the password; they last
12 hours, or 30 days with "remember me"). Ten wrong passwords from one IP within ten minutes lock that IP out for up to ten minutes.

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
- Alerts: `alerts` table and `api?action=alerts`. Indices beyond ±3% are recorded by the tick every minute. Single stocks beyond ±7% at any point of the session (`_shared/moves.ts`; the figure is the session's largest move): every fifth minute the tick reads one-minute bars (spark, one request per 20 names) for Nikkei 225 and S&P 500 members and every stock on a watchlist, while the market is open and until the delayed closing prices are in; the flow job (`daily?job=flow&idx=…`) raises the same alert from the day range of its quotes for the other companies of TOPIX, Nasdaq-100, KOSPI 200, Hang Seng and SSE 180 worth USD 5bn or more. One row per symbol, session date and kind, written only when the figure changes. `daily?job=constituents` refreshes the S&P 500 (Wikipedia) and Nikkei 225 (Nikkei CSV) lists into `constituents`.
- Closing levels are held until the next session's first print: the quote is used only while its exchange-local date is newer than the last booked close.
