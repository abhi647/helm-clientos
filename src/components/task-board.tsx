'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useState, useTransition } from 'react'
import { StatusSelect } from '@/components/forms'
import { Avatar, TASK_STRIPE, cn } from '@/components/ui'
import type { ActionResult } from '@/app/_actions/shared'
import type { Enums } from '@/lib/database.types'
import { TASK_STATUS } from '@/lib/format'

type Status = Enums<'task_status'>
export type BoardCard = {
  id: string; title: string; href: string; status: Status; overdue: boolean; selected?: boolean
  parent?: string | null; context?: string | null; owner?: { name: string; customer: boolean } | null
  due?: string | null; effort?: string | null
}

const ORDER = Object.keys(TASK_STATUS) as Status[]
const OPTIONS = ORDER.map((v) => ({ value: v, label: TASK_STATUS[v] }))

/**
 * Kanban board: one column per task status. Drag a card to another column to change its status (or use the card's
 * status menu, which also works on phones and with a keyboard). Columns with no cards stay visible as drop targets,
 * except Done when `hideEmptyDone` is set (My Work lists open tasks only).
 */
export function TaskBoard({ cards, setStatus, hideEmptyDone }: {
  cards: BoardCard[]; setStatus: (id: string, status: Status) => Promise<ActionResult>; hideEmptyDone?: boolean
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [shown, move] = useOptimistic(cards, (all, { id, status }: { id: string; status: Status }) => all.map((c) => (c.id === id ? { ...c, status } : c)))
  const [over, setOver] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  const drop = (id: string, status: Status) => {
    const card = shown.find((c) => c.id === id)
    if (!card || card.status === status) return
    setError(null)
    start(async () => {
      move({ id, status })
      const res = await setStatus(id, status)
      if (!res.ok) setError(res.error)
      router.refresh()
    })
  }
  const columns = ORDER.filter((s) => !(hideEmptyDone && s === 'done' && !shown.some((c) => c.status === 'done')))

  return (
    <div className="flex flex-col gap-2">
      {error ? <p role="alert" className="m-0 rounded-md bg-crit-bg px-3 py-2 text-xs text-crit-ink">{error}</p> : null}
      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {columns.map((status) => {
          const list = shown.filter((c) => c.status === status)
          return (
            <section key={status} aria-label={TASK_STATUS[status]}
              onDragOver={(e) => { e.preventDefault(); setOver(status) }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => { e.preventDefault(); setOver(null); drop(e.dataTransfer.getData('text/plain'), status) }}
              className={cn('flex w-[260px] flex-none flex-col rounded-md border border-line bg-head', over === status && 'border-brand bg-selected')}>
              <header className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold">
                <span aria-hidden className={cn('h-3 border-l-[3px]', TASK_STRIPE[status])} />
                {TASK_STATUS[status]}<span className="font-mono font-normal text-muted">{list.length}</span>
              </header>
              <div className="flex min-h-16 flex-col gap-1.5 px-1.5 pb-1.5">
                {list.map((c) => (
                  <article key={c.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' }}
                    className={cn('flex cursor-grab flex-col gap-1.5 rounded-md border border-line border-l-[3px] bg-white p-2 text-[13px] active:cursor-grabbing',
                      TASK_STRIPE[c.overdue ? 'overdue' : c.status], c.selected && 'ring-2 ring-brand')}>
                    {c.parent ? <span className="truncate text-[11px] text-muted">{c.parent} ›</span> : null}
                    <Link href={c.href} className={cn('font-medium no-underline hover:underline', c.status === 'done' ? 'text-muted' : 'text-ink')}>{c.title}</Link>
                    {c.context ? <span className="truncate text-[11px] text-muted">{c.context}</span> : null}
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      {c.owner ? <><Avatar name={c.owner.name} customer={c.owner.customer} size={18} /><span className="truncate">{c.owner.name}</span></> : <span>Unassigned</span>}
                      <span className="ml-auto flex-none font-mono">{c.effort ? `${c.effort} · ` : ''}<span className={cn(c.overdue && 'font-semibold text-crit-ink')}>{c.due ?? ''}</span></span>
                    </span>
                    <StatusSelect key={`${c.id}-${c.status}`} label={`Status of ${c.title}`} value={c.status} options={OPTIONS} onChange={(v) => setStatus(c.id, v)} />
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
