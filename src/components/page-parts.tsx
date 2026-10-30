import { CheckCircle2, FileText, Lock, PenLine, Users } from 'lucide-react'
import { Chip } from '@/components/ui'
import type { Enums } from '@/lib/database.types'

/** Where a document stands: draft, out for review with the customer, or signed off (with the version). */
export function PageStatusChip({ status, signedVersion }: { status: Enums<'page_status'>; signedVersion?: number | null }) {
  if (status === 'signed_off') return <Chip tone="good" dot><CheckCircle2 aria-hidden className="size-3" />Signed off{signedVersion ? ` · v${signedVersion}` : ''}</Chip>
  if (status === 'in_review') return <Chip tone="review" dot>With customer for sign-off</Chip>
  return <Chip tone="neutral" dot>Draft</Chip>
}

export function PageSharing({ visibility }: { visibility: Enums<'visibility'> }) {
  return visibility === 'shared'
    ? <Chip tone="info"><Users aria-hidden className="size-3" />Shared</Chip>
    : <Chip tone="neutral"><Lock aria-hidden className="size-3" />Internal</Chip>
}

export const PageIcon = ({ kind }: { kind: Enums<'page_kind'> }) =>
  kind === 'meeting_notes' ? <PenLine aria-hidden className="size-4 flex-none text-muted-foreground" /> : <FileText aria-hidden className="size-4 flex-none text-muted-foreground" />
