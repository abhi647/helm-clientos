'use client'

import { useActionState, useState } from 'react'
import { submitForm } from '@/app/_actions/forms'
import type { ActionResult } from '@/app/_actions/shared'
import type { FormDef } from '@/lib/forms'
import { keepOnError } from '@/components/forms'

/** Renders one of the fixed forms. Conditional questions appear only when they apply. */
export function FormRenderer({ def, projectId, actionId, projects }: {
  def: FormDef; projectId?: string; actionId?: string; projects?: { id: string; name: string }[]
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(submitForm, null)
  const shown = def.fields.filter((f) => !f.when || values[f.when.field] === f.when.is)
  return (
    <form onSubmit={keepOnError(run)} className="flex flex-col gap-3" onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement
      if (t.name) setValues((v) => ({ ...v, [t.name]: t.value }))
    }}>
      <input type="hidden" name="form_key" value={def.key} />
      <input type="hidden" name="action_item_id" value={actionId ?? ''} />
      {projectId ? <input type="hidden" name="project_id" value={projectId} /> : (
        <label className="flex flex-col gap-1"><span className="label">Project</span>
          <select name="project_id" required className="input h-9">{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
      )}
      {shown.map((f) => (
        <fieldset key={f.name} className="m-0 flex flex-col gap-1 border-0 p-0">
          {f.type === 'radio' ? <legend className="label mb-1">{f.label}{f.required ? ' *' : ''}</legend>
            : <label htmlFor={`f-${f.name}`} className="label">{f.label}{f.required ? ' *' : ''}</label>}
          {f.type === 'textarea' ? <textarea id={`f-${f.name}`} name={f.name} rows={3} required={f.required} placeholder={f.placeholder} className="textarea text-sm" />
            : f.type === 'select' ? (
              <select id={`f-${f.name}`} name={f.name} required={f.required} defaultValue="" className="input h-9">
                <option value="" disabled>Choose…</option>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'radio' ? (
              <div className="flex flex-wrap gap-2">
                {f.options!.map((o) => (
                  <label key={o.value} className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d5dcdf] px-3 text-[13px] has-[:checked]:border-ink has-[:checked]:bg-head has-[:checked]:font-semibold">
                    <input type="radio" name={f.name} value={o.value} required={f.required} className="accent-[#0F2A30]" />{o.label}
                  </label>
                ))}
              </div>
            ) : <input id={`f-${f.name}`} name={f.name} type={f.type} required={f.required} placeholder={f.placeholder} className="input h-9 text-sm" />}
          {f.help ? <span className="text-xs text-muted">{f.help}</span> : null}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Sending…' : 'Submit'}</button>
        {state && !state.ok ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.error}</p> : null}
      </div>
    </form>
  )
}
