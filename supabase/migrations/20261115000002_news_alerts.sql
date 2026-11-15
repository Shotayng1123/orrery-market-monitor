-- News alerts (Shota, 15 Nov 2026): buybacks, earnings-guidance revisions and M&A join the excessive-move alerts.
-- They carry no percentage move, and link to the headline they came from.
alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts add constraint alerts_kind_check check (kind in ('stock','index','buyback','revision','mna'));
alter table alerts alter column pct drop not null;
alter table alerts add column if not exists url text;
