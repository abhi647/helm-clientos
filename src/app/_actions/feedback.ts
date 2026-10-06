'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireProfile, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, uuid } from './shared'

const answerSchema = z.object({
  survey_id: uuid,
  score: z.coerce.number().int().min(1, 'Choose a score.').max(5),
  comment: z.string().trim().max(2000).default(''),
})

/** Answers a CSAT survey sent to the signed-in customer. A score of 1 or 2 opens a follow-up for the team. */
export async function answerCsat(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireProfile()
  const parsed = answerSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { error } = await supabase.rpc('answer_csat', { p_survey: parsed.data.survey_id, p_score: parsed.data.score, p_comment: parsed.data.comment })
  if (error?.message.match(/already answered|has closed|not found/)) return fail(error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.')
  return error ? dbFail(error) : done(parsed.data.score <= 2 ? 'Thank you. Your account owner will be in touch.' : 'Thank you for the feedback.', { refresh: false })
}

const feedbackSchema = z.object({
  kind: z.enum(['praise', 'suggestion', 'issue', 'other']),
  project_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  body: z.string().trim().min(2, 'Write your feedback first.').max(5000),
})

/** A customer sends feedback at any time. It goes to their account owner and PM. */
export async function sendFeedback(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireProfile()
  if (me.kind !== 'customer') return fail('Feedback is sent from the customer portal.')
  const parsed = feedbackSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data, error } = await supabase.from('feedback')
    .insert({ ...parsed.data, customer_id: me.customer_id!, submitted_by: me.id }).select('id, number').single()
  if (error || !data) return dbFail(error)
  done()
  redirect(`/portal/feedback/${data.id}?sent=${data.number}`)
}

const STATUSES = ['new', 'acknowledged', 'actioned', 'closed'] as const

export async function setFeedbackStatus(id: string, status: (typeof STATUSES)[number]): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(id).success || !STATUSES.includes(status)) return fail('Unknown feedback or status.')
  const supabase = await createClient()
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id)
  return error ? dbFail(error) : done()
}

export async function assignFeedback(id: string, ownerId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(id).success) return fail('Unknown feedback.')
  const supabase = await createClient()
  const { error } = await supabase.from('feedback').update({ owner_id: ownerId || null }).eq('id', id)
  return error ? dbFail(error) : done()
}
