import Link from 'next/link'
import { Card, Chip, Empty, cn } from '@/components/ui'
import { money } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const MODEL = { time_materials: ['T&M', 'info'], fixed_price: ['Fixed', 'review'], retainer: ['Retainer', 'good'] } as const

/**
 * Finance's queue across every active project: what can be billed now (approved time, delivered milestones, this
 * month's retainer), what waits on the customer, and what is approved and ready to invoice. Projects without a
 * billing set-up are listed first so nothing slips.
 */
export async function ReadyToBillQueue() {
  const supabase = await createClient()
  const monthStart = new Date().toISOString().slice(0, 8) + '01'
  const [{ data: projects }, { data: cards }, { data: statements }, { data: unbilled }, { data: tasks }, { data: phases }] = await Promise.all([
    supabase.from('projects').select('id, name, billing_model, customers(name)').eq('status', 'active').order('name'),
    supabase.from('rate_cards').select('project_id, status, currency, rate_card_lines(id, kind, unit, label, rate)').in('status', ['approved', 'draft', 'pending', 'changes_requested']),
    supabase.from('billing_statements').select('project_id, status, zoho_invoice_number, period_start, statement_lines(kind, unit, label, amount)'),
    supabase.rpc('unbilled_time', {}),
    supabase.from('tasks').select('project_id, phase_id, status, parent_id').is('parent_id', null).limit(5000),
    supabase.from('phases').select('id, project_id, rate_line_id').not('rate_line_id', 'is', null),
  ])
  const rows = (projects ?? []).map((p) => {
    const live = cards?.find((c) => c.project_id === p.id && c.status === 'approved')
    const pendingCard = cards?.find((c) => c.project_id === p.id && c.status !== 'approved')
    const cur = live?.currency ?? 'INR'
    const st = (statements ?? []).filter((s) => s.project_id === p.id)
    const sum = (list: typeof st) => list.reduce((a, s) => a + s.statement_lines.reduce((b, l) => b + Number(l.amount ?? 0), 0), 0)
    const withCustomer = st.filter((s) => s.status === 'pending')
    const toInvoice = st.filter((s) => s.status === 'approved' && !s.zoho_invoice_number)
    const time = (unbilled ?? []).filter((u) => u.project_id === p.id).reduce((a, u) => a + Number(u.amount ?? 0), 0)
    // delivered milestones: their phase is all done and no statement has them yet
    const delivered = (live?.rate_card_lines ?? []).filter((l) => l.kind === 'delivery' && l.unit === 'milestone').filter((l) => {
      const ph = (phases ?? []).find((x) => x.project_id === p.id && x.rate_line_id === l.id)
      const work = (tasks ?? []).filter((t) => ph && t.phase_id === ph.id)
      const done = work.length > 0 && work.every((t) => t.status === 'done')
      return done && !st.some((s) => s.statement_lines.some((x) => x.kind === 'delivery' && x.unit === 'milestone' && x.label === l.label))
    })
    const retainerDue = p.billing_model === 'retainer' && live && !st.some((s) => s.period_start >= monthStart && s.statement_lines.some((l) => l.kind === 'retainer'))
    const ready = time + delivered.reduce((a, l) => a + Number(l.rate), 0) + (retainerDue ? Number(live?.rate_card_lines.find((l) => l.kind === 'retainer')?.rate ?? 0) : 0)
    return { p, live, pendingCard, cur, time, delivered, retainerDue, ready, withCustomer: sum(withCustomer), toInvoice: sum(toInvoice), nWith: withCustomer.length, nInvoice: toInvoice.length }
  })
  const notSetUp = rows.filter((r) => !r.p.billing_model || (!r.live && !r.pendingCard))
  const active = rows.filter((r) => !notSetUp.includes(r)).sort((a, b) => b.ready + b.toInvoice - (a.ready + a.toInvoice))
  const cols = 'grid-cols-[minmax(0,1.4fr)_80px_minmax(0,1.6fr)_130px_130px_130px_110px]'
  return (
    <Card flush title="Ready to bill" description="Every active project: what can be billed now, what waits on the customer, and what can go to Zoho">
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className={`row row-head ${cols}`}><span>Project</span><span>Model</span><span>Ready now</span><span className="text-right">To bill</span><span className="text-right">With customer</span><span className="text-right">To invoice</span><span /></div>
          {notSetUp.map((r) => (
            <div key={r.p.id} className={`row ${cols}`}>
              <span className="truncate"><span className="text-muted-foreground">{r.p.customers?.name} · </span>{r.p.name}</span>
              <span><Chip tone="warn">Not set up</Chip></span>
              <span className="text-xs text-muted-foreground">{r.pendingCard ? 'Rates waiting for approval' : 'Choose how this project is billed'}</span>
              <span /><span /><span />
              <Link href={`/projects/${r.p.id}/billing`} className="text-right text-xs font-medium">Set up →</Link>
            </div>
          ))}
          {active.map((r) => {
            const [m, tone] = MODEL[r.p.billing_model!]
            const what = [
              r.time ? `Approved time ${money(r.time, r.cur)}` : null,
              r.delivered.length ? `${r.delivered.length} milestone${r.delivered.length === 1 ? '' : 's'} delivered` : null,
              r.retainerDue ? 'This month’s retainer' : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={r.p.id} className={`row ${cols} hover:bg-head`}>
                <span className="truncate"><span className="text-muted-foreground">{r.p.customers?.name} · </span>{r.p.name}</span>
                <span><Chip tone={tone}>{m}</Chip></span>
                <span className={cn('truncate text-xs', what ? 'text-foreground' : 'text-muted-foreground')}>{what || 'Nothing new'}</span>
                <span className={cn('tabular text-right text-xs', r.ready ? 'font-semibold' : 'text-muted-foreground')}>{r.ready ? money(r.ready, r.cur) : '–'}</span>
                <span className="tabular text-right text-xs">{r.withCustomer ? <>{money(r.withCustomer, r.cur)} <span className="text-muted-foreground">({r.nWith})</span></> : '–'}</span>
                <span className={cn('tabular text-right text-xs', r.toInvoice && 'font-semibold text-good-ink')}>{r.toInvoice ? <>{money(r.toInvoice, r.cur)} <span className="font-normal text-muted-foreground">({r.nInvoice})</span></> : '–'}</span>
                <Link href={`/projects/${r.p.id}/billing`} className="text-right text-xs font-medium">{r.ready || r.toInvoice ? 'Bill →' : 'Open →'}</Link>
              </div>
            )
          })}
          {!rows.length ? <Empty title="No active projects" /> : null}
        </div>
      </div>
    </Card>
  )
}
