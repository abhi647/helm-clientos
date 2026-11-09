import type { Metadata } from 'next'
import Link from 'next/link'
import { createRequest } from '@/app/_actions/requests'
import { ActionForm } from '@/components/forms'
import { REQUEST_KINDS, RequestFields, requestKind } from '@/components/request-fields'
import { btn, Card, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { NativeSelect } from '@/components/ui/native-select'

export const metadata: Metadata = { title: 'Log a request' }

/**
 * Staff log a request a customer gave them in a call or a meeting. It is raised on behalf of a person at the customer
 * (or the company), shows in their portal like any other request, and says who logged it.
 */
export default async function LogRequest({ searchParams }: { searchParams: Promise<{ customer?: string; kind?: string }> }) {
  await requireStaff()
  const sp = await searchParams
  const kind = requestKind(sp.kind)
  const supabase = await createClient()
  const { data: customers } = await supabase.from('customers').select('id, name').order('name')
  const customer = customers?.find((c) => c.id === sp.customer)
  const [{ data: people }, { data: projects }] = customer
    ? await Promise.all([
      supabase.from('directory').select('id, full_name, customer_role').eq('customer_id', customer.id).is('access_revoked_at', null).order('full_name'),
      supabase.from('projects').select('id, name').eq('customer_id', customer.id).neq('status', 'completed').order('name'),
    ])
    : [{ data: [] }, { data: [] }]
  const href = (q: Record<string, string>) => `/requests/new?${new URLSearchParams({ ...(customer ? { customer: customer.id } : {}), ...(kind !== 'request' ? { kind } : {}), ...q })}`

  return (
    <>
      <PageHeader title="Log a request" meta={<Link href="/requests" className="text-xs text-muted-foreground no-underline hover:text-ink">← Requests</Link>} />
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 p-4">
        <p className="m-0 text-[13px] text-muted-foreground">For a request a customer gave you in a call, a meeting or a message. It appears in their portal as their request, marked as logged by you, and they are emailed.</p>
        <Card title="1. Which customer?">
          <div className="flex flex-wrap gap-1.5">
            {(customers ?? []).map((c) => (
              <Link key={c.id} href={`/requests/new?customer=${c.id}${kind !== 'request' ? `&kind=${kind}` : ''}`} aria-current={c.id === customer?.id ? 'page' : undefined}
                className={btn('outline', 'shrink', c.id === customer?.id && 'border-primary/30 bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary')}>{c.name}</Link>
            ))}
          </div>
        </Card>
        {customer ? (
          <Card title={`2. The request from ${customer.name}`}>
            <nav aria-label="Request form" className="mb-3 flex flex-wrap gap-1.5">
              {(Object.keys(REQUEST_KINDS) as (keyof typeof REQUEST_KINDS)[]).map((key) => (
                <Link key={key} href={href({ kind: key })} aria-current={key === kind ? 'page' : undefined}
                  className={btn('outline', 'shrink', key === kind && 'border-primary/30 bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary')}>{REQUEST_KINDS[key].tab}</Link>
              ))}
            </nav>
            <ActionForm key={`${customer.id}-${kind}`} action={createRequest} submit="Log the request" resetOnSuccess={false}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <label className="flex flex-col gap-1"><span className="label">On behalf of</span>
                <NativeSelect size="sm" name="on_behalf_of" className="h-9" defaultValue={people?.[0]?.id ?? ''}>
                  {(people ?? []).map((p) => <option key={p.id} value={p.id ?? ""}>{p.full_name}{p.customer_role === 'customer_exec' ? ' (executive)' : ''}</option>)}
                  <option value="">{customer.name} (the company, no one person)</option>
                </NativeSelect>
                <span className="text-xs text-muted-foreground">They are emailed, can follow it in their portal, and are asked to rate it when it is delivered.</span>
              </label>
              <RequestFields kind={kind} projects={projects ?? []} />
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  )
}
