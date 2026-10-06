import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Tables } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

export type Profile = Tables<'profiles'>

/** The signed-in user's profile, once per request. Null when signed out or not yet given access. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const uid = claims?.claims?.sub
  if (!uid) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  return data
})

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile()
  if (!p) redirect('/login?error=no-access')
  return p
}

export async function requireStaff(): Promise<Profile> {
  const p = await requireProfile()
  if (p.kind !== 'internal') redirect('/portal')
  return p
}

export async function requireCustomer(): Promise<Profile> {
  const p = await requireProfile()
  if (p.kind !== 'customer') redirect('/home')
  return p
}

export const canManage = (p: Profile) => p.kind === 'internal' && ['admin', 'ceo', 'pm'].includes(p.internal_role ?? '')
export const canSeeCommercials = (p: Profile) => p.kind === 'internal' && ['admin', 'ceo', 'finance'].includes(p.internal_role ?? '')
export const canSeeFinance = (p: Profile) => p.kind === 'internal' && ['admin', 'ceo', 'finance', 'pm'].includes(p.internal_role ?? '')
