import { Fragment } from "react";

/** Text in which every σ stays lower case where the stylesheet upper-cases the rest (headers, drop-down labels):
 *  upper-cased, σ becomes Σ, the sum sign (the designer's D-11, 19 Nov 2026). The glyph alone is wrapped in `.sig`,
 *  so the text read by a screen reader or a CSV export is unchanged. Text without a σ is returned as it is; text with
 *  one comes in a single span, so that inside a flex box (a drop-down's label) it stays one line with its spaces. */
export function Sig({ children }: { children: string }) {
  if (!children.includes("σ")) return <>{children}</>;
  const parts = children.split("σ");
  return <span>{parts.map((p, i) => <Fragment key={i}>{i > 0 && <span className="sig">σ</span>}{p}</Fragment>)}</span>;
}
