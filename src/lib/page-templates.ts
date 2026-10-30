import type { Enums } from '@/lib/database.types'

/** Starting content for each kind of document, in Plate's JSON format. Plain blocks only, so any editor version reads it. */
type Block = Record<string, unknown>
const h = (level: 1 | 2 | 3, text: string): Block => ({ type: `h${level}`, children: [{ text }] })
const p = (text = ''): Block => ({ type: 'p', children: [{ text }] })
const hint = (text: string): Block => ({ type: 'p', children: [{ text, italic: true }] })
const bullet = (text: string): Block => ({ type: 'p', indent: 1, listStyleType: 'disc', children: [{ text }] })
const todo = (text: string): Block => ({ type: 'p', indent: 1, listStyleType: 'todo', checked: false, children: [{ text }] })
const table = (head: string[], rows: string[][]): Block => ({
  type: 'table',
  children: [head, ...rows].map((r) => ({ type: 'tr', children: r.map((c) => ({ type: 'td', children: [{ type: 'p', children: [{ text: c }] }] })) })),
})

export const PAGE_KINDS: { kind: Enums<'page_kind'>; label: string; description: string }[] = [
  { kind: 'scope', label: 'Scope of work', description: 'Objectives, what is in and out, deliverables, timeline, acceptance' },
  { kind: 'requirements', label: 'Requirements', description: 'Business needs, data sources, KPIs, functional requirements' },
  { kind: 'meeting_notes', label: 'Meeting notes', description: 'Attendees, agenda, decisions, action items' },
  { kind: 'blank', label: 'Blank page', description: 'Start from nothing' },
]
export const kindLabel = (k: Enums<'page_kind'>) => PAGE_KINDS.find((x) => x.kind === k)?.label ?? 'Document'

export function pageTemplate(kind: Enums<'page_kind'>): Block[] {
  switch (kind) {
    case 'scope': return [
      h(2, 'Background'), hint('Why this work is needed and what the business wants to change.'), p(),
      h(2, 'Objectives'), bullet('Objective 1'), bullet('Objective 2'),
      h(2, 'In scope'), bullet('Deliverable or activity included'),
      h(2, 'Out of scope'), bullet('What is explicitly not included'),
      h(2, 'Deliverables'), table(['Deliverable', 'Description', 'Target date'], [['', '', ''], ['', '', '']]),
      h(2, 'Assumptions and dependencies'), bullet('What we assume, and what we need from you (data access, people, decisions)'),
      h(2, 'Timeline'), table(['Phase', 'Start', 'End'], [['Discovery', '', ''], ['Build', '', ''], ['UAT', '', '']]),
      h(2, 'Acceptance criteria'), todo('How we will both know each deliverable is done'),
      h(2, 'Commercials'), hint('Effort, rate and billing milestones, or a reference to the rate card.'), p(),
    ]
    case 'requirements': return [
      h(2, 'Business context'), p(),
      h(2, 'Users and decisions'), hint('Who will use this, and which decisions it should support.'), p(),
      h(2, 'KPIs and definitions'), table(['KPI', 'Definition', 'Source', 'Owner'], [['', '', '', ''], ['', '', '', '']]),
      h(2, 'Data sources'), table(['System', 'Tables or files', 'Access', 'Refresh'], [['', '', '', '']]),
      h(2, 'Functional requirements'), todo('The report shows …'), todo('Users can filter by …'),
      h(2, 'Non-functional requirements'), bullet('Refresh frequency, performance, security, access'),
      h(2, 'Open questions'), bullet(''),
    ]
    case 'meeting_notes': return [
      h(2, 'Attendees'), bullet(''),
      h(2, 'Agenda'), bullet(''),
      h(2, 'Notes'), p(),
      h(2, 'Decisions'), bullet(''),
      h(2, 'Action items'), todo('Owner: action, due date'),
    ]
    default: return [p()]
  }
}
