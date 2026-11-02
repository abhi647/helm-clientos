'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createInvoice } from '@/app/_actions/billing'
import { StatementStatus, period } from '@/components/billing'
import { ActionForm } from '@/components/forms'
import { FilterTabs } from '@/components/overtrue/filter-tabs'
import { Empty } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { money } from '@/lib/format'

export type StatementRow = {
  id: string; start: string; end: string; status: Enums<'statement_status'>; subtotal: number; currency: string
  invoice: string | null; error: string | null; label: string
}
type Stage = 'all' | 'draft' | 'customer' | 'approved' | 'invoiced'
const stageOf = (s: StatementRow): Exclude<Stage, 'all'> =>
  s.invoice || s.status === 'invoiced' ? 'invoiced' : s.status === 'approved' ? 'approved' : s.status === 'pending' ? 'customer' : 'draft'

/** Statements by stage: draft → with the customer → approved → invoiced. Approved ones can be ticked into one Zoho draft. */
export function StatementsTable({ rows, projectId }: { rows: StatementRow[]; projectId: string }) {
  const [stage, setStage] = useState<Stage>('all')
  const count = (s: Stage) => (s === 'all' ? rows.length : rows.filter((r) => stageOf(r) === s).length)
  const shown = stage === 'all' ? rows : rows.filter((r) => stageOf(r) === stage)
  const cols = 'grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_150px_130px_minmax(0,1fr)]'
  if (!rows.length) return <Empty title="No statements yet">Statements appear here once you bill a period or a milestone.</Empty>
  return (
    <ActionForm action={createInvoice} submit="Create invoice in Zoho for the ticked statements" resetOnSuccess={false} className="gap-0 [&>div:last-child]:border-t [&>div:last-child]:border-line-soft [&>div:last-child]:p-3">
      <div className="border-b border-line-soft px-3 py-2">
        <FilterTabs label="Statement stage" value={stage} onValueChange={setStage} items={[
          { value: 'all', label: 'All', count: count('all') }, { value: 'draft', label: 'Draft', count: count('draft') },
          { value: 'customer', label: 'With customer', count: count('customer') }, { value: 'approved', label: 'Ready to invoice', count: count('approved') },
          { value: 'invoiced', label: 'Invoiced', count: count('invoiced') },
        ]} />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`row row-head ${cols}`}><span /><span>What</span><span>Period</span><span>Status</span><span className="text-right">Subtotal</span><span>Invoice</span></div>
          {shown.map((s) => {
            const invoiceable = s.status === 'approved' && !s.invoice
            return (
              <div key={s.id} className={`row ${cols} hover:bg-head`}>
                <span>{invoiceable ? <input type="checkbox" name="statement" value={s.id} aria-label={`Invoice ${s.label}`} className="accent-primary" /> : null}</span>
                <Link href={`/projects/${projectId}/billing/${s.id}`} className="truncate font-medium text-ink no-underline hover:underline">{s.label}</Link>
                <span className="tabular text-xs text-muted-foreground">{period(s.start, s.end)}</span>
                <span><StatementStatus status={s.status} /></span>
                <span className="tabular text-right text-xs font-medium">{money(s.subtotal, s.currency, { exact: true })}</span>
                <span className="truncate text-xs">{s.invoice ? <span className="font-mono">Zoho {s.invoice}</span>
                  : s.error ? <span className="text-crit-ink">{s.error}</span> : invoiceable ? <span className="text-good-ink">Ready to invoice</span> : <span className="text-muted-foreground">–</span>}</span>
              </div>
            )
          })}
          {!shown.length ? <p className="m-0 px-3 py-4 text-center text-xs text-muted-foreground">Nothing at this stage.</p> : null}
        </div>
      </div>
    </ActionForm>
  )
}
