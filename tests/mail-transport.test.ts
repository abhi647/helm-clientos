// Helm sends through Resend: the sender in use, and a plain reason when none is set up.
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('@/lib/mail-transport')
}

describe('mail transport', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sends through Resend when its key is set', async () => {
    expect((await load({ RESEND_API_KEY: 're_123', EMAIL_FROM: 'Helm <helm@helm.sevenbillion.co>' })).mailTransport())
      .toEqual({ kind: 'resend', from: 'Helm <helm@helm.sevenbillion.co>' })
  })

  it('says plainly when no email service is set up', async () => {
    const t = await load({ RESEND_API_KEY: '' })
    expect(t.mailTransport().kind).toBe('none')
    await expect(t.sendMail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).rejects.toThrow('No email service is set up')
  })
})
