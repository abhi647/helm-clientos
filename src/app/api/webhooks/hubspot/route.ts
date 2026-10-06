import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { handleHubSpotEvents, verifyHubSpotSignature } from '@/lib/integrations/hubspot'

/** HubSpot app webhook (deal.propertyChange on dealstage). Signed requests only. */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const uri = `${env().NEXT_PUBLIC_SITE_URL}/api/webhooks/hubspot`
  const valid = verifyHubSpotSignature({
    method: 'POST', uri, body,
    timestamp: request.headers.get('x-hubspot-request-timestamp'),
    signature: request.headers.get('x-hubspot-signature-v3'),
  })
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  let events: Parameters<typeof handleHubSpotEvents>[0]
  try {
    events = JSON.parse(body)
    if (!Array.isArray(events)) throw new Error('expected an array')
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }
  try {
    return NextResponse.json(await handleHubSpotEvents(events))
  } catch (e) {
    console.error('[hubspot] webhook failed', e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })   // HubSpot retries
  }
}
