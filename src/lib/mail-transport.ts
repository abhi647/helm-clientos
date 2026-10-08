import 'server-only'
import { Resend } from 'resend'
import { env } from '@/lib/env'

export type Outgoing = { to: string; subject: string; html: string; text: string; tag?: string; idempotencyKey?: string }

/** Which service sends Helm's emails: a Microsoft 365 mailbox when configured, otherwise Resend. */
export function mailTransport(): { kind: 'microsoft' | 'resend' | 'none'; from: string } {
  const e = env()
  if (e.MS_TENANT_ID && e.MS_CLIENT_ID && e.MS_CLIENT_SECRET && e.MS_SENDER) return { kind: 'microsoft', from: e.MS_SENDER }
  if (e.RESEND_API_KEY) return { kind: 'resend', from: e.EMAIL_FROM }
  return { kind: 'none', from: '' }
}

// the display name from EMAIL_FROM ("Helm · Seven Billion <x@y>"), reused for the Microsoft sender
const displayName = (from: string) => from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? ''

let graphToken: { value: string; expires: number } | null = null
async function microsoftToken(): Promise<string> {
  if (graphToken && graphToken.expires > Date.now() + 60_000) return graphToken.value
  const e = env()
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(e.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: e.MS_CLIENT_ID, client_secret: e.MS_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !json.access_token) throw new Error(`Microsoft sign-in failed: ${json.error_description?.split('\n')[0] ?? res.status}`)
  graphToken = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return graphToken.value
}

/** Sends one email. Returns the provider's message id (Microsoft gives none) or throws with a readable reason. */
export async function sendMail(m: Outgoing): Promise<string | null> {
  const e = env()
  const t = mailTransport()
  if (t.kind === 'microsoft') {
    const name = displayName(e.EMAIL_FROM)
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(e.MS_SENDER)}/sendMail`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await microsoftToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: m.subject,
          body: { contentType: 'HTML', content: m.html },
          from: { emailAddress: { address: e.MS_SENDER, ...(name ? { name } : {}) } },
          toRecipients: [{ emailAddress: { address: m.to } }],
          ...(e.EMAIL_REPLY_TO ? { replyTo: [{ emailAddress: { address: e.EMAIL_REPLY_TO } }] } : {}),
        },
        saveToSentItems: false,
      }),
    })
    if (res.status !== 202) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(`Microsoft 365 did not send it: ${err.error?.message ?? res.status}`)
    }
    return null
  }
  if (t.kind === 'resend') {
    const { data, error } = await new Resend(e.RESEND_API_KEY).emails.send(
      { from: e.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text,
        ...(e.EMAIL_REPLY_TO ? { replyTo: e.EMAIL_REPLY_TO } : {}),
        ...(m.tag ? { tags: [{ name: 'kind', value: m.tag.replace(/[^a-zA-Z0-9_-]/g, '_') }] } : {}) },
      m.idempotencyKey ? { idempotencyKey: m.idempotencyKey } : undefined,
    )
    if (error) throw new Error(error.message)
    return data?.id ?? null
  }
  throw new Error('No email service is set up (RESEND_API_KEY, or the MS_* settings for Microsoft 365)')
}
