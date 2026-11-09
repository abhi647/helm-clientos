import type { Metadata } from 'next'
import Link from 'next/link'
import { createCustomer } from '@/app/_actions/admin'
import { DataGrid } from '@/components/data-grid'
import { ActionForm } from '@/components/forms'
import { btn, Card, Empty, Health, PageHeader } from '@/components/ui'
import type { Enums } from '@/lib/database.types'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = { title: 'Customers' }

const WORST: Enums<'health'>[] = ['at_risk', 'needs_attention', 'on_track']

export default async function Customers() {
  const me = await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('customers').select('id, name, projects(id, health, status), requests(id, status), profiles!profiles_customer_id_fkey(id)').order('name')
  return (
    <>
      <PageHeader title="Customers" meta={<span className="text-xs text-muted-foreground">{data?.length ?? 0} workspaces</span>}
        actions={canManage(me) ? (
          <details className="relative">
            <summary className={btn('default', 'list-none')}>+ Add customer</summary>
            <div className="card absolute right-0 z-20 mt-1 w-[300px] p-3 shadow-[0_4px_16px_rgba(15,42,48,.12)]">
              <ActionForm action={createCustomer} submit="Add customer">
                <Input name="name" aria-label="Customer name" placeholder="Company name" className="w-auto" />
                <input type="hidden" name="account_owner_id" value={me.id} />
                <Input name="hubspot_company_id" aria-label="HubSpot company id" placeholder="HubSpot company id (optional)" className="w-auto" />
                <Input name="zoho_customer_id" aria-label="Zoho customer id" placeholder="Zoho customer id (optional)" className="w-auto" />
                <p className="m-0 text-xs text-muted-foreground">The ids are checked against HubSpot and Zoho. Leave the name empty to use the name found there. You become the account owner.</p>
              </ActionForm>
            </div>
          </details>
        ) : null} />
      <div className="p-4">
        <Card flush>
          <DataGrid search searchLabel="Search customers" pageSize={25} label="Customers"
            empty={<Empty title="No customers yet">Customers are created from HubSpot Closed Won deals.</Empty>}
            columns={[
              { key: 'name', label: 'Customer', sortable: true },
              { key: 'health', label: 'Health', sortable: true, className: 'w-[160px]' },
              { key: 'active', label: 'Active projects', sortable: true, align: 'right', className: 'w-[120px]' },
              { key: 'open', label: 'Open requests', sortable: true, align: 'right', className: 'w-[120px]' },
              { key: 'portal', label: 'Portal users', sortable: true, align: 'right', className: 'w-[110px]' },
            ]}
            rows={(data ?? []).map((c) => {
              const active = (c.projects ?? []).filter((p) => p.status === 'active')
              const worst = WORST.find((h) => active.some((p) => p.health === h))
              const open = (c.requests ?? []).filter((r) => !['delivered', 'cancelled'].includes(r.status)).length
              return {
                id: c.id, href: `/customers/${c.id}`,
                values: { name: c.name, health: worst ? WORST.indexOf(worst) : 9, active: active.length, open, portal: (c.profiles ?? []).length },
                cells: {
                  name: <Link href={`/customers/${c.id}`} className="font-semibold text-foreground no-underline hover:underline">{c.name}</Link>,
                  health: worst ? <Health health={worst} /> : <span className="text-xs text-muted-foreground">No active work</span>,
                  active: <span className="tabular font-mono text-xs">{active.length}</span>,
                  open: <span className="tabular font-mono text-xs">{open}</span>,
                  portal: <span className="tabular font-mono text-xs">{(c.profiles ?? []).length}</span>,
                },
              }
            })} />
        </Card>
      </div>
    </>
  )
}
