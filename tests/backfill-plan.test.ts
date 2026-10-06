// The HubSpot + Zoho import planner, on deal names shaped like Seven Billion's real ones. No database needed.
import { describe, expect, it } from 'vitest'
import { type HubDeal, companyKey, invoiceNumberIn, planImport, serviceLine, wonStages } from '@/lib/backfill-plan'

const deal = (id: string, name: string, extra: Partial<HubDeal> = {}): HubDeal => ({
  id, name, stageId: 'won', stageLabel: 'Closed Won', closeDate: '2026-05-08T00:00:00Z', createDate: '2026-05-01T00:00:00Z',
  companyId: 'c-dfm', companyName: 'DFM Foods', ...extra,
})

describe('deal names', () => {
  it('finds the Zoho invoice number', () => {
    expect(invoiceNumberIn('DFM Foods BI Data Eng October (SBAPL/25-26/10)')).toBe('SBAPL/25-26/10')
    expect(invoiceNumberIn('CEO Dashboard')).toBeNull()
  })

  it('keeps the service line and drops the customer, periods and invoice numbers', () => {
    expect(serviceLine('DFM Foods BI Data Eng October (SBAPL/25-26/10)', ['DFM Foods'])).toBe('BI Data Eng')
    expect(serviceLine('DFM Foods CEO Dashboard Jan-Feb (SBAPL/25-26/20)', ['DFM Foods'])).toBe('CEO Dashboard')
    expect(serviceLine('NextEnvision Azure DevOps May 16-31 (SBAPL/26-27/12)', ['NextEnvision Digital'])).toBe('Azure DevOps')
    expect(serviceLine('NextEnvision Azure DevOps Mar end (SBAPL/26-27/01)', ['NextEnvision Digital'])).toBe('Azure DevOps')
    expect(serviceLine('Growfast Digital Reports May 2026 (SBAPL/26-27/07)', ['Growfast Digital Studio LLP'])).toBe('Digital Reports')
    expect(serviceLine('DFM Foods (December)', ['DFM Foods'])).toBe('General')
    expect(serviceLine('January', ['NextEnvision Digital'])).toBe('General')
  })

  it('matches company names across systems', () => {
    expect(companyKey('Growfast Digital Studio LLP')).toBe(companyKey('Growfast Agency'))
    expect(companyKey('DFM FOODS PVT LTD')).toBe(companyKey('DFM Foods'))
  })
})

describe('planImport', () => {
  const invoices = [
    { number: 'SBAPL/25-26/10', customerId: 'z-dfm', customerName: 'DFM Foods' },
    { number: 'SBAPL/25-26/12', customerId: 'z-dfm', customerName: 'DFM Foods' },
    { number: 'SBAPL/25-26/11', customerId: 'z-debut-llc', customerName: 'DEBUT INFOTECH GLOBAL SERVICES LLC' },
    { number: 'SBAPL/25-26/23', customerId: 'z-debut-pvt', customerName: 'DEBUT INFOTECH PRIVATE LIMITED' },
  ]

  it('groups monthly deals into one project per customer and service line', () => {
    const plan = planImport({
      deals: [
        deal('1', 'DFM Foods BI Data Eng October (SBAPL/25-26/10)', { closeDate: '2025-11-01T00:00:00Z', createDate: '2026-07-08T00:00:00Z' }),
        deal('2', 'DFM Foods BI Data Eng November (SBAPL/25-26/12)', { closeDate: '2025-12-05T00:00:00Z' }),
        deal('3', 'CEO Dashboard', { closeDate: '2026-08-01T00:00:00Z' }),   // no invoice number: follows its company
      ],
      invoices, existing: [], activeStageIds: [], today: '2026-10-06',
    })
    expect(plan.customers).toHaveLength(1)
    expect(plan.customers[0]).toMatchObject({ name: 'DFM Foods', zohoCustomerId: 'z-dfm', hubspotCompanyId: 'c-dfm' })
    expect(plan.projects.map((p) => [p.name, p.deals.length])).toEqual([['BI Data Eng', 2], ['CEO Dashboard', 1]])
    const bi = plan.projects[0]!
    expect(bi.start).toBe('2025-11-01')   // the earliest date, even though the deal was entered later
    expect(bi.end).toBe('2025-12-05')
    expect(bi.status).toBe('completed')   // nothing billed in the last 120 days
    expect(plan.projects[1]!.status).toBe('active')
  })

  it('splits one HubSpot company into the Zoho customers its invoices belong to', () => {
    const plan = planImport({
      deals: [
        deal('1', 'Debut Infotech Lummid Dev Phase 3 (SBAPL/25-26/11)', { companyId: 'c-debut', companyName: 'Debut Infotech' }),
        deal('2', 'Debut Infotech Pvt Ad Hoc Analysis (SBAPL/25-26/23)', { companyId: 'c-debut', companyName: 'Debut Infotech' }),
      ],
      invoices, existing: [], activeStageIds: [], today: '2026-10-06',
    })
    expect(plan.customers.map((c) => c.zohoCustomerId).sort()).toEqual(['z-debut-llc', 'z-debut-pvt'])
  })

  it('reuses existing Helm customers and applies the names chosen in the preview', () => {
    const plan = planImport({
      deals: [deal('1', 'DFM Foods (October)'), deal('2', 'DFM Foods BI Data Eng November (SBAPL/25-26/12)')],
      invoices, existing: [{ id: 'helm-dfm', name: 'DFM Foods Pvt Ltd', zoho_customer_id: null, hubspot_company_id: null }],
      activeStageIds: [], today: '2026-10-06', overrides: { '1': 'BI Data Eng' },
    })
    expect(plan.customers[0]!.existingId).toBe('helm-dfm')
    expect(plan.projects).toHaveLength(1)
    expect(plan.projects[0]!.deals).toHaveLength(2)
  })

  it('a deal still in delivery keeps its project active', () => {
    const plan = planImport({
      deals: [deal('1', 'DFM Foods BI Data Eng October (SBAPL/25-26/10)', { stageId: 'in_progress', closeDate: '2025-01-01T00:00:00Z' })],
      invoices, existing: [], activeStageIds: ['in_progress'], today: '2026-10-06',
    })
    expect(plan.projects[0]!.status).toBe('active')
  })
})

describe('won stages', () => {
  it('starts at the configured stage and skips the lost ones', () => {
    const stages = [
      { id: 'proposal', label: 'Proposal Sent', displayOrder: 3, probability: 0.3 },
      { id: 'won', label: 'Engagement Won', displayOrder: 5, probability: 0.7 },
      { id: 'progress', label: 'In Progress', displayOrder: 6, probability: 0.8 },
      { id: 'pending', label: 'Payment Pending', displayOrder: 8, probability: 0.95 },
      { id: 'paid', label: 'Closed Won', displayOrder: 9, probability: 1 },
      { id: 'noshow', label: 'No Show', displayOrder: 10, probability: 0 },
    ]
    expect(wonStages([{ stages }], ['won'])).toEqual({ won: ['won', 'progress', 'pending', 'paid'], active: ['won', 'progress'] })
  })
})
