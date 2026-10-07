'use server'

import { z } from 'zod'
import { effort } from '@/lib/format'
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

/** Gives a task to someone else. Customer people make it a customer-side task (it shows on their home page). */
export async function setTaskOwner(taskId: string, assigneeId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(taskId).success || (assigneeId && !uuid.safeParse(assigneeId).success)) return fail('Unknown task or person.')
  const supabase = await createClient()
  let owner_side: 'seven_billion' | 'customer' = 'seven_billion'
  if (assigneeId) {
    const { data: who } = await supabase.from('profiles').select('kind').eq('id', assigneeId).single()
    if (!who) return fail('Person not found.')
    if (who.kind === 'customer') owner_side = 'customer'
  }
  const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId || null, owner_side }).eq('id', taskId)
  return error ? dbFail(error) : done(assigneeId ? 'Owner changed. They have been notified.' : 'Task unassigned.')
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
  estimate: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(5000).nullable()),
  unit: z.string().trim().min(1).max(40).default('day'),   // from effort_units(): the project's billing units
})

export async function createTask(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  const parsed = taskSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const { estimate, unit, ...t } = parsed.data
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
  if (estimate != null) await supabase.from('task_estimates').insert({ task_id: task.id, customer_id: project.customer_id, estimate, unit })
  return done('Task added.')
}

const timeSchema = z.object({
  task_id: uuid,
  days: z.coerce.number().positive('Enter the days worked.').max(3, 'Log at most 3 days at once.'),
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
  return error ? dbFail(error) : done(`${effort(parsed.data.days)} logged.`)
}

const projectState = z.object({ health: z.enum(['on_track', 'needs_attention', 'at_risk']).optional(), status: z.enum(['active', 'on_hold', 'completed']).optional() })

/** Health and status drive the playbook: At Risk alerts the PM and CEO, Completed sends the closure form. */
export async function setProjectState(projectId: string, change: z.input<typeof projectState>): Promise<ActionResult> {
  const me = await requireStaff()
  if (!['admin', 'ceo', 'pm'].includes(me.internal_role ?? '')) return fail('Only a PM, the CEO or an admin can change this.')
  const parsed = projectState.safeParse(change)
  if (!uuid.safeParse(projectId).success || !parsed.success) return fail('Unknown project or value.')
  const supabase = await createClient()
  const { error } = await supabase.from('projects').update(parsed.data).eq('id', projectId)
  return error ? dbFail(error) : done()
}
