import type { Metadata } from 'next'
import Link from 'next/link'
import { createTask, logTime, setSpotlight, setTaskStatus } from '@/app/_actions/work'
import { ActionButton, ActionForm, StatusSelect } from '@/components/forms'
import { Thread } from '@/components/thread'
import { Avatar, Chip, TaskStatusChip, Visibility, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS, isOverdue, shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Project plan' }

type Search = { task?: string; preview?: string; open?: string; q?: string; created?: string }

export default async function Plan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params
  const sp = await searchParams
  const me = await requireStaff()
  const preview = sp.preview === '1'
  const openOnly = sp.open === '1'
  const q = (sp.q ?? '').trim().toLowerCase()
  const supabase = await createClient()
  const [{ data: project }, { data: phases }, { data: tasks }, { data: time }, { data: comments }] = await Promise.all([
    supabase.from('projects').select('id, customer_id, pm_id').eq('id', id).single(),
    supabase.from('phases').select('*').eq('project_id', id).order('position'),
    supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, kind), task_estimates(estimate_hours)').eq('project_id', id).order('position'),
    supabase.from('time_entries').select('task_id, hours').in('task_id', (await supabase.from('tasks').select('id').eq('project_id', id)).data?.map((t) => t.id) ?? []),
    supabase.from('comments').select('entity_id').eq('entity_type', 'task'),
  ])
  if (!project) return null
  const people = (await supabase.from('profiles').select('id, full_name, kind').or(`kind.eq.internal,customer_id.eq.${project.customer_id}`).order('kind').order('full_name')).data ?? []

  const logged = new Map<string, number>()
  for (const t of time ?? []) logged.set(t.task_id, (logged.get(t.task_id) ?? 0) + Number(t.hours))
  const commentCount = new Map<string, number>()
  for (const c of comments ?? []) commentCount.set(c.entity_id, (commentCount.get(c.entity_id) ?? 0) + 1)

  const all = tasks ?? []
  const visible = all.filter((t) => (!preview || t.visibility === 'shared') && (!openOnly || t.status !== 'done') && (!q || t.title.toLowerCase().includes(q)))
  const counted = all.filter((t) => !preview || t.visibility === 'shared')
  const est = (t: (typeof all)[number]) => Number(t.task_estimates?.estimate_hours ?? 0)
  const stats = {
    total: counted.length, done: counted.filter((t) => t.status === 'done').length,
    overdue: counted.filter((t) => t.status !== 'done' && isOverdue(t.due_date)).length,
    customer: counted.filter((t) => t.owner_side === 'customer' && t.status !== 'done').length,
    est: all.reduce((a, t) => a + est(t), 0), logged: Array.from(logged.values()).reduce((a, b) => a + b, 0),
  }
  const sel = sp.task ? all.find((t) => t.id === sp.task && (!preview || t.visibility === 'shared')) : undefined
  const cols = preview ? 'grid-cols-[minmax(240px,1fr)_118px_140px_64px_64px_84px_24px]' : 'grid-cols-[minmax(240px,1fr)_118px_140px_64px_64px_52px_60px_84px_24px]'
  const link = (patch: Partial<Search>) => {
    const next = new URLSearchParams(Object.entries({ ...sp, created: undefined, ...patch }).filter(([, v]) => v) as [string, string][])
    const s = next.toString()
    return `/projects/${id}${s ? `?${s}` : ''}`
  }
  const statusOptions = (Object.keys(TASK_STATUS) as Enums<'task_status'>[]).map((v) => ({ value: v, label: TASK_STATUS[v] }))

  return (
    <div className="flex flex-col gap-2.5 p-4">
      {sp.created ? <p role="status" className="m-0 rounded-md bg-good-bg px-3 py-2 text-xs font-medium text-good-ink">Project created from the template. Assign the customer tasks, then share the portal.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex h-[30px] items-center rounded-md border border-[#d5dcdf] bg-white px-2">
          {preview ? <input type="hidden" name="preview" value="1" /> : null}
          {openOnly ? <input type="hidden" name="open" value="1" /> : null}
          <input name="q" defaultValue={sp.q} aria-label="Filter tasks" placeholder="Filter tasks" className="w-40 border-0 bg-transparent text-[13px] outline-none" />
        </form>
        <Link href={link({ open: openOnly ? undefined : '1' })} className={cn('btn', openOnly && 'border-brand bg-selected font-semibold')}>Open only</Link>
        <Link href={link({ preview: preview ? undefined : '1', task: undefined })} className={cn('btn', preview && 'border-brand bg-selected font-semibold')}>{preview ? 'Exit customer preview' : 'Customer preview'}</Link>
        <div className="ml-2 flex flex-wrap gap-3 text-xs text-muted">
          <span><b className="font-mono text-ink">{stats.total}</b> tasks</span>
          <span><b className="font-mono text-good-ink">{stats.done}</b> done</span>
          <span><b className="font-mono text-crit-ink">{stats.overdue}</b> overdue</span>
          <span><b className="font-mono text-warn-ink">{stats.customer}</b> with customer</span>
          {!preview ? <span><b className="font-mono text-ink">{stats.logged} / {stats.est} h</b> logged</span> : null}
        </div>
        <details className="relative ml-auto">
          <summary className="btn btn-primary list-none">+ Add task</summary>
          <div className="absolute right-0 z-10 mt-1 w-[340px] rounded-md border border-line bg-white p-3 shadow-lg">
            <ActionForm action={createTask} submit="Add task">
              <input type="hidden" name="project_id" value={id} />
              <input name="title" required placeholder="Task title" aria-label="Task title" className="input" />
              <select name="phase_id" aria-label="Phase" className="input">{(phases ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <select name="assignee_id" aria-label="Owner" className="input"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.kind === 'customer' ? ' (customer)' : ''}</option>)}</select>
              <div className="flex gap-2"><input type="date" name="due_date" aria-label="Due date" className="input flex-1" /><input type="number" name="estimate_hours" min={0} step={0.5} placeholder="Est. h" aria-label="Estimate in hours" className="input w-20" /></div>
              <select name="visibility" aria-label="Visibility" defaultValue="shared" className="input"><option value="shared">Shared with customer</option><option value="internal">Internal</option></select>
            </ActionForm>
          </div>
        </details>
      </div>
      {preview ? <p className="m-0 rounded-md bg-shared-bg px-2.5 py-1.5 text-xs font-medium text-link">Customer preview: this is what the customer sees. Internal tasks, effort and time are hidden.</p> : null}

      <div className="flex flex-wrap items-start gap-3">
        <div className="card min-w-0 flex-[999_1_640px] overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={cn('row row-head', cols)}>
              <span>Task</span><span>Status</span><span>Owner</span><span>Start</span><span>Due</span>
              {!preview ? <><span className="text-right">Est h</span><span className="text-right">Logged</span></> : null}
              <span>Visibility</span><span aria-label="Spotlight">★</span>
            </div>
            {(phases ?? []).filter((p) => !preview || p.visibility === 'shared').map((phase) => {
              const pts = visible.filter((t) => t.phase_id === phase.id)
              const allPhase = counted.filter((t) => t.phase_id === phase.id)
              const done = allPhase.filter((t) => t.status === 'done').length
              const pct = allPhase.length ? Math.round((100 * done) / allPhase.length) : 0
              return (
                <details key={phase.id} open={pct < 100 || Boolean(sel && sel.phase_id === phase.id)}>
                  <summary className={cn('row cursor-pointer list-none bg-head font-semibold', cols)}>
                    <span className="flex items-center gap-2">
                      <span>{phase.name}</span><span className="text-xs font-normal text-muted">{pts.length} tasks</span>
                      <span className="h-1 w-14 overflow-hidden rounded-full bg-line"><span className="block h-full bg-info" style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className="text-xs font-normal text-muted">{pct}% done</span><span />
                    <span className="font-mono text-xs font-normal text-muted">{shortDate(allPhase[0]?.start_date)}</span>
                    <span className="font-mono text-xs font-normal text-muted">{shortDate(allPhase.at(-1)?.due_date)}</span>
                    {!preview ? <><span className="text-right font-mono text-xs">{allPhase.reduce((a, t) => a + est(t), 0) || ''}</span><span className="text-right font-mono text-xs">{allPhase.reduce((a, t) => a + (logged.get(t.id) ?? 0), 0) || ''}</span></> : null}
                    <span /><span />
                  </summary>
                  {pts.map((t) => {
                    const overdue = t.status !== 'done' && isOverdue(t.due_date)
                    const lg = logged.get(t.id) ?? 0
                    return (
                      <div key={t.id} className={cn('row', cols, sel?.id === t.id ? 'bg-selected' : 'hover:bg-head')}>
                        <span className="flex min-w-0 items-center gap-2 pl-5">
                          <span aria-hidden className={cn('size-[13px] flex-none rounded-sm', t.status === 'done' ? 'bg-good' : 'border-[1.5px] border-[#b9c4c8]')} />
                          <Link href={link({ task: t.id })} className={cn('truncate no-underline hover:underline', t.status === 'done' ? 'text-muted' : 'font-medium text-ink')}>{t.title}</Link>
                          {commentCount.get(t.id) ? <span className="text-[11px] text-muted">{commentCount.get(t.id)} comments</span> : null}
                        </span>
                        <span><TaskStatusChip status={t.status} overdue={overdue} /></span>
                        <span className="flex min-w-0 items-center gap-1.5">{t.assignee ? <><Avatar name={t.assignee.full_name} customer={t.assignee.kind === 'customer'} /><span className="truncate">{t.assignee.full_name}</span></> : <span className="text-muted">Unassigned</span>}</span>
                        <span className="font-mono text-xs text-muted">{shortDate(t.start_date)}</span>
                        <span className={cn('font-mono text-xs', overdue && 'font-semibold text-crit-ink')}>{shortDate(t.due_date)}</span>
                        {!preview ? <><span className="text-right font-mono text-xs">{est(t) || '–'}</span><span className={cn('text-right font-mono text-xs', est(t) && lg > est(t) && 'font-semibold text-warn-ink')}>{lg || '–'}</span></> : null}
                        <span><Visibility value={t.visibility} /></span>
                        <span aria-label={t.spotlight ? 'Spotlight' : undefined} className={t.spotlight ? 'text-ink' : 'text-[#d5dcdf]'}>★</span>
                      </div>
                    )
                  })}
                </details>
              )
            })}
          </div>
        </div>

        {sel ? (
          <aside className="card flex min-w-0 max-w-[420px] flex-[1_1_340px] flex-col" aria-label="Task details">
            <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="label">{phases?.find((p) => p.id === sel.phase_id)?.name}</span>
                <span className="text-[15px] font-semibold">{sel.title}</span>
                <span className="flex flex-wrap gap-1.5"><TaskStatusChip status={sel.status} overdue={sel.status !== 'done' && isOverdue(sel.due_date)} /><Visibility value={sel.visibility} />{sel.spotlight ? <Chip tone="dark">★ Spotlight</Chip> : null}</span>
              </div>
              <Link href={link({ task: undefined })} aria-label="Close" className="btn w-[30px] px-0">✕</Link>
            </div>
            <div className="flex flex-col gap-3.5 p-3">
              <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-y-1.5 text-[13px]">
                <dt className="text-muted">Owner</dt><dd className="m-0">{sel.assignee?.full_name ?? 'Unassigned'} · {sel.owner_side === 'customer' ? 'Customer' : 'Seven Billion'}</dd>
                <dt className="text-muted">Start → Due</dt><dd className="m-0 font-mono">{shortDate(sel.start_date)} → {shortDate(sel.due_date)}</dd>
                {!preview ? <><dt className="text-muted">Effort</dt><dd className="m-0 font-mono">{logged.get(sel.id) ?? 0} of {est(sel) || '–'} h logged</dd></> : null}
              </dl>
              {sel.description ? <p className="m-0 text-[13px] leading-relaxed">{sel.description}</p> : null}
              {!preview ? (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusSelect label="Task status" value={sel.status} options={statusOptions} onChange={setTaskStatus.bind(null, sel.id)} />
                  <ActionButton run={setSpotlight.bind(null, sel.id, !sel.spotlight)}>{sel.spotlight ? 'Remove spotlight' : '★ Spotlight for customer'}</ActionButton>
                </div>
              ) : null}
              {!preview && sel.owner_side !== 'customer' ? (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-link">Log time</summary>
                  <ActionForm action={logTime} submit="Log time" className="mt-2">
                    <input type="hidden" name="task_id" value={sel.id} />
                    <div className="flex gap-2">
                      <input type="number" name="hours" min={0.25} max={24} step={0.25} required placeholder="Hours" aria-label="Hours" className="input w-24" />
                      <input type="date" name="worked_on" defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Date" className="input flex-1" />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="billable" defaultChecked /> Billable</label>
                    <input name="note" placeholder="Note (optional)" aria-label="Note" className="input" />
                  </ActionForm>
                </details>
              ) : null}
              <div className="flex flex-col gap-2 border-t border-line-soft pt-2.5">
                <span className="label">Discussion</span>
                <Thread entityType="task" entityId={sel.id} customerId={sel.customer_id} me={me} parentInternal={sel.visibility === 'internal'} asCustomer={preview} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
