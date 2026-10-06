import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectState } from '@/components/project-state'
import { Tabs } from '@/components/shell/nav'
import { Chip, Health, Progress } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { canManage, canSeeCommercials, canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { templateByKey } from '@/lib/templates'

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const [{ data: p }, { data: internal }, { data: prog }, { count: openReq }] = await Promise.all([
    supabase.from('projects').select('id, name, health, status, start_date, end_date, customer_id, customers(id, name), pm:profiles!projects_pm_id_fkey(full_name), lead:profiles!projects_customer_lead_id_fkey(full_name)').eq('id', id).maybeSingle(),
    supabase.from('projects_internal').select('template_key').eq('id', id).maybeSingle(),
    supabase.from('project_progress').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('requests').select('id', { count: 'exact', head: true }).eq('project_id', id).not('status', 'in', '(delivered,cancelled)'),
  ])
  if (!p) notFound()
  const pct = prog?.total ? (100 * (prog.done ?? 0)) / prog.total : 0
  const base = `/projects/${id}`
  return (
    <>
      <header className="border-b border-line bg-white px-4 pt-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
          <Link href="/customers" className="text-muted no-underline hover:text-ink">Customers</Link><span>/</span>
          <Link href={`/customers/${p.customers?.id}`} className="text-muted no-underline hover:text-ink">{p.customers?.name}</Link><span>/</span>
          <span className="text-ink">{p.name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
          <h1 className="m-0 text-lg font-semibold">{p.name}</h1>
          <Health health={p.health} />
          <Progress value={pct} />
          <span className="font-mono text-xs text-muted">{shortDate(p.start_date)} → {shortDate(p.end_date)}</span>
          <span className="text-xs text-muted">PM <b className="font-medium text-ink">{p.pm?.full_name ?? '–'}</b></span>
          <span className="text-xs text-muted">Customer lead <b className="font-medium text-ink">{p.lead?.full_name ?? '–'}</b></span>
          {internal?.template_key ? <span className="text-xs text-muted">Template <b className="font-medium text-ink">{templateByKey(internal.template_key)?.name ?? internal.template_key}</b></span> : null}
          {canManage(me) ? <span className="ml-auto"><ProjectState projectId={p.id} health={p.health} status={p.status} /></span> : null}
        </div>
        <Tabs items={[
          { href: base, label: 'Plan', exact: true },
          { href: `${base}/requests`, label: <>Requests {openReq ? <Chip className="ml-1 h-4 px-1.5">{openReq}</Chip> : null}</> },
          { href: `${base}/updates`, label: 'Updates' },
          { href: `${base}/documents`, label: 'Documents' },
          { href: `${base}/meetings`, label: 'Meetings' },
          { href: `${base}/decisions`, label: 'Decisions' },
          { href: `${base}/forms`, label: 'Forms' },
          { href: `${base}/activity`, label: 'Activity' },
          ...(canSeeFinance(me) ? [{ href: `${base}/billing`, label: 'Billing' }] : []),
          ...(canSeeCommercials(me) ? [{ href: `${base}/commercials`, label: <>Commercials <Chip className="ml-1 h-4 border border-dashed border-internal-line bg-internal-bg px-1.5 text-internal-ink">Internal</Chip></> }] : []),
        ]} />
      </header>
      {children}
    </>
  )
}
