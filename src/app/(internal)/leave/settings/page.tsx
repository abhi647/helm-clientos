import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { saveLeaveTypes, setAllowance, setReportingManager } from '@/app/_actions/leave'
import { DataGrid } from '@/components/data-grid'
import { ActionForm, StatusSelect } from '@/components/forms'
import { Card, PageHeader } from '@/components/ui'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Leave settings' }

/** Admin and CEO: leave types and allowances, who approves whose leave, and individual allowances. */
export default async function LeaveSettings() {
  const me = await requireStaff()
  if (!['admin', 'ceo'].includes(me.internal_role ?? '')) notFound()
  const supabase = await createClient()
  const year = new Date().getUTCFullYear()
  const [{ data: types }, { data: staff }, { data: managers }, { data: overrides }] = await Promise.all([
    supabase.from('leave_types').select('id, name, yearly_allowance, paid, optional_holidays_only, active').order('position'),
    supabase.from('directory').select('id, full_name, internal_role').eq('kind', 'internal').is('access_revoked_at', null).order('full_name'),
    supabase.from('reporting_managers').select('profile_id, manager_id'),
    supabase.from('leave_allowances').select('profile_id, leave_type_id, year, days').gte('year', year).order('year'),
  ])
  const people = (staff ?? []).map((p) => ({ id: p.id!, name: p.full_name! , role: p.internal_role }))
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  const typeOf = new Map((types ?? []).map((t) => [t.id, t.name]))
  const managerOf = new Map((managers ?? []).map((m) => [m.profile_id, m.manager_id]))
  return (
    <>
      <PageHeader title="Leave settings" meta={<Link href="/leave" className="text-xs text-muted-foreground no-underline hover:text-foreground">← Leave</Link>} />
      <div className="grid items-start gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card flush title="Leave types" description="Days per calendar year for everyone; empty means no limit. Turn a type off to stop new requests.">
          <ActionForm action={saveLeaveTypes} submit="Save leave types" resetOnSuccess={false} className="gap-0 [&>div:last-child]:p-3">
            <DataGrid label="Leave types"
              columns={[
                { key: 'name', label: 'Type' }, { key: 'paid', label: 'Paid', className: 'w-[70px]' },
                { key: 'allowance', label: 'Days a year', align: 'right', className: 'w-[120px]' }, { key: 'active', label: 'In use', align: 'center', className: 'w-[70px]' },
              ]}
              rows={(types ?? []).map((t) => ({
                id: t.id,
                cells: {
                  name: <span><input type="hidden" name="type_id" value={t.id} /><span className="font-medium">{t.name}</span>{t.optional_holidays_only ? <span className="block text-[11px] text-muted-foreground">Only on optional holidays</span> : null}</span>,
                  paid: <span className="text-xs">{t.paid ? 'Paid' : 'Unpaid'}</span>,
                  allowance: <Input name={`allowance_${t.id}`} aria-label={`Days a year of ${t.name}`} defaultValue={t.yearly_allowance ?? ''} inputMode="decimal" placeholder="No limit" className="ml-auto w-24 tabular text-right" />,
                  active: <Checkbox name={`active_${t.id}`} value="on" defaultChecked={t.active} aria-label={`${t.name} in use`} />,
                },
              }))} />
          </ActionForm>
        </Card>

        <Card flush title="Who approves whose leave" description="Without a manager, admins and the CEO approve. Nobody approves their own leave.">
          <DataGrid label="Reporting managers" search searchLabel="Search people"
            columns={[{ key: 'person', label: 'Person', sortable: true }, { key: 'manager', label: 'Approved by', className: 'w-[220px]' }]}
            rows={people.map((p) => ({
              id: p.id,
              values: { person: p.name },
              cells: {
                person: <span><span className="font-medium">{p.name}</span> <span className="text-xs text-muted-foreground">{p.role}</span></span>,
                manager: <StatusSelect label={`Who approves ${p.name}'s leave`} value={managerOf.get(p.id) ?? ''}
                  options={[{ value: '', label: 'Admins and CEO' }, ...people.filter((x) => x.id !== p.id).map((x) => ({ value: x.id, label: x.name }))]}
                  onChange={setReportingManager.bind(null, p.id)} />,
              },
            }))} />
        </Card>

        <Card title="A person's own allowance" description="For someone who joined mid-year or carries leave over. Leave the days empty to go back to the default.">
          <ActionForm action={setAllowance} submit="Save allowance">
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1"><span className="label">Person</span>
                <NativeSelect size="sm" name="profile_id" required containerClassName="w-full">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></label>
              <label className="flex flex-col gap-1"><span className="label">Type</span>
                <NativeSelect size="sm" name="leave_type_id" required containerClassName="w-full">{(types ?? []).filter((t) => t.yearly_allowance != null).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></label>
              <label className="flex flex-col gap-1"><span className="label">Year</span><Input name="year" type="number" defaultValue={year} min={2020} max={2100} /></label>
              <label className="col-span-2 flex flex-col gap-1"><span className="label">Days</span><Input name="days" inputMode="decimal" placeholder="e.g. 7.5" /></label>
            </div>
          </ActionForm>
        </Card>

        <Card flush title="Allowances set by hand" description={`${year} onwards`}>
          <DataGrid label="Individual allowances"
            empty={<p className="m-0 text-xs text-muted-foreground">Everyone has the default allowances.</p>}
            columns={[{ key: 'person', label: 'Person' }, { key: 'type', label: 'Type' }, { key: 'year', label: 'Year', className: 'w-[70px]' }, { key: 'days', label: 'Days', align: 'right', className: 'w-[70px]' }]}
            rows={(overrides ?? []).map((o) => ({
              id: `${o.profile_id}-${o.leave_type_id}-${o.year}`,
              cells: {
                person: <span>{nameOf.get(o.profile_id) ?? '–'}</span>, type: <span className="text-xs">{typeOf.get(o.leave_type_id)}</span>,
                year: <span className="tabular text-xs">{o.year}</span>, days: <span className="tabular font-mono text-xs">{+Number(o.days).toFixed(1)}</span>,
              },
            }))} />
        </Card>
      </div>
    </>
  )
}
