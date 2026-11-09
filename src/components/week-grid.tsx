'use client'

import { useMemo, useState, useTransition } from 'react'
import { Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setDayHours } from '@/app/_actions/work'
import { cn } from '@/components/ui'
import { NativeSelect } from '@/components/ui/native-select'

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
  const router = useRouter()
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
      } else router.refresh() // the week's totals above the grid
    })
  }

  const dayTotal = (d: number) => rows.reduce((a, r) => a + r.cells[d]!.hours, 0)
  const rowTotal = (r: GridRow) => r.cells.reduce((a, c) => a + c.hours, 0)
  const week = rows.reduce((a, r) => a + rowTotal(r), 0)
  const cols = 'grid-cols-[minmax(220px,1fr)_repeat(7,60px)_64px]'
  // Saturday and Sunday read quieter; today is tinted down the whole column
  const weekend = (i: number) => i >= 5
  const tint = (i: number) => (days[i]!.iso === today ? 'bg-primary/[.05]' : weekend(i) ? 'bg-muted/40' : '')
  // one block per project: its name, how it is billed and its hours once, then its tasks
  const groups = useMemo(() => {
    const m = new Map<string, { context: string; model: GridRow['model']; idx: number[] }>()
    rows.forEach((r, i) => {
      const g = m.get(r.context) ?? { context: r.context, model: r.model, idx: [] }
      g.idx.push(i)
      m.set(r.context, g)
    })
    return [...m.values()]
  }, [rows])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[740px] text-[13px]" role="grid" aria-label="Hours this week">
        <div className={`grid ${cols} h-8 items-center border-b border-border/60 bg-muted/30 text-[11px] font-medium text-muted-foreground`} role="row">
          <span role="columnheader" className="px-3">Task</span>
          {days.map((d, i) => (
            <span key={d.iso} role="columnheader" className={cn('flex h-full items-center justify-center', tint(i), d.iso === today && 'font-semibold text-primary', weekend(i) && d.iso !== today && 'text-muted-foreground/70')}>{d.label}</span>
          ))}
          <span role="columnheader" className="px-3 text-right">Total</span>
        </div>
        {groups.map((g) => {
          const sub = g.idx.reduce((a, i) => a + rowTotal(rows[i]!), 0)
          return (
            <div key={g.context} role="rowgroup" aria-label={g.context}>
              <div className={`grid ${cols} h-8 items-center border-b border-border/60 bg-muted/15`} role="row">
                <span role="rowheader" className="flex min-w-0 items-center gap-1.5 px-3 text-xs font-medium">
                  {g.model ? <span aria-hidden className={cn('size-1.5 flex-none rounded-full', MODEL_DOT[g.model])} /> : null}
                  <span className="truncate">{g.context}</span>
                  {g.model ? <span className="flex-none font-normal text-muted-foreground">· {MODEL_HINT[g.model]}</span> : null}
                </span>
                {days.map((d, i) => <span key={d.iso} aria-hidden className={cn('h-full', tint(i))} />)}
                <span className="tabular px-3 text-right text-xs text-muted-foreground" role="gridcell">{fmt(sub)}</span>
              </div>
              {g.idx.map((ri) => {
                const r = rows[ri]!
                return (
                  <div key={r.taskId} className={`group/row grid ${cols} h-9 items-stretch border-b border-border/60 hover:bg-muted/30`} role="row">
                    <span className="flex min-w-0 items-center pr-2 pl-6" role="rowheader"><span className="truncate">{r.title}</span></span>
                    {r.cells.map((c, di) => {
                      const locked = c.state === 'approved' || c.state === 'billed'
                      const label = `${r.title}, ${days[di]!.label}`
                      return locked ? (
                        <span key={di} role="gridcell" title={c.state === 'billed' ? 'Billed' : 'Approved'} aria-label={`${label}: ${c.hours} hours, ${c.state}`}
                          className={cn('tabular flex items-center justify-center gap-1 border-l border-border/40', c.state === 'billed' ? 'bg-muted text-muted-foreground' : 'bg-good-bg text-good-ink')}>
                          <Lock aria-hidden className="size-3" />{fmt(c.hours)}
                        </span>
                      ) : (
                        <span key={di} role="gridcell" className={cn('relative border-l border-border/40', tint(di))}>
                          <input aria-label={label} inputMode="decimal" defaultValue={fmt(c.hours)} key={`${r.taskId}-${di}-${c.hours}`} placeholder="·"
                            onBlur={(e) => commit(ri, di, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            title={c.state === 'returned' ? `Returned: ${c.note ?? ''}` : undefined}
                            className={cn('tabular h-full w-full border-0 bg-transparent text-center outline-none placeholder:text-muted-foreground/40',
                              'hover:bg-muted/60 focus:bg-card focus:shadow-[inset_0_0_0_2px_var(--color-primary)]',
                              c.state === 'returned' && 'bg-warn-bg text-warn-ink', saving === `${r.taskId}:${di}` && 'opacity-60')} />
                        </span>
                      )
                    })}
                    <span className="tabular flex items-center justify-end border-l border-border/40 px-3 font-medium" role="gridcell">{fmt(rowTotal(r)) || <span className="text-muted-foreground">–</span>}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
        <div className={`grid ${cols} h-9 items-stretch border-b border-border/60`} role="row">
          <span role="rowheader" className="flex min-w-0 items-center gap-2 px-3"><span className="font-medium">Leave &amp; holidays</span>
            <Link href="/leave" className="text-[11px]">Apply →</Link></span>
          {days.map((d, i) => {
            const o = off[i]
            return (
              <span key={d.iso} role="gridcell" className={cn('flex items-center justify-center border-l border-border/40 px-1', tint(i))} aria-label={`${d.label}: ${o ? `${o.label}${o.half ? ' (half day)' : ''}` : 'working'}`}>
                {o ? <span title={o.label} className={cn('w-full truncate rounded px-1 py-0.5 text-center text-[11px] font-medium',
                  o.kind === 'holiday' ? 'bg-warn-bg text-warn-ink' : 'bg-primary/10 text-primary')}>{o.kind === 'holiday' ? 'Holiday' : o.half ? '½ leave' : o.kind === 'sick' ? 'Sick' : 'Leave'}</span>
                  : null}
              </span>
            )
          })}
          <span className="tabular flex items-center justify-end border-l border-border/40 px-3 text-xs text-muted-foreground" role="gridcell">{off.filter((o) => o && o.kind !== 'holiday').reduce((a, o) => a + (o!.half ? 0.5 : 1), 0) || ''}</span>
        </div>
        <div className={`grid ${cols} h-10 items-stretch bg-muted/30 font-medium`} role="row">
          <span role="rowheader" className="flex items-center px-3">
            {extra.length ? (
              <NativeSelect size="sm" aria-label="Add a task to this week" value="" className="h-7 text-xs" containerClassName="w-full max-w-[260px]"
                onChange={(e) => {
                  const o = options.find((x) => x.taskId === e.target.value)
                  if (o) setRows([...rows, { ...o, cells: days.map(() => ({ hours: 0, state: null })) }])
                }}>
                <option value="">+ Add a task…</option>
                {extra.map((o) => <option key={o.taskId} value={o.taskId}>{o.title} · {o.context}</option>)}
              </NativeSelect>
            ) : <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><Plus className="size-3" />All your open tasks are listed</span>}
          </span>
          {days.map((d, i) => <span key={d.iso} className={cn('tabular flex items-center justify-center border-l border-border/40', tint(i), dayTotal(i) > 10 && 'text-warn-ink')} role="gridcell">{fmt(dayTotal(i)) || <span className="text-muted-foreground">–</span>}</span>)}
          <span className="tabular flex items-center justify-end border-l border-border/40 px-3" role="gridcell">{fmt(week) || '0'}</span>
        </div>
      </div>
    </div>
  )
}
