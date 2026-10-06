import type { Metadata } from 'next'
import Link from 'next/link'
import { createRequest } from '@/app/_actions/requests'
import { ActionForm } from '@/components/forms'
import { Card, cn } from '@/components/ui'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'New request' }

const TYPES: [string, string][] = [['requirement', 'Requirement'], ['enhancement', 'Enhancement'], ['change_request', 'Change request'], ['bug', 'Something is not working'], ['new_report', 'New report'], ['data_request', 'Data request'], ['access_request', 'Access request'], ['support', 'Support'], ['other', 'Other']]

// The three request forms of the MVP share one lifecycle; they differ in the questions asked.
const KINDS = {
  request: { tab: 'New request', type: 'requirement', what: 'What do you need?', why: 'Why is it needed?', title: 'e.g. Add regional sales forecast' },
  change: { tab: 'Change request', type: 'change_request', what: 'What should change, and how does it work today?', why: 'What happens if we do not change it?', title: 'e.g. Show margin after rebates' },
  access: { tab: 'Access request', type: 'access_request', what: 'Who needs access, to what, and with which role?', why: 'Why do they need it?', title: 'e.g. Dashboard access for 3 regional managers' },
} as const

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireCustomer()
  const { kind: k } = await searchParams
  const kind = k === 'change' || k === 'access' ? k : 'request'
  const K = KINDS[kind]
  const supabase = await createClient()
  const { data: projects } = await supabase.from('projects').select('id, name').eq('status', 'active').order('name')
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">{K.tab}</h1>
      <nav aria-label="Request form" className="flex gap-1.5">
        {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((key) => (
          <Link key={key} href={key === 'request' ? '/portal/requests/new' : `/portal/requests/new?kind=${key}`} aria-current={key === kind ? 'page' : undefined}
            className={cn('btn', key === kind && 'border-ink bg-head font-semibold')}>{KINDS[key].tab}</Link>
        ))}
      </nav>
      <p className="m-0 text-[13px] text-muted">Tell us what you need. You will get a reference number straight away and can follow every step here.</p>
      <Card>
        <ActionForm key={kind} action={createRequest} submit="Submit request" resetOnSuccess={false}>
          <label className="flex flex-col gap-1"><span className="label">Title</span><input name="title" required minLength={3} maxLength={200} placeholder={K.title} className="input h-9 text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="label">{K.what}</span><textarea name="what" required rows={4} className="textarea text-sm" /></label>
          <label className="flex flex-col gap-1"><span className="label">{K.why}</span><textarea name="why" rows={3} className="textarea text-sm" placeholder="Helps us prioritise and get it right" /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="label">Type</span><select name="type" key={kind} defaultValue={K.type} className="input h-9">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Project</span><select name="project_id" className="input h-9"><option value="">Not sure / general</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Priority</span><select name="priority" defaultValue="normal" className="input h-9"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical (business stopped)</option></select></label>
            <label className="flex flex-col gap-1"><span className="label">Wanted by</span><input type="date" name="desired_date" className="input h-9" /></label>
          </div>
          <p className="m-0 text-xs text-muted">Attachments: add files on the request page after submitting, or in Documents.</p>
        </ActionForm>
      </Card>
    </div>
  )
}
