import type { Metadata } from 'next'
import Link from 'next/link'
import { createEngagement, dismissEngagement } from '@/app/_actions/admin'
import { ActionButton, ActionForm } from '@/components/forms'
import { Greeting } from '@/components/shell/greeting'
import { HeartPulse, Hourglass, Receipt, Siren, Stamp, TriangleAlert } from 'lucide-react'
import { Avatar, Card, Empty, Health, Stat, cn } from '@/components/ui'
import { ActivityCalendar, HealthDonut, LoadMatrix, StageFunnel, Ticks, WeeklyMetrics, WeeklyTrend } from '@/components/viz'
import { isOverdue, isoDaysAgo, label, relativeTime, shortDate } from '@/lib/format'
import { loadPortfolio } from '@/lib/portfolio'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { DirectoryRow } from '@/lib/views'
import { TEMPLATES } from '@/lib/templates'

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
                    <select name="template_key" defaultValue={s.suggested_template} className="input">{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
                  <label className="flex flex-col gap-1 text-xs"><span className="label">Start</span>
                    <input type="date" name="start_date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></label>
                  <label className="flex flex-col gap-1 text-xs"><span className="label">PM</span>
                    <select name="pm_id" defaultValue={me.id} className="input">{(staff.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
                </ActionForm>
                <ActionButton run={dismissEngagement.bind(null, s.id)} className="btn-ghost">Dismiss</ActionButton>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
        <Card flush className="min-w-0 overflow-x-auto" title={<span className="flex items-center gap-2">Needs attention <span className="tabular rounded-full bg-crit-bg px-2 text-xs font-semibold text-crit-ink">{exceptions.length}</span></span>} extra="Most severe first, then oldest">
          {exceptions.length ? (
            <div className="min-w-[620px]">
              <div className="row row-head grid-cols-[14px_130px_minmax(0,1fr)_56px_96px_56px]"><span /><span>Customer</span><span>Issue</span><span>Age</span><span>Owner</span><span /></div>
              {exceptions.map((e, i) => (
                <div key={i} className="row grid-cols-[14px_130px_minmax(0,1fr)_56px_96px_56px] hover:bg-head">
                  <span aria-label={e.severity === 'crit' ? 'Critical' : 'Warning'} className={cn('size-2 rounded-full ring-4', e.severity === 'crit' ? 'bg-crit ring-crit/15' : 'bg-warn ring-warn/20')} />
                  <span className="truncate font-semibold">{e.customer}</span>
                  <span className="truncate">{e.issue} <span className="text-muted-foreground">· {e.context}</span></span>
                  <span className={cn('tabular font-mono text-xs', e.severity === 'crit' ? 'font-semibold text-crit-ink' : 'text-warn-ink')}>{e.age}</span>
                  <span className="truncate">{e.owner}</span>
                  <Link href={e.href} className="text-xs font-medium" aria-label={`Open: ${e.issue}`}>Open →</Link>
                </div>
              ))}
            </div>
          ) : <Empty title="Nothing needs attention">Every project is on track.</Empty>}
        </Card>
      <Card flush className="overflow-x-auto" title="Portfolio" description={`${rows.length} active projects`} extra={<Link href="/projects" className="text-xs font-medium">All projects →</Link>}>
        <div className="min-w-[1000px]">
          <div className="row row-head grid-cols-[120px_minmax(170px,1fr)_120px_100px_70px_200px_minmax(150px,1fr)_60px_90px]">
            <span>Customer</span><span>Project</span><span>Health</span><span>Progress</span><span>PM</span><span>Next milestone</span><span>Customer blocker</span><span className="text-right">Open req</span><span className="text-right">Oldest invoice</span>
          </div>
          {rows.map((p) => (
            <div key={p.id} className="row grid-cols-[120px_minmax(170px,1fr)_120px_100px_70px_200px_minmax(150px,1fr)_60px_90px] hover:bg-head">
              <Link href={`/customers/${p.customerId}`} className="truncate font-semibold text-ink no-underline">{p.customer}</Link>
              <Link href={`/projects/${p.id}`} className="truncate font-medium text-ink no-underline hover:underline">{p.name}</Link>
              <Health health={p.health} />
              <span className="flex items-center gap-1.5"><Ticks value={p.progress} /><span className="tabular text-[11px] text-muted-foreground">{Math.round(p.progress)}%</span></span>
              <span className="truncate">{p.pm ?? '–'}</span>
              <span className="truncate text-xs">{p.nextMilestone ? <>{p.nextMilestone.title} <span className={cn('font-mono', p.nextMilestone.overdue ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{shortDate(p.nextMilestone.due)}</span></> : '–'}</span>
              <span className={cn('truncate text-xs', p.blocker ? 'text-warn-ink' : 'text-muted-foreground')}>{p.blocker ?? 'None'}</span>
              <span className="tabular text-right font-mono text-xs">{p.openRequests}</span>
              <span className={cn('tabular text-right font-mono text-xs', (p.oldestInvoiceDays ?? 0) > 30 ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{p.oldestInvoiceDays != null ? `${p.oldestInvoiceDays}d` : '–'}</span>
            </div>
          ))}
        </div>
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

          <Card flush title="Recent activity">
            <ol className="m-0 list-none p-0">
              {(recent.data ?? []).map((a) => (
                <li key={a.id} className="flex gap-2 border-t border-line-soft px-3.5 py-1.5 first:border-t-0">
                  <Avatar name={a.actor?.full_name ?? 'Helm'} size={20} />
                  <span className="min-w-0 flex-1 text-xs leading-snug">
                    <span className="font-medium">{a.actor?.full_name ?? 'Helm'}</span> {a.summary}
                    <span className="block truncate text-[11px] text-muted-foreground">{a.projects?.name ? `${a.projects.name} · ` : ''}{relativeTime(a.created_at)}</span>
                  </span>
                </li>
              ))}
              {!(recent.data ?? []).length ? <li><Empty title="No activity yet" /></li> : null}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  )
}
