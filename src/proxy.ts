import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/supabase/session-cookie'

const EMAILED = ['otp', 'magiclink', 'invite', 'email/signup', 'recovery', 'email_change']
const PUBLIC_PATHS = ['/login', '/auth', '/api/webhooks', '/api/cron', '/api/health', '/privacy', '/terms']

/** Refreshes the Supabase session on every request and sends signed-out visitors to the login page. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getClaims validates the JWT; do not put code between client creation and this call
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const path = request.nextUrl.pathname

  if (!signedIn && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }

  // signed in with a code or link from an email (first time, or a forgotten password): choose a password first
  const claims = data?.claims as { amr?: { method: string; timestamp: number }[]; app_metadata?: { password_set_at?: number } } | undefined
  const amr = claims?.amr ?? []
  const emailed = amr.filter((m) => EMAILED.includes(m.method))
  if (signedIn && emailed.length && !amr.some((m) => m.method === 'password' || m.method === 'oauth')
      && (claims?.app_metadata?.password_set_at ?? 0) < Math.max(...emailed.map((m) => m.timestamp))
      && !['/account/password', '/auth', '/api', '/login', '/privacy', '/terms'].some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/account/password'
    url.search = `?required=1&next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  // static files and the app shell (manifest, service worker, offline page) are public
  matcher: ['/((?!_next/static|_next/image|favicon.ico|greeting/|brand/|sw\\.js|offline\\.html|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
