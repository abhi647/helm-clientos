import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarClock, Clock, Flag, Hourglass, Receipt, UserCheck, Wallet } from 'lucide-react'
import { approveRateCardForCustomer, billMilestone, createStatement, discardRateCard, setContractValue, submitRateCard } from '@/app/_actions/billing'
import { RateCardStatus, StatementStatus } from '@/components/billing'
import { BillingSetupWizard, type SetupInitial, type Unit } from '@/components/billing-setup'
import { ActionButton, ActionForm, ApproveForCustomer } from '@/components/forms'
import { DetailList } from '@/components/overtrue/detail-list'
import { ResourceProgress } from '@/components/overtrue/resource-progress'
import { StatementsTable, type StatementRow } from '@/components/statements-table'
import { UnbilledTime } from '@/components/time-billing'
import { btn, Card, Chip, cn, Empty, Stat } from '@/components/ui'
import { Ticks } from '@/components/viz'
import { hrs, money, shortDate } from '@/lib/format'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'Billing' }

const MODEL = {
  time_materials: { label: 'Time & materials', icon: Clock, tone: 'info' as const, hint: 'Approved timesheet hours are billed at each person’s rate.' },
  dedicated: { label: 'Dedicated people', icon: UserCheck, tone: 'info' as const, hint: 'Billed per month or working day, less leave. Timesheets show utilisation, not the bill.' },
  fixed_price: { label: 'Fixed fee', icon: Flag, tone: 'review' as const, hint: 'Milestones are billed when delivered. Time tracks effort against the budget.' },
  retainer: { label: 'Retainer', icon: CalendarClock, tone: 'good' as const, hint: 'A monthly fee; approved hours use up the monthly allowance.' },
}

type Search = { setup?: string; period?: string }
const monthBounds = (offset: number) => {
  const d = new Date()
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 0))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), name: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

/** This month or last month, kept in the address. */
function PeriodSwitch({ current, names }: { current?: string; names: [string, string] }) {
  return (
    <nav aria-label="Period" className="inline-flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5 ring-1 ring-border ring-inset">
      {([['', names[0]], ['last', names[1]]] as const).map(([v, n]) => (
        <Link key={v} href={v ? `?period=${v}` : '?'} scroll={false} aria-current={(current ?? '') === v ? 'page' : undefined}
          className={cn('flex h-full items-center rounded px-2 text-xs no-underline', (current ?? '') === v ? 'bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/.08)]' : 'text-muted-foreground')}>{n}</Link>
      ))}
    </nav>
  )
}

/**
 * Billing for one project (admin, CEO and finance only), shaped by how the project is billed. A project without a
 * billing model starts with the set-up wizard; after that the page shows what that model needs and nothing else.
 */
