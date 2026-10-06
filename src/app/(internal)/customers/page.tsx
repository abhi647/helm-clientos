import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty, Health, PageHeader } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Customers' }

const WORST: Enums<'health'>[] = ['at_risk', 'needs_attention', 'on_track']

export default async function Customers() {
  await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('customers').select('id, name, projects(id, health, status), requests(id, status), profiles(id)').order('name')
  return (
    <>
      <PageHeader title="Customers" meta={<span className="text-xs text-muted">{data?.length ?? 0} workspaces</span>} />
      <div className="p-4">
        <Card flush className="overflow-x-auto">
          {data?.length ? (
            <div className="min-w-[640px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_140px_110px_110px_100px]"><span>Customer</span><span>Health</span><span className="text-right">Active projects</span><span className="text-right">Open requests</span><span className="text-right">Portal users</span></div>
              {data.map((c) => {
                const active = (c.projects ?? []).filter((p) => p.status === 'active')
                const worst = WORST.find((h) => active.some((p) => p.health === h))
                return (
                  <Link key={c.id} href={`/customers/${c.id}`} className="row grid-cols-[minmax(0,1fr)_140px_110px_110px_100px] text-ink no-underline hover:bg-head">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span>{worst ? <Health health={worst} /> : <span className="text-xs text-muted">No active work</span>}</span>
                    <span className="text-right font-mono text-xs">{active.length}</span>
                    <span className="text-right font-mono text-xs">{(c.requests ?? []).filter((r) => !['delivered', 'cancelled'].includes(r.status)).length}</span>
                    <span className="text-right font-mono text-xs">{(c.profiles ?? []).length}</span>
                  </Link>
                )
              })}
            </div>
          ) : <Empty title="No customers yet">Customers are created from HubSpot Closed Won deals.</Empty>}
        </Card>
      </div>
    </>
  )
}
