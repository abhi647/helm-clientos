import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HoursMeter, creditBalance } from '@/components/hours-credit'
import { Card, Empty, cn } from '@/components/ui'
import { hrs, shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { DataGrid } from '@/components/data-grid'
import { LinkTabs } from '@/components/link-tabs'

export const metadata: Metadata = { title: 'Hours' }

const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The customer's hours: what they have, what is used, and the work that used it (approved billable hours only). */
export default async function PortalHours({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireCustomer()
  const sp = await searchParams
  const supabase = await createClient()
  const [credit, { data: plan }, { data: topups }] = await Promise.all([
    creditBalance(me.customer_id!),
    supabase.from('credit_plans').select('kind, starts_on').maybeSingle(),
    supabase.from('credit_topups').select('id, hours, added_on, note').order('added_on', { ascending: false }).limit(50),
  ])
  if (!plan) notFound()

  // monthly plans read one month at a time; prepaid reads everything since the start
  const thisMonth = monthStart(new Date())
  const picked = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? monthStart(new Date(`${sp.month}-01T00:00:00Z`)) : thisMonth
  const month = picked > thisMonth ? thisMonth : picked
  const from = plan.kind === 'monthly' ? iso(month) : plan.starts_on
  const to = plan.kind === 'monthly' ? iso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0))) : iso(new Date())
  const { data: usage } = await supabase.rpc('credit_usage', { p_customer: me.customer_id!, p_from: from, p_to: to })
  const rows = usage ?? []
  const total = rows.reduce((s, r) => s + Number(r.hours), 0)
  const byProject = new Map<string, number>()
  for (const r of rows) byProject.set(r.project, (byProject.get(r.project) ?? 0) + Number(r.hours))
  const months: Date[] = []
  if (plan.kind === 'monthly') {
    const first = monthStart(new Date(`${plan.starts_on}T00:00:00Z`))
    for (let m = thisMonth; m >= first && months.length < 12; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1))) months.push(m)
  }
  const ym = (d: Date) => iso(d).slice(0, 7)

  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">Hours</h1>
      <Card title={plan.kind === 'monthly' ? 'This month' : 'Prepaid hours'}>
        {credit ? <HoursMeter b={credit} /> : <p className="m-0 text-xs text-muted-foreground">No hours added yet.</p>}
        <p className="mt-3 mb-0 text-xs text-muted-foreground">
          Hours count once your project manager approves the team&apos;s time. You are told at 75%, 90% and 100% used.
          Work carries on past 100%: hours over are billed at the agreed rate.
        </p>
      </Card>

      {months.length > 1 ? (
        <LinkTabs label="Months" value={ym(month)} items={months.map((m) => ({ value: ym(m), label: monthName(m), href: m.getTime() === thisMonth.getTime() ? '/portal/hours' : `/portal/hours?month=${ym(m)}` }))} />
      ) : null}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <Card flush title={plan.kind === 'monthly' ? `Work in ${monthName(month)}` : 'Work since the start'} extra={`${hrs(total)} approved`}>
          {rows.length ? (
            <DataGrid label="Approved hours" pageSize={25}
              columns={[
                { key: 'date', label: 'Date', sortable: true, className: 'w-[80px]' }, { key: 'project', label: 'Project', sortable: true },
                { key: 'work', label: 'Work', sortable: true }, { key: 'who', label: 'Who', sortable: true, className: 'w-[100px]' },
                { key: 'hours', label: 'Hours', sortable: true, align: 'right', className: 'w-[70px]' },
              ]}
              rows={rows.map((r, i) => ({
                id: String(i),
                values: { date: r.worked_on, project: r.project, work: r.work, who: r.person, hours: Number(r.hours) },
                cells: {
                  date: <span className="font-mono text-xs">{shortDate(r.worked_on)}</span>,
                  project: <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{r.project}</span>,
                  work: <span className={cn('block max-w-[320px] truncate', r.work === 'Internal work' && 'text-muted-foreground')}>{r.work}</span>,
                  who: <span className="block truncate text-xs">{r.person}</span>,
                  hours: <span className="font-mono text-xs">{+Number(r.hours).toFixed(2)}</span>,
                },
              }))} />
          ) : <Empty title="No approved hours yet">Hours show here once they are approved.</Empty>}
        </Card>
        <aside className="flex flex-col gap-3">
          {byProject.size ? (
            <Card title="By project">
              <div className="flex flex-col gap-2">
                {[...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([name, h]) => (
                  <div key={name} className="flex flex-col gap-1">
                    <span className="flex justify-between gap-2 text-[13px]"><span className="truncate">{name}</span><span className="font-mono text-xs">{hrs(h)}</span></span>
                    <span className="h-[6px] overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-info" style={{ width: `${total ? (100 * h) / total : 0}%` }} /></span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          {topups?.length ? (
            <Card title={plan.kind === 'prepaid' ? 'Hours bought' : 'Extra hours added'}>
              <div className="flex flex-col text-xs">
                {topups.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 py-1">
                    <span className="font-mono text-muted-foreground">{shortDate(t.added_on)}</span>
                    <span className="font-mono font-semibold">+{hrs(t.hours)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.note}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
