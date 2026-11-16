import { useRef } from "react";

/** A pick-one selection as one button that opens a list (Shota, 16 Nov), like a data-validation cell in a
 *  spreadsheet: the label, the current choice and an arrow; a click or tap opens the choices. Replaces the rows
 *  of chips, which wrapped over several lines on a phone. On/off switches and action buttons stay chips.
 *
 *  The list itself is the browser's own drop-down: a transparent <select> lies over the button, so the list is
 *  never clipped by a panel, follows the page scale, works from the keyboard, and a phone shows its native picker. */
export interface PickOption<T extends string> { value: T; label?: string; disabled?: boolean }

export function Pick<T extends string>({ label, value, options, onChange, title, id }: {
  label: string; value: T; options: ReadonlyArray<T | PickOption<T>>; onChange: (v: T) => void; title?: string; id?: string;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o as string, disabled: false } : { value: o.value, label: o.label ?? o.value, disabled: !!o.disabled }));
  const current = opts.find((o) => o.value === value);
  // After a choice made with the mouse or a finger the list lets go of the keyboard, so the 1-6 tab keys work at
  // once (a focused list would swallow them). A choice made from the keyboard keeps the focus where the user put it.
  const byPointer = useRef(false);
  return (
    <label className="pick" id={id} title={title}>
      <span className="lbl">{label}</span>
      <span className="val" aria-hidden="true">{current?.label ?? value}</span>
      <select aria-label={label} value={value} onPointerDown={() => { byPointer.current = true; }} onKeyDown={() => { byPointer.current = false; }} onBlur={() => { byPointer.current = false; }}
        onChange={(e) => { onChange(e.target.value as T); if (byPointer.current) e.currentTarget.blur(); }}>
        {opts.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </label>
  );
}
