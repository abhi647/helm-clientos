import type { Metadata } from 'next'
import Link from 'next/link'
import { sendFeedback } from '@/app/_actions/feedback'
import { ActionForm } from '@/components/forms'
import { FEEDBACK_KINDS, FeedbackKindChip, FeedbackStatusChip } from '@/components/feedback-parts'
import { Card, Empty } from '@/components/ui'
import { relativeTime } from '@/lib/format'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Feedback' }

export default async function PortalFeedback() {
  await requireCustomer()
  const supabase = await createClient()
  const [{ data: items }, { data: projects }] = await Promise.all([
    supabase.from('feedback').select('id, number, kind, body, status, created_at, from:profiles!feedback_submitted_by_fkey(full_name)').order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
  ])
  return (
    <div className="flex flex-wrap items-start gap-3.5">
      <Card flush className="min-w-0 flex-[999_1_600px] overflow-x-auto" title="Feedback from your team" extra="Every message is read by your account owner">
        <div className="min-w-[560px]">
          {items?.length ? items.map((f) => (
            <Link key={f.id} href={`/portal/feedback/${f.id}`} className="row min-h-10 grid-cols-[64px_96px_minmax(0,1fr)_110px_70px] text-ink no-underline hover:bg-head">
              <span className="font-mono text-xs text-muted">{f.number}</span>
              <span><FeedbackKindChip kind={f.kind} /></span>
              <span className="truncate">{f.body}<span className="ml-1.5 text-xs text-muted">{f.from?.full_name}</span></span>
              <span><FeedbackStatusChip status={f.status} /></span>
              <span className="text-xs text-muted">{relativeTime(f.created_at)}</span>
            </Link>
          )) : <Empty title="No feedback yet">Tell us what is working and what is not. We read every message.</Empty>}
        </div>
      </Card>
      <Card className="min-w-0 flex-[1_1_340px]" title="Send feedback">
        <ActionForm action={sendFeedback} submit="Send feedback" resetOnSuccess={false}>
          <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
            <legend className="label mb-1.5">What kind?</legend>
            {FEEDBACK_KINDS.map((k, i) => (
              <label key={k.value} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#d5dcdf] px-2.5 text-[13px] has-[:checked]:border-ink has-[:checked]:bg-head has-[:checked]:font-semibold">
                <input type="radio" name="kind" value={k.value} defaultChecked={i === 1} className="accent-[#0F2A30]" />{k.label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1"><span className="label">About</span>
            <select name="project_id" className="input h-9"><option value="">Seven Billion in general</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1"><span className="label">Your feedback</span>
            <textarea name="body" required rows={5} className="textarea text-sm" placeholder="What is working, what is not, what you would change" />
          </label>
        </ActionForm>
      </Card>
    </div>
  )
}
