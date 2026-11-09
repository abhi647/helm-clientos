import type { Metadata } from 'next'
import Link from 'next/link'
import { createPage } from '@/app/_actions/pages'
import { ActionForm } from '@/components/forms'
import { PageIcon, PageSharing, PageStatusChip } from '@/components/page-parts'
import { Card, Empty } from '@/components/ui'
import { isoDaysAgo, relativeTime } from '@/lib/format'
import { PAGE_KINDS, kindLabel } from '@/lib/page-templates'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { DataGrid } from '@/components/data-grid'

export const metadata: Metadata = { title: 'Docs' }

/** Written documents on the project: scope, requirements, meeting notes. Rich text, shared for comments and sign-off. */
export default async function ProjectDocs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  const supabase = await createClient()
  const [{ data: pages }, { data: meetings }] = await Promise.all([
    supabase.from('pages').select('id, title, kind, status, visibility, version, signed_version, updated_at, editor:profiles!pages_updated_by_fkey(full_name), holder:profiles!pages_editing_by_fkey(full_name), editing_until')
      .eq('project_id', id).order('updated_at', { ascending: false }),
    supabase.from('meetings').select('id, title, held_on').eq('project_id', id).order('held_on', { ascending: false }).limit(30),
  ])
  const now = isoDaysAgo(0)
  return (
    <div className="grid items-start gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card flush title="Documents" description="Write here, share with the customer for comments and suggestions, then ask them to sign off">
        <DataGrid label="Documents" search searchLabel="Search documents"
          empty={<Empty title="No documents yet">Start a scope of work or requirements from the panel on the right.</Empty>}
          columns={[
            { key: 'title', label: 'Title', sortable: true }, { key: 'type', label: 'Type', sortable: true, className: 'w-[120px]' },
            { key: 'status', label: 'Status', sortable: true, className: 'w-[190px]' }, { key: 'sharing', label: 'Sharing', className: 'w-[100px]' },
            { key: 'ver', label: 'Ver.', sortable: true, align: 'right', className: 'w-[60px]' }, { key: 'changed', label: 'Last change', sortable: true, className: 'w-[150px]' },
          ]}
          rows={(pages ?? []).map((g) => ({
            id: g.id, href: `/projects/${id}/docs/${g.id}`,
            values: { title: g.title, type: kindLabel(g.kind), status: g.status, ver: g.version, changed: -Date.parse(g.updated_at) },
            cells: {
              title: <span className="flex min-w-0 items-center gap-2"><PageIcon kind={g.kind} /><Link href={`/projects/${id}/docs/${g.id}`} className="truncate font-medium text-foreground no-underline hover:underline">{g.title}</Link>
                {g.holder && g.editing_until && g.editing_until > now ? <span className="flex-none rounded-full bg-warn-bg px-1.5 text-[11px] text-warn-ink">{g.holder.full_name} editing</span> : null}</span>,
              type: <span className="text-xs text-muted-foreground">{kindLabel(g.kind)}</span>,
              status: <PageStatusChip status={g.status} signedVersion={g.signed_version} />,
              sharing: <PageSharing visibility={g.visibility} />,
              ver: <span className="tabular text-xs">v{g.version}</span>,
              changed: <span className="block max-w-[150px] truncate text-xs text-muted-foreground">{relativeTime(g.updated_at)}{g.editor ? ` · ${g.editor.full_name}` : ''}</span>,
            },
          }))} />
      </Card>
      <Card title="New document">
        <ActionForm action={createPage} submit="Create and open">
          <input type="hidden" name="project_id" value={id} />
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="label mb-1">Start from</legend>
            {PAGE_KINDS.map((k, i) => (
              <label key={k.kind} className="flex cursor-pointer gap-2 rounded-md border border-border p-2 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="radio" name="kind" value={k.kind} defaultChecked={i === 0} className="mt-0.5 accent-primary" />
                <span><span className="block font-medium">{k.label}</span><span className="block text-xs text-muted-foreground">{k.description}</span></span>
              </label>
            ))}
          </fieldset>
          <label className="label" htmlFor="pg-title">Title</label>
          <Input id="pg-title" name="title" required maxLength={200} className="w-auto" placeholder="Scope of work: Sales analytics" />
          {meetings?.length ? (
            <>
              <label className="label" htmlFor="pg-meeting">Meeting (for notes)</label>
              <NativeSelect size="sm" id="pg-meeting" name="meeting_id"><option value="">None</option>{meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {m.held_on}</option>)}</NativeSelect>
            </>
          ) : null}
        </ActionForm>
      </Card>
    </div>
  )
}
