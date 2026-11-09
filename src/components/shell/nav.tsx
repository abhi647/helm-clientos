'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, CalendarDays, CalendarOff, Clock, Folder, House, Inbox, Menu, MessageSquareHeart, PanelLeftClose, PanelLeftOpen, Receipt, Settings, Sparkles, SquareCheck,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { BrandMark } from '@/components/brand'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const SECTIONS = [
  { title: 'Workspace', items: [
    { href: '/home', label: 'Home', icon: House },
    { href: '/assistant', label: 'Ask Helm', icon: Sparkles },
    { href: '/my-work', label: 'My Work', icon: SquareCheck },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/leave', label: 'Leave', icon: CalendarOff },
    { href: '/requests', label: 'Requests', icon: Inbox },
  ] },
  { title: 'Delivery', items: [
    { href: '/customers', label: 'Customers', icon: Building2 },
    { href: '/projects', label: 'Projects', icon: Folder },
    { href: '/timesheets', label: 'Timesheets', icon: Clock },
    { href: '/feedback', label: 'CSAT & feedback', icon: MessageSquareHeart },
  ] },
  { title: 'Business', items: [
    { href: '/finance', label: 'Finance', icon: Receipt },
    { href: '/admin', label: 'Admin', icon: Settings },
  ] },
  // Phase 2 (resources, time, reports) slot in here
]

const NAV_COOKIE = 'helm_nav'   // read by the internal layout

const visibleSections = (hide: string[]) =>
  SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !hide.includes(i.href)) })).filter((s) => s.items.length)

/** Phones: a menu button in the top bar that slides the full navigation in from the left. */
export function MobileNav({ hide = [] }: { hide?: string[] }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" aria-label="Open menu"
          className="-ml-1.5 flex size-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink hover:bg-muted sm:hidden">
          <Menu className="size-5" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] max-w-[85vw] gap-0 bg-sidebar p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="flex h-14 items-center border-b border-sidebar-border px-4"><Wordmark /></div>
        <NavSections sections={visibleSections(hide)} collapsed={false} path={path} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-7 flex-none items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_2px_6px_rgb(42_91_255/.35),inset_0_1px_0_rgb(255_255_255/.2)]">
        <BrandMark size={20} title="" />
      </span>
      {!collapsed ? (
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Helm</span>
          <span className="text-[11px] text-muted-foreground">by Seven Billion</span>
        </span>
      ) : null}
    </span>
  )
}

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
  const sections = visibleSections(hide)

  return (
    <nav aria-label="Main"
      className={cn('sticky top-0 flex h-screen flex-none flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-[208px]', 'max-sm:hidden')}>
      <Link href="/home" aria-label="Helm home"
        className={cn('flex h-12 flex-none items-center no-underline', collapsed ? 'justify-center' : 'px-3')}>
        <Wordmark collapsed={collapsed} />
      </Link>

      <NavSections sections={sections} collapsed={collapsed} path={path} />

      <button type="button" onClick={toggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}
        className={cn('m-2 flex h-9 flex-none cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
          collapsed ? 'justify-center' : 'px-3')}>
        {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <><PanelLeftClose className="size-4" aria-hidden /> Collapse</>}
      </button>
    </nav>
  )
}


type Section = { title: string; items: { href: string; label: string; icon: typeof House }[] }

function NavSections({ sections, collapsed, path, onNavigate }: { sections: Section[]; collapsed: boolean; path: string; onNavigate?: () => void }) {
  return (
    <div className={cn('flex flex-1 flex-col gap-4 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-2')}>
      {sections.map((s, n) => (
        <div key={s.title} className="flex flex-col gap-0.5">
          {!collapsed
            ? <div className="mb-0.5 px-2.5 text-[11px] font-medium text-muted-foreground">{s.title}</div>
            : n > 0 ? <div className="mx-2 mb-2 border-t border-sidebar-border" aria-hidden /> : null}
          {s.items.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(`${href}/`)
            const link = (
              <Link key={href} href={href} onClick={onNavigate} aria-label={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}
                className={cn('group/nav relative flex h-8 flex-none items-center gap-2.5 rounded-md text-[13px] text-foreground/75 no-underline transition-colors hover:bg-sidebar-accent hover:text-foreground max-sm:h-11',
                  collapsed ? 'justify-center' : 'px-2.5',
                  active && 'bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/.06),0_0_0_1px_rgb(0_0_0/.04)] hover:bg-card')}>
                <Icon className={cn('size-4 flex-none', active ? 'text-primary' : 'text-muted-foreground group-hover/nav:text-foreground')} aria-hidden />
                {!collapsed ? <span className="truncate">{label}</span> : null}
              </Link>
            )
            return collapsed ? (
              <Tooltip key={href}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
            ) : link
          })}
        </div>
      ))}
    </div>
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
            className={cn('relative px-2.5 py-2 text-[13px] whitespace-nowrap text-muted-foreground no-underline transition-colors hover:text-foreground',
              'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent',
              active && 'font-medium text-foreground after:bg-primary')}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export { Inbox as InboxIcon }
