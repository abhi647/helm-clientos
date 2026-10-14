'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type SetPasswordState = { status: 'idle' | 'error'; message?: string }

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
  const { error } = await supabase.auth.updateUser({ password })
  if (error && !/different from the old/i.test(error.message)) {
    return { status: 'error', message: /weak|pwned|leaked/i.test(error.message) ? 'That password is too easy to guess. Choose another.' : 'The password could not be saved. Please try again.' }
  }
  const admin = createAdminClient()
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, password_set_at: Math.floor(Date.now() / 1000) + 1 },
  })
  if (metaError) return { status: 'error', message: 'The password was saved, but we could not finish. Please try again.' }
  await supabase.auth.refreshSession()   // the new token carries password_set_at
  redirect(safeNext(form.get('next')))
}
