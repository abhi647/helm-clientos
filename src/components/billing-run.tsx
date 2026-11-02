import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { runBilling } from '@/app/_actions/billing'
import { ActionForm } from '@/components/forms'
import { Card, Chip, Empty, cn } from '@/components/ui'
import { money } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const MODEL = { time_materials: ['T&M', 'info'], dedicated: ['Dedicated', 'info'], fixed_price: ['Fixed fee', 'review'], retainer: ['Retainer', 'good'] } as const
const qtyText = (q: number, unit: string) => `${+q.toFixed(2)} ${unit === 'month' ? (q === 1 ? 'month' : 'months') : unit === 'day' ? (q === 1 ? 'day' : 'days') : unit === 'hour' ? 'h' : unit}`

/**
 * The monthly billing run, as PSA tools do it: for the chosen month, every project with agreed rates, each line's
 * amount and the reason for it (hours approved, working days less leave, a milestone that is due, the retainer and
 * any hours over). Tick, create the statements in one go, and optionally send them to the customers.
 */
export async function BillingRun({ month }: { month?: string }) {
  const now = new Date()
  const [y, m] = month && /^\d{4}-\d{2}$/.test(month) ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1]
  const start = new Date(Date.UTC(y!, m! - 1, 1)), end = new Date(Date.UTC(y!, m!, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const key = (d: Date) => iso(d).slice(0, 7)
  const label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const supabase = await createClient()
  const [{ data: rows }, { data: projects }] = await Promise.all([
    supabase.rpc('billing_preview', { p_start: iso(start), p_end: iso(end) }),
    supabase.from('projects').select('id, name, billing_model, customers(name), rate_cards(status)').eq('status', 'active').order('name'),
  ])
  type Row = NonNullable<typeof rows>[number]
  const byProject = new Map<string, Row[]>()
  for (const r of rows ?? []) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r])
  const notSetUp = (projects ?? []).filter((p) => !p.billing_model || !p.rate_cards.some((c) => c.status === 'approved'))
  const totals = new Map<string, number>()
  for (const r of rows ?? []) if (!r.statement_id || r.milestone) totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.amount))
  const prev = new Date(Date.UTC(y!, m! - 2, 1)), next = new Date(Date.UTC(y!, m!, 1))

  return (
    <Card flush title="Billing run" description="Every project’s lines for the month, worked out from its contract: tick and create the statements together"
      extra={
        <span className="flex items-center gap-2">
          <span className="tabular text-[13px] font-semibold text-foreground">{[...totals].map(([c, v]) => money(v, c)).join(' + ') || '–'}</span>
          <nav aria-label="Month" className="inline-flex h-7 items-center rounded-md border border-border bg-card">
            <Link href={`?month=${key(prev)}`} aria-label="Previous month" className="grid h-full w-7 place-items-center text-foreground no-underline hover:bg-muted"><ChevronLeft className="size-3.5" /></Link>
            <span className="border-x border-border px-2 text-xs font-medium">{label}</span>
            <Link href={`?month=${key(next)}`} aria-label="Next month" className="grid h-full w-7 place-items-center text-foreground no-underline hover:bg-muted"><ChevronRight className="size-3.5" /></Link>
          </nav>
        </span>
      }>
      <ActionForm action={runBilling} submit={`Create the ticked statements for ${label}`} resetOnSuccess={false} className="gap-0 [&>div:last-child]:border-t [&>div:last-child]:border-line-soft [&>div:last-child]:p-3">
        <input type="hidden" name="period_start" value={iso(start)} /><input type="hidden" name="period_end" value={iso(end)} />
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="row row-head grid-cols-[28px_minmax(0,1.3fr)_90px_minmax(0,1fr)_minmax(0,1.5fr)_100px_130px]">
              <span /><span>Project</span><span>Model</span><span>Line</span><span>Why</span><span className="text-right">Quantity</span><span className="text-right">Amount</span>
            </div>
            {[...byProject.entries()].map(([pid, lines]) => {
              const head = lines[0]!
              const period = lines.filter((l) => !l.milestone)
              const billed = period.find((l) => l.statement_id)?.statement_id
              const [mLabel, tone] = MODEL[head.model ?? 'time_materials']
              return (
                <div key={pid} className="border-t border-line-soft">
                  {lines.map((l, i) => (
                    <div key={l.line_id} className={cn('row grid-cols-[28px_minmax(0,1.3fr)_90px_minmax(0,1fr)_minmax(0,1.5fr)_100px_130px] border-t-0', i > 0 && 'min-h-7')}>
                      <span>{l.milestone
                        ? <input type="checkbox" name="milestone" value={l.line_id} defaultChecked aria-label={`Bill ${l.label}`} className="accent-primary" />
                        : i === lines.findIndex((x) => !x.milestone) && !billed ? <input type="checkbox" name="project" value={pid} defaultChecked aria-label={`Bill ${head.project_name} for ${label}`} className="accent-primary" /> : null}</span>
                      <span className="truncate">{i === 0 ? <Link href={`/projects/${pid}/billing`} className="text-ink no-underline hover:underline"><span className="text-muted-foreground">{head.customer_name} · </span>{head.project_name}</Link> : null}</span>
                      <span>{i === 0 ? <Chip tone={tone}>{mLabel}</Chip> : null}</span>
                      <span className="truncate text-xs">{l.milestone ? <b className="font-medium">Milestone: </b> : null}{l.label}</span>
                      <span className="truncate text-xs text-muted-foreground" title={l.basis ?? ''}>{l.basis}</span>
                      <span className="tabular text-right text-xs">{qtyText(Number(l.quantity), l.unit)}</span>
                      <span className={cn('tabular text-right text-xs', !l.milestone && billed ? 'text-muted-foreground line-through' : 'font-medium')}>{money(Number(l.amount), l.currency, { exact: true })}</span>
                    </div>
                  ))}
                  {billed ? <p className="m-0 px-3.5 pb-1.5 pl-[42px] text-[11px] text-muted-foreground">Already on a statement for {label}. <Link href={`/projects/${pid}/billing/${billed}`}>Open it →</Link></p> : null}
                  {head.cap != null && period.some((l) => l.kind === 'day_rate') && period.filter((l) => l.kind === 'day_rate').reduce((a, l) => a + Number(l.amount), 0) > Number(head.cap)
                    ? <p className="m-0 px-3.5 pb-1.5 pl-[42px] text-[11px] text-warn-ink">Over the monthly cap of {money(Number(head.cap), head.currency)}: the statement is capped.</p> : null}
                </div>
              )
            })}
            {notSetUp.map((p) => (
              <div key={p.id} className="row grid-cols-[28px_minmax(0,1.3fr)_90px_minmax(0,1fr)_minmax(0,1.5fr)_100px_130px]">
                <span /><span className="truncate"><span className="text-muted-foreground">{p.customers?.name} · </span>{p.name}</span>
                <span><Chip tone="warn">Not set up</Chip></span>
                <span className="text-xs text-muted-foreground">{p.rate_cards.length ? 'Rates waiting for approval' : 'No billing set-up'}</span>
                <span /><span />
                <Link href={`/projects/${p.id}/billing`} className="text-right text-xs font-medium">Set up →</Link>
              </div>
            ))}
            {!byProject.size && !notSetUp.length ? <Empty title="Nothing to bill this month" /> : null}
          </div>
        </div>
        <label className="flex items-center gap-2 border-t border-line-soft px-3.5 py-2 text-xs"><input type="checkbox" name="send" className="accent-primary" /> Send each statement to the customer for approval straight away</label>
      </ActionForm>
    </Card>
  )
}
