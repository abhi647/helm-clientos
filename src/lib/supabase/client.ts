import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { SESSION_COOKIE } from '@/lib/supabase/session-cookie'

/** Browser client (used for direct-to-storage uploads). Runs under the signed-in user's RLS. */
export function createClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookieOptions: SESSION_COOKIE })
}
