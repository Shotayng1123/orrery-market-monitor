// A small bar chart (SVG) for daily histories: one bar per observation, hover shows the value and date.
export function Bars({ data, height = 110, fmt = (v: number) => v.toFixed(1), color = "#1fd1c1", baseline }: { data: Array<{ d: string; v: number | null }>; height?: number; fmt?: (v: number) => string; color?: string; baseline?: number | null }) {
  const vals = data.map((x) => x.v).filter((v): v is number => v != null);
  if (vals.length < 2) return <div className="mut" style={{ fontSize: 10.5 }}>not enough history yet ({vals.length} day{vals.length === 1 ? "" : "s"})</div>;
  const lo = Math.min(0, ...vals, baseline ?? Infinity), hi = Math.max(...vals, baseline ?? -Infinity), span = hi - lo || 1;
  const W = 100, pad = 2, n = data.length, bw = Math.max(0.3, (W - pad * 2) / n - 0.4);
  const y = (v: number) => height - 14 - ((v - lo) / span) * (height - 20);
  const x = (i: number) => pad + (i * (W - pad * 2)) / n;
  const last = data[n - 1], first = data[0];
  return (
    <div className="barsbox">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
        {baseline != null && <line x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} stroke="#3a3b40" strokeWidth={0.4} strokeDasharray="1 1" />}
        {data.map((p, i) => p.v == null ? null : <rect key={p.d} x={x(i)} y={Math.min(y(p.v), y(0))} width={bw} height={Math.abs(y(0) - y(p.v)) || 0.3} fill={i === n - 1 ? "#e8e5de" : color} opacity={i === n - 1 ? 1 : 0.85}><title>{`${p.d}  ${fmt(p.v)}`}</title></rect>)}
      </svg>
      <div className="barsax"><span>{first.d}</span><span>{last.v == null ? "" : fmt(last.v)} · {last.d}</span></div>
    </div>
  );
}
