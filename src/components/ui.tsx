import { clsx, type ClassValue } from 'clsx'
import { Lock, Users } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { Enums } from '@/lib/database.types'
import { HEALTH, TASK_STATUS, initials, label } from '@/lib/format'

export const cn = (...v: ClassValue[]) => twMerge(clsx(v))

type Tone = 'good' | 'info' | 'warn' | 'crit' | 'review' | 'neutral' | 'dark'
const TONE: Record<Tone, string> = {
  good: 'bg-good-bg text-good-ink',
  info: 'bg-info-bg text-info-ink',
  warn: 'bg-warn-bg text-warn-ink',
  crit: 'bg-crit-bg text-crit-ink',
  review: 'bg-review-bg text-review',
  neutral: 'bg-neutral-bg text-neutral-ink',
  dark: 'bg-ink text-white',
}

const DOT: Record<Tone, string> = {
  good: 'bg-good', info: 'bg-info', warn: 'bg-warn', crit: 'bg-crit', review: 'bg-review', neutral: 'bg-[#9aa8ad]', dark: 'bg-white',
}

export function Chip({ tone = 'neutral', children, className, title, dot }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string; dot?: boolean }) {
  return (
    <span title={title} className={cn('inline-flex h-5 items-center gap-1 rounded-sm px-[7px] text-[11px] font-semibold whitespace-nowrap', TONE[tone], className)}>
      {dot ? <span aria-hidden className={cn('size-1.5 flex-none rounded-full', DOT[tone])} /> : null}
      {children}
    </span>
  )
}

/** The colour of each task state, used for chips, plan row stripes and the legend. */
export const TASK_STRIPE: Record<Enums<'task_status'> | 'overdue', string> = {
  todo: 'border-l-[#c4cfd3]', in_progress: 'border-l-info', in_review: 'border-l-review', waiting_customer: 'border-l-warn',
  blocked: 'border-l-crit', done: 'border-l-good', overdue: 'border-l-crit',
}

/** What the colours mean: shown above plans and lists. */
export function StatusLegend({ className }: { className?: string }) {
  const items: [Tone, string][] = [['neutral', 'Not started'], ['info', 'In progress'], ['review', 'In review'], ['warn', 'With customer'], ['crit', 'Blocked or overdue'], ['good', 'Done']]
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted', className)} aria-label="What the colours mean">
      {items.map(([t, l]) => <span key={l} className="inline-flex items-center gap-1"><span aria-hidden className={cn('size-2 rounded-full', DOT[t])} />{l}</span>)}
    </span>
  )
}

const TASK_TONE: Record<Enums<'task_status'>, Tone> = {
  done: 'good', in_progress: 'info', in_review: 'review', waiting_customer: 'warn', blocked: 'crit', todo: 'neutral',
}
export function TaskStatusChip({ status, overdue }: { status: Enums<'task_status'>; overdue?: boolean }) {
  if (overdue && status !== 'done') return <Chip tone="crit" dot>Overdue</Chip>
  return <Chip tone={TASK_TONE[status]} dot>{TASK_STATUS[status]}</Chip>
}

const REQUEST_TONE: Partial<Record<Enums<'request_status'>, Tone>> = {
  clarification: 'warn', estimated: 'review', approved: 'good', delivered: 'good', scheduled: 'info', in_development: 'info', uat: 'info', cancelled: 'neutral',
}
export function RequestStatusChip({ status }: { status: Enums<'request_status'> }) {
  return <Chip tone={REQUEST_TONE[status] ?? 'neutral'} dot>{label(status)}</Chip>
}

const APPROVAL_TONE: Record<Enums<'approval_status'>, Tone> = { pending: 'warn', approved: 'good', changes_requested: 'crit', cancelled: 'neutral' }
const APPROVAL_LABEL: Record<Enums<'approval_status'>, string> = { pending: 'Waiting', approved: 'Approved', changes_requested: 'Changes requested', cancelled: 'Cancelled' }
export function ApprovalStatusChip({ status }: { status: Enums<'approval_status'> }) {
  return <Chip tone={APPROVAL_TONE[status]} dot>{APPROVAL_LABEL[status]}</Chip>
}

export function PriorityText({ priority }: { priority: Enums<'priority'> }) {
  const cls = priority === 'critical' ? 'text-crit-ink font-semibold' : priority === 'high' ? 'text-warn-ink font-semibold' : 'text-muted'
  return <span className={cls}>{label(priority)}</span>
}

const HEALTH_DOT: Record<Enums<'health'>, string> = { on_track: 'bg-good', needs_attention: 'bg-warn', at_risk: 'bg-crit' }
const HEALTH_PILL: Record<Enums<'health'>, string> = { on_track: 'bg-good-bg text-good-ink', needs_attention: 'bg-warn-bg text-warn-ink', at_risk: 'bg-crit-bg text-crit-ink' }
/** Project health as a filled pill: green on track, amber needs attention, red at risk. */
export function Health({ health, className }: { health: Enums<'health'>; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', HEALTH_PILL[health], className)}>
      <span aria-hidden className={cn('size-2 rounded-full', HEALTH_DOT[health])} />
      {HEALTH[health]}
    </span>
  )
}

