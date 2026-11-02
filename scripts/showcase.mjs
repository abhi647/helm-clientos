// Fills a freshly seeded LOCAL Supabase with a few months of realistic demo activity, so every screen has something
// to show: billing set up three ways (time & materials, fixed price, retainer), weeks of timesheets (most approved),
// statements at each stage, finished tasks spread over the calendar, and documents out for review and sign-off.
// Usage (after `npm run seed`): node --env-file=.env.local scripts/showcase.mjs
// Refuses to run against anything but a local Supabase. Every action goes through the app's own rules (signed in
// as the person who would do it), except history dates, which are back-dated directly.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
if (!url || !secret || !publishable) throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required')
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error(`Refusing to touch ${url}: the showcase is for a local Supabase only.`)
const PASSWORD = process.env.SEED_PASSWORD || 'local-dev-only-password'
const opts = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: class NoRealtime {} } }
const admin = createClient(url, secret, opts)

const ok = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data }
const as = async (email) => {
  const c = createClient(url, publishable, opts)
  ok(await c.auth.signInWithPassword({ email, password: PASSWORD }), `sign in ${email}`)
  return c
}
const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d }
const weekday = (d) => d.getUTCDay() % 6 !== 0
const pick = (arr, i) => arr[i % arr.length]

const finance = await as('finance@example.com')
const ceo = await as('abhijit@example.com')
const rahul = await as('rahul@example.com')
const sahil = await as('sahil@example.com')
const people = Object.fromEntries((ok(await admin.from('profiles').select('id, email, full_name'), 'people')).map((p) => [p.email, p]))
const project = async (name) => ok(await admin.from('projects').select('id, customer_id').eq('name', name).single(), name)
const pbi = await project('Power BI Implementation')
const mgmt = await project('Management Reporting')
const support = await project('Support Engagement').catch(() => null)

// ---------------------------------------------------------------- billing, set up three ways
console.log('billing set-up…')
const setup = async (p, body) => {
  const card = ok(await finance.rpc('setup_billing', { p_project: p.id, p_currency: 'INR', p_notes: 'As per the signed SOW', ...body }), 'setup_billing')
  ok(await finance.rpc('approve_rate_card_for_customer', { p_card: card, p_note: 'Rates in the signed SOW' }), 'approve rates')
}
await setup(pbi, { p_model: 'time_materials', p_unit: 'hour', p_people: [
  { profile_id: people['sahil@example.com'].id, rate: 2500 }, { profile_id: people['rahul@example.com'].id, rate: 3500 },
] })
const phases = ok(await admin.from('phases').select('id, name').eq('project_id', mgmt.id).order('position'), 'phases')
await setup(mgmt, { p_model: 'fixed_price', p_unit: 'hour',
  p_milestones: [
    { label: 'Discovery sign-off', amount: 250000, phase_id: phases[0]?.id }, { label: 'Data model live', amount: 400000, phase_id: phases[1]?.id },
    { label: 'Dashboards accepted', amount: 450000, phase_id: phases[2]?.id }, { label: 'Go-live and handover', amount: 300000, phase_id: phases.at(-1)?.id },
  ],
  p_people: [{ profile_id: people['sahil@example.com'].id, rate: 2800 }] })
if (support) await setup(support, { p_model: 'retainer', p_unit: 'hour', p_retainer: { fee: 180000, hours: 60, rollover: 20 } })

// ---------------------------------------------------------------- eight weeks of timesheets
console.log('timesheets…')
const tasksOf = async (email, projectIds) => ok(await admin.from('tasks').select('id, customer_id, project_id, title')
  .eq('assignee_id', people[email].id).in('project_id', projectIds).is('parent_id', null), `tasks of ${email}`)
const projectIds = [pbi.id, mgmt.id, ...(support ? [support.id] : [])]
const logged = { sahil: [], rahul: [] }
for (const [who, client, email] of [['sahil', sahil, 'sahil@example.com'], ['rahul', rahul, 'rahul@example.com']]) {
  const tasks = await tasksOf(email, projectIds)
  if (!tasks.length) continue
  const rows = []
  for (let n = 56; n >= 0; n--) {
    const d = daysAgo(n)
    if (!weekday(d)) continue
    const t1 = pick(tasks, n), t2 = pick(tasks, n + 3)
    rows.push({ task_id: t1.id, customer_id: t1.customer_id, user_id: people[email].id, worked_on: iso(d), hours: who === 'sahil' ? 5 + (n % 3) : 3 + (n % 2), billable: true, note: null })
    if (n % 2 === 0 && t2.id !== t1.id) rows.push({ task_id: t2.id, customer_id: t2.customer_id, user_id: people[email].id, worked_on: iso(d), hours: 2, billable: true, note: null })
  }
  // fixed-price time on milestone phases is effort, not billable (the timesheet sets this the same way)
  const milestonePhases = new Set(phases.slice(0, 4).map((p) => p.id))
  const phaseOf = Object.fromEntries((ok(await admin.from('tasks').select('id, phase_id, project_id').in('id', rows.map((r) => r.task_id)), 'phases of tasks')).map((t) => [t.id, t]))
  // (and extra work outside them is billable only for someone with an extras rate: Sahil)
  for (const r of rows) if (phaseOf[r.task_id]?.project_id === mgmt.id && (milestonePhases.has(phaseOf[r.task_id].phase_id) || who !== 'sahil')) r.billable = false
  const ins = ok(await client.from('time_entries').insert(rows).select('id, worked_on'), `time for ${who}`)
  logged[who] = ins
}
// approved up to last week; this week's hours still wait. Rahul approves Sahil; the CEO approves Rahul (a PM's own hours)
const cutoff = iso(daysAgo(new Date().getUTCDay() === 0 ? 6 : new Date().getUTCDay() - 1))
const older = (list) => list.filter((e) => e.worked_on < cutoff).map((e) => e.id)
if (logged.sahil.length) ok(await rahul.rpc('approve_time', { p_entries: older(logged.sahil) }), 'approve Sahil')
if (logged.rahul.length) ok(await ceo.rpc('approve_time', { p_entries: older(logged.rahul) }), 'approve Rahul')

