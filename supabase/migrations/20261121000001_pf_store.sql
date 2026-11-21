-- The paper portfolio's store (P-1, 21 Nov 2026): the statement an account agrees to, its portfolios, their settings
-- with the history, and its notes. No orders, no prices, no NAV yet: those come with the increments that follow.
--
-- Until P-4a is accepted nothing of the paper book is usable on the live Monitor: the API's portfolio routes refuse
-- (supabase/functions/_shared/pf/switch.ts), so these tables are deployed and stay empty.
--
-- WHO MAY SEE WHAT. A portfolio belongs to one account and is visible to that account only. Every Monitor table has
-- row level security on and no policy, so only the server reads it and the API filters by account in code. The
-- portfolio keeps that rule and adds a second wall inside the database, so that a slip in the API cannot show one
-- account another's book:
--   1. No role of the API holds a privilege on these tables: not anon, not authenticated, and not service_role
--      either. Supabase grants new tables to all three by default; this file takes those grants away.
--   2. The only door is the functions pf_*(p_account, …) below, which service_role may call and nobody else. Each
--      names the account in every statement it runs.
--   3. A role the policies bind, monitor_account (no login, no BYPASSRLS), owns those functions, so each runs as a
--      role that row level security applies to, with one policy per table: account = the account the function set
--      for its transaction (monitor.account). No setting, no rows.
--   4. Every child row carries (portfolio_id, account) with a foreign key to pf_portfolios (id, account): a row
--      cannot name another account's portfolio, whoever writes it.
-- Step 3 needs the role that applies this file to be allowed to make a role and to hand functions to it. If the
-- hosted database refuses any part of that, the notice says so and the functions stay with their maker: they still
-- work, each with its explicit account filter, and pf_selftest() reports which way it is (definerOwner).
--
-- WHAT IS NEVER CHANGED. The settings and their history are append-only: a change is a new row, in force from the
-- next session. A note is never edited; its writer may remove it, and then its text goes while a line with the time
-- stays. What is fixed at creation (the start, the base currency, the starting NAV, the reference, the ladder, the
-- house margin multiple, the targets) cannot be updated. A portfolio's rows go only with the portfolio, by pf_delete,
-- after its account has typed its name.
--
-- Ranges, steps and the rules between fields are the server's code (supabase/functions/_shared/pf/form.ts), the same
-- the page uses; the database keeps the structure and the few bounds written below.

-- ---------- the statement, and who has agreed to which version ----------
create table if not exists consent_statements (
  version  int primary key,
  body     text not null,
  label    text not null,
  from_at  timestamptz not null default now()
);
alter table consent_statements enable row level security;
-- Version 1: the owner's wording, chosen on 20 Nov 2026 ("go with B"). Placed, never reworded: other words are a
-- version 2, asked again of every account. sim/logic.test.ts compares this text, character for character, with the
-- page's copy and with the owner's record quoted in supabase/README.md.
insert into consent_statements (version, body, label) values
  (1, 'Private notes, levels and paper portfolios are kept for your account only. Do not enter non-public or confidential information, in notes or in positions: nothing material and non-public about a company or a market, and nothing confidential of your firm or its clients.', 'I agree')
on conflict (version) do nothing;

create table if not exists account_consents (
  account    text not null references accounts(email) on delete cascade,
  version    int  not null references consent_statements(version),
  agreed_at  timestamptz not null default now(),
  primary key (account, version)
);
alter table account_consents enable row level security;

-- ---------- a portfolio ----------
create table if not exists pf_portfolios (
  id              uuid primary key default gen_random_uuid(),   -- its address on the page; never its name
  account         text not null references accounts(email) on delete cascade,
  request_id      text not null check (request_id ~ '^[A-Za-z0-9_-]{8,64}$'),   -- one per form: a second press creates nothing twice
  name            text not null check (char_length(name) between 1 and 60),
  kind            text not null check (kind in ('AR','RR')),
  start           text not null check (start in ('ar-ls-jp','ar-ls-gl','ar-macro','rr-eq','rr-fi')),
  base            text not null check (base in ('USD','JPY')),
  starting_nav    bigint not null check (starting_nav > 0),     -- whole minor units: USD cents, JPY yen
  fx              jsonb,                                        -- a yen base: its USD equivalent as shown at creation, with the rate, its date and source
  target_x        numeric not null check (target_x between 0 and 15),
  target_vol      numeric not null check (target_vol between 2 and 8),
  reference       text not null,
  blend           int check (blend is null or blend between 10 and 90),
  ladder_base     text not null check (ladder_base in ('guarded','yearly','start')),
  ladder          jsonb not null,
  house_multiple  numeric not null check (house_multiple between 1 and 2),
  valuation       text not null,
  status          text not null default 'open' check (status in ('open','stopped','closed')),
  started_on      date not null,
  created_at      timestamptz not null default now(),
  unique (id, account),
  unique (account, request_id)
);
alter table pf_portfolios enable row level security;
create index if not exists pf_portfolios_account on pf_portfolios (account, created_at);

