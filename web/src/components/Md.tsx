import { Fragment, type ReactNode } from "react";

/** Minimal markdown for the notes: paragraphs, "- " bullets, **bold**, [text](url) links, [n] source markers, (E) marks. */
export function Md({ text, sources }: { text: string; sources?: Array<{ n: number; url: string; title: string }> }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return <>{blocks.map((b, i) => <Block key={i} text={b} sources={sources} />)}</>;
}

function Block({ text, sources }: { text: string; sources?: Array<{ n: number; url: string; title: string }> }) {
  const lines = text.split("\n").filter((l) => l.trim().length);
  if (!lines.length) return null;
  if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ""), sources)}</li>)}</ul>;
  if (/^#{1,6}\s/.test(lines[0])) return <h4>{inline(lines[0].replace(/^#{1,6}\s+/, ""), sources)}</h4>;
  return <p>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, sources)}</Fragment>)}</p>;
}

function inline(s: string, sources?: Array<{ n: number; url: string; title: string }>): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\[(\d{1,2})\])|(\(E\))/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<b key={k++}>{m[1].slice(2, -2)}</b>);
    else if (m[2]) { const t = m[2].match(/^\[([^\]]+)\]/)![1]; out.push(<a key={k++} href={m[3]} target="_blank" rel="noreferrer">{t}</a>); }
    else if (m[4]) { const n = Number(m[5]); const src = sources?.find((x) => x.n === n); out.push(src ? <a key={k++} className="src" href={src.url} target="_blank" rel="noreferrer" title={src.title}>[{n}]</a> : <span key={k++} className="src">[{n}]</span>); }
    else if (m[6]) out.push(<span key={k++} className="e" title="Estimate or judgement, not a sourced fact">(E)</span>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
