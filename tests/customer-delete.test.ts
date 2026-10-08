// Deleting a customer whose people have done things in Helm (requests, comments): it must remove everything,
// sign-ins included. Run against the local Supabase (npm run test:db setup).
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

describe('deleting a customer', () => {
  it('removes a customer whose people raised requests and commented, and their sign-ins', async () => {
    const { data: org, error: oe } = await service.from('orgs').select('id').limit(1).single()
    expect(oe).toBeNull()
    const { data: c } = await service.from('customers').insert({ name: `Delete Me ${Date.now()}`, org_id: org!.id }).select('id').single()
    const email = `gone-${Date.now()}@deleteme.example.com`
    const { data: u, error: ue } = await service.auth.admin.createUser({
      email, email_confirm: true,
      app_metadata: { kind: 'customer', customer_id: c!.id, customer_role: 'customer_exec', can_view_invoices: true, full_name: 'Gone Person' },
    })
    expect(ue).toBeNull()
    const { data: r, error: re } = await service.from('requests').insert({ customer_id: c!.id, title: 'A request they raised', requested_by: u.user!.id }).select('id').single()
    expect(re).toBeNull()
    await service.from('comments').insert({ customer_id: c!.id, entity_type: 'request', entity_id: r!.id, author_id: u.user!.id, visibility: 'shared', body: 'hello' })

    const { deleteCustomer } = await import('@/lib/customer-data')
    const removed = await deleteCustomer(c!.id)
    expect(removed).toMatchObject({ people: 1, leftover: [] })
    expect((await service.from('customers').select('id').eq('id', c!.id)).data).toHaveLength(0)
    expect((await service.from('requests').select('id').eq('id', r!.id)).data).toHaveLength(0)
    expect((await service.auth.admin.getUserById(u.user!.id)).data.user).toBeNull()
  })
})
