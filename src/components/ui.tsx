import { clsx, type ClassValue } from 'clsx'
import { Inbox, Lock, Users } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { buttonVariants } from '@/components/ui/button'
import { Card as ShadcnCard, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/overtrue/empty-state'
import { PageHeader as OvertruePageHeader } from '@/components/overtrue/page-header'
import { SectionCard } from '@/components/overtrue/section-card'
import { StatusBadge, type StatusBadgeProps } from '@/components/overtrue/status-badge'
import type { Enums } from '@/lib/database.types'
import { HEALTH, TASK_STATUS, initials, label } from '@/lib/format'

export const cn = (...v: ClassValue[]) => twMerge(clsx(v))

/** shadcn's Button look for links, summaries and plain buttons: outline by default, taller to tap on phones. */
export const btn = (variant: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link' = 'outline', ...extra: ClassValue[]) =>
  cn(buttonVariants({ variant, size: 'sm' }), 'cursor-pointer no-underline max-sm:h-10',
    // links keep the button's text colour, not the link blue
    variant === 'default' ? 'hover:text-primary-foreground' : variant === 'destructive' ? 'hover:text-white' : variant === 'link' ? '' : 'text-foreground hover:text-accent-foreground',
    ...extra)

// Helm's tones on overtrue's StatusBadge variants. Every status also carries a word, so colour is never the only signal.
type Tone = 'good' | 'info' | 'warn' | 'crit' | 'review' | 'neutral' | 'dark'
const VARIANT: Record<Tone, NonNullable<StatusBadgeProps['variant']>> = {
  good: 'success', info: 'info', warn: 'warning', crit: 'error', review: 'review', neutral: 'neutral', dark: 'neutral',
}
const DOT: Record<Tone, string> = {
  good: 'bg-good', info: 'bg-info', warn: 'bg-warn', crit: 'bg-crit', review: 'bg-review', neutral: 'bg-[#a3a3a3]', dark: 'bg-white',
}

export function Chip({ tone = 'neutral', children, className, title, dot }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string; dot?: boolean }) {
  return (
    <StatusBadge variant={VARIANT[tone]} dot={!!dot} title={title} className={cn(tone === 'dark' && 'bg-foreground text-background ring-foreground', className)}>
      {children}
    </StatusBadge>
  )
}

/** The colour of each task state, used for chips, plan row stripes and the legend. */
export const TASK_STRIPE: Record<Enums<'task_status'> | 'overdue', string> = {
  todo: 'border-l-[#d4d4d4]', in_progress: 'border-l-info', in_review: 'border-l-review', waiting_customer: 'border-l-warn',
  blocked: 'border-l-crit', done: 'border-l-good', overdue: 'border-l-crit',
}

/** What the colours mean: shown above plans and lists. */
export function StatusLegend({ className }: { className?: string }) {
  const items: [Tone, string][] = [['neutral', 'Not started'], ['info', 'In progress'], ['review', 'In review'], ['warn', 'With customer'], ['crit', 'Blocked or overdue'], ['good', 'Done']]
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)} aria-label="What the colours mean">
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
  const cls = priority === 'critical' ? 'text-crit-ink font-semibold' : priority === 'high' ? 'text-warn-ink font-semibold' : 'text-muted-foreground'
  return <span className={cls}>{label(priority)}</span>
}

const HEALTH_TONE: Record<Enums<'health'>, Tone> = { on_track: 'good', needs_attention: 'warn', at_risk: 'crit' }
/** Project health: green on track, amber needs attention, red at risk. */
export function Health({ health, className }: { health: Enums<'health'>; className?: string }) {
  return <Chip tone={HEALTH_TONE[health]} dot className={cn('w-fit font-semibold', className)}>{HEALTH[health]}</Chip>
}

/** The product's signature: every object shows who can see it. */
export function Visibility({ value, compact }: { value: Enums<'visibility'>; compact?: boolean }) {
  return value === 'internal' ? (
    <Chip className="border border-dashed border-internal-line bg-internal-bg text-internal-ink ring-0" title="Only Seven Billion can see this">
      <Lock className="size-[11px]" strokeWidth={2.4} aria-hidden />
      {compact ? null : 'Internal'}
    </Chip>
  ) : (
    <Chip tone="info" title="Visible to the customer">
      <Users className="size-[11px]" strokeWidth={2.4} aria-hidden />
      {compact ? null : 'Shared'}
    </Chip>
  )
}

