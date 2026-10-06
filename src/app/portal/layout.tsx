import Link from 'next/link'
import { Tabs } from '@/components/shell/nav'
import { UserMenu } from '@/components/shell/user-menu'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

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
            <span className="flex size-[26px] items-center justify-center rounded-[5px] bg-ink text-[11px] font-bold text-white">7B</span>
            <span className="text-sm font-semibold">Seven Billion</span><span className="text-muted">×</span><span className="text-sm font-semibold">{customer?.name}</span>
          </Link>
          <div className="flex-1"><Tabs items={[
            { href: '/portal', label: 'Home', exact: true }, { href: '/portal/requests', label: 'Requests' },
            { href: '/portal/documents', label: 'Documents' }, ...(me.can_view_invoices ? [{ href: '/portal/invoices', label: 'Invoices' }] : []),
          ]} /></div>
          <Link href="/portal/requests/new" className="btn btn-primary">+ New request</Link>
          <UserMenu profile={me} base="/portal" />
        </div>
      </header>
      <main className="mx-auto max-w-[1360px] px-5 pt-4 pb-8 text-[14px]">{children}</main>
    </div>
  )
}
