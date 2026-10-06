import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty, Health, PageHeader, Progress } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Projects' }

export default async function Projects() {
  await requireStaff()
  const supabase = await createClient()
  const [{ data: projects }, { data: progress }] = await Promise.all([
    supabase.from('projects').select('id, name, health, status, start_date, end_date, template_key, customers(name), pm:profiles!projects_pm_id_fkey(full_name)').order('status').order('name'),
    supabase.from('project_progress').select('*'),
  ])
  const prog = new Map((progress ?? []).map((p) => [p.project_id, p.total ? (100 * (p.done ?? 0)) / p.total : 0]))
  return (
    <>
      <PageHeader title="Projects" meta={<span className="text-xs text-muted">{projects?.length ?? 0} projects</span>} />
      <div className="p-4">
        <Card flush className="overflow-x-auto">
          {projects?.length ? (
            <div className="min-w-[860px]">
              <div className="row row-head grid-cols-[150px_minmax(200px,1fr)_120px_110px_90px_150px_90px]"><span>Customer</span><span>Project</span><span>Health</span><span>Progress</span><span>PM</span><span>Dates</span><span>Status</span></div>
              {projects.map((p) => (
                <div key={p.id} className="row grid-cols-[150px_minmax(200px,1fr)_120px_110px_90px_150px_90px] hover:bg-head">
                  <span className="truncate font-semibold">{p.customers?.name}</span>
                  <Link href={`/projects/${p.id}`} className="truncate font-medium text-ink no-underline hover:underline">{p.name}</Link>
                  <Health health={p.health} />
                  <Progress value={prog.get(p.id) ?? 0} width={50} />
                  <span className="truncate">{p.pm?.full_name ?? '–'}</span>
                  <span className="font-mono text-xs text-muted">{shortDate(p.start_date)} → {shortDate(p.end_date)}</span>
                  <span className="text-xs capitalize">{p.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          ) : <Empty title="No projects yet">Projects are created from a HubSpot Closed Won deal on Home.</Empty>}
        </Card>
      </div>
    </>
  )
}
