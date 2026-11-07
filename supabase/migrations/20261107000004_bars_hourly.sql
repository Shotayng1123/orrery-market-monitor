-- Chart frequencies (Shota, 2026-11-07): 1D = one-minute bars, 1W and 1M = hourly bars, 3M and longer = daily closes.
-- bars_intraday now holds one-minute bars (three-day retention); bars_hourly holds hourly bars (sixty days).
create table if not exists bars_hourly (
  symbol  text not null references instruments(symbol) on delete cascade,
  t       timestamptz not null,
  close   double precision not null,
  primary key (symbol, t)
);
alter table bars_hourly enable row level security;
