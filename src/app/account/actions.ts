'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/system-log'

// 'code': Supabase wants the 6-digit code it just emailed before it changes the password (secure password change)
export type SetPasswordState = { status: 'idle' | 'error' | 'code'; message?: string }

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/account/password') ? n : '/')

/**
 * Sets the signed-in person's password. Records when (app_metadata.password_set_at), so a session started with an
 * emailed code is let through once a password is chosen (see src/proxy.ts).
 */
export async function setPassword(_prev: SetPasswordState, form: FormData): Promise<SetPasswordState> {
  const password = String(form.get('password') ?? '')
  const confirm = String(form.get('confirm') ?? '')
  if (password.length < 10) return { status: 'error', message: 'Use at least 10 characters.' }
  if (password.length > 72) return { status: 'error', message: 'Use at most 72 characters.' }
  if (password !== confirm) return { status: 'error', message: 'The two passwords are not the same.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const nonce = String(form.get('nonce') ?? '').replace(/\s+/g, '') || undefined
  const { error } = await supabase.auth.updateUser({ password, nonce })
  if (error && error.code !== 'same_password' && !/different from the old/i.test(error.message)) {
    // secure password change: Supabase only changes it with a code it emails first
    if (error.code === 'reauthentication_needed' || error.code === 'reauthentication_not_valid' || /reauthenticat|nonce/i.test(error.message)) {
      if (nonce) return { status: 'code', message: 'That code is wrong or has expired. Check the latest email, or reload the page to get a new one.' }
      const { error: sendError } = await supabase.auth.reauthenticate()
      if (sendError) { await logError('auth', sendError, { step: 'reauthenticate' }, 'warn'); return { status: 'error', message: 'We could not email you a confirmation code. Please try again in a minute.' } }
      return { status: 'code' }
    }
    await logError('auth', error, { step: 'set password', code: error.code ?? null }, 'warn')
    const why = error.code === 'insufficient_aal' ? 'Supabase wants this sign-in confirmed with the authenticator app on your account, which Helm no longer uses. Ask your Helm admin to remove that authenticator from your account in Supabase, then try again (insufficient_aal).'
      : error.code === 'weak_password' || /weak|pwned|leaked|characters/i.test(error.message) ? 'That password is too easy to guess, or does not meet the rules. Choose another.'
      : error.code === 'session_not_found' || error.code === 'session_expired' ? 'Your sign-in has expired. Sign in again, then set your password.'
      : error.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.'
      : `The password could not be saved: ${error.message}${error.code ? ` (${error.code})` : ''}`
    return { status: 'error', message: why }
  }
  if (!(await recordSignInSet(user))) return { status: 'error', message: 'The password was saved, but we could not finish. Please try again.' }
  redirect(safeNext(form.get('next')))
}

/**
 * Records that the person now has their own way to sign in (a password or a passkey), so a session started with an
 * emailed code is let through (src/proxy.ts reads password_set_at from the token).
 */
async function recordSignInSet(user: { id: string; app_metadata: Record<string, unknown> }): Promise<boolean> {
  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, password_set_at: Math.floor(Date.now() / 1000) + 1 },
  })
  if (error) return false
  await (await createClient()).auth.refreshSession()   // the new token carries password_set_at
  return true
}

/** After adding a passkey instead of a password on first sign-in. Only counts when the account really has a passkey. */
export async function markSignInSet(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  const { data: keys } = await supabase.auth.passkey.list()
  if (!keys?.length) return { ok: false, error: 'No passkey was saved. Please try again.' }
  return (await recordSignInSet(user)) ? { ok: true } : { ok: false, error: 'The passkey was saved, but we could not finish. Please try again.' }
}
