-- I-6 (20 Nov 2026): moves in σ and alerts on them (B-06 (a), B-03 (1) with B's per-device line), with B-27: a future
-- names its contract, and its roll days are kept out of moves, volatility, σ and the σ alerts.
--   1. fut_contracts, fut_rolls: the contract each future's quote names, session by session, and its changes of contract
--      (supabase/functions/_shared/futures.ts; written by the minute's work, _shared/tick.ts readFutures), seeded with what
--      the Monitor's source probe of 20 Nov 2026 read from Yahoo (C/probes yahoo_futures, run 44737367820, 12:38 UTC);
--   2. alerts: the kind 'sigma', its σ and its note (window and source), the σ last offered to devices;
--      push_subs: which kinds a device receives and its σ line (2, 2.5 or 3);
--   3. fn_table_stats: also the σ of daily changes over 63 sessions, with and without the newest change, roll days
--      counted within the new contract; σ vs 1M avg on a future set on its newest contract's level.

-- 1. futures ------------------------------------------------------------------------------------------------------------
create table if not exists fut_contracts (
  symbol     text not null,                 -- the Monitor's instrument (ES=F, CL=F …)
  d          date not null,                 -- the session: CME's trade date, as prices_daily dates the series' closes
  contract   text not null,                 -- the named contract Yahoo's quote is on (underlyingSymbol), e.g. CLF27.NYM
  expires    date,                          -- its expiry, from the contract's own quote (the =F quote's can lag a roll)
  prev_close double precision,              -- the contract's own previous close, as the quote gives it
  seen_at    timestamptz not null default now(),
  primary key (symbol, d)
);
alter table fut_contracts enable row level security;

create table if not exists fut_rolls (
  symbol        text not null,
  d             date not null,              -- the first session on the new contract
  from_contract text,                       -- the contract before, where it was read
  to_contract   text not null,
  prev_close    double precision check (prev_close is null or prev_close > 0),
                                            -- the new contract's own close on the session before d: that day's change is
                                            -- measured from it; null where the source did not give it (the day is left out)
  source        text not null,
  checked       boolean not null default false,   -- the session after it has been read (futures.ts checkRoll)
  seen_at       timestamptz not null default now(),
  primary key (symbol, d)
);
alter table fut_rolls enable row level security;

-- what the probe read on 20 Nov 2026 at 12:38 UTC: each future's contract that session, from its quote (the
-- contract's own expiry from that contract's quote; TIO=F's quote was from 11 Aug 2021 and is left to the first reading)
insert into fut_contracts (symbol, d, contract, expires, prev_close, seen_at) values
  ('ES=F',  '2026-11-20', 'ESZ26.CME',  '2026-12-18', 7197.25,  '2026-11-20 12:38:00+00'),
  ('NQ=F',  '2026-11-20', 'NQZ26.CME',  '2026-12-18', 26600.25, '2026-11-20 12:38:00+00'),
  ('YM=F',  '2026-11-20', 'YMZ26.CBT',  '2026-12-18', 49180,    '2026-11-20 12:38:00+00'),
  ('RTY=F', '2026-11-20', 'RTYZ26.CME', '2026-12-18', 2663.3,   '2026-11-20 12:38:00+00'),
  ('NKD=F', '2026-11-20', 'NKDZ26.CME', '2026-12-11', 57920,    '2026-11-20 12:38:00+00'),
  ('ZN=F',  '2026-11-20', 'ZNZ26.CBT',  '2026-12-21', 105.875,  '2026-11-20 12:38:00+00'),
  ('CL=F',  '2026-11-20', 'CLF27.NYM',  '2026-12-21', 82.44,    '2026-11-20 12:38:00+00'),
  ('BZ=F',  '2026-11-20', 'BZG27.NYM',  '2026-12-31', 89.44,    '2026-11-20 12:38:00+00'),
  ('NG=F',  '2026-11-20', 'NGF27.NYM',  '2026-12-29', 3.681,    '2026-11-20 12:38:00+00'),
  ('GC=F',  '2026-11-20', 'GCZ26.CMX',  '2026-12-29', 3685.5,   '2026-11-20 12:38:00+00'),
  ('SI=F',  '2026-11-20', 'SIZ26.CMX',  '2026-12-29', 44.359,   '2026-11-20 12:38:00+00'),
  ('HG=F',  '2026-11-20', 'HGZ26.CMX',  '2026-12-29', 5.6335,   '2026-11-20 12:38:00+00'),
  ('PL=F',  '2026-11-20', 'PLF27.NYM',  '2027-01-27', 1347.5,   '2026-11-20 12:38:00+00'),
  ('ALI=F', '2026-11-20', 'ALIG27.CMX', '2027-02-24', 2793,     '2026-11-20 12:38:00+00')
on conflict (symbol, d) do nothing;

-- the rolls the probe found: five on 20 Nov, measured (the quote's previous close is the new contract's own close of
-- 19 Nov), each to be checked by the session after it; and the earlier ones in its six months, dated by the series'
-- closes equalling the new contract's from that day and not the day before. Their contract before is no longer listed
-- on Yahoo, so their change of contract is not known: those days are left out of the figures.
insert into fut_rolls (symbol, d, from_contract, to_contract, prev_close, source, checked, seen_at) values
  ('BZ=F',  '2026-11-20', 'BZF27.NYM',  'BZG27.NYM',  89.44,  'Yahoo Finance (unofficial) quote and named contracts, read by the Monitor''s source probe on 20 Nov 2026 (yahoo_futures, run 44737367820)', false, '2026-11-20 12:38:00+00'),
  ('NG=F',  '2026-11-20', 'NGZ26.NYM',  'NGF27.NYM',  3.681,  'Yahoo Finance (unofficial) quote and named contracts, read by the Monitor''s source probe on 20 Nov 2026 (yahoo_futures, run 44737367820)', false, '2026-11-20 12:38:00+00'),
  ('HG=F',  '2026-11-20', 'HGX26.CMX',  'HGZ26.CMX',  5.6335, 'Yahoo Finance (unofficial) quote and named contracts, read by the Monitor''s source probe on 20 Nov 2026 (yahoo_futures, run 44737367820)', false, '2026-11-20 12:38:00+00'),
  ('ALI=F', '2026-11-20', 'ALIX26.CMX', 'ALIG27.CMX', 2793,   'Yahoo Finance (unofficial) quote and named contracts, read by the Monitor''s source probe on 20 Nov 2026 (yahoo_futures, run 44737367820)', false, '2026-11-20 12:38:00+00'),
  ('CL=F',  '2026-11-20', 'CLZ26.NYM',  'CLF27.NYM',  82.44,  'Yahoo Finance (unofficial) quote and named contracts, read by the Monitor''s source probe on 20 Nov 2026 (yahoo_futures, run 44737367820)', false, '2026-11-20 12:38:00+00'),
  ('ES=F',  '2026-09-21', null, 'ESZ26.CME',  null, 'Yahoo Finance (unofficial) daily closes: the series equals ESZ26.CME from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('NQ=F',  '2026-09-21', null, 'NQZ26.CME',  null, 'Yahoo Finance (unofficial) daily closes: the series equals NQZ26.CME from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('YM=F',  '2026-09-21', null, 'YMZ26.CBT',  null, 'Yahoo Finance (unofficial) daily closes: the series equals YMZ26.CBT from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('RTY=F', '2026-09-21', null, 'RTYZ26.CME', null, 'Yahoo Finance (unofficial) daily closes: the series equals RTYZ26.CME from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('NKD=F', '2026-09-11', null, 'NKDZ26.CME', null, 'Yahoo Finance (unofficial) daily closes: the series equals NKDZ26.CME from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('ZN=F',  '2026-09-22', null, 'ZNZ26.CBT',  null, 'Yahoo Finance (unofficial) daily closes: the series equals ZNZ26.CBT from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('CL=F',  '2026-10-21', null, 'CLZ26.NYM',  null, 'Yahoo Finance (unofficial) daily closes: the series equals CLZ26.NYM from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('BZ=F',  '2026-11-02', null, 'BZF27.NYM',  null, 'Yahoo Finance (unofficial) daily closes: the series equals BZF27.NYM from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('NG=F',  '2026-10-29', null, 'NGZ26.NYM',  null, 'Yahoo Finance (unofficial) daily closes: the series equals NGZ26.NYM from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00'),
  ('GC=F',  '2026-07-31', null, 'GCZ26.CMX',  null, 'Yahoo Finance (unofficial) daily closes: the series equals GCZ26.CMX from this day, not the day before (the Monitor''s source probe of 20 Nov 2026, yahoo_futures, run 44737367820)', true, '2026-11-20 12:38:00+00')
on conflict (symbol, d) do nothing;

-- 2. alerts and devices --------------------------------------------------------------------------------------------------
alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts add constraint alerts_kind_check check (kind in ('stock','index','buyback','revision','mna','sigma'));
alter table alerts add column if not exists sigma double precision;         -- a σ alert's move in σ, signed
alter table alerts add column if not exists note text;                      -- its window and source
alter table alerts add column if not exists pushed_sigma double precision;  -- the |σ| at which it was last offered to devices
alter table alerts drop constraint if exists alerts_sigma_check;
alter table alerts add constraint alerts_sigma_check check (kind <> 'sigma' or sigma is not null);

-- null: what the device received before 20 Nov 2026, and keeps until it chooses (every kind but the σ moves)
alter table push_subs add column if not exists kinds text[];
alter table push_subs add column if not exists sigma_line double precision not null default 2.5;
alter table push_subs drop constraint if exists push_subs_sigma_line_check;
alter table push_subs add constraint push_subs_sigma_line_check check (sigma_line in (2, 2.5, 3));
alter table push_subs drop constraint if exists push_subs_kinds_check;
alter table push_subs add constraint push_subs_kinds_check check (kinds is null or kinds <@ array['stock','index','buyback','revision','mna','sigma']::text[]);

-- 3. the market table's statistics ---------------------------------------------------------------------------------------
-- As before (20261107000018): the last 21 closes' mean and sample deviation (σ vs 1M avg), the 52-week high and low,
-- the 200-day mean. New: on a future, σ vs 1M avg's closes before a roll are set on the new contract's level (times its
-- own close before the roll over the series'), and a window holding a roll whose change of contract is not known gives
-- none; and the σ of daily changes over 63 sessions (a yield's in points, a price's in per cent; a roll day's change
-- within the new contract, or left out), ending at the newest close (sd63) and one session before it (sd63x), with
-- the changes counted and the first and last close of each window. sim/sql/sigma.test.cjs checks it against
-- supabase/functions/_shared/sigma.ts.
drop function if exists fn_table_stats();
create function fn_table_stats()
returns table (symbol text, mean21 double precision, sd21 double precision, hi252 double precision, lo252 double precision, mean200 double precision,
               sd63 double precision, n63 int, from63 date, to63 date, sd63x double precision, n63x int, from63x date, to63x date)
language sql stable as $$
  with p as (
    select p.symbol, p.d, p.close,
      row_number() over w as rn,
      lead(p.close) over w as close_before,
      (i.grp = 'rates' and i.symbol not like '%=F') as yld
    from prices_daily p join instruments i on i.symbol = p.symbol and i.active
    window w as (partition by p.symbol order by p.d desc)
  ),
  c as (
    select p.symbol, p.d, p.close, p.rn,
      case when fr.d is not null then
             case when fr.prev_close is null or fr.prev_close <= 0 then null
                  when p.yld then p.close - fr.prev_close
                  else (p.close / fr.prev_close - 1) * 100 end
           when p.close_before is null then null
           when p.yld then p.close - p.close_before
           when p.close_before = 0 then null
           else (p.close / p.close_before - 1) * 100 end as chg,
      case when fr.d is not null and fr.prev_close > 0 and p.close_before > 0 then ln(fr.prev_close / p.close_before) end as lf,
      (fr.d is not null and not (coalesce(fr.prev_close, 0) > 0 and coalesce(p.close_before, 0) > 0)) as cut
    from p left join fut_rolls fr on fr.symbol = p.symbol and fr.d = p.d
    where p.rn <= 253
  ),
  a as (
    select c.*,
      coalesce(sum(lf) over n, 0) as cumlf,
      coalesce(bool_or(cut) over n, false) as after_cut
    from c
    window n as (partition by c.symbol order by c.d desc rows between unbounded preceding and 1 preceding)
  )
  select symbol,
    case when bool_or(after_cut) filter (where rn <= 21) then null else avg(close * exp(cumlf)) filter (where rn <= 21) end,
    case when bool_or(after_cut) filter (where rn <= 21) then null else stddev_samp(close * exp(cumlf)) filter (where rn <= 21) end,
    max(close) filter (where rn <= 252), min(close) filter (where rn <= 252),
    avg(close) filter (where rn <= 200),
    stddev_samp(chg) filter (where rn <= 63), (count(chg) filter (where rn <= 63))::int, max(d) filter (where rn = 64), max(d) filter (where rn = 1),
    stddev_samp(chg) filter (where rn between 2 and 64), (count(chg) filter (where rn between 2 and 64))::int, max(d) filter (where rn = 65), max(d) filter (where rn = 2)
  from a where rn <= 252 group by symbol;
$$;
