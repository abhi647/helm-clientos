import { CommandPalette, type PaletteItem } from '@/components/shell/command-palette'
import { Rail } from '@/components/shell/nav'
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
  const palette: PaletteItem[] = [
    ...[['Home', '/home'], ['My Work', '/my-work'], ['Projects', '/projects'], ['Requests', '/requests'], ['Customers', '/customers'], ['CSAT & feedback', '/feedback'], ['Inbox', '/inbox'],
      ...(canSeeFinance(me) ? [['Finance', '/finance']] : []), ...(admin ? [['Admin', '/admin']] : [])].map(([label, href]) => ({ group: 'Pages', label: label!, href: href! })),
    ...(projects ?? []).map((p) => ({ group: 'Projects', label: p.name, hint: p.customers?.name, href: `/projects/${p.id}` })),
    ...(customers ?? []).map((c) => ({ group: 'Customers', label: c.name, href: `/customers/${c.id}` })),
    ...(requests ?? []).map((r) => ({ group: 'Open requests', label: `${r.number} ${r.title}`, href: `/requests/${r.id}` })),
  ]
  return (
    <div className="flex min-h-screen max-sm:flex-col">
      <Rail hide={[...(canSeeFinance(me) ? [] : ['/finance']), ...(admin ? [] : ['/admin'])]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between gap-3 border-b border-line bg-white px-4">
          <span className="truncate text-xs text-muted"><b className="font-semibold text-ink">Helm</b> · Seven Billion</span>
          <span className="flex items-center gap-2"><CommandPalette items={palette} /><UserMenu profile={me} base="" /></span>
        </div>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
