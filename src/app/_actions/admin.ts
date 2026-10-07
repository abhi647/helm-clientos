'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { canManage, requireStaff } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { syncZohoInvoices } from '@/lib/integrations/zoho'
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
  if (metaError) return dbFail(metaError)
  // an imported contact is no longer waiting to be invited
  await supabase.from('customer_contacts').update({ invited_at: new Date().toISOString() }).eq('customer_id', customer.id).eq('email', parsed.data.email)
  return done(`Invitation sent to ${parsed.data.email}.`)
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
    const { data: c } = await supabase.from('customers_internal').select('id').eq('hubspot_company_id', setup.hubspot_company_id).maybeSingle()
    customerId = c?.id ?? null
  }
  if (!customerId) {
    // the id is made here: a new customer row cannot be read back inside the same insert under RLS
    const id = crypto.randomUUID()
    const { error } = await supabase.from('customers').insert({ id, org_id: setup.org_id, name: setup.company_name, hubspot_company_id: setup.hubspot_company_id })
    if (error) return dbFail(error)
    customerId = id
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
    const estimates = phase.tasks.map((t, j) => ({ task_id: tasks[j]!.id, customer_id: customerId!, estimate: t.estimate ?? null, unit: 'day' }))
      .filter((e): e is { task_id: string; customer_id: string; estimate: number; unit: string } => e.estimate != null)
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

// ---------------------------------------------------------------- admin: team, customers, automations, sync

const isAdmin = (role: string | null) => role === 'admin' || role === 'ceo'

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  full_name: z.string().trim().min(1, 'Enter their name.').max(120),
  internal_role: z.enum(['admin', 'ceo', 'pm', 'consultant', 'finance']),
})

