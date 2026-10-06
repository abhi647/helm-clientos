import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FeedbackControls } from '@/components/feedback-controls'
import { FeedbackKindChip, FeedbackStatusChip, ScoreChip } from '@/components/feedback-parts'
import { Thread } from '@/components/thread'
import { Card, PageHeader } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Feedback' }

export default async function FeedbackItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: f } = await supabase.from('feedback')
    .select('*, customers(id, name), projects(id, name), from:profiles!feedback_submitted_by_fkey(full_name), csat:csat_surveys(score, kind, comment)')
    .eq('id', id).maybeSingle()
  if (!f) notFound()
  const { data: staff } = await supabase.from('profiles').select('id, full_name').eq('kind', 'internal').order('full_name')
  return (
    <>
      <PageHeader title={<><span className="font-mono text-muted">{f.number}</span> Feedback from {f.from?.full_name ?? f.customers?.name}</>}
        meta={<><FeedbackKindChip kind={f.kind} /><FeedbackStatusChip status={f.status} /><span className="text-xs text-muted">{relativeTime(f.created_at)}</span></>}
        actions={<FeedbackControls id={f.id} status={f.status} ownerId={f.owner_id ?? ''} people={(staff ?? []).map((p) => ({ id: p.id, name: p.full_name }))} />}>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/feedback" className="text-muted no-underline hover:text-ink">CSAT & feedback</Link><span>/</span><span className="text-ink">{f.number}</span>
        </nav>
      </PageHeader>
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-3">
          <Card title="Feedback">
            <p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap">{f.body}</p>
          </Card>
          <Card title="Reply to the customer">
            <Thread entityType="feedback" entityId={f.id} customerId={f.customer_id} me={me} defaultShared />
          </Card>
        </div>
        <Card className="min-w-0 flex-[1_1_300px]" title="Details">
          <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-[13px]">
            <dt className="text-muted">Customer</dt><dd className="m-0"><Link href={`/customers/${f.customers?.id}`}>{f.customers?.name}</Link></dd>
            <dt className="text-muted">Project</dt><dd className="m-0">{f.projects ? <Link href={`/projects/${f.projects.id}`}>{f.projects.name}</Link> : '–'}</dd>
            <dt className="text-muted">Source</dt><dd className="m-0">{f.source === 'csat' ? 'Low CSAT score (automatic follow-up)' : 'Sent from the portal'}</dd>
            {f.csat?.score ? <><dt className="text-muted">Score</dt><dd className="m-0"><ScoreChip score={f.csat.score} /></dd></> : null}
          </dl>
          <p className="mt-3 mb-0 text-xs text-muted">Moving it to Acknowledged, Actioned or Closed tells the customer.</p>
        </Card>
      </div>
    </>
  )
}
