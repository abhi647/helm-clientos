import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PaymentsCard } from '@/components/payments'
import { Card, Chip, Empty, cn } from '@/components/ui'
import { daysFromToday, money, shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { DataGrid } from '@/components/data-grid'

export const metadata: Metadata = { title: 'Invoices' }

export default async function PortalInvoices() {
  const me = await requireCustomer()
  if (!me.can_view_invoices) notFound()
  const supabase = await createClient()
  const { data } = await supabase.from('invoices').select('*').order('issued_on', { ascending: false })
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">Invoices</h1>
      <Card flush>
        {data?.length ? (
          <DataGrid label="Invoices" initialSort={{ key: 'due', direction: -1 }}
            columns={[
              { key: 'number', label: 'Invoice', sortable: true, className: 'w-[130px]' },
              { key: 'amount', label: 'Amount', sortable: true, align: 'right' }, { key: 'balance', label: 'Balance', sortable: true, align: 'right' },
              { key: 'issued', label: 'Issued', sortable: true, className: 'w-[100px]' }, { key: 'due', label: 'Due', sortable: true, className: 'w-[100px]' },
              { key: 'status', label: 'Status', className: 'w-[110px]' },
            ]}
            rows={data.map((i) => {
              const late = i.status !== 'paid' && (daysFromToday(i.due_on) ?? 0) < 0
              return {
                id: i.id,
                values: { number: i.number, amount: Number(i.total), balance: Number(i.balance), issued: i.issued_on, due: i.due_on },
                cells: {
                  number: <span className="font-mono text-xs" title={i.number}>{i.number}</span>,
                  amount: <span className="font-mono text-xs">{money(i.total, i.currency)}</span>,
                  balance: <span className="font-mono text-xs">{money(i.balance, i.currency)}</span>,
                  issued: <span className="font-mono text-xs text-muted-foreground">{shortDate(i.issued_on)}</span>,
                  due: <span className={cn('font-mono text-xs', late && 'font-semibold text-crit-ink')}>{shortDate(i.due_on)}</span>,
                  status: i.status === 'paid' ? <Chip tone="good" dot>Paid</Chip> : late ? <Chip tone="crit" dot>Overdue</Chip> : <Chip tone="info" dot>Due</Chip>,
                },
              }
            })} />
        ) : <Empty title="No invoices yet" />}
      </Card>
      <PaymentsCard customerId={me.customer_id!} staff={false} />
    </div>
  )
}
