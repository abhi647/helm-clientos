import Link from 'next/link'
import { createMeeting } from '@/app/_actions/meetings'
import { ActionForm } from '@/components/forms'
import { Card, Empty, Visibility } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DataGrid } from '@/components/data-grid'

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
      <Card flush className="min-w-0 flex-[999_1_620px]" title="Meetings" extra={`${meetings?.length ?? 0} recorded`}>
        <DataGrid label="Meetings" search searchLabel="Search meetings"
          empty={<Empty title="No meetings yet">Record the next review on the right.</Empty>}
          columns={[
            { key: 'date', label: 'Date', sortable: true, className: 'w-[80px]' }, { key: 'title', label: 'Meeting', sortable: true },
            { key: 'actions', label: 'Actions', className: 'w-[150px]' }, { key: 'decisions', label: 'Decisions', sortable: true, align: 'right', className: 'w-[90px]' },
            { key: 'vis', label: 'Sharing', className: 'w-[90px]' },
          ]}
          rows={(meetings ?? []).map((m) => {
            const open = m.meeting_actions.filter((a) => !a.task_id).length
            return {
              id: m.id, href: `/meetings/${m.id}`,
              values: { date: m.held_on, title: `${m.title} ${m.attendees ?? ''}`, decisions: m.decisions.length },
              cells: {
                date: <span className="font-mono text-xs text-muted-foreground">{shortDate(m.held_on)}</span>,
                title: <span className="flex min-w-0 flex-col py-1"><Link href={`/meetings/${m.id}`} className="truncate font-medium text-foreground no-underline hover:underline">{m.title}</Link>{m.attendees ? <span className="max-w-[360px] truncate text-xs text-muted-foreground">{m.attendees}</span> : null}</span>,
                actions: <span className="text-xs">{m.meeting_actions.length} {open ? <span className="font-semibold text-warn-ink">· {open} not in plan</span> : null}</span>,
                decisions: <span className="font-mono text-xs">{m.decisions.length}</span>,
                vis: <Visibility value={m.visibility} />,
              },
            }
          })} />
      </Card>
      <Card className="min-w-0 flex-[1_1_300px]" title="New meeting">
        <ActionForm action={createMeeting} submit="Create meeting">
          <input type="hidden" name="project_id" value={id} />
          <label className="label" htmlFor="m-title">Title</label>
          <Input id="m-title" name="title" required className="w-auto" placeholder="Weekly project review" />
          <label className="label" htmlFor="m-date">Date</label>
          <Input id="m-date" name="held_on" type="date" required defaultValue={today} className="w-auto" />
          <label className="label" htmlFor="m-att">Attendees</label>
          <Input id="m-att" name="attendees" className="w-auto" placeholder="Rahul, Michel, Omar" />
          <label className="label" htmlFor="m-sum">Notes</label>
          <Textarea id="m-sum" name="summary" rows={4}  placeholder="What was discussed" />
          <label className="label" htmlFor="m-vis">Visibility</label>
          <NativeSelect size="sm" id="m-vis" name="visibility" defaultValue="shared">
            <option value="shared">Shared with customer</option><option value="internal">Internal (Seven Billion only)</option>
          </NativeSelect>
        </ActionForm>
      </Card>
    </div>
  )
}
