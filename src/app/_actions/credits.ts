'use server'

import { z } from 'zod'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, uuid } from './shared'

const hours = (msg: string) => z.coerce.number({ message: msg }).min(0, msg).max(100000, msg)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')

const planSchema = z.object({
  customer_id: uuid,
  kind: z.enum(['prepaid', 'monthly', 'none']),
  monthly_hours: z.preprocess((v) => (v === '' ? undefined : v), hours('Enter the hours each month.').optional()),
  // empty = no cap; 0 = nothing carries over
  rollover_cap: z.preprocess((v) => (v === '' ? null : v), hours('Enter the most hours that can carry over.').nullable()),
  starts_on: date,
})

/** Finance sets the customer's hours credit: prepaid blocks, or a monthly allowance with carry-over. */
export async function setCreditPlan(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canSeeFinance(me)) return fail('Only finance, the CEO or an admin can set the hours credit.')
  const parsed = planSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const p = parsed.data
  const supabase = await createClient()
  if (p.kind === 'none') {
    const { error } = await supabase.from('credit_plans').delete().eq('customer_id', p.customer_id)
    return error ? dbFail(error) : done('Hours credit removed. Top-ups are kept.')
  }
  if (p.kind === 'monthly' && p.monthly_hours == null) return fail('Enter the hours each month.')
  const { error } = await supabase.from('credit_plans').upsert({
    customer_id: p.customer_id, kind: p.kind, starts_on: p.starts_on,
    monthly_hours: p.kind === 'monthly' ? p.monthly_hours! : null,
    rollover_cap: p.kind === 'monthly' ? p.rollover_cap : null,
    updated_by: me.id, updated_at: new Date().toISOString(),
  })
  return error ? dbFail(error) : done('Hours credit saved.')
}

const topupSchema = z.object({
  customer_id: uuid,
  hours: z.coerce.number({ message: 'Enter the hours.' }).positive('Enter the hours.').max(100000),
  added_on: date,
  note: z.string().trim().max(300).optional(),
})

/** Adds hours: a prepaid block bought, or extra hours on a monthly plan (counted in the month they are added). */
export async function addCreditTopup(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canSeeFinance(me)) return fail('Only finance, the CEO or an admin can add hours.')
  const parsed = topupSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { error } = await supabase.from('credit_topups').insert({ ...parsed.data, note: parsed.data.note ?? '', added_by: me.id })
  return error ? dbFail(error) : done(`${+parsed.data.hours.toFixed(2)} h added.`)
}

export async function deleteCreditTopup(id: string): Promise<ActionResult> {
  const me = await requireStaff()
  if (!canSeeFinance(me)) return fail('Only finance, the CEO or an admin can remove hours.')
  if (!uuid.safeParse(id).success) return fail('Unknown entry.')
  const supabase = await createClient()
  const { error } = await supabase.from('credit_topups').delete().eq('id', id)
  return error ? dbFail(error) : done('Removed.')
}
