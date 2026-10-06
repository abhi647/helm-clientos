import { notFound } from 'next/navigation'
import { Card, Empty } from '@/components/ui'
import { money } from '@/lib/format'
import { canSeeCommercials, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Internal only (CEO, finance, admin). Values are entered from the signed contract, never calculated here. */
export default async function Commercials({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  if (!canSeeCommercials(me)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.from('project_commercials').select('*').eq('project_id', id).maybeSingle()
  return (
    <div className="max-w-[720px] p-4">
      <Card title="Commercials" extra="Internal · CEO, finance and admin only">
        {data ? (
          <dl className="m-0 grid grid-cols-[150px_minmax(0,1fr)] gap-y-2 text-[13px]">
            <dt className="text-muted">Billing model</dt><dd className="m-0">{data.billing_model ?? '–'}</dd>
            <dt className="text-muted">Contract value</dt><dd className="m-0 font-mono">{money(data.contract_value, data.currency)}</dd>
            <dt className="text-muted">PO number</dt><dd className="m-0 font-mono">{data.po_number ?? '–'}</dd>
            <dt className="text-muted">Notes</dt><dd className="m-0">{data.notes ?? '–'}</dd>
          </dl>
        ) : <Empty title="No commercials recorded">Add them from the signed SOW.</Empty>}
      </Card>
    </div>
  )
}
