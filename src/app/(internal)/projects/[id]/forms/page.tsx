import { sendForm } from '@/app/_actions/forms'
import { ActionButton } from '@/components/forms'
import { Card, Chip, Empty } from '@/components/ui'
import { FORMS, describeAnswers, formByKey } from '@/lib/forms'
import { relativeTime, shortDate } from '@/lib/format'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectForms({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  const supabase = await createClient()
  const [{ data: subs }, { data: waiting }] = await Promise.all([
    supabase.from('form_submissions').select('id, form_key, answers, created_at, by:profiles!form_submissions_submitted_by_fkey(full_name)')
      .eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('action_items').select('id, form_key, due_date, assignee:profiles!action_items_assignee_id_fkey(full_name)')
      .eq('project_id', id).eq('status', 'open').not('form_key', 'is', null),
  ])
  return (
    <div className="flex flex-wrap items-start gap-3 p-4">
      <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-3">
        {(subs ?? []).map((s) => {
          const def = formByKey(s.form_key)!
          return (
            <Card key={s.id} title={def.title} extra={<>{s.by?.full_name} · {relativeTime(s.created_at)}</>}>
              <dl className="m-0 grid grid-cols-[220px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px] leading-snug">
                {describeAnswers(def, s.answers as Record<string, string>).map((a) => (
                  <div key={a.label} className="contents"><dt className="text-muted">{a.label}</dt><dd className="m-0 whitespace-pre-wrap">{a.value}</dd></div>
                ))}
              </dl>
            </Card>
          )
        })}
        {!subs?.length ? <Card title="Submissions"><Empty title="No forms submitted yet">Send the kickoff form to start the playbook.</Empty></Card> : null}
      </div>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
        <Card flush title="Waiting on the customer">
          {waiting?.length ? waiting.map((w) => (
            <div key={w.id} className="row grid-cols-[minmax(0,1fr)_60px]">
              <span className="truncate"><b className="font-medium">{formByKey(w.form_key!)?.title}</b> · {w.assignee?.full_name}</span>
              <span className="font-mono text-xs text-muted">{shortDate(w.due_date)}</span>
            </div>
          )) : <Empty title="Nothing waiting" />}
        </Card>
        <Card flush title="Send a form" extra="Goes to the customer lead">
          {Object.values(FORMS).map((f) => (
            <div key={f.key} className="row grid-cols-[minmax(0,1fr)_auto] py-1.5">
              <span className="flex min-w-0 flex-col"><span className="font-medium">{f.title}</span><span className="truncate text-xs text-muted">{f.intro}</span></span>
              <ActionButton run={sendForm.bind(null, id, f.key)}>Send</ActionButton>
            </div>
          ))}
          <p className="m-0 border-t border-line-soft px-3 py-2 text-xs text-muted">
            <Chip tone="review">Playbook</Chip> Kickoff sends Data access automatically; UAT feedback and closure are sent by the UAT and close rules.
          </p>
        </Card>
      </div>
    </div>
  )
}
