-- FRED is fetched by GitHub Actions (jobs/fred.ts): the edge runtime cannot reach fred.stlouisfed.org.
-- Drop the pg_cron schedule so the nightly failure stops showing in the data health.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'monitor-fred') then perform cron.unschedule('monitor-fred'); end if;
end $$;

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
  perform cron.schedule('monitor-curves-us',      '30 23 * * 1-5', $c$select monitor_call('daily', 'job=curves&country=US')$c$);
  perform cron.schedule('monitor-constituents',   '40 0 * * *',    $c$select monitor_call('daily', 'job=constituents')$c$);
  perform cron.schedule('monitor-calendar',       '15 * * * *',    $c$select monitor_call('daily', 'job=calendar')$c$);
  perform cron.schedule('monitor-prune',          '50 19 * * *',   $c$select monitor_call('daily', 'job=prune')$c$);
  select count(*) into n from cron.job where jobname like 'monitor-%';
  return n || ' schedules installed';
end $$;
