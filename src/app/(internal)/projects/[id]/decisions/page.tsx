import { addDecision } from '@/app/_actions/meetings'
import { ActionForm } from '@/components/forms'
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
    <div className="flex flex-wrap items-start gap-3 p-4">
      <Card flush className="min-w-0 flex-[999_1_620px]" title="Decision log" extra="Recorded once, referenced forever">
        {data?.length ? data.map((d) => (
          <div key={d.id} className="row grid-cols-[72px_minmax(0,1fr)_160px_84px] py-1.5">
            <span className="font-mono text-xs text-muted">{d.number}</span>
            <span className="leading-snug">{d.decision}<span className="block text-xs text-muted">{d.decided_by}{d.meetings ? ` · from ${d.meetings.title}` : ''}</span></span>
            <span className="font-mono text-xs text-muted">{shortDate(d.decided_on)}</span>
            <span><Visibility value={d.visibility} /></span>
          </div>
        )) : <Empty title="No decisions recorded" />}
      </Card>
      <Card className="min-w-0 flex-[1_1_300px]" title="Record a decision">
        <ActionForm action={addDecision} submit="Record decision">
          <input type="hidden" name="project_id" value={id} />
          <textarea name="decision" required rows={3} aria-label="Decision" className="textarea" placeholder="What was decided" />
          <input name="decided_by" aria-label="Decided by" className="input" placeholder="Decided by" />
          <select name="visibility" aria-label="Visibility" defaultValue="shared" className="input"><option value="shared">Shared with customer</option><option value="internal">Internal</option></select>
        </ActionForm>
      </Card>
    </div>
  )
}
