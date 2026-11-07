-- Short-interest history per index (Shota: how it has changed over time): one row per day and metric.
--   finra_avg_ratio      average FINRA short-volume share across the index's names (US)
--   jpx_market_ratio     JPX daily short-selling share of trading value, market total (Japan)
--   jpx_positions_avg    average of the summed reported short positions (>= 0.5%) across the index's names
--   jpx_positions_names  number of the index's names with at least one reported position
create table if not exists short_agg (
  d      date not null,
  idx    text not null,
  metric text not null,
  value  double precision,
  n      int,
  primary key (d, idx, metric)
);
alter table short_agg enable row level security;
