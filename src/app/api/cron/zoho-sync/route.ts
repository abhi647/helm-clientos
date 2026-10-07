import { NextResponse, type NextRequest } from 'next/server'
import { isCronRequest } from '@/lib/integrations/cron-auth'
import { syncZohoInvoices } from '@/lib/integrations/zoho'
import { recordJob } from '@/lib/system-log'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await recordJob('zoho-sync', syncZohoInvoices))
  } catch {
    return NextResponse.json({ error: 'Sync failed; see Admin → System health' }, { status: 500 })
  }
}
