import 'server-only'
import type { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { encodeLastSignIn, LAST_SIGN_IN_COOKIE, LAST_SIGN_IN_MAX_AGE, type SignInMethod } from '@/lib/last-sign-in'

/** After a successful sign-in: note the method on the profile and remember it on this device. Never fails the sign-in. */
export async function rememberSignIn(res: NextResponse, supabase: SupabaseClient<Database>, method: SignInMethod, email?: string | null) {
  res.cookies.set(LAST_SIGN_IN_COOKIE, encodeLastSignIn(method, email), {
    path: '/', maxAge: LAST_SIGN_IN_MAX_AGE, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
  })
  try { await supabase.rpc('note_sign_in', { via: method }) } catch { /* the sign-in itself worked */ }
  return res
}
