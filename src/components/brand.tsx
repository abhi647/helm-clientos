/**
 * The Seven Billion helm: a ship's wheel on a brushed-silver tile. Drawn as SVG so it stays sharp at any size.
 * The same drawing is used for the favicon (src/app/icon.svg) and the PNGs in public/brand/ (emails, Apple icon).
 */
export function HelmGlyph({ color = '#1B1F24' }: { color?: string }) {
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

/** Silver metallic gradient + soft top highlight, shared by every tile. */
export function SilverDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F7F8F9" />
        <stop offset="0.28" stopColor="#D9DDE1" />
        <stop offset="0.52" stopColor="#B4BAC1" />
        <stop offset="0.7" stopColor="#E4E7EA" />
        <stop offset="1" stopColor="#A2A9B1" />
      </linearGradient>
      <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
    </defs>
  )
}

export function BrandMark({ size = 30, className, title = 'Seven Billion' }: { size?: number; className?: string; title?: string }) {
  const id = 'sb-helm'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      <SilverDefs id={id} />
      <rect x="0.5" y="0.5" width="63" height="63" rx="14" fill={`url(#${id}-metal)`} stroke="#8E959C" strokeWidth="1" />
      <rect x="2" y="2" width="60" height="30" rx="12.5" fill={`url(#${id}-shine)`} />
      <HelmGlyph />
    </svg>
  )
}
