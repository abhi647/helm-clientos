import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  addRateCardLine, createStatement, discardRateCard, removeRateCardLine, saveRateCard, startRateCard, submitRateCard, updateRateCardLine,
} from '@/app/_actions/billing'
import { KIND_LABEL, KIND_UNIT, RateCardStatus, RateLines, StatementStatus, period } from '@/components/billing'
import { ActionButton, ActionForm } from '@/components/forms'
import { Card, Empty, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { money, relativeTime } from '@/lib/format'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Billing' }

const KINDS = Object.keys(KIND_LABEL) as Enums<'billing_kind'>[]

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  )
}

function LineFields({ line }: { line?: { kind: Enums<'billing_kind'>; label: string; unit: string; rate: number; planned_quantity: number | null; description: string; zoho_item_id: string | null } }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-[180px_minmax(0,1fr)_110px_120px_110px]">
      <Field label="Billing model">
        <select name="kind" aria-label="Billing model" defaultValue={line?.kind ?? 'day_rate'} className="input">
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="What is billed">
        <input name="label" aria-label="Role, delivery or unit" required defaultValue={line?.label} placeholder="e.g. Data engineer" className="input" />
      </Field>
      <Field label="Charged per" hint="Set by the model, except per unit">
        <input name="unit" aria-label="Unit" required defaultValue={line?.unit ?? 'day'} placeholder="day, month, dashboard…" className="input" />
      </Field>
      <Field label="Rate">
        <input name="rate" aria-label="Rate" required inputMode="decimal" defaultValue={line?.rate} placeholder="e.g. 25000" className="input font-mono" />
      </Field>
      <Field label="Planned qty" hint="Resources, or units">
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
  const invoiceByNumber = new Map((invoices ?? []).map((i) => [i.number, i]))
  if (!project) notFound()
  const live = cards?.find((c) => c.status === 'approved')
  const open = cards?.find((c) => ['draft', 'pending', 'changes_requested'].includes(c.status))
  const editable = open && ['draft', 'changes_requested'].includes(open.status)
  const sortLines = <T extends { position: number }>(l: T[]) => [...l].sort((a, b) => a.position - b.position)
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
                <div className="grid grid-cols-2 gap-2 md:grid-cols-[110px_200px_minmax(0,1fr)]">
                  <input name="currency" aria-label="Currency" defaultValue={open.currency} className="input font-mono uppercase" maxLength={3} />
                  <input name="po_number" aria-label="PO number" defaultValue={open.po_number ?? ''} placeholder="Customer PO number" className="input font-mono" />
                  <input name="notes" aria-label="Notes for the customer" defaultValue={open.notes} placeholder="Notes for the customer (payment terms, what is included)" className="input col-span-2 md:col-span-1" />
                </div>
              </ActionForm>
              <div className="flex flex-col gap-3">
                {sortLines(open.rate_card_lines).map((l) => (
                  <div key={l.id} className="rounded-md border border-line-soft p-2.5">
                    <ActionForm action={updateRateCardLine} submit="Save line" resetOnSuccess={false} primary={false}>
                      <input type="hidden" name="line_id" value={l.id} />
                      <LineFields line={l} />
                    </ActionForm>
                    <div className="mt-1"><ActionButton run={removeRateCardLine.bind(null, l.id)} className="btn-ghost text-xs" confirm={`Remove "${l.label}"?`}>Remove line</ActionButton></div>
                  </div>
                ))}
                <div className="rounded-md border border-dashed border-line p-2.5">
                  <p className="label mt-0 mb-2">Add a line</p>
                  <ActionForm action={addRateCardLine} submit="Add line">
                    <input type="hidden" name="card_id" value={open.id} />
                    <LineFields />
                    <p className="m-0 text-xs text-muted">
                      Day rate: planned quantity = number of resources ({KIND_UNIT.day_rate}s are filled in each period).
                      Per unit: planned units. Per delivery and retainer: leave it empty.
                    </p>
                  </ActionForm>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                <ActionButton run={submitRateCard.bind(null, open.id)} primary confirm="Send these rates to the customer for approval? They can't be edited while the customer reviews them.">
                  Send to customer for approval
                </ActionButton>
                {open.status === 'draft' ? <ActionButton run={discardRateCard.bind(null, open.id)} className="btn-ghost" confirm="Discard this draft rate card?">Discard draft</ActionButton> : null}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto"><RateLines lines={sortLines(open.rate_card_lines)} currency={open.currency} /></div>
          )}
        </Card>
      ) : null}

      {/* ------------------------------------------------ the approved rates */}
      <Card flush title={live ? <span className="flex items-center gap-2">Approved rates v{live.version} <RateCardStatus status="approved" /></span> : 'Rate card'}
        extra={live ? <span className="font-mono">{live.currency}{live.po_number ? ` · PO ${live.po_number}` : ''}</span> : undefined}>
        {live ? (
          <>
            <div className="overflow-x-auto"><RateLines lines={sortLines(live.rate_card_lines)} currency={live.currency} /></div>
            {live.notes ? <p className="m-0 border-t border-line-soft px-3 py-2 text-xs text-muted">{live.notes}</p> : null}
            {!open ? <div className="border-t border-line-soft p-3"><ActionButton run={startRateCard.bind(null, id)}>Revise rates</ActionButton></div> : null}
          </>
        ) : !open ? (
          <Empty title="No rate card yet">
            <span className="flex flex-col items-center gap-2">Set the rates from the signed contract: day rates per resource, per delivery, per unit or a monthly retainer, in any mix.
              <ActionButton run={startRateCard.bind(null, id)} primary>Start the rate card</ActionButton></span>
          </Empty>
        ) : <Empty title="Not approved yet">Statements can be prepared once the customer approves the rate card.</Empty>}
      </Card>

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
      <Card flush title="Statements" extra="Approved by the customer, then a draft invoice in Zoho">
        {live ? (
          <div className="border-b border-line-soft p-3">
            <ActionForm action={createStatement} submit="New statement" resetOnSuccess={false}>
              <input type="hidden" name="project_id" value={id} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <label className="flex items-center gap-1.5">From <input type="date" name="period_start" required defaultValue={firstOfMonth} className="input" /></label>
                <label className="flex items-center gap-1.5">to <input type="date" name="period_end" required defaultValue={endOfMonth} className="input" /></label>
                <span>Day rates start at resources × working days; retainers at 1 month.</span>
              </div>
            </ActionForm>
          </div>
        ) : null}
        {statements?.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_170px_140px_minmax(0,1fr)]"><span>Period</span><span>Status</span><span className="text-right">Subtotal</span><span>Zoho</span></div>
              {statements.map((s) => {
                const subtotal = s.statement_lines.reduce((a, l) => a + Number(l.amount ?? 0), 0)
                return (
                  <Link key={s.id} href={`/projects/${id}/billing/${s.id}`} className="row grid-cols-[minmax(0,1fr)_170px_140px_minmax(0,1fr)] text-ink no-underline hover:bg-head">
                    <span className="font-medium">{period(s.period_start, s.period_end)}</span>
                    <span><StatementStatus status={s.status} /></span>
                    <span className="text-right font-mono text-xs">{money(subtotal, s.rate_cards?.currency ?? 'INR', { exact: true })}</span>
                    <span className="truncate text-xs">{s.zoho_invoice_number ? <span className="font-mono">Draft {s.zoho_invoice_number}</span>
                      : s.invoice_error ? <span className="text-crit-ink">{s.invoice_error}</span> : <span className="text-muted">–</span>}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ) : <Empty title="No statements yet">{live ? 'Create one for the period you want to bill.' : 'They start once the rate card is approved.'}</Empty>}
      </Card>
    </div>
  )
}