-- every setting a portfolio was created with, and every change since: append-only
create table if not exists pf_settings (
  id              bigint generated always as identity primary key,
  portfolio_id    uuid not null,
  account         text not null,
  key             text not null check (char_length(key) between 1 and 40),
  value           jsonb not null,
  cls             text not null check (cls in ('fixed','limit','assumption','window','name')),   -- what may happen to it after creation
  basis           text not null check (char_length(basis) between 1 and 200),                    -- "default (PM advice: A)" … "set by the account"
  reason          text check (reason is null or char_length(reason) between 10 and 500),
  origin          text not null check (origin in ('creation','change')),
  effective_from  date,       -- the session a change is in force from; null for a target's re-set, which waits for its January
  for_year        int,        -- a target's re-set: the year it is entered for
  at              timestamptz not null default now(),
  foreign key (portfolio_id, account) references pf_portfolios (id, account) on delete cascade
);
alter table pf_settings enable row level security;
create index if not exists pf_settings_book on pf_settings (portfolio_id, key, id);

create table if not exists pf_notes (
  id            bigint generated always as identity primary key,
  portfolio_id  uuid not null,
  account       text not null,
  target        text not null default 'portfolio' check (target in ('portfolio','order','position','trade')),
  target_id     text,
  body          text check (body is null or char_length(body) between 1 and 2000),
  at            timestamptz not null default now(),
  removed_at    timestamptz,
  check ((body is null) = (removed_at is not null)),   -- a removed note keeps its line and loses its text
  foreign key (portfolio_id, account) references pf_portfolios (id, account) on delete cascade
);
alter table pf_notes enable row level security;
create index if not exists pf_notes_book on pf_notes (portfolio_id, id);

-- The ladder's events. P-1 writes none: the daily NAV (P-3) records them and adds its figures as columns. The table
-- is made here because a re-set of the targets waits for its year's January line: "year reset" brings it into force,
-- "year reset held" (a cut in force) and "year reset withheld" (a losing year, guarded base) let it lapse.
create table if not exists pf_ladder_events (
  id            bigint generated always as identity primary key,
  portfolio_id  uuid not null,
  account       text not null,
  d             date not null,
  kind          text not null check (kind in ('cut','restore','out','year reset','year reset held','year reset withheld','warning','cut pending a corporate-action check')),
  detail        jsonb,
  at            timestamptz not null default now(),
  foreign key (portfolio_id, account) references pf_portfolios (id, account) on delete cascade
);
alter table pf_ladder_events enable row level security;
create index if not exists pf_ladder_events_book on pf_ladder_events (portfolio_id, d);

-- ---------- nothing granted to the API's roles ----------
revoke all on consent_statements, account_consents, pf_portfolios, pf_settings, pf_notes, pf_ladder_events from public, anon, authenticated, service_role;

-- ---------- what is never changed ----------
create or replace function pf_guard_portfolio() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('monitor.pf_deleting', true) = old.id::text then return old; end if;        -- pf_delete, for this portfolio
    if not exists (select 1 from accounts where email = old.account) then return old; end if;     -- its account has been deleted
    raise exception 'a paper portfolio is deleted only by its account, after typing its name';
  end if;
  if new.id is distinct from old.id or new.account is distinct from old.account or new.request_id is distinct from old.request_id
     or new.kind is distinct from old.kind or new.start is distinct from old.start or new.base is distinct from old.base
     or new.starting_nav is distinct from old.starting_nav or new.fx is distinct from old.fx
     or new.target_x is distinct from old.target_x or new.target_vol is distinct from old.target_vol
     or new.reference is distinct from old.reference or new.blend is distinct from old.blend
     or new.ladder_base is distinct from old.ladder_base or new.ladder is distinct from old.ladder
     or new.house_multiple is distinct from old.house_multiple or new.valuation is distinct from old.valuation
     or new.started_on is distinct from old.started_on or new.created_at is distinct from old.created_at then
    raise exception 'fixed at creation: only a portfolio''s name and its status may change';
  end if;
  return new;
