import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/database.types'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const PASSWORD = process.env.SEED_PASSWORD || 'local-dev-only-password'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
async function as(email: string): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(url, anonKey, opts)
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return c
}

describe('assistant tools', () => {
  it('gives Claude every Helm tool as a JSON schema object, in a fixed order', async () => {
    const { helmTools } = await import('@/lib/mcp/tools')
    const { z } = await import('zod')
    const tools = helmTools()
    expect(tools.length).toBeGreaterThan(10)
    for (const t of tools) {
      const schema = z.toJSONSchema(t.input, { io: 'input' }) as { type?: string; properties?: object }
      expect(schema.type, t.name).toBe('object')
      expect(t.description.length, t.name).toBeGreaterThan(20)
    }
    expect(helmTools().map((t) => t.name)).toEqual(tools.map((t) => t.name))
  })

  it('treats exactly the changing tools as proposals, and nothing deletes, approves or bills', async () => {
    const { helmTools } = await import('@/lib/mcp/tools')
    const writes = helmTools().filter((t) => t.write).map((t) => t.name).sort()
    expect(writes).toEqual(['add_comment', 'create_request', 'create_task', 'log_time', 'set_request_stage', 'update_task'])
    expect(helmTools().some((t) => /delete|approve|bill|invoice/.test(t.name))).toBe(false)
  })

  it('describes a proposal in plain words without ids', async () => {
    const { helmTools } = await import('@/lib/mcp/tools')
    const { summarise } = await import('@/lib/assistant/agent')
    const log = helmTools().find((t) => t.name === 'log_time')!
    const line = summarise(log, { task_id: '00000000-0000-0000-0000-000000000000', hours: 3, worked_on: '2026-11-09' })
    expect(line).toContain('hours: 3')
    expect(line).not.toContain('00000000')
  })

  it('rejects input that does not match a tool before anything runs', async () => {
    const { runHelmTool } = await import('@/lib/mcp/tools')
    const res = await runHelmTool(async () => { throw new Error('must not run') }, 'log_time', { hours: 'lots' })
    expect(res.ok).toBe(false)
  })
})

describe('assistant chats are private to each team member', () => {
  it('a team member keeps chats and proposals to themselves; customers cannot use it', async () => {
    const rahul = await as('rahul@example.com')
    const sahil = await as('sahil@example.com')
    const michel = await as('michel@nesma.example.com')

    const { data: chat, error } = await rahul.from('ai_chats').insert({ title: 'test chat' }).select('id').single()
    expect(error).toBeNull()
    const { error: pe } = await rahul.from('ai_proposals').insert({ chat_id: chat!.id, tool: 'log_time', input: { hours: 1 }, summary: 'Log time' })
    expect(pe).toBeNull()

    expect((await sahil.from('ai_chats').select('id').eq('id', chat!.id)).data).toEqual([])
    expect((await sahil.from('ai_proposals').select('id').eq('chat_id', chat!.id)).data).toEqual([])
    // nobody can attach a proposal to someone else's chat
    expect((await sahil.from('ai_proposals').insert({ chat_id: chat!.id, tool: 'log_time', input: {}, summary: 'x' })).error).not.toBeNull()
    // customers have no assistant
    expect((await michel.from('ai_chats').insert({ title: 'nope' })).error).not.toBeNull()
    expect((await michel.from('ai_chats').select('id')).data).toEqual([])

    await rahul.from('ai_chats').delete().eq('id', chat!.id)
  })
})
