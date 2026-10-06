'use client'

import { assignFeedback, setFeedbackStatus } from '@/app/_actions/feedback'
import { StatusSelect } from '@/components/forms'

export function FeedbackControls({ id, status, ownerId, people }: {
  id: string; status: 'new' | 'acknowledged' | 'actioned' | 'closed'; ownerId: string; people: { id: string; name: string }[]
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusSelect label="Status" value={status} onChange={(v) => setFeedbackStatus(id, v)} options={[
        { value: 'new', label: 'New' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'actioned', label: 'Actioned' }, { value: 'closed', label: 'Closed' }]} />
      <StatusSelect label="Owner" value={ownerId} onChange={(v) => assignFeedback(id, v)}
        options={[{ value: '', label: 'No owner' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
    </span>
  )
}
