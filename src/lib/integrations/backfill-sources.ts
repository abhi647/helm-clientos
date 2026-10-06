// Read-only fetchers for the HubSpot + Zoho import. Credentials are passed in (the server reads them from env),
// so the same code can be dry-run outside Next.js.
import { type HubDeal, type ZohoInvoiceRef, wonStages } from '@/lib/backfill-plan'

type HubCreds = { token: string; startStageIds: string[] }

async function hub<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 403) throw Object.assign(new Error(`HubSpot refused ${path}: the private app is missing a scope.`), { status: 403 })
  if (!res.ok) throw new Error(`HubSpot ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

/** Won deals (from the configured Closed Won stage onwards, every pipeline), with their company. */
export async function fetchHubSpotDeals({ token, startStageIds }: HubCreds): Promise<{ deals: HubDeal[]; activeStageIds: string[] }> {
  const pipes = await hub<{ results: { stages: { id: string; label: string; displayOrder: number; metadata: { probability?: string } }[] }[] }>(token, '/crm/v3/pipelines/deals')
  const labels = new Map(pipes.results.flatMap((p) => p.stages.map((s) => [s.id, s.label] as const)))
  const { won, active } = wonStages(pipes.results.map((p) => ({
    stages: p.stages.map((s) => ({ id: s.id, label: s.label, displayOrder: s.displayOrder, probability: s.metadata.probability == null ? null : Number(s.metadata.probability) })),
  })), startStageIds)
  if (!won.length) return { deals: [], activeStageIds: [] }

  type Row = { id: string; properties: Record<string, string | null> }
  const rows: Row[] = []
  let after: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await hub<{ results: Row[]; paging?: { next?: { after: string } } }>(token, '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'IN', values: won }] }],
      properties: ['dealname', 'dealstage', 'closedate', 'createdate'], limit: 100, after,
      sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
    })
    rows.push(...res.results)
    after = res.paging?.next?.after
    if (!after) break
  }

  // deal → company (first association), then company names
  const companyOf = new Map<string, string>()
  for (const part of chunks(rows.map((r) => r.id), 100)) {
    const res = await hub<{ results: { from: { id: string }; to: { toObjectId: number | string }[] }[] }>(token, '/crm/v4/associations/deals/companies/batch/read', { inputs: part.map((id) => ({ id })) })
    for (const r of res.results) if (r.to[0]) companyOf.set(String(r.from.id), String(r.to[0].toObjectId))
  }
  const companyName = new Map<string, string>()
  for (const part of chunks([...new Set(companyOf.values())], 100)) {
    const res = await hub<{ results: Row[] }>(token, '/crm/v3/objects/companies/batch/read', { inputs: part.map((id) => ({ id })), properties: ['name'] })
    for (const c of res.results) companyName.set(c.id, c.properties.name ?? '')
  }

  const deals = rows.map((r) => {
    const companyId = companyOf.get(r.id) ?? null
    return {
      id: r.id, name: (r.properties.dealname ?? `Deal ${r.id}`).trim(), stageId: r.properties.dealstage ?? '',
      stageLabel: labels.get(r.properties.dealstage ?? '') ?? '', closeDate: r.properties.closedate, createDate: r.properties.createdate,
      companyId, companyName: companyId ? companyName.get(companyId) ?? null : null,
    }
  })
  return { deals, activeStageIds: active }
}

export type HubContact = { companyId: string; fullName: string; email: string; phone: string | null; title: string | null; hubspotId: string }

/** Contacts of the given companies. Needs the crm.objects.contacts.read scope; returns null without it. */
export async function fetchHubSpotContacts(token: string, companyIds: string[]): Promise<HubContact[] | null> {
  try {
    const contactsOf = new Map<string, string[]>()
    for (const part of chunks(companyIds, 100)) {
      const res = await hub<{ results: { from: { id: string }; to: { toObjectId: number | string }[] }[] }>(token, '/crm/v4/associations/companies/contacts/batch/read', { inputs: part.map((id) => ({ id })) })
      for (const r of res.results) contactsOf.set(String(r.from.id), r.to.map((t) => String(t.toObjectId)))
    }
    const ids = [...new Set([...contactsOf.values()].flat())]
    const people = new Map<string, Record<string, string | null>>()
    for (const part of chunks(ids, 100)) {
      const res = await hub<{ results: { id: string; properties: Record<string, string | null> }[] }>(token, '/crm/v3/objects/contacts/batch/read', {
        inputs: part.map((id) => ({ id })), properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle'],
      })
      for (const c of res.results) people.set(c.id, c.properties)
    }
    const out: HubContact[] = []
    for (const [companyId, list] of contactsOf) for (const id of list) {
      const p = people.get(id)
      if (!p?.email) continue
      out.push({ companyId, hubspotId: id, email: p.email.trim().toLowerCase(), phone: p.phone ?? null, title: p.jobtitle ?? null,
        fullName: [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || p.email })
    }
    return out
  } catch (e) {
    if ((e as { status?: number }).status === 403) return null
    throw e
  }
}

/** Every Zoho Books invoice number with its customer (drafts and void ones are left out). */
export async function fetchZohoInvoiceRefs({ apiBase, orgId, token }: { apiBase: string; orgId: string; token: string }): Promise<ZohoInvoiceRef[]> {
  const out: ZohoInvoiceRef[] = []
  for (let page = 1; page <= 20; page++) {
    const url = new URL(`${apiBase}/books/v3/invoices`)
    url.search = new URLSearchParams({ organization_id: orgId, page: String(page), per_page: '200' }).toString()
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Zoho invoices request failed: ${res.status}`)
    const json = (await res.json()) as { invoices: { invoice_number: string; customer_id: string; customer_name: string; status: string }[]; page_context?: { has_more_page?: boolean } }
    for (const i of json.invoices) if (!['draft', 'void'].includes(i.status)) out.push({ number: i.invoice_number, customerId: i.customer_id, customerName: i.customer_name })
    if (!json.page_context?.has_more_page) break
  }
  return out
}
