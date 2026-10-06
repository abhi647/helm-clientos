import 'server-only'
import { applyPlan, type ImportSummary } from '@/lib/backfill-apply'
import { type ImportPlan, planImport } from '@/lib/backfill-plan'
import { env } from '@/lib/env'
import { fetchHubSpotContacts, fetchHubSpotDeals, fetchZohoInvoiceRefs } from '@/lib/integrations/backfill-sources'
import { accessToken, apiBase, syncZohoInvoices } from '@/lib/integrations/zoho'
import { createAdminClient } from '@/lib/supabase/admin'

const zohoReady = () => { const e = env(); return !!(e.ZOHO_CLIENT_ID && e.ZOHO_REFRESH_TOKEN && e.ZOHO_ORGANIZATION_ID) }

/** Reads HubSpot and Zoho (nothing is written) and proposes customers and projects. */
export async function loadImportPlan(overrides?: Record<string, string>): Promise<{ plan: ImportPlan; zoho: boolean } | { error: string }> {
  const e = env()
  if (!e.HUBSPOT_ACCESS_TOKEN) return { error: 'HubSpot is not connected. Add HUBSPOT_ACCESS_TOKEN first.' }
  const startStageIds = (process.env.HUBSPOT_CLOSED_WON_STAGES ?? 'closedwon').split(',').map((x) => x.trim()).filter(Boolean)
  const db = createAdminClient()
  const [{ deals, activeStageIds }, invoices, { data: existing }] = await Promise.all([
    fetchHubSpotDeals({ token: e.HUBSPOT_ACCESS_TOKEN, startStageIds }),
    zohoReady() ? accessToken().then((token) => fetchZohoInvoiceRefs({ apiBase: apiBase(), orgId: e.ZOHO_ORGANIZATION_ID, token })) : Promise.resolve([]),
    db.from('customers').select('id, name, zoho_customer_id, hubspot_company_id'),
  ])
  const plan = planImport({ deals, invoices, existing: existing ?? [], activeStageIds, today: new Date().toISOString().slice(0, 10), overrides })
  return { plan, zoho: zohoReady() }
}

/** Runs the import with the project names chosen in the preview. */
export async function runImport(overrides: Record<string, string>): Promise<ImportSummary> {
  const loaded = await loadImportPlan(overrides)
  if ('error' in loaded) throw new Error(loaded.error)
  const db = createAdminClient()
  const { data: org } = await db.from('orgs').select('id').order('created_at').limit(1).single()
  if (!org) throw new Error('No organisation configured.')
  const companies = [...new Set(loaded.plan.customers.map((c) => c.hubspotCompanyId).filter(Boolean) as string[])]
  const contacts = await fetchHubSpotContacts(env().HUBSPOT_ACCESS_TOKEN, companies)
  return applyPlan(db, loaded.plan, { orgId: org.id, contacts, syncInvoices: loaded.zoho ? syncZohoInvoices : undefined })
}
