// The mark: two offer lines meeting at a deal, the landing chart in miniature.

/** The seller's line falls, the buyer's rises, and they meet at the deal. */
export const MARK = (
  <>
    <rect width="32" height="32" rx="2" fill="#000" />
    <path d="M7 9 L16 13 L25 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 24 L16 19.5 L25 16" fill="none" stroke="#4a6cf7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="25" cy="16" r="2.6" fill="#fff" />
  </>
);

/** The logo mark at `size` px; the word beside it stays real text. */
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      {MARK}
    </svg>
  );
}
