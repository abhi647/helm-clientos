import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deletePage, requestSignoff, restoreVersion, sharePage } from '@/app/_actions/pages'
import { ActionButton, ActionForm } from '@/components/forms'
import { PageSharing, PageStatusChip } from '@/components/page-parts'
import { PageWorkspace } from '@/components/page-workspace'
import { Card, Chip } from '@/components/ui'
import { relativeTime, shortDate } from '@/lib/format'
import { kindLabel } from '@/lib/page-templates'
import { canManage, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Document' }

export default async function DocPage({ params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: page } = await supabase.from('pages').select('*, signer:profiles!pages_signed_by_fkey(full_name)').eq('id', pageId).eq('project_id', id).maybeSingle()
  if (!page) notFound()
  const [{ data: people }, { data: versions }, { data: approvals }] = await Promise.all([
    supabase.from('directory').select('id, full_name, kind, customer_id').or(`kind.eq.internal,customer_id.eq.${page.customer_id}`).is('access_revoked_at', null).order('full_name'),
    supabase.from('page_versions').select('version, saved_at, note, saver:profiles!page_versions_saved_by_fkey(full_name)').eq('page_id', pageId).order('version', { ascending: false }).limit(40),
    supabase.from('approvals').select('id, status, version, due_date, created_at, approver:profiles!approvals_approver_id_fkey(full_name)').eq('page_id', pageId).order('created_at', { ascending: false }),
  ])
  const users = Object.fromEntries((people ?? []).map((p) => [p.id!, { id: p.id!, name: p.full_name! + (p.kind === 'customer' ? ' (customer)' : ''), avatarUrl: '' }]))
  const customers = (people ?? []).filter((p) => p.kind === 'customer' && p.customer_id === page.customer_id)
  const open = approvals?.find((a) => a.status === 'pending')
  const manager = canManage(me)

  return (
    <div className="grid items-start gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/projects/${id}/docs`} className="text-muted-foreground no-underline hover:text-ink">← Docs</Link>
          <span>·</span><span>{kindLabel(page.kind)}</span>
          <PageStatusChip status={page.status} signedVersion={page.signed_version} /><PageSharing visibility={page.visibility} />
        </div>
        <PageWorkspace pageId={page.id} title={page.title} content={page.content as never} discussions={page.discussions as never} version={page.version}
          users={users} me={me.id} canWrite customer={false} />
      </div>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-16" aria-label="Document details">
        <Card title="Sharing">
          <div className="flex flex-col gap-2 text-[13px]">
            <p className="m-0 text-xs text-muted-foreground">{page.visibility === 'shared'
              ? 'The customer can read it, comment, and suggest changes. Their edits arrive as suggestions you accept or reject.'
              : 'Only Seven Billion can see it. Share it when it is ready for the customer to read.'}</p>
            <ActionButton run={sharePage.bind(null, page.id, page.visibility !== 'shared')} primary={page.visibility !== 'shared'}>
              {page.visibility === 'shared' ? 'Make internal' : 'Share with customer'}
            </ActionButton>
          </div>
        </Card>

        <Card title="Sign-off" description={page.status === 'signed_off' ? undefined : 'A named person at the customer approves this exact version'}>
          {page.status === 'signed_off' ? (
            <p className="m-0 text-[13px]"><b>Version {page.signed_version}</b> signed off by {page.signer?.full_name ?? 'the customer'}{page.signed_at ? ` on ${shortDate(page.signed_at.slice(0, 10))}` : ''}.
              {page.version !== page.signed_version ? <span className="mt-1 block text-xs text-warn-ink">Changed since: version {page.version} is a new draft and needs signing off again.</span> : null}</p>
          ) : open ? (
            <p className="m-0 text-[13px]">Waiting for <b>{open.approver?.full_name}</b> to sign off version {open.version}{open.due_date ? `, due ${shortDate(open.due_date)}` : ''}.
              {open.version !== page.version ? <span className="mt-1 block text-xs text-warn-ink">You have saved since: send again so they sign off the latest version.</span> : null}
              <Link href={`/approvals/${open.id}`} className="mt-1 block text-xs">Open the approval →</Link></p>
          ) : null}
          {manager && (page.status !== 'signed_off' || page.version !== page.signed_version) ? (
            customers.length ? (
              <details className="mt-2" open={!open}>
                <summary className="cursor-pointer text-xs font-medium text-primary">{open ? 'Send the latest version instead' : 'Request sign-off'}</summary>
                <ActionForm action={requestSignoff} submit={`Send version ${page.version} for sign-off`} className="mt-2">
                  <input type="hidden" name="page_id" value={page.id} />
                  <label className="label" htmlFor="so-who">Who signs off</label>
                  <select id="so-who" name="approver_id" required className="input">{customers.map((c) => <option key={c.id} value={c.id!}>{c.full_name}</option>)}</select>
                  <label className="label" htmlFor="so-due">Due</label>
                  <input id="so-due" type="date" name="due_date" className="input" />
                  <label className="label" htmlFor="so-note">Note (optional)</label>
                  <textarea id="so-note" name="note" rows={2} className="textarea" placeholder="Anything they should look at closely" />
                </ActionForm>
              </details>
            ) : <p className="m-0 mt-1 text-xs text-muted-foreground">Invite someone from the customer first (Customers → People).</p>
          ) : null}
          {(approvals ?? []).filter((a) => a.status !== 'pending').length ? (
            <ul className="m-0 mt-2 list-none border-t border-line-soft p-0 pt-2 text-xs">
              {(approvals ?? []).filter((a) => a.status !== 'pending').slice(0, 4).map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-0.5"><span>v{a.version} · {a.approver?.full_name}</span>
                  <Chip tone={a.status === 'approved' ? 'good' : a.status === 'changes_requested' ? 'warn' : 'neutral'}>{a.status === 'changes_requested' ? 'Changes asked' : a.status === 'approved' ? 'Approved' : 'Withdrawn'}</Chip></li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card flush title="Versions" description="Every save is kept">
          <ol className="m-0 max-h-72 list-none overflow-y-auto p-0">
            {(versions ?? []).map((v) => (
              <li key={v.version} className="flex items-center gap-2 border-t border-line-soft px-3.5 py-1.5 text-xs first:border-t-0">
                <span className="tabular w-8 font-medium">v{v.version}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.saver?.full_name ?? '–'} · {relativeTime(v.saved_at)}{v.note ? ` · ${v.note}` : ''}{v.version === page.signed_version ? ' · signed' : ''}</span>
                {v.version !== page.version ? <ActionButton run={restoreVersion.bind(null, page.id, v.version)} className="btn-ghost h-6 px-1.5 text-xs"
                  confirm={`Put version ${v.version} back? It becomes the newest version; nothing is deleted.`}>Restore</ActionButton> : <Chip tone="info">Current</Chip>}
              </li>
            ))}
          </ol>
        </Card>

        {manager ? <ActionButton run={deletePage.bind(null, page.id, id)} className="btn-ghost self-start text-crit-ink"
          confirm={`Delete "${page.title}" and all its versions? This cannot be undone.`}>Delete document</ActionButton> : null}
      </aside>
    </div>
  )
}
