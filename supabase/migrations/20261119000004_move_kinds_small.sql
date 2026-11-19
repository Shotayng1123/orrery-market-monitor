-- Big moves, the rule on trial, its second level (19 Nov 2026): a smaller peak (p2) and a smaller bottom (b2)
-- can be queued for a reason as well.
alter table move_causes drop constraint if exists move_causes_kind_check;
alter table move_causes add constraint move_causes_kind_check check (kind in ('d1','w1','m1','pk','bt','p2','b2'));
