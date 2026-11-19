-- The welcome email also at a sign-in (Shota, 19 Nov 2026: "automate the welcome email, when they successfully
-- logged in"). Until now it went out only at the moment a new account's password was set. An account from before
-- the email existed, one the manager approved by hand, and one whose first sending failed had none.
--
-- Now any account that has not had it gets it once, at its next sign-in that succeeds (accounts.ts: welcome).
-- welcomed_at is claimed before the email is sent, so that two sign-ins at the same moment cannot both send it,
-- and given back if the sending fails. welcome_tries counts the sendings that failed: after three the Monitor
-- stops trying, so that a mailbox that refuses does not slow every later sign-in.
alter table accounts add column if not exists welcome_tries int not null default 0;
