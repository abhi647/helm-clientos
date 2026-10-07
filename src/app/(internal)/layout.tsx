import { cookies } from 'next/headers'
import { CommandPalette, type PaletteItem } from '@/components/shell/command-palette'
import { MobileNav, Rail } from '@/components/shell/nav'
import { UserMenu } from '@/components/shell/user-menu'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff()
  const supabase = await createClient()
  const [{ data: projects }, { data: customers }, { data: requests }] = await Promise.all([
    supabase.from('projects').select('id, name, customers(name)').eq('status', 'active').order('name').limit(200),
    supabase.from('customers').select('id, name').order('name').limit(200),
    supabase.from('requests').select('id, number, title').not('status', 'in', '(delivered,cancelled)').order('created_at', { ascending: false }).limit(100),
  ])
  const admin = ['admin', 'ceo'].includes(me.internal_role ?? '')
  const hidden = [...(canSeeFinance(me) ? [] : ['/finance']), ...(admin ? [] : ['/admin'])]
  const palette: PaletteItem[] = [
    ...[['Home', '/home'], ['My Work', '/my-work'], ['Projects', '/projects'], ['Requests', '/requests'], ['Customers', '/customers'], ['CSAT & feedback', '/feedback'], ['Inbox', '/inbox'],
      ...(canSeeFinance(me) ? [['Finance', '/finance']] : []), ...(admin ? [['Admin', '/admin']] : [])].map(([label, href]) => ({ group: 'Pages', label: label!, href: href! })),
    ...(projects ?? []).map((p) => ({ group: 'Projects', label: p.name, hint: p.customers?.name, href: `/projects/${p.id}` })),
    ...(customers ?? []).map((c) => ({ group: 'Customers', label: c.name, href: `/customers/${c.id}` })),
    ...(requests ?? []).map((r) => ({ group: 'Open requests', label: `${r.number} ${r.title}`, href: `/requests/${r.id}` })),
  ]
  return (
    <div className="flex min-h-screen">
      <Rail hide={hidden} collapsed={(await cookies()).get('helm_nav')?.value === 'collapsed'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <MobileNav hide={hidden} />
          <span className="min-w-0 flex-1 truncate text-xs text-muted max-sm:hidden">Seven Billion <span className="text-line">/</span> <b className="font-medium text-ink">{me.full_name}</b></span>
          <span className="flex min-w-0 items-center gap-2 max-sm:flex-1 max-sm:justify-end"><CommandPalette items={palette} /><UserMenu profile={me} base="" /></span>
        </div>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
