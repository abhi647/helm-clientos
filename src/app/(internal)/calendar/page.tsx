import type { Metadata } from 'next'
import { PageHeader, Stat } from '@/components/ui'
import { TaskFilters } from '@/components/task-views'
import { CalendarLegend, TaskCalendar, type CalendarItem } from '@/components/viz'
import { isOverdue, isoDaysAgo } from '@/lib/format'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Calendar' }

type Search = { who?: string; project?: string; show?: string }

/**
 * Tasks and meetings on a calendar: open tasks on their due date, finished tasks on the day they were completed,
 * meetings on the day they were held. Your own work by default; anyone can widen it to everyone's (what you can see).
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff()
  const sp = await searchParams
  const manager = canManage(me)
  const who = sp.who === 'all' ? 'all' : manager && sp.who ? sp.who : me.id
  const showDone = sp.show !== 'open'
  const since = isoDaysAgo(120).slice(0, 10)
  const supabase = await createClient()
  const cols = 'id, title, status, due_date, completed_at, project_id, assignee_id, projects(name, customers(name))'
  let open = supabase.from('tasks').select(cols).neq('status', 'done').not('due_date', 'is', null).gte('due_date', since).limit(2000)
  let done = supabase.from('tasks').select(cols).eq('status', 'done').gte('completed_at', `${since}T00:00:00Z`).limit(2000)
  if (who !== 'all') { open = open.eq('assignee_id', who); done = done.eq('assignee_id', who) }
  if (sp.project) { open = open.eq('project_id', sp.project); done = done.eq('project_id', sp.project) }
  const [{ data: openTasks }, { data: doneTasks }, { data: meetings }, { data: projects }, staff] = await Promise.all([
    open, showDone ? done : Promise.resolve({ data: [] as never[] }),
    (sp.project ? supabase.from('meetings').select('id, title, held_on, project_id, projects(name)').eq('project_id', sp.project) : supabase.from('meetings').select('id, title, held_on, project_id, projects(name)'))
      .gte('held_on', since).limit(500),
    supabase.from('projects').select('id, name, customers(name)').eq('status', 'active').order('name'),
    manager ? supabase.from('profiles').select('id, full_name').eq('kind', 'internal').order('full_name') : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ])
  const ctx = (t: { projects: { name: string; customers: { name: string } | null } | null }) => `${t.projects?.customers?.name ?? ''} · ${t.projects?.name ?? ''}`
  const items: CalendarItem[] = [
    ...(openTasks ?? []).map((t) => ({ id: t.id, title: t.title, date: t.due_date!, href: `/projects/${t.project_id}?task=${t.id}`, kind: 'due' as const,
      overdue: isOverdue(t.due_date), waiting: t.status === 'waiting_customer', context: ctx(t) })),
    ...(doneTasks ?? []).map((t) => ({ id: t.id, title: t.title, date: t.completed_at!, href: `/projects/${t.project_id}?task=${t.id}`, kind: 'done' as const, context: ctx(t) })),
    ...(meetings ?? []).map((m) => ({ id: `m-${m.id}`, title: m.title, date: m.held_on, href: `/meetings/${m.id}`, kind: 'meeting' as const, context: m.projects?.name })),
  ]
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const overdue = items.filter((i) => i.overdue).length
  const dueWeek = items.filter((i) => i.kind === 'due' && !i.overdue && i.date <= weekAhead).length
  const done30 = (doneTasks ?? []).filter((t) => t.completed_at! >= isoDaysAgo(30)).length
  const meetingsAhead = (meetings ?? []).filter((m) => m.held_on >= today).length

  return (
    <>
      <PageHeader title="Calendar" meta={<span>Tasks by due date, finished work by the day it was completed, and meetings</span>} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TaskFilters keep={{}} fields={[
            { name: 'who', label: 'Whose work', value: sp.who ?? '', options: [{ value: '', label: 'My work' }, { value: 'all', label: 'Everyone' },
              ...(staff.data ?? []).filter((p) => p.id !== me.id).map((p) => ({ value: p.id, label: p.full_name }))] },
            { name: 'project', label: 'Project', value: sp.project ?? '', options: [{ value: '', label: 'All projects' },
              ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.customers?.name ?? ''} · ${p.name}` }))] },
            { name: 'show', label: 'Show', value: sp.show ?? '', options: [{ value: '', label: 'Open and completed' }, { value: 'open', label: 'Open only' }] },
          ]} />
          <span className="ml-auto"><CalendarLegend /></span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="Overdue" value={overdue} tone={overdue ? 'crit' : 'good'} />
          <Stat label="Due in the next 7 days" value={dueWeek} tone={dueWeek ? 'info' : 'neutral'} />
          <Stat label="Completed, last 30 days" value={done30} tone="good" />
          <Stat label="Meetings ahead" value={meetingsAhead} />
        </div>
        <TaskCalendar items={items} />
      </div>
    </>
  )
}
