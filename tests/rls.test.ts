// Security tests: sign in as each kind of user against a local Supabase and prove what they can and cannot do.
// Run: npm run test:db   (needs `supabase start`; reseeds the local database first)
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as OTPAuth from 'otpauth'
import { beforeAll, describe, expect, it } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const PASSWORD = process.env.SEED_PASSWORD || 'local-dev-only-password'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

const service = createClient(url, secret, opts)
/** Signs in. Staff also complete two-step sign-in (TOTP), as the database requires for staff data. */
async function as(email: string, { mfa = true }: { mfa?: boolean } = {}): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, opts)
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  const staff = email.endsWith('@example.com') && !email.includes('nesma') && !email.includes('cbd')
  if (staff && mfa) {
    const { data: f, error: e1 } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: `test-${Date.now()}-${Math.random()}` })
    if (e1 || !f) throw new Error(`${email}: enroll ${e1?.message}`)
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(f.totp.secret) }).generate()
    const { error: e2 } = await c.auth.mfa.challengeAndVerify({ factorId: f.id, code })
    if (e2) throw new Error(`${email}: verify ${e2.message}`)
  }
  return c
}

const VISIBILITY_TABLES = ['phases', 'tasks', 'comments', 'documents', 'meetings', 'decisions', 'activity']
const CUSTOMER_TABLES = ['customers', 'projects', 'phases', 'tasks', 'requests', 'request_events', 'approvals', 'approval_events',
  'action_items', 'comments', 'documents', 'meetings', 'decisions', 'updates', 'invoices', 'activity',
  'meeting_actions', 'form_submissions', 'document_versions', 'payments', 'csat_surveys', 'feedback']
const STAFF_ONLY = ['project_commercials', 'task_estimates', 'time_entries', 'automation_rules']
const SERVICE_ONLY = ['email_outbox', 'integration_events']

let nesma: string, cbd: string
let michel: SupabaseClient, omar: SupabaseClient, cbdLead: SupabaseClient, rahul: SupabaseClient, sahil: SupabaseClient, finance: SupabaseClient

beforeAll(async () => {
  execSync('node --env-file=.env.local scripts/seed.mjs', { stdio: 'ignore' })
  const { data } = await service.from('customers').select('id,name')
  nesma = data!.find((c) => c.name === 'Nesma Group')!.id
  cbd = data!.find((c) => c.name === 'CBD Group')!.id
  ;[michel, omar, cbdLead, rahul, sahil, finance] = await Promise.all([
    as('michel@nesma.example.com'), as('omar@nesma.example.com'), as('lead@cbd.example.com'),
    as('rahul@example.com'), as('sahil@example.com'), as('finance@example.com'),
  ])
}, 120_000)

describe('customer users never see internal rows', () => {
  it.each(VISIBILITY_TABLES)('%s: only shared rows of their own customer', async (table) => {
    const { data, error } = await michel.from(table).select('customer_id, visibility')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    for (const row of data!) {
      expect(row.visibility).toBe('shared')
      expect(row.customer_id).toBe(nesma)
    }
    // and the internal rows really exist, so the test is not passing on empty data
    const all = await service.from(table).select('id').eq('customer_id', nesma).eq('visibility', 'internal')
    if (['tasks', 'comments', 'documents', 'meetings'].includes(table)) expect(all.data!.length).toBeGreaterThan(0)
  })

  it.each(CUSTOMER_TABLES)('%s: nothing from another customer', async (table) => {
    const col = table === 'customers' ? 'id' : 'customer_id'
    const { data, error } = await michel.from(table).select(col)
    expect(error).toBeNull()
    for (const row of data! as unknown as Record<string, string>[]) expect(row[col]).toBe(nesma)
    const other = await cbdLead.from(table).select(col)
    for (const row of other.data! as unknown as Record<string, string>[]) expect(row[col]).toBe(cbd)
  })

  it.each([...STAFF_ONLY, ...SERVICE_ONLY])('%s: no rows at all', async (table) => {
    const { data } = await michel.from(table).select('*')
    expect(data ?? []).toHaveLength(0)
  })

  it('draft weekly updates are hidden until published', async () => {
    const { data: pbi } = await service.from('projects').select('id').eq('name', 'Power BI Implementation').single()
    await service.from('updates').insert({ customer_id: nesma, project_id: pbi!.id, week_of: '2026-10-05', health: 'at_risk', status: 'draft' })
    const { data } = await michel.from('updates').select('status')
    expect(data!.every((u) => u.status === 'published')).toBe(true)
  })

  it('invoices need the per-user invoice flag', async () => {
    expect((await michel.from('invoices').select('id')).data!.length).toBeGreaterThan(0)
    expect((await omar.from('invoices').select('id')).data).toHaveLength(0)
  })
})

