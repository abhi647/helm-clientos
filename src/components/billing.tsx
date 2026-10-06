import { Chip } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { money } from '@/lib/format'

export const KIND_LABEL: Record<Enums<'billing_kind'>, string> = {
  day_rate: 'Day rate per resource',
  delivery: 'Per delivery / milestone',
  unit: 'Per unit delivered',
  retainer: 'Monthly retainer',
}
export const KIND_UNIT: Record<Enums<'billing_kind'>, string> = { day_rate: 'day', delivery: 'delivery', unit: 'unit', retainer: 'month' }
// what "planned quantity" means for each model
export const PLANNED_LABEL: Record<Enums<'billing_kind'>, string | null> = { day_rate: 'Resources', delivery: null, unit: 'Planned units', retainer: null }

const CARD_TONE = { draft: 'neutral', pending: 'info', approved: 'good', changes_requested: 'warn', superseded: 'neutral' } as const
const CARD_TEXT = { draft: 'Draft', pending: 'Waiting for customer', approved: 'Approved', changes_requested: 'Changes requested', superseded: 'Replaced' }
export function RateCardStatus({ status }: { status: Enums<'rate_card_status'> }) {
  return <Chip tone={CARD_TONE[status]}>{CARD_TEXT[status]}</Chip>
}

const ST_TONE = { draft: 'neutral', pending: 'info', approved: 'good', changes_requested: 'warn', invoiced: 'good' } as const
const ST_TEXT = { draft: 'Draft', pending: 'Waiting for approval', approved: 'Approved', changes_requested: 'Changes requested', invoiced: 'Invoiced' }
export function StatementStatus({ status }: { status: Enums<'statement_status'> }) {
  return <Chip tone={ST_TONE[status]}>{ST_TEXT[status]}</Chip>
}

/** day → days, delivery → deliveries, month → months */
export const plural = (unit: string, qty = 2) => (qty === 1 ? unit : /[^aeiou]y$/i.test(unit) ? `${unit.slice(0, -1)}ies` : `${unit}s`)

export const period = (start: string, end: string) => {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `${f(start)} – ${f(end)}`
}

type RateLine = { id: string; kind: Enums<'billing_kind'>; label: string; unit: string; rate: number; planned_quantity: number | null; description: string }

/** Read-only rate card lines (staff and customers). */
export function RateLines({ lines, currency }: { lines: RateLine[]; currency: string }) {
  return (
    <div className="min-w-[560px]">
      <div className="row row-head grid-cols-[minmax(0,1fr)_170px_130px_110px]"><span>Item</span><span>Model</span><span className="text-right">Rate</span><span className="text-right">Planned</span></div>
      {lines.map((l) => (
        <div key={l.id} className="row grid-cols-[minmax(0,1fr)_170px_130px_110px]">
          <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{l.label}</span>{l.description ? <span className="truncate text-xs text-muted">{l.description}</span> : null}</span>
          <span className="text-xs">{KIND_LABEL[l.kind]}</span>
          <span className="text-right font-mono text-xs">{money(l.rate, currency, { exact: true })} <span className="text-muted">/ {l.unit}</span></span>
          <span className="text-right font-mono text-xs">{PLANNED_LABEL[l.kind] && l.planned_quantity != null ? `${l.planned_quantity} ${PLANNED_LABEL[l.kind]!.toLowerCase()}` : '–'}</span>
        </div>
      ))}
    </div>
  )
}

type StatementLine = { id: string; label: string; unit: string; rate: number; quantity: number; amount: number | null; note: string }

/** Read-only statement lines with the subtotal before tax (tax is added in Zoho). */
export function StatementLines({ lines, currency }: { lines: StatementLine[]; currency: string }) {
  const shown = lines.filter((l) => Number(l.quantity) > 0)
  const subtotal = shown.reduce((a, l) => a + Number(l.amount ?? 0), 0)
  return (
    <div className="min-w-[560px]">
      <div className="row row-head grid-cols-[minmax(0,1fr)_110px_130px_140px]"><span>Item</span><span className="text-right">Quantity</span><span className="text-right">Rate</span><span className="text-right">Amount</span></div>
      {shown.map((l) => (
        <div key={l.id} className="row grid-cols-[minmax(0,1fr)_110px_130px_140px]">
          <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{l.label}</span>{l.note ? <span className="truncate text-xs text-muted">{l.note}</span> : null}</span>
          <span className="text-right font-mono text-xs">{Number(l.quantity)} {plural(l.unit, Number(l.quantity))}</span>
          <span className="text-right font-mono text-xs">{money(l.rate, currency, { exact: true })}</span>
          <span className="text-right font-mono text-xs">{money(l.amount, currency, { exact: true })}</span>
        </div>
      ))}
      <div className="row grid-cols-[minmax(0,1fr)_140px] bg-head">
        <span className="text-xs text-muted">Subtotal before tax. Tax and the invoice total are added in Zoho Books.</span>
        <span className="text-right font-mono text-xs font-semibold">{money(subtotal, currency, { exact: true })}</span>
      </div>
    </div>
  )
}
