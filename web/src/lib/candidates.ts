// Adding a name to the watchlist by part of its name or of its ticker (Shota, 19 Nov 2026: "see some candidates,
// not exact match"). The candidates are the server's `search`, the same one the search box at the top uses: the
// Monitor's own instruments, the index constituents it holds, then Yahoo Finance.
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { DEV_MOCK } from "./useApi";
import { mockAction } from "./mock";
import { setWatched } from "./watch";

export interface Hit { symbol: string; name: string; kind: string; note: string }

/** The names that match `q`, asked for a moment after the typing stops. `term` is what `hits` were found for,
 *  so a caller can tell candidates for an earlier spelling from candidates for what is typed now. */
export function useCandidates(q: string, delay = 260): { hits: Hit[]; busy: boolean; term: string } {
  const [found, setFound] = useState<{ term: string; hits: Hit[] }>({ term: "", hits: [] });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim(), my = ++seq.current;
    if (!term) { setFound({ term: "", hits: [] }); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = DEV_MOCK ? (mockAction("search", { q: term }) as { rows: Hit[] }) : await api<{ rows: Hit[] }>("search", { q: term });
        if (my === seq.current) setFound({ term, hits: r.rows ?? [] });
      } catch { if (my === seq.current) setFound({ term, hits: [] }); }
      finally { if (my === seq.current) setBusy(false); }
    }, delay);
    return () => clearTimeout(t);
  }, [q, delay]);
  return { hits: found.hits, busy, term: found.term };
}

export interface AddBox {
  text: string; setText: (v: string) => void;
  hits: Hit[]; busy: boolean;
  sel: number; setSel: (i: number) => void;       // the candidate the arrow keys have reached; -1 = none
  msg: { kind: "err" | "ok"; text: string } | null;
  addHit: (h: Hit) => Promise<void>;
  submit: () => Promise<void>;
}
/** The add box of the watchlist. A candidate is added by choosing it. Enter (or ADD) adds:
 *    - the candidate whose symbol is exactly what was typed, whatever its case;
 *    - otherwise the candidate the arrow keys have reached;
 *    - otherwise, when there are candidates, nothing: it says to choose one (a name is never added by a guess);
 *    - with no candidates, the text itself as a symbol, as before (the server says if it does not know it). */
export function useAddBox(has: (symbol: string) => boolean): AddBox {
  const [text, setTextRaw] = useState("");
  const [sel, setSel] = useState(-1);
  const [msg, setMsg] = useState<AddBox["msg"]>(null);
  const { hits, busy, term } = useCandidates(text);
  const typed = text.trim(), fresh = term === typed;
  const shown = fresh ? hits : [];
  const setText = (v: string) => { setTextRaw(v); setMsg(null); setSel(-1); };
  const addHit = async (h: Hit) => {
    if (has(h.symbol)) { setMsg({ kind: "ok", text: `${h.name} (${h.symbol}) is already in your list` }); return; }
    const err = await setWatched(h.symbol, true, h.name);
    if (err) setMsg({ kind: "err", text: err });
    else { setTextRaw(""); setSel(-1); setMsg({ kind: "ok", text: `Added ${h.name} (${h.symbol})` }); }
  };
  const submit = async () => {
    if (!typed) return;
    const exact = shown.find((h) => h.symbol.toLowerCase() === typed.toLowerCase());
    if (exact) return addHit(exact);
    if (sel >= 0 && sel < shown.length) return addHit(shown[sel]);
    if (shown.length) { setMsg({ kind: "ok", text: "Choose one of the names in the list" }); return; }
    const err = await setWatched(/^[a-z]{1,5}$/.test(typed) ? typed.toUpperCase() : typed, true);
    if (err) setMsg({ kind: "err", text: err }); else { setTextRaw(""); setMsg(null); }
  };
  return { text, setText, hits: shown, busy: typed !== "" && (busy || !fresh), sel, setSel, msg, addHit, submit };
}
