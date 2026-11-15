import { setWatched, useWatch } from "../lib/watch";

/** The watchlist star beside a name: filled when the symbol is on the user's list; a click adds or removes it. */
export function Star({ symbol, name }: { symbol: string; name?: string }) {
  const w = useWatch();
  const on = w.has(symbol);
  return (
    <span className={`star${on ? " on" : ""}`} role="button" aria-pressed={on} title={on ? `Remove ${name ?? symbol} from my watchlist` : `Add ${name ?? symbol} to my watchlist`}
      onClick={(e) => { e.stopPropagation(); void setWatched(symbol, !on, name); }}>{on ? "★" : "☆"}</span>
  );
}
