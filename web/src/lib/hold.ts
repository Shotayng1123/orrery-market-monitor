// While the opening plays (components/Opening.tsx) the Monitor underneath asks for its data as always, but the
// answers are held back until the opening is over. A browser page has one thread for drawing and for everything
// else: tables and charts filling in underneath would take it for tens of milliseconds at a time, and the
// opening would stutter. Held, the data is in hand when the opening ends and the screens fill at once.
let waiting: Promise<void> | null = null, release: (() => void) | null = null;

/** Holds the answers from now until `letGo()` is called, or `maxMs` have passed, whichever comes first. */
export function holdAnswers(maxMs: number): void {
  if (waiting) return;
  waiting = new Promise<void>((r) => { release = r; });
  setTimeout(letGo, maxMs);
}
export function letGo(): void {
  const r = release;
  waiting = null; release = null;
  r?.();
}
/** A promise that settles when the answers may be delivered; null when nothing holds them. */
export const held = (): Promise<void> | null => waiting;
