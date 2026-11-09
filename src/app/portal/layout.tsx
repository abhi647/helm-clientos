import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Tabs } from '@/components/shell/nav'
import { UserMenu } from '@/components/shell/user-menu'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { BrandMark } from '@/components/brand'
import { btn } from '@/components/ui'
import { WhatsNew } from '@/components/whats-new'

/** The customer portal: a deliberately simple navigation that never exposes internal structure. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCustomer()
  const supabase = await createClient()
  const [{ data: customer }, { count: hasHours }] = await Promise.all([
    supabase.from('customers').select('name').eq('id', me.customer_id!).single(),
    supabase.from('credit_plans').select('customer_id', { count: 'exact', head: true }),
  ])
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-3 px-4 pt-[env(safe-area-inset-top)] sm:gap-x-5 sm:px-6">
          <Link href="/portal" className="flex h-14 min-w-0 items-center gap-2.5 text-ink no-underline max-sm:flex-1">
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_2px_6px_rgb(42_91_255/.35)]"><BrandMark size={20} title="" /></span>
            <span className="text-sm font-semibold max-sm:hidden">Helm</span><span className="text-muted-foreground max-sm:hidden">×</span><span className="truncate text-sm font-semibold">{customer?.name}</span>
          </Link>
          {/* phones: the tabs drop to their own row and scroll sideways */}
          <div className="order-last -mx-4 w-[calc(100%+2rem)] min-w-0 px-2 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:px-0"><Tabs items={[
            { href: '/portal', label: 'Home', exact: true },
            ...(me.customer_role === 'customer_exec' ? [{ href: '/portal?view=actions', label: 'Team actions' }] : []),
            { href: '/portal/requests', label: 'Requests' }, { href: '/portal/meetings', label: 'Meetings' },
            { href: '/portal/decisions', label: 'Decisions' }, { href: '/portal/documents', label: 'Documents' }, { href: '/portal/feedback', label: 'Feedback' }, ...(hasHours ? [{ href: '/portal/hours', label: 'Hours' }] : []), ...(me.customer_role === 'customer_exec' || me.can_view_invoices ? [{ href: '/portal/billing', label: 'Billing' }] : []), ...(me.can_view_invoices ? [{ href: '/portal/invoices', label: 'Invoices' }] : []),
          ]} /></div>
          <Link href="/portal/requests/new" className={btn('default', 'flex-none gap-1 max-sm:size-10 max-sm:px-0')} aria-label="New request"><Plus aria-hidden className="size-4" /><span className="max-sm:hidden">New request</span></Link>
          <UserMenu profile={me} base="/portal" />
        </div>
      </header>
      <main className="mx-auto max-w-[1360px] px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6">{children}
        <p className="mt-10 mb-0 text-center text-xs text-muted-foreground"><Link href="/privacy" className="text-muted-foreground">Privacy</Link> · <Link href="/terms" className="text-muted-foreground">Terms of use</Link></p>
      </main>
      <WhatsNew audience="customer" />
    </div>
  )
}
