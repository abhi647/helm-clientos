import Link from 'next/link'
import { Bell, LogOut, Search } from 'lucide-react'
import { Avatar } from '@/components/ui'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Search, notifications (with unread count) and sign-out, shared by both shells. */
export async function UserMenu({ profile, base }: { profile: Profile; base: '' | '/portal' }) {
  const supabase = await createClient()
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  return (
    <div className="flex items-center gap-2">
      {base === '' ? (
        <form action="/search" className="flex h-7 min-w-[220px] items-center gap-1.5 rounded-md border border-[#d5dcdf] bg-white px-2 max-sm:min-w-0">
          <Search className="size-[13px] text-muted" aria-hidden />
          <input name="q" aria-label="Search everything" placeholder="Search requests, tasks, decisions" className="w-full border-0 bg-transparent text-xs outline-none" />
        </form>
      ) : null}
      <Link href={`${base}/inbox`} aria-label={`Notifications${count ? `, ${count} unread` : ''}`} className="relative flex size-8 items-center justify-center rounded-md text-ink hover:bg-head">
        <Bell className="size-4" aria-hidden />
        {count ? <span className="tabular absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-crit px-1 text-center font-mono text-[10px] font-semibold text-white">{count}</span> : null}
      </Link>
      <span title={`${profile.full_name} · ${profile.email}`}><Avatar name={profile.full_name} customer={profile.kind === 'customer'} size={28} /></span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="btn btn-ghost h-8 px-2" aria-label="Sign out" title="Sign out"><LogOut className="size-4" aria-hidden /></button>
      </form>
    </div>
  )
}
