import 'server-only'
import { Resend } from 'resend'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeEmail, type EmailContext } from '@/lib/email-copy'
import { effort, shortDate } from '@/lib/format'

type Db = ReturnType<typeof createAdminClient>
const UUID = '[0-9a-f-]{36}'
const label = (s: string) => (s === 'uat' ? 'UAT' : s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))

/**
 * Who the email is for and what it is about. Reads with the service key, so it only adds fields the recipient can
 * already see in Helm: customers never get internal tasks, effort on internal work, or anything from another customer.
 */
async function emailContext(db: Db, userId: string, link: string): Promise<EmailContext> {
  const { data: me } = await db.from('profiles').select('full_name, kind, customer_id, org_id').eq('id', userId).maybeSingle()
  const customerSide = me?.kind === 'customer'
  const first = (me?.full_name ?? '').trim().split(/\s+/)[0] || 'there'
  const workspace = customerSide
    ? (await db.from('customers').select('name').eq('id', me!.customer_id!).maybeSingle()).data?.name ?? 'your'
    : (await db.from('orgs').select('name').eq('id', me?.org_id ?? '').maybeSingle()).data?.name ?? 'Seven Billion'
  const c: EmailContext = { first, customerSide, workspace }
  const path = new URL(link).pathname.replace(/^\/portal/, '')
  const id = (re: string) => path.match(new RegExp(re))?.[1]
  const mine = (customerId: string) => !customerSide || customerId === me?.customer_id

  const reqId = id(`^/requests/(${UUID})`)
  const apprId = id(`^/approvals/(${UUID})`)
  const projId = id(`^/projects/(${UUID})`)
  const taskId = new URL(link).searchParams.get('task')

  if (reqId) {
    const { data: r } = await db.from('requests').select('number, status, priority, desired_date, customer_id, customers(name), projects(name)').eq('id', reqId).maybeSingle()
    if (r && mine(r.customer_id)) {
      c.customer = r.customers?.name
      c.stage = r.status === 'cancelled' ? null : r.status
      c.details = [['Request', r.number], ['Project', r.projects?.name ?? ''], ['Stage', label(r.status)], ['Priority', label(r.priority)], ['Wanted by', r.desired_date ? shortDate(r.desired_date) : '']]
    }
  } else if (apprId) {
    const { data: a } = await db.from('approvals').select('effort, effort_unit, target_date, due_date, customer_id, customers(name), projects(name), requests(number)').eq('id', apprId).maybeSingle()
    if (a && mine(a.customer_id)) {
      c.customer = a.customers?.name
      c.details = [['Request', a.requests?.number ?? ''], ['Project', a.projects?.name ?? ''], ['Effort', a.effort != null ? effort(Number(a.effort), a.effort_unit) : ''],
        ['Target date', a.target_date ? shortDate(a.target_date) : ''], ['Decision needed by', a.due_date ? shortDate(a.due_date) : '']]
    }
  } else if (projId && taskId && new RegExp(`^${UUID}$`).test(taskId)) {
    const { data: t } = await db.from('tasks').select('due_date, visibility, customer_id, customers(name), projects(name), task_estimates(estimate, unit)').eq('id', taskId).maybeSingle()
    if (t && mine(t.customer_id) && (!customerSide || t.visibility === 'shared')) {
      c.customer = t.customers?.name
      c.details = [['Project', t.projects?.name ?? ''], ['Due', t.due_date ? shortDate(t.due_date) : ''],
        ['Estimate', !customerSide && t.task_estimates?.estimate ? effort(Number(t.task_estimates.estimate), t.task_estimates.unit) : '']]
    }
  } else if (projId) {
    const { data: p } = await db.from('projects').select('name, health, end_date, customer_id, customers(name)').eq('id', projId).maybeSingle()
    if (p && mine(p.customer_id)) {
      c.customer = p.customers?.name
      c.details = [['Project', p.name], ['Health', label(p.health)], ['Ends', p.end_date ? shortDate(p.end_date) : '']]
    }
  }
  return c
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
    .select('id, to_email, attempts, notification:notifications(user_id, kind, title, body, link)')
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
    const ctx = await emailContext(db, n.user_id, link).catch((err) => {
      console.error('[email] context', err)
      return { first: 'there', customerSide: false, workspace: 'Helm' } satisfies EmailContext
    })
    const { subject, html, text } = composeEmail({ kind: n.kind, title: n.title, body: n.body, link, c: ctx, siteOrigin: new URL(link).origin, to: row.to_email })

    if (!resend) {
      console.info(`[email:dev] to=${row.to_email} subject="${subject}" link=${link}`)
      await db.from('email_outbox').update({ status: 'skipped', last_error: 'RESEND_API_KEY not set' }).eq('id', row.id)
      result.skipped++
      continue
    }
    const { data, error: sendError } = await resend.emails.send(
      { from: e.EMAIL_FROM, to: [row.to_email], subject, html, text, tags: [{ name: 'kind', value: n.kind.replace(/[^a-zA-Z0-9_-]/g, '_') }] },
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
