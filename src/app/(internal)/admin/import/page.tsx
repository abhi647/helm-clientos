import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { runBackfill } from '@/app/_actions/admin'
import { ActionForm } from '@/components/forms'
import { Card, Chip, Empty, PageHeader } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { loadImportPlan } from '@/lib/integrations/backfill'
import { requireStaff } from '@/lib/session'

export const metadata: Metadata = { title: 'Import from HubSpot & Zoho' }
export const dynamic = 'force-dynamic'

/**
 * Preview, then import. HubSpot deals (one per billing period) are grouped into a proposed project per customer and
 * service line; rename a deal's project to move it. Nothing is written until Import is pressed, and re-running only adds
 * what is new. Admin and CEO only.
 */
export default async function ImportPage() {
  const me = await requireStaff()
  if (!['admin', 'ceo'].includes(me.internal_role ?? '')) notFound()
  let loaded: Awaited<ReturnType<typeof loadImportPlan>>
  try {
    loaded = await loadImportPlan()
  } catch (e) {
    loaded = { error: e instanceof Error ? e.message : 'HubSpot or Zoho could not be read.' }
  }

  return (
    <>
      <PageHeader title="Import from HubSpot & Zoho" meta={<Link href="/admin" className="text-xs text-muted no-underline hover:text-ink">← Admin</Link>} />
      <div className="flex max-w-[1100px] flex-col gap-3 p-4">
        {'error' in loaded ? (
          <Card><p role="alert" className="m-0 text-[13px] text-crit-ink">{loaded.error}</p></Card>
        ) : !loaded.plan.projects.length ? (
          <Card><Empty title="No won deals found in HubSpot">Deals from the Engagement Won stage onwards are imported.</Empty></Card>
        ) : (
          <ActionForm action={runBackfill} submit="Import" resetOnSuccess={false} className="gap-3">
            <Card>
              <p className="m-0 text-[13px]">
                <b>{loaded.plan.customers.length}</b> customers, <b>{loaded.plan.projects.length}</b> projects from{' '}
                <b>{loaded.plan.projects.reduce((a, p) => a + p.deals.length, 0)}</b> won HubSpot deals.
                {loaded.zoho ? ' Zoho invoices and payments are imported and linked to their projects by invoice number.' : ' Zoho is not connected, so invoices are skipped.'}
              </p>
              <p className="mt-1.5 mb-0 text-xs text-muted">
                Each deal is a billing period. Deals with the same project name under a customer become one project; change a name to
                merge or split. Contacts are added as people to invite; nobody is emailed. Deals and invoices are visible to admin, CEO and finance only.
              </p>
              {loaded.plan.warnings.map((w) => <p key={w} className="mt-1.5 mb-0 text-xs text-warn-ink">{w}</p>)}
            </Card>
            {loaded.plan.customers.map((c) => (
              <Card key={c.key} flush title={<span className="flex flex-wrap items-center gap-2">{c.name}
                {c.existingId ? <Chip>Already in Helm</Chip> : <Chip tone="info">New customer</Chip>}
                {c.zohoCustomerId ? <Chip tone="good">Zoho</Chip> : null}{c.hubspotCompanyId ? <Chip tone="good">HubSpot</Chip> : null}</span>}>
                {loaded.plan.projects.filter((p) => p.customerKey === c.key).map((p) => (
                  <div key={p.name} className="border-b border-line-soft last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2 bg-head px-3 py-2 text-[13px]">
                      <b>{p.name}</b>
                      <Chip tone={p.status === 'active' ? 'info' : 'neutral'}>{p.status === 'active' ? 'Active' : 'Completed'}</Chip>
                      <span className="font-mono text-xs text-muted">{shortDate(p.start)} → {shortDate(p.end)} · {p.deals.length} deal{p.deals.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-[720px]">
                        {p.deals.map((d) => (
                          <div key={d.id} className="row grid-cols-[minmax(0,1fr)_140px_140px_220px] py-1">
                            <span className="truncate" title={d.name}>{d.name}</span>
                            <span className="truncate text-xs text-muted">{d.stageLabel}</span>
                            <span className="font-mono text-xs text-muted">{d.invoiceNumber ?? '–'}</span>
                            <input name={`p_${d.id}`} defaultValue={p.name} aria-label={`Project for ${d.name}`} className="input" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            ))}
          </ActionForm>
        )}
      </div>
    </>
  )
}
