'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { removeDocumentFiles } from '@/lib/customer-data'
import { requireProfile, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/system-log'
import { type ActionResult, dbFail, done, fail, uuid } from './shared'

// Who may delete what, and what is kept, is decided in the database (see the deleting migration).

/** A project and everything in it (admins and the CEO, after typing its name). Not once it has billing history. */
export async function deleteProject(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const id = uuid.safeParse(form.get('project_id'))
  if (!id.success) return fail('Unknown project.')
  const supabase = await createClient()
  const { data: p } = await supabase.from('projects').select('customer_id').eq('id', id.data).maybeSingle()
  if (!p) return fail('Project not found.')
  const { data: docs, error } = await supabase.rpc('delete_project', { p_project: id.data, p_confirm: String(form.get('confirm') ?? '') })
  if (error) return dbFail(error)
  await removeFiles(p.customer_id, docs ?? [])
  done()
  redirect(`/customers/${p.customer_id}`)
}

export async function deleteTask(taskId: string, projectId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(taskId).success) return fail('Unknown task.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_task', { p_task: taskId })
  if (error) return dbFail(error)
  done()
  redirect(`/projects/${projectId}`)
}

export async function deletePhase(phaseId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(phaseId).success) return fail('Unknown phase.')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_phase', { p_phase: phaseId })
  return error ? dbFail(error) : done(`Phase deleted${data ? ` with its ${data} ${data === 1 ? 'task' : 'tasks'}` : ''}.`)
}

export async function deleteRequest(requestId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(requestId).success) return fail('Unknown request.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_request', { p_request: requestId })
  if (error) return dbFail(error)
  done()
  redirect('/requests')
}

export async function deleteMeeting(meetingId: string, projectId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(meetingId).success) return fail('Unknown meeting.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_meeting', { p_meeting: meetingId })
  if (error) return dbFail(error)
  done()
  redirect(`/projects/${projectId}/meetings`)
}

export async function deleteDecision(decisionId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(decisionId).success) return fail('Unknown decision.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_decision', { p_decision: decisionId })
  return error ? dbFail(error) : done('Decision deleted.')
}

export async function deleteUpdate(updateId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(updateId).success) return fail('Unknown update.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_update', { p_update: updateId })
  return error ? dbFail(error) : done('Update deleted.')
}

/** An archived file, with every version of it. Staff, or a customer who uploaded it. */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  await requireProfile()
  if (!uuid.safeParse(documentId).success) return fail('Unknown file.')
  const supabase = await createClient()
  const { data: d } = await supabase.from('documents').select('customer_id').eq('id', documentId).maybeSingle()
  if (!d) return fail('File not found.')
  const { error } = await supabase.rpc('delete_document', { p_document: documentId })
  if (error) return dbFail(error)
  await removeFiles(d.customer_id, [documentId])
  return done('File deleted.')
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  await requireProfile()
  if (!z.string().uuid().safeParse(commentId).success) return fail('Unknown comment.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_comment', { p_comment: commentId })
  return error ? dbFail(error) : done('Comment deleted.')
}

// the records are gone; a file left behind in storage is unreachable (no record points to it) and is logged to clean up
async function removeFiles(customerId: string, documentIds: string[]) {
  try {
    await removeDocumentFiles(customerId, documentIds)
  } catch (e) {
    await logError('delete', e, { customerId, documentIds })
  }
}
