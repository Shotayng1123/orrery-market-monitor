-- Alerts as push notifications (Shota, 2026-11-18): the devices that asked for them, and a mark on each alert
-- once it has been offered to them (functions/_shared/push.ts).
create table if not exists push_subs (
  id         bigserial primary key,
  user_id    text not null,                      -- the account (as in watchlists)
  endpoint   text not null unique,               -- the push service's address for one browser on one device
  p256dh     text not null,                      -- that browser's public key
  auth       text not null,                      -- and its shared secret
  scope      text not null default 'all' check (scope in ('all','mine')),   -- every alert, or only alerts on the account's watchlist names
  ua         text,
  created_at timestamptz not null default now(),
  last_ok    timestamptz,                        -- last accepted by the push service
  fails      int not null default 0              -- consecutive refusals; dropped after twenty
);
create index if not exists push_subs_user on push_subs (user_id);
alter table push_subs enable row level security;

alter table alerts add column if not exists pushed_at timestamptz;
-- alerts that exist already are not sent when the first device subscribes
update alerts set pushed_at = now() where pushed_at is null;
create index if not exists alerts_unpushed on alerts (at) where pushed_at is null;
