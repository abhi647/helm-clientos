import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** For uptime checks: 200 when the app and its database answer, 503 otherwise. Says nothing else. */
export async function GET() {
  const started = Date.now()
  const { error } = await createAdminClient().from('orgs').select('id', { head: true, count: 'exact' }).limit(1)
  return NextResponse.json({ ok: !error, db: error ? 'down' : 'ok', ms: Date.now() - started },
    { status: error ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
}
