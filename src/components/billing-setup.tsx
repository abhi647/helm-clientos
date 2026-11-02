'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Clock, Flag, Plus, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { setupBilling, type BillingSetup } from '@/app/_actions/billing'
import { Steps } from '@/components/overtrue/steps'
import { cn } from '@/components/ui'
import { CURRENCIES } from '@/lib/currencies'

export type Model = 'time_materials' | 'dedicated' | 'fixed_price' | 'retainer'
export type Unit = 'hour' | 'day' | 'month'
type Person = { id: string; name: string; role?: string | null }
type Phase = { id: string; name: string }
type PersonRate = { profile_id: string; rate: string }
type Milestone = { label: string; amount: string; phase_id: string; bill_on: string }
export type SetupInitial = {
  model: Model | null; unit: Unit; currency: string; po: string; notes: string; cap: string; contract: string
  rates: PersonRate[]; milestones: Milestone[]; retainer?: { fee: string; hours: string; rollover: string; overage: string }
}

const MODELS: { model: Model; title: string; icon: typeof Clock; body: string; timesheets: string }[] = [
  { model: 'time_materials', title: 'Time & materials', icon: Clock, body: 'Each person has an hourly or daily rate. Approved timesheet hours are the bill.', timesheets: 'Timesheets are the invoice' },
  { model: 'dedicated', title: 'Dedicated people', icon: UserCheck, body: 'People reserved for the customer, billed per month or per working day, less leave.', timesheets: 'Timesheets show utilisation only' },
  { model: 'fixed_price', title: 'Fixed fee', icon: Flag, body: 'An agreed price, billed on a schedule: when a phase is done or on a date.', timesheets: 'Timesheets track effort and margin' },
  { model: 'retainer', title: 'Retainer', icon: CalendarClock, body: 'A monthly fee with hours included; hours over can be billed at a rate.', timesheets: 'Timesheets use up the hours' },
]
const STEPS = ['How it is billed', 'Rates', 'Agreement']
const UNIT_LABEL: Record<Unit, string> = { hour: 'Hour', day: 'Day (8 hours)', month: 'Month' }

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 ring-1 ring-border ring-inset" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-full cursor-pointer rounded-md border-0 px-3 text-[13px]', value === o.value ? 'bg-card font-medium shadow-[0_1px_2px_rgb(0_0_0/.08)]' : 'bg-transparent text-muted-foreground')}>{o.label}</button>
      ))}
    </span>
  )
}

/**
 * Billing set-up in three steps, after the PSA pattern: choose how the contract is billed, enter its lines (people,
 * a schedule or a monthly fee), then the agreement details. Saves a draft rate card for the customer to approve.
 */
