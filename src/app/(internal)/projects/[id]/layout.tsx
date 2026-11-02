import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectState } from '@/components/project-state'
import { Tabs } from '@/components/shell/nav'
import { Building2, CalendarRange, ChevronRight, LayoutTemplate, UserRound } from 'lucide-react'
import { Chip, Health } from '@/components/ui'
import { ProgressRing } from '@/components/viz'
import { shortDate } from '@/lib/format'
import { canManage, canSeeFinance, requireStaff } from '@/lib/session'
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
      <header className="border-b border-border px-4 pt-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/customers" className="text-muted-foreground no-underline hover:text-ink">Customers</Link><ChevronRight aria-hidden className="size-3.5" />
          <Link href={`/customers/${p.customers?.id}`} className="text-muted-foreground no-underline hover:text-ink">{p.customers?.name}</Link><ChevronRight aria-hidden className="size-3.5" />
          <span className="truncate text-ink">{p.name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 pb-2">
          <ProgressRing value={pct} size={40} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-[19px] leading-tight font-semibold tracking-[-0.02em]">{p.name}</h1>
              <Health health={p.health} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarRange aria-hidden className="size-3.5" /><span className="tabular">{shortDate(p.start_date)} → {shortDate(p.end_date)}</span></span>
              <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden className="size-3.5" />PM <b className="font-medium text-ink">{p.pm?.full_name ?? '–'}</b></span>
              <span className="inline-flex items-center gap-1.5"><Building2 aria-hidden className="size-3.5" />Customer lead <b className="font-medium text-ink">{p.lead?.full_name ?? '–'}</b></span>
              {internal?.template_key ? <span className="inline-flex items-center gap-1.5"><LayoutTemplate aria-hidden className="size-3.5" />{templateByKey(internal.template_key)?.name ?? internal.template_key}</span> : null}
            </div>
          </div>
          {canManage(me) ? <span className="ml-auto"><ProjectState projectId={p.id} health={p.health} status={p.status} /></span> : null}
        </div>
        <Tabs items={[
          { href: base, label: 'Plan', exact: true },
          { href: `${base}/requests`, label: <>Requests {openReq ? <Chip className="ml-1 h-[18px] px-1.5">{openReq}</Chip> : null}</> },
          { href: `${base}/updates`, label: 'Updates' },
          { href: `${base}/docs`, label: 'Docs' },
          { href: `${base}/documents`, label: 'Files' },
          { href: `${base}/meetings`, label: 'Meetings' },
          { href: `${base}/decisions`, label: 'Decisions' },
          { href: `${base}/forms`, label: 'Forms' },
          { href: `${base}/activity`, label: 'Activity' },
          ...(canSeeFinance(me) ? [{ href: `${base}/billing`, label: 'Billing' }] : []),
          ...(['admin', 'ceo'].includes(me.internal_role ?? '') ? [{ href: `${base}/settings`, label: 'Settings' }] : []),
        ]} />
      </header>
      {children}
    </>
  )
}
