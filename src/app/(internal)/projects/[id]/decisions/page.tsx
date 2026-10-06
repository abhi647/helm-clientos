import { Card, Empty, Visibility } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function Decisions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('decisions').select('id, number, decision, decided_on, decided_by, visibility, meetings(title, held_on)').eq('project_id', id).order('decided_on', { ascending: false })
  return (
    <div className="p-4">
      <Card flush title="Decision log" extra="Recorded once, referenced forever">
        {data?.length ? data.map((d) => (
          <div key={d.id} className="row grid-cols-[72px_minmax(0,1fr)_160px_84px] py-1.5">
            <span className="font-mono text-xs text-muted">{d.number}</span>
            <span className="leading-snug">{d.decision}<span className="block text-xs text-muted">{d.decided_by}{d.meetings ? ` · from ${d.meetings.title}` : ''}</span></span>
            <span className="font-mono text-xs text-muted">{shortDate(d.decided_on)}</span>
            <span><Visibility value={d.visibility} /></span>
          </div>
        )) : <Empty title="No decisions recorded" />}
      </Card>
    </div>
  )
}
