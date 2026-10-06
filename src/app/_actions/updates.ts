'use server'

import { z } from 'zod'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, formObject, uuid } from './shared'

/** Starts this week's update, pre-filled from the plan, so the PM only edits and publishes. */
export async function startWeeklyUpdate(projectId: string): Promise<ActionResult> {
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('id, customer_id, health').eq('id', projectId).single()
  if (!project) return fail('Project not found.')
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const { data: tasks } = await supabase.from('tasks').select('title, status, owner_side, completed_at, due_date, visibility')
    .eq('project_id', projectId).eq('visibility', 'shared')
  const t = tasks ?? []
  const lines = (xs: { title: string }[]) => xs.map((x) => x.title).join('\n')
  const monday = new Date()
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const { error } = await supabase.from('updates').insert({
    customer_id: project.customer_id, project_id: project.id, week_of: monday.toISOString().slice(0, 10), health: project.health,
    completed: lines(t.filter((x) => x.status === 'done' && x.completed_at && x.completed_at >= weekAgo)),
    in_progress: lines(t.filter((x) => ['in_progress', 'in_review'].includes(x.status))),
    waiting_on_customer: lines(t.filter((x) => x.owner_side === 'customer' && x.status !== 'done')),
    next_week: lines(t.filter((x) => x.status === 'todo' && x.due_date && x.due_date <= soon)),
    author_id: me.id,
  })
  return error ? dbFail(error) : done('Draft created from the plan. Edit it, then publish.')
}

const updateSchema = z.object({
  update_id: uuid,
  health: z.enum(['on_track', 'needs_attention', 'at_risk']),
  completed: z.string().max(5000), in_progress: z.string().max(5000), waiting_on_customer: z.string().max(5000), next_week: z.string().max(5000),
  intent: z.enum(['save', 'publish']),
})

export async function saveWeeklyUpdate(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = updateSchema.safeParse(formObject(form))
  if (!parsed.success) return fail('Fill in every section (it can say "Nothing this week").')
  const { update_id, intent, ...fields } = parsed.data
  const supabase = await createClient()
  const { data: u, error } = await supabase.from('updates').update(fields).eq('id', update_id).select('project_id').single()
  if (error || !u) return dbFail(error)
  await supabase.from('projects').update({ health: fields.health }).eq('id', u.project_id)
  if (intent === 'publish') {
    const pub = await supabase.rpc('publish_update', { p_update: update_id })
    if (pub.error) return dbFail(pub.error)
    return done('Published. The customer team has been emailed.')
  }
  return done('Draft saved.')
}
