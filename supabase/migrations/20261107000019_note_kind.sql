-- Morning notes every day: weekday and Saturday notes are 'daily', the Sunday note is the 'weekly' wrap-up.
alter table notes add column if not exists kind text not null default 'daily';
