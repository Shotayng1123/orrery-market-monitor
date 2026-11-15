-- A currency pair's day rolls at 17:00 New York, the boundary its daily closes are booked on (see _shared/fx.ts).
-- fn_table_anchors dated an FX quote in the instrument's own time zone (London), so between 17:00 New York and
-- London midnight the reference day was one day behind and the 1W / 1M / 3M / 12M / 36M anchors with it.
-- fn_fx_day mirrors fxDay(): New York date after adding seven hours; a weekend stamp belongs to Friday.
create or replace function fn_fx_day(ts timestamptz)
returns date
language sql immutable as $$
  select case extract(dow from d)::int when 6 then d - 1 when 0 then d - 2 else d end
  from (select ((ts at time zone 'America/New_York') + interval '7 hours')::date as d) x;
$$;

create or replace function fn_table_anchors()
returns table (
  symbol text, ref_d date, last_d date, last_close double precision,
  d1_d date,  d1 double precision,
  w1_d date,  w1 double precision,
  m1_d date,  m1 double precision,
  m3_d date,  m3 double precision,
  m12_d date, m12 double precision,
  m36_d date, m36 double precision
)
language sql stable as $$
  with ref as (
    select i.symbol, i.tz,
      greatest(
        coalesce((select max(p.d) from prices_daily p where p.symbol = i.symbol), date '1900-01-01'),
        coalesce((select case when i.symbol like '%=X' then fn_fx_day(q.market_time) else (q.market_time at time zone i.tz)::date end
                  from quotes_latest q where q.symbol = i.symbol), date '1900-01-01')
      ) as ref_d
    from instruments i where i.active
  )
  select r.symbol, r.ref_d,
    l.d, l.close,
    a1.d, a1.close, aw.d, aw.close, am1.d, am1.close, am3.d, am3.close, am12.d, am12.close, am36.d, am36.close
  from ref r
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <= r.ref_d order by d desc limit 1) l on true
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <  r.ref_d order by d desc limit 1) a1 on true
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <= r.ref_d - interval '7 days'   order by d desc limit 1) aw on true
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <= r.ref_d - interval '1 month'  order by d desc limit 1) am1 on true
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <= r.ref_d - interval '3 months' order by d desc limit 1) am3 on true
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <= r.ref_d - interval '12 months' order by d desc limit 1) am12 on true
  left join lateral (select d, close from prices_daily p where p.symbol = r.symbol and p.d <= r.ref_d - interval '36 months' order by d desc limit 1) am36 on true;
$$;
