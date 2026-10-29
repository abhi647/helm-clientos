import Link from 'next/link'
import { AutoSaveSelect, StatusSelect } from '@/components/forms'
import { Avatar, TASK_STRIPE, TaskStatusChip, cn } from '@/components/ui'
import type { ActionResult } from '@/app/_actions/shared'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS } from '@/lib/format'

type Status = Enums<'task_status'>
export type TaskView = 'list' | 'board' | 'table'
export const VIEWS: { value: TaskView; label: string }[] = [{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }]
export const asView = (v: string | undefined): TaskView => (v === 'board' || v === 'table' ? v : 'list')
export const asStatus = (v: string | undefined): Status | undefined => (v && v in TASK_STATUS ? (v as Status) : undefined)
const STATUS_OPTIONS = (Object.keys(TASK_STATUS) as Status[]).map((v) => ({ value: v, label: TASK_STATUS[v] }))

/** List / Board / Table, as links: the view lives in the address, so a refresh or a shared link keeps it. */
export function ViewSwitch({ current, href }: { current: TaskView; href: (v: TaskView) => string }) {
  return (
    <nav aria-label="View" className="inline-flex h-[30px] overflow-hidden rounded-md border border-[#d5dcdf] bg-white text-[13px]">
      {VIEWS.map((v) => (
        <Link key={v.value} href={href(v.value)} aria-current={current === v.value ? 'page' : undefined}
          className={cn('flex items-center px-3 no-underline', current === v.value ? 'bg-selected font-semibold text-ink' : 'text-muted hover:bg-head')}>{v.label}</Link>
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
          className={cn('input h-[30px] w-auto py-0 text-[13px]', f.value && 'border-brand bg-selected font-semibold')}>
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
  start?: string | null; due?: string | null; effort?: string | null; logged?: string | null
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

/** Every task and subtask in one flat table. Column headers sort; status changes in place. */
export function TaskTable({ rows, sort, sortHref, setStatus, contextLabel, showEffort }: {
  rows: TableRow[]; sort: SortKey; sortHref: (k: SortKey) => string
  setStatus: (id: string, status: Status) => Promise<ActionResult>; contextLabel?: string; showEffort?: boolean
}) {
  // whole class names, so Tailwind finds them
  const cols = contextLabel
    ? (showEffort ? 'grid-cols-[minmax(220px,1fr)_minmax(140px,200px)_160px_150px_64px_64px_64px_64px]' : 'grid-cols-[minmax(220px,1fr)_minmax(140px,200px)_160px_150px_64px_64px]')
    : (showEffort ? 'grid-cols-[minmax(220px,1fr)_160px_150px_64px_64px_64px_64px]' : 'grid-cols-[minmax(220px,1fr)_160px_150px_64px_64px]')
  const head = (k: SortKey | null, label: string, right?: boolean) => k
    ? <Link href={sortHref(k)} aria-sort={sort === k ? 'ascending' : undefined} className={cn('text-inherit no-underline hover:underline', right && 'text-right', sort === k && 'text-ink')}>{label}{sort === k ? ' ↓' : ''}</Link>
    : <span className={cn(right && 'text-right')}>{label}</span>
  return (
    <div className="card min-w-0 overflow-x-auto">
      <div className={cn(contextLabel ? 'min-w-[900px]' : 'min-w-[720px]')}>
        <div className={cn('row row-head', cols)}>
          {head('title', 'Task')}{contextLabel ? head('context', contextLabel) : null}{head('status', 'Status')}{head('owner', 'Owner')}
          {head(null, 'Start')}{head('due', 'Due')}{showEffort ? <>{head(null, 'Estimate', true)}{head(null, 'Logged', true)}</> : null}
        </div>
        {rows.length ? rows.map((r) => (
          <div key={r.id} className={cn('row border-l-[3px]', cols, TASK_STRIPE[r.overdue ? 'overdue' : r.status], r.selected ? 'bg-selected' : 'hover:bg-head')}>
            <Link href={r.href} className={cn('truncate no-underline hover:underline', r.status === 'done' ? 'text-muted' : 'font-medium text-ink')}>
              {r.parent ? <span className="font-normal text-muted">{r.parent} › </span> : null}{r.title}
            </Link>
            {contextLabel ? <span className="truncate text-xs text-muted">{r.context}</span> : null}
            <span className="flex items-center gap-1.5">
              <span className="sr-only"><TaskStatusChip status={r.status} overdue={r.overdue} /></span>
              <StatusSelect key={`${r.id}-${r.status}`} label={`Status of ${r.title}`} value={r.status} options={STATUS_OPTIONS} onChange={setStatus.bind(null, r.id)} />
            </span>
            <span className="flex min-w-0 items-center gap-1.5">{r.owner ? <><Avatar name={r.owner.name} customer={r.owner.customer} /><span className="truncate">{r.owner.name}</span></> : <span className="text-muted">Unassigned</span>}</span>
            <span className="font-mono text-xs text-muted">{r.start ?? ''}</span>
            <span className={cn('font-mono text-xs', r.overdue && 'font-semibold text-crit-ink')}>{r.due ?? ''}</span>
            {showEffort ? <><span className="text-right font-mono text-xs">{r.effort ?? '–'}</span><span className="text-right font-mono text-xs">{r.logged ?? '–'}</span></> : null}
          </div>
        )) : <p className="m-0 p-3 text-xs text-muted">No tasks match these filters.</p>}
      </div>
    </div>
  )
}
