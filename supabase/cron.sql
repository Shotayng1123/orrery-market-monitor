-- Orrery Monitor — schedules. Every monitor-* schedule is defined in monitor_install_cron(), which the migrations
-- redefine whenever a job is added; this file only calls it, so it cannot fall out of step with them.
-- Run once in the SQL editor of the Monitor's Supabase project after `supabase db push`, with the CRON_SECRET you set
-- on the functions. It stores the two values pg_cron needs in Vault (replacing old ones) and recreates the schedules.
-- FRED is not scheduled here: the edge runtime cannot reach it (migration 20261107000007); the Fed target range is
-- refreshed by jobs/fed.ts in GitHub Actions (.github/workflows/fed.yml).

select monitor_install_cron('<CRON_SECRET>', 'https://<project-ref>.supabase.co/functions/v1');

-- to inspect: select * from monitor_cron_status();
--             select * from cron.job_run_details order by start_time desc limit 20;
