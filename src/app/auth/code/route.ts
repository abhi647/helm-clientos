import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/')

/**
 * Sign in with the 6-digit code from the sign-in email. Works in any browser or in the installed app, where the email
 * link would open somewhere else (iPhone home-screen apps keep their own cookies). A full-page post, like the link button.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const code = String(form.get('code') ?? '').replace(/\s+/g, '')
  const next = safeNext(String(form.get('next') ?? '/'))
  const origin = request.nextUrl.origin
  if (email && /^\d{6,10}$/.test(code)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (!error) return NextResponse.redirect(new URL(next, origin), 303)
  }
  const back = new URL('/login', origin)
  back.search = new URLSearchParams({ error: 'bad-code', email, next }).toString()
  return NextResponse.redirect(back, 303)
}
