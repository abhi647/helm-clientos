import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, Chip, Empty, cn } from '@/components/ui'
import { daysFromToday, money, shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Invoices' }

export default async function PortalInvoices() {
  const me = await requireCustomer()
  if (!me.can_view_invoices) notFound()
  const supabase = await createClient()
  const { data } = await supabase.from('invoices').select('*').order('issued_on', { ascending: false })
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">Invoices</h1>
      <Card flush className="overflow-x-auto">
        {data?.length ? (
          <div className="min-w-[620px]">
            <div className="row row-head grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_100px_100px_110px]"><span>Invoice</span><span className="text-right">Amount</span><span className="text-right">Balance</span><span>Issued</span><span>Due</span><span>Status</span></div>
            {data.map((i) => {
              const late = i.status !== 'paid' && (daysFromToday(i.due_on) ?? 0) < 0
              return (
                <div key={i.id} className="row min-h-10 grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_100px_100px_110px]">
                  <span className="font-mono text-xs">{i.number}</span>
                  <span className="text-right font-mono text-xs">{money(i.total, i.currency)}</span>
                  <span className="text-right font-mono text-xs">{money(i.balance, i.currency)}</span>
                  <span className="font-mono text-xs text-muted">{shortDate(i.issued_on)}</span>
                  <span className={cn('font-mono text-xs', late && 'font-semibold text-crit-ink')}>{shortDate(i.due_on)}</span>
                  <span>{i.status === 'paid' ? <Chip tone="good">Paid</Chip> : late ? <Chip tone="crit">Overdue</Chip> : <Chip tone="info">Due</Chip>}</span>
                </div>
              )
            })}
          </div>
        ) : <Empty title="No invoices yet" />}
      </Card>
    </div>
  )
}
