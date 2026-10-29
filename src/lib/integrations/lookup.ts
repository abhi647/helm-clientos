import 'server-only'
import { env } from '@/lib/env'
import { accessToken, apiBase, zohoAccessProblem } from '@/lib/integrations/zoho'

/**
 * Checks an id someone typed against HubSpot or Zoho Books, so a customer or project is only linked to a record that
 * exists. Read only. When the integration is not set up the id is accepted as typed (`unchecked`).
 */
export type Lookup = { found: true; name: string; currency?: string } | { found: false; reason: 'not_found' | 'unchecked' | 'error'; detail?: string }

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
    const json = (await res.json().catch(() => null)) as { code?: number; message?: string; contact?: { contact_name?: string; currency_code?: string } } | null
    // no permission to read contacts: say so (it used to read as "could not reach Zoho, try again")
    const noAccess = zohoAccessProblem(res.status, json, 'ZohoBooks.contacts.READ')
    if (noAccess) return { found: false, reason: 'error', detail: noAccess }
    // Zoho answers an unknown contact with 404, or with 400 and an error code
    if (res.status === 404 || res.status === 400) return { found: false, reason: 'not_found' }
    if (!res.ok || !json) return { found: false, reason: 'error' }
    if (!json.contact) return { found: false, reason: 'not_found' }
    return { found: true, name: json.contact.contact_name?.trim() || `Zoho customer ${id}`, currency: json.contact.currency_code || undefined }
  } catch (err) {
    return { found: false, reason: 'error', detail: err instanceof Error ? err.message : undefined }
  }
}

/** A sentence for the person: what was checked and what was found. */
export function lookupProblem(system: 'HubSpot company' | 'HubSpot deal' | 'Zoho customer', id: string, r: Lookup): string | null {
  if (r.found || r.reason === 'unchecked') return null
  if (r.reason === 'not_found') return `There is no ${system} with id ${id}. Check the id and try again.`
  return r.detail ?? `Could not reach ${system.split(' ')[0]} to check id ${id}. Try again in a minute.`
}
