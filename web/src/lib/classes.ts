// Dual-class share lines (GOOG / GOOGL, FOX / FOXA, NWS / NWSA, BRK-A / BRK-B) are one company. Panels that
// list companies merge them: sizes add up, the move comes from the more traded line.
export interface ClassRow { symbol: string; name: string; mcap?: number | null; turnover?: number | null; adv_turnover?: number | null; volume?: number | null; mf_net?: number | null; mf_up?: number | null; mf_down?: number | null }

const root = (s: string) => s.replace(/\.[A-Z]+$/, "").replace(/[-.]?[A-Z]$/, "");
/** True when two rows are share classes of the same company: identical name and one symbol extends the other. */
export function sameCompany(a: { symbol: string; name: string }, b: { symbol: string; name: string }): boolean {
  if (a.symbol === b.symbol || a.name !== b.name) return false;
  const x = a.symbol.replace(/\.[A-Z]+$/, ""), y = b.symbol.replace(/\.[A-Z]+$/, "");
  return x.startsWith(y) || y.startsWith(x) || root(x) === root(y);
}
/** Merges class lines: the primary (larger turnover, then market cap) keeps its moves and symbol; sizes are summed. */
export function mergeClasses<T extends ClassRow>(rows: T[]): Array<T & { classes?: string[] }> {
  const byName = new Map<string, T[]>();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  const out: Array<T & { classes?: string[] }> = [];
  for (const group of byName.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const used = new Set<number>();
    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      const cluster = [group[i]]; used.add(i);
      for (let j = i + 1; j < group.length; j++) if (!used.has(j) && sameCompany(group[i], group[j])) { cluster.push(group[j]); used.add(j); }
      if (cluster.length === 1) { out.push(group[i]); continue; }
      cluster.sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0) || (b.mcap ?? 0) - (a.mcap ?? 0));
      const p = { ...cluster[0] } as T & { classes?: string[] };
      const sum = (k: keyof ClassRow) => cluster.some((c) => c[k] != null) ? cluster.reduce((a, c) => a + ((c[k] as number | null | undefined) ?? 0), 0) : null;
      // market cap is reported for the whole company on every class line: take the largest, do not add
      p.mcap = cluster.some((c) => c.mcap != null) ? Math.max(...cluster.map((c) => c.mcap ?? 0)) : null;
      p.turnover = sum("turnover"); p.adv_turnover = sum("adv_turnover"); p.volume = sum("volume"); p.mf_net = sum("mf_net"); p.mf_up = sum("mf_up"); p.mf_down = sum("mf_down");
      p.classes = cluster.map((c) => c.symbol);
      out.push(p);
    }
  }
  return out;
}
