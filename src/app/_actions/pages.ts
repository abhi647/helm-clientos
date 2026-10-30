'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type ActionResult, dbFail, done, fail, formObject, optionalDate, uuid } from '@/app/_actions/shared'
import { pageTemplate } from '@/lib/page-templates'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const createSchema = z.object({
  project_id: uuid,
  kind: z.enum(['scope', 'requirements', 'meeting_notes', 'blank']),
  title: z.string().trim().min(1, 'Give the document a title.').max(200),
  meeting_id: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
})

/** A new document on a project, started from its template; opens in the editor. */
export async function createPage(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  const parsed = createSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('customer_id').eq('id', parsed.data.project_id).single()
  if (!project) return fail('Project not found.')
  const { data, error } = await supabase.from('pages').insert({
    ...parsed.data, customer_id: project.customer_id, content: pageTemplate(parsed.data.kind) as never, created_by: me.id,
  }).select('id').single()
  if (error || !data) return dbFail(error)
  done()
  redirect(`/projects/${parsed.data.project_id}/docs/${data.id}`)
}

export async function renamePage(id: string, title: string): Promise<ActionResult> {
  await requireStaff()
  const t = title.trim()
  if (!t || t.length > 200) return fail('A title is 1 to 200 characters.')
  const supabase = await createClient()
  const { data: page } = await supabase.from('pages').select('version, content, discussions').eq('id', id).single()
  if (!page) return fail('Document not found.')
  const { error } = await supabase.rpc('save_page', { p_page: id, p_base: page.version, p_content: page.content, p_discussions: page.discussions, p_title: t })
  return error ? dbFail(error, /editing|saved by someone/i.test(error.message) ? 'Someone is editing this document. Try again when they finish.' : undefined) : done('Renamed.')
}

export async function sharePage(id: string, shared: boolean): Promise<ActionResult> {
  await requireStaff()
  const { error } = await (await createClient()).rpc('set_page_sharing', { p_page: id, p_shared: shared })
  if (error) return dbFail(error, /withdraw/i.test(error.message) ? 'Withdraw the sign-off request before making it internal.' : undefined)
  return done(shared ? 'Shared with the customer. They have been told.' : 'Now internal to Seven Billion.')
}

const signoffSchema = z.object({ page_id: uuid, approver_id: uuid, due_date: optionalDate, note: z.string().trim().max(2000).default('') })

/** Ask someone at the customer to sign off the current version; it arrives in their actions like any approval. */
export async function requestSignoff(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = signoffSchema.safeParse(formObject(form))
  if (!parsed.success) return fail('Choose who signs off.')
  const { error } = await (await createClient()).rpc('request_page_signoff', {
    p_page: parsed.data.page_id, p_approver: parsed.data.approver_id, p_due: parsed.data.due_date ?? undefined, p_note: parsed.data.note || undefined,
  })
  if (error) return dbFail(error, /approver must be/i.test(error.message) ? 'The approver must be someone at the customer.' : undefined)
  return done('Sent for sign-off. The document is now shared for review.')
}

export async function restoreVersion(id: string, version: number): Promise<ActionResult> {
  await requireStaff()
  const { error } = await (await createClient()).rpc('restore_page_version', { p_page: id, p_version: version })
  return error ? dbFail(error) : done(`Version ${version} restored as the newest version.`)
}

export async function deletePage(id: string, projectId: string): Promise<ActionResult> {
  await requireStaff()
  const { error, count } = await (await createClient()).from('pages').delete({ count: 'exact' }).eq('id', id)
  if (error) return dbFail(error)
  if (!count) return fail('Only a PM, admin or the CEO can delete a document.')
  done()
  redirect(`/projects/${projectId}/docs`)
}
