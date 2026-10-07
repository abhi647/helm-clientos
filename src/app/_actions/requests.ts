'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Enums } from '@/lib/database.types'
import { canManage, requireProfile, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, optionalDate, uuid } from './shared'

const TYPES = ['requirement', 'enhancement', 'change_request', 'bug', 'new_report', 'data_request', 'access_request', 'support', 'other'] as const
const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const

const requestSchema = z.object({
  title: z.string().trim().min(3, 'Give the request a short title.').max(200),
  what: z.string().trim().min(3, 'Say what you need.').max(5000),
  why: z.string().trim().max(5000).default(''),
  type: z.enum(TYPES).default('requirement'),
  priority: z.enum(PRIORITIES).default('normal'),
  project_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  desired_date: optionalDate,
  customer_id: uuid.optional(),
  on_behalf_of: z.preprocess((v) => (v === '' || v == null ? null : v), uuid.nullable()).optional(),   // staff only: a person at the customer, or the company
})

/** Customers raise requests for their own company; staff can log one on a customer's behalf. */
export async function createRequest(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireProfile()
  const parsed = requestSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const customer_id = me.kind === 'customer' ? me.customer_id! : parsed.data.customer_id
  if (!customer_id) return fail('Choose the customer.')
  const supabase = await createClient()
  const { on_behalf_of, ...fields } = parsed.data
  // staff log a request the customer gave them (a call, a meeting): it is the customer's request, logged by them
  const people = me.kind === 'customer' ? { requested_by: me.id } : { requested_by: on_behalf_of ?? null, raised_by: me.id, owner_id: me.id }   // whoever logged it owns it until reassigned
  const { data, error } = await supabase.from('requests')
    .insert({ ...fields, customer_id, ...people }).select('id, number').single()
  if (error || !data) return dbFail(error, error?.message.includes('requester must be') ? 'Choose someone at this customer.' : undefined)
  done()
  redirect(`${me.kind === 'customer' ? '/portal' : ''}/requests/${data.id}?created=${data.number}`)
}

const STATUSES: Enums<'request_status'>[] = ['submitted', 'under_review', 'clarification', 'estimated', 'approved', 'scheduled', 'in_development', 'uat', 'delivered', 'cancelled']

export async function setRequestStatus(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = z.object({ request_id: uuid, status: z.enum(STATUSES as [string, ...string[]]), note: z.string().trim().max(500).optional() }).safeParse(formObject(form))
  if (!parsed.success) return fail('Choose a stage.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_request_status', {
    p_request: parsed.data.request_id, p_status: parsed.data.status as Enums<'request_status'>, p_note: parsed.data.note || undefined,
  })
  return error ? dbFail(error) : done('Stage updated.')
}

export async function assignRequest(requestId: string, ownerId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.from('requests').update({ owner_id: ownerId }).eq('id', requestId)
  return error ? dbFail(error) : done()
}

const approvalSchema = z.object({
  request_id: uuid,
  summary: z.string().trim().min(5, 'Describe the scope being approved.').max(5000),
  effort: z.coerce.number().positive('Enter the estimated effort.').max(5000),
  effort_unit: z.string().trim().min(1).max(40).default('day'),
  target_date: optionalDate,
  due_date: optionalDate,
  approver_id: uuid,
})

/** Asks the customer to approve an estimate. The database creates their action item, history and email. */
export async function requestApproval(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  const parsed = approvalSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: req } = await supabase.from('requests').select('customer_id, project_id, number, title').eq('id', parsed.data.request_id).single()
  if (!req) return fail('Request not found.')
  const { error } = await supabase.from('approvals').insert({
    ...parsed.data, customer_id: req.customer_id, project_id: req.project_id, kind: 'estimate',
    title: `Estimate for ${req.number}: ${req.title}`, requested_by: me.id,
  })
  return error ? dbFail(error) : done('Approval requested. The customer has been notified.')
}

export async function decideApproval(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireProfile()
  const parsed = z.object({ approval_id: uuid, decision: z.enum(['approved', 'changes_requested']), comment: z.string().trim().max(5000).optional() }).safeParse(formObject(form))
  if (!parsed.success) return fail('Choose approve or request changes.')
  if (parsed.data.decision === 'changes_requested' && !parsed.data.comment) return fail('Please say what should change.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_approval', { p_approval: parsed.data.approval_id, p_decision: parsed.data.decision, p_comment: parsed.data.comment || undefined })
  return error ? dbFail(error) : done(parsed.data.decision === 'approved' ? 'Approved. Thank you.' : 'Sent back with your comments.')
}

/** The PM, CEO or an admin approve for the customer (agreed on a call or by email); the customer is told. */
export async function approveForCustomer(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Only a PM, the CEO or an admin can approve for the customer.')
  const id = uuid.safeParse(form.get('approval_id'))
  const note = z.string().trim().max(500).safeParse(form.get('note') ?? '')
  if (!id.success || !note.success) return fail('Unknown approval.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_for_customer', { p_approval: id.data, p_note: note.data || undefined })
  return error ? dbFail(error) : done('Approved. The customer has been told.')
}

export async function resubmitApproval(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = z.object({
    approval_id: uuid, summary: z.string().trim().min(5).max(5000), effort: z.coerce.number().positive().max(5000),
    effort_unit: z.string().trim().min(1).max(40).optional(),
    target_date: optionalDate, comment: z.string().trim().max(2000).optional(),
  }).safeParse(formObject(form))
  if (!parsed.success) return fail('Fill in the revised scope and effort.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('resubmit_approval', {
    p_approval: parsed.data.approval_id, p_summary: parsed.data.summary, p_effort: parsed.data.effort, p_unit: parsed.data.effort_unit,
    p_target: parsed.data.target_date ?? undefined, p_comment: parsed.data.comment || undefined,
  })
  return error ? dbFail(error) : done('Revision sent for approval.')
}

export async function completeAction(actionId: string): Promise<ActionResult> {
  await requireProfile()
  if (!uuid.safeParse(actionId).success) return fail('Unknown item.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_action_item', { p_action: actionId })
  return error ? dbFail(error) : done('Done. Seven Billion has been told.')
}

const toTaskSchema = z.object({
  request_id: uuid,
  project_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  assignee_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  due_date: optionalDate,
  estimate: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().positive().max(5000).nullable()),
  unit: z.string().trim().min(1).max(40).default('day'),
  visibility: z.enum(['shared', 'internal']),
})

/** Puts a request on the plan as a task. Shared: the customer sees it and the request moves to Scheduled. */
export async function requestToTask(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = toTaskSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_to_task', {
    p_request: d.request_id, p_assignee: d.assignee_id ?? undefined, p_shared: d.visibility === 'shared', p_due: d.due_date ?? undefined,
    p_project: d.project_id ?? undefined, p_estimate: d.estimate ?? undefined, p_unit: d.unit,
  })
  if (error) return dbFail(error, error.message.includes('choose the project') ? 'Choose the project this request belongs to.' : undefined)
  return done(d.visibility === 'shared' ? 'Added to the plan. The customer can see it.' : 'Added to the plan as an internal task.')
}
