import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { decideRateCard, decideStatement } from '@/app/_actions/billing'
import { RateCardStatus, RateLines, StatementLines, StatementStatus, period } from '@/components/billing'
import { DecisionForm } from '@/components/forms'
import { Card, Empty, PageHeader } from '@/components/ui'
import { money, relativeTime } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Billing' }

/** For the customer's executives and invoice contacts: approve the rates once, then each period's statement. */
export default async function PortalBilling() {
  const me = await requireCustomer()
  if (me.customer_role !== 'customer_exec' && !me.can_view_invoices) notFound()
  const supabase = await createClient()
  const [{ data: cards }, { data: statements }] = await Promise.all([
    supabase.from('rate_cards').select('*, projects(name), rate_card_lines(*)').in('status', ['pending', 'approved']).order('submitted_at', { ascending: false }),
    supabase.from('billing_statements').select('*, projects(name), rate_cards(currency, po_number), statement_lines(*)').order('period_start', { ascending: false }),
  ])
  const sort = <T extends { position: number }>(l: T[]) => [...l].sort((a, b) => a.position - b.position)
  const pendingCards = (cards ?? []).filter((c) => c.status === 'pending')
  const pendingStatements = (statements ?? []).filter((s) => s.status === 'pending')
  const liveCards = (cards ?? []).filter((c) => c.status === 'approved')
  const history = (statements ?? []).filter((s) => s.status !== 'pending')
  const waiting = pendingCards.length + pendingStatements.length

  return (
    <>
      <PageHeader title="Billing" meta={<span className="text-xs text-muted">{waiting ? `${waiting} waiting for your approval` : 'Nothing waiting for you'}</span>} />
      <div className="flex max-w-[1000px] flex-col gap-3 p-4">
        {pendingCards.map((c) => (
          <Card key={c.id} title={<span className="flex items-center gap-2">Rates for {c.projects?.name} <RateCardStatus status={c.status} /></span>}
            extra={<span className="font-mono">{c.currency}{c.po_number ? ` · PO ${c.po_number}` : ''}{c.submitted_at ? ` · sent ${relativeTime(c.submitted_at)}` : ''}</span>}>
            <div className="overflow-x-auto"><RateLines lines={sort(c.rate_card_lines)} currency={c.currency} /></div>
            {c.notes ? <p className="mt-2 mb-0 text-xs text-muted">{c.notes}</p> : null}
            <p className="mt-3 mb-2 text-xs text-muted">Once approved, every statement for this project is billed at these rates. Tax is added on the invoice.</p>
            <DecisionForm action={decideRateCard} approvalId={c.id} idName="card_id" />
          </Card>
        ))}

        {pendingStatements.map((s) => {
          const currency = s.rate_cards?.currency ?? 'INR'
          return (
            <Card key={s.id} title={<span className="flex items-center gap-2">{s.projects?.name} · {period(s.period_start, s.period_end)} <StatementStatus status={s.status} /></span>}
              extra={s.submitted_at ? `Sent ${relativeTime(s.submitted_at)}` : undefined}>
              <div className="overflow-x-auto"><StatementLines lines={sort(s.statement_lines)} currency={currency} /></div>
              {s.note ? <p className="mt-2 mb-0 text-xs text-muted">{s.note}</p> : null}
              <p className="mt-3 mb-2 text-xs text-muted">After you approve, Seven Billion sends the invoice from Zoho Books{s.rate_cards?.po_number ? ` against PO ${s.rate_cards.po_number}` : ''}.</p>
              <DecisionForm action={decideStatement} approvalId={s.id} idName="statement_id" />
            </Card>
          )
        })}

        <Card flush title="Approved rates">
          {liveCards.length ? liveCards.map((c) => (
            <div key={c.id} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center gap-2 px-3 pt-2.5 text-[13px] font-semibold">{c.projects?.name}
                <span className="font-mono text-xs font-normal text-muted">v{c.version} · {c.currency}{c.po_number ? ` · PO ${c.po_number}` : ''}</span></div>
              <div className="overflow-x-auto"><RateLines lines={sort(c.rate_card_lines)} currency={c.currency} /></div>
            </div>
          )) : <Empty title="No approved rates yet" />}
        </Card>

        <Card flush title="Statements">
          {history.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="row row-head grid-cols-[minmax(0,1fr)_200px_170px_130px]"><span>Project</span><span>Period</span><span>Status</span><span className="text-right">Before tax</span></div>
                {history.map((s) => (
                  <div key={s.id} className="row grid-cols-[minmax(0,1fr)_200px_170px_130px]">
                    <span className="truncate">{s.projects?.name}</span>
                    <span className="text-xs">{period(s.period_start, s.period_end)}</span>
                    <span><StatementStatus status={s.status} /></span>
                    <span className="text-right font-mono text-xs">{money(s.statement_lines.reduce((a, l) => a + Number(l.amount ?? 0), 0), s.rate_cards?.currency ?? 'INR', { exact: true })}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <Empty title="No statements yet" />}
        </Card>
      </div>
    </>
  )
}
