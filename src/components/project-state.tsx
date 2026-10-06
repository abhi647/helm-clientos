'use client'

import { setProjectState } from '@/app/_actions/work'
import { StatusSelect } from '@/components/forms'

/** Health and status selects in the project header. Changing them can trigger playbook rules. */
export function ProjectState({ projectId, health, status }: {
  projectId: string; health: 'on_track' | 'needs_attention' | 'at_risk'; status: 'active' | 'on_hold' | 'completed'
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusSelect label="Project health" value={health} onChange={(v) => setProjectState(projectId, { health: v })}
        options={[{ value: 'on_track', label: 'On track' }, { value: 'needs_attention', label: 'Needs attention' }, { value: 'at_risk', label: 'At risk' }]} />
      <StatusSelect label="Project status" value={status} onChange={(v) => setProjectState(projectId, { status: v })}
        options={[{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }, { value: 'completed', label: 'Completed' }]} />
    </span>
  )
}
