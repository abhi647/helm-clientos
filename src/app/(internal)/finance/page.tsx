import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { syncZohoNow } from '@/app/_actions/admin'
import { ActionButton } from '@/components/forms'
import { StatementStatus, period } from '@/components/billing'
import { PaymentsCard } from '@/components/payments'
import { BillingRun } from '@/components/billing-run'
import { UnbilledTime } from '@/components/time-billing'
import { DataGrid } from '@/components/data-grid'
import { btn, Card, Chip, cn, Empty, PageHeader, Stat } from '@/components/ui'
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
  // money still owed, by currency (Zoho keeps each customer in one)
  const open = (invoices ?? []).filter((i) => i.status !== 'paid' && Number(i.balance) > 0)
  const late = open.filter((i) => (daysFromToday(i.due_on) ?? 0) < 0)
  const byCurrency = (rows: typeof open) => Object.entries(rows.reduce<Record<string, number>>((a, i) => ({ ...a, [i.currency]: (a[i.currency] ?? 0) + Number(i.balance) }), {}))
    .map(([c, v]) => money(v, c)).join(' · ') || '0'
  const lastSync = invoices?.reduce<string | null>((a, i) => (!a || i.synced_at > a ? i.synced_at : a), null)
  return (
    <>
      <PageHeader title="Finance" meta={<span className="text-xs text-muted-foreground">Synced from Zoho Books{lastSync ? ` · last sync ${relativeTime(lastSync)}` : ''}</span>}
        actions={<><Link href="/finance/costs" className={btn('outline')}>Cost rates</Link><ActionButton run={syncZohoNow}>Sync now</ActionButton></>} />
      <div className="flex flex-col gap-3 p-4">
        <BillingRun month={month} />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="Outstanding" value={byCurrency(open)} sub={`${open.length} invoices`} tone={open.length ? 'info' : 'good'} />
          <Stat label="Overdue" value={byCurrency(late)} sub={`${late.length} invoices`} tone={late.length ? 'crit' : 'good'} />
          <Stat label="Statements in progress" value={(statements ?? []).length} sub="not yet in Zoho" tone={(statements ?? []).length ? 'warn' : 'neutral'} />
          <Stat label="Active contracts" value={contracts.length} sub={`${contracts.filter((c) => c.contract_value == null).length} without a value`} />
        </div>
        <Card flush title="Invoices" description="From Zoho Books">
          <DataGrid search searchLabel="Search invoices" pageSize={15} label="Invoices" initialSort={{ key: 'due', direction: 1 }}
            empty={<Empty title="No invoices yet">They appear after the first Zoho Books sync.</Empty>}
            columns={[
              { key: 'number', label: 'Invoice', sortable: true, className: 'w-[130px]' },
              { key: 'customer', label: 'Customer', sortable: true },
              { key: 'total', label: 'Total', sortable: true, align: 'right', className: 'w-[120px]' },
              { key: 'balance', label: 'Balance', sortable: true, align: 'right', className: 'w-[120px]' },
              { key: 'issued', label: 'Issued', sortable: true, className: 'w-[90px]' },
              { key: 'due', label: 'Due', sortable: true, className: 'w-[90px]' },
              { key: 'status', label: 'Status', sortable: true, className: 'w-[120px]' },
            ]}
            rows={(invoices ?? []).map((i) => {
              const daysLate = -(daysFromToday(i.due_on) ?? 0)
              const overdue = i.status !== 'paid' && daysLate > 0
              return {
                id: i.id,
                values: { number: i.number, customer: i.customers?.name, total: Number(i.total), balance: Number(i.balance), issued: i.issued_on, due: i.due_on, status: overdue ? `0${daysLate}` : i.status },
                cells: {
                  number: <span className="font-mono text-xs" title={i.number}>{i.number}</span>,
                  customer: <span className="block truncate">{i.customers?.name}</span>,
                  total: <span className="tabular font-mono text-xs">{money(i.total, i.currency)}</span>,
                  balance: <span className="tabular font-mono text-xs">{money(i.balance, i.currency)}</span>,
                  issued: <span className="font-mono text-xs text-muted-foreground">{shortDate(i.issued_on)}</span>,
                  due: <span className={cn('font-mono text-xs', overdue && 'font-semibold text-crit-ink')}>{shortDate(i.due_on)}</span>,
                  status: overdue ? <Chip tone="crit" dot>{daysLate}d overdue</Chip> : <Chip tone={i.status === 'paid' ? 'good' : 'info'} dot>{label(i.status)}</Chip>,
                },
              }
            })} />
        </Card>
        <UnbilledTime rows={unbilled ?? []} showProject />
        <Card flush title="Billing statements" description="Being prepared, with the customer, or approved and not yet in Zoho">
          <DataGrid label="Billing statements" pageSize={15}
            empty={<Empty title="Nothing waiting">Statements appear here from the project Billing tabs until they become Zoho sales orders.</Empty>}
            columns={[
              { key: 'project', label: 'Project', sortable: true },
              { key: 'period', label: 'Period', sortable: true, className: 'w-[200px]' },
              { key: 'status', label: 'Status', sortable: true, className: 'w-[160px]' },
              { key: 'error', label: 'Zoho', className: 'w-[260px]' },
            ]}
            rows={(statements ?? []).map((st) => ({
              id: st.id, href: `/projects/${st.project_id}/billing/${st.id}`,
              values: { project: `${st.projects?.customers?.name} ${st.projects?.name}`, period: st.period_start, status: st.status },
              cells: {
                project: <Link href={`/projects/${st.project_id}/billing/${st.id}`} className="block truncate text-foreground no-underline hover:underline"><span className="text-muted-foreground">{st.projects?.customers?.name} · </span>{st.projects?.name}</Link>,
                period: <span className="text-xs">{period(st.period_start, st.period_end)}</span>,
                status: <StatementStatus status={st.status} />,
                error: <span className="block max-w-[260px] truncate text-xs text-crit-ink" title={st.invoice_error ?? ''}>{st.invoice_error ?? ''}</span>,
              },
            }))} />
        </Card>
        <PaymentsCard staff />
        <Card flush title="Contracts" description="Active projects: the agreed value, what is billed and approved, and what is left">
          <DataGrid label="Contracts" search searchLabel="Search contracts"
            empty={<Empty title="No billing set up yet" />}
            columns={[
              { key: 'project', label: 'Project', sortable: true },
              { key: 'model', label: 'Model', sortable: true, className: 'w-[110px]' },
              { key: 'contract', label: 'Contract', sortable: true, align: 'right', className: 'w-[140px]' },
              { key: 'billed', label: 'Billed', sortable: true, align: 'right', className: 'w-[140px]' },
              { key: 'left', label: 'Left', sortable: true, align: 'right', className: 'w-[140px]' },
              { key: 'po', label: 'PO', sortable: true, className: 'w-[120px]' },
            ]}
            rows={contracts.map((c) => {
              const value = c.contract_value != null ? Number(c.contract_value) : null
              return {
                id: c.project_id, href: `/projects/${c.project_id}/billing`,
                values: { project: `${c.projects.customers?.name} ${c.projects.name}`, model: MODEL_NAME[c.projects.billing_model ?? ''], contract: value, billed: c.billed, left: value != null ? value - c.billed : null, po: c.po_number },
                cells: {
                  project: <Link href={`/projects/${c.project_id}/billing`} className="block truncate text-foreground no-underline hover:underline"><span className="text-muted-foreground">{c.projects.customers?.name} · </span>{c.projects.name}</Link>,
                  model: <span className="text-xs">{MODEL_NAME[c.projects.billing_model ?? ''] ?? '–'}</span>,
                  contract: <span className="tabular text-xs">{value != null ? money(value, c.currency) : <span className="text-muted-foreground">Not set</span>}</span>,
                  billed: <span className="tabular text-xs">{money(c.billed, c.currency)}</span>,
                  left: <span className={cn('tabular text-xs', value != null && c.billed > value && 'font-semibold text-crit-ink')}>{value != null ? money(value - c.billed, c.currency) : '–'}</span>,
                  po: <span className="block truncate font-mono text-xs text-muted-foreground">{c.po_number ?? 'No PO'}</span>,
                },
              }
            })} />
        </Card>
      </div>
    </>
  )
}
