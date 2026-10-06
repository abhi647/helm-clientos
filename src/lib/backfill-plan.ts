// Turns won HubSpot deals (one per billing period) and Zoho invoices into a proposed set of customers and projects.
// Pure functions only, so the grouping can be unit tested and previewed before anything is written.

export type HubDeal = {
  id: string
  name: string
  stageId: string
  stageLabel: string
  closeDate: string | null
  createDate: string | null
  companyId: string | null
  companyName: string | null
}
export type ZohoInvoiceRef = { number: string; customerId: string; customerName: string }
export type ExistingCustomer = { id: string; name: string; zoho_customer_id: string | null; hubspot_company_id: string | null }

export type PlannedCustomer = {
  key: string
  name: string
  zohoCustomerId: string | null
  hubspotCompanyId: string | null
  existingId: string | null
}
export type PlannedDeal = HubDeal & { invoiceNumber: string | null; customerKey: string; project: string }
export type PlannedProject = {
  customerKey: string
  name: string
  deals: PlannedDeal[]
  start: string | null
  end: string | null
  status: 'active' | 'completed'
}
export type ImportPlan = { customers: PlannedCustomer[]; projects: PlannedProject[]; warnings: string[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_WORD = new RegExp(`^(${MONTHS.map((m) => `${m.slice(0, 3)}(${m.slice(3)})?`).join('|')})$`, 'i')
const LEGAL = /^(pvt|private|ltd|limited|llp|llc|inc|global|services|digital|studio|agency|group|co|the|&)$/i

/** "(SBAPL/25-26/10)" → "SBAPL/25-26/10": the Zoho invoice number your team puts in the deal name. */
export function invoiceNumberIn(dealName: string): string | null {
  return dealName.match(/\(([A-Z]{2,}\/\d{2}-\d{2}\/\d+)\)/)?.[1] ?? null
}

export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const significantWords = (name: string) => normalise(name).split(' ').filter((w) => w && !LEGAL.test(w))

/** Matching key for company names across HubSpot, Zoho and Helm: "DFM Foods" = "DFM FOODS PVT LTD". */
export function companyKey(name: string): string {
  return significantWords(name).join(' ')
}

/**
 * The service line from a billing-period deal name: drops the invoice number, the customer's name, months, years and
 * day ranges. "DFM Foods BI Data Eng October (SBAPL/25-26/10)" → "BI Data Eng"; "January" → "General".
 */
export function serviceLine(dealName: string, customerNames: string[]): string {
  // only the distinctive words: "Growfast Digital Studio LLP" drops "Growfast" but keeps "Digital Reports"
  const customerWords = new Set(customerNames.flatMap(significantWords))
  const cleaned = dealName
    .replace(/\([^)]*\)/g, ' ')                  // (SBAPL/..), (December), (24 Hrs)
    .replace(/\b\d{1,2}\s*-\s*\d{1,2}\b/g, ' ')  // 1-15, 16-31
    .replace(/[–—]/g, ' ')
  const words = cleaned.split(/\s+/).filter(Boolean).filter((w) => {
    const bare = w.replace(/[^A-Za-z0-9-]/g, '')
    if (!bare) return false
    if (/^(19|20)\d{2}$/.test(bare)) return false                                // years
    if (bare.split('-').every((p) => MONTH_WORD.test(p))) return false            // Jan, Jan-Feb
    if (/^(end|mid|start|pvt)$/i.test(bare)) return false
    return true
  })
  // the customer's name usually leads the deal name; drop leading words that belong to it
  while (words.length && customerWords.has(normalise(words[0]!))) words.shift()
  const line = words.join(' ').trim()
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : 'General'
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

export function planImport(input: {
  deals: HubDeal[]
  invoices: ZohoInvoiceRef[]
  existing: ExistingCustomer[]
  activeStageIds: string[]          // e.g. Engagement Won, In Progress, Delivered: the work is still going
  today: string                     // yyyy-mm-dd
  overrides?: Record<string, string> // deal id → project name chosen in the preview
}): ImportPlan {
  const warnings: string[] = []
  const byInvoice = new Map(input.invoices.map((i) => [i.number, i]))
  const customers = new Map<string, PlannedCustomer>()
  const companyToCustomer = new Map<string, string>()   // HubSpot company id → customer key, from invoiced deals

  const findExisting = (zoho: string | null, hub: string | null, name: string) =>
    input.existing.find((c) => (zoho && c.zoho_customer_id === zoho) || (hub && c.hubspot_company_id === hub))
    ?? input.existing.find((c) => companyKey(c.name) === companyKey(name))

  const ensureCustomer = (key: string, name: string, zoho: string | null, hub: string | null) => {
    const found = customers.get(key)
    if (found) {
      found.zohoCustomerId ??= zoho
      found.hubspotCompanyId ??= hub
      return found
    }
    const existing = findExisting(zoho, hub, name)
    const c: PlannedCustomer = { key, name: existing?.name ?? name, zohoCustomerId: zoho ?? existing?.zoho_customer_id ?? null,
      hubspotCompanyId: hub ?? existing?.hubspot_company_id ?? null, existingId: existing?.id ?? null }
    customers.set(key, c)
    return c
  }

  // pass 1: deals that carry a Zoho invoice number decide which Zoho customer a HubSpot company is
  const planned: PlannedDeal[] = []
  const pending: HubDeal[] = []
  for (const d of input.deals) {
    const number = invoiceNumberIn(d.name)
    const inv = number ? byInvoice.get(number) : undefined
    if (!inv) { pending.push(d); continue }
    const key = `zoho:${inv.customerId}`
    ensureCustomer(key, inv.customerName, inv.customerId, d.companyId)
    if (d.companyId && !companyToCustomer.has(d.companyId)) companyToCustomer.set(d.companyId, key)
    planned.push({ ...d, invoiceNumber: number, customerKey: key, project: '' })
  }
  // pass 2: the rest go to their HubSpot company's customer (or a new customer named after the company)
  for (const d of pending) {
    const number = invoiceNumberIn(d.name)
    if (number) warnings.push(`${d.name}: invoice ${number} was not found in Zoho, so it is grouped by its HubSpot company.`)
    let key = d.companyId ? companyToCustomer.get(d.companyId) : undefined
    if (!key && d.companyName) {
      const sameName = [...customers.values()].find((c) => companyKey(c.name) === companyKey(d.companyName!))
      key = sameName?.key ?? `hubspot:${d.companyId}`
      ensureCustomer(key, d.companyName, null, d.companyId)
    }
    if (!key) { warnings.push(`${d.name}: no company on the deal and no invoice number, so it was skipped.`); continue }
    planned.push({ ...d, invoiceNumber: number, customerKey: key, project: '' })
  }

  // project names: the preview's choice, else the service line from the deal name
  for (const d of planned) {
    const c = customers.get(d.customerKey)!
    const override = input.overrides?.[d.id]?.trim()
    d.project = override || serviceLine(d.name, [c.name, d.companyName ?? ''])
  }

  const groups = new Map<string, PlannedProject>()
  for (const d of planned) {
    const key = `${d.customerKey}|${normalise(d.project)}`
    const g = groups.get(key) ?? { customerKey: d.customerKey, name: d.project, deals: [], start: null, end: null, status: 'completed' as const }
    g.deals.push(d)
    groups.set(key, g)
  }
  const cutoff = new Date(Date.parse(input.today) - 120 * 86_400_000).toISOString().slice(0, 10)
  for (const g of groups.values()) {
    g.deals.sort((a, b) => (day(a.closeDate) ?? '').localeCompare(day(b.closeDate) ?? ''))
    // deals are sometimes entered in HubSpot after the fact, so the start is the earliest date we know of
    const dates = g.deals.flatMap((d) => [day(d.createDate), day(d.closeDate)]).filter(Boolean) as string[]
    const ends = g.deals.map((d) => day(d.closeDate) ?? day(d.createDate)).filter(Boolean) as string[]
    g.start = dates.sort()[0] ?? null
    g.end = ends.sort().at(-1) ?? null
    // still running: a deal in a delivery stage, or billed within the last 120 days
    g.status = g.deals.some((d) => input.activeStageIds.includes(d.stageId)) || (g.end !== null && g.end >= cutoff) ? 'active' : 'completed'
  }

  const projects = [...groups.values()].sort((a, b) =>
    customers.get(a.customerKey)!.name.localeCompare(customers.get(b.customerKey)!.name) || a.name.localeCompare(b.name))
  const customerList = [...customers.values()].sort((a, b) => a.name.localeCompare(b.name))
  return { customers: customerList, projects, warnings }
}

/** Stages that count as won, per pipeline: from the configured Closed Won stage onwards, except the lost ones. */
export function wonStages(pipelines: { stages: { id: string; label: string; displayOrder: number; probability: number | null }[] }[], startIds: string[]): { won: string[]; active: string[] } {
  const won: string[] = []
  const active: string[] = []
  for (const p of pipelines) {
    const stages = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder)
    const from = stages.findIndex((s) => startIds.includes(s.id))
    if (from < 0) continue
    for (const s of stages.slice(from)) {
      if ((s.probability ?? 0) <= 0) continue                     // No Show, Closed Lost
      won.push(s.id)
      if ((s.probability ?? 0) < 0.95) active.push(s.id)        // delivery still running (not yet billed or paid)
    }
  }
  return { won, active }
}
