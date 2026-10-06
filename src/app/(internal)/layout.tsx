import { Rail } from '@/components/shell/nav'
import { UserMenu } from '@/components/shell/user-menu'
import { canSeeFinance, requireStaff } from '@/lib/session'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff()
  return (
    <div className="flex min-h-screen max-sm:flex-col">
      <Rail hide={canSeeFinance(me) ? [] : ['/finance']} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between gap-3 border-b border-line bg-white px-4">
          <span className="truncate text-xs text-muted">Seven Billion · Client OS</span>
          <UserMenu profile={me} base="" />
        </div>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
