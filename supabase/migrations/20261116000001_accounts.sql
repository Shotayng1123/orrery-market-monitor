-- Personal accounts (Shota, 16 Nov 2026): one account per person, keyed by email, with the person's own password,
-- so a watchlist follows its owner across devices and nobody else can open it. This replaces "any ID + the one
-- shared password".
--   status  pending  = signed up, waiting for the manager's approval (the site is public; sign-up alone must not
--                      open the Monitor to anyone who finds it)
--           active   = may sign in
--           disabled = switched off by the manager
--   must_change   = the password was set by the manager (a reset) and has to be replaced at the next sign-in
--   tokens_after  = sign-in tokens issued before this moment are refused (moved forward by a password change, a
--                   reset or a disable, so old sessions end at once)
-- Passwords are stored only as PBKDF2-SHA256 hashes with a per-account salt. The table is reachable with the
-- service role only (row level security on, no policies), like every other Monitor table.
create table if not exists accounts (
  email         text primary key check (email = lower(email) and length(email) between 5 and 254),
  pw_hash       text not null,
  pw_salt       text not null,
  pw_iter       int  not null,
  role          text not null default 'user' check (role in ('manager','user')),
  status        text not null default 'pending' check (status in ('pending','active','disabled')),
  must_change   boolean not null default false,
  tokens_after  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  last_seen     timestamptz,
  logins        int not null default 0
);
alter table accounts enable row level security;