describe('customer users cannot write past their permissions', () => {
  it('cannot post an internal comment', async () => {
    const { data: req } = await michel.from('requests').select('id').limit(1).single()
    const { data: me } = await michel.auth.getUser()
    const res = await michel.from('comments').insert({ customer_id: nesma, entity_type: 'request', entity_id: req!.id, author_id: me.user!.id, body: 'x', visibility: 'internal' })
    expect(res.error).not.toBeNull()
  })

  it('cannot comment on an internal task (it does not exist for them)', async () => {
    const { data: task } = await service.from('tasks').select('id').eq('customer_id', nesma).eq('visibility', 'internal').limit(1).single()
    const { data: me } = await michel.auth.getUser()
    const res = await michel.from('comments').insert({ customer_id: nesma, entity_type: 'task', entity_id: task!.id, author_id: me.user!.id, body: 'x', visibility: 'shared' })
    expect(res.error).not.toBeNull()
  })

  it('can raise a request for their own company only', async () => {
    const { data: me } = await michel.auth.getUser()
    const ok = await michel.from('requests').insert({ customer_id: nesma, title: 'Test request from portal', requested_by: me.user!.id }).select('number').single()
    expect(ok.error).toBeNull()
    expect(ok.data!.number).toMatch(/^REQ-\d+$/)
    const bad = await michel.from('requests').insert({ customer_id: cbd, title: 'Sneaky request', requested_by: me.user!.id })
    expect(bad.error).not.toBeNull()
    const forged = await michel.from('requests').insert({ customer_id: nesma, title: 'Pre-approved', requested_by: me.user!.id, status: 'approved' })
    expect(forged.error).not.toBeNull()
  })

  it('cannot give themselves invoice access or another role', async () => {
    const { data: me } = await omar.auth.getUser()
    const res = await omar.from('profiles').update({ can_view_invoices: true }).eq('id', me.user!.id)
    expect(res.error).not.toBeNull()
    const rename = await omar.from('profiles').update({ full_name: 'Omar A.' }).eq('id', me.user!.id)
    expect(rename.error).toBeNull()
  })

  it('cannot edit tasks or approvals directly', async () => {
    const t = await michel.from('tasks').update({ status: 'done' }).eq('customer_id', nesma).select('id')
    expect(t.data ?? []).toHaveLength(0)
    const a = await michel.from('approvals').update({ status: 'approved' }).eq('customer_id', nesma).select('id')
    expect(a.data ?? []).toHaveLength(0)
  })
})

