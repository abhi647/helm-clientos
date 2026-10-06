import Link from 'next/link'
import { Card, Empty, PriorityText, RequestStatusChip, cn } from '@/components/ui'
import { ageInDays, label } from '@/lib/format'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const FILTERS = { open: 'Open', clarification: 'Waiting on customer', critical: 'Critical', delivered: 'Delivered', all: 'All' } as const
export type RequestFilter = keyof typeof FILTERS

export async function RequestList({ me, projectId, filter = 'open', basePath }: { me: Profile; projectId?: string; filter?: RequestFilter; basePath: string }) {
  const supabase = await createClient()
  const staff = me.kind === 'internal'
  let q = supabase.from('requests').select('id, number, title, type, priority, status, created_at, customers(name), owner:profiles!requests_owner_id_fkey(full_name)').order('created_at', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  if (filter === 'open') q = q.not('status', 'in', '(delivered,cancelled)')
  if (filter === 'clarification') q = q.in('status', ['clarification', 'estimated'])
  if (filter === 'critical') q = q.eq('priority', 'critical').not('status', 'in', '(delivered,cancelled)')
  if (filter === 'delivered') q = q.eq('status', 'delivered')
  const { data } = await q
  const detail = staff ? '/requests' : '/portal/requests'
  return (
    <Card flush className="overflow-x-auto">
      <div className="flex flex-wrap gap-1.5 border-b border-line px-2.5 py-2">
        {(Object.keys(FILTERS) as RequestFilter[]).map((f) => (
          <Link key={f} href={`${basePath}?filter=${f}`} aria-current={f === filter ? 'true' : undefined}
            className={cn('inline-flex h-6 items-center rounded-sm px-2 text-[11px] font-semibold no-underline', f === filter ? 'bg-ink text-white hover:text-white' : 'bg-neutral-bg text-neutral-ink')}>{FILTERS[f]}</Link>
        ))}
      </div>
      {data?.length ? (
        <div className="min-w-[700px]">
          <div className={cn('row row-head', staff ? 'grid-cols-[80px_minmax(0,1fr)_120px_130px_110px_90px_48px]' : 'grid-cols-[80px_minmax(0,1fr)_130px_110px_90px_48px]')}>
            <span>ID</span><span>Request</span>{staff ? <span>Customer</span> : null}<span>Stage</span><span>Type</span><span>Priority</span><span className="text-right">Age</span>
          </div>
          {data.map((r) => (
            <Link key={r.id} href={`${detail}/${r.id}`} className={cn('row text-ink no-underline hover:bg-head', staff ? 'grid-cols-[80px_minmax(0,1fr)_120px_130px_110px_90px_48px]' : 'grid-cols-[80px_minmax(0,1fr)_130px_110px_90px_48px]')}>
              <span className="font-mono text-xs text-muted">{r.number}</span>
              <span className="truncate font-medium">{r.title}<span className="ml-2 text-xs font-normal text-muted">{r.owner?.full_name ?? (staff ? 'Unassigned' : '')}</span></span>
              {staff ? <span className="truncate text-xs">{r.customers?.name}</span> : null}
              <span><RequestStatusChip status={r.status} /></span>
              <span className="truncate text-xs">{label(r.type)}</span>
              <span className="text-xs"><PriorityText priority={r.priority} /></span>
              <span className="text-right font-mono text-xs text-muted">{ageInDays(r.created_at)}</span>
            </Link>
          ))}
        </div>
      ) : <Empty title="No requests here">{staff ? 'Customers raise requests from their portal.' : 'Use “New request” to ask Seven Billion for anything.'}</Empty>}
    </Card>
  )
}

export const parseFilter = (f?: string): RequestFilter => (f && f in FILTERS ? (f as RequestFilter) : 'open')
