import type { Metadata } from 'next'
import Link from 'next/link'
import { DataGrid } from '@/components/data-grid'
import { btn, Card, Chip, Empty, Health, PageHeader, Progress } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Projects' }

export default async function Projects() {
  const me = await requireStaff()
  const supabase = await createClient()
  const [{ data: projects }, { data: progress }] = await Promise.all([
    supabase.from('projects').select('id, name, health, status, start_date, end_date, customers(name), pm:profiles!projects_pm_id_fkey(full_name)').order('status').order('name'),
    supabase.from('project_progress').select('*'),
  ])
  const prog = new Map((progress ?? []).map((p) => [p.project_id, p.total ? (100 * (p.done ?? 0)) / p.total : 0]))
  return (
    <>
      <PageHeader title="Projects" meta={<span className="text-xs text-muted-foreground">{projects?.length ?? 0} projects</span>}
        actions={canManage(me) ? <Link href="/projects/new" className={btn('default')}>+ New project</Link> : null} />
      <div className="p-4">
        <Card flush>
          <DataGrid search searchLabel="Search projects" pageSize={25} label="Projects"
            empty={<Empty title="No projects yet">Won deals in HubSpot arrive on Home ready to set up, or start one with New project.</Empty>}
            columns={[
              { key: 'customer', label: 'Customer', sortable: true, className: 'w-[160px]' },
              { key: 'project', label: 'Project', sortable: true },
              { key: 'health', label: 'Health', sortable: true, className: 'w-[140px]' },
              { key: 'progress', label: 'Progress', sortable: true, className: 'w-[120px]' },
              { key: 'pm', label: 'PM', sortable: true, className: 'w-[110px]' },
              { key: 'dates', label: 'Dates', sortable: true, className: 'w-[150px]' },
              { key: 'status', label: 'Status', sortable: true, className: 'w-[100px]' },
            ]}
            rows={(projects ?? []).map((p) => ({
              id: p.id, href: `/projects/${p.id}`,
              values: { customer: p.customers?.name, project: p.name, health: ['at_risk', 'needs_attention', 'on_track'].indexOf(p.health), progress: prog.get(p.id) ?? 0,
                pm: p.pm?.full_name, dates: p.start_date, status: p.status },
              cells: {
                customer: <span className="block truncate font-semibold">{p.customers?.name}</span>,
                project: <Link href={`/projects/${p.id}`} className="block truncate font-medium text-foreground no-underline hover:underline">{p.name}</Link>,
                health: <Health health={p.health} />,
                progress: <Progress value={prog.get(p.id) ?? 0} width={50} />,
                pm: <span className="block truncate">{p.pm?.full_name ?? '–'}</span>,
                dates: <span className="font-mono text-xs text-muted-foreground">{shortDate(p.start_date)} → {shortDate(p.end_date)}</span>,
                status: <Chip tone={p.status === 'active' ? 'info' : p.status === 'completed' ? 'good' : 'neutral'} className="capitalize">{p.status.replace('_', ' ')}</Chip>,
              },
            }))} />
        </Card>
      </div>
    </>
  )
}
