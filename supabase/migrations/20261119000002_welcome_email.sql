-- The welcome email (Shota, 19 Nov 2026): sent once, when a new account's password has been set
-- (supabase/functions/_shared/welcome.ts). accounts.welcomed_at records when it went out; it stays null for an
-- account from before this change, and for one whose email could not be sent (the account is open all the same).
alter table accounts add column if not exists welcomed_at timestamptz;
