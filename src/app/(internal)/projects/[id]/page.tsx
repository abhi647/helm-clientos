import type { Metadata } from 'next'
import Link from 'next/link'
import { deletePhase, deleteTask } from '@/app/_actions/delete'
import { createTask, logTime, setBilledAs, setSpotlight, setTaskStatus, setTaskOwner } from '@/app/_actions/work'
import { ActionButton, ActionForm, StatusSelect } from '@/components/forms'
import { Thread } from '@/components/thread'
import { Avatar, Chip, TaskStatusChip, Visibility, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS, isOverdue, shortDate, effort, effortShort } from '@/lib/format'
import { EffortInput } from '@/components/effort-input'
import { canManage, requireStaff } from '@/lib/session'
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
  const [{ data: project }, { data: phases }, { data: tasks }, { data: time }, { data: comments }, { data: units }, { data: lines }] = await Promise.all([
    supabase.from('projects').select('id, customer_id, pm_id').eq('id', id).single(),
    supabase.from('phases').select('*').eq('project_id', id).order('position'),
    supabase.from('tasks').select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, kind), task_estimates(estimate, unit), request:requests(id, number)').eq('project_id', id).order('position'),
    supabase.from('time_entries').select('task_id, days').in('task_id', (await supabase.from('tasks').select('id').eq('project_id', id)).data?.map((t) => t.id) ?? []),
    supabase.from('comments').select('entity_id').eq('entity_type', 'task'),
    supabase.rpc('effort_units', { p_project: id }),   // the project's billing units: effort is estimated in these
    supabase.rpc('billing_lines', { p_project: id }),  // rate card line names (no rates) for "Billed as"
  ])
  if (!project) return null
  const people = (await supabase.from('profiles').select('id, full_name, kind').or(`kind.eq.internal,customer_id.eq.${project.customer_id}`).order('kind').order('full_name')).data ?? []

  const logged = new Map<string, number>()
  for (const t of time ?? []) logged.set(t.task_id, (logged.get(t.task_id) ?? 0) + Number(t.days))
  const commentCount = new Map<string, number>()
  for (const c of comments ?? []) commentCount.set(c.entity_id, (commentCount.get(c.entity_id) ?? 0) + 1)

  const all = tasks ?? []
  const shown = (t: (typeof all)[number]) => (!preview || t.visibility === 'shared') && (!openOnly || t.status !== 'done') && (!q || t.title.toLowerCase().includes(q))
  const subsOf = new Map<string, typeof all>()
  for (const t of all) if (t.parent_id) subsOf.set(t.parent_id, [...(subsOf.get(t.parent_id) ?? []), t])
  const subsShown = (t: (typeof all)[number]) => (subsOf.get(t.id) ?? []).filter(shown)
  // a task is listed when it matches, or when one of its subtasks does (the subtask is shown under it)
  const visible = all.filter((t) => !t.parent_id && (shown(t) || (subsShown(t).length > 0 && (!preview || t.visibility === 'shared'))))
  // progress counts tasks; subtasks are the breakdown of a task (their effort still adds up)
  const counted = all.filter((t) => !t.parent_id && (!preview || t.visibility === 'shared'))
  const inPhase = all.filter((t) => !preview || t.visibility === 'shared')
  const est = (t: (typeof all)[number]) => Number(t.task_estimates?.estimate ?? 0)
  const unitOf = (t: (typeof all)[number]) => t.task_estimates?.unit ?? 'day'
  // days can be compared with days logged; estimates in a billed unit ("2 dashboards") are shown as they are
  const estDays = (t: (typeof all)[number]) => (unitOf(t) === 'day' ? est(t) : 0)
  const stats = {
    total: counted.length, done: counted.filter((t) => t.status === 'done').length,
    overdue: counted.filter((t) => t.status !== 'done' && isOverdue(t.due_date)).length,
    customer: counted.filter((t) => t.owner_side === 'customer' && t.status !== 'done').length,
    est: all.reduce((a, t) => a + estDays(t), 0), logged: Array.from(logged.values()).reduce((a, b) => a + b, 0),
  }
  const sel = sp.task ? all.find((t) => t.id === sp.task && (!preview || t.visibility === 'shared')) : undefined
  const selParent = sel?.parent_id ? all.find((t) => t.id === sel.parent_id) : undefined
  const selSubs = sel ? (subsOf.get(sel.id) ?? []).filter((t) => !preview || t.visibility === 'shared') : []
  const cols = preview ? 'grid-cols-[minmax(240px,1fr)_118px_140px_64px_64px_84px_24px]' : 'grid-cols-[minmax(240px,1fr)_118px_140px_64px_64px_52px_60px_84px_24px]'
  const link = (patch: Partial<Search>) => {
    const next = new URLSearchParams(Object.entries({ ...sp, created: undefined, ...patch }).filter(([, v]) => v) as [string, string][])
    const s = next.toString()
    return `/projects/${id}${s ? `?${s}` : ''}`
  }
  // "Billed as": the lines of the project's rate card, by name only (PMs and consultants never see rates)
  const lineName = new Map((lines ?? []).map((l) => [l.id, l.label]))
  const billedOptions = [{ value: '', label: 'Not billed separately' }, ...(lines ?? []).filter((l) => l.current).map((l) => ({ value: l.id, label: l.label }))]
  const withCurrent = (v: string | null) => (v && !billedOptions.some((o) => o.value === v) ? [...billedOptions, { value: v, label: `${lineName.get(v) ?? 'Earlier line'} (earlier rate card)` }] : billedOptions)
  const statusOptions = (Object.keys(TASK_STATUS) as Enums<'task_status'>[]).map((v) => ({ value: v, label: TASK_STATUS[v] }))

  // one plan row: a task (with its accordion arrow when it can open) or a subtask under it
    const cells = (t: (typeof all)[number], sub: boolean, toggle = false) => {
      const kids = sub ? [] : (subsOf.get(t.id) ?? []).filter((k) => !preview || k.visibility === 'shared')
      const overdue = t.status !== 'done' && isOverdue(t.due_date)
      const lg = logged.get(t.id) ?? 0
      return (
        <>
        <span className={cn('flex min-w-0 items-center gap-2', sub ? 'pl-12' : 'pl-1')}>
            {sub ? <span aria-hidden className="-ml-4 text-muted">└</span> : (
              <span aria-hidden className={cn('w-4 flex-none text-center text-[10px] text-muted transition-transform group-open/task:rotate-90', !toggle && 'invisible')}>▶</span>
            )}
            <span aria-hidden className={cn('size-[13px] flex-none rounded-sm', t.status === 'done' ? 'bg-good' : 'border-[1.5px] border-[#b9c4c8]')} />
            <Link href={link({ task: t.id })} className={cn('truncate no-underline hover:underline', t.status === 'done' ? 'text-muted' : sub ? 'text-ink' : 'font-medium text-ink')}>{t.title}</Link>
            {!preview && t.rate_line_id ? <span className="flex-none rounded bg-head px-1.5 text-[11px] text-muted" title="Billed as">{lineName.get(t.rate_line_id) ?? 'Billed'}</span> : null}
            {kids.length ? <span className="flex-none text-[11px] text-muted" title="Subtasks done">{kids.filter((k) => k.status === 'done').length}/{kids.length} subtasks</span> : null}
            {commentCount.get(t.id) ? <span className="text-[11px] text-muted">{commentCount.get(t.id)} comments</span> : null}
          </span>
          <span><TaskStatusChip status={t.status} overdue={overdue} /></span>
          <span className="flex min-w-0 items-center gap-1.5">{t.assignee ? <><Avatar name={t.assignee.full_name} customer={t.assignee.kind === 'customer'} /><span className="truncate">{t.assignee.full_name}</span></> : <span className="text-muted">Unassigned</span>}</span>
          <span className="font-mono text-xs text-muted">{shortDate(t.start_date)}</span>
          <span className={cn('font-mono text-xs', overdue && 'font-semibold text-crit-ink')}>{shortDate(t.due_date)}</span>
          {!preview ? <><span className="truncate text-right font-mono text-xs" title={est(t) ? effort(est(t), unitOf(t)) : undefined}>{est(t) ? effortShort(est(t), unitOf(t)) : '–'}</span><span className={cn('text-right font-mono text-xs', estDays(t) && lg > estDays(t) && 'font-semibold text-warn-ink')}>{lg ? `${+lg.toFixed(2)} d` : '–'}</span></> : null}
          <span><Visibility value={t.visibility} /></span>
          <span aria-label={t.spotlight ? 'Spotlight' : undefined} className={t.spotlight ? 'text-ink' : 'text-[#d5dcdf]'}>★</span>
        </>
      )
    }

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
          {!preview ? <span><b className="font-mono text-ink">{+stats.logged.toFixed(2)} / {+stats.est.toFixed(2)} d</b> logged</span> : null}
        </div>
        <details className="relative ml-auto">
          <summary className="btn btn-primary list-none">+ Add task</summary>
          <div className="absolute right-0 z-10 mt-1 w-[340px] rounded-md border border-line bg-white p-3 shadow-lg">
            <ActionForm action={createTask} submit="Add task">
              <input type="hidden" name="project_id" value={id} />
              <input name="title" required placeholder="Task title" aria-label="Task title" className="input" />
              {phases?.length ? (
                <select name="phase_id" aria-label="Phase" className="input">
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="new">+ New phase…</option>
                </select>
              ) : null}
              <input name="new_phase" aria-label="New phase name" placeholder={phases?.length ? 'New phase name (with + New phase)' : 'Phase, e.g. Delivery'} defaultValue={phases?.length ? '' : 'Delivery'} maxLength={120} className="input" />
              <select name="assignee_id" aria-label="Owner" className="input"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.kind === 'customer' ? ' (customer)' : ''}</option>)}</select>
              <div className="flex flex-wrap gap-2"><input type="date" name="due_date" aria-label="Due date" className="input flex-1" /><EffortInput name="estimate" unitName="unit" units={units ?? ['day']} placeholder="Estimate" /></div>
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
              {!preview ? <><span className="text-right">Estimate</span><span className="text-right">Logged</span></> : null}
              <span>Visibility</span><span aria-label="Spotlight">★</span>
            </div>
            {(phases ?? []).filter((p) => !preview || p.visibility === 'shared').map((phase) => {
              const pts = visible.filter((t) => t.phase_id === phase.id)
              const allPhase = counted.filter((t) => t.phase_id === phase.id)
              const effortPhase = inPhase.filter((t) => t.phase_id === phase.id)
              const done = allPhase.filter((t) => t.status === 'done').length
              const pct = allPhase.length ? Math.round((100 * done) / allPhase.length) : 0
              return (
                <details key={phase.id} open={pct < 100 || Boolean(sel && sel.phase_id === phase.id)} className="group/phase">
                  <summary className={cn('row cursor-pointer list-none bg-head font-semibold', cols)}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="w-4 flex-none text-center text-[10px] text-muted transition-transform group-open/phase:rotate-90">▶</span>
                      <span>{phase.name}</span><span className="text-xs font-normal text-muted">{pts.length} tasks</span>
                      <span className="h-1 w-14 overflow-hidden rounded-full bg-line"><span className="block h-full bg-info" style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-normal text-muted">
                      {/* a phase's state comes from its tasks and subtasks */}
                      {(() => {
                        const work = inPhase.filter((t) => t.phase_id === phase.id)
                        return !allPhase.length ? null : pct === 100 ? <Chip tone="good">Done</Chip>
                          : work.some((t) => t.status !== 'todo') ? <Chip tone="info">In progress</Chip> : <Chip tone="neutral">Not started</Chip>
                      })()}
                      {pct}% done
                    </span>
                    <span className="font-normal">{!preview && lines?.length ? (
                      <StatusSelect key={`ph-${phase.id}-${phase.rate_line_id ?? ''}`} label={`${phase.name} billed as`} value={phase.rate_line_id ?? ''} options={withCurrent(phase.rate_line_id)} onChange={setBilledAs.bind(null, 'phase', phase.id)} />
                    ) : null}</span>
                    <span className="font-mono text-xs font-normal text-muted">{shortDate(allPhase[0]?.start_date)}</span>
                    <span className="font-mono text-xs font-normal text-muted">{shortDate(allPhase.at(-1)?.due_date)}</span>
                    {!preview ? <><span className="text-right font-mono text-xs">{effortPhase.reduce((a, t) => a + est(t), 0) || ''}</span><span className="text-right font-mono text-xs">{effortPhase.reduce((a, t) => a + (logged.get(t.id) ?? 0), 0) || ''}</span></> : null}
                    <span /><span />
                  </summary>
                  {pts.map((t) => {
                    const kids = (subsOf.get(t.id) ?? []).filter((k) => !preview || k.visibility === 'shared')
                    const shownKids = subsShown(t)
                    // a task opens like a phase: its subtasks, then a line to add one
                    const toggle = !preview || kids.length > 0
                    const open = Boolean(q && shownKids.length) || (!!sel && (sel.id === t.id || sel.parent_id === t.id))
                    if (!toggle) return <div key={t.id} className={cn('row', cols, sel?.id === t.id ? 'bg-selected' : 'hover:bg-head')}>{cells(t, false)}</div>
                    return (
                      <details key={t.id} open={open} className="group/task">
                        <summary className={cn('row cursor-pointer list-none', cols, sel?.id === t.id ? 'bg-selected' : 'hover:bg-head')}>{cells(t, false, true)}</summary>
                        {shownKids.map((k) => (
                          <div key={k.id} className={cn('row', cols, sel?.id === k.id ? 'bg-selected' : 'hover:bg-head')}>{cells(k, true)}</div>
                        ))}
                        {!preview ? (
                          <div className="row border-b border-line-soft py-1.5 pl-12">
                            <ActionForm action={createTask} submit="Add" primary={false} className="flex-row flex-wrap items-center gap-1.5">
                              <input type="hidden" name="project_id" value={id} />
                              <input type="hidden" name="parent_id" value={t.id} />
                              <input type="hidden" name="visibility" value={t.visibility} />
                              <input name="title" required placeholder="+ Add subtask" aria-label={`New subtask of ${t.title}`} className="input h-7 w-64 text-xs" />
                              <select name="assignee_id" aria-label={`Owner of the new subtask of ${t.title}`} defaultValue={t.assignee_id ?? ''} className="input h-7 w-40 py-0 text-xs"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.kind === 'customer' ? ' (customer)' : ''}</option>)}</select>
                              <input type="date" name="due_date" aria-label={`Due date of the new subtask of ${t.title}`} className="input h-7 w-36 text-xs" />
                            </ActionForm>
                          </div>
                        ) : null}
                      </details>
                    )
                  })}
                  {!preview ? (
                    <div className="row border-b border-line-soft py-1.5 pl-6">
                      <ActionForm action={createTask} submit="Add" primary={false} className="flex-row flex-wrap items-center gap-1.5">
                        <input type="hidden" name="project_id" value={id} />
                        <input type="hidden" name="phase_id" value={phase.id} />
                        <input type="hidden" name="visibility" value={phase.visibility} />
                        <input name="title" required placeholder={`+ Add task to ${phase.name}`} aria-label={`New task in ${phase.name}`} className="input h-7 w-64 text-xs" />
                        <select name="assignee_id" aria-label={`Owner of the new task in ${phase.name}`} className="input h-7 w-40 py-0 text-xs"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.kind === 'customer' ? ' (customer)' : ''}</option>)}</select>
                        <input type="date" name="due_date" aria-label={`Due date of the new task in ${phase.name}`} className="input h-7 w-36 text-xs" />
                      </ActionForm>
                    </div>
                  ) : null}
                </details>
              )
            })}
          </div>
          {!preview && canManage(me) && phases?.length ? (
            <details className="border-t border-line-soft">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-link">Delete a phase…</summary>
              {phases.map((ph) => {
                const count = all.filter((t) => t.phase_id === ph.id && !t.parent_id).length
                return (
                  <div key={ph.id} className="row grid-cols-[minmax(0,1fr)_auto] text-xs">
                    <span className="truncate">{ph.name} <span className="text-muted">· {count} {count === 1 ? 'task' : 'tasks'}</span></span>
                    <ActionButton run={deletePhase.bind(null, ph.id)} className="btn-ghost h-6 px-2 text-xs text-crit-ink"
                      confirm={`Delete the phase "${ph.name}"${count ? ` and its ${count} ${count === 1 ? 'task' : 'tasks'}` : ''}? This cannot be undone.`}>Delete</ActionButton>
                  </div>
                )
              })}
            </details>
          ) : null}
        </div>

        {sel ? (
          <aside className="card flex min-w-0 max-w-[420px] flex-[1_1_340px] flex-col" aria-label="Task details">
            <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="label">{phases?.find((p) => p.id === sel.phase_id)?.name}{selParent ? <> › <Link href={link({ task: selParent.id })} className="normal-case">{selParent.title}</Link></> : null}</span>
                <span className="text-[15px] font-semibold">{sel.title}</span>
                <span className="flex flex-wrap gap-1.5"><TaskStatusChip status={sel.status} overdue={sel.status !== 'done' && isOverdue(sel.due_date)} /><Visibility value={sel.visibility} />{sel.spotlight ? <Chip tone="dark">★ Spotlight</Chip> : null}</span>
              </div>
              <Link href={link({ task: undefined })} aria-label="Close" className="btn w-[30px] px-0">✕</Link>
            </div>
            <div className="flex flex-col gap-3.5 p-3">
              <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-y-1.5 text-[13px]">
                <dt className="text-muted">Owner</dt><dd className="m-0">{sel.assignee?.full_name ?? 'Unassigned'} · {sel.owner_side === 'customer' ? 'Customer' : 'Seven Billion'}</dd>
                {sel.request ? <><dt className="text-muted">Request</dt><dd className="m-0"><Link href={`/requests/${sel.request.id}`} className="font-mono">{sel.request.number}</Link></dd></> : null}
                <dt className="text-muted">Start → Due</dt><dd className="m-0 font-mono">{shortDate(sel.start_date)} → {shortDate(sel.due_date)}</dd>
                {!preview && lines?.length ? <><dt className="text-muted">Billed as</dt><dd className="m-0">
                  {sel.parent_id ? <span className="text-muted">Through its task{selParent?.rate_line_id ? `: ${lineName.get(selParent.rate_line_id)}` : ''}</span> : (
                    <span className="flex flex-col gap-1">
                      <StatusSelect key={`bill-${sel.id}-${sel.rate_line_id ?? ''}`} label="Task billed as" value={sel.rate_line_id ?? ''} options={withCurrent(sel.rate_line_id)} onChange={setBilledAs.bind(null, 'task', sel.id)} />
                      {!sel.rate_line_id ? <span className="text-xs text-muted">{(() => {
                        const ph = phases?.find((p) => p.id === sel.phase_id)
                        return ph?.rate_line_id ? `Uses the phase's line: ${lineName.get(ph.rate_line_id)}` : 'Days use the line the person is named on'
                      })()}</span> : null}
                    </span>
                  )}
                </dd></> : null}
                {!preview ? <><dt className="text-muted">Effort</dt><dd className="m-0 font-mono">{effort(logged.get(sel.id) ?? 0)} logged · estimate {est(sel) ? effort(est(sel), unitOf(sel)) : '–'}</dd></> : null}
              </dl>
              {sel.description ? <p className="m-0 text-[13px] leading-relaxed">{sel.description}</p> : null}
              {!preview ? (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusSelect label="Task status" value={sel.status} options={statusOptions} onChange={setTaskStatus.bind(null, sel.id)} />
                  <StatusSelect key={`owner-${sel.id}-${sel.assignee_id ?? ''}`} label="Task owner" value={sel.assignee_id ?? ''} onChange={setTaskOwner.bind(null, sel.id)}
                    options={[{ value: '', label: 'Unassigned' }, ...people.map((p) => ({ value: p.id, label: `${p.full_name}${p.kind === 'customer' ? ' (customer)' : ''}` }))]} />
                  <ActionButton run={setSpotlight.bind(null, sel.id, !sel.spotlight)}>{sel.spotlight ? 'Remove spotlight' : '★ Spotlight for customer'}</ActionButton>
                  {canManage(me) ? <ActionButton run={deleteTask.bind(null, sel.id, id)} className="btn-ghost text-crit-ink"
                    confirm={`Delete the ${sel.parent_id ? 'subtask' : 'task'} "${sel.title}"?${selSubs.length ? ` Its ${selSubs.length} ${selSubs.length === 1 ? 'subtask goes' : 'subtasks go'} with it, and` : ''} Its comments and unapproved time go with it. This cannot be undone.`}>{sel.parent_id ? 'Delete subtask' : 'Delete task'}</ActionButton> : null}
                </div>
              ) : null}
              {!sel.parent_id && (selSubs.length || !preview) ? (
                <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2.5">
                  <span className="label">Subtasks {selSubs.length ? `· ${selSubs.filter((k) => k.status === 'done').length}/${selSubs.length} done` : ''}</span>
                  {selSubs.map((k) => (
                    <Link key={k.id} href={link({ task: k.id })} className="flex items-center gap-2 text-[13px] no-underline hover:underline">
                      <span aria-hidden className={cn('size-[11px] flex-none rounded-sm', k.status === 'done' ? 'bg-good' : 'border-[1.5px] border-[#b9c4c8]')} />
                      <span className={cn('truncate', k.status === 'done' ? 'text-muted' : 'text-ink')}>{k.title}</span>
                      <span className="ml-auto flex-none text-xs text-muted">{k.assignee?.full_name ?? 'Unassigned'}{k.due_date ? ` · ${shortDate(k.due_date)}` : ''}</span>
                    </Link>
                  ))}
                  {!preview ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-link">+ Add subtask</summary>
                      <ActionForm action={createTask} submit="Add subtask" className="mt-2">
                        <input type="hidden" name="project_id" value={id} />
                        <input type="hidden" name="parent_id" value={sel.id} />
                        <input type="hidden" name="visibility" value={sel.visibility} />
                        <input name="title" required placeholder="Subtask title" aria-label="Subtask title" className="input" />
                        <select name="assignee_id" aria-label="Owner of the new subtask" defaultValue={sel.assignee_id ?? ''} className="input"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.kind === 'customer' ? ' (customer)' : ''}</option>)}</select>
                        <div className="flex flex-wrap gap-2"><input type="date" name="due_date" aria-label="Due date of the new subtask" className="input flex-1" /><EffortInput name="estimate" unitName="unit" units={units ?? ['day']} placeholder="Estimate" /></div>
                      </ActionForm>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {!preview && sel.owner_side !== 'customer' ? (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-link">Log time</summary>
                  <ActionForm action={logTime} submit="Log time" className="mt-2">
                    <input type="hidden" name="task_id" value={sel.id} />
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1.5"><input type="number" name="days" min={0.25} max={3} step={0.25} required placeholder="Days" aria-label="Days worked" className="input w-20 font-mono" /><span className="text-xs text-muted">days</span></span>
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
