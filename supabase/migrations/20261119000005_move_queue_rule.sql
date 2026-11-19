-- Big moves: since 19 Nov 2026 every large company follows the second rule (a day of 10%, and the peaks and
-- bottoms of the closes; supabase/functions/_shared/bigmoves.ts). Moves of the first rule that were still waiting
-- for a look-up will never be looked up: they leave the queue. Answers already stored are kept.
delete from move_causes
 where status in ('queued', 'error')
   and (kind in ('w1', 'm1') or (kind = 'd1' and abs(pct) < 10));
