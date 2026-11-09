'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/app/_actions/shared'
import { AVATAR_COLORS } from '@/lib/avatar'
import { requireProfile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)
const details = z.object({
  full_name: z.string().trim().min(2, 'Add your name.').max(80),
  job_title: z.preprocess(blank, z.string().trim().max(80).nullable()),
  phone: z.preprocess(blank, z.string().trim().regex(/^[0-9+()\- .]{5,30}$/, 'Use digits, spaces and + ( ) - only.').nullable()),
  location: z.preprocess(blank, z.string().trim().max(80).nullable()),
  timezone: z.preprocess(blank, z.string().trim().max(60).nullable()),
  bio: z.preprocess(blank, z.string().trim().max(500).nullable()),
})

/** Your name and details. Only your own row can change, and never your role or access. */
export async function saveProfile(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireProfile()
  const parsed = details.safeParse(Object.fromEntries(form))
  if (!parsed.success) return fail(parsed.error.issues[0]!.message)
  if (parsed.data.timezone && !Intl.supportedValuesOf('timeZone').includes(parsed.data.timezone)) return fail('Pick a time zone from the list.')
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', me.id)
  if (error) return fail('Your details could not be saved. Please try again.')
  revalidatePath('/', 'layout')
  return ok('Saved.')
}

async function dropOldPhoto(keep?: string) {
  const me = await requireProfile()
  const supabase = await createClient()
  const { data } = await supabase.storage.from('avatars').list(me.id)
  const old = (data ?? []).map((f) => `${me.id}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await supabase.storage.from('avatars').remove(old)
}

/** After the browser uploads your cropped photo to your own folder: use it, and remove the previous one. */
export async function choosePhoto(path: string): Promise<ActionResult> {
  const me = await requireProfile()
  if (!new RegExp(`^${me.id}/[A-Za-z0-9._-]{1,80}$`).test(path)) return fail('That photo is not yours.')
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', me.id)
  if (error) return fail('The photo could not be saved.')
  await dropOldPhoto(path)
  revalidatePath('/', 'layout')
  return ok('Photo updated.')
}

/** An initials avatar in a colour you pick (removes the photo). */
export async function chooseInitials(color: string): Promise<ActionResult> {
  const me = await requireProfile()
  if (!(AVATAR_COLORS as readonly string[]).includes(color)) return fail('Pick one of the colours.')
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ avatar_path: null, avatar_color: color }).eq('id', me.id)
  if (error) return fail('Your avatar could not be saved.')
  await dropOldPhoto()
  revalidatePath('/', 'layout')
  return ok('Avatar updated.')
}
