'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string; email?: string }

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/')

/** Emails a 6-digit code (and a link), used to set or reset a password. Accounts are invite-only, and the reply never reveals whether an email has access. */
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

export type PasswordState = { status: 'idle' | 'error'; message?: string; email?: string }

/** Email and password. The reply is the same whether the email is unknown or the password is wrong. */
export async function signInWithPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'))
  const password = String(form.get('password') ?? '')
  if (!email.success || !password) return { status: 'error', message: 'Enter your email and password.', email: String(form.get('email') ?? '') }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password })
  if (error) {
    return {
      status: 'error', email: email.data,
      message: error.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.'
        : 'Wrong email or password. First time here, or forgot it? Use “Set or reset your password” below.',
    }
  }
  redirect(safeNext(form.get('next')))
}
