import { deleteUpdate } from '@/app/_actions/delete'
import { saveWeeklyUpdate, startWeeklyUpdate } from '@/app/_actions/updates'
import { ActionButton } from '@/components/forms'
import { UpdateCard } from '@/components/project-parts'
import { Card, Empty } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { UpdateEditor } from './update-editor'

export default async function Updates({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: updates } = await supabase.from('updates').select('*, author:profiles!updates_author_id_fkey(full_name)').eq('project_id', id).order('week_of', { ascending: false }).order('created_at', { ascending: false })
  const drafts = (updates ?? []).filter((u) => u.status === 'draft')
  const published = (updates ?? []).filter((u) => u.status === 'published')
  return (
    <div className="flex max-w-[980px] flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 text-xs text-muted">The draft is filled from the plan: completed and in-progress shared tasks, customer dependencies and what is due next. Edit, then publish. The customer team is emailed.</p>
        {!drafts.length ? <span className="ml-auto"><ActionButton primary run={startWeeklyUpdate.bind(null, id)}>Create this week’s update</ActionButton></span> : null}
      </div>
      {drafts.map((d) => (
        <Card key={d.id} title={<>Draft · week of {shortDate(d.week_of)}</>} extra="Only Seven Billion can see drafts">
          <UpdateEditor action={saveWeeklyUpdate} update={d} />
          {canManage(me) || d.author_id === me.id ? (
            <div className="mt-2"><ActionButton run={deleteUpdate.bind(null, d.id)} className="btn-ghost text-xs text-crit-ink" confirm="Delete this draft update?">Delete draft</ActionButton></div>
          ) : null}
        </Card>
      ))}
      {published.map((u) => (
        <div key={u.id} className="flex flex-col gap-1">
          <UpdateCard u={u} />
          {canManage(me) ? <div className="self-end"><ActionButton run={deleteUpdate.bind(null, u.id)} className="btn-ghost h-6 px-2 text-xs text-crit-ink" confirm="Delete this published update? The customer will no longer see it. This cannot be undone.">Delete update</ActionButton></div> : null}
        </div>
      ))}
      {!updates?.length ? <Card><Empty title="No updates yet">Create the first weekly update above.</Empty></Card> : null}
    </div>
  )
}
