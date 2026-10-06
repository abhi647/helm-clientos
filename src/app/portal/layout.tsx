import Link from 'next/link'
import { Tabs } from '@/components/shell/nav'
import { UserMenu } from '@/components/shell/user-menu'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { BrandMark } from '@/components/brand'

/** The customer portal: a deliberately simple navigation that never exposes internal structure. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCustomer()
  const supabase = await createClient()
  const { data: customer } = await supabase.from('customers').select('name').eq('id', me.customer_id!).single()
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-5 px-5">
          <Link href="/portal" className="flex h-12 items-center gap-2.5 text-ink no-underline">
            <BrandMark size={24} className="text-ink" />
            <span className="text-sm font-semibold">Helm</span><span className="text-muted">×</span><span className="text-sm font-semibold">{customer?.name}</span>
          </Link>
          <div className="flex-1"><Tabs items={[
            { href: '/portal', label: 'Home', exact: true },
            ...(me.customer_role === 'customer_exec' ? [{ href: '/portal?view=actions', label: 'Team actions' }] : []),
            { href: '/portal/requests', label: 'Requests' }, { href: '/portal/meetings', label: 'Meetings' },
            { href: '/portal/decisions', label: 'Decisions' }, { href: '/portal/documents', label: 'Documents' }, { href: '/portal/feedback', label: 'Feedback' }, ...(me.customer_role === 'customer_exec' || me.can_view_invoices ? [{ href: '/portal/billing', label: 'Billing' }] : []), ...(me.can_view_invoices ? [{ href: '/portal/invoices', label: 'Invoices' }] : []),
          ]} /></div>
          <Link href="/portal/requests/new" className="btn btn-primary">+ New request</Link>
          <UserMenu profile={me} base="/portal" />
        </div>
      </header>
      <main className="mx-auto max-w-[1360px] px-5 pt-4 pb-8 text-[14px]">{children}</main>
    </div>
  )
}
