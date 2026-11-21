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
colour gets there; headline alerts have no mark. Under the line: the alert's kind and its time in Singapore, written
as the page writes times ("Stock move · 18 Nov 10:05 SGT"; "11/18 10:05 SGT" until 20 Nov 2026, a day and month a
reader in Japan or Singapore can read the wrong way round). Addresses the push service
reports gone are deleted. The encryption and signing are in `functions/_shared/webpush.ts`, checked against the
example of RFC 8291 in `sim/logic.test.ts`. On an iPhone, notifications exist only in the app added to the Home Screen
(iOS 16.4 or later).

Since 20 Nov 2026 (I-6; migration `20261120000001_sigma_moves.sql`) a device also chooses which kinds reach it
(`push_subs.kinds`: big moves of stocks and indices, buybacks, guidance and M&A, σ moves) and its σ line
(`push_subs.sigma_line`: 2, 2.5 or 3σ). A device that has not chosen (`kinds` null) receives exactly what it received
before: every kind but the σ moves. A σ move grows through the day, so it is offered again to the devices whose line it
has crossed since it was last offered (`alerts.pushed_sigma`); its notification names its window and source under the
line ("σ move · σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance · 20 Nov 11:10 SGT"). `api?action=push_state`
returns the device's kinds and line, and `push_sub` takes them (a page from before sends neither, and the stored choice
is kept).

## Moves in σ, and a future's rolls (added 2026-11-20; migration `20261120000001_sigma_moves.sql`)

- **The day in σ.** `fn_table_stats` also returns, for every active instrument, the sample standard deviation of its
  daily changes over the 63 sessions ending at its newest booked close (`sd63`) and one session before it (`sd63x`), with
  the changes counted and each window's first and last close: a yield's changes in points of its level, a price's in per
  cent. The market table (`_shared/table.ts`) sets the day's change against the window that does not hold it (a print
  after the last booked close against `sd63`; a day that is itself the last booked close, a closed market or an official
  yield once its day is booked, against `sd63x`) and sends `z1d`, `sd1d`, `zFrom`, `zTo`, `zN` (`zN`, the changes counted,
  also where they are too few for a σ: the page says how many). The rule is written once
  in `_shared/sigma.ts`; `sim/sql/sigma.test.cjs` checks the database's figures against it.
- **The last session** (B-32, 2026-11-21; no migration, no new source). Each row of the table also carries `ls`, the
  instrument's newest completed day: the change between its two newest booked closes (`fn_table_anchors`' `last_d` and
  the close before it) over `sd63x`, the σ of the 63 daily changes that end at the earlier of the two, so the change is
  never in its own yardstick (`lastSession` in `_shared/sigma.ts`). It holds the session's date, both closes, the
  change in % or bp, the σ with its window and count, and on a future's roll day the change within the new contract
  (`fut_rolls.prev_close`); where that close is not known the change is the series' own and there is no σ. A σ is
  given only when the window the database returns ends at the earlier close. The page reads `ls` for MOVERS IN σ's
  LAST SESSION, for the line under a currency's figure in its day's first three hours, and as the sign that the
  server can say which day a figure is of; a page from before ignores it.
