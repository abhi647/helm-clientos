'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Building2, CornerDownLeft, FileText, Folder, LayoutGrid, Plus, Search } from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'

export type PaletteItem = { group: string; label: string; hint?: string; href: string }

const ICON: Record<string, typeof Folder> = { Pages: LayoutGrid, Projects: Folder, Customers: Building2, 'Open requests': FileText, Create: Plus }

/** Opens the palette from anywhere (the top-bar search, the "/" key, or a button). */
export const openPalette = () => window.dispatchEvent(new Event('helm:palette'))

/**
 * ⌘K, Ctrl+K or "/": jump to any page, project, customer or open request, create something, or search everything.
 * The trigger looks like a search field so people find it without knowing the shortcut.
 */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
      else if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('helm:palette', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('helm:palette', onOpen) }
  }, [])
  const go = (href: string) => { setOpen(false); setQuery(''); router.push(href) }
  const groups = [...new Set(items.map((i) => i.group))]
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search and jump to (⌘K)"
        className="group flex h-8 w-full max-w-[380px] cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] text-muted-foreground shadow-[0_1px_1px_rgb(0_0_0/.03)] transition-colors hover:border-control max-sm:size-10 max-sm:justify-center max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <Search className="size-4 flex-none" aria-hidden />
        <span className="flex-1 truncate text-left max-sm:hidden">Search or jump to…</span>
        <kbd className="rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] max-sm:hidden">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search and jump to" description="Find a page, project, customer or request" className="top-[14vh] translate-y-0 sm:max-w-[600px]">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search projects, customers, requests, pages…" />
        <CommandList className="max-h-[min(440px,60vh)]">
          <CommandEmpty>
            <span className="text-muted-foreground">Nothing matches.</span>
          </CommandEmpty>
          {query.trim() ? (
            <CommandGroup heading="Everything">
              <CommandItem value={`search ${query}`} onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}>
                <Search aria-hidden />Search tasks, requests and decisions for “{query.trim()}”
                <CommandShortcut><CornerDownLeft className="size-3.5" /></CommandShortcut>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {groups.map((g) => {
            const Icon = ICON[g] ?? LayoutGrid
            return (
              <CommandGroup key={g} heading={g}>
                {items.filter((i) => i.group === g).map((i) => (
                  <CommandItem key={i.href} value={`${i.label} ${i.hint ?? ''} ${g}`} onSelect={() => go(i.href)} className="py-2">
                    <Icon className="text-muted-foreground" aria-hidden />
                    <span className="truncate">{i.label}</span>
                    {i.hint ? <span className="ml-auto truncate text-xs text-muted-foreground">{i.hint}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
        <div className="flex items-center gap-3 border-t border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground max-sm:hidden">
          <span><kbd className="font-mono">↑↓</kbd> move</span><span><kbd className="font-mono">↵</kbd> open</span><span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto">Press <kbd className="font-mono">/</kbd> anywhere</span>
        </div>
      </CommandDialog>
    </>
  )
}
