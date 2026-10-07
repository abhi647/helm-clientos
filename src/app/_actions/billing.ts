'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { createZohoDraftInvoice } from '@/lib/integrations/zoho'
import { canSeeFinance, requireCustomer, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, uuid } from './shared'
import { CURRENCY_CODES } from '@/lib/currencies'
import { lookupZohoCustomer } from '@/lib/integrations/lookup'

// Rates are typed from the signed contract by finance; who may do what is enforced in the database (see the billing migration).

const KINDS = ['day_rate', 'delivery', 'unit', 'retainer'] as const
const amount = z.preprocess((v) => (typeof v === 'string' ? v.replace(/,/g, '').trim() : v), z.coerce.number().min(0, 'Amounts cannot be negative.').max(999_999_999_999))
const optionalAmount = z.preprocess((v) => (v === '' || v == null ? null : typeof v === 'string' ? v.replace(/,/g, '') : v), z.coerce.number().min(0).nullable())
const text = (max: number) => z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(max))

// ---------------------------------------------------------------- rate card (finance, admin, CEO)
export async function startRateCard(projectId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(projectId).success) return fail('Unknown project.')
  const supabase = await createClient()
  const { data: card, error } = await supabase.rpc('start_rate_card', { p_project: projectId })
  if (error) return dbFail(error)
  // the first rate card starts in the currency the customer is billed in on Zoho
  const { data: c } = await supabase.from('rate_cards').select('version, customer_id').eq('id', card).maybeSingle()
  if (c?.version === 1) {
    const { data: cust } = await supabase.from('customers_internal').select('zoho_customer_id').eq('id', c.customer_id).maybeSingle()
    const z = cust?.zoho_customer_id ? await lookupZohoCustomer(cust.zoho_customer_id) : null
    if (z?.found && z.currency && CURRENCY_CODES.includes(z.currency)) await supabase.from('rate_cards').update({ currency: z.currency }).eq('id', card)
  }
  return done()
}

const cardSchema = z.object({
  card_id: uuid,
  currency: z.string().trim().toUpperCase().refine((c) => CURRENCY_CODES.includes(c), 'Choose a currency from the list.'),
  po_number: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(80).nullable()),
  notes: text(2000),
})

export async function saveRateCard(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = cardSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const { card_id, ...fields } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('rate_cards').update(fields).eq('id', card_id).select('id')
  if (error) return dbFail(error)
  return data.length ? done('Saved.') : fail('This rate card can no longer be edited.')
}

// the unit a line is charged per: fixed for day rates (day) and retainers (month); a delivery is charged per delivery
// unless told otherwise; a per-unit line names its own unit (dashboard, user, report…)
const unitFor = (kind: (typeof KINDS)[number], unit: string) =>
  kind === 'day_rate' ? 'day' : kind === 'retainer' ? 'month' : unit === 'day' ? (kind === 'delivery' ? 'delivery' : 'unit') : unit

const lineSchema = z.object({
  kind: z.enum(KINDS),
  label: z.string().trim().min(1, 'Name the role, delivery or unit.').max(120),
  unit: z.string().trim().min(1, 'Say what the rate is charged per (day, month, dashboard…).').max(30),
  rate: amount,
  planned_quantity: optionalAmount,
  description: text(500),
  zoho_item_id: z.preprocess((v) => (v === '' || v == null ? null : v), z.string().trim().max(40).nullable()),
})

export async function addRateCardLine(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const card = uuid.safeParse(form.get('card_id'))
  const parsed = lineSchema.transform((l) => ({ ...l, unit: unitFor(l.kind, l.unit) })).safeParse(Object.fromEntries(form))
  if (!card.success) return fail('Unknown rate card.')
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const l = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_rate_card_line', {
    p_card: card.data, p_kind: l.kind, p_label: l.label, p_unit: l.unit, p_rate: l.rate,
    p_planned: l.planned_quantity ?? undefined, p_description: l.description, p_zoho_item: l.zoho_item_id ?? undefined,
  })
  return error ? dbFail(error) : done('Line added.')
}

