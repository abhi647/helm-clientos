'use client'

import { useMemo, useState, useTransition } from 'react'
import { Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { setDayHours } from '@/app/_actions/work'
import { cn } from '@/components/ui'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

export type CellState = 'waiting' | 'approved' | 'billed' | 'returned' | null
export type GridRow = {
  taskId: string; title: string; context: string; model: 'time_materials' | 'fixed_price' | 'retainer' | null
  cells: { hours: number; state: CellState; note?: string | null }[]
}
type Option = { taskId: string; title: string; context: string; model: GridRow['model'] }

const MODEL_HINT = { time_materials: 'Billed by the hour', fixed_price: 'Effort on a fixed fee', retainer: 'Uses the hours bank' } as const
const MODEL_DOT = { time_materials: 'bg-info', fixed_price: 'bg-review', retainer: 'bg-good' } as const
const fmt = (h: number) => (h ? (Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, '')) : '')

/**
 * Your week, one row per task and one column per day: type the hours, they save as you leave the cell. Approved and
 * billed hours are locked. Totals per day and per task keep the week honest at a glance.
 */
export type DayOff = { kind: 'leave' | 'sick' | 'holiday'; label: string; half?: boolean } | null

export function WeekGrid({ days, rows: initial, options, today, off }: { days: { iso: string; label: string }[]; rows: GridRow[]; options: Option[]; today: string; off: DayOff[] }) {
  const [rows, setRows] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [, start] = useTransition()
  const extra = useMemo(() => options.filter((o) => !rows.some((r) => r.taskId === o.taskId)), [options, rows])

  const commit = (r: number, d: number, raw: string) => {
    const value = raw.trim() === '' ? 0 : Number(raw.replace(',', '.'))
    const row = rows[r]!
    const before = row.cells[d]!.hours
    if (!Number.isFinite(value) || value < 0 || value > 24) { toast.error('Enter hours from 0 to 24.'); return }
    const rounded = Math.round(value * 4) / 4
    if (rounded === before) return
    const key = `${row.taskId}:${d}`
    setSaving(key)
    setRows((all) => all.map((x, i) => i === r ? { ...x, cells: x.cells.map((c, j) => j === d ? { hours: rounded, state: rounded ? 'waiting' : null } : c) } : x))
    start(async () => {
      const res = await setDayHours(row.taskId, days[d]!.iso, rounded)
      setSaving(null)
      if (!res.ok) {
        toast.error(res.error)
        setRows((all) => all.map((x, i) => i === r ? { ...x, cells: x.cells.map((c, j) => j === d ? { ...c, hours: before } : c) } : x))
      }
    })
  }

  const dayTotal = (d: number) => rows.reduce((a, r) => a + r.cells[d]!.hours, 0)
  const rowTotal = (r: GridRow) => r.cells.reduce((a, c) => a + c.hours, 0)
  const week = rows.reduce((a, r) => a + rowTotal(r), 0)
  const cols = 'grid-cols-[minmax(220px,1fr)_repeat(7,64px)_64px]'

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]" role="grid" aria-label="Hours this week">
        <div className={`row row-head ${cols}`} role="row">
          <span role="columnheader">Task</span>
          {days.map((d) => <span key={d.iso} role="columnheader" className={cn('text-center', d.iso === today && 'font-semibold text-primary')}>{d.label}</span>)}
          <span role="columnheader" className="text-right">Total</span>
        </div>
        {rows.map((r, ri) => (
          <div key={r.taskId} className={`row ${cols} py-1`} role="row">
            <span className="flex min-w-0 flex-col" role="rowheader">
              <span className="truncate font-medium">{r.title}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                {r.model ? <span aria-hidden className={cn('size-1.5 flex-none rounded-full', MODEL_DOT[r.model])} /> : null}
                <span className="truncate">{r.context}{r.model ? ` · ${MODEL_HINT[r.model]}` : ''}</span>
              </span>
            </span>
            {r.cells.map((c, di) => {
              const locked = c.state === 'approved' || c.state === 'billed'
              const label = `${r.title}, ${days[di]!.label}`
              return locked ? (
                <span key={di} role="gridcell" title={c.state === 'billed' ? 'Billed' : 'Approved'} aria-label={`${label}: ${c.hours} hours, ${c.state}`}
                  className={cn('tabular flex h-8 items-center justify-center gap-1 rounded-md text-[13px]', c.state === 'billed' ? 'bg-muted text-muted-foreground' : 'bg-good-bg text-good-ink')}>
                  <Lock aria-hidden className="size-3" />{fmt(c.hours)}
                </span>
              ) : (
                <span key={di} role="gridcell" className="relative">
                  <Input aria-label={label} inputMode="decimal" defaultValue={fmt(c.hours)} key={`${r.taskId}-${di}-${c.hours}`}
                    onBlur={(e) => commit(ri, di, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    title={c.state === 'returned' ? `Returned: ${c.note ?? ''}` : undefined}
                    className={cn('tabular h-8 w-full px-1 text-center', days[di]!.iso === today && 'bg-accent/40',
                      c.state === 'returned' && 'border-warn bg-warn-bg', saving === `${r.taskId}:${di}` && 'opacity-60')} />
                </span>
              )
            })}
            <span className="tabular text-right font-medium" role="gridcell">{fmt(rowTotal(r)) || '–'}</span>
          </div>
        ))}
        <div className={`row ${cols} py-1`} role="row">
          <span role="rowheader" className="flex flex-col"><span className="font-medium">Leave &amp; holidays</span>
            <Link href="/leave" className="text-[11px]">Apply for leave →</Link></span>
          {days.map((d, i) => {
            const o = off[i]
            return (
              <span key={d.iso} role="gridcell" className="flex justify-center" aria-label={`${d.label}: ${o ? `${o.label}${o.half ? ' (half day)' : ''}` : 'working'}`}>
                {o ? <span title={o.label} className={cn('flex h-8 w-full items-center justify-center truncate rounded-md px-1 text-[11px] font-medium',
                  o.kind === 'holiday' ? 'bg-warn-bg text-warn-ink' : 'bg-primary/10 text-primary')}>{o.kind === 'holiday' ? 'Holiday' : o.half ? '½ leave' : o.kind === 'sick' ? 'Sick' : 'Leave'}</span>
                  : <span className="text-muted-foreground">–</span>}
              </span>
            )
          })}
          <span className="tabular text-right text-xs text-muted-foreground" role="gridcell">{off.filter((o) => o && o.kind !== 'holiday').reduce((a, o) => a + (o!.half ? 0.5 : 1), 0) || ''}</span>
        </div>
        <div className={`row ${cols} bg-head font-medium`} role="row">
          <span role="rowheader">
            {extra.length ? (
              <NativeSelect size="sm" aria-label="Add a task to this week" value="" className="h-7 text-xs" containerClassName="w-full max-w-[260px]"
                onChange={(e) => {
                  const o = options.find((x) => x.taskId === e.target.value)
                  if (o) setRows([...rows, { ...o, cells: days.map(() => ({ hours: 0, state: null })) }])
                }}>
                <option value="">+ Add a task…</option>
                {extra.map((o) => <option key={o.taskId} value={o.taskId}>{o.title} · {o.context}</option>)}
              </NativeSelect>
            ) : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Plus className="size-3" />All your open tasks are listed</span>}
          </span>
          {days.map((d, i) => <span key={d.iso} className={cn('tabular text-center', dayTotal(i) > 10 && 'text-warn-ink')} role="gridcell">{fmt(dayTotal(i)) || '–'}</span>)}
          <span className="tabular text-right" role="gridcell">{fmt(week) || '0'}</span>
        </div>
      </div>
    </div>
  )
}
