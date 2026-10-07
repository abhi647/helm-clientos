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
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-3 px-4 pt-[env(safe-area-inset-top)] sm:gap-x-5 sm:px-5">
          <Link href="/portal" className="flex h-12 min-w-0 items-center gap-2.5 text-ink no-underline max-sm:flex-1">
            <BrandMark size={24} className="flex-none text-ink" />
            <span className="text-sm font-semibold max-sm:hidden">Helm</span><span className="text-muted max-sm:hidden">×</span><span className="truncate text-sm font-semibold">{customer?.name}</span>
          </Link>
          {/* phones: the tabs drop to their own row and scroll sideways */}
          <div className="order-last -mx-4 w-[calc(100%+2rem)] min-w-0 px-2 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0"><Tabs items={[
            { href: '/portal', label: 'Home', exact: true },
            ...(me.customer_role === 'customer_exec' ? [{ href: '/portal?view=actions', label: 'Team actions' }] : []),
            { href: '/portal/requests', label: 'Requests' }, { href: '/portal/meetings', label: 'Meetings' },
            { href: '/portal/decisions', label: 'Decisions' }, { href: '/portal/documents', label: 'Documents' }, { href: '/portal/feedback', label: 'Feedback' }, ...(me.customer_role === 'customer_exec' || me.can_view_invoices ? [{ href: '/portal/billing', label: 'Billing' }] : []), ...(me.can_view_invoices ? [{ href: '/portal/invoices', label: 'Invoices' }] : []),
          ]} /></div>
          <Link href="/portal/requests/new" className="btn btn-primary flex-none">+ <span className="max-sm:hidden">New </span>request</Link>
          <UserMenu profile={me} base="/portal" />
        </div>
      </header>
      <main className="mx-auto max-w-[1360px] px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] text-[14px] sm:px-5">{children}
        <p className="mt-10 mb-0 text-center text-xs text-muted"><Link href="/privacy" className="text-muted">Privacy</Link> · <Link href="/terms" className="text-muted">Terms of use</Link></p>
      </main>
    </div>
  )
}
