'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Folder, House, Inbox, MessageSquareHeart, Receipt, Settings, SquareCheck } from 'lucide-react'
import { cn } from '@/components/ui'
import { BrandMark } from '@/components/brand'

const RAIL = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/customers', label: 'Customers', icon: Building2 },
  { href: '/projects', label: 'Projects', icon: Folder },
  { href: '/requests', label: 'Requests', icon: Inbox },
  { href: '/my-work', label: 'My Work', icon: SquareCheck },
  { href: '/feedback', label: 'CSAT & feedback', icon: MessageSquareHeart },
  { href: '/finance', label: 'Finance', icon: Receipt },
  { href: '/admin', label: 'Admin', icon: Settings },
  // Phase 2 (resources, time, reports) slot in here
]

/** Icon rail for Seven Billion staff. Labels show as tooltips and to screen readers. */
export function Rail({ hide = [] }: { hide?: string[] }) {
  const path = usePathname()
  return (
    <nav aria-label="Main" className="flex w-12 flex-none flex-col items-center gap-1 bg-rail py-2.5 max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:px-2">
      <Link href="/home" aria-label="Helm home" title="Helm" className="mb-2 flex size-9 items-center justify-center text-[#D6DBDF] no-underline hover:text-white max-sm:mb-0"><BrandMark size={26} /></Link>
      {RAIL.filter((r) => !hide.includes(r.href)).map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`)
        return (
          <Link key={href} href={href} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
            className={cn('flex size-9 flex-none items-center justify-center rounded-md text-[#9fb3b8] hover:bg-rail-hover hover:text-white', active && 'bg-rail-hover text-white')}>
            <Icon className="size-[18px]" aria-hidden />
          </Link>
        )
      })}
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
            className={cn('border-b-2 border-transparent px-2.5 py-2 text-[13px] whitespace-nowrap text-muted no-underline hover:text-ink',
              active && 'border-ink font-semibold text-ink')}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

export { Inbox as InboxIcon }