/** The product's signature: every object shows who can see it. */
export function Visibility({ value, compact }: { value: Enums<'visibility'>; compact?: boolean }) {
  return value === 'internal' ? (
    <Chip className="border border-dashed border-internal-line bg-internal-bg text-internal-ink" title="Only Seven Billion can see this">
      <Lock className="size-[11px]" strokeWidth={2.4} aria-hidden />
      {compact ? null : 'Internal'}
    </Chip>
  ) : (
    <Chip className="bg-shared-bg text-link" title="Visible to the customer">
      <Users className="size-[11px]" strokeWidth={2.4} aria-hidden />
      {compact ? null : 'Shared'}
    </Chip>
  )
}

export function Avatar({ name, customer, size = 20 }: { name: string; customer?: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size < 24 ? 9 : 11 }}
      className={cn('inline-flex flex-none items-center justify-center rounded-full font-bold',
        customer ? 'border border-[#f3d29b] bg-[#fff4df] text-[#92400e]' : 'bg-ink text-white')}
    >
      {initials(name)}
    </span>
  )
}

export function Progress({ value, width = 80, tone }: { value: number; width?: number; tone?: 'good' | 'info' | 'warn' | 'crit' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  // finished work reads green; otherwise the colour of the project's health, or blue
  const bar = tone ? DOT[tone] : pct >= 100 ? 'bg-good' : 'bg-info'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-[6px] overflow-hidden rounded-full bg-line" style={{ width }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className={cn('block h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular font-mono text-xs">{pct}%</span>
    </span>
  )
}

export function PageHeader({ title, meta, actions, children }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-white px-5 pt-2.5">
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
        <h1 className="m-0 text-[19px] font-semibold tracking-[-.01em]">{title}</h1>
        {meta}
        {actions ? <div className="ml-auto flex flex-wrap gap-1.5">{actions}</div> : null}
      </div>
    </header>
  )
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-center">
      <div className="text-[13px] font-semibold">{title}</div>
      {children ? <div className="mt-1 text-xs text-muted">{children}</div> : null}
    </div>
  )
}

export function Card({ title, extra, children, className, flush }: { title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('card min-w-0', className)}>
      {title ? (
        <div className="card-head">
          <h2 className="m-0 text-[13px] font-semibold">{title}</h2>
          {extra ? <div className="ml-auto flex items-center gap-2 text-xs text-muted">{extra}</div> : null}
        </div>
      ) : null}
      {/* phones: wide tables scroll inside the card instead of widening the page */}
      <div className={cn(flush ? '' : 'p-3', 'max-sm:overflow-x-auto')}>{children}</div>
    </section>
  )
}

type MeterTone = 'good' | 'info' | 'warn' | 'crit' | 'neutral'
const METER: Record<MeterTone, { stripe: string; ink: string; bar: string }> = {
  good: { stripe: 'before:bg-good', ink: 'text-good-ink', bar: 'bg-good' },
  info: { stripe: 'before:bg-info', ink: 'text-info-ink', bar: 'bg-info' },
  warn: { stripe: 'before:bg-warn', ink: 'text-warn-ink', bar: 'bg-warn' },
  crit: { stripe: 'before:bg-crit', ink: 'text-crit-ink', bar: 'bg-crit' },
  neutral: { stripe: 'before:bg-line', ink: 'text-ink', bar: 'bg-[#9aa8ad]' },
}

/**
 * A meter tile: a coloured stripe and value for its state (green fine, amber needs a look, red needs action,
 * blue information), an optional bar (pct), and a link to the list behind the number.
 */
export function Stat({ label: l, value, sub, tone = 'neutral', pct, href }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: MeterTone; pct?: number; href?: string
}) {
  const m = METER[tone]
  const body = (
    <>
      <span className="label">{l}</span>
      <span className="flex items-baseline gap-2">
        <span className={cn('tabular font-mono text-[24px] leading-tight font-semibold', m.ink)}>{value}</span>
        {sub ? <span className="text-xs text-muted">{sub}</span> : null}
      </span>
      {pct != null ? (
        <span className="mt-1 h-[6px] w-full max-w-[180px] overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span className={cn('block h-full rounded-full', m.bar)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </span>
      ) : null}
    </>
  )
  const cls = cn('relative flex min-w-[150px] flex-1 flex-col gap-0.5 border-l border-line-soft px-4 pt-3 pb-2.5 first:border-l-0',
    'before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-[""]', m.stripe)
  return href ? <a href={href} className={cn(cls, 'text-ink no-underline hover:bg-head')}>{body}</a> : <div className={cls}>{body}</div>
}