// ---------------------------------------------------------------- statements at each stage
console.log('statements…')
const month = (offset) => {
  const d = new Date(); const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 0))
  return [iso(s), iso(e)]
}
const [s2, e2] = month(-2), [s1, e1] = month(-1)
// T&M: two months ago approved, last month with the customer
const old = ok(await finance.rpc('create_statement', { p_project: pbi.id, p_start: s2, p_end: e2 }), 'T&M statement, 2 months ago')
ok(await finance.rpc('approve_statement_for_customer', { p_statement: old, p_note: 'Agreed by email' }), 'approve old statement')
const last = ok(await finance.rpc('create_statement', { p_project: pbi.id, p_start: s1, p_end: e1 }), 'T&M statement, last month')
ok(await finance.rpc('submit_statement', { p_statement: last }), 'send last month')
// fixed price: the first phase is delivered and its milestone billed and approved
await admin.from('tasks').update({ status: 'done', completed_at: daysAgo(40).toISOString() }).eq('project_id', mgmt.id).eq('phase_id', phases[0].id)
const discovery = ok(await admin.from('rate_card_lines').select('id, rate_cards!inner(project_id, status)').eq('rate_cards.project_id', mgmt.id).eq('rate_cards.status', 'approved').eq('label', 'Discovery sign-off').single(), 'milestone line')
const ms = ok(await finance.rpc('bill_milestone', { p_line: discovery.id }), 'bill milestone')
ok(await finance.rpc('approve_statement_for_customer', { p_statement: ms, p_note: 'Discovery accepted in the steering meeting' }), 'approve milestone')
// retainer: last month's fee approved
if (support) {
  const r = ok(await finance.rpc('create_statement', { p_project: support.id, p_start: s1, p_end: e1 }), 'retainer statement')
  ok(await finance.rpc('approve_statement_for_customer', { p_statement: r, p_note: 'Monthly retainer' }), 'approve retainer')
}

// ---------------------------------------------------------------- finished work spread over the last weeks (calendar, throughput)
console.log('history…')
const open = ok(await admin.from('tasks').select('id, project_id, status').in('project_id', projectIds).neq('status', 'done').is('parent_id', null), 'open tasks')
for (const [i, t] of open.slice(0, Math.floor(open.length / 3)).entries()) {
  await admin.from('tasks').update({ status: 'done', completed_at: daysAgo(3 + i * 4).toISOString() }).eq('id', t.id)
}
// back-date the activity log a little, so the six-month heatmap reads like a real project (local demo only)
const act = ok(await admin.from('activity').select('id').order('id'), 'activity')
for (const [i, a] of act.entries()) await admin.from('activity').update({ created_at: daysAgo((i * 7) % 150).toISOString() }).eq('id', a.id)

// ---------------------------------------------------------------- documents: a scope out for sign-off, requirements in draft
console.log('documents…')
const t = (text, extra = {}) => ({ type: 'p', children: [{ text }], ...extra })
const h = (text) => ({ type: 'h2', children: [{ text }] })
const li = (text) => ({ type: 'p', indent: 1, listStyleType: 'disc', children: [{ text }] })
const scope = ok(await rahul.from('pages').insert({
  customer_id: pbi.customer_id, project_id: pbi.id, kind: 'scope', title: 'Scope of work: Power BI rollout', created_by: people['rahul@example.com'].id,
  content: [
    h('Background'), t('Nesma tracks sales in 14 regional spreadsheets. Leadership wants one trusted view of sales, stock and forecast accuracy.'),
    h('Objectives'), li('One sales dashboard, refreshed daily, for the leadership team'), li('Forecast accuracy measured with WMAPE at SKU-region level'),
    h('In scope'), li('SAP sales, inventory and warehouse data'), li('Five dashboards: sales, stock, forecast, customers, regions'), li('Row-level security by region'),
    h('Out of scope'), li('Changes to SAP'), li('Mobile app'),
    h('Acceptance'), t('Each dashboard is accepted when the numbers match the finance close for one month.'),
  ],
}).select('id').single(), 'scope page')
ok(await rahul.rpc('set_page_sharing', { p_page: scope.id, p_shared: true }), 'share scope')
ok(await rahul.rpc('request_page_signoff', { p_page: scope.id, p_approver: people['michel@nesma.example.com'].id, p_due: iso(daysAgo(-5)), p_note: 'Please check the five dashboards and the acceptance rule.' }), 'request sign-off')
ok(await rahul.from('pages').insert({
  customer_id: pbi.customer_id, project_id: pbi.id, kind: 'requirements', title: 'Requirements: sales and forecast KPIs', created_by: people['rahul@example.com'].id,
  content: [h('KPIs and definitions'), li('Net sales: invoiced value after returns and discounts'), li('Forecast accuracy: 1 − WMAPE at SKU-region, monthly'), h('Open questions'), li('Which regions merge after the 2027 reorganisation?')],
}), 'requirements page')

console.log('Showcase ready. Sign in as abhijit@example.com (CEO), rahul@example.com (PM), sahil@example.com (consultant) or michel@nesma.example.com (customer).')
