import type { Metadata } from 'next'
import Link from 'next/link'
import { deleteTime, setTaskStatus } from '@/app/_actions/work'
import { ActionButton, StatusSelect } from '@/components/forms'
import { Card, Chip, Empty, PageHeader, Stat, TaskStatusChip, Visibility, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS, daysFromToday, effort, isoDaysAgo, shortDate, effortShort } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'My Work' }

/** The consultant's home: only their tasks, with context one click away. No portfolio metrics. */
export default async function MyWork() {
  const me = await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('tasks')
    .select('id, title, status, due_date, visibility, project_id, projects(name, customers(name)), task_estimates(estimate, unit)')
    .eq('assignee_id', me.id).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false })
  const tasks = data ?? []
  // my days: the last 30, plus anything older still waiting or returned
  const { data: time } = await supabase.from('time_entries')
    .select('id, task_id, days, worked_on, billable, approved_at, returned_note, statement_id, tasks(title, project_id, projects(name))')
    .eq('user_id', me.id).or(`worked_on.gte.${isoDaysAgo(30).slice(0, 10)},approved_at.is.null`)
    .order('worked_on', { ascending: false }).limit(200)
  const returned = (time ?? []).filter((e) => !e.approved_at && e.returned_note)
  const bucket = (t: (typeof tasks)[number]) => {
    if (t.status === 'waiting_customer') return 'waiting'
    const d = daysFromToday(t.due_date)
    if (d == null) return 'later'
    if (d < 0) return 'overdue'
    if (d === 0) return 'today'
    return d <= 7 ? 'week' : 'later'
  }
  const groups = [
    { key: 'overdue', title: 'Overdue' }, { key: 'today', title: 'Today' }, { key: 'week', title: 'This week' },
    { key: 'waiting', title: 'Waiting on customer' }, { key: 'later', title: 'Later' },
  ].map((g) => ({ ...g, tasks: tasks.filter((t) => bucket(t) === g.key) }))
  const n = (k: string) => groups.find((g) => g.key === k)!.tasks.length
  const statusOptions = (Object.keys(TASK_STATUS) as Enums<'task_status'>[]).map((v) => ({ value: v, label: TASK_STATUS[v] }))

  return (
    <>
      <PageHeader title="My Work" meta={<span className="text-xs text-muted">{tasks.length} open tasks</span>} />
      <div className="flex flex-col gap-3 p-4">
        <div className="card grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
          <Stat label="Today" value={n('today')} /><Stat label="Overdue" value={n('overdue')} tone={n('overdue') ? 'crit' : undefined} />
          <Stat label="Waiting on customer" value={n('waiting')} tone={n('waiting') ? 'warn' : undefined} /><Stat label="This week" value={n('week')} />
        </div>
        {tasks.length ? groups.filter((g) => g.tasks.length).map((g) => (
          <Card key={g.key} flush title={g.title} extra={`${g.tasks.length}`} className="overflow-x-auto">
            <div className="min-w-[760px]">
              {g.tasks.map((t) => (
                <div key={t.id} className="row grid-cols-[minmax(0,1fr)_200px_70px_60px_150px_84px] hover:bg-head">
                  <Link href={`/projects/${t.project_id}?task=${t.id}`} className="truncate font-medium text-ink no-underline hover:underline">{t.title}</Link>
                  <span className="truncate text-xs text-muted">{t.projects?.customers?.name} · {t.projects?.name}</span>
                  <span className={cn('font-mono text-xs', g.key === 'overdue' && 'font-semibold text-crit-ink')}>{shortDate(t.due_date)}</span>
                  <span className="text-right font-mono text-xs text-muted">{t.task_estimates?.estimate ? effortShort(t.task_estimates.estimate, t.task_estimates.unit) : ''}</span>
                  <StatusSelect label={`Status of ${t.title}`} value={t.status} options={statusOptions} onChange={setTaskStatus.bind(null, t.id)} />
                  <span><Visibility value={t.visibility} /></span>
                </div>
              ))}
            </div>
          </Card>
        )) : <Card><Empty title="Nothing assigned to you">Enjoy the quiet, or pick up a request.</Empty></Card>}
        <Card flush title="My time" extra={returned.length ? <Chip tone="warn">{returned.length} returned to you</Chip> : 'Last 30 days, and anything waiting'} className="overflow-x-auto">
          {time?.length ? (
            <div className="min-w-[640px]">
              {time.map((e) => (
                <div key={e.id} className={cn('row grid-cols-[70px_minmax(0,1fr)_60px_minmax(0,1.2fr)_70px]', e.returned_note && !e.approved_at && 'bg-warn-bg/40')}>
                  <span className="font-mono text-xs">{shortDate(e.worked_on)}</span>
                  <Link href={`/projects/${e.tasks?.project_id}?task=${e.task_id}`} className="truncate text-ink no-underline hover:underline">{e.tasks?.projects?.name} · {e.tasks?.title}</Link>
                  <span className="text-right font-mono text-xs">{effortShort(Number(e.days))}{e.billable ? '' : ' nb'}</span>
                  <span className="truncate text-xs">
                    {e.statement_id ? <Chip tone="good">Billed</Chip> : e.approved_at ? <Chip tone="info">Approved</Chip>
                      : e.returned_note ? <span className="text-warn-ink"><Chip tone="warn">Returned</Chip> {e.returned_note}</span> : <Chip>Waiting</Chip>}
                  </span>
                  <span className="text-right">{!e.approved_at && !e.statement_id ? <ActionButton run={deleteTime.bind(null, e.id)} className="btn-ghost h-7 text-xs" confirm="Delete this entry? Log it again on the right task or date if needed.">Delete</ActionButton> : null}</span>
                </div>
              ))}
            </div>
          ) : <p className="m-0 p-3 text-xs text-muted">No time logged in the last 30 days. Open a task to log time.</p>}
        </Card>
        <p className="m-0 text-xs text-muted">Your PM approves your days each week; approved days are locked. A returned entry says what to fix: delete it and log it again. {time?.length ? `${effort((time ?? []).filter((e) => !e.approved_at && !e.returned_note).reduce((s, e) => s + Number(e.days), 0))} waiting for approval.` : ''}</p>
        <p className="m-0 text-xs text-muted">Open a task to read its requirement and discussion, log time, or mark it ready for review. <TaskStatusChip status="in_review" /> tells the PM it is ready.</p>
      </div>
    </>
  )
}
