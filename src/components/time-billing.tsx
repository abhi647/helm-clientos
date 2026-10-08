import Link from 'next/link'
import { createStatementFromTasks, setLinePeople } from '@/app/_actions/billing'
import { ActionForm } from '@/components/forms'
import { Card, Chip } from '@/components/ui'
import { money, shortDate } from '@/lib/format'

type Line = { id: string; label: string; kind: string; position: number }
type Person = { id: string; full_name: string }

/**
 * Which people each day-rate line bills. Their approved, billable days fill the line on every statement. Internal only:
 * the customer sees the line and its quantity, never this mapping.
 */
export function LinePeople({ lines, people, covered }: { lines: Line[]; people: Person[]; covered: Map<string, string[]> }) {
  const dayRates = lines.filter((l) => l.kind === 'day_rate').sort((a, b) => a.position - b.position)
  if (!dayRates.length) return null
  const name = new Map(people.map((p) => [p.id, p.full_name]))
  return (
    <div className="flex flex-col gap-1.5 border-t border-line-soft p-3">
      <p className="label m-0">Day rates from timesheets</p>
      {dayRates.map((l) => {
        const on = covered.get(l.id) ?? []
        return (
          <details key={l.id} className="rounded-md border border-line-soft">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-2.5 py-2 text-[13px] hover:bg-head">
              <span className="font-semibold">{l.label}</span>
              <span className="flex-1 truncate text-xs text-muted">
                {on.length ? on.map((id) => name.get(id) ?? 'Someone').join(', ') : 'Nobody named: filled with resources × working days'}
              </span>
              <span className="text-xs font-medium text-link">Choose people</span>
            </summary>
            <div className="border-t border-line-soft p-2.5">
              <ActionForm action={setLinePeople} submit="Save people" resetOnSuccess={false} primary={false}>
                <input type="hidden" name="people_line" value={l.id} />
                <fieldset className="m-0 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1 border-0 p-0">
                  <legend className="sr-only">People billed on {l.label}</legend>
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-[13px]">
                      <input type="checkbox" name="person" value={p.id} defaultChecked={on.includes(p.id)} /> {p.full_name}
                    </label>
                  ))}
                </fieldset>
              </ActionForm>
            </div>
          </details>
        )
      })}
      <p className="m-0 text-xs text-muted">
        Their approved billable days fill this line on each statement, and are marked billed once the statement is approved, so
        they are never billed twice. The customer sees the line and its days, not this list.
      </p>
    </div>
  )
}

export type Unbilled = {
  project_id: string; project_name: string; customer_name: string; user_id: string; full_name: string
  days: number; oldest: string; rate: number | null; currency: string | null; line_label: string | null
}

