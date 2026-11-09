import type { Metadata } from 'next'
import Link from 'next/link'
import { deleteTime, setTaskStatus } from '@/app/_actions/work'
import { ActionButton, StatusSelect } from '@/components/forms'
import { Avatar, Card, Chip, Empty, PageHeader, Stat, StatusSummary, taskStateCounts, TaskStatusChip, Visibility, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS, daysFromToday, hrs, isOverdue, isoDaysAgo, shortDate, effortShort } from '@/lib/format'
import { canManage, requireStaff } from '@/lib/session'
import { TaskBoard } from '@/components/task-board'
import { TaskFilters, TaskTable, ViewSwitch, asSort, asStatus, asView, sortRows, statusFilterOptions } from '@/components/task-views'
import { createClient } from '@/lib/supabase/server'
import { AlarmClock, CalendarCheck, CalendarRange, Hourglass } from 'lucide-react'
import { CalendarLegend, TaskCalendar } from '@/components/viz'
import { DataGrid } from '@/components/data-grid'


export const metadata: Metadata = { title: 'My Work' }

type Search = { view?: string; who?: string; project?: string; status?: string; sort?: string }

/**
 * The consultant's home: their open tasks, with context one click away. No portfolio metrics.
 * List groups by when work is due; Board is a status kanban; Table sorts. PMs and admins can look at a colleague's
 * work (or everyone's) with the person filter.
 */
