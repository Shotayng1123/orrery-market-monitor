const fs = require("fs");
// --- sigma colours: blue for ±1σ, yellow for ±2σ, dash by window; the mean a light grey ---
let c = fs.readFileSync("src/components/SigmaChart.tsx", "utf8");
c = c.replace(/const SIG: Record<[^\n]*\n/, `const SIG: Record<"m1" | "m12" | "m36", { dash?: number[] }> = { m1: {}, m12: { dash: [5, 4] }, m36: { dash: [1.5, 3] } };
const S1 = "rgba(90,167,255,0.80)", S2 = "rgba(255,197,61,0.75)", MEAN = "rgba(232,229,222,0.60)";   // ±1σ blue, ±2σ yellow (Shota)
`);
c = c.replace(`        series.push({ label: \`\${w.label}+1\`, stroke: s.stroke, width: 0.8, dash: d1, points: { show: false } });
        series.push({ label: \`\${w.label}-1\`, stroke: s.stroke, width: 0.8, dash: d1, points: { show: false } });
        series.push({ label: \`\${w.label}+2\`, stroke: s.stroke, width: 0.6, dash: d2, points: { show: false }, show: showTwoSigma });
        series.push({ label: \`\${w.label}-2\`, stroke: s.stroke, width: 0.6, dash: d2, points: { show: false }, show: showTwoSigma });
        series.push({ label: \`\${w.label} mean\`, stroke: "rgba(232,229,222,0.55)", width: 1, dash: d1, points: { show: false } });`,
`        series.push({ label: \`\${w.label}+1\`, stroke: S1, width: 0.9, dash: d1, points: { show: false } });
        series.push({ label: \`\${w.label}-1\`, stroke: S1, width: 0.9, dash: d1, points: { show: false } });
        series.push({ label: \`\${w.label}+2\`, stroke: S2, width: 0.9, dash: d2, points: { show: false }, show: showTwoSigma });
        series.push({ label: \`\${w.label}-2\`, stroke: S2, width: 0.9, dash: d2, points: { show: false }, show: showTwoSigma });
        series.push({ label: \`\${w.label} mean\`, stroke: MEAN, width: 1, dash: d1, points: { show: false } });`);
c = c.replace("const d1 = s.dash ? [...s.dash] : undefined, d2 = s.dash ? [...s.dash] : [8, 4];", "const d1 = s.dash ? [...s.dash] : undefined, d2 = s.dash ? [...s.dash] : undefined;");
fs.writeFileSync("src/components/SigmaChart.tsx", c);
// --- legend ---
let p = fs.readFileSync("src/components/PeriodBar.tsx", "utf8");
p = p.replace(`      <span className="legend" style={{ padding: 0, marginLeft: 14 }} title="Rolling mean ± 1σ over 21 / 252 / 756 trading days">
        <span><span className="sw solid" />1M mean ±1σ</span>
        <span><span className="sw dashed" />12M</span>
        <span><span className="sw dotted" />36M</span>
      </span>`,
`      <span className="legend" style={{ padding: 0, marginLeft: 14 }} title="Rolling mean and ±σ over 21 / 252 / 756 trading days; line style = window">
        <span><span className="sw s1" />±1σ</span>
        <span><span className="sw s2" />±2σ</span>
        <span><span className="sw mean" />mean</span>
        <span className="mut" style={{ marginLeft: 6 }}>1M ──  12M ╌╌  36M ····</span>
      </span>`);
fs.writeFileSync("src/components/PeriodBar.tsx", p);
let css = fs.readFileSync("src/styles/tokens.css", "utf8");
css += `
.legend .sw.s1{border-top:2px solid rgba(90,167,255,.9)}
.legend .sw.s2{border-top:2px solid rgba(255,197,61,.9)}
.legend .sw.mean{border-top:2px solid rgba(232,229,222,.7)}
table.mkt{table-layout:fixed}
table.mkt col.cls{width:7%} table.mkt col.nm{width:15%} table.mkt col.n{width:6%}
table.mkt td,table.mkt th{overflow:hidden;text-overflow:ellipsis}
`;
fs.writeFileSync("src/styles/tokens.css", css);
// --- market table: one decimal on levels, fixed equal columns ---
let m = fs.readFileSync("src/views/Market.tsx", "utf8");
m = m.replace(`function MarketsTable({ rows }: { rows: TableRow[] }) {
  const groups = new Map<string, TableRow[]>();
  for (const r of [...rows].sort((a, b) => a.order - b.order)) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  return (
    <table className="mkt">
      <thead>`,
`/** Levels in the table: one decimal from 100 up, two between 10 and 100, the instrument's own below 10 (FX crosses). */
const lvlDec = (v: number | null | undefined, d: number) => (v == null ? d : Math.abs(v) >= 100 ? Math.min(d, 1) : Math.abs(v) >= 10 ? Math.min(d, 2) : d);

function MarketsTable({ rows }: { rows: TableRow[] }) {
  const groups = new Map<string, TableRow[]>();
  for (const r of [...rows].sort((a, b) => a.order - b.order)) groups.set(r.cls, [...(groups.get(r.cls) ?? []), r]);
  return (
    <table className="mkt">
      <colgroup><col className="cls" /><col className="nm" />{Array.from({ length: 1 + PERIODS.length * 2 }, (_, i) => <col key={i} className="n" />)}</colgroup>
      <thead>`);
m = m.replace(`            <td className="num" style={{ background: levelShade(r.last, lo, hi) }}><b>{fmtNum(r.last, r.decimals)}</b></td>
            {PERIODS.map((p) => <td key={p.key} className={\`num\${p.key === "d1" ? " grp" : ""}\`} style={{ background: levelShade(r.closes[p.key], lo, hi) }} title={r.closeDates[p.key] ?? ""}>{fmtNum(r.closes[p.key], r.decimals)}</td>)}`,
`            <td className="num" style={{ background: levelShade(r.last, lo, hi) }}><b>{fmtNum(r.last, lvlDec(r.last, r.decimals))}</b></td>
            {PERIODS.map((p) => <td key={p.key} className={\`num\${p.key === "d1" ? " grp" : ""}\`} style={{ background: levelShade(r.closes[p.key], lo, hi) }} title={r.closeDates[p.key] ?? ""}>{fmtNum(r.closes[p.key], lvlDec(r.closes[p.key], r.decimals))}</td>)}`);
fs.writeFileSync("src/views/Market.tsx", m);
console.log("sigma:", c.includes("S1 ="), "| legend:", p.includes("sw s1"), "| table:", m.includes("lvlDec("));
