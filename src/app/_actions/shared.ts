import 'server-only'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { flushOutbox } from '@/lib/email'

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

export const ok = (message?: string): ActionResult => ({ ok: true, message })
export const fail = (error: string): ActionResult => ({ ok: false, error })

/** Database errors are logged for us and shown to people in plain words. */
export function dbFail(error: { message: string } | null, fallback = 'That did not work. Please try again.'): ActionResult {
  if (error) console.error('[action]', error.message)
  const known = error?.message.match(/only the named approver|no longer pending|please say what should change|only an approval|not allowed|comment target not found|already being prepared|add at least one line first|enter at least one quantity first|has not approved a rate card for this project yet|no longer a draft|can no longer be edited|the period ends before it starts|say what should change|these days are already billed|only day-rate lines name people|someone here is already on another line of this rate card|only Seven Billion people can be billed on a line|your own days are approved by an admin or the CEO|.+ bills .+ Fill from timesheets again|type the project name exactly to confirm|this project has billing history.*|approved or billed days are logged.*|archive the file first, then delete it|only Seven Billion people can be on the account team/i)
  return fail(known ? known[0].charAt(0).toUpperCase() + known[0].slice(1) + '.' : fallback)
}

/** After a change: refresh pages and send any queued emails without making the user wait. */
export function done(message?: string, { refresh = true }: { refresh?: boolean } = {}): ActionResult {
  // refresh: false keeps the current screen (e.g. a thank-you shown in place); the next navigation shows fresh data
  if (refresh) revalidatePath('/', 'layout')
  after(async () => {
    try {
      await flushOutbox()
    } catch (e) {
      console.error('[email] flush failed', e)
    }
  })
  return ok(message)
}

export const uuid = z.string().uuid()
export const optionalDate = z.preprocess((v) => (v === '' || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable())
export const visibility = z.enum(['internal', 'shared'])

export function formObject(form: FormData) {
  return Object.fromEntries(Array.from(form.keys()).map((k) => [k, form.get(k)]))
}