export default async function MyWork({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const me = await requireStaff()
  const manager = canManage(me)
  const view = asView(sp.view)
  const statusF = asStatus(sp.status)
  const sort = asSort(sp.sort)
  // whose work: me by default; managers can pick a colleague or 'all'
  const who = manager && sp.who ? sp.who : me.id
  const supabase = await createClient()
  let query = supabase.from('tasks')
    .select('id, title, status, due_date, start_date, visibility, project_id, assignee_id, assignee:profiles!tasks_assignee_id_fkey(full_name, kind), parent:parent_id(title), projects(name, customers(name)), task_estimates(estimate, unit)')
    .neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(1000)
  if (who !== 'all') query = query.eq('assignee_id', who)
  const { data } = await query
  const staff = manager ? (await supabase.from('profiles').select('id, full_name').eq('kind', 'internal').order('full_name')).data ?? [] : []
  const everything = data ?? []
  const projectOptions = [...new Map(everything.map((t) => [t.project_id, `${t.projects?.customers?.name ?? ''} · ${t.projects?.name ?? ''}`])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))
  const tasks = everything.filter((t) => (!sp.project || t.project_id === sp.project) && (!statusF || t.status === statusF))
  const link = (patch: Partial<Search>) => {
    const next = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])
    const q = next.toString()
    return `/my-work${q ? `?${q}` : ''}`
  }
  const flat = tasks.map((t) => ({
    id: t.id, title: t.title, href: `/projects/${t.project_id}?task=${t.id}`, status: t.status, overdue: isOverdue(t.due_date),
    parent: t.parent?.title ?? null, context: `${t.projects?.customers?.name ?? ''} · ${t.projects?.name ?? ''}`,
    owner: t.assignee ? { name: t.assignee.full_name, customer: t.assignee.kind === 'customer' } : null,
    start: t.start_date ? shortDate(t.start_date) : null, due: t.due_date ? shortDate(t.due_date) : null, dueIso: t.due_date,
    effort: t.task_estimates?.estimate ? effortShort(t.task_estimates.estimate, t.task_estimates.unit) : null,
  }))
  const whose = who === me.id ? null : who === 'all' ? 'Everyone' : staff.find((p) => p.id === who)?.full_name ?? 'Colleague'
  // my time: the last 30 days, plus anything older still waiting or returned
  const { data: time } = await supabase.from('time_entries')
    .select('id, task_id, hours, worked_on, billable, approved_at, returned_note, statement_id, tasks(title, project_id, projects(name))')
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
      <PageHeader title="My Work" meta={<span>{tasks.length} open tasks{whose ? ` · ${whose}` : ''}</span>} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ViewSwitch current={view} href={(v) => link({ view: v === 'list' ? undefined : v })} />
          <TaskFilters keep={{ view: sp.view, sort: sp.sort }} fields={[
            ...(manager ? [{ name: 'who', label: 'Person', value: sp.who ?? '', options: [{ value: '', label: 'My work' }, { value: 'all', label: 'Everyone' },
              ...staff.filter((p) => p.id !== me.id).map((p) => ({ value: p.id, label: p.full_name }))] }] : []),
            { name: 'project', label: 'Project', value: sp.project ?? '', options: [{ value: '', label: 'All projects' }, ...projectOptions] },
            { name: 'status', label: 'Status', value: statusF ?? '', options: statusFilterOptions.filter((o) => o.value !== 'done') },
          ]} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Today" value={n('today')} icon={<CalendarCheck />} tone={n('today') ? 'info' : undefined} />
          <Stat label="Overdue" value={n('overdue')} icon={<AlarmClock />} tone={n('overdue') ? 'crit' : 'good'} />
          <Stat label="Waiting on customer" value={n('waiting')} icon={<Hourglass />} tone={n('waiting') ? 'warn' : undefined} />
          <Stat label="This week" value={n('week')} icon={<CalendarRange />} />
        </div>
        {tasks.length ? (
          <StatusSummary counts={taskStateCounts(tasks)} className="px-0.5" />
        ) : null}
        {view === 'calendar' ? <div className="flex flex-col gap-2"><CalendarLegend /><TaskCalendar items={flat.filter((r) => r.dueIso).map((r) => ({ id: r.id, title: r.title, date: r.dueIso!, href: r.href, kind: 'due' as const,
            overdue: r.overdue, waiting: r.status === 'waiting_customer', context: r.context }))} /><p className="m-0 text-xs text-muted-foreground">Open tasks with a due date. For finished work too, see <Link href="/calendar">Calendar</Link>.</p></div>
          : view === 'board' ? <TaskBoard cards={flat} setStatus={setTaskStatus} hideEmptyDone />
          : view === 'table' ? <TaskTable rows={sortRows(flat, sort)} sort={sort} sortHref={(k) => link({ sort: k === 'due' ? undefined : k })} setStatus={setTaskStatus} contextLabel="Project" />
          : tasks.length ? groups.filter((g) => g.tasks.length).map((g) => (
          <Card key={g.key} flush title={g.title} extra={`${g.tasks.length}`}>
            <DataGrid label={g.title}
              columns={[
                { key: 'task', label: 'Task' }, { key: 'where', label: whose ? 'Owner · project' : 'Project', className: 'w-[240px]' },
                { key: 'due', label: 'Due', className: 'w-[70px]' }, { key: 'est', label: 'Est.', align: 'right', className: 'w-[60px]' },
                { key: 'status', label: 'Status', className: 'w-[170px]' }, { key: 'vis', label: 'Sharing', className: 'w-[90px]' },
              ]}
              rows={g.tasks.map((t) => ({
                id: t.id,
                cells: {
                  task: <Link href={`/projects/${t.project_id}?task=${t.id}`} className="block max-w-[420px] truncate font-medium text-foreground no-underline hover:underline">{t.parent ? <span className="font-normal text-muted-foreground">{t.parent.title} › </span> : null}{t.title}</Link>,
                  where: <span className="flex min-w-0 max-w-[240px] items-center gap-1.5 truncate text-xs text-muted-foreground">{whose && t.assignee ? <><Avatar name={t.assignee.full_name} size={16} /><span className="truncate text-foreground">{t.assignee.full_name}</span> · </> : null}<span className="truncate">{t.projects?.customers?.name} · {t.projects?.name}</span></span>,
                  due: <span className={cn('font-mono text-xs', g.key === 'overdue' && 'font-semibold text-crit-ink')}>{shortDate(t.due_date)}</span>,
                  est: <span className="font-mono text-xs text-muted-foreground">{t.task_estimates?.estimate ? effortShort(t.task_estimates.estimate, t.task_estimates.unit) : ''}</span>,
                  status: <StatusSelect label={`Status of ${t.title}`} value={t.status} options={statusOptions} onChange={setTaskStatus.bind(null, t.id)} />,
                  vis: <Visibility value={t.visibility} />,
                },
              }))} />
          </Card>
        )) : <Card><Empty title={sp.project || statusF ? 'No tasks match these filters' : whose ? 'No open tasks' : 'Nothing assigned to you'}>{sp.project || statusF ? 'Clear a filter to see more.' : 'Enjoy the quiet, or pick up a request.'}</Empty></Card>}
        <Card flush title="My time" extra={returned.length ? <Chip tone="warn">{returned.length} returned to you</Chip> : 'Last 30 days, and anything waiting'}>
          {time?.length ? (
            <DataGrid label="My time"
              columns={[
                { key: 'date', label: 'Date', sortable: true, className: 'w-[70px]' }, { key: 'task', label: 'Task' },
                { key: 'hours', label: 'Hours', align: 'right', className: 'w-[70px]' }, { key: 'state', label: 'State' },
                { key: 'del', label: <span className="sr-only">Delete</span>, align: 'right', className: 'w-[80px]' },
              ]}
              rows={(time ?? []).map((e) => ({
                id: e.id, className: e.returned_note && !e.approved_at ? 'bg-warn-bg/40' : undefined,
                values: { date: e.worked_on },
                cells: {
                  date: <span className="font-mono text-xs">{shortDate(e.worked_on)}</span>,
                  task: <Link href={`/projects/${e.tasks?.project_id}?task=${e.task_id}`} className="block max-w-[360px] truncate text-foreground no-underline hover:underline">{e.tasks?.projects?.name} · {e.tasks?.title}</Link>,
                  hours: <span className="font-mono text-xs">{hrs(Number(e.hours))}{e.billable ? '' : ' nb'}</span>,
                  state: <span className="block max-w-[320px] truncate text-xs">
                    {e.statement_id ? <Chip tone="good">Billed</Chip> : e.approved_at ? <Chip tone="info">Approved</Chip>
                      : e.returned_note ? <span className="text-warn-ink"><Chip tone="warn">Returned</Chip> {e.returned_note}</span> : <Chip>Waiting</Chip>}
                  </span>,
                  del: !e.approved_at && !e.statement_id ? <ActionButton run={deleteTime.bind(null, e.id)} variant="ghost" className="h-7 text-xs" confirm="Delete this entry? Log it again on the right task or date if needed.">Delete</ActionButton> : null,
                },
              }))} />
          ) : <p className="m-0 p-3 text-xs text-muted-foreground">No time logged in the last 30 days. Open a task to log time.</p>}
        </Card>
        <p className="m-0 text-xs text-muted-foreground">Your PM approves your hours each week; approved hours are locked. A returned entry says what to fix: delete it and log it again. {time?.length ? `${hrs((time ?? []).filter((e) => !e.approved_at && !e.returned_note).reduce((s, e) => s + Number(e.hours), 0))} waiting for approval.` : ''}</p>
        <p className="m-0 text-xs text-muted-foreground">Open a task to read its requirement and discussion, log time, or mark it ready for review. <TaskStatusChip status="in_review" /> tells the PM it is ready.</p>
      </div>
    </>
  )
}
