import Link from 'next/link'
import { createMeeting } from '@/app/_actions/meetings'
import { ActionForm } from '@/components/forms'
import { Card, Empty, Visibility } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectMeetings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  const supabase = await createClient()
  const { data: meetings } = await supabase.from('meetings')
    .select('id, title, held_on, attendees, visibility, meeting_actions(id, task_id), decisions(id)')
    .eq('project_id', id).order('held_on', { ascending: false })
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="flex flex-wrap items-start gap-3 p-4">
      <Card flush className="min-w-0 flex-[999_1_620px] overflow-x-auto" title="Meetings" extra={`${meetings?.length ?? 0} recorded`}>
        <div className="min-w-[620px]">
          <div className="row row-head grid-cols-[80px_minmax(0,1fr)_110px_90px_84px]"><span>Date</span><span>Meeting</span><span>Actions</span><span>Decisions</span><span /></div>
          {meetings?.length ? meetings.map((m) => {
            const open = m.meeting_actions.filter((a) => !a.task_id).length
            return (
              <Link key={m.id} href={`/meetings/${m.id}`} className="row grid-cols-[80px_minmax(0,1fr)_110px_90px_84px] text-ink no-underline hover:bg-head">
                <span className="font-mono text-xs text-muted">{shortDate(m.held_on)}</span>
                <span className="flex min-w-0 flex-col py-1"><span className="truncate font-medium">{m.title}</span>{m.attendees ? <span className="truncate text-xs text-muted">{m.attendees}</span> : null}</span>
                <span className="text-xs">{m.meeting_actions.length} {open ? <span className="font-semibold text-warn-ink">· {open} not in plan</span> : null}</span>
                <span className="font-mono text-xs">{m.decisions.length}</span>
                <span><Visibility value={m.visibility} /></span>
              </Link>
            )
          }) : <Empty title="No meetings yet">Record the next review on the right.</Empty>}
        </div>
      </Card>
      <Card className="min-w-0 flex-[1_1_300px]" title="New meeting">
        <ActionForm action={createMeeting} submit="Create meeting">
          <input type="hidden" name="project_id" value={id} />
          <label className="label" htmlFor="m-title">Title</label>
          <input id="m-title" name="title" required className="input" placeholder="Weekly project review" />
          <label className="label" htmlFor="m-date">Date</label>
          <input id="m-date" name="held_on" type="date" required defaultValue={today} className="input" />
          <label className="label" htmlFor="m-att">Attendees</label>
          <input id="m-att" name="attendees" className="input" placeholder="Rahul, Michel, Omar" />
          <label className="label" htmlFor="m-sum">Notes</label>
          <textarea id="m-sum" name="summary" rows={4} className="textarea" placeholder="What was discussed" />
          <label className="label" htmlFor="m-vis">Visibility</label>
          <select id="m-vis" name="visibility" defaultValue="shared" className="input">
            <option value="shared">Shared with customer</option><option value="internal">Internal (Seven Billion only)</option>
          </select>
        </ActionForm>
      </Card>
    </div>
  )
}
