import { Stat } from '@/components/ui'
import { daysFromToday, isoDaysAgo } from '@/lib/format'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The customer's meters, first thing on their home page: how the projects are going, what waits on them, the
 * requests in flight and (for executives and anyone with invoice access) invoices. Each meter is green when all is
 * well, amber when something needs a look and red when it needs action, and opens the list behind it.
 */
export async function PortalMeters({ me, decisions }: { me: Profile; decisions?: number }) {
  const supabase = await createClient()
  const [{ data: projects }, { data: actions }, { data: requests }, { data: invoices }] = await Promise.all([
    supabase.from('projects').select('health').eq('status', 'active'),
    supabase.from('action_items').select('assignee_id, due_date').eq('status', 'open'),
    supabase.from('requests').select('status, delivered_at:updated_at').not('status', 'eq', 'cancelled'),
    me.can_view_invoices ? supabase.from('invoices').select('due_on').neq('status', 'paid') : Promise.resolve({ data: null }),
  ])
  const p = projects ?? []
  const onTrack = p.filter((x) => x.health === 'on_track').length
  const atRisk = p.filter((x) => x.health === 'at_risk').length
  const a = actions ?? []
  // an executive's own decisions (approvals named to them), else the to-dos for this person or the whole team
  const mine = decisions ?? a.filter((x) => x.assignee_id === me.id || !x.assignee_id).length
  const late = a.filter((x) => (daysFromToday(x.due_date) ?? 0) < 0).length
  const r = requests ?? []
  const open = r.filter((x) => x.status !== 'delivered').length
  const since = isoDaysAgo(30)
  const delivered = r.filter((x) => x.status === 'delivered' && x.delivered_at >= since).length
  const overdueInv = (invoices ?? []).filter((i) => (daysFromToday(i.due_on) ?? 0) < 0).length

  return (
    <div className="card grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] overflow-hidden" aria-label="Your engagement at a glance">
      <Stat label="Projects on track" value={`${onTrack}/${p.length}`} sub={atRisk ? `${atRisk} at risk` : undefined}
        pct={p.length ? (100 * onTrack) / p.length : 0} tone={atRisk ? 'crit' : onTrack < p.length ? 'warn' : 'good'} />
      <Stat label={decisions != null ? 'Decisions waiting on you' : 'Waiting on you'} value={mine} sub={mine ? 'to do' : 'all clear'} tone={mine ? 'warn' : 'good'} href="/portal?view=actions" />
      <Stat label="Overdue on your side" value={late} sub="across your team" tone={late ? 'crit' : 'good'} href="/portal?view=actions" />
      <Stat label="Requests in progress" value={open} sub={`${delivered} delivered in 30 days`} tone="info" href="/portal/requests" />
      {invoices ? <Stat label="Invoices overdue" value={overdueInv} sub={`${invoices.length} unpaid`} tone={overdueInv ? 'crit' : invoices.length ? 'info' : 'good'} href="/portal/invoices" /> : null}
    </div>
  )
}
