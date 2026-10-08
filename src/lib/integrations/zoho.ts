import 'server-only'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/system-log'
import { currencyProblem } from '@/lib/currencies'
import { lookupZohoCustomer } from '@/lib/integrations/lookup'

type ZohoInvoice = {
  invoice_id: string; invoice_number: string; customer_id: string; customer_name: string; status: string
  date: string; due_date: string; total: number; balance: number; currency_code: string
}

const HIDDEN = new Set(['draft', 'void'])

/** Zoho's API host for the data centre: zoho.in → www.zohoapis.in, zoho.com → www.zohoapis.com, zoho.eu → www.zohoapis.eu */
export const apiBase = () => `https://www.zohoapis.${env().ZOHO_DOMAIN.replace(/^zoho\./, '')}`

export async function accessToken(): Promise<string> {
  const e = env()
  const res = await fetch(`https://accounts.${e.ZOHO_DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: e.ZOHO_REFRESH_TOKEN, client_id: e.ZOHO_CLIENT_ID, client_secret: e.ZOHO_CLIENT_SECRET, grant_type: 'refresh_token' }),
    cache: 'no-store',
  })
  const json = (await res.json()) as { access_token?: string; error?: string }
  if (!res.ok || !json.access_token) throw new Error(`Zoho token refresh failed: ${json.error ?? res.status}`)
  return json.access_token
}

/**
 * Pulls invoices from Zoho Books (read only) and upserts them by Zoho id. Customers are matched on their Zoho
 * customer id, or on an exact name match the first time (which then stores the Zoho id). Unmatched invoices are skipped.
 */
export async function syncZohoInvoices(): Promise<{ fetched: number; upserted: number; unmatched: number; payments?: number; skipped?: string }> {
  const e = env()
  if (!e.ZOHO_CLIENT_ID || !e.ZOHO_REFRESH_TOKEN || !e.ZOHO_ORGANIZATION_ID) return { fetched: 0, upserted: 0, unmatched: 0, skipped: 'Zoho is not configured' }
  const token = await accessToken()
  const db = createAdminClient()
  const { data: customers } = await db.from('customers').select('id, name, zoho_customer_id')
  const byZoho = new Map((customers ?? []).filter((c) => c.zoho_customer_id).map((c) => [c.zoho_customer_id!, c.id]))
  const byName = new Map((customers ?? []).map((c) => [c.name.trim().toLowerCase(), c]))

  const invoices: ZohoInvoice[] = []
  for (let page = 1; page <= 20; page++) {
    const url = new URL(`${apiBase()}/books/v3/invoices`)
    url.search = new URLSearchParams({ organization_id: e.ZOHO_ORGANIZATION_ID, page: String(page), per_page: '200', sort_column: 'date', sort_order: 'D' }).toString()
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Zoho invoices request failed: ${res.status}`)
    const json = (await res.json()) as { invoices: ZohoInvoice[]; page_context?: { has_more_page?: boolean } }
    invoices.push(...json.invoices)
    if (!json.page_context?.has_more_page) break
  }

  let unmatched = 0
  const rows = []
  // drafts and voided invoices are not real bills, so they never reach the app (or a customer's screen)
  const hidden = invoices.filter((i) => HIDDEN.has(i.status)).map((i) => i.invoice_id)
  if (hidden.length) await db.from('invoices').delete().in('zoho_invoice_id', hidden)
  for (const inv of invoices.filter((i) => !HIDDEN.has(i.status))) {
    let customerId = byZoho.get(inv.customer_id)
    if (!customerId) {
      const match = byName.get(inv.customer_name.trim().toLowerCase())
      if (match && !match.zoho_customer_id) {
        await db.from('customers').update({ zoho_customer_id: inv.customer_id }).eq('id', match.id)
        byZoho.set(inv.customer_id, match.id)
        customerId = match.id
      }
    }
    if (!customerId) { unmatched++; continue }
    rows.push({
      customer_id: customerId, zoho_invoice_id: inv.invoice_id, number: inv.invoice_number, currency: inv.currency_code,
      total: inv.total, balance: inv.balance, status: inv.status, issued_on: inv.date, due_on: inv.due_date || null, synced_at: new Date().toISOString(),
    })
  }
  if (rows.length) {
    const { error } = await db.from('invoices').upsert(rows, { onConflict: 'zoho_invoice_id' })
    if (error) throw error
  }
  const payments = await syncPayments(token, byZoho)
  return { fetched: invoices.length, upserted: rows.length, unmatched, payments }
}

