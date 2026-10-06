import { Download } from 'lucide-react'
import { UploadForm } from '@/components/upload'
import { Card, Empty, Health, Visibility } from '@/components/ui'
import { relativeTime, shortDate } from '@/lib/format'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const FOLDERS: Record<string, string> = {
  '01-commercial': '01 Commercial', '02-requirements': '02 Requirements', '03-design': '03 Design', '04-delivery': '04 Delivery',
  '05-uat': '05 UAT', '06-meetings': '06 Meetings', '07-handover': '07 Handover',
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

/** A published weekly update, readable in under 30 seconds. */
export function UpdateCard({ u, projectName }: {
  u: { id: string; week_of: string; health: 'on_track' | 'needs_attention' | 'at_risk'; completed: string; in_progress: string; waiting_on_customer: string; next_week: string; published_at: string | null; author?: { full_name: string } | null }
  projectName?: string
}) {
  const sections: [string, string, boolean?][] = [['Completed', u.completed], ['Working on', u.in_progress], ['Waiting on you', u.waiting_on_customer, true], ['Next week', u.next_week]]
  return (
    <Card title={<>Weekly update{projectName ? ` · ${projectName}` : ''}</>} extra={<><Health health={u.health} /><span>{u.author?.full_name} · week of {shortDate(u.week_of)}</span></>}>
      <dl className="m-0 grid grid-cols-[112px_minmax(0,1fr)] gap-y-2 text-[13px] leading-snug">
        {sections.map(([title, body, warn]) => (
          <div key={title} className="contents">
            <dt className={warn ? 'label pt-0.5 text-warn-ink' : 'label pt-0.5'}>{title}</dt>
            <dd className={warn && body ? 'm-0 font-medium text-warn-ink' : 'm-0'}>{lines(body).length ? lines(body).join(' · ') : <span className="text-muted">Nothing this week</span>}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export async function DocumentsPanel({ me, customerId, projectId, projects }: { me: Profile; customerId: string; projectId?: string; projects?: { id: string; name: string }[] }) {
  const supabase = await createClient()
  let q = supabase.from('documents').select('id, name, folder, visibility, version, created_at, storage_path, project_id, uploader:profiles!documents_uploaded_by_fkey(full_name)').eq('customer_id', customerId).order('folder').order('created_at', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  const { data: docs } = await q
  const staff = me.kind === 'internal'
  const grouped = Object.keys(FOLDERS).map((f) => ({ f, docs: (docs ?? []).filter((d) => d.folder === f) })).filter((g) => g.docs.length)
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Card flush className="min-w-0 flex-[999_1_560px]" title="Documents" extra={`${docs?.length ?? 0} files`}>
        {grouped.length ? grouped.map((g) => (
          <div key={g.f}>
            <div className="row row-head grid-cols-1"><span>{FOLDERS[g.f]}</span></div>
            {g.docs.map((d) => (
              <div key={d.id} className="row grid-cols-[minmax(0,1fr)_110px_90px_84px_36px] hover:bg-head">
                <span className="truncate font-medium">{d.name} <span className="font-mono text-xs font-normal text-muted">v{d.version}</span></span>
                <span className="truncate text-xs text-muted">{d.uploader?.full_name}</span>
                <span className="text-xs text-muted">{relativeTime(d.created_at)}</span>
                <span>{staff ? <Visibility value={d.visibility} /> : null}</span>
                {d.storage_path ? <a href={`/api/documents/${d.id}`} aria-label={`Download ${d.name}`} className="flex justify-center text-link"><Download className="size-4" aria-hidden /></a> : <span className="text-center text-xs text-muted" title="Placeholder without a file">–</span>}
              </div>
            ))}
          </div>
        )) : <Empty title="No documents yet">Upload the first file on the right.</Empty>}
      </Card>
      <Card className="min-w-0 flex-[1_1_280px]" title="Upload">
        <UploadForm customerId={customerId} projectId={projectId} projects={projects} folders={FOLDERS} staff={staff} />
      </Card>
    </div>
  )
}

export async function ActivityList({ customerId, projectId, limit = 60 }: { customerId?: string; projectId?: string; limit?: number }) {
  const supabase = await createClient()
  let q = supabase.from('activity').select('id, summary, visibility, created_at').order('created_at', { ascending: false }).limit(limit)
  if (customerId) q = q.eq('customer_id', customerId)
  if (projectId) q = q.eq('project_id', projectId)
  const { data } = await q
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {(data ?? []).map((a) => (
        <li key={a.id} className="row grid-cols-[90px_minmax(0,1fr)_84px]">
          <span className="font-mono text-xs text-muted">{relativeTime(a.created_at)}</span>
          <span className="truncate">{a.summary}</span>
          <span><Visibility value={a.visibility} /></span>
        </li>
      ))}
      {!data?.length ? <Empty title="No activity yet" /> : null}
    </ol>
  )
}
