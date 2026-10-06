import Link from 'next/link'
import { Avatar, Chip, Empty, Visibility } from '@/components/ui'
import { shortDate } from '@/lib/format'

type ActionLine = {
  id: string; text: string; due_date: string | null; owner_side: 'seven_billion' | 'customer'; task_id: string | null
  assignee: { full_name: string } | null; task?: { status: string } | null
}

/** Action lines from a meeting. Staff see a "Create task" control; everyone sees whether it is in the plan. */
export function ActionLines({ actions, taskHref, control }: {
  actions: ActionLine[]; taskHref: (taskId: string) => string; control?: (a: ActionLine) => React.ReactNode
}) {
  if (!actions.length) return <Empty title="No action lines yet" />
  return (
    <>
      <div className="row row-head grid-cols-[minmax(0,1fr)_150px_70px_150px]"><span>Action</span><span>Owner</span><span>Due</span><span /></div>
      {actions.map((a) => (
        <div key={a.id} className="row grid-cols-[minmax(0,1fr)_150px_70px_150px]">
          <span className="truncate">{a.text}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            {a.assignee ? <><Avatar name={a.assignee.full_name} customer={a.owner_side === 'customer'} /><span className="truncate">{a.assignee.full_name}</span></> : <span className="text-muted">Unassigned</span>}
          </span>
          <span className="font-mono text-xs">{shortDate(a.due_date)}</span>
          <span className="text-right">
            {a.task_id
              ? <Link href={taskHref(a.task_id)} className="text-xs font-medium">{a.task?.status === 'done' ? <Chip tone="good">Done</Chip> : 'In the plan →'}</Link>
              : control ? control(a) : <span className="text-xs text-muted">Not scheduled yet</span>}
          </span>
        </div>
      ))}
    </>
  )
}

export function DecisionRows({ decisions, staff }: {
  decisions: { id: string; number: string; decision: string; decided_on: string; decided_by: string; visibility: 'internal' | 'shared' }[]; staff: boolean
}) {
  if (!decisions.length) return <Empty title="No decisions recorded" />
  return (
    <>
      {decisions.map((d) => (
        <div key={d.id} className={staff ? 'row grid-cols-[72px_minmax(0,1fr)_70px_84px] py-1.5' : 'row grid-cols-[72px_minmax(0,1fr)_70px] py-1.5'}>
          <span className="font-mono text-xs text-muted">{d.number}</span>
          <span className="leading-snug">{d.decision}{d.decided_by ? <span className="block text-xs text-muted">{d.decided_by}</span> : null}</span>
          <span className="font-mono text-xs text-muted">{shortDate(d.decided_on)}</span>
          {staff ? <span><Visibility value={d.visibility} /></span> : null}
        </div>
      ))}
    </>
  )
}
