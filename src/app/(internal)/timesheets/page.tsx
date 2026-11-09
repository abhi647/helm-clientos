import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { btn, Card, PageHeader, Stat } from '@/components/ui'
import { WeekGrid, type CellState, type DayOff, type GridRow } from '@/components/week-grid'
import { hrs } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { TimesheetTabs } from './tabs'

export const metadata: Metadata = { title: 'Timesheets' }

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const mondayOf = (s?: string) => {
  const d = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d
}

/**
 * Everyone's own timesheet: a week of tasks × days. Hours save as you type; the PM approves them on the Approve tab.
 * How they bill follows each project's billing model, so there is nothing to choose here.
 */
export default async function MyWeek({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await requireStaff()
  const { week } = await searchParams
  const monday = mondayOf(week)
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY))
  const from = iso(days[0]!), to = iso(days[6]!)
  const supabase = await createClient()
  const [{ data: entries }, { data: open }, { count: runs }, { data: recent }, { data: leaveDays }, { data: hols }] = await Promise.all([
    supabase.from('time_entries').select('task_id, worked_on, hours, approved_at, statement_id, returned_at, returned_note, tasks(title, projects(name, billing_model, customers(name)))')
      .eq('user_id', me.id).gte('worked_on', from).lte('worked_on', to),
    supabase.from('tasks').select('id, title, projects!inner(name, status, billing_model, customers(name))').eq('assignee_id', me.id).neq('status', 'done').eq('projects.status', 'active').limit(300),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('pm_id', me.id),
    // the last four weeks, for the trend under the grid
    supabase.from('time_entries').select('worked_on, hours, approved_at').eq('user_id', me.id).gte('worked_on', iso(new Date(monday.getTime() - 28 * DAY))).lte('worked_on', to),
    supabase.from('leave_days').select('day, kind, note, portion').eq('profile_id', me.id).gte('day', from).lte('day', to),
    supabase.from('holidays').select('day, name').eq('optional', false).gte('day', from).lte('day', to),
  ])
  type P = { name: string; billing_model: GridRow['model']; customers: { name: string } | null } | null
  const ctx = (p: P) => `${p?.customers?.name ?? ''} · ${p?.name ?? ''}`
  const rows = new Map<string, GridRow>()
  const blank = () => days.map(() => ({ hours: 0, state: null as CellState, note: null as string | null }))
  for (const t of open ?? []) rows.set(t.id, { taskId: t.id, title: t.title, context: ctx(t.projects as P), model: (t.projects as P)?.billing_model ?? null, cells: blank() })
  for (const e of entries ?? []) {
    const p = e.tasks?.projects as P
    const row = rows.get(e.task_id) ?? { taskId: e.task_id, title: e.tasks?.title ?? 'Task', context: ctx(p), model: p?.billing_model ?? null, cells: blank() }
    const i = Math.round((Date.parse(`${e.worked_on}T00:00:00Z`) - monday.getTime()) / DAY)
    const c = row.cells[i]!
    c.hours += Number(e.hours)
    const state: CellState = e.statement_id ? 'billed' : e.approved_at ? 'approved' : e.returned_at ? 'returned' : 'waiting'
    // the strictest state wins: one approved entry locks the cell
    c.state = c.state === 'billed' || state === 'billed' ? 'billed' : c.state === 'approved' || state === 'approved' ? 'approved' : state
    if (e.returned_note) c.note = e.returned_note
    rows.set(e.task_id, row)
  }
  // tasks with hours first, then the rest of your open work
  const grid = [...rows.values()].sort((a, b) => Number(b.cells.some((c) => c.hours)) - Number(a.cells.some((c) => c.hours)) || a.context.localeCompare(b.context))
  const total = (entries ?? []).reduce((a, e) => a + Number(e.hours), 0)
  const approved = (entries ?? []).filter((e) => e.approved_at).reduce((a, e) => a + Number(e.hours), 0)
  const returned = (entries ?? []).filter((e) => e.returned_at && !e.approved_at).length
  const weekly = [3, 2, 1, 0].map((k) => (recent ?? []).filter((e) => {
    const t = Date.parse(`${e.worked_on}T00:00:00Z`)
    return t >= monday.getTime() - k * 7 * DAY && t < monday.getTime() - (k - 1) * 7 * DAY
  }).reduce((a, e) => a + Number(e.hours), 0))
  const label = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  const range = `${days[0]!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${days[6]!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
  const approver = ['admin', 'ceo'].includes(me.internal_role ?? '') || !!runs

  return (
    <>
      <PageHeader title="Timesheets" meta={<span>Type your hours for each task and day; they save as you go</span>} />
      <TimesheetTabs approver={approver} />
      <div className="flex max-w-[1200px] flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Week" className="inline-flex h-8 items-center rounded-md border border-border bg-card">
            <Link href={`?week=${iso(new Date(monday.getTime() - 7 * DAY))}`} aria-label="Previous week" className="grid h-full w-8 place-items-center text-foreground no-underline hover:bg-muted"><ChevronLeft className="size-4" /></Link>
            <span className="tabular border-x border-border px-3 text-[13px] font-medium">{range}</span>
            <Link href={`?week=${iso(new Date(monday.getTime() + 7 * DAY))}`} aria-label="Next week" className="grid h-full w-8 place-items-center text-foreground no-underline hover:bg-muted"><ChevronRight className="size-4" /></Link>
          </nav>
          {week ? <Link href="/timesheets" className={btn('outline', 'h-8')}>This week</Link> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="This week" value={hrs(total)} sub={`${hrs(weekly.slice(0, 3).reduce((a, b) => a + b, 0) / 3)} a week lately`} />
          <Stat label="Approved" value={hrs(approved)} pct={total ? (100 * approved) / total : 0} tone={approved && approved === total ? 'good' : 'neutral'} />
          <Stat label="Waiting for the PM" value={hrs(total - approved)} tone={total - approved ? 'info' : 'neutral'} />
          <Stat label="Returned to fix" value={returned} sub={returned ? 'shown in amber' : undefined} tone={returned ? 'warn' : 'good'} />
        </div>
        <Card flush>
          <WeekGrid key={from} today={iso(new Date())} off={days.map((d): DayOff => {
            const h = (hols ?? []).find((x) => x.day === iso(d))
            if (h) return { kind: 'holiday', label: h.name }
            const l = (leaveDays ?? []).find((x) => x.day === iso(d))
            return l ? { kind: l.kind === 'sick' ? 'sick' : 'leave', label: l.note ?? 'Leave', half: Number(l.portion) < 1 } : null
          })} days={days.map((d) => ({ iso: iso(d), label: label(d) }))} rows={grid}
            options={(open ?? []).map((t) => ({ taskId: t.id, title: t.title, context: ctx(t.projects as P), model: (t.projects as P)?.billing_model ?? null }))} />
        </Card>
        <p className="m-0 text-xs text-muted-foreground">Quarter hours (0.25) are fine. A green, locked cell is approved; ask the PM to undo the approval to change it. An amber cell was returned: hover it for the note, then type the corrected hours.</p>
      </div>
    </>
  )
}
