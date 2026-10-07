'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, Folder, House, Inbox, MessageSquareHeart, PanelLeftClose, PanelLeftOpen, Receipt, Settings, SquareCheck,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { BrandMark } from '@/components/brand'

const SECTIONS = [
  { title: 'Workspace', items: [
    { href: '/home', label: 'Home', icon: House },
    { href: '/my-work', label: 'My Work', icon: SquareCheck },
    { href: '/requests', label: 'Requests', icon: Inbox },
  ] },
  { title: 'Delivery', items: [
    { href: '/customers', label: 'Customers', icon: Building2 },
    { href: '/projects', label: 'Projects', icon: Folder },
    { href: '/feedback', label: 'CSAT & feedback', icon: MessageSquareHeart },
  ] },
  { title: 'Business', items: [
    { href: '/finance', label: 'Finance', icon: Receipt },
    { href: '/admin', label: 'Admin', icon: Settings },
  ] },
  // Phase 2 (resources, time, reports) slot in here
]

const NAV_COOKIE = 'helm_nav'   // read by the internal layout

/**
 * Sidebar for Seven Billion staff. Expanded it shows names; collapsed it shows icons with the name on hover.
 * The choice is kept in a cookie so the server renders the same width (no jump on load).
 */
export function Rail({ hide = [], collapsed: initial = false }: { hide?: string[]; collapsed?: boolean }) {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(initial)
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${NAV_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
  }
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !hide.includes(i.href)) })).filter((s) => s.items.length)

  return (
    <nav aria-label="Main"
      className={cn('sticky top-0 flex h-screen flex-none flex-col bg-rail text-[#c9d4d7] transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-[216px]',
        'max-sm:static max-sm:h-auto max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:overflow-x-auto max-sm:px-2')}>
      <Link href="/home" aria-label="Helm home"
        className={cn('flex h-12 flex-none items-center gap-2.5 border-b border-white/[.06] text-white no-underline hover:text-white max-sm:border-0',
          collapsed ? 'justify-center' : 'px-4')}>
        <BrandMark size={24} className="flex-none text-[#D6DBDF]" />
        {!collapsed ? (
          <span className="flex flex-col leading-tight max-sm:hidden">
            <span className="text-[15px] font-semibold tracking-[.01em]">Helm</span>
            <span className="text-[10.5px] text-[#8fa5aa]">by Seven Billion</span>
          </span>
        ) : null}
      </Link>

      <div className={cn('flex flex-1 flex-col gap-4 overflow-y-auto py-3 max-sm:flex-row max-sm:gap-1 max-sm:py-1', collapsed ? 'px-2' : 'px-2.5')}>
        {sections.map((s, n) => (
          <div key={s.title} className="flex flex-col gap-0.5 max-sm:flex-row">
            {!collapsed
              ? <div className="mb-1 px-2 text-[10.5px] font-semibold tracking-[.08em] text-[#6f878d] uppercase max-sm:hidden">{s.title}</div>
              : n > 0 ? <div className="mx-2 mb-1.5 border-t border-white/[.08] max-sm:hidden" aria-hidden /> : null}
            {s.items.map(({ href, label, icon: Icon }) => {
              const active = path === href || path.startsWith(`${href}/`)
              return (
                <Link key={href} href={href} aria-label={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}
                  className={cn('group/nav relative flex h-9 flex-none items-center gap-2.5 rounded-md text-[13px] text-[#b5c4c8] no-underline transition-colors hover:bg-white/[.06] hover:text-white',
                    collapsed ? 'justify-center max-sm:px-2.5' : 'px-2.5',
                    active && 'bg-white/[.09] font-medium text-white')}>
                  {active ? <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-brand max-sm:hidden" /> : null}
                  <Icon className={cn('size-[17px] flex-none', active ? 'text-brand' : 'text-[#8fa5aa] group-hover/nav:text-white')} aria-hidden />
                  {!collapsed ? <span className="truncate max-sm:hidden">{label}</span> : (
                    <span role="tooltip" className="pointer-events-none absolute left-full z-50 ml-2.5 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100 max-sm:hidden">
                      {label}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      <button type="button" onClick={toggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}
        className={cn('flex h-10 flex-none cursor-pointer items-center gap-2.5 border-0 border-t border-white/[.06] bg-transparent text-xs text-[#8fa5aa] transition-colors hover:text-white max-sm:hidden',
          collapsed ? 'justify-center' : 'px-4')}>
        {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <><PanelLeftClose className="size-4" aria-hidden /> Collapse</>}
      </button>
    </nav>
  )
}

/** Underline tabs (project and portal navigation). */
export function Tabs({ items }: { items: { href: string; label: React.ReactNode; exact?: boolean }[] }) {
  const path = usePathname()
  return (
    <nav aria-label="Section" className="-mb-px flex overflow-x-auto">
      {items.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`)
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={cn('border-b-2 border-transparent px-2.5 py-2 text-[13px] whitespace-nowrap text-muted no-underline transition-colors hover:text-ink',
              active && 'border-brand font-semibold text-ink')}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export { Inbox as InboxIcon }
