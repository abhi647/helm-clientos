'use client'

import { useActionState, useState } from 'react'
import type { ActionResult } from '@/app/_actions/shared'
import { DataGrid } from '@/components/data-grid'
import { btn } from '@/components/ui'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>

export type TimeRow = { id: string; date: string; where: string; task: string; hours: string; billable: boolean; note: string | null }

/** One person's waiting entries: tick some (or all), then approve, or return them with a note. */
export function TimesheetForm({ person, rows, approve, sendBack }: { person: string; rows: TimeRow[]; approve: FormAction; sendBack: FormAction }) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)))
  const toggle = (id: string, on: boolean) => setTicked((t) => { const n = new Set(t); if (on) n.add(id); else n.delete(id); return n })
  const [returning, setReturning] = useState(false)
  const [last, setLast] = useState<'approve' | 'return'>('approve')
  const [approved, runApprove, approving] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    setLast('approve')
    return approve(prev, form)
  }, null)
  const [returned, runReturn, sending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    setLast('return')
    const res = await sendBack(prev, form)
    if (res.ok) setReturning(false)
    return res
  }, null)
  const state = last === 'approve' ? approved : returned
  const pending = approving || sending
  const all = ticked.size === rows.length ? true : ticked.size ? 'indeterminate' as const : false

  return (
    <form className="flex flex-col">
      {/* the ticked entries go with the form */}
      {[...ticked].map((id) => <input key={id} type="hidden" name="entry" value={id} />)}
      <DataGrid label={`${person}'s entries`}
        columns={[
          { key: 'tick', label: <Checkbox aria-label={`Tick all of ${person}'s entries`} checked={all} onCheckedChange={(v) => setTicked(v === true ? new Set(rows.map((r) => r.id)) : new Set())} />, className: 'w-[36px]' },
          { key: 'date', label: 'Date', sortable: true, className: 'w-[90px]' },
          { key: 'where', label: 'Project', sortable: true },
          { key: 'task', label: 'Task', sortable: true },
          { key: 'hours', label: 'Hours', sortable: true, align: 'right', className: 'w-[70px]' },
          { key: 'note', label: 'Note' },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          values: { date: r.date, where: r.where, task: r.task, hours: Number(r.hours) },
          cells: {
            tick: <Checkbox aria-label={`${r.date} ${r.task}`} checked={ticked.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} />,
            date: <span className="font-mono text-xs">{r.date}</span>,
            where: <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{r.where}</span>,
            task: <span className="block max-w-[260px] truncate">{r.task}</span>,
            hours: <span className="font-mono text-xs">{r.hours}{r.billable ? '' : <span className="ml-1 text-muted-foreground" title="Not billable">nb</span>}</span>,
            note: <span className="block max-w-[240px] truncate text-xs text-muted-foreground">{r.note}</span>,
          },
        }))} />
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2.5">
        <button type="submit" formAction={runApprove} disabled={pending || !ticked.size} className={btn('default')}>{approving ? 'Approving…' : 'Approve ticked'}</button>
        {returning ? (
          <>
            <Input name="note" required minLength={3} maxLength={500} autoFocus aria-label="What should change" placeholder="What should change, e.g. log the 3rd on the reporting task" className="min-w-[260px] flex-1" />
            <button type="submit" formAction={runReturn} disabled={pending} className={btn('outline')}>{sending ? 'Returning…' : 'Return with this note'}</button>
            <button type="button" onClick={() => setReturning(false)} className={btn('ghost')}>Cancel</button>
          </>
        ) : <button type="button" onClick={() => setReturning(true)} disabled={pending} className={btn('outline')}>Return ticked…</button>}
        {state ? state.ok
          ? state.message ? <p role="status" className="m-0 text-xs font-medium text-good-ink">{state.message}</p> : null
          : <p role="alert" className="m-0 text-xs text-crit-ink">{state.error}</p> : null}
      </div>
    </form>
  )
}
