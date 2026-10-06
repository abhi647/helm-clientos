'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formByKey, parseAnswers } from '@/lib/forms'
import { requireProfile, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, uuid } from './shared'

const nullableId = z.preprocess((v) => (v === '' || v == null ? null : v), uuid.nullable())
const meta = z.object({ form_key: z.string(), project_id: nullableId, action_item_id: nullableId })

/** Stores a form submission. The database completes the action item that asked for it and runs the playbook rules. */
export async function submitForm(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireProfile()
  const raw = formObject(form)
  const m = meta.safeParse(raw)
  const def = m.success ? formByKey(m.data.form_key) : undefined
  if (!m.success || !def) return fail('Unknown form.')
  const parsed = parseAnswers(def, raw)
  if (!parsed.ok) return fail(parsed.error)

  const supabase = await createClient()
  let customer_id = me.customer_id
  if (m.data.project_id) {
    const { data: project } = await supabase.from('projects').select('customer_id').eq('id', m.data.project_id).maybeSingle()
    if (!project) return fail('Project not found.')
    customer_id = project.customer_id
  }
  if (!customer_id) return fail('Choose the project this form is for.')
  const { error } = await supabase.from('form_submissions').insert({
    customer_id, project_id: m.data.project_id, form_key: def.key, action_item_id: m.data.action_item_id, answers: parsed.answers, submitted_by: me.id,
  })
  if (error) return dbFail(error)
  done()
  redirect(me.kind === 'customer' ? `/portal?submitted=${def.key}` : `/projects/${m.data.project_id}/forms`)
}

/** Staff send a form to the customer lead as an action item (it shows on their home page and by email). */
export async function sendForm(projectId: string, key: string): Promise<ActionResult> {
  await requireStaff()
  const def = formByKey(key)
  if (!def || !uuid.safeParse(projectId).success) return fail('Unknown form or project.')
  const supabase = await createClient()
  const { data: p } = await supabase.from('projects').select('id, name, customer_id, customer_lead_id').eq('id', projectId).single()
  if (!p) return fail('Project not found.')
  if (!p.customer_lead_id) return fail('Set a customer lead on this project first.')
  const { data: open } = await supabase.from('action_items').select('id').eq('project_id', p.id).eq('form_key', def.key).eq('status', 'open').limit(1)
  if (open?.length) return fail(`A ${def.title} form is already waiting for the customer.`)
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  const { error } = await supabase.from('action_items').insert({
    customer_id: p.customer_id, project_id: p.id, type: def.key === 'uat_feedback' ? 'uat' : 'form', form_key: def.key,
    title: `${def.title} form: ${p.name}`, assignee_id: p.customer_lead_id, due_date: due, priority: 'normal',
  })
  return error ? dbFail(error) : done(`${def.title} form sent.`)
}
