import 'server-only'
import { Resend } from 'resend'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** One branded, accessible HTML layout for every notification email. */
export function renderEmail({ title, body, link, cta }: { title: string; body: string; link: string; cta: string }) {
  const site = new URL(link).origin   // the logo is served by the app itself (public/brand)
  const paragraphs = body
    ? body.split(/\n+/).map((p) => `<p style="margin:0 0 10px">${esc(p)}</p>`).join('')
    : ''
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f7;font-family:'IBM Plex Sans',Arial,sans-serif;color:#13343b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e7e9;border-radius:6px">
<tr><td style="padding:20px 24px 4px"><img src="${site}/brand/mark-64.png" width="26" height="26" alt="Seven Billion" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px"><span style="font-weight:600;font-size:13px;margin-left:8px">Seven Billion</span></td></tr>
<tr><td style="padding:10px 24px 4px"><h1 style="margin:0;font-size:18px;line-height:1.35">${esc(title)}</h1></td></tr>
<tr><td style="padding:6px 24px 6px;font-size:14px;line-height:1.55;color:#4a5b60">${paragraphs}</td></tr>
<tr><td style="padding:4px 24px 22px"><a href="${esc(link)}" style="display:inline-block;background:#13343b;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:4px">${esc(cta)}</a></td></tr>
<tr><td style="padding:12px 24px 18px;border-top:1px solid #eef1f2;font-size:12px;color:#5b6b70">You get this because you are part of a Seven Billion workspace. Notification settings are in your workspace.</td></tr>
</table></td></tr></table></body></html>`
  const text = `${title}\n\n${body}\n\n${cta}: ${link}`
  return { html, text }
}

const CTA: Record<string, string> = {
  'approval.requested': 'Review and approve', 'approval.resubmitted': 'Review the revision', 'action.assigned': 'Open my actions',
  'request.submitted': 'Open the request', 'request.status': 'See progress', 'update.published': 'Read the update',
}

/**
 * Sends queued emails from the outbox. Safe to run from several places at once: each row is claimed atomically,
 * and the outbox id is the Resend idempotency key, so a retry never sends twice.
 */
export async function flushOutbox(limit = 25): Promise<{ sent: number; skipped: number; failed: number }> {
  const e = env()
  const db = createAdminClient()
  const resend = e.RESEND_API_KEY ? new Resend(e.RESEND_API_KEY) : null
  const result = { sent: 0, skipped: 0, failed: 0 }

  const { data: queue, error } = await db
    .from('email_outbox')
    .select('id, to_email, attempts, notification:notifications(kind, title, body, link)')
    .eq('status', 'queued').lt('attempts', 5).order('created_at').limit(limit)
  if (error) throw error

  for (const row of queue ?? []) {
    // claim the row so a concurrent run skips it
    const { data: claimed } = await db.from('email_outbox').update({ attempts: row.attempts + 1 })
      .eq('id', row.id).eq('status', 'queued').eq('attempts', row.attempts).select('id')
    if (!claimed?.length) continue
    const n = row.notification
    if (!n) {
      await db.from('email_outbox').update({ status: 'skipped', last_error: 'notification removed' }).eq('id', row.id)
      result.skipped++
      continue
    }
    const link = new URL(n.link ?? '/', e.NEXT_PUBLIC_SITE_URL).toString()
    const { html, text } = renderEmail({ title: n.title, body: n.body, link, cta: CTA[n.kind] ?? 'Open in Seven Billion' })

    if (!resend) {
      console.info(`[email:dev] to=${row.to_email} subject="${n.title}" link=${link}`)
      await db.from('email_outbox').update({ status: 'skipped', last_error: 'RESEND_API_KEY not set' }).eq('id', row.id)
      result.skipped++
      continue
    }
    const { data, error: sendError } = await resend.emails.send(
      { from: e.EMAIL_FROM, to: [row.to_email], subject: n.title, html, text, tags: [{ name: 'kind', value: n.kind.replace(/[^a-zA-Z0-9_-]/g, '_') }] },
      { idempotencyKey: `outbox-${row.id}` },
    )
    if (sendError) {
      await db.from('email_outbox').update({ last_error: sendError.message, status: row.attempts + 1 >= 5 ? 'failed' : 'queued' }).eq('id', row.id)
      result.failed++
    } else {
      await db.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: data?.id ?? null }).eq('id', row.id)
      result.sent++
    }
  }
  return result
}
