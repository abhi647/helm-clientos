import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addDecision, addMeetingAction, createTaskFromAction, saveMeetingNotes } from '@/app/_actions/meetings'
import { ActionButton, ActionForm } from '@/components/forms'
import { ActionLines, DecisionRows } from '@/components/meeting-parts'
import { Thread } from '@/components/thread'
import { Card, PageHeader, Visibility } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Meeting' }

/** A meeting: notes, action lines that become plan tasks in one click, and the decisions it produced. */
export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: m } = await supabase.from('meetings').select('*, projects(id, name, customers(id, name))').eq('id', id).maybeSingle()
  if (!m) notFound()
  const [{ data: actions }, { data: decisions }, { data: people }] = await Promise.all([
    supabase.from('meeting_actions').select('id, text, due_date, owner_side, task_id, assignee:profiles!meeting_actions_assignee_id_fkey(full_name), task:tasks(status)')
      .eq('meeting_id', id).order('position').order('created_at'),
    supabase.from('decisions').select('id, number, decision, decided_on, decided_by, visibility').eq('meeting_id', id).order('created_at'),
    supabase.from('profiles').select('id, full_name, kind').or(`kind.eq.internal,customer_id.eq.${m.customer_id}`).order('kind', { ascending: false }).order('full_name'),
  ])
  const project = m.projects
  const open = (actions ?? []).filter((a) => !a.task_id).length
  return (
    <>
      <PageHeader title={m.title} meta={<>
        <span className="font-mono text-xs text-muted">{shortDate(m.held_on)}</span>
        <Visibility value={m.visibility} />
        {m.attendees ? <span className="text-xs text-muted">With <b className="font-medium text-ink">{m.attendees}</b></span> : null}
      </>}>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
          {project ? <>
            <Link href={`/customers/${project.customers?.id}`} className="text-muted no-underline hover:text-ink">{project.customers?.name}</Link><span>/</span>
            <Link href={`/projects/${project.id}/meetings`} className="text-muted no-underline hover:text-ink">{project.name}</Link><span>/</span>
          </> : null}
          <span className="text-ink">Meeting</span>
        </nav>
      </PageHeader>

      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3">
          <Card flush className="overflow-x-auto" title="Action lines" extra={open ? <span className="font-semibold text-warn-ink">{open} not in the plan yet</span> : 'All in the plan'}>
            <div className="min-w-[620px]">
              <ActionLines actions={actions ?? []} taskHref={(t) => `/projects/${project?.id}?task=${t}`}
                control={(a) => <ActionButton run={createTaskFromAction.bind(null, a.id)}>Create task</ActionButton>} />
              <ActionForm action={addMeetingAction} submit="Add action" primary={false} className="border-t border-line-soft p-3">
                <input type="hidden" name="meeting_id" value={m.id} />
                <div className="grid grid-cols-[minmax(0,1fr)_170px_140px] gap-2">
                  <input name="text" required aria-label="Action" placeholder="e.g. Share the region master file" className="input" />
                  <select name="assignee_id" aria-label="Owner" className="input" defaultValue="">
                    <option value="">Unassigned</option>
                    {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.kind === 'customer' ? ' (customer)' : ''}</option>)}
                  </select>
                  <input name="due_date" type="date" aria-label="Due date" className="input" />
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card flush title="Decisions" extra="Numbered and kept in the decision log">
            <DecisionRows decisions={decisions ?? []} staff />
            {project ? (
              <ActionForm action={addDecision} submit="Record decision" primary={false} className="border-t border-line-soft p-3">
                <input type="hidden" name="project_id" value={project.id} />
                <input type="hidden" name="meeting_id" value={m.id} />
                <textarea name="decision" required rows={2} aria-label="Decision" className="textarea" placeholder="What was decided" />
                <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-2">
                  <input name="decided_by" aria-label="Decided by" className="input" placeholder="Decided by (e.g. Michel + Rahul)" />
                  <select name="visibility" aria-label="Visibility" defaultValue={m.visibility} className="input">
                    <option value="shared">Shared with customer</option><option value="internal">Internal</option>
                  </select>
                </div>
              </ActionForm>
            ) : null}
          </Card>

          <Card title="Discussion">
            <Thread entityType="meeting" entityId={m.id} customerId={m.customer_id} me={me} parentInternal={m.visibility === 'internal'} defaultShared={m.visibility === 'shared'} />
          </Card>
        </div>

        <Card className="min-w-0 flex-[1_1_320px]" title="Notes">
          <ActionForm action={saveMeetingNotes} submit="Save notes" resetOnSuccess={false} primary={false}>
            <input type="hidden" name="meeting_id" value={m.id} />
            <label className="label" htmlFor="n-att">Attendees</label>
            <input id="n-att" name="attendees" defaultValue={m.attendees} className="input" />
            <label className="label" htmlFor="n-sum">Notes</label>
            <textarea id="n-sum" name="summary" rows={12} defaultValue={m.summary} className="textarea" />
            {m.visibility === 'shared' ? <p className="m-0 text-xs text-muted">The customer sees these notes.</p> : null}
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
