import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createProject } from '@/app/_actions/admin'
import { ActionForm } from '@/components/forms'
import { btn, Card, cn, PageHeader } from '@/components/ui'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { TEMPLATES } from '@/lib/templates'
import type { DirectoryRow } from '@/lib/views'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'New project' }

/** Start a project by hand: for work that did not come through a HubSpot Closed Won deal, or to link one yourself. */
export default async function NewProject({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const me = await requireStaff()
  if (!canManage(me)) redirect('/projects')
  const sp = await searchParams
  const supabase = await createClient()
  const [{ data: customers }, { data: staff }] = await Promise.all([
    supabase.from('customers').select('id, name').order('name'),
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').is('access_revoked_at', null).order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'internal_role'>[], { merge: false }>(),
  ])
  const customer = customers?.find((c) => c.id === sp.customer)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader title="New project" meta={<Link href="/projects" className="text-xs text-muted-foreground no-underline hover:text-ink">← Projects</Link>} />
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 p-4">
        <p className="m-0 text-[13px] text-muted-foreground">Won deals in HubSpot arrive on Home ready to set up. Use this for anything else, or to link a deal yourself.</p>
        <Card title="1. Which customer?">
          <div className="flex flex-wrap gap-1.5">
            {(customers ?? []).map((c) => (
              <Link key={c.id} href={`/projects/new?customer=${c.id}`} aria-current={c.id === customer?.id ? 'page' : undefined}
                className={btn('outline', c.id === customer?.id && 'border-ink bg-head font-semibold')}>{c.name}</Link>
            ))}
            <Link href="/customers" className={btn('ghost')}>+ New customer</Link>
          </div>
        </Card>
        {customer ? (
          <Card title={`2. The project for ${customer.name}`}>
            <ActionForm action={createProject} submit="Create project" resetOnSuccess={false}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <label className="flex flex-col gap-1"><span className="label">Project name</span>
                <Input name="name" className="w-auto" placeholder="e.g. Power BI rollout, phase 2" maxLength={160} />
                <span className="text-xs text-muted-foreground">Leave it empty to use the HubSpot deal name.</span></label>
              <label className="flex flex-col gap-1"><span className="label">Plan</span>
                <NativeSelect size="sm" name="template_key" defaultValue="" className="h-9">
                  <option value="">Blank: one Delivery phase, add tasks yourself</option>
                  {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.weeks} weeks)</option>)}
                </NativeSelect></label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1"><span className="label">Start</span>
                  <Input type="date" name="start_date" required defaultValue={today} className="w-auto" /></label>
                <label className="flex flex-col gap-1"><span className="label">End (optional)</span>
                  <Input type="date" name="end_date" className="w-auto" />
                  <span className="text-xs text-muted-foreground">A template sets it from its length.</span></label>
                <label className="flex flex-col gap-1"><span className="label">Project manager</span>
                  <NativeSelect size="sm" name="pm_id" defaultValue={me.id} className="h-9">
                    {(staff ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.internal_role ? ` (${p.internal_role})` : ''}</option>)}
                  </NativeSelect></label>
              </div>
              <label className="flex flex-col gap-1"><span className="label">HubSpot deal id (optional)</span>
                <Input name="hubspot_deal_id" inputMode="numeric" className="w-auto" placeholder="e.g. 18234567890" maxLength={40} />
                <span className="text-xs text-muted-foreground">Checked against HubSpot. Billing reaches Zoho through the customer&apos;s Zoho id.</span></label>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  )
}
