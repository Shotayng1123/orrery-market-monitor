/** Where a statements table that is wider than its box should rest (the designer's D-03, 19 Nov 2026).
 *
 *  The line names stay put at the left while the periods slide under them, so a period that stops part-way under
 *  the names leaves a fragment of a number beside them (".7", read as 0.7). The table opens at the latest periods
 *  with every one of them whole and the first of them against the names: the first column `k` from which every
 *  later column fits beside the names, the scroll offset that puts that column against them (`left`), and the
 *  room left after the last column (`pad`), which a spacer must give so the scroll can reach `left`.
 *
 *  `stick`: the names' width; `boxW`: the box's inner width; `starts`: each period column's left edge in the table;
 *  `tableW`: the table's width. All in the same px. */
export function finRest(stick: number, boxW: number, starts: number[], tableW: number): { k: number; left: number; pad: number } {
  const view = boxW - stick;
  if (!starts.length) return { k: 0, left: 0, pad: 0 };
  let k = starts.length - 1;
  while (k > 0 && tableW - starts[k - 1] <= view + 0.5) k--;
  return { k, left: Math.max(0, starts[k] - stick), pad: Math.max(0, view - (tableW - starts[k])) };
}

/** One screen back from where the box rests (`left`): the offset that puts against the names the earliest column
 *  from which the columns up to the one now against the names fill the screen; 0 at the start. A column wider than
 *  the screen still moves back by one. */
export function finBack(stick: number, boxW: number, starts: number[], left: number): number {
  const view = boxW - stick;
  let k = starts.findIndex((s) => s - stick >= left - 1);
  if (k < 0) k = starts.length;
  if (k <= 0) return 0;
  const end = k < starts.length ? starts[k] : starts[starts.length - 1] + view;
  let j = k - 1;
  while (j > 0 && end - starts[j - 1] <= view + 0.5) j--;
  return Math.max(0, starts[j] - stick);
}
