import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { DEV_MOCK } from "../lib/useApi";
import { mockAction } from "../lib/mock";
import { openAsset } from "./CompanyCard";

interface Hit { symbol: string; name: string; kind: string; note: string }

/** Top-right search: Monitor instruments, index constituents, then Yahoo Finance; Enter or click opens the asset page. */
export function Search() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) { setHits([]); return; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = DEV_MOCK ? (mockAction("search", { q: term }) as { rows: Hit[] }) : await api<{ rows: Hit[] }>("search", { q: term });
        if (my === seq.current) { setHits(r.rows); setSel(0); setOpen(true); }
      } catch { if (my === seq.current) setHits([]); }
      finally { if (my === seq.current) setBusy(false); }
    }, 260);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "/" && (e.target as HTMLElement | null)?.tagName !== "INPUT") { e.preventDefault(); box.current?.querySelector("input")?.focus(); } };
    window.addEventListener("mousedown", off); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", off); window.removeEventListener("keydown", key); };
  }, []);
  const go = (h: Hit | undefined) => { if (!h) return; setOpen(false); setQ(""); openAsset(h.symbol); };
  return (
    <div id="search" ref={box}>
      <input type="text" value={q} placeholder="search stocks, bonds, currencies  (/)" aria-label="search" onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); } else if (e.key === "Enter") { e.preventDefault(); go(hits[sel] ?? (q.trim() ? { symbol: q.trim().toUpperCase(), name: q.trim(), kind: "", note: "" } : undefined)); } else if (e.key === "Escape") setOpen(false); }} />
      {open && (hits.length > 0 || busy) && (
        <div className="sres">
          {busy && !hits.length && <div className="sitem mut">searching …</div>}
          {hits.map((h, i) => (
            <div key={h.symbol} className={`sitem${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); go(h); }}>
              <b>{h.symbol}</b><span className="nm">{h.name}</span><span className="mut">{[h.kind, h.note].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
