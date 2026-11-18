-- Accounts by email (Shota, 18 Nov 2026). A new account no longer waits for the manager: the person gives an
-- email address, the Monitor emails it a 6-digit code, and entering the code together with a password of their
-- own opens the account. Receiving the code is what proves the address is theirs.
--
-- email_codes holds the one code that currently counts for an address (as an HMAC, never the code itself) and
-- the counters that fence it in. The rules live in the two functions below, each one transaction, so that a
-- burst of requests at the same instant cannot get past them:
--   email_code_issue   may a code be sent to this address now? If so the row is written and 'ok' comes back.
--                      Refusals: 'gap' (one was sent less than p_gap_sec ago), 'email_hour' (p_per_email_hour codes
--                      to this address within the hour), 'ip_hour' (this network address asked for p_per_ip_hour
--                      different addresses within the hour), 'day' (p_per_day addresses within a day, everyone
--                      together). The limits protect strangers from being mailed and the sender's daily allowance.
--   email_code_check   one try at the code. 'ok' uses the code up; 'wrong' counts the try; after p_max_tries
--                      wrong tries the code is 'spent'; past its time it is 'expired'; 'none' when no code waits.
-- accounts.verified_at records when an account's address was confirmed this way (null for accounts the manager
-- approved before this change). The status 'pending' stays for those older sign-ups and for a server that has
-- no email sender set up, where the manager's approval remains the rule.
create table if not exists email_codes (
  email        text primary key check (email = lower(email) and length(email) between 5 and 254),
  code_hash    text not null,
  expires_at   timestamptz not null,
  tries        int not null default 0,
  sent         int not null default 1,           -- codes sent to this address since window_start
  window_start timestamptz not null default now(),
  last_sent    timestamptz not null default now(),
  ip           text
);
alter table email_codes enable row level security;
create index if not exists email_codes_last_sent on email_codes (last_sent);
create index if not exists email_codes_ip on email_codes (ip, last_sent);

alter table accounts add column if not exists verified_at timestamptz;

create or replace function email_code_issue(p_email text, p_hash text, p_ip text, p_ttl_min int, p_gap_sec int, p_per_email_hour int, p_per_ip_hour int, p_per_day int)
returns table (status text, wait_sec int)
language plpgsql security definer set search_path = public as $$
declare
  r   email_codes%rowtype;
  had boolean;
  n   int;
  t   timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(7461001);   -- one request at a time: the counts below must not race
  t := clock_timestamp();
  select * into r from email_codes where email = p_email;
  had := found;
  if had then
    if r.last_sent > t - make_interval(secs => p_gap_sec) then
      return query select 'gap'::text, ceil(extract(epoch from (r.last_sent + make_interval(secs => p_gap_sec) - t)))::int; return;
    end if;
    if r.window_start > t - interval '1 hour' and r.sent >= p_per_email_hour then
      return query select 'email_hour'::text, ceil(extract(epoch from (r.window_start + interval '1 hour' - t)))::int; return;
    end if;
  end if;
  -- an address already inside a count is not counted a second time
  if not had or r.last_sent <= t - interval '1 hour' then
    select count(*) into n from email_codes where ip = p_ip and last_sent > t - interval '1 hour';
    if n >= p_per_ip_hour then return query select 'ip_hour'::text, 0; return; end if;
  end if;
  if not had or r.last_sent <= t - interval '1 day' then
    select count(*) into n from email_codes where last_sent > t - interval '1 day';
    if n >= p_per_day then return query select 'day'::text, 0; return; end if;
  end if;
  insert into email_codes as c (email, code_hash, expires_at, tries, sent, window_start, last_sent, ip)
  values (p_email, p_hash, t + make_interval(mins => p_ttl_min), 0, 1, t, t, p_ip)
  on conflict (email) do update set
    code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0,
    sent = case when c.window_start > t - interval '1 hour' then c.sent + 1 else 1 end,
    window_start = case when c.window_start > t - interval '1 hour' then c.window_start else t end,
    last_sent = t, ip = p_ip;
  delete from email_codes where last_sent < t - interval '2 days';
  return query select 'ok'::text, 0;
end $$;

create or replace function email_code_check(p_email text, p_hash text, p_max_tries int)
returns table (status text, tries_left int)
language plpgsql security definer set search_path = public as $$
declare r email_codes%rowtype;
begin
  select * into r from email_codes where email = p_email for update;   -- two tries at once queue here
  if not found then return query select 'none'::text, 0; return; end if;
  if r.expires_at <= clock_timestamp() then return query select 'expired'::text, 0; return; end if;
  if r.tries >= p_max_tries then return query select 'spent'::text, 0; return; end if;
  if r.code_hash = p_hash then
    delete from email_codes where email = p_email;
    return query select 'ok'::text, p_max_tries - r.tries; return;
  end if;
  update email_codes set tries = r.tries + 1 where email = p_email;
  return query select 'wrong'::text, p_max_tries - r.tries - 1;
end $$;

-- a code that could not be sent must not stay usable
create or replace function email_code_void(p_email text) returns void
language sql security definer set search_path = public as $$
  update email_codes set expires_at = now() where email = p_email;
$$;

revoke all on function email_code_issue(text, text, text, int, int, int, int, int) from public, anon, authenticated;
revoke all on function email_code_check(text, text, int) from public, anon, authenticated;
revoke all on function email_code_void(text) from public, anon, authenticated;
