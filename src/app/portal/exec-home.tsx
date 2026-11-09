import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { DataGrid } from '@/components/data-grid'
import { Greeting, GreetingChip } from '@/components/shell/greeting'
import { btn, Card, Chip, Empty, Health } from '@/components/ui'
import { ProgressRing } from '@/components/viz'
import { PortalMeters } from '@/components/portal-meters'
import { daysFromToday, money, relativeTime, shortDate } from '@/lib/format'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { YourTeam } from '@/components/your-team'
import { PortalAway } from '@/components/portal-away'

/** Customer Executive home: is my engagement going to plan, and what needs a decision from me? */
export async function ExecHome({ me, surveys }: { me: Profile; surveys?: React.ReactNode }) {
  const supabase = await createClient()
  const [{ data: projects }, { data: progress }, { data: phases }, { data: tasks }, { data: approvals }, { data: decisions }, { data: docs }, { data: updates }, { data: invoices }] = await Promise.all([
    supabase.from('projects').select('id, name, health, end_date, pm:profiles!projects_pm_id_fkey(full_name)').eq('status', 'active').order('name'),
    supabase.from('project_progress').select('*'),
    supabase.from('phases').select('id, name, project_id, position').order('position'),
    supabase.from('tasks').select('id, title, status, due_date, phase_id, project_id, owner_side').order('due_date'),
    supabase.from('approvals').select('id, title, due_date, request_id, approver_id, approver:profiles!approvals_approver_id_fkey(full_name)').eq('status', 'pending').order('due_date'),
    supabase.from('decisions').select('id, number, decision, decided_on').order('decided_on', { ascending: false }).limit(5),
    supabase.from('documents').select('id, name, created_at, version').order('created_at', { ascending: false }).limit(5),
    supabase.from('updates').select('project_id, published_at').eq('status', 'published').order('published_at', { ascending: false }),
    me.can_view_invoices ? supabase.from('invoices').select('id, number, balance, currency, due_on, status').neq('status', 'paid').order('due_on') : Promise.resolve({ data: null }),
  ])
  const p = projects ?? []
  const t = tasks ?? []
  const prog = new Map((progress ?? []).map((x) => [x.project_id, x.total ? (100 * (x.done ?? 0)) / x.total : 0]))
  const lastUpdate = new Map<string, string>()
  for (const u of updates ?? []) if (u.published_at && !lastUpdate.has(u.project_id)) lastUpdate.set(u.project_id, u.published_at)
  const onTrack = p.filter((x) => x.health === 'on_track').length
  const mine = (approvals ?? []).filter((a) => a.approver_id === me.id)
  const nextMilestone = t.find((x) => x.status !== 'done' && x.due_date && (daysFromToday(x.due_date) ?? -1) >= 0)
  const first = me.full_name.split(' ')[0] ?? me.full_name

  return (
    <div className="flex flex-col gap-3.5">
      <Greeting name={first}
        lines={{
          morning: `${onTrack} of ${p.length} projects are on track.${mine.length ? ` ${mine.length} ${mine.length === 1 ? 'decision waits' : 'decisions wait'} for you.` : ' Nothing needs your decision today.'}`,
          afternoon: `Here is where your engagement stands.${mine.length ? ` ${mine.length} ${mine.length === 1 ? 'approval is' : 'approvals are'} with you.` : ''}`,
          evening: 'A short summary for the end of the day. Nothing here needs you tonight.',
          night: 'Everything will be here in the morning.',
        }}
        chips={<>
          <GreetingChip><b className="font-mono">{onTrack} of {p.length}</b> on track</GreetingChip>
          {nextMilestone ? <GreetingChip>Next milestone: <b>{nextMilestone.title}, {shortDate(nextMilestone.due_date)}</b></GreetingChip> : null}
        </>} />
      {/* the meters first; the quick check-in after them */}
      <PortalMeters me={me} decisions={mine.length} />
      {surveys}

      <div className="flex flex-wrap items-start gap-3.5">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5">
          <Card flush title="Engagement status">
            {/* phones: one card per project */}
            <ul className="m-0 list-none divide-y divide-border/60 p-0 sm:hidden">
              {p.map((x) => (
                <li key={x.id}>
                  <Link href={`/portal/projects/${x.id}`} className="flex items-center gap-3 px-4 py-3.5 text-ink no-underline active:bg-head">
                    <ProgressRing value={prog.get(x.id) ?? 0} size={44} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-semibold">{x.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Health health={x.health} />ends {shortDate(x.end_date)}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 flex-none text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="max-sm:hidden">
              <DataGrid label="Engagement status"
                empty={<Empty title="No active projects" />}
                columns={[
                  { key: 'project', label: 'Project' }, { key: 'status', label: 'Status', className: 'w-[150px]' },
                  { key: 'progress', label: 'Progress', className: 'w-[90px]' }, { key: 'now', label: 'Now', className: 'w-[160px]' },
                  { key: 'update', label: 'Last update', className: 'w-[110px]' },
                  { key: 'open', label: <span className="sr-only">Open</span>, align: 'right', className: 'w-[60px]' },
                ]}
                rows={p.map((x) => {
                  const now = (phases ?? []).filter((ph) => ph.project_id === x.id).find((ph) => t.some((k) => k.phase_id === ph.id && k.status !== 'done'))
                  return {
                    id: x.id, href: `/portal/projects/${x.id}`,
                    cells: {
                      project: <span className="flex min-w-0 flex-col py-1"><Link href={`/portal/projects/${x.id}`} className="truncate font-semibold text-foreground no-underline hover:underline">{x.name}</Link><span className="truncate text-xs text-muted-foreground">PM {x.pm?.full_name ?? '–'} · ends {shortDate(x.end_date)}</span></span>,
                      status: <Health health={x.health} />,
                      progress: <ProgressRing value={prog.get(x.id) ?? 0} size={34} />,
                      now: <span className="block max-w-[160px] truncate">{now?.name ?? 'Wrapping up'}</span>,
                      update: <span className="text-xs text-muted-foreground">{lastUpdate.has(x.id) ? relativeTime(lastUpdate.get(x.id)!) : '–'}</span>,
                      open: <Link href={`/portal/projects/${x.id}`} className="text-[13px] font-medium">Open</Link>,
                    },
                  }
                })} />
            </div>
          </Card>

          <Card flush title="Waiting for a decision" extra={<Link href="/portal/requests">All requests</Link>}>
            {(approvals ?? []).length ? (approvals ?? []).map((a) => (
              <div key={a.id} className="row min-h-10 grid-cols-[minmax(0,1fr)_150px_70px_140px] text-[14px] max-sm:grid-cols-1 max-sm:gap-y-2 max-sm:py-3.5">
                <span className="truncate font-medium max-sm:whitespace-normal">{a.title}</span>
                <span className="truncate text-[13px] text-muted-foreground max-sm:hidden">{a.approver_id === me.id ? 'You' : a.approver?.full_name}</span>
                <span className="font-mono text-xs max-sm:text-muted-foreground"><span className="sm:hidden">{a.approver_id === me.id ? 'You' : a.approver?.full_name} · due </span>{shortDate(a.due_date)}</span>
                <span className="text-right max-sm:text-left">{a.approver_id === me.id
                  ? <Link href={a.request_id ? `/portal/requests/${a.request_id}` : `/portal/approvals/${a.id}`} className={btn('default', 'max-sm:w-full')}>Review & approve</Link>
                  : <Chip tone="warn">With your team</Chip>}</span>
              </div>
            )) : <Empty title="No open approvals" />}
          </Card>
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5">
          <YourTeam />
          <PortalAway />
          <Card flush title="Recent decisions" extra={<Link href="/portal/decisions">Decision log</Link>}>
            {(decisions ?? []).length ? (decisions ?? []).map((d) => (
              <div key={d.id} className="row grid-cols-[64px_minmax(0,1fr)] py-1.5"><span className="font-mono text-xs text-muted-foreground">{d.number}</span><span className="leading-snug">{d.decision}</span></div>
            )) : <Empty title="No decisions yet" />}
          </Card>
          <Card flush title="Latest deliverables" extra={<Link href="/portal/documents">All documents</Link>}>
            {(docs ?? []).length ? (docs ?? []).map((d) => (
              <a key={d.id} href={`/api/documents/${d.id}`} className="row grid-cols-[minmax(0,1fr)_70px] text-ink no-underline hover:bg-head">
                <span className="truncate">{d.name} <span className="font-mono text-xs text-muted-foreground">v{d.version}</span></span><span className="text-xs text-muted-foreground">{relativeTime(d.created_at)}</span>
              </a>
            )) : <Empty title="No documents yet" />}
          </Card>
          {invoices ? (
            <Card flush title="Commercial status" extra={<Link href="/portal/invoices">Invoices</Link>}>
              {invoices.length ? invoices.map((i) => (
                <div key={i.id} className="row grid-cols-[110px_minmax(0,1fr)_96px] text-[13px]">
                  <span className="truncate font-mono text-xs" title={i.number}>{i.number}</span><span className="text-right font-mono text-xs">{money(i.balance, i.currency)}</span>
                  <span>{(daysFromToday(i.due_on) ?? 0) < 0 ? <Chip tone="crit">Overdue</Chip> : <Chip tone="info">Due {shortDate(i.due_on)}</Chip>}</span>
                </div>
              )) : <Empty title="Nothing outstanding" />}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
