import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { approveTime, returnTime, unapproveTime } from '@/app/_actions/work'
import { ActionButton } from '@/components/forms'
import { TimesheetForm, type TimeRow } from '@/components/timesheet'
import { Card, Chip, Empty, PageHeader, Stat } from '@/components/ui'
import { effort, isoDaysAgo, relativeTime, shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Timesheets' }

const SELECT = 'id, days, worked_on, billable, note, approved_at, returned_at, returned_note, user_id, person:profiles!time_entries_user_id_fkey(full_name), approver:profiles!time_entries_approved_by_fkey(full_name), tasks!inner(title, project_id, projects!inner(name, pm_id, customers(name)))'

/**
 * Days logged by the team, waiting for the project's PM (or an admin or the CEO) to approve. Approved days are what
 * the billing statements are filled from; returned days go back to the person with a note.
 */
export default async function TimesheetsPage() {
  const me = await requireStaff()
  const supabase = await createClient()
  const mine = !['admin', 'ceo'].includes(me.internal_role ?? '')   // admins and the CEO approve any project; others the ones they run
  if (mine && !(await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('pm_id', me.id)).count) notFound()
  const scoped = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => (mine ? q.eq('tasks.projects.pm_id', me.id) : q)
  const [{ data: waiting }, { data: returned }, { data: approved }] = await Promise.all([
    scoped(supabase.from('time_entries').select(SELECT).is('approved_at', null).is('returned_at', null).is('statement_id', null))
      .order('worked_on').limit(1000),
    scoped(supabase.from('time_entries').select(SELECT).is('approved_at', null).not('returned_at', 'is', null))
      .order('returned_at', { ascending: false }).limit(100),
    scoped(supabase.from('time_entries').select(SELECT).not('approved_at', 'is', null).is('statement_id', null).gte('approved_at', isoDaysAgo(14)))
      .order('approved_at', { ascending: false }).limit(100),
  ])

  type Entry = NonNullable<typeof waiting>[number]
  const where = (e: Entry) => `${e.tasks.projects.customers?.name ?? ''} · ${e.tasks.projects.name}`
  const byPerson = new Map<string, { name: string; rows: TimeRow[]; days: number }>()
  // a PM's own days wait for an admin or the CEO
  const own = mine ? (waiting ?? []).filter((e) => e.user_id === me.id) : []
  for (const e of waiting ?? []) {
    if (mine && e.user_id === me.id) continue
    const p = byPerson.get(e.user_id) ?? { name: e.person?.full_name ?? 'Unknown', rows: [], days: 0 }
    p.rows.push({ id: e.id, date: shortDate(e.worked_on), where: where(e), task: e.tasks.title, days: `${+Number(e.days).toFixed(2)}`, billable: e.billable, note: e.note })
    p.days += Number(e.days)
    byPerson.set(e.user_id, p)
  }
  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name))
  const waitingDays = people.reduce((s, p) => s + p.days, 0)
  const oldest = (waiting ?? []).find((e) => !mine || e.user_id !== me.id)?.worked_on

  return (
    <>
      <PageHeader title="Timesheets" meta={<span className="text-xs text-muted">{mine ? 'Your projects' : 'All projects'}</span>} />
      <div className="flex max-w-[1100px] flex-col gap-3 p-4">
        <div className="card grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
          <Stat label="Waiting for approval" value={effort(waitingDays)} sub={`${people.reduce((s, p) => s + p.rows.length, 0)} entries`} tone={waitingDays ? 'warn' : undefined} />
          <Stat label="Oldest waiting" value={oldest ? shortDate(oldest) : '–'} />
          <Stat label="Returned" value={returned?.length ?? 0} sub="waiting for the person" />
          <Stat label="Approved, not billed" value={effort((approved ?? []).reduce((s, e) => s + Number(e.days), 0))} sub="last 14 days" />
        </div>
        {people.length ? people.map((p) => (
          <Card key={p.name} flush title={p.name} extra={`${effort(p.days)} waiting`}>
            <TimesheetForm person={p.name} rows={p.rows} approve={approveTime} sendBack={returnTime} />
          </Card>
        )) : <Card><Empty title="Nothing to approve">Days the team logs on your projects show here.</Empty></Card>}
        {own.length ? <p className="m-0 text-xs text-muted">Your own {effort(own.reduce((s, e) => s + Number(e.days), 0))} on these projects wait for an admin or the CEO.</p> : null}

        {returned?.length ? (
          <Card flush title="Returned" extra="The person deletes the entry and logs it again">
            {returned.map((e) => (
              <div key={e.id} className="row grid-cols-[140px_80px_minmax(0,1fr)_64px_minmax(0,1.4fr)] max-sm:grid-cols-1">
                <span className="truncate">{e.person?.full_name}</span>
                <span className="font-mono text-xs">{shortDate(e.worked_on)}</span>
                <span className="truncate text-xs text-muted">{where(e)} · {e.tasks.title}</span>
                <span className="text-right font-mono text-xs">{+Number(e.days).toFixed(2)}</span>
                <span className="truncate text-xs text-warn-ink" title={e.returned_note ?? ''}>{e.returned_note} · {relativeTime(e.returned_at!)}</span>
              </div>
            ))}
          </Card>
        ) : null}

        {approved?.length ? (
          <Card flush title="Recently approved" extra="Not billed yet: an approval can still be undone">
            {approved.map((e) => (
              <div key={e.id} className="row grid-cols-[140px_80px_minmax(0,1fr)_64px_minmax(0,0.8fr)_auto] max-sm:grid-cols-1">
                <span className="truncate">{e.person?.full_name}</span>
                <span className="font-mono text-xs">{shortDate(e.worked_on)}</span>
                <span className="truncate text-xs text-muted">{where(e)} · {e.tasks.title}</span>
                <span className="text-right font-mono text-xs">{+Number(e.days).toFixed(2)}</span>
                <span className="truncate text-xs text-muted">{e.approver?.full_name ? `by ${e.approver.full_name}` : ''} {relativeTime(e.approved_at!)}</span>
                <ActionButton run={unapproveTime.bind(null, e.id)} className="btn-ghost h-7 text-xs">Undo</ActionButton>
              </div>
            ))}
          </Card>
        ) : null}
        <p className="m-0 text-xs text-muted">
          Approved billable days fill the day-rate lines of a project&apos;s billing statement, for the people named on each line
          (Billing → rate card). <Chip tone="neutral">nb</Chip> marks days logged as not billable.{' '}
          <Link href="/my-work">My Work</Link> shows each person their own entries.
        </p>
      </div>
    </>
  )
}
