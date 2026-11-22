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
            src/lib/nav.ts: a page opened from a list (a name's, or an index's on EQUITIES) starts at its top; Back
            returns the page to where it stood (the window's place: a list that scrolls in a box of its own, a
            computer's HEADLINES or a panel of the one-screen layout, starts again at its first row), holding the
            place until the reader's first touch, wheel or key, while a late answer draws the list and while
            a view says an answer that draws at or above its list is still on its way (an element marked
            data-nav-wait: a phone's WATCHLIST is first drawn without its names, and its line of the markets that
            are shut grows when the market table comes; a phone's MARKETS draws its morning note above the list),
            and finds a phone list's open line still open (each history entry carries a key in history.state). Which pages
            open at their top is the rule in src/lib/pagetop.ts, a file with no imports, so that the logic checks
            can read it where React is not installed.
            src/components/Sheet.tsx: a phone's sheet from the bottom edge (a dialog: focus stays inside it, the
            page behind does not scroll, and ✕, Esc, a tap on the dimmed page or the browser's Back closes it).
            "Add Orrery to your Home Screen" opens in it, from its line on MARKETS or from the menu.
            src/views/Portfolio.tsx, src/components/pf/, src/styles/pf.css: the paper portfolio's screens (P-1), a
            file of their own that only a build carrying the paper book makes (src/lib/paper.ts: the page's switch).
            src/lib/pf/ is a copy of the server's engine (supabase/functions/_shared/pf/), written by
            `node tools/sync-pf.cjs` from web/ and never edited by hand; the logic checks fail when the two differ.
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
the browser checks answer with too. Its times are counted from when the page opens (a results date: a day from today
at its market's close, 06:30 UTC for Tokyo and 21:00 UTC for New York, as Yahoo stamps them); the headlines reach 31 hours
back, so they always cross a midnight in Singapore and show their day bars at any hour. The watchlist is kept in the
browser (`om_mock_watch`), so stars and the add box work; `?mock=empty` in the address shows every tab with no rows.
None of it is in a production build.

The local copy's clock can be set: `om_mock_now` in the browser's storage, an ISO time (`2026-11-24T02:45:00Z` is
Tue 24 Nov 2026, 10:45 SGT), starts the page's clock at that moment on each load (`web/src/lib/mockclock.ts`), and the
stand-in market rows then follow the session table: a market that is shut is CLOSED with its last print at its
close, one in its regular hours is live. So a closed market, a midday break, a holiday or an early close can be
looked at whatever the hour (the red bar at the top says the clock is set). `om_mock_now` = `now` keeps the
machine's clock and makes the rows follow the session table all the same: what the live Monitor would show at this
hour. Without the key the clock is the machine's and the rows keep fixed states (FX and the futures live, the rest
not), so the browser checks see the same rows at any hour; at most hours those rows contradict the lines beside
them (a pair LIVE on a Saturday beside "Closed now: FX opens …"), so set the key before judging what a screen says
of a market's hours. The holidays it passes over are the Monitor's own calendar rows, not stand-ins. With the clock
set, each stand-in row's daily closes also end at the last session its market has completed and booked (an
exchange's at its last bell, a currency's and a CME future's 35 minutes after 17:00 New York; `bookedDays` in
`web/src/lib/mock.ts`), so MOVERS IN σ's LAST SESSION and the dates beside figures can be looked at for any hour:
`2026-11-23T23:10:00Z` is Tue 24 Nov 07:10 SGT, an hour after the FX day of the 23rd ended, with USD/JPY's stand-in
last session at -2.2σ. Three things differ from the live Monitor there: the local copy shows a future live from
18:00 New York (on the live Monitor, in New York's winter, a future's row is its booked close until midnight in New
York, so "last session" under a future's figure is seen there on a Monday morning only; in New York's summer, from
Tuesday to Friday until 15:05 SGT, it is the live print with its 1D from the close before, over two sessions); its rows are prints, never a booked close with its
date; and it books a day at the moment above, where the server books it at its history job's next run (07:05, 17:05
and 22:35 UTC: Hong Kong's close of 16:00 there is booked at 01:05 SGT unless GitHub's catch-up run of 19:20 SGT has
it first, New York's 95 minutes after its bell in its winter, and in New York's summer a CME future's only at 15:05
SGT the next day), so between a close and that run the local copy's "last session" is a session ahead of the live
Monitor's.

## Deploy

1. Repository Settings › Pages › Source: **GitHub Actions**.
2. Repository variable `VITE_API_URL` = the Monitor API URL.
3. Push to `main` (or run the `deploy-web` workflow). The site is served at `https://shotayng1123.github.io/orrery-market-monitor/`.

The server (database changes and the functions) is deployed by the `deploy-server` workflow on a push to `main` that
touches `supabase/`, once its two secrets exist; the set-up and the first-time steps are in `supabase/README.md`.

## Tests

Three sets, none of which needs the real API, the live database or a sign-in:

- **Browser checks** (`web/e2e`, 2,873 checks in 43 suites on 22 Nov 2026): every tab on a desktop and in the phone layout, the
  local stand-in feed (every tab filled, with the hard cases of length and state, and none of it in the built site),
  units and labels (a yield's changes in bp on the watchlist, the same figures as MARKETS; every row's as-of; the
  window, or the day of a figure that is not today's, under every phone change; σ never shown as Σ; headed tables; an older server's answer still read), one
  format (`one-format`: USD/JPY with the same decimals in nine places on both layouts, a yield's level in "%", no
  "11/19", "16-Nov-26", "2026-11-19" or "−0.0" on any screen or tooltip, the glossary's words alike on both layouts), the
  stock page (chart marks, performance, statements; its NEWS of headlines and alerts, the document behind each
  statements column, big moves in their sign's colours, a move opened on the phone's chart, a tap on a phone chart,
  5Y and 10Y, the two-column page and a server from before NEWS), an instrument's page (`instrument-pages`: a pair, two
  yields, gold and an index without an EQUITIES page on both layouts with no stock-only line, a yield's figures in bp,
  JGB 10Y from Japan MOF, USD/JPY's events and yen headlines, every instrument name on MARKETS and RATES & FX opening
  its page, NEWS's Currency picker, and a server from before), where a page opens (`page-top`: a page opened from MARKETS,
  RATES & FX, WATCHLIST, EQUITIES, a headline's company or search starts at its top with its name on a phone and on a
  computer, and Back returns the list to where it stood with its open line, also when the answers come late; on a
  phone's WATCHLIST of eleven names the browser's Back returns the line that was tapped to where it stood, in ten
  fresh contexts of ten, with the list's answers late, and with the market table a second after the names; MARKETS
  the same when the morning note's answer comes a second after the table's; `nav-hold`: that hold gives way to the
  reader, a wheel or a key while the list is still on its way ending it, and is over once the answers have come, so
  a later move of the page stays), results
  dates (`results-dates`: the day in each company's own market and no time of day, in KEY DATA, on WATCHLIST and in
  NEWS › Results calendar, both layouts; the mark after each date as its source gives it, "conf.", "est." or a dash
  in WATCHLIST's MY NAMES as in RESULTS AHEAD; a stored date more than a day past reading a dash there, as RESULTS
  AHEAD leaves it out), moves in σ (`sigma-moves`: MOVERS IN σ and the 1D IN σ
  column on both layouts and in the one-screen layout and at XL, sorting within each bar, the stand-in 2.7σ alert, gold's
  stand-in roll day kept out of its 1D, its σ, its volatility and its largest fall, the roll marked on its chart, the
  alert list whole on two phones and at five computer sizes, gold's KEY DATA whole at text L, and a
  server from before), MARKETS at the morning hour (`morning`: at 07:10 SGT on a Tuesday the choice TODAY · LAST
  SESSION on the strip and on a phone's cards, the date beside every figure that is not of today in Singapore, "last
  session -2.2σ" under a currency's figure in its day's first three hours and under a pair's and a future's on a
  Monday morning, the day after a name in the table and in a phone line's pill, the room a name cell that carries a
  day keeps for its name, its badge and the day (the one-screen layout at its smallest window at AUTO, 1170×540, at
  1280×720 and 1440×900, and at text L and XL in their smallest, 1495×900 and 1755×1000; the scrolling layout at five
  windows down to 760 px wide; the classic phone layout on two phones), the table's CSV with the marks and
  the day in columns of their own, the heights the strip may take, and a server from before, which shows neither the
  choice nor a day), the phone's first MARKETS screen (`phone-first`: every block above the list at its set height
  in a 375×667 window, on an iPhone 13 and on a Pixel 7, in the machine's fonts and drawn wider, so that the σ cards
  and four whole rows stand above the tab bar; the alert as one line of which only the name is ever cut, its figure
  whole when the alert is new, a σ move and of the day before, in a 375-px and a 360-px window, where "NEW" and then
  the time's day leave the line before the name keeps less than its first letter and "…"; every tap 44 px. 375×667 is Playwright's "iPhone SE":
  that phone's whole screen. With the alert, a fresh note and the install line all showing, four rows need a window
  at least 648 px tall, and a browser on that phone leaves less: by the sums three rows at 647 px, which is not
  measured on a phone; in the installed app, which has no install line, the sums give four rows at 647 px), why a
  market
  is shut and an old price in market hours (`shut-reasons`: "Holiday", "Midday break", "Daily break" and "Closed
  early" under a phone's names, the first two and the last at the start of a page's own chart line ("Daily break"
  there is checked as words by the logic checks, not drawn), a holiday that an opening passes over,
  "Last print 08:40" in amber, the FX panel's "Next read 22:30 SGT: DXY"), the classic phone layout, the sign-in
  screen, creating an
  account by verification email, the manager's accounts list, the
  home-screen line and the sheet it opens, the new-version bar, opening without a connection, notifications (with the kinds a device receives and its σ line), a tab that fails
  while it is drawn (it says so in its own space; the header and the other tabs stay), the welcome email as its
  reader sees it, a price feed that has stopped (the bar and the DATA chip say so), and the opening.
  The **layout guard** (`layout-guard`) opens all eight screens at five computer sizes (1280×720 to 2560×1440, and
  1440×900 with small text), at 1440×900 with large text (every screen but EQUITIES, which joins once it is fixed
  there) and on two phones, and a stock's two pages at three more windows (1366×768 and 1536×864 at text L,
  1680×1050 at XL), and fails a publish if a figure is cut, unit and all (past the edge of
  a box that hides its overflow, behind an ellipsis, or half outside it at the top or foot: "-4.8bp" showing as
  "-4.8" is a cut figure), a figure is painted over by another element or clipped by a clip-path (each figure is
  hit-tested where it stands, the page moved down a screen at a time), a chart's axis label runs off its canvas,
  anything scrolls sideways (a phone's statements and wide phone tables do so by design), or a phone tap target is
  under 44 × 44 px, measured on what takes the tap (a drop-down's transparent select, a toggle's reach); the few
  targets the designer listed as still small are printed with the change that fixes them. A stock's statements,
  where they scroll sideways, are walked as a reader moves them (where they open, each press of "‹ earlier years",
  swipes of 40 px each way) on four phones and on a computer at text XL, and every place they come to rest must show
  each period whole, beside the line names and at the right edge. `layout-guard-instruments` runs the same checks on
  five instruments' pages (gold, a future, among them) at the same sizes. The guard also opens the alert list behind
  the header's line once at each size: nothing cut or sideways, and its box inside the window. It also cuts, clips and
  covers figures on purpose with throwaway styles, to show that it fails each time. XL text and the one-screen
  layout join it once they are fixed. `nothing-cut` checks the designer's findings behind it one by one (whole
  columns at both edges of a phone's statements, pressed back and swiped, short interest at its natural height, chart titles, long headlines under day
  bars, phone search, the watchlist's two columns at the feed's real lengths, curve labels, the header's alert line for every kind of alert),
  in ways that hold at any time of day; and when a closed market opens (`opens`: beside every CLOSED, on both
  layouts and at ten window sizes, at set moments of a set clock: a Friday evening, a weekend, a holiday, a midday
  break, an early close, a session's first minutes on a delayed feed; the FX week by New York's clock; the dollar
  index, the UST 10Y yield and VIX saying when they are next read, never CLOSED; a row with no live price in its
  market's hours saying "open since" only where the Monitor holds that market's holidays; `layout-guard-closed`: the
  layout guard again with the clock on a weekend, when every closed market's line carries its opening); and the room
  the chart keeps at the top of a phone's page of one name (`stock-page` and `instrument-pages`, through
  `e2e/hero.cjs`): at least 290 px whatever the lines after its stamp, the tile growing with its head between 410 and
  540 px and no further than the head needs, at set moments of the same clock (a weekend, a Friday evening, an open
  market), in the machine's fonts and in a wide one, and with every badge, the stamp and the opening forced onto a
  line of its own. These checks read no clock but that one and trust no font: the stamp's line that takes one line
  on the engineer's machine took two on GitHub's, and it carries a date on some days and none on others (the check
  they replace passed here by 2 px and stopped pull request #48 on GitHub on a Saturday).
  **Room, not "not cut"** (`e2e/room.cjs`, since 2026-11-21, used by `morning`, `phone-first` and `install-hint`): a
  check of "nothing is cut" that asks `scrollWidth > clientWidth + 1` passes a text one pixel too wide, which a
  browser already ends with "…" (pull request #49: TOPIX's name cell in the one-screen layout at 1280×720 was 115 px
  of text in 114, passed here by that pixel and failed on GitHub, whose machines draw the same faces about one per
  cent wider), measures nothing on an inline box, and cannot see a part that a box around it hides. The helper
  measures the text itself against the content edge of every box that would cut it, in CSS px, and a check asks for
  a margin: in the machine's own fonts, and in a drawing that is really wider (every letter's spacing 2% of its size
  wider, 3.3% more width in the monospaced figures, about three times what GitHub's machines add; on a phone also
  with every face swapped for the generic monospace). A forced monospace alone widens next to nothing on a
  computer: IBM Plex Mono's letters are 0.600 of their size wide, DejaVu Sans Mono's 0.602, Liberation Mono's 0.600.
  The **paper portfolio** (P-1, on the development servers, where its switch is always on) has three suites, and the
  header's with its seventh tab one.
  `portfolio` (a computer): the seventh tab at six sizes with the header as tall as with six tabs, in the machine's
  fonts and in a wide one; key 7; with no book,
  three cards and two muted lines, nothing drawn as a disabled button;
  the list and the cap; the statement once (its words read from the engine's file, CONTINUE held until the box is
  ticked, NOT NOW storing nothing) and the three starts created with the defaults their forms showed; the form's
  targets lines, refusals, ladder and trade lists, its width at four sizes with CREATE in view, a draft, the errors;
  a book's Overview with no figure P-1 does not hold, fixed rows without a control, a change with its reason, the
  pending value and HISTORY, the targets' window on 21 Nov and 15 Dec, notes, renaming, delete after typing the name,
  a second account seeing nothing; the page's own calls answered by the suite (a server with its switch off, the
  statement first, a refusal); and the change form's date after 17:00 New York passes with the page open.
  `header` (a computer; the designer's rule of 22 Nov 2026 for the one-screen header, revision 2, its check A.7): the
  one-screen header's rule (one row from a layout 1,310 × 560 with a 103-px margin in both letter placements, six tabs
  and seven; the search box 88 px with the focus; ≡ holds text size, COMPACT, FULL and the account) and key 7 in FULL.
  At 16 windows and text sizes from a layout of 1,310 × 560 (the floor's heights among them) the header is one row; the
  alert line's holder is at least 103 px wider than the line's longest promise (a lit stock move of "+12,345.6%"
  intraday and at close, a σ move of "-12,345.6σ" and a news alert, each with a long name, the chips at their longest),
  twice the largest difference the designer measured between the two letter placements; in each state everything but
  the name stands whole, the name's box is at least its promise (its first 8 characters and "…", or the whole name
  where that is narrower), "USD/JPY", "S&P 500", "TOPIX" and "Nintendo" stand whole, and no part has had to leave; the
  focus, a typed letter with the results list and a 33-character query move nothing and scroll nothing sideways; the
  menu is inside the window with nothing cut and closes on Escape (the focus on ≡), a second press, a press outside
  and the focus leaving it ("/" puts it in the search box, whose list it never covers); FULL from it hides the header
  and Escape brings back one row; under 1,310 × 560 COMPACT gives the scrolling layout and its chip says why; outside
  the one-screen layout the row is as before; DejaVu Sans forced changes none of it; with DejaVu Sans and 0.9 px more to
  every letter, or 2 px more in the Monitor's own faces, every part the line shows stays whole and the name keeps its
  promise, the fit letting the label go first; with 7 px more the layout is refused for that window and text size
  (COMPACT's chip says why), and another window size tries again, while with the page's faces 2.5 s late and every
  letter 3.8 px wider it is not refused (the fit refuses only once every face has loaded, and takes back once a
  refusal a later font load proves wrong); the fit's trace on `#alerts` names what it found cut before its steps; and
  in a browser that draws classic scrollbars, at the floor's five windows, no tab, menu, list or Help makes the page
  scroll up and down, so no bar takes the row's width. `header` runs the AUTO windows, the floor and the layouts outside it, `header-sizes` the same checks at
  the text sizes and the floor's heights, `header-wide` the wider drawings, the last step and the scrollbars (in one
  suite they passed the runner's six minutes).
  `phone-portfolio` (an iPhone SE, an iPhone 13, a Pixel 7): the seventh bar item with
  every label inside its item in the machine's fonts and in a wide one, the current label alone at 320 px; the
  statement's sheet; the form's start, Review and sections with 16-px inputs and Review and Create above the bar at
  every scroll position, Review naming the Reference the book will have; a book's head, views, change sheet, notes and
  delete; every tap target 44 px on 23 screens.
  `layout-guard-portfolio`: the layout guard on the list, the three forms and the three stand-in books' Overview and
  Settings at its eight sizes, each measure counted only where the screen named is the one drawn (not "No such paper
  portfolio", "loading…" or a failed tab). All three set the page's clock (`om_mock_now`) and never read the machine's.
  `portfolio-fixes` (round 3b, 22 Nov 2026: the second review of P-1 by the designer's Part B): a form's default name
  free by rule ("… · 2") and a refused field said at once; a book made at 04:30 SGT on a Sunday, whose head, card and
  lists read "created 22 Nov 2026", its SINCE "Sat 21 Nov 2026", the heads that hold a book day "a day ends 17:00 New
  York", CHANGE "In force from Mon 23 Nov 2026, 06:00 SGT", and every moment on its screens with its zone; the targets'
  window with its opening moment on the tab, in Help and on NEW PORTFOLIO; notes typed while one is saving, SHOW ALL
  only where the text is drawn on more than eight lines, a failure's sentence gone once the connection is back; a
  phone's name field and rows at 360 px; the server's paper switch off; the "can trade" line and the funding row; and
  every CSV named by the day in Singapore, a paper book's by its name.
  `portfolio-accounts` (the sign-in server): what the page keeps belongs to the account that signed in. A second
  account signed into the same tab through the page's own SIGN OUT (and SIGN OUT AND CONTINUE) is shown nothing of
  the first one's form; an expired sign-in keeps the form for the same account; nothing of a book is written to the
  device for a sign-in that is not to be remembered, nor from an answer that arrives after sign-out, nor of a deleted
  book; a create whose answer was lost announces no book that was not made.
  `portfolio`, `phone-portfolio` and `local-copy` also check the "personal use" lines, which are live on the published
  page, and `local-copy` opens the built site on both layouts to check the state the page's switch says: with it off,
  six tabs, no "PORTFOLIO" or "Portfolio" anywhere, `#portfolio/new` showing MARKETS, no portfolio route asked, and
  no file of the portfolio's screens or of its stand-in books among the published files.
  `cd web && npm run e2e` starts the test servers it needs and runs them all, three suites at a time: about 20
  minutes on the engineer's machine (1,206 s on 22 Nov 2026 for the 43 suites, with `header`; 1,204 s earlier that day
  for 42, with `portfolio-accounts`; 1,169 s
  late on 21 Nov 2026 for the 41 suites, with `nav-hold` and the wider
  drawings of the fixes after that day's checks; 1,136 s for the 40 suites with the paper portfolio's three; 1,029 s
  for the 37 suites and 2,337 checks before them, which took 977 s on GitHub; the 34 suites and 2,052 checks before
  that day's first three new suites took 14.5 minutes there and 13 on GitHub). `node e2e/run.cjs offline` runs one suite. Suites and servers are listed at the top of `web/e2e/run.cjs`.
  A suite that fails once is tried again; when the second try passes, the lines that failed the first time are
  printed all the same, so a check that fails only now and then can be found from the publish job's log.
  Needs Playwright's browser once: `npx playwright install chromium`.
- **Logic checks** (`sim/logic.test.ts`): exchange sessions (the page's and the server's copies give the same
  state for every market, and when a closed market next opens: across each change of clocks, a Friday close, a
  midday break, a holiday, an early close, a market that never closes), rolling bands, alert measures, the push encryption,
  the verification email for a new account, and every figure of the stock page (performance, ratios, statements
  as read from each source, big moves, the reading of a move's reason), every figure of an instrument's page (its
  units, volatility and percentile, largest moves, the table's anchors and statistics for a name it does not keep, the
  calendar's currencies and the headlines' words, and the fields a page from before still reads), moves in σ and their
  alerts (the σ of 63 daily changes in % or bp, the day against it live and closed, one alert per instrument and session,
  who is notified at which σ line; the last session's move against the 63 changes before it, a roll day within the new
  contract, which day a figure is of, and the three hours in which a new day shows the last session, on both sides of
  New York's change of clocks), the mark of a results date as Yahoo's flag gives it, the words for why a market is
  shut, a future's contract and its rolls (the trade date, a roll from the quote's contract,
  the session after it, the series with the step taken out, and the page's own lines for both), the server's reads
  for a stock's NEWS and an instrument's page run against a stand-in database that records each query, and the second path for prices (when the
  relay takes over and hands back, its timetable against the database's own), where a statements table wider
  than the screen comes to rest, the one formatting of figures, dates and words (`lib/fmt.ts`, `lib/time.ts`,
  `lib/labels.ts`), and the paper portfolio's engine (section [AF]: each start's defaults, ranges and refusals; cash
  + x% as one figure at EFFR and at TONA; the target volatility against the VaR limit, clear, warned and refused;
  the ladder's words; the next session and the targets' window; every route over a store kept in memory, with the
  statement first, a second account, the cap, a change's history and delete; with the server's switch off, all twelve
  routes refusing without reaching the store; the statement's words the same in the engine, the migration's seed and
  the owner's record; the page's copy of the engine equal to the server's files; no workflow, job or function naming
  a private table; both switches off; the "personal use" paragraph in this file word for word), the fixes after
  the checks of round 3b (section [AG]: which closes the table's last session takes, whatever order the stored
  closes come back in and however many rows an answer is cut at; a table kept on a device and read long after its
  answer; the week's first hours on a Monday; a results date that is past), the feed's health in the week's first
  hours, and the source probes' gates, run with a stand-in for `fetch` so that no request leaves the machine
  (section [AH]: which line of a site's terms holds its files, on the lines the logs hold and on sample sentences;
  the holds on an address as its request will go, and on every redirect; a `robots.txt` typed as HTML, and its
  Crawl-delay kept; a "legal" page that is not the terms; what `pf_jpx` may print of a page, which links it follows,
  and its calendar test by year, month and day; a distribution dated on a day without a session), and since 22 Nov
  2026 `pf_jpx` itself, run offline in seven ways with its `fetch` replaced (section [AI]: every address it asks, every
  line it prints; the terms gate's floor and the misses the review of fix part 1 named).
  `cd jobs && npx tsx ../sim/logic.test.ts`.
  The same command checks the file itself, in its last section. GitHub installs `jobs/` alone before it runs the
  logic checks (`logic-tests`, and `deploy-server` before a deploy), so nothing the file imports, directly or through
  another file, may reach a package of the page's (`web/node_modules`: React, uPlot). On a machine that has
  `web/node_modules` such an import loads all the same: on 21 Nov 2026 the file read a rule from `lib/nav.ts`, which
  imports React, passed here and stopped pull request #48's check on GitHub with "Cannot find module 'react'". The
  section follows the imports as they are written, from file to file, and walks the files the run really loaded; it
  fails on any machine, naming the file, the line and the way there. A rule of the page that the logic checks read
  therefore lives in a module that imports no package (`lib/pagetop.ts` beside `lib/nav.ts`), and a type from a
  module that does is imported with `import type`. To run the file exactly as GitHub does:
  `git archive HEAD | tar -x -C <an empty folder>`, then `npm ci` and the command above in that folder's `jobs/`.
- **Database checks** (`sim/sql`): the rules that live in database functions (the limits on verification emails;
  the queue for the reasons of big moves; the request for the second path),
  run with the migration file itself on PGlite, a Postgres inside Node; and the pattern an instrument's headlines are
  matched by in the database (`words.test.cjs`); and the market table's σ of daily changes and σ vs 1M avg against the
  server's own rule, rolls included, with the probe's record of futures and the alerts' and devices' new columns
  (`sigma.test.cjs`); and the paper portfolio's store (`pf.test.cjs`: the migration applied twice, statement by
  statement with a look after each, as a superuser, as a role that may make roles and as one that may not; no API
  role reading a table; one scenario of 56 calls run through the engine against the database's functions and against
  the local copy's store, every answer compared; the append-only and fixed-column rules tried from outside the
  functions; rows numbered inside their own book; the caps; `pf_selftest`'s verdict with a grant put back; an
  account's rows going with it); and
  the results mark's migration (`results-mark.test.cjs`: every stored "confirmed" becomes "not said", an estimate
  and an unmarked date stay as they were, and a second run changes nothing).
  `cd sim/sql && npm ci && npm test`.

The `deploy-web` workflow runs the browser and logic checks before it publishes: a failing check stops the publish.
A pull request that touches `web/` runs them without publishing. `logic-tests` runs the logic and database checks
when the server's functions or migrations, the page's `src/lib`, or the source probes change.

## Data sources (v1)

| Data | Source |
|---|---|
| Quotes, intraday bars, daily history | Yahoo Finance chart and spark endpoints (unofficial; delays declared per exchange). When the source stops answering the server, a job on GitHub pulls the same prices until the server's own answers are current again (the second path: `supabase/README.md`, "When the price feed stops") |
| US yield curve | US Treasury daily par yield curve CSV |
| JGB yield curve | Japan MOF `jgbcme.csv` |
| Policy rates | ECB, Bank of England and HKMA data feeds (`daily?job=policy`); Fed target range from the New York Fed's EFFR data (`jobs/fed.ts`, GitHub Actions). FRED supplied the earlier Fed history but refuses connections from GitHub's runners and the edge runtime |
| Economic calendar | FXStreet calendar API (consensus, previous, actual); ForexFactory weekly JSON as the fallback |
| News | RSS from publishers only: WSJ Markets, FT Markets, Nikkei Asia, CNBC (Markets, World, Asia), MarketWatch, Japan Times |
| Constituents | S&P 500, KOSPI 200 and Hang Seng: Wikipedia's lists; Nasdaq-100: Nasdaq's list; SSE 180: China Securities Index's file; Nikkei 225, with its weights: Nikkei Inc.'s weights file (personal use); TOPIX, with its sectors: JPX's list of TSE-listed issues, 東証上場銘柄一覧 (personal use) |
| Japan short selling | JPX: the short-selling ratio (空売り集計), the short-position reports (空売り残高報告) and the margin balances (信用取引現在高) (personal use) |

TOPIX has no Yahoo ticker: the `1306.T` ETF stands in for TOPIX (badge PROXY); its prices, intraday and daily, are Yahoo Finance's, and no JPX value of the index is read.

**Personal use** (the owner's decision of 20 Nov 2026). Files from JPX, Nikkei, JSF and fund issuers are used on the owner's statement that this Monitor's use is personal and non-commercial (20 Nov 2026). Each is credited where it is used.
Read today: JPX's list of TSE-listed issues (TOPIX's members and their sectors), its short-selling ratio, short-position reports and margin balances, and Tokyo's holidays from its calendar; Nikkei's file of the Nikkei 225's members and weights. No JSF or fund issuer's file is read yet.
Not used, by the owner's decision of 21 Nov 2026: JPX's TOPIX weight file, its lending-fee file (品貸料), its margin balances by name, Osaka's settlement and volume pages and its results-date workbook (決算発表予定日); Nomura's holdings files; Cboe's VIX-family files.
On screen, every source line that names one of those files ends "· personal use": EQUITIES' SHORT INTEREST and
SCREENER (the member lists of TOPIX and the Nikkei 225) and a Tokyo stock's SHORT INTEREST, on both layouts; a
sentence that names JPX's holiday calendar in passing carries "(personal use)" right after it (an "opens …" line's
tooltip, a phone's opened Tokyo row on a holiday, Help's "Holidays · scheduled"). In the one-screen layout a source
line too long for its head is drawn in a short form that keeps the publisher, every as-of, a state (INTRADAY,
STAND-IN) and "personal use": "JPX · personal use" on SHORT INTEREST, with the whole line as the head's tooltip; it is
never cut. On a computer the two words open Help at "Data sources · personal use" (in FULL too); on a phone the source
line opens a card with the publisher, the file and the same paragraph. The words are in `web/src/lib/labels.ts`; the logic checks compare this
paragraph with them, and `phone-portfolio` and `portfolio` check the lines on both layouts.

### When a closed market opens (since 2026-11-21)

Wherever the Monitor says CLOSED it says when that market next opens, in SGT: "opens 22:30 SGT" when that is today
in Singapore, "opens 23 Nov 22:30 SGT" on another day. Nothing is fetched for it.

| On the page | Where it comes from |
|---|---|
| The time | The start of the market's next regular session in the session table (`web/src/lib/sessions.ts`; the server keeps the same table in `supabase/functions/_shared/sessions.ts`, and `sim/logic.test.ts` checks that the two agree). Each exchange's hours are in its own time zone, so a change of clocks there moves the time by itself: New York opens at 22:30 SGT in its winter and 21:30 SGT in its summer |
| Currencies and CME Globex | Kept by New York's clock. The FX week runs from Sunday 17:00 to Friday 17:00 there, the server's own rule for when currencies trade (`fxTrading` in `_shared/feedhealth.ts`): Monday 06:00 to Saturday 06:00 SGT in New York's winter, 05:00 to 05:00 SGT in its summer. Until 21 Nov 2026 both session tables kept it as Monday 05:00 to Saturday 06:00 SGT all year, so a pair read "opens 05:00 SGT" an hour early in winter; `sim/logic.test.ts` now holds both tables to `fxTrading` at every half hour of 2026 and 2027 (bar its 25 December and 1 January, which the tables do not hold). Globex: Sunday 18:00 to Friday 17:00 there, with a break from 17:00 to 18:00 each day. What the feed itself does at the two ends of the FX week is in the probe's log of 21 Nov 2026 (`jobs/probes/sessions_check.ts`, four weekends): Yahoo's bars for USD/JPY end on Friday at 16:55 to 17:00 New York and EUR/USD's at 17:25, and both begin again on Monday at 00:00 UTC (08:00 SGT), two hours after the table opens the week in New York's winter and three in its summer. From the table's opening to that first bar a pair is open by the timetable while its row is still Friday's close. The feed's health does not take Friday's prints for a stopped feed in those hours (`feedState` in `_shared/feedhealth.ts`, since 2026-11-21): from Sunday 17:00 New York until half an hour after Monday 00:00 UTC a currency's or a future's print from before the weekend is not counted, and one that has printed since is judged as at any hour; the rule of 19 Nov would have raised DATA ✕ and the red bar from Monday 06:30 SGT, and asked the second path to take over, on its first Monday. The probe read two pairs only; the minute job's own log of the two Sunday evenings on record (8 and 15 Nov 2026, New York's winter; the live check's part `sundays`) shows every pair then due answering with Friday's bar and none adding a bar from 21:00 to 23:00 UTC, and the CME futures' first bars of the week at 23:14 to 23:23 UTC. The probe's first section prints, for USD/JPY and ES=F by the minute job's own request, the first one-minute bar after the last gap of two hours or more, the newest (the time the server reads) and the count, when it is run on a Sunday between 22:30 and 23:59 UTC (best from 23:45) |
| Holidays | The rows of `sessions_cal`, which the page receives with `health`: Tokyo's from JPX's calendar (personal use) and New York's from NYSE's, each for 2026 and 2027, checked against the publishers' own pages on 7 Nov 2026 (migration `20261107000010`). A next open passes over them |
| Early closes | New York's, at 13:00 there: 27 Nov and 24 Dec 2026, 26 Nov 2027, 3 Jul and 24 Nov 2028, as NYSE's page "Holidays & Trading Hours" gave them to the source-probe `pf_rules` on 20 Nov 2026 (its lines are quoted in the session table). After one the market is CLOSED on the page and on the server |
| ", scheduled" | Every other market (Hong Kong, Shanghai, Seoul, Taipei, Mumbai, Singapore, Sydney, Frankfurt, Zurich, London, São Paulo, Mexico City, CME Globex, FX), New York and Tokyo after 31 Dec 2027, and any market when the calendar did not load: the Monitor does not hold those holidays, so the time is the timetable's and says so; on a local holiday the market stays shut |
| LAST PRINT, with what the Monitor knows | A row that is not live while its market's timetable has a session is not called CLOSED. In a session's first minutes on a delayed feed (its start plus the feed's delay, and fifteen minutes more): "first print due ~08:20 SGT". After them, for Tokyo and New York, whose holidays are held: "open since 08:00 SGT". For every other market: "session 16:00–00:30 SGT, scheduled" (the FX week: "session to 28 Nov 06:00 SGT, scheduled"): on a local holiday the Monitor does not hold there is no session, and it does not say the market is open |
| "next read 22:30 SGT" | The dollar index (`DX-Y.NYB`, ICE), the Cboe yield indices (`^FVX`, `^TNX`, `^TYX`) and `^VIX` and `^VXN` carry the market `NYSE` in the instruments table: that is when the server reads them, not their venue's session, and the Monitor holds neither Cboe's nor ICE's hours. The page's rule (`readInNewYork` in `web/src/lib/opens.ts`): a row whose market is `NYSE` and whose class is not Equities. Outside New York's session such a row says LAST PRINT and when it is next read, never CLOSED, an opening or NYSE's early close |
| A stock's page | The stock route sends no live state: the page reads it from the session table and the quote's own time (the exchange from the symbol's suffix, as the server's alerts do), so the chart says LIVE in the exchange's hours and CLOSED with the opening outside them. A stock on an exchange the table does not keep (`MC.PA`) says neither |

The words are made in `web/src/lib/opens.ts`. A midday break gives the afternoon's start; crypto, which never closes,
and an official yield, published once a day, have no such line.

Since 21 Nov 2026 a table says it without a hover too. The first line above the MARKETS table, RATES & FX's FX table
and WATCHLIST's names (above the list on a phone), in the scrolling and the one-screen layout, reads "Closed now: New
York opens 22:30 SGT · Hong Kong and Shanghai open 23 Nov 09:30 SGT, scheduled · Tokyo (holiday) opens 24 Nov 08:00
SGT · next read 22:30 SGT: VIX, DXY, UST 10Y" (`closedLine` in `web/src/lib/opens.ts`, `components/ClosedNow.tsx`):
the markets of that table's own rows that are shut, the soonest to open first, markets that open at the same moment in
one entry, the reason in brackets where the Monitor knows one (a holiday in a calendar it holds, a midday or daily
break, an early close today), then the rows it only reads in New York's hours. A holiday that an opening passes over
stands after it: on a Saturday before Tokyo's holiday of Monday 23 Nov, "Tokyo opens 24 Nov 08:00 SGT (23 Nov:
holiday)". While none of the table's markets is shut but a row is read only in New York's hours and New York is
shut, the line is its last part alone, with no "Closed now:" before it: "Next read 22:30 SGT: DXY" above RATES &
FX's FX table on a weekday, where the dollar index's row holds last night's print. With neither, the line is absent.
In the one-screen layout a page's own chart (a stock's, an instrument's, EQUITIES' index) keeps its stamp with the
opening after it; the small tiles there show neither.

Why a market is shut is on screen as well (the designer's D-65, 21 Nov 2026; it was in tooltips, and a phone has
none). Under a name in a phone's lists the state word is the reason: "Holiday", "Midday break" ("Daily break" for
Globex), "Closed early", and "Closed" where the market is shut by its hours; the opened row says it in full ("market
closed: a holiday in JPX's calendar (personal use) · opens 24 Nov 08:00 SGT"). A page's own chart begins the line after its stamp
with the reason, on both layouts: "holiday · opens 24 Nov 08:00 SGT", "midday break · opens 11:30 SGT", "early
close · opens 30 Nov 22:30 SGT", and names a holiday that the opening passes over ("opens 24 Nov 08:00 SGT · 23 Nov:
holiday"). The small chart tiles keep CLOSED and the opening until their head is rebuilt. The reasons come from the
same session table and calendar rows as the times (`SessionNote.why` and `skipped` in `web/src/lib/opens.ts`).

An old price in market hours says how old it is (D-66): a row with no live price while its market's timetable has a
session, after the session's first minutes, reads what its figure is as of under its name on a phone, in amber,
"Last print 08:40" ("Last print 20 Nov 14:30" for an earlier day, "Last close 23 Nov" for a booked close) where it
read "No new print"; on a tile and on a page's own chart the stamp's LAST PRINT is amber. A row read only in New
York's hours keeps the usual colour while New York is shut: its print is not late.

### Moves in σ (MARKETS, since 2026-11-20)

| On the page | Where it comes from |
|---|---|
| MOVERS IN σ (the ten largest of the day, any class) and the 1D IN σ column | Worked out by the Monitor from its stored daily closes (`_shared/sigma.ts`, and the database's `fn_table_stats` with the same rule): the day's change over the standard deviation of the instrument's own daily changes in the 63 sessions before it, a yield's in points of its level (bp), a price's in per cent. The newest change is never in its own yardstick. An official-curve yield's day counts once it is booked (Japan's, the euro area's, the UK's and Canada's curves are published a day late; the US Treasury's on the day itself, and its tooltip says "its newest published day"). Each figure's closes are on its tooltip |
| TODAY · LAST SESSION (since 2026-11-21) | A currency's day ends at 17:00 New York and a CME future's with it, so at 07:00 SGT their day is an hour or two old and the strip had lost the session that had just ended. LAST SESSION is each instrument's newest completed day: the change between its two newest booked closes over the σ of the 63 daily changes that end at the earlier of them (`lastSession` and `tableLastSession` in `_shared/sigma.ts`, sent with each row of the table as `ls`; the database's `sd63x`, which never holds the change it measures). A roll day is counted within the new contract; where the size of a change of contract is not known there is no σ. A day is "completed" here once it is booked, by the run of 22:35 UTC (06:35 SGT): a currency's 35 minutes after 17:00 New York in its winter and 95 in its summer, and a CME future's with it in New York's winter. In New York's summer (from 15 Mar 2027) the booking run of 22:35 UTC finds Globex open again and leaves a future's day to the run of 07:05 UTC, so from Tuesday to Friday a future's LAST SESSION is the session before, with its date, until 15:05 SGT; booking a future's day by CME's trade date is in the backlog. The page opens on TODAY. No new source and no migration |
| The date beside a figure | A figure that is not of today in Singapore carries its day ("20 Nov"): on the strip and a phone's cards, after the name in the table, in a phone line's pill in place of "1D", and in the strip cell's and the name's tooltips (the table's 1D IN σ tooltip gives the last session's date). The table's CSV gives it in a column of its own after the name ("Figures of (blank: today in SGT)"; from a server that sends no days, "Figures of (not known: this answer carries no days)"), with the row's marks (ROLL, PROXY, DELAYED ~10m, LIVE) in another; until 2026-11-21 both ran into the name ("S&P 50023 Nov"). The file is named by the day in Singapore (until 22 Nov 2026 by the UTC day). A row the answer called live whose print is older than its feed's delay and a few minutes (a kept table, refreshes that fail) carries no LIVE or DELAYED mark: its day stands after its name. A table kept on a device and read long after its answer came counts a row as live only while its print is recent (the feed's delay, fifteen minutes and three more: `stillLive` in `web/src/lib/movers.ts`), so an old print carries its day. The day is the row's own (the SGT date of its last print, or the date of its booked close or published yield), so nothing is worked out for it. Under LAST SESSION every figure carries its session's date. A server from before sends no `ls`, and the page then shows neither the choice nor a day |
| "last session -2.2σ" under a figure | For three hours after 17:00 New York (to 09:00 SGT in New York's winter, 08:00 in its summer) a currency's cell on TODAY shows the session that has just ended under the new day's figure, once that session is booked (06:35 SGT) and has a σ (`youngDay` and `showsLast` in `web/src/lib/movers.ts`); a phone's opened row says the same in words, as it has no tooltip. A CME future's cell does not from Tuesday to Friday: in New York's winter the server dates a future's quote by New York's calendar day, so until midnight there its row is the booked close of the session that has just ended, with its date beside it, and the figure is that session's own; in New York's summer the run of 22:35 UTC does not book that session (Globex is open again), so until the run of 07:05 UTC (15:05 SGT) the row is the live print, its 1D from the close before that session, over two sessions, with no date. On a Monday morning no day has ended since Friday's, and in New York's winter a pair's and a future's cell both show Friday's session under the new week's figure, from the week's first print until three hours after Sunday 17:00 New York (since 2026-11-21; before, the three hours were counted from Friday's bell and the line never showed on a Monday); in its summer those three hours end at 00:00 UTC, as a pair's first bar comes, so a pair's cell does not. The local copy shows the line under a future on every morning, which the live Monitor does not |
| σ moves in the alert list and as notifications | The same figure, for every currency, yield, commodity, volatility index, future and coin (the equity indices keep their ±3% alert): raised from 2σ, one per instrument and session, updated while the move grows; the lists everyone reads show them from 2.5σ, and each device chooses its kinds and its own line (2, 2.5 or 3σ) in Notifications. Each names its σ, its window and its source |

### A future's contract and its rolls (B-27, since 2026-11-20)

The Monitor's futures (ES=F, CL=F, GC=F …) are Yahoo's front-month series: on a roll day the series moves to the next
contract without adjustment, and that step is not a move. With each minute's prices the Monitor reads which named
contract Yahoo's quote is on (`underlyingSymbol`; its short name can lag a roll) and that contract's own previous close,
and records a roll when the contract changes (`fut_contracts`, `fut_rolls`; `_shared/futures.ts`). A roll day's 1D is the
change within the new contract (MARKETS marks it ROLL), and the change of contract is left out of the 1D in σ and its
63-session σ, σ vs 1M avg, the σ alerts, and the page's realised volatility, its percentile and the largest rise and fall.
Where the source did not give a change of contract's size, σ vs 1M avg is none (a dash, on MARKETS and on the page alike)
while its 21 closes hold that change, and on a roll day whose size is not known.
The page names the contract, its expiry and the last change of contract (labelled Yahoo Finance (unofficial), as the
owner decided for Yahoo's named contracts), and marks each roll on the chart. Yahoo keeps no expired contract, so rolls
before the Monitor's record are not known: the record starts with what the source probe of 20 Nov 2026 read (five rolls
of that day measured; earlier ones in its six months dated, their change of contract not known, those days left out),
and the page says from when it runs. The 52-week range, vs 200D and the changes over 1W to
36M stay the series' own.

A new source is tried from GitHub's machines before a job is built on it: a read-only script in `jobs/probes/`
(the pattern is `jobs/probes/example.ts`), run by the `source-probe` workflow on the branch that holds it
(Actions › source-probe › Run workflow). It writes nothing and is given no secrets, with one exception asked for by
name: the input `sec_user_agent` = true gives the probe's own step, and no other, the secret `SEC_USER_AGENT` (the
contact the SEC asks automated readers to declare), which a probe of sec.gov (`pf_sec`) sends only as its User-Agent
and never prints.

Since 21 Nov 2026 (the paper portfolio's second run of probes, `pf_*`) a probe reads a site's `robots.txt` before any
page or file of it, does not ask a path that file holds, and says what it read and what it did not (`robots()` in
`jobs/probes/lib.ts`: a `robots.txt` that answers 404 or another 4xx, or with an HTML page in its place, is "no
robots.txt read", never a file that allows, and the probe reads on, as RFC 9309 reads a 4xx; a file of directives is
the site's rules whatever type it is served as; one that answers 5xx holds every path; one that answers 429 is asked
once more; a Crawl-delay longer than the probe's own pace is kept, up to thirty seconds). Whether a site whose
`robots.txt` answers 401, 403 or 418 should be read at all is a question put to the owner: until it is answered a probe
still reads such a site's pages and says so, and sends it no form (`pf_rates` holds its one POST there). The probes of
publishers' files (`pf_bench`, `pf_borrow`) also read the site's terms, by its own link, before any data file of it
(`readTerms()`, `termsBar()`): a line that forbids automated reading, or that forbids copying, reproducing, storing or
redistributing and names no purpose the ban is limited to, holds that site's files and is printed for a person to read,
and that finding goes to the owner; a page reached by a "legal" link counts as the terms only when its title or first
heading names them and its lines cover two of the subjects the gate reads or carry a ban (since 22 Nov 2026: by its
name alone, or by two stray lines, a page counted as the terms read), and where no terms are found the files that need
them stay unread. Until 21 Nov 2026 the gate knew a ban only by the wordings it was modelled on (a word of
automated reading; "any purpose", "any form", "any means"; JPX's, Nomura's and Cboe's lines): it printed "none matched"
above iShares UK's sentence that forbids copying and reproducing, and `pf_bench` went on to ask that site's product
data (the address answered 404; nothing was read). The probes of governments', central banks' and regulators' own pages (`pf_rules`, `pf_holidays`, `pf_rates`) read
`robots.txt` only. The helper also refuses three kinds of address outright, whichever probe asks, reading each address
as its request will go (the host without a trailing dot, escapes decoded) and putting every redirect to the same test,
one hop at a time: `jpx.co.jp`; Cboe's VIX-family history files; Nomura's holdings files. On `jpx.co.jp` the files of
the owner's first answer below, the list of triggered short-selling stocks and the list of ETFs are held by their paths
as well, so they stay held while `pf_jpx` reads the site (since 22 Nov 2026; until then lifting the site's hold left
nothing held there). On JPX the owner's answers of
21 Nov 2026 are: do without its new files (the TOPIX weight file, 品貸料, margin balances by name, the OSE settlement and
volume pages, the 決算発表予定日 workbook), as without Cboe's and Nomura's; and, asked whether that covers the rest of
JPX's site, "(c) all": its rule pages, its market-holiday calendar and two statistics may be read. Its list of ETFs was
not asked about and stays held. Only `pf_jpx` lifts the helper's hold on `jpx.co.jp`, for its own run, behind three
switches: rules and calendar on, etfList off. It asks only addresses on `jpx.co.jp` that the log of 20 Nov gave or that
a JPX page links by name (and whose own title or first heading does not name a list, figures or a report), never one
from memory, and prints only values: a table's cells under its heading or the short label before it, a page's clock
times, dates and percentages in order with at most the one joining word between two of them and none around them
("9:00 am to 11:30 am"), each page's own title, a holiday as its date, and nothing that reads as a sentence however
short (`jobs/probes/jpx_read.ts`; until 22 Nov 2026 a value came with two words on each side, and the pieces of one
paragraph overlapped so that consecutive lines gave its sentences back;
its first run, on 21 Nov, printed whole lines of JPX's pages into the public job log and asked one address from memory,
JPX's daily list of triggered stocks, which is not a rule page). The Monitor's own jobs, which read the JPX and Nikkei
files it has always read, do not use that helper and run as before. A feed the Monitor already reads is not stopped by
a probe's finding: for Yahoo Finance, `pf_yahoo_hist` prints what its `robots.txt` and its terms say, for the owner,
and the probes of Yahoo read on.

### The stock page (`#asset/SYMBOL`, since 2026-11-18)

| On the page | Where it comes from |
|---|---|
| Chart with σ corridors and volume; price history; PERIOD 1D to 36M, and 5Y and 10Y (since 2026-11-20) | Yahoo Finance daily and intraday bars (split-adjusted, dividends not included; ten years of daily bars) |
| Change over 1D, 1M, 3M, 6M, 12M, 36M, 60M against the benchmark | Worked out from those bars (`_shared/stockstats.ts`). Tokyo names are set against the Nikkei 225 and TOPIX; TOPIX is read from the `1306.T` fund (PROXY). Other names against their home index |
| 52-week range, volatility, beta, largest fall, average daily volume and value | Worked out from the same bars |
| Market cap, shares outstanding, float | Yahoo Finance quote and key statistics |
| Next results (the date alone since 2026-11-20) | Yahoo Finance's quote gives it as a moment (`earningsTimestamp`), and in the source probe of 19 Nov 2026 that moment was a market's close (15:30 in Tokyo for Toyota, 16:00 in New York for NVIDIA), not a time the company announced. So every screen shows the day in the company's own market (`web/src/lib/results.ts`: NVIDIA's 17 Nov stays 17 Nov, although it is the 18th in Singapore), with confirmed or est. as Yahoo marks it (a dash where Yahoo gives no mark: since 2026-11-20 the results calendar's route passes a missing mark as none, where it used to send it as confirmed), and no time of day: KEY DATA, WATCHLIST and NEWS › Results calendar alike. The mark is Yahoo's `isEarningsDateEstimate` and nothing else (A-37, since 2026-11-21): until then the server (`earningsOf` in `_shared/yahoo.ts`) wrote "confirmed" by a rule of its own whenever the date was `earningsTimestamp` and `earningsTimestampStart` was another value or absent, whatever the flag said. WATCHLIST's MY NAMES writes the mark after each date as RESULTS AHEAD does ("conf.", "est.", or a dash where the source gives none); it wrote "est." or nothing, so a confirmed date and an unmarked one read alike. A mark the old rule may have stored for an index member cannot be told from one of Yahoo's, so the migration of 2026-11-21 (`20261121000002_results_mark_as_given.sql`) turns every stored "confirmed" into "not said": such a date reads a dash (a Tokyo company's stays est., only its tooltip's words change) until its list's next weekday quote run writes Yahoo's own flag again, and the page says what such a dash is: the source gives none, or the Monitor has not read it again since 22 Nov 2026. MY NAMES shows a stored date for a day after it has passed and then a dash (`resultsAhead` in `web/src/lib/results.ts`, since 2026-11-21), as RESULTS AHEAD leaves it out; before, a Friday's date stood there through the weekend. Which shapes Yahoo really sends: the probe `jobs/probes/pf_yahoo_hist.ts` printed every field of the quote named "earnings…" for 7203.T, 6758.T, NVDA and AAPL on 21 Nov 2026, each moment in UTC, JST and New York's time (`pf_yahoo.ts` prints the same in a session). All four carried a start, and the old rule and the new give the same mark on each, so that log cannot say whether the old rule ever wrote a "confirmed" of its own on a real name; how many index members and watchlist names come in each shape is not counted by anything yet. A Tokyo company's date is marked est. whatever Yahoo marks, until its date and "confirmed" come from JPX's 決算発表予定日 (A-30), which comes later |
| Short interest | Tokyo: the positions of 0.5% and above reported to JPX (personal use; already stored for the EQUITIES tab). Elsewhere: the exchange-reported short interest Yahoo republishes, with FINRA's daily short-volume share beside it |
| Statements (income statement, balance sheet, cash flow), ratios, guidance | Tokyo: EDINET DB (有価証券報告書 and 決算短信): ten fiscal years, the company's guidance with later revision notices and the progress against it, and twelve single quarters as EDINET DB derives them. Share counts are the company's own from its latest 決算短信. Yahoo stands in, and the page says so, when no EDINET DB key is set or the day's allowance is used up. Elsewhere: Yahoo Finance fundamentals (about four years and five quarters; no guidance), with the lines of a company reporting under US GAAP or IFRS; a line the company does not report is left out |
| A column's document (since 2026-11-20) | The address the source gives for it, never a made-up one: a year's 有価証券報告書 on EDINET (`edinetFilingUrl`, unless EDINET DB's `edinetFilingUrlAvailability` says the filing has aged out of EDINET's ~10-year retention: then no link, and the header's tip says so), the 決算短信 PDF of the guidance, of a quarter or of a year known only from it (`pdfUrl`, which EDINET DB gives on some rows only). A header without an address is plain and says so. Yahoo gives none |
| Fiscal year end, accounting standard, annual report (Tokyo) | The latest 有価証券報告書 in EDINET DB's answer |
| News: headlines and alerts naming the stock (since 2026-11-20) | The Monitor's own tables: headlines from the publishers' feeds on NEWS whose companies include the stock, and the Monitor's alerts on it, over 90 days |
| Big moves and why (companies of 1tn yen / 10bn US dollars and above) | From the bars (`_shared/bigmoves.ts`): a day of 10% or more, and the peaks and bottoms of the closes (large circles: turns of 15%; small circles: turns of 10%; the circles and dots: a peak red, a bottom green; the figures in their sign's colour). Each reason from a web search by the `move-causes` job, kept only with the reports behind it |

### An instrument's page (`#asset/USDJPY%3DX`, `#asset/JGB10Y`, `#asset/GC%3DF` …, since 2026-11-20)

A currency, a yield, a commodity, a future or an index gets a page of its own instead of a stock's (an index with a page
on EQUITIES, such as the Nikkei 225, keeps opening there). On a computer every instrument name on MARKETS and RATES & FX
opens it (the name a teal link, the whole row a pointer, a chart tile's title a link); on a phone, "Open … page".

| On the page | Where it comes from |
|---|---|
| Chart with σ corridors; PERIOD 1D to 10Y (an official yield: 3M to 10Y, it is published once a day) | The Monitor's own series (the market table's instruments) or Yahoo Finance's bars for a name found by search |
| Last, the day's change, previous close, the change over 1D to 36M, σ vs 1M avg, 52W range, vs 200D | A Monitor instrument: MARKETS' own figures, from the same market table, so the page and MARKETS agree. A name found by search: its Yahoo quote and daily closes, with the table's rules |
| The day's range | The Yahoo quote's session high and low; none for an official yield |
| Realised volatility 1M / 3M / 12M and its percentile among three years of daily readings; the 52-week high and low with their dates; the largest rise and fall of 12 months | Worked out from the stored daily closes (`_shared/instrstats.ts`), marked † on both layouts with a line under KEY DATA naming the closes and their dates. A yield in bp of its level (bp a day, bp a year), a price in per cent. A future's changes of contract left out (above) |
| A future's contract and its last change of contract (since 2026-11-20) | Yahoo Finance's quote: the named contract it is on and that contract's expiry, as the Monitor has recorded them, with its rolls (above) |
| Events | The economic calendar the Monitor stores (FXStreet, ForexFactory as the fallback): the events of its currencies, five days back and eight ahead. A pair's two currencies; an index future's index's currency first, then the one it is quoted in where that differs (the CME's Nikkei 225 future: JPY and USD); otherwise the currency it is quoted in (`_shared/instrfeed.ts`). The banks' next meetings: a dash, "not kept yet", on both layouts until the Monitor keeps their calendars |
| News | The Monitor's own headlines of the last 30 days whose title holds one of the instrument's words (USD/JPY: yen, JPY, BoJ, Bank of Japan; the page names them, `_shared/instrfeed.ts`), and its own alerts on it |

A yield's every change, distance and volatility is in basis points of its level, never a per cent of it. A yield read
from an official curve (US Treasury, Japan MOF, Bundesbank, ECB, Bank of England, Bank of Canada) names its publisher and
the day it was published for. Its drivers and stress episodes join with a later increment, and the central banks' next
meetings once the Monitor keeps their calendars: until then those places are empty, never filled with a guess.

A figure a source does not give is shown as a dash. Nothing on the page is estimated; the two sums made on the
page itself (net cash, free cash flow) say so where they stand. A Japanese company's table keeps the lines of
Japanese statements (ordinary profit, extraordinary items); a company elsewhere gets R&D, net interest and other
income, pretax income, income tax, buybacks, dividends paid and stock-based compensation instead (`LAYOUT_JP` and
`LAYOUT_FOREIGN` in `_shared/fin.ts`). One unit (m, bn or tn) is chosen per company from
its revenue and written once, in the statements table's header.

## The paper portfolio (P-1, built on 2026-11-21; not on the published page yet)

A private paper book per account: no real orders, no broker, no money, and visible to the account that made it only.
P-1 is its first step: the statement an account agrees to once (version 1, the owner's wording), NEW PAPER PORTFOLIO
with three absolute-return starts (Equity long/short · Japan, Equity long/short · Global, Global macro) and two
relative-return starts that are named and not offered yet, the two targets (cash + x% a year and a target volatility)
with what they mean together, the ladder and its three bases, a book's Overview and Settings with a reason asked for
every change and a history that is only ever added to, notes of up to 2,000 characters, and delete after typing the
name. There are no orders, no NAV and no limits at work yet: the book's page says so in one line.

- **Where the rules live.** `supabase/functions/_shared/pf/` is the engine: the five starts' defaults, ranges,
  reasons and whose each is (`presets.ts`), the form's rules and refusals (`form.ts`), the targets' arithmetic and the
  ladder's words (`targets.ts`), the next session and the targets' window (`calendar.ts`), what a screen reads from the
  stored rows (`view.ts`), and the routes over a store (`route.ts`). Pure TypeScript: no database, no clock of its
  own, no package. The server runs it over the database's functions (`_shared/pfstore.ts`); the page has a copy
  (`web/src/lib/pf/`, written by `node tools/sync-pf.cjs`) so the form on screen and the server refuse by the same
  rules in the same words; the local copy runs the same routes over a list kept in the browser (`lib/mockPf.ts`).
- **Who sees what.** A portfolio's rows are reached only through database functions that answer for one account
  (`supabase/README.md`, "The paper portfolio"). No workflow, job or log names a private table or a function of the
  store, or prints a row: the live check's part `pf` calls one function that returns counts and prints
  `pf_selftest ok`, and fails the run when a wall is down (deploy-server runs it after each deploy). On the device:
  a form's unsent drafts, one per start with the name typed (UI-4), belong to the account that typed them (dropped for
  another account, removed at SIGN OUT); a
  book's last answers are kept on the device for a week only where the sign-in is remembered, and in memory for the
  tab otherwise; an answer that arrives after its sign-in ended is not kept; a deleted book's answers go with it; a
  start that finds no sign-in empties what an ended session left.
- **Dates and times** (the designer's B.0.1 and B.0.2 of 22 Nov 2026). A moment (a book made, a note, a change saved)
  is written in SGT with its zone, "21 Nov 2026 17:02 SGT", or bare under a head that says "times in SGT" (NOTES,
  ACTIVITY) and in HISTORY's WHEN (SGT) column. A book day, the day whose NAV is struck at 17:00 New York, is written
  with its weekday, "Mon 23 Nov 2026", in every panel whose head says "a day ends 17:00 New York"; where one is promised
  the moment it begins follows: "In force from Mon 23 Nov 2026, 06:00 SGT". A book's own start on its strip, the
  phone's head and the lists is the SGT day it was made, "created 22 Nov 2026". The targets' window opens with the book
  day of 1 Dec (PM A's answer of 22 Nov 2026), "re-set only from 1 Dec, 06:00 SGT, to a January reset": 17:00 New York
  on 30 Nov, the kind of moment every "in force from" uses (built from one constant of `calendar.ts`; until 22 Nov it
  opened at 00:00 New York on 1 Dec). The database's own second refusal keeps its words of 21 Nov until a migration
  replaces its function.
- **When a change is in force** (EN-9, the PMs' answers of 22 Nov 2026; `calendar.ts` `changeDays`). From the session
  that opens next: the book day running counts until the first regular session in it has opened on an exchange where
  the book's stocks trade (Tokyo for the Japan start, and New York where it may hold names listed outside Tokyo; Tokyo or
  New York for the Global start; a CME future's or a currency's hours do not count for an equity book). So at 07:30 SGT
  on a Tokyo trading day an equity book's change is "In force for Tue 24 Nov 2026's sessions (Tokyo opens 08:00 SGT)",
  in force at once, and on Tokyo's holiday at 10:00 SGT it counts for that day's New York session. The macro book's day
  has begun at its first moment (FX from 17:00 New York), so its changes wait for the next book day, as before. The
  database's own guard is told the last book day the book's markets have traded in: a change is never in force in one
  of those.
- **A pending change taken back** (RT-3, EG-3; the PMs' answers on R-53). The value in force typed again while a change
  waits takes that change back: the form says "back to the value in force: the pending 15% is withdrawn", HISTORY's
  row reads FROM the pending value TO the value in force with "back to the value in force: the pending 15% taken back
  before it was in force", ACTIVITY the same, and the value in force keeps its own BY and SINCE before and after the
  day the pending one would have come into force.
- **Notes held.** A book holds at most 500 notes (a removed one counts); from 450 a line under the box says how many
  are left ("50 notes left: every note is kept"). Raising the bound waits for the notes to be read in pages (PM A asks
  for 5,000, PM B for 2,500).
  A table's CSV is named by the day in Singapore, `orrery-markets-2026-11-22.csv`; a paper book's
  `orrery-paper-<book>-<panel>[-history]-<day>.csv`, `<book>` its name in letters and figures of any script, "-2" for a
  later book with the same file name.
- **Addresses.** `#portfolio` (the book last opened on this device, else the list, else the starts),
  `#portfolio/all`, `#portfolio/new[/<start>]`, `#portfolio/<id>`, `#portfolio/<id>/settings[/<section>]`. `<id>` is
  the portfolio's own id, never its name.
- **The local copy.** Three stand-in books to start (`om_mock_pf` in the browser's storage: one with every default,
  two changes and four notes; one on a yen base with a 60-character name; one macro book), `?mock=empty` (no book, an
  account that has not agreed), `?mock=cap` (five open books), `om_mock_pf_account = "2"` (a second account, which
  sees none of them), `om_mock_pf_refuse` = `1` · `offline` · `signedout` (a write that fails each way),
  `om_mock_pf_delay` = `400` (every write answered after that many milliseconds), `om_mock_pf_off` = `1` (the stand-in
  server's paper switch off: every route answers "Paper portfolios are not available yet."). With
  `om_mock_now` = `2026-12-15T02:00:00Z` the targets' window is open. `om_paper = "0"` shows the local copy as the
  published page is today, with six tabs.

### The paper portfolio's two switches

P-1 to P-4a go live together: a book whose limits and ladder are not yet enforced would start a record under rules
that change midway. Until P-4a is accepted both switches are **off**:

| Switch | File | Off (today) | On |
|---|---|---|---|
| the page's | `web/src/lib/paper.ts`, `PAPER_ON_LIVE_SITE` | the published page has six tabs and six bar items, keys 1 to 6, and `#portfolio` opens MARKETS as any unknown address does; the portfolio's screens are not in the published files (a build with the switch off does not make their file) | the seventh tab PORTFOLIO, the seventh bar item, key 7, the route |
| the server's | `supabase/functions/_shared/pf/switch.ts`, `PAPER_ON_SERVER` | every portfolio route of the API answers 404 "Paper portfolios are not available yet." before it reads or writes anything; the tables are deployed and stay empty | the routes answer for the signed-in account |

Development servers (the local copy, the checks' stand-in servers) always show the paper book. To turn it on for
users, set both constants to `true` in one pull request, when P-4a is accepted; the site and the server are published
minutes apart, and in between a page that asks a server still off shows the server's sentence and nothing else
breaks. `web/e2e/local-copy.cjs` checks the built site for the state the page's constant says (with it off: no
"PORTFOLIO" and no "Portfolio" anywhere on the page, `#portfolio/new` showing MARKETS; on: the seventh tab and the
form, not the crash notice), `web/e2e/offline.cjs` counts the bar's items the constant says (six or seven), and the
logic checks that the two constants are the same and that a refused route reaches neither the store nor the server's
facts. So the pull request that turns the book on changes the two constants and nothing else; no check has to be
rewritten for it (since 22 Nov 2026: the logic file asserted both off, and the offline check six items).

## Morning Notes

`jobs/morning_note.ts` writes the note for 07:00 SGT, Monday to Saturday (Saturday's covers Friday's US session). Sunday has no note: the weekly view is the Friday Weekly Strategy (`.github/workflows/weekly-strategy.yml`, due 15:00 SGT). GitHub starts scheduled runs hours late, so `.github/workflows/morning-note.yml` requests the run early, waits until 22:15 UTC, and has two backup runs that write only when the note is missing; it can also be run by hand with a date and a dry-run option. It first builds a numbers pack from the Monitor's own data (market table, daily history for technicals, today's calendar, recent headlines) plus Yahoo daily closes for the S&P 500 and Nikkei 225 constituents (lists: Wikipedia and Nikkei's constituent CSV, cached in `jobs/data/`) and the US sector ETFs. Claude (web search; model and effort in `jobs/lib/llm.ts`) drafts the note strictly from that pack, citing every external claim, then reviews its own draft; a second call structures it; a check refuses any number that is not in the draft. The note, its sources and the pack are stored in `notes` and shown on the RESEARCH tab with the archive of earlier notes. GitHub secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
