-- Big moves, the rule on trial (19 Nov 2026; supabase/functions/_shared/bigmoves.ts): two more kinds of move
-- can be queued for a reason, a new peak (pk) and a bottom (bt) of the twelve-month chart.
alter table move_causes drop constraint if exists move_causes_kind_check;
alter table move_causes add constraint move_causes_kind_check check (kind in ('d1','w1','m1','pk','bt'));
