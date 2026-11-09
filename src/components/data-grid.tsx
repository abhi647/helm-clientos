'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconArrowsSort as ArrowsSort, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight } from '@tabler/icons-react'
import { SearchField } from '@/components/overtrue/search-field'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type GridColumn = {
  key: string
  label: ReactNode
  /** Sort by this column (needs a `values` entry on each row). */
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  /** Width hint, e.g. "w-24" or "min-w-[220px]". */
  className?: string
}
export type GridRow = {
  id: string
  /** What each cell shows: rendered on the server, so cells can hold links, badges and action buttons. */
  cells: Record<string, ReactNode>
  /** Plain values to sort and search by. */
  values?: Record<string, string | number | null | undefined>
  /** Clicking the row (outside its buttons and links) opens this. */
  href?: string
  className?: string
}

/**
 * overtrue's DataTable at Helm's compact density, for server pages: the cells arrive rendered, the grid adds sorting,
 * search and paging. Leave out `search` and `pageSize` for a plain table inside a card.
 */
export function DataGrid({ columns, rows, search, searchLabel = 'Search', pageSize, empty, toolbar, initialSort, label }: {
  columns: GridColumn[]; rows: GridRow[]; search?: boolean; searchLabel?: string; pageSize?: number; empty?: ReactNode
  toolbar?: ReactNode; initialSort?: { key: string; direction: 1 | -1 }; label?: string
}) {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(initialSort ?? null)
  const [page, setPage] = useState(0)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? rows.filter((r) => Object.values(r.values ?? {}).some((v) => v != null && String(v).toLowerCase().includes(q))) : [...rows]
    if (sort) {
      found.sort((a, b) => {
        const x = a.values?.[sort.key], y = b.values?.[sort.key]
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.direction
      })
    }
    return found
  }, [rows, query, sort])

  const size = pageSize ?? Infinity
  const lastPage = Math.max(0, Math.ceil(shown.length / size) - 1)
  const safePage = Math.min(page, lastPage)
  const visible = Number.isFinite(size) ? shown.slice(safePage * size, (safePage + 1) * size) : shown
  const align = (c: GridColumn) => (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '')

  return (
    <div data-slot="data-grid" className="min-w-0" aria-label={label}>
      {search || toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          {search ? (
            <SearchField ref={searchRef} label={searchLabel} value={query} placeholder={`${searchLabel}…`}
              onValueChange={(v) => { setQuery(v); setPage(0) }} containerClassName="w-full max-w-64" className="h-8 text-[13px]" />
          ) : null}
          {toolbar ? <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn('h-8 bg-muted/30 px-3 text-[11px] font-medium text-muted-foreground', align(c), c.className)}
                  aria-sort={sort?.key === c.key ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sortable ? (
                    <button type="button" onClick={() => { setSort({ key: c.key, direction: sort?.key === c.key && sort.direction === 1 ? -1 : 1 }); setPage(0) }}
                      className={cn('-mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground', c.align === 'right' && 'flex-row-reverse')}>
                      {c.label}
                      {sort?.key === c.key ? (sort.direction === 1 ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)
                        : <ArrowsSort aria-hidden className="size-3 opacity-50" />}
                    </button>
                  ) : c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id} className={cn(r.href && 'cursor-pointer', r.className)}
                onClick={r.href ? (e) => {
                  // buttons, links and fields in the row do their own thing
                  if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,summary,[role=button]')) return
                  router.push(r.href!)
                } : undefined}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn('h-9 px-3 py-1.5', align(c), c.className)}>{r.cells[c.key] ?? null}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!shown.length ? (
        <div role="status" className="px-4 py-6 text-center">
          {query.trim() ? (
            <>
              <p className="m-0 text-[13px] font-medium">No matches.</p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => { setQuery(''); searchRef.current?.focus() }}>Clear search</Button>
            </>
          ) : empty ?? <p className="m-0 text-xs text-muted-foreground">Nothing here yet.</p>}
        </div>
      ) : null}
      {Number.isFinite(size) && shown.length > size ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-1.5">
          <p className="m-0 text-xs text-muted-foreground" aria-live="polite">{safePage * size + 1}–{Math.min((safePage + 1) * size, shown.length)} of {shown.length}</p>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Previous page" disabled={!safePage} onClick={() => setPage(safePage - 1)}><ChevronLeft className="size-3.5" /></Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Next page" disabled={safePage >= lastPage} onClick={() => setPage(safePage + 1)}><ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
