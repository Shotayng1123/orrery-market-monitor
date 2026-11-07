-- Net money flow and longer horizons per constituent, JPX short-selling and margin data, a small cache for
-- single-asset lookups, and schedules for the new indices (TOPIX, KOSPI 200, HSI, SSE 180).
-- more indices
alter table constituents drop constraint if exists constituents_idx_check;
alter table constituents add constraint constituents_idx_check check (idx in ('SP500','NK225','NDX','TOPIX','KOSPI200','HSI','SSE180'));

alter table constituent_stats
  add column if not exists pct6m  double precision,
  add column if not exists pct36m double precision,
  add column if not exists mf_up   double precision,   -- turnover on up-ticks (bar close above the previous bar), local currency
  add column if not exists mf_down double precision,   -- turnover on down-ticks
  add column if not exists mf_net  double precision,   -- up minus down
  add column if not exists mf_d    date,               -- session the flow refers to (exchange date)
  add column if not exists mf_at   timestamptz;

-- JPX "空売りの残高に関する情報": every short position of 0.5% or more, by holder, one file per day.
create table if not exists jp_short_positions (
  d          date not null,          -- calculation date
  code       text not null,          -- 4-digit (or 3+letter) securities code
  name       text,
  holder     text not null,
  ratio      double precision,       -- share of shares outstanding (0.0123 = 1.23%)
  shares     double precision,
  prev_d     date,
  prev_ratio double precision,
  primary key (d, code, holder)
);
alter table jp_short_positions enable row level security;
create index if not exists jp_short_positions_code on jp_short_positions (code, d);

-- JPX "空売り集計": daily short-selling value and share of trading value, market total and by 33 sectors.
create table if not exists jp_short_ratio (
  d                date not null,
  scope            text not null,    -- 'market' or 'sector'
  name             text not null,    -- 'TSE' for the market total, sector name otherwise
  actual           double precision, -- 実注文 (JPY m)
  short_restricted double precision, -- 空売り（価格規制あり）
  short_free       double precision, -- 空売り（価格規制なし）
  total            double precision, -- 売買代金合計
  primary key (d, scope, name)
);
alter table jp_short_ratio enable row level security;

-- JPX weekly per-stock margin balances (銘柄別信用取引残高).
create table if not exists jp_margin (
  d           date not null,
  code        text not null,
  name        text,
  sell_bal    double precision,      -- 売残 (shares)
  buy_bal     double precision,      -- 買残 (shares)
  sell_chg    double precision,      -- week-on-week change
  buy_chg     double precision,
  primary key (d, code)
);
alter table jp_margin enable row level security;

