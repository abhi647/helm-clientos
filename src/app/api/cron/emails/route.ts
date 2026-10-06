import { NextResponse, type NextRequest } from 'next/server'
import { flushOutbox } from '@/lib/email'
import { isCronRequest } from '@/lib/integrations/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Daily: sends this month's CSAT pulse to anyone who has not had it yet (idempotent), then flushes the outbox.
 * Emails are normally sent right after each action; this also retries anything left behind.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: pulses, error } = await createAdminClient().rpc('send_csat_pulses')
  if (error) console.error('[csat] pulse failed', error.message)
  return NextResponse.json({ pulses: pulses ?? 0, ...(await flushOutbox(100)) })
}
