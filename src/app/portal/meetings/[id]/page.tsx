import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionLines, DecisionRows } from '@/components/meeting-parts'
import { Thread } from '@/components/thread'
import { Card } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Meeting' }

/** RLS returns only shared meetings, shared decisions and the action lines of shared meetings. */
export default async function PortalMeeting({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireCustomer()
  const supabase = await createClient()
  const { data: m } = await supabase.from('meetings').select('*, projects(id, name)').eq('id', id).maybeSingle()
  if (!m) notFound()
  const [{ data: actions }, { data: decisions }] = await Promise.all([
    supabase.from('meeting_actions').select('id, text, due_date, owner_side, task_id, assignee:profiles!meeting_actions_assignee_id_fkey(full_name), task:tasks(status)')
      .eq('meeting_id', id).order('position').order('created_at'),
    supabase.from('decisions').select('id, number, decision, decided_on, decided_by, visibility').eq('meeting_id', id).order('created_at'),
  ])
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Link href="/portal/meetings" className="text-[13px]">← Meetings</Link>
        <h1 className="mt-1 mb-0 text-lg font-semibold">{m.title}</h1>
        <p className="m-0 text-[13px] text-muted"><span className="font-mono">{shortDate(m.held_on)}</span>{m.projects ? ` · ${m.projects.name}` : ''}{m.attendees ? ` · ${m.attendees}` : ''}</p>
      </div>
      <div className="flex flex-wrap items-start gap-3.5">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5">
          <Card flush className="overflow-x-auto" title="Actions">
            <div className="min-w-[600px]">
              <ActionLines actions={actions ?? []} taskHref={(t) => `/portal/projects/${m.projects?.id}?task=${t}`} />
            </div>
          </Card>
          <Card flush title="Decisions"><DecisionRows decisions={decisions ?? []} staff={false} /></Card>
          <Card title="Discussion"><Thread entityType="meeting" entityId={m.id} customerId={m.customer_id} me={me} /></Card>
        </div>
        <Card className="min-w-0 flex-[1_1_320px]" title="Notes">
          <p className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap">{m.summary || <span className="text-muted">No notes yet.</span>}</p>
        </Card>
      </div>
    </div>
  )
}
