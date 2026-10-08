import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sendTestEmail } from '@/app/_actions/admin'
import { ActionForm } from '@/components/forms'
import { Card, Chip, Empty, PageHeader } from '@/components/ui'
import { mailTransport } from '@/lib/mail-transport'
import { relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'System health' }

const JOBS: { job: string; name: string; every: string; staleAfterMin: number }[] = [
  { job: 'emails', name: 'Emails, surveys and file scans', every: 'every 10 minutes', staleAfterMin: 60 },
  { job: 'zoho-sync', name: 'Zoho Books invoices and payments', every: 'hourly', staleAfterMin: 180 },
]

/** Admin and CEO: are emails going out, are the background jobs running, and what went wrong recently. */
export default async function SystemHealth() {
  const me = await requireStaff()
  const transport = mailTransport()
  if (!['admin', 'ceo'].includes(me.internal_role ?? '')) notFound()
  const supabase = await createClient()
  const [{ data: jobs }, { data: outbox }, { data: log }] = await Promise.all([
    supabase.from('job_runs').select('*'),
    supabase.rpc('outbox_health').maybeSingle(),
    supabase.from('system_log').select('id, at, level, source, message, detail').order('at', { ascending: false }).limit(50),
  ])
  const byJob = new Map((jobs ?? []).map((j) => [j.job, j]))
  const now = new Date().getTime()
  const oldestQueuedMin = outbox?.oldest_queued ? Math.round((now - new Date(outbox.oldest_queued).getTime()) / 60_000) : 0
  const emailsStuck = oldestQueuedMin > 30

  return (
    <>
      <PageHeader title="System health" meta={<Link href="/admin" className="text-xs text-muted no-underline hover:text-ink">← Admin</Link>} />
      <div className="flex max-w-[1100px] flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Card className="min-w-0 flex-[1_1_320px]" title="Emails">
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px]">
              <dt className="text-muted">Sent in the last 24 hours</dt><dd className="m-0 font-mono">{outbox?.sent_24h ?? 0}</dd>
              <dt className="text-muted">Waiting to send</dt>
              <dd className="m-0 font-mono">{outbox?.queued ?? 0}{outbox?.queued ? <span className={emailsStuck ? 'text-crit-ink' : 'text-muted'}> · oldest {oldestQueuedMin} min</span> : null}</dd>
              <dt className="text-muted">Failed in the last 7 days</dt><dd className={`m-0 font-mono ${outbox?.failed_7d ? 'text-crit-ink' : ''}`}>{outbox?.failed_7d ?? 0}</dd>
            </dl>
            {emailsStuck ? <p role="alert" className="mt-2 mb-0 text-xs text-crit-ink">Emails have been waiting over 30 minutes. Check the email job below and the Resend dashboard.</p> : null}
            <p className="mt-3 mb-2 text-xs text-muted">
              Sent through <b className="text-ink">{transport.kind === 'microsoft' ? `Microsoft 365 (${transport.from})` : transport.kind === 'resend' ? 'Resend' : 'nothing yet: no email service set up'}</b>
            </p>
            <ActionForm action={sendTestEmail} submit="Send test email" primary={false} resetOnSuccess={false}>
              <input name="to" type="email" required aria-label="Send a test email to" placeholder="someone@company.com" defaultValue={me.email ?? ''} className="input" />
            </ActionForm>
          </Card>
          <Card className="min-w-0 flex-[2_1_480px]" title="Background jobs">
            <div className="flex flex-col gap-2">
              {JOBS.map(({ job, name, every, staleAfterMin }) => {
                const r = byJob.get(job)
                const lastOk = r?.last_ok_at ? new Date(r.last_ok_at).getTime() : 0
                const stale = !lastOk || now - lastOk > staleAfterMin * 60_000
                const failing = !!r?.last_error && (!r.last_ok_at || (r.last_finished_at ?? '') > r.last_ok_at)
                return (
                  <div key={job} className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-2 text-[13px] last:border-b-0 last:pb-0">
                    <span className="min-w-[220px] flex-1"><b>{name}</b> <span className="text-xs text-muted">· {every}</span></span>
                    {failing ? <Chip tone="crit">Failing</Chip> : stale ? <Chip tone="warn">Not run lately</Chip> : <Chip tone="good">OK</Chip>}
                    <span className="text-xs text-muted">{r?.last_ok_at ? `last OK ${relativeTime(r.last_ok_at)}` : 'never run'}</span>
                    {failing ? <span className="w-full text-xs text-crit-ink">{r!.last_error}</span> : null}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
        <Card flush title="Recent problems and admin actions" extra="Last 50, kept for 90 days">
          {log?.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="row row-head grid-cols-[110px_80px_110px_minmax(0,1fr)]"><span>When</span><span>Level</span><span>Where</span><span>What</span></div>
                {log.map((l) => (
                  <div key={l.id} className="row grid-cols-[110px_80px_110px_minmax(0,1fr)] text-xs">
                    <span className="text-muted">{relativeTime(l.at)}</span>
                    <span><Chip tone={l.level === 'error' ? 'crit' : l.level === 'warn' ? 'warn' : 'neutral'}>{l.level}</Chip></span>
                    <span className="font-mono">{l.source}</span>
                    <span className="min-w-0 break-words">{l.message}{(l.detail as { path?: string })?.path ? <span className="text-muted"> · {(l.detail as { path?: string }).path}</span> : null}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <Empty title="Nothing has gone wrong">Server errors, failed emails and Zoho problems appear here.</Empty>}
        </Card>
      </div>
    </>
  )
}
