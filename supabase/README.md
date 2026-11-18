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
deploy tick daily api`; with CLI 3, `db push --remote`) still works, but then deploy only what is already on `main`, or the next automatic deploy
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

The Supabase CLI is pinned to one version in the workflow (3.2.0). Version 3 changed which database a command
talks to (a local one unless `--remote` is given) and what it prints, and taking "latest" brought that in
unannounced: the first real run, on 18 Nov 2026, stopped for it before changing anything. Two more things CLI 3
needs, both found on the first deploys: `--yes` on every change to the hosted project (database, secrets,
functions), because nobody is there to answer its question; and `--use-api` on `functions deploy`, so that
Supabase bundles each function from its source. Bundled on the runner, `daily` came to 33 MB with the
spreadsheet and PDF libraries inside and its upload was refused (413). By hand with CLI 3 the commands are
`npx supabase db push --remote` and `npx supabase functions deploy api tick daily --use-api`.

The first complete deploy was run 13 of the workflow (18 Nov 2026, 15:24 UTC): the four migrations of that day,
the notification key, the email sender, and `api`, `tick` and `daily`.

A scoped access token needs, by the CLI's own help for these commands: `project_admin_read` (link),
`projects_read` and `database_pooling_config_read` (the database commands; the changes themselves go in with the
database password), `edge_functions_read` and `edge_functions_write`, `edge_functions_secrets_read` and
`edge_functions_secrets_write`. A run that lacks one stops and names it.

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

## Accounts by email (added 2026-11-18)

A new account no longer waits for the manager. The person gives an email address; the Monitor sends it an email with
a **Verify my email** button; the button opens the Monitor with the address verified, where a password of their own
finishes the account and signs them in. The same email shows a 6-digit code: on a phone the button opens the
browser, so someone using the Home Screen app types the code there instead. The manager still sees every address in
Account › Accounts and can deactivate one (asked first) or reactivate it.

**Who sees whose address.** An account sees its own; the manager sees all (`admin_users`, refused to everyone else);
nobody else sees any. That includes the sign-up form: it answers the same way whether or not an address has an
account, and an address that already has one (or was deactivated) is told so only by an email to that address.
Sign-in answers "Wrong email or password" for both a wrong password and an unknown address. Each email goes to one
recipient. With the Gmail way below, recipients see the sending Gmail address.

This needs an **email sender**, set as function secrets. Until one is set, nothing changes: sign-up stays "email +
password, then the manager approves", and the Accounts panel says so.

Two ways to send; set one of them.

| Way | Secrets | What you need |
|---|---|---|
| A mailbox's own server (Gmail) | `SMTP_USER` = the address, `SMTP_PASS` = an app password. Optional: `MAIL_FROM`, `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (default `465`) | No domain. The Google account needs 2-Step Verification; then Google Account › Security › 2-Step Verification › App passwords gives a 16-character password ([Google's help](https://support.google.com/accounts/answer/185833)). The emails come from that Gmail address, so everyone who signs up sees it. Google's limit for a personal account is 500 messages a day. Google withdraws app passwords when the account's password is changed. |
| Resend | `RESEND_API_KEY`, `MAIL_FROM` = `Orrery Monitor <name@your-domain>` | A domain of your own, verified at resend.com by adding the DNS records it shows (without one Resend only delivers to your own address). Free plan at the time of writing: 3,000 emails a month, 100 a day. Recipients see the address on your domain, not a personal one. |

Only port 465 (encrypted from the first byte) is spoken: Supabase does not let a function reach ports 25 and 587
([Edge Functions limits](https://supabase.com/docs/guides/functions/limits)).

Where to put them: as repository secrets with the same names (Settings › Secrets and variables › Actions), then run
`deploy-server` by hand with **deploy**; its "Email sender" step stores on the server whichever of them are set and
removes nothing. Or set them directly: Supabase dashboard › Edge Functions › Secrets (they apply at once).

Then check it: sign in as the manager, Account › Accounts › **SEND A TEST EMAIL**. It sends one message to the
manager's address and, if the mail server refuses, shows the server's own words (a wrong app password reads
"535 … Username and Password not accepted").

The button opens `https://shotayng1123.github.io/orrery-market-monitor/` (set the secret `MONITOR_SITE_URL` if the
site moves); the address is never taken from a request. The code and the address travel after the `#` of that link,
the part a browser does not send to the server the page comes from, and the page takes them out of the address bar.

The rules, in `supabase/functions/_shared/signup.ts` and enforced in the database (`email_code_issue`,
`email_code_check` in `migrations/20261118000003_signup_by_email.sql`), one request at a time:

- the button and the code are valid for 15 minutes; 5 wrong tries void them; only the newest email for an address
  counts;
- pressing the button only checks the code (so a mail scanner that opens links first spoils nothing); it is used up
  when the account is created;
- to one address: one email a minute, 5 an hour; from one network address: 10 different addresses an hour; in
  total: 200 addresses a day;
- the code is stored as an HMAC (keyed with `MONITOR_TOKEN_SECRET`), never as itself.

Deactivating an account signs it out everywhere within a minute (the functions cache an account for 60 s), removes
its phone-notification subscriptions and blocks signing in and signing up again; the watchlist stays. After a
reactivation the person signs in again and turns notifications back on. A forgotten
password is still reset by the manager (RESET PW).

Checked without the live project: `sim/logic.test.ts` section K (the code, the button's link, the emails, the
conversation with a mail server), `sim/sql/signup.test.cjs` (the database functions, on an in-memory Postgres) and
`web/e2e/accounts.cjs` (the screens).

## The stock page and its sources (added 2026-11-18)

`api?action=stock&symbol=…` answers the whole page in one go (`_shared/stock.ts`): the quote, the change over each
horizon against the benchmark(s), the figures worked out from the price history, share counts, short interest,
valuation, the big moves with their reasons, and the statements. The arithmetic is in `_shared/stockstats.ts`,
`_shared/bigmoves.ts` and `_shared/fin.ts`; what each source sends is read in `_shared/finsrc.ts`. All four are
checked in `sim/logic.test.ts` (sections L to P).

- **Statements are stored**, because they change four times a year and the sources are rationed. The finished
  statements sit in `asset_cache` under `fin2:SYMBOL`: a week for a name read from Yahoo, a day when Yahoo had to
  stand in for EDINET DB. The next results date known from the quote is stored with them; from 18 hours after
  that date until six days after it they are asked for again daily, so new results do not wait for the weekly
  refresh. The hover card reads the same store and otherwise Yahoo; it never asks EDINET DB.
- **What is read from EDINET DB** (`edinetFin` in `_shared/finsrc.ts`, checked in `sim/logic.test.ts` section Q with
  made-up answers in the provider's shape; the shapes were taken from its own answers on 19 Nov 2026 JST):
  - by year, from the 有価証券報告書: the lines of the three statements in yen. EPS, DPS and book value per share
    are the provider's split-adjusted figures; a year with a later split and no adjusted figure is left empty.
  - debt without leases: loans and bonds under Japanese accounting, the interest-bearing debt lines under IFRS.
    The sum is checked against the provider's own total (enterprise value less market value plus cash); a year
    whose detail does not add up to it shows no debt figure, and a company whose total is nil shows nil.
  - capex: the cash paid for property, plant, equipment and intangibles in the cash flow statement, not the
    capex figure of the report's facilities section.
  - guidance: the newest 決算短信's forecast (the year in progress; next year's after a full-year release), with
    later revision notices where the provider has read them. A line a notice turned into a range or withdrew is
    empty. A per-share forecast made before a pending split uses the provider's adjusted figure, and is not
    shown when the provider could not tell which share count it is on.
  - a fiscal year the 決算短信 has reported and the 有価証券報告書 has not: shown from the release and marked so.
  - quarters: the provider's single-quarter figures as they are. It derives the later quarters by difference
    and leaves empty what it could not check against the filings; nothing is derived again here.
  - the company is found by its exact securities code: the provider's search also returns codes that merely
    contain the one asked for.
- **EDINET DB allows a hundred requests a day** on its free plan (the day is Japan's; `EDINETDB_DAILY_BUDGET`,
  default 90, is this server's share). A Tokyo name takes one request to find its EDINET code (kept a year) and
  three for its statements, each stored on its own (`_shared/edinet.ts`): the 決算短信 for a week, and daily once
  the next one is due (70 days after the last); the annual figures and the single quarters for thirty days, and
  every second day while a full-year 決算短信 is out whose 有価証券報告書 is not in yet. When the allowance is
  used up, or no `EDINETDB_API_KEY` is set, Yahoo stands in for that name until the next day and the page says so.
  The key is a server secret: add `EDINETDB_API_KEY` to the repository's secrets and the next server deploy
  stores it (or once by hand, `npx supabase secrets set EDINETDB_API_KEY='<key>'`). An EDINET DB connector used
  with the same account draws on the same hundred requests.
- **A page from before this action** (`asset`) is still answered, for the hover card and for a web build older
  than the server. The web falls back the other way too: a server that answers `unknown action` to `stock` gets
  the earlier page.
- **Benchmarks**: Tokyo names are set against the Nikkei 225 and TOPIX, others against their home index
  (`benchmarksFor` in `_shared/assets.ts`). TOPIX is read from the `1306.T` fund.

## Big moves and why (added 2026-11-18)

For a company of 1tn yen and above, or 10bn US dollars and above, the stock page marks on the chart: a day that
closed 5% or more from the previous close; five sessions that moved the close 10% or more; and, within 21
sessions, a fall of 20% or more from a high to a later low or a rise of 20% or more from a low to a later high.
Overlapping weeks (or months) in the same direction give one mark, the largest. A session still in progress is
not counted. The rules are `_shared/bigmoves.ts`.

The reason for each move is found outside the database:

1. The page puts a move of the last twelve months that has no reason yet on the queue (table `move_causes`,
   status `queued`; at most 15 per opening of a page) and calls `move_causes_kick()`, which asks GitHub for the
   job at most once in ten minutes. That request uses the GitHub token stored for the Morning Note
   (`monitor_set_github_token`); without it the job runs on its daily schedule (09:40 UTC) or by hand.
2. `jobs/move_causes.ts` (workflow `move-causes`) takes the queue, newest move first, and asks the model with web
   search for the reported reason, giving it the stock, the dates, the closes and the benchmark's change over
   the same dates.
3. A reason is stored only when the reply names reports that the search itself returned (`readCause` in
   `_shared/movecause.ts` drops any other address). Otherwise the move is stored as `not_found` and the page says
   "No reliable report of the reason was found". A look-up that fails is tried three times.

It costs model tokens and searches. Every run prints the cost of each look-up and the total. The knobs:
repository **variables** `MOVE_CAUSE_MODEL` (default `claude-opus-5-5`) and `MOVE_CAUSE_EFFORT` (default
`medium`), and the run's `max` input (default 60 moves a run). It needs the `ANTHROPIC_API_KEY`, `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` secrets the Morning Note already uses. To see what is waiting or stored:
`select status, count(*) from move_causes group by 1;`

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
- TOPIX has no Yahoo ticker. `1306.T` is the live proxy (also for the stock page's "against TOPIX"); the official JPX daily index close is a planned addition.
- `fn_table_anchors()` computes the 1D/1W/1M/3M/12M/36M anchors in SQL; the table is rebuilt once per minute, not per visitor.

## Added 2026-11-07 evening

- Chart frequencies: `tick` now stores one-minute bars (`bars_intraday`, three-day retention) from per-symbol chart calls (a few in parallel, spark as fallback); `daily?job=hourly` keeps `bars_hourly` (three months fetched, sixty days kept) for the 1W and 1M charts; 3M and longer use daily closes. `api?action=series` returns extra history behind each window so the page can pan.
- Alerts: `alerts` table and `api?action=alerts`. Indices beyond ±3% are recorded by the tick every minute. Single stocks beyond ±7% at any point of the session (`_shared/moves.ts`; the figure is the session's largest move): every fifth minute the tick reads one-minute bars (spark, one request per 20 names) for Nikkei 225 and S&P 500 members and every stock on a watchlist, while the market is open and until the delayed closing prices are in; the flow job (`daily?job=flow&idx=…`) raises the same alert from the day range of its quotes for the other companies of TOPIX, Nasdaq-100, KOSPI 200, Hang Seng and SSE 180 worth USD 5bn or more. One row per symbol, session date and kind, written only when the figure changes. `daily?job=constituents` refreshes the S&P 500 (Wikipedia) and Nikkei 225 (Nikkei CSV) lists into `constituents`.
- Closing levels are held until the next session's first print: the quote is used only while its exchange-local date is newer than the last booked close.
