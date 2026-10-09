/** Logo mark + wordmark. Server-safe (no hooks). */
export function BrandMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <path d="M10 6.5h4M17.5 10v4M6.5 10v4a3 3 0 0 0 3 3H14" />
      </svg>
    </span>
  );
}

export default function Brand({ sub }: { sub?: string }) {
  return (
    <span className="brand">
      <BrandMark />
      <span>
        <b>NPLify ERD</b>
        {sub && <small>{sub}</small>}
      </span>
    </span>
  );
}