- **The mark of a results date** (A-37, 2026-11-21). `earningsOf` in `_shared/yahoo.ts` passes Yahoo's
  `isEarningsDateEstimate` as given: true, false, or none where Yahoo sends none. Until then it wrote false
  ("confirmed") by a rule of its own whenever the date it kept was `earningsTimestamp` and `earningsTimestampStart`
  was another value or absent. A stock's page and a watchlist name outside the indices are read at the request and
  follow at once; an index member's stored mark (`constituent_stats.earnings_est`) is rewritten by that list's next
  quote run (`daily?job=flow`, `mflow` or `stats`: on weekdays, in each market's hours), so a mark stored before the
  deploy can stay until that market's next session.
- **σ alerts** (`alerts.kind` 'sigma', with `sigma` and `note`): the tick scans the table every minute
  (`scanSigmaAlerts`) for every currency, yield, commodity, volatility index, future and coin at 2σ or beyond; one row
  per instrument and session (a currency pair's FX day; a future's CME trade date, so an evening's move from 18:00 New
  York is the next session's), rewritten only when the move grows. `api?action=alerts` and the watchlist's feed list them
  from 2.5σ, each with its σ and its note (WATCHLIST draws the kind and the note under the line); an instrument's own page
  lists all of its own.
- **Futures** (`fut_contracts`, `fut_rolls`; `_shared/futures.ts`). Every minute the tick (and the relay on GitHub,
  with the same code) asks Yahoo's v7 quote, in one request, which named contract each open future's =F series is on
  (`underlyingSymbol`) and that contract's previous close, and records the session's contract (CME's trade date, which
  starts at 18:00 New York the evening before, as Yahoo dates the daily bars). A contract that differs from the one
  recorded for the last session before is a roll on this session, measured from the new contract's own previous close.
  On the session after a roll the series' booked close of the roll day is set against the new contract's own close of
  that day: when it is the old contract's (Yahoo rewrote ZQ=F's close of 19 Nov 2026 so), the roll moves a session later.
  A roll day's 1D is the change within the new contract (the row carries `roll`, and `contract` names the contract); the
  database leaves the change of contract out of the 63-session σ and sets σ vs 1M avg's closes on the new contract's
  level (a roll whose change of contract is not known leaves its day out, and σ vs 1M avg across it is none; the table
  gives none either on the day of a roll after the newest booked close whose change is not known, and an instrument's
  page shows the table's own σ vs 1M avg, none included, never one worked out across the step). A future not
  read in a minute raises no σ alert in it; a quote that has not moved for a week (TIO=F's, in the probe) is not read.
  The migration seeds what the source probe of 20 Nov 2026 read (`yahoo_futures`, run 44737367820): each future's
  contract that day, its five measured rolls of that day, and the ten earlier rolls of its six months, dated but not
  measured. Every reading is labelled Yahoo Finance (unofficial), as the owner decided for Yahoo's named contracts.
  Yahoo keeps no expired contract, so a roll the Monitor did not record cannot be measured later. One quote request a
  minute, at most two more when the crumb is renewed; a failed request's note names no address and no crumb.

## The Morning Note on time (added 2026-11-18)

GitHub starts this repository's scheduled workflows hours late (the note, due 07:00 SGT, finished 09:36 on 17 Nov and
08:30 on 18 Nov). The database's own scheduler is punctual, so it asks GitHub for the note at 22:15 UTC
(pg_cron job `monitor-morning-note`, which calls `monitor_dispatch('morning-note.yml')`). GitHub's own schedule stays
as the fallback. Until a token is stored, `monitor_dispatch` does nothing.

The same token serves three things: the note at 07:00 SGT, the look-up of a big move's reason as soon as a page
queues it ("Big moves and why"), and, since 19 Nov, the start of the second path for prices within a minute of the
server's own answers stopping ("When the price feed stops"). Without it all three wait for GitHub's schedule.

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

### The welcome email (added 2026-11-19)

Every account gets one welcome email (`supabase/functions/_shared/welcome.ts`), by itself: the idea behind the
name first, then what the account opens (the six tabs, a company's own page, alerts, notifications on a phone,
the watchlist) and a first five minutes. It goes out at the first sign-in that succeeds while the account has
none: for a new account that is the moment its password is set (`signupFinish`); for an account from before the
email existed, one approved by hand, or one whose first sending failed, it is the next sign-in (`login`). It is
sent by the same sender as the verification email and never stands in the account's way: if it cannot be sent,
or the mail server takes longer than eight seconds, that is logged, the person is signed in all the same, and
the next sign-in tries again, three times in all (`accounts.welcome_tries`, migration `20261119000007`).
`accounts.welcomed_at` (migration `20261119000002`) records the sending; it is set before the email is sent and
taken back if the sending fails, so two sign-ins at the same moment cannot both send it. Actions › live-check
with `only` = `counts` says how many accounts have had it.

- To read it as a new reader does: Account › Accounts › **SEND IT TO ME** sends it to the manager's own address.
- Its two pictures (the Monitor's mark and a drawing of an orrery) are files of the site,
  `web/public/mail/mark.png` and `orrery.png`, fetched by the reader's mail program from `MONITOR_SITE_URL`;
  `web/tools/mail-pictures.cjs` draws them. With pictures switched off the email still reads whole.
- With no email sender set up, nobody gets one; once a sender is set, each account gets it at its next sign-in.
- Checked in `sim/logic.test.ts` (its words, its links, the rules an email must keep) and
  `web/e2e/welcome-mail.cjs` (drawn at a desktop mail program's width and at a phone's).

## The stock page and its sources (added 2026-11-18)

`api?action=stock&symbol=…` answers the whole page in one go (`_shared/stock.ts`): the quote, the change over each
horizon against the benchmark(s), the figures worked out from the price history, share counts, short interest,
valuation, the big moves with their reasons, the statements, and (since 20 Nov 2026) `feed`, the page's NEWS: the
Monitor's own headlines whose `tickers` name the stock (at most 60) and its own alerts on it (at most 40), over the
last 90 days, read from `news_items` and `alerts` alone, so no source is asked. A page from before ignores `feed`;
the page shows no NEWS panel without it. The arithmetic is in `_shared/stockstats.ts`,
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
  - the document behind each column (since 20 Nov 2026), only as the provider gives its address and only an http(s)
    one, never made up: a year's `edinetFilingUrl` (its `docID` beside it, and the filing date where the answer has
    `submitDateTime`); the guidance column's `pdfUrl` from the 決算短信 its figures were read from; a year known only
    from its 決算短信, that row's `pdfUrl`; a quarter, the `pdfUrl` of a stored 決算短信 row with the same fiscal year
    end and quarter (consolidated rows first, the newest that carries one). Only some rows carry `pdfUrl`: on 20 Nov
    2026 Toyota's newest (the second quarter of FY3/27, 5 Nov 2026) had none, so that quarter and the guidance column
    have no document link. The rows are those already stored: no request is added.
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

## An instrument's page (added 2026-11-20)

`api?action=stock&symbol=…` answers a currency, a yield, a commodity, a future or an index with an instrument's page
(`pageOrQuote` and `instrumentPage` in `_shared/pagefeed.ts`, called by `stockPage` in `_shared/stock.ts`): a symbol of
the `instruments` table always, and a symbol Yahoo quotes as an INDEX, CURRENCY, FUTURE or CRYPTOCURRENCY. A share, an
ETF or a fund keeps a stock's page. The arithmetic is in `_shared/instrstats.ts` and the calendar's and headlines'
rules in `_shared/instrfeed.ts`, both pure and checked in `sim/logic.test.ts` (section U). The reads (the instruments
row, the market table's row, the stored closes, the calendar, the headlines and alerts, and a stock's NEWS, `feedFor`)
take the database client as a parameter (since 2026-11-20): `sim/logic.test.ts` section V runs them against a stand-in
that records each query, `sim/sql/words.test.cjs` runs the headline pattern on PGlite, and Actions › live-check with
`only` = `stock` runs them against the live tables (below).

- **What it reads.** A Monitor instrument: its row of the market table (the `snapshots` row MARKETS reads, so the page's
  last print, its changes over 1D to 36M, σ vs 1M avg, the 52W position and vs 200D are MARKETS' own) and five years of
  its stored daily closes (`prices_daily`), from which realised volatility over 21, 63 and 252 sessions, its percentile
  among the daily readings of the last 36 months, the 52-week high and low with their dates and the largest rise and fall
  of 12 months are worked out. A yield read from an official curve (`provider` treasury, mof or curve: UST2Y, UST3M,
  JGB2Y/10Y/30Y, DE2Y/10Y, GB10Y, EA10Y, CA10Y) asks no quote: no session figures, the publisher named, its as-of the day
  it was published for. Any other Monitor instrument asks one Yahoo quote for the session's open, high and low (a failed
  quote leaves them as dashes). A name found by search: its Yahoo quote and the same ten years of daily bars a stock's
  page reads, with the market table's rules for the anchors and the statistics (today's bar, still moving, left out).
- **Units.** A yield's figures are sent in points of its level (the page writes bp), a price's in per cent; `units` says
  which. Nothing for a yield is a per cent of its level.
- **Events** (`instrument.events`): the `econ_events` rows of its currencies from five days back to eight ahead (a pair's
  two, the dollar index's dollar, otherwise the currency it is quoted in; CNH is read as CNY).
- **News** (`feed`, as on a stock's page, over 30 days): the `news_items` whose title holds one of the instrument's words
  as a whole word, any case (`instrument.matched`, which the page shows): asked of the database as one pattern
  (PostgREST's `imatch` with PostgreSQL's word edges `[[:<:]]` and `[[:>:]]`) and checked again in the function; and the
  `alerts` on the symbol.
- **A Monitor future** (since 2026-11-20, B-27): its record of contracts (`fut_contracts`, `fut_rolls`) is read too
  (`futuresOf`), and the answer adds `instrument.futures`: the named contract the last price is from, its month and
  expiry, when it was read, from when the record runs, and every roll with its change of contract (null where not
  measured). Realised volatility, its percentile and the largest rise and fall are worked out with each change of
  contract taken out (`_shared/futures.ts` rollSegments: the closes before a measured roll set on the new contract's
  level, the series cut at one not measured), and `instrument.rollsOut` counts them. The `alerts` it lists include its σ
  moves from 2σ, each with its σ and its note (window and source).
- **Asked of no source but the ones above.** EDINET DB is never asked for an instrument, no statements are read and no
  big-move look-up is queued (those cost money).
- **A page from before 20 Nov 2026** shows every name as a stock. The answer keeps every field a stock's answer has
  (`legacyStockFields`: the changes, the range, the volatility and the largest fall worked out as for a stock from the
  same closes; no shares, statements, short interest or big moves) and adds `instrument`, which that page ignores. It
  draws an instrument as it did before; JGB 10Y and the other official yields, which gave "no quote for …", now draw
  too. A newer page given an older server's answer (no `instrument`) shows the stock's page, as before.

## Big moves and why (added 2026-11-18)

For a company of 1tn yen and above, or 10bn US dollars and above, the stock page marks on the chart (the rule
since 19 Nov 2026, `MOVE_RULE = "swings"` in `_shared/bigmoves.ts`):

- a day that closed 10% or more from the previous close;
- a **bottom**: the lowest close of a fall, marked once the close has since risen 15% from it;
- a **new peak**: the highest close of a rise, marked once the close has since fallen 15% from it, and only if
  it was the highest close of the twelve months before it;
- the **smaller peaks and bottoms**: the same with turns of 10%, and with them a large peak that was not a
  twelve-month high.

Peaks and bottoms are the turning points of the closes when only moves of that size count (`turningPoints`), so a
point, once marked, does not move; the stretch still running has none yet. A smaller point becomes a large one on
the same day when the turn after it grows to 15%, and keeps its reason (`siblingKind`). A peak is red and a bottom
green, whatever the move into it: the colour is the turn the stock took there, which is what the reason tells (a
day keeps the colour of its move); the smaller ones are smaller circles and smaller dots. A session still in
progress is not counted. The numbers are `SWING_D1`, `SWING_PCT`, `SWING_PCT_2` and `SWING_HIGH_DAYS`; the page is
told them with the rows.

How the rule came about. The first rule (18 Nov) marked a day of 5%, five sessions of 10% and a swing of 20%
within a month; one volatile company had 54 such marks in twelve months, each a look-up of about USD 0.22. The
second rule was tried on Nvidia on 19 Nov: its large level gives 4 marks in twelve months, and smaller turns of
12% add 2, of 10% add 6, of 8% add 10, of 7% add 12, of 6% add 18; 10% was taken. Its ten reasons cost USD 2.39.
It became the rule for every large company the same day. The first rule is still in the file (`"classic"`).
Migration `20261119000005` took the first rule's waiting moves off the queue; answers already stored were kept.

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
   "No reliable report of the reason was found". A look-up that fails is tried three times; one whose searches
   returned no page at all counts as failed, not as "not found".

The model asks each search itself and reads its results (the basic search tool, `ask` in `jobs/lib/llm.ts`).
With the newer tool, which lets the model run its searches from a program of its own, the first real run
(18 Nov 2026) stored 12 of 15 moves as `not_found`: the program failed after its searches had run, the model
had seen none of the 36 pages returned, and it answered that there was no report. Looked up again with direct
searches, 11 of those 12 moves were found, with dated reports.

It costs model tokens and searches. Every run prints, for each look-up, its cost, the number of pages its
searches returned, any search that failed and, when no reason is stored, which way that came about; and the
total. Measured on 18 Nov 2026 with the defaults below, on 27 look-ups (two companies): USD 6.01 in all, USD 0.22
a look-up on average; 21 found, 6 not found. The cost follows the number of searches a look-up needs, about
USD 0.09 each, because the model reads every result: one search 0.09 to 0.10 (10 look-ups), two 0.18 to 0.20 (6), three
0.24 to 0.31 (4), four 0.37 to 0.43 (7). The 16 look-ups that needed one or two searches all found a reason; of
the 11 that needed three or four, 5 did. By company: USD 1.99 for 12 moves and USD 4.02 for
15 (a page queues at most 15 each time it is opened); a run of 30, the default, is about USD 7. (The earlier figure in this file,
USD 0.08 a look-up, was measured with the newer search tool, which is cheaper and gave the wrong answers above.)
The knobs: repository **variables** `MOVE_CAUSE_MODEL` (default `claude-opus-5-5`), `MOVE_CAUSE_EFFORT` (default
`medium`) and `MOVE_CAUSE_SEARCHES` (searches allowed a look-up, default 4; 2 caps a look-up at about USD 0.20,
and would have left 5 of the 21 reasons above unfound), and the run's inputs: `max` (default 30 moves a run),
`dry` (ask and print, store nothing), `again` (also look again at moves stored as `not_found`, up to three tries
in all) and `trace` (print each look-up's searches, the pages returned and the reply). It needs the `ANTHROPIC_API_KEY`, `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` secrets the Morning Note already uses. To see what is waiting or stored:
`select status, count(*) from move_causes group by 1;`

For a peak or a bottom the question put to the model is what ended the rise or the fall there, with the days to
search (two before to five after). The job looks up only the marks of the rule in force, for any stock. With a
symbol it first puts that stock's marks on the queue itself (`--seed`, an S&P 500 member), as its page would, so
the reasons can be there before the page is opened: Actions › move-causes › Run workflow with `symbol`.

## Changing the shared sign-in password

The password exists only as the function secret `MONITOR_PASSWORD`; it is not in git or in the database, and
`npx supabase secrets list` shows a digest, not the value. A forgotten password cannot be read back, only replaced:

```bash
npx supabase secrets set MONITOR_PASSWORD='<new shared password>'
```

Browsers already signed in stay signed in (tokens are signed with `MONITOR_TOKEN_SECRET`, not the password; they last
12 hours, or 30 days with "remember me"). Ten wrong passwords from one IP within ten minutes lock that IP out for up to ten minutes.

## Verifying

- **Actions › live-check › Run workflow** (`jobs/live_check.ts`, added 2026-11-19): a read-only report on the live
  database, with no laptop and no sign-in. It prints when each job last ran and what failed, sources that are
  failing, when the market table's own quotes last printed against when they were pulled, each EQUITIES list's
  booked closes and today's quotes, the alerts of the last 48 hours, the reasons for big moves and their cost,
  and the EDINET DB allowance used. Market data and counts only: no email address, no watchlist.
  With `only` = `stock` (added 2026-11-20; deploy-server runs it after each deploy, read-only, a failure a warning) it runs the server's own reads for an
  instrument's page and a stock's NEWS (`_shared/pagefeed.ts`) against the live tables, for USDJPY=X, ^TNX, JGB10Y and
  7203.T: whether `instrument` is there, its units, source and as-of, whether the market table has the row, the
  stored closes, and the counts of events, headlines, alerts and feed rows, and whether the database takes the headline
  pattern (the route falls back to plain parts of the title if not). It asks for no quote and no statements: EDINET DB
  is never asked from it.
- `api?action=health` (with a sign-in token) → `tick.ageMin` ≤ 3 during a session, `daily.ok` true, `feed.ok` true,
  `sources` without errors.

### When the price feed stops (added 2026-11-19)

On 18 Nov 2026, from 15:52 UTC to 23:26 UTC, the source went on answering every request from the Monitor's
server with the same prices, for everything but crypto: the S&P 500, USD/JPY, the futures and all 503
constituents carried a print time of 15:52 or earlier, with New York open. The minute job ran on time throughout
(it asked, and was answered), so the header said DATA OK. The source itself had not stopped: asked from GitHub's
machines through the jobs' reader (which waits and asks again when refused with HTTP 429) it gave current prices
the whole time (at 23:13 UTC the S&P 500's close of 7323.63 and a USD/JPY bar of that minute). Why the server
was handed old answers is not established. Prices came back by themselves; the minutes of the stop are missing
from the minute bars the server stores, except for the futures, whose day the source gave again in full.

What the Monitor does about it:

- **On screen.** `health.feed` (`_shared/feedhealth.ts`) reads the prints themselves: among the instruments whose
  market is open, and has been for half an hour, it takes the one that printed most recently, allowing each
  market its feed's own delay; if even that one is more than twenty minutes behind, the feed has stopped. The
  page then shows DATA ✕ with the reason, and a red bar at the foot of every screen: "No new prices since … The
  source has stopped sending them; the figures on screen are as of then." Both go when prices arrive again. The
  prices already on screen stay, with their own times. While the feed is stopped no move can be seen, so no alert
  is raised either; the bar is the only sign. The reading is made twice, for crypto and for everything else, and
  the one further behind is the state: on 18 Nov crypto kept arriving, and read together with the rest its fresh
  prints vouched for the feed, so the first version of this check (deployed that evening, two hours into the stop) never raised
  the bar. Currencies and futures are judged only inside their real week, Sunday 17:00 New York to Friday 17:00.
  Since 21 Nov 2026 the session table (`_shared/sessions.ts`, `marketState`) keeps the same FX week; until then it
  was Monday 05:00 to Saturday 06:00 SGT all year, an hour early at the open in New York's winter and an hour late at
  the close in its summer. So the minute job reads currency pairs, and the table calls one live, only from Sunday
  17:00 New York to Friday 17:00: an hour a week fewer than before, never more.
- **Daily closes.** After the bell on 18 Nov the daily history, on the server, booked the stopped prices as that
  day's closes (7303.98 for the S&P 500). `history` now reads how far the answers in hand reach (the newest
  minute bar it is given: for crypto, for everything else together, and for each market on its own) and books a
  bar only when they reach the end of that bar's day (`barSettled`: an exchange's last bell, 13:00 on New York's
  usual half days; 17:00 New York for a currency pair or a future; midnight UTC for crypto; half an hour's grace,
  75 minutes for a market read on its own). A run that is handed old answers books nothing new and overwrites
  nothing, and says `NOT BOOKED …` in its line in `job_runs`. On an exchange's half day other than New York's
  the close is held until that exchange's next session prints.
- **Putting wrong closes right.** `history-catchup` (Actions › Run workflow) is the same job run from GitHub's
  machines. On 18 Nov at 23:16 UTC it replaced the closes of 18 Nov wherever the source had a daily bar for the
  day. It cannot replace a future's close while that future is trading again (its day is skipped as still open
  until 05:00 UTC), nor a close whose daily bar the source has not published yet (four European indices that
  night); a later run does.
- **The Morning Note.** It is written after New York has closed, from the last prices the Monitor holds.
  `jobs/lib/pack.ts` puts a line in the pack's `warnings` in three cases. (1) The market table's value for the
  S&P 500 or the Nikkei 225 is still a quote and `stoppedBeforeClose` finds it more than half an hour short of
  the market's most recent close: "Prices from New York stopped arriving at 18 Nov 10:52 New York time, before
  the close at 18 Nov 16:00. The US figures in these tables are as of then, not closing levels." (2) The close is
  booked but equals such a quote. (3) Row by row: the stop is read as a silence of 45 minutes or more in the
  stored minute bars of USD/JPY (`silence`), and a row is named when its day ended after the silence began and
  its latest close was last written by a run of the server's daily history during the silence (`job_runs` gives
  the run's time and length, `prices_daily.updated_at` the time a row was written). This also holds once prices
  are arriving again, and for a row that already shows a new price while its one-day change is still measured
  from that close. With no silence on record the row check does nothing. The writer is told (rule 9) to say so at
  the start of "In brief" and never to present those figures as closing levels, and the note's page shows the
  warnings above its tables. Where the close was booked again from the real one, the writer is only told, in the
  pack's `notes`, that the minute feed had stopped and the closing levels were booked afterwards.
- **The second path** (`_shared/relay.ts`, `jobs/relay_deno.ts`, the workflow `feed-relay`). The source is one,
  but there are two roads to it, and on 18 Nov only the server's was stopped. Every minute the tick now records how
  far behind its own answers are (`snapshots` key `feed_own`). When they are ten minutes behind, or fewer than
  half of the instruments answer, it asks GitHub for the relay (`feed_relay_kick`, at most once in ten minutes).
  The relay pulls the same prices from GitHub's machines and, if its own answers are current, does the tick's
  work from there once a minute with the same code: quotes, minute bars, the table, the alerts, and the
  constituent jobs (`flow`, `mflow`, `stats`, `history`) at the minutes of the database's own timetable
  (`RELAY_CRON`, checked against `monitor_install_cron` by the logic checks). While its beat is fresh
  (`snapshots` key `relay`, 150 seconds) the server stands down: the tick stores nothing and only sends the
  notifications, and `daily` skips those four jobs, so there is one writer at a time; a print never replaces a
  newer one already stored. The relay hands back when the server has reported its own answers current three
  minutes in a row. Replayed on 18 Nov's times it takes over ten minutes into the stop. On screen the chip
  reads DATA ! and says "PRICES THROUGH THE SECOND PATH since …"; the prices are current, so there is no red bar.
  - *How it starts.* By the database, within a minute, if the GitHub token is stored (the repository secret
    `NOTE_DISPATCH_TOKEN`, the same one as for the Morning Note: see "The Morning Note on time"). Without the
    token only by GitHub's schedule, twice an hour, which this repository's runs have been starting hours late:
    a slow net, not a fix. By hand: Actions › feed-relay › Run workflow; `force_min` = 3 is a drill (the relay
    takes over for three minutes although nothing is wrong, then hands back), `dry` = true looks once and
    writes nothing.
  - *What it does not cover.* The source stopping for everyone: the relay then finds its own answers stopped
    too, writes nothing, gives up after ten minutes with a red run, and the "No new prices" bar stays. The
    quarter-hour and hourly bars of the 1W and 1M charts are not relayed; they fill in when the server's
    answers return. A relay still needed after five and a half hours asks for its next shift itself.
  - *Looking.* Actions › live-check with `only` = `relay`: the server's own reading, whether a relay is
    writing, its last lines, when the server last stood down, and what GitHub answered to the database's
    requests (204 = accepted; 401 = the token has expired).
- **Looking.** Actions › live-check with `only` = `market,source` prints each quote with the time it last
  printed, the last three booked closes beside it (a close equal to a stopped quote is marked), and the source's
  own daily closes and newest minute bar as GitHub's machines are given them. Actions › morning-note with
  `pack_only` = true builds the note's pack from the live data and prints its warnings; it asks no model and
  stores nothing.
- Spot-check the table against the exchange: Nikkei 225 close on JPX/Nikkei, S&P 500 on S&P DJI, USD/JPY on a bank page, UST 10Y on treasury.gov for the same date.
- Holidays: `sessions_cal` rows are `verified = false` until checked against each exchange's published calendar; the DATA chip says so.
  The table holds Tokyo's and New York's for 2026 and 2027 (checked on 7 Nov 2026 against JPX's and NYSE's pages), and no
  other market's. The page says when a closed market next opens from the session table and these rows, and marks the
  time "scheduled" for a market whose holidays are not here (README, "When a closed market opens").
- Early closes: `_shared/sessions.ts` keeps New York's 13:00 closes of 2026 to 2028 as NYSE's page gave them on 20 Nov
  2026 (the lines are quoted there). After one, `marketState` is CLOSED: the table's rows stop being live at 13:00 and
  the minute job reads New York's instruments for 45 minutes more, as after any close. The daily history's own
  half-day rule (`feedhealth.ts`, `nyseHalfDay`) is older and separate; the paper portfolio's P-2 moves the dates into
  `sessions_cal.early_close`.

## Notes

- Yahoo's chart and spark endpoints are unofficial. The code keeps nulls as gaps, never fills them, and rotates hosts on failure. If Yahoo breaks, `source_status.yahoo` records the error and the page shows stale stamps rather than wrong numbers.
- TOPIX has no Yahoo ticker. `1306.T` is the live proxy (also for the stock page's "against TOPIX"); the official JPX daily index close is a planned addition.
- `fn_table_anchors()` computes the 1D/1W/1M/3M/12M/36M anchors in SQL; the table is rebuilt once per minute, not per visitor.

## Added 2026-11-07 evening

- Chart frequencies: `tick` now stores one-minute bars (`bars_intraday`, three-day retention) from per-symbol chart calls (a few in parallel, spark as fallback); `daily?job=hourly` keeps `bars_hourly` (three months fetched, sixty days kept) for the 1W and 1M charts; 3M and longer use daily closes. `api?action=series` returns extra history behind each window so the page can pan; 5Y and 10Y (a stock's page, since 20 Nov 2026) return up to ten years and the σ window's history, without a second window (`historyDays` in `_shared/assets.ts`).
- Alerts: `alerts` table and `api?action=alerts`. Indices beyond ±3% are recorded by the tick every minute. Single stocks beyond their line at any point of the session (`_shared/moves.ts`; the figure is the session's largest move). The line is ±5% for a large company (1tn yen and above, or 10bn US dollars and above, from the market value the flow job last stored) and ±7% for the rest and for a company whose size is not known (`stockLine`; 7% for all until 19 Nov 2026): every fifth minute the tick reads one-minute bars (spark, one request per 20 names) for Nikkei 225 and S&P 500 members and every stock on a watchlist, while the market is open and until the delayed closing prices are in; the flow job (`daily?job=flow&idx=…`) raises the same alert from the day range of its quotes for the other companies of TOPIX, Nasdaq-100, KOSPI 200, Hang Seng and SSE 180 worth USD 5bn or more. In the minutes after a market closes the official closing price of each covered name is measured as well (`closeMove`): a closing auction prints after the last one-minute bar. One row per symbol, session date and kind, written only when the figure changes. `daily?job=constituents` refreshes the S&P 500 (Wikipedia) and Nikkei 225 (Nikkei CSV) lists into `constituents`.
- WATCHLIST rows (19 Nov 2026): `api?action=watch_list` reads a market instrument from the market table as MARKETS
  shows it (`_shared/watchrow.ts`). A yield's per-cent fields are null and its changes go out as the change of its
  level (`chg1d` … `chg12m`, and `vs200chg` from the 200-day average, in points; the page prints them in bp); a price
  keeps its per-cent fields and gets the level changes too. Every row carries `asOfKind` (`close`: a booked close, sent
  as its session's date; `print`: a quote, sent with its time; `published`: an official curve's yield, sent as its
  date) and `source` (Yahoo Finance, or the yield's publisher: US Treasury, Japan MOF, Bundesbank, Bank of England, ECB,
  Bank of Canada). A page older than this ignores the new fields and shows a yield's changes as dashes; a newer page
  given an older answer does the same, and reads the as-of from its form. A name that is neither a market-table
  instrument nor an index member is read from a plain quote (`watchRowFromQuote`): its 1D only. A Treasury yield index
  among them (the Cboe's ^IRX, ^FVX, ^TNX, ^TYX, or an index Yahoo names as a Treasury yield or bill; ^IRX, the 13-week
  bill, is the one the table lacks) is sent as a yield: `isYield`, no per-cent change, `chg1d` = last − previous
  close in points. A page older than the yield rows shows its 1D as a dash.
  Since 20 Nov 2026 a market instrument's row also carries `decimals` (the instruments table's own), so the watchlist
  writes its level as every other screen does (USD/JPY 158.400, not 158.21: the designer's D-05). A stock's row and a
  plain quote's carry none: the page writes a stock with two decimals under 1,000 and none from 1,000, a yield with
  three, as before. A page older than this ignores the field.
- EQUITIES while a market is open (19 Nov 2026): the flow job keeps each constituent's quote price, its previous close and the time it printed (`constituent_stats.q_price`, `q_prev`, `q_time`). `api?action=index_stats` reads a row at its quote when the quote is from a later session than the row's booked close (`_shared/intraday.ts`), for the whole list or not at all: at least half the names must have such a quote. The 1D figures (movers, breadth, sectors, heat map) are then today's moves so far, at most ten to twenty minutes old, and the answer carries `live: { asOf, n }`; changes over longer periods stay measured to the last close, and the page says so.
- Closing levels are held until the next session's first print: the quote is used only while its exchange-local date is newer than the last booked close.
