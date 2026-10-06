import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty, PageHeader, Visibility } from '@/components/ui'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Search' }

/** Context-aware search across requests, tasks, decisions, documents and meetings. Runs under RLS. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff()
  const q = ((await searchParams).q ?? '').trim().slice(0, 100)
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const supabase = await createClient()
  const [req, tasks, dec, docs, mtg] = q.length < 2 ? [] : await Promise.all([
    supabase.from('requests').select('id, number, title').or(`title.ilike.${like},what.ilike.${like}`).limit(10),
    supabase.from('tasks').select('id, title, project_id, visibility').or(`title.ilike.${like},description.ilike.${like}`).limit(10),
    supabase.from('decisions').select('id, number, decision, project_id, visibility').ilike('decision', like).limit(10),
    supabase.from('documents').select('id, name, project_id, customer_id, visibility').ilike('name', like).limit(10),
    supabase.from('meetings').select('id, title, project_id, visibility').or(`title.ilike.${like},summary.ilike.${like}`).limit(10),
  ])
  const groups = q.length < 2 ? [] : [
    { title: 'Requests', items: (req?.data ?? []).map((r) => ({ key: r.id, href: `/requests/${r.id}`, label: `${r.number} ${r.title}` })) },
    { title: 'Tasks', items: (tasks?.data ?? []).map((t) => ({ key: t.id, href: `/projects/${t.project_id}?task=${t.id}`, label: t.title, vis: t.visibility })) },
    { title: 'Decisions', items: (dec?.data ?? []).map((d) => ({ key: d.id, href: `/projects/${d.project_id}/decisions`, label: `${d.number} ${d.decision}`, vis: d.visibility })) },
    { title: 'Documents', items: (docs?.data ?? []).map((d) => ({ key: d.id, href: d.project_id ? `/projects/${d.project_id}/documents` : `/customers/${d.customer_id}`, label: d.name, vis: d.visibility })) },
    { title: 'Meetings', items: (mtg?.data ?? []).map((m) => ({ key: m.id, href: `/meetings/${m.id}`, label: m.title, vis: m.visibility })) },
  ].filter((g) => g.items.length)
  return (
    <>
      <PageHeader title={q ? `Search: ${q}` : 'Search'} />
      <div className="flex max-w-[900px] flex-col gap-3 p-4">
        {q.length < 2 ? <Card><Empty title="Type at least two letters in the search box" /></Card> : null}
        {q.length >= 2 && !groups.length ? <Card><Empty title={`Nothing matches “${q}”`} /></Card> : null}
        {groups.map((g) => (
          <Card key={g.title} flush title={g.title}>
            {g.items.map((i) => (
              <Link key={i.key} href={i.href} className="row grid-cols-[minmax(0,1fr)_84px] text-ink no-underline hover:bg-head">
                <span className="truncate">{i.label}</span>{'vis' in i && i.vis ? <Visibility value={i.vis as 'internal' | 'shared'} /> : <span />}
              </Link>
            ))}
          </Card>
        ))}
      </div>
    </>
  )
}