end $$;
drop trigger if exists pf_portfolios_guard on pf_portfolios;
create trigger pf_portfolios_guard before update or delete on pf_portfolios for each row execute function pf_guard_portfolio();

create or replace function pf_guard_append() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('monitor.pf_deleting', true) = old.portfolio_id::text then return old; end if;         -- pf_delete, for this portfolio
    if not exists (select 1 from pf_portfolios where id = old.portfolio_id) then return old; end if;         -- its portfolio has gone with its account
    raise exception 'append-only: a row of % goes only with its portfolio', tg_table_name;
  end if;
  if tg_table_name = 'pf_notes' then   -- (asked of a note only: the other tables have no such columns)
    if old.removed_at is null and new.removed_at is not null and new.body is null
       and new.id = old.id and new.portfolio_id = old.portfolio_id and new.account = old.account and new.at = old.at
       and new.target = old.target and new.target_id is not distinct from old.target_id then
      return new;   -- a note removed by its writer: the text goes, the line stays
    end if;
  end if;
  raise exception 'append-only: a row of % is never changed', tg_table_name;
end $$;
drop trigger if exists pf_settings_guard on pf_settings;
create trigger pf_settings_guard before update or delete on pf_settings for each row execute function pf_guard_append();
drop trigger if exists pf_notes_guard on pf_notes;
create trigger pf_notes_guard before update or delete on pf_notes for each row execute function pf_guard_append();
drop trigger if exists pf_ladder_events_guard on pf_ladder_events;
create trigger pf_ladder_events_guard before update or delete on pf_ladder_events for each row execute function pf_guard_append();

-- ---------- the only door: pf_*(p_account, …) ----------
-- A portfolio as the page reads it (no account, no request id).
create or replace function pf_book_json(b pf_portfolios) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', b.id, 'name', b.name, 'kind', b.kind, 'start', b.start, 'base', b.base, 'startingNav', b.starting_nav, 'fx', b.fx,
    'targetX', b.target_x, 'targetVol', b.target_vol, 'reference', b.reference, 'blend', b.blend, 'ladderBase', b.ladder_base, 'ladder', b.ladder,
    'houseMultiple', b.house_multiple, 'valuation', b.valuation, 'status', b.status, 'createdAt', b.created_at, 'startedOn', b.started_on);
$$;

