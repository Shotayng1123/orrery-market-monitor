// The orrery mark, identical to Orrery Analytics (same brand, by Shota's brief).
export function Logo({ className = "mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" aria-hidden="true">
      <circle cx="100" cy="92" r="70" />
      <ellipse cx="100" cy="92" rx="70" ry="22" />
      <ellipse cx="100" cy="92" rx="70" ry="46" transform="rotate(-32 100 92)" />
      <circle cx="100" cy="92" r="7" fill="currentColor" stroke="none" />
      <circle cx="114.1" cy="38.8" r="5.25" fill="currentColor" stroke="none" />
      <line x1="100" y1="162" x2="100" y2="182" />
      <path d="M72 186 Q100 176 128 186" />
    </svg>
  );
}
