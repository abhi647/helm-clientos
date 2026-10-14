import { cn } from '@/components/ui'
import { hrs, shortDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export type CreditBalance = {
  kind: string; period_start: string; period_end: string; allowance: number; carried: number; topups: number
  available: number; used: number; remaining: number; used_pct: number | null
}

/** The customer's hours credit now, or null when no plan is set (the database checks who may read it). */
export async function creditBalance(customerId: string): Promise<CreditBalance | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('credit_balance', { p_customer: customerId })
  const b = data?.[0]
  return b?.kind ? (b as CreditBalance) : null
}

/** Green below 75% used, amber to 90%, red from 90% (and over). */
export const creditTone = (b: CreditBalance): 'good' | 'warn' | 'crit' =>
  b.remaining < 0 || (b.used_pct ?? 0) >= 90 ? 'crit' : (b.used_pct ?? 0) >= 75 ? 'warn' : 'good'

const BAR = { good: 'bg-good', warn: 'bg-warn', crit: 'bg-crit' }
const INK = { good: 'text-good-ink', warn: 'text-warn-ink', crit: 'text-crit-ink' }

/** "12 h left" or "3.5 h over" */
export const creditLeft = (b: CreditBalance) => (b.remaining < 0 ? `${hrs(-b.remaining)} over` : `${hrs(b.remaining)} left`)

/** The hours meter: used against what is available this period, what makes up the total, and any hours over. */
export function HoursMeter({ b, className }: { b: CreditBalance; className?: string }) {
  const tone = creditTone(b)
  const avail = Number(b.available)
  const used = Number(b.used)
  const pct = avail > 0 ? Math.min(100, (100 * used) / avail) : used > 0 ? 100 : 0
  const parts = b.kind === 'monthly'
    ? [`${hrs(b.allowance)} this month`, Number(b.carried) ? `${hrs(b.carried)} carried over` : null, Number(b.topups) ? `${hrs(b.topups)} added` : null]
    : [`${hrs(b.topups)} bought`]
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn('tabular font-mono text-[24px] leading-tight font-semibold', INK[tone])}>{hrs(used)}</span>
        <span className="text-sm text-muted">of {hrs(avail)} used</span>
        <span className={cn('ml-auto text-sm font-semibold', INK[tone])}>{creditLeft(b)}</span>
      </div>
      <span className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Hours used" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span className={cn('block h-full rounded-full', BAR[tone])} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-muted">
        {b.kind === 'monthly' ? `${shortDate(b.period_start)} – ${shortDate(b.period_end)} · ` : `Prepaid since ${shortDate(b.period_start)} · `}
        {parts.filter(Boolean).join(' + ')}
        {b.remaining < 0 ? ' · Hours over are billed at the agreed rate.' : ''}
      </span>
    </div>
  )
}
