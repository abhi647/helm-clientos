import { NextResponse, type NextRequest } from 'next/server'
import { isCronRequest } from '@/lib/integrations/cron-auth'
import { syncZohoInvoices } from '@/lib/integrations/zoho'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await syncZohoInvoices())
  } catch (e) {
    console.error('[zoho] sync failed', e)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
