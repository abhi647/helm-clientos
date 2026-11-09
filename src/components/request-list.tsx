import { DataGrid } from '@/components/data-grid'
import { LinkTabs } from '@/components/link-tabs'
import { Card, Empty, PriorityText, RequestStatusChip } from '@/components/ui'
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
    <Card flush>
      <div className="border-b border-border/60 px-3 py-2">
        <LinkTabs label="Request filter" value={filter} items={(Object.keys(FILTERS) as RequestFilter[]).map((f) => ({ value: f, label: FILTERS[f], href: `${basePath}?filter=${f}` }))} />
      </div>
      <DataGrid search searchLabel="Search requests" pageSize={25} label="Requests" initialSort={{ key: 'age', direction: 1 }}
        empty={<Empty title="No requests here">{staff ? 'Customers raise requests from their portal.' : 'Use “New request” to ask Seven Billion for anything.'}</Empty>}
        columns={[
          { key: 'id', label: 'ID', sortable: true, className: 'w-[80px]' },
          { key: 'title', label: 'Request', sortable: true },
          ...(staff ? [{ key: 'customer', label: 'Customer', sortable: true, className: 'w-[130px]' }] : []),
          { key: 'stage', label: 'Stage', sortable: true, className: 'w-[140px]' },
          { key: 'type', label: 'Type', sortable: true, className: 'w-[110px]' },
          { key: 'priority', label: 'Priority', sortable: true, className: 'w-[90px]' },
          { key: 'age', label: 'Age', sortable: true, align: 'right', className: 'w-[60px]' },
        ]}
        rows={(data ?? []).map((r) => ({
          id: r.id, href: `${detail}/${r.id}`,
          values: { id: r.number, title: r.title, customer: r.customers?.name, stage: r.status, type: label(r.type),
            priority: ['critical', 'high', 'medium', 'low'].indexOf(r.priority), age: -Date.parse(r.created_at) },
          cells: {
            id: <span className="font-mono text-xs text-muted-foreground">{r.number}</span>,
            title: <span className="flex min-w-0 items-baseline gap-2"><span className="truncate font-medium">{r.title}</span><span className="truncate text-xs text-muted-foreground">{r.owner?.full_name ?? (staff ? 'Unassigned' : '')}</span></span>,
            customer: <span className="block truncate text-xs">{r.customers?.name}</span>,
            stage: <RequestStatusChip status={r.status} />,
            type: <span className="text-xs">{label(r.type)}</span>,
            priority: <span className="text-xs"><PriorityText priority={r.priority} /></span>,
            age: <span className="font-mono text-xs text-muted-foreground">{ageInDays(r.created_at)}</span>,
          },
        }))} />
    </Card>
  )
}

export const parseFilter = (f?: string): RequestFilter => (f && f in FILTERS ? (f as RequestFilter) : 'open')
