import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic-link and invite landing. Accepts both link styles:
 *  - token_hash (our email templates, works across browsers and devices)
 *  - code (Supabase's default PKCE link, works in the browser that asked for it)
 *
 * A token_hash is single use, and mail scanners (Microsoft Safe Links and similar) open every link
 * before the person does. So this route never spends the token: it hands it to /auth/continue,
 * which only verifies when the person presses the button.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (token_hash) {
    const url = new URL('/auth/continue', origin)
    url.searchParams.set('token_hash', token_hash)
    url.searchParams.set('type', searchParams.get('type') ?? 'email')
    url.searchParams.set('next', next)
    return NextResponse.redirect(url)
  }
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }
  return NextResponse.redirect(new URL('/login?error=link-expired', origin))
}
