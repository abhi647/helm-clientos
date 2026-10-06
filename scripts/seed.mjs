// Seeds a local Supabase with demo users and the Nesma pilot workspace.
// Usage: node --env-file=.env.local scripts/seed.mjs
// Refuses to run against anything but a local Supabase unless --allow-remote is passed.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')
if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes('--allow-remote')) {
  throw new Error(`Refusing to seed ${url}. Pass --allow-remote to seed a non-local project.`)
}
const PASSWORD = process.env.SEED_PASSWORD || 'local-dev-only-password'
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const day = (offset) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}
const one = async (table, row) => ok(await db.from(table).insert(row).select().single(), table)
const many = async (table, rows) => ok(await db.from(table).insert(rows, { defaultToNull: false }).select(), table)

async function user(email, full_name, meta) {
  const existing = ok(await db.auth.admin.listUsers({ perPage: 200 }), 'listUsers').users.find((u) => u.email === email)
  if (existing) await db.auth.admin.deleteUser(existing.id)
  const created = ok(await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { full_name, ...meta } }), `createUser ${email}`)
  return created.user.id
}

async function main() {
  // wipe demo data (orgs cascade to customers, profiles and everything else), then the demo logins
  ok(await db.from('orgs').delete().neq('id', '00000000-0000-0000-0000-000000000000'), 'wipe orgs')
  for (const u of ok(await db.auth.admin.listUsers({ perPage: 200 }), 'listUsers').users) {
    if (u.email?.endsWith('example.com')) ok(await db.auth.admin.deleteUser(u.id), 'deleteUser')
  }

  const org = await one('orgs', { name: 'Seven Billion' })
  const [nesma, cbd, custx] = await many('customers', [
    { org_id: org.id, name: 'Nesma Group', hubspot_company_id: 'demo-nesma' },
    { org_id: org.id, name: 'CBD Group', hubspot_company_id: 'demo-cbd' },
    { org_id: org.id, name: 'Customer X', hubspot_company_id: 'demo-cx' },
  ])

  const staff = (role) => ({ kind: 'internal', org_id: org.id, internal_role: role })
  const abhijit = await user('abhijit@example.com', 'Abhijit', staff('ceo'))
  const rahul = await user('rahul@example.com', 'Rahul', staff('pm'))
  const sahil = await user('sahil@example.com', 'Sahil', staff('consultant'))
  await user('finance@example.com', 'Finance', staff('finance'))
  await user('admin@example.com', 'Admin', staff('admin'))
  const michel = await user('michel@nesma.example.com', 'Michel', { kind: 'customer', customer_id: nesma.id, customer_role: 'customer_exec', can_view_invoices: true })
  const omar = await user('omar@nesma.example.com', 'Omar', { kind: 'customer', customer_id: nesma.id, customer_role: 'customer_member' })
  await user('lead@cbd.example.com', 'CBD Lead', { kind: 'customer', customer_id: cbd.id, customer_role: 'customer_exec' })

  // ---------------------------------------------------------------- Nesma: Power BI Implementation (the plan screen)
  const pbi = await one('projects', { customer_id: nesma.id, name: 'Power BI Implementation', template_key: 'power_bi_reporting', health: 'on_track', start_date: day(-188), end_date: day(24), pm_id: rahul, customer_lead_id: michel, hubspot_deal_id: 'demo-deal-pbi' })
  await one('project_commercials', { project_id: pbi.id, customer_id: nesma.id, billing_model: 'Fixed price, milestone billing' })
  const phaseNames = ['Discovery', 'Data Engineering', 'Reporting', 'UAT', 'Deployment']
  const phases = await many('phases', phaseNames.map((name, i) => ({ project_id: pbi.id, customer_id: nesma.id, name, position: i })))
  const P = Object.fromEntries(phases.map((p) => [p.name, p.id]))
  const T = (phase, title, status, assignee, start, due, est, extra = {}) => ({
    row: { project_id: pbi.id, phase_id: P[phase], customer_id: nesma.id, title, status, assignee_id: assignee, start_date: day(start), due_date: day(due), visibility: 'shared', owner_side: 'seven_billion', ...extra },
    est,
  })
  const plan = [
    T('Discovery', 'Kickoff', 'done', rahul, -188, -187, 4),
    T('Discovery', 'KPI workshop', 'done', rahul, -181, -179, 12),
    T('Discovery', 'Data assessment', 'done', sahil, -175, -159, 24),
    T('Data Engineering', 'SAP connection', 'done', sahil, -158, -24, 40),
    T('Data Engineering', 'Data mapping', 'in_progress', sahil, -21, 3, 32, { description: 'Map SAP sales, inventory and warehouse tables to the reporting model. Blocked for 3 territories until the warehouse hierarchy is confirmed.' }),
    T('Data Engineering', 'Confirm warehouse hierarchy', 'waiting_customer', michel, -5, -2, null, { owner_side: 'customer', spotlight: true, description: 'Which warehouse hierarchy should the reports use: plant-based or region-based?' }),
    T('Data Engineering', 'API fallback spike', 'todo', sahil, 2, 8, 8, { visibility: 'internal', description: 'Alternate extraction path in case the SAP OData endpoint stays unstable.' }),
    T('Data Engineering', 'Semantic model', 'todo', sahil, 4, 11, 40),
    T('Reporting', 'Wireframes', 'in_review', rahul, -5, 1, 16),
    T('Reporting', 'Dashboard development', 'todo', sahil, 7, 16, 60),
    T('Reporting', 'Internal QA', 'todo', rahul, 16, 18, 12, { visibility: 'internal' }),
    T('UAT', 'Customer testing', 'todo', michel, 21, 22, null, { owner_side: 'customer', spotlight: true }),
    T('UAT', 'Fixes', 'todo', sahil, 22, 23, 16),
    T('UAT', 'UAT sign-off', 'todo', michel, 23, 23, null, { owner_side: 'customer', spotlight: true }),
    T('Deployment', 'Production release', 'todo', sahil, 23, 24, 6),
    T('Deployment', 'Training', 'todo', rahul, 24, 24, 6),
    T('Deployment', 'Handover', 'todo', rahul, 24, 24, 4),
  ]
  const tasks = await many('tasks', plan.map((p, i) => ({ ...p.row, position: i, completed_at: p.row.status === 'done' ? new Date().toISOString() : null })))
  await many('task_estimates', tasks.map((t, i) => ({ task_id: t.id, customer_id: nesma.id, estimate_hours: plan[i].est })).filter((e) => e.estimate_hours != null))
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]))
  // demo time is entered as if by the consultant (the API lets staff log their own time only)
  await many('time_entries', [
    ['Kickoff', 4], ['KPI workshop', 14], ['Data assessment', 26], ['SAP connection', 44], ['Data mapping', 21], ['Wireframes', 12],
  ].map(([title, hours]) => ({ task_id: byTitle[title].id, customer_id: nesma.id, user_id: title === 'Wireframes' || title.startsWith('K') ? rahul : sahil, hours: Math.min(hours, 24), worked_on: day(-3) })))

  await many('comments', [
    { customer_id: nesma.id, entity_type: 'task', entity_id: byTitle['Data mapping'].id, author_id: sahil, visibility: 'internal', body: 'Source API is unstable. Keep the fallback spike ready.' },
    { customer_id: nesma.id, entity_type: 'task', entity_id: byTitle['Data mapping'].id, author_id: rahul, visibility: 'shared', body: 'First extraction is done. Validation results tomorrow.' },
  ])

  // ---------------------------------------------------------------- Nesma: other projects
  const mgmt = await one('projects', { customer_id: nesma.id, name: 'Management Reporting', template_key: 'bi_implementation', health: 'needs_attention', start_date: day(-90), end_date: day(40), pm_id: rahul, customer_lead_id: michel })
  const infor = await one('projects', { customer_id: nesma.id, name: 'Infor LN Integration', template_key: 'erp_integration', health: 'on_track', start_date: day(-120), end_date: day(30), pm_id: rahul, customer_lead_id: michel })
  for (const [proj, names, doneCount] of [[mgmt, ['Discovery', 'Data Engineering', 'Reporting', 'UAT', 'Deployment'], 4], [infor, ['Discovery', 'Design', 'API Development', 'Testing', 'Go-live'], 6]]) {
    const ph = await many('phases', names.map((name, i) => ({ project_id: proj.id, customer_id: nesma.id, name, position: i })))
    const rows = []
    ph.forEach((p, i) => ['Plan', 'Build', 'Review'].forEach((n, j) => rows.push({ project_id: proj.id, phase_id: p.id, customer_id: nesma.id, title: `${p.name}: ${n}`, status: i * 3 + j < doneCount ? 'done' : i * 3 + j === doneCount ? 'in_progress' : 'todo', assignee_id: j === 1 ? sahil : rahul, visibility: 'shared', position: i * 3 + j, due_date: day(-60 + (i * 3 + j) * 7) })))
    await many('tasks', rows)
  }

  // ---------------------------------------------------------------- requests and approvals
  ok(await db.from('requests').insert([
    { customer_id: nesma.id, project_id: infor.id, title: 'Access for 3 new users', what: 'Portal and Power BI access for 3 regional managers.', why: 'New regional team joining this month.', type: 'access_request', priority: 'normal', desired_date: day(2), requested_by: omar },
    { customer_id: nesma.id, project_id: infor.id, title: 'Inventory dashboard filter fix', what: 'Warehouse filter resets when changing the date range.', why: 'Users lose their selection on every refresh.', type: 'bug', priority: 'high', desired_date: day(3), requested_by: michel, owner_id: sahil },
  ], { defaultToNull: false }), 'requests')
  const req = await one('requests', { customer_id: nesma.id, project_id: mgmt.id, title: 'Add regional sales forecast', what: 'A sales forecast by region, with drill-down to product level.', why: 'Regional managers plan stock monthly and today work from national numbers.', type: 'enhancement', priority: 'high', desired_date: day(9), requested_by: michel, owner_id: rahul })
  ok(await db.from('requests').update({ status: 'under_review' }).eq('id', req.id), 'req review')
  await many('comments', [
    { customer_id: nesma.id, entity_type: 'request', entity_id: req.id, author_id: michel, visibility: 'shared', body: 'We need this before the regional review on the 20th.' },
    { customer_id: nesma.id, entity_type: 'request', entity_id: req.id, author_id: rahul, visibility: 'shared', body: 'Should the forecast use your 6 sales regions or the 4 supply regions?' },
    { customer_id: nesma.id, entity_type: 'request', entity_id: req.id, author_id: michel, visibility: 'shared', body: 'The 6 sales regions, please.' },
    { customer_id: nesma.id, entity_type: 'request', entity_id: req.id, author_id: sahil, visibility: 'internal', body: 'Region master is missing 3 territories. Exclude them from scope and flag it.' },
  ])
  await one('approvals', { customer_id: nesma.id, project_id: mgmt.id, request_id: req.id, kind: 'estimate', title: `Estimate for ${req.number}: regional sales forecast`, summary: 'Region-level forecast for 6 sales regions, product drill-down, weekly refresh. Excludes region master data.', effort_hours: 42, target_date: day(9), due_date: day(1), approver_id: michel, requested_by: rahul })

  // ---------------------------------------------------------------- CBD and Customer X (portfolio rows)
  const cbdProj = await one('projects', { customer_id: cbd.id, name: 'Data Platform Implementation', template_key: 'data_platform', health: 'at_risk', start_date: day(-120), end_date: day(60), pm_id: rahul })
  await many('tasks', [
    { project_id: cbdProj.id, customer_id: cbd.id, title: 'Data model sign-off', status: 'in_review', assignee_id: rahul, due_date: day(-8), visibility: 'shared' },
    { project_id: cbdProj.id, customer_id: cbd.id, title: 'Source access', status: 'waiting_customer', owner_side: 'customer', due_date: day(-4), visibility: 'shared' },
  ])
  const cxProj = await one('projects', { customer_id: custx.id, name: 'Support Engagement', template_key: 'support_engagement', health: 'needs_attention', start_date: day(-200), end_date: day(160), pm_id: sahil })
  await one('requests', { customer_id: custx.id, project_id: cxProj.id, title: 'New report: supplier OTIF', what: 'On-time in-full by supplier and month.', why: 'Quarterly supplier review.', type: 'new_report', priority: 'critical', desired_date: day(-2), owner_id: sahil })

  // ---------------------------------------------------------------- meetings, decisions, updates, documents
  ok(await db.from('customers').update({ account_owner_id: abhijit }).eq('id', nesma.id), 'account owner')
  const mtg = await one('meetings', { customer_id: nesma.id, project_id: pbi.id, title: 'Weekly project review', held_on: day(-5), attendees: 'Rahul, Sahil, Michel, Omar', summary: 'Reviewed extraction progress and UAT dates.\nAgreed to measure forecast accuracy with WMAPE.\nNesma to confirm the warehouse hierarchy this week.' })
  await many('meeting_actions', [
    { meeting_id: mtg.id, customer_id: nesma.id, text: 'Share the region master file', owner_side: 'customer', assignee_id: omar, due_date: day(3), position: 1 },
    { meeting_id: mtg.id, customer_id: nesma.id, text: 'Draft the UAT test scenarios', owner_side: 'seven_billion', assignee_id: sahil, due_date: day(10), position: 2 },
  ])
  await one('meetings', { customer_id: nesma.id, project_id: pbi.id, title: 'Internal delivery check', held_on: day(-2), attendees: 'Rahul, Sahil', summary: 'OData fallback ready if the API stays unstable.', visibility: 'internal' })
  // the kickoff form was filled in at the start; the playbook then asked for data access
  await one('form_submissions', { customer_id: nesma.id, project_id: pbi.id, form_key: 'kickoff', submitted_by: michel,
    answers: { goals: 'One version of sales and stock for every region.', success: 'Regional managers plan from the dashboard every Monday.', data_owner: 'Omar', systems: 'SAP S/4HANA, Excel', cadence: 'weekly_call' } })
  await one('decisions', { customer_id: nesma.id, project_id: pbi.id, meeting_id: mtg.id, decision: 'Forecast accuracy will be measured using WMAPE at SKU-region level.', decided_on: day(-5), decided_by: 'Seven Billion + Nesma' })
  await one('updates', { customer_id: nesma.id, project_id: pbi.id, week_of: day(-5), health: 'on_track', completed: 'SAP sales extraction\nProduct mapping', in_progress: 'Data mapping\nWireframes v2', waiting_on_customer: 'Warehouse hierarchy confirmation', next_week: 'Semantic model; dashboard build starts', status: 'published', published_at: new Date().toISOString(), author_id: rahul })
  await many('documents', [
    { customer_id: nesma.id, project_id: pbi.id, folder: '01-commercial', name: 'Statement of Work.pdf', visibility: 'shared', uploaded_by: abhijit },
    { customer_id: nesma.id, project_id: pbi.id, folder: '02-requirements', name: 'SAP Warehouse Mapping.xlsx', visibility: 'shared', uploaded_by: sahil },
    { customer_id: nesma.id, project_id: pbi.id, folder: '03-design', name: 'Extraction fallback options.md', visibility: 'internal', uploaded_by: sahil },
  ])

  // ---------------------------------------------------------------- invoices (in production these come only from the Zoho sync)
  await many('invoices', [
    { customer_id: nesma.id, zoho_invoice_id: 'demo-1072', number: 'INV-1072', currency: 'INR', total: 400000, balance: 400000, status: 'sent', issued_on: day(5), due_on: day(35) },
    { customer_id: custx.id, zoho_invoice_id: 'demo-1031', number: 'INV-1031', currency: 'INR', total: null, balance: null, status: 'overdue', issued_on: day(-73), due_on: day(-43) },
  ])

  // ---------------------------------------------------------------- CSAT history (demo answers over the last five months) and feedback
  const cbdLead = (await db.from('profiles').select('id').eq('email', 'lead@cbd.example.com').single()).data.id
  const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString()
  const answered = (customer_id, recipient_id, kind, days, score, comment = '', project_id = null) =>
    ({ customer_id, recipient_id, kind, project_id, score, comment, sent_at: ago(days + 2), answered_at: ago(days), expires_at: ago(days - 19),
       period: kind === 'pulse' ? ago(days).slice(0, 8) + '01' : null })
  await many('csat_surveys', [
    answered(nesma.id, michel, 'pulse', 150, 4), answered(nesma.id, omar, 'pulse', 148, 3, 'Updates could be more regular.'),
    answered(nesma.id, michel, 'pulse', 120, 4), answered(nesma.id, omar, 'pulse', 118, 4),
    answered(nesma.id, michel, 'pulse', 90, 5, 'The weekly update is exactly what I need.'), answered(nesma.id, omar, 'request', 75, 4, '', pbi.id),
    answered(nesma.id, michel, 'pulse', 60, 4), answered(nesma.id, omar, 'pulse', 58, 5, 'Data mapping workshop was very useful.'),
    answered(cbd.id, cbdLead, 'pulse', 88, 3), answered(cbd.id, cbdLead, 'pulse', 57, 2, 'Too many slipped dates on the data model.'),
    answered(nesma.id, michel, 'pulse', 30, 5), answered(cbd.id, cbdLead, 'pulse', 27, 3),
  ])
  // asked but never answered (counts against the response rate)
  await many('csat_surveys', [{ customer_id: nesma.id, recipient_id: omar, kind: 'pulse', period: ago(30).slice(0, 8) + '01', sent_at: ago(32), expires_at: ago(2) }])
  // a delivered request waiting for Omar's rating
  const done = await one('requests', { customer_id: nesma.id, project_id: pbi.id, title: 'Add product hierarchy filter', what: 'Filter every page by product family.', type: 'enhancement', requested_by: omar, owner_id: rahul })
  ok(await db.from('requests').update({ status: 'delivered' }).eq('id', done.id), 'deliver request')
  // this month's pulse for every customer user (the daily cron does this in production)
  ok(await db.rpc('send_csat_pulses'), 'pulses')
  await many('feedback', [
    { customer_id: nesma.id, project_id: pbi.id, kind: 'praise', body: 'The data mapping workshop saved us weeks. Please thank Sahil.', submitted_by: michel, status: 'actioned', owner_id: abhijit, created_at: ago(40) },
    { customer_id: nesma.id, project_id: pbi.id, kind: 'suggestion', body: 'Could the weekly update also list what is planned for UAT?', submitted_by: omar, owner_id: rahul, created_at: ago(3) },
  ])
  const low = (await db.from('csat_surveys').select('id').eq('customer_id', cbd.id).eq('score', 2).single()).data
  await one('feedback', { customer_id: cbd.id, project_id: cbdProj.id, kind: 'issue', source: 'csat', csat_id: low.id, submitted_by: cbdLead, owner_id: rahul, status: 'acknowledged',
    body: 'Rated monthly check-in 2/5: Too many slipped dates on the data model.', created_at: ago(57) })

  // the demo starts with an empty inbox; real notifications are created by actions from here on
  ok(await db.from('email_outbox').delete().neq('to_email', ''), 'clear outbox')
  ok(await db.from('notifications').delete().neq('kind', ''), 'clear notifications')
  console.log('Seeded. Sign in locally with any demo email (magic link in Mailpit) or the seed password in tests.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
