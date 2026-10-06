// Security tests: sign in as each kind of user against a local Supabase and prove what they can and cannot do.
// Run: npm run test:db   (needs `supabase start`; reseeds the local database first)
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const PASSWORD = process.env.SEED_PASSWORD || 'local-dev-only-password'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

const service = createClient(url, secret, opts)
async function as(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, opts)
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return c
}

const VISIBILITY_TABLES = ['phases', 'tasks', 'comments', 'documents', 'meetings', 'decisions', 'activity']
const CUSTOMER_TABLES = ['customers', 'projects', 'phases', 'tasks', 'requests', 'request_events', 'approvals', 'approval_events',
  'action_items', 'comments', 'documents', 'meetings', 'decisions', 'updates', 'invoices', 'activity']
const STAFF_ONLY = ['project_commercials', 'task_estimates', 'time_entries']
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
    if (['tasks', 'comments', 'documents'].includes(table)) expect(all.data!.length).toBeGreaterThan(0)
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
