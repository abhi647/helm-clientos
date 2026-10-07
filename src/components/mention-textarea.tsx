'use client'

import { Command } from 'cmdk'
import getCaretCoordinates from 'textarea-caret'
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Avatar, cn } from '@/components/ui'

export type Person = { id: string; name: string; customer: boolean }

const TRIGGER = /(^|[\s(])@([^\s@]{0,30})$/

/**
 * Textarea with @mentions. Typing "@" opens a people picker (cmdk) anchored at the caret; picking someone
 * inserts "@Full Name" and records their id in a hidden `mentions` field. The database keeps a mention only
 * if that person can read the comment, so this list is a convenience, not a permission.
 */
export const MentionTextarea = forwardRef<{ clear: (sent?: string) => void }, {
  id: string; name: string; people: Person[]; placeholder?: string; className?: string; rows?: number; required?: boolean
}>(function MentionTextarea({ id, name, people, placeholder, className, rows = 2, required }, ref) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Person[]>([])
  const [query, setQuery] = useState<string | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [active, setActive] = useState('')

  // after a post, empty the box only if it still holds what was sent: anything typed since is kept
  useImperativeHandle(ref, () => ({
    clear: (sent?: string) => {
      if (sent !== undefined && (area.current?.value ?? '') !== sent) return
      setText(''); setPicked([]); setQuery(null)
    },
  }), [])

  const matches = useMemo(() => {
    if (query == null) return []
    const q = query.toLowerCase()
    return people.filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q)).slice(0, 6)
  }, [people, query])
  const open = query != null && matches.length > 0

  // ids still present in the text when the form is submitted
  const mentionIds = picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id)

  function sync(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart)
    const m = before.match(TRIGGER)
    if (!m) return setQuery(null)
    const c = getCaretCoordinates(el, el.selectionStart)
    setPos({ top: c.top + c.height - el.scrollTop + 4, left: Math.min(c.left, Math.max(0, el.clientWidth - 240)) })
    setQuery(m[2] ?? '')
  }

  function insert(p: Person) {
    const el = area.current
    if (!el) return
    const caret = el.selectionStart
    const before = el.value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `)
    const next = before + el.value.slice(caret)
    // render the new text now and put the caret after the name in the same step: if the caret moved a frame later,
    // anything typed in between would land before the name
    flushSync(() => {
      setText(next)
      setPicked((list) => (list.some((x) => x.id === p.id) ? list : [...list, p]))
      setQuery(null)
    })
    el.focus()
    el.setSelectionRange(before.length, before.length)
  }

  return (
    <Command shouldFilter={false} loop value={active} onValueChange={setActive} label="Mention someone" className="relative">
      <input type="hidden" name="mentions" value={mentionIds.join(',')} />
      <textarea ref={area} id={id} name={name} rows={rows} required={required} placeholder={placeholder} value={text}
        aria-autocomplete="list"
        className={cn('textarea w-full', className)}
        onChange={(e) => { setText(e.target.value); sync(e.target) }}
        onClick={(e) => sync(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(e) => {
          if (!open) { e.stopPropagation(); return }                 // let cmdk see keys only while the picker is open
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null) }
          if (e.key === 'Tab') { e.preventDefault(); const p = matches.find((x) => x.id === active) ?? matches[0]; if (p) insert(p) }
        }} />
      {open ? (
        <Command.List style={{ top: pos.top, left: pos.left }}
          className="absolute z-30 w-[240px] overflow-hidden rounded-md border border-line bg-white py-1 shadow-[0_4px_16px_rgba(15,42,48,.12)]">
          {matches.map((p) => (
            <Command.Item key={p.id} value={p.id} onSelect={() => insert(p)}
              onMouseDown={(e) => e.preventDefault()}
              className="flex h-8 cursor-pointer items-center gap-2 px-2.5 text-[13px] data-[selected=true]:bg-head">
              <Avatar name={p.name} customer={p.customer} />
              <span className="truncate">{p.name}</span>
              {p.customer ? <span className="ml-auto text-[11px] text-muted">customer</span> : null}
            </Command.Item>
          ))}
        </Command.List>
      ) : null}
    </Command>
  )
})

/** Renders a comment body with known @mentions highlighted. */
export function MentionText({ body, names }: { body: string; names: string[] }) {
  if (!names.length) return <>{body}</>
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'))
  return <>{parts.map((s, i) => (i % 2 ? <b key={i} className="font-semibold text-link">{s}</b> : s))}</>
}
