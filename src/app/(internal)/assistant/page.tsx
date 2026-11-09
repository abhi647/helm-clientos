import type { Metadata } from 'next'
import Link from 'next/link'
import { AssistantChat } from '@/components/assistant/chat'
import { btn, cn, PageHeader } from '@/components/ui'
import { chatItems } from '@/lib/assistant/agent'
import { relativeTime } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Ask Helm' }

/** The assistant: talk to Helm to log time, create and update work, and find things. Your chats, newest first. */
export default async function Assistant({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  await requireStaff()
  const { chat } = await searchParams
  const supabase = await createClient()
  const [{ data: chats }, open] = await Promise.all([
    supabase.from('ai_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(50),
    chat ? Promise.all([
      supabase.from('ai_chats').select('id, messages').eq('id', chat).maybeSingle(),
      supabase.from('ai_proposals').select('id, tool, summary, status, error, result').eq('chat_id', chat).order('created_at'),
    ]) : null,
  ])
  const current = open?.[0].data
  const items = current ? chatItems(current.messages, open?.[1].data ?? []) : []
  return (
    <div className="flex h-[calc(100dvh-3.25rem)] min-h-0 flex-col">
      <PageHeader title="Ask Helm" meta={<span>Log time, create tasks and requests, or ask about anything in Helm. Every change waits for your confirmation.</span>}
        actions={<Link href="/assistant" className={btn('outline')}>New chat</Link>} />
      <div className="grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Your chats" className="min-h-0 overflow-y-auto border-r border-border/60 p-2 max-md:hidden">
          <p className="m-0 px-2 py-1 text-[11px] font-medium text-muted-foreground">Your chats</p>
          {(chats ?? []).map((c) => (
            <Link key={c.id} href={`/assistant?chat=${c.id}`} aria-current={c.id === chat ? 'page' : undefined}
              className={cn('flex flex-col rounded-md px-2 py-1.5 text-foreground no-underline hover:bg-muted', c.id === chat && 'bg-primary/10 text-primary')}>
              <span className="truncate text-[13px] font-medium">{c.title}</span>
              <span className="text-[11px] text-muted-foreground">{relativeTime(c.updated_at)}</span>
            </Link>
          ))}
          {!chats?.length ? <p className="m-0 px-2 py-1 text-xs text-muted-foreground">No chats yet.</p> : null}
        </nav>
        <div className="min-h-0">
          <AssistantChat key={current?.id ?? 'new'} chatId={current?.id} initial={items} />
        </div>
      </div>
    </div>
  )
}
