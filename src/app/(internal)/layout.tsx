import { cookies } from 'next/headers'
import { CommandPalette, type PaletteItem } from '@/components/shell/command-palette'
import { MobileNav, Rail } from '@/components/shell/nav'
import { QuickCreate } from '@/components/shell/quick-create'
import { AssistantPanel } from '@/components/assistant/panel'
import { UserMenu } from '@/components/shell/user-menu'
import { canSeeFinance, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff()
  const supabase = await createClient()
  const [{ data: projects }, { data: customers }, { data: requests }, { count: pmOf }] = await Promise.all([
    supabase.from('projects').select('id, name, customers(name)').eq('status', 'active').order('name').limit(200),
    supabase.from('customers').select('id, name').order('name').limit(200),
    supabase.from('requests').select('id, number, title').not('status', 'in', '(delivered,cancelled)').order('created_at', { ascending: false }).limit(100),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('pm_id', me.id),
  ])
  const approvesTime = ['admin', 'ceo'].includes(me.internal_role ?? '') || !!pmOf   // admins, the CEO and anyone who runs a project
  const admin = ['admin', 'ceo'].includes(me.internal_role ?? '')
  // everyone keeps a timesheet; approving it is a tab for the people who approve time
  const hidden = [...(canSeeFinance(me) ? [] : ['/finance']), ...(admin ? [] : ['/admin'])]
  const palette: PaletteItem[] = [
    ...[['Home', '/home'], ['My Work', '/my-work'], ['Calendar', '/calendar'], ['Projects', '/projects'], ['Requests', '/requests'], ['Customers', '/customers'], ['CSAT & feedback', '/feedback'], ['Inbox', '/inbox'],
      ['Timesheets', '/timesheets'], ...(approvesTime ? [['Approve time', '/timesheets/approve']] : []), ...(canSeeFinance(me) ? [['Finance', '/finance']] : []), ...(admin ? [['Admin', '/admin']] : [])].map(([label, href]) => ({ group: 'Pages', label: label!, href: href! })),
    ...(projects ?? []).map((p) => ({ group: 'Projects', label: p.name, hint: p.customers?.name, href: `/projects/${p.id}` })),
    ...(customers ?? []).map((c) => ({ group: 'Customers', label: c.name, href: `/customers/${c.id}` })),
    ...(requests ?? []).map((r) => ({ group: 'Open requests', label: `${r.number} ${r.title}`, href: `/requests/${r.id}` })),
    { group: 'Create', label: 'Ask Helm (assistant)', href: '/assistant' },
    { group: 'Create', label: 'New request', href: '/requests/new' },
    ...(admin || pmOf ? [{ group: 'Create', label: 'New project', href: '/projects/new' }] : []),
  ]
  return (
    <div className="flex min-h-screen">
      <Rail hide={hidden} collapsed={(await cookies()).get('helm_nav')?.value === 'collapsed'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <MobileNav hide={hidden} />
          <div className="flex min-w-0 flex-1 items-center max-sm:justify-end"><CommandPalette items={palette} /></div>
          <AssistantPanel />
          <QuickCreate canCreateProject={admin || !!pmOf} />
          <UserMenu profile={me} base="" />
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
