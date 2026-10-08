import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  addRateCardLine, approveRateCardForCustomer, createInvoice, createStatement, discardRateCard, removeRateCardLine, saveRateCard, startRateCard, submitRateCard,
  updateRateCardLine,
} from '@/app/_actions/billing'
import { KIND_LABEL, KIND_UNIT, PLANNED_LABEL, RateCardStatus, RateLines, StatementStatus, period } from '@/components/billing'
import { ActionButton, ActionForm, ApproveForCustomer, AutoSaveSelect } from '@/components/forms'
import { Card, Empty } from '@/components/ui'
import { LineFields } from '@/components/rate-line-fields'
import { LinePeople, ReadyToBill, UnbilledTime, type ReadyRow } from '@/components/time-billing'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies'
import { money, relativeTime } from '@/lib/format'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Billing' }

// a line typed into "Add a line" but not added yet
const UNSAVED_LINE = { selector: '[data-add-line] input[name="label"], [data-add-line] input[name="rate"]', message: 'There is a line in "Add a line" that has not been added yet. Press Add line first, or clear it.' }
// the PO number or notes changed but "Save details" not pressed (the currency saves itself)
const UNSAVED_DETAILS = { selector: '[data-card-details] input, [data-card-details] select', mode: 'changed' as const, message: 'The PO number or notes have changes that are not saved. Press Save details first.' }
const GUARDS = [UNSAVED_LINE, UNSAVED_DETAILS]


/**
 * Billing for one project (admin, CEO and finance only). Finance keeps the rate card; the customer approves it once. Each
 * period finance prepares a statement on the approved rates; once the customer approves it, a draft invoice is created in Zoho.
 */
