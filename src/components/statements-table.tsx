'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createSalesOrder } from '@/app/_actions/billing'
import { StatementStatus, period } from '@/components/billing'
import { DataGrid } from '@/components/data-grid'
import { ActionForm } from '@/components/forms'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterTabs } from '@/components/overtrue/filter-tabs'
import { Empty } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { money } from '@/lib/format'
import { Input } from '@/components/ui/input'

export type StatementRow = {
  id: string; start: string; end: string; status: Enums<'statement_status'>; subtotal: number; currency: string
  invoice: string | null; salesOrder: string | null; error: string | null; label: string
}
type Stage = 'all' | 'draft' | 'customer' | 'approved' | 'ordered' | 'invoiced'
const stageOf = (s: StatementRow): Exclude<Stage, 'all'> =>
  s.invoice || s.status === 'invoiced' ? 'invoiced' : s.salesOrder ? 'ordered' : s.status === 'approved' ? 'approved' : s.status === 'pending' ? 'customer' : 'draft'

/**
 * Statements by stage: draft → with the customer → approved → sales order → invoiced. Approved ones can be ticked into
 * one Zoho sales order; finance converts it to the invoice in Zoho once the customer confirms.
 */
export function StatementsTable({ rows, projectId }: { rows: StatementRow[]; projectId: string }) {
  const [stage, setStage] = useState<Stage>('all')
  const count = (s: Stage) => (s === 'all' ? rows.length : rows.filter((r) => stageOf(r) === s).length)
  const shown = stage === 'all' ? rows : rows.filter((r) => stageOf(r) === stage)
  if (!rows.length) return <Empty title="No statements yet">Statements appear here once you bill a period or a milestone.</Empty>
  return (
    <ActionForm action={createSalesOrder} submit="Create sales order in Zoho for the ticked statements" resetOnSuccess={false} className="gap-0 [&>div:last-child]:border-t [&>div:last-child]:border-border/60 [&>div:last-child]:p-3">
      <div className="border-b border-border/60 px-3 py-2">
        <FilterTabs label="Statement stage" value={stage} onValueChange={setStage} items={[
          { value: 'all', label: 'All', count: count('all') }, { value: 'draft', label: 'Draft', count: count('draft') },
          { value: 'customer', label: 'With customer', count: count('customer') }, { value: 'approved', label: 'Ready for Zoho', count: count('approved') },
          { value: 'ordered', label: 'Sales order', count: count('ordered') }, { value: 'invoiced', label: 'Invoiced', count: count('invoiced') },
        ]} />
      </div>
      <DataGrid label="Statements" initialSort={{ key: 'period', direction: -1 }}
        empty={<p className="m-0 text-xs text-muted-foreground">Nothing at this stage.</p>}
        columns={[
          { key: 'pick', label: <span className="sr-only">Pick</span>, className: 'w-[36px]' },
          { key: 'what', label: 'What', sortable: true },
          { key: 'period', label: 'Period', sortable: true, className: 'w-[200px]' },
          { key: 'status', label: 'Status', sortable: true, className: 'w-[150px]' },
          { key: 'subtotal', label: 'Subtotal', sortable: true, align: 'right', className: 'w-[130px]' },
          { key: 'zoho', label: 'Zoho', className: 'w-[220px]' },
        ]}
        rows={shown.map((s) => {
          const invoiceable = s.status === 'approved' && !s.invoice && !s.salesOrder
          return {
            id: s.id, href: `/projects/${projectId}/billing/${s.id}`,
            values: { what: s.label, period: s.start, status: s.status, subtotal: s.subtotal },
            cells: {
              pick: invoiceable ? <Checkbox name="statement" value={s.id} aria-label={`Sales order for ${s.label}`} /> : null,
              what: <Link href={`/projects/${projectId}/billing/${s.id}`} className="block truncate font-medium text-foreground no-underline hover:underline">{s.label}</Link>,
              period: <span className="tabular text-xs text-muted-foreground">{period(s.start, s.end)}</span>,
              status: <StatementStatus status={s.status} />,
              subtotal: <span className="tabular text-xs font-medium">{money(s.subtotal, s.currency, { exact: true })}</span>,
              zoho: <span className="block max-w-[220px] truncate text-xs">{s.invoice ? <span className="font-mono">Invoice {s.invoice}</span>
                : s.salesOrder ? <span className="font-mono">Sales order {s.salesOrder}</span>
                : s.error ? <span className="text-crit-ink" title={s.error}>{s.error}</span> : invoiceable ? <span className="text-good-ink">Ready for a sales order</span> : <span className="text-muted-foreground">–</span>}</span>,
            },
          }
        })} />
      {rows.some((r) => r.status === 'approved' && !r.invoice && !r.salesOrder) ? (
        <label className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          Proposed exchange rate: 1 {rows[0]!.currency} =
          <Input name="exchange_rate" inputMode="decimal" placeholder="e.g. 92.5" className="tabular w-28" />
          <span>only when Zoho bills the customer in another currency</span>
        </label>
      ) : null}
    </ActionForm>
  )
}
