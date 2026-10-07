import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { syncZohoNow } from '@/app/_actions/admin'
import { ActionButton } from '@/components/forms'
import { StatementStatus, period } from '@/components/billing'
import { PaymentsCard } from '@/components/payments'
import { UnbilledTime } from '@/components/time-billing'
import { Card, Chip, Empty, PageHeader, cn } from '@/components/ui'
import { daysFromToday, label, money, relativeTime, shortDate } from '@/lib/format'
import { canSeeCommercials, canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Finance' }

/** Invoices and payments come from Zoho Books (synced). Nothing financial is calculated or typed in this app. */
export default async function Finance() {
  const me = await requireStaff()
  if (!canSeeFinance(me)) notFound()
  const supabase = await createClient()
  const [{ data: invoices }, { data: commercials }, { data: statements }, { data: unbilled }] = await Promise.all([
    supabase.from('invoices').select('*, customers(name)').order('due_on', { ascending: true }),
    canSeeCommercials(me) ? supabase.from('project_commercials').select('*, projects(name, customers(name))') : Promise.resolve({ data: null }),
    // statements still moving: being prepared, with the customer, or approved but not yet a Zoho draft
    supabase.from('billing_statements').select('id, project_id, period_start, period_end, status, invoice_error, zoho_invoice_number, projects(name, customers(name))')
      .neq('status', 'invoiced').order('period_start', { ascending: false }).limit(50),
    supabase.rpc('unbilled_time', {}),
  ])
  const lastSync = invoices?.reduce<string | null>((a, i) => (!a || i.synced_at > a ? i.synced_at : a), null)
  return (
    <>
      <PageHeader title="Finance" meta={<span className="text-xs text-muted">Synced from Zoho Books{lastSync ? ` · last sync ${relativeTime(lastSync)}` : ''}</span>}
        actions={<ActionButton run={syncZohoNow}>Sync now</ActionButton>} />
      <div className="flex flex-col gap-3 p-4">
        <Card flush title="Invoices" className="overflow-x-auto">
          {invoices?.length ? (
            <div className="min-w-[760px]">
              <div className="row row-head grid-cols-[130px_minmax(0,1fr)_120px_120px_24px_90px_90px_110px]"><span>Invoice</span><span>Customer</span><span className="text-right">Total</span><span className="text-right">Balance</span><span /><span>Issued</span><span>Due</span><span>Status</span></div>
              {invoices.map((i) => {
                const late = -(daysFromToday(i.due_on) ?? 0)
                const overdue = i.status !== 'paid' && late > 0
                return (
                  <div key={i.id} className="row grid-cols-[130px_minmax(0,1fr)_120px_120px_24px_90px_90px_110px]">
                    <span className="truncate font-mono text-xs" title={i.number}>{i.number}</span>
                    <span className="truncate">{i.customers?.name}</span>
                    <span className="text-right font-mono text-xs">{money(i.total, i.currency)}</span>
                    <span className="text-right font-mono text-xs">{money(i.balance, i.currency)}</span><span />
                    <span className="font-mono text-xs text-muted">{shortDate(i.issued_on)}</span>
                    <span className={cn('font-mono text-xs', overdue && 'font-semibold text-crit-ink')}>{shortDate(i.due_on)}</span>
                    <span>{overdue ? <Chip tone="crit">{late}d overdue</Chip> : <Chip tone={i.status === 'paid' ? 'good' : 'info'}>{label(i.status)}</Chip>}</span>
                  </div>
                )
              })}
            </div>
          ) : <Empty title="No invoices yet">They appear after the first Zoho Books sync.</Empty>}
        </Card>
        <UnbilledTime rows={unbilled ?? []} showProject />
        <Card flush title="Billing statements" extra="Not yet in Zoho" className="overflow-x-auto">
          {statements?.length ? <div className="min-w-[640px]">{statements.map((st) => (
            <Link key={st.id} href={`/projects/${st.project_id}/billing/${st.id}`} className="row grid-cols-[minmax(0,1fr)_200px_170px_minmax(0,1fr)] text-ink no-underline hover:bg-head">
              <span className="truncate">{st.projects?.customers?.name} · {st.projects?.name}</span>
              <span className="text-xs">{period(st.period_start, st.period_end)}</span>
              <span><StatementStatus status={st.status} /></span>
              <span className="truncate text-xs text-crit-ink">{st.invoice_error ?? ''}</span>
            </Link>
          ))}</div> : <Empty title="Nothing waiting">Statements appear here from the project Billing tabs until they become Zoho invoices.</Empty>}
        </Card>
        <PaymentsCard staff />
        {commercials ? (
          <Card flush title="Commercials" extra="Internal · CEO, finance and admin" className="overflow-x-auto">
            {commercials.length ? <div className="min-w-[640px]">{commercials.map((c) => (
              <div key={c.project_id} className="row grid-cols-[minmax(0,1fr)_220px_140px_120px]">
                <span className="truncate">{c.projects?.customers?.name} · {c.projects?.name}</span>
                <span className="truncate text-xs">{c.billing_model ?? '–'}</span>
                <span className="text-right font-mono text-xs">{money(c.contract_value, c.currency)}</span>
                <span className="font-mono text-xs text-muted">{c.po_number ?? 'No PO'}</span>
              </div>
            ))}</div> : <Empty title="No commercials recorded" />}
          </Card>
        ) : null}
      </div>
    </>
  )
}