describe('approvals keep a full audit trail', () => {
  it('only the named approver can decide, once, and history is appended', async () => {
    const { data: ap } = await michel.from('approvals').select('id, request_id').eq('status', 'pending').single()
    expect((await omar.rpc('decide_approval', { p_approval: ap!.id, p_decision: 'approved' })).error).not.toBeNull()
    expect((await michel.rpc('decide_approval', { p_approval: ap!.id, p_decision: 'changes_requested', p_comment: '' })).error).not.toBeNull()
    expect((await michel.rpc('decide_approval', { p_approval: ap!.id, p_decision: 'changes_requested', p_comment: 'Add the 3 missing territories' })).error).toBeNull()
    expect((await michel.rpc('decide_approval', { p_approval: ap!.id, p_decision: 'approved' })).error).not.toBeNull()

    expect((await rahul.rpc('resubmit_approval', { p_approval: ap!.id, p_summary: 'Now includes all territories', p_effort: 48, p_target: null })).error).toBeNull()
    expect((await michel.rpc('decide_approval', { p_approval: ap!.id, p_decision: 'approved' })).error).toBeNull()

    const { data: events } = await michel.from('approval_events').select('action, version').eq('approval_id', ap!.id).order('id')
    expect(events!.map((e) => `${e.action}@v${e.version}`)).toEqual(['requested@v1', 'changes_requested@v1', 'resubmitted@v2', 'approved@v2'])
    const { data: req } = await michel.from('requests').select('status').eq('id', ap!.request_id).single()
    expect(req!.status).toBe('approved')

    // nobody can rewrite history
    const del = await rahul.from('approval_events').delete().eq('approval_id', ap!.id).select('id')
    expect(del.data ?? []).toHaveLength(0)

    // Rahul was told, in the app and by email
    const { data: notes } = await rahul.from('notifications').select('kind').in('kind', ['approval.approved', 'approval.changes_requested'])
    expect(notes!.length).toBe(2)
    const { data: mails } = await service.from('email_outbox').select('to_email').eq('to_email', 'rahul@example.com')
    expect(mails!.length).toBeGreaterThanOrEqual(2)
  })
})

describe('staff roles', () => {
  it('see internal work for their customers', async () => {
    const { data } = await sahil.from('tasks').select('visibility').eq('customer_id', nesma)
    expect(data!.some((t) => t.visibility === 'internal')).toBe(true)
  })
  it('only CEO, finance and admin see commercials', async () => {
    expect((await sahil.from('project_commercials').select('project_id')).data).toHaveLength(0)
    expect((await rahul.from('project_commercials').select('project_id')).data).toHaveLength(0)
    expect((await finance.from('project_commercials').select('project_id')).data!.length).toBeGreaterThan(0)
  })
  it('a staff comment on an internal task is forced internal', async () => {
    const { data: task } = await sahil.from('tasks').select('id').eq('visibility', 'internal').limit(1).single()
    const { data: me } = await sahil.auth.getUser()
    const { data } = await sahil.from('comments').insert({ customer_id: nesma, entity_type: 'task', entity_id: task!.id, author_id: me.user!.id, body: 'note', visibility: 'shared' }).select('visibility').single()
    expect(data!.visibility).toBe('internal')
  })
})

describe('anonymous callers', () => {
  it('see nothing', async () => {
    const anon = createClient(url, anonKey, opts)
    for (const table of CUSTOMER_TABLES) {
      const { data } = await anon.from(table).select('*')
      expect(data ?? []).toHaveLength(0)
    }
    expect((await anon.rpc('decide_approval', { p_approval: '00000000-0000-0000-0000-000000000000', p_decision: 'approved' })).error).not.toBeNull()
  })
})

// ---------------------------------------------------------------- MVP completion: meetings, forms, mentions, versions, playbook
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id
const idOf = async (email: string) => (await service.from('profiles').select('id').eq('email', email).single()).data!.id
const notificationsFor = async (email: string, kind: string) =>
  (await service.from('notifications').select('title, kind').eq('user_id', await idOf(email)).eq('kind', kind)).data ?? []

