-- More currencies and more sovereign curves (Shota, 2026-11-07: "other major markets as well").
-- Curves: any country code; labels live in code. Sources: DE Bundesbank term structure, EA/EB ECB euro-area
-- AAA and all-ratings curves, GB Bank of England nominal spot curve, CA Bank of Canada benchmark yields.
alter table curves drop constraint if exists curves_country_check;

insert into instruments (ord, symbol, name, cls, grp, market, tz, currency, decimals, proxy_for, provider, provider_symbol, notes) values
  (42, 'EURGBP=X', 'EUR/GBP', 'Currency', 'fx', 'FX', 'Europe/London', 'GBP', 4, null, 'yahoo', null, null),
  (43, 'CHF=X',    'USD/CHF', 'Currency', 'fx', 'FX', 'Europe/London', 'CHF', 4, null, 'yahoo', null, null),
  (44, 'CAD=X',    'USD/CAD', 'Currency', 'fx', 'FX', 'Europe/London', 'CAD', 4, null, 'yahoo', null, null),
  (45, 'NZDUSD=X', 'NZD/USD', 'Currency', 'fx', 'FX', 'Europe/London', 'USD', 4, null, 'yahoo', null, null),
  (46, 'GBPJPY=X', 'GBP/JPY', 'Currency', 'fx', 'FX', 'Europe/London', 'JPY', 3, null, 'yahoo', null, null),
  (47, 'AUDJPY=X', 'AUD/JPY', 'Currency', 'fx', 'FX', 'Europe/London', 'JPY', 3, null, 'yahoo', null, null),
  (48, 'CNY=X',    'USD/CNY', 'Currency', 'fx', 'FX', 'Europe/London', 'CNY', 4, null, 'yahoo', null, 'onshore'),
  (49, 'HKD=X',    'USD/HKD', 'Currency', 'fx', 'FX', 'Europe/London', 'HKD', 4, null, 'yahoo', null, null),
  (50, 'TWD=X',    'USD/TWD', 'Currency', 'fx', 'FX', 'Europe/London', 'TWD', 3, null, 'yahoo', null, null),
  (51, 'INR=X',    'USD/INR', 'Currency', 'fx', 'FX', 'Europe/London', 'INR', 3, null, 'yahoo', null, null),
  (52, 'MXN=X',    'USD/MXN', 'Currency', 'fx', 'FX', 'Europe/London', 'MXN', 4, null, 'yahoo', null, null)
on conflict (symbol) do update set name = excluded.name, cls = excluded.cls, grp = excluded.grp, market = excluded.market, tz = excluded.tz,
  currency = excluded.currency, decimals = excluded.decimals, ord = excluded.ord, notes = excluded.notes;

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
  perform cron.schedule('monitor-curves-jp',      '30 8 * * 1-5',  $c$select monitor_call('daily', 'job=curves&country=JP')$c$);
  perform cron.schedule('monitor-curves-de',      '40 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=DE')$c$);
  perform cron.schedule('monitor-curves-ea',      '42 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=EA')$c$);
  perform cron.schedule('monitor-curves-eb',      '44 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=EB')$c$);
  perform cron.schedule('monitor-curves-gb',      '46 17 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=GB')$c$);
  perform cron.schedule('monitor-curves-us',      '30 23 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=US')$c$);
  perform cron.schedule('monitor-curves-ca',      '35 23 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=CA')$c$);
  perform cron.schedule('monitor-constituents',   '40 0 * * *',    $c$select monitor_call('daily', 'job=constituents')$c$);
  perform cron.schedule('monitor-calendar',       '15 * * * *',    $c$select monitor_call('daily', 'job=calendar')$c$);
  perform cron.schedule('monitor-prune',          '50 19 * * *',   $c$select monitor_call('daily', 'job=prune')$c$);
  select count(*) into n from cron.job where jobname like 'monitor-%';
  return n || ' schedules installed';
end $$;

-- latest date and tenor count per curve, for the page's curve list
create or replace function fn_curve_latest() returns table (country text, d date, n bigint)
language sql stable as $$
  select c.country, m.d, count(*) as n
  from (select country, max(d) as d from curves group by country) m
  join curves c on c.country = m.country and c.d = m.d
  group by c.country, m.d order by c.country;
$$;