/** Approved billable days that no approved statement has billed yet, valued at the agreed rate. */
export function UnbilledTime({ rows, showProject = false }: { rows: Unbilled[]; showProject?: boolean }) {
  if (!rows.length) return null
  const totals = new Map<string, number>()
  for (const r of rows) if (r.rate != null && r.currency) totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.days) * Number(r.rate))
  const cols = showProject ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_70px_80px_minmax(0,1fr)_120px]' : 'grid-cols-[minmax(0,1fr)_70px_80px_minmax(0,1fr)_120px]'
  return (
    <Card flush title="Unbilled work" extra={[...totals].map(([c, v]) => money(v, c)).join(' + ') || 'Approved days not on a statement yet'}>
      <div className="overflow-x-auto">
        <div className={showProject ? 'min-w-[760px]' : 'min-w-[600px]'}>
          <div className={`row row-head ${cols}`}>
            {showProject ? <span>Project</span> : null}<span>Person</span><span className="text-right">Days</span><span>Since</span><span>Line</span><span className="text-right">At agreed rate</span>
          </div>
          {rows.map((r) => (
            <div key={`${r.project_id}-${r.user_id}`} className={`row ${cols}`}>
              {showProject ? <Link href={`/projects/${r.project_id}/billing`} className="truncate">{r.customer_name} · {r.project_name}</Link> : null}
              <span className="truncate">{r.full_name}</span>
              <span className="text-right font-mono text-xs">{+Number(r.days).toFixed(2)}</span>
              <span className="font-mono text-xs">{shortDate(r.oldest)}</span>
              <span className="truncate text-xs">{r.line_label ?? <Chip tone="warn">Not on a day-rate line</Chip>}</span>
              <span className="text-right font-mono text-xs">{r.rate != null && r.currency ? money(Number(r.days) * Number(r.rate), r.currency, { exact: true }) : '–'}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 border-t border-line-soft px-3 py-2 text-xs text-muted">
        Approved, billable days that no approved statement has billed yet. Someone not on a day-rate line cannot be billed
        until finance names them on one (Billing → Day rates from timesheets).
      </p>
    </Card>
  )
}

export type ReadyRow = {
  id: string; title: string; completedAt: string | null; lineLabel: string | null; kind: string | null; onLiveCard: boolean
  quantity: number; unit: string | null; rate: number | null; unbilledDays: number; waitingDays: number
  done: boolean; heldBy: string | null
}

/**
 * Finished tasks that no approved statement has billed yet, and what billing them needs. A delivery or unit task is
 * billed by the next statement; a day-rate task is billed through its approved days; a task billed as nothing is not billed.
 */
export function ReadyToBill({ tasks, currency, projectId, canCreate }: { tasks: ReadyRow[]; currency: string | null; projectId: string; canCreate: boolean }) {
  const shown = tasks.filter((t) => t.kind !== 'retainer')
  if (!shown.length) return null
  // what a statement made from this task would bill now
  const billable = (t: ReadyRow) => !t.heldBy && t.onLiveCard && (((t.kind === 'delivery' || t.kind === 'unit') && t.done) || (t.kind === 'day_rate' && t.unbilledDays > 0))
  const value = (t: ReadyRow) => (t.rate ?? 0) * (t.kind === 'day_rate' ? t.unbilledDays : t.quantity)
  const ready = shown.filter(billable)
  const total = currency ? ready.reduce((a, t) => a + value(t), 0) : 0
  const what = (t: ReadyRow) => {
    if (t.heldBy) return <span className="text-xs text-muted">On a statement {t.heldBy === 'pending' ? 'waiting for the customer' : 'being prepared'}</span>
    if (!t.kind) return <Chip tone="warn">Not billed as anything</Chip>
    if (t.kind === 'day_rate') {
      return t.unbilledDays
        ? <span className="text-xs">{t.lineLabel} · {+t.unbilledDays.toFixed(2)} approved days (in Unbilled work)</span>
        : t.waitingDays
          ? <span className="text-xs text-warn-ink">{t.lineLabel} · {+t.waitingDays.toFixed(2)} days waiting for approval in Timesheets</span>
          : <span className="text-xs text-warn-ink">{t.lineLabel} · no days logged: day-rate work is billed from logged, approved days</span>
    }
    if (!t.onLiveCard) return <span className="text-xs text-warn-ink">{t.lineLabel} is not on the approved rate card</span>
    if (!t.done) return <span className="text-xs text-warn-ink">{t.lineLabel} · counts once the task is Done</span>
    return <span className="text-xs">{t.lineLabel} · {+t.quantity.toFixed(2)} {t.kind === 'unit' ? t.unit : t.quantity === 1 ? 'delivery' : 'deliveries'}</span>
  }
  return (
    <Card flush title="Work to bill" extra={ready.length && currency ? `${money(total, currency)} ready to bill` : undefined}>
      <ActionForm action={createStatementFromTasks} submit="Create statement from the ticked tasks" resetOnSuccess={false} className="gap-0 [&>div:last-child]:p-3">
        <input type="hidden" name="project_id" value={projectId} />
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="row row-head grid-cols-[28px_minmax(0,1fr)_90px_minmax(0,1.2fr)_120px]"><span /><span>Task</span><span>Done</span><span>Billed as</span><span className="text-right">At agreed rate</span></div>
            {shown.map((t) => (
              <label key={t.id} className="row grid-cols-[28px_minmax(0,1fr)_90px_minmax(0,1.2fr)_120px]">
                <span>{canCreate && billable(t) ? <input type="checkbox" name="task" value={t.id} aria-label={`Bill ${t.title}`} /> : null}</span>
                <span className="truncate">{t.title}</span>
                <span className="font-mono text-xs">{t.done ? shortDate(t.completedAt) : <span className="text-muted">Not yet</span>}</span>
                <span className="min-w-0 truncate">{what(t)}</span>
                <span className="text-right font-mono text-xs">{billable(t) && t.rate != null && currency ? money(value(t), currency, { exact: true }) : '–'}</span>
              </label>
            ))}
          </div>
        </div>
        <p className="m-0 border-t border-line-soft px-3 py-2 text-xs text-muted">
          Tick the work to bill and create a statement: it bills exactly that work (approved days on the task and its
          subtasks; deliveries and units once Done). Send it to the customer to approve, then invoice approved statements
          under Statements. Days waiting for approval are billed once approved; a task billed as nothing needs its line
          set in the plan (task panel → Billed as), or on its phase.
        </p>
      </ActionForm>
    </Card>
  )
}
