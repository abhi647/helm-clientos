import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { env } from '@/lib/env'

/**
 * Service-role client. Bypasses Row Level Security, so it is only used by trusted server jobs
 * (email outbox, integrations, invitations), never with input that has not been authorised first.
 */
export function createAdminClient() {
  const e = env()
  return createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
