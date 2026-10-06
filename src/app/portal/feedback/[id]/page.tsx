import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FeedbackKindChip, FeedbackStatusChip } from '@/components/feedback-parts'
import { Thread } from '@/components/thread'
import { Card } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Feedback' }

export default async function PortalFeedbackItem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const [{ id }, { sent }] = await Promise.all([params, searchParams])
  const me = await requireCustomer()
  const supabase = await createClient()
  const { data: f } = await supabase.from('feedback').select('*, projects(name), from:profiles!feedback_submitted_by_fkey(full_name)').eq('id', id).maybeSingle()
  if (!f) notFound()
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-3">
      <Link href="/portal/feedback" className="text-[13px]">← Feedback</Link>
      {sent ? <p role="status" className="m-0 rounded-md bg-good-bg px-3 py-2 text-[13px] font-medium text-good-ink">Thank you. {sent} was sent to your account owner.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 text-lg font-semibold"><span className="font-mono text-muted">{f.number}</span> {f.projects?.name ?? 'Seven Billion in general'}</h1>
        <FeedbackKindChip kind={f.kind} /><FeedbackStatusChip status={f.status} />
        <span className="text-xs text-muted">{f.from?.full_name} · {relativeTime(f.created_at)}</span>
      </div>
      <Card><p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap">{f.body}</p></Card>
      <Card title="Conversation"><Thread entityType="feedback" entityId={f.id} customerId={f.customer_id} me={me} /></Card>
    </div>
  )
}
