// Creates one sign-in for every role, so you can see Helm as each of them. Nobody is emailed.
//
// All addresses are "+" aliases of one mailbox you own, so every sign-in code lands in your inbox:
//   you@gmail.com → you+helm-admin@gmail.com, you+helm-pm@gmail.com, …
// The customer users belong to a separate customer, "Helm Test Co (test)", with one small project, so real
// customers are untouched. Staff users see every customer, as real staff do.
//
// Usage (from client-os/, with the PRODUCTION values in .env.production.local, never committed):
//   node --env-file=.env.production.local scripts/test-users.mjs --email you@gmail.com
//   node --env-file=.env.production.local scripts/test-users.mjs --email you@gmail.com --remove
//
// Safe to run twice. --remove deletes the test customer and its project and removes the test sign-ins.
import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { email: { type: 'string' }, remove: { type: 'boolean', default: false } } })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).')
const base = values.email?.trim().toLowerCase()
if (!base || !/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(base)) throw new Error('Usage: --email you@gmail.com (a mailbox you own, without a "+")')
const [local, domain] = base.split('@')
const alias = (tag) => `${local}+helm-${tag}@${domain}`

const CUSTOMER = 'Helm Test Co (test)'
const PEOPLE = [
  { tag: 'admin', name: 'Test Admin', kind: 'internal', role: 'admin' },
  { tag: 'ceo', name: 'Test CEO', kind: 'internal', role: 'ceo' },
  { tag: 'pm', name: 'Test PM', kind: 'internal', role: 'pm' },
  { tag: 'consultant', name: 'Test Consultant', kind: 'internal', role: 'consultant' },
  { tag: 'finance', name: 'Test Finance', kind: 'internal', role: 'finance' },
  { tag: 'customer-exec', name: 'Test Customer Exec', kind: 'customer', role: 'customer_exec', invoices: true },
  { tag: 'customer-member', name: 'Test Customer Member', kind: 'customer', role: 'customer_member', invoices: false },
  { tag: 'customer-accounts', name: 'Test Customer Accounts', kind: 'customer', role: 'customer_member', invoices: true },
]

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: class NoRealtime {} },   // never used here; lets the script run on Node 20, which has no built-in WebSocket
})
const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

const allUsers = []
for (let page = 1; ; page++) {
  const { users } = ok(await db.auth.admin.listUsers({ page, perPage: 200 }), 'list users')
  allUsers.push(...users)
  if (users.length < 200) break
}
const findUser = (email) => allUsers.find((u) => u.email?.toLowerCase() === email) ?? null

const org = ok(await db.from('orgs').select('id').order('created_at').limit(1), 'read orgs')[0]
if (!org) throw new Error('No organisation yet. Run scripts/bootstrap.mjs first.')
let customer = ok(await db.from('customers').select('id').eq('org_id', org.id).eq('name', CUSTOMER).maybeSingle(), 'read customer')

// ---------------------------------------------------------------- remove
if (values.remove) {
  // the test customer first: its project and tasks point at the test users
  if (customer) { ok(await db.from('customers').delete().eq('id', customer.id), 'delete test customer'); console.log(`${CUSTOMER}: deleted`) }
  for (const p of PEOPLE) {
    const u = findUser(alias(p.tag))
    if (!u) continue
    const del = await db.auth.admin.deleteUser(u.id)
    if (del.error) {
      // they wrote history somewhere (a comment, an approval): keep the name on it, but end all access
      ok(await db.rpc('set_access', { p_user: u.id, p_revoked: true }), 'remove access')
      ok(await db.auth.admin.updateUserById(u.id, { ban_duration: '876000h' }), 'sign out')
      console.log(`${alias(p.tag)}: access removed (kept on history)`)
    } else console.log(`${alias(p.tag)}: deleted`)
  }
  process.exit(0)
}

