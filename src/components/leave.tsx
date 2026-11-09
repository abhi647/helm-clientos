'use client'

import { useActionState } from 'react'
import { decideLeave } from '@/app/_actions/leave'
import type { ActionResult } from '@/app/_actions/shared'
import { announce } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Approve, or decline with a reason: one small form per request. */
export function LeaveDecision({ id, name }: { id: string; name: string }) {
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => announce(await decideLeave(prev, form)), null)
  return (
    <form action={run} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="request_id" value={id} />
      <Input name="note" aria-label={`Note to ${name}`} placeholder="Note (needed to decline)" className="h-7 w-44 text-xs" />
      <Button type="submit" name="decision" value="approve" size="xs" disabled={pending}>Approve</Button>
      <Button type="submit" name="decision" value="decline" size="xs" variant="outline" disabled={pending}>Decline</Button>
      {state && !state.ok ? <span role="alert" className="w-full text-right text-xs text-crit-ink">{state.error}</span> : null}
    </form>
  )
}

export type CalendarPerson = { id: string; name: string; days: ({ kind: 'approved' | 'pending'; half: boolean; type: string } | null)[] }
export type CalendarDay = { iso: string; label: string; weekday: string; weekend: boolean; holiday: string | null; optional: boolean; today: boolean }

/** Who is away in the month: people down the side, days across. Weekends grey, holidays amber, leave blue. */
export function TeamCalendar({ days, people }: { days: CalendarDay[]; people: CalendarPerson[] }) {
  const cols = { gridTemplateColumns: `minmax(140px, 180px) repeat(${days.length}, minmax(22px, 1fr))` }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]" role="grid" aria-label="Team leave this month">
        <div className="grid border-b border-border/60 bg-muted/30" style={cols} role="row">
          <span className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground" role="columnheader">Person</span>
          {days.map((d) => (
            <span key={d.iso} role="columnheader" title={d.holiday ?? undefined}
              className={cn('flex flex-col items-center py-1 text-[10px] leading-tight text-muted-foreground', d.today && 'font-semibold text-primary', d.holiday && !d.optional && 'text-warn-ink')}>
              <span>{d.weekday}</span><span className="tabular text-[11px]">{d.label}</span>
            </span>
          ))}
        </div>
        {people.map((p) => (
          <div key={p.id} className="grid border-b border-border/60 last:border-b-0" style={cols} role="row">
            <span className="truncate px-3 py-1.5 text-[13px]" role="rowheader">{p.name}</span>
            {days.map((d, i) => {
              const l = p.days[i]
              const off = d.weekend || (d.holiday && !d.optional)
              return (
                <span key={d.iso} role="gridcell" className="flex items-center justify-center p-0.5"
                  aria-label={`${p.name}, ${d.weekday} ${d.label}: ${l ? `${l.type}${l.half ? ' (half day)' : ''}${l.kind === 'pending' ? ', waiting for approval' : ''}` : off ? (d.holiday ?? 'weekend') : 'working'}`}
                  title={l ? `${l.type}${l.half ? ' · half day' : ''}${l.kind === 'pending' ? ' · waiting for approval' : ''}` : d.holiday ?? undefined}>
                  <span className={cn('block h-5 w-full rounded-sm',
                    l ? (l.kind === 'approved' ? 'bg-primary' : 'border border-dashed border-primary bg-primary/15') : d.holiday && !d.optional ? 'bg-warn/30' : d.weekend ? 'bg-muted' : 'bg-transparent',
                    l?.half && 'h-2.5 self-end')} />
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
