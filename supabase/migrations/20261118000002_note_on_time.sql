-- The Morning Note on time, and closing moves in the wide lists (Shota, 2026-11-18).
--
-- 1. The note is due at 07:00 SGT. GitHub starts this repository's scheduled workflows hours late: the note finished
--    at 09:36 SGT on 17 Nov and 08:30 on 18 Nov. pg_cron is punctual, and a workflow asked for through GitHub's API
--    starts within seconds, so the database now asks for the note itself at 22:15 UTC (monitor_dispatch). It needs a
--    GitHub token that may start this repository's workflows, stored once with monitor_set_github_token(); until
--    one is stored monitor_dispatch does nothing and the note depends on GitHub's own schedule, as before. GitHub's
--    schedules stay as they are, as the fallback (.github/workflows/morning-note.yml).
-- 2. Stock alerts for the wide lists come from the flow job's quotes (functions/_shared/alerts.ts). Its last pull
--    of the Tokyo and Seoul sessions ran before the delayed closing prices were in, so a move made in the closing
--    auction was seen only the next morning: one more pull after each close.

create or replace function monitor_set_github_token(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if p_token is null or length(trim(p_token)) < 20 then raise exception 'that does not look like a token'; end if;
  select s.id into sid from vault.secrets s where s.name = 'github_token';
  if sid is null then perform vault.create_secret(trim(p_token), 'github_token'); else perform vault.update_secret(sid, trim(p_token)); end if;
  return 'stored';
end $$;

-- every request made, so its answer can be looked up (monitor_dispatch_status)
create table if not exists monitor_dispatches (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  workflow   text not null,
  request_id bigint
);
alter table monitor_dispatches enable row level security;

/** Asks GitHub to start a workflow of this repository on main. Returns the request id, or null without a token. */
create or replace function monitor_dispatch(p_workflow text, p_inputs jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare token text; rid bigint;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'github_token';
  if token is null or token = '' then return null; end if;
  if p_workflow !~ '^[a-z0-9-]+\.yml$' then raise exception 'bad workflow name'; end if;
  select net.http_post(
    url     := 'https://api.github.com/repos/Shotayng1123/orrery-market-monitor/actions/workflows/' || p_workflow || '/dispatches',
    headers := jsonb_build_object('content-type', 'application/json', 'accept', 'application/vnd.github+json', 'authorization', 'Bearer ' || token, 'x-github-api-version', '2022-11-28', 'user-agent', 'orrery-monitor-cron'),
    body    := jsonb_build_object('ref', 'main', 'inputs', p_inputs),
    timeout_milliseconds := 30000
  ) into rid;
  insert into monitor_dispatches (workflow, request_id) values (p_workflow, rid);
  delete from monitor_dispatches where at < now() - interval '60 days';
  return rid;
end $$;

/** The last requests and what GitHub answered: 204 = accepted, 401 = the token is wrong or has expired,
 *  403/404 = the token may not start workflows of this repository, 422 = the workflow does not take that input.
 *  The answer is kept for a few hours only (pg_net), so `status` is null for older requests. */
create or replace function monitor_dispatch_status() returns table (at timestamptz, workflow text, status int, answer text)
language sql security definer set search_path = public as $$
  select d.at, d.workflow, r.status_code, left(coalesce(r.content, r.error_msg), 200)
  from monitor_dispatches d left join net._http_response r on r.id = d.request_id
  order by d.at desc limit 10;
$$;

revoke all on function monitor_set_github_token(text) from public, anon, authenticated;
revoke all on function monitor_dispatch(text, jsonb) from public, anon, authenticated;
revoke all on function monitor_dispatch_status() from public, anon, authenticated;

-- The schedule installer with the three new jobs, so that re-running it keeps them.
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
  perform cron.schedule('monitor-q15',            '*/15 * * * *',  $c$select monitor_call('daily', 'job=q15')$c$);
  perform cron.schedule('monitor-hourly',         '5 * * * *',     $c$select monitor_call('daily', 'job=hourly')$c$);
  perform cron.schedule('monitor-news',           '*/10 * * * *',  $c$select monitor_call('daily', 'job=news')$c$);
  perform cron.schedule('monitor-history-asia',   '5 7 * * 1-5',   $c$select monitor_call('daily', 'job=history')$c$);
  perform cron.schedule('monitor-history-europe', '5 17 * * 1-5',  $c$select monitor_call('daily', 'job=history')$c$);
  perform cron.schedule('monitor-history-us',     '35 22 * * 1-5', $c$select monitor_call('daily', 'job=history')$c$);
  perform cron.schedule('monitor-stats-nk225',    '15 7 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=NK225')$c$);
  perform cron.schedule('monitor-stats-kospi200', '0 7 * * 1-5',   $c$select monitor_call('daily', 'job=stats&idx=KOSPI200')$c$);
  perform cron.schedule('monitor-stats-sse180',   '25 7 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=SSE180')$c$);
  perform cron.schedule('monitor-stats-hsi',      '25 8 * * 1-5',  $c$select monitor_call('daily', 'job=stats&idx=HSI')$c$);
  perform cron.schedule('monitor-stats-sp500',    '45 22 * * 1-5', $c$select monitor_call('daily', 'job=stats&idx=SP500')$c$);
  perform cron.schedule('monitor-stats-ndx',      '55 22 * * 1-5', $c$select monitor_call('daily', 'job=stats&idx=NDX')$c$);
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
  perform cron.schedule('monitor-shorts',         '30 2 * * 2-6',  $c$select monitor_call('daily', 'job=shorts')$c$);
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
  perform cron.schedule('monitor-sectors',        '55 0 * * *',    $c$select monitor_call('daily', 'job=sectors&limit=400')$c$);
  perform cron.schedule('monitor-calendar',       '15 * * * *',    $c$select monitor_call('daily', 'job=calendar')$c$);
  perform cron.schedule('monitor-prune',          '50 19 * * *',   $c$select monitor_call('daily', 'job=prune')$c$);
  -- 18 Nov 2026: one more quote pull after the Tokyo and Seoul closes (the feed is twenty minutes behind, so the
  -- last pull of the session never saw the closing auction), and the Morning Note asked for on time
  perform cron.schedule('monitor-flow-topix-close',    '3 7 * * 1-5',  $c$select monitor_call('daily', 'job=flow&idx=TOPIX')$c$);
  perform cron.schedule('monitor-flow-kospi200-close', '7 7 * * 1-5',  $c$select monitor_call('daily', 'job=flow&idx=KOSPI200')$c$);
  perform cron.schedule('monitor-morning-note',        '15 22 * * *',  $c$select monitor_dispatch('morning-note.yml', '{"if_missing":"true"}'::jsonb)$c$);
  select count(*) into n from cron.job where jobname like 'monitor-%';
  return n || ' schedules installed';
end $$;

-- The three new jobs now, without waiting for the installer to be run again (it needs the cron secret; these do not).
select cron.schedule('monitor-flow-topix-close',    '3 7 * * 1-5',  $c$select monitor_call('daily', 'job=flow&idx=TOPIX')$c$);
select cron.schedule('monitor-flow-kospi200-close', '7 7 * * 1-5',  $c$select monitor_call('daily', 'job=flow&idx=KOSPI200')$c$);
select cron.schedule('monitor-morning-note',        '15 22 * * *',  $c$select monitor_dispatch('morning-note.yml', '{"if_missing":"true"}'::jsonb)$c$);
