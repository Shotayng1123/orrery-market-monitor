-- Sectors on GICS names everywhere (Shota): official GICS for the S&P 500 (and the Nasdaq-100 names it covers),
-- Yahoo's classification mapped to the 11 GICS sector names for every other index, plus the industry. The
-- exchange's own scheme (TSE 17, Nikkei, HSI sub-index, Nasdaq) is kept in sector_local.
alter table constituents
  add column if not exists sector_local  text,
  add column if not exists gics_sector   text,    -- '' once looked up and not found, so the job does not retry forever
  add column if not exists gics_industry text,
  add column if not exists gics_source   text,
  add column if not exists name_en       text;    -- English name from Yahoo (TOPIX and KOSPI 200 sources are in Japanese / Korean)
update constituents set sector_local = sector where sector_local is null;
alter table constituent_stats add column if not exists industry text;

-- Copies the resolved sector and industry into the statistics rows (called after the sector jobs).
create or replace function fn_sync_sectors() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update constituent_stats s set sector = c.sector, industry = c.gics_industry, name = coalesce(c.name_en, c.name)
  from constituents c where c.idx = s.idx and c.symbol = s.symbol
    and (s.sector is distinct from c.sector or s.industry is distinct from c.gics_industry or s.name is distinct from coalesce(c.name_en, c.name));
  get diagnostics n = row_count;
  return n;
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
  perform cron.schedule('monitor-shorts',         '20 23 * * 1-5', $c$select monitor_call('daily', 'job=shorts')$c$);
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
  select count(*) into n from cron.job where jobname like 'monitor-%';
  return n || ' schedules installed';
end $$;
