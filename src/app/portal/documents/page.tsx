import type { Metadata } from 'next'
import Link from 'next/link'
import { PageIcon, PageStatusChip } from '@/components/page-parts'
import { DocumentsPanel } from '@/components/project-parts'
import { Card } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { kindLabel } from '@/lib/page-templates'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Documents' }

export default async function PortalDocuments() {
  const me = await requireCustomer()
  const supabase = await createClient()
  const [{ data: projects }, { data: pages }] = await Promise.all([
    supabase.from('projects').select('id, name').order('name'),
    supabase.from('pages').select('id, title, kind, status, signed_version, version, updated_at, projects(name)').order('updated_at', { ascending: false }),
  ])
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">Documents</h1>
      {pages?.length ? (
        <Card flush title="To read and sign off" description="Written by Seven Billion. Comment, suggest changes, and approve when it is right">
          {pages.map((g) => (
            <Link key={g.id} href={`/portal/documents/pages/${g.id}`} className="row grid-cols-[minmax(0,1fr)_auto] py-2 text-ink no-underline hover:bg-head max-sm:gap-y-1">
              <span className="flex min-w-0 items-center gap-2"><PageIcon kind={g.kind} />
                <span className="min-w-0"><span className="block truncate font-medium">{g.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{kindLabel(g.kind)} · {g.projects?.name} · updated {relativeTime(g.updated_at)}</span></span></span>
              <PageStatusChip status={g.status} signedVersion={g.signed_version} />
            </Link>
          ))}
        </Card>
      ) : null}
      <DocumentsPanel me={me} customerId={me.customer_id!} projects={projects ?? []} />
    </div>
  )
}
