import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { syncZohoNow } from '@/app/_actions/admin'
import { ActionButton } from '@/components/forms'
import { StatementStatus, period } from '@/components/billing'
import { PaymentsCard } from '@/components/payments'
import { BillingRun } from '@/components/billing-run'
import { UnbilledTime } from '@/components/time-billing'
import { Card, Chip, Empty, PageHeader, cn } from '@/components/ui'
import { daysFromToday, label, money, relativeTime, shortDate } from '@/lib/format'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Finance' }

const MODEL_NAME: Record<string, string> = { time_materials: 'T&M', dedicated: 'Dedicated', fixed_price: 'Fixed fee', retainer: 'Retainer' }

/** Invoices and payments come from Zoho Books (synced). Nothing financial is calculated or typed in this app. */
export default async function Finance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  const me = await requireStaff()
  if (!canSeeFinance(me)) notFound()
  const supabase = await createClient()
  const [{ data: invoices }, { data: cards }, { data: statements }, { data: unbilled }] = await Promise.all([
    supabase.from('invoices').select('*, customers(name)').order('due_on', { ascending: true }),
    // every project's agreement, from its billing set-up (latest card, the approved one first)
    supabase.from('rate_cards').select('project_id, status, version, currency, contract_value, po_number, projects!inner(name, status, billing_model, customers(name)), billing_statements(status, statement_lines(amount))').eq('projects.status', 'active').in('status', ['approved', 'draft', 'pending', 'changes_requested']).order('version', { ascending: false }),
    // statements still moving: being prepared, with the customer, or approved but not yet a Zoho draft
    supabase.from('billing_statements').select('id, project_id, period_start, period_end, status, invoice_error, zoho_invoice_number, projects(name, customers(name))')
      .neq('status', 'invoiced').order('period_start', { ascending: false }).limit(50),
    supabase.rpc('unbilled_time', {}),
  ])
  // one row per project: its approved card, else the one being agreed
  const seen = new Set<string>()
  const contracts = (cards ?? []).sort((a, b) => Number(b.status === 'approved') - Number(a.status === 'approved')).filter((c) => !seen.has(c.project_id) && seen.add(c.project_id))
    .map((c) => ({ ...c, billed: c.billing_statements.filter((s) => ['approved', 'invoiced'].includes(s.status)).reduce((a, s) => a + s.statement_lines.reduce((b, l) => b + Number(l.amount ?? 0), 0), 0) }))
  const lastSync = invoices?.reduce<string | null>((a, i) => (!a || i.synced_at > a ? i.synced_at : a), null)
  return (
    <>
      <PageHeader title="Finance" meta={<span className="text-xs text-muted-foreground">Synced from Zoho Books{lastSync ? ` · last sync ${relativeTime(lastSync)}` : ''}</span>}
        actions={<><Link href="/finance/costs" className="btn">Cost rates</Link><ActionButton run={syncZohoNow}>Sync now</ActionButton></>} />
      <div className="flex flex-col gap-3 p-4">
        <BillingRun month={month} />
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
                    <span className="font-mono text-xs text-muted-foreground">{shortDate(i.issued_on)}</span>
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
        <Card flush title="Contracts" description="Active projects: the agreed value, what is billed and approved, and what is left" className="overflow-x-auto">
          {contracts.length ? <div className="min-w-[760px]">
            <div className="row row-head grid-cols-[minmax(0,1fr)_110px_140px_140px_140px_120px]"><span>Project</span><span>Model</span><span className="text-right">Contract</span><span className="text-right">Billed</span><span className="text-right">Left</span><span>PO</span></div>
            {contracts.map((c) => (
              <Link key={c.project_id} href={`/projects/${c.project_id}/billing`} className="row grid-cols-[minmax(0,1fr)_110px_140px_140px_140px_120px] text-ink no-underline hover:bg-head">
                <span className="truncate"><span className="text-muted-foreground">{c.projects.customers?.name} · </span>{c.projects.name}</span>
                <span className="text-xs">{MODEL_NAME[c.projects.billing_model ?? ''] ?? '–'}</span>
                <span className="tabular text-right text-xs">{c.contract_value != null ? money(Number(c.contract_value), c.currency) : <span className="text-muted-foreground">Not set</span>}</span>
                <span className="tabular text-right text-xs">{money(c.billed, c.currency)}</span>
                <span className={cn('tabular text-right text-xs', c.contract_value != null && c.billed > Number(c.contract_value) && 'font-semibold text-crit-ink')}>{c.contract_value != null ? money(Number(c.contract_value) - c.billed, c.currency) : '–'}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{c.po_number ?? 'No PO'}</span>
              </Link>
            ))}
          </div> : <Empty title="No billing set up yet" />}
        </Card>
      </div>
    </>
  )
}
