'use server'

import { z } from 'zod'
import { requireProfile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, uuid, visibility } from './shared'

const commentSchema = z.object({
  entity_type: z.enum(['task', 'request', 'approval', 'document', 'meeting', 'update']),
  entity_id: uuid,
  customer_id: uuid,
  body: z.string().trim().min(1, 'Write a comment first.').max(10_000),
  visibility: visibility.default('internal'),
})

/** Posts a comment. Customers can only post shared comments; the database also forces internal on internal items. */
export async function addComment(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireProfile()
  const parsed = commentSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const row = { ...parsed.data, author_id: me.id, visibility: me.kind === 'customer' ? 'shared' as const : parsed.data.visibility }
  const supabase = await createClient()
  const { error } = await supabase.from('comments').insert(row)
  return error ? dbFail(error) : done()
}

const FOLDERS = ['01-commercial', '02-requirements', '03-design', '04-delivery', '05-uat', '06-meetings', '07-handover'] as const

const docSchema = z.object({
  id: uuid,
  customer_id: uuid,
  project_id: uuid.nullable(),
  folder: z.enum(FOLDERS).default('02-requirements'),
  visibility: visibility.default('internal'),
  name: z.string().trim().min(1).max(160),
  path: z.string().min(10).max(400),
})

/**
 * Records a file the browser has already uploaded straight to Supabase Storage (so large files never pass
 * through a Vercel function). Storage RLS checked the upload; documents RLS checks this row.
 */
export async function recordDocument(input: z.input<typeof docSchema>): Promise<ActionResult> {
  const me = await requireProfile()
  const parsed = docSchema.safeParse(input)
  if (!parsed.success) return fail('That upload could not be recorded.')
  const d = parsed.data
  if (!d.path.startsWith(`${d.customer_id}/${d.id}/`)) return fail('That upload could not be recorded.')
  const supabase = await createClient()
  const { error } = await supabase.from('documents').insert({
    id: d.id, customer_id: d.customer_id, project_id: d.project_id, folder: d.folder, name: d.name, storage_path: d.path,
    visibility: me.kind === 'customer' ? 'shared' : d.visibility, uploaded_by: me.id,
  })
  if (error) {
    await supabase.storage.from('documents').remove([d.path])
    return dbFail(error)
  }
  return done('Uploaded.')
}

export async function markAllRead(): Promise<void> {
  const me = await requireProfile()
  const supabase = await createClient()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', me.id).is('read_at', null)
  done()
}