describe('meetings and action lines', () => {
  it('customers see action lines of shared meetings only, and cannot add them', async () => {
    const { data: internal } = await service.from('meetings').select('id').eq('customer_id', nesma).eq('visibility', 'internal').single()
    await service.from('meeting_actions').insert({ meeting_id: internal!.id, customer_id: nesma, text: 'Internal follow-up' })
    const { data } = await michel.from('meeting_actions').select('text')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.some((a) => a.text === 'Internal follow-up')).toBe(false)
    const { data: shared } = await service.from('meetings').select('id').eq('customer_id', nesma).eq('visibility', 'shared').single()
    expect((await omar.from('meeting_actions').insert({ meeting_id: shared!.id, customer_id: nesma, text: 'Sneaky' })).error).not.toBeNull()
  })

  it('an action line becomes a plan task in one call, once', async () => {
    const { data: a } = await service.from('meeting_actions').select('id').eq('text', 'Share the region master file').single()
    const first = await rahul.rpc('create_task_from_meeting_action', { p_action: a!.id })
    const again = await rahul.rpc('create_task_from_meeting_action', { p_action: a!.id })
    expect(first.error).toBeNull()
    expect(again.data).toBe(first.data)
    const { data: task } = await service.from('tasks').select('owner_side, visibility, phase_id').eq('id', first.data!).single()
    expect(task).toMatchObject({ owner_side: 'customer', visibility: 'shared' })
    expect(task!.phase_id).not.toBeNull()
    // a customer-owned shared task lands on Omar's home page
    expect((await omar.from('action_items').select('id').eq('task_id', first.data!)).data).toHaveLength(1)
    expect((await omar.rpc('create_task_from_meeting_action', { p_action: a!.id })).error).not.toBeNull()
  })
})

describe('@mentions', () => {
  it('notify people who can read the comment and drop everyone else', async () => {
    const { data: task } = await service.from('tasks').select('id').eq('title', 'Data mapping').single()
    const [mi, cl, sa] = await Promise.all([idOf('michel@nesma.example.com'), idOf('lead@cbd.example.com'), idOf('sahil@example.com')])
    const { data: internal } = await rahul.from('comments').insert({ customer_id: nesma, entity_type: 'task', entity_id: task!.id, author_id: await uid(rahul),
      body: 'internal @Michel @Sahil', visibility: 'internal', mentions: [mi, sa, cl] }).select('mentions').single()
    expect(internal!.mentions).toEqual([sa])                      // customer and other-company mentions removed
    const { data: shared } = await rahul.from('comments').insert({ customer_id: nesma, entity_type: 'task', entity_id: task!.id, author_id: await uid(rahul),
      body: 'shared @Michel', visibility: 'shared', mentions: [mi, cl] }).select('mentions').single()
    expect(shared!.mentions).toEqual([mi])
    expect((await notificationsFor('michel@nesma.example.com', 'comment.mention')).length).toBe(1)
    expect(await notificationsFor('lead@cbd.example.com', 'comment.mention')).toHaveLength(0)
  })
})

describe('forms', () => {
  it('a customer submits only for their own company, and UAT issues become a tracked bug', async () => {
    const { data: cbdProject } = await service.from('projects').select('id').eq('customer_id', cbd).limit(1).single()
    expect((await omar.from('form_submissions').insert({ customer_id: cbd, project_id: cbdProject!.id, form_key: 'uat_feedback', submitted_by: await uid(omar), answers: {} })).error).not.toBeNull()
    const { data: pbi } = await service.from('projects').select('id').eq('name', 'Power BI Implementation').single()
    const res = await omar.from('form_submissions').insert({ customer_id: nesma, project_id: pbi!.id, form_key: 'uat_feedback', submitted_by: await uid(omar),
      answers: { outcome: 'issues', issues: 'Totals differ from SAP for March', severity: 'blocking', tested_by: 'Omar' } })
    expect(res.error).toBeNull()
    const { data: bug } = await service.from('requests').select('type, priority').eq('what', 'Totals differ from SAP for March').single()
    expect(bug).toMatchObject({ type: 'bug', priority: 'critical' })
    expect((await omar.from('form_submissions').update({ answers: {} }).eq('customer_id', nesma).select()).data ?? []).toHaveLength(0)
  })
})

