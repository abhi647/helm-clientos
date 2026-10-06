'use client'

import { useEffect, useRef, useState } from 'react'

// Single series (CSAT %), so no legend: the card title names it. Validated bar colour, recessive hairline grid.
const BAR = '#2A78D6'
const GRID = '#E6EAEC'

/** Monthly CSAT % as columns (0-100), with a per-column hover tooltip and a screen-reader table. */
export function MonthlyCsat({ months }: { months: { key: string; label: string; csat: number | null; responses: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // draw at the real pixel width so text stays 10-11px at any card size
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(560)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 180, L = 34, B = 22, T = 20
  const plotH = H - B - T, slot = (W - L) / months.length, bw = Math.min(24, slot * 0.5)
  const y = (v: number) => T + plotH - (v / 100) * plotH
  return (
    <div ref={box} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="CSAT by month">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W} y1={y(g)} y2={y(g)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(g) + 3.5} textAnchor="end" className="fill-[#6b7a80] font-mono text-[10px]">{g}%</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = L + slot * i + slot / 2
          const h = m.csat == null ? 0 : Math.max(2, (m.csat / 100) * plotH)
          const x = cx - bw / 2, top = T + plotH - h, r = Math.min(4, h)
          return (
            <g key={m.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              tabIndex={0} aria-label={`${m.label}: ${m.csat == null ? 'no responses' : `${m.csat}% satisfied, ${m.responses} responses`}`} className="outline-none">
              <rect x={L + slot * i} y={T} width={slot} height={plotH} fill="transparent" />
              {m.csat != null ? (
                <path d={`M${x},${T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${T + plotH} Z`}
                  fill={BAR} opacity={hover == null || hover === i ? 1 : 0.55} />
              ) : <text x={cx} y={T + plotH - 4} textAnchor="middle" className="fill-[#9aa7ac] text-[10px]">–</text>}
              {/* label only the latest month; the tooltip and table carry the rest */}
              {i === months.length - 1 && m.csat != null ? <text x={cx} y={top - 5} textAnchor="middle" className="fill-[#0F2A30] font-mono text-[11px] font-semibold">{m.csat}%</text> : null}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-[#6b7a80] text-[10px]">{m.label}</text>
            </g>
          )
        })}
      </svg>
      {hover != null ? (
        <div role="tooltip" className="pointer-events-none absolute top-0 rounded-md border border-line bg-white px-2 py-1 text-xs shadow-[0_4px_12px_rgba(15,42,48,.12)]"
          style={{ left: Math.min(Math.max(0, L + slot * hover + slot / 2 - 80), W - 200) }}>
          <b>{months[hover]!.label}</b> · {months[hover]!.csat == null ? 'no responses' : <>{months[hover]!.csat}% satisfied · {months[hover]!.responses} {months[hover]!.responses === 1 ? 'response' : 'responses'}</>}
        </div>
      ) : null}
      <table className="sr-only"><caption>CSAT by month</caption><thead><tr><th>Month</th><th>CSAT %</th><th>Responses</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.key}><td>{m.label}</td><td>{m.csat ?? '–'}</td><td>{m.responses}</td></tr>)}</tbody></table>
    </div>
  )
}

/** How answers spread over the 1-5 scale (horizontal bars, value at the tip). */
export function ScoreBars({ distribution, labels }: { distribution: { score: number; count: number }[]; labels: Record<number, string> }) {
  const max = Math.max(1, ...distribution.map((d) => d.count))
  const total = distribution.reduce((a, d) => a + d.count, 0)
  return (
    <div className="flex flex-col gap-1.5">
      {distribution.map((d) => (
        <div key={d.score} className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2 text-xs"
          title={`${labels[d.score]}: ${d.count} of ${total}${total ? ` (${Math.round((100 * d.count) / total)}%)` : ''}`}>
          <span className="truncate text-muted"><b className="font-mono text-ink">{d.score}</b> {labels[d.score]}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 rounded-r-[4px]" style={{ width: `${(d.count / max) * 85}%`, minWidth: d.count ? 3 : 0, background: BAR }} />
            <span className="font-mono">{d.count}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
