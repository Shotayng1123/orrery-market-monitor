-- Policy-rate history for the 30-year chart. One row per bank and date (change dates are enough for a step
-- chart; daily series are stored as published). Sources per bank are recorded on each row.
create table if not exists policy_history (
  bank    text not null,
  d       date not null,
  rate    double precision not null,
  source  text not null,
  primary key (bank, d)
);
alter table policy_history enable row level security;

-- change points only (consecutive equal values collapsed), last 30 years, for the page
create or replace function fn_policy_steps(p_from date default (current_date - interval '30 years')::date)
returns table (bank text, d date, rate double precision)
language sql stable as $$
  with s as (
    select bank, d, rate, lag(rate) over (partition by bank order by d) as prev
    from policy_history where d >= p_from - interval '2 years'
  )
  select bank, d, rate from s where prev is null or prev <> rate order by bank, d;
$$;