export async function updateRateCardLine(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const id = uuid.safeParse(form.get('line_id'))
  const parsed = lineSchema.transform((l) => ({ ...l, unit: unitFor(l.kind, l.unit) })).safeParse(Object.fromEntries(form))
  if (!id.success) return fail('Unknown line.')
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { data, error } = await supabase.from('rate_card_lines').update(parsed.data).eq('id', id.data).select('id')
  if (error) return dbFail(error)
  return data.length ? done('Saved.') : fail('This rate card can no longer be edited.')
}

export async function removeRateCardLine(lineId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { data, error } = await supabase.from('rate_card_lines').delete().eq('id', lineId).select('id')
  if (error) return dbFail(error)
  return data.length ? done() : fail('This rate card can no longer be edited.')
}

export async function submitRateCard(cardId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_rate_card', { p_card: cardId })
  return error ? dbFail(error) : done('Sent to the customer for approval.')
}

const onBehalf = z.object({ note: z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(500)) })

/** Admin, CEO or finance approve the rates for the customer (agreed in the contract or on a call); the customer is told. */
export async function approveRateCardForCustomer(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canSeeFinance(me)) return fail('Only finance, the CEO or an admin can approve rates for the customer.')
  const id = uuid.safeParse(form.get('card_id'))
  const parsed = onBehalf.safeParse(Object.fromEntries(form))
  if (!id.success || !parsed.success) return fail('Unknown rate card.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_rate_card_for_customer', { p_card: id.data, p_note: parsed.data.note || undefined })
  return error ? dbFail(error) : done('Approved. The customer has been told.')
}

/** The same for a statement; the Zoho draft invoice follows straight away. */
export async function approveStatementForCustomer(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canSeeFinance(me)) return fail('Only finance, the CEO or an admin can approve a statement for the customer.')
  const id = uuid.safeParse(form.get('statement_id'))
  const parsed = onBehalf.safeParse(Object.fromEntries(form))
  if (!id.success || !parsed.success) return fail('Unknown statement.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_statement_for_customer', { p_statement: id.data, p_note: parsed.data.note || undefined })
  if (error) return dbFail(error)
  after(async () => {
    const res = await createZohoDraftInvoice(id.data)
    if (!res.ok) console.error('[zoho] draft invoice', id.data, res.error)
  })
  return done('Approved. The customer has been told, and the draft invoice is being created in Zoho.')
}

export async function discardRateCard(cardId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { data, error } = await supabase.from('rate_cards').delete().eq('id', cardId).select('id')
  if (error) return dbFail(error)
  return data.length ? done() : fail('Only a draft that was never sent can be discarded.')
}

// ---------------------------------------------------------------- statements (finance, admin, CEO, the project's PM)
const period = z.object({
  project_id: uuid,
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the first day of the period.'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the last day of the period.'),
})

export async function createStatement(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = period.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const { project_id, period_start, period_end } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_statement', { p_project: project_id, p_start: period_start, p_end: period_end })
  if (error) return dbFail(error)
  redirect(`/projects/${project_id}/billing/${data}`)
}

/** Saves the period, the note and every line's quantity (the rate always stays the approved one). */
export async function saveStatement(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const id = uuid.safeParse(form.get('statement_id'))
  if (!id.success) return fail('Unknown statement.')
  const head = z.object({ period_start: period.shape.period_start, period_end: period.shape.period_end, note: text(2000) })
    .safeParse(Object.fromEntries(form))
  if (!head.success) return fail(head.error.issues[0]!.message)
  if (head.data.period_end < head.data.period_start) return fail('The period ends before it starts.')
  const supabase = await createClient()
  const { data, error } = await supabase.from('billing_statements').update(head.data).eq('id', id.data).select('id')
  if (error) return dbFail(error)
  if (!data.length) return fail('This statement can no longer be edited.')
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith('q_')) continue
    const lineId = uuid.safeParse(key.slice(2))
    const quantity = amount.safeParse(raw)
    if (!lineId.success) continue
    if (!quantity.success) return fail('Quantities must be numbers of 0 or more.')
    const note = text(300).parse(form.get(`n_${lineId.data}`))
    const { error: e } = await supabase.from('statement_lines').update({ quantity: quantity.data, note }).eq('id', lineId.data).eq('statement_id', id.data)
    if (e) return dbFail(e)
  }
  return done('Saved.')
}

