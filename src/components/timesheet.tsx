'use client'

import { useActionState, useRef, useState } from 'react'
import type { ActionResult } from '@/app/_actions/shared'

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>

export type TimeRow = { id: string; date: string; where: string; task: string; days: string; billable: boolean; note: string | null }

/** One person's waiting entries: tick some (or all), then approve, or return them with a note. */
export function TimesheetForm({ person, rows, approve, sendBack }: { person: string; rows: TimeRow[]; approve: FormAction; sendBack: FormAction }) {
  const ref = useRef<HTMLFormElement>(null)
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
  const tickAll = (on: boolean) => ref.current?.querySelectorAll<HTMLInputElement>('input[name=entry]').forEach((c) => { c.checked = on })

  return (
    <form ref={ref} className="flex flex-col">
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="row row-head grid-cols-[28px_80px_minmax(0,1fr)_minmax(0,1fr)_64px_minmax(0,1fr)]">
            <input type="checkbox" aria-label={`Tick all of ${person}'s entries`} defaultChecked onChange={(e) => tickAll(e.target.checked)} />
            <span>Date</span><span>Project</span><span>Task</span><span className="text-right">Days</span><span>Note</span>
          </div>
          {rows.map((r) => (
            <label key={r.id} className="row cursor-pointer grid-cols-[28px_80px_minmax(0,1fr)_minmax(0,1fr)_64px_minmax(0,1fr)] hover:bg-head">
              <input type="checkbox" name="entry" value={r.id} defaultChecked aria-label={`${r.date} ${r.task}`} />
              <span className="font-mono text-xs">{r.date}</span>
              <span className="truncate text-xs text-muted">{r.where}</span>
              <span className="truncate">{r.task}</span>
              <span className="text-right font-mono text-xs">{r.days}{r.billable ? '' : <span className="ml-1 text-muted" title="Not billable">nb</span>}</span>
              <span className="truncate text-xs text-muted">{r.note}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-3 py-2.5">
        <button type="submit" formAction={runApprove} disabled={pending} className="btn btn-primary">{approving ? 'Approving…' : 'Approve ticked'}</button>
        {returning ? (
          <>
            <input name="note" required minLength={3} maxLength={500} autoFocus aria-label="What should change" placeholder="What should change, e.g. log the 3rd on the reporting task" className="input min-w-[260px] flex-1" />
            <button type="submit" formAction={runReturn} disabled={pending} className="btn">{sending ? 'Returning…' : 'Return with this note'}</button>
            <button type="button" onClick={() => setReturning(false)} className="btn btn-ghost">Cancel</button>
          </>
        ) : <button type="button" onClick={() => setReturning(true)} disabled={pending} className="btn">Return ticked…</button>}
        {state ? state.ok
          ? state.message ? <p role="status" className="m-0 text-xs font-medium text-good-ink">{state.message}</p> : null
          : <p role="alert" className="m-0 text-xs text-crit-ink">{state.error}</p> : null}
      </div>
    </form>
  )
}
