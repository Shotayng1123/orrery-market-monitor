-- Per-constituent statistics for the EQUITIES pages (breadth, sector performance, movers, heat map, screener)
-- and daily US short-volume ratios (FINRA). Nasdaq-100 constituents stand in for the NASDAQ Composite.
alter table constituents drop constraint if exists constituents_idx_check;
alter table constituents add constraint constituents_idx_check check (idx in ('SP500','NK225','NDX'));

create table if not exists constituent_stats (
  idx        text not null,
  symbol     text not null,
  name       text not null,
  sector     text,
  weight     double precision,
  d          date not null,               -- date of the last close used
  close      double precision not null,
  prev       double precision,
  pct1d      double precision,
  pct1w      double precision,
  pct1m      double precision,
  pct3m      double precision,
  pct12m     double precision,
  dma50      double precision,
  dma200     double precision,
  hi52       double precision,
  lo52       double precision,
  updated_at timestamptz not null default now(),
  primary key (idx, symbol)
);
alter table constituent_stats enable row level security;

create table if not exists short_volume (
  d            date not null,
  symbol       text not null,
  short_vol    bigint not null,
  total_vol    bigint not null,
  ratio        double precision not null,   -- short_vol / total_vol
  primary key (d, symbol)
);
create index if not exists short_volume_symbol_d on short_volume (symbol, d desc);
alter table short_volume enable row level security;

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
  perform cron.schedule('monitor-stats-nk225',    '15 7 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=NK225')$c$);
  perform cron.schedule('monitor-stats-sp500',    '45 22 * * 1-5', $c$select monitor_call('daily', 'job=stats&idx=SP500')$c$);
  perform cron.schedule('monitor-stats-ndx',      '55 22 * * 1-5', $c$select monitor_call('daily', 'job=stats&idx=NDX')$c$);
  perform cron.schedule('monitor-shorts',         '20 23 * * 1-5', $c$select monitor_call('daily', 'job=shorts')$c$);
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
