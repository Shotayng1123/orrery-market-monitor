# Orrery Monitor

Real-time market numbers, flow and trending data for professional investors. Information only: no trading, no portfolios. It shares the look and the logo of Orrery Analytics and nothing else: its own backend, its own data sources, its own code.

- Live site: GitHub Pages from this repository (`web/` built by `.github/workflows/deploy-web.yml`).
- Backend: a dedicated Supabase project (`supabase/`): Postgres, pg_cron, Edge Functions `tick` (1-minute quotes), `daily` (history, curves, calendar, news) and `api` (everything the page reads, behind the sign-in).
- Batch jobs: `jobs/` run by GitHub Actions (history backfill, constituents, the Morning Notes written with the Claude API).

## Rules that shape the code

- Every number has a source and an as-of time; delayed feeds carry a badge; estimates are marked (E).
- One precision per instrument (the instruments table's `decimals`, sent with each row) on every screen, the charts and
  the notes; a yield's level ends in "%"; a figure that rounds to zero carries no sign. One date format ("19 Nov 2026")
  and one time format ("19 Nov 23:18 SGT", or "23:18" for today in a panel that says its times are SGT); never
  "11/19" or "2026-11-19". One word per idea: the glossary in `web/src/lib/labels.ts` (MARKETS, RATES & FX, Period,
  FX, Rates, Mkt cap, Next results, Avg daily volume (60d) …), used by both layouts. Numbers in `web/src/lib/fmt.ts`,
  dates and times in `web/src/lib/time.ts`.
- Nothing is read from Orrery Analytics.
- Default time zone: Singapore. The page refreshes every 60 s while any tracked market is open.
- Sigma bands: rolling mean ± 1σ over 21 / 252 / 756 trading days (1M / 12M / 36M), ±2σ on toggle.

## Layout

```
web/        Vite + React + TypeScript. src/styles/tokens.css is the design system (ported from Analytics v9.30).
            src/lib: time (SGT), sessions (exchange hours), api (bearer client), stats (rolling σ), prefs.
            src/views: Market, News, Research, Equities (index toggle), RatesFx (Forex / Curve / TBD).
            src/lib/opening.ts + components/Opening.tsx: the opening (five seconds, from the sun out to the
            solar system and into the mark): every time the app on a phone's home screen is opened, once a day
            on each device elsewhere, and never while an account is being created; `?opening=1` plays it again. While it
            plays the Monitor's answers are held (lib/hold.ts), so nothing else is drawn and it stays smooth.
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
# the same with a stand-in feed on every tab (dev server only; MOCK on every screen):
VITE_DEV_MOCK=1 VITE_DEV_BYPASS=1 npm run dev
npm run build          # typecheck + production build into web/dist
```

The stand-in feed (`web/src/lib/mock.ts`) fills every tab: generated prices and charts, and the stand-in rows of
`web/src/lib/standin.json` (calendar, headlines, research, earnings dates, alerts, a watchlist, policy rates), which
the browser checks answer with too. Its times are counted from when the page opens; the headlines reach 31 hours
back, so they always cross a midnight in Singapore and show their day bars at any hour. The watchlist is kept in the
browser (`om_mock_watch`), so stars and the add box work; `?mock=empty` in the address shows every tab with no rows.
None of it is in a production build.

## Deploy

1. Repository Settings › Pages › Source: **GitHub Actions**.
2. Repository variable `VITE_API_URL` = the Monitor API URL.
3. Push to `main` (or run the `deploy-web` workflow). The site is served at `https://shotayng1123.github.io/orrery-market-monitor/`.

The server (database changes and the functions) is deployed by the `deploy-server` workflow on a push to `main` that
touches `supabase/`, once its two secrets exist; the set-up and the first-time steps are in `supabase/README.md`.

## Tests

Three sets, none of which needs the real API, the live database or a sign-in:

- **Browser checks** (`web/e2e`, about 1,300 checks in 27 suites): every tab on a desktop and in the phone layout, the
  local stand-in feed (every tab filled, with the hard cases of length and state, and none of it in the built site),
  units and labels (a yield's changes in bp on the watchlist, the same figures as MARKETS; every row's as-of; the
  window under every phone change; σ never shown as Σ; headed tables; an older server's answer still read), one
  format (`one-format`: USD/JPY with the same decimals in nine places on both layouts, a yield's level in "%", no
  "11/19", "16-Nov-26", "2026-11-19" or "−0.0" on any screen or tooltip, the glossary's words alike on both layouts), the
  stock page (chart marks, performance, statements; its NEWS of headlines and alerts, the document behind each
  statements column, big moves in their sign's colours, a move opened on the phone's chart, a tap on a phone chart,
  5Y and 10Y, the two-column page and a server from before NEWS), the classic phone layout, the sign-in screen, creating an
  account by verification email, the manager's accounts list, the
  home-screen hint, the new-version bar, opening without a connection, notifications, a tab that fails
  while it is drawn (it says so in its own space; the header and the other tabs stay), the welcome email as its
  reader sees it, a price feed that has stopped (the bar and the DATA chip say so), and the opening.
  The **layout guard** (`layout-guard`) opens all eight screens at five computer sizes (1280×720 to 2560×1440, and
  1440×900 with small text) and on two phones, and fails a publish if a figure is cut, unit and all (past the edge of
  a box that hides its overflow, behind an ellipsis, or half outside it at the top or foot: "-4.8bp" showing as
  "-4.8" is a cut figure), a figure is painted over by another element or clipped by a clip-path (each figure is
  hit-tested where it stands, the page moved down a screen at a time), a chart's axis label runs off its canvas,
  anything scrolls sideways (a phone's statements and wide phone tables do so by design), or a phone tap target is
  under 44 × 44 px, measured on what takes the tap (a drop-down's transparent select, a toggle's reach); the few
  targets the designer listed as still small are printed with the change that fixes them. A stock's statements,
  where they scroll sideways, are walked as a reader moves them (where they open, each press of "‹ earlier years",
  swipes of 40 px each way) on four phones and on a computer at text XL, and every place they come to rest must show
  each period whole, beside the line names and at the right edge. It also cuts, clips and
  covers figures on purpose with throwaway styles, to show that it fails each time. XL text and the one-screen
  layout join it once they are fixed. `nothing-cut` checks the designer's findings behind it one by one (whole
  columns at both edges of a phone's statements, pressed back and swiped, short interest at its natural height, chart titles, long headlines under day
  bars, phone search, the watchlist's two columns at the feed's real lengths, curve labels, the header's alert line for every kind of alert),
  in ways that hold at any time of day.
  `cd web && npm run e2e` starts the test servers it needs and runs them all (about seven minutes, three suites at
  a time); `node e2e/run.cjs offline` runs one suite. Suites and servers are listed at the top of `web/e2e/run.cjs`.
  A suite that fails once is tried again; when the second try passes, the lines that failed the first time are
  printed all the same, so a check that fails only now and then can be found from the publish job's log.
  Needs Playwright's browser once: `npx playwright install chromium`.
- **Logic checks** (`sim/logic.test.ts`): exchange sessions, rolling bands, alert measures, the push encryption,
  the verification email for a new account, and every figure of the stock page (performance, ratios, statements
  as read from each source, big moves, the reading of a move's reason), and the second path for prices (when the
  relay takes over and hands back, its timetable against the database's own), where a statements table wider
  than the screen comes to rest, and the one formatting of figures, dates and words (`lib/fmt.ts`, `lib/time.ts`,
  `lib/labels.ts`). `cd jobs && npx tsx ../sim/logic.test.ts`.
- **Database checks** (`sim/sql`): the rules that live in database functions (the limits on verification emails;
  the queue for the reasons of big moves; the request for the second path),
  run with the migration file itself on PGlite, a Postgres inside Node. `cd sim/sql && npm ci && npm test`.

The `deploy-web` workflow runs the browser and logic checks before it publishes: a failing check stops the publish.
A pull request that touches `web/` runs them without publishing. `logic-tests` runs the logic and database checks
when the server's functions or migrations change.

## Data sources (v1)

| Data | Source |
|---|---|
| Quotes, intraday bars, daily history | Yahoo Finance chart and spark endpoints (unofficial; delays declared per exchange). When the source stops answering the server, a job on GitHub pulls the same prices until the server's own answers are current again (the second path: `supabase/README.md`, "When the price feed stops") |
| US yield curve | US Treasury daily par yield curve CSV |
| JGB yield curve | Japan MOF `jgbcme.csv` |
| Policy rates | ECB, Bank of England and HKMA data feeds (`daily?job=policy`); Fed target range from the New York Fed's EFFR data (`jobs/fed.ts`, GitHub Actions). FRED supplied the earlier Fed history but refuses connections from GitHub's runners and the edge runtime |
| Economic calendar | FXStreet calendar API (consensus, previous, actual); ForexFactory weekly JSON as the fallback |
| News | RSS from publishers only: WSJ Markets, FT Markets, Nikkei Asia, CNBC (Markets, World, Asia), MarketWatch, Japan Times |
| Constituents | Wikipedia lists (S&P 500, Nikkei 225), checked monthly |

TOPIX has no Yahoo ticker: the `1306.T` ETF stands in for the live level (badge PROXY) and the official JPX close is used for daily figures.

A new source is tried from GitHub's machines before a job is built on it: a read-only script in `jobs/probes/`
(the pattern is `jobs/probes/example.ts`), run by the `source-probe` workflow on the branch that holds it
(Actions › source-probe › Run workflow). It is given no secrets and writes nothing.

### The stock page (`#asset/SYMBOL`, since 2026-11-18)

| On the page | Where it comes from |
|---|---|
| Chart with σ corridors and volume; price history; PERIOD 1D to 36M, and 5Y and 10Y (since 2026-11-20) | Yahoo Finance daily and intraday bars (split-adjusted, dividends not included; ten years of daily bars) |
| Change over 1D, 1M, 3M, 6M, 12M, 36M, 60M against the benchmark | Worked out from those bars (`_shared/stockstats.ts`). Tokyo names are set against the Nikkei 225 and TOPIX; TOPIX is read from the `1306.T` fund (PROXY). Other names against their home index |
| 52-week range, volatility, beta, largest fall, average daily volume and value | Worked out from the same bars |
| Market cap, shares outstanding, float, next earnings date | Yahoo Finance quote and key statistics |
| Short interest | Tokyo: the positions of 0.5% and above reported to JPX (already stored for the EQUITIES tab). Elsewhere: the exchange-reported short interest Yahoo republishes, with FINRA's daily short-volume share beside it |
| Statements (income statement, balance sheet, cash flow), ratios, guidance | Tokyo: EDINET DB (有価証券報告書 and 決算短信): ten fiscal years, the company's guidance with later revision notices and the progress against it, and twelve single quarters as EDINET DB derives them. Share counts are the company's own from its latest 決算短信. Yahoo stands in, and the page says so, when no EDINET DB key is set or the day's allowance is used up. Elsewhere: Yahoo Finance fundamentals (about four years and five quarters; no guidance), with the lines of a company reporting under US GAAP or IFRS; a line the company does not report is left out |
| A column's document (since 2026-11-20) | The address the source gives for it, never a made-up one: a year's 有価証券報告書 on EDINET (`edinetFilingUrl`), the 決算短信 PDF of the guidance, of a quarter or of a year known only from it (`pdfUrl`, which EDINET DB gives on some rows only). A header without an address is plain and says so. Yahoo gives none |
| Fiscal year end, accounting standard, annual report (Tokyo) | The latest 有価証券報告書 in EDINET DB's answer |
| News: headlines and alerts naming the stock (since 2026-11-20) | The Monitor's own tables: headlines from the publishers' feeds on NEWS whose companies include the stock, and the Monitor's alerts on it, over 90 days |
| Big moves and why (companies of 1tn yen / 10bn US dollars and above) | From the bars (`_shared/bigmoves.ts`): a day of 10% or more, and the peaks and bottoms of the closes (large circles: turns of 15%; small circles: turns of 10%; the circles and dots: a peak red, a bottom green; the figures in their sign's colour). Each reason from a web search by the `move-causes` job, kept only with the reports behind it |

A figure a source does not give is shown as a dash. Nothing on the page is estimated; the two sums made on the
page itself (net cash, free cash flow) say so where they stand. A Japanese company's table keeps the lines of
Japanese statements (ordinary profit, extraordinary items); a company elsewhere gets R&D, net interest and other
income, pretax income, income tax, buybacks, dividends paid and stock-based compensation instead (`LAYOUT_JP` and
`LAYOUT_FOREIGN` in `_shared/fin.ts`). One unit (m, bn or tn) is chosen per company from
its revenue and written once, in the statements table's header.

## Morning Notes

`jobs/morning_note.ts` writes the note for 07:00 SGT, Monday to Saturday (Saturday's covers Friday's US session). Sunday has no note: the weekly view is the Friday Weekly Strategy (`.github/workflows/weekly-strategy.yml`, due 15:00 SGT). GitHub starts scheduled runs hours late, so `.github/workflows/morning-note.yml` requests the run early, waits until 22:15 UTC, and has two backup runs that write only when the note is missing; it can also be run by hand with a date and a dry-run option. It first builds a numbers pack from the Monitor's own data (market table, daily history for technicals, today's calendar, recent headlines) plus Yahoo daily closes for the S&P 500 and Nikkei 225 constituents (lists: Wikipedia and Nikkei's constituent CSV, cached in `jobs/data/`) and the US sector ETFs. Claude (web search; model and effort in `jobs/lib/llm.ts`) drafts the note strictly from that pack, citing every external claim, then reviews its own draft; a second call structures it; a check refuses any number that is not in the draft. The note, its sources and the pack are stored in `notes` and shown on the RESEARCH tab with the archive of earlier notes. GitHub secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
