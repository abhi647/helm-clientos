import Link from 'next/link'
import { markAllRead } from '@/app/_actions/collab'
import { Card, Chip, Empty, cn } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

const TABS = { action: 'Needs action', all: 'All', unread: 'Unread' } as const
type Tab = keyof typeof TABS

/** Notifications are actionable: each one says who did what, and links to the place to act. */
export async function Inbox({ tab: raw, basePath }: { tab?: string; basePath: string }) {
  const tab: Tab = raw && raw in TABS ? (raw as Tab) : 'action'
  const supabase = await createClient()
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
  if (tab === 'action') q = q.eq('needs_action', true)
  if (tab === 'unread') q = q.is('read_at', null)
  const { data } = await q
  return (
    <Card flush>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-2">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={`${basePath}?tab=${t}`} className={cn('inline-flex h-6 items-center rounded-sm px-2 text-[11px] font-semibold no-underline', t === tab ? 'bg-ink text-white hover:text-white' : 'bg-neutral-bg text-neutral-ink')}>{TABS[t]}</Link>
        ))}
        <form action={markAllRead} className="ml-auto"><button className="btn btn-ghost h-6 text-xs">Mark all as read</button></form>
      </div>
      {data?.length ? data.map((n) => (
        <Link key={n.id} href={n.link ?? '/'} className={cn('row grid-cols-[10px_minmax(0,1fr)_90px] py-1.5 text-ink no-underline hover:bg-head', !n.read_at && 'bg-[#fbfdfd]')}>
          <span aria-label={n.read_at ? undefined : 'Unread'} className={cn('size-2 rounded-full', n.read_at ? 'bg-transparent' : 'bg-info')} />
          <span className="min-w-0">
            <span className={cn('block truncate', !n.read_at && 'font-semibold')}>{n.title} {n.needs_action ? <Chip tone="warn" className="ml-1">Action</Chip> : null}</span>
            {n.body ? <span className="block truncate text-xs text-muted">{n.body}</span> : null}
          </span>
          <span className="text-right text-xs text-muted">{relativeTime(n.created_at)}</span>
        </Link>
      )) : <Empty title="You are all caught up" />}
    </Card>
  )
}
