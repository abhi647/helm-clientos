import type { Metadata } from 'next'
import Link from 'next/link'
import { createEngagement, dismissEngagement } from '@/app/_actions/admin'
import { ActionButton, ActionForm } from '@/components/forms'
import { Greeting, GreetingChip } from '@/components/shell/greeting'
import { Card, Empty, Health, Progress, Stat, cn } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { loadPortfolio } from '@/lib/portfolio'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { DirectoryRow } from '@/lib/views'
import { TEMPLATES } from '@/lib/templates'

export const metadata: Metadata = { title: 'Home' }

const WEEKLY_CAPACITY_HOURS = 40

export default async function Home() {
  const me = await requireStaff()
  const supabase = await createClient()
  const [{ rows, exceptions, counts }, setups, staff, load] = await Promise.all([
    loadPortfolio(),
    supabase.from('engagement_setups').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'internal_role'>[], { merge: false }>(),
    supabase.from('tasks').select('assignee_id, due_date, task_estimates(estimate_hours)').neq('status', 'done').not('assignee_id', 'is', null),
  ])

  // planned hours per person for the next four weeks (from task estimates)
  const weekStart = new Date()
  weekStart.setUTCHours(0, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7))
  const weeks = [0, 1, 2, 3].map((i) => new Date(weekStart.getTime() + i * 7 * 86_400_000))
  const people = (staff.data ?? []).filter((p) => ['pm', 'consultant'].includes(p.internal_role ?? ''))
  const hours = new Map<string, number[]>(people.map((p) => [p.id, [0, 0, 0, 0]]))
  for (const t of load.data ?? []) {
    if (!t.due_date || !hours.has(t.assignee_id!)) continue
    const w = Math.floor((Date.parse(`${t.due_date}T00:00:00Z`) - weekStart.getTime()) / (7 * 86_400_000))
    const est = Number(t.task_estimates?.estimate_hours ?? 0)
    if (w >= 0 && w < 4) hours.get(t.assignee_id!)![w]! += est
  }
  const crit = exceptions.filter((e) => e.severity === 'crit').length
  const first = me.full_name.split(' ')[0] ?? me.full_name

  return (
    <div className="flex flex-col gap-3 p-4">
      <Greeting compact name={first}
        lines={{
          morning: exceptions.length ? `${exceptions.length} things need a decision today. Everything else is moving.` : 'Nothing needs you right now. Everything is on track.',
          afternoon: `Afternoon check-in: ${exceptions.length} open exceptions, ${crit} of them critical.`,
          evening: crit ? `Before you sign off, the ${crit} critical items are at the top. The rest can wait.` : 'A quiet evening. Nothing critical is open.',
          night: 'Working late? Only the critical items matter now. Everything else is on track.',
        }}
        chips={<>
          <GreetingChip><b className="font-mono">{crit}</b> critical</GreetingChip>
          <GreetingChip><b className="font-mono">{counts.healthy} of {rows.length}</b> projects healthy</GreetingChip>
          <GreetingChip><b className="font-mono">{counts.approvals}</b> approvals with customers</GreetingChip>
        </>} />

      <div className="card grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        <Stat label="Projects at risk" value={counts.atRisk} sub={`of ${rows.length}`} tone={counts.atRisk ? 'crit' : undefined} />
        <Stat label="Critical requests" value={counts.critical} />
        <Stat label="Customer overdue" value={counts.customerOverdue} sub="dependencies" tone={counts.customerOverdue ? 'warn' : undefined} />
        <Stat label="Invoices > 30 days" value={counts.invoices30} tone={counts.invoices30 ? 'crit' : undefined} />
        <Stat label="Approvals pending" value={counts.approvals} />
      </div>

      {canManage(me) && setups.data?.length ? (
        <Card title="Set up new engagement" extra="Closed Won in HubSpot">
          <div className="flex flex-col gap-3">
            {setups.data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-end gap-3 rounded-md border border-line-soft p-3">
                <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{s.company_name}</span>
                  <span className="text-xs text-muted">Deal: {s.deal_name}{s.service ? ` · ${s.service}` : ''}</span>
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

      <div className="flex flex-wrap items-start gap-3">
        <Card flush className="min-w-0 flex-[999_1_560px] overflow-x-auto" title={<>Needs attention <span className="ml-1 rounded-sm bg-crit-bg px-1.5 font-mono text-[11px] text-crit-ink">{exceptions.length}</span></>} extra="Sorted by severity, then age">
          {exceptions.length ? (
            <div className="min-w-[620px]">
              <div className="row row-head grid-cols-[14px_130px_minmax(0,1fr)_60px_90px_44px]"><span /><span>Customer</span><span>Issue</span><span>Age</span><span>Owner</span><span /></div>
              {exceptions.map((e, i) => (
                <div key={i} className="row grid-cols-[14px_130px_minmax(0,1fr)_60px_90px_44px] hover:bg-head">
                  <span aria-label={e.severity === 'crit' ? 'Critical' : 'Warning'} className={cn('size-2 rounded-full', e.severity === 'crit' ? 'bg-crit' : 'bg-warn')} />
                  <span className="truncate font-semibold">{e.customer}</span>
                  <span className="truncate">{e.issue} <span className="text-muted">· {e.context}</span></span>
                  <span className={cn('tabular font-mono text-xs', e.severity === 'crit' ? 'font-semibold text-crit-ink' : 'text-warn-ink')}>{e.age}</span>
                  <span className="truncate">{e.owner}</span>
                  <Link href={e.href} className="text-xs font-medium">Open</Link>
                </div>
              ))}
            </div>
          ) : <Empty title="Nothing needs attention">Every project is on track.</Empty>}
        </Card>

        <Card flush className="min-w-0 flex-[1_1_340px] overflow-x-auto" title="Team workload" extra="planned hours, next 4 weeks">
          <div className="min-w-[330px]">
            <div className="row row-head grid-cols-[minmax(0,1fr)_repeat(4,52px)]"><span>Person</span>{weeks.map((w) => <span key={w.toISOString()} className="text-center">{shortDate(w.toISOString().slice(0, 10))}</span>)}</div>
            {people.map((p) => (
              <div key={p.id} className="row grid-cols-[minmax(0,1fr)_repeat(4,52px)]">
                <span className="truncate">{p.full_name}</span>
                {hours.get(p.id)!.map((h, i) => {
                  const pct = Math.round((100 * h) / WEEKLY_CAPACITY_HOURS)
                  return <span key={i} className={cn('tabular rounded-sm py-0.5 text-center font-mono text-xs',
                    pct > 100 ? 'bg-crit-bg font-semibold text-crit-ink ring-1 ring-crit ring-inset' : pct < 60 ? 'bg-ground text-muted' : pct < 85 ? 'bg-[#cde2fb] text-[#184f95]' : 'bg-[#86b6ef] font-semibold text-[#0d366b]')}>{pct}%</span>
                })}
              </div>
            ))}
            <p className="m-0 border-t border-line-soft px-3 py-1.5 text-[11px] text-muted">Share of a {WEEKLY_CAPACITY_HOURS} h week. Over 100% in red. Resource planning arrives in phase 2.</p>
          </div>
        </Card>
      </div>

      <Card flush className="overflow-x-auto" title="Portfolio" extra={`${rows.length} active projects`}>
        <div className="min-w-[1000px]">
          <div className="row row-head grid-cols-[120px_minmax(170px,1fr)_120px_100px_70px_200px_minmax(150px,1fr)_60px_90px]">
            <span>Customer</span><span>Project</span><span>Health</span><span>Progress</span><span>PM</span><span>Next milestone</span><span>Customer blocker</span><span className="text-right">Open req</span><span className="text-right">Oldest invoice</span>
          </div>
          {rows.map((p) => (
            <div key={p.id} className="row grid-cols-[120px_minmax(170px,1fr)_120px_100px_70px_200px_minmax(150px,1fr)_60px_90px] hover:bg-head">
              <Link href={`/customers/${p.customerId}`} className="truncate font-semibold text-ink no-underline">{p.customer}</Link>
              <Link href={`/projects/${p.id}`} className="truncate font-medium text-ink no-underline hover:underline">{p.name}</Link>
              <Health health={p.health} />
              <Progress value={p.progress} width={44} />
              <span className="truncate">{p.pm ?? '–'}</span>
              <span className="truncate text-xs">{p.nextMilestone ? <>{p.nextMilestone.title} <span className={cn('font-mono', p.nextMilestone.overdue ? 'font-semibold text-crit-ink' : 'text-muted')}>{shortDate(p.nextMilestone.due)}</span></> : '–'}</span>
              <span className={cn('truncate text-xs', p.blocker ? 'text-warn-ink' : 'text-muted')}>{p.blocker ?? 'None'}</span>
              <span className="tabular text-right font-mono text-xs">{p.openRequests}</span>
              <span className={cn('tabular text-right font-mono text-xs', (p.oldestInvoiceDays ?? 0) > 30 ? 'font-semibold text-crit-ink' : 'text-muted')}>{p.oldestInvoiceDays != null ? `${p.oldestInvoiceDays}d` : '–'}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
