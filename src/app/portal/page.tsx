import type { Metadata } from 'next'
import Link from 'next/link'
import { completeAction } from '@/app/_actions/requests'
import { ActionButton } from '@/components/forms'
import { UpdateCard } from '@/components/project-parts'
import { Greeting, GreetingChip } from '@/components/shell/greeting'
import { Card, Chip, Empty, Health, Progress, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { daysFromToday, isoDaysAgo, money, shortDate } from '@/lib/format'
import { formByKey } from '@/lib/forms'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ExecHome } from './exec-home'

export const metadata: Metadata = { title: 'Home' }

const TYPE: Record<Enums<'action_type'>, { label: string; tone: 'review' | 'warn' | 'info' | 'neutral'; cta: string }> = {
  approval: { label: 'Approval', tone: 'review', cta: 'Review & approve' }, clarification: { label: 'Clarification', tone: 'warn', cta: 'Respond' },
  uat: { label: 'UAT', tone: 'info', cta: 'Mark reviewed' }, upload: { label: 'Upload', tone: 'neutral', cta: 'Mark done' },
  form: { label: 'Form', tone: 'neutral', cta: 'Mark done' }, task: { label: 'Task', tone: 'info', cta: 'Mark done' },
  decision: { label: 'Decision', tone: 'review', cta: 'Mark done' }, invoice: { label: 'Invoice', tone: 'neutral', cta: 'Mark done' },
  meeting_action: { label: 'Meeting action', tone: 'neutral', cta: 'Mark done' },
}

