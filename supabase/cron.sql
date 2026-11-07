-- Orrery Monitor — schedules. Run once in the SQL editor of the Monitor's Supabase project, AFTER:
--   1. select vault.create_secret('<the CRON_SECRET you set on the functions>', 'cron_secret');
--   2. select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'functions_url');
-- pg_cron calls the Edge Functions with the shared secret; the functions refuse anything else.

create or replace function monitor_call(fn text, qs text default '') returns bigint
language plpgsql security definer as $$
declare base text; secret text; rid bigint;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  select net.http_post(
    url     := base || '/' || fn || case when qs = '' then '' else '?' || qs end,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into rid;
  return rid;
end $$;

-- every minute: quotes for whichever markets are open (the function itself skips closed ones)
select cron.schedule('monitor-tick', '* * * * *', $$select monitor_call('tick')$$);
-- news every 10 minutes
select cron.schedule('monitor-news', '*/10 * * * *', $$select monitor_call('daily', 'job=news')$$);
-- daily history after the main closes: Tokyo 15:30 JST = 06:30 UTC, Europe 17:30 CET = 16:30 UTC, New York 16:00 ET = 21:00 UTC (22:00 in winter)
select cron.schedule('monitor-history-asia',   '5 7 * * 1-5',  $$select monitor_call('daily', 'job=history')$$);
select cron.schedule('monitor-history-europe', '5 17 * * 1-5', $$select monitor_call('daily', 'job=history')$$);
select cron.schedule('monitor-history-us',     '35 22 * * 1-5', $$select monitor_call('daily', 'job=history')$$);
-- curves: MOF publishes after the Tokyo close (run 08:30 UTC), Treasury after the US close (run 23:30 UTC)
select cron.schedule('monitor-curves-jp', '30 8 * * 1-5',  $$select monitor_call('daily', 'job=curves&country=JP')$$);
select cron.schedule('monitor-curves-us', '30 23 * * 1-5', $$select monitor_call('daily', 'job=curves&country=US')$$);
-- calendar hourly, FRED daily, prune daily
select cron.schedule('monitor-calendar', '15 * * * *',  $$select monitor_call('daily', 'job=calendar')$$);
select cron.schedule('monitor-fred',     '45 23 * * *', $$select monitor_call('daily', 'job=fred')$$);
select cron.schedule('monitor-prune',    '50 19 * * *', $$select monitor_call('daily', 'job=prune')$$);

-- to inspect: select jobid, jobname, schedule, active from cron.job;  select * from cron.job_run_details order by start_time desc limit 20;
