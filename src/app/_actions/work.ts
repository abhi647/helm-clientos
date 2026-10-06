'use server'

import { z } from 'zod'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, optionalDate, uuid, visibility } from './shared'

const STATUSES = ['todo', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'done'] as const

export async function setTaskStatus(taskId: string, status: (typeof STATUSES)[number]): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(taskId).success || !STATUSES.includes(status)) return fail('Unknown task or status.')
  const supabase = await createClient()
  const { error } = await supabase.from('tasks')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null }).eq('id', taskId)
  return error ? dbFail(error) : done()
}

export async function setSpotlight(taskId: string, spotlight: boolean): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update({ spotlight }).eq('id', taskId)
  return error ? dbFail(error) : done()
}

const taskSchema = z.object({
  project_id: uuid,
  phase_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  title: z.string().trim().min(2, 'Give the task a title.').max(200),
  assignee_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  due_date: optionalDate,
  visibility: visibility.default('shared'),
  estimate_hours: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(2000).nullable()),
})

export async function createTask(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  const parsed = taskSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const { estimate_hours, ...t } = parsed.data
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('customer_id').eq('id', t.project_id).single()
  if (!project) return fail('Project not found.')
  let owner_side: 'seven_billion' | 'customer' = 'seven_billion'
  if (t.assignee_id) {
    const { data: assignee } = await supabase.from('profiles').select('kind').eq('id', t.assignee_id).single()
    if (assignee?.kind === 'customer') owner_side = 'customer'
  }
  const { data: task, error } = await supabase.from('tasks')
    .insert({ ...t, customer_id: project.customer_id, owner_side, created_by: me.id, position: 999 }).select('id').single()
  if (error || !task) return dbFail(error)
  if (estimate_hours != null) await supabase.from('task_estimates').insert({ task_id: task.id, customer_id: project.customer_id, estimate_hours })
  return done('Task added.')
}

const timeSchema = z.object({
  task_id: uuid,
  hours: z.coerce.number().positive('Enter the hours worked.').max(24),
  worked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  billable: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  note: z.string().trim().max(500).optional(),
})

export async function logTime(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  const parsed = timeSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: task } = await supabase.from('tasks').select('customer_id').eq('id', parsed.data.task_id).single()
  if (!task) return fail('Task not found.')
  const { error } = await supabase.from('time_entries').insert({ ...parsed.data, customer_id: task.customer_id, user_id: me.id, note: parsed.data.note || null })
  return error ? dbFail(error) : done(`${parsed.data.hours} h logged.`)
}
