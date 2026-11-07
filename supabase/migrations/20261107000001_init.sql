-- Orrery Monitor — schema. Everything the page shows lives here; nothing is read from Orrery Analytics.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

-- Instrument master. `market` picks the session (hours, holidays, declared feed delay); `tz` is the exchange
-- time zone used to date daily bars; `provider` says who supplies the series.
create table if not exists instruments (
  symbol           text primary key,
  name             text not null,
  cls              text not null check (cls in ('Equities','Volatility','Futures','Currency','Fixed income','Commodities')),
  grp              text not null check (grp in ('equity','rates','fx','cmdty')),
  market           text not null,
  tz               text not null,
  currency         text not null,
  decimals         int  not null default 2,
  proxy_for        text,
  provider         text not null default 'yahoo' check (provider in ('yahoo','treasury','mof','fred')),
  provider_symbol  text,
  ord              int  not null,
  active           boolean not null default true,
  notes            text
);

-- Daily closes (one row per exchange-local session date).
create table if not exists prices_daily (
  symbol      text not null references instruments(symbol) on delete cascade,
  d           date not null,
  close       double precision not null,
  open        double precision,
  high        double precision,
  low         double precision,
  volume      double precision,
  source      text not null default 'yahoo',
  updated_at  timestamptz not null default now(),
  primary key (symbol, d)
);
create index if not exists prices_daily_symbol_d_desc on prices_daily (symbol, d desc);

-- Latest print per instrument, written by `tick` every minute while its market is open.
create table if not exists quotes_latest (
  symbol        text primary key references instruments(symbol) on delete cascade,
  price         double precision not null,
  prev_close    double precision,
  market_time   timestamptz not null,
  fetched_at    timestamptz not null default now(),
  source        text not null default 'yahoo'
);

-- Intraday bars (5-minute from the spark endpoint), kept for ten days for the 1D charts.
create table if not exists bars_intraday (
  symbol  text not null references instruments(symbol) on delete cascade,
  t       timestamptz not null,
  close   double precision not null,
  primary key (symbol, t)
);

-- Yield curves: US Treasury daily par curve, Japan MOF reference yields.
create table if not exists curves (
  country  text not null check (country in ('US','JP')),
  d        date not null,
  tenor    text not null,
  years    double precision not null,
  yield    double precision not null,
  source   text not null,
  primary key (country, d, tenor)
);
create index if not exists curves_country_d on curves (country, d desc);

-- Policy rates: one row per central bank; filled by the fred job (Fed) and by hand or scrapers for the rest.
create table if not exists policy_rates (
  bank          text primary key,
  name          text not null,
  rate_label    text not null,
  rate          double precision,
  as_of         date,
  last_change   date,
  next_meeting  date,
  source_url    text,
  source_note   text,
  updated_at    timestamptz not null default now()
);

create table if not exists econ_events (
  id        bigserial primary key,
  ext_key   text unique not null,
  at        timestamptz not null,
  country   text not null,
  title     text not null,
  impact    text not null,
  forecast  text,
  previous  text,
  actual    text,
  source    text not null default 'forexfactory',
  updated_at timestamptz not null default now()
);
create index if not exists econ_events_at on econ_events (at);

create table if not exists news_items (
  id            bigserial primary key,
  url           text unique not null,
  published_at  timestamptz not null,
  source        text not null,
  title         text not null,
  category      text,
  tickers       text[] not null default '{}',
  tagged_by     text,
  created_at    timestamptz not null default now()
);
create index if not exists news_items_published on news_items (published_at desc);
create index if not exists news_items_category on news_items (category, published_at desc);

-- Morning Notes written by the daily GitHub Actions job (Claude API). `pack` keeps the numbers it was given.
create table if not exists notes (
  id            bigserial primary key,
  d             date not null unique,
  title         text not null,
  generated_at  timestamptz not null default now(),
  model         text,
  sections      jsonb not null,
  sources       jsonb not null default '[]'::jsonb,
  pack          jsonb,
  cost_usd      double precision
);

create table if not exists reports (
  id            bigserial primary key,
  kind          text not null,
  title         text not null,
  summary       text,
  md            text not null,
  published_at  timestamptz not null default now(),
  meta          jsonb
);

-- Sign-in: IDs chosen by users, one shared password (a function secret), HMAC tokens.
create table if not exists users (
  id          text primary key,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  logins      int not null default 0,
  remember    boolean
);
create table if not exists login_attempts (
  ip  text not null,
  at  timestamptz not null default now(),
  ok  boolean not null default false
);
create index if not exists login_attempts_ip_at on login_attempts (ip, at desc);

-- Exchange holidays. `verified` is set once the date was checked against the exchange's published calendar;
-- the page shows "holiday calendar unverified" until every active market's current year is verified.
create table if not exists sessions_cal (
  market    text not null,
  d         date not null,
  name      text,
  verified  boolean not null default false,
  primary key (market, d)
);

-- Operations: job runs and per-source status feed the DATA health chip.
create table if not exists job_runs (
  id      bigserial primary key,
  job     text not null,
  at      timestamptz not null default now(),
  ok      boolean not null,
  detail  text,
  ms      int
);
create index if not exists job_runs_job_at on job_runs (job, at desc);

create table if not exists source_status (
  name           text primary key,
  last_ok        timestamptz,
  last_error     text,
  last_error_at  timestamptz
);

-- Precomputed payloads (the market table is rebuilt once a minute by `tick`, not per visitor).
create table if not exists snapshots (
  key      text primary key,
  payload  jsonb not null,
  at       timestamptz not null default now()
);

-- Nothing is readable with the anon key: the Edge Functions use the service role.
do $$ declare t text; begin
  for t in select unnest(array['instruments','prices_daily','quotes_latest','bars_intraday','curves','policy_rates','econ_events','news_items','notes','reports','users','login_attempts','sessions_cal','job_runs','source_status','snapshots']) loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
