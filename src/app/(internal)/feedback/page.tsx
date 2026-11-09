import type { Metadata } from 'next'
import Link from 'next/link'
import { MonthlyCsat, ScoreBars } from '@/components/csat-charts'
import { FeedbackKindChip, FeedbackStatusChip, ScoreChip } from '@/components/feedback-parts'
import { Card, Empty, PageHeader, Stat, cn } from '@/components/ui'
import { SCORE_LABEL, byMonth, summarise } from '@/lib/csat'
import { ageInDays, isoDaysAgo, relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { DataGrid } from '@/components/data-grid'
import { LinkTabs } from '@/components/link-tabs'

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
      <PageHeader title="CSAT & feedback" meta={<span className="text-xs text-muted-foreground">Last 90 days · satisfied = 4 or 5 out of 5</span>} />
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <Stat label="CSAT" value={k.csat == null ? '–' : `${k.csat}%`} sub={k.responses ? `${k.distribution.filter((d) => d.score >= 4).reduce((a, d) => a + d.count, 0)} of ${k.responses} satisfied` : 'no answers yet'} />
            <Stat label="Average score" value={k.average == null ? '–' : k.average.toFixed(1)} sub="out of 5" />
            <Stat label="Responses" value={k.responses} sub={`of ${k.sent} asked`} />
            <Stat label="Response rate" value={k.responseRate == null ? '–' : `${k.responseRate}%`} />
            <Stat label="Open feedback" value={open.length} tone={open.length ? 'warn' : undefined} />
            <Stat label="Low scores to follow up" value={lowOpen} tone={lowOpen ? 'crit' : undefined} />
        </div>


        <div className="flex flex-wrap items-start gap-3">
          <Card className="min-w-0 flex-[999_1_520px]" title="CSAT by month" extra="% of answers scored 4 or 5">
            <MonthlyCsat months={months} />
          </Card>
          <Card className="min-w-0 flex-[1_1_320px]" title="Score spread" extra="Last 90 days">
            {k.responses ? <ScoreBars distribution={k.distribution} labels={SCORE_LABEL} /> : <Empty title="No answers yet" />}
          </Card>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Card flush className="min-w-0 flex-[999_1_620px]" title="Feedback inbox"
            extra={<LinkTabs label="Feedback filter" value={view === 'all' ? 'all' : 'open'} items={[
              { value: 'open', label: 'Open', count: open.length, href: '/feedback' }, { value: 'all', label: 'All', count: fb.length, href: '/feedback?view=all' },
            ]} />}>
            <DataGrid label="Feedback inbox" search searchLabel="Search feedback" pageSize={20}
              empty={<Empty title={view === 'all' ? 'No feedback yet' : 'Nothing open'} />}
              columns={[
                { key: 'ref', label: 'Ref', sortable: true, className: 'w-[70px]' }, { key: 'type', label: 'Type', sortable: true, className: 'w-[110px]' },
                { key: 'customer', label: 'Customer', sortable: true, className: 'w-[140px]' }, { key: 'body', label: 'Feedback' },
                { key: 'owner', label: 'Owner', sortable: true, className: 'w-[110px]' }, { key: 'status', label: 'Status', sortable: true, className: 'w-[120px]' },
                { key: 'age', label: 'Age', sortable: true, align: 'right', className: 'w-[56px]' },
              ]}
              rows={shown.map((f) => ({
                id: f.id, href: `/feedback/${f.id}`,
                values: { ref: f.number, type: f.kind, customer: f.customers?.name, body: f.body, owner: f.owner?.full_name, status: f.status, age: -Date.parse(f.created_at) },
                cells: {
                  ref: <Link href={`/feedback/${f.id}`} className="font-mono text-xs text-muted-foreground no-underline hover:underline">{f.number}</Link>,
                  type: <FeedbackKindChip kind={f.kind} />,
                  customer: <span className="block max-w-[140px] truncate">{f.customers?.name}</span>,
                  body: <Link href={`/feedback/${f.id}`} className="block max-w-[360px] truncate text-foreground no-underline hover:underline">{f.source === 'csat' ? <b className="font-semibold text-crit-ink">Low score · </b> : null}{f.body}</Link>,
                  owner: <span className="block truncate text-xs">{f.owner?.full_name ?? <span className="text-muted-foreground">Unassigned</span>}</span>,
                  status: <FeedbackStatusChip status={f.status} />,
                  age: <span className="font-mono text-xs text-muted-foreground">{ageInDays(f.created_at)}</span>,
                },
              }))} />
          </Card>

          <Card flush className="min-w-0 flex-[1_1_340px]" title="What customers said">
            {comments.length ? comments.map((s) => (
              <div key={s.id} className="flex flex-col gap-1 border-t border-border/60 px-3 py-2 first:border-t-0">
                <span className="flex items-center gap-1.5 text-xs">
                  <ScoreChip score={s.score!} /><b>{s.recipient?.full_name}</b><span className="truncate text-muted-foreground">{s.customers?.name}</span>
                  <span className="ml-auto text-muted-foreground">{relativeTime(s.answered_at!)}</span>
                </span>
                <span className="text-[13px] leading-snug">“{s.comment}”</span>
                <span className="text-[11px] text-muted-foreground">{KIND_LABEL[s.kind]}{s.requests ? ` · ${s.requests.number}` : ''}</span>
              </div>
            )) : <Empty title="No comments yet" />}
          </Card>
        </div>

        <Card flush title="By customer" extra="Last 90 days">
          <DataGrid label="By customer"
            columns={[
              { key: 'name', label: 'Customer', sortable: true }, { key: 'csat', label: 'CSAT', sortable: true, align: 'right', className: 'w-[90px]' },
              { key: 'resp', label: 'Responses', className: 'w-[100px]' }, { key: 'last', label: 'Last score', className: 'w-[110px]' },
              { key: 'open', label: 'Open feedback', sortable: true, align: 'right', className: 'w-[120px]' },
            ]}
            rows={(customers ?? []).map((c) => {
              const rows = last90.filter((s) => s.customer_id === c.id)
              const cs = summarise(rows)
              const last = rows.find((s) => s.score != null)
              const o = open.filter((f) => f.customers?.name === c.name).length
              return {
                id: c.id, href: `/customers/${c.id}`,
                values: { name: c.name, csat: cs.csat, open: o },
                cells: {
                  name: <Link href={`/customers/${c.id}`} className="block truncate font-medium text-foreground no-underline hover:underline">{c.name}</Link>,
                  csat: <span className="font-mono text-xs font-semibold">{cs.csat == null ? '–' : `${cs.csat}%`}</span>,
                  resp: <span className="font-mono text-xs">{cs.responses}/{cs.sent}</span>,
                  last: last ? <ScoreChip score={last.score!} /> : <span className="text-xs text-muted-foreground">–</span>,
                  open: <span className={cn('font-mono text-xs', o && 'font-semibold text-warn-ink')}>{o}</span>,
                },
              }
            })} />
        </Card>
      </div>
    </>
  )
}
