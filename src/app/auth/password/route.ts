import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/')

/**
 * Sign in with email and password. A full-page post (not a server action) so the browser sees a real sign-in and
 * offers to save the password; on a mistake it goes back to /login, where the browser fills the email in again.
 * The reply is the same whether the email is unknown or the password is wrong.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const next = safeNext(String(form.get('next') ?? '/'))
  const back = (error: string) => {
    const url = new URL('/login', request.nextUrl.origin)
    url.searchParams.set('error', error)
    if (next !== '/') url.searchParams.set('next', next)
    return NextResponse.redirect(url, 303)
  }
  if (!email || !password) return back('wrong-password')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return back(error.status === 429 ? 'too-many' : 'wrong-password')
  return NextResponse.redirect(new URL(next, request.nextUrl.origin), 303)
}
