import { addComment } from '@/app/_actions/collab'
import { CommentBox } from '@/components/forms'
import { MentionText, type Person } from '@/components/mention-textarea'
import { Visibility, cn } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Discussion attached to one object. The query runs under RLS, so customers only ever receive shared comments. */
export async function Thread({ entityType, entityId, customerId, me, defaultShared, parentInternal, asCustomer }: {
  entityType: 'task' | 'request' | 'approval' | 'document' | 'meeting' | 'update'
  entityId: string; customerId: string; me: Profile; defaultShared?: boolean; parentInternal?: boolean
  /** staff 'customer preview': show exactly what the customer sees, read-only */
  asCustomer?: boolean
}) {
  const supabase = await createClient()
  const [{ data: comments }, { data: profiles }] = await Promise.all([
    supabase.from('comments')
      .select('id, body, visibility, created_at, mentions, author:profiles!comments_author_id_fkey(full_name, kind)')
      .eq('entity_type', entityType).eq('entity_id', entityId).order('created_at'),
    // RLS limits this to people the viewer may see: their own team and the other side of this engagement
    supabase.from('profiles').select('id, full_name, kind, customer_id').or(`kind.eq.internal,customer_id.eq.${customerId}`).order('full_name'),
  ])
  const people: Person[] = (profiles ?? []).filter((p) => p.id !== me.id && (p.kind === 'internal' || p.customer_id === customerId))
    .map((p) => ({ id: p.id, name: p.full_name, customer: p.kind === 'customer' }))
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const staff = me.kind === 'internal' && !asCustomer
  const shown = asCustomer ? (comments ?? []).filter((c) => c.visibility === 'shared') : (comments ?? [])
  return (
    <div className="flex flex-col gap-2">
      {shown.map((c) => (
        <div key={c.id} className={cn('flex flex-col gap-1 rounded-md px-2.5 py-2',
          c.visibility === 'internal' ? 'border border-dashed border-[#a7b2b6] bg-[#f7f8f9]' : 'border border-line-soft bg-white')}>
          <div className="flex items-center gap-1.5 text-xs">
            <b>{c.author?.full_name}</b>
            {c.author?.kind === 'customer' && staff ? <span className="text-muted">(customer)</span> : null}
            <span className="text-muted">{relativeTime(c.created_at)}</span>
            {staff ? <span className="ml-auto"><Visibility value={c.visibility} /></span> : null}
          </div>
          <p className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap"><MentionText body={c.body} names={c.mentions.map((id) => nameOf.get(id)).filter((n): n is string => !!n)} /></p>
        </div>
      ))}
      {!shown.length ? <p className="m-0 text-xs text-muted">No comments yet.</p> : null}
      {parentInternal && staff ? <p className="m-0 text-xs text-muted">This item is internal, so every comment on it stays internal.</p> : null}
      {asCustomer ? null : <CommentBox action={addComment} entityType={entityType} entityId={entityId} customerId={customerId} staff={staff && !parentInternal} defaultShared={defaultShared} people={parentInternal ? people.filter((p) => !p.customer) : people} />}
    </div>
  )
}
