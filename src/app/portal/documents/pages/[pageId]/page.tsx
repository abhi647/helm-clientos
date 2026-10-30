import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { decideApproval } from '@/app/_actions/requests'
import { DecisionForm } from '@/components/forms'
import { PageStatusChip } from '@/components/page-parts'
import { PageWorkspace } from '@/components/page-workspace'
import { Card } from '@/components/ui'
import { shortDate } from '@/lib/format'
import { kindLabel } from '@/lib/page-templates'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Document' }

/** A shared document, for the customer: read, comment, suggest changes, and sign off when asked. */
export default async function PortalPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params
  const me = await requireCustomer()
  const supabase = await createClient()
  const { data: page } = await supabase.from('pages').select('*, projects(name), signer:profiles!pages_signed_by_fkey(full_name)').eq('id', pageId).maybeSingle()
  if (!page) notFound()   // internal pages are invisible to customers (row security), so they read as not found
  const [{ data: people }, { data: approval }] = await Promise.all([
    supabase.from('directory').select('id, full_name, kind').is('access_revoked_at', null),
    supabase.from('approvals').select('id, version, due_date, approver_id, approver:profiles!approvals_approver_id_fkey(full_name)').eq('page_id', pageId).eq('status', 'pending').maybeSingle(),
  ])
  const users = Object.fromEntries((people ?? []).map((p) => [p.id!, { id: p.id!, name: p.full_name! + (p.kind === 'internal' ? ' (Seven Billion)' : ''), avatarUrl: '' }]))
  const canWrite = page.status !== 'signed_off'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link href="/portal/documents" className="text-muted-foreground no-underline hover:text-ink">← Documents</Link>
        <span>·</span><span>{kindLabel(page.kind)} · {page.projects?.name}</span>
        <PageStatusChip status={page.status} signedVersion={page.signed_version} />
      </div>
      {approval ? (
        <Card className="border-review/30 bg-review-bg/40">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="min-w-0 flex-1">{approval.approver_id === me.id
              ? <>Seven Billion asked <b>you</b> to sign off version {approval.version}{approval.due_date ? ` by ${shortDate(approval.due_date)}` : ''}. Comment or suggest changes first if anything is wrong.</>
              : <>Waiting for <b>{approval.approver?.full_name}</b> to sign off version {approval.version}.</>}</span>
          </div>
          {approval.approver_id === me.id ? <div className="mt-3 border-t border-line-soft pt-3"><DecisionForm action={decideApproval} approvalId={approval.id} /></div> : null}
        </Card>
      ) : page.status === 'signed_off' ? (
        <p className="m-0 text-[13px] text-good-ink">Version {page.signed_version} signed off by {page.signer?.full_name ?? 'your team'}{page.signed_at ? ` on ${shortDate(page.signed_at.slice(0, 10))}` : ''}.</p>
      ) : null}
      <PageWorkspace pageId={page.id} title={page.title} content={page.content as never} discussions={page.discussions as never} version={page.version}
        users={users} me={me.id} canWrite={canWrite} customer />
    </div>
  )
}