/** Fills the day-rate lines that name people with their approved, unbilled days in the period. */
export async function refillStatement(statementId: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(statementId).success) return fail('Unknown statement.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('refill_statement', { p_statement: statementId })
  return error ? dbFail(error) : done('Filled from approved timesheets.')
}

/** Who a day-rate line bills: their approved days fill it on each statement. */
export async function setLinePeople(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canSeeFinance(me)) return fail('Only finance, the CEO or an admin can change this.')
  const line = uuid.safeParse(form.get('people_line'))
  const people = z.array(uuid).max(50).safeParse(form.getAll('person'))
  if (!line.success || !people.success) return fail('Unknown line or person.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_line_people', { p_line: line.data, p_people: people.data })
  return error ? dbFail(error) : done(people.data.length ? 'Saved. Their approved days fill this line on statements.' : 'Saved. This line is filled by working days again.')
}

export async function submitStatement(statementId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_statement', { p_statement: statementId })
  return error ? dbFail(error) : done('Sent to the customer for approval.')
}

export async function deleteStatement(statementId: string, projectId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { data, error } = await supabase.from('billing_statements').delete().eq('id', statementId).select('id')
  if (error) return dbFail(error)
  if (!data.length) return fail('Only a draft that was never sent can be deleted.')
  redirect(`/projects/${projectId}/billing`)
}

/** Finance: try the Zoho draft invoice again (for example after adding the customer's Zoho id). */
export async function retryZohoInvoice(statementId: string): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('billing_statements').select('id, status').eq('id', statementId).maybeSingle()
  if (!data || data.status !== 'approved') return fail('Only an approved statement that has no invoice yet can be sent to Zoho.')
  const res = await createZohoDraftInvoice(statementId)
  return res.ok ? done(`Draft invoice ${res.number} created in Zoho.`) : fail(res.error)
}

// ---------------------------------------------------------------- customer decisions
const decision = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  comment: text(1000),
})

export async function decideRateCard(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireCustomer()
  const id = uuid.safeParse(form.get('card_id'))
  const parsed = decision.safeParse(Object.fromEntries(form))
  if (!id.success || !parsed.success) return fail('Choose approve or request changes.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_rate_card', {
    p_card: id.data, p_approve: parsed.data.decision === 'approved', p_note: parsed.data.comment || undefined,
  })
  if (error) return dbFail(error)
  return done(parsed.data.decision === 'approved' ? 'Rates approved. Thank you.' : 'Sent back to Seven Billion with your comments.')
}

export async function decideStatement(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireCustomer()
  const id = uuid.safeParse(form.get('statement_id'))
  const parsed = decision.safeParse(Object.fromEntries(form))
  if (!id.success || !parsed.success) return fail('Choose approve or request changes.')
  const supabase = await createClient()
  const approve = parsed.data.decision === 'approved'
  const { error } = await supabase.rpc('decide_statement', { p_statement: id.data, p_approve: approve, p_note: parsed.data.comment || undefined })
  if (error) return dbFail(error)
  // the draft invoice is created after the response, so the customer is not kept waiting on Zoho
  if (approve) after(async () => {
    const res = await createZohoDraftInvoice(id.data)
    if (!res.ok) console.error('[zoho] draft invoice', id.data, res.error)
  })
  return done(approve ? 'Statement approved. Thank you.' : 'Sent back to Seven Billion with your comments.')
}
