import type { Metadata } from 'next'
import Link from 'next/link'
import { setTaskStatus } from '@/app/_actions/work'
import { StatusSelect } from '@/components/forms'
import { Card, Empty, PageHeader, Stat, TaskStatusChip, Visibility, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS, daysFromToday, shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'My Work' }

/** The consultant's home: only their tasks, with context one click away. No portfolio metrics. */
export default async function MyWork() {
  const me = await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('tasks')
    .select('id, title, status, due_date, visibility, project_id, projects(name, customers(name)), task_estimates(estimate_hours)')
    .eq('assignee_id', me.id).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false })
  const tasks = data ?? []
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
                  <span className="text-right font-mono text-xs text-muted">{t.task_estimates?.estimate_hours ? `${t.task_estimates.estimate_hours} h` : ''}</span>
                  <StatusSelect label={`Status of ${t.title}`} value={t.status} options={statusOptions} onChange={setTaskStatus.bind(null, t.id)} />
                  <span><Visibility value={t.visibility} /></span>
                </div>
              ))}
            </div>
          </Card>
        )) : <Card><Empty title="Nothing assigned to you">Enjoy the quiet, or pick up a request.</Empty></Card>}
        <p className="m-0 text-xs text-muted">Open a task to read its requirement and discussion, log time, or mark it ready for review. <TaskStatusChip status="in_review" /> tells the PM it is ready.</p>
      </div>
    </>
  )
}