create or replace function pf_consent(p_account text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s consent_statements%rowtype; a timestamptz;
begin
  perform set_config('monitor.account', p_account, true);
  select * into s from consent_statements order by version desc limit 1;
  select agreed_at into a from account_consents where account = p_account and version = s.version;
  return jsonb_build_object('version', s.version, 'text', s.body, 'label', s.label, 'agreedAt', a);
end $$;

create or replace function pf_consent_agree(p_account text, p_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('monitor.account', p_account, true);
  if p_version is distinct from (select max(version) from consent_statements) then raise exception 'this is not the statement''s current version'; end if;
  insert into account_consents (account, version) values (p_account, p_version) on conflict (account, version) do nothing;
  return pf_consent(p_account);
end $$;

create or replace function pf_list(p_account text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('monitor.account', p_account, true);
  return coalesce((select jsonb_agg(pf_book_json(b) order by b.created_at, b.id) from pf_portfolios b where b.account = p_account), '[]'::jsonb);
end $$;

create or replace function pf_request(p_account text, p_request text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('monitor.account', p_account, true);
  return (select id::text from pf_portfolios where account = p_account and request_id = p_request);
end $$;

create or replace function pf_create(p_account text, p_book jsonb, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_started date := (p_book->>'startedOn')::date; n int;
begin
  perform set_config('monitor.account', p_account, true);
  perform pg_advisory_xact_lock(7461002, hashtext(p_account));   -- one create at a time per account: the count below must not race
  select id into v_id from pf_portfolios where account = p_account and request_id = p_book->>'requestId';
  if found then return jsonb_build_object('id', v_id); end if;
  if not exists (select 1 from account_consents where account = p_account and version = (select max(version) from consent_statements)) then
    raise exception 'the statement is not agreed';
  end if;
  select count(*) into n from pf_portfolios where account = p_account and status = 'open';
  if n >= 5 then raise exception 'You have 5 open paper portfolios, the most an account may hold. Delete one to start another.'; end if;
  if exists (select 1 from pf_portfolios where account = p_account and status = 'open' and name = p_book->>'name') then
    raise exception 'you already have an open portfolio with this name';
  end if;
  insert into pf_portfolios (account, request_id, name, kind, start, base, starting_nav, fx, target_x, target_vol, reference, blend, ladder_base, ladder, house_multiple, valuation, started_on)
  values (p_account, p_book->>'requestId', p_book->>'name', p_book->>'kind', p_book->>'start', p_book->>'base', (p_book->>'startingNav')::bigint, nullif(p_book->'fx', 'null'::jsonb),
    (p_book->>'targetX')::numeric, (p_book->>'targetVol')::numeric, p_book->>'reference', (p_book->>'blend')::int, p_book->>'ladderBase', p_book->'ladder', (p_book->>'houseMultiple')::numeric, p_book->>'valuation', v_started)
  returning id into v_id;
  insert into pf_settings (portfolio_id, account, key, value, cls, basis, origin, effective_from)
  values (v_id, p_account, 'name', to_jsonb(p_book->>'name'), 'name', 'set by the account', 'creation', v_started);
  insert into pf_settings (portfolio_id, account, key, value, cls, basis, origin, effective_from)
  select v_id, p_account, t.x->>'key', t.x->'value', t.x->>'cls', t.x->>'basis', 'creation', v_started
  from jsonb_array_elements(p_settings) with ordinality as t(x, o) order by t.o;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function pf_get(p_account text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform set_config('monitor.account', p_account, true);
  select pf_book_json(b) || jsonb_build_object(
    'settings', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'key', s.key, 'value', s.value, 'cls', s.cls, 'basis', s.basis, 'reason', s.reason, 'at', s.at,
        'effectiveFrom', s.effective_from, 'forYear', s.for_year, 'origin', s.origin) order by s.id)
      from pf_settings s where s.portfolio_id = b.id and s.account = p_account), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'body', x.body, 'removedAt', x.removed_at) order by x.id desc)
      from pf_notes x where x.portfolio_id = b.id and x.account = p_account and x.target = 'portfolio'), '[]'::jsonb),
    'resets', coalesce((select jsonb_agg(jsonb_build_object('year', extract(year from e.d)::int,
        'kind', case e.kind when 'year reset' then 'made' when 'year reset held' then 'held' else 'withheld' end, 'd', e.d) order by e.d, e.id)
      from pf_ladder_events e where e.portfolio_id = b.id and e.account = p_account and e.kind in ('year reset','year reset held','year reset withheld')), '[]'::jsonb))
  into v from pf_portfolios b where b.id = p_id and b.account = p_account;
  return v;   -- null: no such portfolio in this account
end $$;

