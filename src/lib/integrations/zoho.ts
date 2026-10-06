import 'server-only'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

type ZohoInvoice = {
  invoice_id: string; invoice_number: string; customer_id: string; customer_name: string; status: string
  date: string; due_date: string; total: number; balance: number; currency_code: string
}

const HIDDEN = new Set(['draft', 'void'])

async function accessToken(): Promise<string> {
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
    const url = new URL(`https://www.zohoapis.${e.ZOHO_DOMAIN}/books/v3/invoices`)
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
    const url = new URL(`https://www.zohoapis.${e.ZOHO_DOMAIN}/books/v3/customerpayments`)
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
