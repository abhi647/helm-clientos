import { Card, Empty } from '@/components/ui'
import { money, shortDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

/** Payments received, exactly as Zoho Books reports them. RLS decides who sees this (finance roles, invoice-flagged customers). */
export async function PaymentsCard({ customerId, staff }: { customerId?: string; staff: boolean }) {
  const supabase = await createClient()
  let q = supabase.from('payments').select('id, number, amount, currency, paid_on, mode, reference, invoices(number), customers(name)').order('paid_on', { ascending: false }).limit(50)
  if (customerId) q = q.eq('customer_id', customerId)
  const { data } = await q
  const cols = staff ? 'grid-cols-[90px_minmax(0,1fr)_130px_120px_110px]' : 'grid-cols-[90px_130px_minmax(0,1fr)_110px]'
  return (
    <Card flush className="overflow-x-auto" title="Payments received" extra="From Zoho Books">
      {data?.length ? (
        <div className="min-w-[560px]">
          <div className={`row row-head ${cols}`}><span>Date</span>{staff ? <span>Customer</span> : null}<span>Invoice</span><span className="text-right">Amount</span><span>Mode</span></div>
          {data.map((p) => (
            <div key={p.id} className={`row ${cols}`}>
              <span className="font-mono text-xs text-muted">{shortDate(p.paid_on)}</span>
              {staff ? <span className="truncate">{p.customers?.name}</span> : null}
              <span className="truncate font-mono text-xs">{p.invoices?.number ?? '–'}</span>
              <span className="text-right font-mono text-xs">{money(p.amount, p.currency)}</span>
              <span className="truncate text-xs text-muted">{p.mode ?? '–'}</span>
            </div>
          ))}
        </div>
      ) : <Empty title="No payments yet" />}
    </Card>
  )
}
