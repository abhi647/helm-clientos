import type { Metadata } from 'next'
import Link from 'next/link'
import { createEngagement, dismissEngagement } from '@/app/_actions/admin'
import { ActionButton, ActionForm } from '@/components/forms'
import { Greeting } from '@/components/shell/greeting'
import { HeartPulse, Hourglass, Receipt, Siren, Stamp, TriangleAlert } from 'lucide-react'
import { Avatar, Card, Empty, Health, Progress, Stat, cn } from '@/components/ui'
import { ActivityCalendar, HealthDonut } from '@/components/viz'
import { isOverdue, relativeTime, shortDate } from '@/lib/format'
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
  const [{ rows, exceptions, counts }, setups, staff, load, events, pending, recent] = await Promise.all([
    loadPortfolio(),
    supabase.from('engagement_setups').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'internal_role'>[], { merge: false }>(),
    supabase.from('tasks').select('assignee_id, due_date, task_estimates(estimate, unit)').neq('status', 'done').not('assignee_id', 'is', null),
    supabase.from('activity').select('created_at').gte('created_at', new Date(Date.now() - 182 * 86_400_000).toISOString()).limit(20_000),
    supabase.from('approvals').select('id, title, due_date, request_id, customers(name), approver:profiles!approvals_approver_id_fkey(full_name)').eq('status', 'pending').order('due_date', { ascending: true, nullsFirst: false }).limit(8),
    supabase.from('activity').select('id, summary, created_at, project_id, actor:profiles!activity_actor_id_fkey(full_name), projects(name)').order('created_at', { ascending: false }).limit(14),
  ])

  // planned days per person for the next four weeks (from estimates in days; billed-unit estimates aren't time)
  const weekStart = new Date()
  weekStart.setUTCHours(0, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))
  const weeks = [0, 1, 2, 3].map((i) => new Date(weekStart.getTime() + i * 7 * 86_400_000))
  const people = (staff.data ?? []).filter((p) => ['pm', 'consultant'].includes(p.internal_role ?? ''))
  const hours = new Map<string, number[]>(people.map((p) => [p.id, [0, 0, 0, 0]]))
  for (const t of load.data ?? []) {
    if (!t.due_date || !hours.has(t.assignee_id!)) continue
    const w = Math.floor((Date.parse(`${t.due_date}T00:00:00Z`) - weekStart.getTime()) / (7 * 86_400_000))
    const est = t.task_estimates?.unit === 'day' ? Number(t.task_estimates.estimate ?? 0) : 0
    if (w >= 0 && w < 4) hours.get(t.assignee_id!)![w]! += est
  }
  const crit = exceptions.filter((e) => e.severity === 'crit').length
  const perDay = new Map<string, number>()
  for (const e of events.data ?? []) { const d = e.created_at.slice(0, 10); perDay.set(d, (perDay.get(d) ?? 0) + 1) }
  const activity = [...perDay].map(([date, value]) => ({ date, value }))
  const byHealth = (h: string) => rows.filter((r) => r.health === h).length
  const workload = people.map((p) => ({ id: p.id, name: p.full_name, role: p.internal_role === 'pm' ? 'Project manager' : 'Consultant',
    allocated: Math.round(hours.get(p.id)!.reduce((a, b) => a + b, 0) * 10) / 10, capacity: WEEKLY_CAPACITY_DAYS * 4 }))
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
              <Progress value={p.progress} width={48} />
              <span className="truncate">{p.pm ?? '–'}</span>
              <span className="truncate text-xs">{p.nextMilestone ? <>{p.nextMilestone.title} <span className={cn('font-mono', p.nextMilestone.overdue ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{shortDate(p.nextMilestone.due)}</span></> : '–'}</span>
              <span className={cn('truncate text-xs', p.blocker ? 'text-warn-ink' : 'text-muted-foreground')}>{p.blocker ?? 'None'}</span>
              <span className="tabular text-right font-mono text-xs">{p.openRequests}</span>
              <span className={cn('tabular text-right font-mono text-xs', (p.oldestInvoiceDays ?? 0) > 30 ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{p.oldestInvoiceDays != null ? `${p.oldestInvoiceDays}d` : '–'}</span>
            </div>
          ))}
        </div>
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

          <Card flush title="Team workload" description={`Planned days per week · capacity ${WEEKLY_CAPACITY_DAYS}`}>
            <div className="row row-head grid-cols-[minmax(0,1fr)_repeat(4,36px)_40px]"><span>Person</span>{weeks.map((w) => <span key={w.toISOString()} className="text-center">{shortDate(w.toISOString().slice(0, 10)).replace(/^(\w+) /, '$1\u00a0')}</span>)}<span className="text-right">Total</span></div>
            {workload.map((p) => (
              <div key={p.id} className="row grid-cols-[minmax(0,1fr)_repeat(4,36px)_40px]">
                <span className="truncate">{p.name}</span>
                {hours.get(p.id)!.map((d, i) => {
                  const pct = Math.min(100, Math.round((100 * d) / WEEKLY_CAPACITY_DAYS))
                  const over = d > WEEKLY_CAPACITY_DAYS
                  return (
                    <span key={i} title={`${+d.toFixed(1)} of ${WEEKLY_CAPACITY_DAYS} days`} className="flex h-5 items-end justify-center rounded-sm bg-muted">
                      <span className={cn('w-full rounded-sm', over ? 'bg-crit' : pct >= 85 ? 'bg-primary' : 'bg-primary/45')} style={{ height: `${Math.max(pct, d ? 8 : 0)}%` }} />
                    </span>
                  )
                })}
                <span className={cn('tabular text-right text-xs', p.allocated > p.capacity ? 'font-semibold text-crit-ink' : 'text-muted-foreground')}>{p.allocated}d</span>
              </div>
            ))}
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
