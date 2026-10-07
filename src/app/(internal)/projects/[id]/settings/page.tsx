import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { deleteProject } from '@/app/_actions/delete'
import { ActionForm } from '@/components/forms'
import { Card } from '@/components/ui'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Project settings' }

const n = (count: number | null, one: string, many = `${one}s`) => `${count ?? 0} ${count === 1 ? one : many}`

/** Admins and the CEO: delete a project and everything in it. Kept when it has billing history. */
export default async function ProjectSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  if (!['admin', 'ceo'].includes(me.internal_role ?? '')) notFound()
  const supabase = await createClient()
  const { data: p } = await supabase.from('projects').select('id, name, status').eq('id', id).maybeSingle()
  if (!p) notFound()
  const count = (t: 'tasks' | 'requests' | 'documents' | 'meetings') => supabase.from(t).select('id', { count: 'exact', head: true }).eq('project_id', id)
  const [tasks, requests, documents, meetings, { count: billed }] = await Promise.all([
    count('tasks'), count('requests'), count('documents'), count('meetings'),
    supabase.from('billing_statements').select('id', { count: 'exact', head: true }).eq('project_id', id).in('status', ['pending', 'approved', 'invoiced']),
  ])
  return (
    <div className="flex max-w-[760px] flex-col gap-3 p-4">
      <Card title="Delete this project" extra="Admin and CEO">
        {billed ? (
          <p className="m-0 text-xs text-muted">
            {p.name} has billing history ({n(billed, 'statement')} sent to or approved by the customer), so it is kept for your records.
            Mark it <b>Completed</b> in the header instead: it leaves the active lists and the customer still sees its history.
          </p>
        ) : (
          <details className="rounded-md border border-crit-bg p-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-crit-ink">Delete {p.name} and everything in it</summary>
            <ActionForm action={deleteProject} submit="Delete for good" className="mt-2" resetOnSuccess={false}>
              <input type="hidden" name="project_id" value={p.id} />
              <p className="m-0 text-xs text-muted">
                Removes its plan ({n(tasks.count, 'task')}), {n(requests.count, 'request')}, {n(documents.count, 'file')} and {n(meetings.count, 'meeting')},
                with their comments, approvals, decisions, updates and logged time, for the customer too. This cannot be undone.
                To keep it but take it off the active lists, mark it Completed instead.
              </p>
              <input name="confirm" required autoComplete="off" aria-label="Type the project name to confirm" placeholder={`Type ${p.name} to confirm`} className="input" />
            </ActionForm>
          </details>
        )}
      </Card>
    </div>
  )
}
