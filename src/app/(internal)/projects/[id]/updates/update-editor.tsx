'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/app/_actions/shared'

type Draft = { id: string; health: string; completed: string; in_progress: string; waiting_on_customer: string; next_week: string }

export function UpdateEditor({ action, update }: { action: (p: ActionResult | null, f: FormData) => Promise<ActionResult>; update: Draft }) {
  const [state, run, pending] = useActionState(action, null)
  const fields: [keyof Draft, string][] = [['completed', 'Completed'], ['in_progress', 'Working on'], ['waiting_on_customer', 'Waiting on customer'], ['next_week', 'Next week']]
  return (
    <form action={run} className="flex flex-col gap-2.5">
      <input type="hidden" name="update_id" value={update.id} />
      <label className="flex items-center gap-2 text-xs"><span className="label w-28">Health</span>
        <select name="health" defaultValue={update.health} className="input"><option value="on_track">On track</option><option value="needs_attention">Needs attention</option><option value="at_risk">At risk</option></select>
      </label>
      {fields.map(([k, l]) => (
        <label key={k} className="flex items-start gap-2 text-xs"><span className="label w-28 pt-2">{l}</span>
          <textarea name={k} rows={3} defaultValue={update[k]} placeholder="One item per line" className="textarea flex-1" /></label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="intent" value="publish" disabled={pending} className="btn btn-primary">Publish to customer</button>
        <button type="submit" name="intent" value="save" disabled={pending} className="btn">Save draft</button>
        {state ? <span role={state.ok ? 'status' : 'alert'} className={state.ok ? 'text-xs font-medium text-good-ink' : 'text-xs text-crit-ink'}>{state.ok ? state.message : state.error}</span> : null}
      </div>
    </form>
  )
}
