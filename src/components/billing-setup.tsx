'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Clock, Flag, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { setupBilling, type BillingSetup } from '@/app/_actions/billing'
import { Steps } from '@/components/overtrue/steps'
import { cn } from '@/components/ui'
import { CURRENCIES } from '@/lib/currencies'

type Model = 'time_materials' | 'fixed_price' | 'retainer'
type Person = { id: string; name: string; role?: string | null }
type Phase = { id: string; name: string }
type PersonRate = { profile_id: string; rate: string }
type Milestone = { label: string; amount: string; phase_id: string }

const MODELS: { model: Model; title: string; icon: typeof Clock; body: string; timesheets: string }[] = [
  { model: 'time_materials', title: 'Time & materials', icon: Clock, body: 'Each person has a rate. Approved timesheet hours are the bill.', timesheets: 'Timesheets are billed' },
  { model: 'fixed_price', title: 'Fixed price', icon: Flag, body: 'An agreed amount per milestone, billed when each is delivered.', timesheets: 'Timesheets track effort, not billed' },
  { model: 'retainer', title: 'Retainer', icon: CalendarClock, body: 'A monthly fee with hours included each month.', timesheets: 'Timesheets use up the hours' },
]
const STEPS = ['How it is billed', 'Rates', 'Agreement']

/**
 * Billing set-up in three steps: choose the model, enter the rates (people, milestones or the monthly fee), then the
 * contract details. Saves a draft rate card for the chosen model; sending it to the customer is the next step.
 */
