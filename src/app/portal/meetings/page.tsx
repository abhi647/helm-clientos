import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { DataGrid } from '@/components/data-grid'

export const metadata: Metadata = { title: 'Meetings' }

export default async function PortalMeetings() {
  await requireCustomer()
  const supabase = await createClient()
  const { data: meetings } = await supabase.from('meetings')
    .select('id, title, held_on, attendees, projects(name), meeting_actions(id), decisions(id)').order('held_on', { ascending: false })
  return (
    <Card flush title="Meetings" extra="Notes, actions and decisions from our meetings">
      <DataGrid label="Meetings" search searchLabel="Search meetings"
        empty={<Empty title="No meetings yet">Notes from our meetings will appear here.</Empty>}
        columns={[
          { key: 'date', label: 'Date', sortable: true, className: 'w-[80px]' }, { key: 'title', label: 'Meeting', sortable: true },
          { key: 'project', label: 'Project', sortable: true, className: 'w-[200px]' },
          { key: 'actions', label: 'Actions', sortable: true, align: 'right', className: 'w-[80px]' }, { key: 'decisions', label: 'Decisions', sortable: true, align: 'right', className: 'w-[90px]' },
        ]}
        rows={(meetings ?? []).map((m) => ({
          id: m.id, href: `/portal/meetings/${m.id}`,
          values: { date: m.held_on, title: m.title, project: m.projects?.name, actions: m.meeting_actions.length, decisions: m.decisions.length },
          cells: {
            date: <span className="font-mono text-xs text-muted-foreground">{shortDate(m.held_on)}</span>,
            title: <Link href={`/portal/meetings/${m.id}`} className="block truncate font-medium text-foreground no-underline hover:underline">{m.title}</Link>,
            project: <span className="block max-w-[200px] truncate text-muted-foreground">{m.projects?.name ?? '–'}</span>,
            actions: <span className="font-mono text-xs">{m.meeting_actions.length}</span>,
            decisions: <span className="font-mono text-xs">{m.decisions.length}</span>,
          },
        }))} />
    </Card>
  )
}
