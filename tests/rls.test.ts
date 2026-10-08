// Security tests: sign in as each kind of user against a local Supabase and prove what they can and cannot do.
// Run: npm run test:db   (needs `supabase start`; reseeds the local database first)
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as OTPAuth from 'otpauth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyPlan } from '@/lib/backfill-apply'
import { planImport } from '@/lib/backfill-plan'
import type { Database } from '@/lib/database.types'

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
const STAFF_ONLY = ['project_commercials', 'task_estimates', 'time_entries', 'automation_rules', 'customer_contacts', 'project_deals']
const SERVICE_ONLY = ['email_outbox', 'integration_events']

// the CEO signs in once: a second sign-in cannot enrol another authenticator without the first
let ceoClient: Promise<SupabaseClient> | undefined
const asCeo = () => (ceoClient ??= as('abhijit@example.com'))

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

  it('Zoho invoices and payments are for admin, CEO and finance, not PMs or consultants', async () => {
    expect((await finance.from('invoices').select('id')).data!.length).toBeGreaterThan(0)
    for (const c of [rahul, sahil]) {
      expect((await c.from('invoices').select('id')).data).toHaveLength(0)
      expect((await c.from('payments').select('id')).data).toHaveLength(0)
    }
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

describe('assigning tasks', () => {
  it('a PM hands a task to a consultant, who is told; a customer task follows its owner and closes when it comes back', async () => {
    const { data: t } = await service.from('tasks').select('id, project_id').eq('title', 'Wireframes').single()
    const before = (await notificationsFor('sahil@example.com', 'task.assigned')).length
    expect((await rahul.from('tasks').update({ assignee_id: await idOf('sahil@example.com'), owner_side: 'seven_billion' }).eq('id', t!.id)).error).toBeNull()
    expect((await notificationsFor('sahil@example.com', 'task.assigned')).length).toBe(before + 1)
    expect((await sahil.from('tasks').select('id').eq('id', t!.id).eq('assignee_id', await uid(sahil))).data).toHaveLength(1)

    // to the customer: it lands on their home page; to a colleague: the action moves; back to us: it closes
    await rahul.from('tasks').update({ assignee_id: await idOf('omar@nesma.example.com'), owner_side: 'customer' }).eq('id', t!.id)
    expect((await omar.from('action_items').select('id').eq('task_id', t!.id).eq('status', 'open')).data).toHaveLength(1)
    await rahul.from('tasks').update({ assignee_id: await idOf('michel@nesma.example.com') }).eq('id', t!.id)
    const open = (await service.from('action_items').select('assignee_id').eq('task_id', t!.id).eq('status', 'open')).data!
    expect(open).toEqual([{ assignee_id: await idOf('michel@nesma.example.com') }])   // one open action, now Michel's
    await rahul.from('tasks').update({ assignee_id: await idOf('sahil@example.com'), owner_side: 'seven_billion' }).eq('id', t!.id)
    expect((await service.from('action_items').select('id').eq('task_id', t!.id).eq('status', 'open')).data).toHaveLength(0)
    // customers cannot reassign Seven Billion's work
    expect((await omar.from('tasks').update({ assignee_id: await idOf('omar@nesma.example.com') }).eq('id', t!.id).select('id')).data ?? []).toHaveLength(0)
  })
})

describe('requests logged for a customer, and requests that become tasks', () => {
  let reqId: string
  it('a PM logs a request on behalf of a customer person: it is theirs, they are told, and nobody can fake who logged it', async () => {
    const omarId = await idOf('omar@nesma.example.com'), rahulId = await idOf('rahul@example.com')
    const { data, error } = await rahul.from('requests')
      .insert({ customer_id: nesma, title: 'Add a weekly stock email', what: 'Asked on the Monday call', requested_by: omarId, raised_by: rahulId })
      .select('id').single()
    expect(error).toBeNull()
    reqId = data!.id
    expect((await omar.from('requests').select('id').eq('id', reqId)).data).toHaveLength(1)                    // in their portal
    expect((await notificationsFor('omar@nesma.example.com', 'request.logged')).length).toBeGreaterThan(0)       // and they were told
    const { data: ev } = await omar.from('request_events').select('note').eq('request_id', reqId)
    expect(ev![0]!.note).toMatch(/^Logged by Rahul on behalf of Omar/)
    // a customer cannot claim Seven Billion logged it; staff log only as themselves; the requester must be at that customer
    expect((await omar.from('requests').insert({ customer_id: nesma, title: 'Fake', what: 'x', requested_by: omarId, raised_by: rahulId })).error).not.toBeNull()
    expect((await sahil.from('requests').insert({ customer_id: nesma, title: 'As Rahul', what: 'x', raised_by: rahulId })).error).not.toBeNull()
    expect((await rahul.from('requests').insert({ customer_id: nesma, title: 'Wrong customer', what: 'x', requested_by: await idOf('lead@cbd.example.com'), raised_by: rahulId })).error).not.toBeNull()
  })

  it('a request becomes a shared task the customer sees, or an internal one they do not', async () => {
    const project = (await service.from('projects').select('id').eq('name', 'Power BI Implementation').single()).data!.id
    expect((await omar.rpc('request_to_task', { p_request: reqId, p_project: project })).error).not.toBeNull()   // staff only
    expect((await rahul.rpc('request_to_task', { p_request: reqId })).error?.message).toMatch(/choose the project/)
    const internal = await rahul.rpc('request_to_task', { p_request: reqId, p_project: project, p_shared: false, p_assignee: await idOf('sahil@example.com') })
    expect(internal.error).toBeNull()
    expect((await omar.from('tasks').select('id').eq('id', internal.data!)).data).toHaveLength(0)
    expect((await service.from('requests').select('status').eq('id', reqId).single()).data!.status).toBe('submitted')
    // putting it on the plan again shares the same task rather than adding another
    const shared = await rahul.rpc('request_to_task', { p_request: reqId, p_shared: true, p_estimate: 2, p_unit: 'day' })
    expect(shared.error).toBeNull()
    expect(shared.data).toBe(internal.data)
    expect((await rahul.rpc('request_to_task', { p_request: reqId, p_shared: true })).error?.message).toMatch(/already on the plan/)
    const { data: t } = await omar.from('tasks').select('title, request_id, visibility').eq('id', shared.data!).single()
    expect(t).toMatchObject({ request_id: reqId, visibility: 'shared' })
    expect(t!.title).toMatch(/^REQ-\d+ Add a weekly stock email$/)
    expect((await service.from('requests').select('status, project_id').eq('id', reqId).single()).data).toEqual({ status: 'scheduled', project_id: project })
    expect((await service.from('task_estimates').select('estimate, unit').eq('task_id', shared.data!).single()).data).toEqual({ estimate: 2, unit: 'day' })
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

describe('billing: rate cards and statements', () => {
  let project: string, card: string
  const lines = [
    { p_kind: 'day_rate', p_label: 'Data engineer', p_unit: 'day', p_rate: 100, p_planned: 2 },
    { p_kind: 'delivery', p_label: 'Sales dashboard', p_unit: 'delivery', p_rate: 500 },
    { p_kind: 'unit', p_label: 'Monthly report', p_unit: 'report', p_rate: 50, p_planned: 4 },
    { p_kind: 'retainer', p_label: 'Support retainer', p_unit: 'month', p_rate: 300 },
  ]

  beforeAll(async () => {
    const { data } = await service.from('projects').select('id').eq('name', 'Management Reporting').single()
    project = data!.id
  })

  it('finance prepares the rate card; the PM, consultants and customers cannot change it', async () => {
    const { data: id, error } = await finance.rpc('start_rate_card', { p_project: project })
    expect(error).toBeNull()
    card = id as string
    for (const l of lines) expect((await finance.rpc('add_rate_card_line', { p_card: card, ...l })).error).toBeNull()
    expect((await rahul.rpc('add_rate_card_line', { p_card: card, ...lines[0] })).error?.message).toMatch(/not allowed/)
    expect((await rahul.from('rate_card_lines').select('id').eq('rate_card_id', card)).data).toHaveLength(0)   // not even the project's PM
    expect((await rahul.from('rate_cards').select('id').eq('id', card)).data).toHaveLength(0)
    expect((await sahil.from('rate_cards').select('id').eq('id', card)).data).toHaveLength(0)                  // a consultant cannot
    expect((await michel.from('rate_cards').select('id').eq('id', card)).data).toHaveLength(0)                 // drafts stay internal
    expect((await michel.rpc('add_rate_card_line', { p_card: card, ...lines[0] })).error?.message).toMatch(/not allowed/)
  })

  it('effort is estimated in the rate card units: the PM gets the units, never the rates', async () => {
    const { data, error } = await rahul.rpc('effort_units', { p_project: project })
    expect(error).toBeNull()
    expect(data).toEqual(['day', 'delivery', 'report'])                            // day rate and retainer are both days
    expect((await michel.rpc('effort_units', { p_project: project })).data).toEqual(['day'])   // customers learn nothing
    const other = (await service.from('projects').select('id').eq('name', 'Infor LN Integration').single()).data!.id
    expect((await rahul.rpc('effort_units', { p_project: other })).data).toEqual(['day'])      // no rate card yet: days
  })

  it('only billing contacts of that customer see a submitted card, and nobody can approve it by a direct update', async () => {
    expect((await finance.rpc('submit_rate_card', { p_card: card })).error).toBeNull()
    expect((await michel.from('rate_card_lines').select('rate').eq('rate_card_id', card)).data).toHaveLength(4)
    expect((await omar.from('rate_cards').select('id').eq('id', card)).data).toHaveLength(0)       // member without invoice access
    expect((await cbdLead.from('rate_cards').select('id').eq('id', card)).data).toHaveLength(0)    // another customer
    expect((await michel.from('rate_cards').update({ status: 'approved' } as never).eq('id', card)).error).not.toBeNull()
    expect((await finance.from('rate_cards').update({ status: 'approved' } as never).eq('id', card)).error).not.toBeNull()
    // rates are frozen while the customer is looking at them
    await finance.from('rate_card_lines').update({ rate: 1 }).eq('rate_card_id', card)
    const { data } = await service.from('rate_card_lines').select('rate').eq('rate_card_id', card).eq('kind', 'day_rate').single()
    expect(Number(data!.rate)).toBe(100)
  })

  it('asking for changes needs a reason; the card then goes back to finance and on to approval', async () => {
    expect((await michel.rpc('decide_rate_card', { p_card: card, p_approve: false })).error?.message).toMatch(/please say what should change/)
    expect((await omar.rpc('decide_rate_card', { p_card: card, p_approve: true })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('decide_rate_card', { p_card: card, p_approve: false, p_note: 'Engineer rate per the SOW is 90' })).error).toBeNull()
    expect((await finance.from('rate_card_lines').update({ rate: 90 }).eq('rate_card_id', card).eq('kind', 'day_rate')).error).toBeNull()
    expect((await finance.rpc('submit_rate_card', { p_card: card })).error).toBeNull()
    expect((await michel.rpc('decide_rate_card', { p_card: card, p_approve: true })).error).toBeNull()
    const { data } = await service.from('rate_cards').select('status, decided_by').eq('id', card).single()
    expect(data!.status).toBe('approved')
    const { count } = await service.from('notifications').select('id', { count: 'exact', head: true }).eq('kind', 'billing')
    expect(count).toBeGreaterThan(0)
  })

  it('finance bills a period on the approved rates and cannot change a rate; the PM cannot bill', async () => {
    expect((await rahul.rpc('create_statement', { p_project: project, p_start: '2026-09-01', p_end: '2026-09-30' })).error?.message).toMatch(/not allowed/)
    const { data: id, error } = await finance.rpc('create_statement', { p_project: project, p_start: '2026-09-01', p_end: '2026-09-30' })
    expect(error).toBeNull()
    const st = id as string
    const { data: ls } = await finance.from('statement_lines').select('id, kind, rate, quantity, amount').eq('statement_id', st)
    const day = ls!.find((l) => l.kind === 'day_rate')!
    expect(Number(day.rate)).toBe(90)                       // the approved rate, not the first draft
    expect(Number(day.quantity)).toBe(2 * 22)               // 2 resources x 22 working days in September 2026
    expect(Number(ls!.find((l) => l.kind === 'retainer')!.quantity)).toBe(1)
    expect((await finance.from('statement_lines').update({ rate: 1 } as never).eq('id', day.id)).error).not.toBeNull()
    expect((await finance.from('statement_lines').update({ quantity: 40 }).eq('id', day.id)).error).toBeNull()
    expect((await rahul.from('statement_lines').select('id').eq('statement_id', st)).data).toHaveLength(0)
    expect((await sahil.rpc('create_statement', { p_project: project, p_start: '2026-10-01', p_end: '2026-10-31' })).error?.message).toMatch(/not allowed/)
    expect((await michel.from('billing_statements').select('id').eq('id', st)).data).toHaveLength(0)   // still a draft

    expect((await rahul.rpc('submit_statement', { p_statement: st })).error?.message).toMatch(/not allowed/)
    expect((await finance.rpc('submit_statement', { p_statement: st })).error).toBeNull()
    expect((await finance.from('statement_lines').update({ quantity: 99 }).eq('id', day.id)).error).toBeNull()  // ignored: no longer editable
    const after = await service.from('statement_lines').select('quantity, amount').eq('id', day.id).single()
    expect(Number(after.data!.quantity)).toBe(40)
    expect(Number(after.data!.amount)).toBe(3600)
    expect((await michel.from('statement_lines').select('id').eq('statement_id', st)).data).toHaveLength(4)
    expect((await omar.from('billing_statements').select('id').eq('id', st)).data).toHaveLength(0)
    expect((await michel.rpc('decide_statement', { p_statement: st, p_approve: true })).error).toBeNull()
    expect((await service.from('billing_statements').select('status').eq('id', st).single()).data!.status).toBe('approved')
    expect((await michel.rpc('decide_statement', { p_statement: st, p_approve: true })).error?.message).toMatch(/no longer pending/)
  })

  it('a revision copies the lines and replaces the live card only once approved', async () => {
    const { data: v2 } = await finance.rpc('start_rate_card', { p_project: project })
    expect((await finance.rpc('start_rate_card', { p_project: project })).error?.message).toMatch(/already being prepared/)
    expect((await finance.from('rate_card_lines').select('id').eq('rate_card_id', v2 as string)).data).toHaveLength(4)
    expect((await service.from('rate_cards').select('status').eq('id', card).single()).data!.status).toBe('approved')
    await finance.rpc('submit_rate_card', { p_card: v2 as string })
    await michel.rpc('decide_rate_card', { p_card: v2 as string, p_approve: true })
    expect((await service.from('rate_cards').select('status').eq('id', card).single()).data!.status).toBe('superseded')
    expect((await service.from('rate_cards').select('status, version').eq('id', v2 as string).single()).data).toMatchObject({ status: 'approved', version: 2 })
  })
})

describe('import from HubSpot and Zoho', () => {
  const deals = [
    { id: 'hs-1', name: 'Acme Foods BI Data Eng October (TEST/25-26/10)', stageId: 'won', stageLabel: 'Closed Won', closeDate: '2025-11-01T00:00:00Z', createDate: '2025-10-01T00:00:00Z', companyId: 'co-acme', companyName: 'Acme Foods' },
    { id: 'hs-2', name: 'Acme Foods BI Data Eng November (TEST/25-26/12)', stageId: 'won', stageLabel: 'Closed Won', closeDate: '2025-12-05T00:00:00Z', createDate: '2025-11-01T00:00:00Z', companyId: 'co-acme', companyName: 'Acme Foods' },
    { id: 'hs-3', name: 'CEO Dashboard', stageId: 'won', stageLabel: 'Closed Won', closeDate: '2026-09-01T00:00:00Z', createDate: '2026-08-01T00:00:00Z', companyId: 'co-acme', companyName: 'Acme Foods' },
  ]
  const invoices = [
    { number: 'TEST/25-26/10', customerId: 'z-acme', customerName: 'ACME FOODS PVT LTD' },
    { number: 'TEST/25-26/12', customerId: 'z-acme', customerName: 'ACME FOODS PVT LTD' },
  ]
  const contacts = [{ companyId: 'co-acme', hubspotId: 'ct-1', fullName: 'Asha Rao', email: 'asha@acme.example.com', phone: null, title: 'CFO' }]
  let orgId: string
  // what the Zoho sync does: invoices arrive for customers that carry their Zoho id
  const fakeSync = async () => {
    const { data: c } = await service.from('customers').select('id').eq('zoho_customer_id', 'z-acme').single()
    await service.from('invoices').upsert(invoices.map((i, n) => ({ customer_id: c!.id, zoho_invoice_id: `zi-${n}`, number: i.number, currency: 'INR', total: 1000, balance: 0, status: 'paid', issued_on: '2025-11-01' })), { onConflict: 'zoho_invoice_id' })
  }
  const plan = async (overrides?: Record<string, string>) => {
    const { data: existing } = await service.from('customers').select('id, name, zoho_customer_id, hubspot_company_id')
    return planImport({ deals, invoices, existing: existing!, activeStageIds: [], today: '2026-10-06', overrides })
  }

  beforeAll(async () => {
    orgId = (await service.from('orgs').select('id').limit(1).single()).data!.id
  })

  it('creates the customer, groups the deals into projects, links invoices and lists contacts to invite', async () => {
    const s = await applyPlan(service as unknown as SupabaseClient<Database>, await plan(), { orgId, contacts, syncInvoices: fakeSync })
    expect(s).toMatchObject({ customersCreated: 1, projectsCreated: 2, dealsLinked: 3, invoicesLinked: 2, contactsAdded: 1 })
    const { data: c } = await service.from('customers').select('id, name, zoho_customer_id, hubspot_company_id').eq('zoho_customer_id', 'z-acme').single()
    expect(c).toMatchObject({ name: 'ACME FOODS PVT LTD', hubspot_company_id: 'co-acme' })
    const { data: projects } = await service.from('projects').select('name, status, start_date, end_date').eq('customer_id', c!.id).order('name')
    expect(projects).toEqual([
      { name: 'BI Data Eng', status: 'completed', start_date: '2025-10-01', end_date: '2025-12-05' },
      { name: 'CEO Dashboard', status: 'active', start_date: '2026-08-01', end_date: '2026-09-01' },
    ])
    const { data: inv } = await service.from('invoices').select('project_id').eq('customer_id', c!.id)
    expect(inv!.every((i) => i.project_id)).toBe(true)
    // nobody was invited
    const { data: users } = await service.from('profiles').select('id').eq('customer_id', c!.id)
    expect(users).toHaveLength(0)
  })

  it('running it again adds nothing; renaming a deal in the preview moves it', async () => {
    const again = await applyPlan(service as unknown as SupabaseClient<Database>, await plan(), { orgId, contacts, syncInvoices: fakeSync })
    expect(again).toMatchObject({ customersCreated: 0, projectsCreated: 0, contactsAdded: 0 })
    const moved = await applyPlan(service as unknown as SupabaseClient<Database>, await plan({ 'hs-3': 'BI Data Eng' }), { orgId, contacts: null, syncInvoices: fakeSync })
    expect(moved.projectsCreated).toBe(0)
    expect(moved.notes.join(' ')).toMatch(/contacts\.read/)
    const { data: d } = await service.from('project_deals').select('project_id, projects(name)').eq('hubspot_deal_id', 'hs-3').single()
    expect((d!.projects as unknown as { name: string }).name).toBe('BI Data Eng')
  })

  it('deal history is for admin, CEO and finance; contacts are for staff, never customers', async () => {
    expect((await finance.from('project_deals').select('id')).data!.length).toBeGreaterThan(0)
    expect((await rahul.from('project_deals').select('id')).data).toHaveLength(0)
    expect((await rahul.from('customer_contacts').select('id')).data!.length).toBeGreaterThan(0)
    expect((await michel.from('customer_contacts').select('id')).data).toHaveLength(0)
  })
})

describe('approving for the customer', () => {
  it('finance, the CEO or an admin confirm rates for the customer; the PM and the customer cannot use it', async () => {
    const project = (await service.from('projects').select('id').eq('name', 'Management Reporting').single()).data!.id
    const { data: v3 } = await finance.rpc('start_rate_card', { p_project: project })
    const card = v3 as string
    expect((await rahul.rpc('approve_rate_card_for_customer', { p_card: card })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('approve_rate_card_for_customer', { p_card: card })).error?.message).toMatch(/not allowed/)
    // straight from the draft, without sending it to the customer first
    expect((await finance.rpc('approve_rate_card_for_customer', { p_card: card, p_note: 'Signed SOW, 7 Oct' })).error).toBeNull()
    const { data } = await service.from('rate_cards').select('status, approved_for_customer, decision_note').eq('id', card).single()
    expect(data).toMatchObject({ status: 'approved', approved_for_customer: true })
    expect(data!.decision_note).toMatch(/for the customer: Signed SOW, 7 Oct/)
    expect((await service.from('rate_cards').select('id').eq('project_id', project).eq('status', 'approved')).data).toHaveLength(1)
    expect((await finance.rpc('approve_rate_card_for_customer', { p_card: card })).error?.message).toMatch(/already decided/)
    // the customer's billing contact is told, as information rather than a task
    const { data: told } = await michel.from('notifications').select('title, needs_action').like('title', 'Rates confirmed%')
    expect(told!.length).toBe(1)
    expect(told![0]!.needs_action).toBe(false)
  })

  it('a statement can be approved for the customer from the draft; the PM cannot', async () => {
    const project = (await service.from('projects').select('id').eq('name', 'Management Reporting').single()).data!.id
    const { data: id } = await finance.rpc('create_statement', { p_project: project, p_start: '2026-10-01', p_end: '2026-10-31' })
    const st = id as string
    expect((await rahul.rpc('approve_statement_for_customer', { p_statement: st })).error?.message).toMatch(/not allowed/)
    expect((await finance.rpc('approve_statement_for_customer', { p_statement: st })).error).toBeNull()
    expect((await service.from('billing_statements').select('status, approved_for_customer').eq('id', st).single()).data)
      .toMatchObject({ status: 'approved', approved_for_customer: true })
    expect((await michel.from('notifications').select('id').like('title', 'Statement confirmed%')).data!.length).toBe(1)
  })

  it('the PM approves an estimate for the customer; a consultant and the customer cannot use it', async () => {
    const michelId = (await service.from('profiles').select('id').eq('email', 'michel@nesma.example.com').single()).data!.id
    const { data: req } = await service.from('requests').select('id, customer_id, project_id, number, title')
      .eq('customer_id', (await service.from('profiles').select('customer_id').eq('id', michelId).single()).data!.customer_id!)
      .not('project_id', 'is', null).limit(1).single()
    const { data: ap, error } = await service.from('approvals').insert({
      request_id: req!.id, customer_id: req!.customer_id, project_id: req!.project_id, kind: 'estimate', title: `Estimate for ${req!.number}`,
      summary: 'Two days', effort: 2, effort_unit: 'day', approver_id: michelId,
      requested_by: (await service.from('profiles').select('id').eq('email', 'rahul@example.com').single()).data!.id,
    }).select('id').single()
    expect(error).toBeNull()
    expect((await sahil.rpc('approve_for_customer', { p_approval: ap!.id })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('approve_for_customer', { p_approval: ap!.id })).error?.message).toMatch(/not allowed/)
    expect((await rahul.rpc('approve_for_customer', { p_approval: ap!.id, p_note: 'agreed on the call' })).error).toBeNull()
    expect((await service.from('approvals').select('status').eq('id', ap!.id).single()).data!.status).toBe('approved')
    const { data: ev } = await service.from('approval_events').select('action, comment').eq('approval_id', ap!.id).eq('action', 'approved').single()
    expect(ev!.comment).toMatch(/on behalf of .*Michel.*: agreed on the call/)
    // no open action left for the customer
    expect((await service.from('action_items').select('id').eq('approval_id', ap!.id).eq('status', 'open')).data).toHaveLength(0)
  })
})

describe('system health', () => {
  it('only admins and the CEO read the system log and job runs; nobody but the server writes them', async () => {
    const probe = `probe ${Date.now()}`   // the log is not reseeded between runs
    await service.from('system_log').insert({ source: 'test', message: probe })
    await service.from('job_runs').upsert({ job: 'test-job', last_ok_at: new Date().toISOString() })
    const ceo = await asCeo()
    expect((await ceo.from('system_log').select('id').eq('message', probe)).data).toHaveLength(1)
    expect((await ceo.from('job_runs').select('job').eq('job', 'test-job')).data).toHaveLength(1)
    expect((await ceo.rpc('outbox_health')).data).toHaveLength(1)
    for (const c of [rahul, sahil, finance, michel]) {
      expect((await c.from('system_log').select('id')).data ?? []).toHaveLength(0)
      expect((await c.from('job_runs').select('job')).data ?? []).toHaveLength(0)
      expect((await c.rpc('outbox_health')).data ?? []).toHaveLength(0)
    }
    expect((await ceo.from('system_log').insert({ source: 'x', message: 'y' })).error).not.toBeNull()
    expect((await ceo.from('system_log').delete().eq('source', 'test').select('id')).data ?? []).toHaveLength(0)
  })
})

describe('time to billing', () => {
  let project: string, task: string, sahilId: string, entries: string[], engineer: string, pmLine: string, st1: string, st2: string
  const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`

  beforeAll(async () => {
    project = (await service.from('projects').select('id').eq('name', 'Infor LN Integration').single()).data!.id
    task = (await service.from('tasks').select('id').eq('project_id', project).limit(1).single()).data!.id
    sahilId = (await service.from('profiles').select('id').eq('email', 'sahil@example.com').single()).data!.id
  })

  it('people log days unapproved; nobody approves their own days by writing the row', async () => {
    const rows = [2, 3, 4, 5].map((d) => ({ task_id: task, customer_id: nesma, user_id: sahilId, days: 1, worked_on: day(d), billable: d !== 5 }))
    const { data, error } = await sahil.from('time_entries').insert(rows).select('id')
    expect(error).toBeNull()
    entries = data!.map((r) => r.id)
    const sneaky = await sahil.from('time_entries').insert({ ...rows[0]!, approved_at: new Date().toISOString() }).select('id')
    expect(sneaky.error).not.toBeNull()
    expect((await sahil.from('time_entries').update({ approved_at: new Date().toISOString() } as never).eq('id', entries[0]!).select('id')).data ?? []).toHaveLength(0)
  })

  it('only the project PM, an admin or the CEO approve or return days; returning needs a note and tells the person', async () => {
    expect((await sahil.rpc('approve_time', { p_entries: entries })).error?.message).toMatch(/not allowed/)
    expect((await finance.rpc('approve_time', { p_entries: entries })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('approve_time', { p_entries: entries })).error).not.toBeNull()
    expect((await rahul.rpc('return_time', { p_entries: [entries[2]!], p_note: ' ' })).error?.message).toMatch(/say what should change/)
    expect((await rahul.rpc('return_time', { p_entries: [entries[2]!], p_note: 'Log the 4th on the reporting task' })).data).toBe(1)
    const { data: told } = await sahil.from('notifications').select('title, body, link, needs_action').eq('kind', 'time.returned')
    expect(told).toHaveLength(1)
    expect(told![0]).toMatchObject({ body: 'Log the 4th on the reporting task', link: '/my-work', needs_action: true })
    // a PM's own days go to an admin or the CEO
    const rahulId = (await service.from('profiles').select('id').eq('email', 'rahul@example.com').single()).data!.id
    const { data: own } = await rahul.from('time_entries').insert({ task_id: task, customer_id: nesma, user_id: rahulId, days: 1, worked_on: day(6), billable: true }).select('id').single()
    expect((await rahul.rpc('approve_time', { p_entries: [own!.id] })).error?.message).toMatch(/your own days are approved by an admin or the CEO/)
    expect((await (await asCeo()).rpc('approve_time', { p_entries: [own!.id] })).data).toBe(1)
    await service.from('time_entries').delete().eq('id', own!.id)
    expect((await rahul.rpc('approve_time', { p_entries: [entries[0]!, entries[1]!, entries[3]!] })).data).toBe(3)
    expect((await service.from('time_entries').select('approved_at').eq('id', entries[2]!).single()).data!.approved_at).toBeNull()
  })

  it('approved days are locked; a returned day can be deleted and logged again', async () => {
    expect((await sahil.from('time_entries').delete().eq('id', entries[0]!).select('id')).data ?? []).toHaveLength(0)
    expect((await sahil.from('time_entries').delete().eq('id', entries[2]!).select('id')).data).toHaveLength(1)
    const again = await sahil.from('time_entries').insert({ task_id: task, customer_id: nesma, user_id: sahilId, days: 0.5, worked_on: day(4), billable: true }).select('id').single()
    expect(again.error).toBeNull()
    entries[2] = again.data!.id
    expect((await rahul.rpc('approve_time', { p_entries: [entries[2]!] })).data).toBe(1)
  })

  it('finance names the people a day-rate line bills; nobody else can, and the customer never sees it', async () => {
    const { data: card } = await finance.rpc('start_rate_card', { p_project: project })
    await finance.rpc('add_rate_card_line', { p_card: card as string, p_kind: 'day_rate', p_label: 'Engineer', p_unit: 'day', p_rate: 100, p_planned: 1 })
    await finance.rpc('add_rate_card_line', { p_card: card as string, p_kind: 'day_rate', p_label: 'Project manager', p_unit: 'day', p_rate: 150, p_planned: 1 })
    const ls = (await finance.from('rate_card_lines').select('id, label').eq('rate_card_id', card as string)).data!
    engineer = ls.find((l) => l.label === 'Engineer')!.id
    pmLine = ls.find((l) => l.label === 'Project manager')!.id
    expect((await finance.rpc('approve_rate_card_for_customer', { p_card: card as string })).error).toBeNull()
    // the live card: allowed, since who a line covers is not a price
    expect((await rahul.rpc('set_line_people', { p_line: engineer, p_people: [sahilId] })).error?.message).toMatch(/not allowed/)
    expect((await finance.rpc('set_line_people', { p_line: engineer, p_people: [sahilId] })).error).toBeNull()
    expect((await finance.rpc('set_line_people', { p_line: pmLine, p_people: [sahilId] })).error?.message).toMatch(/already on another line/)
    const michelId = (await service.from('profiles').select('id').eq('email', 'michel@nesma.example.com').single()).data!.id
    expect((await finance.rpc('set_line_people', { p_line: pmLine, p_people: [michelId] })).error?.message).toMatch(/only Seven Billion people/)
    expect((await michel.from('rate_line_people').select('profile_id')).data ?? []).toHaveLength(0)
    expect((await finance.from('rate_line_people').select('profile_id').eq('rate_card_line_id', engineer)).data).toEqual([{ profile_id: sahilId }])
  })

  it('unbilled work: approved billable days at the agreed rate, for finance only (money is not shown to PMs)', async () => {
    const { data } = await finance.rpc('unbilled_time', { p_project: project })
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ full_name: 'Sahil', line_label: 'Engineer', currency: 'INR' })
    expect(Number(data![0]!.days)).toBe(2.5)                          // 1 + 1 + 0.5; the non-billable day is left out
    expect(Number(data![0]!.rate)).toBe(100)
    expect((await rahul.rpc('unbilled_time', { p_project: project })).data ?? []).toHaveLength(0)
    expect((await sahil.rpc('unbilled_time', { p_project: project })).data ?? []).toHaveLength(0)
    expect((await michel.rpc('unbilled_time', {})).data ?? []).toHaveLength(0)
  })

  it('a statement fills the line from approved timesheets; lines without people keep resources x working days', async () => {
    const { data: id, error } = await finance.rpc('create_statement', { p_project: project, p_start: day(1), p_end: '2026-11-30' })
    expect(error).toBeNull()
    st1 = id as string
    const ls = (await finance.from('statement_lines').select('label, quantity, note').eq('statement_id', st1)).data!
    expect(ls.find((l) => l.label === 'Engineer')).toMatchObject({ note: 'From approved timesheets: Sahil 2.5 days' })
    expect(Number(ls.find((l) => l.label === 'Engineer')!.quantity)).toBe(2.5)
    expect(Number(ls.find((l) => l.label === 'Project manager')!.quantity)).toBe(21)   // 1 resource x 21 weekdays in November 2026
    // an overlapping statement sees the same days until one of them is approved
    st2 = (await finance.rpc('create_statement', { p_project: project, p_start: day(1), p_end: day(15) })).data as string
    expect(Number((await finance.from('statement_lines').select('quantity').eq('statement_id', st2).eq('label', 'Engineer').single()).data!.quantity)).toBe(2.5)
  })

  it('approving the statement bills the days, once: never again on another statement, and the approval cannot be undone', async () => {
    expect((await finance.rpc('approve_statement_for_customer', { p_statement: st1 })).error).toBeNull()
    const billed = (await service.from('time_entries').select('id').eq('statement_id', st1)).data!.map((r) => r.id).sort()
    expect(billed).toEqual([entries[0]!, entries[1]!, entries[2]!].sort())          // not the non-billable day
    expect((await rahul.rpc('unapprove_time', { p_entries: [entries[0]!] })).error?.message).toMatch(/already billed/)
    expect((await finance.rpc('unbilled_time', { p_project: project })).data ?? []).toHaveLength(0)
    // the overlapping draft still says 2.5: it cannot be sent or approved until filled again
    expect((await finance.rpc('submit_statement', { p_statement: st2 })).error?.message).toMatch(/Engineer bills 2.5 days but only 0 approved, unbilled days/)
    expect((await finance.rpc('approve_statement_for_customer', { p_statement: st2 })).error?.message).toMatch(/Fill from timesheets again/)
    expect((await rahul.rpc('refill_statement', { p_statement: st2 })).error?.message).toMatch(/not allowed/)
    expect((await finance.rpc('refill_statement', { p_statement: st2 })).error).toBeNull()
    const line = (await finance.from('statement_lines').select('quantity, note').eq('statement_id', st2).eq('label', 'Engineer').single()).data!
    expect(Number(line.quantity)).toBe(0)
    expect(line.note).toBe('No approved days in this period')
  })

  it('a new version of the rate card keeps who each line bills', async () => {
    const { data: v2 } = await finance.rpc('start_rate_card', { p_project: project })
    const line = (await finance.from('rate_card_lines').select('id').eq('rate_card_id', v2 as string).eq('label', 'Engineer').single()).data!
    expect((await finance.from('rate_line_people').select('profile_id').eq('rate_card_line_id', line.id)).data).toEqual([{ profile_id: sahilId }])
    await service.from('rate_cards').delete().eq('id', v2 as string)
  })
})

describe('deleting', () => {
  let project: string, phase: string, task: string, busyTask: string
  const id = async (email: string) => (await service.from('profiles').select('id').eq('email', email).single()).data!.id

  beforeAll(async () => {
    project = (await service.from('projects').insert({ customer_id: nesma, name: 'Scratch project' }).select('id').single()).data!.id
    phase = (await service.from('phases').insert({ project_id: project, customer_id: nesma, name: 'Scratch phase', position: 0 }).select('id').single()).data!.id
    const [a, b] = (await service.from('tasks').insert([
      { project_id: project, phase_id: phase, customer_id: nesma, title: 'Throwaway task', position: 0 },
      { project_id: project, phase_id: phase, customer_id: nesma, title: 'Worked task', position: 1 },
    ]).select('id, title')).data!.sort((x, y) => x.title.localeCompare(y.title))
    task = a!.id
    busyTask = b!.id
  })

  it('nothing is deleted directly through the API, even by the CEO', async () => {
    const ceo = await asCeo()
    for (const [t, c] of [['tasks', ceo], ['phases', ceo], ['projects', ceo], ['tasks', rahul], ['requests', rahul]] as const) {
      expect((await c.from(t).delete().eq('customer_id', nesma).select('id')).data ?? []).toHaveLength(0)
    }
    expect((await service.from('tasks').select('id').eq('id', task)).data).toHaveLength(1)
  })

  it('the PM deletes a task; a consultant and the customer cannot; a task with approved days is kept', async () => {
    expect((await sahil.rpc('delete_task', { p_task: task })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('delete_task', { p_task: task })).error?.message).toMatch(/not allowed/)
    expect((await rahul.rpc('delete_task', { p_task: task })).error).toBeNull()
    expect((await service.from('tasks').select('id').eq('id', task)).data).toHaveLength(0)
    const { data: te } = await service.from('time_entries').insert({ task_id: busyTask, customer_id: nesma, user_id: await id('sahil@example.com'), days: 1, worked_on: '2026-12-01', approved_at: new Date().toISOString() }).select('id').single()
    expect((await rahul.rpc('delete_task', { p_task: busyTask })).error?.message).toMatch(/approved or billed days are logged on this task \(1 days\)/)
    expect((await rahul.rpc('delete_phase', { p_phase: phase })).error?.message).toMatch(/approved or billed days are logged in this phase/)
    await service.from('time_entries').delete().eq('id', te!.id)
    expect((await rahul.rpc('delete_phase', { p_phase: phase })).data).toBe(1)
    expect((await service.from('phases').select('id').eq('id', phase)).data).toHaveLength(0)
    const { data: log } = await service.from('activity').select('summary, visibility').eq('project_id', project).like('summary', 'deleted%')
    expect(log!.map((l) => l.summary).sort()).toEqual(['deleted the phase Scratch phase and its 1 tasks', 'deleted the task Throwaway task'])
    expect(log!.every((l) => l.visibility === 'internal')).toBe(true)
  })

  it('requests, meetings, decisions and updates: the PM deletes them, the customer cannot; a draft by its author', async () => {
    const michelId = await id('michel@nesma.example.com')
    const { data: req } = await service.from('requests').insert({ customer_id: nesma, project_id: project, title: 'Throwaway ask', requested_by: michelId }).select('id').single()
    expect((await michel.rpc('delete_request', { p_request: req!.id })).error?.message).toMatch(/not allowed/)
    expect((await sahil.rpc('delete_request', { p_request: req!.id })).error?.message).toMatch(/not allowed/)
    expect((await rahul.rpc('delete_request', { p_request: req!.id })).error).toBeNull()
    expect((await michel.from('requests').select('id').eq('id', req!.id)).data).toHaveLength(0)

    const { data: m } = await service.from('meetings').insert({ customer_id: nesma, project_id: project, title: 'Throwaway sync', held_on: '2026-10-01' }).select('id').single()
    const { data: dec } = await service.from('decisions').insert({ customer_id: nesma, project_id: project, meeting_id: m!.id, decision: 'Keep it', decided_on: '2026-10-01' }).select('id').single()
    expect((await rahul.rpc('delete_meeting', { p_meeting: m!.id })).error).toBeNull()
    expect((await service.from('decisions').select('meeting_id').eq('id', dec!.id).single()).data!.meeting_id).toBeNull()   // decisions stay
    expect((await sahil.rpc('delete_decision', { p_decision: dec!.id })).error?.message).toMatch(/not allowed/)
    expect((await rahul.rpc('delete_decision', { p_decision: dec!.id })).error).toBeNull()

    const sahilId = await id('sahil@example.com')
    const { data: ups } = await service.from('updates').insert([
      { customer_id: nesma, project_id: project, week_of: '2026-10-05', health: 'on_track', author_id: sahilId, status: 'draft', published_at: null },
      { customer_id: nesma, project_id: project, week_of: '2026-09-28', health: 'on_track', author_id: sahilId, status: 'published', published_at: new Date().toISOString() },
    ]).select('id, status')
    const draft = ups!.find((u) => u.status === 'draft')!.id, published = ups!.find((u) => u.status === 'published')!.id
    expect((await sahil.rpc('delete_update', { p_update: published })).error?.message).toMatch(/not allowed/)   // only managers, once published
    expect((await michel.rpc('delete_update', { p_update: published })).error?.message).toMatch(/not allowed/)
    expect((await sahil.rpc('delete_update', { p_update: draft })).error).toBeNull()
    expect((await rahul.rpc('delete_update', { p_update: published })).error).toBeNull()
  })

  it('a file is archived before it is deleted; its uploader or the PM may delete it', async () => {
    const michelId = await id('michel@nesma.example.com')
    const { data: doc } = await service.from('documents').insert({ customer_id: nesma, project_id: project, name: 'old.pdf', visibility: 'shared', uploaded_by: michelId }).select('id').single()
    expect((await michel.rpc('delete_document', { p_document: doc!.id })).error?.message).toMatch(/archive the file first/)
    await service.from('documents').update({ archived_at: new Date().toISOString() }).eq('id', doc!.id)
    expect((await omar.rpc('delete_document', { p_document: doc!.id })).error?.message).toMatch(/not allowed/)
    expect((await sahil.rpc('delete_document', { p_document: doc!.id })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('delete_document', { p_document: doc!.id })).error).toBeNull()
    expect((await service.from('documents').select('id').eq('id', doc!.id)).data).toHaveLength(0)
  })

  it('comments: your own for 15 minutes; the PM any; the customer never someone else\'s', async () => {
    const { data: t } = await service.from('tasks').insert({ project_id: project, customer_id: nesma, title: 'Discussed', visibility: 'shared', position: 0 }).select('id').single()
    const omarId = await id('omar@nesma.example.com'), michelId = await id('michel@nesma.example.com')
    const { data: cs } = await service.from('comments').insert([
      { customer_id: nesma, entity_type: 'task', entity_id: t!.id, author_id: omarId, visibility: 'shared', body: 'mine', created_at: new Date().toISOString() },
      { customer_id: nesma, entity_type: 'task', entity_id: t!.id, author_id: michelId, visibility: 'shared', body: 'old', created_at: '2026-01-01T00:00:00Z' },
    ]).select('id, body')
    const mine = cs!.find((c) => c.body === 'mine')!.id, old = cs!.find((c) => c.body === 'old')!.id
    expect((await michel.rpc('delete_comment', { p_comment: mine })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('delete_comment', { p_comment: old })).error?.message).toMatch(/not allowed/)   // too late
    expect((await omar.rpc('delete_comment', { p_comment: mine })).error).toBeNull()
    expect((await sahil.rpc('delete_comment', { p_comment: old })).error?.message).toMatch(/not allowed/)
    expect((await rahul.rpc('delete_comment', { p_comment: old })).error).toBeNull()
  })

  it('a project: only admins and the CEO, after typing its name; kept once it has billing history', async () => {
    const ceo = await asCeo()
    const { data: doc } = await service.from('documents').insert({ customer_id: nesma, project_id: project, name: 'spec.pdf' }).select('id').single()
    await service.from('requests').insert({ customer_id: nesma, project_id: project, title: 'Ask on the scratch project' })
    expect((await rahul.rpc('delete_project', { p_project: project, p_confirm: 'Scratch project' })).error?.message).toMatch(/not allowed/)
    expect((await finance.rpc('delete_project', { p_project: project, p_confirm: 'Scratch project' })).error?.message).toMatch(/not allowed/)
    expect((await ceo.rpc('delete_project', { p_project: project, p_confirm: 'scratch' })).error?.message).toMatch(/type the project name exactly/)
    const { data: docs, error } = await ceo.rpc('delete_project', { p_project: project, p_confirm: 'Scratch project' })
    expect(error).toBeNull()
    expect(docs).toEqual([doc!.id])     // for the app to remove the files
    for (const t of ['projects', 'tasks', 'documents', 'requests', 'updates'] as const) {
      expect((await service.from(t).select('id').eq(t === 'projects' ? 'id' : 'project_id', project)).data).toHaveLength(0)
    }
    expect((await service.from('requests').select('id').eq('title', 'Ask on the scratch project')).data).toHaveLength(0)
    expect((await service.from('activity').select('summary').eq('customer_id', nesma).eq('summary', 'deleted the project Scratch project')).data).toHaveLength(1)
    // billing history (here a Zoho invoice) keeps a project
    const billed = (await service.from('projects').insert({ customer_id: nesma, name: 'Billed project' }).select('id').single()).data!.id
    await service.from('invoices').insert({ customer_id: nesma, project_id: billed, number: 'INV-TEST-1', status: 'sent', issued_on: '2026-10-01' })
    expect((await ceo.rpc('delete_project', { p_project: billed, p_confirm: 'Billed project' })).error?.message).toMatch(/billing history/)
    await service.from('projects').delete().eq('id', billed)
    await service.from('invoices').delete().eq('number', 'INV-TEST-1')
  })
})

describe('account team', () => {
  const id = async (email: string) => (await service.from('profiles').select('id').eq('email', email).single()).data!.id

  it('the PM adds Seven Billion people to a customer with a role; the customer sees them; a consultant cannot add', async () => {
    const sahilId = await id('sahil@example.com')
    expect((await sahil.rpc('add_to_customer_team', { p_customer: nesma, p_person: sahilId, p_role: 'Data engineer' })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('add_to_customer_team', { p_customer: nesma, p_person: sahilId })).error?.message).toMatch(/not allowed/)
    expect((await rahul.rpc('add_to_customer_team', { p_customer: nesma, p_person: await id('omar@nesma.example.com') })).error?.message).toMatch(/only Seven Billion people/)
    expect((await rahul.rpc('add_to_customer_team', { p_customer: nesma, p_person: sahilId, p_role: 'Data engineer' })).error).toBeNull()
    expect((await sahil.from('notifications').select('title').eq('kind', 'team.added')).data![0]!.title).toBe('You are on the Nesma Group account team')
    expect((await michel.from('customer_team').select('role_label').eq('profile_id', sahilId)).data).toEqual([{ role_label: 'Data engineer' }])
    expect((await cbdLead.from('customer_team').select('profile_id').eq('customer_id', nesma)).data ?? []).toHaveLength(0)
    expect((await michel.from('customer_team').insert({ customer_id: nesma, profile_id: await id('rahul@example.com') })).error).not.toBeNull()
    // the role can be changed by adding again
    await rahul.rpc('add_to_customer_team', { p_customer: nesma, p_person: sahilId, p_role: 'Lead engineer' })
    expect((await service.from('customer_team').select('role_label').eq('customer_id', nesma).eq('profile_id', sahilId).single()).data!.role_label).toBe('Lead engineer')
  })

  it('the account team hears about the customer\'s new requests', async () => {
    await rahul.rpc('add_to_customer_team', { p_customer: nesma, p_person: await id('finance@example.com'), p_role: 'Billing' })
    const { error } = await michel.from('requests').insert({ customer_id: nesma, title: 'Team should hear this', requested_by: await id('michel@nesma.example.com') })
    expect(error).toBeNull()
    const { data } = await finance.from('notifications').select('title, body').eq('kind', 'request.submitted').like('title', '%Team should hear this')
    expect(data).toHaveLength(1)
    expect(data![0]!.body).toMatch(/from an account you are on/)
    await rahul.rpc('remove_from_customer_team', { p_customer: nesma, p_person: await id('finance@example.com') })
    expect((await service.from('customer_team').select('profile_id').eq('customer_id', nesma).eq('profile_id', await id('finance@example.com'))).data).toHaveLength(0)
  })

  it('whoever adds a customer is on its team as account lead', async () => {
    const c = { id: crypto.randomUUID() }   // as the app does: the row is not read back
    const { error } = await rahul.from('customers').insert({ id: c.id, name: 'Team Starter Co', org_id: (await service.from('customers').select('org_id').eq('id', nesma).single()).data!.org_id })
    expect(error).toBeNull()
    expect((await service.from('customer_team').select('profile_id, role_label').eq('customer_id', c.id)).data).toEqual([{ profile_id: await id('rahul@example.com'), role_label: 'Account lead' }])
    await service.from('customers').delete().eq('id', c.id)
  })

  it('with the switch on, a consultant sees only the customers they are on; everyone else sees all', async () => {
    const org = (await service.from('customers').select('org_id').eq('id', nesma).single()).data!.org_id
    const hidden = (await service.from('customers').insert({ name: 'Quiet Co', org_id: org }).select('id').single()).data!.id
    const ceo = await asCeo()
    expect((await sahil.from('customers').select('id').eq('id', hidden)).data).toHaveLength(1)     // off: everyone sees everything
    expect((await rahul.rpc('set_consultants_see_own_customers', { p_on: true })).error?.message).toMatch(/not allowed/)
    expect((await ceo.rpc('set_consultants_see_own_customers', { p_on: true })).error).toBeNull()
    try {
      expect((await sahil.from('customers').select('id').eq('id', hidden)).data ?? []).toHaveLength(0)
      expect((await sahil.from('customers').select('id').eq('id', nesma)).data).toHaveLength(1)      // on its team and owns its tasks
      expect((await rahul.from('customers').select('id').eq('id', hidden)).data).toHaveLength(1)     // PMs see all
      expect((await finance.from('customers').select('id').eq('id', hidden)).data).toHaveLength(1)
      await rahul.rpc('add_to_customer_team', { p_customer: hidden, p_person: await id('sahil@example.com') })
      expect((await sahil.from('customers').select('id').eq('id', hidden)).data).toHaveLength(1)
    } finally {
      await ceo.rpc('set_consultants_see_own_customers', { p_on: false })
      await service.from('customers').delete().eq('id', hidden)
    }
  })
})

describe('subtasks', () => {
  let project: string, build: string, test: string, task: string, internalTask: string
  beforeAll(async () => {
    project = (await service.from('projects').insert({ customer_id: nesma, name: 'Subtask project' }).select('id').single()).data!.id
    const phases = (await service.from('phases').insert([
      { project_id: project, customer_id: nesma, name: 'Build', position: 0 },
      { project_id: project, customer_id: nesma, name: 'Test', position: 1 },
    ]).select('id, name')).data!
    build = phases.find((p) => p.name === 'Build')!.id
    test = phases.find((p) => p.name === 'Test')!.id
    const tasks = (await service.from('tasks').insert([
      { project_id: project, phase_id: build, customer_id: nesma, title: 'Sales dashboard', visibility: 'shared', position: 0 },
      { project_id: project, phase_id: build, customer_id: nesma, title: 'Internal prep', visibility: 'internal', position: 1 },
    ]).select('id, title')).data!
    task = tasks.find((t) => t.title === 'Sales dashboard')!.id
    internalTask = tasks.find((t) => t.title === 'Internal prep')!.id
  })
  afterAll(async () => { await service.from('projects').delete().eq('id', project) })

  it('a subtask sits in its task\'s phase, follows it when the task moves, and is never wider than it', async () => {
    const { data: s, error } = await rahul.from('tasks').insert({ project_id: project, customer_id: nesma, parent_id: task, title: 'Data model', visibility: 'shared' }).select('id, phase_id, visibility').single()
    expect(error).toBeNull()
    expect(s).toMatchObject({ phase_id: build, visibility: 'shared' })
    const { data: hidden } = await rahul.from('tasks').insert({ project_id: project, customer_id: nesma, parent_id: internalTask, title: 'Draft notes', visibility: 'shared' }).select('visibility').single()
    expect(hidden!.visibility).toBe('internal')

    await rahul.from('tasks').update({ phase_id: test }).eq('id', task)
    expect((await service.from('tasks').select('phase_id').eq('id', s!.id).single()).data!.phase_id).toBe(test)
    await rahul.from('tasks').update({ visibility: 'internal' }).eq('id', task)
    expect((await service.from('tasks').select('visibility').eq('id', s!.id).single()).data!.visibility).toBe('internal')
    // the customer sees neither once the task is internal
    expect((await michel.from('tasks').select('id').in('id', [task, s!.id])).data).toHaveLength(0)
    await rahul.from('tasks').update({ visibility: 'shared' }).eq('id', task)
    await rahul.from('tasks').update({ visibility: 'shared' }).eq('id', s!.id)
    expect((await michel.from('tasks').select('id').in('id', [task, s!.id])).data).toHaveLength(2)
  })

  it('one level only, and progress counts tasks rather than subtasks', async () => {
    const { data: sub } = await service.from('tasks').select('id').eq('parent_id', task).limit(1).single()
    const nested = await rahul.from('tasks').insert({ project_id: project, customer_id: nesma, parent_id: sub!.id, title: 'Too deep' })
    expect(nested.error?.message).toMatch(/a subtask cannot have subtasks/)
    const self = await rahul.from('tasks').update({ parent_id: task }).eq('id', task)
    expect(self.error?.message).toMatch(/cannot be its own subtask/)
    const withChildren = await rahul.from('tasks').update({ parent_id: internalTask }).eq('id', task)
    expect(withChildren.error?.message).toMatch(/has subtasks, so it cannot become a subtask/)
    const { data: prog } = await service.from('project_progress').select('total').eq('project_id', project).single()
    expect(prog!.total).toBe(2)
  })

  it('deleting a task takes its subtasks, unless days on a subtask are approved', async () => {
    const { data: sub } = await service.from('tasks').select('id').eq('parent_id', task).limit(1).single()
    const sahilId = (await service.from('profiles').select('id').eq('email', 'sahil@example.com').single()).data!.id
    const { data: te } = await service.from('time_entries').insert({ task_id: sub!.id, customer_id: nesma, user_id: sahilId, days: 0.5, worked_on: '2026-12-02', approved_at: new Date().toISOString() }).select('id').single()
    expect((await rahul.rpc('delete_task', { p_task: task })).error?.message).toMatch(/approved or billed days are logged on this task \(0.5 days\)/)
    await service.from('time_entries').delete().eq('id', te!.id)
    expect((await rahul.rpc('delete_task', { p_task: task })).error).toBeNull()
    expect((await service.from('tasks').select('id').or(`id.eq.${task},parent_id.eq.${task}`)).data).toHaveLength(0)
    const { data: log } = await service.from('activity').select('summary').eq('project_id', project).like('summary', 'deleted%')
    expect(log!.map((l) => l.summary)).toEqual(['deleted the task Sales dashboard and its 1 subtasks'])
  })
})

describe('billed as: rate card lines on phases and tasks', () => {
  let project: string, buildPhase: string, opsPhase: string, engineer: string, bi: string, report: string
  let taskA: string, taskB: string, taskC: string, sub: string, taskD: string, sahilId: string, rahulTask: string
  const day = (d: number) => `2026-12-${String(d).padStart(2, '0')}`

  beforeAll(async () => {
    sahilId = (await service.from('profiles').select('id').eq('email', 'sahil@example.com').single()).data!.id
    const rahulId = (await service.from('profiles').select('id').eq('email', 'rahul@example.com').single()).data!.id
    project = (await service.from('projects').insert({ customer_id: nesma, name: 'Billed-as project', pm_id: rahulId }).select('id').single()).data!.id
    const card = (await service.from('rate_cards').insert({ project_id: project, customer_id: nesma, status: 'approved', currency: 'EUR' }).select('id').single()).data!.id
    const lines = (await service.from('rate_card_lines').insert([
      { rate_card_id: card, customer_id: nesma, kind: 'day_rate', label: 'Data engineer', unit: 'day', rate: 1, planned_quantity: 1, position: 0 },
      { rate_card_id: card, customer_id: nesma, kind: 'day_rate', label: 'BI developer', unit: 'day', rate: 1, planned_quantity: 1, position: 1 },
      { rate_card_id: card, customer_id: nesma, kind: 'unit', label: 'Monthly report', unit: 'monthly report', rate: 1, planned_quantity: 2, position: 2 },
    ]).select('id, label')).data!
    engineer = lines.find((l) => l.label === 'Data engineer')!.id
    bi = lines.find((l) => l.label === 'BI developer')!.id
    report = lines.find((l) => l.label === 'Monthly report')!.id
    await service.from('rate_line_people').insert({ rate_card_line_id: engineer, profile_id: sahilId, customer_id: nesma })
    const phases = (await service.from('phases').insert([
      { project_id: project, customer_id: nesma, name: 'Build', position: 0 },
      { project_id: project, customer_id: nesma, name: 'Operate', position: 1 },
    ]).select('id, name')).data!
    buildPhase = phases.find((p) => p.name === 'Build')!.id
    opsPhase = phases.find((p) => p.name === 'Operate')!.id
    const tasks = (await service.from('tasks').insert([
      { project_id: project, phase_id: buildPhase, customer_id: nesma, title: 'Pipelines', assignee_id: sahilId, position: 0 },
      { project_id: project, phase_id: buildPhase, customer_id: nesma, title: 'Dashboards', assignee_id: sahilId, position: 1 },
      { project_id: project, phase_id: opsPhase, customer_id: nesma, title: 'Support', assignee_id: sahilId, position: 0 },
      { project_id: project, phase_id: opsPhase, customer_id: nesma, title: 'October report', assignee_id: sahilId, position: 1 },
      { project_id: project, phase_id: opsPhase, customer_id: nesma, title: 'Rahul task', assignee_id: rahulId, position: 2 },
    ]).select('id, title')).data!
    const t = (title: string) => tasks.find((x) => x.title === title)!.id
    taskA = t('Pipelines'); taskB = t('Dashboards'); taskC = t('Support'); taskD = t('October report'); rahulTask = t('Rahul task')
    sub = (await service.from('tasks').insert({ project_id: project, customer_id: nesma, parent_id: taskA, title: 'Ingest orders', assignee_id: sahilId }).select('id').single()).data!.id
    await service.from('task_estimates').insert({ task_id: taskD, customer_id: nesma, estimate: 1, unit: 'monthly report' })
  })
  afterAll(async () => {
    await service.from('time_entries').delete().in('task_id', [taskA, taskB, taskC, sub])
    await service.from('billing_statements').delete().eq('project_id', project)
    await service.from('projects').delete().eq('id', project)
  })

  it('the team sees line names without rates; customers see none', async () => {
    for (const c of [rahul, sahil]) {
      const { data, error } = await c.rpc('billing_lines', { p_project: project })
      expect(error).toBeNull()
      expect(data!.map((l: { label: string }) => l.label)).toEqual(['Data engineer', 'BI developer', 'Monthly report'])
      expect(Object.keys(data![0]!)).not.toContain('rate')
    }
    expect((await rahul.from('rate_card_lines').select('rate').eq('id', engineer)).data).toHaveLength(0)
    expect((await michel.rpc('billing_lines', { p_project: project })).data ?? []).toHaveLength(0)
  })

  it('the PM links phases and tasks; a consultant only tasks they own; never a subtask or another project\'s line', async () => {
    expect((await rahul.rpc('set_billed_as', { p_task: null, p_phase: buildPhase, p_line: bi })).error).toBeNull()
    expect((await sahil.rpc('set_billed_as', { p_task: taskA, p_phase: null, p_line: engineer })).error).toBeNull()
    expect((await sahil.rpc('set_billed_as', { p_task: rahulTask, p_phase: null, p_line: engineer })).error?.message).toMatch(/not allowed/)
    expect((await sahil.rpc('set_billed_as', { p_task: null, p_phase: opsPhase, p_line: engineer })).error?.message).toMatch(/not allowed/)
    expect((await michel.rpc('set_billed_as', { p_task: taskA, p_phase: null, p_line: engineer })).error).not.toBeNull()
    expect((await rahul.rpc('set_billed_as', { p_task: sub, p_phase: null, p_line: engineer })).error?.message).toMatch(/subtasks are billed through their task/)
    // a line from another project's card
    const elsewhere = (await service.from('projects').insert({ customer_id: nesma, name: 'Billed-as other project' }).select('id').single()).data!.id
    const otherCard = (await service.from('rate_cards').insert({ project_id: elsewhere, customer_id: nesma, status: 'draft' }).select('id').single()).data!.id
    const other = (await service.from('rate_card_lines').insert({ rate_card_id: otherCard, customer_id: nesma, kind: 'day_rate', label: 'Elsewhere', unit: 'day', rate: 1 }).select('id').single()).data!.id
    expect((await rahul.rpc('set_billed_as', { p_task: taskB, p_phase: null, p_line: other })).error?.message).toMatch(/not on this project/)
    await service.from('projects').delete().eq('id', elsewhere)
    expect((await rahul.rpc('set_billed_as', { p_task: taskD, p_phase: null, p_line: report })).error).toBeNull()
  })

  it('days bill on the task\'s line (subtasks through their task), else the phase\'s, else the person\'s; done tasks fill unit lines', async () => {
    const log = (task: string, d: number, days: number) => ({ task_id: task, customer_id: nesma, user_id: sahilId, days, worked_on: day(d), billable: true, approved_at: new Date().toISOString() })
    await service.from('time_entries').insert([log(taskA, 1, 1), log(sub, 1, 0.5), log(taskB, 2, 0.75), log(taskC, 3, 0.25)])
    await service.from('tasks').update({ status: 'done', completed_at: `${day(5)}T10:00:00Z` }).eq('id', taskD)
    const { data: st, error } = await finance.rpc('create_statement', { p_project: project, p_start: day(1), p_end: day(31) })
    expect(error).toBeNull()
    const { data: lines } = await service.from('statement_lines').select('label, quantity, note').eq('statement_id', st as string).order('position')
    // Pipelines 1 + its subtask 0.5 + Support 0.25 (no line on task or phase: Sahil is named on Data engineer)
    expect(lines!.map((l) => [l.label, Number(l.quantity)])).toEqual([['Data engineer', 1.75], ['BI developer', 0.75], ['Monthly report', 1]])
    expect(lines![2]!.note).toBe('From tasks done: October report')

    // approved: the days and the report are billed on it, and never again
    await service.from('billing_statements').update({ status: 'approved' }).eq('id', st as string)
    expect((await service.from('tasks').select('statement_id').eq('id', taskD).single()).data!.statement_id).toBe(st)
    const { data: again } = await finance.rpc('create_statement', { p_project: project, p_start: day(1), p_end: day(31) })
    const { data: lines2 } = await service.from('statement_lines').select('quantity').eq('statement_id', again as string)
    expect(lines2!.every((l) => Number(l.quantity) === 0)).toBe(true)
  })

  it('once days are approved, only finance, an admin or the CEO can change what the work is billed as', async () => {
    expect((await sahil.rpc('set_billed_as', { p_task: taskA, p_phase: null, p_line: bi })).error?.message).toMatch(/only finance, an admin or the CEO/)
    expect((await rahul.rpc('set_billed_as', { p_task: null, p_phase: buildPhase, p_line: engineer })).error?.message).toMatch(/only finance, an admin or the CEO/)
    expect((await finance.rpc('set_billed_as', { p_task: taskA, p_phase: null, p_line: bi })).error).toBeNull()
    expect((await rahul.from('tasks').update({ statement_id: null }).eq('id', taskD).select('id')).error?.message ?? '').toMatch(/billed and stays|permission|not allowed|^$/)
    expect((await service.from('tasks').select('statement_id').eq('id', taskD).single()).data!.statement_id).not.toBeNull()
  })
})

describe('plan roll-up', () => {
  let project: string, phase: string, task: string
  beforeAll(async () => {
    project = (await service.from('projects').insert({ customer_id: nesma, name: 'Roll-up project' }).select('id').single()).data!.id
    phase = (await service.from('phases').insert({ project_id: project, customer_id: nesma, name: 'Build', position: 0 }).select('id').single()).data!.id
    task = (await service.from('tasks').insert({ project_id: project, phase_id: phase, customer_id: nesma, title: 'Parent' }).select('id').single()).data!.id
  })
  afterAll(async () => { await service.from('projects').delete().eq('id', project) })

  it('a request goes on the plan once', async () => {
    const { data: req } = await service.from('requests').insert({ customer_id: nesma, project_id: project, title: 'Once only' }).select('id').single()
    expect((await rahul.rpc('request_to_task', { p_request: req!.id })).error).toBeNull()
    expect((await rahul.rpc('request_to_task', { p_request: req!.id })).error?.message).toMatch(/already on the plan/)
    expect((await service.from('tasks').select('id').eq('request_id', req!.id)).data).toHaveLength(1)
  })

  it('starting a subtask starts its task; reopening a subtask reopens a done task; finishing them does not close it', async () => {
    const status = async () => (await service.from('tasks').select('status').eq('id', task).single()).data!.status
    const { data: s } = await rahul.from('tasks').insert({ project_id: project, customer_id: nesma, parent_id: task, title: 'Child' }).select('id').single()
    expect(await status()).toBe('todo')
    await rahul.from('tasks').update({ status: 'in_progress' }).eq('id', s!.id)
    expect(await status()).toBe('in_progress')
    await rahul.from('tasks').update({ status: 'done' }).eq('id', s!.id)
    expect(await status()).toBe('in_progress')
    await rahul.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', task)
    await rahul.from('tasks').update({ status: 'in_review' }).eq('id', s!.id)
    expect(await status()).toBe('in_progress')
    expect((await service.from('tasks').select('completed_at').eq('id', task).single()).data!.completed_at).toBeNull()
  })
})
