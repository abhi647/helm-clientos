'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { canManage, requireStaff } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { templateByKey } from '@/lib/templates'
import { type ActionResult, dbFail, done, fail, formObject, uuid } from './shared'

const inviteSchema = z.object({
  customer_id: uuid,
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  full_name: z.string().trim().min(1, 'Enter their name.').max(120),
  customer_role: z.enum(['customer_exec', 'customer_member']),
  can_view_invoices: z.preprocess((v) => v === 'on', z.boolean()),
})

/**
 * Invites a customer user. Access (customer, role, invoice flag) is written to app_metadata with the service key;
 * users cannot change app_metadata themselves, and the database turns it into their profile.
 */
export async function inviteCustomerUser(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Only a PM, the CEO or an admin can invite people.')
  const parsed = inviteSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data: customer } = await supabase.from('customers').select('id').eq('id', parsed.data.customer_id).single()
  if (!customer) return fail('Customer not found.')

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/portal`,
  })
  if (error || !data.user) return dbFail(error, error?.message.includes('already') ? 'That email already has an account.' : 'Invitation failed.')
  const { error: metaError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { kind: 'customer', customer_id: customer.id, customer_role: parsed.data.customer_role, can_view_invoices: parsed.data.can_view_invoices, full_name: parsed.data.full_name },
  })
  return metaError ? dbFail(metaError) : done(`Invitation sent to ${parsed.data.email}.`)
}

const addDays = (start: Date, d: number) => new Date(start.getTime() + d * 86_400_000).toISOString().slice(0, 10)

/** One click from a HubSpot Closed Won deal to a full project: customer, phases, tasks and estimates. */
export async function createEngagement(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Only a PM, the CEO or an admin can set up engagements.')
  const parsed = z.object({ setup_id: uuid, template_key: z.string(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), pm_id: uuid }).safeParse(formObject(form))
  if (!parsed.success) return fail('Choose a template, start date and PM.')
  const template = templateByKey(parsed.data.template_key)
  if (!template) return fail('Unknown template.')
  const supabase = await createClient()
  const { data: setup } = await supabase.from('engagement_setups').select('*').eq('id', parsed.data.setup_id).eq('status', 'pending').single()
  if (!setup) return fail('This engagement was already set up or dismissed.')

  // find or create the customer (matched on the HubSpot company)
  let customerId: string | null = null
  if (setup.hubspot_company_id) {
    const { data: c } = await supabase.from('customers').select('id').eq('hubspot_company_id', setup.hubspot_company_id).maybeSingle()
    customerId = c?.id ?? null
  }
  if (!customerId) {
    const { data: c, error } = await supabase.from('customers')
      .insert({ org_id: setup.org_id, name: setup.company_name, hubspot_company_id: setup.hubspot_company_id }).select('id').single()
    if (error || !c) return dbFail(error)
    customerId = c.id
  }

  const start = new Date(`${parsed.data.start_date}T00:00:00Z`)
  const { data: project, error: pErr } = await supabase.from('projects').insert({
    customer_id: customerId, name: setup.deal_name, template_key: template.key, start_date: parsed.data.start_date,
    end_date: addDays(start, template.weeks * 7), pm_id: parsed.data.pm_id, hubspot_deal_id: setup.hubspot_deal_id,
  }).select('id').single()
  if (pErr || !project) return dbFail(pErr)

  for (const [i, phase] of template.phases.entries()) {
    const { data: ph, error } = await supabase.from('phases').insert({ project_id: project.id, customer_id: customerId, name: phase.name, position: i }).select('id').single()
    if (error || !ph) return dbFail(error)
    const { data: tasks, error: tErr } = await supabase.from('tasks').insert(phase.tasks.map((t, j) => ({
      project_id: project.id, phase_id: ph.id, customer_id: customerId!, title: t.title, position: i * 100 + j,
      start_date: addDays(start, t.start), due_date: addDays(start, t.start + t.days), spotlight: !!t.spotlight,
      visibility: t.internal ? 'internal' as const : 'shared' as const, owner_side: t.customer ? 'customer' as const : 'seven_billion' as const,
      assignee_id: t.customer ? null : parsed.data.pm_id, created_by: me.id,
    }))).select('id, title')
    if (tErr || !tasks) return dbFail(tErr)
    const estimates = phase.tasks.map((t, j) => ({ task_id: tasks[j]!.id, customer_id: customerId!, estimate_hours: t.estimate ?? null }))
      .filter((e): e is { task_id: string; customer_id: string; estimate_hours: number } => e.estimate_hours != null)
    if (estimates.length) await supabase.from('task_estimates').insert(estimates)
  }
  await supabase.from('engagement_setups').update({ status: 'created', project_id: project.id }).eq('id', setup.id)
  done()
  redirect(`/projects/${project.id}?created=1`)
}

export async function dismissEngagement(setupId: string): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Not allowed.')
  const supabase = await createClient()
  const { error } = await supabase.from('engagement_setups').update({ status: 'dismissed' }).eq('id', setupId)
  return error ? dbFail(error) : done()
}