export function BillingSetupWizard({ projectId, people, phases, initial }: {
  projectId: string; people: Person[]; phases: Phase[]
  initial?: { model: Model | null; unit: 'hour' | 'day'; currency: string; po: string; notes: string; rates: PersonRate[]; milestones: Milestone[]; retainer?: { fee: string; hours: string; rollover: string } }
}) {
  const [step, setStep] = useState(initial?.model ? 1 : 0)
  const [model, setModel] = useState<Model | null>(initial?.model ?? null)
  const [unit, setUnit] = useState<'hour' | 'day'>(initial?.unit ?? 'hour')
  const [rates, setRates] = useState<PersonRate[]>(initial?.rates.length ? initial.rates : [])
  const [extras, setExtras] = useState(Boolean(initial?.model === 'fixed_price' && initial.rates.length))
  const [milestones, setMilestones] = useState<Milestone[]>(initial?.milestones.length ? initial.milestones : [{ label: '', amount: '', phase_id: '' }])
  const [retainer, setRetainer] = useState(initial?.retainer ?? { fee: '', hours: '', rollover: '' })
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [po, setPo] = useState(initial?.po ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const usesPeople = model === 'time_materials' || (model === 'fixed_price' && extras)
  const unused = people.filter((p) => !rates.some((r) => r.profile_id === p.id))
  const num = (v: string) => Number(v.replace(/,/g, ''))
  const total = milestones.reduce((a, m) => a + (num(m.amount) || 0), 0)

  const stepError = (): string | null => {
    if (step === 0 && !model) return 'Choose how this project is billed.'
    if (step === 1) {
      if (model === 'time_materials' && !rates.length) return 'Add at least one person and their rate.'
      if (usesPeople && rates.some((r) => r.rate === '' || !(num(r.rate) >= 0))) return 'Enter a rate for everyone listed.'
      if (model === 'fixed_price' && (!milestones.length || milestones.some((m) => !m.label.trim() || m.amount === '' || !(num(m.amount) >= 0)))) return 'Give every milestone a name and an amount.'
      if (model === 'retainer' && (retainer.fee === '' || !(num(retainer.fee) >= 0))) return 'Enter the monthly fee.'
    }
    return null
  }
  const next = () => { const e = stepError(); setError(e); if (!e) setStep((s) => s + 1) }
  const save = () => start(async () => {
    const payload: BillingSetup = {
      project_id: projectId, model: model!, unit, currency, po_number: po, notes,
      people: usesPeople ? rates.map((r) => ({ profile_id: r.profile_id, rate: num(r.rate) })) : [],
      milestones: model === 'fixed_price' ? milestones.map((m) => ({ label: m.label, amount: num(m.amount), phase_id: m.phase_id })) : [],
      retainer: model === 'retainer' ? { fee: num(retainer.fee), hours: num(retainer.hours || '0'), rollover: retainer.rollover } : undefined,
    }
    const res = await setupBilling(payload)
    if (!res.ok) { setError(res.error); return }
    toast.success(res.message ?? 'Saved')
    router.replace(`/projects/${projectId}/billing`, { scroll: false })
  })

  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone'

  return (
    <section className="card overflow-hidden" aria-label="Set up billing">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="m-0 text-sm font-semibold">Set up billing</h2>
        <p className="m-0 text-xs text-muted-foreground">Choose once how this project is billed. Timesheets, statements and invoices follow from it.</p>
        <Steps steps={STEPS} current={step} className="mt-3 max-w-xl" />
      </div>

      <div className="p-4">
        {step === 0 ? (
          <div role="radiogroup" aria-label="Billing model" className="grid gap-2 md:grid-cols-3">
            {MODELS.map(({ model: m, title, icon: Icon, body, timesheets }) => (
              <button key={m} type="button" role="radio" aria-checked={model === m} onClick={() => setModel(m)}
                className={cn('flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-control',
                  model === m ? 'border-primary bg-accent ring-1 ring-primary' : 'border-border')}>
                <span className="flex items-center gap-2 text-[13px] font-semibold"><Icon aria-hidden className="size-4 text-primary" />{title}</span>
                <span className="text-xs text-muted-foreground">{body}</span>
                <span className="mt-auto pt-1 text-[11px] font-medium text-foreground/70">{timesheets}</span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 && model === 'fixed_price' ? (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-md border border-border">
              <div className="row row-head grid-cols-[minmax(0,1fr)_150px_200px_32px] min-w-[560px]"><span>Milestone</span><span className="text-right">Amount</span><span>Delivered with phase (optional)</span><span /></div>
              {milestones.map((m, i) => (
                <div key={i} className="row grid-cols-[minmax(0,1fr)_150px_200px_32px] min-w-[560px] py-1">
                  <input aria-label={`Milestone ${i + 1} name`} value={m.label} placeholder="e.g. Discovery sign-off" className="input"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input aria-label={`Milestone ${i + 1} amount`} value={m.amount} inputMode="decimal" placeholder="0" className="input tabular text-right"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  <select aria-label={`Milestone ${i + 1} phase`} value={m.phase_id} className="input"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, phase_id: e.target.value } : x))}>
                    <option value="">No phase</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button type="button" aria-label={`Remove milestone ${i + 1}`} disabled={milestones.length === 1} onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                    className="btn btn-ghost size-8 px-0 text-muted-foreground"><Trash2 className="size-4" /></button>
                </div>
              ))}
              <div className="row grid-cols-[minmax(0,1fr)_150px_200px_32px] min-w-[560px] bg-head font-medium">
                <button type="button" onClick={() => setMilestones([...milestones, { label: '', amount: '', phase_id: '' }])} className="btn btn-ghost h-7 w-fit px-2 text-xs"><Plus className="size-3.5" />Add milestone</button>
                <span className="tabular text-right">{total.toLocaleString('en-IN')}</span><span className="text-xs text-muted-foreground">Contract value</span><span />
              </div>
            </div>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} className="mt-0.5 accent-primary" />
              <span><b>Extra work at people&apos;s rates</b><span className="block text-xs text-muted-foreground">For change requests outside the fixed scope: time logged on tasks outside the milestone phases is billed at these rates.</span></span>
            </label>
          </div>
        ) : null}

        {step === 1 && model === 'retainer' ? (
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1"><span className="label">Monthly fee</span>
              <input value={retainer.fee} onChange={(e) => setRetainer({ ...retainer, fee: e.target.value })} inputMode="decimal" className="input tabular" placeholder="0" /></label>
            <label className="flex flex-col gap-1"><span className="label">Hours included each month</span>
              <input value={retainer.hours} onChange={(e) => setRetainer({ ...retainer, hours: e.target.value })} inputMode="decimal" className="input tabular" placeholder="e.g. 40" /></label>
            <label className="flex flex-col gap-1"><span className="label">Unused hours carried over, at most</span>
              <input value={retainer.rollover} onChange={(e) => setRetainer({ ...retainer, rollover: e.target.value })} inputMode="decimal" className="input tabular" placeholder="Empty: no limit" /></label>
            <p className="m-0 text-xs text-muted-foreground sm:col-span-3">The hours are the customer&apos;s hours bank (shared by all their projects). The customer sees a meter, and you are warned at 75%, 90% and 100%.</p>
          </div>
        ) : null}

        {step === 1 && usesPeople ? (
          <div className={cn('flex flex-col gap-2', model === 'fixed_price' && 'mt-3')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="label">Rates are per</span>
              <span className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 ring-1 ring-border ring-inset" role="radiogroup" aria-label="Rate unit">
                {(['hour', 'day'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)}
                    className={cn('h-full cursor-pointer rounded-md border-0 px-3 text-[13px]', unit === u ? 'bg-card font-medium shadow-[0_1px_2px_rgb(0_0_0/.08)]' : 'bg-transparent text-muted-foreground')}>{u === 'hour' ? 'Hour' : 'Day (8 hours)'}</button>
                ))}
              </span>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <div className="row row-head grid-cols-[minmax(0,1fr)_160px_32px] min-w-[420px]"><span>Person</span><span className="text-right">Rate per {unit}</span><span /></div>
              {rates.map((r, i) => (
                <div key={r.profile_id} className="row grid-cols-[minmax(0,1fr)_160px_32px] min-w-[420px] py-1">
                  <span className="truncate font-medium">{name(r.profile_id)}</span>
                  <input aria-label={`Rate for ${name(r.profile_id)}`} value={r.rate} inputMode="decimal" placeholder="0" className="input tabular text-right"
                    onChange={(e) => setRates(rates.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                  <button type="button" aria-label={`Remove ${name(r.profile_id)}`} onClick={() => setRates(rates.filter((_, j) => j !== i))} className="btn btn-ghost size-8 px-0 text-muted-foreground"><Trash2 className="size-4" /></button>
                </div>
              ))}
              <div className="row grid-cols-[minmax(0,1fr)] min-w-[420px] bg-head py-1">
                <select aria-label="Add a person" value="" className="input w-64" disabled={!unused.length}
                  onChange={(e) => { if (e.target.value) setRates([...rates, { profile_id: e.target.value, rate: '' }]) }}>
                  <option value="">{unused.length ? '+ Add a person…' : 'Everyone is listed'}</option>
                  {unused.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` · ${p.role}` : ''}</option>)}
                </select>
              </div>
            </div>
            <p className="m-0 text-xs text-muted-foreground">Only finance, admins and the CEO see rates. PMs and consultants just log time; it is priced here.</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid max-w-3xl gap-3 sm:grid-cols-[160px_220px_minmax(0,1fr)]">
            <label className="flex flex-col gap-1"><span className="label">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input font-mono">{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Customer PO number</span>
              <input value={po} onChange={(e) => setPo(e.target.value)} className="input font-mono" placeholder="Optional" /></label>
            <label className="flex flex-col gap-1"><span className="label">Notes for the customer</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Payment terms, what is included" /></label>
            <div className="rounded-md bg-head p-3 text-xs sm:col-span-3">
              <b>{MODELS.find((m) => m.model === model)?.title}</b>
              {model === 'fixed_price' ? <> · {milestones.length} milestone{milestones.length === 1 ? '' : 's'}, {currency} {total.toLocaleString('en-IN')}{extras ? ` · extras for ${rates.length} people per ${unit}` : ''}</> : null}
              {model === 'time_materials' ? <> · {rates.length} {rates.length === 1 ? 'person' : 'people'}, {currency} per {unit}</> : null}
              {model === 'retainer' ? <> · {currency} {num(retainer.fee || '0').toLocaleString('en-IN')} a month{retainer.hours ? `, ${retainer.hours} hours included` : ''}</> : null}
              <span className="block text-muted-foreground">Saved as a draft. Next: send the rates to the customer for approval, or approve them for the customer if already agreed in the contract.</span>
            </div>
          </div>
        ) : null}

        {error ? <p role="alert" className="m-0 mt-3 text-xs text-crit-ink">{error}</p> : null}
        <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
          {step > 0 ? <button type="button" className="btn" onClick={() => { setError(null); setStep(step - 1) }}>Back</button> : null}
          <span className="flex-1" />
          {step < 2 ? <button type="button" className="btn btn-primary" onClick={next}>Continue</button>
            : <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save billing set-up'}</button>}
        </div>
      </div>
    </section>
  )
}
