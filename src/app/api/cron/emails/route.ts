import { NextResponse, type NextRequest } from 'next/server'
import { flushOutbox } from '@/lib/email'
import { isCronRequest } from '@/lib/integrations/cron-auth'
import { scanPending } from '@/lib/scan'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruneSystemLog, recordJob } from '@/lib/system-log'

/**
 * Every few minutes (GitHub Actions) and daily (Vercel Cron): sends this month's CSAT pulse to anyone who has not had it yet (idempotent), re-checks any file still
 * waiting for its security scan, then flushes the outbox.
 * Emails are normally sent right after each action; this also retries anything left behind.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await recordJob('emails', async () => {
      const { data: pulses, error } = await createAdminClient().rpc('send_csat_pulses')
      if (error) throw new Error(`CSAT pulse: ${error.message}`)
      const scanned = await scanPending()
      const sent = await flushOutbox(100)
      await pruneSystemLog()
      return { pulses: pulses ?? 0, scanned, ...sent }
    }))
  } catch {
    return NextResponse.json({ error: 'Job failed; see Admin → System health' }, { status: 500 })
  }
}
