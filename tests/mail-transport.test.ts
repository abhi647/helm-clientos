// Sending through Microsoft 365 (Graph) when configured, otherwise Resend: the request Helm makes, checked offline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const ms = { MS_TENANT_ID: 'tenant-1', MS_CLIENT_ID: 'client-1', MS_CLIENT_SECRET: 'secret-1', MS_SENDER: 'helm@sevenbillion.co' }

async function load(extra: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries({ ...ms, EMAIL_FROM: 'Helm · Seven Billion <helm@helm.sevenbillion.co>', EMAIL_REPLY_TO: 'team@sevenbillion.co', ...extra })) vi.stubEnv(k, v)
  return import('@/lib/mail-transport')
}

describe('mail transport', () => {
  beforeEach(() => vi.unstubAllEnvs())
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('sends from the Microsoft 365 mailbox, with the display name and reply-to', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return url.includes('/oauth2/') ? new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }) : new Response(null, { status: 202 })
    }))
    const { mailTransport, sendMail } = await load({})
    expect(mailTransport()).toEqual({ kind: 'microsoft', from: 'helm@sevenbillion.co' })
    await sendMail({ to: 'client@acme.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' })
    await sendMail({ to: 'other@acme.com', subject: 'Again', html: '<p>Hi</p>', text: 'Hi' })
    expect(calls.filter((c) => c.url.includes('/oauth2/'))).toHaveLength(1)   // the token is reused
    const send = calls.find((c) => c.url.includes('/sendMail'))!
    expect(send.url).toBe('https://graph.microsoft.com/v1.0/users/helm%40sevenbillion.co/sendMail')
    expect((send.init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect(JSON.parse(send.init.body as string)).toEqual({
      message: {
        subject: 'Hello', body: { contentType: 'HTML', content: '<p>Hi</p>' },
        from: { emailAddress: { address: 'helm@sevenbillion.co', name: 'Helm · Seven Billion' } },
        toRecipients: [{ emailAddress: { address: 'client@acme.com' } }],
        replyTo: [{ emailAddress: { address: 'team@sevenbillion.co' } }],
      },
      saveToSentItems: false,
    })
  })

  it('reports why Microsoft refused, so the outbox retries and the log shows it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/oauth2/')
      ? new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: 'Access is denied.' } }), { status: 403 })))
    const { sendMail } = await load({})
    await expect(sendMail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' })).rejects.toThrow('Microsoft 365 did not send it: Access is denied.')
  })

  it('falls back to Resend, and to nothing, when Microsoft is not set up', async () => {
    expect((await load({ MS_SENDER: '', RESEND_API_KEY: 're_123' })).mailTransport().kind).toBe('resend')
    expect((await load({ MS_SENDER: '', RESEND_API_KEY: '' })).mailTransport().kind).toBe('none')
  })
})
