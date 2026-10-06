import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { suggestTemplate } from '@/lib/templates'

/** HubSpot webhook signature v3: base64(HMAC-SHA256(secret, method + uri + body + timestamp)), max 5 minutes old. */
export function verifyHubSpotSignature({ method, uri, body, timestamp, signature }: { method: string; uri: string; body: string; timestamp: string | null; signature: string | null }): boolean {
  const secret = env().HUBSPOT_WEBHOOK_SECRET
  if (!secret || !timestamp || !signature) return false
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false
  const expected = createHmac('sha256', secret).update(`${method}${uri}${body}${timestamp}`).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function hubspot<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.hubapi.com${path}`, { headers: { Authorization: `Bearer ${env().HUBSPOT_ACCESS_TOKEN}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`HubSpot ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

type DealEvent = { eventId: number; subscriptionType: string; objectId: number; propertyName?: string; propertyValue?: string }
const CLOSED_WON = (process.env.HUBSPOT_CLOSED_WON_STAGES ?? 'closedwon').split(',').map((s) => s.trim())

/** Turns "deal moved to Closed Won" into a pending engagement for the PM to create in one click. Idempotent per event. */
export async function handleHubSpotEvents(events: DealEvent[]): Promise<{ created: number; ignored: number }> {
  const db = createAdminClient()
  let created = 0
  let ignored = 0
  const { data: org } = await db.from('orgs').select('id').order('created_at').limit(1).single()
  if (!org) throw new Error('No organisation configured')

  for (const ev of events) {
    const won = ev.subscriptionType === 'deal.propertyChange' && ev.propertyName === 'dealstage' && CLOSED_WON.includes(ev.propertyValue ?? '')
    const { error: dup } = await db.from('integration_events').insert({ source: 'hubspot', external_id: String(ev.eventId), payload: ev })
    if (dup || !won) { ignored++; continue }   // duplicate delivery or not a Closed Won change
    try {
      const deal = await hubspot<{ properties: Record<string, string | null>; associations?: { companies?: { results: { id: string }[] } } }>(
        `/crm/v3/objects/deals/${ev.objectId}?properties=dealname,dealstage,hubspot_owner_id,service,description&associations=companies`)
      const companyId = deal.associations?.companies?.results?.[0]?.id ?? null
      const company = companyId ? await hubspot<{ properties: Record<string, string | null> }>(`/crm/v3/objects/companies/${companyId}?properties=name`) : null
      const dealName = deal.properties.dealname ?? `Deal ${ev.objectId}`
      const service = deal.properties.service ?? null
      await db.from('engagement_setups').upsert({
        org_id: org.id, hubspot_deal_id: String(ev.objectId), deal_name: dealName, company_name: company?.properties.name ?? 'New customer',
        hubspot_company_id: companyId, service, suggested_template: suggestTemplate(`${service ?? ''} ${dealName}`),
      }, { onConflict: 'hubspot_deal_id', ignoreDuplicates: true })
      await db.from('integration_events').update({ processed_at: new Date().toISOString() }).eq('source', 'hubspot').eq('external_id', String(ev.eventId))
      created++
    } catch (e) {
      // forget the event so HubSpot's retry is processed instead of being treated as a duplicate
      await db.from('integration_events').delete().eq('source', 'hubspot').eq('external_id', String(ev.eventId))
      throw e
    }
  }
  return { created, ignored }
}
