import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// every table that holds a customer's data (each has customer_id and is removed with the customer)
export const CUSTOMER_TABLES = [
  'projects', 'project_commercials', 'phases', 'tasks', 'task_estimates', 'time_entries', 'requests', 'request_events',
  'approvals', 'approval_events', 'action_items', 'comments', 'documents', 'document_versions', 'meetings', 'meeting_actions',
  'decisions', 'updates', 'invoices', 'payments', 'activity', 'form_submissions', 'csat_surveys', 'feedback',
  'rate_cards', 'rate_card_lines', 'billing_statements', 'statement_lines', 'customer_contacts', 'project_deals',
] as const

/** Everything Helm holds about one customer, as JSON: for a data request or before closing an account. */
export async function exportCustomer(customerId: string) {
  const db = createAdminClient()
  const { data: customer, error } = await db.from('customers').select('*').eq('id', customerId).single()
  if (error || !customer) throw new Error('Customer not found')
  const tables: Record<string, unknown[]> = {}
  for (const t of CUSTOMER_TABLES) {
    const rows: unknown[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await db.from(t).select('*').eq('customer_id', customerId).range(from, from + 999)
      if (e) throw new Error(`${t}: ${e.message}`)
      rows.push(...data)
      if (data.length < 1000) break
    }
    tables[t] = rows
  }
  const { data: people } = await db.from('profiles').select('id, email, full_name, customer_role, can_view_invoices, created_at, access_revoked_at').eq('customer_id', customerId)
  return {
    exported_at: new Date().toISOString(),
    note: 'Uploaded files are listed under documents and document_versions; download them from Helm or the storage bucket.',
    customer, people: people ?? [], tables,
  }
}

/**
 * Removes a customer for good: their files, then the customer and (by cascade) every row that belongs to them,
 * including their people's profiles, then those people's sign-ins. Sign-ins go last: while a person's requests,
 * comments or approvals exist, the database refuses to remove the person. Returns what was removed.
 */
export async function deleteCustomer(customerId: string) {
  const db = createAdminClient()
  // files live under documents/<customer id>/<document id>/<name>
  let files = 0
  const { data: folders } = await db.storage.from('documents').list(customerId, { limit: 1000 })
  for (const folder of folders ?? []) {
    const { data: items } = await db.storage.from('documents').list(`${customerId}/${folder.name}`, { limit: 1000 })
    const paths = (items ?? []).map((i) => `${customerId}/${folder.name}/${i.name}`)
    if (paths.length) {
      const { error } = await db.storage.from('documents').remove(paths)
      if (error) throw new Error(`files: ${error.message}`)
      files += paths.length
    }
  }
  const { data: people } = await db.from('profiles').select('id').eq('customer_id', customerId)
  const { error } = await db.from('customers').delete().eq('id', customerId)
  if (error) throw new Error(`customer: ${error.message}`)
  // their profiles are gone with the customer, so nothing points at these sign-ins any more
  const leftover: string[] = []
  for (const p of people ?? []) {
    const { error: e } = await db.auth.admin.deleteUser(p.id)
    if (e && !/not found/i.test(e.message)) leftover.push(`${p.id}: ${e.message}`)
  }
  return { files, people: people?.length ?? 0, leftover }
}

/** Removes the stored files (every version) of documents already deleted from the database. */
export async function removeDocumentFiles(customerId: string, documentIds: string[]) {
  const db = createAdminClient()
  let files = 0
  for (const doc of documentIds) {
    const { data: items } = await db.storage.from('documents').list(`${customerId}/${doc}`, { limit: 1000 })
    const paths = (items ?? []).map((i) => `${customerId}/${doc}/${i.name}`)
    if (!paths.length) continue
    const { error } = await db.storage.from('documents').remove(paths)
    if (error) throw new Error(`files: ${error.message}`)
    files += paths.length
  }
  return files
}