// ---------------------------------------------------------------- the test customer
if (!customer) customer = ok(await db.from('customers').insert({ org_id: org.id, name: CUSTOMER }).select('id').single(), 'create test customer')

// ---------------------------------------------------------------- the sign-ins
const ids = {}
for (const p of PEOPLE) {
  const email = alias(p.tag)
  const app_metadata = p.kind === 'internal'
    ? { kind: 'internal', org_id: org.id, internal_role: p.role, full_name: p.name }
    : { kind: 'customer', customer_id: customer.id, customer_role: p.role, can_view_invoices: p.invoices, full_name: p.name }
  let u = findUser(email)
  if (u) {
    ok(await db.auth.admin.updateUserById(u.id, { app_metadata: { ...(u.app_metadata ?? {}), ...app_metadata }, ban_duration: 'none' }), `update ${email}`)
    await db.rpc('set_access', { p_user: u.id, p_revoked: false })
  } else {
    u = ok(await db.auth.admin.createUser({ email, email_confirm: true, app_metadata }), `create ${email}`).user
  }
  const profile = ok(await db.from('profiles').select('kind').eq('id', u.id).maybeSingle(), 'check profile')
  if (profile?.kind !== p.kind) throw new Error(`The profile for ${email} was not created. Check that all migrations were pushed.`)
  ids[p.tag] = u.id
}
ok(await db.from('customers').update({ account_owner_id: ids.pm }).eq('id', customer.id), 'set account owner')

// ---------------------------------------------------------------- one small project, so every screen has something on it
const PROJECT = 'Test engagement: Power BI dashboards'
const existing = ok(await db.from('projects').select('id').eq('customer_id', customer.id).eq('name', PROJECT).maybeSingle(), 'read project')
if (!existing) {
  const day = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)
  const project = ok(await db.from('projects').insert({
    customer_id: customer.id, name: PROJECT, template_key: 'power_bi_reporting', start_date: day(-14), end_date: day(70),
    pm_id: ids.pm, customer_lead_id: ids['customer-exec'],
  }).select('id').single(), 'create project')
  const plan = [
    ['Discovery', [
      ['Kickoff meeting', -14, -13, 'done'], ['Share data access', -13, -7, 'done', 'customer'], ['KPI workshop', -10, -6, 'done'],
    ]],
    ['Build', [
      ['Data model', -5, 10, 'in_progress'], ['Confirm KPI definitions', -2, 3, 'waiting_customer', 'customer'],
      ['Wireframes', 2, 9, 'todo'], ['Internal: effort review', 3, 4, 'todo', null, true],
    ]],
    ['UAT and handover', [['User acceptance testing', 40, 55, 'todo', 'customer'], ['Handover and training', 60, 70, 'todo']]],
  ]
  for (const [i, [name, tasks]] of plan.entries()) {
    const phase = ok(await db.from('phases').insert({ project_id: project.id, customer_id: customer.id, name, position: i }).select('id').single(), 'create phase')
    ok(await db.from('tasks').insert(tasks.map(([title, s, e, status, side, internal], j) => ({
      project_id: project.id, phase_id: phase.id, customer_id: customer.id, title, position: i * 100 + j,
      start_date: day(s), due_date: day(e), status, completed_at: status === 'done' ? new Date().toISOString() : null,
      owner_side: side === 'customer' ? 'customer' : 'seven_billion', visibility: internal ? 'internal' : 'shared',
      assignee_id: side === 'customer' ? ids['customer-member'] : ids.consultant, created_by: ids.pm,
    }))), 'create tasks')
  }
}

console.log(`\nDone. Sign in at ${process.env.NEXT_PUBLIC_SITE_URL ?? 'your Helm URL'} with any of these; the code arrives at ${base}:\n`)
for (const p of PEOPLE) console.log(`  ${p.name.padEnd(24)} ${alias(p.tag)}`)
console.log('\nStaff set up an authenticator app at their first sign-in. Remove them all with --remove.')
