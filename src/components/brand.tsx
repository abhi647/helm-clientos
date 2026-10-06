/**
 * Helm's mark: a ship's wheel, drawn as SVG so it stays sharp at any size. Used on its own (no background)
 * everywhere in the product; only the browser icon (src/app/icon.svg) sits on the brushed-silver tile.
 */
export function HelmGlyph({ color = 'currentColor' }: { color?: string }) {
  const handle = 'M30.7 17.6 L29.6 9.3 A2.45 2.45 0 1 1 34.4 9.3 L33.3 17.6 Z'
  return (
    <g fill={color} stroke={color}>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <g key={a} transform={`rotate(${a} 32 32)`}>
          <path d={handle} stroke="none" />
          <line x1="32" y1="27.4" x2="32" y2="18" strokeWidth="2.6" fill="none" />
        </g>
      ))}
      <circle cx="32" cy="32" r="14.3" fill="none" strokeWidth="3.1" />
      <circle cx="32" cy="32" r="4.1" fill="none" strokeWidth="3.3" />
    </g>
  )
}

/** The wheel on its own; takes the text colour of where it sits (ink on light, silver on the dark rail). */
export function BrandMark({ size = 28, className, title = 'Helm' }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="3 3 58 58" role="img" aria-label={title} className={className}>
      <HelmGlyph />
    </svg>
  )
}

/** Wheel + product name. `by` adds the company line under the name (sign-in pages). */
export function BrandLockup({ size = 28, by = false, className }: { size?: number; by?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className ?? ''}`}>
      <BrandMark size={size} title="" />
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Helm</span>
        {by ? <span className="text-[11px] text-muted">by Seven Billion</span> : null}
      </span>
    </span>
  )
}
