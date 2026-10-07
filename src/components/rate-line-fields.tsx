'use client'

import { useEffect, useRef, useState } from 'react'
import { KIND_LABEL, KIND_UNIT, PLANNED_LABEL } from '@/components/billing'
import { cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'

type Kind = Enums<'billing_kind'>
const KINDS = Object.keys(KIND_LABEL) as Kind[]
// day rates are charged per day and retainers per month, always; the others can name their own unit
const FIXED: Partial<Record<Kind, string>> = { day_rate: 'day', retainer: 'month' }
const UNIT_HINT: Record<Kind, string> = { day_rate: 'Always a day', retainer: 'Always a month', delivery: 'Usually a delivery', unit: 'Name your unit' }
const EXAMPLE: Record<Kind, string> = { day_rate: 'e.g. Data engineer', retainer: 'e.g. Support retainer', delivery: 'e.g. Sales dashboard', unit: 'e.g. Dashboards' }

/** The unit to show after the model changes: fixed ones are set, a unit someone typed for a per-unit line is kept. */
const nextUnit = (kind: Kind, current: string) =>
  FIXED[kind] ?? (kind === 'unit' ? (Object.values(KIND_UNIT).includes(current) ? '' : current) : KIND_UNIT[kind])

function Field({ label, hint, className, children }: { label: string; hint?: string | null; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  )
}

/**
 * The fields of one rate-card line. "Charged per" follows the billing model as soon as it changes. The model and unit
 * are kept when "Add line" clears the form, so the next line starts from the same model: three
 * deliveries in a row stay deliveries.
 */
export function LineFields({ line }: { line?: { kind: Kind; label: string; unit: string; rate: number; planned_quantity: number | null; description: string; zoho_item_id: string | null } }) {
  const start = line?.kind ?? 'day_rate'
  const [kind, setKind] = useState<Kind>(start)
  const [unit, setUnit] = useState(line?.unit ?? KIND_UNIT[start])
  const select = useRef<HTMLSelectElement>(null)
  const unitBox = useRef<HTMLInputElement>(null)
  // the last model and unit chosen: the form is cleared after each "Add line", and the next line starts from these
  const last = useRef({ kind: start, unit: line?.unit ?? KIND_UNIT[start] })

  useEffect(() => {
    const form = select.current?.form
    if (!form) return
    const onReset = () => setTimeout(() => {
      if (!select.current || !unitBox.current) return
      select.current.value = last.current.kind
      unitBox.current.value = last.current.unit
      setKind(last.current.kind)
      setUnit(last.current.unit)
    })
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [])

  function changeKind(next: Kind) {
    const u = nextUnit(next, unitBox.current?.value ?? unit)
    last.current = { kind: next, unit: u }
    setKind(next)
    setUnit(u)
    if (unitBox.current) unitBox.current.value = u
  }

  const fixed = FIXED[kind]
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-[180px_minmax(0,1fr)_120px_120px_110px]">
      <Field label="Billing model">
        <select ref={select} name="kind" aria-label="Billing model" defaultValue={start} onChange={(e) => changeKind(e.target.value as Kind)} className="input">
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="What is billed">
        <input name="label" aria-label="Role, delivery or unit" required defaultValue={line?.label} placeholder={EXAMPLE[kind]} className="input" />
      </Field>
      <Field label="Charged per" hint={UNIT_HINT[kind]}>
        <input ref={unitBox} name="unit" aria-label="Unit" required defaultValue={line?.unit ?? KIND_UNIT[start]} readOnly={!!fixed}
          onChange={(e) => { setUnit(e.target.value); last.current = { ...last.current, unit: e.target.value } }}
          placeholder="dashboard, user…" className={cn('input', fixed && 'bg-head text-muted')} />
      </Field>
      <Field label="Rate" hint={`Per ${fixed ?? (unit || 'unit')}`}>
        <input name="rate" aria-label="Rate" required inputMode="decimal" defaultValue={line?.rate} placeholder="e.g. 25000" className="input font-mono" />
      </Field>
      <Field label="Planned qty" hint={PLANNED_LABEL[kind] ?? 'Leave empty'}>
        <input name="planned_quantity" aria-label="Planned quantity" inputMode="decimal" defaultValue={line?.planned_quantity ?? ''} placeholder="Optional" className="input font-mono" />
      </Field>
      <Field label="Description on the invoice" className="col-span-2 md:col-span-3">
        <input name="description" aria-label="Description" defaultValue={line?.description} placeholder="Optional" className="input" />
      </Field>
      <Field label="Zoho item id" className="col-span-2">
        <input name="zoho_item_id" aria-label="Zoho item id" defaultValue={line?.zoho_item_id ?? ''} placeholder="Optional, for tax / HSN" className="input font-mono" />
      </Field>
    </div>
  )
}