export function Avatar({ name, customer, size = 20 }: { name: string; customer?: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size < 24 ? 9 : size < 30 ? 11 : 12 }}
      className={cn('inline-flex flex-none items-center justify-center rounded-full font-bold',
        customer ? 'bg-[#fdf0d6] text-[#8a4b00] ring-1 ring-[#f3d29b]' : 'bg-gradient-to-br from-[#4f7bff] to-[#2a5bff] text-white')}
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
      <span className="h-1.5 overflow-hidden rounded-full bg-muted" style={{ width }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className={cn('block h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular font-mono text-xs">{pct}%</span>
    </span>
  )
}

/** The top of every page: overtrue's PageHeader, with Helm's meta line (dates, owners, counts) as its description. */
export function PageHeader({ title, meta, actions, children }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 pt-3 pb-3">
      {children}
      <OvertruePageHeader title={title} description={meta} actions={actions} />
    </div>
  )
}

/** Nothing here yet: overtrue's EmptyState, bare inside cards. */
export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return <EmptyState title={title} description={children ?? null} icon={icon ?? <Inbox />} className="rounded-none border-0 bg-transparent py-6" />
}

/** A titled panel: overtrue's SectionCard. `flush` drops the padding for tables and lists. */
export function Card({ title, extra, children, className, flush, description }: {
  title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean; description?: React.ReactNode
}) {
  return (
    <SectionCard title={title} description={description} actions={extra} className={className}
      // phones: wide tables scroll inside the card instead of widening the page
      contentClassName={cn(flush && 'p-0', 'max-sm:overflow-x-auto')}>
      {children}
    </SectionCard>
  )
}

type MeterTone = 'good' | 'info' | 'warn' | 'crit' | 'neutral'
const METER: Record<MeterTone, { chip: string; ink: string; bar: string }> = {
  good: { chip: 'bg-good-bg text-good-ink ring-good/20', ink: 'text-good-ink', bar: 'bg-good' },
  info: { chip: 'bg-info-bg text-info-ink ring-info/20', ink: 'text-info-ink', bar: 'bg-info' },
  warn: { chip: 'bg-warn-bg text-warn-ink ring-warn/25', ink: 'text-warn-ink', bar: 'bg-warn' },
  crit: { chip: 'bg-crit-bg text-crit-ink ring-crit/20', ink: 'text-crit-ink', bar: 'bg-crit' },
  neutral: { chip: 'bg-muted text-muted-foreground ring-border', ink: 'text-ink', bar: 'bg-[#a3a3a3]' },
}

/**
 * A KPI tile: label, a large figure, and an optional bar. The figure takes the colour of its state (green fine,
 * amber needs a look, red needs action), and the small badge repeats it in words so colour is never the only signal.
 */
export function Stat({ label: l, value, sub, tone = 'neutral', pct, href, icon }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: MeterTone; pct?: number; href?: string; icon?: React.ReactNode
}) {
  const m = METER[tone]
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{l}</span>
        {icon ? <span aria-hidden className={cn('grid size-6 flex-none place-items-center rounded-lg ring-1 ring-inset [&>svg]:size-3.5', m.chip)}>{icon}</span> : null}
      </span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span data-slot="stat-card-value" className={cn('tabular text-[22px] leading-7 font-semibold tracking-[-0.035em]', tone === 'neutral' || tone === 'good' ? 'text-foreground' : m.ink)}>{value}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </span>
      {pct != null ? (
        <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span className={cn('block h-full rounded-full transition-[width] duration-700', m.bar)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </span>
      ) : null}
    </>
  )
  const card = (
    <ShadcnCard data-slot="stat-card" data-tone={tone}
      className={cn('relative min-w-[130px] flex-1 gap-0 rounded-xl border border-border/70 bg-card py-0 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-12px_rgb(0_0_0/0.10)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_1px_2px_rgb(0_0_0/0.5)]',
        href && 'transition-colors hover:border-border hover:bg-muted/40')}>
      <CardContent className="flex flex-col px-3 py-2.5">{body}</CardContent>
    </ShadcnCard>
  )
  return href ? <a href={href} className="flex min-w-[130px] flex-1 text-foreground no-underline">{card}</a> : card
}
