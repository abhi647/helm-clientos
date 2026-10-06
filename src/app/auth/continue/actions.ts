'use server'

import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const TYPES: EmailOtpType[] = ['email', 'magiclink', 'invite', 'signup', 'recovery', 'email_change']
const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/')

/** Spends the single-use link token. Runs only on a real button press, never on a link preview or scan. */
export async function confirmLink(form: FormData) {
  const token_hash = form.get('token_hash')
  const type = form.get('type')
  const next = safeNext(form.get('next'))
  if (typeof token_hash !== 'string' || !token_hash || !TYPES.includes(type as EmailOtpType)) redirect('/login?error=link-expired')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash })
  redirect(error ? '/login?error=link-expired' : next)
}