export default async function ProjectBilling({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  if (!canSeeFinance(me)) notFound()   // admin, CEO and finance only
  const supabase = await createClient()
  const [{ data: project }, { data: cards }, { data: statements }, { data: deals }, { data: invoices }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('rate_cards').select('*, rate_card_lines(*)').eq('project_id', id).order('version', { ascending: false }),
    supabase.from('billing_statements').select('id, period_start, period_end, status, zoho_invoice_number, invoice_error, created_at, rate_cards(currency), statement_lines(amount, quantity)')
      .eq('project_id', id).order('period_start', { ascending: false }),
    // history imported from HubSpot (one deal per billing period) and Zoho (the invoices)
    supabase.from('project_deals').select('id, deal_name, stage_label, closed_on, invoice_number').eq('project_id', id).order('closed_on', { ascending: false }),
    supabase.from('invoices').select('number, total, balance, currency, status, issued_on').eq('project_id', id),
  ])
  const lineIds = (cards ?? []).filter((c) => c.status !== 'superseded').flatMap((c) => c.rate_card_lines.map((l) => l.id))
  const [{ data: staff }, { data: covers }, { data: unbilled }, { data: allTasks }, { data: phaseLines }, { data: allLines }, { data: held }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('kind', 'internal').order('full_name'),
    lineIds.length ? supabase.from('rate_line_people').select('rate_card_line_id, profile_id').in('rate_card_line_id', lineIds) : Promise.resolve({ data: [] }),
    supabase.rpc('unbilled_time', { p_project: id }),
    // finished tasks not billed yet, with what they are billed as (their own line, else their phase's)
    supabase.from('tasks').select('id, title, status, completed_at, rate_line_id, phase_id, parent_id, statement_id, task_estimates(estimate, unit), time_entries(id, days, approved_at, returned_at, statement_id, billable, user_id)')
      .eq('project_id', id).order('position').limit(1000),
    supabase.from('phases').select('id, rate_line_id').eq('project_id', id),
    supabase.from('rate_card_lines').select('id, kind, label, unit, rate, rate_card_id, rate_cards!inner(project_id)').eq('rate_cards.project_id', id),
    // tasks already on a statement that is being prepared or waiting for the customer
    supabase.from('statement_tasks').select('task_id, billing_statements!inner(status, project_id)').eq('billing_statements.project_id', id).in('billing_statements.status', ['draft', 'pending', 'changes_requested']),
  ])
  const covered = new Map<string, string[]>()
  for (const c of covers ?? []) covered.set(c.rate_card_line_id, [...(covered.get(c.rate_card_line_id) ?? []), c.profile_id])
  const invoiceByNumber = new Map((invoices ?? []).map((i) => [i.number, i]))
  if (!project) notFound()
  const live = cards?.find((c) => c.status === 'approved')
  const open = cards?.find((c) => ['draft', 'pending', 'changes_requested'].includes(c.status))
  const editable = open && ['draft', 'changes_requested'].includes(open.status)
  const sortLines = <T extends { position: number }>(l: T[]) => [...l].sort((a, b) => a.position - b.position)

  // what each finished task is billed as, matched to the approved card by kind and name (lines keep their meaning across versions)
  const lineById = new Map((allLines ?? []).map((l) => [l.id, l]))
  const key = (l?: { kind: string; label: string }) => (l ? `${l.kind}:${l.label.trim().toLowerCase()}` : '')
  const liveByKey = new Map((live?.rate_card_lines ?? []).map((l) => [key(l), l]))
  const phaseLine = new Map((phaseLines ?? []).map((p) => [p.id, p.rate_line_id]))
  const heldOn = new Map((held ?? []).map((h) => [h.task_id, h.billing_statements.status]))
  // a task's days include its subtasks' (billing is on tasks, not subtasks)
  // (returned days are not counted: the person deletes and logs them again)
  const entriesOf = (tid: string) => (allTasks ?? []).filter((x) => x.id === tid || x.parent_id === tid).flatMap((x) => x.time_entries).filter((e) => !e.returned_at)
  const candidates = (allTasks ?? []).filter((t) => !t.parent_id && !t.statement_id && (t.status === 'done'
    || entriesOf(t.id).some((e) => e.billable && !e.statement_id)))
  const readyRows: ReadyRow[] = candidates.map((t) => {
    const own = t.rate_line_id ?? (t.phase_id ? phaseLine.get(t.phase_id) : null) ?? null
    const entries = entriesOf(t.id)
    // no line on the task or its phase: its days bill on the day-rate line that names the person (as on statements)
    const byPerson = !own ? (live?.rate_card_lines ?? []).find((l) => l.kind === 'day_rate'
      && entries.some((e) => e.billable && !e.statement_id && (covered.get(l.id) ?? []).includes(e.user_id))) : undefined
    const line = own ? lineById.get(own) : byPerson
    const current = line ? liveByKey.get(key(line)) : undefined
    const unbilledDays = entries.filter((e) => e.billable && e.approved_at && !e.statement_id).reduce((a, e) => a + Number(e.days), 0)
    const waitingDays = entries.filter((e) => e.billable && !e.approved_at).reduce((a, e) => a + Number(e.days), 0)
    const est = t.task_estimates
    const qty = current?.kind === 'unit' && est && est.unit.trim().toLowerCase() === current.unit.trim().toLowerCase() ? Number(est.estimate) : 1
    return { id: t.id, title: t.title, completedAt: t.completed_at, lineLabel: line ? `${line.label}${byPerson ? ' (by person)' : ''}` : null, kind: (current ?? line)?.kind ?? null,
      onLiveCard: !!current, quantity: qty, unit: current?.unit ?? null, rate: current ? Number(current.rate) : null, unbilledDays, waitingDays,
      done: t.status === 'done', heldBy: heldOn.get(t.id) ?? null }
  })
  const today = new Date()
  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)

  return (
    <div className="flex max-w-[1100px] flex-col gap-3 p-4">
      {/* ------------------------------------------------ rate card being prepared or waiting for the customer */}
      {open ? (
        <Card title={<span className="flex items-center gap-2">Rate card v{open.version} <RateCardStatus status={open.status} /></span>}
          extra={open.status === 'pending' && open.submitted_at ? `Sent ${relativeTime(open.submitted_at)}` : 'Typed from the signed contract'}>
          {open.status === 'changes_requested' && open.decision_note ? (
            <p role="alert" className="mt-0 mb-3 rounded-md bg-warn-bg p-2.5 text-xs text-warn-ink"><b>The customer asked for changes:</b> {open.decision_note}</p>
          ) : null}
          {editable ? (
            <div className="flex flex-col gap-4">
              <ActionForm action={saveRateCard} submit="Save details" resetOnSuccess={false} primary={false}>
                <input type="hidden" name="card_id" value={open.id} />
                <div data-card-details className="grid grid-cols-2 gap-2 md:grid-cols-[110px_200px_minmax(0,1fr)]">
                  <AutoSaveSelect key={open.currency} name="currency" aria-label="Currency" defaultValue={open.currency} className="input font-mono">
                    {CURRENCIES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
                    {CURRENCY_CODES.includes(open.currency) ? null : <option value={open.currency}>{open.currency}</option>}
                  </AutoSaveSelect>
                  <input name="po_number" aria-label="PO number" defaultValue={open.po_number ?? ''} placeholder="Customer PO number" className="input font-mono" />
                  <input name="notes" aria-label="Notes for the customer" defaultValue={open.notes} placeholder="Notes for the customer (payment terms, what is included)" className="input col-span-2 md:col-span-1" />
                </div>
              </ActionForm>
              <div className="flex flex-col gap-3">
                {open.rate_card_lines.length ? (
                  <div className="overflow-hidden rounded-md border border-line-soft">
                    <p className="label m-0 border-b border-line-soft bg-head px-2.5 py-1.5">{open.rate_card_lines.length} {open.rate_card_lines.length === 1 ? 'line' : 'lines'} on this rate card</p>
                    {sortLines(open.rate_card_lines).map((l) => (
                      <details key={l.id} className="group border-b border-line-soft last:border-b-0">
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 hover:bg-head">
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] font-semibold">{l.label}</span>
                            <span className="truncate text-xs text-muted">{KIND_LABEL[l.kind]}{PLANNED_LABEL[l.kind] && l.planned_quantity != null ? ` · ${l.planned_quantity} ${PLANNED_LABEL[l.kind]!.toLowerCase()}` : ''}</span>
                          </span>
                          <span className="shrink-0 text-right font-mono text-xs">{money(l.rate, open.currency, { exact: true })}<span className="text-muted"> / {l.unit}</span></span>
                          <span className="shrink-0 text-xs font-medium text-link group-open:hidden">Edit</span>
                          <span className="hidden shrink-0 text-xs font-medium text-muted group-open:inline">Close</span>
                        </summary>
                        <div className="border-t border-line-soft bg-[#fbfcfc] p-2.5">
                          <ActionForm action={updateRateCardLine} submit="Save line" resetOnSuccess={false} primary={false}>
                            <input type="hidden" name="line_id" value={l.id} />
                            <LineFields line={l} currency={open.currency} />
                          </ActionForm>
                          <div className="mt-1"><ActionButton run={removeRateCardLine.bind(null, l.id)} className="btn-ghost text-xs" confirm={`Remove "${l.label}"?`}>Remove line</ActionButton></div>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : null}
                <div data-add-line className="rounded-md border border-dashed border-line p-2.5">
                  <p className="label mt-0 mb-2">{open.rate_card_lines.length ? 'Add another line' : 'Add a line'}</p>
                  <ActionForm action={addRateCardLine} submit="Add line">
                    <input type="hidden" name="card_id" value={open.id} />
                    <LineFields currency={open.currency} />
                    <p className="m-0 text-xs text-muted">
                      One line per resource, delivery or unit: add as many as the contract has. Day rate: planned quantity is the
                      number of people ({KIND_UNIT.day_rate}s are filled in each period).
                    </p>
                  </ActionForm>
                </div>
              </div>
              <div className="-mx-3"><LinePeople lines={open.rate_card_lines} people={staff ?? []} covered={covered} /></div>
              <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton run={submitRateCard.bind(null, open.id)} primary guard={GUARDS}
                    confirm="Send these rates to the customer for approval? They can't be edited while the customer reviews them.">
                    Send to customer for approval
                  </ActionButton>
                  {open.status === 'draft' ? <ActionButton run={discardRateCard.bind(null, open.id)} className="btn-ghost" confirm="Discard this draft rate card?">Discard draft</ActionButton> : null}
                </div>
                {canSeeFinance(me) && open.rate_card_lines.length ? (
                  <ApproveForCustomer action={approveRateCardForCustomer} idName="card_id" id={open.id} label="Approve the rates for the customer" guard={GUARDS}
                    hint="For rates already agreed in the contract or on a call. They become the approved rates now, and the customer's billing contacts are told by email." />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto"><RateLines lines={sortLines(open.rate_card_lines)} currency={open.currency} /></div>
              {canSeeFinance(me) ? (
                <ApproveForCustomer action={approveRateCardForCustomer} idName="card_id" id={open.id} label="Approve the rates for the customer"
                  hint="No need to wait: confirm the rates as agreed. The customer's billing contacts are told by email." />
              ) : null}
            </div>
          )}
        </Card>
      ) : null}

      {/* ------------------------------------------------ the approved rates */}
      <Card flush title={live ? <span className="flex items-center gap-2">Approved rates v{live.version} <RateCardStatus status="approved" /></span> : 'Rate card'}
        extra={live ? <span className="font-mono">{live.currency}{live.po_number ? ` · PO ${live.po_number}` : ''}{live.approved_for_customer ? ' · approved by us for the customer' : ''}</span> : undefined}>
        {live ? (
          <>
            <div className="overflow-x-auto"><RateLines lines={sortLines(live.rate_card_lines)} currency={live.currency} /></div>
            {live.notes ? <p className="m-0 border-t border-line-soft px-3 py-2 text-xs text-muted">{live.notes}</p> : null}
            <LinePeople lines={live.rate_card_lines} people={staff ?? []} covered={covered} />
            {!open ? <div className="border-t border-line-soft p-3"><ActionButton run={startRateCard.bind(null, id)}>Revise rates</ActionButton></div> : null}
          </>
        ) : !open ? (
          <Empty title="No rate card yet">
            <span className="flex flex-col items-center gap-2">Set the rates from the signed contract: day rates per resource, per delivery, per unit or a monthly retainer, in any mix.
              <ActionButton run={startRateCard.bind(null, id)} primary>Start the rate card</ActionButton></span>
          </Empty>
        ) : <Empty title="Not approved yet">Statements can be prepared once the customer approves the rate card.</Empty>}
      </Card>

      <UnbilledTime rows={unbilled ?? []} />
      <ReadyToBill tasks={readyRows} currency={live?.currency ?? null} projectId={id} canCreate={!!live} />

      {deals?.length ? (
        <Card flush title="History from HubSpot & Zoho" extra={`${deals.length} billing period${deals.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_140px_130px_120px_110px]"><span>Deal</span><span>Stage</span><span>Invoice</span><span className="text-right">Total</span><span>Zoho status</span></div>
              {deals.map((d) => {
                const inv = d.invoice_number ? invoiceByNumber.get(d.invoice_number) : undefined
                return (
                  <div key={d.id} className="row grid-cols-[minmax(0,1fr)_140px_130px_120px_110px]">
                    <span className="truncate" title={d.deal_name}>{d.deal_name}</span>
                    <span className="truncate text-xs text-muted">{d.stage_label}</span>
                    <span className="font-mono text-xs">{d.invoice_number ?? '–'}</span>
                    <span className="text-right font-mono text-xs">{inv ? money(inv.total, inv.currency, { exact: true }) : '–'}</span>
                    <span className="text-xs">{inv ? inv.status : d.invoice_number ? <span className="text-muted">Not synced</span> : '–'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------ statements */}
      <Card flush title="Statements" extra="Approved by the customer, then invoiced in Zoho when you choose">
        {live ? (
          <div className="border-b border-line-soft p-3">
            <ActionForm action={createStatement} submit="Statement for a period" primary={false} resetOnSuccess={false}>
              <input type="hidden" name="project_id" value={id} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <label className="flex items-center gap-1.5">From <input type="date" name="period_start" required defaultValue={firstOfMonth} className="input" /></label>
                <label className="flex items-center gap-1.5">to <input type="date" name="period_end" required defaultValue={endOfMonth} className="input" /></label>
                <span>Or a statement for a whole period (retainers, day rates by person): day rates with people named are filled from their approved days; others start at resources × working days.</span>
              </div>
            </ActionForm>
          </div>
        ) : null}
        {statements?.length ? (
          <ActionForm action={createInvoice} submit="Create invoice in Zoho for the ticked statements" resetOnSuccess={false} className="gap-0 [&>div:last-child]:p-3">
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="row row-head grid-cols-[28px_minmax(0,1fr)_170px_140px_minmax(0,1fr)]"><span /><span>Period</span><span>Status</span><span className="text-right">Subtotal</span><span>Invoice</span></div>
                {statements.map((s) => {
                  const subtotal = s.statement_lines.reduce((a, l) => a + Number(l.amount ?? 0), 0)
                  const invoiceable = s.status === 'approved' && !s.zoho_invoice_number
                  return (
                    <div key={s.id} className="row grid-cols-[28px_minmax(0,1fr)_170px_140px_minmax(0,1fr)] hover:bg-head">
                      <span>{invoiceable ? <input type="checkbox" name="statement" value={s.id} aria-label={`Invoice ${period(s.period_start, s.period_end)}`} /> : null}</span>
                      <Link href={`/projects/${id}/billing/${s.id}`} className="font-medium text-ink no-underline hover:underline">{period(s.period_start, s.period_end)}</Link>
                      <span><StatementStatus status={s.status} /></span>
                      <span className="text-right font-mono text-xs">{money(subtotal, s.rate_cards?.currency ?? 'INR', { exact: true })}</span>
                      <span className="truncate text-xs">{s.zoho_invoice_number ? <span className="font-mono">Draft {s.zoho_invoice_number}</span>
                        : s.invoice_error ? <span className="text-crit-ink">{s.invoice_error}</span> : invoiceable ? <span className="text-muted">Ready to invoice</span> : <span className="text-muted">–</span>}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </ActionForm>
        ) : <Empty title="No statements yet">{live ? 'Create one for the period you want to bill.' : 'They start once the rate card is approved.'}</Empty>}
      </Card>
    </div>
  )
}
