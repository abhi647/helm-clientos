import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { inviteCustomerUser } from '@/app/_actions/admin'
import { ActionForm } from '@/components/forms'
import { ActivityList, DocumentsPanel } from '@/components/project-parts'
import { Avatar, Card, Chip, Empty, Health, PageHeader, Progress } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { CustomerInternalRow, DirectoryRow } from '@/lib/views'

export const metadata: Metadata = { title: 'Customer' }

/** The customer workspace: everything about one relationship, across all its projects, in one place. */
export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: c } = await supabase.from('customers_internal').select('*').eq('id', id).maybeSingle().overrideTypes<CustomerInternalRow, { merge: false }>()
  if (!c) notFound()
  const [{ data: projects }, { data: progress }, { data: people }] = await Promise.all([
    supabase.from('projects').select('id, name, health, status, end_date, pm:profiles!projects_pm_id_fkey(full_name)').eq('customer_id', id).order('status').order('name'),
    supabase.from('project_progress').select('*'),
    supabase.from('directory').select('id, full_name, email, customer_role, can_view_invoices').eq('customer_id', id).order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'email' | 'customer_role' | 'can_view_invoices'>[], { merge: false }>(),
  ])
  const prog = new Map((progress ?? []).map((p) => [p.project_id, p.total ? (100 * (p.done ?? 0)) / p.total : 0]))
  return (
    <>
      <PageHeader title={c.name} meta={<span className="text-xs text-muted">{c.hubspot_company_id ? `HubSpot company ${c.hubspot_company_id}` : 'Not linked to HubSpot'}</span>} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Card flush className="min-w-0 flex-[999_1_520px] overflow-x-auto" title="Projects">
            {projects?.length ? projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="row grid-cols-[minmax(0,1fr)_130px_110px_90px_90px] text-ink no-underline hover:bg-head">
                <span className="truncate font-medium">{p.name}</span><Health health={p.health} /><Progress value={prog.get(p.id) ?? 0} width={44} />
                <span className="truncate text-xs">{p.pm?.full_name}</span><span className="font-mono text-xs text-muted">{shortDate(p.end_date)}</span>
              </Link>
            )) : <Empty title="No projects yet" />}
          </Card>
          <Card className="min-w-0 flex-[1_1_320px]" title="Portal users" extra={`${people?.length ?? 0}`}>
            <div className="flex flex-col gap-1.5">
              {(people ?? []).map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-[13px]">
                  <Avatar name={u.full_name} customer /><span className="truncate">{u.full_name}</span>
                  <span className="truncate text-xs text-muted">{u.email}</span>
                  <span className="ml-auto flex gap-1">{u.customer_role === 'customer_exec' ? <Chip>Executive</Chip> : <Chip>Member</Chip>}{u.can_view_invoices ? <Chip tone="info">Invoices</Chip> : null}</span>
                </div>
              ))}
              {!people?.length ? <p className="m-0 text-xs text-muted">No one from {c.name} has access yet.</p> : null}
            </div>
            {canManage(me) ? (
              <details className="mt-3 border-t border-line-soft pt-2.5">
                <summary className="cursor-pointer text-xs font-medium text-link">Invite someone from {c.name}</summary>
                <ActionForm action={inviteCustomerUser} submit="Send invitation" className="mt-2">
                  <input type="hidden" name="customer_id" value={c.id} />
                  <input name="full_name" required placeholder="Full name" aria-label="Full name" className="input" />
                  <input name="email" type="email" required placeholder="Work email" aria-label="Work email" className="input" />
                  <select name="customer_role" defaultValue="customer_member" aria-label="Role" className="input"><option value="customer_member">Member (working team)</option><option value="customer_exec">Executive</option></select>
                  <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="can_view_invoices" /> Can see invoices</label>
                </ActionForm>
              </details>
            ) : null}
          </Card>
        </div>
        <DocumentsPanel me={me} customerId={c.id} projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))} />
        <Card flush title="Activity"><ActivityList customerId={c.id} limit={30} /></Card>
      </div>
    </>
  )
}
