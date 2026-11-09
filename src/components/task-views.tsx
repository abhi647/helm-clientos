import Link from 'next/link'
import { DataGrid } from '@/components/data-grid'
import { AutoSaveSelect, StatusSelect } from '@/components/forms'
import { Avatar, TASK_STRIPE, TaskStatusChip, cn } from '@/components/ui'
import type { ActionResult } from '@/app/_actions/shared'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS } from '@/lib/format'

type Status = Enums<'task_status'>
export type TaskView = 'list' | 'board' | 'table' | 'timeline' | 'calendar'
export const VIEWS: { value: TaskView; label: string }[] = [{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }, { value: 'calendar', label: 'Calendar' }]
export const PLAN_VIEWS: { value: TaskView; label: string }[] = [...VIEWS, { value: 'timeline', label: 'Timeline' }]
export const asView = (v: string | undefined, allowed = VIEWS): TaskView => allowed.find((x) => x.value === v)?.value ?? 'list'
export const asStatus = (v: string | undefined): Status | undefined => (v && v in TASK_STATUS ? (v as Status) : undefined)
const STATUS_OPTIONS = (Object.keys(TASK_STATUS) as Status[]).map((v) => ({ value: v, label: TASK_STATUS[v] }))

/** List / Board / Table, as links: the view lives in the address, so a refresh or a shared link keeps it. */
export function ViewSwitch({ current, href, views = VIEWS }: { current: TaskView; href: (v: TaskView) => string; views?: typeof VIEWS }) {
  return (
    <nav aria-label="View" className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 text-[13px] ring-1 ring-border ring-inset">
      {views.map((v) => (
        <Link key={v.value} href={href(v.value)} scroll={false} aria-current={current === v.value ? 'page' : undefined}
          className={cn('flex h-full items-center rounded-md px-3 no-underline transition-colors', current === v.value ? 'bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/.08)]' : 'text-muted-foreground hover:text-foreground')}>{v.label}</Link>
      ))}
    </nav>
  )
}

export type FilterField = { name: string; label: string; value: string; options: { value: string; label: string }[] }

/**
 * Filter selects that apply as soon as one changes (a plain GET form, so the filters are in the address too).
 * `keep` carries the other parameters (view, search…) along.
 */
export function TaskFilters({ fields, keep }: { fields: FilterField[]; keep: Record<string, string | undefined> }) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      {Object.entries(keep).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <AutoSaveSelect key={f.name} name={f.name} defaultValue={f.value} aria-label={f.label}
          className={cn(f.value && 'border-primary/30 bg-primary/10 font-semibold text-primary')}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </AutoSaveSelect>
      ))}
    </form>
  )
}

export const statusFilterOptions = [{ value: '', label: 'Any status' }, ...STATUS_OPTIONS]

export type TableRow = {
  id: string; title: string; href: string; status: Status; overdue: boolean; selected?: boolean
  parent?: string | null; context?: string | null; owner?: { name: string; customer: boolean } | null
  start?: string | null; due?: string | null; dueIso?: string | null; effort?: string | null; logged?: string | null
}
export type SortKey = 'title' | 'status' | 'owner' | 'due' | 'context'
export const asSort = (v: string | undefined): SortKey => (v === 'title' || v === 'status' || v === 'owner' || v === 'context' ? v : 'due')

/** Sorts table rows on the server. Due dates sort soonest first with undated last; status follows the workflow order. */
export function sortRows<T extends { title: string; status: Status; owner?: { name: string } | null; dueIso?: string | null; context?: string | null }>(rows: T[], key: SortKey): T[] {
  const order = Object.keys(TASK_STATUS)
  const by: Record<SortKey, (a: T, b: T) => number> = {
    title: (a, b) => a.title.localeCompare(b.title),
    status: (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
    owner: (a, b) => (a.owner?.name ?? '￿').localeCompare(b.owner?.name ?? '￿'),
    due: (a, b) => (a.dueIso ?? '9999').localeCompare(b.dueIso ?? '9999'),
    context: (a, b) => (a.context ?? '').localeCompare(b.context ?? ''),
  }
  return [...rows].sort((a, b) => by[key](a, b) || a.title.localeCompare(b.title))
}

/** Every task and subtask in one flat table (overtrue DataGrid): headers sort, search narrows, status changes in place. */
export function TaskTable({ rows, sort, setStatus, contextLabel, showEffort }: {
  rows: TableRow[]; sort: SortKey; sortHref?: (k: SortKey) => string
  setStatus: (id: string, status: Status) => Promise<ActionResult>; contextLabel?: string; showEffort?: boolean
}) {
  const order = Object.keys(TASK_STATUS)
  return (
    <section data-slot="section-card" className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-12px_rgb(0_0_0/0.10)]">
      <DataGrid label="Tasks" search searchLabel="Search tasks" pageSize={50} initialSort={{ key: sort, direction: 1 }}
        empty={<p className="m-0 text-xs text-muted-foreground">No tasks match these filters.</p>}
        columns={[
          { key: 'title', label: 'Task', sortable: true },
          ...(contextLabel ? [{ key: 'context', label: contextLabel, sortable: true, className: 'w-[180px]' }] : []),
          { key: 'status', label: 'Status', sortable: true, className: 'w-[170px]' },
          { key: 'owner', label: 'Owner', sortable: true, className: 'w-[150px]' },
          { key: 'start', label: 'Start', className: 'w-[70px]' },
          { key: 'due', label: 'Due', sortable: true, className: 'w-[70px]' },
          ...(showEffort ? [{ key: 'effort', label: 'Estimate', align: 'right' as const, className: 'w-[72px]' }, { key: 'logged', label: 'Logged', align: 'right' as const, className: 'w-[72px]' }] : []),
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          // each row's left edge carries the colour of its state (see the legend)
          className: cn('border-l-[3px]', TASK_STRIPE[r.overdue ? 'overdue' : r.status], r.selected && 'bg-primary/5'),
          values: { title: r.title, context: r.context, status: order.indexOf(r.status), owner: r.owner?.name ?? '\uffff', due: r.dueIso ?? '9999' },
          cells: {
            title: <Link href={r.href} scroll={false} className={cn('block max-w-[420px] truncate no-underline hover:underline', r.status === 'done' ? 'text-muted-foreground' : 'font-medium text-foreground')}>
              {r.parent ? <span className="font-normal text-muted-foreground">{r.parent} › </span> : null}{r.title}
            </Link>,
            context: <span className="block max-w-[180px] truncate text-xs text-muted-foreground">{r.context}</span>,
            status: <span className="flex items-center gap-1.5">
              <span className="sr-only"><TaskStatusChip status={r.status} overdue={r.overdue} /></span>
              <StatusSelect key={`${r.id}-${r.status}`} label={`Status of ${r.title}`} value={r.status} options={STATUS_OPTIONS} onChange={setStatus.bind(null, r.id)} />
            </span>,
            owner: <span className="flex min-w-0 items-center gap-1.5">{r.owner ? <><Avatar name={r.owner.name} customer={r.owner.customer} /><span className="truncate">{r.owner.name}</span></> : <span className="text-muted-foreground">Unassigned</span>}</span>,
            start: <span className="font-mono text-xs text-muted-foreground">{r.start ?? ''}</span>,
            due: <span className={cn('font-mono text-xs', r.overdue && 'font-semibold text-crit-ink')}>{r.due ?? ''}</span>,
            effort: <span className="font-mono text-xs">{r.effort ?? '–'}</span>,
            logged: <span className="font-mono text-xs">{r.logged ?? '–'}</span>,
          },
        }))} />
    </section>
  )
}