describe('document versions', () => {
  it('customers cannot version internal documents', async () => {
    const { data: doc } = await service.from('documents').select('id').eq('visibility', 'internal').eq('customer_id', nesma).limit(1).single()
    const { error } = await michel.rpc('add_document_version', { p_document: doc!.id, p_path: `${nesma}/${doc!.id}/x.pdf`, p_name: 'x.pdf' })
    expect(error).not.toBeNull()
  })
  it('a new version keeps the previous file in history', async () => {
    const { data: doc } = await service.from('documents').insert({ customer_id: nesma, name: 'Spec.pdf', storage_path: `${nesma}/00000000-0000-0000-0000-00000000aaaa/spec.pdf`, visibility: 'shared' }).select('id').single()
    const v = await rahul.rpc('add_document_version', { p_document: doc!.id, p_path: `${nesma}/${doc!.id}/spec-v2.pdf`, p_name: 'spec-v2.pdf' })
    expect(v.data).toBe(2)
    expect((await michel.from('document_versions').select('version').eq('document_id', doc!.id)).data).toEqual([{ version: 1 }])
    expect((await cbdLead.from('document_versions').select('version').eq('document_id', doc!.id)).data).toHaveLength(0)
  })
})

describe('playbook automations', () => {
  it('rule 1: kickoff submitted → data access form for the customer lead', async () => {
    const { data } = await service.from('action_items').select('form_key, assignee_id').eq('customer_id', nesma).eq('form_key', 'data_access')
    expect(data).toHaveLength(1)
    expect(data![0]!.assignee_id).toBe(await idOf('michel@nesma.example.com'))
  })
  it('rules 2 and 3: UAT starts → feedback request; UAT tasks done → sign-off approval', async () => {
    const { data: fixes } = await service.from('tasks').select('id').eq('title', 'Fixes').single()
    await rahul.from('tasks').update({ status: 'in_progress' }).eq('id', fixes!.id)
    expect((await michel.from('action_items').select('form_key').eq('type', 'uat')).data).toEqual([{ form_key: 'uat_feedback' }])
    await rahul.from('tasks').update({ status: 'done' }).eq('id', fixes!.id)
    const { data: approval } = await michel.from('approvals').select('kind, status, approver_id').eq('kind', 'uat_signoff').single()
    expect(approval).toMatchObject({ status: 'pending', approver_id: await idOf('michel@nesma.example.com') })
  })
  it('rule 4: At Risk notifies the CEO', async () => {
    const { data: pbi } = await service.from('projects').select('id').eq('name', 'Power BI Implementation').single()
    await rahul.from('projects').update({ health: 'at_risk' }).eq('id', pbi!.id)
    expect((await notificationsFor('abhijit@example.com', 'project.at_risk')).length).toBe(1)
  })
  it('rule 5: a critical request notifies the account owner', async () => {
    await michel.from('requests').insert({ customer_id: nesma, title: 'Dashboard down', what: 'Nothing loads', priority: 'critical', requested_by: await uid(michel) })
    expect((await notificationsFor('abhijit@example.com', 'request.critical')).filter((n) => n.title.includes('Dashboard down'))).toHaveLength(1)
  })
  it('rules can be switched off by an admin only', async () => {
    const { data: org } = await service.from('orgs').select('id').single()
    expect((await finance.from('automation_rules').upsert({ org_id: org!.id, key: 'closure_form', enabled: false })).error).not.toBeNull()
    const admin = await as('admin@example.com')
    expect((await admin.from('automation_rules').upsert({ org_id: org!.id, key: 'closure_form', enabled: false })).error).toBeNull()
    const { data: cx } = await service.from('projects').select('id').eq('name', 'Support Engagement').single()
    await service.from('projects').update({ customer_lead_id: await idOf('lead@cbd.example.com') }).eq('id', cx!.id)  // any lead; the rule is off
    await rahul.from('projects').update({ status: 'completed' }).eq('id', cx!.id)
    expect((await service.from('action_items').select('id').eq('project_id', cx!.id).eq('form_key', 'closure')).data).toHaveLength(0)
    await admin.from('automation_rules').upsert({ org_id: org!.id, key: 'closure_form', enabled: true })
  })
  it('rule 6: closing a project sends the closure form', async () => {
    const { data: pbi } = await service.from('projects').select('id').eq('name', 'Power BI Implementation').single()
    await rahul.from('projects').update({ status: 'completed' }).eq('id', pbi!.id)
    expect((await michel.from('action_items').select('form_key').eq('form_key', 'closure')).data).toHaveLength(1)
  })
})

