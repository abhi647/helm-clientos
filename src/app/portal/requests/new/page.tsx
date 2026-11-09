import type { Metadata } from 'next'
import Link from 'next/link'
import { createRequest } from '@/app/_actions/requests'
import { ActionForm } from '@/components/forms'
import { REQUEST_KINDS as KINDS, RequestFields, requestKind } from '@/components/request-fields'
import { btn, Card } from '@/components/ui'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'New request' }

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireCustomer()
  const { kind: k } = await searchParams
  const kind = requestKind(k)
  const K = KINDS[kind]
  const supabase = await createClient()
  const { data: projects } = await supabase.from('projects').select('id, name').eq('status', 'active').order('name')
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">{K.tab}</h1>
      <nav aria-label="Request form" className="flex flex-wrap gap-1.5">
        {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((key) => (
          <Link key={key} href={key === 'request' ? '/portal/requests/new' : `/portal/requests/new?kind=${key}`} aria-current={key === kind ? 'page' : undefined}
            className={btn('outline', 'shrink', key === kind && 'border-primary/30 bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary')}>{KINDS[key].tab}</Link>
        ))}
      </nav>
      <p className="m-0 text-[13px] text-muted-foreground">Tell us what you need. You will get a reference number straight away and can follow every step here.</p>
      <Card>
        <ActionForm key={kind} action={createRequest} submit="Submit request" resetOnSuccess={false}>
          <RequestFields kind={kind} projects={projects ?? []} />
          <p className="m-0 text-xs text-muted-foreground">Attachments: add files on the request page after submitting, or in Documents.</p>
        </ActionForm>
      </Card>
    </div>
  )
}
