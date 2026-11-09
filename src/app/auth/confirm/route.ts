import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rememberSignIn } from '@/lib/last-sign-in.server'

const TYPES: EmailOtpType[] = ['email', 'magiclink', 'invite', 'signup', 'recovery', 'email_change']
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/')

/**
 * Magic-link, invite and Google sign-in landing. Accepts both link styles:
 *  - token_hash (our email templates): never verified on GET. Email security scanners such as Microsoft Safe Links
 *    open every link before the person does, which would use up the one-time token. The person confirms on
 *    /auth/continue with a button, which posts back here.
 *  - code (Google sign-in and Supabase's default PKCE link): needs the verifier cookie of the browser that asked,
 *    so a scanner can't use it up.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (token_hash) {
    const url = new URL('/auth/continue', origin)
    url.searchParams.set('token_hash', token_hash)
    url.searchParams.set('type', searchParams.get('type') ?? 'email')
    url.searchParams.set('next', next)
    return NextResponse.redirect(url)
  }
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // via=google|azure comes from our own sign-in buttons; without it this was an email link
      const via = searchParams.get('via')
      const method = via === 'google' || via === 'azure' ? via : 'code'
      return rememberSignIn(NextResponse.redirect(new URL(next, origin)), supabase, method, data.user?.email)
    }
  }
  // Google or Microsoft with an account nobody invited: sign-ups are off, so the provider sends back an error
  if (searchParams.get('error')) return NextResponse.redirect(new URL('/login?error=not-invited', origin))
  return NextResponse.redirect(new URL('/login?error=link-expired', origin))
}

/** The button on /auth/continue: uses the one-time email link. A full-page post, so later redirects show in the address bar. */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const token_hash = String(form.get('token_hash') ?? '')
  const type = String(form.get('type') ?? 'email') as EmailOtpType
  const next = safeNext(String(form.get('next') ?? '/'))
  const origin = request.nextUrl.origin
  if (token_hash && TYPES.includes(type)) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return rememberSignIn(NextResponse.redirect(new URL(next, origin), 303), supabase, 'code', data.user?.email)
  }
  return NextResponse.redirect(new URL('/login?error=link-expired', origin), 303)
}