/** Invites a Seven Billion team member. Their role lives in app_metadata, which only the server can write. */
export async function inviteStaff(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can invite team members.')
  const parsed = staffSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/home`,
  })
  if (error || !data.user) return dbFail(error, error?.message.includes('already') ? 'That email already has an account.' : 'Invitation failed.')
  const { error: metaError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { kind: 'internal', org_id: me.org_id, internal_role: parsed.data.internal_role, full_name: parsed.data.full_name },
  })
  return metaError ? dbFail(metaError) : done(`Invitation sent to ${parsed.data.email}.`)
}

const ROLES = ['admin', 'ceo', 'pm', 'consultant', 'finance'] as const

/** Changes a team member's role (or removes access). You cannot change your own role, so an org always keeps an admin. */
export async function setStaffRole(userId: string, role: (typeof ROLES)[number] | 'remove'): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change roles.')
  if (userId === me.id) return fail('Ask another admin to change your own role.')
  if (!uuid.safeParse(userId).success || !(role === 'remove' || ROLES.includes(role))) return fail('Unknown person or role.')
  const supabase = await createClient()
  const { data: target } = await supabase.from('directory').select('id, org_id, kind').eq('id', userId).maybeSingle()
  if (!target || target.kind !== 'internal' || target.org_id !== me.org_id) return fail('Person not found.')
  const admin = createAdminClient()
  if (role === 'remove') return removeAccess(userId)
  const { data: u } = await admin.auth.admin.getUserById(userId)
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...(u.user?.app_metadata ?? {}), internal_role: role }, ban_duration: 'none' })
  if (error) return dbFail(error)
  await admin.rpc('set_access', { p_user: userId, p_revoked: false })
  return done('Role updated.')
}

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the customer name.').max(160),
  account_owner_id: z.preprocess((v) => (v === '' ? null : v), uuid.nullable()),
  hubspot_company_id: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(40).nullable()),
  zoho_customer_id: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(40).nullable()),
})

export async function createCustomer(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Only a PM, the CEO or an admin can add customers.')
  const parsed = customerSchema.safeParse(formObject(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('customers').insert({ id, ...parsed.data, org_id: me.org_id! })
  if (error) return dbFail(error, error.code === '23505' ? 'A customer with that HubSpot or Zoho id already exists.' : undefined)
  done()
  redirect(`/customers/${id}`)
}

export async function setAccountOwner(customerId: string, ownerId: string): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Not allowed.')
  const supabase = await createClient()
  const { error } = await supabase.from('customers').update({ account_owner_id: ownerId || null }).eq('id', customerId)
  return error ? dbFail(error) : done()
}

const RULES = ['kickoff_data_access', 'uat_start_action', 'uat_done_approval', 'at_risk_alert', 'critical_request_alert', 'closure_form', 'csat_request', 'csat_pulse', 'csat_low_followup'] as const

export async function setAutomation(key: (typeof RULES)[number], enabled: boolean): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change automations.')
  if (!RULES.includes(key)) return fail('Unknown rule.')
  const supabase = await createClient()
  const { error } = await supabase.from('automation_rules').upsert({ org_id: me.org_id!, key, enabled, updated_at: new Date().toISOString() })
  return error ? dbFail(error) : done(enabled ? 'Rule switched on.' : 'Rule switched off.')
}

/** Runs the Zoho Books sync now (the daily cron does this on its own). */
export async function syncZohoNow(): Promise<ActionResult> {
  const me = await requireStaff()
  if (!['admin', 'ceo', 'finance'].includes(me.internal_role ?? '')) return fail('Only finance, the CEO or an admin can sync.')
  try {
    const r = await syncZohoInvoices()
    if (r.skipped) return fail(`${r.skipped}. Add the ZOHO_* settings first.`)
    return done(`Synced ${r.upserted} invoices and ${r.payments ?? 0} payments${r.unmatched ? ` (${r.unmatched} for customers not in the app)` : ''}.`)
  } catch (e) {
    console.error('[zoho] manual sync failed', e)
    return fail('Zoho sync failed. Check the Zoho settings and try again.')
  }
}

/**
 * Removes someone's access at once: every database check refuses them from their next request, all their
 * sessions end, and they cannot sign in again. Their name stays on history (comments, approvals).
 */
async function removeAccess(userId: string): Promise<ActionResult> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('set_access', { p_user: userId, p_revoked: true })
  if (error) return dbFail(error)
  await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  return done('Access removed. They were signed out everywhere.')
}

/** Customer users: managers can remove or restore access for people at the customers they serve. */
export async function setCustomerAccess(userId: string, revoked: boolean): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canManage(me)) return fail('Only a PM, the CEO or an admin can change access.')
  if (!uuid.safeParse(userId).success) return fail('Unknown person.')
  const supabase = await createClient()
  const { data: target } = await supabase.from('directory').select('id, kind, customer_id').eq('id', userId).maybeSingle()
  if (!target || target.kind !== 'customer') return fail('Person not found.')
  if (revoked) return removeAccess(userId)
  const admin = createAdminClient()
  const { error } = await admin.rpc('set_access', { p_user: userId, p_revoked: false })
  if (error) return dbFail(error)
  await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  return done('Access restored.')
}

/** Admin import: HubSpot deals → customers and projects, Zoho invoices → linked to them, contacts → people to invite. */
export async function runBackfill(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!['admin', 'ceo'].includes(me.internal_role ?? '')) return fail('Only an admin or the CEO can run the import.')
  const overrides: Record<string, string> = {}
  for (const [k, v] of form.entries()) {
    if (k.startsWith('p_') && typeof v === 'string' && v.trim()) overrides[k.slice(2)] = v.trim().slice(0, 120)
  }
  try {
    const { runImport } = await import('@/lib/integrations/backfill')
    const s = await runImport(overrides)
    const parts = [
      `${s.customersCreated} customers created, ${s.customersLinked} linked`,
      `${s.projectsCreated} projects created`,
      `${s.dealsLinked} deals and ${s.invoicesLinked} invoices linked`,
      `${s.contactsAdded} people to invite`,
    ]
    return done(`Import finished: ${parts.join('; ')}.${s.notes.length ? ` ${s.notes.join(' ')}` : ''}`)
  } catch (e) {
    console.error('[import]', e)
    return fail(e instanceof Error ? e.message : 'The import failed.')
  }
}

/** Marks an imported contact as handled once they have been invited (or removes them from the list). */
export async function dismissContact(contactId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.from('customer_contacts').update({ invited_at: new Date().toISOString() }).eq('id', contactId)
  return error ? dbFail(error) : done()
}
