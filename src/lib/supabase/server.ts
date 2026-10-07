import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { SESSION_COOKIE } from '@/lib/supabase/session-cookie'

/** Supabase client acting as the signed-in user. Every query runs under Row Level Security. */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  })
}
