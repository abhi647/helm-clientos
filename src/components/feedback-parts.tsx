import { Chip } from '@/components/ui'
import type { Enums } from '@/lib/database.types'

const KIND: Record<Enums<'feedback_kind'>, { label: string; tone: 'good' | 'info' | 'warn' | 'neutral' }> = {
  praise: { label: 'Praise', tone: 'good' }, suggestion: { label: 'Suggestion', tone: 'info' }, issue: { label: 'Issue', tone: 'warn' }, other: { label: 'Other', tone: 'neutral' },
}
const STATUS: Record<Enums<'feedback_status'>, { label: string; tone: 'review' | 'info' | 'good' | 'neutral' }> = {
  new: { label: 'New', tone: 'review' }, acknowledged: { label: 'Acknowledged', tone: 'info' }, actioned: { label: 'Actioned', tone: 'good' }, closed: { label: 'Closed', tone: 'neutral' },
}

export const FeedbackKindChip = ({ kind }: { kind: Enums<'feedback_kind'> }) => <Chip tone={KIND[kind].tone}>{KIND[kind].label}</Chip>
export const FeedbackStatusChip = ({ status }: { status: Enums<'feedback_status'> }) => <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip>

/** A 1-5 score with its meaning; colour is backed by the number, never alone. */
export function ScoreChip({ score }: { score: number }) {
  return <Chip tone={score >= 4 ? 'good' : score === 3 ? 'neutral' : 'crit'}><span className="font-mono">{`${score}/5`}</span></Chip>
}

export const FEEDBACK_KINDS = Object.entries(KIND).map(([value, k]) => ({ value: value as Enums<'feedback_kind'>, label: k.label }))
export const FEEDBACK_STATUSES = Object.entries(STATUS).map(([value, s]) => ({ value: value as Enums<'feedback_status'>, label: s.label }))
