-- The LIMIT UP / LIMIT DOWN chip's inputs (the owner's request of 24 Nov 2026; slice L-2 of C/limit-chip-plan.md). The
-- server works out, for each Tokyo row, whether the print it shows is at its daily price limit (_shared/rules/
-- pricelimit.ts, from the row's own figures: _shared/rules/limitrow.ts). The quote and statistics jobs keep what that
-- needs beside the quote they already store (q_price, q_prev, q_time: migration 20261119000001). Every column may be
-- null: nothing is known until a job writes it, and the rule then gives no chip. A server from before reads none of them.
alter table constituent_stats add column if not exists q_high    double precision;   -- the quote's day high (regularMarketDayHigh)
alter table constituent_stats add column if not exists q_low     double precision;   -- the quote's day low (regularMarketDayLow)
alter table constituent_stats add column if not exists prev_vol  double precision;   -- the stored quote's volume when a later session's quote came in
alter table constituent_stats add column if not exists prev2_vol double precision;   -- prev_vol as it stood then (the session before that)
alter table constituent_stats add column if not exists prev_qt   timestamptz;        -- the stored quote's time then: its session's last trade the job saw
alter table constituent_stats add column if not exists lim_run   smallint;           -- the run of limit closes or no-trade sessions up to the session before d: + up, - down
