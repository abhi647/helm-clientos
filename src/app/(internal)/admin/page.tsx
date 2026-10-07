import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createCustomer, inviteStaff, syncZohoNow } from '@/app/_actions/admin'
import { ActionButton, ActionForm } from '@/components/forms'
import { AccountOwnerSelect, AutomationToggle, RoleSelect } from '@/components/admin-controls'
import { Avatar, Card, Chip, PageHeader } from '@/components/ui'
import { env } from '@/lib/env'
import { label, relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { CustomerInternalRow, DirectoryRow } from '@/lib/views'

export const metadata: Metadata = { title: 'Admin' }

const RULES = [
  { key: 'kickoff_data_access', when: 'Kickoff form submitted', then: 'Send the customer the data access form' },
  { key: 'uat_start_action', when: 'First task in a UAT phase starts', then: 'Ask the customer lead for UAT feedback' },
  { key: 'uat_done_approval', when: 'UAT tasks complete, or customer accepts UAT', then: 'Request UAT sign-off from the customer lead' },
  { key: 'at_risk_alert', when: 'Project health turns At Risk', then: 'Notify the PM and the CEO' },
  { key: 'critical_request_alert', when: 'A request is raised as critical', then: 'Notify the PM and the account owner' },
  { key: 'closure_form', when: 'Project is marked Completed', then: 'Send the customer the closure form' },
  { key: 'csat_request', when: 'A request is delivered', then: 'Ask the requester for a CSAT rating' },
  { key: 'csat_pulse', when: 'Once a month (daily job)', then: 'Ask each customer user for a CSAT check-in' },
  { key: 'csat_low_followup', when: 'A CSAT score of 1 or 2', then: 'Open a follow-up for the account owner and PM' },
] as const

/** Organisation settings: who has access, customers, playbook automations and integrations. Admin and CEO only. */
export default async function Admin() {
  const me = await requireStaff()
  if (!['admin', 'ceo'].includes(me.internal_role ?? '')) notFound()
  const supabase = await createClient()
  const [{ data: staff }, { data: customers }, { data: rules }, { data: lastInvoice }, { data: setups }] = await Promise.all([
    supabase.from('directory').select('id, full_name, email, internal_role, access_revoked_at').eq('kind', 'internal').eq('org_id', me.org_id!).order('full_name')
      .overrideTypes<Pick<DirectoryRow, 'id' | 'full_name' | 'email' | 'internal_role' | 'access_revoked_at'>[], { merge: false }>(),
    supabase.from('customers_internal').select('id, name, hubspot_company_id, zoho_customer_id, account_owner_id').order('name')
      .overrideTypes<Pick<CustomerInternalRow, 'id' | 'name' | 'hubspot_company_id' | 'zoho_customer_id' | 'account_owner_id'>[], { merge: false }>(),
    supabase.from('automation_rules').select('key, enabled'),
    supabase.from('invoices').select('synced_at').order('synced_at', { ascending: false }).limit(1),
    supabase.from('engagement_setups').select('id').eq('status', 'pending'),
  ])
  const { data: activeProjects } = await supabase.from('projects').select('customer_id').eq('status', 'active')
  // last sign-in comes from Auth; this page is admin-only and server-rendered
  const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 })
  const removed = new Set((staff ?? []).filter((p) => p.access_revoked_at).map((p) => p.id))
  const lastSeen = new Map((auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at]))
  const withMfa = new Set((auth?.users ?? []).filter((u) => (u.factors ?? []).some((f) => f.status === 'verified')).map((u) => u.id))
  const noMfa = (staff ?? []).filter((p) => !p.access_revoked_at && !withMfa.has(p.id))
  const { count: blocked } = await supabase.from('documents').select('id', { count: 'exact', head: true }).in('scan_status', ['infected', 'rejected'])
  const { count: unscanned } = await supabase.from('documents').select('id', { count: 'exact', head: true }).in('scan_status', ['pending', 'not_scanned'])
  const enabled = new Map((rules ?? []).map((r) => [r.key, r.enabled]))
  const e = env()
  const zoho = !!(e.ZOHO_CLIENT_ID && e.ZOHO_REFRESH_TOKEN && e.ZOHO_ORGANIZATION_ID)
  const integrations = [
    { name: 'Resend (email)', ok: !!e.RESEND_API_KEY, note: e.RESEND_API_KEY ? `Sending as ${e.EMAIL_FROM}` : 'No key: emails are logged, not sent' },
    { name: 'HubSpot', ok: !!(e.HUBSPOT_ACCESS_TOKEN && e.HUBSPOT_WEBHOOK_SECRET), note: setups?.length ? `${setups.length} Closed Won deals waiting to be set up` : 'Closed Won deals become engagements' },
    { name: 'Zoho Books', ok: zoho, note: !zoho ? 'Add the ZOHO_* settings to sync invoices' : lastInvoice?.[0] ? `Last sync ${relativeTime(lastInvoice[0].synced_at)}` : 'Not synced yet' },
  ]

  return (
    <>
      <PageHeader title="Admin" meta={<span className="text-xs text-muted">Seven Billion organisation settings</span>}
        actions={<Link href="/admin/health" className="btn">System health</Link>} />
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3">
          <Card flush className="overflow-x-auto" title="Team" extra={`${staff?.length ?? 0} people`}>
            <div className="min-w-[620px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_150px]"><span>Name</span><span>Email</span><span>Last sign-in</span><span>Role</span></div>
              {(staff ?? []).map((p) => (
                <div key={p.id} className="row grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_150px]">
                  <span className="flex min-w-0 items-center gap-2"><Avatar name={p.full_name} /><span className="truncate font-medium">{p.full_name}</span>{p.id === me.id ? <Chip>You</Chip> : null}</span>
                  <span className="truncate text-xs text-muted">{p.email}</span>
                  <span className="text-xs text-muted">{lastSeen.get(p.id) ? relativeTime(lastSeen.get(p.id)!) : 'Never'}</span>
                  <span>{p.id === me.id ? <span className="text-xs">{label(p.internal_role ?? '')}</span>
                    : <RoleSelect userId={p.id} role={removed.has(p.id) ? 'remove' : p.internal_role!} />}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card flush className="overflow-x-auto" title="Customers" extra={`${customers?.length ?? 0} customers`}>
            <div className="min-w-[660px]">
              <div className="row row-head grid-cols-[minmax(0,1fr)_80px_120px_120px_170px]"><span>Customer</span><span>Active</span><span>HubSpot</span><span>Zoho</span><span>Account owner</span></div>
              {(customers ?? []).map((c) => (
                <div key={c.id} className="row grid-cols-[minmax(0,1fr)_80px_120px_120px_170px]">
                  <Link href={`/customers/${c.id}`} className="truncate font-medium">{c.name}</Link>
                  <span className="font-mono text-xs">{(activeProjects ?? []).filter((p) => p.customer_id === c.id).length}</span>
                  <span className="truncate font-mono text-xs text-muted">{c.hubspot_company_id ?? '–'}</span>
                  <span className="truncate font-mono text-xs text-muted">{c.zoho_customer_id ?? '–'}</span>
                  <AccountOwnerSelect customerId={c.id} value={c.account_owner_id ?? ''} people={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name }))} />
                </div>
              ))}
            </div>
          </Card>

          <Card flush title="Playbook automations" extra="Run in the database, so they never miss an event">
            <div className="row row-head grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px]"><span>When</span><span>Then</span><span /></div>
            {RULES.map((r) => (
              <div key={r.key} className="row grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px] py-1">
                <span>{r.when}</span><span className="text-muted">{r.then}</span>
                <AutomationToggle ruleKey={r.key} enabled={enabled.get(r.key) ?? true} />
              </div>
            ))}
          </Card>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          <Card title="Invite a team member">
            <ActionForm action={inviteStaff} submit="Send invitation">
              <input name="full_name" required aria-label="Full name" placeholder="Full name" className="input" />
              <input name="email" type="email" required aria-label="Work email" placeholder="name@sevenbillion.co" className="input" />
              <select name="internal_role" aria-label="Role" defaultValue="consultant" className="input">
                <option value="pm">PM / Account manager</option><option value="consultant">Developer / Consultant</option>
                <option value="finance">Finance</option><option value="ceo">CEO</option><option value="admin">Admin</option>
              </select>
              <p className="m-0 text-xs text-muted">They get an email link. Sign-in is by email link or Google, never by password.</p>
            </ActionForm>
          </Card>
          <Card title="Add a customer">
            <ActionForm action={createCustomer} submit="Add customer">
              <input name="name" required aria-label="Customer name" placeholder="Company name" className="input" />
              <select name="account_owner_id" aria-label="Account owner" defaultValue="" className="input">
                <option value="">Account owner…</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <input name="hubspot_company_id" aria-label="HubSpot company id" placeholder="HubSpot company id (optional)" className="input" />
              <input name="zoho_customer_id" aria-label="Zoho customer id" placeholder="Zoho customer id (optional)" className="input" />
            </ActionForm>
          </Card>
          <Card flush title="Security">
            <div className="row grid-cols-[minmax(0,1fr)_96px] py-1.5">
              <span className="flex min-w-0 flex-col"><span className="font-medium">Two-step sign-in for staff</span>
                <span className="text-xs text-muted">{noMfa.length ? `Not set up yet: ${noMfa.map((p) => p.full_name).join(', ')}. They are asked at their next sign-in.` : 'Everyone on the team has an authenticator app.'}</span></span>
              <span className="text-right"><Chip tone="good">Required</Chip></span>
            </div>
            <div className="row grid-cols-[minmax(0,1fr)_96px] py-1.5">
              <span className="flex min-w-0 flex-col"><span className="font-medium">Virus scanning</span>
                <span className="text-xs text-muted">{e.CLAMAV_HOST ? `ClamAV at ${e.CLAMAV_HOST}` : 'No scanner set: files get a type check only (set CLAMAV_HOST)'}{blocked ? ` · ${blocked} blocked` : ''}{unscanned ? ` · ${unscanned} not scanned` : ''}</span></span>
              <span className="text-right">{e.CLAMAV_HOST ? <Chip tone="good">On</Chip> : <Chip tone="warn">Not set up</Chip>}</span>
            </div>
            <div className="row grid-cols-[minmax(0,1fr)_96px] py-1.5">
              <span className="flex min-w-0 flex-col"><span className="font-medium">Removing access</span>
                <span className="text-xs text-muted">Takes effect on the next click; all sessions end.</span></span>
              <span className="text-right"><Chip tone="good">Instant</Chip></span>
            </div>
          </Card>
          <Card flush title="Integrations">
            {integrations.map((i) => (
              <div key={i.name} className="row grid-cols-[minmax(0,1fr)_96px] py-1.5">
                <span className="flex min-w-0 flex-col"><span className="font-medium">{i.name}</span><span className="truncate text-xs text-muted">{i.note}</span></span>
                <span className="text-right">{i.ok ? <Chip tone="good">Connected</Chip> : <Chip tone="warn">Not set up</Chip>}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 border-t border-line-soft p-3">
              {zoho ? <ActionButton run={syncZohoNow}>Sync Zoho now</ActionButton> : null}
              <Link href="/admin/import" className="btn">Import from HubSpot &amp; Zoho</Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
