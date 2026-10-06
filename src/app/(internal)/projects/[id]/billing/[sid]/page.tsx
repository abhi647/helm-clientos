import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteStatement, retryZohoInvoice, saveStatement, submitStatement } from '@/app/_actions/billing'
import { KIND_LABEL, StatementLines, StatementStatus, period, plural } from '@/components/billing'
import { ActionButton, ActionForm } from '@/components/forms'
import { Card } from '@/components/ui'
import { money, relativeTime } from '@/lib/format'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Statement' }

/** One billing period (admin, CEO, finance): quantities on the approved rates, sent to the customer, then a draft invoice in Zoho. */
export default async function StatementPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params
  const me = await requireStaff()
  if (!canSeeFinance(me)) notFound()
  const supabase = await createClient()
  const { data: st } = await supabase.from('billing_statements')
    .select('*, rate_cards(currency, po_number, version), statement_lines(*), decider:profiles!billing_statements_decided_by_fkey(full_name)')
    .eq('id', sid).eq('project_id', id).maybeSingle()
  if (!st) notFound()
  // hours the team logged on this project's tasks in the period: the evidence for day-rate quantities
  const { data: time } = await supabase.from('time_entries')
    .select('hours, billable, user:profiles!time_entries_user_id_fkey(full_name), tasks!inner(project_id)')
    .eq('tasks.project_id', id).gte('worked_on', st.period_start).lte('worked_on', st.period_end)
  const byPerson = new Map<string, { hours: number; billable: number }>()
  for (const t of time ?? []) {
    const name = t.user?.full_name ?? 'Unknown'
    const row = byPerson.get(name) ?? { hours: 0, billable: 0 }
    row.hours += Number(t.hours)
    if (t.billable) row.billable += Number(t.hours)
    byPerson.set(name, row)
  }
  const currency = st.rate_cards?.currency ?? 'INR'
  const lines = [...st.statement_lines].sort((a, b) => a.position - b.position)
  const editable = ['draft', 'changes_requested'].includes(st.status)

  return (
    <div className="flex max-w-[1000px] flex-col gap-3 p-4">
      <Link href={`/projects/${id}/billing`} className="text-xs text-muted no-underline hover:text-ink">← Billing</Link>
      <Card title={<span className="flex items-center gap-2">Statement · {period(st.period_start, st.period_end)} <StatementStatus status={st.status} /></span>}
        extra={`Rates v${st.rate_cards?.version} · ${currency}${st.rate_cards?.po_number ? ` · PO ${st.rate_cards.po_number}` : ''}`}>
        {st.status === 'changes_requested' && st.decision_note ? (
          <p role="alert" className="mt-0 mb-3 rounded-md bg-warn-bg p-2.5 text-xs text-warn-ink"><b>The customer asked for changes:</b> {st.decision_note}</p>
        ) : null}
        {editable ? (
          <div className="flex flex-col gap-3">
            <ActionForm action={saveStatement} submit="Save" resetOnSuccess={false} primary={false}>
              <input type="hidden" name="statement_id" value={st.id} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <label className="flex items-center gap-1.5">From <input type="date" name="period_start" required defaultValue={st.period_start} className="input" /></label>
                <label className="flex items-center gap-1.5">to <input type="date" name="period_end" required defaultValue={st.period_end} className="input" /></label>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="row row-head grid-cols-[minmax(0,1fr)_120px_120px_minmax(0,1fr)]"><span>Item</span><span className="text-right">Rate</span><span>Quantity</span><span>Note for the customer</span></div>
                  {lines.map((l) => (
                    <div key={l.id} className="row grid-cols-[minmax(0,1fr)_120px_120px_minmax(0,1fr)] py-1">
                      <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{l.label}</span><span className="text-xs text-muted">{KIND_LABEL[l.kind]}</span></span>
                      <span className="text-right font-mono text-xs">{money(l.rate, currency, { exact: true })} <span className="text-muted">/ {l.unit}</span></span>
                      <label className="flex items-center gap-1.5">
                        <input name={`q_${l.id}`} aria-label={`Quantity for ${l.label}`} inputMode="decimal" defaultValue={Number(l.quantity)} className="input w-[72px] text-right font-mono" />
                        <span className="text-xs text-muted">{plural(l.unit)}</span>
                      </label>
                      <input name={`n_${l.id}`} aria-label={`Note for ${l.label}`} defaultValue={l.note} placeholder={l.kind === 'day_rate' ? 'e.g. 2 days leave' : l.kind === 'delivery' ? 'e.g. accepted 24 Sep' : ''} className="input" />
                    </div>
                  ))}
                </div>
              </div>
              <textarea name="note" aria-label="Note for the customer" rows={2} defaultValue={st.note} placeholder="Note for the customer (optional)" className="textarea" />
              <p className="m-0 text-xs text-muted">Rates are the approved ones and cannot be changed here. Save first, then send. Lines left at 0 are not billed.</p>
            </ActionForm>
            <div className="border-t border-line-soft pt-3 text-xs font-semibold">Preview</div>
            <div className="overflow-x-auto"><StatementLines lines={lines} currency={currency} /></div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
              <ActionButton run={submitStatement.bind(null, st.id)} primary confirm="Send this statement to the customer for approval? Save any changes first.">Send to customer for approval</ActionButton>
              {st.status === 'draft' ? <ActionButton run={deleteStatement.bind(null, st.id, id)} className="btn-ghost" confirm="Delete this draft statement?">Delete draft</ActionButton> : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto"><StatementLines lines={lines} currency={currency} /></div>
            {st.note ? <p className="m-0 text-xs text-muted">{st.note}</p> : null}
            <dl className="m-0 grid grid-cols-[150px_minmax(0,1fr)] gap-y-1.5 text-[13px]">
              {st.submitted_at ? <><dt className="text-muted">Sent</dt><dd className="m-0">{relativeTime(st.submitted_at)}</dd></> : null}
              {st.decided_at ? <><dt className="text-muted">Approved</dt><dd className="m-0">{relativeTime(st.decided_at)}{st.decider?.full_name ? ` by ${st.decider.full_name}` : ''}</dd></> : null}
              {st.zoho_invoice_number ? <><dt className="text-muted">Zoho</dt><dd className="m-0">Draft invoice <b className="font-mono">{st.zoho_invoice_number}</b>, waiting for Finance to review and send it in Zoho Books.</dd></> : null}
            </dl>
            {st.invoice_error ? <p role="alert" className="m-0 rounded-md bg-crit-bg p-2.5 text-xs text-crit-ink">{st.invoice_error}</p> : null}
            {st.status === 'approved' ? <div><ActionButton run={retryZohoInvoice.bind(null, st.id)} primary>{st.invoice_error ? 'Retry Zoho' : 'Create the draft invoice in Zoho'}</ActionButton></div> : null}
          </div>
        )}
      </Card>
      <Card flush title="Hours logged in this period" extra="From the team's time entries on this project">
        {byPerson.size ? (
          <div>
            <div className="row row-head grid-cols-[minmax(0,1fr)_120px_120px]"><span>Person</span><span className="text-right">Hours</span><span className="text-right">Billable</span></div>
            {[...byPerson.entries()].sort((a, b) => b[1].hours - a[1].hours).map(([name, h]) => (
              <div key={name} className="row grid-cols-[minmax(0,1fr)_120px_120px]">
                <span>{name}</span>
                <span className="text-right font-mono text-xs">{h.hours.toFixed(1)}</span>
                <span className="text-right font-mono text-xs">{h.billable.toFixed(1)}</span>
              </div>
            ))}
          </div>
        ) : <p className="m-0 p-3 text-xs text-muted">No time logged on this project between these dates.</p>}
      </Card>
    </div>
  )
}
