import type { Metadata } from 'next'
import Link from 'next/link'
import { MonthlyCsat, ScoreBars } from '@/components/csat-charts'
import { FeedbackKindChip, FeedbackStatusChip, ScoreChip } from '@/components/feedback-parts'
import { Card, Empty, PageHeader, Stat, cn } from '@/components/ui'
import { SCORE_LABEL, byMonth, summarise } from '@/lib/csat'
import { ageInDays, isoDaysAgo, relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'CSAT & feedback' }

const KIND_LABEL = { request: 'Request delivered', pulse: 'Monthly check-in', closure: 'Project closure' } as const

/** Customer satisfaction and the feedback inbox. Every number here is counted from answers, nothing is estimated. */
export default async function FeedbackHome({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireStaff()
  const { view } = await searchParams
  const supabase = await createClient()
  const since = isoDaysAgo(183)
  const [{ data: surveys }, { data: items }, { data: customers }] = await Promise.all([
    supabase.from('csat_surveys').select('id, kind, score, comment, sent_at, answered_at, customer_id, request_id, customers(name), recipient:profiles!csat_surveys_recipient_id_fkey(full_name), requests(number)')
      .gte('sent_at', since).order('answered_at', { ascending: false, nullsFirst: false }),
    supabase.from('feedback').select('id, number, kind, body, status, source, created_at, customers(name), owner:profiles!feedback_owner_id_fkey(full_name)').order('created_at', { ascending: false }),
    supabase.from('customers').select('id, name').order('name'),
  ])
  const all = surveys ?? []
  const last90 = all.filter((s) => s.sent_at >= isoDaysAgo(90))
  const k = summarise(last90)
  const months = byMonth(all, 6, new Date(isoDaysAgo(0)))
  const fb = items ?? []
  const open = fb.filter((f) => f.status === 'new' || f.status === 'acknowledged')
  const lowOpen = open.filter((f) => f.source === 'csat' && f.status === 'new').length
  const shown = view === 'all' ? fb : open
  const comments = all.filter((s) => s.answered_at && s.comment).slice(0, 8)

  return (
    <>
      <PageHeader title="CSAT & feedback" meta={<span className="text-xs text-muted">Last 90 days · satisfied = 4 or 5 out of 5</span>} />
      <div className="flex flex-col gap-3 p-4">
        <Card flush className="overflow-x-auto">
          <div className="flex min-w-[760px]">
            <Stat label="CSAT" value={k.csat == null ? '–' : `${k.csat}%`} sub={k.responses ? `${k.distribution.filter((d) => d.score >= 4).reduce((a, d) => a + d.count, 0)} of ${k.responses} satisfied` : 'no answers yet'} />
            <Stat label="Average score" value={k.average == null ? '–' : k.average.toFixed(1)} sub="out of 5" />
            <Stat label="Responses" value={k.responses} sub={`of ${k.sent} asked`} />
            <Stat label="Response rate" value={k.responseRate == null ? '–' : `${k.responseRate}%`} />
            <Stat label="Open feedback" value={open.length} tone={open.length ? 'warn' : undefined} />
            <Stat label="Low scores to follow up" value={lowOpen} tone={lowOpen ? 'crit' : undefined} />
          </div>
        </Card>

        <div className="flex flex-wrap items-start gap-3">
          <Card className="min-w-0 flex-[999_1_520px]" title="CSAT by month" extra="% of answers scored 4 or 5">
            <MonthlyCsat months={months} />
          </Card>
          <Card className="min-w-0 flex-[1_1_320px]" title="Score spread" extra="Last 90 days">
            {k.responses ? <ScoreBars distribution={k.distribution} labels={SCORE_LABEL} /> : <Empty title="No answers yet" />}
          </Card>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Card flush className="min-w-0 flex-[999_1_620px] overflow-x-auto" title="Feedback inbox"
            extra={<span className="flex gap-2">
              <Link href="/feedback" className={cn(view !== 'all' && 'font-semibold text-ink')}>Open ({open.length})</Link>
              <Link href="/feedback?view=all" className={cn(view === 'all' && 'font-semibold text-ink')}>All ({fb.length})</Link>
            </span>}>
            <div className="min-w-[680px]">
              <div className="row row-head grid-cols-[64px_96px_130px_minmax(0,1fr)_110px_110px_48px]"><span>Ref</span><span>Type</span><span>Customer</span><span>Feedback</span><span>Owner</span><span>Status</span><span>Age</span></div>
              {shown.length ? shown.map((f) => (
                <Link key={f.id} href={`/feedback/${f.id}`} className="row grid-cols-[64px_96px_130px_minmax(0,1fr)_110px_110px_48px] text-ink no-underline hover:bg-head">
                  <span className="font-mono text-xs text-muted">{f.number}</span>
                  <span><FeedbackKindChip kind={f.kind} /></span>
                  <span className="truncate">{f.customers?.name}</span>
                  <span className="truncate">{f.source === 'csat' ? <b className="font-semibold text-crit-ink">Low score · </b> : null}{f.body}</span>
                  <span className="truncate text-xs">{f.owner?.full_name ?? <span className="text-muted">Unassigned</span>}</span>
                  <span><FeedbackStatusChip status={f.status} /></span>
                  <span className="font-mono text-xs text-muted">{ageInDays(f.created_at)}</span>
                </Link>
              )) : <Empty title={view === 'all' ? 'No feedback yet' : 'Nothing open'} />}
            </div>
          </Card>

          <Card flush className="min-w-0 flex-[1_1_340px]" title="What customers said">
            {comments.length ? comments.map((s) => (
              <div key={s.id} className="flex flex-col gap-1 border-t border-line-soft px-3 py-2 first:border-t-0">
                <span className="flex items-center gap-1.5 text-xs">
                  <ScoreChip score={s.score!} /><b>{s.recipient?.full_name}</b><span className="truncate text-muted">{s.customers?.name}</span>
                  <span className="ml-auto text-muted">{relativeTime(s.answered_at!)}</span>
                </span>
                <span className="text-[13px] leading-snug">“{s.comment}”</span>
                <span className="text-[11px] text-muted">{KIND_LABEL[s.kind]}{s.requests ? ` · ${s.requests.number}` : ''}</span>
              </div>
            )) : <Empty title="No comments yet" />}
          </Card>
        </div>

        <Card flush className="overflow-x-auto" title="By customer" extra="Last 90 days">
          <div className="min-w-[620px]">
            <div className="row row-head grid-cols-[minmax(0,1fr)_90px_100px_110px_120px]"><span>Customer</span><span>CSAT</span><span>Responses</span><span>Last score</span><span>Open feedback</span></div>
            {(customers ?? []).map((c) => {
              const rows = last90.filter((s) => s.customer_id === c.id)
              const cs = summarise(rows)
              const last = rows.find((s) => s.score != null)
              const o = open.filter((f) => f.customers?.name === c.name).length
              return (
                <Link key={c.id} href={`/customers/${c.id}`} className="row grid-cols-[minmax(0,1fr)_90px_100px_110px_120px] text-ink no-underline hover:bg-head">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="font-mono text-xs font-semibold">{cs.csat == null ? '–' : `${cs.csat}%`}</span>
                  <span className="font-mono text-xs">{cs.responses}/{cs.sent}</span>
                  <span>{last ? <ScoreChip score={last.score!} /> : <span className="text-xs text-muted">–</span>}</span>
                  <span className={cn('font-mono text-xs', o && 'font-semibold text-warn-ink')}>{o}</span>
                </Link>
              )
            })}
          </div>
        </Card>
      </div>
    </>
  )
}