export function BillingSetupWizard({ projectId, people, phases, initial }: { projectId: string; people: Person[]; phases: Phase[]; initial?: SetupInitial }) {
  const [step, setStep] = useState(initial?.model ? 1 : 0)
  const [model, setModel] = useState<Model | null>(initial?.model ?? null)
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'hour')
  const [cap, setCap] = useState(initial?.cap ?? '')
  const [rates, setRates] = useState<PersonRate[]>(initial?.rates ?? [])
  const [extras, setExtras] = useState(Boolean(initial?.model === 'fixed_price' && initial.rates.length))
  const [contract, setContract] = useState(() => initial?.contract || (initial?.milestones.length ? initial.milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0).toString() : ''))
  const [byPercent, setByPercent] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[]>(initial?.milestones.length ? initial.milestones : [{ label: '', amount: '', phase_id: '', bill_on: '' }])
  const [retainer, setRetainer] = useState(initial?.retainer ?? { fee: '', hours: '', rollover: '', overage: '' })
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR')
  const [po, setPo] = useState(initial?.po ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const num = (v: string) => Number(String(v).replace(/,/g, ''))
  const usesPeople = model === 'time_materials' || model === 'dedicated' || (model === 'fixed_price' && extras)
  const units: Unit[] = model === 'dedicated' ? ['month', 'day'] : ['hour', 'day']
  const unused = people.filter((p) => !rates.some((r) => r.profile_id === p.id))
  const amountOf = (m: Milestone) => (byPercent ? Math.round((num(contract) * (num(m.amount) || 0)) / 100) : num(m.amount) || 0)
  const total = milestones.reduce((a, m) => a + amountOf(m), 0)
  const pctTotal = byPercent ? milestones.reduce((a, m) => a + (num(m.amount) || 0), 0) : contract ? Math.round((100 * total) / num(contract)) : 0
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone'
  const pickModel = (m: Model) => { setModel(m); if (m === 'dedicated' && unit === 'hour') setUnit('month'); if (m !== 'dedicated' && unit === 'month') setUnit('hour') }

  const stepError = (): string | null => {
    if (step === 0 && !model) return 'Choose how this project is billed.'
    if (step === 1) {
      if ((model === 'time_materials' || model === 'dedicated') && !rates.length) return 'Add at least one person and their rate.'
      if (usesPeople && rates.some((r) => r.rate === '' || !(num(r.rate) >= 0))) return 'Enter a rate for everyone listed.'
      if (model === 'fixed_price') {
        if (!milestones.length || milestones.some((m) => !m.label.trim() || m.amount === '' || !(num(m.amount) >= 0))) return 'Give every schedule line a name and an amount.'
        if (byPercent && pctTotal !== 100) return `The schedule adds up to ${pctTotal}%, not 100%.`
        if (byPercent && !(num(contract) > 0)) return 'Enter the contract value to bill by percentage.'
      }
      if (model === 'retainer' && (retainer.fee === '' || !(num(retainer.fee) >= 0))) return 'Enter the monthly fee.'
    }
    return null
  }
  const next = () => { const e = stepError(); setError(e); if (!e) setStep((s) => s + 1) }
  const save = () => start(async () => {
    const payload: BillingSetup = {
      project_id: projectId, model: model!, unit: model === 'retainer' ? 'hour' : unit, currency, po_number: po, notes,
      cap: model === 'time_materials' && cap ? num(cap) : undefined,
      contract_value: contract ? num(contract) : model === 'fixed_price' ? total : undefined,
      people: usesPeople ? rates.map((r) => ({ profile_id: r.profile_id, rate: num(r.rate) })) : [],
      milestones: model === 'fixed_price' ? milestones.map((m) => ({ label: m.label, amount: amountOf(m), phase_id: m.phase_id, bill_on: m.bill_on })) : [],
      retainer: model === 'retainer' ? { fee: num(retainer.fee), hours: num(retainer.hours || '0'), rollover: retainer.rollover, overage_rate: retainer.overage } : undefined,
    }
    const res = await setupBilling(payload)
    if (!res.ok) { setError(res.error); return }
    toast.success(res.message ?? 'Saved')
    router.replace(`/projects/${projectId}/billing`, { scroll: false })
  })


  return (
    <section className="card overflow-hidden" aria-label="Set up billing">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="m-0 text-sm font-semibold">Set up billing</h2>
        <p className="m-0 text-xs text-muted-foreground">Choose once how this contract is billed. Everyone still logs time; it only becomes the invoice on time-and-materials work.</p>
        <Steps steps={STEPS} current={step} className="mt-3 max-w-xl" />
      </div>

      <div className="p-4">
        {step === 0 ? (
          <div role="radiogroup" aria-label="Billing model" className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {MODELS.map(({ model: m, title, icon: Icon, body, timesheets }) => (
              <button key={m} type="button" role="radio" aria-checked={model === m} onClick={() => pickModel(m)}
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
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1"><span className="label">Contract value</span>
                <input value={contract} onChange={(e) => setContract(e.target.value)} inputMode="decimal" className="input tabular w-44" placeholder="e.g. 14,00,000" /></label>
              <span className="flex flex-col gap-1"><span className="label">Schedule in</span>
                <Seg label="Schedule in" value={byPercent ? 'pct' : 'amt'} onChange={(v) => setByPercent(v === 'pct')} options={[{ value: 'amt', label: 'Amounts' }, { value: 'pct', label: '% of contract' }]} /></span>
              <span className={cn('ml-auto text-xs', pctTotal === 100 || !contract ? 'text-muted-foreground' : 'font-medium text-warn-ink')}>
                Schedule {currency} {total.toLocaleString('en-IN')}{contract ? ` · ${pctTotal}% of the contract` : ''}</span>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <div className="row row-head grid-cols-[minmax(0,1fr)_120px_190px_150px_32px] min-w-[680px]"><span>Billing schedule</span><span className="text-right">{byPercent ? '% of contract' : 'Amount'}</span><span>Due when this phase is done</span><span>…or on this date</span><span /></div>
              {milestones.map((m, i) => (
                <div key={i} className="row grid-cols-[minmax(0,1fr)_120px_190px_150px_32px] min-w-[680px] py-1">
                  <input aria-label={`Milestone ${i + 1} name`} value={m.label} placeholder="e.g. Kick-off (advance)" className="input"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input aria-label={`Milestone ${i + 1} amount`} value={m.amount} inputMode="decimal" placeholder={byPercent ? '%' : '0'} className="input tabular text-right"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  <select aria-label={`Milestone ${i + 1} phase`} value={m.phase_id} className="input"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, phase_id: e.target.value } : x))}>
                    <option value="">No phase</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="date" aria-label={`Milestone ${i + 1} date`} value={m.bill_on} className="input"
                    onChange={(e) => setMilestones(milestones.map((x, j) => j === i ? { ...x, bill_on: e.target.value } : x))} />
                  <button type="button" aria-label={`Remove milestone ${i + 1}`} disabled={milestones.length === 1} onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                    className="btn btn-ghost size-8 px-0 text-muted-foreground"><Trash2 className="size-4" /></button>
                </div>
              ))}
              <div className="row grid-cols-[minmax(0,1fr)] min-w-[680px] bg-head">
                <button type="button" onClick={() => setMilestones([...milestones, { label: '', amount: '', phase_id: '', bill_on: '' }])} className="btn btn-ghost h-7 w-fit px-2 text-xs"><Plus className="size-3.5" />Add milestone</button>
              </div>
            </div>
            <p className="m-0 text-xs text-muted-foreground">Each line becomes due when its phase is complete or on its date, and shows up in the monthly billing run. An advance on signing: give it today&apos;s date.</p>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} className="mt-0.5 accent-primary" />
              <span><b>Change requests at people&apos;s rates</b><span className="block text-xs text-muted-foreground">Time on tasks outside the scheduled phases is billed as time and materials.</span></span>
            </label>
          </div>
        ) : null}

        {step === 1 && model === 'retainer' ? (
          <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1"><span className="label">Monthly fee</span>
              <input value={retainer.fee} onChange={(e) => setRetainer({ ...retainer, fee: e.target.value })} inputMode="decimal" className="input tabular" placeholder="0" /></label>
            <label className="flex flex-col gap-1"><span className="label">Hours included a month</span>
              <input value={retainer.hours} onChange={(e) => setRetainer({ ...retainer, hours: e.target.value })} inputMode="decimal" className="input tabular" placeholder="e.g. 40" /></label>
            <label className="flex flex-col gap-1"><span className="label">Carry over, at most</span>
              <input value={retainer.rollover} onChange={(e) => setRetainer({ ...retainer, rollover: e.target.value })} inputMode="decimal" className="input tabular" placeholder="Empty: no limit" /></label>
            <label className="flex flex-col gap-1"><span className="label">Hours over: rate per hour</span>
              <input value={retainer.overage} onChange={(e) => setRetainer({ ...retainer, overage: e.target.value })} inputMode="decimal" className="input tabular" placeholder="Empty: not billed" /></label>
            <p className="m-0 text-xs text-muted-foreground sm:col-span-4">The hours are the customer&apos;s monthly allowance across their projects. They see a meter, you are warned at 75%, 90% and 100%, and hours over the allowance are billed at the overage rate.</p>
          </div>
        ) : null}

        {step === 1 && usesPeople ? (
          <div className={cn('flex flex-col gap-2', model === 'fixed_price' && 'mt-3')}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2"><span className="label">{model === 'dedicated' ? 'Billed per' : 'Rates are per'}</span>
                <Seg label="Rate unit" value={unit} onChange={setUnit} options={units.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} /></span>
              {model === 'time_materials' ? (
                <label className="flex items-center gap-2"><span className="label">Monthly cap</span>
                  <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="input tabular w-36" placeholder="Optional" /></label>
              ) : null}
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
            <p className="m-0 text-xs text-muted-foreground">{model === 'dedicated'
              ? 'Each month bills the working days in the period less the person’s leave (recorded on their timesheet). Their hours are still logged, for utilisation.'
              : model === 'time_materials' ? 'Approved billable hours are billed at each person’s rate. A monthly cap stops a statement going over an agreed not-to-exceed.'
              : 'Only finance, admins and the CEO see rates.'}</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid max-w-3xl gap-3 sm:grid-cols-[160px_180px_180px_minmax(0,1fr)]">
            <label className="flex flex-col gap-1"><span className="label">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input font-mono">{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Contract value</span>
              <input value={contract} onChange={(e) => setContract(e.target.value)} inputMode="decimal" className="input tabular" placeholder={model === 'fixed_price' ? String(total) : 'From the SOW'} /></label>
            <label className="flex flex-col gap-1"><span className="label">Customer PO number</span>
              <input value={po} onChange={(e) => setPo(e.target.value)} className="input font-mono" placeholder="Optional" /></label>
            <label className="flex flex-col gap-1"><span className="label">Notes for the customer</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Payment terms, what is included" /></label>
            <div className="rounded-md bg-head p-3 text-xs sm:col-span-4">
              <b>{MODELS.find((m) => m.model === model)?.title}</b>
              {model === 'fixed_price' ? <> · {milestones.length} milestone{milestones.length === 1 ? '' : 's'}, {currency} {total.toLocaleString('en-IN')}{extras ? ` · change requests for ${rates.length} people per ${unit}` : ''}</> : null}
              {model === 'time_materials' ? <> · {rates.length} {rates.length === 1 ? 'person' : 'people'}, {currency} per {unit}{cap ? `, capped at ${currency} ${num(cap).toLocaleString('en-IN')} a month` : ''}</> : null}
              {model === 'dedicated' ? <> · {rates.length} {rates.length === 1 ? 'person' : 'people'}, {currency} per {unit}, less leave</> : null}
              {model === 'retainer' ? <> · {currency} {num(retainer.fee || '0').toLocaleString('en-IN')} a month{retainer.hours ? `, ${retainer.hours} hours included` : ''}{retainer.overage ? `, hours over at ${retainer.overage}` : ''}</> : null}
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
