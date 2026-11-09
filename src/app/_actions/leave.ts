'use server'

import { z } from 'zod'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, uuid } from './shared'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
const isAdmin = (role: string | null) => role === 'admin' || role === 'ceo'

const applySchema = z.object({
  leave_type_id: uuid,
  start_date: day,
  end_date: z.preprocess((v) => (v === '' || v == null ? undefined : v), day.optional()),
  half_day: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
  reason: z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(1000)),
})

/** Applies for leave: the database counts the working days, checks the balance and overlaps, and tells the approver. */
export async function applyLeave(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const parsed = applySchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const a = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('apply_leave', {
    p_type: a.leave_type_id, p_start: a.start_date, p_end: a.end_date ?? a.start_date, p_half_day: a.half_day, p_reason: a.reason,
  })
  return error ? dbFail(error) : done('Applied. Your manager has been told.')
}

/** The manager (or an admin or the CEO) approves or declines; approved leave lands in billing and the timesheet. */
export async function decideLeave(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireStaff()
  const id = uuid.safeParse(form.get('request_id'))
  const decision = z.enum(['approve', 'decline']).safeParse(form.get('decision'))
  const note = z.string().trim().max(1000).safeParse(form.get('note') ?? '')
  if (!id.success || !decision.success || !note.success) return fail('Unknown request.')
  if (decision.data === 'decline' && !note.data) return fail('Say why it is declined, so they can re-plan.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_leave', { p_request: id.data, p_approve: decision.data === 'approve', p_note: note.data })
  return error ? dbFail(error) : done(decision.data === 'approve' ? 'Approved.' : 'Declined.')
}

export async function cancelLeave(id: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(id).success) return fail('Unknown request.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_leave', { p_request: id })
  return error ? dbFail(error) : done('Cancelled.')
}

// ---------------------------------------------------------------- holidays (admin and CEO)
const holidaySchema = z.object({
  day,
  name: z.string().trim().min(2, 'Name the holiday.').max(80),
  optional: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()),
})

export async function addHoliday(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change the holiday list.')
  const parsed = holidaySchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  const supabase = await createClient()
  const { error } = await supabase.from('holidays').insert(parsed.data)
  if (error?.code === '23505') return fail('There is already a holiday on that day.')
  return error ? dbFail(error) : done(`${parsed.data.name} added.`)
}

/** The national holidays that fall on the same date every year; the rest (Holi, Diwali, Eid…) are added by date. */
export async function addFixedHolidays(year: number): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change the holiday list.')
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return fail('Unknown year.')
  const supabase = await createClient()
  const rows = [
    { day: `${year}-01-26`, name: 'Republic Day', optional: false },
    { day: `${year}-08-15`, name: 'Independence Day', optional: false },
    { day: `${year}-10-02`, name: 'Gandhi Jayanti', optional: false },
    { day: `${year}-12-25`, name: 'Christmas', optional: false },
  ]
  const { error } = await supabase.from('holidays').upsert(rows, { onConflict: 'day', ignoreDuplicates: true })
  return error ? dbFail(error) : done(`Added the fixed national holidays for ${year}.`)
}

export async function removeHoliday(id: string): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change the holiday list.')
  if (!uuid.safeParse(id).success) return fail('Unknown holiday.')
  const supabase = await createClient()
  const { data, error } = await supabase.from('holidays').delete().eq('id', id).select('id')
  if (error) return dbFail(error)
  return data.length ? done('Removed.') : fail('That holiday was already removed.')
}

// ---------------------------------------------------------------- settings (admin and CEO)
/** Leave types: each one's yearly allowance and whether it is in use. */
export async function saveLeaveTypes(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change leave types.')
  const supabase = await createClient()
  const ids = form.getAll('type_id').map(String)
  for (const id of ids) {
    if (!uuid.safeParse(id).success) return fail('Unknown leave type.')
    const raw = String(form.get(`allowance_${id}`) ?? '').trim()
    const allowance = raw === '' ? null : Number(raw)
    if (allowance != null && (!Number.isFinite(allowance) || allowance < 0 || allowance > 365 || (allowance * 2) % 1 !== 0)) return fail('Allowances are days, in halves: 12, 7.5…')
    const { error } = await supabase.from('leave_types').update({ yearly_allowance: allowance, active: form.get(`active_${id}`) === 'on' }).eq('id', id)
    if (error) return dbFail(error)
  }
  return done('Leave types saved.')
}

/** Who approves this person's leave; empty: admins and the CEO. */
export async function setReportingManager(profileId: string, managerId: string): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can set managers.')
  if (!uuid.safeParse(profileId).success || (managerId && !uuid.safeParse(managerId).success)) return fail('Unknown person.')
  if (managerId === profileId) return fail('Nobody approves their own leave.')
  const supabase = await createClient()
  const { error } = managerId
    ? await supabase.from('reporting_managers').upsert({ profile_id: profileId, manager_id: managerId })
    : await supabase.from('reporting_managers').delete().eq('profile_id', profileId)
  return error ? dbFail(error) : done()
}

/** A person's own allowance for a year (joined mid-year, carried over); empty: the type's default. */
export async function setAllowance(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireStaff()
  if (!isAdmin(me.internal_role)) return fail('Only an admin or the CEO can change allowances.')
  const parsed = z.object({ profile_id: uuid, leave_type_id: uuid, year: z.coerce.number().int().min(2020).max(2100), days: z.string().trim() }).safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail('Check the person, type and year.')
  const supabase = await createClient()
  const { profile_id, leave_type_id, year, days } = parsed.data
  if (days === '') {
    const { error } = await supabase.from('leave_allowances').delete().match({ profile_id, leave_type_id, year })
    return error ? dbFail(error) : done('Back to the default allowance.')
  }
  const n = Number(days)
  if (!Number.isFinite(n) || n < 0 || n > 365 || (n * 2) % 1 !== 0) return fail('Allowances are days, in halves: 12, 7.5…')
  const { error } = await supabase.from('leave_allowances').upsert({ profile_id, leave_type_id, year, days: n })
  return error ? dbFail(error) : done('Allowance saved.')
}
