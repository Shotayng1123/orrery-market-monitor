-- Big moves and why (Shota, 18 Nov 2026). On the page of a large company (1tn yen and above, or 10bn US dollars
-- and above) the chart marks its big moves: a day of 5% or more, five sessions of 10% or more, a fall or rise
-- of 20% or more within a month (functions/_shared/bigmoves.ts). Each mark shows the reported reason.
--
-- The reasons are found by a job outside the database (jobs/move_causes.ts in GitHub Actions: a search of the
-- web, and a reason is kept only with the reports behind it). This table is the queue and the store:
--   queued     the page found the move and no reason is stored yet
--   found      `cause` (one sentence) and `sources` ([{title, url}], the reports it rests on)
--   not_found  searched; no report explained the move. Shown as that, never replaced by a guess.
--   error      the job could not finish this one; it is tried again up to three times
-- `ctx` is what the job needs to ask the question (the company's name, the prices, the benchmark's change over the
-- same dates), written by the page so the job reads no price history itself.
create table if not exists move_causes (
  symbol     text not null,
  kind       text not null check (kind in ('d1','w1','m1')),
  d          date not null,                 -- the day the move ends on: where its mark sits on the chart
  from_d     date not null,
  pct        double precision not null,
  ctx        jsonb not null,
  status     text not null default 'queued' check (status in ('queued','found','not_found','error')),
  cause      text,
  sources    jsonb not null default '[]'::jsonb,
  model      text,
  cost_usd   double precision,
  tries      int not null default 0,
  queued_at  timestamptz not null default now(),
  done_at    timestamptz,
  primary key (symbol, kind, d)
);
alter table move_causes enable row level security;
create index if not exists move_causes_queue on move_causes (status, d desc);

-- Asks GitHub to run the job (monitor_dispatch, migration 20261118000002), at most once in ten minutes and only
-- while something waits. Called by the page's own request when it queues a move. Without the GitHub token in the
-- vault nothing is asked, and the job runs on its own daily schedule or when started by hand.
create or replace function move_causes_kick() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from move_causes where status = 'queued') then return 'nothing queued'; end if;
  if exists (select 1 from monitor_dispatches where workflow = 'move-causes.yml' and at > now() - interval '10 minutes') then return 'asked recently'; end if;
  if monitor_dispatch('move-causes.yml') is null then return 'no token'; end if;
  return 'asked';
end $$;
revoke all on function move_causes_kick() from public, anon, authenticated;
