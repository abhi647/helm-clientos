import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UpdateCard } from '@/components/project-parts'
import { Thread } from '@/components/thread'
import { Avatar, Card, Chip, Health, Progress, TaskStatusChip, cn } from '@/components/ui'
import { isOverdue, shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Project' }

/** The customer's view of a project: shared phases and tasks only (enforced by RLS), no effort or internal notes. */
export default async function PortalProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ task?: string }> }) {
  const me = await requireCustomer()
  const [{ id }, { task }] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const { data: p } = await supabase.from('projects').select('id, customer_id, name, status, health, start_date, end_date, pm:profiles!projects_pm_id_fkey(full_name)').eq('id', id).maybeSingle()
  if (!p) notFound()
  const [{ data: phases }, { data: tasks }, { data: prog }, { data: updates }] = await Promise.all([
    supabase.from('phases').select('*').eq('project_id', id).order('position'),
    supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(full_name, kind)').eq('project_id', id).order('position'),
    supabase.from('project_progress').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('updates').select('*, author:profiles!updates_author_id_fkey(full_name)').eq('project_id', id).eq('status', 'published').order('published_at', { ascending: false }).limit(3),
  ])
  const sel = task ? tasks?.find((t) => t.id === task) : undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/portal" className="text-xs font-medium">← Home</Link>
        <h1 className="m-0 text-xl font-semibold">{p.name}</h1>
        <Health health={p.health} />
        <Progress value={prog?.total ? (100 * (prog.done ?? 0)) / prog.total : 0} />
        <span className="font-mono text-xs text-muted">{shortDate(p.start_date)} → {shortDate(p.end_date)}</span>
        <span className="text-xs text-muted">Your Seven Billion lead: <b className="font-medium text-ink">{p.pm?.full_name}</b></span>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <Card flush className="min-w-0 flex-[999_1_560px] overflow-x-auto" title="Plan">
          <div className="min-w-[620px]">
            {(phases ?? []).map((ph) => {
              const pts = (tasks ?? []).filter((t) => t.phase_id === ph.id)
              return (
                <div key={ph.id}>
                  <div className="row row-head grid-cols-[minmax(0,1fr)_120px_140px_70px] text-ink normal-case"><span className="text-[13px] tracking-normal">{ph.name}</span><span /><span /><span /></div>
                  {pts.map((t) => (
                    <div key={t.id} className={cn('row min-h-9 grid-cols-[minmax(0,1fr)_120px_140px_70px]', sel?.id === t.id && 'bg-selected')}>
                      <Link href={`/portal/projects/${id}?task=${t.id}`} className={cn('truncate no-underline hover:underline', t.status === 'done' ? 'text-muted' : 'font-medium text-ink')}>
                        {t.status === 'done' ? '✓ ' : ''}{t.title}{t.spotlight ? <Chip tone="dark" className="ml-2">★ Needs you</Chip> : null}
                      </Link>
                      <span><TaskStatusChip status={t.status} overdue={t.status !== 'done' && isOverdue(t.due_date)} /></span>
                      <span className="flex min-w-0 items-center gap-1.5">{t.assignee ? <><Avatar name={t.assignee.full_name} customer={t.assignee.kind === 'customer'} /><span className="truncate text-[13px]">{t.assignee.full_name}</span></> : null}</span>
                      <span className="font-mono text-xs text-muted">{shortDate(t.due_date)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </Card>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
          {sel ? (
            <Card title={sel.title} extra={<Link href={`/portal/projects/${id}`} aria-label="Close">✕</Link>}>
              <div className="flex flex-col gap-2.5">
                <span className="flex gap-1.5"><TaskStatusChip status={sel.status} overdue={sel.status !== 'done' && isOverdue(sel.due_date)} /></span>
                {sel.description ? <p className="m-0 text-[13px] leading-relaxed">{sel.description}</p> : null}
                <span className="text-xs text-muted">Due {shortDate(sel.due_date)} · {sel.assignee?.full_name ?? 'Seven Billion'}</span>
                <Thread entityType="task" entityId={sel.id} customerId={sel.customer_id} me={me} />
              </div>
            </Card>
          ) : null}
          {(updates ?? []).map((u) => <UpdateCard key={u.id} u={u} />)}
        </div>
      </div>
    </div>
  )
}
