import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!
const PASSWORD = process.env.SEED_PASSWORD || 'local-dev-only-password'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient<Database>(url, secret, opts)
async function as(email: string): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(url, anonKey, opts)
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return c
}
const idOf = async (email: string) => (await service.from('profiles').select('id').eq('email', email).single()).data!.id
// a tiny valid WebP (1x1)
const webp = () => new Blob([Uint8Array.from(atob('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA='), (c) => c.charCodeAt(0))], { type: 'image/webp' })

describe('profiles: photo and details', () => {
  afterAll(async () => {
    const id = await idOf('sahil@example.com')
    await service.from('profiles').update({ job_title: null, phone: null, avatar_path: null, avatar_color: null, last_sign_in_via: null, last_sign_in_via_at: null }).eq('id', id)
    const { data } = await service.storage.from('avatars').list(id)
    if (data?.length) await service.storage.from('avatars').remove(data.map((f) => `${id}/${f.name}`))
  })

  it('you edit your own details, never someone else’s, and never your role', async () => {
    const sahil = await as('sahil@example.com')
    const [sid, rid] = [await idOf('sahil@example.com'), await idOf('rahul@example.com')]
    expect((await sahil.from('profiles').update({ job_title: 'BI consultant', phone: '+91 98765 43210' }).eq('id', sid)).error).toBeNull()
    expect((await service.from('profiles').select('job_title').eq('id', sid).single()).data!.job_title).toBe('BI consultant')
    // someone else's row: nothing changes
    await sahil.from('profiles').update({ job_title: 'Hacked' }).eq('id', rid)
    expect((await service.from('profiles').select('job_title').eq('id', rid).single()).data!.job_title).not.toBe('Hacked')
    // your role is not yours to change
    await sahil.from('profiles').update({ internal_role: 'admin' } as never).eq('id', sid)
    expect((await service.from('profiles').select('internal_role').eq('id', sid).single()).data!.internal_role).toBe('consultant')
    // a phone number has to look like one
    expect((await sahil.from('profiles').update({ phone: 'call me maybe' }).eq('id', sid)).error).not.toBeNull()
  })

  it('photos go only in your own folder; customers see photo and title, not phone', async () => {
    const sahil = await as('sahil@example.com')
    const [sid, rid] = [await idOf('sahil@example.com'), await idOf('rahul@example.com')]
    expect((await sahil.storage.from('avatars').upload(`${sid}/test.webp`, webp(), { contentType: 'image/webp' })).error).toBeNull()
    expect((await sahil.storage.from('avatars').upload(`${rid}/test.webp`, webp(), { contentType: 'image/webp' })).error).not.toBeNull()
    expect((await sahil.from('profiles').update({ avatar_path: `${sid}/test.webp` }).eq('id', sid)).error).toBeNull()
    const michel = await as('michel@nesma.example.com')
    const seen = await michel.from('profiles').select('full_name, avatar_path, job_title').eq('id', sid).maybeSingle()
    if (seen.data) expect(seen.data.avatar_path).toBe(`${sid}/test.webp`)
    expect((await michel.from('profiles').select('phone').eq('id', sid)).error).not.toBeNull()
  })

  it('the way you last signed in is noted only through note_sign_in, only on your own row', async () => {
    const sahil = await as('sahil@example.com')
    const sid = await idOf('sahil@example.com')
    expect((await sahil.rpc('note_sign_in', { via: 'google' })).error).toBeNull()
    const row = (await service.from('profiles').select('last_sign_in_via, last_sign_in_via_at').eq('id', sid).single()).data!
    expect(row.last_sign_in_via).toBe('google')
    expect(row.last_sign_in_via_at).not.toBeNull()
    // not a method we know
    expect((await sahil.rpc('note_sign_in', { via: 'carrier-pigeon' })).error).not.toBeNull()
    // someone else cannot change yours, or read it
    const rahul = await as('rahul@example.com')
    await rahul.from('profiles').update({ last_sign_in_via: 'passkey' } as never).eq('id', sid)
    expect((await service.from('profiles').select('last_sign_in_via').eq('id', sid).single()).data!.last_sign_in_via).toBe('google')
    expect((await rahul.from('profiles').select('last_sign_in_via').eq('id', sid)).error).not.toBeNull()
    // signed out: nothing to note
    const anon = createClient<Database>(url, anonKey, opts)
    expect((await anon.rpc('note_sign_in', { via: 'google' })).error).not.toBeNull()
  })
})
