'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string; email?: string }

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/')

/** Sends a magic link. Accounts are invite-only, and the reply never reveals whether an email has access. */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get('email'))
  if (!parsed.success) return { status: 'error', message: 'Enter a valid work email.' }
  const next = safeNext(form.get('next'))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
  })
  // "Signups not allowed" means the address has no access: answer exactly as for a real user
  if (error && !/signup|not allowed|not found/i.test(error.message)) {
    return { status: 'error', message: error.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'We could not send the link. Please try again.' }
  }
  return { status: 'sent', email: parsed.data }
}
