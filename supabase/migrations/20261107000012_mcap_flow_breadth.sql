-- Market caps, day volume and average volume per constituent (treemap sizing, flow by sector), and a daily
-- breadth history per index for the breadth chart (1W to 36M).
alter table constituent_stats add column if not exists mcap double precision;
alter table constituent_stats add column if not exists volume double precision;
alter table constituent_stats add column if not exists adv3m double precision;
alter table constituent_stats add column if not exists turnover double precision;      -- volume x price, local currency
alter table constituent_stats add column if not exists adv_turnover double precision;  -- adv3m x price
alter table constituent_stats add column if not exists quote_at timestamptz;

create table if not exists breadth_history (
  idx       text not null,
  d         date not null,
  n         int not null,
  adv       int not null,
  dec       int not null,
  above50   int not null,
  above200  int not null,
  new_hi    int not null,
  new_lo    int not null,
  primary key (idx, d)
);
alter table breadth_history enable row level security;

-- Intraday flow by sector: refresh volume / turnover / market cap every ten minutes during each session
-- (TSE 00:00-06:30 UTC, NYSE 14:30-21:00 UTC), plus one pass shortly after each close.
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
  perform cron.schedule('monitor-flow-nk225',     '*/10 0-6 * * 1-5',   $c$select monitor_call('daily', 'job=flow&idx=NK225')$c$);
  perform cron.schedule('monitor-flow-nk225-x',   '0,30 7 * * 1-5',     $c$select monitor_call('daily', 'job=flow&idx=NK225')$c$);
  perform cron.schedule('monitor-flow-sp500',     '*/10 14-21 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=SP500')$c$);
  perform cron.schedule('monitor-flow-ndx',       '5,15,25,35,45,55 14-21 * * 1-5', $c$select monitor_call('daily', 'job=flow&idx=NDX')$c$);
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
