// Removes what the HubSpot & Zoho import created, and every customer login, so you can start again.
// Staff logins, settings and anything made by hand in Helm stay.
//
// What goes:
//   - projects created by the import (those holding imported HubSpot deals), with everything on them
//   - customers that came from HubSpot or Zoho and have no other projects left, with their invoices,
//     payments and contacts
//   - HubSpot contacts listed under the customers that stay
//   - every customer login (staff logins stay)
//
// Usage (from client-os/, with the PRODUCTION values in .env.production.local, never committed):
//   node --env-file=.env.production.local scripts/reset-imported.mjs          lists what would go, deletes nothing
//   node --env-file=.env.production.local scripts/reset-imported.mjs --yes    deletes it (cannot be undone)
import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { yes: { type: 'boolean', default: false } } })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).')

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}
const chunks = (a, n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

// ---------------------------------------------------------------- work out what goes
const deals = ok(await db.from('project_deals').select('project_id'), 'read imported deals')
const importedProjectIds = [...new Set(deals.map((d) => d.project_id))]
const projects = ok(await db.from('projects').select('id, name, customer_id'), 'read projects')
const customers = ok(await db.from('customers').select('id, name, hubspot_company_id, zoho_customer_id'), 'read customers')
const importedProjects = projects.filter((p) => importedProjectIds.includes(p.id))
const keptProjects = projects.filter((p) => !importedProjectIds.includes(p.id))
const goingCustomers = customers.filter((c) => (c.hubspot_company_id || c.zoho_customer_id) && !keptProjects.some((p) => p.customer_id === c.id))
const keptCustomers = customers.filter((c) => !goingCustomers.includes(c))
const keptIds = keptCustomers.map((c) => c.id)
const contacts = keptIds.length
  ? ok(await db.from('customer_contacts').select('id').eq('source', 'hubspot').in('customer_id', keptIds), 'read contacts') : []
const customerLogins = ok(await db.from('profiles').select('id, email').eq('kind', 'customer').is('access_revoked_at', null), 'read customer logins')
const invoices = goingCustomers.length
  ? ok(await db.from('invoices').select('id', { count: 'exact', head: true }).in('customer_id', goingCustomers.map((c) => c.id)), 'count invoices') : null

const customerName = new Map(customers.map((c) => [c.id, c.name]))
console.log(`\nProjects created by the import (${importedProjects.length}):`)
for (const p of importedProjects) console.log(`  - ${customerName.get(p.customer_id)} · ${p.name}`)
console.log(`\nCustomers from HubSpot/Zoho with no other projects (${goingCustomers.length}), with their invoices and payments:`)
for (const c of goingCustomers) console.log(`  - ${c.name}`)
console.log(`\nHubSpot contacts under customers that stay: ${contacts.length}`)
console.log(`\nCustomer logins (${customerLogins.length}):`)
for (const u of customerLogins) console.log(`  - ${u.email}`)
console.log(`\nStaying: ${keptCustomers.length} customers (${keptCustomers.map((c) => c.name).join(', ') || 'none'}), ${keptProjects.length} projects, all staff logins and settings.`)

if (!values.yes) {
  console.log('\nNothing was deleted. Run again with --yes to delete the above.')
  process.exit(0)
}

// ---------------------------------------------------------------- delete
for (const ids of chunks(importedProjects.map((p) => p.id))) ok(await db.from('projects').delete().in('id', ids), 'delete projects')
for (const ids of chunks(goingCustomers.map((c) => c.id))) ok(await db.from('customers').delete().in('id', ids), 'delete customers')
for (const ids of chunks(contacts.map((c) => c.id))) ok(await db.from('customer_contacts').delete().in('id', ids), 'delete contacts')
let removed = 0, switchedOff = 0
for (const u of customerLogins) {
  if (!(await db.auth.admin.deleteUser(u.id)).error) { removed++; continue }
  // they wrote history on a customer that stays (a comment, an approval): keep the name on it, end all access
  ok(await db.rpc('set_access', { p_user: u.id, p_revoked: true }), `remove access for ${u.email}`)
  ok(await db.auth.admin.updateUserById(u.id, { ban_duration: '876000h' }), `sign out ${u.email}`)
  switchedOff++
}
console.log(`\nDeleted ${importedProjects.length} projects and ${goingCustomers.length} customers${invoices?.count != null ? ` (with ${invoices.count} invoices)` : ''}, and ${contacts.length} contacts.`)
console.log(`Customer logins: ${removed} deleted${switchedOff ? `, ${switchedOff} switched off (kept on history)` : ''}.`)
console.log('Run Admin → Import again whenever you want the HubSpot and Zoho history back.')
