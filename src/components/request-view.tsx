import Link from 'next/link'
import { notFound } from 'next/navigation'
import { approveForCustomer, decideApproval, requestApproval, requestToTask, resubmitApproval, setRequestStatus } from '@/app/_actions/requests'
import { ActionButton, ActionForm, ApproveForCustomer, DecisionForm } from '@/components/forms'
import { FileRows } from '@/components/file-rows'
import { FOLDERS } from '@/components/project-parts'
import { Thread } from '@/components/thread'
import { UploadForm } from '@/components/upload'
import { ApprovalStatusChip, Card, PriorityText, RequestStatusChip, Visibility, cn } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { REQUEST_STATUS_ORDER, effort, label, relativeTime, shortDate } from '@/lib/format'
import { EffortInput } from '@/components/effort-input'
import { canManage, type Profile } from '@/lib/session'
import { deleteRequest } from '@/app/_actions/delete'
import { createClient } from '@/lib/supabase/server'

/** Request detail for staff and customers. What each sees is decided by RLS; staff also get the controls. */
export async function RequestView({ id, me, created }: { id: string; me: Profile; created?: string }) {
  const supabase = await createClient()
  const staff = me.kind === 'internal'
  const base = staff ? '' : '/portal'
  const { data: r } = await supabase.from('requests')
    .select('*, customers(name), projects(id, name), owner:profiles!requests_owner_id_fkey(full_name), requester:profiles!requests_requested_by_fkey(full_name), raiser:profiles!requests_raised_by_fkey(full_name)')
    .eq('id', id).maybeSingle()
  if (!r) notFound()
  const [{ data: events }, { data: approvals }, { data: customerUsers }, { data: units }, { data: linked }, { data: staffPeople }, { data: customerProjects }] = await Promise.all([
    supabase.from('request_events').select('id, status, note, created_at, actor:profiles!request_events_actor_id_fkey(full_name)').eq('request_id', id).order('id'),
    supabase.from('approvals').select('*, approver:profiles!approvals_approver_id_fkey(full_name), approval_events(id, action, version, comment, created_at, actor:profiles!approval_events_actor_id_fkey(full_name))').eq('request_id', id).order('created_at', { ascending: false }),
    staff ? supabase.from('profiles').select('id, full_name').eq('customer_id', r.customer_id) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    // effort is estimated in the project's billing units (days, or the billed unit for delivery work)
    staff && r.project_id ? supabase.rpc('effort_units', { p_project: r.project_id }) : Promise.resolve({ data: ['day'] }),
    // tasks this request became (customers see the shared ones only, by RLS)
    supabase.from('tasks').select('id, title, status, visibility, project_id, assignee:profiles!tasks_assignee_id_fkey(full_name)').eq('request_id', id).order('created_at'),
    staff ? supabase.from('directory').select('id, full_name').eq('kind', 'internal').is('access_revoked_at', null).order('full_name') : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    staff ? supabase.from('projects').select('id, name').eq('customer_id', r.customer_id).neq('status', 'completed').order('name') : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const current = REQUEST_STATUS_ORDER.indexOf(r.status as Enums<'request_status'>)
  const reached = new Map((events ?? []).map((e) => [e.status, e.created_at]))
  const approval = approvals?.[0]
  const canDecide = approval?.status === 'pending' && approval.approver_id === me.id

  return (
    <div className="flex flex-col gap-3 p-4">
      {created ? <p role="status" className="m-0 rounded-md bg-good-bg px-3 py-2 text-[13px] font-medium text-good-ink"><b>{created}</b> {staff ? `logged for ${r.requester?.full_name ?? r.customers?.name}. ${r.requester ? 'They have' : 'The customer has'} been emailed and can follow it in their portal.` : 'created. Seven Billion has it and will review it shortly.'}</p> : null}
      <div className="card flex flex-col gap-2.5 px-3.5 py-3">
        <Link href={`${base}/requests`} className="text-xs font-medium">← Requests</Link>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-xs text-muted">{r.number}</span>
          <h1 className="m-0 text-[17px] font-semibold">{r.title}</h1>
          <RequestStatusChip status={r.status} />
          <Visibility value="shared" />
        </div>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-3.5 gap-y-2 text-[13px]">
          {staff ? <div><dt className="label">Customer</dt><dd className="m-0">{r.customers?.name}</dd></div> : null}
          <div><dt className="label">Project</dt><dd className="m-0">{r.projects ? (staff ? <Link href={`/projects/${r.projects.id}`}>{r.projects.name}</Link> : r.projects.name) : '–'}</dd></div>
          <div><dt className="label">Type</dt><dd className="m-0">{label(r.type)}</dd></div>
          <div><dt className="label">Priority</dt><dd className="m-0"><PriorityText priority={r.priority} /></dd></div>
          <div><dt className="label">Requested</dt><dd className="m-0">{r.requester?.full_name ?? r.customers?.name ?? 'Your company'} · <span className="font-mono">{shortDate(r.created_at)}</span>{r.raiser ? <span className="block text-xs text-muted">Logged by {r.raiser.full_name} on their behalf</span> : null}</dd></div>
          <div><dt className="label">Owner</dt><dd className="m-0">{r.owner?.full_name ?? 'Not assigned yet'}</dd></div>
          <div><dt className="label">Wanted by</dt><dd className="m-0 font-mono">{shortDate(r.desired_date)}</dd></div>
        </dl>
        <ol aria-label="Progress" className="m-0 flex list-none items-center overflow-x-auto p-0 pt-1">
          {REQUEST_STATUS_ORDER.map((s, i) => {
            const done = i < current || r.status === 'delivered'
            const now = i === current && r.status !== 'delivered'
            return (
              <li key={s} className="flex flex-none items-center gap-1.5" aria-current={now ? 'step' : undefined}>
                <span aria-hidden className={cn('size-2.5 rounded-full', done ? 'bg-info-ink' : now ? 'border-[3px] border-info bg-white' : 'border-[1.5px] border-[#b9c4c8] bg-white')} />
                <span className={cn('text-xs whitespace-nowrap', now && 'font-semibold', !done && !now && 'text-muted')}>
                  {label(s)}{reached.get(s) ? <span className="font-mono text-muted"> · {shortDate(reached.get(s))}</span> : null}
                </span>
                {i < REQUEST_STATUS_ORDER.length - 1 ? <span aria-hidden className={cn('mx-1 h-px w-4', done ? 'bg-info-ink' : 'bg-[#d5dcdf]')} /> : null}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3">
          <Card title="Requirement">
            <div className="grid gap-3 text-[13px] leading-relaxed sm:grid-cols-2">
              <div><div className="label mb-1">What is needed</div><p className="m-0 whitespace-pre-wrap">{r.what || '–'}</p></div>
              <div><div className="label mb-1">Why</div><p className="m-0 whitespace-pre-wrap">{r.why || '–'}</p></div>
            </div>
          </Card>
          <RequestFiles requestId={r.id} customerId={r.customer_id} projectId={r.project_id} me={me} />
          <Card title="Discussion">
            <Thread entityType="request" entityId={r.id} customerId={r.customer_id} me={me} defaultShared />
          </Card>
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          {linked?.length ? (
            <Card title="On the plan">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {linked.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2">
                    {staff ? <Link href={`/projects/${t.project_id}?task=${t.id}`} className="font-medium">{t.title}</Link> : <span className="font-medium">{t.title}</span>}
                    <span className="text-xs text-muted">{label(t.status)}{t.assignee ? ` · ${t.assignee.full_name}` : ''}</span>
                    {staff ? <Visibility value={t.visibility} /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* a request goes on the plan once; more work on it becomes subtasks of that task */}
          {staff && !!linked?.length && !['delivered', 'cancelled'].includes(r.status) ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-xs text-muted">This request is on the plan. To split the work, open its task and add subtasks.</p>
              {linked.every((t) => t.visibility === 'internal') ? (
                <ActionForm action={requestToTask} submit="Share the task with the customer" primary={false}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="project_id" value={linked[0]!.project_id} />
                  <input type="hidden" name="visibility" value="shared" />
                </ActionForm>
              ) : null}
            </div>
          ) : null}
          {staff && !linked?.length && !['delivered', 'cancelled'].includes(r.status) ? (
            <Card title="Turn into a task">
              <ActionForm action={requestToTask} submit="Add to the plan">
                <input type="hidden" name="request_id" value={r.id} />
                {r.project_id ? <input type="hidden" name="project_id" value={r.project_id} /> : (
                  <label className="flex flex-col gap-1 text-xs"><span className="label">Project</span>
                    <select name="project_id" required className="input"><option value="">Choose…</option>{(customerProjects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                )}
                <label className="flex flex-col gap-1 text-xs"><span className="label">Owner</span>
                  <select name="assignee_id" aria-label="Task owner" className="input">
                    <option value="">Unassigned</option>
                    <optgroup label="Seven Billion">{(staffPeople ?? []).map((u) => <option key={u.id} value={u.id ?? ""}>{u.full_name}</option>)}</optgroup>
                    <optgroup label={r.customers?.name ?? 'Customer'}>{(customerUsers ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</optgroup>
                  </select></label>
                <div className="flex flex-wrap gap-2">
                  <input type="date" name="due_date" defaultValue={r.desired_date ?? ''} aria-label="Due date" className="input flex-1" />
                  <EffortInput name="estimate" unitName="unit" units={units ?? ['day']} placeholder="Estimate" />
                </div>
                <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0 text-xs">
                  <legend className="label mb-1">Who can see the task?</legend>
                  <label className="flex items-start gap-2"><input type="radio" name="visibility" value="shared" defaultChecked className="mt-0.5" /><span><b>Shared with the customer.</b> It appears on their plan and the request moves to Scheduled.</span></label>
                  <label className="flex items-start gap-2"><input type="radio" name="visibility" value="internal" className="mt-0.5" /><span><b>Internal.</b> Only Seven Billion sees the task; the request&apos;s stage stays as it is.</span></label>
                </fieldset>
              </ActionForm>
            </Card>
          ) : null}

          {approval ? (
            <section className={cn('card flex flex-col gap-2 p-3', approval.status === 'pending' && 'border-ink')}>
              <div className="flex items-center gap-2"><span className="label">Approval · {approval.kind}</span><span className="ml-auto"><ApprovalStatusChip status={approval.status} /></span></div>
              <div className="text-[14px] font-semibold">{approval.title}</div>
              <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-y-1 text-[13px]">
                <dt className="text-muted">Effort</dt><dd className="m-0 font-mono">{effort(approval.effort, approval.effort_unit)}</dd>
                <dt className="text-muted">Target</dt><dd className="m-0 font-mono">{shortDate(approval.target_date)}</dd>
                <dt className="text-muted">Version</dt><dd className="m-0 font-mono">v{approval.version}</dd>
                <dt className="text-muted">Approver</dt><dd className="m-0">{approval.approver?.full_name}</dd>
              </dl>
              <p className="m-0 text-xs leading-relaxed text-muted whitespace-pre-wrap">{approval.summary}</p>
              {canDecide ? <DecisionForm action={decideApproval} approvalId={approval.id} /> : null}
              {staff && approval.status === 'pending' ? <p className="m-0 text-xs font-medium text-warn-ink">Waiting for {approval.approver?.full_name} · requested {relativeTime(approval.created_at)}</p> : null}
              {staff && canManage(me) && approval.status === 'pending' ? (
                <ApproveForCustomer action={approveForCustomer} idName="approval_id" id={approval.id}
                  hint={`${approval.approver?.full_name ?? 'The customer'} is told by email, and the request moves to Approved.`} />
              ) : null}
              {staff && approval.status === 'changes_requested' ? (
                <details open>
                  <summary className="cursor-pointer text-xs font-medium text-link">Revise and resubmit as v{approval.version + 1}</summary>
                  <ActionForm action={resubmitApproval} submit="Resubmit" className="mt-2">
                    <input type="hidden" name="approval_id" value={approval.id} />
                    <textarea name="summary" rows={3} defaultValue={approval.summary} aria-label="Revised scope" className="textarea" />
                    <div className="flex flex-wrap gap-2"><EffortInput name="effort" unitName="effort_unit" units={units ?? ['day']} defaultValue={approval.effort} defaultUnit={approval.effort_unit} required /><input type="date" name="target_date" defaultValue={approval.target_date ?? ''} aria-label="Target date" className="input flex-1" /></div>
                    <input name="comment" placeholder="What changed (shown in history)" aria-label="What changed" className="input" />
                  </ActionForm>
                </details>
              ) : null}
              <div className="flex flex-col gap-1 border-t border-line-soft pt-2">
                <span className="label">History</span>
                {(approval.approval_events ?? []).sort((a, b) => a.id - b.id).map((e) => (
                  <div key={e.id} className="text-xs leading-snug">
                    <b>{label(e.action)}</b> · v{e.version} · {e.actor?.full_name ?? 'Seven Billion'} · <span className="font-mono text-muted">{shortDate(e.created_at)}</span>
                    {e.comment ? <><br /><span className="text-muted">“{e.comment}”</span></> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {staff && (!approval || approval.status === 'approved' || approval.status === 'cancelled') && !['approved', 'scheduled', 'in_development', 'uat', 'delivered', 'cancelled'].includes(r.status) ? (
            <Card title="Ask the customer to approve an estimate">
              <ActionForm action={requestApproval} submit="Request approval">
                <input type="hidden" name="request_id" value={r.id} />
                <textarea name="summary" rows={3} required placeholder="Scope: what is included and excluded" aria-label="Scope" className="textarea" />
                <div className="flex flex-wrap gap-2"><EffortInput name="effort" unitName="effort_unit" units={units ?? ['day']} required /><input type="date" name="target_date" aria-label="Target delivery" className="input flex-1" /></div>
                <label className="flex flex-col gap-1 text-xs"><span className="label">Approver</span>
                  <select name="approver_id" required className="input">{(customerUsers ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-xs"><span className="label">Decision needed by</span><input type="date" name="due_date" className="input" /></label>
              </ActionForm>
            </Card>
          ) : null}

          {staff ? (
            <Card title="Move to stage">
              <ActionForm action={setRequestStatus} submit="Update stage" primary={false}>
                <input type="hidden" name="request_id" value={r.id} />
                <select name="status" defaultValue={r.status} aria-label="Stage" className="input">{[...REQUEST_STATUS_ORDER, 'cancelled' as const].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                <input name="note" placeholder="Note for the timeline (shared with the customer)" aria-label="Note" className="input" />
              </ActionForm>
            </Card>
          ) : null}

          {staff && canManage(me) ? (
            <details className="rounded-md border border-crit-bg bg-white p-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-crit-ink">Delete this request</summary>
              <p className="mt-2 mb-2 text-xs text-muted">Removes it for the customer too, with its timeline, comments, estimates and to-dos. Tasks made from it stay on the plan. To close it but keep the record, move it to Cancelled instead.</p>
              <ActionButton run={deleteRequest.bind(null, r.id)} className="text-crit-ink" confirm={`Delete ${r.number} for good? This cannot be undone.`}>Delete for good</ActionButton>
            </details>
          ) : null}

          <Card title="Timeline">
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {(events ?? []).map((e) => (
                <li key={e.id} className="text-xs leading-snug"><b>{label(e.status)}</b> · {e.actor?.full_name ?? 'Seven Billion'} · <span className="font-mono text-muted">{shortDate(e.created_at)}</span>{e.note ? <><br /><span className="text-muted">{e.note}</span></> : null}</li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** Files attached to this request: customers attach examples and specs, staff attach estimates and deliverables. */
async function RequestFiles({ requestId, customerId, projectId, me }: { requestId: string; customerId: string; projectId: string | null; me: Profile }) {
  const supabase = await createClient()
  const { data } = await supabase.from('documents')
    .select('id, name, version, visibility, created_at, storage_path, scan_status, archived_at, uploader:profiles!documents_uploaded_by_fkey(full_name)')
    .eq('request_id', requestId).is('archived_at', null).order('created_at', { ascending: false })
  const docs = data ?? []
  const { data: versions } = docs.length
    ? await supabase.from('document_versions').select('document_id, version, name, created_at, scan_status').in('document_id', docs.map((d) => d.id))
    : { data: [] }
  const staff = me.kind === 'internal'
  return (
    <Card flush title="Files" extra={`${docs.length} attached`}>
      {docs.length ? <div className="overflow-x-auto"><div className="min-w-[600px]"><FileRows docs={docs} versions={versions ?? []} staff={staff} customerId={customerId} /></div></div> : null}
      <details className="border-t border-line-soft" open={!docs.length}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-link">Attach a file</summary>
        <div className="px-3 pb-3">
          <UploadForm customerId={customerId} projectId={projectId ?? undefined} requestId={requestId} folders={FOLDERS} staff={staff} defaultShared />
        </div>
      </details>
    </Card>
  )
}
