-- Excessive-move alerts (Shota, 2026-11-07): a single stock beyond ±7% intraday or an index beyond ±3%,
-- one line each ("Kioxia down 11% intraday"), the latest shown in the top bar, the last twenty on click.
-- One row per symbol, session date and kind; the magnitude is updated while the move extends.
create table if not exists alerts (
  id      bigserial primary key,
  at      timestamptz not null default now(),   -- first time the threshold was crossed
  upd     timestamptz not null default now(),   -- last time the move was re-measured
  d       date not null,                        -- exchange-local session date
  symbol  text not null,
  name    text not null,
  kind    text not null check (kind in ('stock','index')),
  pct     double precision not null,
  price   double precision,
  market  text not null,
  msg     text not null,
  unique (symbol, d, kind)
);
create index if not exists alerts_at on alerts (at desc);
alter table alerts enable row level security;

-- Index constituents used by the stock scan (and later by breadth / movers): S&P 500 and Nikkei 225.
create table if not exists constituents (
  idx     text not null check (idx in ('SP500','NK225')),
  symbol  text not null,
  name    text not null,
  sector  text,
  weight  double precision,
  as_of   date not null,
  primary key (idx, symbol)
);
alter table constituents enable row level security;
