import 'server-only'
import { Resend } from 'resend'
import { env } from '@/lib/env'

export type Outgoing = { to: string; subject: string; html: string; text: string; tag?: string; idempotencyKey?: string }

/** Helm sends its emails through Resend. */
export function mailTransport(): { kind: 'resend' | 'none'; from: string } {
  const e = env()
  return e.RESEND_API_KEY ? { kind: 'resend', from: e.EMAIL_FROM } : { kind: 'none', from: '' }
}

/** Sends one email. Returns Resend's message id or throws with a readable reason. */
export async function sendMail(m: Outgoing): Promise<string | null> {
  const e = env()
  if (!e.RESEND_API_KEY) throw new Error('No email service is set up (RESEND_API_KEY)')
  const { data, error } = await new Resend(e.RESEND_API_KEY).emails.send(
    { from: e.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text,
      ...(e.EMAIL_REPLY_TO ? { replyTo: e.EMAIL_REPLY_TO } : {}),
      ...(m.tag ? { tags: [{ name: 'kind', value: m.tag.replace(/[^a-zA-Z0-9_-]/g, '_') }] } : {}) },
    m.idempotencyKey ? { idempotencyKey: m.idempotencyKey } : undefined,
  )
  if (error) throw new Error(error.message)
  return data?.id ?? null
}