export default async function ProjectBilling({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params
  const sp = await searchParams
  const me = await requireStaff()
  if (!canSeeFinance(me)) notFound()
  const supabase = await createClient()
  const [{ data: project }, { data: cards }, { data: statements }, { data: staff }, { data: phases }, { data: tasks }, { data: unbilled }, { data: deals }, { data: invoices }] = await Promise.all([
    supabase.from('projects').select('id, name, customer_id, billing_model, rate_unit').eq('id', id).maybeSingle(),
    supabase.from('rate_cards').select('*, rate_card_lines(*, rate_line_people(profile_id))').eq('project_id', id).order('version', { ascending: false }),
    supabase.from('billing_statements').select('id, period_start, period_end, status, note, zoho_invoice_number, zoho_salesorder_number, invoice_error, rate_cards(currency), statement_lines(amount, kind, unit, label, quantity)')
      .eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').is('access_revoked_at', null).order('full_name'),
    supabase.from('phases').select('id, name, rate_line_id, position').eq('project_id', id).order('position'),
    supabase.from('tasks').select('id, phase_id, status, parent_id, task_estimates(estimate, unit), time_entries(hours, billable, approved_at, returned_at, statement_id, user_id)').eq('project_id', id).limit(2000),
    supabase.rpc('unbilled_time', { p_project: id }),
    supabase.from('project_deals').select('id, deal_name, stage_label, closed_on, invoice_number').eq('project_id', id).order('closed_on', { ascending: false }),
    supabase.from('invoices').select('number, total, currency, status').eq('project_id', id),
  ])
  if (!project) notFound()
  const [{ data: costs }, { data: preview }] = await Promise.all([
    supabase.from('cost_rates').select('profile_id, hourly_cost'),
    supabase.rpc('billing_preview', { p_start: monthBounds(sp.period === 'last' ? -1 : 0).start, p_end: monthBounds(sp.period === 'last' ? -1 : 0).end }),
  ])
  const due = (preview ?? []).filter((r) => r.project_id === id)
  const model = project.billing_model
  const live = cards?.find((c) => c.status === 'approved')
  const open = cards?.find((c) => ['draft', 'pending', 'changes_requested'].includes(c.status))
  const card = open ?? live
  const lines = [...(card?.rate_card_lines ?? [])].sort((a, b) => a.position - b.position)
  const liveLines = [...(live?.rate_card_lines ?? [])].sort((a, b) => a.position - b.position)
  const currency = card?.currency ?? 'INR'
  const nameOf = new Map((staff ?? []).map((p) => [p.id!, p.full_name!]))
  const people = (staff ?? []).map((p) => ({ id: p.id!, name: p.full_name!, role: p.internal_role }))

  // time on the project
  const entries = (tasks ?? []).flatMap((t) => t.time_entries)
  const logged = entries.filter((e) => !e.returned_at).reduce((a, e) => a + Number(e.hours), 0)
  const waiting = entries.filter((e) => e.billable && !e.approved_at && !e.returned_at).reduce((a, e) => a + Number(e.hours), 0)
  const planned = (tasks ?? []).filter((t) => !t.parent_id).reduce((a, t) => a + (t.task_estimates?.unit === 'day' ? Number(t.task_estimates.estimate) * 8 : t.task_estimates?.unit === 'hour' ? Number(t.task_estimates.estimate) : 0), 0)
  const unbilledTotal = (unbilled ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0)
  const unbilledHours = (unbilled ?? []).reduce((a, r) => a + Number(r.hours ?? 0), 0)

  const rows: StatementRow[] = (statements ?? []).map((s) => {
    const milestone = s.statement_lines.find((l) => l.kind === 'delivery' && l.unit === 'milestone')
    return {
      id: s.id, start: s.period_start, end: s.period_end, status: s.status, currency: s.rate_cards?.currency ?? currency,
      subtotal: s.statement_lines.reduce((a, l) => a + Number(l.amount ?? 0), 0), invoice: s.zoho_invoice_number, salesOrder: s.zoho_salesorder_number, error: s.invoice_error,
      label: milestone ? `Milestone: ${milestone.label}` : s.statement_lines.some((l) => l.kind === 'retainer') ? 'Monthly retainer' : 'Time billed',
    }
  })

  // fixed price: each milestone, its phase's progress and where it stands
  const milestones = liveLines.filter((l) => l.kind === 'delivery' && l.unit === 'milestone').map((l) => {
    const phase = (phases ?? []).find((p) => p.rate_line_id && liveLines.concat(lines).some((x) => x.id === p.rate_line_id && x.label === l.label))
    const work = (tasks ?? []).filter((t) => !t.parent_id && phase && t.phase_id === phase.id)
    const pct = work.length ? (100 * work.filter((t) => t.status === 'done').length) / work.length : 0
    const st = (statements ?? []).find((s) => s.statement_lines.some((x) => x.kind === 'delivery' && x.unit === 'milestone' && x.label === l.label))
    return { line: l, phase, pct, statement: st }
  })
  // per-unit deliverables (a report, a workshop): billed by the count delivered in a period, not as a milestone
  const unitLines = liveLines.filter((l) => l.kind === 'unit' || (l.kind === 'delivery' && l.unit !== 'milestone'))
  const contract = milestones.reduce((a, m) => a + Number(m.line.rate), 0)
  // the agreed total: entered from the SOW, or for a fixed fee the schedule's total
  const contractValue = card?.contract_value != null ? Number(card.contract_value) : model === 'fixed_price' && contract ? contract : null
  const billed = milestones.filter((m) => m.statement && ['approved', 'invoiced'].includes(m.statement.status)).reduce((a, m) => a + Number(m.line.rate), 0)

  // retainer: the customer's hours bank this month
  const { data: bank } = model === 'retainer' ? await supabase.rpc('credit_balance', { p_customer: project.customer_id }) : { data: null }
  const b = bank?.[0]

  const thisMonth = monthBounds(0), lastMonth = monthBounds(-1)
  const chosen = sp.period === 'last' ? lastMonth : thisMonth
  const showWizard = !model || !card || sp.setup === '1'
  const ModelIcon = model ? MODEL[model].icon : Receipt

  const initial: SetupInitial | undefined = model && card ? {
    model, unit: (project.rate_unit as Unit) ?? 'hour', currency, po: card.po_number ?? '', notes: card.notes ?? '', cap: card.monthly_cap != null ? String(card.monthly_cap) : '', contract: card.contract_value != null ? String(card.contract_value) : '',
    rates: lines.filter((l) => (l.kind === 'day_rate' || l.kind === 'resource') && l.rate_line_people.length === 1).map((l) => ({ profile_id: l.rate_line_people[0]!.profile_id, rate: String(l.rate) })),
    milestones: lines.filter((l) => l.kind === 'delivery').map((l) => ({ label: l.label, amount: String(l.rate), phase_id: (phases ?? []).find((p) => p.rate_line_id === l.id)?.id ?? '', bill_on: l.bill_on ?? '' })),
    retainer: { fee: String(lines.find((l) => l.kind === 'retainer')?.rate ?? ''), hours: b ? String(b.allowance ?? '') : '', rollover: '', overage: String(lines.find((l) => l.kind === 'overage')?.rate ?? '') },
  } : undefined

  // margin: what the customer has agreed to pay against what the hours cost us (finance's cost rates)
  const costOf = new Map((costs ?? []).map((c) => [c.profile_id, Number(c.hourly_cost)]))
  const revenue = (statements ?? []).filter((s) => ['approved', 'invoiced'].includes(s.status)).reduce((a, s) => a + s.statement_lines.reduce((b, l) => b + Number(l.amount ?? 0), 0), 0)
  const cost = entries.filter((e) => !e.returned_at).reduce((a, e) => a + Number(e.hours) * (costOf.get(e.user_id) ?? 0), 0)
  const costKnown = entries.some((e) => costOf.has(e.user_id))
  const margin = revenue ? Math.round((100 * (revenue - cost)) / revenue) : null

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* ------------------------------------------------ how this project is billed, and where its rates stand */}
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3" aria-label="Billing set-up">
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-primary"><ModelIcon aria-hidden className="size-4" /></span>
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold">{model ? MODEL[model].label : 'Billing not set up'}</span>
            <span className="text-xs text-muted-foreground">{model ? MODEL[model].hint : 'Choose how this project is billed to start.'}</span>
          </span>
        </span>
        {card ? (
          <DetailList className="min-w-[300px] flex-1 text-xs [&_dd]:text-[13px]" items={[
            { id: 'rates', label: 'Rates', value: <span className="flex items-center gap-1.5">v{card.version} <RateCardStatus status={card.status} /></span> },
            { id: 'cur', label: 'Currency', value: <span className="font-mono">{currency}{model !== 'fixed_price' || lines.some((l) => l.kind === 'day_rate') ? ` · per ${project.rate_unit}` : ''}</span> },
            { id: 'po', label: 'PO', value: <span className="font-mono">{card.po_number || '–'}</span> },
            { id: 'cv', label: 'Contract', value: (
              <details className="group/cv relative">
                <summary className="tabular cursor-pointer list-none font-medium">{contractValue != null ? money(contractValue, currency) : <span className="text-primary">Add value</span>}
                  {contractValue ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{money(revenue, currency)} billed · {money(Math.max(contractValue - revenue, 0), currency)} left</span> : null}</summary>
                <div className="absolute z-10 mt-1 w-64 rounded-md border border-border bg-card p-2.5 shadow-pop">
                  <ActionForm action={setContractValue} submit="Save" resetOnSuccess={false}>
                    <input type="hidden" name="project_id" value={id} />
                    <label className="label" htmlFor="cv-in">Contract value ({currency}), from the SOW</label>
                    <Input id="cv-in" name="contract_value" defaultValue={card.contract_value ?? ''} inputMode="decimal" className="w-auto tabular" placeholder="Empty: not set" />
                  </ActionForm>
                </div>
              </details>
            ) },
          ]} />
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {open && ['draft', 'changes_requested'].includes(open.status) && open.rate_card_lines.length ? (
            <>
              <ActionButton run={submitRateCard.bind(null, open.id)} primary confirm="Send these rates to the customer for approval? They can't be edited while the customer reviews them.">Send to customer</ActionButton>
              {open.status === 'draft' && live ? <ActionButton run={discardRateCard.bind(null, open.id)} variant="ghost" confirm="Discard these draft rates and keep the approved ones?">Discard draft</ActionButton> : null}
            </>
          ) : null}
          {model && card && !showWizard && open?.status !== 'pending' ? <Link href="?setup=1" className={btn('outline')}>{open ? 'Edit set-up' : 'Change set-up'}</Link> : null}
          {showWizard && model && card ? <Link href="?" className={btn('ghost')}>Cancel</Link> : null}
        </span>
        {open?.status === 'changes_requested' && open.decision_note ? (
          <p role="alert" className="m-0 w-full rounded-md bg-warn-bg px-2.5 py-1.5 text-xs text-warn-ink"><b>The customer asked for changes:</b> {open.decision_note}</p>
        ) : null}
        {open && open.rate_card_lines.length && open.status !== 'approved' ? (
          <div className="w-full border-t border-line-soft pt-2">
            <ApproveForCustomer action={approveRateCardForCustomer} idName="card_id" id={open.id} label="Approve the rates for the customer"
              hint="Already agreed in the signed contract or on a call? Make them the approved rates now; the customer's billing contacts are told by email." />
          </div>
        ) : null}
      </section>

      {showWizard ? <BillingSetupWizard key={card?.id ?? 'new'} projectId={id} people={people} phases={(phases ?? []).map((p) => ({ id: p.id, name: p.name }))} initial={initial} /> : null}

      {!showWizard && !live ? (
        <Card title="Waiting for agreed rates"><p className="m-0 text-[13px] text-muted-foreground">Billing starts once the rates are approved: send them to the customer, or approve them for the customer above.</p></Card>
      ) : null}

      {/* ------------------------------------------------ dedicated people */}
      {!showWizard && live && model === 'dedicated' ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label={`To bill for ${chosen.name}`} value={money(due.reduce((a, r) => a + Number(r.amount), 0), currency)} icon={<Wallet />} tone="info" />
            <Stat label="People" value={liveLines.filter((l) => l.kind === 'resource').length} sub={`per ${project.rate_unit}`} icon={<UserCheck />} />
            <Stat label="Hours logged" value={hrs(logged)} sub="utilisation, not billed" icon={<Clock />} />
            <Stat label="Statements" value={rows.length} sub={`${rows.filter((r) => r.status === 'approved' && !r.invoice).length} ready to invoice`} icon={<Receipt />} />
          </div>
          <Card flush title={`Bill ${chosen.name}`} description="Working days in the month less each person’s leave; their timesheets do not change the amount"
            extra={<PeriodSwitch current={sp.period} names={[thisMonth.name, lastMonth.name]} />}>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="row row-head grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_90px_130px_130px]"><span>Person</span><span>Basis</span><span className="text-right">Quantity</span><span className="text-right">Rate</span><span className="text-right">Amount</span></div>
                {due.map((r) => (
                  <div key={r.line_id} className="row grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_90px_130px_130px]">
                    <span className="truncate font-medium">{r.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.basis}</span>
                    <span className="tabular text-right text-xs">{+Number(r.quantity).toFixed(2)} {r.unit === 'month' ? 'mo' : 'd'}</span>
                    <span className="tabular text-right text-xs">{money(Number(r.rate), currency, { exact: true })}</span>
                    <span className="tabular text-right font-medium">{money(Number(r.amount), currency, { exact: true })}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-line-soft p-3">
              {due[0]?.statement_id ? <Link href={`/projects/${id}/billing/${due[0].statement_id}`} className="text-xs">A statement already covers {chosen.name} →</Link> : (
                <ActionForm action={createStatement} submit={`Create statement for ${chosen.name}`} resetOnSuccess={false}>
                  <input type="hidden" name="project_id" value={id} />
                  <input type="hidden" name="period_start" value={chosen.start} /><input type="hidden" name="period_end" value={chosen.end} />
                </ActionForm>
              )}
            </div>
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------ fixed price */}
      {!showWizard && live && model === 'fixed_price' && milestones.length ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Contract value" value={money(contract, currency)} sub={`${milestones.length} milestones`} icon={<Flag />} />
            <Stat label="Billed" value={money(billed, currency)} pct={contract ? (100 * billed) / contract : 0} tone="good" icon={<Receipt />} />
            <Stat label="Still to bill" value={money(contract - billed, currency)} icon={<Wallet />} tone={contract - billed ? 'info' : 'good'} />
            <Stat label="Effort used" value={hrs(logged)} sub={planned ? `of ${hrs(planned)} planned` : 'no estimates yet'}
              pct={planned ? (100 * logged) / planned : undefined} tone={planned && logged > planned ? 'crit' : planned && logged > 0.85 * planned ? 'warn' : 'neutral'} icon={<Clock />} />
          </div>
          <Card flush title="Milestones" description="Bill each one when it is delivered. The customer approves the statement; then it goes to Zoho.">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="row row-head grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_130px_190px]"><span>Milestone</span><span>Delivered with</span><span className="text-right">Amount</span><span>Status</span><span /></div>
                {milestones.map((m) => (
                  <div key={m.line.id} className="row grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_130px_190px]">
                    <span className="truncate font-medium">{m.line.label}</span>
                    <span className="flex min-w-0 items-center gap-2 text-xs">{m.phase ? <><span className="truncate">{m.phase.name}</span><Ticks value={m.pct} /><span className="tabular text-muted-foreground">{Math.round(m.pct)}%</span></> : null}
                      {m.line.bill_on ? <span className="text-muted-foreground">{m.phase ? 'or ' : ''}on {shortDate(m.line.bill_on)}</span> : !m.phase ? <span className="text-muted-foreground">By hand</span> : null}</span>
                    <span className="tabular text-right font-medium">{money(Number(m.line.rate), currency, { exact: true })}<span className="block text-[11px] font-normal text-muted-foreground">{contract ? `${Math.round((100 * Number(m.line.rate)) / contract)}%` : ''}</span></span>
                    <span>{m.statement ? <StatementStatus status={m.statement.status} /> : <Chip tone="neutral">Not billed</Chip>}</span>
                    <span className="text-right">{m.statement ? <Link href={`/projects/${id}/billing/${m.statement.id}`} className="text-xs">Open statement →</Link>
                      : <ActionButton run={billMilestone.bind(null, m.line.id, id)} primary={due.some((d) => d.line_id === m.line.id)} className="h-7 px-2.5 text-xs"
                          confirm={`Bill "${m.line.label}" (${money(Number(m.line.rate), currency, { exact: true })})? A statement is created for the customer to approve.`}>
                          {due.some((d) => d.line_id === m.line.id) ? 'Bill milestone' : 'Bill early'}</ActionButton>}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------ per-unit deliverables */}
      {!showWizard && live && model !== 'time_materials' && unitLines.length ? (
        <Card flush title="Bill deliverables" description="Counts what was delivered in the period at the agreed unit rates; adjust the counts on the draft before sending"
          extra={<PeriodSwitch current={sp.period} names={[thisMonth.name, lastMonth.name]} />}>
          <div className="row row-head grid-cols-[minmax(0,1fr)_140px]"><span>Deliverable</span><span className="text-right">Rate</span></div>
          {unitLines.map((l) => (
            <div key={l.id} className="row grid-cols-[minmax(0,1fr)_140px]">
              <span className="truncate font-medium">{l.label}</span>
              <span className="tabular text-right text-xs">{money(Number(l.rate), currency, { exact: true })} / {l.unit}</span>
            </div>
          ))}
          <div className="border-t border-line-soft p-3">
            <ActionForm action={createStatement} submit="Create statement for the period" resetOnSuccess={false}>
              <input type="hidden" name="project_id" value={id} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <label className="flex items-center gap-1.5">From <Input type="date" name="period_start" required defaultValue={chosen.start} className="w-auto" /></label>
                <label className="flex items-center gap-1.5">to <Input type="date" name="period_end" required defaultValue={chosen.end} className="w-auto" /></label>
                <span>Tasks done in the period fill the counts; type the rest on the draft.</span>
              </div>
            </ActionForm>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------ time & materials (and fixed-price extras) */}
      {!showWizard && live && (model === 'time_materials' || (model === 'fixed_price' && liveLines.some((l) => l.kind === 'day_rate'))) ? (
        <>
          {model === 'time_materials' ? (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Ready to bill" value={money(unbilledTotal, currency)} sub={`${hrs(unbilledHours)} approved`} icon={<Wallet />} tone={unbilledTotal ? 'info' : 'neutral'} />
              <Stat label="Waiting for approval" value={hrs(waiting)} sub="billable, in Timesheets" href="/timesheets" icon={<Hourglass />} tone={waiting ? 'warn' : 'good'} />
              <Stat label="Logged on the project" value={hrs(logged)} icon={<Clock />} />
              <Stat label="Statements" value={rows.length} sub={`${rows.filter((r) => r.status === 'approved' && !r.invoice).length} ready to invoice`} icon={<Receipt />} />
            </div>
          ) : null}
          <Card flush title={model === 'fixed_price' ? 'Extra work at people’s rates' : 'Bill a period'}
            description={model === 'fixed_price' ? 'Time outside the milestone phases, for change requests' : `Puts every approved, billable hour in the period on one statement${live.monthly_cap != null ? ` · capped at ${money(Number(live.monthly_cap), currency)} a month` : ''}`}
            extra={<PeriodSwitch current={sp.period} names={[thisMonth.name, lastMonth.name]} />}>
            <div className="border-b border-line-soft p-3">
              <ActionForm action={createStatement} submit={`Create statement for ${chosen.name}`} resetOnSuccess={false}>
                <input type="hidden" name="project_id" value={id} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5">From <Input type="date" name="period_start" required defaultValue={chosen.start} className="w-auto" /></label>
                  <label className="flex items-center gap-1.5">to <Input type="date" name="period_end" required defaultValue={chosen.end} className="w-auto" /></label>
                  <span>Only approved hours are billed; anything still waiting stays for the next statement.</span>
                </div>
              </ActionForm>
            </div>
            {(unbilled ?? []).length ? <UnbilledTime rows={unbilled ?? []} /> : <Empty title="No approved time to bill">Approved, billable hours appear here until a statement bills them.</Empty>}
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------ retainer */}
      {!showWizard && live && model === 'retainer' ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card title="Hours this month" description={b ? `${shortDate(b.period_start)} – ${shortDate(b.period_end)}` : 'No hours allowance set'}>
            {b ? (
              <div className="flex flex-col gap-3">
                <ResourceProgress label="Used of available" value={Number(b.used)} max={Math.max(Number(b.available), 1)}
                  valueLabel={`${hrs(Number(b.used))} of ${hrs(Number(b.available))}`} color={Number(b.used_pct) >= 100 ? 'var(--color-crit)' : Number(b.used_pct) >= 75 ? 'var(--color-warn)' : 'var(--color-primary)'} />
                <DetailList className="text-xs" items={[
                  { id: 'a', label: 'Monthly allowance', value: hrs(Number(b.allowance ?? 0)) },
                  { id: 'c', label: 'Carried over', value: hrs(Number(b.carried ?? 0)) },
                  { id: 't', label: 'Extra hours added', value: hrs(Number(b.topups ?? 0)) },
                  { id: 'r', label: Number(b.remaining) < 0 ? 'Over the allowance' : 'Remaining', value: <span className={Number(b.remaining) < 0 ? 'font-semibold text-crit-ink' : ''}>{hrs(Math.abs(Number(b.remaining)))}</span> },
                ]} />
              </div>
            ) : <p className="m-0 text-xs text-muted-foreground">Add hours in Change set-up, or on the customer’s page under Hours credit.</p>}
          </Card>
          <Card title="Bill the month" description="The monthly fee on one statement">
            <ActionForm action={createStatement} submit={`Create statement for ${chosen.name}`} resetOnSuccess={false}>
              <input type="hidden" name="project_id" value={id} />
              <input type="hidden" name="period_start" value={chosen.start} /><input type="hidden" name="period_end" value={chosen.end} />
              <p className="m-0 text-xs text-muted-foreground">{money(Number(liveLines.find((l) => l.kind === 'retainer')?.rate ?? 0), currency, { exact: true })} for {chosen.name}{due.find((r) => r.kind === 'overage') ? `, plus ${+Number(due.find((r) => r.kind === 'overage')!.quantity).toFixed(2)} hours over the allowance (${money(Number(due.find((r) => r.kind === 'overage')!.amount), currency, { exact: true })})` : ''}. <Link href={sp.period === 'last' ? '?' : '?period=last'}>{sp.period === 'last' ? `Bill ${thisMonth.name} instead` : `Bill ${lastMonth.name} instead`}</Link></p>
            </ActionForm>
          </Card>
        </div>
      ) : null}

      {/* ------------------------------------------------ profitability */}
      {!showWizard && live ? (
        <Card title="Profitability" description="Approved billing against the cost of every hour logged on the project (cost rates: Finance → Cost rates)"
          extra={<Link href="/finance/costs" className="text-xs font-medium">Cost rates →</Link>}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
            <DetailList className="text-xs" items={[{ id: 'r', label: 'Billed and approved', value: <span className="tabular text-[13px] font-medium">{money(revenue, currency)}</span> }]} />
            <DetailList className="text-xs" items={[{ id: 'c', label: 'Cost of time', value: <span className="tabular text-[13px] font-medium">{costKnown ? money(cost, currency) : 'No cost rates yet'}</span> }]} />
            <DetailList className="text-xs" items={[{ id: 'm', label: 'Margin', value: <span className={cn('tabular text-[13px] font-semibold', margin != null && costKnown && (margin < 20 ? 'text-crit-ink' : margin < 40 ? 'text-warn-ink' : 'text-good-ink'))}>{margin != null && costKnown ? `${margin}%` : '–'}</span> }]} />
            <DetailList className="text-xs" items={[{ id: 'h', label: 'Hours logged', value: <span className="tabular text-[13px] font-medium">{hrs(logged)}</span> }]} />
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------ agreed rates */}
      {!showWizard && card ? (
        <Card flush title={`Rates v${card.version}`} description={card.notes || undefined} extra={<RateCardStatus status={card.status} />}>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_150px_140px]"><span>{model === 'fixed_price' ? 'Milestone or person' : model === 'retainer' ? 'Item' : 'Person'}</span><span>Type</span><span className="text-right">Rate</span></div>
              {lines.map((l) => (
                <div key={l.id} className="row grid-cols-[minmax(0,1fr)_150px_140px]">
                  <span className="truncate">{(l.kind === 'day_rate' || l.kind === 'resource') && l.rate_line_people.length === 1 ? nameOf.get(l.rate_line_people[0]!.profile_id) ?? l.label : l.label}</span>
                  <span className="text-xs text-muted-foreground">{l.kind === 'day_rate' ? (l.rate_line_people.length > 1 ? `Shared day rate · ${l.rate_line_people.length} people` : 'Time & materials') : l.kind === 'resource' ? 'Dedicated' : l.kind === 'overage' ? 'Hours over allowance' : l.kind === 'delivery' ? (l.unit === 'milestone' ? `Milestone${l.bill_on ? ` · ${shortDate(l.bill_on)}` : ''}` : 'Per delivery') : l.kind === 'retainer' ? 'Monthly fee' : `Per ${l.unit}`}</span>
                  <span className="tabular text-right">{money(Number(l.rate), currency, { exact: true })}<span className="text-xs text-muted-foreground"> / {l.unit === 'milestone' ? 'milestone' : l.unit}</span></span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------ statements */}
      <Card flush title="Statements" description="Draft → with the customer → approved → invoiced in Zoho">
        <StatementsTable rows={rows} projectId={id} />
      </Card>

      {deals?.length ? (
        <Card flush title="History from HubSpot & Zoho" extra={`${deals.length} billing period${deals.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_140px_130px_120px_110px]"><span>Deal</span><span>Stage</span><span>Invoice</span><span className="text-right">Total</span><span>Zoho status</span></div>
              {deals.map((d) => {
                const inv = d.invoice_number ? (invoices ?? []).find((i) => i.number === d.invoice_number) : undefined
                return (
                  <div key={d.id} className="row grid-cols-[minmax(0,1fr)_140px_130px_120px_110px]">
                    <span className="truncate" title={d.deal_name}>{d.deal_name}</span>
                    <span className="truncate text-xs text-muted-foreground">{d.stage_label}</span>
                    <span className="font-mono text-xs">{d.invoice_number ?? '–'}</span>
                    <span className="tabular text-right text-xs">{inv ? money(inv.total, inv.currency, { exact: true }) : '–'}</span>
                    <span className="text-xs">{inv ? inv.status : d.invoice_number ? <span className="text-muted-foreground">Not synced</span> : '–'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
