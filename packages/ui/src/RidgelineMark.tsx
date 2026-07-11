/**
 * The portal's signature mark: a mountain ridgeline mirrored over water —
 * Lake Lure. Drawn with currentColor; reflection is rendered fainter.
 */
export function RidgelineMark({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* ridge */}
      <path d="M2 15 L10 6 L15 11 L21 4 L30 15" />
      {/* waterline */}
      <path d="M2 18.5 H30" strokeWidth="1.5" />
      {/* reflection (compressed + faint) */}
      <path d="M4 22 L10 28 L15 24.5 L21 29.5 L28 22" opacity="0.45" strokeWidth="1.5" />
    </svg>
  )
}
