import 'server-only'
import { env } from '@/lib/env'
import { accessToken, apiBase } from '@/lib/integrations/zoho'

/**
 * Checks an id someone typed against HubSpot or Zoho Books, so a customer or project is only linked to a record that
 * exists. Read only. When the integration is not set up the id is accepted as typed (`unchecked`).
 */
export type Lookup = { found: true; name: string } | { found: false; reason: 'not_found' | 'unchecked' | 'error' }

const hubspotReady = () => !!env().HUBSPOT_ACCESS_TOKEN
const zohoReady = () => { const e = env(); return !!(e.ZOHO_CLIENT_ID && e.ZOHO_CLIENT_SECRET && e.ZOHO_REFRESH_TOKEN && e.ZOHO_ORGANIZATION_ID) }

async function hubspotObject(kind: 'companies' | 'deals', id: string, property: string): Promise<Lookup> {
  if (!hubspotReady()) return { found: false, reason: 'unchecked' }
  if (!/^\d{1,20}$/.test(id)) return { found: false, reason: 'not_found' }
  try {
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${kind}/${id}?properties=${property}`,
      { headers: { Authorization: `Bearer ${env().HUBSPOT_ACCESS_TOKEN}` }, cache: 'no-store' })
    if (res.status === 404) return { found: false, reason: 'not_found' }
    if (!res.ok) return { found: false, reason: 'error' }
    const json = (await res.json()) as { properties?: Record<string, string | null> }
    return { found: true, name: json.properties?.[property]?.trim() || `HubSpot ${kind === 'deals' ? 'deal' : 'company'} ${id}` }
  } catch {
    return { found: false, reason: 'error' }
  }
}

export const lookupHubSpotCompany = (id: string) => hubspotObject('companies', id, 'name')
export const lookupHubSpotDeal = (id: string) => hubspotObject('deals', id, 'dealname')

export async function lookupZohoCustomer(id: string): Promise<Lookup> {
  if (!zohoReady()) return { found: false, reason: 'unchecked' }
  if (!/^\d{1,25}$/.test(id)) return { found: false, reason: 'not_found' }
  try {
    const token = await accessToken()
    const res = await fetch(`${apiBase()}/books/v3/contacts/${id}?organization_id=${env().ZOHO_ORGANIZATION_ID}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: 'no-store' })
    // Zoho answers an unknown contact with 404, or with 400 and an error code
    if (res.status === 404 || res.status === 400) return { found: false, reason: 'not_found' }
    if (!res.ok) return { found: false, reason: 'error' }
    const json = (await res.json()) as { contact?: { contact_name?: string; contact_type?: string } }
    if (!json.contact) return { found: false, reason: 'not_found' }
    return { found: true, name: json.contact.contact_name?.trim() || `Zoho customer ${id}` }
  } catch {
    return { found: false, reason: 'error' }
  }
}

/** A sentence for the person: what was checked and what was found. */
export function lookupProblem(system: 'HubSpot company' | 'HubSpot deal' | 'Zoho customer', id: string, r: Lookup): string | null {
  if (r.found || r.reason === 'unchecked') return null
  return r.reason === 'not_found'
    ? `There is no ${system} with id ${id}. Check the id and try again.`
    : `Could not reach ${system.split(' ')[0]} to check id ${id}. Try again in a minute.`
}