describe('CSAT and feedback', () => {
  it('customers see only the surveys sent to them and cannot write surveys directly', async () => {
    const mi = await idOf('michel@nesma.example.com')
    const { data } = await michel.from('csat_surveys').select('recipient_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => r.recipient_id === mi)).toBe(true)
    expect((await michel.from('csat_surveys').insert({ customer_id: nesma, kind: 'pulse', recipient_id: mi, score: 5, answered_at: new Date().toISOString() })).error).not.toBeNull()
    expect((await michel.from('csat_surveys').update({ score: 5 }).eq('recipient_id', mi).select()).data ?? []).toHaveLength(0)
  })

  it('a delivered request asks its requester, who can answer once', async () => {
    const { data: s } = await omar.from('csat_surveys').select('id').eq('kind', 'request').is('answered_at', null).single()
    expect((await michel.rpc('answer_csat', { p_survey: s!.id, p_score: 5 })).error).not.toBeNull()   // not Michel's survey
    expect((await omar.rpc('answer_csat', { p_survey: s!.id, p_score: 4, p_comment: 'Quick turnaround' })).error).toBeNull()
    expect((await omar.rpc('answer_csat', { p_survey: s!.id, p_score: 1 })).error?.message).toMatch(/already answered/)
  })

  it('a low score opens a follow-up and alerts the account owner', async () => {
    const { data: s } = await michel.from('csat_surveys').select('id').eq('kind', 'pulse').is('answered_at', null).single()
    await michel.rpc('answer_csat', { p_survey: s!.id, p_score: 2, p_comment: 'Too slow this month' })
    const { data: fb } = await service.from('feedback').select('kind, source, status, owner_id').eq('csat_id', s!.id).single()
    expect(fb).toMatchObject({ kind: 'issue', source: 'csat', status: 'new', owner_id: await idOf('abhijit@example.com') })
    expect((await notificationsFor('abhijit@example.com', 'csat.low')).length).toBe(1)
  })

  it('monthly pulses are sent once per month and only by the server', async () => {
    expect((await service.rpc('send_csat_pulses')).data).toBe(0)       // the seed already sent this month's
    expect((await rahul.rpc('send_csat_pulses')).error).not.toBeNull()
  })

  it('customers send feedback for their own company only, and cannot triage it', async () => {
    const me = await uid(omar)
    expect((await omar.from('feedback').insert({ customer_id: cbd, kind: 'issue', body: 'x', submitted_by: me })).error).not.toBeNull()
    expect((await omar.from('feedback').insert({ customer_id: nesma, kind: 'issue', body: 'Closed myself', submitted_by: me, status: 'closed' })).error).not.toBeNull()
    const { data: f, error } = await omar.from('feedback').insert({ customer_id: nesma, kind: 'issue', body: 'Report is slow on Mondays', submitted_by: me }).select('id').single()
    expect(error).toBeNull()
    expect((await omar.from('feedback').update({ status: 'closed' }).eq('id', f!.id).select()).data ?? []).toHaveLength(0)
    expect((await cbdLead.from('feedback').select('id').eq('id', f!.id)).data).toHaveLength(0)
    // the account owner owns it, and a staff status change tells the customer
    expect((await service.from('feedback').select('owner_id').eq('id', f!.id).single()).data!.owner_id).toBe(await idOf('abhijit@example.com'))
    await rahul.from('feedback').update({ status: 'actioned' }).eq('id', f!.id)
    expect((await notificationsFor('omar@nesma.example.com', 'feedback.status')).length).toBeGreaterThan(0)
  })

  it('the closure form satisfaction answer counts as CSAT', async () => {
    const { data: cx } = await service.from('projects').select('id').eq('name', 'Infor LN Integration').maybeSingle()
    const project = cx ?? (await service.from('projects').select('id').eq('customer_id', nesma).limit(1).single()).data
    await michel.from('form_submissions').insert({ customer_id: nesma, project_id: project!.id, form_key: 'closure', submitted_by: await uid(michel),
      answers: { handover: 'yes', training: 'yes', satisfaction: '5' } })
    const { data } = await michel.from('csat_surveys').select('score').eq('kind', 'closure')
    expect(data).toEqual([{ score: 5 }])
  })
})

// ---------------------------------------------------------------- field-level security
const HIDDEN: Record<string, string[]> = {
  profiles: ['email', 'org_id', 'internal_role', 'customer_role', 'can_view_invoices'],
  customers: ['org_id', 'hubspot_company_id', 'zoho_customer_id', 'account_owner_id'],
  projects: ['template_key', 'hubspot_deal_id'],
}

describe('restricted fields are never returned', () => {
  it.each(Object.entries(HIDDEN))('%s: hidden columns are refused for every signed-in user', async (table, cols) => {
    for (const c of [michel, omar, sahil]) {
      for (const col of cols) expect((await c.from(table).select(col)).error?.message).toMatch(/permission denied/)
      expect((await c.from(table).select('*')).error?.message).toMatch(/permission denied/)
    }
  })

  it('names and links still work for customers', async () => {
    const { data, error } = await omar.from('projects').select('id, name, customers(name), pm:profiles!projects_pm_id_fkey(full_name)')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((p) => (p.pm as unknown as { full_name: string } | null)?.full_name)).toBe(true)
  })

  it('the staff-only views return nothing to customers and everything to staff', async () => {
    for (const view of ['directory', 'customers_internal', 'projects_internal']) {
      expect((await michel.from(view).select('*')).data).toHaveLength(0)
      expect((await sahil.from(view).select('*')).data!.length).toBeGreaterThan(0)
    }
    expect((await cbdLead.from('directory').select('email')).data).toHaveLength(0)
  })

  it('each person reads only their own full profile', async () => {
    const { data } = await omar.rpc('get_my_profile')
    expect(data).toMatchObject({ email: 'omar@nesma.example.com', customer_role: 'customer_member' })
  })

  it('a low-CSAT follow-up and its replies stay private to the person who scored', async () => {
    const { data: fb } = await service.from('feedback').select('id').eq('source', 'csat').eq('customer_id', nesma).limit(1).maybeSingle()
    if (fb) {
      await service.from('comments').insert({ customer_id: nesma, entity_type: 'feedback', entity_id: fb.id, author_id: await idOf('rahul@example.com'), body: 'Sorry, calling you today', visibility: 'shared' })
      const scorer = (await service.from('feedback').select('submitted_by').eq('id', fb.id).single()).data!.submitted_by
      const other = scorer === (await idOf('michel@nesma.example.com')) ? omar : michel
      expect((await other.from('feedback').select('id').eq('id', fb.id)).data).toHaveLength(0)
      expect((await other.from('comments').select('id').eq('entity_id', fb.id)).data).toHaveLength(0)
    }
  })

  it('form answers are visible to the submitter and executives, not to other team members', async () => {
    const { data: pbi } = await service.from('projects').select('id').eq('name', 'Power BI Implementation').single()
    const { data: sub } = await omar.from('form_submissions').insert({ customer_id: nesma, project_id: pbi!.id, form_key: 'data_access', submitted_by: await uid(omar),
      answers: { systems: 'SAP', method: 'api', it_contact: 'IT desk' } }).select('id').single()
    expect((await michel.from('form_submissions').select('id').eq('id', sub!.id)).data).toHaveLength(1)   // executive
    // Michel's kickoff answers are not visible to Omar
    const { data: kickoff } = await service.from('form_submissions').select('id').eq('form_key', 'kickoff').eq('customer_id', nesma).single()
    expect((await omar.from('form_submissions').select('id').eq('id', kickoff!.id)).data).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- go-live security
describe('staff two-step sign-in', () => {
  it('a staff session without the authenticator code sees no staff data', async () => {
    const plain = await as('sahil@example.com', { mfa: false })
    expect((await plain.from('tasks').select('id').eq('visibility', 'internal')).data).toHaveLength(0)
    expect((await plain.from('directory').select('id')).data).toHaveLength(0)
    expect((await plain.from('customers').select('id')).data).toHaveLength(0)
    // and the same person after two-step sign-in does
    expect((await sahil.from('tasks').select('id').eq('visibility', 'internal')).data!.length).toBeGreaterThan(0)
  })
})

describe('instant access removal', () => {
  it('a removed user loses everything on their next request, and is restored cleanly', async () => {
    const before = (await omar.from('projects').select('id')).data!.length
    expect(before).toBeGreaterThan(0)
    const id = await idOf('omar@nesma.example.com')
    expect((await service.rpc('set_access', { p_user: id, p_revoked: true })).error).toBeNull()
    expect((await omar.from('projects').select('id')).data).toHaveLength(0)        // same, still-valid token
    expect((await omar.rpc('get_my_profile')).data?.id ?? null).toBeNull()
    await service.rpc('set_access', { p_user: id, p_revoked: false })
    expect((await omar.from('projects').select('id')).data!.length).toBe(before)
  })
  it('only the server can remove access', async () => {
    expect((await rahul.rpc('set_access', { p_user: await idOf('omar@nesma.example.com'), p_revoked: true })).error).not.toBeNull()
  })
})

describe('file controls', () => {
  it('a new file always starts unchecked, whatever the uploader claims', async () => {
    const id = crypto.randomUUID()
    const { data } = await rahul.from('documents').insert({ id, customer_id: nesma, name: 'x.pdf', storage_path: `${nesma}/${id}/x.pdf`, visibility: 'shared', scan_status: 'clean' }).select('scan_status').single()
    expect(data!.scan_status).toBe('pending')
    expect((await rahul.from('documents').update({ scan_status: 'clean' }).eq('id', id).select('scan_status').single()).data!.scan_status).toBe('pending')
  })
  it('customers do not see archived or blocked files, and cannot archive', async () => {
    const fid = crypto.randomUUID()
    const { data: doc } = await service.from('documents').insert({ id: fid, customer_id: nesma, name: 'plan.pdf', storage_path: `${nesma}/${fid}/plan.pdf`, visibility: 'shared', scan_status: 'clean' }).select('id').single()
    expect((await michel.rpc('archive_document', { p_document: doc!.id, p_archive: true })).error).not.toBeNull()
    expect((await rahul.rpc('archive_document', { p_document: doc!.id, p_archive: true })).error).toBeNull()
    expect((await michel.from('documents').select('id').eq('id', doc!.id)).data).toHaveLength(0)
    await rahul.rpc('archive_document', { p_document: doc!.id, p_archive: false })
    expect((await michel.from('documents').select('id').eq('id', doc!.id)).data).toHaveLength(1)
    await service.from('documents').update({ scan_status: 'infected' }).eq('id', doc!.id)
    expect((await michel.from('documents').select('id').eq('id', doc!.id)).data).toHaveLength(0)
    await service.from('documents').update({ scan_status: 'clean' }).eq('id', doc!.id)
  })
  it('storage refuses file types outside the allowlist', async () => {
    const { error } = await michel.storage.from('documents').upload(`${nesma}/${crypto.randomUUID()}/setup.exe`, new Blob(['MZ'], { type: 'application/x-msdownload' }), { contentType: 'application/x-msdownload' })
    expect(error).not.toBeNull()
    const ok = await michel.storage.from('documents').upload(`${nesma}/${crypto.randomUUID()}/brief.pdf`, new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
    expect(ok.error).toBeNull()
  })
})