/** The customer's action centre: what needs me, where are we, what happened, what's next. */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ submitted?: string; view?: string }> }) {
  const me = await requireCustomer()
  const sp = await searchParams
  const thanks = sp.submitted ? formByKey(sp.submitted) : undefined
  // executives get the status view; they can still open the team's action centre
  if (me.customer_role === 'customer_exec' && sp.view !== 'actions') return <>{thanks ? <Thanks title={thanks.title} /> : null}<ExecHome me={me} /></>
  const supabase = await createClient()
  const [{ data: actions }, { data: projects }, { data: progress }, { data: phases }, { data: tasks }, { data: updates }, { data: invoices }, { count: doneThisWeek }] = await Promise.all([
    supabase.from('action_items').select('*, projects(name)').eq('status', 'open').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('projects').select('id, name, health, pm:profiles!projects_pm_id_fkey(full_name)').eq('status', 'active').order('name'),
    supabase.from('project_progress').select('*'),
    supabase.from('phases').select('id, name, project_id, position').order('position'),
    supabase.from('tasks').select('id, title, status, due_date, phase_id, project_id, spotlight').order('due_date'),
    supabase.from('updates').select('*, author:profiles!updates_author_id_fkey(full_name), projects(name)').eq('status', 'published').order('published_at', { ascending: false }).limit(1),
    me.can_view_invoices ? supabase.from('invoices').select('*').neq('status', 'paid').order('due_on').limit(4) : Promise.resolve({ data: null }),
    supabase.from('action_items').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('completed_at', isoDaysAgo(7)),
  ])
  const mine = (actions ?? []).filter((a) => a.assignee_id === me.id || !a.assignee_id)
  const others = (actions ?? []).filter((a) => a.assignee_id && a.assignee_id !== me.id)
  const prog = new Map((progress ?? []).map((p) => [p.project_id, p.total ? (100 * (p.done ?? 0)) / p.total : 0]))
  const t = tasks ?? []
  const nextMilestones = t.filter((x) => x.status !== 'done' && x.due_date && (daysFromToday(x.due_date) ?? -1) >= 0).slice(0, 4)
  const onTrack = (projects ?? []).filter((p) => p.health === 'on_track').length
  const n = mine.length
  const first = me.full_name.split(' ')[0] ?? me.full_name
  const contact = projects?.[0]?.pm?.full_name

  return (
    <div className="flex flex-col gap-3.5">
      {thanks ? <Thanks title={thanks.title} /> : null}
      <Greeting name={first}
        lines={{
          morning: n ? `A calm start. ${n} small ${n === 1 ? 'thing needs' : 'things need'} you today.` : 'You are all caught up. Nothing needs you right now, enjoy the day.',
          afternoon: n ? `Hope the day is going well. ${n} ${n === 1 ? 'item is' : 'items are'} waiting whenever you have a moment.` : 'All caught up. Nothing is waiting for you.',
          evening: n ? 'Winding down? Here is a short list for tomorrow. Nothing is on fire.' : 'All caught up. Have a good evening.',
          night: 'Working late? Nothing here is urgent tonight. It will all be here in the morning.',
        }}
        chips={<>
          <GreetingChip><b className="font-mono">{n}</b> for you today</GreetingChip>
          <GreetingChip><b className="font-mono">{onTrack} of {projects?.length ?? 0}</b> projects on track</GreetingChip>
          {nextMilestones[0] ? <GreetingChip>Next: <b>{nextMilestones[0].title}, {shortDate(nextMilestones[0].due_date)}</b></GreetingChip> : null}
          {contact ? <GreetingChip>Your contact: <b>{contact}</b></GreetingChip> : null}
        </>} />

      <div className="flex flex-wrap items-start gap-3.5">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5">
          <Card flush className="overflow-x-auto" title={n ? `${n} ${n === 1 ? 'item needs' : 'items need'} your attention` : 'Nothing needs your attention'} extra={`${doneThisWeek ?? 0} done this week`}>
            {n ? (
              <div className="min-w-[660px]">
                <div className="row row-head grid-cols-[110px_minmax(0,1fr)_170px_90px_150px]"><span>Type</span><span>Item</span><span>Project</span><span>Due</span><span /></div>
                {mine.map((a) => {
                  const late = (daysFromToday(a.due_date) ?? 0) < 0
                  const ty = TYPE[a.type]
                  return (
                    <div key={a.id} className="row min-h-10 grid-cols-[110px_minmax(0,1fr)_170px_90px_150px] text-[14px]">
                      <span><Chip tone={ty.tone}>{ty.label}</Chip></span>
                      <span className="truncate font-medium">{a.title}</span>
                      <span className="truncate text-[13px] text-muted">{a.projects?.name ?? '–'}</span>
                      <span className={cn('font-mono text-xs', late && 'font-semibold text-crit-ink')}>{late ? `${-(daysFromToday(a.due_date) ?? 0)}d late` : shortDate(a.due_date)}</span>
                      <span className="text-right">
                        {a.type === 'approval' ? <Link href={a.request_id ? `/portal/requests/${a.request_id}` : `/portal/approvals/${a.approval_id}`} className="btn btn-primary">{ty.cta}</Link>
                          : a.form_key ? <Link href={`/portal/forms/${a.form_key}?project=${a.project_id ?? ''}&action=${a.id}`} className="btn btn-primary">{a.form_key === 'uat_feedback' ? 'Give feedback' : 'Fill in form'}</Link>
                          : <ActionButton run={completeAction.bind(null, a.id)}>{ty.cta}</ActionButton>}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : <Empty title="You're all caught up">We will let you know when Seven Billion needs something.</Empty>}
            {others.length ? <p className="m-0 border-t border-line-soft px-3.5 py-2 text-xs text-muted">{others.length} more {others.length === 1 ? 'item is' : 'items are'} with your colleagues.</p> : null}
          </Card>

          <Card flush className="overflow-x-auto" title="Projects">
            <div className="min-w-[660px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_130px_120px_240px_60px]"><span>Project</span><span>Status</span><span>Progress</span><span>Phases</span><span /></div>
              {(projects ?? []).map((p) => {
                const ph = (phases ?? []).filter((x) => x.project_id === p.id)
                const now = ph.find((x) => t.some((k) => k.phase_id === x.id && k.status !== 'done'))
                return (
                  <div key={p.id} className="row min-h-[52px] grid-cols-[minmax(0,1fr)_130px_120px_240px_60px] text-[14px]">
                    <span className="flex min-w-0 flex-col"><span className="truncate font-semibold">{p.name}</span><span className="truncate text-xs text-muted">Now: {now?.name ?? 'Wrapping up'}</span></span>
                    <Health health={p.health} className="text-[13px]" />
                    <Progress value={prog.get(p.id) ?? 0} width={60} />
                    <span className="flex gap-[3px]">
                      {ph.map((x) => {
                        const pts = t.filter((k) => k.phase_id === x.id)
                        const state = pts.length && pts.every((k) => k.status === 'done') ? 2 : pts.some((k) => k.status !== 'todo') ? 1 : 0
                        return <span key={x.id} title={`${x.name}: ${['upcoming', 'in progress', 'done'][state]}`} className={cn('h-2 flex-1 rounded-sm', state === 2 ? 'bg-info-ink' : state === 1 ? 'bg-[#6da7ec]' : 'bg-line')} />
                      })}
                    </span>
                    <Link href={`/portal/projects/${p.id}`} className="text-right text-[13px] font-medium">Open</Link>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5">
          {updates?.[0] ? <UpdateCard u={updates[0]} projectName={updates[0].projects?.name} /> : null}
          <Card flush title="Upcoming milestones">
            {nextMilestones.length ? nextMilestones.map((m) => (
              <div key={m.id} className="row min-h-9 grid-cols-[56px_minmax(0,1fr)]"><span className="font-mono text-xs text-muted">{shortDate(m.due_date)}</span><span className="truncate">{m.title}</span></div>
            )) : <Empty title="No upcoming milestones" />}
          </Card>
          {invoices ? (
            <Card flush title="Invoices" extra={<Link href="/portal/invoices">All invoices</Link>}>
              {invoices.length ? invoices.map((i) => (
                <div key={i.id} className="row grid-cols-[110px_minmax(0,1fr)_70px_70px] text-[13px]">
                  <span className="truncate font-mono text-xs" title={i.number}>{i.number}</span><span className="text-right font-mono text-xs">{money(i.balance, i.currency)}</span>
                  <span className="font-mono text-xs">{shortDate(i.due_on)}</span><span><Chip tone={(daysFromToday(i.due_on) ?? 0) < 0 ? 'crit' : 'info'}>{(daysFromToday(i.due_on) ?? 0) < 0 ? 'Overdue' : 'Due'}</Chip></span>
                </div>
              )) : <Empty title="Nothing due" />}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Thanks({ title }: { title: string }) {
  return <p role="status" className="m-0 rounded-md border border-good-bg bg-good-bg px-3 py-2 text-[13px] font-medium text-good-ink">Thank you. Your {title} form was sent to Seven Billion.</p>
}
