import Link from 'next/link'
import { Bell } from 'lucide-react'
import { AccountMenu } from '@/components/shell/account-menu'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Notifications (with unread count) and the account menu, shared by both shells. */
export async function UserMenu({ profile, base }: { profile: Profile; base: '' | '/portal' }) {
  const supabase = await createClient()
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  return (
    <div className="flex items-center gap-1">
      <Link href={`${base}/inbox`} aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        className="relative flex size-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground max-sm:size-10">
        <Bell className="size-[18px]" aria-hidden />
        {count ? <span className="tabular absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background">{count > 99 ? '99+' : count}</span> : null}
      </Link>
      <AccountMenu name={profile.full_name} email={profile.email} customer={profile.kind === 'customer'} />
    </div>
  )
}
