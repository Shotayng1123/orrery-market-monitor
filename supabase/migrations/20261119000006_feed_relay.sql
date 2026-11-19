-- The second path for prices (Shota, 19 Nov 2026: "this must be fixed defo").
--
-- On 18 Nov the source answered the Monitor's server with the same prices for seven and a half hours while it
-- gave GitHub's machines current ones. When the server's tick finds its own answers stopped it now asks GitHub
-- to start the relay (the workflow feed-relay.yml; functions/_shared/relay.ts), which pulls the prices from
-- there and writes them until the server's answers are current again.
--
-- The request goes through monitor_dispatch (migration 20261118000002) and so needs the GitHub token in the
-- vault. Without one nothing is asked: the relay then starts only on GitHub's own schedule, which runs late in
-- this repository. At most one request in ten minutes; a relay that is running takes the server off the question
-- altogether (the tick asks only while no relay is writing).
create or replace function feed_relay_kick() returns text
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from monitor_dispatches where workflow = 'feed-relay.yml' and at > now() - interval '10 minutes') then return 'asked recently'; end if;
  if monitor_dispatch('feed-relay.yml') is null then return 'no token'; end if;
  return 'asked';
end $$;
revoke all on function feed_relay_kick() from public, anon, authenticated;
