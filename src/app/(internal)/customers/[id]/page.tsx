import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  addToCustomerTeam, deleteCustomerData, dismissContact, inviteCustomerUser, removeFromCustomerTeam, setCustomerAccess, setCustomerLinks, updateCustomerUser,
} from '@/app/_actions/admin'
import { ActionButton, ActionForm } from '@/components/forms'
import { ActivityList, DocumentsPanel } from '@/components/project-parts'
import { Avatar, Card, Chip, Empty, Health, PageHeader, Progress } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { canManage, canSeeFinance, requireStaff } from '@/lib/session'
import { zohoTaxOptions } from '@/lib/integrations/zoho'
import { setCustomerTax } from '@/app/_actions/billing'
import { createClient } from '@/lib/supabase/server'
import type { CustomerInternalRow, DirectoryRow } from '@/lib/views'

export const metadata: Metadata = { title: 'Customer' }

/** The customer workspace: everything about one relationship, across all its projects, in one place. */
export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const finance = canSeeFinance(me)
  const supabase = await createClient()
  const { data: c } = await supabase.from('customers_internal').select('*').eq('id', id).maybeSingle().overrideTypes<CustomerInternalRow, { merge: false }>()
  if (!c) notFound()
  const [{ data: billing }, taxes] = finance
    ? await Promise.all([supabase.from('customer_billing').select('zoho_tax_id, zoho_tax_exemption_id, tax_label').eq('customer_id', id).maybeSingle(), zohoTaxOptions()])
    : [{ data: null }, { taxes: [], exemptions: [] as { id: string; name: string }[], error: undefined as string | undefined }]
  const [{ data: projects }, { data: progress }, { data: people }, { data: contacts }, { data: team }, { data: staff }] = await Promise.all([
    supabase.from('projects').select('id, name, health, status, end_date, pm:profiles!projects_pm_id_fkey(full_name)').eq('customer_id', id).order('status').order('name'),
    supabase.from('project_progress').select('*'),
    supabase.from('directory').select('id, full_name, email, customer_role, can_view_invoices, access_revoked_at').eq('customer_id', id).order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'email' | 'customer_role' | 'can_view_invoices' | 'access_revoked_at'>[], { merge: false }>(),
    // imported from HubSpot, not yet invited
    supabase.from('customer_contacts').select('id, full_name, email, job_title').eq('customer_id', id).is('invited_at', null).order('full_name'),
    supabase.from('customer_team').select('profile_id, role_label, person:profiles!customer_team_profile_id_fkey(full_name)').eq('customer_id', id).order('added_at'),
    supabase.from('profiles').select('id, full_name').eq('kind', 'internal').order('full_name'),
  ])
  const onTeam = new Set((team ?? []).map((t) => t.profile_id))
  const addable = (staff ?? []).filter((s) => !onTeam.has(s.id))
  const hasAccess = new Set((people ?? []).map((u) => u.email?.toLowerCase()))
  const toInvite = (contacts ?? []).filter((x) => !hasAccess.has(x.email))
  const prog = new Map((progress ?? []).map((p) => [p.project_id, p.total ? (100 * (p.done ?? 0)) / p.total : 0]))
  return (
    <>
      <PageHeader title={c.name}
        meta={<span className="text-xs text-muted">{c.hubspot_company_id ? `HubSpot ${c.hubspot_company_id}` : 'Not linked to HubSpot'} · {c.zoho_customer_id ? `Zoho ${c.zoho_customer_id}` : 'Not linked to Zoho'}</span>}
        actions={<div className="flex flex-wrap gap-2">
          {canManage(me) ? <Link href={`/projects/new?customer=${c.id}`} className="btn">+ New project</Link> : null}
          <Link href={`/requests/new?customer=${c.id}`} className="btn">+ Log a request</Link>
        </div>} />
      <div className="flex flex-col gap-3 p-4">
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
          <aside aria-label={`About ${c.name}`} className="flex min-w-0 flex-col gap-3">
            <Card title="Seven Billion team" extra={`${team?.length ?? 0} on this account`}>
              <div className="flex flex-col gap-1.5">
                {(team ?? []).map((t) => (
                  <div key={t.profile_id} className="flex items-center gap-2 px-1 py-1 text-[13px]">
                    <Avatar name={t.person?.full_name ?? '?'} />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-medium">{t.person?.full_name}</span>
                      {t.role_label ? <span className="truncate text-xs text-muted">{t.role_label}</span> : null}
                    </span>
                    {canManage(me) ? (
                      <span className="shrink-0"><ActionButton run={removeFromCustomerTeam.bind(null, c.id, t.profile_id)} className="btn-ghost h-6 px-2 text-xs"
                        confirm={`Take ${t.person?.full_name} off the ${c.name} account team?`}>Remove</ActionButton></span>
                    ) : null}
                  </div>
                ))}
                {!team?.length ? <p className="m-0 text-xs text-muted">No one is on the {c.name} account team yet.</p> : null}
              </div>
              {canManage(me) && addable.length ? (
                <details className="mt-3 border-t border-line-soft pt-3">
                  <summary className="btn h-8 w-fit cursor-pointer list-none text-xs">+ Add a team member</summary>
                  <ActionForm action={addToCustomerTeam} submit="Add to the team" className="mt-2">
                    <input type="hidden" name="customer_id" value={c.id} />
                    <select name="profile_id" required defaultValue="" aria-label="Team member" className="input">
                      <option value="" disabled>Choose someone…</option>
                      {addable.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                    <input name="role_label" maxLength={60} aria-label="Role on this account" placeholder="Role on this account, e.g. Data engineer (optional)" className="input" />
                    <p className="m-0 text-xs text-muted">They are told, hear about {c.name}&apos;s new requests, and are shown to {c.name} in their portal.</p>
                  </ActionForm>
                </details>
              ) : null}
            </Card>
            <Card title={`People at ${c.name}`} extra={`${people?.length ?? 0} with portal access`}>
              {canManage(me) ? (
                <details className="mb-3 border-b border-line-soft pb-3">
                  <summary className="btn h-8 w-fit cursor-pointer list-none text-xs">+ Add someone from {c.name}</summary>
                  <ActionForm action={inviteCustomerUser} submit="Send invitation" className="mt-2">
                    <input type="hidden" name="customer_id" value={c.id} />
                    <input name="full_name" required placeholder="Full name" aria-label="Full name" className="input" />
                    <input name="email" type="email" required placeholder="Work email" aria-label="Work email" className="input" />
                    <select name="customer_role" defaultValue="customer_member" aria-label="Role" className="input"><option value="customer_member">Team member (works with us day to day)</option><option value="customer_exec">Executive (approves estimates, rates and statements)</option></select>
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="can_view_invoices" /> Can see invoices and approve billing</label>
                    <p className="m-0 text-xs text-muted">They get an email to sign in to the {c.name} portal. No password needed.</p>
                  </ActionForm>
                </details>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {(people ?? []).map((u) => (
                  <details key={u.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-head">
                      <Avatar name={u.full_name} customer />
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate font-medium">{u.full_name}</span>
                        <span className="truncate text-xs text-muted">{u.email}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {u.access_revoked_at ? <Chip tone="crit">Access removed</Chip> : <>{u.customer_role === 'customer_exec' ? <Chip>Executive</Chip> : <Chip>Member</Chip>}{u.can_view_invoices ? <Chip tone="info">Invoices</Chip> : null}</>}
                        {canManage(me) ? <span className="ml-1 text-xs font-medium text-link group-open:hidden">Edit</span> : null}
                      </span>
                    </summary>
                    {canManage(me) ? (
                      <div className="mt-2 mb-1 rounded-md border border-line-soft bg-head/40 p-2.5">
                        {!u.access_revoked_at ? (
                          <ActionForm action={updateCustomerUser} submit="Save" resetOnSuccess={false} primary={false}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <select name="customer_role" defaultValue={u.customer_role ?? 'customer_member'} aria-label={`Role for ${u.full_name}`} className="input">
                              <option value="customer_member">Team member</option><option value="customer_exec">Executive</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="can_view_invoices" defaultChecked={!!u.can_view_invoices} /> Can see invoices and approve billing</label>
                          </ActionForm>
                        ) : null}
                        <div className="mt-2">
                          {u.access_revoked_at
                            ? <ActionButton run={setCustomerAccess.bind(null, u.id, false)} className="h-6 px-2 text-xs">Restore access</ActionButton>
                            : <ActionButton run={setCustomerAccess.bind(null, u.id, true)} className="btn-ghost h-6 px-2 text-xs text-crit-ink" confirm={`Remove ${u.full_name}'s access now? They are signed out everywhere immediately.`}>Remove access</ActionButton>}
                        </div>
                      </div>
                    ) : null}
                  </details>
                ))}
                {!people?.length ? <p className="m-0 text-xs text-muted">No one from {c.name} has access yet.</p> : null}
              </div>
              {canManage(me) && toInvite.length ? (
                <div className="mt-3 border-t border-line-soft pt-2.5">
                  <p className="label mt-0 mb-1.5">People to invite ({toInvite.length}, from HubSpot)</p>
                  {toInvite.map((x) => (
                    <details key={x.id} className="border-b border-line-soft py-1.5 last:border-b-0">
                      <summary className="cursor-pointer text-[13px]">{x.full_name} <span className="text-xs text-muted">{x.email}{x.job_title ? ` · ${x.job_title}` : ''}</span></summary>
                      <ActionForm action={inviteCustomerUser} submit="Send invitation" className="mt-2">
                        <input type="hidden" name="customer_id" value={c.id} />
                        <input type="hidden" name="full_name" value={x.full_name} />
                        <input type="hidden" name="email" value={x.email} />
                        <select name="customer_role" defaultValue="customer_member" aria-label={`Role for ${x.full_name}`} className="input"><option value="customer_member">Team member</option><option value="customer_exec">Executive</option></select>
                        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="can_view_invoices" /> Can see invoices and approve billing</label>
                      </ActionForm>
                      <ActionButton run={dismissContact.bind(null, x.id)} className="btn-ghost mt-1 h-6 px-2 text-xs">Not inviting</ActionButton>
                    </details>
                  ))}
                </div>
              ) : null}
            </Card>
            <Card title="HubSpot and Zoho">
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-muted">HubSpot</dt><dd className="m-0 font-mono">{c.hubspot_company_id ?? 'Not linked'}</dd>
                <dt className="text-muted">Zoho</dt><dd className="m-0 font-mono">{c.zoho_customer_id ?? 'Not linked'}</dd>
                {finance ? <><dt className="text-muted">GST on invoices</dt><dd className="m-0">{billing?.tax_label || <span className="text-warn-ink">Not set: Zoho will refuse invoices</span>}</dd></> : null}
              </dl>
              {finance ? (
                <details className="mt-3 border-t border-line-soft pt-3">
                  <summary className="btn h-8 w-fit cursor-pointer list-none text-xs">{billing ? 'Change GST' : 'Set GST'}</summary>
                  <div className="mt-2">
                    {taxes.taxes.length || taxes.exemptions.length ? (
                      <ActionForm action={setCustomerTax} submit="Save GST" resetOnSuccess={false} primary={false}>
                        <input type="hidden" name="customer_id" value={c.id} />
                        <select name="tax" aria-label="GST on invoices" className="input" defaultValue={billing?.zoho_tax_id ? `tax:${billing.zoho_tax_id}|${billing.tax_label}` : billing?.zoho_tax_exemption_id ? `exemption:${billing.zoho_tax_exemption_id}|${billing.tax_label}` : ''}>
                          <option value="">Not set</option>
                          <optgroup label="Taxes">{taxes.taxes.map((t) => <option key={t.id} value={`tax:${t.id}|${t.name}`}>{t.name} ({t.percentage}%)</option>)}</optgroup>
                          {taxes.exemptions.length ? <optgroup label="Tax exemptions">{taxes.exemptions.map((x) => <option key={x.id} value={`exemption:${x.id}|${x.name}`}>{x.name}</option>)}</optgroup> : null}
                        </select>
                        <p className="m-0 text-xs text-muted">Every line of this customer&apos;s invoices carries it. Usually GST18 in Punjab, IGST18 in other states, and an exemption (export under LUT) or IGST0 for clients abroad: check with your accountant.</p>
                      </ActionForm>
                    ) : <p className="m-0 text-xs text-muted">{taxes.error ? `Zoho could not list the taxes: ${taxes.error}` : 'Connect Zoho Books to pick the GST from its tax list.'}</p>}
                  </div>
                </details>
              ) : null}
              {canManage(me) ? (
                <details className="mt-3 border-t border-line-soft pt-3">
                  <summary className="btn h-8 w-fit cursor-pointer list-none text-xs">{c.hubspot_company_id || c.zoho_customer_id ? 'Change links' : 'Link to HubSpot and Zoho'}</summary>
                  <div className="mt-2">
                    <ActionForm action={setCustomerLinks} submit="Save links" resetOnSuccess={false} primary={false}>
                      <input type="hidden" name="customer_id" value={c.id} />
                      <label className="flex flex-col gap-1"><span className="label">HubSpot company id</span>
                        <input name="hubspot_company_id" defaultValue={c.hubspot_company_id ?? ''} inputMode="numeric" className="input" placeholder="Not linked" /></label>
                      <label className="flex flex-col gap-1"><span className="label">Zoho Books customer id</span>
                        <input name="zoho_customer_id" defaultValue={c.zoho_customer_id ?? ''} inputMode="numeric" className="input" placeholder="Not linked" /></label>
                      <p className="m-0 text-xs text-muted">Checked against HubSpot and Zoho before saving. Zoho invoices and payments follow this id; HubSpot deals and contacts follow the company id.</p>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </Card>
            {['admin', 'ceo'].includes(me.internal_role ?? '') ? (
          <Card title="Customer data" extra="Admin and CEO">
            <div className="flex flex-col gap-3">
              <p className="m-0 text-xs text-muted">For a data request, or before an account is closed: everything Helm holds about {c.name}, as one JSON file.</p>
              <div><a href={`/api/customers/${c.id}/export`} className="btn" download>Export all data</a></div>
              <details className="rounded-md border border-crit-bg p-2.5">
                <summary className="cursor-pointer text-xs font-semibold text-crit-ink">Delete {c.name} and all its data</summary>
                <ActionForm action={deleteCustomerData} submit="Delete for good" className="mt-2" resetOnSuccess={false}>
                  <input type="hidden" name="customer_id" value={c.id} />
                  <p className="m-0 text-xs text-muted">Removes every project, request, file, invoice, billing record and comment, and the sign-ins of their people. This cannot be undone: export first.</p>
                  <input name="confirm_name" required autoComplete="off" aria-label="Type the customer's name to confirm" placeholder={`Type ${c.name} to confirm`} className="input" />
                </ActionForm>
              </details>
            </div>
          </Card>
        ) : null}
          </aside>
          <div className="flex min-w-0 flex-col gap-3">
            <Card flush className="overflow-x-auto" title="Projects" extra={`${projects?.length ?? 0}`}>
              {projects?.length ? projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="row grid-cols-[minmax(0,1fr)_130px_110px_90px_90px] text-ink no-underline hover:bg-head">
                  <span className="truncate font-medium">{p.name}</span><Health health={p.health} /><Progress value={prog.get(p.id) ?? 0} width={44} />
                  <span className="truncate text-xs">{p.pm?.full_name}</span><span className="font-mono text-xs text-muted">{shortDate(p.end_date)}</span>
                </Link>
              )) : <Empty title="No projects yet" />}
            </Card>
          <DocumentsPanel tiles me={me} customerId={c.id} projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))} />
          <Card flush title="Activity" extra="Latest 15"><ActivityList customerId={c.id} limit={15} /></Card>
          </div>
        </div>
      </div>
    </>
  )
}
