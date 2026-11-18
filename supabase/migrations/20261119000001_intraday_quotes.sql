-- EQUITIES during a session (Shota, 19 Nov 2026: with the S&P 500 open, the tab still listed the movers of the
-- day before). The flow job already asks for every constituent's quote every ten to twenty minutes; it kept the
-- market value and the volume and dropped the price. The price is kept now, so the tab can show today's moves
-- while the market is open.
alter table constituent_stats add column if not exists q_price double precision;   -- the quote's last price
alter table constituent_stats add column if not exists q_prev  double precision;   -- the previous close it is measured against
alter table constituent_stats add column if not exists q_time  timestamptz;        -- when that price printed at the exchange (not when it was pulled)
