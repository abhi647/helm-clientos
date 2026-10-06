import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Meetings' }

export default async function PortalMeetings() {
  await requireCustomer()
  const supabase = await createClient()
  const { data: meetings } = await supabase.from('meetings')
    .select('id, title, held_on, attendees, projects(name), meeting_actions(id), decisions(id)').order('held_on', { ascending: false })
  return (
    <Card flush className="overflow-x-auto" title="Meetings" extra="Notes, actions and decisions from our meetings">
      <div className="min-w-[620px]">
        <div className="row row-head grid-cols-[80px_minmax(0,1fr)_200px_80px_90px]"><span>Date</span><span>Meeting</span><span>Project</span><span>Actions</span><span>Decisions</span></div>
        {meetings?.length ? meetings.map((m) => (
          <Link key={m.id} href={`/portal/meetings/${m.id}`} className="row min-h-10 grid-cols-[80px_minmax(0,1fr)_200px_80px_90px] text-[14px] text-ink no-underline hover:bg-head">
            <span className="font-mono text-xs text-muted">{shortDate(m.held_on)}</span>
            <span className="truncate font-medium">{m.title}</span>
            <span className="truncate text-[13px] text-muted">{m.projects?.name ?? '–'}</span>
            <span className="font-mono text-xs">{m.meeting_actions.length}</span>
            <span className="font-mono text-xs">{m.decisions.length}</span>
          </Link>
        )) : <Empty title="No meetings yet">Notes from our meetings will appear here.</Empty>}
      </div>
    </Card>
  )
}
