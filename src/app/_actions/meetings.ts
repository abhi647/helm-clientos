'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, optionalDate, uuid, visibility } from './shared'

const nullableId = z.preprocess((v) => (v === '' || v == null ? null : v), uuid.nullable())

const meetingSchema = z.object({
  project_id: uuid,
  title: z.string().trim().min(2, 'Give the meeting a title.').max(160),
  held_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the meeting date.'),
  attendees: z.string().trim().max(500).default(''),
  summary: z.string().trim().max(10_000).default(''),
  visibility: visibility.default('shared'),
})

export async function createMeeting(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = meetingSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('customer_id').eq('id', parsed.data.project_id).single()
  if (!project) return fail('Project not found.')
  const { data, error } = await supabase.from('meetings').insert({ ...parsed.data, customer_id: project.customer_id }).select('id').single()
  if (error || !data) return dbFail(error)
  done()
  redirect(`/meetings/${data.id}`)
}

const notesSchema = z.object({
  meeting_id: uuid,
  attendees: z.string().trim().max(500).default(''),
  summary: z.string().trim().max(10_000).default(''),
})

export async function saveMeetingNotes(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = notesSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const { meeting_id, ...rest } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('meetings').update(rest).eq('id', meeting_id)
  return error ? dbFail(error) : done('Notes saved.')
}

const actionSchema = z.object({
  meeting_id: uuid,
  text: z.string().trim().min(2, 'Describe the action.').max(300),
  assignee_id: nullableId,
  due_date: optionalDate,
})

/** An action line from the meeting. Owner side follows the person: a customer assignee makes it a customer action. */
export async function addMeetingAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = actionSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: meeting } = await supabase.from('meetings').select('customer_id').eq('id', parsed.data.meeting_id).single()
  if (!meeting) return fail('Meeting not found.')
  let owner_side: 'seven_billion' | 'customer' = 'seven_billion'
  if (parsed.data.assignee_id) {
    const { data: who } = await supabase.from('profiles').select('kind').eq('id', parsed.data.assignee_id).single()
    if (who?.kind === 'customer') owner_side = 'customer'
  }
  const { error } = await supabase.from('meeting_actions').insert({ ...parsed.data, customer_id: meeting.customer_id, owner_side })
  return error ? dbFail(error) : done()
}

export async function createTaskFromAction(actionId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(actionId).success) return fail('Unknown action.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_task_from_meeting_action', { p_action: actionId })
  if (error?.message.includes('link the meeting')) return fail('Link the meeting to a project first.')
  return error ? dbFail(error) : done('Task created in the plan.')
}

const decisionSchema = z.object({
  project_id: uuid,
  meeting_id: nullableId,
  decision: z.string().trim().min(3, 'Write the decision.').max(1000),
  decided_by: z.string().trim().max(200).default(''),
  visibility: visibility.default('shared'),
})

export async function addDecision(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = decisionSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('customer_id').eq('id', parsed.data.project_id).single()
  if (!project) return fail('Project not found.')
  const { data, error } = await supabase.from('decisions').insert({ ...parsed.data, customer_id: project.customer_id }).select('number').single()
  return error || !data ? dbFail(error) : done(`${data.number} recorded.`)
}
