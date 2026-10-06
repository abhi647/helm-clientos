import { NextResponse, type NextRequest } from 'next/server'
import { flushOutbox } from '@/lib/email'
import { isCronRequest } from '@/lib/integrations/cron-auth'

/** Safety net: emails are normally sent right after each action; this retries anything left in the outbox. */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await flushOutbox(100))
}