create or replace function pf_rename(p_account text, p_id uuid, p_name text, p_today date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('monitor.account', p_account, true);
  if not exists (select 1 from pf_portfolios where id = p_id and account = p_account) then raise exception 'No such paper portfolio in your account.'; end if;
  if exists (select 1 from pf_portfolios where account = p_account and status = 'open' and id <> p_id and name = p_name) then
    raise exception 'you already have an open portfolio with this name';
  end if;
  update pf_portfolios set name = p_name where id = p_id and account = p_account;
  insert into pf_settings (portfolio_id, account, key, value, cls, basis, origin, effective_from)
  values (p_id, p_account, 'name', to_jsonb(p_name), 'name', 'set by the account', 'change', p_today);
end $$;

-- A limit or an assumption, changed: with a reason, in force from the next session, never backwards.
create or replace function pf_setting_set(p_account text, p_id uuid, p_key text, p_value jsonb, p_reason text, p_effective date, p_today date) returns void
language plpgsql security definer set search_path = public as $$
declare v_cls text; n int := char_length(btrim(coalesce(p_reason, '')));
begin
  perform set_config('monitor.account', p_account, true);
  if not exists (select 1 from pf_portfolios where id = p_id and account = p_account) then raise exception 'No such paper portfolio in your account.'; end if;
  select cls into v_cls from pf_settings where portfolio_id = p_id and account = p_account and key = p_key and origin = 'creation' order by id limit 1;
  if v_cls is null or v_cls in ('fixed','name') then raise exception 'this setting is fixed at creation'; end if;
  if v_cls = 'window' then raise exception 'the targets are re-set together, in their window'; end if;
  if n < 10 then raise exception 'give a reason of at least 10 characters: it is kept in the history'; end if;
  if n > 500 then raise exception '500 characters at most'; end if;
  if p_effective is null or p_today is null or p_effective <= p_today then raise exception 'a change is in force from the next session, never backwards'; end if;
  insert into pf_settings (portfolio_id, account, key, value, cls, basis, reason, origin, effective_from)
  values (p_id, p_account, p_key, p_value, v_cls, 'set by the account', btrim(p_reason), 'change', p_effective);
end $$;

-- Next year's targets, entered in their window: from 1 December (the date in New York) until the January reset is on
-- record, under a yearly base. They wait as "pending": in force from the interval after a reset that is made, lapsed
-- when the reset is held or withheld.
create or replace function pf_targets_set(p_account text, p_id uuid, p_x numeric, p_vol numeric, p_today date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b pf_portfolios%rowtype; y int := extract(year from p_today)::int; m int := extract(month from p_today)::int; v_for int;
begin
  perform set_config('monitor.account', p_account, true);
  select * into b from pf_portfolios where id = p_id and account = p_account;
  if not found then raise exception 'No such paper portfolio in your account.'; end if;
  if b.ladder_base = 'start' then raise exception 'the targets are fixed under "since the start"'; end if;
  if m = 12 then v_for := y + 1;
  elsif m = 1 and not exists (select 1 from pf_ladder_events where portfolio_id = p_id and account = p_account
      and kind in ('year reset','year reset held','year reset withheld') and extract(year from d)::int = y) then v_for := y;
  else raise exception 'the targets can be re-set from 1 Dec to the January reset';
  end if;
  if p_x is null or p_x < 0 or p_x > 15 then raise exception 'between 0%% and 15%%'; end if;
  if p_vol is null or p_vol < 2 or p_vol > 8 then raise exception 'between 2%% and 8%%'; end if;
  insert into pf_settings (portfolio_id, account, key, value, cls, basis, origin, for_year)
  values (p_id, p_account, 'target_x', to_jsonb(p_x), 'window', 'set by the account', 'change', v_for),
         (p_id, p_account, 'target_vol', to_jsonb(p_vol), 'window', 'set by the account', 'change', v_for);
  return jsonb_build_object('forYear', v_for);
end $$;

create or replace function pf_note_add(p_account text, p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('monitor.account', p_account, true);
  if not exists (select 1 from pf_portfolios where id = p_id and account = p_account) then raise exception 'No such paper portfolio in your account.'; end if;
  if not exists (select 1 from account_consents where account = p_account and version = (select max(version) from consent_statements)) then
    raise exception 'the statement is not agreed';
  end if;
  if p_body is null or char_length(p_body) < 1 or char_length(p_body) > 2000 then raise exception '2,000 characters at most'; end if;
  insert into pf_notes (portfolio_id, account, body) values (p_id, p_account, p_body);
end $$;

create or replace function pf_note_remove(p_account text, p_id uuid, p_note bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('monitor.account', p_account, true);
  if not exists (select 1 from pf_portfolios where id = p_id and account = p_account) then raise exception 'No such paper portfolio in your account.'; end if;
  update pf_notes set body = null, removed_at = clock_timestamp() where id = p_note and portfolio_id = p_id and account = p_account and removed_at is null;
  if not found then raise exception 'no such note'; end if;
end $$;

-- A portfolio and everything in it, gone for good: only after its account has typed its name. The agreement to the
-- statement stays; other portfolios are untouched.
create or replace function pf_delete(p_account text, p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare b pf_portfolios%rowtype;
begin
  perform set_config('monitor.account', p_account, true);
  select * into b from pf_portfolios where id = p_id and account = p_account;
  if not found then raise exception 'No such paper portfolio in your account.'; end if;
  if p_name is distinct from b.name then raise exception 'that is not this portfolio''s name'; end if;
  perform set_config('monitor.pf_deleting', p_id::text, true);
  delete from pf_notes where portfolio_id = p_id and account = p_account;
  delete from pf_ladder_events where portfolio_id = p_id and account = p_account;
  delete from pf_settings where portfolio_id = p_id and account = p_account;
  delete from pf_portfolios where id = p_id and account = p_account;
  perform set_config('monitor.pf_deleting', '', true);
end $$;

-- A read-only look at the walls above, for the live check (jobs/live_check.ts, part "pf"). Counts only: it returns
-- no account, no name and no figure of any book. As a made-up account it must see nothing.
create or replace function pf_selftest() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text[] := array['consent_statements','account_consents','pf_portfolios','pf_settings','pf_notes','pf_ladder_events'];
  probe text := 'selftest.' || replace(gen_random_uuid()::text, '-', '') || '@invalid.example';
  n_rls int; n_pol int; n_grant int; n_svc int; n_fn int; n_owner int; n_open int; n_seen int; n_wall int; n_stmt int;
begin
  select count(*) into n_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any(t) and c.relrowsecurity;
  select count(*) into n_pol from pg_policies where schemaname = 'public' and tablename = any(t) and 'monitor_account' = any(roles);
  select count(*) into n_grant from unnest(t) x, unnest(array['anon','authenticated']) r, unnest(array['select','insert','update','delete']) p
    where exists (select 1 from pg_roles where rolname = r) and has_table_privilege(r, 'public.' || x, p);
  select count(*) into n_svc from unnest(t) x, unnest(array['select','insert','update','delete']) p
    where exists (select 1 from pg_roles where rolname = 'service_role') and has_table_privilege('service_role', 'public.' || x, p);
  select count(*), count(*) filter (where pg_get_userbyid(p.proowner) = 'monitor_account') into n_fn, n_owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pf\_%' and p.prosecdef;
  select count(*) into n_open from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(array['anon','authenticated']) r
    where n.nspname = 'public' and p.proname like 'pf\_%' and exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, p.oid, 'execute');
  -- as a made-up account: nothing to see, through the functions and with the account named in the query
  perform set_config('monitor.account', probe, true);
  select (select count(*) from pf_portfolios where account = probe) + (select count(*) from pf_settings where account = probe) + (select count(*) from pf_notes where account = probe)
       + (select count(*) from account_consents where account = probe) + jsonb_array_length(pf_list(probe)) into n_seen;
  -- and through the policies alone (no account named in the query), where this function runs as the role they bind
  if n_fn > 0 and n_owner = n_fn then
    perform set_config('monitor.account', probe, true);
    select (select count(*) from pf_portfolios) + (select count(*) from pf_settings) + (select count(*) from pf_notes) + (select count(*) from account_consents) + (select count(*) from pf_ladder_events) into n_wall;
  end if;
  select count(*) into n_stmt from consent_statements;
  return jsonb_build_object('tables', array_length(t, 1), 'rls', n_rls, 'policies', n_pol, 'openGrants', n_grant, 'serviceRoleGrants', n_svc, 'functions', n_fn, 'definerOwner', n_owner,
    'openFunctions', n_open, 'rowsSeen', n_seen, 'rowsThroughPolicies', n_wall, 'statements', n_stmt,
    'ok', n_rls = array_length(t, 1) and n_grant = 0 and n_open = 0 and n_seen = 0 and coalesce(n_wall, 0) = 0 and n_stmt >= 1);
end $$;

-- ---------- who may call them: the server, and nobody else ----------
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pf\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------- the second wall: a role the policies bind owns the functions ----------
do $$
declare f regprocedure; t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'monitor_account') then
    create role monitor_account nologin;
  end if;
  -- whoever applies this file must be able to act as the role, to hand the functions to it and to replace them later
  if current_setting('server_version_num')::int >= 160000 then
    execute format('grant monitor_account to %I with inherit true, set true', current_user);
  else
    execute format('grant monitor_account to %I', current_user);
  end if;
  grant usage on schema public to monitor_account;
  grant create on schema public to monitor_account;   -- held only while the functions are handed over (taken back below)
  foreach t in array array['pf_portfolios','pf_settings','pf_notes','pf_ladder_events','account_consents'] loop
    execute format('grant select, insert, update, delete on %I to monitor_account', t);
    execute format('drop policy if exists pf_own on %I', t);
    execute format('create policy pf_own on %I for all to monitor_account using (account = current_setting(''monitor.account'', true)) with check (account = current_setting(''monitor.account'', true))', t);
  end loop;
  grant select on consent_statements to monitor_account;
  drop policy if exists pf_read on consent_statements;
  create policy pf_read on consent_statements for select to monitor_account using (true);
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pf\_%' and p.prosecdef loop
    execute format('alter function %s owner to monitor_account', f);
  end loop;
  grant execute on function pf_book_json(pf_portfolios) to monitor_account;   -- the helper the functions above call
  revoke create on schema public from monitor_account;
exception when others then
  raise notice 'pf_store: the definer-owner pattern is not in force (%). The functions stay with their maker and work as before, each with its explicit account filter; pf_selftest() reports definerOwner 0.', sqlerrm;
end $$;
