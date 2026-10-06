'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export type PaletteItem = { group: string; label: string; hint?: string; href: string }

/** ⌘K / Ctrl+K: jump to any page, project, customer or open request. Built on cmdk. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const groups = [...new Set(items.map((i) => i.group))]
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn h-7 gap-2 px-2 text-xs text-muted max-sm:hidden" aria-label="Open command palette">
        Jump to… <kbd className="rounded-sm border border-line bg-head px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <Command.Dialog open={open} onOpenChange={setOpen} label="Jump to"
        overlayClassName="fixed inset-0 z-40 bg-[rgba(15,42,48,.25)]"
        contentClassName="fixed top-[12vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-md border border-line bg-white shadow-[0_12px_40px_rgba(15,42,48,.25)]">
        <Command.Input autoFocus placeholder="Type a project, customer, request or page…" className="h-11 w-full border-0 border-b border-line px-3.5 text-sm outline-none" />
        <Command.List className="max-h-[360px] overflow-y-auto py-1">
          <Command.Empty className="px-3.5 py-6 text-center text-[13px] text-muted">Nothing found.</Command.Empty>
          {groups.map((g) => (
            <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1">
              {items.filter((i) => i.group === g).map((i) => (
                <Command.Item key={i.href} value={`${i.label} ${i.hint ?? ''}`} onSelect={() => { setOpen(false); router.push(i.href) }}
                  className="flex h-8 cursor-pointer items-center gap-2 px-3.5 text-[13px] data-[selected=true]:bg-head">
                  <span className="truncate">{i.label}</span>{i.hint ? <span className="ml-auto truncate text-xs text-muted">{i.hint}</span> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  )
}