type ZohoPayment = {
  payment_id: string; payment_number: string; customer_id: string; invoice_numbers: string; date: string
  payment_mode: string; amount: number; reference_number: string; currency_code?: string
}

/** Payments received (read only). Linked to the first invoice they settle when that invoice is known. */
async function syncPayments(token: string, byZoho: Map<string, string>): Promise<number> {
  const e = env()
  const db = createAdminClient()
  const payments: ZohoPayment[] = []
  for (let page = 1; page <= 10; page++) {
    const url = new URL(`${apiBase()}/books/v3/customerpayments`)
    url.search = new URLSearchParams({ organization_id: e.ZOHO_ORGANIZATION_ID, page: String(page), per_page: '200', sort_column: 'date', sort_order: 'D' }).toString()
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Zoho payments request failed: ${res.status}`)
    const json = (await res.json()) as { customerpayments: ZohoPayment[]; page_context?: { has_more_page?: boolean } }
    payments.push(...json.customerpayments)
    if (!json.page_context?.has_more_page) break
  }
  const known = payments.filter((p) => byZoho.has(p.customer_id))
  if (!known.length) return 0
  const numbers = [...new Set(known.map((p) => p.invoice_numbers.split(',')[0]!.trim()).filter(Boolean))]
  const { data: invs } = numbers.length ? await db.from('invoices').select('id, number, customer_id, currency').in('number', numbers) : { data: [] }
  const rows = known.map((p) => {
    const customer_id = byZoho.get(p.customer_id)!
    const inv = (invs ?? []).find((i) => i.number === p.invoice_numbers.split(',')[0]!.trim() && i.customer_id === customer_id)
    return {
      customer_id, zoho_payment_id: p.payment_id, invoice_id: inv?.id ?? null, number: p.payment_number,
      currency: p.currency_code ?? inv?.currency ?? 'INR', amount: p.amount, paid_on: p.date, mode: p.payment_mode || null,
      reference: p.reference_number || null, synced_at: new Date().toISOString(),
    }
  })
  const { error } = await db.from('payments').upsert(rows, { onConflict: 'zoho_payment_id' })
  if (error) throw error
  return rows.length
}

type DraftResult = { ok: true; number: string } | { ok: false; error: string }

/** The taxes and tax exemptions in Zoho Books, for finance to pick each customer's GST. Empty when Zoho is not connected. */
export async function zohoTaxOptions(): Promise<{ taxes: { id: string; name: string; percentage: number }[]; exemptions: { id: string; name: string }[]; error?: string }> {
  const e = env()
  if (!e.ZOHO_CLIENT_ID || !e.ZOHO_REFRESH_TOKEN || !e.ZOHO_ORGANIZATION_ID) return { taxes: [], exemptions: [] }
  try {
    const token = await accessToken()
    const get = async (path: string) => {
      const url = new URL(`${apiBase()}/books/v3/${path}`)
      url.search = new URLSearchParams({ organization_id: e.ZOHO_ORGANIZATION_ID }).toString()
      const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, next: { revalidate: 600 } })
      return (await res.json()) as Record<string, unknown>
    }
    const [t, x] = await Promise.all([get('settings/taxes'), get('settings/taxexemptions')])
    const taxes = ((t.taxes ?? []) as { tax_id: string; tax_name: string; tax_percentage: number; status?: string }[])
      .filter((r) => r.status !== 'inactive').map((r) => ({ id: r.tax_id, name: r.tax_name, percentage: r.tax_percentage }))
    const exemptions = ((x.tax_exemptions ?? []) as { tax_exemption_id: string; tax_exemption_code: string; description?: string }[])
      .map((r) => ({ id: r.tax_exemption_id, name: [r.tax_exemption_code, r.description].filter(Boolean).join(' · ') }))
    return { taxes, exemptions }
  } catch (err) {
    return { taxes: [], exemptions: [], error: err instanceof Error ? err.message : 'Zoho could not be reached.' }
  }
}

/** One statement: the same as an invoice for just that statement. */
export const createZohoDraftInvoice = (statementId: string) => createZohoInvoice([statementId])

/**
 * Creates ONE draft invoice in Zoho Books for one or more approved statements of the same customer and currency:
 * one line per statement line, at the approved rate x the approved quantity, each carrying the customer's GST
 * (Admin: customer page → HubSpot and Zoho → GST), or the tax of the line's Zoho item. Zoho adds numbering and
 * totals; finance reviews the draft and sends it from Zoho. Statements are claimed before Zoho is called and are
 * never invoiced twice. Needs the Zoho scope ZohoBooks.invoices.CREATE (and settings.READ for the GST list).
 */
export async function createZohoInvoice(statementIds: string[]): Promise<DraftResult> {
  const e = env()
  const db = createAdminClient()
  const ids = [...new Set(statementIds)]
  if (!ids.length) return { ok: false, error: 'Tick the approved statements to invoice first.' }
  const release = async (error: string): Promise<DraftResult> => {
    await db.from('billing_statements').update({ invoice_error: error, zoho_claimed_at: null }).in('id', ids)
    await logError('zoho', error, { statements: ids }, 'warn')
    return { ok: false, error }
  }
  // claim them all: approved, not invoiced, and nobody else working on them (a claim older than 5 minutes is abandoned)
  const stale = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: claimed } = await db.from('billing_statements')
    .update({ zoho_claimed_at: new Date().toISOString(), invoice_error: null })
    .in('id', ids).eq('status', 'approved').is('zoho_invoice_id', null)
    .or(`zoho_claimed_at.is.null,zoho_claimed_at.lt.${stale}`)
    .select('id, project_id, customer_id, rate_card_id, period_start, period_end, note')
  if ((claimed ?? []).length !== ids.length) {
    if (claimed?.length) await db.from('billing_statements').update({ zoho_claimed_at: null }).in('id', claimed.map((c) => c.id))
    return { ok: false, error: 'Only approved statements without an invoice can be invoiced (one may be invoiced already, or being sent to Zoho right now).' }
  }
  const sts = [...claimed!].sort((a, b) => a.period_start.localeCompare(b.period_start))
  if (new Set(sts.map((s) => s.customer_id)).size > 1) return release('An invoice is for one customer: tick statements of the same customer.')

  if (!e.ZOHO_CLIENT_ID || !e.ZOHO_REFRESH_TOKEN || !e.ZOHO_ORGANIZATION_ID) return release('Zoho is not connected. Add the ZOHO_* settings, then try again.')
  const customerId = sts[0]!.customer_id
  const [{ data: customer }, { data: tax }, { data: projects }, { data: cards }, { data: lines }] = await Promise.all([
    db.from('customers').select('name, zoho_customer_id').eq('id', customerId).single(),
    db.from('customer_billing').select('zoho_tax_id, zoho_tax_exemption_id').eq('customer_id', customerId).maybeSingle(),
    db.from('projects').select('id, name').in('id', sts.map((s) => s.project_id)),
    db.from('rate_cards').select('id, currency, po_number').in('id', sts.map((s) => s.rate_card_id)),
    db.from('statement_lines').select('statement_id, label, unit, rate, quantity, note, kind, position, rate_card_lines(zoho_item_id, description)')
      .in('statement_id', ids).gt('quantity', 0).order('position'),
  ])
  if (!customer?.zoho_customer_id) return release(`${customer?.name ?? 'This customer'} has no Zoho customer id. Add it on the customer page (HubSpot and Zoho), then try again.`)
  if (!lines?.length) return release('The statements have no lines with a quantity.')
  const currencies = new Set((cards ?? []).map((c) => c.currency))
  if (currencies.size > 1) return release(`The statements are in different currencies (${[...currencies].join(', ')}): invoice them separately.`)
  const currency = cards?.[0]?.currency
  const taxFields = tax?.zoho_tax_id ? { tax_id: tax.zoho_tax_id } : tax?.zoho_tax_exemption_id ? { tax_exemption_id: tax.zoho_tax_exemption_id } : null
  if (!taxFields && lines.some((l) => !l.rate_card_lines?.zoho_item_id)) {
    return release(`Set the GST for ${customer.name} first: customer page → HubSpot and Zoho → GST on invoices. Zoho needs a tax or an exemption on every line.`)
  }

  // Zoho bills a customer in the currency set on them in Zoho; an invoice can't be in another one
  const zohoCustomer = await lookupZohoCustomer(customer.zoho_customer_id)
  const mismatch = zohoCustomer.found ? currencyProblem(zohoCustomer.name, zohoCustomer.currency, currency) : null
  if (mismatch) return release(mismatch)

  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]))
  const stById = new Map(sts.map((s) => [s.id, s]))
  const pos = [...new Set((cards ?? []).map((c) => c.po_number).filter(Boolean))]
  const body = {
    customer_id: customer.zoho_customer_id,
    date: new Date().toISOString().slice(0, 10),
    reference_number: pos.join(', ') || undefined,
    line_items: [...lines].sort((a, b) => (stById.get(a.statement_id)!.period_start.localeCompare(stById.get(b.statement_id)!.period_start)) || a.position - b.position).map((l) => {
      const st = stById.get(l.statement_id)!
      return {
        ...(l.rate_card_lines?.zoho_item_id ? { item_id: l.rate_card_lines.zoho_item_id } : {}),
        ...(taxFields ?? {}),
        name: l.label,
        description: [`${projectName.get(st.project_id)} · ${st.period_start} to ${st.period_end}`, l.rate_card_lines?.description, l.note].filter(Boolean).join('\n'),
        rate: Number(l.rate),
        quantity: Number(l.quantity),
        unit: l.unit,
      }
    }),
    notes: sts.map((s) => s.note).filter(Boolean).join('\n') || undefined,
  }
  try {
    const token = await accessToken()
    const url = new URL(`${apiBase()}/books/v3/invoices`)
    url.search = new URLSearchParams({ organization_id: e.ZOHO_ORGANIZATION_ID }).toString()
    const res = await fetch(url, {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { code?: number; message?: string; invoice?: { invoice_id: string; invoice_number: string; currency_code?: string } }
    if (!res.ok || json.code !== 0 || !json.invoice) return release(`Zoho refused the invoice: ${json.message ?? res.status}`)
    const warn = currency && json.invoice.currency_code && json.invoice.currency_code !== currency
      ? `Zoho used ${json.invoice.currency_code}, but the rate card is in ${currency}. Check the draft before sending.` : null
    await db.from('billing_statements').update({
      status: 'invoiced', zoho_invoice_id: json.invoice.invoice_id, zoho_invoice_number: json.invoice.invoice_number,
      invoiced_at: new Date().toISOString(), invoice_error: warn, zoho_claimed_at: null,
    }).in('id', ids)
    return { ok: true, number: json.invoice.invoice_number }
  } catch (err) {
    return release(err instanceof Error ? err.message : 'Zoho could not be reached.')
  }
}
