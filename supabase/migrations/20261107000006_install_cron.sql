-- Installable schedules. `monitor_install_cron(secret, url)` stores the two values pg_cron needs in Vault and
-- (re)creates every schedule; it is called once through PostgREST with the service role, so no SQL editor is
-- needed and no secret lives in git. `monitor_cron_status()` lists the jobs and their last runs.
create or replace function monitor_call(fn text, qs text default '') returns bigint
language plpgsql security definer set search_path = public as $$
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

create or replace function monitor_install_cron(p_cron_secret text, p_functions_url text) returns text
language plpgsql security definer set search_path = public as $$
declare j record; n int := 0;
begin
  -- vault: replace if present
  for j in select id, name from vault.secrets where name in ('cron_secret', 'functions_url') loop
    perform vault.update_secret(j.id, case when j.name = 'cron_secret' then p_cron_secret else p_functions_url end);
  end loop;
  if not exists (select 1 from vault.secrets where name = 'cron_secret')   then perform vault.create_secret(p_cron_secret, 'cron_secret'); end if;
  if not exists (select 1 from vault.secrets where name = 'functions_url') then perform vault.create_secret(p_functions_url, 'functions_url'); end if;
  -- schedules: drop ours, then create
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
  perform cron.schedule('monitor-fred',           '45 23 * * *',   $c$select monitor_call('daily', 'job=fred')$c$);
  perform cron.schedule('monitor-prune',          '50 19 * * *',   $c$select monitor_call('daily', 'job=prune')$c$);
  select count(*) into n from cron.job where jobname like 'monitor-%';
  return n || ' schedules installed';
end $$;

create or replace function monitor_cron_status() returns table (jobname text, schedule text, active boolean, last_status text, last_start timestamptz)
language sql security definer set search_path = public as $$
  select j.jobname, j.schedule, j.active, d.status, d.start_time
  from cron.job j
  left join lateral (select status, start_time from cron.job_run_details r where r.jobid = j.jobid order by start_time desc limit 1) d on true
  where j.jobname like 'monitor-%' order by j.jobname;
$$;

-- only the service role may call these
revoke all on function monitor_install_cron(text, text) from public, anon, authenticated;
revoke all on function monitor_cron_status() from public, anon, authenticated;
revoke all on function monitor_call(text, text) from public, anon, authenticated;
