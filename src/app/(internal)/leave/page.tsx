import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addFixedHolidays, addHoliday, applyLeave, cancelLeave, removeHoliday } from '@/app/_actions/leave'
import { DataGrid } from '@/components/data-grid'
import { ActionButton, ActionForm } from '@/components/forms'
import { LeaveDecision, TeamCalendar, type CalendarDay, type CalendarPerson } from '@/components/leave'
import { LinkTabs } from '@/components/link-tabs'
import { btn, Card, Chip, Empty, PageHeader, Stat } from '@/components/ui'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Leave' }

type Tab = 'my' | 'approvals' | 'team' | 'holidays'
const STATUS = { pending: ['info', 'Waiting'], approved: ['good', 'Approved'], declined: ['crit', 'Declined'], cancelled: ['neutral', 'Cancelled'] } as const
const fmt = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
const range = (a: string, b: string) => (a === b ? fmt(a, { weekday: 'short', day: 'numeric', month: 'short' }) : `${fmt(a)} – ${fmt(b)}`)
const days = (n: number) => `${+Number(n).toFixed(1)} day${Number(n) === 1 ? '' : 's'}`

/** Leave and holidays: apply, see your balance, approve your team's, see who is away, and the company holiday list. */
export default async function Leave({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string; year?: string }> }) {
  const me = await requireStaff()
  const sp = await searchParams
  const tab: Tab = (['my', 'approvals', 'team', 'holidays'] as const).find((t) => t === sp.tab) ?? 'my'
  const admin = me.internal_role === 'admin' || me.internal_role === 'ceo'
  const supabase = await createClient()
  const now = new Date()
  const year = Number(sp.year) >= 2020 && Number(sp.year) <= 2100 ? Number(sp.year) : now.getUTCFullYear()
  const todayIso = now.toISOString().slice(0, 10)

  // who reports to me (my approvals), and the waiting count for the tab
  const [{ data: reports }, { count: waiting }] = await Promise.all([
    supabase.from('reporting_managers').select('profile_id').eq('manager_id', me.id),
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').neq('profile_id', me.id),
  ])
  const approver = admin || !!reports?.length

  const tabs = [
    { value: 'my', label: 'My leave', href: '/leave' },
    ...(approver ? [{ value: 'approvals', label: 'Approvals', count: waiting ?? 0, href: '/leave?tab=approvals' }] : []),
    { value: 'team', label: 'Team calendar', href: '/leave?tab=team' },
    { value: 'holidays', label: 'Holidays', href: '/leave?tab=holidays' },
  ]

  return (
    <>
      <PageHeader title="Leave" meta={<span>Apply for leave, see your balance and who is away. Approved leave updates billing and timesheets on its own.</span>}
        actions={admin ? <Link href="/leave/settings" className={btn('outline')}>Leave settings</Link> : null} />
      <div className="flex flex-col gap-3 p-4">
        <LinkTabs label="Leave" value={tab} items={tabs} />
        {tab === 'my' ? await MyLeave({ meId: me.id, year }) : null}
        {tab === 'approvals' && approver ? await Approvals({ meId: me.id }) : null}
        {tab === 'team' ? await Team({ month: sp.month, todayIso }) : null}
        {tab === 'holidays' ? await Holidays({ year, admin }) : null}
      </div>
    </>
  )

  // ---------------------------------------------------------------- my leave
  async function MyLeave({ meId, year }: { meId: string; year: number }) {
    const [{ data: balances }, { data: mine }, { data: types }] = await Promise.all([
      supabase.rpc('leave_balances', { p_profile: meId, p_year: year }),
      supabase.from('leave_requests').select('id, start_date, end_date, half_day, days, status, reason, decision_note, created_at, leave_types(name), decider:profiles!leave_requests_decided_by_fkey(full_name)')
        .eq('profile_id', meId).order('start_date', { ascending: false }).limit(100),
      supabase.from('leave_types').select('id, name, optional_holidays_only').eq('active', true).order('position'),
    ])
    return (
      <>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {(balances ?? []).map((b) => (
            <Stat key={b.leave_type_id} label={b.name} value={b.allowance == null ? days(b.used) : `${+Number(b.remaining).toFixed(1)}`}
              sub={b.allowance == null ? 'taken · no limit' : `left of ${+Number(b.allowance).toFixed(1)}${Number(b.pending) ? ` · ${+Number(b.pending).toFixed(1)} waiting` : ''}`}
              pct={b.allowance ? (100 * (Number(b.used) + Number(b.pending))) / Number(b.allowance) : undefined}
              tone={b.allowance != null && Number(b.remaining) <= 0 ? 'warn' : 'neutral'} />
          ))}
        </div>
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card flush title="My requests" description={`${year}: weekends and holidays are not counted`}>
            <DataGrid label="My leave requests" initialSort={{ key: 'dates', direction: -1 }}
              empty={<Empty title="No leave yet">Apply on the right; your manager is told straight away.</Empty>}
              columns={[
                { key: 'dates', label: 'Dates', sortable: true, className: 'w-[170px]' },
                { key: 'type', label: 'Type', sortable: true, className: 'w-[140px]' },
                { key: 'days', label: 'Days', sortable: true, align: 'right', className: 'w-[70px]' },
                { key: 'status', label: 'Status', sortable: true, className: 'w-[110px]' },
                { key: 'note', label: 'Note' },
                { key: 'act', label: <span className="sr-only">Cancel</span>, align: 'right', className: 'w-[90px]' },
              ]}
              rows={(mine ?? []).map((r) => {
                const [tone, text] = STATUS[r.status as keyof typeof STATUS]
                const cancellable = r.status === 'pending' || (r.status === 'approved' && r.start_date > todayIso)
                return {
                  id: r.id,
                  values: { dates: r.start_date, type: r.leave_types?.name, days: Number(r.days), status: r.status },
                  cells: {
                    dates: <span className="text-xs">{range(r.start_date, r.end_date)}{r.half_day ? ' · half' : ''}</span>,
                    type: <span className="text-xs">{r.leave_types?.name}</span>,
                    days: <span className="tabular font-mono text-xs">{+Number(r.days).toFixed(1)}</span>,
                    status: <Chip tone={tone} dot>{text}</Chip>,
                    note: <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={r.decision_note || r.reason}>
                      {r.decision_note ? `${r.decider?.full_name ?? 'Manager'}: ${r.decision_note}` : r.reason || `Applied ${relativeTime(r.created_at)}`}</span>,
                    act: cancellable ? <ActionButton run={cancelLeave.bind(null, r.id)} variant="ghost" className="h-7 text-xs"
                      confirm={r.status === 'approved' ? 'Cancel this approved leave? Your manager is told.' : 'Withdraw this request?'}>{r.status === 'approved' ? 'Cancel' : 'Withdraw'}</ActionButton> : null,
                  },
                }
              })} />
          </Card>
          <Card title="Apply for leave" description="Your manager approves it; until then it shows as waiting">
            <ActionForm action={applyLeave} submit="Apply">
              <label className="flex flex-col gap-1"><span className="label">Type</span>
                <NativeSelect size="sm" name="leave_type_id" required containerClassName="w-full">
                  {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.optional_holidays_only ? ' (on an optional holiday)' : ''}</option>)}
                </NativeSelect></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1"><span className="label">From</span><Input type="date" name="start_date" required defaultValue={todayIso} /></label>
                <label className="flex flex-col gap-1"><span className="label">To</span><Input type="date" name="end_date" defaultValue={todayIso} /></label>
              </div>
              <label className="flex items-center gap-2 text-[13px]"><Checkbox name="half_day" value="on" />Half day (one day only)</label>
              <label className="flex flex-col gap-1"><span className="label">Reason (optional)</span>
                <Textarea name="reason" rows={2} maxLength={1000} placeholder="Seen by your manager only" /></label>
            </ActionForm>
          </Card>
        </div>
      </>
    )
  }

  // ---------------------------------------------------------------- approvals
  async function Approvals({ meId }: { meId: string }) {
    const { data: pending } = await supabase.from('leave_requests')
      .select('id, profile_id, start_date, end_date, half_day, days, reason, created_at, leave_types(name), person:profiles!leave_requests_profile_id_fkey(full_name)')
      .eq('status', 'pending').neq('profile_id', meId).order('start_date')
    const { data: recent } = await supabase.from('leave_requests')
      .select('id, start_date, end_date, days, status, decided_at, leave_types(name), person:profiles!leave_requests_profile_id_fkey(full_name)')
      .in('status', ['approved', 'declined']).eq('decided_by', meId).order('decided_at', { ascending: false }).limit(20)
    return (
      <>
        <Card flush title="Waiting for you" description="Approved leave comes off their balance and out of billing and timesheets">
          <DataGrid label="Leave waiting for approval"
            empty={<Empty title="Nothing to approve">Requests from the people who report to you show here.</Empty>}
            columns={[
              { key: 'who', label: 'Person', sortable: true, className: 'w-[150px]' },
              { key: 'dates', label: 'Dates', sortable: true, className: 'w-[170px]' },
              { key: 'type', label: 'Type', className: 'w-[130px]' },
              { key: 'days', label: 'Days', align: 'right', className: 'w-[60px]' },
              { key: 'reason', label: 'Reason' },
              { key: 'act', label: <span className="sr-only">Decide</span>, align: 'right', className: 'w-[340px]' },
            ]}
            rows={(pending ?? []).map((r) => ({
              id: r.id,
              values: { who: r.person?.full_name, dates: r.start_date },
              cells: {
                who: <span className="block truncate font-medium">{r.person?.full_name}</span>,
                dates: <span className="text-xs">{range(r.start_date, r.end_date)}{r.half_day ? ' · half' : ''}</span>,
                type: <span className="text-xs">{r.leave_types?.name}</span>,
                days: <span className="tabular font-mono text-xs">{+Number(r.days).toFixed(1)}</span>,
                reason: <span className="block max-w-[260px] truncate text-xs text-muted-foreground" title={r.reason}>{r.reason || '–'}</span>,
                act: <LeaveDecision id={r.id} name={r.person?.full_name ?? 'them'} />,
              },
            }))} />
        </Card>
        {recent?.length ? (
          <Card flush title="You decided recently">
            <DataGrid label="Recently decided"
              columns={[
                { key: 'who', label: 'Person', className: 'w-[150px]' }, { key: 'dates', label: 'Dates', className: 'w-[170px]' },
                { key: 'type', label: 'Type', className: 'w-[130px]' }, { key: 'days', label: 'Days', align: 'right', className: 'w-[60px]' },
                { key: 'status', label: 'Decision', className: 'w-[110px]' }, { key: 'when', label: 'When' },
              ]}
              rows={recent.map((r) => {
                const [tone, text] = STATUS[r.status as keyof typeof STATUS]
                return {
                  id: r.id,
                  cells: {
                    who: <span className="block truncate">{r.person?.full_name}</span>,
                    dates: <span className="text-xs">{range(r.start_date, r.end_date)}</span>,
                    type: <span className="text-xs">{r.leave_types?.name}</span>,
                    days: <span className="tabular font-mono text-xs">{+Number(r.days).toFixed(1)}</span>,
                    status: <Chip tone={tone} dot>{text}</Chip>,
                    when: <span className="text-xs text-muted-foreground">{r.decided_at ? relativeTime(r.decided_at) : ''}</span>,
                  },
                }
              })} />
          </Card>
        ) : null}
      </>
    )
  }

  // ---------------------------------------------------------------- team calendar
  async function Team({ month, todayIso }: { month?: string; todayIso: string }) {
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : todayIso.slice(0, 7)
    const first = new Date(`${m}-01T00:00:00Z`)
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    const from = first.toISOString().slice(0, 10), to = last.toISOString().slice(0, 10)
    const shift = (n: number) => { const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1)); return d.toISOString().slice(0, 7) }
    const [{ data: leave }, { data: hols }, { data: staff }] = await Promise.all([
      supabase.rpc('team_leave', { p_from: from, p_to: to }),
      supabase.from('holidays').select('day, name, optional').gte('day', from).lte('day', to),
      supabase.from('directory').select('id, full_name').eq('kind', 'internal').is('access_revoked_at', null).order('full_name'),
    ])
    const calDays: CalendarDay[] = Array.from({ length: last.getUTCDate() }, (_, i) => {
      const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))
      const iso = d.toISOString().slice(0, 10)
      const h = (hols ?? []).find((x) => x.day === iso)
      return { iso, label: String(i + 1), weekday: d.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }), weekend: [0, 6].includes(d.getUTCDay()),
        holiday: h?.name ?? null, optional: !!h?.optional, today: iso === todayIso }
    })
    const people: CalendarPerson[] = (staff ?? []).map((p) => ({
      id: p.id!, name: p.full_name!,
      days: calDays.map((d) => {
        const l = (leave ?? []).find((x) => x.profile_id === p.id && x.start_date <= d.iso && x.end_date >= d.iso)
        return l && !d.weekend && !(d.holiday && !d.optional) ? { kind: l.status as 'approved' | 'pending', half: l.half_day, type: l.type_name } : null
      }),
    }))
    const away = people.filter((p) => p.days.some(Boolean))
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Month" className="inline-flex h-8 items-center rounded-md border border-border bg-card">
            <Link href={`/leave?tab=team&month=${shift(-1)}`} aria-label="Previous month" className="grid h-full w-8 place-items-center text-foreground no-underline hover:bg-muted"><ChevronLeft className="size-4" /></Link>
            <span className="border-x border-border px-3 text-[13px] font-medium">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
            <Link href={`/leave?tab=team&month=${shift(1)}`} aria-label="Next month" className="grid h-full w-8 place-items-center text-foreground no-underline hover:bg-muted"><ChevronRight className="size-4" /></Link>
          </nav>
          <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />Approved</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm border border-dashed border-primary bg-primary/15" />Waiting</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-warn/30" />Holiday</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted ring-1 ring-border" />Weekend</span>
          </span>
        </div>
        <Card flush title="Who is away" description={away.length ? `${away.length} of ${people.length} people have leave this month` : 'Nobody has leave this month'}>
          <TeamCalendar days={calDays} people={people} />
        </Card>
        {(hols ?? []).length ? <p className="m-0 text-xs text-muted-foreground">Holidays this month: {(hols ?? []).map((h) => `${fmt(h.day)} ${h.name}${h.optional ? ' (optional)' : ''}`).join(' · ')}</p> : null}
      </>
    )
  }

  // ---------------------------------------------------------------- holidays
  async function Holidays({ year, admin }: { year: number; admin: boolean }) {
    const { data: hols } = await supabase.from('holidays').select('id, day, name, optional').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day')
    const fixed = (hols ?? []).filter((h) => !h.optional)
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Year" className="inline-flex h-8 items-center rounded-md border border-border bg-card">
            <Link href={`/leave?tab=holidays&year=${year - 1}`} aria-label="Previous year" className="grid h-full w-8 place-items-center text-foreground no-underline hover:bg-muted"><ChevronLeft className="size-4" /></Link>
            <span className="tabular border-x border-border px-3 text-[13px] font-medium">{year}</span>
            <Link href={`/leave?tab=holidays&year=${year + 1}`} aria-label="Next year" className="grid h-full w-8 place-items-center text-foreground no-underline hover:bg-muted"><ChevronRight className="size-4" /></Link>
          </nav>
          <span className="text-xs text-muted-foreground">{fixed.length} company holidays{(hols ?? []).length - fixed.length ? ` · ${(hols ?? []).length - fixed.length} optional` : ''}</span>
        </div>
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card flush title={`Holidays ${year}`} description="Company holidays are not working days anywhere in Helm. Optional holidays: take up to your allowance, as Optional holiday leave.">
            <DataGrid label="Holidays"
              empty={<Empty title={`No holidays for ${year} yet`}>{admin ? 'Add them on the right.' : 'An admin adds the holiday list.'}</Empty>}
              columns={[
                { key: 'date', label: 'Date', className: 'w-[120px]' }, { key: 'day', label: 'Day', className: 'w-[100px]' },
                { key: 'name', label: 'Holiday' }, { key: 'kind', label: 'Kind', className: 'w-[110px]' },
                ...(admin ? [{ key: 'act', label: <span className="sr-only">Remove</span>, align: 'right' as const, className: 'w-[90px]' }] : []),
              ]}
              rows={(hols ?? []).map((h) => ({
                id: h.id,
                className: h.day < todayIso ? 'opacity-60' : undefined,
                cells: {
                  date: <span className="tabular font-mono text-xs">{fmt(h.day, { day: 'numeric', month: 'short' })}</span>,
                  day: <span className="text-xs text-muted-foreground">{fmt(h.day, { weekday: 'long' })}</span>,
                  name: <span className="font-medium">{h.name}</span>,
                  kind: h.optional ? <Chip tone="info">Optional</Chip> : <Chip tone="warn">Holiday</Chip>,
                  act: <ActionButton run={removeHoliday.bind(null, h.id)} variant="ghost" className="h-7 text-xs" confirm={`Remove ${h.name} from the holiday list?`}>Remove</ActionButton>,
                },
              }))} />
          </Card>
          {admin ? (
            <div className="flex flex-col gap-3">
              <Card title="Add a holiday">
                <ActionForm action={addHoliday} submit="Add holiday">
                  <label className="flex flex-col gap-1"><span className="label">Date</span><Input type="date" name="day" required defaultValue={`${year}-01-01`} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Name</span><Input name="name" required maxLength={80} placeholder="e.g. Diwali" /></label>
                  <label className="flex items-center gap-2 text-[13px]"><Checkbox name="optional" value="on" />Optional (restricted) holiday</label>
                </ActionForm>
              </Card>
              <Card title="Quick start" description="The holidays on the same date every year; add Holi, Eid, Diwali and the rest by date">
                <ActionButton run={addFixedHolidays.bind(null, year)}>Add 26 Jan, 15 Aug, 2 Oct and 25 Dec {year}</ActionButton>
              </Card>
            </div>
          ) : null}
        </div>
      </>
    )
  }
}
