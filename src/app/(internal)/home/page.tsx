import type { Metadata } from 'next'
import Link from 'next/link'
import { createEngagement, dismissEngagement } from '@/app/_actions/admin'
import { DataGrid } from '@/components/data-grid'
import { ActionButton, ActionForm } from '@/components/forms'
import { ActivityFeed } from '@/components/overtrue/activity-feed'
import { Greeting } from '@/components/shell/greeting'
import { HeartPulse, Hourglass, Receipt, Siren, Stamp, TriangleAlert } from 'lucide-react'
import { Card, Chip, Empty, Health, Stat, cn } from '@/components/ui'
import { ActivityCalendar, HealthDonut, LoadMatrix, StageFunnel, Ticks, WeeklyMetrics, WeeklyTrend } from '@/components/viz'
import { initials, isOverdue, isoDaysAgo, label, relativeTime, shortDate } from '@/lib/format'
import { loadPortfolio } from '@/lib/portfolio'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { DirectoryRow } from '@/lib/views'
import { TEMPLATES } from '@/lib/templates'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'Home' }

const WEEKLY_CAPACITY_DAYS = 5

export default async function Home() {
  const me = await requireStaff()
  const supabase = await createClient()
  // weekly figures run Monday to Sunday; the last 12 weeks, this one included
  const monday = new Date()
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const since12 = new Date(monday.getTime() - 11 * 7 * 86_400_000).toISOString()
  const [{ rows, exceptions, counts }, setups, staff, load, events, pending, recent, taskFlow, logged, reqs] = await Promise.all([
    loadPortfolio(),
    supabase.from('engagement_setups').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'internal_role'>[], { merge: false }>(),
    supabase.from('tasks').select('assignee_id, due_date, task_estimates(estimate, unit)').neq('status', 'done').not('assignee_id', 'is', null),
    supabase.from('activity').select('created_at').gte('created_at', new Date(Date.now() - 182 * 86_400_000).toISOString()).limit(20_000),
    supabase.from('approvals').select('id, title, due_date, request_id, customers(name), approver:profiles!approvals_approver_id_fkey(full_name)').eq('status', 'pending').order('due_date', { ascending: true, nullsFirst: false }).limit(8),
    supabase.from('activity').select('id, summary, created_at, project_id, actor:profiles!activity_actor_id_fkey(full_name), projects(name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('tasks').select('created_at, completed_at').or(`created_at.gte.${since12},completed_at.gte.${since12}`).limit(20_000),
    supabase.from('time_entries').select('worked_on, hours').gte('worked_on', since12.slice(0, 10)).limit(20_000),
    supabase.from('requests').select('status, created_at, updated_at').limit(5_000),
  ])

  // planned days per person for the next four weeks (from estimates in days; billed-unit estimates aren't time)
  const weekStart = new Date()
  weekStart.setUTCHours(0, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))
  const weeks = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Date(weekStart.getTime() + i * 7 * 86_400_000))
  const people = (staff.data ?? []).filter((p) => ['pm', 'consultant'].includes(p.internal_role ?? ''))
  const hours = new Map<string, number[]>(people.map((p) => [p.id, weeks.map(() => 0)]))
  for (const t of load.data ?? []) {
    if (!t.due_date || !hours.has(t.assignee_id!)) continue
    const w = Math.floor((Date.parse(`${t.due_date}T00:00:00Z`) - weekStart.getTime()) / (7 * 86_400_000))
    const est = t.task_estimates?.unit === 'day' ? Number(t.task_estimates.estimate ?? 0) : 0
    if (w >= 0 && w < weeks.length) hours.get(t.assignee_id!)![w]! += est
  }
  const crit = exceptions.filter((e) => e.severity === 'crit').length
  const perDay = new Map<string, number>()
  for (const e of events.data ?? []) { const d = e.created_at.slice(0, 10); perDay.set(d, (perDay.get(d) ?? 0) + 1) }
  const activity = [...perDay].map(([date, value]) => ({ date, value }))
  const byHealth = (h: string) => rows.filter((r) => r.health === h).length
  const weekLabel = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const weekIndex = (iso: string | null) => iso ? Math.floor((Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) - Date.parse(since12)) / (7 * 86_400_000)) : -1
  const perWeek = <T,>(list: T[], at: (x: T) => string | null, amount: (x: T) => number = () => 1) => {
    const out = Array.from({ length: 12 }, () => 0)
    for (const x of list) { const w = weekIndex(at(x)); if (w >= 0 && w < 12) out[w]! += amount(x) }
    return out
  }
  const created = perWeek(taskFlow.data ?? [], (t) => t.created_at)
  const completed = perWeek(taskFlow.data ?? [], (t) => t.completed_at)
  const hoursLogged = perWeek(logged.data ?? [], (e) => e.worked_on, (e) => Number(e.hours))
  const raised = perWeek(reqs.data ?? [], (r) => r.created_at)
  const touched = perWeek(events.data ?? [], (e) => e.created_at)
  const trend = created.map((c, i) => ({ week: weekLabel(new Date(Date.parse(since12) + i * 7 * 86_400_000)), Created: c, Completed: completed[i]! }))
  const STAGES = ['submitted', 'under_review', 'clarification', 'estimated', 'approved', 'scheduled', 'in_development', 'uat', 'delivered'] as const
  const recentCutoff = isoDaysAgo(90)
  const funnel = STAGES.map((st) => ({ name: label(st), value: (reqs.data ?? []).filter((r) => r.status === st && (st !== 'delivered' || (r.updated_at ?? r.created_at) >= recentCutoff)).length }))
  const first = me.full_name.split(' ')[0] ?? me.full_name

  return (
    <div className="flex flex-col gap-3 p-4">
      <Greeting name={first}
        lines={{
          morning: exceptions.length ? `${exceptions.length} things need a decision today. Everything else is moving.` : 'Nothing needs you right now. Everything is on track.',
          afternoon: `Afternoon check-in: ${exceptions.length} open exceptions, ${crit} of them critical.`,
          evening: crit ? `Before you sign off, the ${crit} critical items are at the top. The rest can wait.` : 'A quiet evening. Nothing critical is open.',
          night: 'Working late? Only the critical items matter now. Everything else is on track.',
        }} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Projects healthy" value={`${counts.healthy}/${rows.length}`} sub={counts.atRisk ? `${counts.atRisk} at risk` : undefined} href="/projects" icon={<HeartPulse />}
          pct={rows.length ? (100 * counts.healthy) / rows.length : 0} tone={counts.atRisk ? 'crit' : counts.healthy < rows.length ? 'warn' : 'good'} />
        <Stat label="Needs attention" value={exceptions.length} sub={crit ? `${crit} critical` : undefined} icon={<TriangleAlert />} tone={crit ? 'crit' : exceptions.length ? 'warn' : 'good'} />
        <Stat label="Critical requests" value={counts.critical} href="/requests" icon={<Siren />} tone={counts.critical ? 'crit' : 'good'} />
        <Stat label="Customer overdue" value={counts.customerOverdue} sub="dependencies" icon={<Hourglass />} tone={counts.customerOverdue ? 'warn' : 'good'} />
        <Stat label="Invoices > 30 days" value={counts.invoices30} icon={<Receipt />} tone={counts.invoices30 ? 'crit' : 'good'} />
        <Stat label="Approvals pending" value={counts.approvals} sub="with customers" href="/requests" icon={<Stamp />} tone={counts.approvals ? 'info' : 'neutral'} />
      </div>

      {canManage(me) && setups.data?.length ? (
        <Card title="Set up new engagement" extra="Closed Won in HubSpot">
          <div className="flex flex-col gap-3">
            {setups.data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-end gap-3 rounded-md border border-line-soft p-3">
                <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{s.company_name}</span>
                  <span className="text-xs text-muted-foreground">Deal: {s.deal_name}{s.service ? ` · ${s.service}` : ''}</span>
                </div>
                <ActionForm action={createEngagement} submit="Create project" className="flex-row flex-wrap items-end">
                  <input type="hidden" name="setup_id" value={s.id} />
                  <label className="flex flex-col gap-1 text-xs"><span className="label">Template</span>
                    <NativeSelect size="sm" name="template_key" defaultValue={s.suggested_template}>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</NativeSelect></label>
                  <label className="flex flex-col gap-1 text-xs"><span className="label">Start</span>
                    <Input type="date" name="start_date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-auto" /></label>
                  <label className="flex flex-col gap-1 text-xs"><span className="label">PM</span>
                    <NativeSelect size="sm" name="pm_id" defaultValue={me.id}>{(staff.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</NativeSelect></label>
                </ActionForm>
                <ActionButton run={dismissEngagement.bind(null, s.id)} variant="ghost">Dismiss</ActionButton>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
        <Card flush title={<span className="flex items-center gap-2">Needs attention <Chip tone={exceptions.length ? 'crit' : 'good'}>{exceptions.length}</Chip></span>} extra="Most severe first, then oldest">
          <DataGrid label="Needs attention"
            empty={<Empty title="Nothing needs attention">Every project is on track.</Empty>}
            columns={[
              { key: 'sev', label: <span className="sr-only">Severity</span>, className: 'w-[28px]' },
              { key: 'customer', label: 'Customer', sortable: true, className: 'w-[140px]' },
              { key: 'issue', label: 'Issue' },
              { key: 'age', label: 'Age', className: 'w-[60px]' },
              { key: 'owner', label: 'Owner', sortable: true, className: 'w-[100px]' },
              { key: 'open', label: <span className="sr-only">Open</span>, align: 'right', className: 'w-[64px]' },
            ]}
            rows={exceptions.map((e, i) => ({
              id: String(i), href: e.href,
              values: { customer: e.customer, owner: e.owner },
              cells: {
                sev: <span aria-label={e.severity === 'crit' ? 'Critical' : 'Warning'} className={cn('block size-2 rounded-full ring-4', e.severity === 'crit' ? 'bg-crit ring-crit/15' : 'bg-warn ring-warn/20')} />,
                customer: <span className="block truncate font-semibold">{e.customer}</span>,
                issue: <span className="block max-w-[520px] truncate">{e.issue} <span className="text-muted-foreground">· {e.context}</span></span>,
                age: <span className={cn('tabular font-mono text-xs', e.severity === 'crit' ? 'font-semibold text-crit-ink' : 'text-warn-ink')}>{e.age}</span>,
                owner: <span className="block truncate">{e.owner}</span>,
                open: <Link href={e.href} className="text-xs font-medium" aria-label={`Open: ${e.issue}`}>Open →</Link>,
              },
            }))} />
        </Card>
      <Card flush title="Portfolio" description={`${rows.length} active projects`} extra={<Link href="/projects" className="text-xs font-medium">All projects →</Link>}>
        <DataGrid label="Portfolio"
          columns={[
            { key: 'customer', label: 'Customer', sortable: true, className: 'w-[120px]' },
            { key: 'project', label: 'Project', sortable: true },
            { key: 'health', label: 'Health', sortable: true, className: 'w-[140px]' },
            { key: 'progress', label: 'Progress', sortable: true, className: 'w-[110px]' },
            { key: 'pm', label: 'PM', sortable: true, className: 'w-[80px]' },
            { key: 'milestone', label: 'Next milestone', sortable: true, className: 'w-[210px]' },
            { key: 'blocker', label: 'Customer blocker', className: 'w-[170px]' },
            { key: 'requests', label: 'Open req', sortable: true, align: 'right', className: 'w-[70px]' },
            { key: 'invoice', label: 'Oldest invoice', sortable: true, align: 'right', className: 'w-[100px]' },
          ]}
          rows={rows.map((p) => ({
            id: p.id, href: `/projects/${p.id}`,
            values: { customer: p.customer, project: p.name, health: ['at_risk', 'needs_attention', 'on_track'].indexOf(p.health), progress: p.progress, pm: p.pm,
              milestone: p.nextMilestone?.due, requests: p.openRequests, invoice: p.oldestInvoiceDays },
            cells: {
              customer: <Link href={`/customers/${p.customerId}`} className="block truncate font-semibold text-foreground no-underline">{p.customer}</Link>,
              project: <Link href={`/projects/${p.id}`} className="block truncate font-medium text-foreground no-underline hover:underline">{p.name}</Link>,
              health: <Health health={p.health} />,
              progress: <span className="flex items-center gap-1.5"><Ticks value={p.progress} /><span className="tabular text-[11px] text-muted-foreground">{Math.round(p.progress)}%</span></span>,
              pm: <span className="block truncate">{p.pm ?? '–'}</span>,
              milestone: <span className="block max-w-[210px] truncate text-xs">{p.nextMilestone ? <>{p.nextMilestone.title} <span className={cn('font-mono', p.nextMilestone.overdue ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{shortDate(p.nextMilestone.due)}</span></> : '–'}</span>,
              blocker: <span className={cn('block max-w-[170px] truncate text-xs', p.blocker ? 'text-warn-ink' : 'text-muted-foreground')}>{p.blocker ?? 'None'}</span>,
              requests: <span className="tabular font-mono text-xs">{p.openRequests}</span>,
              invoice: <span className={cn('tabular font-mono text-xs', (p.oldestInvoiceDays ?? 0) > 30 ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{p.oldestInvoiceDays != null ? `${p.oldestInvoiceDays}d` : '–'}</span>,
            },
          }))} />
      </Card>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Throughput" description="Tasks created and completed per week, last 12 weeks">
              <WeeklyTrend data={trend} series={[{ key: 'Created', label: 'Created', color: 'var(--color-chart-4)' }, { key: 'Completed', label: 'Completed', color: 'var(--color-chart-2)' }]} />
            </Card>
            <Card title="Request pipeline" description="Requests at each stage now; delivered = last 90 days">
              <StageFunnel steps={funnel} />
            </Card>
          </div>
          <Card title="Team load" description={`Planned days per person per week, from task estimates · capacity ${WEEKLY_CAPACITY_DAYS} days`}>
            {people.length ? <LoadMatrix capacity={WEEKLY_CAPACITY_DAYS} columns={weeks.map(weekLabel)} rows={people.map((p) => ({ label: p.full_name, values: hours.get(p.id)!.map((d) => +d.toFixed(1)) }))} />
              : <Empty title="No team members yet" />}
          </Card>
          <Card title="Delivery activity" description="Updates, comments and status changes, last 6 months">
            <ActivityCalendar data={activity} unit="events" />
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-3" aria-label="At a glance">
          <Card title="Portfolio health" description="By the PM's assessment">
            {rows.length ? <HealthDonut onTrack={byHealth('on_track')} attention={byHealth('needs_attention')} atRisk={byHealth('at_risk')} />
              : <Empty title="No active projects" />}
          </Card>

          <Card flush title="Waiting on customers" description="Approvals not yet decided" extra={<Link href="/requests" className="text-xs font-medium">Requests →</Link>}>
            {(pending.data ?? []).length ? (pending.data ?? []).map((a) => (
              <Link key={a.id} href={a.request_id ? `/requests/${a.request_id}` : `/approvals/${a.id}`} className="row grid-cols-[minmax(0,1fr)_auto] py-1.5 text-ink no-underline hover:bg-head">
                <span className="min-w-0"><span className="block truncate font-medium">{a.title}</span><span className="block truncate text-[11px] text-muted-foreground">{a.customers?.name} · {a.approver?.full_name ?? 'No approver'}</span></span>
                <span className={cn('tabular text-[11px]', isOverdue(a.due_date) ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{a.due_date ? shortDate(a.due_date) : '–'}</span>
              </Link>
            )) : <Empty title="Nothing waiting" />}
          </Card>

          <Card flush title="This week" description="Against last week · 12-week trend">
            <div className="px-3.5 py-1">
              <WeeklyMetrics items={[
                { label: 'Tasks completed', values: completed },
                { label: 'Hours logged', values: hoursLogged.map((h) => +h.toFixed(1)) },
                { label: 'Requests raised', values: raised },
                { label: 'Activity', values: touched },
              ]} />
            </div>
          </Card>

          <ActivityFeed title="Recent activity" items={(recent.data ?? []).map((a) => ({
            id: String(a.id), initials: initials(a.actor?.full_name ?? 'Helm'),
            content: <><span className="font-medium">{a.actor?.full_name ?? 'Helm'}</span> {a.summary}</>,
            time: `${a.projects?.name ? `${a.projects.name} · ` : ''}${relativeTime(a.created_at)}`,
          }))} />
        </aside>
      </div>
    </div>
  )
}
