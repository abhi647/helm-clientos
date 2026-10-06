// Writes an approved import plan. Takes the database client and the fetched contacts as arguments (no Next.js or env
// imports), so it is tested against a local database. Safe to run again: it links what exists and adds what is new.
import type { SupabaseClient } from '@supabase/supabase-js'
import { type ImportPlan, normalise } from '@/lib/backfill-plan'
import type { Database } from '@/lib/database.types'
import type { HubContact } from '@/lib/integrations/backfill-sources'
import { suggestTemplate } from '@/lib/templates'

export type ImportSummary = {
  customersCreated: number
  customersLinked: number
  projectsCreated: number
  dealsLinked: number
  invoicesLinked: number
  contactsAdded: number
  notes: string[]
}

export async function applyPlan(db: SupabaseClient<Database>, plan: ImportPlan, opts: {
  orgId: string
  contacts: HubContact[] | null          // null: HubSpot did not allow reading contacts
  syncInvoices?: () => Promise<unknown>  // pulls Zoho invoices once customers carry their Zoho ids
}): Promise<ImportSummary> {
  const s: ImportSummary = { customersCreated: 0, customersLinked: 0, projectsCreated: 0, dealsLinked: 0, invoicesLinked: 0, contactsAdded: 0, notes: [] }
  const must = <T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
    if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
    return res.data
  }
  const check = (res: { error: { message: string } | null }, what: string) => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`)
  }

  // ---------------------------------------------------------------- customers
  const existing = must(await db.from('customers').select('id, name, zoho_customer_id, hubspot_company_id').eq('org_id', opts.orgId), 'read customers')
  const usedZoho = new Set(existing.map((c) => c.zoho_customer_id).filter(Boolean))
  const usedHub = new Set(existing.map((c) => c.hubspot_company_id).filter(Boolean))
  const customerId = new Map<string, string>()   // plan key → Helm id
  const companyCustomers = new Map<string, string[]>()   // HubSpot company → Helm customers (for contacts)
  for (const c of plan.customers) {
    // one HubSpot company can sit behind two Zoho customers; only the first keeps the HubSpot link
    const zoho = c.zohoCustomerId && !usedZoho.has(c.zohoCustomerId) ? c.zohoCustomerId : null
    const hub = c.hubspotCompanyId && !usedHub.has(c.hubspotCompanyId) ? c.hubspotCompanyId : null
    let id = c.existingId
    if (id) {
      const row = existing.find((e) => e.id === id)!
      const patch = { ...(zoho && !row.zoho_customer_id ? { zoho_customer_id: zoho } : {}), ...(hub && !row.hubspot_company_id ? { hubspot_company_id: hub } : {}) }
      if (Object.keys(patch).length) { check(await db.from('customers').update(patch).eq('id', id!), 'link customer'); s.customersLinked++ }
    } else {
      id = must(await db.from('customers').insert({ org_id: opts.orgId, name: c.name, zoho_customer_id: zoho, hubspot_company_id: hub }).select('id').single(), `create ${c.name}`).id
      s.customersCreated++
    }
    if (zoho) usedZoho.add(zoho)
    if (hub) usedHub.add(hub)
    customerId.set(c.key, id)
    if (c.hubspotCompanyId) companyCustomers.set(c.hubspotCompanyId, [...(companyCustomers.get(c.hubspotCompanyId) ?? []), id])
  }

  // ---------------------------------------------------------------- projects and their deals
  const allDealIds = plan.projects.flatMap((p) => p.deals.map((d) => d.id))
  const linked = new Map<string, string>()   // deal → project already imported
  for (let i = 0; i < allDealIds.length; i += 200) {
    const rows = must(await db.from('project_deals').select('hubspot_deal_id, project_id').in('hubspot_deal_id', allDealIds.slice(i, i + 200)), 'read deals')
    for (const r of rows) linked.set(r.hubspot_deal_id, r.project_id)
  }
  const helmCustomerIds = [...new Set(customerId.values())]
  const projects = helmCustomerIds.length
    ? must(await db.from('projects').select('id, name, customer_id').in('customer_id', helmCustomerIds), 'read projects') : []

  const dealProject = new Map<string, { projectId: string; customerId: string }>()
  for (const p of plan.projects) {
    const cid = customerId.get(p.customerKey)!
    let pid = p.deals.map((d) => linked.get(d.id)).find(Boolean)
      ?? projects.find((x) => x.customer_id === cid && normalise(x.name) === normalise(p.name))?.id
    if (!pid) {
      pid = must(await db.from('projects').insert({
        customer_id: cid, name: p.name, status: p.status, start_date: p.start, end_date: p.end, template_key: suggestTemplate(p.name),
      }).select('id').single(), `create project ${p.name}`).id
      projects.push({ id: pid, name: p.name, customer_id: cid })
      s.projectsCreated++
    }
    for (const d of p.deals) dealProject.set(d.id, { projectId: pid, customerId: cid })
    const rows = p.deals.map((d) => ({
      project_id: pid!, customer_id: cid, hubspot_deal_id: d.id, deal_name: d.name, stage_label: d.stageLabel,
      closed_on: d.closeDate?.slice(0, 10) ?? null, invoice_number: d.invoiceNumber,
    }))
    check(await db.from('project_deals').upsert(rows, { onConflict: 'hubspot_deal_id' }), 'save deals')
    s.dealsLinked += rows.length
  }

  // ---------------------------------------------------------------- Zoho invoices, linked to projects by invoice number
  if (opts.syncInvoices) {
    await opts.syncInvoices()
    for (const p of plan.projects) for (const d of p.deals) {
      if (!d.invoiceNumber) continue
      const target = dealProject.get(d.id)!
      const res = must(await db.from('invoices').update({ project_id: target.projectId }).eq('number', d.invoiceNumber)
        .eq('customer_id', target.customerId).select('id'), 'link invoice')
      s.invoicesLinked += res.length
    }
  } else {
    s.notes.push('Zoho is not connected, so invoices were not imported.')
  }

  // ---------------------------------------------------------------- contacts: listed to invite, nobody is emailed
  if (opts.contacts === null) {
    s.notes.push('HubSpot did not allow reading contacts. Add the crm.objects.contacts.read scope to the private app, then run the import again.')
  } else {
    const rows = opts.contacts.flatMap((c) => (companyCustomers.get(c.companyId) ?? []).slice(0, 1).map((cid) => ({
      customer_id: cid, full_name: c.fullName, email: c.email, phone: c.phone, job_title: c.title, source: 'hubspot', external_id: c.hubspotId,
    })))
    if (rows.length) {
      const added = must(await db.from('customer_contacts').upsert(rows, { onConflict: 'customer_id,email', ignoreDuplicates: true }).select('id'), 'save contacts')
      s.contactsAdded = added.length
    }
  }
  return s
}