-- Cached third-party payloads for single-asset pages (statements, searches): key -> JSON with a fetch time.
create table if not exists asset_cache (
  key        text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table asset_cache enable row level security;

create or replace function monitor_install_cron(p_cron_secret text, p_functions_url text) returns text
language plpgsql security definer set search_path = public as $$
declare j record; n int := 0;
begin
  for j in select id, name from vault.secrets where name in ('cron_secret', 'functions_url') loop
    perform vault.update_secret(j.id, case when j.name = 'cron_secret' then p_cron_secret else p_functions_url end);
  end loop;
  if not exists (select 1 from vault.secrets where name = 'cron_secret')   then perform vault.create_secret(p_cron_secret, 'cron_secret'); end if;
  if not exists (select 1 from vault.secrets where name = 'functions_url') then perform vault.create_secret(p_functions_url, 'functions_url'); end if;
  for j in select jobname from cron.job where jobname like 'monitor-%' loop perform cron.unschedule(j.jobname); end loop;
  perform cron.schedule('monitor-tick',           '* * * * *',     $c$select monitor_call('tick')$c$);
  perform cron.schedule('monitor-hourly',         '5 * * * *',     $c$select monitor_call('daily', 'job=hourly')$c$);
  perform cron.schedule('monitor-news',           '*/10 * * * *',  $c$select monitor_call('daily', 'job=news')$c$);
  perform cron.schedule('monitor-history-asia',   '5 7 * * 1-5',   $c$select monitor_call('daily', 'job=history')$c$);
  perform cron.schedule('monitor-history-europe', '5 17 * * 1-5',  $c$select monitor_call('daily', 'job=history')$c$);
  perform cron.schedule('monitor-history-us',     '35 22 * * 1-5', $c$select monitor_call('daily', 'job=history')$c$);
  -- constituent statistics after each close (TOPIX runs in GitHub Actions: too many names for one edge call)
  perform cron.schedule('monitor-stats-nk225',    '15 7 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=NK225')$c$);
  perform cron.schedule('monitor-stats-kospi200', '0 7 * * 1-5',   $c$select monitor_call('daily', 'job=stats&idx=KOSPI200')$c$);
  perform cron.schedule('monitor-stats-sse180',   '25 7 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=SSE180')$c$);
  perform cron.schedule('monitor-stats-hsi',      '25 8 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=HSI')$c$);
  perform cron.schedule('monitor-stats-sp500',    '45 22 * * 1-5', $c$select monitor_call('daily', 'job=stats&idx=SP500')$c$);
  perform cron.schedule('monitor-stats-ndx',      '55 22 * * 1-5', $c$select monitor_call('daily', 'job=stats&idx=NDX')$c$);
  -- intraday turnover / market cap every ten minutes in session; net money flow from minute bars after the close and mid-session
  perform cron.schedule('monitor-flow-nk225',     '*/10 0-6 * * 1-5',   $c$select monitor_call('daily', 'job=flow&idx=NK225')$c$);
  perform cron.schedule('monitor-flow-topix',     '3,23,43 0-6 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=TOPIX')$c$);
  perform cron.schedule('monitor-flow-kospi200',  '7,27,47 0-6 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=KOSPI200')$c$);
  perform cron.schedule('monitor-flow-sse180',    '9,29,49 1-7 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=SSE180')$c$);
  perform cron.schedule('monitor-flow-hsi',       '4,24,44 1-8 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=HSI')$c$);
  perform cron.schedule('monitor-flow-sp500',     '*/10 14-21 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=SP500')$c$);
  perform cron.schedule('monitor-flow-ndx',       '5,15,25,35,45,55 14-21 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=NDX')$c$);
  perform cron.schedule('monitor-mflow-nk225',    '35 2,4,6 * * 1-5',   $c$select monitor_call('daily', 'job=mflow&idx=NK225')$c$);
  perform cron.schedule('monitor-mflow-kospi200', '50 2,4,6 * * 1-5',   $c$select monitor_call('daily', 'job=mflow&idx=KOSPI200')$c$);
  perform cron.schedule('monitor-mflow-sse180',   '12 3,5,7 * * 1-5',   $c$select monitor_call('daily', 'job=mflow&idx=SSE180')$c$);
  perform cron.schedule('monitor-mflow-hsi',      '18 4,6,8 * * 1-5',   $c$select monitor_call('daily', 'job=mflow&idx=HSI')$c$);
  perform cron.schedule('monitor-mflow-sp500',    '40 16,18,21 * * 1-5', $c$select monitor_call('daily', 'job=mflow&idx=SP500')$c$);
  perform cron.schedule('monitor-mflow-ndx',      '48 16,18,21 * * 1-5', $c$select monitor_call('daily', 'job=mflow&idx=NDX')$c$);
  perform cron.schedule('monitor-shorts',         '20 23 * * 1-5', $c$select monitor_call('daily', 'job=shorts')$c$);
  -- JPX: short positions are published the next morning, the daily short-selling ratio after the close, margin balances weekly
  perform cron.schedule('monitor-jpx-positions',  '30 1,9 * * 1-5', $c$select monitor_call('daily', 'job=jpx&part=positions')$c$);
  perform cron.schedule('monitor-jpx-ratio',      '40 8,10 * * 1-5', $c$select monitor_call('daily', 'job=jpx&part=ratio')$c$);
  perform cron.schedule('monitor-jpx-margin',     '15 9 * * 2-4',  $c$select monitor_call('daily', 'job=jpx&part=margin')$c$);
  perform cron.schedule('monitor-curves-jp',      '30 8 * * 1-5',  $c$select monitor_call('daily', 'job=curves&country=JP')$c$);
  perform cron.schedule('monitor-curves-de',      '40 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=DE')$c$);
  perform cron.schedule('monitor-curves-ea',      '42 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=EA')$c$);
  perform cron.schedule('monitor-curves-eb',      '44 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=EB')$c$);
  perform cron.schedule('monitor-curves-gb',      '46 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=GB')$c$);
  perform cron.schedule('monitor-curves-us',      '30 23 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=US')$c$);
  perform cron.schedule('monitor-curves-ca',      '35 23 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=CA')$c$);
  perform cron.schedule('monitor-policy',         '10 18 * * 1-5', $c$select monitor_call('daily', 'job=policy')$c$);
  perform cron.schedule('monitor-constituents',   '40 0 * * *',    $c$select monitor_call('daily', 'job=constituents')$c$);
  perform cron.schedule('monitor-calendar',       '15 * * * *',    $c$select monitor_call('daily', 'job=calendar')$c$);
  perform cron.schedule('monitor-prune',          '50 19 * * *',   $c$select monitor_call('daily', 'job=prune')$c$);
  select count(*) into n from cron.job where jobname like 'monitor-%';
  return n || ' schedules installed';
end $$;

-- Latest reported short position per (code, holder) within a window, summed per code (positions at or above 0.5%).
create or replace function fn_jp_short_latest(p_since date)
returns table (code text, name text, holders int, total_ratio double precision, latest date)
language sql stable security definer set search_path = public as $$
  select x.code, max(x.name) as name, count(*)::int as holders, sum(x.ratio) as total_ratio, max(x.d) as latest
  from (
    select distinct on (code, holder) code, name, holder, ratio, d
    from jp_short_positions where d >= p_since order by code, holder, d desc
  ) x
  where x.ratio >= 0.005
  group by x.code;
$$;
