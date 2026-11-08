import { useEffect, useRef, useState, type ReactNode } from "react";

/** Wraps a price: when the value changes between refreshes the text flashes green (up) or red (down) for a moment. */
export function Flash({ value, children, className = "" }: { value: number | null | undefined; children: ReactNode; className?: string }) {
  const prev = useRef<number | null | undefined>(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    const was = prev.current;
    prev.current = value;
    if (was == null || value == null || value === was) return;
    setCls(value > was ? "flash-up" : "flash-dn");
    const t = setTimeout(() => setCls(""), 1800);
    return () => clearTimeout(t);
  }, [value]);
  return <span className={`${className} ${cls}`.trim()}>{children}</span>;
}
